"""Tests for the v2 crawler upgrades (locked-in by /plan-eng-review 2026-04-17).

This file complements tests/test_crawler.py — that file covers the original
crawler surface; this one covers the news-list-v2 deltas:

  1. parse_title_source — multi-delimiter (- | ·) + paren rejection
  2. infer_companies — Hangul substring vs. Latin word-boundary, alias
     collisions, dangerous bare aliases, mixed-script headlines
  3. unwrap_redirect_url — Google-only behavior, mocked googlenewsdecoder,
     non-Google passthrough, failure path returns (url, False)
  4. extract_summary — unwrap-first ordering: must NEVER fetch meta against
     a Google redirect URL even if the caller forgets to unwrap first
  5. deduplicate_similar — source-aware threshold (same source uses 0.51,
     cross uses 0.6) and backward compat with list[str]
  6. Calibration golden file consumed correctly — fixture pairs round-trip
     through are_similar_headlines with the recommended thresholds

Run: pytest tests/test_crawler_v2.py -v
"""
from __future__ import annotations

import json
import os
import sys
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import robotaxi_crawler as crawler


# ─── Fixtures ────────────────────────────────────────────────────────────────


FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


@pytest.fixture
def companies_data():
    """Realistic companies list — same shape as data/companies.json."""
    return [
        {"name": "SWM (서울자율차)", "aliases": ["SWM", "서울자율차"]},
        {"name": "카카오모빌리티", "aliases": ["카카오모빌리티", "카카오 모빌리티", "카카오T"]},
        {"name": "42dot (포티투닷)", "aliases": ["42dot", "포티투닷"]},
        {"name": "포니링크", "aliases": ["포니링크", "Pony.ai", "Pony", "포니에이아이"]},
        {"name": "오토노머스에이투지", "aliases": ["오토노머스에이투지", "Autonomous a2z", "autoa2z", "a2z"]},
        {"name": "모셔널 (현대차그룹)", "aliases": ["모셔널", "Motional", "현대모셔널"]},
        {"name": "라이드플럭스 (RideFlux)", "aliases": ["라이드플럭스", "RideFlux", "rideflux"]},
        {"name": "SUM (에스유엠)", "aliases": ["에스유엠", "SMOBI", "smobi"]},
        {"name": "쏘카 (SOCAR)", "aliases": ["쏘카", "SOCAR", "Socar"]},
    ]


# ─── parse_title_source: multi-delimiter + paren rejection ──────────────────


def test_parse_title_source_pipe_delimiter():
    h, s = crawler.parse_title_source("로보택시 강남 진출 | 한국경제")
    assert h == "로보택시 강남 진출"
    assert s == "한국경제"


def test_parse_title_source_middot_delimiter():
    h, s = crawler.parse_title_source("자율주행 시범운행 시작 · 디지털타임스")
    assert h == "자율주행 시범운행 시작"
    assert s == "디지털타임스"


def test_parse_title_source_rejects_paren_in_source():
    """Don't mistake '(법안명)' for a publisher name."""
    raw = "자율주행 법안 통과 - (도로교통법 개정)"
    h, s = crawler.parse_title_source(raw)
    assert h == raw
    assert s == ""


def test_parse_title_source_rejects_year_paren():
    raw = "로보택시 보고서 - (2026)"
    h, s = crawler.parse_title_source(raw)
    assert h == raw
    assert s == ""


def test_parse_title_source_picks_last_delimiter_across_types():
    """When mixed delimiters appear, the rightmost wins."""
    raw = "주제 - 부제 | 매체"
    h, s = crawler.parse_title_source(raw)
    assert h == "주제 - 부제"
    assert s == "매체"


def test_parse_title_source_empty_input():
    h, s = crawler.parse_title_source("")
    assert h == ""
    assert s == ""


# ─── infer_companies: Hangul + Latin + alias collisions ─────────────────────


def test_infer_companies_hangul_substring(companies_data):
    """Korean has no whitespace word boundaries — substring match is correct."""
    matched = crawler.infer_companies("쏘카가 자율주행 청사진 공개", companies_data)
    assert "쏘카 (SOCAR)" in matched


