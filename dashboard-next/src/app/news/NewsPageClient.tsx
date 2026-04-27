/**
 * Client-side wrapper for /news. Owns URL state for filters + pagination.
 *
 * Locked-in by /plan-eng-review 2026-04-17 (news-list-v2 plan Phase 4).
 *
 * Why client-side filtering (not server round-trip):
 *   The corpus is 696 items (~300KB JSON inline, ~80KB gzipped over the wire).
 *   That's a one-time cost. Client-side filter+paginate is instant —
 *   no round-trip, no Suspense fallback flicker on every chip click.
 *   When the corpus grows past ~5000 items, revisit (server filter +
 *   /api/news.json fetch).
 *
 * URL contract:
 *   ?q=string     → free-text on headline + summary
 *   ?tag=string   → exact match against NewsItem.tags (case-insensitive)
 *   ?company=str  → exact match against NewsItem.companies
 *   ?page=number  → 1-indexed; defaults to 1
 *   ?hideRead=1   → checkbox state mirror (read state itself stays in localStorage)
 *
 * Design doc edge case: useSearchParams() needs a Suspense boundary in
 * Next.js 14 app router. Parent page wraps us in <Suspense>.
 */
"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { NewsItem } from "@/types";
// Import from news-query (not news) so the client bundle doesn't pull
// `node:crypto` via lib/news.ts. Both modules expose the same helpers.
import { filterNews, parseNewsQuery } from "@/lib/news-query";
import NewsFiltersBar from "@/components/news/NewsFiltersBar";
import NewsList from "@/components/news/NewsList";

export interface NewsPageClientProps {
  items: NewsItem[];
  availableCompanies: string[];
}

export default function NewsPageClient({
  items,
  availableCompanies,
}: NewsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Mirror URL → state. parseNewsQuery handles validation + bounds.
  const query = useMemo(
    () => parseNewsQuery(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const page = parsePage(searchParams.get("page"));
  const hideRead = searchParams.get("hideRead") === "1";

  const filtered = useMemo(
    // We re-use the same filter logic the API route uses, so what users see
    // matches what they get from /api/news.json with the same params.
    () => filterNews(items, query),
    [items, query],
  );

  // ── URL mutation helpers ────────────────────────────────────────────────
  // All filter changes go through here. Router.replace + scroll:false to
  // keep the user's scroll position when toggling chips.

  const updateParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      // Filter change resets pagination — page numbers don't carry meaning
      // across filter sets ("page 7 of 정책" ≠ "page 7 of 사고")
      next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `/news?${qs}` : "/news", { scroll: false });
    },
    [router, searchParams],
  );

  const onTagChange = useCallback(
    (tag: string | null) => {
      updateParams((p) => {
        if (tag) p.set("tag", tag);
        else p.delete("tag");
      });
    },
    [updateParams],
  );

  const onCompanyChange = useCallback(
    (company: string | null) => {
      updateParams((p) => {
        if (company) p.set("company", company);
        else p.delete("company");
      });
    },
    [updateParams],
  );

  const onQueryChange = useCallback(
    (q: string) => {
      updateParams((p) => {
        if (q.trim()) p.set("q", q.trim());
        else p.delete("q");
      });
    },
    [updateParams],
  );

  const onHideReadChange = useCallback(
    (hide: boolean) => {
      // Doesn't reset page — same filter set, just hides a subset
      const next = new URLSearchParams(searchParams.toString());
      if (hide) next.set("hideRead", "1");
      else next.delete("hideRead");
      const qs = next.toString();
      router.replace(qs ? `/news?${qs}` : "/news", { scroll: false });
    },
    [router, searchParams],
  );

  const onClearAll = useCallback(() => {
    router.replace("/news", { scroll: false });
  }, [router]);

  const pageHref = useCallback(
    (p: number) => {
      const next = new URLSearchParams(searchParams.toString());
      if (p === 1) next.delete("page");
      else next.set("page", String(p));
      const qs = next.toString();
      return qs ? `/news?${qs}` : "/news";
    },
    [searchParams],
  );

  return (
    <div className="space-y-4">
      <NewsFiltersBar
        activeTag={query.tag ?? null}
        activeCompany={query.company ?? null}
        query={query.q ?? ""}
        hideRead={hideRead}
        availableCompanies={availableCompanies}
        onTagChange={onTagChange}
        onCompanyChange={onCompanyChange}
        onQueryChange={onQueryChange}
        onHideReadChange={onHideReadChange}
        onClearAll={onClearAll}
      />

      <NewsList
        items={filtered}
        currentPage={page}
        hideRead={hideRead}
        pageHref={pageHref}
        onClearFilters={onClearAll}
      />
    </div>
  );
}

function parsePage(raw: string | null): number {
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}
