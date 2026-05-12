/**
 * One day's archive entry card. Used on /archive index (RecentDays list) and
 * inside MonthView. Click → /archive/[date].
 *
 * Locked-in by /plan-eng-review 2026-05-11 D8 (semantics):
 *   - "외 N건" badge: N = allItems.length - 1 (대표 제외).
 *   - 1-article day: badge hidden.
 *   - companies chips: top 3 of representative.companies (display only).
 *
 * Server component — no client state, just a Link wrapper.
 */
import Link from "next/link";
import type { DailyArchive } from "@/lib/news-archive";
import { tagClass } from "@/lib/news-utils";

const KO_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function formatDateKo(date: string): string {
  // date = "YYYY-MM-DD" KST. Local construction of weekday is OK because we
  // only need day-of-week, not absolute time. Construct as KST midnight by
  // appending the +09:00 offset.
  const d = new Date(`${date}T00:00:00+09:00`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  // Get KST weekday: KST 00:00 = UTC 15:00 prev day, but Date constructed
  // with +09:00 offset yields the right Korean weekday via getUTCDay() since
  // the underlying UTC instant is correct.
  const weekdayIdx = new Date(`${date}T12:00:00+09:00`).getUTCDay();
  return `${y}.${m}.${day} (${KO_WEEKDAYS[weekdayIdx]})`;
}

export interface ArchiveCardProps {
  archive: DailyArchive;
}

export default function ArchiveCard({ archive }: ArchiveCardProps) {
  const rep = archive.representative;
  const others = archive.allItems.length - 1; // exclude rep itself
  const companies = rep?.companies?.slice(0, 3) ?? [];

  return (
    <Link
      href={`/archive/${archive.date}`}
      className="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:border-blue-300 hover:shadow transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500 font-medium">
            {formatDateKo(archive.date)}
          </p>
          {rep ? (
            <h3 className="font-semibold text-sm leading-snug line-clamp-2 mt-1">
              {rep.headline}
            </h3>
          ) : (
            <p className="text-sm text-gray-400 mt-1">대표기사 없음</p>
          )}
          {companies.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {companies.map((c) => (
                <span
                  key={c}
                  className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        {others > 0 && (
          <span className="text-xs text-gray-400 shrink-0 mt-1">
            외 {others}건
          </span>
        )}
        {rep && rep.tags[0] && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${tagClass(rep.tags[0])}`}
          >
            {rep.tags[0]}
          </span>
        )}
      </div>
    </Link>
  );
}
