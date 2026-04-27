/**
 * "관련 뉴스" inline section for /company/[id].
 *
 * Locked-in by /plan-eng-review 2026-04-17 (news-list-v2 plan cherry-pick #4).
 *
 * Server component — no localStorage, no client interactivity. The cards
 * inside ARE client (NewsCard's bookmark logic), but the matching + slicing
 * is server-side so we don't ship the whole news corpus to the browser.
 *
 * Matching strategy (companies field is the source of truth post-backfill):
 *   1. Primary: news where `companies` field includes the canonical name
 *      (fast, accurate, leverages Phase 1 infer_companies)
 *   2. Fallback for pre-backfill data: keyword match against headline using
 *      tokens of the canonical name (replicates old behavior for items
 *      that haven't been re-processed yet)
 *
 * Once backfill runs, fallback returns 0 hits and primary owns everything.
 * Items that get unwrapped on the next crawl will gain `companies` and
 * naturally migrate to the primary path.
 */
import Link from "next/link";
import type { NewsItem } from "@/types";
import { getAllNews } from "@/lib/news";
import NewsCard from "./NewsCard";

export interface RelatedNewsProps {
  /** Canonical company name (matches `NewsItem.companies` exactly). */
  companyName: string;
  /** Used for the keyword fallback when `companies` field is missing. */
  fallbackKeywords?: string[];
  limit?: number;
  /** Company ID for the "더 보기 → /news?company=..." link. */
  companyId?: number;
}

export default function RelatedNews({
  companyName,
  fallbackKeywords = [],
  limit = 10,
  companyId,
}: RelatedNewsProps) {
  const all = getAllNews();

  // Primary path: companies field
  const seenKeys = new Set<string>();
  const matched: NewsItem[] = [];

  for (const item of all) {
    if (item.companies?.includes(companyName)) {
      const key = item.final_url || item.url;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        matched.push(item);
      }
    }
  }

  // Fallback: only run if primary had few hits AND we have keywords
  if (matched.length < limit && fallbackKeywords.length > 0) {
    for (const item of all) {
      if (matched.length >= limit) break;
      const key = item.final_url || item.url;
      if (seenKeys.has(key)) continue;
      const hit = fallbackKeywords.some((kw) =>
        item.headline.includes(kw) || item.summary.includes(kw),
      );
      if (hit) {
        seenKeys.add(key);
        matched.push(item);
      }
    }
  }

  if (matched.length === 0) {
    return (
      <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold mb-2">관련 뉴스</h2>
        <p className="text-sm text-gray-400">관련 뉴스가 아직 없습니다.</p>
      </section>
    );
  }

  const visible = matched.slice(0, limit);
  const hasMore = matched.length > limit;
  const moreHref = `/news?company=${encodeURIComponent(companyName)}`;

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">
          관련 뉴스
          <span className="ml-2 text-sm font-normal text-gray-400">
            {matched.length}건
          </span>
        </h2>
        {(hasMore || companyId !== undefined) && (
          <Link
            href={moreHref}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            더 보기 →
          </Link>
        )}
      </div>
      <div className="space-y-2">
        {visible.map((item) => (
          <NewsCard
            key={item.final_url || item.url}
            item={item}
            mode="compact"
            showBookmark={false}
          />
        ))}
      </div>
    </section>
  );
}