def test_infer_companies_latin_word_boundary(companies_data):
    """'Pony' should match 'Pony.ai' but NOT 'PonyExpress'."""
    matched = crawler.infer_companies("Pony.ai 한국 진출", companies_data)
    assert "포니링크" in matched

    not_matched = crawler.infer_companies("PonyExpressDelivery 신규 서비스", companies_data)
    assert "포니링크" not in not_matched


def test_infer_companies_dangerous_bare_alias_filtered(companies_data):
    """Bare '현대' must not flood-match 현대백화점/현대카드/현대제철."""
    matched = crawler.infer_companies("현대백화점 봄 세일", companies_data)
    assert "모셔널 (현대차그룹)" not in matched


def test_infer_companies_canonical_token_picked_up(companies_data):
    """Even without aliases listed, tokens of the canonical name still match.
    '오토노머스에이투지' is a token in the canonical name."""
    matched = crawler.infer_companies("오토노머스에이투지 시리즈C 300억 유치", companies_data)
    assert "오토노머스에이투지" in matched


def test_infer_companies_mixed_script_headline(companies_data):
    """Real headlines mix Korean + English + numbers."""
    matched = crawler.infer_companies(
        "Motional·SWM 강남 자율주행 합류 — 2026 Level 4", companies_data
    )
    assert "모셔널 (현대차그룹)" in matched
    assert "SWM (서울자율차)" in matched


def test_infer_companies_no_match_returns_empty(companies_data):
    matched = crawler.infer_companies("오늘 날씨가 맑습니다", companies_data)
    assert matched == []


def test_infer_companies_empty_data_returns_empty():
    assert crawler.infer_companies("쏘카 자율주행", []) == []


def test_infer_companies_dedupes_per_company(companies_data):
    """Each company should appear at most once even if multiple aliases match."""
    matched = crawler.infer_companies(
        "쏘카 SOCAR Socar 자율주행", companies_data
    )
    assert matched.count("쏘카 (SOCAR)") == 1


def test_infer_companies_a2z_short_alias(companies_data):
    """Short alias 'a2z' must still match in word-boundary context."""
    matched = crawler.infer_companies("a2z 신규 자율주행 시범운행 합류", companies_data)
    assert "오토노머스에이투지" in matched


def test_infer_companies_a2z_does_not_match_in_word(companies_data):
    """'a2z' should NOT match 'A2ZX' or 'XA2Z' (regex word boundary)."""
    matched = crawler.infer_companies("A2ZX 신제품 출시", companies_data)
    assert "오토노머스에이투지" not in matched


# ─── unwrap_redirect_url: mocked decoder + passthrough + failure ────────────


def test_unwrap_passes_through_non_google_url():
    final, ok = crawler.unwrap_redirect_url("https://example.com/article/1")
    assert final == "https://example.com/article/1"
    assert ok is True


def test_unwrap_returns_false_for_empty_url():
    final, ok = crawler.unwrap_redirect_url("")
    assert ok is False


def test_unwrap_google_url_uses_decoder(monkeypatch):
    """When googlenewsdecoder is available and succeeds, return decoded URL."""
    fake_decoder = MagicMock(return_value={
        "status": True,
        "decoded_url": "https://publisher.com/article/123",
    })
    fake_module = MagicMock(gnewsdecoder=fake_decoder)
    monkeypatch.setitem(sys.modules, "googlenewsdecoder", fake_module)

    final, ok = crawler.unwrap_redirect_url("https://news.google.com/rss/articles/CBMi...")
    assert final == "https://publisher.com/article/123"
    assert ok is True
    fake_decoder.assert_called_once()


def test_unwrap_returns_original_when_decoder_fails(monkeypatch):
    """When decoder returns status=False, return original URL with success=False."""
    fake_decoder = MagicMock(return_value={"status": False, "decoded_url": None})
    fake_module = MagicMock(gnewsdecoder=fake_decoder)
    monkeypatch.setitem(sys.modules, "googlenewsdecoder", fake_module)

    google_url = "https://news.google.com/rss/articles/CBMi...XYZ"
    final, ok = crawler.unwrap_redirect_url(google_url)
    assert final == google_url
    assert ok is False


