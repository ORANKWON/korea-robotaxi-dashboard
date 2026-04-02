#!/usr/bin/env python3
"""
Hash-based change detection for Korean robotaxi company/government pages.

Pipeline:
  Fetch page body (urllib, stdlib only)
        │
        ▼
  SHA256 hash of response body
        │
        ▼
  Compare with stored hash in data/crawl_log.json
        │
        ▼
  If changed → log "changed", update hash
  If unchanged → log "unchanged"
  If error → log "error", keep old hash
        │
        ▼
  Staleness check: warn if no change in 14+ days
  Broken page check: warn if < 500 bytes or unreachable

No CSS parsing, no regex extraction, no dependencies.
Change detection = manual review trigger, not auto-update.

Usage:
  python crawl_company_updates.py

GitHub Actions Job Summary:
  Writes to $GITHUB_STEP_SUMMARY if available.
"""

import hashlib
import json
import logging
import os
import ssl
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from typing import Any, Optional, Tuple

from robotaxi_crawler import atomic_write_json

# ─── Constants ───────────────────────────────────────────────────────────────

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CRAWL_LOG_FILE = os.path.join(BASE_DIR, "data", "crawl_log.json")

FETCH_TIMEOUT = 15  # seconds
MIN_PAGE_BYTES = 500  # below this = broken page
STALE_DAYS = 14  # warn if no change in this many days

# Known company whitelist (for unknown company detection in future)
KNOWN_COMPANIES = {
    "SWM", "카카오모빌리티", "42dot", "포니링크",
    "오토노머스에이투지", "모셔널", "라이드플럭스",
}

# URLs to monitor
MONITOR_TARGETS = [
    {
        "id": "molit_autonomous",
        "name": "국토부 자율주행 보도자료",
        "url": "https://www.molit.go.kr/USR/NEWS/m_71/lst.jsp?search_type=title&search_text=%EC%9E%90%EC%9C%A8%EC%A3%BC%ED%96%89",
        "type": "government",
    },
    {
        "id": "seoul_autonomous",
        "name": "서울시 자율주행 뉴스",
        "url": "https://news.seoul.go.kr/traffic/archives/category/autonomous",
        "type": "government",
    },
    {
        "id": "42dot",
        "name": "42dot 뉴스",
        "url": "https://42dot.ai/news",
        "type": "company",
    },
    {
        "id": "rideflux",
        "name": "라이드플럭스",
        "url": "https://rideflux.com",
        "type": "company",
    },
    {
        "id": "swm",
        "name": "SWM (서울자율차)",
        "url": "https://swm.co.kr",
        "type": "company",
    },
    {
        "id": "google_news_robotaxi",
        "name": "Google News 로보택시",
        "url": "https://news.google.com/rss/search?q=%EB%A1%9C%EB%B3%B4%ED%83%9D%EC%8B%9C+%ED%95%9C%EA%B5%AD&hl=ko&gl=KR&ceid=KR:ko",
        "type": "news",
    },
]

# ─── Logging ─────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ─── SSL Context (some Korean gov sites have cert issues) ────────────────────

def _make_ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


# ─── Core Functions ──────────────────────────────────────────────────────────

def load_crawl_log() -> dict:
    """Load existing crawl log or return empty structure."""
    if os.path.exists(CRAWL_LOG_FILE):
        with open(CRAWL_LOG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"sources": {}, "last_run": None}


def fetch_page(url: str) -> Tuple[Optional[bytes], Optional[str]]:
    """
    Fetch page body. Returns (body_bytes, error_message).
    On success: (bytes, None). On failure: (None, error_string).
    """
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; RobotaxiDashboard/1.0)",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5",
            },
        )
        ctx = _make_ssl_context()
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT, context=ctx) as resp:
            body = resp.read()
            return body, None
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}"
    except urllib.error.URLError as e:
        return None, f"URLError: {e.reason}"
    except TimeoutError:
        return None, "Timeout"
    except Exception as e:
        return None, str(e)


def compute_hash(body: bytes) -> str:
    """SHA256 hash of page body."""
    return hashlib.sha256(body).hexdigest()


def check_staleness(source_entry: dict) -> Optional[str]:
    """Return warning if source hasn't changed in STALE_DAYS+ days."""
    last_changed = source_entry.get("last_changed_at")
    if not last_changed:
        return None
    try:
        last_dt = datetime.fromisoformat(last_changed)
        delta = datetime.now(tz=timezone.utc) - last_dt
        if delta > timedelta(days=STALE_DAYS):
            return f"stale: no change in {delta.days} days"
    except (ValueError, TypeError):
        pass
    return None


