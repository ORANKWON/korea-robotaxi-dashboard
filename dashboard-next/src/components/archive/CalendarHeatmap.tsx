/**
 * GitHub-style contribution heatmap. 53 weeks × 7 days. Click a day → /archive/[date].
 *
 * Locked-in by /plan-eng-review 2026-05-11:
 *   - D12: 5-bucket log scale (1-2 / 3-7 / 8-20 / 21-50 / 51+) matches the
 *     real corpus distribution (median 7, peak 158). Original 4-bucket plan
 *     would flatten the high end and hide "광주 발표" days.
 *   - Reviewer Concerns: 0건 cells are <a aria-disabled> + tabIndex=-1 +
 *     pointer-events-none — keyboard tab order stays consistent across
 *     the grid (vs mixing <div> for empty cells).
 *
 * Server-renderable. No client interactivity beyond Link click.
 *
 * Mobile (<768px): horizontal scroll container with the most recent week
 * aligned to the right edge.
 */
import Link from "next/link";
import type { DailyArchive } from "@/lib/news-archive";
import { heatmapBucket } from "@/lib/news-archive";
import { toKSTDate } from "@/lib/news-utils";

const BUCKET_COLORS: Record<number, string> = {
  0: "bg-gray-100",
  1: "bg-blue-200",
  2: "bg-blue-300",
  3: "bg-blue-500",
  4: "bg-blue-700",
  5: "bg-blue-900",
};

export interface CalendarHeatmapProps {
  /** Sorted desc by date. Component slices to the most recent N days. */
  archive: DailyArchive[];
  /** How many days back from today to render. Default 365. */
  days?: number;
}

interface Cell {
  date: string; // YYYY-MM-DD KST
  count: number;
  bucket: 0 | 1 | 2 | 3 | 4 | 5;
}

/**
 * Build a complete N-day grid (oldest→newest) including 0-count days. Pad
 * the leading week so day-of-week alignment is consistent.
 */
function buildCells(archive: DailyArchive[], days: number): Cell[] {
  // Index archive by date for O(1) lookup.
  const byDate = new Map<string, DailyArchive>();
  for (const day of archive) byDate.set(day.date, day);

  const today = toKSTDate(new Date().toISOString());
  if (!today) return [];
  // Walk back `days` from today (KST), inclusive of today.
  const cells: Cell[] = [];
  const todayMs = new Date(`${today}T00:00:00+09:00`).getTime();
  for (let i = days - 1; i >= 0; i--) {
    const ms = todayMs - i * 86400000;
    const date = toKSTDate(new Date(ms).toISOString());
    if (!date) continue;
    const day = byDate.get(date);
    const count = day?.allItems.length ?? 0;
    cells.push({ date, count, bucket: heatmapBucket(count) });
  }
  return cells;
}

export default function CalendarHeatmap({
  archive,
  days = 365,
}: CalendarHeatmapProps) {
  const cells = buildCells(archive, days);

  // Group into weeks. Week starts Sunday (matches GitHub).
  // Use the first cell's day-of-week to determine leading padding.
  const firstCellDate = cells[0]?.date;
  if (!firstCellDate) return null;
  const firstDow = new Date(`${firstCellDate}T12:00:00+09:00`).getUTCDay();
  const padded: (Cell | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...cells,
  ];
  // Pad trailing to fill the last week.
  while (padded.length % 7 !== 0) padded.push(null);

  const weeks: (Cell | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7));
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">
          최근 {days}일 활동
        </h2>
        <Legend />
      </div>
      <div className="overflow-x-auto" style={{ direction: "rtl" }}>
        {/* RTL container makes the most recent week align to the right on mobile.
            Inner grid uses LTR so day-of-week labels still read normally. */}
        <div className="inline-grid grid-flow-col gap-[3px]" style={{ direction: "ltr" }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-rows-7 gap-[3px]">
              {week.map((cell, di) =>
                cell === null ? (
                  <div key={di} className="w-3 h-3" />
                ) : (
                  <HeatCell key={di} cell={cell} />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-gray-400">
        주: 일요일 시작 · 색이 진할수록 그날 기사 많음 · 가로 스크롤 가능
      </p>
    </div>
  );
}

function HeatCell({ cell }: { cell: Cell }) {
  const color = BUCKET_COLORS[cell.bucket];
  const label = `${cell.date}, ${cell.count}건`;
  if (cell.bucket === 0) {
    return (
      <a
        aria-label={label}
        aria-disabled="true"
        tabIndex={-1}
        className={`w-3 h-3 rounded-sm ${color} pointer-events-none`}
      >
        <title>{label}</title>
      </a>
    );
  }
  return (
    <Link
      href={`/archive/${cell.date}`}
      aria-label={label}
      title={label}
      className={`w-3 h-3 rounded-sm ${color} hover:ring-2 hover:ring-blue-400 hover:ring-offset-1 transition-all`}
    />
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-1 text-xs text-gray-500">
      <span>적음</span>
      {[0, 1, 2, 3, 4, 5].map((b) => (
        <span
          key={b}
          className={`w-3 h-3 rounded-sm ${BUCKET_COLORS[b]}`}
          aria-hidden
        />
      ))}
      <span>많음</span>
    </div>
  );
}
