/**
 * Pure query primitives for news: parseNewsQuery, filterNews, paginateNews.
 *
 * Locked-in by /plan-eng-review 2026-04-17 (news-list-v2 plan Phase 4 build
 * fix: client bundle must not transitively pull `node:crypto`).
 *
 * Why this file exists separate from `lib/news.ts`:
 *   `news.ts` does ETag computation via `node:crypto`, which webpack refuses
 *   to bundle for the browser. Client components (NewsPageClient) need the
 *   same filter semantics the API uses, so we extracted the pure helpers
 *   here. `news.ts` re-exports from this module for back-compat with API
 *   routes that import from `@/lib/news`.
 *
 * Keep this file dependency-free of any Node-only modules.
 */
import type { NewsItem } from "@/types";

export interface NewsQuery {
  /** Filter by tag (matches `NewsItem.tags`). Case-insensitive. */
  tag?: string;
  /** Filter by company canonical name (matches `NewsItem.companies`). */
  company?: string;
  /** Free-text search across headline + summary. Max 200 chars. */
  q?: string;
  /** Page size (1–500). Default 100. */
  limit: number;
  /** Skip first N items. Default 0. */
  offset: number;
}

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;
const MAX_QUERY_LEN = 200;

/**
 * Parse + validate URLSearchParams into a NewsQuery. Invalid values fall back
 * to defaults — we never throw from this function (400 errors are handled by
 * the route, but most malformed input should soft-degrade).
 */
export function parseNewsQuery(params: URLSearchParams): NewsQuery {
  const tag = params.get("tag")?.trim() || undefined;
  const company = params.get("company")?.trim() || undefined;
  const qRaw = params.get("q")?.trim();
  const q = qRaw ? qRaw.slice(0, MAX_QUERY_LEN) : undefined;

  let limit = DEFAULT_LIMIT;
  const limitRaw = params.get("limit");
  if (limitRaw) {
    const n = Number.parseInt(limitRaw, 10);
    if (Number.isFinite(n) && n > 0) {
      limit = Math.min(n, MAX_LIMIT);
    }
  }

  let offset = 0;
  const offsetRaw = params.get("offset");
  if (offsetRaw) {
    const n = Number.parseInt(offsetRaw, 10);
    if (Number.isFinite(n) && n >= 0) {
      offset = n;
    }
  }

  return { tag, company, q, limit, offset };
}

/**
 * Apply tag/company/q filters. AND semantics across filters; OR within a
 * single filter is not supported (single-value chips on the UI).
 */
export function filterNews(items: NewsItem[], query: NewsQuery): NewsItem[] {
  let filtered = items;

  if (query.tag) {
    const t = query.tag.toLowerCase();
    filtered = filtered.filter((it) =>
      it.tags.some((x) => x.toLowerCase() === t),
    );
  }

  if (query.company) {
    const c = query.company;
    filtered = filtered.filter((it) => (it.companies ?? []).includes(c));
  }

  if (query.q) {
    const q = query.q.toLowerCase();
    filtered = filtered.filter(
      (it) =>
        it.headline.toLowerCase().includes(q) ||
        it.summary.toLowerCase().includes(q),
    );
  }

  return filtered;
}

export function paginateNews(
  items: NewsItem[],
  query: NewsQuery,
): { items: NewsItem[]; total: number; limit: number; offset: number } {
  const total = items.length;
  const slice = items.slice(query.offset, query.offset + query.limit);
  return { items: slice, total, limit: query.limit, offset: query.offset };
}
