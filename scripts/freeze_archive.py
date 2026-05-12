"""Freeze the daily representative for any date 7+ days old.

Locked-in by /plan-eng-review 2026-05-11 D11 (PR2 of news-archive-v1).

Why this exists:
  /archive/[YYYY-MM-DD] is sold as a permalink — investors and journalists
  cite it expecting the headline they saw to still be there 5 years later.
  But pickRepresentative is score-based, so a new article arriving for the
  same KST date can swap the representative. That breaks the permalink
  promise. The fix: after 7 days, freeze the pick. Any future change to that
  date's article set is ignored for the representative slot.

Pipeline (idempotent — re-running this script yields the same frozen.json):
  1. Read data/news.json + data/news-archive-frozen.json.
  2. Group items by KST YYYY-MM-DD (parallel impl of toKSTDate from news-utils.ts).
  3. For each date:
       skip if (today_KST - date) < 7 days  → fresh, can still legitimately swap
       skip if date already in frozen.json   → locked, no-op
       else → score items (parallel impl of scoreOf), pick winner, write entry.
  4. Atomic write frozen.json.

Drift mitigation (D7):
  - validate_data.py cross-checks every frozen URL exists in news.json. If
    dedup ever removes a frozen pick from the corpus, validation fails the
    build until it's resolved (manual decision: re-pick or accept rot).
  - Algorithm parity with TS scoreOf is the developer's responsibility. Same
    constants, same comparisons, same tiebreakers. Re-test after any change
    to either side.

Safety:
  - Read-only against news.json. Only writes news-archive-frozen.json.
  - No --apply flag because freeze.json starts empty and only grows; there's
    no destructive case to guard against. The 7-day delay IS the guard.
  - No lock file: this script writes a different file from the crawler's
    target (news.json), so there's no race on the live data file.

Usage:
  python scripts/freeze_archive.py             # apply (the default)
  python scripts/freeze_archive.py --dry-run   # report only, don't write
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("freeze_archive")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEWS_FILE = os.path.join(REPO_ROOT, "data", "news.json")
FROZEN_FILE = os.path.join(REPO_ROOT, "data", "news-archive-frozen.json")

KST = ZoneInfo("Asia/Seoul")
FREEZE_AGE_DAYS = 7  # mirrors the TS getDailyArchive override threshold


# ─── Pure helpers (parallel impl of TS lib/news-utils.ts + lib/news-archive.ts)

def to_kst_date(iso: str) -> str | None:
    """Parallel impl of toKSTDate from dashboard-next/src/lib/news-utils.ts.

    Returns "YYYY-MM-DD" KST or None on bad input. Mirror exactly:
    bad ISO must produce None so groupByDate can skip the item just like
    the TS side does (D2 graceful degradation).
    """
    if not iso or not isinstance(iso, str):
        return None
    try:
        # Python's fromisoformat handles "+09:00" but not "Z" pre-3.11.
        # Normalize to be safe across deployment environments.
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    if dt.tzinfo is None:
        # Spec says published_at always has TZ. Defensive: treat naive as UTC.
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(KST).strftime("%Y-%m-%d")


def canonical_link(item: dict[str, Any]) -> str:
    """Parallel impl of canonicalLink. Prefer final_url over url."""
    return item.get("final_url") or item.get("url") or ""


def score_of(item: dict[str, Any]) -> float:
    """Parallel impl of scoreOf in news-archive.ts.

    Tag multiplier × (1 + companies count) + summary bonus. Constants must
    match the TS side EXACTLY — any drift causes Python freeze winner to
    differ from runtime fresh pick, which then sticks for 5+ years.
    """
    tags = item.get("tags") or []
    if "정책" in tags or "사고" in tags:
        tag_mult = 3.0
    elif "기업" in tags:
        tag_mult = 2.0
    elif "서비스" in tags:
        tag_mult = 1.5
    else:
        tag_mult = 1.0
    comp_base = 1 + len(item.get("companies") or [])
    summary = item.get("summary") or ""
    summary_boost = min(len(summary), 500) / 1000.0
    return tag_mult * comp_base + summary_boost


def pick_representative(items: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Parallel impl of pickRepresentative.

    scoreOf desc → headline localeCompare(ko) ascending. Python's locale
    sort isn't 100% identical to JS Intl.Collator("ko"); for headlines
    that hit the final tiebreaker, drift is theoretically possible. In
    practice tag×companies+summary almost always settles ties before
    headline; cases where headline collation matters are <1% and any
    Korean string sort will be deterministic across Python versions.
    """
    if not items:
        return None
    return sorted(
        items,
        key=lambda it: (-score_of(it), it.get("headline") or ""),
    )[0]


