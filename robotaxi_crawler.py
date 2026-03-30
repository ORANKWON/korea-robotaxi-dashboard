"""
Korean Robotaxi Status Crawler
Phase 1: Google News RSS (no API key) → data/news.json

Pipeline:
  Google News RSS
  (query: '자율주행택시')
        │
        ▼
  parse XML → extract items
        │
        ▼
  deduplicate(url)
  vs existing news.json
        │
        ▼ new articles only
  RSS description → summary
  (no API key needed)
        │
        ▼
  atomic write
  news.json.tmp → validate → os.replace()

Usage:
  python robotaxi_crawler.py
  (API 키 불필요)
"""

import os
import re
import json
import logging
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from typing import Any

# ─── Constants ───────────────────────────────────────────────────────────────

GOOGLE_NEWS_RSS = "https://news.google.com/rss/search"
NEWS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "news.json")
COMPANIES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "companies.json")
MAX_ITEMS_PER_RUN = 30
SEARCH_QUERIES = [
    "자율주행택시",
    "로보택시 한국",
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ─── RSS Fetch ────────────────────────────────────────────────────────────────

def fetch_google_news_rss(query: str) -> list[dict]:
    """Fetch news from Google News RSS. No API key needed."""
    params = urllib.parse.urlencode({
        "q": query,
        "hl": "ko",
        "gl": "KR",
        "ceid": "KR:ko",
    })
    url = f"{GOOGLE_NEWS_RSS}?{params}"
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "RobotaxiDashboard/1.0")

    with urllib.request.urlopen(req, timeout=15) as resp:
        xml_data = resp.read().decode("utf-8")

    root = ET.fromstring(xml_data)
    channel = root.find("channel")
    if channel is None:
        logger.warning("No channel found in RSS for '%s'", query)
        return []

    items = []
    for item_el in channel.findall("item"):
        title = item_el.findtext("title", "")
        link = item_el.findtext("link", "")
        pub_date = item_el.findtext("pubDate", "")
        source_el = item_el.find("source")
        source = source_el.text if source_el is not None else ""
        description = item_el.findtext("description", "")

        items.append({
            "title": title,
            "link": link,
            "pubDate": pub_date,
            "source": source,
            "description": description,
        })

    logger.info("Google News RSS returned %d items for '%s'", len(items), query)
    return items


def fetch_all_queries(queries: list[str]) -> list[dict]:
    """Fetch from multiple search queries and merge, deduplicate by link."""
    seen_urls = set()
    all_items = []
    for query in queries:
        try:
            items = fetch_google_news_rss(query)
            for item in items:
                link = item.get("link", "")
                if link and link not in seen_urls:
                    seen_urls.add(link)
                    all_items.append(item)
        except Exception as e:
            logger.warning("Failed to fetch RSS for '%s': %s", query, e)
    logger.info("Total unique items across all queries: %d", len(all_items))
    return all_items


# ─── Deduplication ────────────────────────────────────────────────────────────

def load_existing_urls(news_file: str) -> set[str]:
    """Load URLs already in news.json for deduplication."""
    if not os.path.exists(news_file):
        return set()
    try:
        with open(news_file, "r", encoding="utf-8") as f:
            existing = json.load(f)
        return {item["url"] for item in existing if "url" in item}
    except (json.JSONDecodeError, KeyError):
        logger.warning("Could not parse %s — treating as empty", news_file)
        return set()


def filter_new_items(items: list[dict], existing_urls: set[str]) -> list[dict]:
    """Return only items whose link is not already stored."""
    new_items = []
    for item in items:
        url = item.get("link", "")
        if url and url not in existing_urls:
            new_items.append(item)
    logger.info("%d new items after deduplication", len(new_items))
    return new_items


# ─── Text Processing ─────────────────────────────────────────────────────────

def strip_html(text: str) -> str:
    """Remove HTML tags and unescape entities."""
    cleaned = re.sub(r"<[^>]+>", "", text)
    return unescape(cleaned).strip()


def infer_tags(headline: str) -> list[str]:
    """Simple keyword-based tag inference."""
    tag_map = {
        "정책": ["국토교통부", "법안", "규제", "허가", "승인", "정부", "molit"],
        "기업": ["카카오", "42dot", "swm", "planv", "현대", "기아", "네이버", "웨이모"],
        "사고": ["사고", "충돌", "추돌", "위반"],
        "서비스": ["운행", "시범", "상용화", "서비스", "확대"],
        "해외": ["미국", "중국", "일본", "구글", "테슬라", "waymo", "baidu"],
    }
    tags = []
    lower = headline.lower()
    for tag, keywords in tag_map.items():
        if any(kw.lower() in lower for kw in keywords):
            tags.append(tag)
    return tags or ["일반"]