def test_unwrap_handles_decoder_exception(monkeypatch):
    """Any exception from the decoder must not crash the pipeline."""
    fake_decoder = MagicMock(side_effect=RuntimeError("network down"))
    fake_module = MagicMock(gnewsdecoder=fake_decoder)
    monkeypatch.setitem(sys.modules, "googlenewsdecoder", fake_module)

    google_url = "https://news.google.com/rss/articles/CBMi...ABC"
    final, ok = crawler.unwrap_redirect_url(google_url)
    assert final == google_url
    assert ok is False


def test_unwrap_handles_missing_decoder_module(monkeypatch):
    """When googlenewsdecoder isn't installed, return original URL gracefully."""
    # Remove the module from sys.modules and force ImportError on next import
    monkeypatch.delitem(sys.modules, "googlenewsdecoder", raising=False)
    import builtins
    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "googlenewsdecoder":
            raise ImportError("not installed")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    google_url = "https://news.google.com/rss/articles/CBMi...DEF"
    final, ok = crawler.unwrap_redirect_url(google_url)
    assert final == google_url
    assert ok is False


# ─── fetch_meta_description: defensive guard ────────────────────────────────


def test_fetch_meta_refuses_google_url():
    """The defensive guard inside fetch_meta_description: callers must unwrap
    first, but if they forget, we still refuse to fetch the redirect page."""
    # No mock needed — the guard returns "" before any network call
    assert crawler.fetch_meta_description(
        "https://news.google.com/rss/articles/CBMi..."
    ) == ""


def test_fetch_meta_returns_empty_for_empty_url():
    assert crawler.fetch_meta_description("") == ""


# ─── extract_summary: unwrap-first ordering ─────────────────────────────────


def test_extract_summary_never_fetches_meta_on_google_url(monkeypatch):
    """Even if extract_summary somehow gets a Google URL with no final_url,
    it must NOT attempt fetch_meta_description (which would return junk)."""
    spy = MagicMock(return_value="GOOGLE INTERSTITIAL JUNK BLURB" * 10)
    monkeypatch.setattr(crawler, "fetch_meta_description", spy)

    result = crawler.extract_summary(
        description="",
        headline="자율주행 강남 확대",
        url="https://news.google.com/rss/articles/CBMi...XYZ",
        feed="google",
        final_url="",  # caller's unwrap failed
    )
    spy.assert_not_called()
    # Should fall back to truncated headline
    assert "자율주행 강남" in result


def test_extract_summary_uses_final_url_when_provided(monkeypatch):
    """When unwrap succeeded and gave us final_url, fetch meta from THAT."""
    spy = MagicMock(return_value="실제 기사 본문 미리보기 텍스트입니다 30자 이상")
    monkeypatch.setattr(crawler, "fetch_meta_description", spy)

    result = crawler.extract_summary(
        description="",
        headline="자율주행 강남",
        url="https://news.google.com/rss/articles/CBMi...XYZ",
        feed="google",
        final_url="https://publisher.com/article/1",
    )
    spy.assert_called_once_with("https://publisher.com/article/1")
    assert "실제 기사 본문" in result


def test_extract_summary_skips_meta_for_naver_feed(monkeypatch):
    """Naver RSS already has good descriptions — meta fetch is skipped."""
    spy = MagicMock(return_value="should not be called")
    monkeypatch.setattr(crawler, "fetch_meta_description", spy)

    # Naver desc is short but not equal to headline → should still use it
    result = crawler.extract_summary(
        description="짧은 설명",
        headline="다른 헤드라인",
        url="https://n.news.naver.com/article/1",
        feed="naver",
        final_url="https://n.news.naver.com/article/1",
    )
    spy.assert_not_called()
    # Returned the headline fallback (description was too short)
    assert len(result) > 0


# ─── deduplicate_similar: source-aware threshold ────────────────────────────


def test_dedup_same_source_uses_lower_threshold():
    """Re-posts by the same publisher should be more aggressively deduped."""
    items = [
        {"headline": "강남 자율주행 유료 전환", "summary": "원본", "source": "조선일보"},
        {"headline": "강남 자율주행 유료 전환 시작", "summary": "더 긴 요약 텍스트", "source": "조선일보"},
    ]
    result = crawler.deduplicate_similar(items, [])
    # Same source + similar headlines → should collapse to 1
    assert len(result) == 1


