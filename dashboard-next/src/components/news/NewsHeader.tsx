/**
 * /news page header: title + RSS subscribe + JSON/CSV download.
 *
 * Locked-in by /plan-eng-review 2026-04-17 (news-list-v2 plan Phase 3).
 *
 * Why these three formats: matches our 1-순위 user (PM/엔지니어/애널리스트).
 *   - RSS for Feedly/Inoreader subscribers (the recurring-eyeballs pattern)
 *   - JSON for engineers building dashboards on top of our data
 *   - CSV for analysts dumping into Excel/Sheets for reports
 *
 * Server-renderable — pure markup, no client state needed.
 */
import type { ReactNode } from "react";

export interface NewsHeaderProps {
  total: number;
}

export default function NewsHeader({ total }: NewsHeaderProps) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">뉴스</h1>
        <p className="text-sm text-gray-500 mt-1">
          한국 자율주행/로보택시 관련 뉴스 {total.toLocaleString("ko-KR")}건
          (6시간마다 갱신).
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <DownloadLink
          href="/feed.xml"
          label="RSS"
          icon={<RssIcon />}
          tone="orange"
        />
        <DownloadLink href="/api/news.json" label="JSON" tone="blue" />
        <DownloadLink href="/api/news.csv" label="CSV" tone="green" download />
      </div>
    </header>
  );
}

function DownloadLink({
  href,
  label,
  icon,
  tone,
  download,
}: {
  href: string;
  label: string;
  icon?: ReactNode;
  tone: "orange" | "blue" | "green";
  download?: boolean;
}) {
  const toneCls: Record<typeof tone, string> = {
    orange: "border-orange-200 text-orange-700 hover:bg-orange-50",
    blue: "border-blue-200 text-blue-700 hover:bg-blue-50",
    green: "border-green-200 text-green-700 hover:bg-green-50",
  };
  return (
    <a
      href={href}
      {...(download ? { download: "" } : {})}
      target={download ? undefined : "_blank"}
      rel={download ? undefined : "noopener noreferrer"}
      className={
        "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors " +
        toneCls[tone]
      }
    >
      {icon}
      {label}
    </a>
  );
}

function RssIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 11a9 9 0 0 1 9 9" />
      <path d="M4 4a16 16 0 0 1 16 16" />
      <circle cx="5" cy="19" r="1" />
    </svg>
  );
}
