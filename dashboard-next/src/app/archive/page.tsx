/**
 * /archive — index page for the daily news archive.
 *
 * Locked-in by /plan-eng-review 2026-05-11 (D10 outside-voice fix):
 *   - 3-section layout: CalendarHeatmap (hero) + RecentDays (newest 30) +
 *     Year-grouped month grid.
 *   - The year grid is the "discoverability fix" for the 75 monthly pages —
 *     without it, /archive/[YYYY-MM] only gets traffic via sitemap, and a
 *     user wanting "2024년 8월 광주 자율주행" has no in-product entry point.
 *   - Current year expanded by default; older years collapsed via <details>
 *     so the page doesn't visually explode for new visitors.
 *
 * Server component. SSG with the same revalidate window as the [slug] route
 * (6h matches /news + crawl cadence).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { getDailyArchive, getMonthlyArchive } from "@/lib/news-archive";
import ArchiveCard from "@/components/archive/ArchiveCard";
import CalendarHeatmap from "@/components/archive/CalendarHeatmap";

export const revalidate = 21600;

export const metadata: Metadata = {
  title: "뉴스 아카이브 — 한국 로보택시 일일 대표기사",
  description:
    "한국 자율주행택시(로보택시) 뉴스 아카이브. 매일 대표기사 1건과 회사별 언급 추이, 정책/사고 이슈를 날짜별·월별로 정리합니다.",
  alternates: { canonical: "/archive" },
  openGraph: {
    title: "뉴스 아카이브 | 한국 로보택시 대시보드",
    description:
      "날짜별 대표기사 + 회사별 언급 추이 + 캘린더 히트맵. 한국 로보택시 산업의 일일 흐름을 한눈에.",
    type: "website",
    url: "/archive",
  },
  twitter: {
    card: "summary",
    title: "뉴스 아카이브 | 한국 로보택시 대시보드",
    description: "날짜별 대표기사 + 캘린더 히트맵. 한국 로보택시 일일 흐름.",
  },
};

const KO_MONTH_LABELS = [
  "1월",
  "2월",
  "3월",
  "4월",
  "5월",
  "6월",
  "7월",
  "8월",
  "9월",
  "10월",
  "11월",
  "12월",
];

export default function ArchiveIndexPage() {
  const archive = getDailyArchive();
  const months = getMonthlyArchive();
  const recent = archive.slice(0, 30);
  const totalDays = archive.length;
  const totalArticles = archive.reduce(
    (sum, d) => sum + d.allItems.length,
    0,
  );

  // Group monthly entries by year. months[] is desc-sorted (newest first).
  // monthsByYear[year] = Set of "MM" keys present in corpus for that year.
  const monthsByYear = new Map<string, Set<string>>();
  for (const m of months) {
    const [year, month] = m.yearMonth.split("-");
    let set = monthsByYear.get(year);
    if (!set) {
      set = new Set();
      monthsByYear.set(year, set);
    }
    set.add(month);
  }
  // Years desc (newest first). Map preserves insertion order = corpus order.
  const years = Array.from(monthsByYear.keys()).sort((a, b) =>
    b.localeCompare(a),
  );
  const currentYear = years[0]; // newest year — open by default

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          뉴스 아카이브
        </h1>
        <p className="text-sm text-gray-600">
          매일 대표기사 1건씩 골라 영구 보존합니다. 총 {totalDays.toLocaleString()}일 ·{" "}
          {totalArticles.toLocaleString()}건 기사.
        </p>
      </header>

      {/* Section 1: Calendar heatmap (hero) */}
      <section>
        <CalendarHeatmap archive={archive} days={365} />
      </section>

      {/* Section 2: Recent days list */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">최근 30일</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-400">아직 아카이브된 날짜가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recent.map((day) => (
              <ArchiveCard key={day.date} archive={day} />
            ))}
          </div>
        )}
      </section>

      {/* Section 3: Year-grouped month grid (D10) */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">월별 보기</h2>
        <p className="text-xs text-gray-500 mb-3">
          연도를 클릭하면 해당 월 칩이 펼쳐집니다. 월을 클릭하면 그 달의 모든 날짜와
          대표기사 목록을 볼 수 있습니다.
        </p>
        <div className="space-y-2">
          {years.map((year) => {
            const monthSet = monthsByYear.get(year)!;
            const isCurrent = year === currentYear;
            return (
              <details
                key={year}
                open={isCurrent}
                className="bg-white rounded-xl border border-gray-200 shadow-sm group"
              >
                <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between text-sm font-semibold text-gray-700 hover:bg-gray-50 rounded-xl">
                  <span>{year}년</span>
                  <span className="text-xs text-gray-400 font-normal">
                    {monthSet.size}개월
                    <span className="ml-2 transition-transform inline-block group-open:rotate-180">
                      ▾
                    </span>
                  </span>
                </summary>
                <div className="px-4 pb-4 pt-1 flex flex-wrap gap-2">
                  {KO_MONTH_LABELS.map((label, idx) => {
                    const mm = String(idx + 1).padStart(2, "0");
                    const present = monthSet.has(mm);
                    if (!present) {
                      return (
                        <span
                          key={mm}
                          className="text-xs px-3 py-1.5 rounded-full bg-gray-50 text-gray-300"
                          aria-disabled="true"
                          title={`${year}년 ${label} — 데이터 없음`}
                        >
                          {label}
                        </span>
                      );
                    }
                    return (
                      <Link
                        key={mm}
                        href={`/archive/${year}-${mm}`}
                        className="text-xs px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 transition-colors"
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}