# ─── Main pipeline ──────────────────────────────────────────────────────────

def load_news() -> list[dict[str, Any]]:
    with open(NEWS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def load_frozen() -> dict[str, Any]:
    """Returns the full frozen.json blob {{ _comment, frozen: {date: entry} }}.

    Falls back to a fresh shell when the file is missing — first-run safe.
    """
    if not os.path.exists(FROZEN_FILE):
        return {"frozen": {}}
    with open(FROZEN_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    if "frozen" not in data:
        data["frozen"] = {}
    return data


def group_by_kst_date(items: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    buckets: dict[str, list[dict[str, Any]]] = {}
    for it in items:
        date = to_kst_date(it.get("published_at") or "")
        if not date:
            continue
        buckets.setdefault(date, []).append(it)
    return buckets


def atomic_write(path: str, data: Any) -> None:
    """Same pattern as robotaxi_crawler.atomic_write_json: tmp → validate → replace."""
    tmp = path + ".tmp"
    serialized = json.dumps(data, ensure_ascii=False, indent=2)
    json.loads(serialized)  # round-trip validate
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(serialized)
    os.replace(tmp, path)
    logger.info("Wrote %d bytes to %s", len(serialized), path)


def freeze_eligible(today_kst: datetime, frozen_blob: dict[str, Any],
                    buckets: dict[str, list[dict[str, Any]]],
                    dry_run: bool) -> dict[str, Any]:
    """Apply the 7-day freeze rule. Returns updated frozen blob (mutated copy)."""
    threshold = today_kst.date() - timedelta(days=FREEZE_AGE_DAYS)
    frozen_map: dict[str, Any] = dict(frozen_blob.get("frozen") or {})
    new_count = 0

    for date_str, day_items in sorted(buckets.items()):
        # Only freeze dates strictly OLDER than the threshold (>= 7 days ago).
        try:
            date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            continue
        if date_obj > threshold:
            continue  # too fresh, can still legitimately swap
        if date_str in frozen_map:
            continue  # already locked, idempotent skip

        rep = pick_representative(day_items)
        if rep is None:
            continue
        url = canonical_link(rep)
        if not url:
            logger.warning("Skipping %s: representative has no canonical URL", date_str)
            continue
        entry = {
            "frozen_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "representative_url": url,
            "representative_headline": rep.get("headline") or "",
        }
        frozen_map[date_str] = entry
        new_count += 1
        logger.info("FREEZE %s → %s", date_str, entry["representative_headline"][:60])

    out = dict(frozen_blob)
    out["frozen"] = frozen_map
    logger.info("Freeze pass: %d new entries (total frozen: %d)", new_count, len(frozen_map))
    if dry_run and new_count > 0:
        logger.info("DRY-RUN — not writing")
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="Report what would be frozen, don't write the file")
    args = parser.parse_args()

    if not os.path.exists(NEWS_FILE):
        logger.error("News file not found: %s", NEWS_FILE)
        return 1

    items = load_news()
    logger.info("Loaded %d news items from %s", len(items), NEWS_FILE)
    frozen_blob = load_frozen()
    logger.info("Loaded %d existing frozen entries", len(frozen_blob.get("frozen") or {}))

    buckets = group_by_kst_date(items)
    logger.info("Grouped into %d KST dates", len(buckets))

    today_kst = datetime.now(KST)
    new_blob = freeze_eligible(today_kst, frozen_blob, buckets, args.dry_run)

    before = len(frozen_blob.get("frozen") or {})
    after = len(new_blob.get("frozen") or {})
    if after == before:
        logger.info("No new freeze entries — nothing to write")
        return 0
    if args.dry_run:
        return 0
    atomic_write(FROZEN_FILE, new_blob)
    return 0


if __name__ == "__main__":
    sys.exit(main())
