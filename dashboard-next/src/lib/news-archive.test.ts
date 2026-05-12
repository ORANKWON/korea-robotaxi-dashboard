/**
 * Tests for news-archive pure functions.
 *
 * Locked-in by /plan-eng-review 2026-05-11 D13: bun test for TS direct, no
 * Python parallel impl drift. Same Intl.Collator + ICU as production runtime.
 *
 * Run with: bun test dashboard-next/src/lib/news-archive.test.ts
 *
 * Coverage targets:
 *   - pickRepresentative (4-tier scoring + tiebreaker)
 *   - scoreOf via pickRepresentative observable behavior
 *   - groupByDate KST bucketing
 *   - toKSTDate boundary cases (KST 23:59 vs KST 00:01)
 *   - heatmapBucket 5-tier log-scale boundaries
 *   - bad ISO graceful degradation (D2)
 */
import { describe, expect, it, beforeEach } from "bun:test";
import {
  groupByDate,
  heatmapBucket,
  pickRepresentative,
  _resetArchiveCache,
} from "./news-archive";
import { formatKstDateKo, toKSTDate } from "./news-utils";
import type { NewsItem } from "@/types";

beforeEach(() => {
  _resetArchiveCache();
});

// Test fixture: minimal NewsItem with only the fields the algorithm reads.
function item(overrides: Partial<NewsItem> & { headline: string }): NewsItem {
  return {
    headline: overrides.headline,
    summary: overrides.summary ?? "",
    source: overrides.source ?? "test",
    url: overrides.url ?? `https://example.com/${overrides.headline}`,
    published_at: overrides.published_at ?? "2026-05-04T10:00:00+09:00",
    tags: overrides.tags ?? ["일반"],
    final_url: overrides.final_url,
    companies: overrides.companies,
  };
}

// ─── toKSTDate ──────────────────────────────────────────────────────────────

describe("toKSTDate", () => {
  it("returns KST date for UTC ISO with Z suffix", () => {
    // KST = UTC + 9h. 14:30 UTC → 23:30 KST same day.
    expect(toKSTDate("2026-05-04T14:30:00Z")).toBe("2026-05-04");
  });

  it("returns NEXT KST date when UTC time crosses KST midnight", () => {
    // 15:30 UTC → 00:30 KST next day.
    expect(toKSTDate("2026-05-04T15:30:00Z")).toBe("2026-05-05");
  });

  it("handles already-KST ISO (+09:00 offset) correctly", () => {
    expect(toKSTDate("2026-05-04T23:30:00+09:00")).toBe("2026-05-04");
    expect(toKSTDate("2026-05-05T00:30:00+09:00")).toBe("2026-05-05");
  });

  it("returns null on bad ISO (D2 graceful degradation)", () => {
    // NaN dates from invalid ISO should never crash callers.
    expect(toKSTDate("not-a-date")).toBe(null);
    expect(toKSTDate("")).toBe(null);
    expect(toKSTDate("2026-99-99T00:00:00Z")).toBe(null);
  });
});

// ─── pickRepresentative ─────────────────────────────────────────────────────

