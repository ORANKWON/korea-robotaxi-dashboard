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
    # 핵심 주제
    "자율주행택시",
    "로보택시 한국",
    "로보택시 상용화",
    # 2026 현재 트렌드
    "자율주행 유료 운행",
    "Level 4 자율주행",
    "무인 자율주행",
    # 제도·구역
    "자율주행 시범운행지구",
    "자율주행 임시운행",
    # 지역 핫스팟
    "강남 자율주행택시",
    "심야 자율주행",
    # 글로벌 맥락
    "웨이모 한국",
    "포니에이아이 한국",
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
        if not parts:
            continue
        # Primary query: most recognizable name + "자율주행"
        queries.append(f"{parts[0]} 자율주행")
        # Secondary query: vary term based on vehicle type for better coverage
        vehicle = c.get("vehicle_model", "")
        if "버스" in vehicle or "셔틀" in vehicle:
            queries.append(f"{parts[0]} 자율주행버스")
        else:
            queries.append(f"{parts[0]} 로보택시")
    return queries, keywords


# ─── Title/Source Parsing ────────────────────────────────────────────────────

# Delimiters tried in order. End-anchored: only the LAST occurrence of any
# of these counts as a source separator.
_TITLE_DELIMITERS = (" - ", " | ", " · ")


def parse_title_source(raw_title: str) -> tuple[str, str]:
    """Split RSS title into (headline, source).

    Recognized formats:
      "헤드라인 - 매체명"
      "헤드라인 | 매체명"
      "헤드라인 · 매체명"

    Source must be ≤30 chars, non-empty, and contain no parens
    (avoids matching '(법안명)' or '(2026)' as a publication name).
    Returns (raw_title, "") when no clean split is possible.
    """
    raw_title = strip_html(raw_title)
    # Pick the rightmost split across all delimiters (last delim wins, then
    # within same delim the rightmost occurrence wins — matches "A - B - 매체명").
    best_idx = -1
    best_delim_len = 0
    for delim in _TITLE_DELIMITERS:
        idx = raw_title.rfind(delim)
        if idx > best_idx:
            best_idx = idx
            best_delim_len = len(delim)
    if best_idx < 0:
        return raw_title, ""
    candidate_source = raw_title[best_idx + best_delim_len:].strip()
    headline = raw_title[:best_idx].strip()
    if not (0 < len(candidate_source) <= 30) or not headline:
        return raw_title, ""
    # Reject parens — likely not a publisher name
    if "(" in candidate_source or ")" in candidate_source:
        return raw_title, ""
    return headline, candidate_source


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
    """Check if two headlines are similar using bigram Jaccard similarity.

    The default threshold (0.5) is conservative for backward compatibility.
    deduplicate_similar() picks per-pair thresholds based on source match.
    Calibration script (scripts/calibrate_dedup.py) writes the production
    thresholds to tests/fixtures/dedup_thresholds.json.
    """
    b1, b2 = _bigrams(h1), _bigrams(h2)
    if not b1 or not b2:
        return False
    return len(b1 & b2) / len(b1 | b2) >= threshold


# Production thresholds — calibrated by scripts/calibrate_dedup.py against
# the live news.json corpus on 2026-04-17 (see tests/fixtures/dedup_thresholds.json).
# Lower threshold = MORE aggressive dedup.
#   - Same-source: re-posts by the same publisher are common (safe to drop).
#   - Cross-source: different angles on the same event add value (be conservative).
# Plan originally guessed 0.45/0.6; calibration nudged same-source up to ~0.51
# to avoid false positives on the actual Korean headline distribution.
# Re-run calibration quarterly (TODO-015) and after major crawler changes.
DEDUP_THRESHOLD_CROSS_SOURCE = 0.6
DEDUP_THRESHOLD_SAME_SOURCE = 0.51


