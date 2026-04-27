/**
 * Paginated, bookmark-aware news list. Owns the localStorage read/bookmark
 * sets so all child cards share one subscription.
 *
 * Locked-in by /plan-eng-review 2026-04-17 (news-list-v2 plan Phase 3+4).
 *
 * Pagination contract:
 *   - 50 items / page (PAGE_SIZE)
 *   - Page number is driven by the `page` URL param via `currentPage` prop;
 *     this component is otherwise URL-agnostic
 *   - "읽은 뉴스 숨기기" filter applies BEFORE pagination so page counts
 *     reflect the visible set, not the unfiltered set
 *   - Empty state on filter mismatch shows the "필터 초기화" affordance via
 *     onClearFilters callback (parent owns filter state, parent clears)
 *
 * The page bar shows: < 1 2 … 14 > with current page highlighted. We always
 * render first/last + a 2-page window around current to keep mobile compact.
 */
"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { NewsItem } from "@/types";
import NewsCard from "./NewsCard";
import { useLocalStorageSet } from "@/lib/use-local-storage";
import { newsKey } from "@/lib/news-utils";

export const PAGE_SIZE = 50;

export interface NewsListProps {
  items: NewsItem[];
  currentPage: number;
  hideRead: boolean;
  /** Returns the URL for a given page (for prev/next/numbered links). */
  pageHref: (page: number) => string;
  /** Called when user hits "필터 초기화" on the empty state. */
  onClearFilters?: () => void;
}

export default function NewsList({
  items,
  currentPage,
  hideRead,
  pageHref,
  onClearFilters,
}: NewsListProps) {
  // We intentionally drop the raw Set in slot 0 — we only need the helpers.
  // `isRead` / `isBookmarked` get fresh identities each render (the hook
  // rebuilds `has` per snapshot), so memo deps below correctly re-run when
  // localStorage changes.
  const [, toggleRead, isRead, readHydrated] = useLocalStorageSet(
    "kr-robotaxi:news:read",
  );
  const [, toggleBookmark, isBookmarked, bookmarkHydrated] = useLocalStorageSet(
    "kr-robotaxi:news:bookmarks",
  );

  // Apply hideRead BEFORE pagination so page counts make sense
  const visible = useMemo(() => {
    if (!hideRead || !readHydrated) return items;
    return items.filter((it) => !isRead(newsKey(it)));
  }, [items, hideRead, readHydrated, isRead]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageItems = visible.slice(start, start + PAGE_SIZE);

  if (visible.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-gray-500 mb-4">
          {hideRead
            ? "읽지 않은 뉴스가 없습니다."
            : "조건에 맞는 뉴스가 없습니다."}
        </p>
        {onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            필터 초기화
          </button>
        )}
      </div>
    );
  }

  // Bookmark icons must wait for hydration, otherwise we'd flash empty stars.
  // Read state can render with the SSR fallback (false) — visually neutral.
  const showBookmarks = bookmarkHydrated;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {pageItems.map((it) => {
          const k = newsKey(it);
          return (
            <NewsCard
              key={k}
              item={it}
              mode="full"
              isRead={readHydrated && isRead(k)}
              isBookmarked={showBookmarks && isBookmarked(k)}
              onMarkRead={toggleRead}
              onToggleBookmark={toggleBookmark}
              showBookmark={showBookmarks}
            />
          );
        })}
      </div>

      <Pagination
        currentPage={safePage}
        totalPages={totalPages}
        pageHref={pageHref}
        totalItems={visible.length}
      />
    </div>
  );
}

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageHref: (page: number) => string;
  totalItems: number;
}

function Pagination({
  currentPage,
  totalPages,
  pageHref,
  totalItems,
}: PaginationProps) {
  if (totalPages <= 1) {
    return (
      <p className="text-xs text-gray-400 text-center pt-2">
        총 {totalItems}건
      </p>
    );
  }

  // Pages to show: first, last, ±1 around current. Insert ellipsis between
  // non-contiguous slots. Keeps mobile compact even with 14+ pages.
  const visible = new Set<number>([
    1,
    totalPages,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ]);
  const pages = Array.from(visible)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  return (
    <nav
      className="flex items-center justify-center gap-1 pt-2"
      aria-label="페이지네이션"
    >
      <PageLink
        page={currentPage - 1}
        disabled={currentPage <= 1}
        pageHref={pageHref}
        label="이전"
      />
      {pages.map((p, i) => (
        <span key={p} className="contents">
          {i > 0 && pages[i - 1] !== p - 1 && (
            <span className="px-1 text-gray-400 text-sm">…</span>
          )}
          <Link
            href={pageHref(p)}
            aria-current={p === currentPage ? "page" : undefined}
            className={
              "min-w-[2rem] px-2 py-1 text-sm rounded-md text-center transition-colors " +
              (p === currentPage
                ? "bg-blue-600 text-white font-medium"
                : "text-gray-600 hover:bg-gray-100")
            }
          >
            {p}
          </Link>
        </span>
      ))}
      <PageLink
        page={currentPage + 1}
        disabled={currentPage >= totalPages}
        pageHref={pageHref}
        label="다음"
      />
      <span className="ml-3 text-xs text-gray-400">
        총 {totalItems}건
      </span>
    </nav>
  );
}

function PageLink({
  page,
  disabled,
  pageHref,
  label,
}: {
  page: number;
  disabled: boolean;
  pageHref: (page: number) => string;
  label: string;
}) {
  const cls =
    "px-2 py-1 text-sm rounded-md transition-colors " +
    (disabled
      ? "text-gray-300 cursor-not-allowed"
      : "text-gray-600 hover:bg-gray-100");
  if (disabled) {
    return (
      <span className={cls} aria-disabled>
        {label}
      </span>
    );
  }
  return (
    <Link href={pageHref(page)} className={cls}>
      {label}
    </Link>
  );
}