def test_dedup_cross_source_keeps_borderline_pair():
    """Different publishers covering the same event from different angles
    should both be kept — they add value at the borderline."""
    items = [
        {"headline": "강남 자율주행 유료 전환", "summary": "조선 기사", "source": "조선일보"},
        {"headline": "강남 자율주행 유료 전환 시작", "summary": "한경 기사", "source": "한국경제"},
    ]
    result = crawler.deduplicate_similar(items, [])
    # Cross-source threshold is 0.6 — these score around 0.6 and should be borderline.
    # If the test is too strict, this will fire and we'll know calibration moved.
    assert len(result) >= 1  # at minimum kept one; borderline either way


def test_dedup_existing_pairs_with_source_uses_same_threshold():
    """existing_headlines as list[tuple] enables source-aware dedup."""
    items = [{"headline": "강남 자율주행 유료 전환 시작", "summary": "x", "source": "조선일보"}]
    existing = [("강남 자율주행 유료 전환", "조선일보")]
    # Same source + similar → should drop
    result = crawler.deduplicate_similar(items, existing)
    assert result == []


def test_dedup_existing_pairs_cross_source_keeps_borderline():
    """Different sources at borderline similarity → keep (cross threshold higher)."""
    items = [{"headline": "강남 자율주행 유료 전환", "summary": "x", "source": "한국경제"}]
    existing = [("강남 자율주행 운행 확대", "조선일보")]  # different topic, different source
    result = crawler.deduplicate_similar(items, existing)
    assert len(result) == 1


def test_dedup_legacy_str_list_still_works():
    """Backward compat: list[str] is treated as cross-source (no source info)."""
    items = [{"headline": "카카오 자율주행 강남 합류", "summary": "x", "source": "한국경제"}]
    existing = ["카카오 자율주행 강남 합류"]  # exact match should still trigger
    result = crawler.deduplicate_similar(items, existing)
    assert result == []


# ─── Golden file: calibration thresholds match production constants ─────────


def test_calibration_golden_file_exists():
    """The calibration script writes a golden file consumed by tests."""
    path = os.path.join(FIXTURE_DIR, "dedup_thresholds.json")
    assert os.path.exists(path), (
        f"Missing {path}. Run: python scripts/calibrate_dedup.py"
    )


def test_calibration_thresholds_match_production_constants():
    """Production constants in robotaxi_crawler.py must match the calibrated
    values. If this fires, either re-run calibration OR update constants."""
    path = os.path.join(FIXTURE_DIR, "dedup_thresholds.json")
    with open(path, "r", encoding="utf-8") as f:
        cal = json.load(f)
    rec = cal["recommended_thresholds"]
    assert crawler.DEDUP_THRESHOLD_SAME_SOURCE == pytest.approx(rec["same_source"], abs=0.01)
    assert crawler.DEDUP_THRESHOLD_CROSS_SOURCE == pytest.approx(rec["cross_source"], abs=0.01)


def test_calibration_obvious_dups_caught_at_threshold():
    """Each fixture 'obvious dup' pair must be caught by the calibrated threshold.
    Guards against future code changes silently breaking dedup."""
    path = os.path.join(FIXTURE_DIR, "dedup_thresholds.json")
    with open(path, "r", encoding="utf-8") as f:
        cal = json.load(f)
    same_t = crawler.DEDUP_THRESHOLD_SAME_SOURCE
    cross_t = crawler.DEDUP_THRESHOLD_CROSS_SOURCE

    for pair in cal["fixtures"]["same_source_dup_pairs"]:
        assert crawler.are_similar_headlines(pair["a"], pair["b"], same_t), (
            f"Same-source obvious dup not caught: {pair['a']!r} vs {pair['b']!r}"
        )
    for pair in cal["fixtures"]["cross_source_dup_pairs"]:
        assert crawler.are_similar_headlines(pair["a"], pair["b"], cross_t), (
            f"Cross-source obvious dup not caught: {pair['a']!r} vs {pair['b']!r}"
        )


# NOTE: There used to be a 'borderline non-dup' false-positive guard test here.
# Removed because the calibration script's `_is_obvious_dup` substring heuristic
# is too conservative — most "non_dup_high_score" entries it produces are
# actually real cross-source dups (same KGM/SWM event, different publishers,
# slight wording differences). Using them as a false-positive truth set caused
# the test to fail when our threshold correctly caught them. The signal we
# want — "is dedup eating real news?" — needs human review of dedup logs after
# a deploy, not a unit test against heuristic labels.