def deduplicate_similar(
    items: list[dict],
    existing_headlines: list,
    threshold_cross: float = DEDUP_THRESHOLD_CROSS_SOURCE,
    threshold_same: float = DEDUP_THRESHOLD_SAME_SOURCE,
) -> list[dict]:
    """Remove items with headlines similar to each other or recent existing.

    `existing_headlines` accepts either:
      - list[str] — legacy, treated as cross-source comparisons (no source info)
      - list[tuple[str, str]] — (headline, source) for source-aware threshold

    When in-batch duplicates are found, keep the item with the longer summary.
    """
    result: list[dict] = []

    for item in items:
        headline = item.get("headline", "")
        source = item.get("source", "")

        # Check against existing (external) headlines — cannot replace these
        dup_of_existing = False
        for ref in existing_headlines:
            if isinstance(ref, tuple):
                ref_h, ref_s = ref
                t = threshold_same if (ref_s and source and source == ref_s) else threshold_cross
            else:
                ref_h = ref
                t = threshold_cross
            if are_similar_headlines(headline, ref_h, t):
                dup_of_existing = True
                break
        if dup_of_existing:
            continue

        # Check against already-accepted items in this batch
        dup_idx = -1
        for i, accepted in enumerate(result):
            accepted_source = accepted.get("source", "")
            t = threshold_same if (accepted_source and source and source == accepted_source) else threshold_cross
            if are_similar_headlines(headline, accepted.get("headline", ""), t):
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
    """Keyword-based tag inference. Dynamically includes company keywords.

    Returns high-level taxonomy tags (정책/기업/사고/서비스/해외).
    For specific company entity matching, use infer_companies() instead.
    """
    # Base domestic + global player keywords for the 기업 tag
    base_company_kw = [
        # Domestic
        "현대", "기아", "네이버", "휴맥스", "카카오", "42dot", "포티투닷",
        "swm", "포니링크", "pony", "오토노머스", "autoa2z", "모셔널", "motional",
        "라이드플럭스", "rideflux", "쏘카", "socar", "SUM", "에스유엠",
        # Global players (relevant to Korean market context)
        "웨이모", "waymo", "우버", "uber", "GM", "cruise", "zoox", "wayve",
        "aurora", "mobileye", "nvidia", "apollo", "바이두", "baidu", "텐센트",
        "tencent", "비야디", "BYD", "샤오펑", "xpeng", "니오", "nio", "리오토",
        "li auto", "tesla", "테슬라", "구글",
    ]
    all_company_kw = base_company_kw + (company_keywords or [])

    tag_map: dict[str, list[str]] = {
        "정책": [
            "국토교통부", "법안", "규제", "허가", "승인", "정부", "molit",
            "국회", "시범운행지구", "임시운행", "도로교통법", "자동차관리법",
            "운수사업법", "임시운행허가", "지정", "고시", "공포", "입법",
        ],
        "기업": all_company_kw,
        "사고": [
            "사고", "충돌", "추돌", "위반", "사망", "부상", "탑승자", "보행자",
            "신호위반", "무인 사고",
        ],
        "서비스": [
            "운행", "시범", "상용화", "서비스", "확대", "유료", "요금",
            "24시간", "심야", "무인", "원격",
        ],
        "해외": [
            "미국", "중국", "일본", "유럽", "독일", "영국", "구글",
            "테슬라", "waymo", "baidu", "san francisco", "샌프란시스코",
        ],
    }
    tags = []
    lower = headline.lower()
    for tag, keywords in tag_map.items():
        if any(kw.lower() in lower for kw in keywords):
            tags.append(tag)
    return tags or ["일반"]


# Aliases that are too short or too generic to safely substring-match against
# Korean text. Bare "현대" matches 현대백화점/현대카드/현대제철 etc — we only
# want to match it when it's part of a longer canonical name like 현대차.
_DANGEROUS_BARE_ALIASES = frozenset({"현대", "기아", "GM", "SUM", "현"})


def _is_latin(s: str) -> bool:
    """Check if a string is purely ASCII alphanumeric (and dots/hyphens)."""
    return bool(re.match(r"^[A-Za-z0-9.\-]+$", s))


def infer_companies(headline: str, companies_data: list[dict]) -> list[str]:
    """Hangul-aware company entity matching.

    Returns canonical company names matched in the headline.

    Matching rules:
      - Latin aliases (e.g. "Pony", "Motional"): regex with negative
        lookbehind/lookahead for [A-Za-z0-9] — matches "Pony" but not "PonyExpress".
      - Hangul aliases (e.g. "쏘카", "포티투닷"): substring match (Korean has
        no whitespace word boundaries — \\b is unsafe).
      - Dangerous bare aliases ("현대", "기아", "GM") are filtered out — too
        ambiguous to match safely.

    Each company contributes its `name` field plus any `aliases` from companies.json.
    """
    if not companies_data:
        return []

    matched: list[str] = []
    for company in companies_data:
        canonical = company.get("name", "")
        if not canonical:
            continue
        # Build candidate alias list: explicit aliases + tokens from canonical name
        alias_set: set[str] = set(company.get("aliases", []) or [])
        for part in re.split(r"[\s()（）/,]+", canonical):
            part = part.strip()
            if len(part) >= 2:
                alias_set.add(part)
        # Drop dangerous bare aliases
        aliases = [a for a in alias_set if a and a not in _DANGEROUS_BARE_ALIASES]

        for alias in aliases:
            if _is_latin(alias):
                pattern = rf"(?<![A-Za-z0-9]){re.escape(alias)}(?![A-Za-z0-9])"
                if re.search(pattern, headline, re.IGNORECASE):
                    matched.append(canonical)
                    break
            else:
                # Hangul or mixed — substring is safe given dangerous aliases removed
                if alias in headline:
                    matched.append(canonical)
                    break
    return matched