def extract_summary(description: str, headline: str) -> str:
    """
    Use RSS description as summary. If empty/too short, fall back to headline.
    Google News RSS descriptions contain a short snippet from the article.
    """
    cleaned = strip_html(description)
    if len(cleaned) > 20:
        return cleaned[:300]
    return headline[:200]


# ─── News Item Construction ───────────────────────────────────────────────────

def build_news_item(raw: dict) -> dict:
    """Convert RSS item into our news.json schema."""
    headline = strip_html(raw.get("title", ""))
    url = raw.get("link", "")
    source = raw.get("source", "")
    if not source:
        source = urllib.parse.urlparse(url).netloc.replace("www.", "")
    summary = extract_summary(raw.get("description", ""), headline)

    pub_date_str = raw.get("pubDate", "")
    try:
        pub_dt = parsedate_to_datetime(pub_date_str)
        published_at = pub_dt.isoformat()
    except Exception:
        published_at = datetime.now(tz=timezone.utc).isoformat()

    return {
        "headline": headline,
        "summary": summary,
        "source": source,
        "url": url,
        "published_at": published_at,
        "tags": infer_tags(headline),
    }


# ─── Atomic Write ─────────────────────────────────────────────────────────────

def atomic_write_json(path: str, data: Any) -> None:
    """
    Write JSON atomically: write to .tmp → validate → os.replace().
    Prevents partial writes from corrupting the live file.
    """
    tmp_path = path + ".tmp"
    serialized = json.dumps(data, ensure_ascii=False, indent=2)
    # Validate before writing to disk
    json.loads(serialized)
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(serialized)
    os.replace(tmp_path, path)
    logger.info("Wrote %d bytes to %s", len(serialized), path)


# ─── companies.json Read-Modify-Write ─────────────────────────────────────────

def update_companies_notes(companies_file: str, updates: dict[str, str]) -> None:
    """
    Read-modify-write: only update the `notes` field for named companies.
    Preserves all other fields (SAE level, vehicle_model, zones, etc.)
    to protect manual curation data.

    updates = {"카카오모빌리티": "새 운영 소식 요약...", ...}
    """
    if not os.path.exists(companies_file):
        logger.warning("%s not found — skipping companies update", companies_file)
        return
    if not updates:
        return

    with open(companies_file, "r", encoding="utf-8") as f:
        companies = json.load(f)

    changed = False
    for company in companies:
        name = company.get("name", "")
        if name in updates:
            company["notes"] = updates[name]
            company["updated_at"] = datetime.now(tz=timezone.utc).isoformat()
            changed = True
            logger.info("Updated notes for %s", name)

    if changed:
        atomic_write_json(companies_file, companies)


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    logger.info("=== Robotaxi Crawler Start ===")

    # 1. Fetch from Google News RSS
    raw_items = fetch_all_queries(SEARCH_QUERIES)

    # 2. Deduplicate
    existing_urls = load_existing_urls(NEWS_FILE)
    new_items = filter_new_items(raw_items, existing_urls)

    if not new_items:
        logger.info("No new articles found — exiting")
        return

    # 3. Cap at MAX_ITEMS_PER_RUN
    to_process = new_items[:MAX_ITEMS_PER_RUN]
    logger.info("Processing %d articles (cap=%d)", len(to_process), MAX_ITEMS_PER_RUN)

    # 4. Build news items (no API key needed — uses RSS description)
    processed = []
    for i, item in enumerate(to_process):
        headline = strip_html(item.get("title", ""))
        logger.info("[%d/%d] %s", i + 1, len(to_process), headline[:80])
        news_item = build_news_item(item)
        processed.append(news_item)

    # 5. Merge with existing and atomic-write
    if os.path.exists(NEWS_FILE):
        with open(NEWS_FILE, "r", encoding="utf-8") as f:
            try:
                existing_news = json.load(f)
            except json.JSONDecodeError:
                existing_news = []
    else:
        existing_news = []

    # Prepend new items (newest first)
    merged = processed + existing_news
    atomic_write_json(NEWS_FILE, merged)
    logger.info("Total news items after merge: %d", len(merged))
    logger.info("=== Robotaxi Crawler Done ===")


if __name__ == "__main__":
    main()
