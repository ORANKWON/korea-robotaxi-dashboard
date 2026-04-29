/**
 * Shared company data accessors. Mirrors `lib/news.ts` pattern.
 *
 * Locked-in by trade-tool-v1 plan (Killer Feature B + D — `/vs/[a]/[b]` and
 * `/api/companies.json` need a single source of truth for slug → id resolution
 * and a stable canonical ordering).
 *
 * Why a separate module: `/vs/[a]/[b]` server component, `/api/companies.json`
 * route, sitemap, AND eventually `/my` bookmarks page all need the same slug
 * map. Doing it in one place means a single test surface + cache for the
 * `bySlug()` Map (built once at module load, not per-request).
 *
 * No node-only deps here on purpose — client components can import too.
 */
import type { Company } from "@/types";
import companiesData from "@data/companies.json";

const ALL: Company[] = companiesData as Company[];

// Indexed at module load. Slug is the canonical URL identifier (lowercase,
// alphanumeric — see data/companies.json `slug` field), `id` stays the
// primary key for /company/[id] back-compat.
const BY_SLUG: Map<string, Company> = new Map();
const BY_ID: Map<number, Company> = new Map();
for (const c of ALL) {
  if (c.slug) BY_SLUG.set(c.slug.toLowerCase(), c);
  BY_ID.set(c.id, c);
}

export function getAllCompanies(): Company[] {
  return ALL;
}

export function getCompanyBySlug(slug: string): Company | undefined {
  return BY_SLUG.get(slug.toLowerCase());
}

export function getCompanyById(id: number): Company | undefined {
  return BY_ID.get(id);
}

/**
 * All ordered C(n,2) pairs of company slugs. Used to:
 *   - generate static params for /vs/[a]/[b]
 *   - build sitemap entries
 *
 * Canonical ordering: lex-sort the slug pair so /vs/a/b and /vs/b/a resolve
 * to the same page. The `vs/[a]/[b]` route uses `canonicalPair()` to redirect
 * the wrong order to the canonical one — keeps SSG count at C(n,2), not n*n.
 */
export function getAllCompanyPairs(): Array<[string, string]> {
  const slugs = ALL.map((c) => c.slug).filter(Boolean) as string[];
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      pairs.push(canonicalPair(slugs[i], slugs[j]));
    }
  }
  return pairs;
}

/** Lex-sort a pair so order doesn't matter for caching. */
export function canonicalPair(a: string, b: string): [string, string] {
  return a.toLowerCase() < b.toLowerCase()
    ? [a.toLowerCase(), b.toLowerCase()]
    : [b.toLowerCase(), a.toLowerCase()];
}
