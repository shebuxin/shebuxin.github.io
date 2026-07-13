#!/usr/bin/env python3
"""Create the public visitor-country snapshot from a GoatCounter JSON export."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Iterator
from zipfile import BadZipFile, ZipFile, ZipInfo

if __package__:
    from .update_visitor_countries import (
        DEFAULT_MINIMUM,
        DEFAULT_SITE,
        OUTPUT_PATH,
        build_snapshot,
        load_country_centroids,
        load_existing,
        positive_integer,
        write_if_changed,
    )
else:  # Support `python scripts/import_goatcounter_export.py ...`.
    from update_visitor_countries import (
        DEFAULT_MINIMUM,
        DEFAULT_SITE,
        OUTPUT_PATH,
        build_snapshot,
        load_country_centroids,
        load_existing,
        positive_integer,
        write_if_changed,
    )


MAX_ARCHIVE_UNCOMPRESSED_BYTES = 250 * 1024 * 1024
MAX_MEMBER_BYTES = 100 * 1024 * 1024
MAX_MEMBERS = 1_000
REQUIRED_MEMBERS = {
    "info.json",
    "paths.jsonl",
    "locations.jsonl",
    "location_stats.jsonl",
}


def member_index(archive: ZipFile) -> dict[str, ZipInfo]:
    members: dict[str, ZipInfo] = {}
    total_size = 0

    if len(archive.infolist()) > MAX_MEMBERS:
        raise ValueError("GoatCounter export contains too many members")
    for info in archive.infolist():
        if info.is_dir():
            continue
        if info.flag_bits & 0x1:
            raise ValueError("Encrypted GoatCounter exports are not supported")
        if info.file_size > MAX_MEMBER_BYTES:
            raise ValueError(f"Export member {info.filename} is unexpectedly large")
        total_size += info.file_size
        basename = PurePosixPath(info.filename).name
        if basename in members:
            raise ValueError(f"Export contains duplicate member name {basename}")
        members[basename] = info

    if total_size > MAX_ARCHIVE_UNCOMPRESSED_BYTES:
        raise ValueError("GoatCounter export is unexpectedly large")
    missing = REQUIRED_MEMBERS - members.keys()
    if missing:
        raise ValueError(f"GoatCounter export is missing {', '.join(sorted(missing))}")
    return members


def read_json_object(archive: ZipFile, member: ZipInfo) -> dict[str, Any]:
    with archive.open(member) as stream:
        parsed = json.loads(stream.read().decode("utf-8"))
    if not isinstance(parsed, dict):
        raise ValueError(f"{member.filename} must contain a JSON object")
    return parsed


def read_json_lines(archive: ZipFile, member: ZipInfo) -> Iterator[dict[str, Any]]:
    with archive.open(member) as stream:
        for line_number, raw_line in enumerate(stream, 1):
            if not raw_line.strip():
                continue
            try:
                parsed = json.loads(raw_line)
            except json.JSONDecodeError as error:
                raise ValueError(
                    f"{member.filename} contains invalid JSON on line {line_number}"
                ) from error
            if not isinstance(parsed, dict):
                raise ValueError(
                    f"{member.filename} line {line_number} must be a JSON object"
                )
            yield parsed


def normalized_export_timestamp(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("GoatCounter export is missing a valid creation timestamp")
    candidate = value.strip()
    try:
        parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("GoatCounter export has an invalid creation timestamp") from error
    if parsed.tzinfo is None:
        raise ValueError("GoatCounter export creation timestamp must include a timezone")
    return (
        parsed.astimezone(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def import_rows(
    archive_path: Path,
    expected_site: str = DEFAULT_SITE,
) -> tuple[list[dict[str, Any]], str, str, str]:
    if not archive_path.is_file():
        raise ValueError(f"Export file does not exist: {archive_path}")

    try:
        with ZipFile(archive_path) as archive:
            members = member_index(archive)
            corrupt_member = archive.testzip()
            if corrupt_member:
                raise ValueError(f"GoatCounter export has a CRC error in {corrupt_member}")
            metadata = read_json_object(archive, members["info.json"])
            export_version = metadata.get("export_version")
            if not isinstance(export_version, str) or not re.fullmatch(
                r"1\.\d+", export_version
            ):
                raise ValueError("Unsupported GoatCounter export version")
            if metadata.get("created_for") != expected_site:
                raise ValueError(
                    f"Export belongs to {metadata.get('created_for')!r}, not {expected_site!r}"
                )

            path_ids: set[int] = set()
            for row in read_json_lines(archive, members["paths.jsonl"]):
                path_id = row.get("id")
                if (
                    not isinstance(path_id, int)
                    or isinstance(path_id, bool)
                    or path_id < 1
                ):
                    raise ValueError("GoatCounter export contains an invalid path ID")
                if path_id in path_ids:
                    raise ValueError("GoatCounter export contains a duplicate path ID")
                path_ids.add(path_id)
            if not path_ids:
                raise ValueError("GoatCounter export does not contain any paths")

            country_names: dict[str, str] = {}
            known_locations: set[str] = set()
            for row in read_json_lines(archive, members["locations.jsonl"]):
                raw_country = row.get("country")
                country_code = (
                    str(raw_country).strip().upper() if raw_country is not None else ""
                )
                raw_region = row.get("region")
                region = str(raw_region).strip().upper() if raw_region else ""
                raw_country_name = row.get("country_name")
                country_name = (
                    str(raw_country_name).strip()
                    if raw_country_name is not None
                    else ""
                )
                location_code = (
                    f"{country_code}-{region}" if region else country_code
                )
                known_locations.add(location_code)
                if re.fullmatch(r"[A-Z]{2}", country_code):
                    if country_name:
                        country_names.setdefault(country_code, country_name)

            country_counts: Counter[str] = Counter()
            unknown_count = 0
            days: set[str] = set()
            seen_rows: set[tuple[str, Any, str]] = set()
            for row in read_json_lines(archive, members["location_stats.jsonl"]):
                path_id = row.get("path_id")
                if (
                    not isinstance(path_id, int)
                    or isinstance(path_id, bool)
                    or path_id not in path_ids
                ):
                    raise ValueError("Location statistics reference an unknown path ID")
                raw_count = row.get("count")
                if not isinstance(raw_count, int) or isinstance(raw_count, bool) or raw_count < 0:
                    raise ValueError("Location statistics contain an invalid count")
                raw_day = str(row.get("day", ""))
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw_day):
                    raise ValueError("Location statistics contain an invalid day")
                try:
                    date.fromisoformat(raw_day)
                except ValueError as error:
                    raise ValueError("Location statistics contain an invalid day") from error
                days.add(raw_day)

                location = str(row.get("location", "")).upper()
                if location not in known_locations:
                    raise ValueError(
                        "Location statistics reference an unknown location code"
                    )
                row_key = (raw_day, path_id, location)
                if row_key in seen_rows:
                    raise ValueError("Location statistics contain a duplicate row")
                seen_rows.add(row_key)

                alpha2 = location.split("-", 1)[0]
                if re.fullmatch(r"[A-Z]{2}", alpha2):
                    country_counts[alpha2] += raw_count
                else:
                    unknown_count += raw_count

            if not days:
                raise ValueError("GoatCounter export does not contain location statistics")

            rows = [
                {
                    "id": alpha2,
                    "name": country_names.get(alpha2, ""),
                    "count": count,
                }
                for alpha2, count in sorted(country_counts.items())
            ]
            if unknown_count:
                rows.append({"id": "", "name": "Unknown", "count": unknown_count})
            created_at = normalized_export_timestamp(metadata.get("created_at"))
            return rows, min(days), max(days), created_at
    except BadZipFile as error:
        raise ValueError("File is not a valid ZIP archive") from error


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import aggregate country visits from a GoatCounter JSON export ZIP."
    )
    parser.add_argument("archive", type=Path, help="Path to the GoatCounter export ZIP")
    parser.add_argument(
        "--minimum",
        default=str(DEFAULT_MINIMUM),
        help=f"Minimum visits required to publish a country (default: {DEFAULT_MINIMUM})",
    )
    parser.add_argument(
        "--site",
        default=DEFAULT_SITE,
        help=f"Expected GoatCounter site hostname (default: {DEFAULT_SITE})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_PATH,
        help=f"Snapshot output path (default: {OUTPUT_PATH})",
    )
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    try:
        minimum = positive_integer(arguments.minimum, "--minimum")
        rows, start_date, end_date, created_at = import_rows(
            arguments.archive,
            arguments.site,
        )
        snapshot = build_snapshot(
            rows,
            start_date,
            end_date,
            minimum,
            load_country_centroids(),
            "all_paths",
        )
        snapshot["source"] = "GoatCounter JSON export"
        snapshot["imported_at"] = created_at or None
        existing = load_existing(arguments.output)
        write_if_changed(snapshot, existing, arguments.output)
        print(
            f"Imported {snapshot['total_visitors']} aggregate visits from "
            f"{start_date} through {end_date}; "
            f"{len(snapshot['countries'])} countries meet the public threshold."
        )
        return 0
    except (ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(f"GoatCounter export import failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