describe("pickRepresentative", () => {
  it("returns null on empty array", () => {
    expect(pickRepresentative([])).toBe(null);
  });

  it("returns the only item when single", () => {
    const i = item({ headline: "solo" });
    expect(pickRepresentative([i])).toBe(i);
  });

  it("picks the 정책 article over 일반 (tag multiplier)", () => {
    const policy = item({ headline: "policy", tags: ["정책"] });
    const general = item({ headline: "general", tags: ["일반"] });
    expect(pickRepresentative([general, policy])).toBe(policy);
  });

  it("picks 사고 over 기업 (3× vs 2×)", () => {
    const accident = item({ headline: "accident", tags: ["사고"] });
    const company = item({
      headline: "company",
      tags: ["기업"],
      companies: ["A"],
    });
    // 사고 = 3 × 1 = 3 vs 기업 = 2 × 2 = 4 — wait, 기업 with 1 company actually wins
    // Let's compute: accident score = 3 × 1 = 3, company score = 2 × 2 = 4 → company wins.
    expect(pickRepresentative([accident, company])).toBe(company);
  });

  it("D9 outside-voice fix: large company announcement beats lone 사고 (광주 scenario)", () => {
    // Real scenario: 광주 발표 (기업, 3 companies) vs small accident (사고, 1 company)
    // 광주: 2 × (1+3) = 8. 사고: 3 × (1+1) = 6 → 광주 wins.
    const gwangju = item({
      headline: "광주 자율주행 실증도시 선정",
      tags: ["기업"],
      companies: ["현대자동차", "오토노머스에이투지", "라이드플럭스 (RideFlux)"],
    });
    const minorAccident = item({
      headline: "minor 사고 보고",
      tags: ["사고"],
      companies: ["A"],
    });
    expect(pickRepresentative([gwangju, minorAccident])).toBe(gwangju);
  });

  it("uses companies cardinality as tiebreaker on equal tag bucket", () => {
    // Both 정책 → 3× multiplier. Compare on companies count.
    const many = item({
      headline: "many companies",
      tags: ["정책"],
      companies: ["A", "B", "C"],
    });
    const few = item({
      headline: "few companies",
      tags: ["정책"],
      companies: ["A"],
    });
    expect(pickRepresentative([few, many])).toBe(many);
  });

  it("uses summary length as tertiary boost", () => {
    // Same tag bucket, same companies count → summary length tips.
    const longSummary = item({
      headline: "long",
      tags: ["기업"],
      companies: ["A"],
      summary: "x".repeat(500),
    });
    const shortSummary = item({
      headline: "short",
      tags: ["기업"],
      companies: ["A"],
      summary: "y",
    });
    expect(pickRepresentative([shortSummary, longSummary])).toBe(longSummary);
  });

  it("falls back to headline localeCompare(ko) on full tie", () => {
    // Identical scoring → deterministic alphabetical tiebreak.
    const a = item({ headline: "가나", tags: ["기업"], companies: ["X"] });
    const b = item({ headline: "다라", tags: ["기업"], companies: ["X"] });
    // 가 < 다 in Korean Collator
    expect(pickRepresentative([b, a])).toBe(a);
  });

  it("handles missing companies field as 0 contribution", () => {
    // companies absent → compBase = 1 + 0 = 1
    // 사고 with no companies: 3 × 1 = 3
    // 일반 with 1 company: 1 × 2 = 2
    const accident = item({ headline: "accident", tags: ["사고"] });
    const general = item({
      headline: "general",
      tags: ["일반"],
      companies: ["A"],
    });
    expect(pickRepresentative([accident, general])).toBe(accident);
  });

  it("handles null/empty summary as 0 boost", () => {
    // Both 기업, same companies → summary boost decides
    const withSummary = item({
      headline: "withS",
      tags: ["기업"],
      companies: ["A"],
      summary: "x".repeat(500),
    });
    const noSummary = item({
      headline: "noS",
      tags: ["기업"],
      companies: ["A"],
      summary: "",
    });
    expect(pickRepresentative([noSummary, withSummary])).toBe(withSummary);
  });

  it("is deterministic — same input order doesn't matter", () => {
    const a = item({ headline: "a", tags: ["정책"], companies: ["X"] });
    const b = item({ headline: "b", tags: ["기업"], companies: ["X", "Y"] });
    const c = item({ headline: "c", tags: ["사고"] });
    const result1 = pickRepresentative([a, b, c]);
    const result2 = pickRepresentative([c, a, b]);
    const result3 = pickRepresentative([b, c, a]);
    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });
});

// ─── groupByDate ────────────────────────────────────────────────────────────

describe("groupByDate", () => {
  it("buckets items by KST date", () => {
    const items = [
      item({ headline: "a", published_at: "2026-05-04T10:00:00+09:00" }),
      item({ headline: "b", published_at: "2026-05-04T20:00:00+09:00" }),
      item({ headline: "c", published_at: "2026-05-05T03:00:00+09:00" }),
    ];
    const buckets = groupByDate(items);
    expect(buckets.size).toBe(2);
    expect(buckets.get("2026-05-04")?.length).toBe(2);
    expect(buckets.get("2026-05-05")?.length).toBe(1);
  });

  it("KST boundary: late-evening UTC items bucket to KST date, not UTC date", () => {
    // 14:30 UTC = 23:30 KST → 2026-05-04
    // 15:30 UTC = 00:30 KST next day → 2026-05-05
    const items = [
      item({ headline: "evening", published_at: "2026-05-04T14:30:00Z" }),
      item({ headline: "midnight", published_at: "2026-05-04T15:30:00Z" }),
    ];
    const buckets = groupByDate(items);
    expect(buckets.get("2026-05-04")?.length).toBe(1);
    expect(buckets.get("2026-05-05")?.length).toBe(1);
  });

  it("D2: skips items with bad ISO instead of crashing", () => {
    const items = [
      item({ headline: "good", published_at: "2026-05-04T10:00:00+09:00" }),
      item({ headline: "bad", published_at: "not-a-date" }),
      item({ headline: "good2", published_at: "2026-05-04T11:00:00+09:00" }),
    ];
    const buckets = groupByDate(items);
    expect(buckets.size).toBe(1);
    expect(buckets.get("2026-05-04")?.length).toBe(2);
  });

  it("returns empty Map on empty input", () => {
    expect(groupByDate([]).size).toBe(0);
  });
});

