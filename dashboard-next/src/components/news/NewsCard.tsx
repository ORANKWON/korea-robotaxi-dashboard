/**
 * Single news card. Used by NewsList (full mode) and the homepage / company
 * RelatedNews section (compact mode).
 *
 * Locked-in by /plan-eng-review 2026-04-17 (news-list-v2 plan Phase 3).
 *
 * Why "use client": needs onClick handlers for bookmark + read marking.
 * The card itself is a render-only component — bookmark/read state come
 * from the parent (NewsList owns the localStorage hook so all cards share
 * one subscription).
 *
 * Three modes:
 *   - "full" (default): summary line + bookmark icon + tags row
 *   - "compact": no summary, smaller padding (homepage + RelatedNews)
 */
"use client";

import Link from "next/link";
import type { NewsItem } from "@/types";
import {
  canonicalLink,
  formatRelativeKo,
  newsKey,
  tagClass,
} from "@/lib/news-utils";

export interface NewsCardProps {
  item: NewsItem;
  mode?: "full" | "compact";
  isRead?: boolean;
  isBookmarked?: boolean;
  onMarkRead?: (key: string) => void;
  onToggleBookmark?: (key: string) => void;
  /** Hide bookmark icon entirely (compact mode + pre-hydration). */
  showBookmark?: boolean;
}

export default function NewsCard({
  item,
  mode = "full",
  isRead = false,
  isBookmarked = false,
  onMarkRead,
  onToggleBookmark,
  showBookmark = true,
}: NewsCardProps) {
  const href = canonicalLink(item);
  const key = newsKey(item);
  const isCompact = mode === "compact";

  function handleClick() {
    if (onMarkRead && !isRead) onMarkRead(key);
  }

  function handleBookmark(e: React.MouseEvent) {
    // Prevent the outer <a> from navigating — bookmark is a side action
    e.preventDefault();
    e.stopPropagation();
    onToggleBookmark?.(key);
  }

  // Use Next Link if it's an internal route; external for publisher URLs
  const isExternal = /^https?:/.test(href);

  const containerCls = [
    "group block bg-white rounded-lg border border-gray-200 shadow-sm",
    "hover:border-blue-300 hover:shadow transition-all",
    isCompact ? "p-3" : "p-4",
    isRead ? "opacity-60" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Same body for both branches — declared once to keep things DRY.
  const body = (
    <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className={
              isCompact
                ? "font-medium text-sm leading-snug line-clamp-2"
                : "font-semibold text-base leading-snug line-clamp-2"
            }
          >
            {item.headline}
          </h3>

          {!isCompact && item.summary && item.summary !== item.headline && (
            <p className="text-sm text-gray-600 mt-1.5 line-clamp-2 leading-relaxed">
              {item.summary}
            </p>
          )}

          <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 flex-wrap">
            <span className="font-medium text-gray-700">{item.source}</span>
            <span aria-hidden>·</span>
            <time
              dateTime={item.published_at}
              title={new Date(item.published_at).toLocaleString("ko-KR")}
            >
              {formatRelativeKo(item.published_at)}
            </time>
            {!isCompact && item.companies && item.companies.length > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="text-gray-600">
                  {item.companies.slice(0, 3).join(", ")}
                  {item.companies.length > 3 && ` 외 ${item.companies.length - 3}`}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-start gap-1.5 shrink-0">
          {!isCompact && showBookmark && onToggleBookmark && (
            <button
              type="button"
              onClick={handleBookmark}
              aria-label={isBookmarked ? "북마크 해제" : "북마크 추가"}
              aria-pressed={isBookmarked}
              className={
                "rounded-md p-1 -m-1 text-lg leading-none transition-colors " +
                (isBookmarked
                  ? "text-yellow-500 hover:text-yellow-600"
                  : "text-gray-300 hover:text-yellow-500")
              }
            >
              {isBookmarked ? "★" : "☆"}
            </button>
          )}
          <div className="flex flex-wrap gap-1 justify-end max-w-[140px]">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className={`text-xs px-2 py-0.5 rounded-full ${tagClass(tag)}`}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
  );

  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={containerCls}
        onClick={handleClick}
      >
        {body}
      </a>
    );
  }
  return (
    <Link href={href} className={containerCls} onClick={handleClick}>
      {body}
    </Link>
  );
}
