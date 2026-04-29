/**
 * Side-by-side company comparison. Pure render — caller passes both Company
 * objects in canonical order (a.slug < b.slug lex).
 *
 * Locked-in by trade-tool-v1 plan (Killer Feature B). Shape designed for the
 * 1순위 user (PM/엔지니어/애널리스트): stat-by-stat parallel rows, "winner"
 * highlight on the side with the bigger number, zone overlap badge, link
 * to each company's /company/[id] for the full story.
 *
 * Why "winner highlighting" over a 표/diff view: the user said the killer
 * usage is "본인 회사 vs 경쟁사 일상 비교". Highlighting the larger number
 * makes the question "are we ahead on funding/fleet?" answerable at a glance.
 *
 * Server component — pure render, no interactivity. The "다른 비교" picker
 * below is a separate client component (CompareSwitcher).
 */
import Link from "next/link";
import type { Company } from "@/types";
import BookmarkButton from "@/components/BookmarkButton";

export interface ComparisonViewProps {
  a: Company;
  b: Company;
}

interface NumericMetric {
  label: string;
  /** Pulled from each Company; null/undefined if missing. */
  get: (c: Company) => number | null | undefined;
  /** Format the value for display (already-formatted string). */
  fmt: (v: number) => string;
  /** Higher is better (most metrics)? Used to pick the "winner" side. */
  higherIsBetter?: boolean;
}

const METRICS: NumericMetric[] = [
  {
    label: "SAE Level",
    get: (c) => c.level,
    fmt: (v) => `Level ${v}`,
    higherIsBetter: true,
  },
  {
    label: "차량 규모",
    get: (c) => c.fleet_size,
    fmt: (v) => `${v.toLocaleString("ko-KR")}대`,
    higherIsBetter: true,
  },
  {
    label: "누적 투자",
    get: (c) => c.total_funding_krw,
    fmt: (v) => (v >= 10000 ? `${(v / 10000).toFixed(1)}조원` : `${v}억원`),
    higherIsBetter: true,
  },
  {
    label: "운행 구역 수",
    get: (c) => c.zones.length,
    fmt: (v) => `${v}개`,
    higherIsBetter: true,
  },
  {
    label: "설립년도",
    get: (c) => c.founded_year,
    fmt: (v) => `${v}년`,
    higherIsBetter: false, // older = more established, but not strictly better
  },
];