def process_target(target: dict, crawl_log: dict) -> dict:
    """
    Fetch a target URL, compare hash, return result dict.

    Result keys: id, name, status, detail, hash, bytes, warning
    status: "changed" | "unchanged" | "error" | "new"
    """
    target_id = target["id"]
    url = target["url"]
    name = target["name"]

    source_entry = crawl_log.get("sources", {}).get(target_id, {})
    old_hash = source_entry.get("hash")

    result = {"id": target_id, "name": name, "url": url, "warning": None}

    body, error = fetch_page(url)

    if error:
        logger.warning("Failed to fetch %s: %s", name, error)
        result["status"] = "error"
        result["detail"] = error
        result["hash"] = old_hash  # keep old hash
        result["bytes"] = 0
        return result

    body_len = len(body)
    result["bytes"] = body_len

    # Broken page detection
    if body_len < MIN_PAGE_BYTES:
        logger.warning("%s returned only %d bytes (< %d), marking as broken", name, body_len, MIN_PAGE_BYTES)
        result["warning"] = f"broken: only {body_len} bytes"

    new_hash = compute_hash(body)
    result["hash"] = new_hash

    if old_hash is None:
        result["status"] = "new"
        result["detail"] = "first crawl"
        logger.info("[NEW] %s — first crawl (%d bytes)", name, body_len)
    elif new_hash != old_hash:
        result["status"] = "changed"
        result["detail"] = "hash differs from previous"
        logger.info("[CHANGED] %s — page updated (%d bytes)", name, body_len)
    else:
        result["status"] = "unchanged"
        result["detail"] = "same as previous"
        logger.info("[UNCHANGED] %s (%d bytes)", name, body_len)

    # Staleness check
    staleness = check_staleness(source_entry)
    if staleness and not result["warning"]:
        result["warning"] = staleness

    return result


def update_crawl_log(crawl_log: dict, results: list[dict]) -> dict:
    """Update crawl_log with new results."""
    now = datetime.now(tz=timezone.utc).isoformat()
    crawl_log["last_run"] = now

    if "sources" not in crawl_log:
        crawl_log["sources"] = {}

    for r in results:
        target_id = r["id"]
        existing = crawl_log["sources"].get(target_id, {})

        entry = {
            "name": r["name"],
            "url": r["url"],
            "hash": r["hash"],
            "last_checked_at": now,
            "last_status": r["status"],
            "bytes": r.get("bytes", 0),
        }

        # Track when the page last changed
        if r["status"] in ("changed", "new"):
            entry["last_changed_at"] = now
        else:
            entry["last_changed_at"] = existing.get("last_changed_at")

        # Preserve warning
        if r.get("warning"):
            entry["warning"] = r["warning"]

        crawl_log["sources"][target_id] = entry

    return crawl_log


def write_github_summary(results: list[dict]) -> None:
    """Write GitHub Actions Job Summary if running in CI."""
    summary_file = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary_file:
        logger.info("Not in GitHub Actions, skipping job summary")
        return

    lines = [
        "## 🔍 Company Page Change Detection",
        "",
        "| Source | Status | Bytes | Warning |",
        "|--------|--------|-------|---------|",
    ]

    status_emoji = {
        "changed": "🔴 Changed",
        "unchanged": "✅ Unchanged",
        "error": "⚠️ Error",
        "new": "🆕 New",
    }

    changes_found = False
    for r in results:
        status = status_emoji.get(r["status"], r["status"])
        warning = r.get("warning") or ""
        detail = r.get("detail", "")
        if r["status"] == "changed":
            changes_found = True
        lines.append(f"| {r['name']} | {status} | {r.get('bytes', 'N/A')} | {warning} |")

    lines.append("")
    if changes_found:
        lines.append("**⚡ Changes detected — manual review recommended.**")
    else:
        lines.append("No changes detected.")

    lines.append(f"\n_Last run: {datetime.now(tz=timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}_")

    with open(summary_file, "a", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    logger.info("Wrote GitHub Actions job summary")


# ─── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    logger.info("Starting company page change detection (%d targets)", len(MONITOR_TARGETS))

    crawl_log = load_crawl_log()
    results = []

    for target in MONITOR_TARGETS:
        result = process_target(target, crawl_log)
        results.append(result)

    crawl_log = update_crawl_log(crawl_log, results)
    atomic_write_json(CRAWL_LOG_FILE, crawl_log)

    write_github_summary(results)

    # Summary
    changed = sum(1 for r in results if r["status"] == "changed")
    errors = sum(1 for r in results if r["status"] == "error")
    new = sum(1 for r in results if r["status"] == "new")
    logger.info(
        "Done: %d changed, %d new, %d errors, %d unchanged",
        changed, new, errors,
        len(results) - changed - errors - new,
    )


if __name__ == "__main__":
    main()
