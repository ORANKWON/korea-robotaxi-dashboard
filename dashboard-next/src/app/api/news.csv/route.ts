/**
 * GET /api/news.csv
 *
 * RFC 4180-compliant CSV export of crawled robotaxi news.
 *
 * Query params: same as /api/news.json (?tag, ?company, ?q, ?limit, ?offset).
 * When no params are passed, returns the entire corpus.
 *
 * Format details:
 *   - UTF-8 BOM prefix → Excel recognizes Hangul without manual encoding pick
 *   - CRLF line terminators (RFC 4180 §2.1)
 *   - Fields wrapped in `"` when they contain `,`, `"`, CR, or LF
 *   - Embedded `"` is doubled to `""` (RFC 4180 §2.7)
 *   - Multi-value fields (tags, companies) joined with `; ` inside the cell
 *
 * Caching: ISR 6h, on-demand revalidate after crawl. eTag for 304 reads.
 */
import { NextRequest, NextResponse } from "next/server";
import { queryNews } from "@/lib/news";
import type { NewsItem } from "@/types";

export const revalidate = 21600;

const HEADERS = [
  "headline",
  "summary",
  "source",
  "url",
  "final_url",
  "published_at",
  "tags",
  "companies",
] as const;

/**
 * RFC 4180 §2.6–2.7: a field needs quoting iff it contains `,`, `"`, CR, or LF.
 * Inside a quoted field, embedded `"` is doubled.
 */
function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowFor(item: NewsItem): string {
  const cells = [
    item.headline,
    item.summary,
    item.source,
    item.url,
    item.final_url ?? "",
    item.published_at,
    (item.tags ?? []).join("; "),
    (item.companies ?? []).join("; "),
  ];
  return cells.map(csvEscape).join(",");
}

export async function GET(request: NextRequest) {
  const { items, etag } = queryNews(request.nextUrl.searchParams);

  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch.replace(/"/g, "") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: `"${etag}"` },
    });
  }

  // BOM + header + rows. CRLF per RFC 4180.
  const BOM = "\uFEFF";
  const headerRow = HEADERS.join(",");
  const body = BOM + [headerRow, ...items.map(rowFor)].join("\r\n") + "\r\n";

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="korea-robotaxi-news.csv"`,
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=3600",
      ETag: `"${etag}"`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
