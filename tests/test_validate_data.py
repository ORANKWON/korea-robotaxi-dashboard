"""
Unit tests for validate_data.py

Run: pytest tests/test_validate_data.py -v
"""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import validate_data as validator


# ─── Helper: write JSON to tmp file ─────────────────────────────────────────

def write_json(tmp_path, filename, data):
    path = tmp_path / filename
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path


# ─── Valid fixture data ──────────────────────────────────────────────────────

VALID_COMPANY = {
    "id": 1,
    "name": "TestCo",
    "status": "시범운행",
    "zones": ["강남"],
    "vehicle_model": "아이오닉5",
    "partner": "서울시",
    "commercialize_date": None,
    "level": 4,
    "notes": "테스트 기업",
    "updated_at": "2026-04-01T00:00:00+00:00",
}

VALID_ZONE = {
    "id": 1,
    "name": "강남 자율주행 시범운행지구",
    "region": "서울 강남구",
    "lat": 37.4979,
    "lng": 127.0276,
    "area_km2": 20.4,
    "status": "운행 중",
    "companies": ["SWM"],
    "description": "국내 최초 심야 자율주행택시 운행 구역.",
}

VALID_TIMELINE = {
    "id": 1,
    "date": "2024-11-01",
    "title": "테스트 이벤트",
    "description": "테스트 설명",
    "tag": "정책",
    "is_future": False,
}


# ─── Test 1: Valid companies pass ────────────────────────────────────────────

def test_valid_companies_no_errors(tmp_path):
    path = write_json(tmp_path, "companies.json", [VALID_COMPANY] * 6)
    errors = validator.validate_companies(path)
    assert errors == []


# ─── Test 2: Minimum company count ──────────────────────────────────────────

def test_companies_below_minimum_count(tmp_path):
    path = write_json(tmp_path, "companies.json", [VALID_COMPANY] * 3)
    errors = validator.validate_companies(path)
    assert any("expected >= 6" in e for e in errors)


# ─── Test 3: Invalid company status ─────────────────────────────────────────

def test_invalid_company_status(tmp_path):
    bad = {**VALID_COMPANY, "status": "운행 중"}  # not in company status enum
    path = write_json(tmp_path, "companies.json", [bad] * 6)
    errors = validator.validate_companies(path)
    assert any("status" in e for e in errors)


# ─── Test 4: Valid zones pass ────────────────────────────────────────────────

def test_valid_zones_no_errors(tmp_path):
    path = write_json(tmp_path, "zones.json", [VALID_ZONE] * 6)
    errors = validator.validate_zones(path)
    assert errors == []


# ─── Test 5: Coordinates out of Korea bounds ────────────────────────────────

def test_zone_lat_out_of_bounds(tmp_path):
    bad = {**VALID_ZONE, "lat": 40.0}  # north of Korea
    path = write_json(tmp_path, "zones.json", [bad] * 6)
    errors = validator.validate_zones(path)
    assert any("lat" in e for e in errors)


def test_zone_lng_out_of_bounds(tmp_path):
    bad = {**VALID_ZONE, "lng": 140.0}  # east of Korea
    path = write_json(tmp_path, "zones.json", [bad] * 6)
    errors = validator.validate_zones(path)
    assert any("lng" in e for e in errors)


# ─── Test 6: Invalid zone status ────────────────────────────────────────────

def test_invalid_zone_status(tmp_path):
    bad = {**VALID_ZONE, "status": "시범운행"}  # not in zone status enum
    path = write_json(tmp_path, "zones.json", [bad] * 6)
    errors = validator.validate_zones(path)
    assert any("status" in e for e in errors)


# ─── Test 7: Valid timeline pass ─────────────────────────────────────────────

def test_valid_timeline_no_errors(tmp_path):
    path = write_json(tmp_path, "timeline.json", [VALID_TIMELINE])
    errors = validator.validate_timeline(path)
    assert errors == []


# ─── Test 8: Missing file returns error ──────────────────────────────────────

def test_missing_file_returns_error(tmp_path):
    path = tmp_path / "nonexistent.json"
    errors = validator.validate_companies(path)
    assert len(errors) == 1
    assert "companies.json" in errors[0]


# ─── Test 9: Corrupt JSON returns error ──────────────────────────────────────

def test_corrupt_json_returns_error(tmp_path):
    path = tmp_path / "companies.json"
    path.write_text("{bad json", encoding="utf-8")
    errors = validator.validate_companies(path)
    assert len(errors) == 1


# ─── Test 10: ISO 8601 validation ───────────────────────────────────────────

def test_is_iso8601_valid():
    assert validator.is_iso8601("2026-04-01T00:00:00+00:00")
    assert validator.is_iso8601("2026-04-01")


def test_is_iso8601_invalid():
    assert not validator.is_iso8601("not-a-date")
    assert not validator.is_iso8601("2026/04/01")
