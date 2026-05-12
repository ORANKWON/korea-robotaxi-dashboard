/**
 * Pure helpers for the news UI: relative-time formatting, normalized URL keys,
 * KST date conversion, tag → color map, weekly insight aggregation.
 *
 * Locked-in by /plan-eng-review 2026-04-17 (news-list-v2) + 2026-05-11
 * (news-archive-v1, D5 toKSTDate moved here, D6 WeeklyInsight discriminated
 * union, D10 module-level Intl.DateTimeFormat singleton).
 *
 * Why a separate module: NewsCard + RelatedNews + WeeklyInsightWidget +
 * news-archive all need the same utilities. Keeping it pure makes it
 * trivially unit-testable and avoids re-deriving in every component.
 */
import type { NewsItem } from "@/types";

/**
 * Single Intl.DateTimeFormat instance for KST date conversion. Re-instantiating
 * per item costs ~3s across 3,090 items × 511 SSG pages (D10 outside-voice
 * finding). Module-level singleton: init once per worker, .format() per item
 * stays at microseconds.
 *
 * Locale "en-CA" gives "YYYY-MM-DD" output without locale-specific separators.
 */
const KST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Convert UTC ISO timestamp to KST date string `YYYY-MM-DD`.
 *
 * Locked-in by /plan-eng-review 2026-05-11 (D2 + D5 + D10):
 *   - D2 (build safety): returns null on bad ISO instead of throwing — one
 *     corrupt item can't kill the entire 511-page archive build.
 *   - D5: lives in news-utils.ts (not news-archive.ts) so news-utils consumers
 *     (computeWeeklyInsight) can use it without circular dependency.
 *   - D10: KST_DATE_FORMATTER singleton above.
 *
 * Naive `iso[:10]` slice is wrong: KST 23:30 = UTC 14:30 → that day's late
 * articles bucket to the wrong (UTC-next) date. KST conversion is required
 * for "5월 4일 뉴스" to mean what a Korean user expects.
 */
export function toKSTDate(iso: string): string | null {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return KST_DATE_FORMATTER.format(d);
}

/**
 * Pick the canonical link for a news item (unwrapped publisher URL preferred
 * over Google News redirect). Defined here (not in `lib/news.ts`) so client
 * components can import it without dragging `node:crypto` into the browser
 * bundle. `lib/news.ts` re-exports for back-compat with existing API routes.
 */
export function canonicalLink(item: NewsItem): string {
  return item.final_url || item.url;
}

/** Tailwind classes for tag chips. Single source of truth. */
export const TAG_COLOR: Record<string, string> = {
  정책: "bg-blue-100 text-blue-700",
  기업: "bg-purple-100 text-purple-700",
  서비스: "bg-green-100 text-green-700",
  사고: "bg-red-100 text-red-700",
  해외: "bg-orange-100 text-orange-700",
  일반: "bg-gray-100 text-gray-700",
};

export const ALL_TAGS = ["정책", "기업", "서비스", "사고", "해외", "일반"] as const;
export type Tag = (typeof ALL_TAGS)[number];

export function tagClass(tag: string): string {
  return TAG_COLOR[tag] || TAG_COLOR["일반"];
}

/**
 * Stable key for a news item, used for bookmark/read localStorage maps.
 * Prefers `final_url` so the key survives even if Google rotates the redirect
 * URL on the next crawl. Falls back to the original `url`.
 */
export function newsKey(item: NewsItem): string {
  return canonicalLink(item);
}

/**
 * Korean relative time. Pure — takes `now` as a parameter for testability.
 *
 *   <60s     → "방금"
 *   <60m     → "N분 전"
 *   <24h     → "N시간 전"
 *   <7일     → "N일 전"
 *   else     → "YYYY.M.D"
 *
 * Returns the absolute date for older items because "37일 전" is harder to
 * scan than "2026.3.21" for our 1-순위 user (skim-and-decide workflow).
 */
export function formatRelativeKo(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffSec = Math.floor((now.getTime() - t) / 1000);

  if (diffSec < 60) return "방금";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}일 전`;

  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

/**
 * Compute "이번 주 인사이트" from the current news corpus.
 * Window: last 7 days from `now`. Pure.
 *
 * Returns null when fewer than 3 items fall in the window — better empty
 * state than rendering a misleading "top 3" off 1-2 articles.
 */
/**
 * Discriminated union for the highlight slot. Locked-in by /plan-eng-review
 * 2026-05-11 (D6): all three fields are set together or all null. Type
 * enforces the invariant — consumer needs one null check, not three.
 *
 * `headline` is the article headline (existing field, just relocated).
 * `date` is the KST `YYYY-MM-DD` for permalink to /archive/[date].
 * `url` is `canonicalLink(item)` for the secondary "원문↗" external link.
 */
export interface WeeklyInsight {
  range: [string, string];
  total_articles: number;
  top_companies: Array<{ name: string; count: number }>;
  highlight: {
    headline: string;
    date: string;
    url: string;
  } | null;
  daily_counts: number[];
}

export function computeWeeklyInsight(
  items: NewsItem[],
  now: Date = new Date(),
): WeeklyInsight | null {
  const endMs = now.getTime();
  const startMs = endMs - 7 * 24 * 60 * 60 * 1000;
  const window = items.filter((it) => {
    const t = new Date(it.published_at).getTime();
    return Number.isFinite(t) && t >= startMs && t <= endMs;
  });
  if (window.length < 3) return null;

  // Top companies by mention count (uses Phase 1 infer_companies output)
  const companyCount = new Map<string, number>();
  for (const it of window) {
    for (const c of it.companies ?? []) {
      companyCount.set(c, (companyCount.get(c) ?? 0) + 1);
    }
  }
  const top_companies = Array.from(companyCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));

  // Highlight: first 정책 OR 사고 headline (chronologically newest).
  // D6 (2026-05-11): populate the discriminated union — headline + KST date +
  // canonical URL together or all null. WeeklyInsightWidget uses .date for
  // /archive/[date] permalink and .url for "원문↗" secondary external link.
  const sortedByDate = window
    .slice()
    .sort((a, b) => b.published_at.localeCompare(a.published_at));
  const highlightItem = sortedByDate.find(
    (it) => it.tags.includes("정책") || it.tags.includes("사고"),
  );
  const highlightDate = highlightItem ? toKSTDate(highlightItem.published_at) : null;
  const highlight = highlightItem && highlightDate
    ? {
        headline: highlightItem.headline,
        date: highlightDate,
        url: canonicalLink(highlightItem),
      }
    : null;

  // Daily counts (oldest to newest, length 7)
  const daily_counts = Array(7).fill(0) as number[];
  for (const it of window) {
    const t = new Date(it.published_at).getTime();
    if (!Number.isFinite(t)) continue;
    const dayIdx = Math.floor((t - startMs) / (24 * 60 * 60 * 1000));
    if (dayIdx >= 0 && dayIdx < 7) daily_counts[dayIdx]++;
  }

  const startISO = new Date(startMs).toISOString().slice(0, 10);
  const endISO = new Date(endMs).toISOString().slice(0, 10);

  return {
    range: [startISO, endISO],
    total_articles: window.length,
    top_companies,
    highlight,
    daily_counts,
  };
}

/**
 * Distinct company names that appear in any item's `companies` field.
 * Sorted by mention count desc — most prominent companies first in chip bar.
 */
export function distinctCompanies(items: NewsItem[]): string[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    for (const c of it.companies ?? []) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
}
