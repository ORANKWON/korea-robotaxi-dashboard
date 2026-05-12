/**
 * /archive 회사별 필터 — chip bar.
 *
 * Server component. Each chip is a Link, no client JS needed. Active chip
 * styled differently so visual state matches URL state.
 *
 * Companies list comes from data/companies.json (canonical 10 + the user's
 * preferred order is preserved in the JSON file). "전체" reset chip first.
 *
 * Counts shown next to each company chip = total days this company appears
 * in. Pre-computed by parent so this stays a pure presentation component.
 *
 * Hidden when no company has any archive coverage (defensive — shouldn't
 * happen given backfill, but keeps the bar empty-state-clean).
 */
import Link from "next/link";

export interface CompanyFilterEntry {
  /** Canonical company name from companies.json (no trimming/aliasing). */
  name: string;
  /** Number of archived days where this company appears in any item. */
  dayCount: number;
}

export interface CompanyFilterBarProps {
  companies: CompanyFilterEntry[];
  /** Currently selected company name, or undefined when no filter active. */
  active?: string;
  /** Total day count for the unfiltered "전체" chip. */
  totalDays: number;
}

export default function CompanyFilterBar({
  companies,
  active,
  totalDays,
}: CompanyFilterBarProps) {
  // Don't render the bar if NO company has any coverage — covers the
  // pre-launch "empty corpus" case so the page doesn't show a useless row of
  // (0) chips.
  const anyCoverage = companies.some((c) => c.dayCount > 0);
  if (!anyCoverage) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
      <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">
        회사별 보기
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Chip href="/archive" label="전체" count={totalDays} active={!active} />
        {companies.map((c) => (
          <Chip
            key={c.name}
            href={`/archive?company=${encodeURIComponent(c.name)}`}
            label={c.name}
            count={c.dayCount}
            active={active === c.name}
            // 0-day companies render as disabled chips: visible (still in the
            // canonical companies list, so the user knows they exist) but
            // unclickable so the user doesn't navigate to an empty result.
            disabled={c.dayCount === 0}
          />
        ))}
      </div>
    </div>
  );
}

function Chip({
  href,
  label,
  count,
  active,
  disabled,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
  disabled?: boolean;
}) {
  const base = "text-xs px-3 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap";
  if (disabled) {
    return (
      <span
        className={`${base} bg-gray-50 text-gray-300`}
        aria-disabled="true"
        title={`${label} — 아카이브에 등장한 날 없음`}
      >
        {label} <span className="text-gray-300">·0</span>
      </span>
    );
  }
  if (active) {
    return (
      <span className={`${base} bg-blue-600 text-white`}>
        {label} <span className="text-blue-100">·{count}</span>
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={`${base} bg-gray-100 text-gray-700 hover:bg-blue-100 hover:text-blue-700`}
    >
      {label} <span className="text-gray-400">·{count}</span>
    </Link>
  );
}
