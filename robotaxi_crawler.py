"""
Korean Robotaxi Status Crawler
Google News RSS + Naver News RSS → data/news.json

Pipeline:
  Google News RSS + Naver News RSS
  (base queries + company-specific queries)
        │
        ▼
  parse XML → extract items
        │
        ▼
  deduplicate(url) + similar headline dedup
  vs existing news.json
        │
        ▼ new articles only
  RSS description → summary
  (meta description fallback)
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
import time
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from typing import Any

# ─── Constants ───────────────────────────────────────────────────────────────

GOOGLE_NEWS_RSS = "https://news.google.com/rss/search"
NAVER_NEWS_RSS = "https://news.search.naver.com/rss"
NEWS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "news.json")
COMPANIES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "companies.json")
MAX_ITEMS_PER_RUN = 50
BASE_QUERIES = [
    "자율주행택시",
    "로보택시 한국",
]
QUERY_DELAY = 1  # seconds between RSS fetches

USER_AGENT = "Mozilla/5.0 (compatible; RobotaxiDashboard/2.0)"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ─── Company Data ────────────────────────────────────────────────────────────

def load_company_keywords(companies_file: str) -> tuple[list[str], list[str]]:
    """Load company names from companies.json.
    Returns (search_queries, tag_keywords).
    """
    if not os.path.exists(companies_file):
        return [], []
    try:
        with open(companies_file, "r", encoding="utf-8") as f:
            companies = json.load(f)
    except (json.JSONDecodeError, IOError):
        return [], []

    queries = []
    keywords = []
    for c in companies:
        name = c.get("name", "")
        # Extract parts from "42dot (포티투닷)" → ["42dot", "포티투닷"]
        parts = re.split(r"[\s()（）]+", name)
        parts = [p for p in parts if len(p) >= 2]
        keywords.extend(parts)
        # Use first part as query (most recognizable name)
        if parts:
            queries.append(f"{parts[0]} 자율주행")
    return queries, keywords


# ─── Title/Source Parsing ────────────────────────────────────────────────────

def parse_title_source(raw_title: str) -> tuple[str, str]:
    """Split Google News RSS title 'Article Title - 매체명' into (headline, source).
    Returns (cleaned_headline, parsed_source). parsed_source may be empty.
    """
    raw_title = strip_html(raw_title)
    idx = raw_title.rfind(" - ")
    if idx < 0:
        return raw_title, ""
    candidate_source = raw_title[idx + 3:].strip()
    headline = raw_title[:idx].strip()
    # Source names are typically short (매체명). Skip if too long.
    if len(candidate_source) <= 30 and len(headline) > 0:
        return headline, candidate_source
    return raw_title, ""


# ─── RSS Fetch ───────────────────────────────────────────────────────────────

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
    req.add_header("User-Agent", USER_AGENT)

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
        source = source_el.text if source_el is not None and source_el.text else ""
        description = item_el.findtext("description", "")

        items.append({
            "title": title,
            "link": link,
            "pubDate": pub_date,
            "source": source,
            "description": description,
            "feed": "google",
        })

    logger.info("Google News RSS returned %d items for '%s'", len(items), query)
    return items


def fetch_naver_news_rss(query: str) -> list[dict]:
    """Fetch news from Naver News RSS. No API key needed."""
    encoded = urllib.parse.quote(query)
    url = f"{NAVER_NEWS_RSS}?query={encoded}&field=0&nx_search_query={encoded}"
    req = urllib.request.Request(url)
    req.add_header("User-Agent", USER_AGENT)

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            xml_data = resp.read().decode("utf-8")
    except Exception as e:
        logger.warning("Naver RSS fetch failed for '%s': %s", query, e)
        return []

    root = ET.fromstring(xml_data)
    channel = root.find("channel")
    if channel is None:
        logger.warning("No channel found in Naver RSS for '%s'", query)
        return []

    items = []
    for item_el in channel.findall("item"):
        title = item_el.findtext("title", "")
        link = item_el.findtext("link", "")
        pub_date = item_el.findtext("pubDate", "")
        description = item_el.findtext("description", "")
        # Naver RSS often includes source in title as well
        source_el = item_el.find("source")
        source = source_el.text if source_el is not None and source_el.text else ""

        items.append({
            "title": title,
            "link": link,
            "pubDate": pub_date,
            "source": source,
            "description": description,
            "feed": "naver",
        })

    logger.info("Naver News RSS returned %d items for '%s'", len(items), query)
    return items


def fetch_all_queries(queries: list[str]) -> list[dict]:
    """Fetch from multiple search queries via Google + Naver, merge, deduplicate by link."""
    seen_urls: set[str] = set()
    all_items: list[dict] = []

    for i, query in enumerate(queries):
        if i > 0:
            time.sleep(QUERY_DELAY)

        # Google News RSS
        try:
            items = fetch_google_news_rss(query)
            for item in items:
                link = item.get("link", "")
                if link and link not in seen_urls:
                    seen_urls.add(link)
                    all_items.append(item)
        except Exception as e:
            logger.warning("Failed to fetch Google RSS for '%s': %s", query, e)

        # Naver News RSS (only for base queries to avoid too many requests)
        if query in BASE_QUERIES:
            try:
                items = fetch_naver_news_rss(query)
                for item in items:
                    link = item.get("link", "")
                    if link and link not in seen_urls:
                        seen_urls.add(link)
                        all_items.append(item)
            except Exception as e:
                logger.warning("Failed to fetch Naver RSS for '%s': %s", query, e)

    logger.info("Total unique items across all queries: %d", len(all_items))
    return all_items


# ─── Deduplication ───────────────────────────────────────────────────────────

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


def _bigrams(s: str) -> set[str]:
    """Extract character bigrams from string (whitespace collapsed)."""
    s = re.sub(r"\s+", "", s)
    if len(s) < 2:
        return set()
    return {s[i:i+2] for i in range(len(s) - 1)}


def are_similar_headlines(h1: str, h2: str, threshold: float = 0.5) -> bool:
    """Check if two headlines are similar using bigram Jaccard similarity."""
    b1, b2 = _bigrams(h1), _bigrams(h2)
    if not b1 or not b2:
        return False
    return len(b1 & b2) / len(b1 | b2) >= threshold


def deduplicate_similar(items: list[dict], existing_headlines: list[str]) -> list[dict]:
    """Remove items with headlines similar to each other or recent existing headlines.
    When duplicates found, keep the one with the longer summary.
    """
    result: list[dict] = []
    reference = list(existing_headlines)

    for item in items:
        headline = item.get("headline", "")
        # Check against existing (external) headlines — cannot replace these
        dup_of_existing = any(
            are_similar_headlines(headline, ref) for ref in existing_headlines
        )
        if dup_of_existing:
            continue

        # Check against already-accepted items in this batch
        dup_idx = -1
        for i, accepted in enumerate(result):
            if are_similar_headlines(headline, accepted.get("headline", "")):
                dup_idx = i
                break

        if dup_idx >= 0:
            # Keep the one with longer summary
            if len(item.get("summary", "")) > len(result[dup_idx].get("summary", "")):
                result[dup_idx] = item
        else:
            result.append(item)

    removed = len(items) - len(result)
    if removed > 0:
        logger.info("Removed %d similar duplicate headlines", removed)
    return result


# ─── Text Processing ────────────────────────────────────────────────────────

def strip_html(text: str) -> str:
    """Remove HTML tags and unescape entities."""
    cleaned = re.sub(r"<[^>]+>", "", text)
    return unescape(cleaned).strip()


def infer_tags(headline: str, company_keywords: list[str] | None = None) -> list[str]:
    """Keyword-based tag inference. Dynamically includes company keywords."""
    base_company_kw = ["현대", "기아", "네이버", "웨이모", "휴맥스"]
    if company_keywords:
        all_company_kw = base_company_kw + company_keywords
    else:
        all_company_kw = base_company_kw + [
            "카카오", "42dot", "swm", "포니링크", "pony",
            "오토노머스", "autoa2z", "모셔널", "motional",
            "라이드플럭스", "rideflux", "쏘카", "socar",
            "SUM", "에스유엠",
        ]

    tag_map: dict[str, list[str]] = {
        "정책": ["국토교통부", "법안", "규제", "허가", "승인", "정부", "molit",
                "국회", "시범운행지구", "임시운행"],
        "기업": all_company_kw,
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


def fetch_meta_description(url: str, timeout: int = 5) -> str:
    """Fetch article page and extract meta description. Returns empty string on failure."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            html = resp.read(16384).decode("utf-8", errors="ignore")
        for pattern in [
            r'<meta\s+property=["\']og:description["\']\s+content=["\']([^"\']+)',
            r'<meta\s+name=["\']description["\']\s+content=["\']([^"\']+)',
            r'<meta\s+content=["\']([^"\']+)["\']\s+property=["\']og:description',
            r'<meta\s+content=["\']([^"\']+)["\']\s+name=["\']description',
        ]:
            m = re.search(pattern, html, re.IGNORECASE)
            if m:
                desc = unescape(m.group(1)).strip()
                if len(desc) > 30:
                    return desc[:300]
        return ""
    except Exception:
        return ""


