/**
 * /archive/[slug] — single dynamic route serving both per-day and per-month views.
 *
 * Locked-in by /plan-eng-review 2026-05-11 (D2-D13).
 *
 * Slug dispatch (D in plan):
 *   /^\d{4}-\d{2}-\d{2}$/ → DateView (e.g. /archive/2026-05-04)
 *   /^\d{4}-\d{2}$/       → MonthView (e.g. /archive/2026-05)
 *   else                  → notFound()
 *
 * Render guard (DoS prevention): regex pass alone isn't enough — corpus-bounds
 * check rejects valid-shape but corpus-missing dates (e.g. /archive/2099-01-01)
 * with notFound() before any heavy SSR work.
 *
 * SSG with ISR fallback: generateStaticParams returns all 511 known params at
 * build time. dynamicParams=true so future dates SSR on demand AFTER passing
 * the corpus-bounds guard. revalidate=21600 matches /news + /api/news.json.
 *
 * JSON-LD strategy (DateView only):
 *   - NewsArticle schema for the representative article
 *   - publisher.name = item.source ONLY when it doesn't look like a domain
 *     (D4: "v.daum.net" → omit, "한국경제" → include)
 *   - ItemList schema for all the day's articles
 *
 * og:title is capped at 100 chars total (headline truncated to 50 + ellipsis)
 * to stay within SEO best-practice limits.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getDailyArchive,
  getMonthlyArchive,
  type DailyArchive,
  type MonthlyArchive,
} from "@/lib/news-archive";
import { canonicalLink, tagClass } from "@/lib/news-utils";
import NewsCard from "@/components/news/NewsCard";

export const revalidate = 21600;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

interface PageParams {
  params: { slug: string };
}

export function generateStaticParams() {
  const dates = getDailyArchive().map((d) => ({ slug: d.date }));
  const months = getMonthlyArchive().map((m) => ({ slug: m.yearMonth }));
  return [...dates, ...months];
}

// ─── Metadata (regex-dispatched same as page render) ────────────────────────

export function generateMetadata({ params }: PageParams): Metadata {
  const { slug } = params;
  if (DATE_RE.test(slug)) {
    const day = getDailyArchive().find((d) => d.date === slug);
    if (!day || !day.representative) return { title: `${slug} 뉴스` };
    return dateMetadata(day);
  }
  if (MONTH_RE.test(slug)) {
    const month = getMonthlyArchive().find((m) => m.yearMonth === slug);
    if (!month) return { title: `${slug} 뉴스` };
    return monthMetadata(month);
  }
  return { title: "뉴스 아카이브" };
}

function dateMetadata(day: DailyArchive): Metadata {
  const rep = day.representative!;
  const truncated = rep.headline.length > 50
    ? rep.headline.slice(0, 50) + "…"
    : rep.headline;
  const title = `${day.date} 한국 로보택시 뉴스 — ${truncated}`;
  const desc = (rep.summary || rep.headline).slice(0, 157);
  const description = desc.length < (rep.summary || rep.headline).length
    ? desc + "…"
    : desc;
  return {
    title,
    description,
    alternates: { canonical: `/archive/${day.date}` },
    openGraph: {
      title,
      description,
      url: `/archive/${day.date}`,
      type: "article",
    },
    twitter: { card: "summary", title, description },
  };
}

function monthMetadata(month: MonthlyArchive): Metadata {
  const total = month.days.reduce((sum, d) => sum + d.allItems.length, 0);
  const title = `${month.yearMonth} 한국 로보택시 뉴스 월별 아카이브`;
  const description = `${month.yearMonth}: ${month.days.length}일, 총 ${total}건의 자율주행/로보택시 뉴스 대표기사 모음.`;
  return {
    title,
    description,
    alternates: { canonical: `/archive/${month.yearMonth}` },
    openGraph: { title, description, url: `/archive/${month.yearMonth}`, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

// ─── Page entry — regex dispatch + corpus-bounds guard ─────────────────────

export default function ArchiveSlugPage({ params }: PageParams) {
  const { slug } = params;

  if (DATE_RE.test(slug)) {
    const archive = getDailyArchive();
    const day = archive.find((d) => d.date === slug);
    if (!day) notFound();
    const idx = archive.indexOf(day);
    const newer = idx > 0 ? archive[idx - 1] : null; // archive sorted desc, so prev-index is newer
    const older = idx < archive.length - 1 ? archive[idx + 1] : null;
    return <DateView day={day} newer={newer} older={older} />;
  }

  if (MONTH_RE.test(slug)) {
    const months = getMonthlyArchive();
    const month = months.find((m) => m.yearMonth === slug);
    if (!month) notFound();
    const idx = months.indexOf(month);
    const newerMonth = idx > 0 ? months[idx - 1] : null;
    const olderMonth = idx < months.length - 1 ? months[idx + 1] : null;
    return <MonthView month={month} newer={newerMonth} older={olderMonth} />;
  }

  notFound();
}

// ─── DateView ──────────────────────────────────────────────────────────────

function DateView({
  day,
  newer,
  older,
}: {
  day: DailyArchive;
  newer: DailyArchive | null;
  older: DailyArchive | null;
}) {
  const rep = day.representative;
  const others = day.allItems.filter((it) => it !== rep);
  const openByDefault = day.allItems.length <= 5;

  return (
    <div className="space-y-6">
      {rep && <JsonLdNewsArticle day={day} />}
      <JsonLdItemList day={day} />

      {/* Breadcrumb + prev/next */}
      <nav className="flex items-center justify-between text-sm text-gray-500">
        <div>
          <Link href="/archive" className="hover:text-blue-600">
            아카이브
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 font-medium">{day.date}</span>
        </div>
        <div className="flex gap-2 text-xs">
          {newer && (
            <Link
              href={`/archive/${newer.date}`}
              className="hover:text-blue-700"
              title={newer.date}
            >
              ← {newer.date}
            </Link>
          )}
          {older && (
            <Link
              href={`/archive/${older.date}`}
              className="hover:text-blue-700"
              title={older.date}
            >
              {older.date} →
            </Link>
          )}
        </div>
      </nav>

      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold">{day.date} 뉴스</h1>
        <p className="text-sm text-gray-500 mt-1">
          {day.allItems.length}건의 한국 로보택시 뉴스 — 대표기사:{" "}
          {rep ? "아래" : "없음"}
        </p>
      </header>

      {/* Representative */}
      {rep && (
        <section>
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">
            대표기사
          </p>
          <NewsCard item={rep} mode="full" showBookmark={false} />
        </section>
      )}

      {/* Others (collapsible) */}
      {others.length > 0 && (
        <section>
          <details open={openByDefault} className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <summary className="px-5 py-3 cursor-pointer font-semibold text-gray-700 hover:bg-gray-50">
              그 날 전체 기사 {day.allItems.length}건
            </summary>
            <div className="divide-y divide-gray-100">
              {others.map((it) => (
                <NewsCard
                  key={canonicalLink(it)}
                  item={it}
                  mode="compact"
                  showBookmark={false}
                />
              ))}
            </div>
          </details>
        </section>
      )}

      {/* Companies that day */}
      {Object.keys(day.companyMentions).length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            그 날 언급된 기업
          </h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(day.companyMentions)
              .sort((a, b) => b[1] - a[1])
              .map(([name, count]) => (
                <span
                  key={name}
                  className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700"
                >
                  {name} <span className="text-gray-400">·{count}</span>
                </span>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── MonthView ─────────────────────────────────────────────────────────────

function MonthView({
  month,
  newer,
  older,
}: {
  month: MonthlyArchive;
  newer: MonthlyArchive | null;
  older: MonthlyArchive | null;
}) {
  const total = month.days.reduce((sum, d) => sum + d.allItems.length, 0);
  // Top 3 companies across the month
  const companyTotals: Record<string, number> = {};
  for (const day of month.days) {
    for (const [c, n] of Object.entries(day.companyMentions)) {
      companyTotals[c] = (companyTotals[c] ?? 0) + n;
    }
  }
  const topCompanies = Object.entries(companyTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Breadcrumb + prev/next */}
      <nav className="flex items-center justify-between text-sm text-gray-500">
        <div>
          <Link href="/archive" className="hover:text-blue-600">
            아카이브
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 font-medium">{month.yearMonth}</span>
        </div>
        <div className="flex gap-2 text-xs">
          {newer && (
            <Link href={`/archive/${newer.yearMonth}`} className="hover:text-blue-700">
              ← {newer.yearMonth}
            </Link>
          )}
          {older && (
            <Link href={`/archive/${older.yearMonth}`} className="hover:text-blue-700">
              {older.yearMonth} →
            </Link>
          )}
        </div>
      </nav>

      <header>
        <h1 className="text-2xl font-bold">{month.yearMonth} 뉴스 아카이브</h1>
        <p className="text-sm text-gray-500 mt-1">
          {month.days.length}일 · 총 {total}건
          {topCompanies.length > 0 && (
            <> · Top: {topCompanies.map(([c, n]) => `${c}(${n})`).join(", ")}</>
          )}
        </p>
      </header>

      <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="text-left px-5 py-3">일자</th>
              <th className="text-left px-5 py-3">대표기사</th>
              <th className="text-right px-5 py-3">건수</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {month.days.map((day) => (
              <tr key={day.date} className="hover:bg-gray-50">
                <td className="px-5 py-3 text-sm text-gray-700 align-top whitespace-nowrap">
                  <Link
                    href={`/archive/${day.date}`}
                    className="font-medium hover:text-blue-700"
                  >
                    {day.date}
                  </Link>
                </td>
                <td className="px-5 py-3 text-sm text-gray-700">
                  {day.representative ? (
                    <Link
                      href={`/archive/${day.date}`}
                      className="hover:text-blue-700 line-clamp-2"
                    >
                      {day.representative.headline}
                    </Link>
                  ) : (
                    <span className="text-gray-400">대표기사 없음</span>
                  )}
                  {day.representative?.tags[0] && (
                    <span
                      className={`inline-block ml-2 text-xs px-2 py-0.5 rounded-full ${tagClass(day.representative.tags[0])}`}
                    >
                      {day.representative.tags[0]}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-sm text-gray-500 text-right tabular-nums">
                  {day.allItems.length}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ─── JSON-LD ───────────────────────────────────────────────────────────────

/**
 * D4: domain-shape detection for `publisher` field. NewsItem.source is sometimes
 * a portal redirect domain like "v.daum.net" — that's bad for Google rich
 * results, which want an Organization name like "한국경제". Heuristic:
 * dot-separated TLD-like string → omit. Otherwise → include.
 */
function looksLikeDomain(source: string): boolean {
  return /\.[a-z]{2,}/i.test(source);
}

function JsonLdNewsArticle({ day }: { day: DailyArchive }) {
  const rep = day.representative!;
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: rep.headline,
    datePublished: rep.published_at,
    url: canonicalLink(rep),
    mainEntityOfPage: `/archive/${day.date}`,
    inLanguage: "ko",
  };
  if (rep.source && !looksLikeDomain(rep.source)) {
    ld.publisher = { "@type": "Organization", name: rep.source };
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
    />
  );
}

function JsonLdItemList({ day }: { day: DailyArchive }) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${day.date} 한국 로보택시 뉴스`,
    itemListElement: day.allItems.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: canonicalLink(it),
      name: it.headline,
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
    />
  );
}
