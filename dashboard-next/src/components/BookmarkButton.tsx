/**
 * Reusable ☆/★ bookmark toggle. Backed by useLocalStorageSet.
 *
 * Locked-in by trade-tool-v1 plan (Killer Feature #5 — bookmark anywhere,
 * see them all at /my).
 *
 * Generic over the bookmark namespace (news vs company) so the same UI
 * works on company cards, /company/[id] headers, /vs/[a]/[b] headers, and
 * news cards (though news still uses the inline ☆ in NewsCard for now —
 * this component is the new shared one for non-news entities).
 *
 * Hydration: hide the icon until the localStorage hook reports `hydrated`,
 * otherwise SSR renders ☆ and client renders ★ → React mismatch warning.
 * Same pattern as NewsCard's bookmark.
 *
 * Variants:
 *   - "icon-only" (default): just the star, no label. For card corners.
 *   - "with-label": "★ 북마크됨" / "☆ 북마크" text alongside. For headers.
 */
"use client";

import { useLocalStorageSet } from "@/lib/use-local-storage";

export type BookmarkNamespace = "news" | "companies";

const STORAGE_KEY: Record<BookmarkNamespace, string> = {
  news: "kr-robotaxi:news:bookmarks",
  companies: "kr-robotaxi:companies:bookmarks",
};

export interface BookmarkButtonProps {
  /** Which bookmark store. */
  namespace: BookmarkNamespace;
  /** Stable id for the bookmarked entity (slug for companies, canonical URL
   *  for news). Used as the localStorage Set member. */
  bookmarkId: string;
  /** Display variant. Defaults to "icon-only". */
  variant?: "icon-only" | "with-label";
  /** Optional className for the wrapper. */
  className?: string;
  /** ARIA label override. Defaults to a sensible Korean string. */
  ariaLabel?: string;
}

export default function BookmarkButton({
  namespace,
  bookmarkId,
  variant = "icon-only",
  className = "",
  ariaLabel,
}: BookmarkButtonProps) {
  const [, toggle, has, hydrated] = useLocalStorageSet(STORAGE_KEY[namespace]);
  // Pre-hydration: render a placeholder so layout doesn't shift, but no
  // bookmark glyph (avoids ☆ → ★ flash + hydration mismatch).
  if (!hydrated) {
    return (
      <span
        className={
          (variant === "icon-only"
            ? "inline-block w-7 h-7"
            : "inline-block w-20 h-7") + " " + className
        }
        aria-hidden
      />
    );
  }

  const bookmarked = has(bookmarkId);
  const label = ariaLabel ?? (bookmarked ? "북마크 해제" : "북마크 추가");

  if (variant === "with-label") {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle(bookmarkId);
        }}
        aria-pressed={bookmarked}
        aria-label={label}
        className={
          "inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md border transition-colors " +
          (bookmarked
            ? "border-yellow-300 text-yellow-700 bg-yellow-50 hover:bg-yellow-100"
            : "border-gray-200 text-gray-600 hover:border-yellow-300 hover:text-yellow-700 hover:bg-yellow-50") +
          " " +
          className
        }
      >
        <span className="text-base leading-none" aria-hidden>
          {bookmarked ? "★" : "☆"}
        </span>
        {bookmarked ? "북마크됨" : "북마크"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(bookmarkId);
      }}
      aria-pressed={bookmarked}
      aria-label={label}
      className={
        "rounded-md p-1 -m-1 text-lg leading-none transition-colors " +
        (bookmarked
          ? "text-yellow-500 hover:text-yellow-600"
          : "text-gray-300 hover:text-yellow-500") +
        " " +
        className
      }
    >
      {bookmarked ? "★" : "☆"}
    </button>
  );
}