def extract_summary(description: str, headline: str, url: str = "", feed: str = "") -> str:
    """
    Use RSS description as summary. Falls back to meta description or headline.
    Naver RSS usually has good descriptions; Google News often duplicates headline.
    """
    cleaned = strip_html(description)

    # Check if description is meaningfully different from headline
    if len(cleaned) > 20:
        desc_normalized = re.sub(r"\s+", "", cleaned)
        head_normalized = re.sub(r"\s+", "", headline)
        if desc_normalized != head_normalized:
            return cleaned[:300]

    # For Google News with useless description, try meta description
    if url and feed != "naver":
        meta = fetch_meta_description(url)
        if meta:
            return meta

    return headline[:200]


# ─── News Item Construction ─────────────────────────────────────────────────

def build_news_item(raw: dict, company_keywords: list[str] | None = None) -> dict:
    """Convert RSS item into our news.json schema."""
    raw_title = raw.get("title", "")
    url = raw.get("link", "")
    xml_source = raw.get("source", "")
    feed = raw.get("feed", "google")

    # Parse headline and source from title
    headline, title_source = parse_title_source(raw_title)

    # Source priority: XML <source> element > title suffix > domain fallback
    if xml_source:
        source = xml_source
    elif title_source:
        source = title_source
    else:
        source = urllib.parse.urlparse(url).netloc.replace("www.", "")

    summary = extract_summary(raw.get("description", ""), headline, url, feed)

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
        "tags": infer_tags(headline, company_keywords),
    }


