/**
 * GET /feed.xml
 *
 * RSS 2.0 feed of recent robotaxi news. Standard reader path — Feedly,
 * Inoreader, NetNewsWire all expect /feed.xml at the site root.
 *
 * Why max 50 items: that's the convention for RSS feeds. Readers poll
 * frequently; sending 696 items wastes bytes and breaks the "unread count"
 * UI in most readers. Subscribers who want history use /api/news.json.
 *
 * Spec choices:
 *   - `<link>` uses the unwrapped publisher URL (`final_url || url`) so
 *     readers don't bounce through Google News redirects
 *   - Tags become `<category>` elements (one per tag)
 *   - `<guid isPermaLink="true">` matches `<link>` — no separate ID scheme
 *   - `<pubDate>` formatted per RFC 822 (RSS spec requirement)
 */
import { NextResponse } from "next/server";
import { canonicalLink, getAllNews, NEWS_FULL_ETAG } from "@/lib/news";
import type { NewsItem } from "@/types";

export const revalidate = 21600;

const SITE_ORIGIN = "https://korea-robotaxi-dashboard.vercel.app";
const FEED_TITLE = "한국 로보택시 뉴스";
const FEED_DESCRIPTION =
  "한국 자율주행 로보택시 산업 뉴스 (자동 수집). 자율주행, 시범운행, 정책, 사고, 기업 동향.";
const MAX_ITEMS = 50;

/** Escape XML special chars for safe inclusion in element text. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RFC 822 date format required by RSS 2.0 spec. */
function rfc822(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toUTCString();
  return d.toUTCString();
}

function itemXml(item: NewsItem): string {
  const link = canonicalLink(item);
  const categories = (item.tags ?? [])
    .concat(item.companies ?? [])
    .map((t) => `    <category>${xmlEscape(t)}</category>`)
    .join("\n");
  return [
    "  <item>",
    `    <title>${xmlEscape(item.headline)}</title>`,
    `    <link>${xmlEscape(link)}</link>`,
    `    <guid isPermaLink="true">${xmlEscape(link)}</guid>`,
    `    <pubDate>${rfc822(item.published_at)}</pubDate>`,
    `    <source>${xmlEscape(item.source)}</source>`,
    `    <description>${xmlEscape(item.summary)}</description>`,
    categories,
    "  </item>",
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

export async function GET() {
  const recent = getAllNews().slice(0, MAX_ITEMS);
  const lastBuild = recent[0]?.published_at ?? new Date().toISOString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${xmlEscape(FEED_TITLE)}</title>
  <link>${SITE_ORIGIN}</link>
  <atom:link href="${SITE_ORIGIN}/feed.xml" rel="self" type="application/rss+xml" />
  <description>${xmlEscape(FEED_DESCRIPTION)}</description>
  <language>ko-KR</language>
  <lastBuildDate>${rfc822(lastBuild)}</lastBuildDate>
  <ttl>360</ttl>
${recent.map(itemXml).join("\n")}
</channel>
</rss>`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=3600",
      // The full corpus eTag is fine here — feed contents only change when
      // news.json changes, and we always emit the most-recent 50.
      ETag: `"${NEWS_FULL_ETAG}"`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
