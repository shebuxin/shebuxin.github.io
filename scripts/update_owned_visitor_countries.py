#!/usr/bin/env python3
"""Export only country aggregates from the owned backend to the public map."""

import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def build_snapshot(report, countries, minimum=2):
    if minimum < 1 or report.get("metric") != "pageviews":
        raise ValueError("Expected pageview country counts and a positive threshold")
    lookup = {country["cca2"]: country for country in countries}
    mapped, suppressed, unknown, total = [], 0, 0, 0
    for row in report["countries"]:
        count = row["count"]
        if not isinstance(count, int) or isinstance(count, bool) or count < 0:
            raise ValueError("Invalid country count")
        total += count
        country = lookup.get(row["id"])
        if not country or not country.get("latlng"):
            unknown += count
        elif count < minimum:
            suppressed += count
        else:
            mapped.append({"iso3": country["cca3"], "name": country["name"]["common"],
                           "visitors": count, "latitude": country["latlng"][0],
                           "longitude": country["latlng"][1]})
    mapped.sort(key=lambda item: (-item["visitors"], item["name"]))
    return {"source": "Self-hosted analytics", "scope": "all_paths", "metric": "pageviews",
            "updated_at": report["period"]["end"], "period": report["period"],
            "privacy": {"minimum_country_visitors": minimum}, "total_visitors": total,
            "displayed_visitors": sum(item["visitors"] for item in mapped),
            "suppressed_visitors": suppressed, "unmapped_visitors": unknown, "countries": mapped}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "_data/owned_visitor_countries.json")
    parser.add_argument("--minimum", type=int, default=2)
    args = parser.parse_args()
    base = os.environ.get("OWNED_ANALYTICS_URL", "").rstrip("/")
    parsed = urlsplit(base)
    if (parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "localhost"))) or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        parser.error("OWNED_ANALYTICS_URL must be an HTTPS backend URL (HTTP allowed only on localhost)")
    token = os.environ.get("ANALYTICS_ADMIN_TOKEN", "")
    if not token:
        parser.error("ANALYTICS_ADMIN_TOKEN is required")
    country_file = ROOT / "node_modules/world-countries/countries.json"
    if not country_file.exists():
        parser.error("Run npm ci to install the existing country-centroid dataset")
    request = Request(base + "/api/countries", headers={"Authorization": "Bearer " + token})
    with urlopen(request, timeout=30) as response:
        report = json.load(response)
    snapshot = build_snapshot(report, json.loads(country_file.read_text()), args.minimum)
    temporary = args.output.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    print(f"Updated {args.output.name}: {len(snapshot['countries'])} countries; metric: pageviews")


if __name__ == "__main__":
    main()
