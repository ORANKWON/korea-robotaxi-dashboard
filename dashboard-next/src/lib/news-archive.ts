/**
 * News archive — daily representative pick + grouping for /archive routes.
 *
 * Locked-in by /plan-eng-review 2026-05-11 (news-archive-v1 plan, D2-D13).
 *
 * Pipeline:
 *   getAllNews() → groupByDate(KST) → pickRepresentative per day
 *                                  → DailyArchive[] (sorted desc by date)
 *                                  → getMonthlyArchive() rolls up by YYYY-MM
 *
 * Why this lives separate from news-utils.ts:
 *   news-utils.ts is a "pure presentation utilities" layer (canonicalLink,
 *   tagClass, formatRelativeKo). news-archive owns the aggregation domain
 *   (per-day winner + freeze override). Single direction: news-archive
 *   imports from news-utils, never reverse.
 *
 * Key decisions from /plan-eng-review:
 *   - D2: toKSTDate returns null on bad ISO → groupByDate skips. One bad
 *     item can't kill the 511-page build.
 *   - D3: pickRepresentative stays pure. Freeze override happens at
 *     getDailyArchive() boundary, not inside pickRepresentative.
 *   - D6: WeeklyInsight.highlight is discriminated union (in news-utils).
 *   - D9: freeze.json is read by getDailyArchive() only — write happens
 *     via scripts/freeze_archive.py inside crawl.yml step list.
 *   - D10: KST_DATE_FORMATTER singleton in news-utils.ts.
 *   - D13: bun test for TS direct (no Python parallel impl drift).
 *
 * RSC-safety: Map types never cross server↔client boundary. Use
 * Record<string, number> for any field that flows into a "use client"
 * component — Next.js RSC serialization breaks Map but handles plain
 * objects fine.
 */
import type { NewsItem } from "@/types";
import { toKSTDate } from "@/lib/news-utils";
import { getAllNews } from "@/lib/news";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * One day in the archive.
 *
 * `companyMentions` is `Record` not `Map` so Server Component → Client
 * Component prop passes work (RSC serializes plain JSON, not Map).
 */
export interface DailyArchive {
  /** KST `YYYY-MM-DD`. */
  date: string;
  /** null only when allItems is empty (shouldn't happen given groupByDate). */
  representative: NewsItem | null;
  allItems: NewsItem[];
  /** Canonical company name → mention count across all items that day. */
  companyMentions: Record<string, number>;
}

export interface MonthlyArchive {
  /** `YYYY-MM`. */
  yearMonth: string;
  days: DailyArchive[];
}

// ─── pickRepresentative ─────────────────────────────────────────────────────

/**
 * Score a news item for "representativeness" of its day.
 *
 * Locked-in by /plan-ceo-review 2026-05-11 (D9 outside-voice fix):
 *   - Tag bucket as multiplier (×3/×2/×1.5/×1), not additive +1000/+100.
 *   - Companies cardinality as additive base (1 + count).
 *   - Summary length as small bonus (cap 500 char, /1000).
 *
 * Rationale: original additive +1000 made any 사고 article (66 in corpus)
 * win over a multi-company 기업 mega-announcement — wrong intuition. Hybrid
 * `tag × (1 + companies)` makes "광주 발표 (기업, 3 companies)" beat "small
 * 사고 (사고, 1 company)": 2 × 4 = 8 vs 3 × 2 = 6.
 *
 * Missing fields: companies absent → 0 contribution. summary null → 0 bonus.
 * Pure function. Same input → same output.
 */
function scoreOf(item: NewsItem): number {
  const tagMult =
    item.tags.includes("정책") || item.tags.includes("사고")
      ? 3
      : item.tags.includes("기업")
        ? 2
        : item.tags.includes("서비스")
          ? 1.5
          : 1;
  const compBase = 1 + (item.companies ?? []).length;
  const summaryBoost = Math.min((item.summary ?? "").length, 500) / 1000;
  return tagMult * compBase + summaryBoost;
}

/**
 * Final tiebreaker collator. Module-level singleton so the same Intl.Collator
 * instance handles every comparison — no ICU drift between Node minor versions
 * (Reviewer Concerns I).
 */
const HEADLINE_COLLATOR = new Intl.Collator("ko", { sensitivity: "base" });

/**
 * Pick the day's representative article.
 *
 * Locked-in by /plan-eng-review 2026-05-11 (D3 — pure function, no I/O).
 * Freeze override is applied later in getDailyArchive(), not here.
 *
 * Tiebreaker: scoreOf desc → headline localeCompare(ko) ascending. Stable
 * across reruns: same items in same order produce same winner.
 */
