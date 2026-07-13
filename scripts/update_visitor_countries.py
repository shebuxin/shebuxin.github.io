#!/usr/bin/env python3
"""Build the public website visitor-country snapshot from GoatCounter stats."""

from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

try:
    import pycountry
except ImportError as error:  # pragma: no cover - exercised in the workflow environment
    raise SystemExit(
        "pycountry is required; install pycountry==26.2.16 before running this script"
    ) from error


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "_data" / "visitor_countries.json"
COUNTRY_DATA_PATH = ROOT / "node_modules" / "world-countries" / "countries.json"
DEFAULT_SITE = "buxin.goatcounter.com"
DEFAULT_TIMEZONE = "America/Chicago"
DEFAULT_START_DATE = "2024-11-30"
DEFAULT_MINIMUM = 2
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


def required_environment(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"{name} is required")
    return value


def positive_integer(value: str, name: str) -> int:
    try:
        parsed = int(value)
    except ValueError as error:
        raise ValueError(f"{name} must be an integer") from error
    if parsed < 1:
        raise ValueError(f"{name} must be at least 1")
    return parsed


def load_existing(path: Path = OUTPUT_PATH) -> dict[str, Any] | None:
    if not path.exists():
        return None
    loaded = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(loaded, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return loaded


def load_country_centroids(
    path: Path = COUNTRY_DATA_PATH,
) -> dict[str, tuple[float, float]]:
    if not path.exists():
        raise ValueError(f"{path} is missing; run npm ci before updating the visitor map")
    countries = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(countries, list):
        raise ValueError(f"{path} must contain a JSON array")

    centroids: dict[str, tuple[float, float]] = {}
    for country in countries:
        if not isinstance(country, dict):
            continue
        alpha2 = str(country.get("cca2", "")).upper()
        latlng = country.get("latlng")
        if not re.fullmatch(r"[A-Z]{2}", alpha2) or not isinstance(latlng, list):
            continue
        if len(latlng) != 2 or any(
            not isinstance(value, (int, float)) or isinstance(value, bool) for value in latlng
        ):
            continue
        latitude, longitude = float(latlng[0]), float(latlng[1])
        if -90 <= latitude <= 90 and -180 <= longitude <= 180:
            centroids[alpha2] = (latitude, longitude)

    if len(centroids) < 200:
        raise ValueError(f"{path} does not contain enough valid country centroids")
    return centroids


def request_json(url: str, token: str, attempts: int = 4) -> dict[str, Any]:
    request = Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "shebuxin.github.io visitor-map updater",
        },
    )

    for attempt in range(attempts):
        try:
            with urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
                if not isinstance(payload, dict):
                    raise ValueError("GoatCounter returned a non-object response")
                return payload
        except HTTPError as error:
            if error.code not in RETRYABLE_STATUS_CODES or attempt == attempts - 1:
                raise RuntimeError(f"GoatCounter API returned HTTP {error.code}") from error
        except URLError as error:
            if attempt == attempts - 1:
                raise RuntimeError("Could not reach the GoatCounter API") from error

        time.sleep(2**attempt)

    raise RuntimeError("GoatCounter request failed")


def fetch_locations(
    site: str,
    token: str,
    start: str,
    end: str,
    path_filter: str | None = None,
) -> list[dict[str, Any]]:
    if not re.fullmatch(r"[A-Za-z0-9.-]+", site):
        raise ValueError("GOATCOUNTER_SITE must be a hostname")

    endpoint = f"https://{site}/api/v0/stats/locations"
    rows: list[dict[str, Any]] = []
    offset = 0

    for _ in range(100):
        parameters = [
            ("start", start),
            ("end", end),
            ("limit", "100"),
            ("offset", str(offset)),
        ]
        if path_filter:
            parameters.extend(
                [("include_paths", path_filter), ("path_by_name", "true")]
            )
        query = urlencode(parameters)
        payload = request_json(f"{endpoint}?{query}", token)
        page = payload.get("stats")
        if not isinstance(page, list) or not all(isinstance(item, dict) for item in page):
            raise ValueError("GoatCounter response is missing a valid stats array")

        more = payload.get("more", False)
        if not isinstance(more, bool):
            raise ValueError("GoatCounter response has an invalid pagination flag")

        rows.extend(page)
        if not more:
            return rows
        if not page:
            raise ValueError("GoatCounter reported more results but returned an empty page")
        offset += len(page)

    raise RuntimeError("GoatCounter pagination exceeded 100 pages")


