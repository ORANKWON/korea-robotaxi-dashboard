/**
 * POST /api/revalidate
 *
 * On-demand ISR cache invalidation. Triggered by the GitHub Actions crawl
 * workflow after each successful run, so readers see fresh news within
 * seconds instead of waiting for the next ISR window (up to 6h).
 *
 * Locked-in by /plan-eng-review 2026-04-17 (news-list-v2 plan delta #3).
 *
 * Auth: requires `x-revalidate-secret: $REVALIDATE_SECRET` header. The
 * secret is set in Vercel env vars and the GitHub Actions secret store.
 * Never log the secret value.
 *
 * Body (optional): { paths?: string[] }. Default paths cover every news
 * surface: list pages + JSON/CSV/RSS endpoints.
 *
 * Why POST not GET: ISR revalidate is a state-changing op. GET would let
 * any browser preview link nuke the cache.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

// These run after every crawl. Add new news-bearing routes here.
const DEFAULT_PATHS = [
  "/",
  "/news",
  "/api/news.json",
  "/api/news.csv",
  "/feed.xml",
];

export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    // Misconfigured deployment — fail closed. Don't reveal the missing var
    // to unauthenticated callers.
    return NextResponse.json({ ok: false, error: "Server not configured" }, { status: 500 });
  }

  const supplied = request.headers.get("x-revalidate-secret");
  if (!supplied || supplied !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let pathsToRevalidate = DEFAULT_PATHS;
  try {
    const body = await request.json().catch(() => null);
    if (body && Array.isArray(body.paths) && body.paths.length > 0) {
      const candidates: string[] = body.paths
        .filter((p: unknown): p is string => typeof p === "string")
        .map((p: string) => p.trim())
        .filter((p: string) => p.startsWith("/") && p.length < 200);
      if (candidates.length > 0) pathsToRevalidate = candidates;
    }
  } catch {
    // Body parsing failures fall back to DEFAULT_PATHS — not an auth concern
  }

  const results: Array<{ path: string; ok: boolean; error?: string }> = [];
  for (const p of pathsToRevalidate) {
    try {
      revalidatePath(p);
      results.push({ path: p, ok: true });
    } catch (err) {
      results.push({
        path: p,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const allOk = results.every((r) => r.ok);
  return NextResponse.json(
    { ok: allOk, revalidated: results, timestamp: new Date().toISOString() },
    { status: allOk ? 200 : 207 },
  );
}
