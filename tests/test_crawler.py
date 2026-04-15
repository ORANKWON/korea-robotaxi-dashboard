"""
Unit tests for robotaxi_crawler.py

Run: pytest tests/test_crawler.py -v
"""

import json
import os
import sys
from unittest.mock import patch

import pytest

# Allow importing crawler from parent directory
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import robotaxi_crawler as crawler


# ─── Test: strip_html ────────────────────────────────────────────────────────

def test_strip_html_removes_tags():
    assert crawler.strip_html("<b>자율주행택시</b> 확대") == "자율주행택시 확대"


def test_strip_html_no_tags():
    assert crawler.strip_html("일반 텍스트") == "일반 텍스트"


def test_strip_html_unescapes_entities():
    assert crawler.strip_html("A &amp; B") == "A & B"


# ─── Test: parse_title_source ────────────────────────────────────────────────

def test_parse_title_source_splits_correctly():
    headline, source = crawler.parse_title_source("자율주행택시 확대 - 한국경제")
    assert headline == "자율주행택시 확대"
    assert source == "한국경제"


def test_parse_title_source_uses_last_dash():
    headline, source = crawler.parse_title_source("자율주행 - Level 4 시험 - 디지털투데이")
    assert headline == "자율주행 - Level 4 시험"
    assert source == "디지털투데이"


def test_parse_title_source_no_dash():
    headline, source = crawler.parse_title_source("자율주행택시 뉴스")
    assert headline == "자율주행택시 뉴스"
    assert source == ""


def test_parse_title_source_long_suffix_ignored():
    # If the suffix is too long (>30 chars), treat entire string as headline
    long_suffix = "a" * 35
    raw = f"제목 - {long_suffix}"
    headline, source = crawler.parse_title_source(raw)
    assert headline == raw
    assert source == ""


def test_parse_title_source_portal_domain():
    headline, source = crawler.parse_title_source("무뇨스 현대차 사장 발언 - v.daum.net")
    assert headline == "무뇨스 현대차 사장 발언"
    assert source == "v.daum.net"


# ─── Test: infer_tags ────────────────────────────────────────────────────────

def test_infer_tags_policy():
    tags = crawler.infer_tags("국토교통부, 자율주행 허가 기준 발표")
    assert "정책" in tags


def test_infer_tags_default_when_no_match():
    tags = crawler.infer_tags("오늘 날씨가 맑습니다")
    assert tags == ["일반"]


def test_infer_tags_multiple():
    tags = crawler.infer_tags("카카오모빌리티, 국토교통부 규제 승인 받아 서비스 확대")
    assert "기업" in tags
    assert "정책" in tags


def test_infer_tags_with_company_keywords():
    tags = crawler.infer_tags("쏘카 자율주행 청사진 공개", ["쏘카", "SOCAR"])
    assert "기업" in tags


def test_infer_tags_new_policy_keywords():
    tags = crawler.infer_tags("국회 시범운행지구 관련 법안 논의")
    assert "정책" in tags


def test_infer_tags_new_company_names():
    """Test that companies previously missing from keywords are now detected."""
    assert "기업" in crawler.infer_tags("라이드플럭스 프리IPO 200억 유치")
    assert "기업" in crawler.infer_tags("오토노머스에이투지 시리즈C 투자")
    assert "기업" in crawler.infer_tags("포니링크 강남 시험운행 확대")
    assert "기업" in crawler.infer_tags("모셔널 마포 무인 로보택시")


# ─── Test: load_existing_urls ────────────────────────────────────────────────

def test_load_existing_urls_empty_when_file_missing(tmp_path):
    missing = str(tmp_path / "nonexistent.json")
    assert crawler.load_existing_urls(missing) == set()


def test_load_existing_urls_returns_url_set(tmp_path):
    news_file = tmp_path / "news.json"
    news_file.write_text(json.dumps([
        {"url": "https://example.com/a", "headline": "A"},
        {"url": "https://example.com/b", "headline": "B"},
    ]))
    urls = crawler.load_existing_urls(str(news_file))
    assert urls == {"https://example.com/a", "https://example.com/b"}


def test_load_existing_urls_handles_corrupt_json(tmp_path):
    bad_file = tmp_path / "bad.json"
    bad_file.write_text("not json {{{")
    assert crawler.load_existing_urls(str(bad_file)) == set()


# ─── Test: filter_new_items ──────────────────────────────────────────────────

