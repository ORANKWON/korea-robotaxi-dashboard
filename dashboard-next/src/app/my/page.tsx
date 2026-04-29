/**
 * /my — personal bookmarks aggregator. Shows everything the user has ☆-d
 * across the dashboard: news + companies (today; news/zones could join later).
 *
 * Locked-in by trade-tool-v1 plan (Killer Feature #5 — bookmark anywhere,
 * see them all in one place).
 *
 * Server shell + client island pattern: this page is server-rendered (SSG)
 * with metadata + heading + the full corpus inlined. The client component
 * reads localStorage to filter the inlined corpus down to bookmarked items.
 *
 * Why inline the corpus instead of fetching: the ALL-news payload is ~80KB
 * gzipped (we already pay this on /news), companies is ~3KB. Bookmark sets
 * are pure client-side, so any "fetch only what's bookmarked" approach
 * would still need to ship the IDs to fetch. Inlining is simpler + faster.
 */
import type { Metadata } from "next";
import { getAllNews } from "@/lib/news";
import { getAllCompanies } from "@/lib/companies";
import MyBookmarksClient from "./MyBookmarksClient";

// Pure SSG — no revalidation needed beyond the data refresh that happens
// when companies/news changes propagate through the build.
export const revalidate = 21600;

export const metadata: Metadata = {
  title: "내 북마크",
  description:
    "북마크한 자율주행 기업과 뉴스를 한곳에서. localStorage 저장, 두 탭 사이 자동 동기화.",
  alternates: { canonical: "/my" },
  openGraph: {
    title: "내 북마크 — 한국 로보택시 대시보드",
    description: "북마크한 자율주행 기업과 뉴스를 한곳에서.",
    url: "/my",
  },
  // No need to be SEO-discoverable — this is a personal page, content
  // varies per device.
  robots: { index: false, follow: false },
};

export default function MyPage() {
  const news = getAllNews();
  const companies = getAllCompanies();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">내 북마크</h1>
        <p className="text-sm text-gray-500 mt-1">
          이 디바이스에서 ☆ 한 항목들. localStorage에 저장됩니다.
        </p>
      </header>
      <MyBookmarksClient news={news} companies={companies} />
    </div>
  );
}