# ─── Atomic Write ────────────────────────────────────────────────────────────

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


# ─── companies.json Read-Modify-Write ────────────────────────────────────────

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


# ─── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    logger.info("=== Robotaxi Crawler Start ===")

    # 0. Load company data for dynamic queries and tags
    company_queries, company_keywords = load_company_keywords(COMPANIES_FILE)
    all_queries = BASE_QUERIES + company_queries
    logger.info("Search queries: %d base + %d company-specific", len(BASE_QUERIES), len(company_queries))

    # 1. Fetch from Google News + Naver News RSS
    raw_items = fetch_all_queries(all_queries)

    # 2. Deduplicate by URL
    existing_urls = load_existing_urls(NEWS_FILE)
    new_items = filter_new_items(raw_items, existing_urls)

    if not new_items:
        logger.info("No new articles found — exiting")
        return

    # 3. Cap at MAX_ITEMS_PER_RUN
    to_process = new_items[:MAX_ITEMS_PER_RUN]
    logger.info("Processing %d articles (cap=%d)", len(to_process), MAX_ITEMS_PER_RUN)

    # 4. Build news items
    processed = []
    for i, item in enumerate(to_process):
        headline, _ = parse_title_source(strip_html(item.get("title", "")))
        logger.info("[%d/%d] %s", i + 1, len(to_process), headline[:80])
        news_item = build_news_item(item, company_keywords)
        processed.append(news_item)

    # 5. Deduplicate similar headlines
    existing_headlines = []
    if os.path.exists(NEWS_FILE):
        try:
            with open(NEWS_FILE, "r", encoding="utf-8") as f:
                existing_news = json.load(f)
            existing_headlines = [n.get("headline", "") for n in existing_news[:50]]
        except (json.JSONDecodeError, IOError):
            existing_news = []
    else:
        existing_news = []

    processed = deduplicate_similar(processed, existing_headlines)

    if not processed:
        logger.info("All articles were duplicates after similarity check — exiting")
        return

    # 6. Merge with existing and atomic-write
    merged = processed + existing_news
    atomic_write_json(NEWS_FILE, merged)
    logger.info("Total news items after merge: %d", len(merged))
    logger.info("=== Robotaxi Crawler Done ===")


if __name__ == "__main__":
    main()
