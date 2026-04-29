/**
 * Client island for /my. Reads two localStorage sets (news + companies),
 * filters the inlined corpora, renders sections.
 *
 * Locked-in by trade-tool-v1 plan (Killer Feature #5).
 *
 * Hydration UX:
 *   - Pre-hydration: render skeletons (not "0건 북마크" — that lies for
 *     users who actually have bookmarks, since the localStorage read is
 *     deferred to useEffect).
 *   - Post-hydration: filter corpus → render real cards.
 *   - Empty: show a friendly nudge with links to /news and / (homepage)
 *     so the page isn't a dead end.
 *
 * Cross-tab sync inherited from useLocalStorageSet via the `storage` event.
 */
"use client";

import Link from "next/link";
import type { Company, NewsItem } from "@/types";
import NewsCard from "@/components/news/NewsCard";
import { useLocalStorageSet } from "@/lib/use-local-storage";
import { newsKey } from "@/lib/news-utils";

export interface MyBookmarksClientProps {
  news: NewsItem[];
  companies: Company[];
}

export default function MyBookmarksClient({
  news,
  companies,
}: MyBookmarksClientProps) {
  const [, , hasNews, newsHydrated] = useLocalStorageSet(
    "kr-robotaxi:news:bookmarks",
  );
  const [, , hasCompany, companyHydrated] = useLocalStorageSet(
    "kr-robotaxi:companies:bookmarks",
  );

  // Pre-hydration: render the section shells with skeleton cards so the
  // layout doesn't shift, but DON'T claim "0 bookmarks" — that's a lie
  // until we've actually read localStorage.
  if (!newsHydrated || !companyHydrated) {
    return (
      <div className="space-y-6">
        <SkeletonSection title="북마크 기업" />
        <SkeletonSection title="북마크 뉴스" />
      </div>
    );
  }

  const bookmarkedCompanies = companies.filter(
    (c) => c.slug && hasCompany(c.slug),
  );
  const bookmarkedNews = news.filter((n) => hasNews(newsKey(n)));

  const totalCount = bookmarkedCompanies.length + bookmarkedNews.length;
  if (totalCount === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-6">
      <CompaniesSection items={bookmarkedCompanies} />
      <NewsSection items={bookmarkedNews} />
    </div>
  );
}

// ─── Sections ───────────────────────────────────────────────────────────────

function CompaniesSection({ items }: { items: Company[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="text-lg font-bold mb-3">
        북마크 기업
        <span className="ml-2 text-sm font-normal text-gray-400">
          {items.length}개
        </span>
      </h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {items.map((c) => (
          <Link
            key={c.id}
            href={`/company/${c.id}`}
            className="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:border-blue-300 hover:shadow transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">{c.name}</h3>
              <span className="text-yellow-500 text-lg leading-none" aria-hidden>
                ★
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {c.partner} · {c.zones.join(", ") || "운행 구역 미정"}
            </p>
            {c.key_milestone && (
              <p className="text-sm text-gray-700 mt-2 line-clamp-2 leading-snug">
                {c.key_milestone}
              </p>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

function NewsSection({ items }: { items: NewsItem[] }) {
  if (items.length === 0) return null;
  // Newest first — same convention as /news.
  const sorted = items
    .slice()
    .sort((a, b) => b.published_at.localeCompare(a.published_at));
  return (
    <section>
      <h2 className="text-lg font-bold mb-3">
        북마크 뉴스
        <span className="ml-2 text-sm font-normal text-gray-400">
          {items.length}건
        </span>
      </h2>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 shadow-sm overflow-hidden">
        {sorted.map((n) => (
          <NewsCard
            key={n.final_url || n.url}
            item={n}
            mode="compact"
            showBookmark={false}
          />
        ))}
      </div>
    </section>
  );
}

function SkeletonSection({ title }: { title: string }) {
  return (
    <section>
      <h2 className="text-lg font-bold mb-3">{title}</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm h-24 animate-pulse"
          />
        ))}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-10 text-center shadow-sm">
      <p className="text-5xl mb-3" aria-hidden>
        ☆
      </p>
      <p className="text-gray-700 font-medium">아직 북마크한 항목이 없습니다.</p>
      <p className="text-sm text-gray-500 mt-2">
        기업 카드나 뉴스 카드의 ☆를 눌러 북마크하면 여기에 모입니다.
      </p>
      <div className="flex gap-2 justify-center mt-5">
        <Link
          href="/"
          className="text-sm font-medium px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          기업 보러 가기
        </Link>
        <Link
          href="/news"
          className="text-sm font-medium px-4 py-2 rounded-md border border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-700 transition-colors"
        >
          뉴스 보러 가기
        </Link>
      </div>
    </div>
  );
}
