/**
 * "이번 주 인사이트" — 7-day rolling summary at the top of /news.
 *
 * Locked-in by /plan-eng-review 2026-04-17 (news-list-v2 plan cherry-pick #7).
 * Ground for TODO-009 (weekly newsletter) PMF — if this widget is what users
 * read first on /news, that's the signal we can monetize via email.
 *
 * Why "use client": recharts LineChart is a client component (uses ResizeObserver).
 * The aggregation itself is pure (computeWeeklyInsight in lib/news-utils) — we
 * pre-compute on the server and pass the result down so we don't ship 696 items
 * to the client just for the sparkline.
 *
 * Empty state: < 3 articles in the window → render nothing. Avoids "top 3
 * companies" off 1 article (misleading + worse than no widget).
 */
"use client";

import Link from "next/link";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import type { WeeklyInsight } from "@/lib/news-utils";

export interface WeeklyInsightWidgetProps {
  insight: WeeklyInsight | null;
}

export default function WeeklyInsightWidget({
  insight,
}: WeeklyInsightWidgetProps) {
  if (!insight) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm text-sm text-gray-400">
        지난 7일 데이터가 충분하지 않습니다.
      </div>
    );
  }

  const sparkData = insight.daily_counts.map((count, i) => ({ day: i, count }));
  const peak = Math.max(...insight.daily_counts);

  return (
    <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl border border-blue-100 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-blue-900">이번 주 인사이트</h2>
        <span className="text-xs text-blue-600">
          {insight.range[0]} – {insight.range[1]}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total + sparkline */}
        <div className="md:col-span-1">
          <p className="text-xs text-gray-500">총 기사</p>
          <p className="text-2xl font-bold text-gray-900">
            {insight.total_articles}
            <span className="text-sm text-gray-500 font-normal ml-1">건</span>
          </p>
          <div className="h-10 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <YAxis hide domain={[0, peak === 0 ? 1 : peak]} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top companies */}
        <div className="md:col-span-1">
          <p className="text-xs text-gray-500 mb-2">언급 Top 3 기업</p>
          {insight.top_companies.length === 0 ? (
            <p className="text-sm text-gray-400">
              회사 매칭 데이터가 아직 없습니다.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {insight.top_companies.map((c) => (
                <li
                  key={c.name}
                  className="flex items-center justify-between text-sm"
                >
                  <Link
                    href={`/news?company=${encodeURIComponent(c.name)}`}
                    className="text-gray-700 hover:text-blue-700 font-medium truncate"
                  >
                    {c.name}
                  </Link>
                  <span className="text-xs text-gray-500 ml-2 shrink-0">
                    {c.count}건
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Highlight */}
        <div className="md:col-span-1">
          <p className="text-xs text-gray-500 mb-2">주요 이벤트</p>
          {insight.highlight_headline ? (
            <p className="text-sm text-gray-700 leading-snug line-clamp-3">
              {insight.highlight_headline}
            </p>
          ) : (
            <p className="text-sm text-gray-400">
              주요 정책/사고 뉴스 없음.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
