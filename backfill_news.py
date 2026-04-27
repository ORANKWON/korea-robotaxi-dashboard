"""Re-process all existing items in data/news.json through the new crawler pipeline.

Locked-in by /plan-eng-review 2026-04-17 (news-list-v2 plan delta #4 — 3-layer guard).

Why this exists:
  After /robotaxi_crawler.py was upgraded with parse_title_source +
  infer_companies + unwrap_redirect_url + better summary handling, the 696
  pre-existing items in news.json still carry the old shape:
    - " - 매체명" suffixes that slipped past the old parser
    - source = "v.daum.net" (portal domain) instead of the real publisher
    - missing `final_url` (we never unwrapped Google News redirects)
    - missing `companies` (the entity matcher didn't exist)
    - tags computed against the old keyword list
  Re-fetching from RSS isn't an option — the original raw items aren't kept.
  This script re-derives every field that doesn't require the raw RSS payload.

Pipeline (idempotent — running twice yields the same result):
  for each existing item:
    1. parse_title_source(headline) → strip any leftover " - source"
    2. unwrap_redirect_url(url)     → produce final_url  [under Semaphore(10)]
    3. upgrade source if it looks like a portal domain
    4. upgrade summary ONLY if summary == headline (the old fallback path)
    5. infer_companies(headline)    → fill the missing companies field
    6. infer_tags(headline)         → re-run against expanded keyword list

Safety (3-layer guard, locked-in by /plan-eng-review):
  Layer 1 — `--apply` flag is REQUIRED to mutate disk. Default is dry-run with
            diff. The cron crawler is read-only safe; this script is not.
  Layer 2 — writes data/.crawl.lock at start, removes it in finally. The cron
            crawler's _check_crawl_lock() refuses to run while the lock exists,
            so we cannot race against scheduled crawls.
  Layer 3 — only triggered manually via workflow_dispatch (no cron schedule
            in .github/workflows/). Eliminates the "we ran a backfill at 3am
            and it ate the day's crawl" failure mode.

Usage:
  python backfill_news.py                       # dry-run, prints diff sample
  python backfill_news.py --apply               # writes back to news.json
  python backfill_news.py --limit 50            # process only first 50
  python backfill_news.py --no-unwrap           # skip URL unwrap (fast preview)
  python backfill_news.py --concurrency 5       # tune unwrap parallelism
  python backfill_news.py --diff-sample 10      # show 10 before/after diffs

Estimated runtime (full 696 items):
  - --no-unwrap : ~2s (no network)
  - default     : ~70-90s (gnewsdecoder uses 1s sleep × 696 ÷ 10 workers)
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
import sys
import urllib.parse
from datetime import datetime, timezone
from typing import Any

# robotaxi_crawler is sibling module — no sys.path hacks needed.
from robotaxi_crawler import (
    NEWS_FILE,
    COMPANIES_FILE,
    atomic_write_json,
    fetch_meta_description,
    infer_companies,
    infer_tags,
    load_company_keywords,
    parse_title_source,
    unwrap_redirect_url,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("backfill")

# Portal domains that should never be the canonical "source" — the source
# field for these items was filled from urlparse(redirect_url).netloc, which
# is wrong. If we see one of these AND we have a better source candidate
# (parse_title or unwrapped final_url), upgrade.
_PORTAL_DOMAINS = {
    "v.daum.net",
    "n.news.naver.com",
    "news.naver.com",
    "news.google.com",
    "news.nate.com",
    "m.news.naver.com",
}


def _looks_like_domain(s: str) -> bool:
    """True if `s` looks like a hostname (contains a dot, no spaces)."""
    return "." in s and " " not in s and len(s) <= 60


def _normalize_ws(s: str) -> str:
    return re.sub(r"\s+", "", s or "")


# ─── Per-item Reprocessor ────────────────────────────────────────────────────


async def reprocess_item(
    item: dict,
    companies_data: list[dict],
    company_keywords: list[str],
    *,
    do_unwrap: bool,
    sem: asyncio.Semaphore,
    loop: asyncio.AbstractEventLoop,
) -> tuple[dict, dict]:
    """Re-derive new fields on a single existing news item.

    Returns (new_item, change_record) where change_record describes which fields
    changed (for diff reporting). The function is conservative — it only
    overwrites a field when the new value is strictly better.

    Concurrency: unwrap and meta-fetch are network-bound. We run them under
    the supplied Semaphore via run_in_executor so the gnewsdecoder's 1-second
    pacing doesn't serialize the whole 696-item job.
    """
    original_headline = item.get("headline", "") or ""
    original_summary = item.get("summary", "") or ""
    original_source = item.get("source", "") or ""
    url = item.get("url", "") or ""

    changes: dict[str, tuple[Any, Any]] = {}
    new_item = dict(item)  # preserve published_at, url, and any future fields

    # ── Step 1: clean leftover " - 매체명" suffix ────────────────────────────
    cleaned_headline, title_source = parse_title_source(original_headline)
    if cleaned_headline != original_headline:
        new_item["headline"] = cleaned_headline
        changes["headline"] = (original_headline, cleaned_headline)

    # ── Step 2: unwrap Google News redirect (under semaphore) ───────────────
    final_url = url
    unwrap_ok = "news.google.com" not in url
    if do_unwrap and "news.google.com" in url:
        async with sem:
            final_url, unwrap_ok = await loop.run_in_executor(
                None, unwrap_redirect_url, url
            )

    if unwrap_ok and final_url and final_url != url and "final_url" not in item:
        new_item["final_url"] = final_url
        changes["final_url"] = (None, final_url)

    # ── Step 3: upgrade source if it looks like a portal/redirect domain ────
    if original_source in _PORTAL_DOMAINS or _looks_like_domain(original_source):
        new_source = ""
        if title_source:
            new_source = title_source
        elif unwrap_ok and final_url and final_url != url:
            netloc = urllib.parse.urlparse(final_url).netloc.replace("www.", "")
            if netloc and netloc not in _PORTAL_DOMAINS:
                new_source = netloc
        if new_source and new_source != original_source:
            new_item["source"] = new_source
            changes["source"] = (original_source, new_source)

    # ── Step 4: upgrade summary ONLY if it equals the headline ──────────────
    # Conservative: existing summaries often have publisher names appended
    # ("...100% 운행 - 매체명") which is low quality but not broken. We don't
    # touch those — only the strict fallback case where summary == headline.
    new_headline = new_item["headline"]
    if _normalize_ws(original_summary) == _normalize_ws(new_headline):
        if unwrap_ok and final_url and "news.google.com" not in final_url:
            meta = await loop.run_in_executor(
                None, fetch_meta_description, final_url
            )
            if meta and _normalize_ws(meta) != _normalize_ws(new_headline):
                new_item["summary"] = meta
                changes["summary"] = (original_summary, meta)

    # ── Step 5: re-infer companies (fills missing field) ────────────────────
    if companies_data:
        new_companies = infer_companies(new_headline, companies_data)
        old_companies = item.get("companies", [])
        if new_companies and new_companies != old_companies:
            new_item["companies"] = new_companies
            changes["companies"] = (old_companies, new_companies)

    # ── Step 6: re-tag against expanded keyword list ────────────────────────
    new_tags = infer_tags(new_headline, company_keywords)
    old_tags = item.get("tags", [])
    if sorted(new_tags) != sorted(old_tags):
        new_item["tags"] = new_tags
        changes["tags"] = (old_tags, new_tags)

    return new_item, changes


# ─── Lockfile lifecycle ──────────────────────────────────────────────────────


def acquire_lock(news_file: str) -> str:
    """Write data/.crawl.lock so the cron crawler skips while we run.

    Raises SystemExit if the lock already exists (another backfill is in
    progress or a previous run crashed without cleanup).
    """
    lock_path = os.path.join(os.path.dirname(news_file), ".crawl.lock")
    if os.path.exists(lock_path):
        try:
            with open(lock_path, "r", encoding="utf-8") as f:
                existing = f.read().strip()
        except IOError:
            existing = "(unreadable)"
        raise SystemExit(
            f"Lock already exists at {lock_path}\n"
            f"  contents: {existing}\n"
            f"  → another backfill running, or a previous run crashed.\n"
            f"  → if you're sure nothing else is running, rm the file and retry."
        )
    payload = (
        f"backfill pid={os.getpid()} "
        f"started={datetime.now(tz=timezone.utc).isoformat()}\n"
    )
    with open(lock_path, "w", encoding="utf-8") as f:
        f.write(payload)
    logger.info("Acquired lock: %s", lock_path)
    return lock_path


def release_lock(lock_path: str) -> None:
    try:
        os.remove(lock_path)
        logger.info("Released lock: %s", lock_path)
    except FileNotFoundError:
        logger.warning("Lock %s already gone (manually removed?)", lock_path)
    except OSError as e:
        logger.error("Failed to release lock %s: %s", lock_path, e)


# ─── Diff reporting ──────────────────────────────────────────────────────────


def _trunc(s: Any, n: int = 90) -> str:
    s = str(s) if s is not None else ""
    return s if len(s) <= n else s[: n - 1] + "…"


def print_diff_sample(
    items: list[dict], changes_per_item: list[dict], sample_size: int
) -> None:
    """Print before/after for the first N items that actually changed."""
    if sample_size <= 0:
        return
    shown = 0
    for idx, (item, changes) in enumerate(zip(items, changes_per_item)):
        if not changes:
            continue
        print(f"\n── Item #{idx + 1} ─────────────────────────────────────")
        print(f"  url:  {_trunc(item.get('url', ''), 100)}")
        for field, (old, new) in changes.items():
            print(f"  {field}:")
            print(f"    -  {_trunc(old, 110)}")
            print(f"    +  {_trunc(new, 110)}")
        shown += 1
        if shown >= sample_size:
            break
    if shown == 0:
        print("\n(No items changed — nothing to backfill.)")


def print_summary(changes_per_item: list[dict], total: int) -> None:
    """Print aggregate counts of which fields changed."""
    field_counts: dict[str, int] = {}
    items_changed = 0
    for changes in changes_per_item:
        if changes:
            items_changed += 1
        for field in changes:
            field_counts[field] = field_counts.get(field, 0) + 1
    print("\n── Summary ─────────────────────────────────────────────")
    print(f"  Items processed: {total}")
    print(f"  Items changed:   {items_changed}  ({100 * items_changed / max(1, total):.1f}%)")
    print("  Field changes:")
    for field in ("headline", "source", "summary", "tags", "companies", "final_url"):
        n = field_counts.get(field, 0)
        if n:
            print(f"    {field:<12} {n:>4}  ({100 * n / max(1, total):.1f}%)")


# ─── Main ────────────────────────────────────────────────────────────────────


async def run(args: argparse.Namespace) -> int:
    if not os.path.exists(args.news):
        logger.error("News file not found: %s", args.news)
        return 1
    with open(args.news, "r", encoding="utf-8") as f:
        items = json.load(f)
    if args.limit:
        items = items[: args.limit]
    logger.info("Loaded %d items from %s", len(items), args.news)

    _, company_keywords = load_company_keywords(args.companies)
    with open(args.companies, "r", encoding="utf-8") as f:
        companies_data = json.load(f)
    logger.info(
        "Loaded %d companies (keywords: %d)",
        len(companies_data), len(company_keywords),
    )

    if not args.do_unwrap:
        logger.info("URL unwrap DISABLED (--no-unwrap)")

    sem = asyncio.Semaphore(args.concurrency)
    loop = asyncio.get_event_loop()

    logger.info(
        "Reprocessing %d items (concurrency=%d, unwrap=%s)…",
        len(items), args.concurrency, args.do_unwrap,
    )
    tasks = [
        reprocess_item(
            item, companies_data, company_keywords,
            do_unwrap=args.do_unwrap, sem=sem, loop=loop,
        )
        for item in items
    ]
    results = await asyncio.gather(*tasks)
    new_items = [r[0] for r in results]
    changes_per_item = [r[1] for r in results]

    print_summary(changes_per_item, total=len(items))
    print_diff_sample(new_items, changes_per_item, sample_size=args.diff_sample)

    if not args.apply:
        print("\n── Dry-run only — no files written. Use --apply to commit changes.")
        return 0

    # Apply: write back. If --limit was used, only those N were reprocessed,
    # so we need to merge with the rest of the original file.
    if args.limit:
        with open(args.news, "r", encoding="utf-8") as f:
            full = json.load(f)
        merged = new_items + full[args.limit:]
        atomic_write_json(args.news, merged)
        logger.info("Wrote %d items (%d backfilled + %d untouched)",
                    len(merged), len(new_items), len(full) - args.limit)
    else:
        atomic_write_json(args.news, new_items)
        logger.info("Wrote %d items to %s", len(new_items), args.news)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--news", default=NEWS_FILE,
                        help="Path to news.json (default: data/news.json)")
    parser.add_argument("--companies", default=COMPANIES_FILE,
                        help="Path to companies.json (default: data/companies.json)")
    parser.add_argument("--apply", action="store_true",
                        help="REQUIRED to mutate disk. Default is dry-run.")
    parser.add_argument("--limit", type=int, default=None,
                        help="Process only first N items (debug aid)")
    parser.add_argument("--concurrency", type=int, default=10,
                        help="Max concurrent unwrap calls (default: 10)")
    parser.add_argument("--no-unwrap", dest="do_unwrap", action="store_false",
                        help="Skip URL unwrap (fast preview, no network)")
    parser.add_argument("--diff-sample", type=int, default=20,
                        help="Print before/after for first N changed items")
    parser.set_defaults(do_unwrap=True)
    args = parser.parse_args(argv)

    if args.apply:
        logger.warning(
            "── APPLY mode: %s WILL be modified. Press Ctrl-C within 3s to abort.",
            args.news,
        )
        try:
            import time
            time.sleep(3)
        except KeyboardInterrupt:
            logger.info("Aborted by user.")
            return 130

    lock_path: str | None = None
    try:
        lock_path = acquire_lock(args.news)
        return asyncio.run(run(args))
    except KeyboardInterrupt:
        logger.warning("Interrupted — releasing lock and exiting.")
        return 130
    finally:
        if lock_path:
            release_lock(lock_path)


if __name__ == "__main__":
    sys.exit(main())