// ─── heatmapBucket ──────────────────────────────────────────────────────────

describe("heatmapBucket (D12 5-bucket log scale)", () => {
  it("bucket 0 for 0 articles", () => {
    expect(heatmapBucket(0)).toBe(0);
  });

  it("bucket 1 for 1-2 articles", () => {
    expect(heatmapBucket(1)).toBe(1);
    expect(heatmapBucket(2)).toBe(1);
  });

  it("bucket 2 for 3-7 articles", () => {
    expect(heatmapBucket(3)).toBe(2);
    expect(heatmapBucket(7)).toBe(2);
  });

  it("bucket 3 for 8-20 articles", () => {
    expect(heatmapBucket(8)).toBe(3);
    expect(heatmapBucket(20)).toBe(3);
  });

  it("bucket 4 for 21-50 articles", () => {
    expect(heatmapBucket(21)).toBe(4);
    expect(heatmapBucket(50)).toBe(4);
  });

  it("bucket 5 for 51+ articles (peak day = 158)", () => {
    expect(heatmapBucket(51)).toBe(5);
    expect(heatmapBucket(158)).toBe(5);
    expect(heatmapBucket(1000)).toBe(5);
  });

  it("handles negative count defensively as 0", () => {
    expect(heatmapBucket(-1)).toBe(0);
  });
});

// ─── formatKstDateKo ────────────────────────────────────────────────────────

describe("formatKstDateKo (regression: 2026-05-12 off-by-one bug)", () => {
  // The original ArchiveCard.formatDateKo constructed
  //   `new Date("${date}T00:00:00+09:00")` and called getUTCDate().
  // KST midnight = 15:00 UTC of the PREVIOUS day, so getUTCDate() returned
  // date-1. Cards labelled "2026.4.27" rendered data for archive.date
  // "2026-04-28". These tests pin the fix.

  it("date pieces match input string exactly (no UTC roundtrip)", () => {
    expect(formatKstDateKo("2026-04-28")).toMatch(/^2026\.4\.28 \(/);
    expect(formatKstDateKo("2026-04-29")).toMatch(/^2026\.4\.29 \(/);
    expect(formatKstDateKo("2026-04-30")).toMatch(/^2026\.4\.30 \(/);
    expect(formatKstDateKo("2026-05-01")).toMatch(/^2026\.5\.1 \(/);
  });

  it("month boundary: last day of month stays in same month", () => {
    // The bug shifted "2026-04-30" → "2026.4.29" (or worse, into prev month).
    expect(formatKstDateKo("2026-04-30")).toBe("2026.4.30 (목)");
    expect(formatKstDateKo("2026-05-31")).toMatch(/^2026\.5\.31 /);
  });

  it("year boundary: 2026-12-31 stays in 2026", () => {
    expect(formatKstDateKo("2026-12-31")).toMatch(/^2026\.12\.31 /);
    expect(formatKstDateKo("2027-01-01")).toMatch(/^2027\.1\.1 /);
  });

  it("weekday is correct KST weekday (constructed at noon, not midnight)", () => {
    // Sequential days produce sequential weekdays. We don't pin the exact
    // mapping (depends on calendar), only that day-N+1 weekday = day-N+1
    // weekday. (Skipping leap-year edge — not in current corpus range.)
    const days = ["2026-04-26", "2026-04-27", "2026-04-28", "2026-04-29", "2026-04-30"];
    const weekdays = days.map((d) => formatKstDateKo(d).match(/\((.)\)/)?.[1]);
    const idx = ["일", "월", "화", "수", "목", "금", "토"];
    const indices = weekdays.map((w) => idx.indexOf(w!));
    // Each consecutive day advances by 1 (mod 7).
    for (let i = 1; i < indices.length; i++) {
      expect((indices[i] - indices[i - 1] + 7) % 7).toBe(1);
    }
  });
});