def query_window(
    start_date: str,
    now: datetime,
    timezone_name: str,
) -> tuple[str, str, str]:
    """Build API timestamps whose calendar days match the GoatCounter timezone."""
    try:
        account_timezone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as error:
        raise ValueError(f"Unknown GoatCounter timezone: {timezone_name}") from error
    try:
        start_day = date.fromisoformat(start_date)
    except ValueError as error:
        raise ValueError("GOATCOUNTER_START_DATE must use YYYY-MM-DD") from error
    if now.tzinfo is None:
        raise ValueError("The current time must include a timezone")

    local_start = datetime.combine(
        start_day,
        datetime.min.time(),
        tzinfo=account_timezone,
    )
    rounded_now = now.astimezone(timezone.utc).replace(
        minute=0,
        second=0,
        microsecond=0,
    )
    api_start = local_start.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    api_end = rounded_now.isoformat().replace("+00:00", "Z")
    end_date = rounded_now.astimezone(account_timezone).date().isoformat()
    return api_start, api_end, end_date


def iso3_country(alpha2: str) -> tuple[str, str] | None:
    if alpha2 == "XK":
        return "XKX", "Kosovo"
    country = pycountry.countries.get(alpha_2=alpha2)
    if country is None:
        return None
    return country.alpha_3, country.name


def public_country_name(value: Any, fallback: str) -> str:
    """Return a short display name that cannot terminate an embedded JSON script."""
    candidate = value.strip() if isinstance(value, str) else ""
    if (
        not candidate
        or len(candidate) > 100
        or "<" in candidate
        or ">" in candidate
        or any(ord(character) < 32 for character in candidate)
    ):
        return fallback
    return candidate


def build_snapshot(
    rows: list[dict[str, Any]],
    start_date: str,
    end_date: str,
    minimum: int,
    centroids: dict[str, tuple[float, float]] | None = None,
    scope: str = "all_paths",
) -> dict[str, Any]:
    centroids = centroids or load_country_centroids()
    totals: dict[str, int] = {}
    names: dict[str, str] = {}
    positions: dict[str, tuple[float, float]] = {}
    all_visitors = 0
    unmapped_visitors = 0

    for row in rows:
        raw_count = row.get("count")
        if not isinstance(raw_count, int) or isinstance(raw_count, bool):
            raise ValueError("GoatCounter returned an invalid visitor count")
        count = raw_count
        if count < 0:
            raise ValueError("GoatCounter returned a negative visitor count")
        all_visitors += count

        alpha2 = str(row.get("id", "")).split("-", 1)[0].upper()
        if not re.fullmatch(r"[A-Z]{2}", alpha2):
            unmapped_visitors += count
            continue
        country = iso3_country(alpha2)
        position = centroids.get(alpha2)
        if country is None or position is None:
            unmapped_visitors += count
            continue

        iso3, fallback_name = country
        totals[iso3] = totals.get(iso3, 0) + count
        positions[iso3] = position
        names[iso3] = public_country_name(row.get("name", ""), fallback_name)

    countries = [
        {
            "iso3": iso3,
            "name": names[iso3],
            "visitors": visitors,
            "latitude": positions[iso3][0],
            "longitude": positions[iso3][1],
        }
        for iso3, visitors in totals.items()
        if visitors >= minimum
    ]
    countries.sort(key=lambda item: (-item["visitors"], item["name"]))
    displayed_visitors = sum(item["visitors"] for item in countries)

    return {
        "source": "GoatCounter",
        "scope": scope,
        "updated_at": end_date,
        "period": {"start": start_date, "end": end_date},
        "privacy": {"minimum_country_visitors": minimum},
        "total_visitors": all_visitors,
        "displayed_visitors": displayed_visitors,
        "suppressed_visitors": sum(totals.values()) - displayed_visitors,
        "unmapped_visitors": unmapped_visitors,
        "countries": countries,
    }