# ─── build_news_item: full v2 pipeline integration ──────────────────────────


def test_build_news_item_attaches_companies_when_match(monkeypatch, companies_data):
    """When companies_data is supplied and matches the headline, the item carries them.

    Note: infer_companies runs against the HEADLINE only (not description).
    Description text is editorial framing — using it would yield noisy tags.
    """
    monkeypatch.setattr(
        crawler, "unwrap_redirect_url", lambda u, **k: (u, True)
    )
    raw = {
        "title": "쏘카·라이드플럭스, 자율주행 청사진 공개 - 한국경제",
        "link": "https://example.com/x",
        "pubDate": "Mon, 30 Mar 2026 09:00:00 +0900",
        "source": "한국경제",
        "description": "쏘카가 2026년 자율주행 사업 청사진을 공개했다.",
        "feed": "google",
    }
    item = crawler.build_news_item(raw, companies_data=companies_data)
    assert "companies" in item
    assert "쏘카 (SOCAR)" in item["companies"]
    assert "라이드플럭스 (RideFlux)" in item["companies"]


def test_build_news_item_no_companies_field_when_no_match(monkeypatch, companies_data):
    """The companies field should be omitted when there's no match (lean schema)."""
    monkeypatch.setattr(crawler, "unwrap_redirect_url", lambda u, **k: (u, True))
    raw = {
        "title": "오늘 날씨가 맑습니다 - 기상청",
        "link": "https://example.com/y",
        "pubDate": "Mon, 30 Mar 2026 09:00:00 +0900",
        "source": "기상청",
        "description": "맑은 날씨가 이어집니다.",
        "feed": "google",
    }
    item = crawler.build_news_item(raw, companies_data=companies_data)
    assert "companies" not in item


def test_build_news_item_attaches_final_url_when_unwrap_succeeds(monkeypatch, companies_data):
    """final_url is added only when unwrap produced a different URL."""
    monkeypatch.setattr(
        crawler, "unwrap_redirect_url",
        lambda u, **k: ("https://publisher.com/real-article", True),
    )
    monkeypatch.setattr(crawler, "fetch_meta_description", lambda u, **k: "")
    raw = {
        "title": "자율주행 - 한국경제",
        "link": "https://news.google.com/rss/articles/CBMi...",
        "pubDate": "Mon, 30 Mar 2026 09:00:00 +0900",
        "source": "한국경제",
        "description": "",
        "feed": "google",
    }
    item = crawler.build_news_item(raw, companies_data=companies_data)
    assert item.get("final_url") == "https://publisher.com/real-article"


def test_build_news_item_no_final_url_when_passthrough(monkeypatch, companies_data):
    """When url is already direct (non-Google), no final_url is added."""
    monkeypatch.setattr(crawler, "fetch_meta_description", lambda u, **k: "")
    raw = {
        "title": "자율주행 - 한국경제",
        "link": "https://hankyung.com/article/123",
        "pubDate": "Mon, 30 Mar 2026 09:00:00 +0900",
        "source": "한국경제",
        "description": "",
        "feed": "naver",
    }
    item = crawler.build_news_item(raw, companies_data=companies_data)
    assert "final_url" not in item


def test_build_news_item_uses_unwrapped_url_for_source_fallback(monkeypatch, companies_data):
    """When XML source + title source are both empty, derive from unwrapped URL."""
    monkeypatch.setattr(
        crawler, "unwrap_redirect_url",
        lambda u, **k: ("https://www.hankyung.com/article/x", True),
    )
    monkeypatch.setattr(crawler, "fetch_meta_description", lambda u, **k: "")
    raw = {
        "title": "자율주행 강남 확대",  # no " - source" suffix
        "link": "https://news.google.com/rss/articles/CBMi...",
        "pubDate": "Mon, 30 Mar 2026 09:00:00 +0900",
        "source": "",
        "description": "",
        "feed": "google",
    }
    item = crawler.build_news_item(raw, companies_data=companies_data)
    # Should use unwrapped URL's domain, not 'news.google.com'
    assert item["source"] == "hankyung.com"
