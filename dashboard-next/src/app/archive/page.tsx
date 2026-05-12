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
 * 2026-05-12 follow-up: company filter via `?company={name}` searchParam.
 *   - When set: filter recent-30 list + month grid to days where this
 *     company appears in any item (`day.companyMentions[company] > 0`).
 *     Heatmap stays unfiltered (recomputing 5-bucket distribution per
 *     company is marginal value, would also drift the global heatmap copy).
 *   - When unset: original full-archive view.
 *   - Invalid company name (not in companies.json) is silently ignored
 *     so a stale link can't 500 the page.
 *   - Filtered views set noindex + canonical=/archive to avoid Google
 *     indexing 11 near-duplicate pages.
 *
 * Server component. With searchParams the route is dynamically rendered,
 * but `revalidate = 21600` caches per (URL, searchParams) for 6h matching
 * /news + crawl cadence.
 */
import type { Metadata } from "next";
import Link from "next/link";
import companiesData from "@data/companies.json";
import type { Company } from "@/types";
import { getDailyArchive, getMonthlyArchive } from "@/lib/news-archive";
import ArchiveCard from "@/components/archive/ArchiveCard";
import CalendarHeatmap from "@/components/archive/CalendarHeatmap";
import CompanyFilterBar, {
  type CompanyFilterEntry,
} from "@/components/archive/CompanyFilterBar";

export const revalidate = 21600;

const companies = companiesData as Company[];

interface PageProps {
  searchParams: { company?: string };
}

// ─── Metadata (varies with filter) ──────────────────────────────────────────

const BASE_METADATA: Metadata = {
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

export function generateMetadata({ searchParams }: PageProps): Metadata {
  const active = resolveActiveCompany(searchParams.company);
  if (!active) return BASE_METADATA;
  // Filtered view: noindex + canonical to base. Avoids Google indexing
  // duplicate-content pages, but the URL stays shareable for the user.
  return {
    ...BASE_METADATA,
    title: `${active} 아카이브 — 한국 로보택시 일일 대표기사`,
    description: `${active} 관련 한국 자율주행택시 뉴스 아카이브. 회사가 등장한 날의 대표기사를 날짜별·월별로 모아 봅니다.`,
    robots: { index: false, follow: true },
    alternates: { canonical: "/archive" },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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

/**
 * Validate the searchParam against the canonical 10 companies. Returns the
 * exact-match name from companies.json, or undefined when missing/invalid.
 *
 * Strict equality: looser matching here would let `?company=현대차` resolve
 * to "현대자동차" and confuse anyone copy-pasting the URL elsewhere.
 */
function resolveActiveCompany(input: string | undefined): string | undefined {
  if (!input) return undefined;
  return companies.find((c) => c.name === input)?.name;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ArchiveIndexPage({ searchParams }: PageProps) {
  const archive = getDailyArchive();
  const monthsAll = getMonthlyArchive();
  const totalDaysAll = archive.length;
  const totalArticlesAll = archive.reduce(
    (sum, d) => sum + d.allItems.length,
    0,
  );

  const active = resolveActiveCompany(searchParams.company);

  // Compute per-company day counts (always — drives the filter chip labels
  // even when no filter is active). Single pass over the 436 days × 10
  // companies = 4,360 ops, runs once per ISR window.
  const companyDayCounts: CompanyFilterEntry[] = companies.map((c) => ({
    name: c.name,
    dayCount: archive.reduce(
      (n, d) => n + ((d.companyMentions[c.name] ?? 0) > 0 ? 1 : 0),
      0,
    ),
  }));

  // Apply the filter to recent + month grid. Heatmap stays as-is.
  const filteredArchive = active
    ? archive.filter((d) => (d.companyMentions[active] ?? 0) > 0)
    : archive;
  const recent = filteredArchive.slice(0, 30);

  // Year-grouped month grid: when filtered, only show months that contain at
  // least one matching day. Shape stays the same so the UI doesn't lurch
  // between filter states.
  const monthsForGrid = active
    ? deriveMonthsFromDays(filteredArchive)
    : monthsAll.map((m) => m.yearMonth);

  const monthsByYear = new Map<string, Set<string>>();
  for (const yearMonth of monthsForGrid) {
    const [year, month] = yearMonth.split("-");
    let set = monthsByYear.get(year);
    if (!set) {
      set = new Set();
      monthsByYear.set(year, set);
    }
    set.add(month);
  }
  const years = Array.from(monthsByYear.keys()).sort((a, b) =>
    b.localeCompare(a),
  );
  const currentYear = years[0]; // newest year — open by default

  const filteredArticleCount = active
    ? filteredArchive.reduce(
        (sum, d) =>
          sum + d.allItems.filter((it) => it.companies?.includes(active)).length,
        0,
      )
    : totalArticlesAll;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          뉴스 아카이브
          {active && (
            <span className="ml-2 text-base sm:text-lg font-medium text-blue-700">
              · {active}
            </span>
          )}
        </h1>
        <p className="text-sm text-gray-600">
          {active ? (
            <>
              <span className="text-gray-900 font-medium">{active}</span>이(가)
              등장한 {filteredArchive.length.toLocaleString()}일 ·{" "}
              {filteredArticleCount.toLocaleString()}건 기사 (전체{" "}
              {totalDaysAll.toLocaleString()}일 중).
            </>
          ) : (
            <>
              매일 대표기사 1건씩 골라 영구 보존합니다. 총{" "}
              {totalDaysAll.toLocaleString()}일 ·{" "}
              {totalArticlesAll.toLocaleString()}건 기사.
            </>
          )}
        </p>
      </header>

      {/* Filter bar — server-rendered chips, no client JS */}
      <CompanyFilterBar
        companies={companyDayCounts}
        active={active}
        totalDays={totalDaysAll}
      />

      {/* Section 1: Calendar heatmap (hero, intentionally unfiltered) */}
      <section>
        <CalendarHeatmap archive={archive} days={365} />
      </section>

      {/* Section 2: Recent days list */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">
          {active ? `최근 ${active} 등장일` : "최근 30일"}
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-400">
            {active
              ? `${active}이(가) 등장한 아카이브 날짜가 없습니다.`
              : "아직 아카이브된 날짜가 없습니다."}
          </p>
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
          {active
            ? `${active}이(가) 등장한 월만 표시합니다.`
            : "연도를 클릭하면 해당 월 칩이 펼쳐집니다. 월을 클릭하면 그 달의 모든 날짜와 대표기사 목록을 볼 수 있습니다."}
        </p>
        {years.length === 0 ? (
          <p className="text-sm text-gray-400">해당 회사의 월별 데이터가 없습니다.</p>
        ) : (
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
                      // Note: month link does NOT carry the company filter
                      // forward — /archive/[YYYY-MM] is the unfiltered month
                      // view (different audience, different page). Adding a
                      // company-scoped month view would be a separate feature.
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
        )}
      </section>
    </div>
  );
}

/**
 * Given a filtered DailyArchive[], return the unique YYYY-MM strings present.
 * Used to drive the year-grouped month grid when a company filter is active.
 */
function deriveMonthsFromDays(
  days: ReturnType<typeof getDailyArchive>,
): string[] {
  const set = new Set<string>();
  for (const d of days) set.add(d.date.slice(0, 7));
  return Array.from(set);
}
