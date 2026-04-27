/**
 * Server-side news data layer for /api/news.json, /api/news.csv, /feed.xml,
 * and the /news SSR page.
 *
 * Locked-in by /plan-eng-review 2026-04-17 (news-list-v2 plan Phase 2; split
 * for client-bundle safety in Phase 4).
 *
 * Why a shared module: the four routes all need the same filter / sort /
 * paginate semantics. Doing it in one place means:
 *   - filter behavior matches what the UI sees (no "RSS shows X but API
 *     shows Y for the same query" bugs)
 *   - the eTag is computed from the post-filter payload, so 304s work
 *     correctly per-query
 *   - data validation runs once at module load, not per request
 *
 * IMPORTANT: this file imports `node:crypto`, so it MUST NOT be transitively
 * imported by any "use client" component. The pure query primitives live in
 * `lib/news-query.ts` and the canonical-link helper in `lib/news-utils.ts`.
 * Both are re-exported below for back-compat with existing import sites.
 */
import { createHash } from "node:crypto";
import type { NewsItem } from "@/types";

import rawNews from "@data/news.json";
import {
  filterNews,
  paginateNews,
  parseNewsQuery,
  type NewsQuery,
} from "@/lib/news-query";

// Re-export pure helpers so API routes + feed.xml keep their existing imports.
export { filterNews, paginateNews, parseNewsQuery } from "@/lib/news-query";
export type { NewsQuery } from "@/lib/news-query";
export { canonicalLink } from "@/lib/news-utils";

// ─── Module-level data load ──────────────────────────────────────────────────
//
// At build time Next.js inlines the JSON. The cast is checked at runtime by
// validate_data.py in CI, so we trust the shape here. Sort once at module
// load — every consumer wants newest-first.

const ALL_NEWS: NewsItem[] = (rawNews as NewsItem[])
  .slice()
  .sort((a, b) => b.published_at.localeCompare(a.published_at));

/** Stable hash of the entire news.json — used for eTag and cache busting. */
export const NEWS_FULL_ETAG = createHash("sha256")
  .update(JSON.stringify(ALL_NEWS))
  .digest("hex")
  .slice(0, 16);

// ─── Public accessors ────────────────────────────────────────────────────────

export function getAllNews(): NewsItem[] {
  return ALL_NEWS;
}

/**
 * One-shot helper for routes: parse → filter → paginate → return with eTag.
 * The eTag includes the query so cached responses don't bleed across filters.
 */
export function queryNews(searchParams: URLSearchParams) {
  const query: NewsQuery = parseNewsQuery(searchParams);
  const filtered = filterNews(ALL_NEWS, query);
  const page = paginateNews(filtered, query);
  const etag = createHash("sha256")
    .update(NEWS_FULL_ETAG)
    .update(JSON.stringify(query))
    .update(String(page.total))
    .digest("hex")
    .slice(0, 16);
  return { ...page, etag, query };
}
