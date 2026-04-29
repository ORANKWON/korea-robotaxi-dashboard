/**
 * "다른 비교" picker. Shows current pair + 2 dropdowns to swap either side.
 * Selecting a new value navigates to /vs/[a]/[b] (canonical lex order).
 *
 * Locked-in by trade-tool-v1 plan (Killer Feature B — flexible re-comparison
 * without going back to a homepage).
 *
 * Why client component: needs onChange handlers + router.push. The page
 * itself is server-rendered (SSG); this is a small interactivity island.
 *
 * Edge case: selecting the SAME company on both sides → keep the existing
 * other side, swap by selecting the original. We just refuse the no-op.
 */
"use client";

import { useRouter } from "next/navigation";
import type { Company } from "@/types";

export interface CompareSwitcherProps {
  /** All available companies (server-resolved) */
  companies: Company[];
  /** Current pair, lex-sorted */
  currentA: string;
  currentB: string;
}

export default function CompareSwitcher({
  companies,
  currentA,
  currentB,
}: CompareSwitcherProps) {
  const router = useRouter();

  function navigate(a: string, b: string) {
    if (a === b) return; // no-op
    const [x, y] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
    router.push(`/vs/${x}/${y}`);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <p className="text-xs text-gray-500 mb-2 font-medium">다른 비교</p>
      <div className="flex items-center gap-2">
        <select
          value={currentA}
          onChange={(e) => navigate(e.target.value, currentB)}
          className="flex-1 text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 bg-white"
          aria-label="A 기업 변경"
        >
          {companies.map((c) => (
            <option key={c.slug} value={c.slug} disabled={c.slug === currentB}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-gray-400 font-bold text-sm shrink-0">vs</span>
        <select
          value={currentB}
          onChange={(e) => navigate(currentA, e.target.value)}
          className="flex-1 text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 bg-white"
          aria-label="B 기업 변경"
        >
          {companies.map((c) => (
            <option key={c.slug} value={c.slug} disabled={c.slug === currentA}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