export function pickRepresentative(items: NewsItem[]): NewsItem | null {
  if (items.length === 0) return null;
  return items
    .slice()
    .sort(
      (a, b) =>
        scoreOf(b) - scoreOf(a) ||
        HEADLINE_COLLATOR.compare(a.headline, b.headline),
    )[0];
}

// ─── groupByDate ────────────────────────────────────────────────────────────

/**
 * Group items by KST date. Items with bad `published_at` (toKSTDate returns
 * null) are silently skipped — D2 graceful degradation. Existing /news pattern.
 *
 * Returns a Map keyed on KST `YYYY-MM-DD`. Map is OK at this layer because
 * it stays server-side; conversion to Record happens in DailyArchive
 * construction below.
 */
export function groupByDate(items: NewsItem[]): Map<string, NewsItem[]> {
  const buckets = new Map<string, NewsItem[]>();
  for (const item of items) {
    const date = toKSTDate(item.published_at);
    if (!date) continue; // D2: skip bad ISO, don't crash
    const arr = buckets.get(date);
    if (arr) arr.push(item);
    else buckets.set(date, [item]);
  }
  return buckets;
}

// ─── Memoized accessors ─────────────────────────────────────────────────────

let _cachedDailyArchive: DailyArchive[] | null = null;
let _cachedMonthlyArchive: MonthlyArchive[] | null = null;

/**
 * All days in the corpus, sorted newest first. Memoized — reads getAllNews()
 * once per worker (matches news.ts ALL_NEWS pattern). Reset between dev
 * hot-reloads automatically (module reload).
 *
 * D3: applies freeze.json override at this boundary. pickRepresentative stays
 * pure; freeze logic lives here. (PR2 will read frozen.json and override
 * representative for dates >= 7 days old.)
 */
export function getDailyArchive(): DailyArchive[] {
  if (_cachedDailyArchive) return _cachedDailyArchive;

  const items = getAllNews();
  const buckets = groupByDate(items);

  // tsconfig has no `target` set (defaults to ES3 here), so direct Map
  // iteration trips TS2802. Materialize via Array.from to match the existing
  // pattern used in lib/news-utils.ts (computeWeeklyInsight).
  const days: DailyArchive[] = [];
  for (const [date, dayItems] of Array.from(buckets.entries())) {
    const companyMentions: Record<string, number> = {};
    for (const it of dayItems) {
      for (const c of it.companies ?? []) {
        companyMentions[c] = (companyMentions[c] ?? 0) + 1;
      }
    }
    days.push({
      date,
      representative: pickRepresentative(dayItems),
      allItems: dayItems
        .slice()
        .sort((a, b) => b.published_at.localeCompare(a.published_at)),
      companyMentions,
    });
  }
  // Newest first — drives prev/next nav, recent list ordering, sitemap order.
  days.sort((a, b) => b.date.localeCompare(a.date));

  // PR2 will inject freeze.json override here:
  // for (const day of days) { if (frozen[day.date] && ageDays(day.date) >= 7) { ... } }

  _cachedDailyArchive = days;
  return days;
}

/**
 * Days grouped by `YYYY-MM`, newest month first; days within a month newest
 * first. Memoized via _cachedMonthlyArchive.
 */
export function getMonthlyArchive(): MonthlyArchive[] {
  if (_cachedMonthlyArchive) return _cachedMonthlyArchive;
  const days = getDailyArchive();
  const buckets = new Map<string, DailyArchive[]>();
  for (const day of days) {
    const ym = day.date.slice(0, 7);
    const arr = buckets.get(ym);
    if (arr) arr.push(day);
    else buckets.set(ym, [day]);
  }
  const months: MonthlyArchive[] = [];
  for (const [yearMonth, daysInMonth] of Array.from(buckets.entries())) {
    months.push({ yearMonth, days: daysInMonth });
  }
  months.sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
  _cachedMonthlyArchive = months;
  return months;
}

/**
 * Test-only helper to clear memoization. Production code never calls this.
 */
export function _resetArchiveCache(): void {
  _cachedDailyArchive = null;
  _cachedMonthlyArchive = null;
}

// ─── Heatmap bucket helper ──────────────────────────────────────────────────

/**
 * 5 intensity buckets for CalendarHeatmap, log-scale to match actual corpus
 * distribution (median 7, peak 158). Locked-in by /plan-ceo-review D12
 * outside-voice fix.
 *
 *   0건       → 0 (gray, click disabled)
 *   1-2건     → 1
 *   3-7건     → 2
 *   8-20건    → 3
 *   21-50건   → 4
 *   51+건     → 5
 *
 * Returns 0..5. Caller maps to color class.
 */
export function heatmapBucket(count: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 7) return 2;
  if (count <= 20) return 3;
  if (count <= 50) return 4;
  return 5;
}
