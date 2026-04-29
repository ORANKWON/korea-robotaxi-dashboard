/**
 * GET /api/companies.json
 *
 * Public JSON feed of all tracked autonomous-vehicle companies.
 *
 * No query params — the corpus is small (~10 entries, ~3KB) so paging would
 * add complexity for zero benefit. If it grows past ~100, revisit with the
 * same parseQuery / paginate pattern as /api/news.json.
 *
 * Response body:
 *   { items: Company[], total: number, generated_at: string }
 *
 * Locked-in by trade-tool-v1 plan (Killer Feature D — engineers + analysts
 * pulling our company data into their own dashboards/notebooks). Pairs with
 * /api/news.json + /feed.xml as the public read API.
 *
 * Caching: ISR 6h (matches the crawler/data cadence), on-demand revalidate
 * via /api/revalidate when companies.json changes are pushed.
 */
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getAllCompanies } from "@/lib/companies";

export const revalidate = 21600;

// Stable hash of the full payload — used for ETag/304 short-circuits.
const ALL_COMPANIES = getAllCompanies();
const PAYLOAD = {
  items: ALL_COMPANIES,
  total: ALL_COMPANIES.length,
};
const ETAG = createHash("sha256")
  .update(JSON.stringify(ALL_COMPANIES))
  .digest("hex")
  .slice(0, 16);

export async function GET(request: Request) {
  const inm = request.headers.get("if-none-match");
  if (inm === ETAG) {
    return new NextResponse(null, { status: 304 });
  }

  const body = JSON.stringify({
    ...PAYLOAD,
    generated_at: new Date().toISOString(),
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      etag: ETAG,
      // Public CDN cache for 6h, allow up to 1d stale-while-revalidate so
      // cold edges still serve fast even at the 6h boundary.
      "cache-control":
        "public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
