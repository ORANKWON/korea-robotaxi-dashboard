/**
 * Shared news data utilities for /api/news.json, /api/news.csv, /feed.xml,
 * and the /news SSR page.
 *
 * Locked-in by /plan-eng-review 2026-04-17 (news-list-v2 plan Phase 2).
 *
 * Why a shared module: the four routes all need the same filter / sort /
 * paginate semantics. Doing it in one place means:
 *   - filter behavior matches what the UI sees (no "RSS shows X but API
 *     shows Y for the same query" bugs)
 *   - the eTag is computed from the post-filter payload, so 304s work
 *     correctly per-query
 *   - data validation runs once at module load, not per request
 */
import { createHash } from "node:crypto";
import type { NewsItem } from "@/types";

import rawNews from "@data/news.json";

// ─── Module-level data load ──────────────────────────────────────────────────
//
// At build time Next.js inlines the JSON. The cast is checked at runtime by
// validate_data.py in CI, so we trust the shape here. Sort once at module
// load — every consumer wants newest-first.

const ALL_NEWS: NewsItem[] = (rawNews as NewsItem[]).slice().sort(
  (a, b) => b.published_at.localeCompare(a.published_at),
);

/** Stable hash of the entire news.json — used for eTag and cache busting. */
export const NEWS_FULL_ETAG = createHash("sha256")
  .update(JSON.stringify(ALL_NEWS))
  .digest("hex")
  .slice(0, 16);

// ─── Query params ────────────────────────────────────────────────────────────

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
 * to defaults — we never throw from this function (400 errors are handled
 * by the route, but most malformed input should soft-degrade).
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

// ─── Filter ──────────────────────────────────────────────────────────────────

/**
 * Apply tag/company/q filters. AND semantics across filters; OR within a
 * single filter is not supported (single-value chips on the UI).
 */
export function filterNews(items: NewsItem[], query: NewsQuery): NewsItem[] {
  let filtered = items;

  if (query.tag) {
    const t = query.tag.toLowerCase();
    filtered = filtered.filter((it) => it.tags.some((x) => x.toLowerCase() === t));
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

// ─── Paginate ────────────────────────────────────────────────────────────────

export function paginateNews(
  items: NewsItem[],
  query: NewsQuery,
): { items: NewsItem[]; total: number; limit: number; offset: number } {
  const total = items.length;
  const slice = items.slice(query.offset, query.offset + query.limit);
  return { items: slice, total, limit: query.limit, offset: query.offset };
}

// ─── Public accessors ────────────────────────────────────────────────────────

export function getAllNews(): NewsItem[] {
  return ALL_NEWS;
}

/**
 * One-shot helper for routes: parse → filter → paginate → return with eTag.
 * The eTag includes the query so cached responses don't bleed across filters.
 */
export function queryNews(searchParams: URLSearchParams) {
  const query = parseNewsQuery(searchParams);
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

/** Pick the canonical link for a news item (unwrapped publisher URL preferred). */
export function canonicalLink(item: NewsItem): string {
  return item.final_url || item.url;
}
