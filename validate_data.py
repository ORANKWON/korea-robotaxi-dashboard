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

    return errors


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

    all_errors.extend(validate_companies(DATA_DIR / "companies.json"))
    all_errors.extend(validate_zones(DATA_DIR / "zones.json"))
    all_errors.extend(validate_timeline(DATA_DIR / "timeline.json"))

    if all_errors:
        print(f"❌ Validation failed with {len(all_errors)} error(s):", file=sys.stderr)
        for err in all_errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print("✅ All data files valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
