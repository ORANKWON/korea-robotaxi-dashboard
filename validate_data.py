#!/usr/bin/env python3
"""
Validate data/*.json files against schema rules.

Checks:
- Required fields and types
- Status enum values
- Coordinate bounds (Korea: lat 33-38.5, lng 124.5-132)
- Minimum entry counts (companies >= 6, zones >= 6)
- ISO 8601 date formats
- Positive numeric values where required

Exit code 0 = valid, 1 = errors found.
"""

import json
import sys
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"

COMPANY_STATUS_VALUES = {"시범운행", "시험운행", "준비 중", "개발 중"}
ZONE_STATUS_VALUES = {"운행 중", "준비 중", "지정완료"}
VALID_LEVELS = {3, 4, 5}

LAT_MIN, LAT_MAX = 33.0, 38.5
LNG_MIN, LNG_MAX = 124.5, 132.0

MIN_COMPANIES = 6
MIN_ZONES = 6


def is_iso8601(s: str) -> bool:
    """Check if string is a valid ISO 8601 datetime."""
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S+00:00", "%Y-%m-%d"):
        try:
            datetime.strptime(s.replace("+00:00", "+0000"), fmt.replace("+00:00", "+0000"))
            return True
        except ValueError:
            continue
    return False


def validate_companies(path: Path) -> list[str]:
    errors = []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, FileNotFoundError) as e:
        return [f"companies.json: {e}"]

    if not isinstance(data, list):
        return ["companies.json: root must be an array"]

    if len(data) < MIN_COMPANIES:
        errors.append(f"companies.json: expected >= {MIN_COMPANIES} entries, got {len(data)}")

    for i, c in enumerate(data):
        prefix = f"companies.json[{i}]"

        # Required string fields
        for field in ("name", "vehicle_model", "partner", "notes"):
            if not isinstance(c.get(field), str) or not c[field].strip():
                errors.append(f"{prefix}: '{field}' must be a non-empty string")

        # id
        if not isinstance(c.get("id"), int) or c["id"] < 1:
            errors.append(f"{prefix}: 'id' must be a positive integer")

        # status enum
        if c.get("status") not in COMPANY_STATUS_VALUES:
            errors.append(f"{prefix}: 'status' must be one of {COMPANY_STATUS_VALUES}, got '{c.get('status')}'")

        # zones array
        if not isinstance(c.get("zones"), list):
            errors.append(f"{prefix}: 'zones' must be an array")

        # level
        if c.get("level") not in VALID_LEVELS:
            errors.append(f"{prefix}: 'level' must be one of {VALID_LEVELS}, got {c.get('level')}")

        # commercialize_date: null or ISO 8601
        cd = c.get("commercialize_date")
        if cd is not None:
            if not isinstance(cd, str) or not is_iso8601(cd):
                errors.append(f"{prefix}: 'commercialize_date' must be null or ISO 8601, got '{cd}'")

        # updated_at: ISO 8601
        ua = c.get("updated_at")
        if not isinstance(ua, str) or not is_iso8601(ua):
            errors.append(f"{prefix}: 'updated_at' must be ISO 8601, got '{ua}'")

        # Optional structured fields
        funding = c.get("total_funding_krw")
        if funding is not None and not isinstance(funding, (int, float)):
            errors.append(f"{prefix}: 'total_funding_krw' must be null or number, got {type(funding).__name__}")

        fleet = c.get("fleet_size")
        if fleet is not None and (not isinstance(fleet, int) or fleet < 0):
            errors.append(f"{prefix}: 'fleet_size' must be null or non-negative int, got {fleet}")

        fy = c.get("founded_year")
        if fy is not None and (not isinstance(fy, int) or fy < 1990 or fy > 2030):
            errors.append(f"{prefix}: 'founded_year' must be null or 1990-2030, got {fy}")

    return errors


