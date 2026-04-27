/**
 * Filter bar for /news. Tag chips (always all 6) + company chips (top N) +
 * search input + "읽은 거 숨기기" toggle.
 *
 * Locked-in by /plan-eng-review 2026-04-17 (news-list-v2 plan Phase 4 +
 * Edge Cases: "한글 IME 조합 중 입력 → onCompositionEnd + 200ms debounce").
 *
 * State ownership: this is a controlled component. Parent (/news page) owns
 * the URL state and passes down current values + change handlers. We never
 * touch URL state from here — clean separation between filter UI and routing.
 *
 * IME safety: input writes to a local buffer. Search-by-typing only commits
 * after `onCompositionEnd` fires (Korean character is finalized) AND a 200ms
 * debounce passes. Typing "ㅇ-ㅏ-ㄴ-ㄴ-ㅕ-ㅇ" doesn't fire 6 searches.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { ALL_TAGS, tagClass } from "@/lib/news-utils";

const SEARCH_DEBOUNCE_MS = 200;
const MAX_COMPANY_CHIPS = 9;

export interface NewsFiltersBarProps {
  activeTag: string | null;
  activeCompany: string | null;
  query: string;
  hideRead: boolean;
  /** All companies that appear in the news corpus, ordered by mention count desc. */
  availableCompanies: string[];
  onTagChange: (tag: string | null) => void;
  onCompanyChange: (company: string | null) => void;
  onQueryChange: (q: string) => void;
  onHideReadChange: (hide: boolean) => void;
  onClearAll: () => void;
}

export default function NewsFiltersBar({
  activeTag,
  activeCompany,
  query,
  hideRead,
  availableCompanies,
  onTagChange,
  onCompanyChange,
  onQueryChange,
  onHideReadChange,
  onClearAll,
}: NewsFiltersBarProps) {
  const [buffer, setBuffer] = useState(query);
  const composingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync buffer when query prop changes from URL (e.g. browser back/forward)
  useEffect(() => {
    setBuffer(query);
  }, [query]);

  function commitSearch(next: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onQueryChange(next);
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setBuffer(v);
    if (composingRef.current) return;
    commitSearch(v);
  }

  function handleCompositionEnd(e: React.CompositionEvent<HTMLInputElement>) {
    composingRef.current = false;
    commitSearch((e.target as HTMLInputElement).value);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onQueryChange(buffer);
  }

  const companies = availableCompanies.slice(0, MAX_COMPANY_CHIPS);
  const anyActive = activeTag !== null || activeCompany !== null || query !== "" || hideRead;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3">
      {/* Search */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="search"
          value={buffer}
          onChange={handleChange}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={handleCompositionEnd}
          placeholder="헤드라인/요약 검색..."
          maxLength={200}
          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
          aria-label="뉴스 검색"
        />
        {anyActive && (
          <button
            type="button"
            onClick={onClearAll}
            className="text-sm text-gray-500 hover:text-gray-700 px-3"
          >
            초기화
          </button>
        )}
      </form>

      {/* Tag chips */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-xs text-gray-400 mr-1">태그</span>
        <button
          type="button"
          onClick={() => onTagChange(null)}
          className={chipClass(activeTag === null)}
        >
          전체
        </button>
        {ALL_TAGS.map((tag) => {
          const active = activeTag === tag;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onTagChange(active ? null : tag)}
              className={
                active
                  ? `text-xs px-2.5 py-1 rounded-full ring-1 ring-offset-1 ring-gray-300 ${tagClass(tag)}`
                  : "text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
              }
              aria-pressed={active}
            >
              {tag}
            </button>
          );
        })}
      </div>

      {/* Company chips */}
      {companies.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-gray-400 mr-1">기업</span>
          <button
            type="button"
            onClick={() => onCompanyChange(null)}
            className={chipClass(activeCompany === null)}
          >
            전체
          </button>
          {companies.map((c) => {
            const active = activeCompany === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => onCompanyChange(active ? null : c)}
                className={chipClass(active)}
                aria-pressed={active}
              >
                {c}
              </button>
            );
          })}
        </div>
      )}

      {/* Hide read toggle */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={hideRead}
            onChange={(e) => onHideReadChange(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-300"
          />
          읽은 뉴스 숨기기
        </label>
      </div>
    </div>
  );
}

function chipClass(active: boolean): string {
  return active
    ? "text-xs px-2.5 py-1 rounded-full bg-blue-600 text-white font-medium"
    : "text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200";
}