def snapshot_content(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Return fields that reflect public data, excluding sync-only dates."""
    comparable = dict(snapshot)
    comparable.pop("updated_at", None)
    period = dict(comparable.get("period", {}))
    period.pop("end", None)
    comparable["period"] = period
    return comparable


def validate_snapshot_update(
    snapshot: dict[str, Any],
    existing: dict[str, Any] | None,
) -> None:
    if existing is None:
        return

    new_scope = snapshot.get("scope", "all_paths")
    old_scope = existing.get("scope", "all_paths")
    if new_scope != old_scope:
        raise ValueError(
            f"Refusing to replace {old_scope!r} visitor data with {new_scope!r} data"
        )

    new_period = snapshot.get("period", {})
    old_period = existing.get("period", {})
    new_start = new_period.get("start")
    old_start = old_period.get("start")
    if new_start and old_start and date.fromisoformat(new_start) > date.fromisoformat(old_start):
        raise ValueError("Refusing to replace visitor data with a later start date")

    new_end = new_period.get("end")
    old_end = old_period.get("end")
    if new_end and old_end and date.fromisoformat(new_end) < date.fromisoformat(old_end):
        raise ValueError("Refusing to replace visitor data with an earlier end date")

    new_total = snapshot.get("total_visitors")
    old_total = existing.get("total_visitors")
    if isinstance(new_total, int) and isinstance(old_total, int) and new_total < old_total:
        raise ValueError(
            "Refusing to replace visitor history with a lower total; check GoatCounter retention and filters"
        )

    new_minimum = snapshot.get("privacy", {}).get("minimum_country_visitors")
    old_minimum = existing.get("privacy", {}).get("minimum_country_visitors")
    if new_minimum == old_minimum:
        new_countries = {
            country.get("iso3"): country.get("visitors")
            for country in snapshot.get("countries", [])
            if isinstance(country, dict)
        }
        for country in existing.get("countries", []):
            if not isinstance(country, dict):
                continue
            iso3 = country.get("iso3")
            old_count = country.get("visitors")
            new_count = new_countries.get(iso3, 0)
            if (
                isinstance(old_count, int)
                and isinstance(new_count, int)
                and new_count < old_count
            ):
                raise ValueError(
                    f"Refusing to lower the cumulative visitor count for {iso3}"
                )


def write_if_changed(
    snapshot: dict[str, Any],
    existing: dict[str, Any] | None,
    path: Path = OUTPUT_PATH,
) -> bool:
    validate_snapshot_update(snapshot, existing)
    if existing is not None and snapshot_content(snapshot) == snapshot_content(existing):
        print("Visitor-country data is unchanged.")
        return False

    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n"
    with NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as temporary:
        temporary.write(serialized)
        temporary_path = Path(temporary.name)
    temporary_path.replace(path)
    try:
        display_path = path.relative_to(ROOT)
    except ValueError:
        display_path = path
    print(f"Updated {display_path} with {len(snapshot['countries'])} countries.")
    return True


def main() -> int:
    try:
        token = required_environment("GOATCOUNTER_API_TOKEN")
        site = os.environ.get("GOATCOUNTER_SITE", DEFAULT_SITE).strip() or DEFAULT_SITE
        timezone_name = (
            os.environ.get("GOATCOUNTER_TIMEZONE", DEFAULT_TIMEZONE).strip()
            or DEFAULT_TIMEZONE
        )
        path_filter = os.environ.get("GOATCOUNTER_PATH_FILTER", "").strip() or None
        minimum = positive_integer(
            os.environ.get("VISITOR_MAP_MIN_COUNT", str(DEFAULT_MINIMUM)),
            "VISITOR_MAP_MIN_COUNT",
        )
        existing = load_existing()
        start_date = os.environ.get(
            "GOATCOUNTER_START_DATE",
            str(existing.get("period", {}).get("start", DEFAULT_START_DATE))
            if existing
            else DEFAULT_START_DATE,
        )
        start, end, end_date = query_window(
            start_date,
            datetime.now(timezone.utc),
            timezone_name,
        )

        rows = fetch_locations(site, token, start, end, path_filter)
        snapshot = build_snapshot(
            rows,
            start_date,
            end_date,
            minimum,
            load_country_centroids(),
            f"path:{path_filter}" if path_filter else "all_paths",
        )
        write_if_changed(snapshot, existing)
        return 0
    except (ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(f"Visitor-map update failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
