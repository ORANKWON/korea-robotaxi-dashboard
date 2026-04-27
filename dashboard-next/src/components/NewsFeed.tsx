/**
 * Homepage news teaser — compact 5-item preview with "더 보기 → /news" link.
 *
 * Locked-in by /plan-eng-review 2026-04-17 (news-list-v2 plan Phase 5:
 * "Homepage NewsFeed 단순화 — 최근 N건만, 필터/페이지네이션은 /news로 위임").
 *
 * Why simpler than before: the old version had its own tag chip filter and
 * 30-item list. That was a mini-/news embedded on the homepage. The full
 * filterable experience now lives at /news with URL persistence, IME-safe
 * search, hideRead, and bookmarks. The homepage is a teaser — show the most
 * recent 5, link to the real thing.
 *
 * Server component — no client interactivity needed for a static preview.
 * The NewsCard children stay client (bookmark logic), but we pass
 * `showBookmark={false}` since this is a glanceable strip.
 */
import Link from "next/link";
import type { NewsItem } from "@/types";
import NewsCard from "@/components/news/NewsCard";

const HOMEPAGE_PREVIEW_COUNT = 5;

export interface NewsFeedProps {
  news: NewsItem[];
}

export default function NewsFeed({ news }: NewsFeedProps) {
  const preview = news.slice(0, HOMEPAGE_PREVIEW_COUNT);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">
          최근 뉴스
          <span className="ml-2 text-sm font-normal text-gray-400">
            {news.length.toLocaleString("ko-KR")}건
          </span>
        </h2>
        <Link
          href="/news"
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          전체 보기 →
        </Link>
      </div>

      {preview.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center bg-white rounded-xl border border-gray-200">
          뉴스가 아직 없습니다.
        </p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 shadow-sm overflow-hidden">
          {preview.map((item) => (
            <NewsCard
              key={item.final_url || item.url}
              item={item}
              mode="compact"
              showBookmark={false}
            />
          ))}
        </div>
      )}
    </section>
  );
}