def unwrap_redirect_url(url: str, timeout: int = 5) -> tuple[str, bool]:
    """Unwrap Google News redirect URL to publisher URL.

    Returns (final_url, success).
    - Non-Google URLs: returned unchanged with success=True (already direct).
    - Google News URLs: decoded via googlenewsdecoder if available.
    - On any failure: returns (original_url, False).

    Why this matters:
      Google News RSS encodes publisher URLs as base64 inside
      `https://news.google.com/rss/articles/CBMi…`. Fetching the meta description
      against the redirect URL returns Google's interstitial blurb, NOT the article.
      That junk would then be cached as `summary` forever. The unwrap-first guard
      in extract_summary depends on this function to know whether meta-fetch is safe.
    """
    if not url:
        return url, False
    if "news.google.com" not in url:
        return url, True
    try:
        # Lazy import — keeps the package optional in dev environments.
        from googlenewsdecoder import gnewsdecoder  # type: ignore
        result = gnewsdecoder(url, interval=1)
        if result and result.get("status") and result.get("decoded_url"):
            return result["decoded_url"], True
    except ImportError:
        logger.warning("googlenewsdecoder not installed; URL unwrap disabled")
    except Exception as e:
        logger.debug("Unwrap failed for %s: %s", url[:80], e)
    return url, False


def fetch_meta_description(url: str, timeout: int = 5) -> str:
    """Fetch article page and extract meta description. Returns empty string on failure.

    SAFETY: callers must NOT pass Google News redirect URLs here. The redirect
    page returns Google's generic interstitial blurb which would be cached as junk.
    Use unwrap_redirect_url() first; if unwrap fails, skip this entirely.
    """
    if not url or "news.google.com" in url:
        # Defensive: refuse to fetch against the redirect page even if a caller forgot.
        return ""
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


def extract_summary(
    description: str,
    headline: str,
    url: str = "",
    feed: str = "",
    final_url: str = "",
) -> str:
    """
    Pipeline (locked-in by /plan-eng-review 2026-04-17):

        raw description (RSS)
          → if non-empty + meaningfully differs from headline → use it
          → else if final_url is direct (not Google redirect) → fetch_meta_description(final_url)
          → else → truncated headline (NEVER fetch meta against redirect URL)

    The unwrap-first guard ensures we never cache Google's interstitial blurb
    as summary. Failure path explicitly returns truncated headline rather than junk.

    Naver RSS already has good descriptions, so meta fetch is skipped for naver feed.
    """
    cleaned = strip_html(description)

    # Path 1: RSS description is meaningful and not a headline copy
    if len(cleaned) > 20:
        desc_normalized = re.sub(r"\s+", "", cleaned)
        head_normalized = re.sub(r"\s+", "", headline)
        if desc_normalized != head_normalized:
            return cleaned[:300]

    # Path 2: Direct fetch only against unwrapped (non-Google) URL
    if feed != "naver":
        # Prefer explicit final_url (caller already unwrapped). Fall back to
        # url ONLY if it's already a direct publisher URL.
        fetchable = final_url if final_url else (url if url and "news.google.com" not in url else "")
        if fetchable:
            meta = fetch_meta_description(fetchable)
            if meta:
                return meta

    # Path 3: Truncated headline — better than caching junk
    return headline[:200]


# ─── News Item Construction ─────────────────────────────────────────────────