def test_filter_new_items_removes_duplicates():
    existing = {"https://example.com/old"}
    items = [
        {"link": "https://example.com/old", "title": "Old"},
        {"link": "https://example.com/new", "title": "New"},
    ]
    result = crawler.filter_new_items(items, existing)
    assert len(result) == 1
    assert result[0]["title"] == "New"


def test_filter_new_items_all_new():
    result = crawler.filter_new_items(
        [{"link": "https://example.com/x", "title": "X"}],
        set(),
    )
    assert len(result) == 1


# ─── Test: are_similar_headlines ─────────────────────────────────────────────

def test_similar_headlines_detects_duplicates():
    h1 = "카카오모빌리티 강남 심야 자율주행택시 서비스 합류"
    h2 = "카카오모빌리티, 강남 심야 자율주행택시 서비스에 합류"
    assert crawler.are_similar_headlines(h1, h2)


def test_similar_headlines_near_identical():
    h1 = "카카오 자율주행 강남 합류 소식"
    h2 = "카카오 자율주행 강남 합류 뉴스"
    assert crawler.are_similar_headlines(h1, h2)


def test_similar_headlines_different_topics():
    h1 = "카카오모빌리티 강남 자율주행 합류"
    h2 = "웨이모 런던서 자율주행 첫발"
    assert not crawler.are_similar_headlines(h1, h2)


def test_similar_headlines_identical():
    h = "자율주행택시 확대"
    assert crawler.are_similar_headlines(h, h)


def test_similar_headlines_empty():
    assert not crawler.are_similar_headlines("", "")


# ─── Test: deduplicate_similar ───────────────────────────────────────────────

def test_deduplicate_similar_removes_duplicates():
    items = [
        {"headline": "카카오 자율주행 강남 합류 소식", "summary": "짧은 요약"},
        {"headline": "카카오 자율주행 강남 합류 뉴스", "summary": "더 긴 요약입니다 상세 내용"},
    ]
    result = crawler.deduplicate_similar(items, [])
    assert len(result) == 1
    # Should keep the one with longer summary
    assert "더 긴" in result[0]["summary"]


def test_deduplicate_similar_keeps_unique():
    items = [
        {"headline": "카카오 강남 합류", "summary": "요약1"},
        {"headline": "웨이모 런던 진출", "summary": "요약2"},
    ]
    result = crawler.deduplicate_similar(items, [])
    assert len(result) == 2


def test_deduplicate_similar_against_existing():
    items = [
        {"headline": "카카오 자율주행 강남 합류 소식", "summary": "요약"},
    ]
    existing = ["카카오 자율주행 강남 합류 발표"]
    result = crawler.deduplicate_similar(items, existing)
    assert len(result) == 0


# ─── Test: load_company_keywords ─────────────────────────────────────────────

def test_load_company_keywords(tmp_path):
    companies_file = tmp_path / "companies.json"
    companies_file.write_text(json.dumps([
        {"name": "42dot (포티투닷)", "id": 1},
        {"name": "SWM", "id": 2},
        {"name": "쏘카 (SOCAR)", "id": 3},
    ]))
    queries, keywords = crawler.load_company_keywords(str(companies_file))
    assert any("42dot" in q for q in queries)
    assert any("SWM" in q for q in queries)
    assert any("쏘카" in q for q in queries)
    assert "42dot" in keywords
    assert "포티투닷" in keywords
    assert "SOCAR" in keywords


def test_load_company_keywords_missing_file(tmp_path):
    queries, keywords = crawler.load_company_keywords(str(tmp_path / "nope.json"))
    assert queries == []
    assert keywords == []


# ─── Test: atomic_write_json ─────────────────────────────────────────────────

def test_atomic_write_json_creates_file(tmp_path):
    target = str(tmp_path / "out.json")
    data = [{"key": "value"}]
    crawler.atomic_write_json(target, data)
    assert os.path.exists(target)
    with open(target) as f:
        loaded = json.load(f)
    assert loaded == data


def test_atomic_write_json_no_tmp_left_on_success(tmp_path):
    target = str(tmp_path / "out.json")
    crawler.atomic_write_json(target, {"ok": True})
    assert not os.path.exists(target + ".tmp")


# ─── Test: update_companies_notes ────────────────────────────────────────────

def test_update_companies_notes_modifies_only_notes(tmp_path):
    companies_file = tmp_path / "companies.json"
    original = [
        {
            "name": "카카오모빌리티",
            "level": 4,
            "zones": ["강남·서초"],
            "notes": "기존 메모",
            "updated_at": "2026-01-01T00:00:00+00:00",
        }
    ]
    companies_file.write_text(json.dumps(original))

    crawler.update_companies_notes(str(companies_file), {"카카오모빌리티": "새 메모"})

    with open(companies_file) as f:
        result = json.load(f)

    assert result[0]["notes"] == "새 메모"
    assert result[0]["level"] == 4
    assert result[0]["zones"] == ["강남·서초"]


