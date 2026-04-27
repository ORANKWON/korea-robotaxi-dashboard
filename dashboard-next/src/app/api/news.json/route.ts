/**
 * GET /api/news.json
 *
 * Public JSON feed of crawled robotaxi news, paginated.
 *
 * Query params (all optional):
 *   ?tag=정책            single-value tag filter (case-insensitive)
 *   ?company=쏘카 (SOCAR) single-value canonical-name match against `companies`
 *   ?q=강남              substring match across headline + summary (max 200 chars)
 *   ?limit=50            page size, 1–500, default 100
 *   ?offset=0            skip first N items
 *
 * Response body:
 *   { items: NewsItem[], total: number, limit: number, offset: number }
 *
 * Caching strategy (locked-in by /plan-eng-review delta #3):
 *   - ISR 6h (matches the cron crawl cadence)
 *   - On-demand revalidation via /api/revalidate after each successful crawl
 *   - Per-query eTag → cheap 304 responses for repeat readers
 *
 * Why ISR + on-demand instead of pure ISR or no cache:
 *   Pure ISR makes the first reader after each crawl wait for stale content
 *   plus a refetch. Pure on-demand wastes work when no one reads. The combo
 *   gives sub-second freshness after every crawl + cheap reads at scale.
 */
import { NextRequest, NextResponse } from "next/server";
import { queryNews } from "@/lib/news";

// 6 hours — matches crawl cadence (cron: "0 */6 * * *")
export const revalidate = 21600;

export async function GET(request: NextRequest) {
  const { items, total, limit, offset, etag } = queryNews(request.nextUrl.searchParams);

  // 304 Not Modified: cheap response for clients that already have this page
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch.replace(/"/g, "") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: `"${etag}"` },
    });
  }

  return NextResponse.json(
    { items, total, limit, offset },
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // Edge cache: 6h. SWR: serve stale up to 1h while revalidating.
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=3600",
        ETag: `"${etag}"`,
        // Public API → permissive CORS so dashboards/notebooks can pull it
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