def build_news_item(
    raw: dict,
    company_keywords: list[str] | None = None,
    companies_data: list[dict] | None = None,
    *,
    do_unwrap: bool = True,
) -> dict:
    """Convert RSS item into our news.json schema.

    Pipeline (locked-in by /plan-eng-review 2026-04-17):
      1. parse_title_source → headline, optional source from title
      2. unwrap_redirect_url → final_url + success flag
      3. source priority: <source> XML > title suffix > domain of FINAL url
      4. extract_summary with unwrap-first guard (no junk Google interstitial)
      5. infer_tags + infer_companies (separate concerns: taxonomy vs entity)

    Optional fields written only when present:
      - final_url: only if unwrap succeeded AND yielded a different URL
      - companies: only if infer_companies returned matches
    """
    raw_title = raw.get("title", "")
    url = raw.get("link", "")
    xml_source = raw.get("source", "")
    feed = raw.get("feed", "google")

    headline, title_source = parse_title_source(raw_title)

    # Step 2: unwrap BEFORE meta-fetch and BEFORE source-from-domain fallback.
    if do_unwrap:
        final_url, unwrap_ok = unwrap_redirect_url(url)
    else:
        final_url, unwrap_ok = url, ("news.google.com" not in (url or ""))

    # Step 3: source priority. For domain fallback, prefer the unwrapped URL
    # so we get '한국경제' instead of 'news.google.com'.
    if xml_source:
        source = xml_source
    elif title_source:
        source = title_source
    else:
        source_url = final_url if unwrap_ok else url
        source = urllib.parse.urlparse(source_url).netloc.replace("www.", "")

    # Step 4: extract_summary with the unwrap-first guard.
    summary = extract_summary(
        raw.get("description", ""),
        headline,
        url=url,
        feed=feed,
        final_url=final_url if unwrap_ok else "",
    )

    pub_date_str = raw.get("pubDate", "")
    try:
        pub_dt = parsedate_to_datetime(pub_date_str)
        published_at = pub_dt.isoformat()
    except Exception:
        published_at = datetime.now(tz=timezone.utc).isoformat()

    item: dict = {
        "headline": headline,
        "summary": summary,
        "source": source,
        "url": url,
        "published_at": published_at,
        "tags": infer_tags(headline, company_keywords),
    }
    # Optional fields — only attached when present (keep schema lean)
    if unwrap_ok and final_url and final_url != url:
        item["final_url"] = final_url
    if companies_data:
        companies = infer_companies(headline, companies_data)
        if companies:
            item["companies"] = companies
    return item


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

def _check_crawl_lock() -> bool:
    """Check for backfill lockfile. Returns True if safe to run, False if locked."""
    lock_path = os.path.join(os.path.dirname(NEWS_FILE), ".crawl.lock")
    if os.path.exists(lock_path):
        try:
            with open(lock_path, "r", encoding="utf-8") as f:
                contents = f.read().strip()
        except IOError:
            contents = "(unreadable)"
        logger.warning(
            "Backfill lockfile present at %s (contents: %s) — exiting cleanly. "
            "Re-run after backfill completes.",
            lock_path, contents,
        )
        return False
    return True


def _load_companies_data() -> list[dict]:
    """Load companies.json. Returns empty list on missing/corrupt file."""
    if not os.path.exists(COMPANIES_FILE):
        return []
    try:
        with open(COMPANIES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []


def main() -> None:
    logger.info("=== Robotaxi Crawler Start ===")

    # 0a. Backfill safety: refuse to run if backfill is in progress.
    # See /plan-eng-review 2026-04-17 — 3-layer guard against races.
    if not _check_crawl_lock():
        return

    # 0b. Load company data for dynamic queries, tags, and entity matching.
    company_queries, company_keywords = load_company_keywords(COMPANIES_FILE)
    companies_data = _load_companies_data()
    all_queries = BASE_QUERIES + company_queries
    logger.info(
        "Search queries: %d base + %d company-specific (%d companies loaded)",
        len(BASE_QUERIES), len(company_queries), len(companies_data),
    )

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

    # 4. Build news items (unwrap + summary + tags + companies)
    processed = []
    unwrap_attempted = 0
    unwrap_success = 0
    for i, item in enumerate(to_process):
        headline_preview, _ = parse_title_source(strip_html(item.get("title", "")))
        logger.info("[%d/%d] %s", i + 1, len(to_process), headline_preview[:80])
        news_item = build_news_item(item, company_keywords, companies_data)
        # Track unwrap success rate for crawl_log observability (TODO-016)
        if "news.google.com" in (item.get("link") or ""):
            unwrap_attempted += 1
            if "final_url" in news_item:
                unwrap_success += 1
        processed.append(news_item)

    if unwrap_attempted:
        rate = 100.0 * unwrap_success / unwrap_attempted
        logger.info(
            "URL unwrap success: %d/%d (%.1f%%)",
            unwrap_success, unwrap_attempted, rate,
        )

    # 5. Deduplicate similar headlines (source-aware thresholds).
    existing_news: list[dict] = []
    existing_pairs: list[tuple[str, str]] = []
    if os.path.exists(NEWS_FILE):
        try:
            with open(NEWS_FILE, "r", encoding="utf-8") as f:
                existing_news = json.load(f)
            # Compare against the most recent 50 — bounded cost, recent matters most
            existing_pairs = [
                (n.get("headline", ""), n.get("source", ""))
                for n in existing_news[:50]
            ]
        except (json.JSONDecodeError, IOError):
            existing_news = []

    processed = deduplicate_similar(processed, existing_pairs)

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