export default function ComparisonView({ a, b }: ComparisonViewProps) {
  const aZones = new Set(a.zones);
  const bZones = new Set(b.zones);
  const sharedZones = a.zones.filter((z) => bZones.has(z));
  const aOnly = a.zones.filter((z) => !bZones.has(z));
  const bOnly = b.zones.filter((z) => !aZones.has(z));

  return (
    <div className="space-y-6">
      {/* Header — two company name cards */}
      <div className="grid grid-cols-2 gap-4">
        <CompanyHeaderCard company={a} />
        <CompanyHeaderCard company={b} />
      </div>

      {/* Numeric metrics table */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="font-semibold text-gray-900">스펙 비교</h2>
        </div>
        <table className="w-full">
          <tbody>
            {METRICS.map((m) => (
              <MetricRow key={m.label} metric={m} a={a} b={b} />
            ))}
          </tbody>
        </table>
      </section>

      {/* Zone overlap */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="font-semibold text-gray-900 mb-3">운행 구역 비교</h2>
        {sharedZones.length === 0 && aOnly.length === 0 && bOnly.length === 0 ? (
          <p className="text-sm text-gray-400">두 기업 모두 공개된 운행 구역이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <ZoneColumn label={`${a.name}만`} zones={aOnly} tone="blue" />
            <ZoneColumn label="공통 구역" zones={sharedZones} tone="green" emphasized />
            <ZoneColumn label={`${b.name}만`} zones={bOnly} tone="purple" />
          </div>
        )}
      </section>

      {/* Vehicle / partner / commercialize_date */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="font-semibold text-gray-900">현황</h2>
        </div>
        <table className="w-full">
          <tbody>
            <TextRow label="상태" a={a.status} b={b.status} />
            <TextRow label="차량 모델" a={a.vehicle_model} b={b.vehicle_model} />
            <TextRow label="파트너" a={a.partner} b={b.partner} />
            <TextRow
              label="상용화"
              a={a.commercialize_date || "미정"}
              b={b.commercialize_date || "미정"}
            />
          </tbody>
        </table>
      </section>

      {/* Key milestone + notes */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NarrativeCard company={a} />
        <NarrativeCard company={b} />
      </section>
    </div>
  );
}

function CompanyHeaderCard({ company }: { company: Company }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/company/${company.id}`}
          className="group inline-block hover:text-blue-700 transition-colors min-w-0"
        >
          <h1 className="text-xl font-bold leading-tight group-hover:underline">
            {company.name}
          </h1>
        </Link>
        {company.slug && (
          <BookmarkButton
            namespace="companies"
            bookmarkId={company.slug}
            className="shrink-0"
          />
        )}
      </div>
      <p className="text-sm text-gray-500 mt-1">{company.partner}</p>
      <span
        className={`inline-block mt-3 text-xs font-medium px-2.5 py-0.5 rounded-full ${
          company.status === "시범운행" || company.status === "운행 중"
            ? "bg-green-100 text-green-700"
            : company.status === "시험운행"
              ? "bg-blue-100 text-blue-700"
              : "bg-yellow-100 text-yellow-700"
        }`}
      >
        {company.status}
      </span>
    </div>
  );
}

function MetricRow({
  metric,
  a,
  b,
}: {
  metric: NumericMetric;
  a: Company;
  b: Company;
}) {
  const va = metric.get(a);
  const vb = metric.get(b);
  // Winner only when both sides have a number AND they differ AND we're
  // comparing a "higherIsBetter" metric. Otherwise neutral display.
  let winner: "a" | "b" | null = null;
  if (
    metric.higherIsBetter &&
    typeof va === "number" &&
    typeof vb === "number" &&
    va !== vb
  ) {
    winner = va > vb ? "a" : "b";
  }
  return (
    <tr className="border-b border-gray-100 last:border-b-0">
      <td
        className={
          "px-5 py-3 text-right text-sm tabular-nums " +
          (winner === "a" ? "font-bold text-blue-700" : "text-gray-700")
        }
      >
        {typeof va === "number" ? metric.fmt(va) : "—"}
      </td>
      <td className="px-2 py-3 text-center text-xs text-gray-400 font-medium uppercase tracking-wider w-32">
        {metric.label}
      </td>
      <td
        className={
          "px-5 py-3 text-left text-sm tabular-nums " +
          (winner === "b" ? "font-bold text-blue-700" : "text-gray-700")
        }
      >
        {typeof vb === "number" ? metric.fmt(vb) : "—"}
      </td>
    </tr>
  );
}

function TextRow({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <tr className="border-b border-gray-100 last:border-b-0">
      <td className="px-5 py-3 text-right text-sm text-gray-700">{a}</td>
      <td className="px-2 py-3 text-center text-xs text-gray-400 font-medium uppercase tracking-wider w-32">
        {label}
      </td>
      <td className="px-5 py-3 text-left text-sm text-gray-700">{b}</td>
    </tr>
  );
}

function ZoneColumn({
  label,
  zones,
  tone,
  emphasized,
}: {
  label: string;
  zones: string[];
  tone: "blue" | "purple" | "green";
  emphasized?: boolean;
}) {
  const toneCls = {
    blue: "text-blue-700 bg-blue-50",
    purple: "text-purple-700 bg-purple-50",
    green: "text-green-700 bg-green-50",
  }[tone];
  return (
    <div>
      <p
        className={
          "text-xs font-medium mb-2 " +
          (emphasized ? "text-green-700" : "text-gray-500")
        }
      >
        {label} ({zones.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {zones.length === 0 ? (
          <span className="text-xs text-gray-300">—</span>
        ) : (
          zones.map((z) => (
            <span key={z} className={`text-xs px-2 py-0.5 rounded-full ${toneCls}`}>
              {z}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function NarrativeCard({ company }: { company: Company }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">
        {company.name}
      </p>
      {company.key_milestone && (
        <p className="text-sm font-semibold text-blue-800 mt-2 leading-snug">
          {company.key_milestone}
        </p>
      )}
      <p className="text-sm text-gray-600 mt-3 leading-relaxed line-clamp-6">
        {company.notes}
      </p>
      <Link
        href={`/company/${company.id}`}
        className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-3 inline-block"
      >
        자세히 보기 →
      </Link>
    </div>
  );
}