def validate_zones(path: Path) -> list[str]:
    errors = []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, FileNotFoundError) as e:
        return [f"zones.json: {e}"]

    if not isinstance(data, list):
        return ["zones.json: root must be an array"]

    if len(data) < MIN_ZONES:
        errors.append(f"zones.json: expected >= {MIN_ZONES} entries, got {len(data)}")

    for i, z in enumerate(data):
        prefix = f"zones.json[{i}]"

        # Required string fields
        for field in ("name", "region", "description"):
            if not isinstance(z.get(field), str) or not z[field].strip():
                errors.append(f"{prefix}: '{field}' must be a non-empty string")

        # id
        if not isinstance(z.get("id"), int) or z["id"] < 1:
            errors.append(f"{prefix}: 'id' must be a positive integer")

        # lat/lng bounds
        lat = z.get("lat")
        lng = z.get("lng")
        if not isinstance(lat, (int, float)) or not (LAT_MIN <= lat <= LAT_MAX):
            errors.append(f"{prefix}: 'lat' must be {LAT_MIN}-{LAT_MAX}, got {lat}")
        if not isinstance(lng, (int, float)) or not (LNG_MIN <= lng <= LNG_MAX):
            errors.append(f"{prefix}: 'lng' must be {LNG_MIN}-{LNG_MAX}, got {lng}")

        # area_km2
        area = z.get("area_km2")
        if not isinstance(area, (int, float)) or area <= 0:
            errors.append(f"{prefix}: 'area_km2' must be > 0, got {area}")

        # status enum
        if z.get("status") not in ZONE_STATUS_VALUES:
            errors.append(f"{prefix}: 'status' must be one of {ZONE_STATUS_VALUES}, got '{z.get('status')}'")

        # companies array
        if not isinstance(z.get("companies"), list):
            errors.append(f"{prefix}: 'companies' must be an array")

        # ── zones-v1 build artifact fields (optional during migration) ──────
        # Locked-in by /plan-eng-review 2026-04-17 (zone-polygons-v1 plan,
        # Phase 4 — validate_data.py 확장). dong_codes triggers the build
        # script's union pipeline; the three boundary_* / area_km2_computed
        # fields are the script's output and should appear together.
        dong_codes = z.get("dong_codes")
        if dong_codes is not None:
            if not isinstance(dong_codes, list) or not all(
                isinstance(c, str) and len(c) == 10 and c.isdigit()
                for c in dong_codes
            ):
                errors.append(
                    f"{prefix}: 'dong_codes' must be a list of 10-digit "
                    f"행정동 BJDONG strings (vuski adm_cd2 format)"
                )

            # If dong_codes is set, the build artifact fields must also exist
            # — otherwise someone edited zones.json without re-running the
            # script.
            if not z.get("boundary_source"):
                errors.append(
                    f"{prefix}: zones with 'dong_codes' must also have "
                    f"'boundary_source' (run: bun run build:zones)"
                )
            if not z.get("boundary_built_at"):
                errors.append(
                    f"{prefix}: zones with 'dong_codes' must also have "
                    f"'boundary_built_at' (run: bun run build:zones)"
                )

            computed = z.get("area_km2_computed")
            if computed is None:
                errors.append(
                    f"{prefix}: zones with 'dong_codes' must also have "
                    f"'area_km2_computed' (run: bun run build:zones)"
                )
            elif isinstance(area, (int, float)) and isinstance(
                computed, (int, float)
            ):
                drift_pct = abs(computed - area) / area * 100
                if drift_pct > 10:
                    errors.append(
                        f"{prefix}: area_km2_computed={computed} drifts "
                        f"{drift_pct:.1f}% from declared area_km2={area} "
                        f"(threshold 10%). Recheck dong_codes."
                    )

    return errors