def test_update_companies_notes_skips_missing_file(tmp_path):
    crawler.update_companies_notes(str(tmp_path / "nope.json"), {"foo": "bar"})


# ─── Test: build_news_item ───────────────────────────────────────────────────

def test_build_news_item_schema():
    raw = {
        "title": "<b>자율주행택시</b> 확대 - 한국경제",
        "link": "https://n.news.naver.com/article/001/0001",
        "pubDate": "Mon, 30 Mar 2026 09:00:00 +0900",
        "source": "한국경제",
        "description": "카카오모빌리티가 강남 구역을 확대하며 자율주행택시 서비스를 더 넓은 지역에 제공한다.",
        "feed": "naver",
    }
    item = crawler.build_news_item(raw)
    assert item["headline"] == "자율주행택시 확대"
    assert item["url"] == "https://n.news.naver.com/article/001/0001"
    assert item["source"] == "한국경제"
    assert "카카오모빌리티" in item["summary"]
    assert "published_at" in item
    assert isinstance(item["tags"], list)


def test_build_news_item_source_from_title():
    """When XML source is empty, extract from title suffix."""
    raw = {
        "title": "로보택시 뉴스 - 디지털투데이",
        "link": "https://example.com/article",
        "pubDate": "Mon, 30 Mar 2026 09:00:00 +0900",
        "source": "",
        "description": "",
        "feed": "google",
    }
    item = crawler.build_news_item(raw)
    assert item["source"] == "디지털투데이"
    assert item["headline"] == "로보택시 뉴스"


def test_build_news_item_fallback_pubdate():
    raw = {
        "title": "테스트",
        "link": "https://example.com/x",
        "pubDate": "invalid-date",
        "description": "",
        "feed": "google",
    }
    item = crawler.build_news_item(raw)
    assert "published_at" in item


# ─── Test: extract_summary ───────────────────────────────────────────────────

def test_extract_summary_uses_description():
    desc = "카카오모빌리티가 서울 강남에서 자율주행택시를 확대 운행합니다. 새로운 구역 추가."
    result = crawler.extract_summary(desc, "헤드라인")
    assert "카카오모빌리티" in result


def test_extract_summary_falls_back_to_headline():
    result = crawler.extract_summary("", "긴 헤드라인 텍스트입니다")
    assert "긴 헤드라인" in result


def test_extract_summary_rejects_duplicate_description():
    """When description equals headline, should not use it directly."""
    headline = "자율주행택시 강남 확대"
    # Exact same text as headline
    result = crawler.extract_summary(headline, headline)
    # Should still return something (headline fallback)
    assert len(result) > 0


# ─── Test: fetch_all_queries deduplication ───────────────────────────────────

def test_fetch_all_queries_deduplicates(monkeypatch):
    """Same URL from different queries should appear only once."""
    def mock_rss(query):
        return [{"link": "https://same-url.com/1", "title": f"Result for {query}", "feed": "google"}]

    monkeypatch.setattr(crawler, "fetch_google_news_rss", mock_rss)
    monkeypatch.setattr(crawler, "fetch_naver_news_rss", lambda q: [])
    monkeypatch.setattr(crawler, "BASE_QUERIES", ["query1", "query2"])
    monkeypatch.setattr(crawler, "QUERY_DELAY", 0)
    result = crawler.fetch_all_queries(["query1", "query2"])
    assert len(result) == 1


# ─── Test: main() integration ───────────────────────────────────────────────

def test_main_no_new_articles_exits_gracefully(tmp_path, monkeypatch):
    """When all fetched articles are already in news.json, main() exits cleanly."""
    news_file = tmp_path / "news.json"
    news_file.write_text(json.dumps([
        {"url": "https://example.com/existing", "headline": "Existing"}
    ]))

    monkeypatch.setattr(crawler, "NEWS_FILE", str(news_file))
    monkeypatch.setattr(crawler, "COMPANIES_FILE", str(tmp_path / "companies.json"))
    monkeypatch.setattr(crawler, "QUERY_DELAY", 0)

    mock_items = [{"link": "https://example.com/existing", "title": "Existing", "feed": "google"}]
    monkeypatch.setattr(crawler, "fetch_all_queries", lambda q: mock_items)

    # Should return without error
    crawler.main()
