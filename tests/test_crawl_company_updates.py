"""
Unit tests for crawl_company_updates.py

Run: pytest tests/test_crawl_company_updates.py -v
"""

import json
import os
import sys
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import crawl_company_updates as crawler


# ─── Test 1: compute_hash deterministic ──────────────────────────────────────

def test_compute_hash_deterministic():
    body = b"<html>hello</html>"
    h1 = crawler.compute_hash(body)
    h2 = crawler.compute_hash(body)
    assert h1 == h2
    assert len(h1) == 64  # SHA256 hex


def test_compute_hash_different_for_different_input():
    h1 = crawler.compute_hash(b"page version 1")
    h2 = crawler.compute_hash(b"page version 2")
    assert h1 != h2


# ─── Test 2: load_crawl_log ─────────────────────────────────────────────────

def test_load_crawl_log_missing_file():
    with patch.object(crawler, "CRAWL_LOG_FILE", "/tmp/nonexistent_crawl_log.json"):
        log = crawler.load_crawl_log()
        assert log == {"sources": {}, "last_run": None}


def test_load_crawl_log_existing_file(tmp_path):
    log_file = tmp_path / "crawl_log.json"
    data = {"sources": {"test": {"hash": "abc"}}, "last_run": "2026-04-01T00:00:00"}
    log_file.write_text(json.dumps(data), encoding="utf-8")
    with patch.object(crawler, "CRAWL_LOG_FILE", str(log_file)):
        log = crawler.load_crawl_log()
        assert log["sources"]["test"]["hash"] == "abc"


# ─── Test 3: check_staleness ────────────────────────────────────────────────

def test_staleness_fresh_source():
    entry = {"last_changed_at": datetime.now(tz=timezone.utc).isoformat()}
    assert crawler.check_staleness(entry) is None


def test_staleness_old_source():
    old = (datetime.now(tz=timezone.utc) - timedelta(days=20)).isoformat()
    entry = {"last_changed_at": old}
    result = crawler.check_staleness(entry)
    assert result is not None
    assert "stale" in result


def test_staleness_no_last_changed():
    assert crawler.check_staleness({}) is None


# ─── Test 4: process_target (mocked fetch) ──────────────────────────────────

def test_process_target_new_page():
    target = {"id": "test", "name": "Test", "url": "https://example.com", "type": "company"}
    crawl_log = {"sources": {}}

    with patch.object(crawler, "fetch_page", return_value=(b"<html>content</html>", None)):
        result = crawler.process_target(target, crawl_log)

    assert result["status"] == "new"
    assert result["hash"] is not None
    assert result["bytes"] > 0


def test_process_target_unchanged():
    body = b"<html>same content</html>"
    existing_hash = crawler.compute_hash(body)
    target = {"id": "test", "name": "Test", "url": "https://example.com", "type": "company"}
    crawl_log = {"sources": {"test": {"hash": existing_hash}}}

    with patch.object(crawler, "fetch_page", return_value=(body, None)):
        result = crawler.process_target(target, crawl_log)

    assert result["status"] == "unchanged"


def test_process_target_changed():
    target = {"id": "test", "name": "Test", "url": "https://example.com", "type": "company"}
    crawl_log = {"sources": {"test": {"hash": "old_hash_value"}}}

    with patch.object(crawler, "fetch_page", return_value=(b"<html>new content</html>", None)):
        result = crawler.process_target(target, crawl_log)

    assert result["status"] == "changed"


def test_process_target_error():
    target = {"id": "test", "name": "Test", "url": "https://example.com", "type": "company"}
    crawl_log = {"sources": {"test": {"hash": "old_hash"}}}

    with patch.object(crawler, "fetch_page", return_value=(None, "Timeout")):
        result = crawler.process_target(target, crawl_log)

    assert result["status"] == "error"
    assert result["hash"] == "old_hash"  # preserved


# ─── Test 5: broken page detection ──────────────────────────────────────────

def test_process_target_broken_page():
    target = {"id": "test", "name": "Test", "url": "https://example.com", "type": "company"}
    crawl_log = {"sources": {}}
    tiny_body = b"<html></html>"  # < 500 bytes

    with patch.object(crawler, "fetch_page", return_value=(tiny_body, None)):
        result = crawler.process_target(target, crawl_log)

    assert result["warning"] is not None
    assert "broken" in result["warning"]


# ─── Test 6: update_crawl_log ───────────────────────────────────────────────

def test_update_crawl_log_adds_entries():
    crawl_log = {"sources": {}, "last_run": None}
    results = [
        {"id": "test1", "name": "Test1", "url": "https://a.com", "status": "new", "hash": "abc", "bytes": 1000},
        {"id": "test2", "name": "Test2", "url": "https://b.com", "status": "unchanged", "hash": "def", "bytes": 2000},
    ]
    updated = crawler.update_crawl_log(crawl_log, results)
    assert "test1" in updated["sources"]
    assert "test2" in updated["sources"]
    assert updated["last_run"] is not None


def test_update_crawl_log_preserves_last_changed():
    old_time = "2026-03-01T00:00:00+00:00"
    crawl_log = {"sources": {"test": {"last_changed_at": old_time}}, "last_run": None}
    results = [
        {"id": "test", "name": "Test", "url": "https://a.com", "status": "unchanged", "hash": "abc", "bytes": 1000},
    ]
    updated = crawler.update_crawl_log(crawl_log, results)
    assert updated["sources"]["test"]["last_changed_at"] == old_time


def test_update_crawl_log_updates_last_changed_on_change():
    crawl_log = {"sources": {"test": {"last_changed_at": "2026-03-01T00:00:00+00:00"}}, "last_run": None}
    results = [
        {"id": "test", "name": "Test", "url": "https://a.com", "status": "changed", "hash": "new_hash", "bytes": 1000},
    ]
    updated = crawler.update_crawl_log(crawl_log, results)
    assert updated["sources"]["test"]["last_changed_at"] != "2026-03-01T00:00:00+00:00"


# ─── Test 7: GitHub summary skipped outside CI ──────────────────────────────

def test_github_summary_skipped_without_env():
    results = [{"id": "test", "name": "Test", "status": "unchanged", "bytes": 1000}]
    with patch.dict(os.environ, {}, clear=True):
        # Should not raise
        crawler.write_github_summary(results)


# ─── Test 8: GitHub summary written in CI ────────────────────────────────────

def test_github_summary_written_in_ci(tmp_path):
    summary_file = tmp_path / "summary.md"
    results = [
        {"id": "t1", "name": "Test Changed", "status": "changed", "bytes": 5000, "detail": "hash differs", "warning": None},
        {"id": "t2", "name": "Test Same", "status": "unchanged", "bytes": 3000, "detail": "same", "warning": None},
    ]
    with patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": str(summary_file)}):
        crawler.write_github_summary(results)

    content = summary_file.read_text()
    assert "Changed" in content
    assert "Unchanged" in content
    assert "manual review recommended" in content


# ─── Test 9: MONITOR_TARGETS sanity ─────────────────────────────────────────

def test_monitor_targets_have_required_fields():
    for target in crawler.MONITOR_TARGETS:
        assert "id" in target
        assert "name" in target
        assert "url" in target
        assert "type" in target
        assert target["url"].startswith("https://")