def validate_news(path: Path) -> tuple[list[str], list[str]]:
    """Validate data/news.json. Returns (errors, warnings).

    Errors fail CI. Warnings print but don't fail — they signal a quality
    regression (e.g. crawler returning mostly '일반' tags = expanded keyword
    list might be missing entries) but aren't broken data.

    Locked-in by /plan-eng-review 2026-04-17 (news-list-v2 plan):
      - hard checks: required fields exist + correct types
      - soft check: tag_quality < 70% → WARN (TODO-016 alerting hook)
    """
    errors: list[str] = []
    warnings: list[str] = []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        # news.json is allowed to not exist on a fresh checkout
        warnings.append("news.json: file not found (skipping)")
        return errors, warnings
    except json.JSONDecodeError as e:
        return [f"news.json: {e}"], warnings

    if not isinstance(data, list):
        return ["news.json: root must be an array"], warnings

    non_default_tag_count = 0
    for i, item in enumerate(data):
        prefix = f"news.json[{i}]"
        if not isinstance(item, dict):
            errors.append(f"{prefix}: must be an object")
            continue

        # Required string fields
        for field in ("headline", "summary", "source", "url", "published_at"):
            v = item.get(field)
            if not isinstance(v, str) or not v.strip():
                errors.append(f"{prefix}: '{field}' must be a non-empty string")

        # tags: required array of strings
        tags = item.get("tags")
        if not isinstance(tags, list) or not all(isinstance(t, str) for t in tags):
            errors.append(f"{prefix}: 'tags' must be an array of strings")
        elif tags and tags != ["일반"]:
            non_default_tag_count += 1

        # Optional: final_url
        if "final_url" in item:
            fu = item["final_url"]
            if not isinstance(fu, str) or not fu.startswith(("http://", "https://")):
                errors.append(f"{prefix}: 'final_url' must be an http(s) URL when present")
            if isinstance(fu, str) and "news.google.com" in fu:
                # final_url must be the UNWRAPPED publisher URL — never the
                # original Google News redirect. If we see a Google URL here,
                # the unwrap pipeline regressed.
                errors.append(f"{prefix}: 'final_url' must not point at news.google.com")

        # Optional: companies
        if "companies" in item:
            cs = item["companies"]
            if not isinstance(cs, list) or not all(isinstance(c, str) and c for c in cs):
                errors.append(f"{prefix}: 'companies' must be an array of non-empty strings")

        # published_at must be ISO 8601-ish
        pa = item.get("published_at")
        if isinstance(pa, str) and not is_iso8601(pa):
            errors.append(f"{prefix}: 'published_at' must be ISO 8601, got '{pa}'")

    # Soft check: tag_quality (% items with non-default tag).
    # Threshold 70% per plan; if it drops, the keyword expansion likely missed
    # a category the crawler is now seeing more of. TODO-016 follow-up.
    if data:
        tag_quality = 100.0 * non_default_tag_count / len(data)
        if tag_quality < 70.0:
            warnings.append(
                f"news.json: tag_quality={tag_quality:.1f}% (< 70% target). "
                f"Consider expanding infer_tags keywords."
            )

    return errors, warnings


def validate_timeline(path: Path) -> list[str]:
    errors = []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, FileNotFoundError) as e:
        return [f"timeline.json: {e}"]

    if not isinstance(data, list):
        return ["timeline.json: root must be an array"]

    for i, t in enumerate(data):
        prefix = f"timeline.json[{i}]"

        for field in ("title", "description", "tag"):
            if not isinstance(t.get(field), str) or not t[field].strip():
                errors.append(f"{prefix}: '{field}' must be a non-empty string")

        if not isinstance(t.get("id"), int) or t["id"] < 1:
            errors.append(f"{prefix}: 'id' must be a positive integer")

        date = t.get("date")
        if not isinstance(date, str) or not is_iso8601(date):
            errors.append(f"{prefix}: 'date' must be ISO 8601, got '{date}'")

        if not isinstance(t.get("is_future"), bool):
            errors.append(f"{prefix}: 'is_future' must be a boolean")

    return errors


def main() -> int:
    all_errors: list[str] = []
    all_warnings: list[str] = []

    all_errors.extend(validate_companies(DATA_DIR / "companies.json"))
    all_errors.extend(validate_zones(DATA_DIR / "zones.json"))
    all_errors.extend(validate_timeline(DATA_DIR / "timeline.json"))

    news_errors, news_warnings = validate_news(DATA_DIR / "news.json")
    all_errors.extend(news_errors)
    all_warnings.extend(news_warnings)

    if all_warnings:
        print(f"⚠️  {len(all_warnings)} warning(s):", file=sys.stderr)
        for w in all_warnings:
            print(f"  - {w}", file=sys.stderr)

    if all_errors:
        print(f"❌ Validation failed with {len(all_errors)} error(s):", file=sys.stderr)
        for err in all_errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print("✅ All data files valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
