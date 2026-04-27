/**
 * /news — standalone news page (Phase 3 of news-list-v2 plan).
 *
 * Locked-in by /plan-eng-review 2026-04-17.
 *
 * Server component. Inlines the full corpus + computed weekly insight at
 * build time, hands off URL state + filter UI to NewsPageClient under Suspense.
 *
 * Why ISR (revalidate=21600 = 6h): matches the crawler cadence in
 * `.github/workflows/crawl.yml` (`cron: "0 *​/6 * * *"`). Stale-while-revalidate
 * on Vercel — users always get instant HTML, fresh data lands within a crawl
 * cycle. The /api/news.json route also revalidates on-demand from the crawl
 * action, so this is belt-and-suspenders.
 *
 * The Suspense boundary is required: NewsPageClient calls useSearchParams(),
 * which forces dynamic rendering without one (Next 14 app router).
 */
import type { Metadata } from "next";
import { Suspense } from "react";
import {
  getAllNews,
} from "@/lib/news";
import {
  computeWeeklyInsight,
  distinctCompanies,
} from "@/lib/news-utils";
import NewsHeader from "@/components/news/NewsHeader";
import WeeklyInsightWidget from "@/components/news/WeeklyInsightWidget";
import NewsPageClient from "./NewsPageClient";

export const revalidate = 21600;

export const metadata: Metadata = {
  title: "뉴스",
  description:
    "한국 자율주행/로보택시 관련 뉴스 모음. 정책, 사고, 기업 발표, 서비스 출시 소식을 6시간마다 갱신.",
  alternates: {
    canonical: "/news",
    types: {
      "application/rss+xml": "/feed.xml",
      "application/json": "/api/news.json",
    },
  },
  openGraph: {
    title: "뉴스 — 한국 로보택시 대시보드",
    description: "정책, 사고, 기업 발표, 서비스 출시 소식. 6시간마다 갱신.",
    url: "/news",
  },
};

export default function NewsPage() {
  const all = getAllNews();
  const insight = computeWeeklyInsight(all);
  const companies = distinctCompanies(all);

  return (
    <div className="space-y-6">
      <NewsHeader total={all.length} />
      <WeeklyInsightWidget insight={insight} />
      <Suspense fallback={<NewsListFallback />}>
        <NewsPageClient items={all} availableCompanies={companies} />
      </Suspense>
    </div>
  );
}

/**
 * Skeleton shown while NewsPageClient hydrates. Matches the rough heights of
 * the real filter bar + 5 cards so we don't get a jarring layout shift.
 */
function NewsListFallback() {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm h-40 animate-pulse" />
      <div className="bg-white rounded-xl border border-gray-200 divide-y">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="p-4 h-24 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
