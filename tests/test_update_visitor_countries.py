import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from scripts import update_visitor_countries as updater


class VisitorCountrySnapshotTests(unittest.TestCase):
    centroids = {
        "US": (38.0, -97.0),
        "GB": (54.0, -2.0),
        "CA": (60.0, -95.0),
    }

    def test_build_snapshot_aggregates_and_suppresses_small_countries(self):
        rows = [
            {"id": "US", "name": "United States", "count": 5},
            {"id": "US-CA", "name": "United States", "count": 2},
            {"id": "GB", "name": "United Kingdom", "count": 3},
            {"id": "CA", "name": "Canada", "count": 1},
            {"id": "??", "name": "Unknown", "count": 4},
        ]

        snapshot = updater.build_snapshot(
            rows, "2024-11-30", "2026-07-13", 2, self.centroids
        )

        self.assertEqual(snapshot["total_visitors"], 15)
        self.assertEqual(snapshot["displayed_visitors"], 10)
        self.assertEqual(snapshot["suppressed_visitors"], 1)
        self.assertEqual(snapshot["unmapped_visitors"], 4)
        self.assertEqual(
            snapshot["countries"],
            [
                {
                    "iso3": "USA",
                    "name": "United States",
                    "visitors": 7,
                    "latitude": 38.0,
                    "longitude": -97.0,
                },
                {
                    "iso3": "GBR",
                    "name": "United Kingdom",
                    "visitors": 3,
                    "latitude": 54.0,
                    "longitude": -2.0,
                },
            ],
        )

    def test_build_snapshot_rejects_non_integer_counts(self):
        with self.assertRaisesRegex(ValueError, "invalid visitor count"):
            updater.build_snapshot(
                [{"id": "US", "name": "United States", "count": "2"}],
                "2024-11-30",
                "2026-07-13",
                2,
                self.centroids,
            )

    def test_build_snapshot_rejects_markup_in_country_names(self):
        snapshot = updater.build_snapshot(
            [{"id": "US", "name": "</script><script>alert(1)</script>", "count": 2}],
            "2024-11-30",
            "2026-07-13",
            2,
            self.centroids,
        )

        self.assertEqual(snapshot["countries"][0]["name"], "United States")

    def test_country_centroids_cover_small_countries_missing_from_the_base_map(self):
        centroids = updater.load_country_centroids()
        self.assertGreaterEqual(len(centroids), 200)
        snapshot = updater.build_snapshot(
            [{"id": "SG", "name": "Singapore", "count": 2}],
            "2024-11-30",
            "2026-07-13",
            2,
            centroids,
        )
        self.assertEqual(snapshot["countries"][0]["iso3"], "SGP")
        self.assertAlmostEqual(snapshot["countries"][0]["latitude"], 1.36666666)
        self.assertAlmostEqual(snapshot["countries"][0]["longitude"], 103.8)

    def test_fetch_locations_paginates_across_the_site(self):
        responses = [
            {"stats": [{"id": "US", "name": "United States", "count": 5}], "more": True},
            {"stats": [{"id": "GB", "name": "United Kingdom", "count": 3}], "more": False},
        ]

        with patch.object(updater, "request_json", side_effect=responses) as request:
            rows = updater.fetch_locations(
                "example.goatcounter.com",
                "secret-token",
                "2024-11-30T00:00:00Z",
                "2026-07-13T12:00:00Z",
            )

        self.assertEqual([row["id"] for row in rows], ["US", "GB"])
        first_query = parse_qs(urlsplit(request.call_args_list[0].args[0]).query)
        second_query = parse_qs(urlsplit(request.call_args_list[1].args[0]).query)
        self.assertNotIn("include_paths", first_query)
        self.assertNotIn("path_by_name", first_query)
        self.assertEqual(first_query["offset"], ["0"])
        self.assertEqual(second_query["offset"], ["1"])

    def test_query_window_uses_the_account_timezone_across_dst(self):
        winter_start, winter_end, winter_day = updater.query_window(
            "2024-11-30",
            datetime(2024, 12, 1, 3, 45, tzinfo=timezone.utc),
            "America/Chicago",
        )
        summer_start, summer_end, summer_day = updater.query_window(
            "2026-07-13",
            datetime(2026, 7, 14, 3, 45, tzinfo=timezone.utc),
            "America/Chicago",
        )

        self.assertEqual(winter_start, "2024-11-30T06:00:00Z")
        self.assertEqual(winter_end, "2024-12-01T03:00:00Z")
        self.assertEqual(winter_day, "2024-11-30")
        self.assertEqual(summer_start, "2026-07-13T05:00:00Z")
        self.assertEqual(summer_end, "2026-07-14T03:00:00Z")
        self.assertEqual(summer_day, "2026-07-13")

    def test_write_if_changed_ignores_sync_dates(self):
        snapshot = updater.build_snapshot(
            [{"id": "US", "name": "United States", "count": 5}],
            "2024-11-30",
            "2026-07-13",
            2,
            self.centroids,
        )

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "visitor_countries.json"
            self.assertTrue(updater.write_if_changed(snapshot, None, output))
            existing = json.loads(output.read_text(encoding="utf-8"))
            later = dict(
                snapshot,
                updated_at="2026-07-14",
                period={"start": "2024-11-30", "end": "2026-07-14"},
            )
            self.assertFalse(updater.write_if_changed(later, existing, output))

    def test_write_rejects_a_scope_change(self):
        snapshot = updater.build_snapshot(
            [{"id": "US", "name": "United States", "count": 5}],
            "2024-11-30",
            "2026-07-13",
            2,
            self.centroids,
        )
        different_scope = dict(snapshot, scope="path:/")

        with self.assertRaisesRegex(ValueError, "Refusing to replace"):
            updater.validate_snapshot_update(different_scope, snapshot)

    def test_write_rejects_a_shorter_or_lower_history(self):
        existing = updater.build_snapshot(
            [{"id": "US", "name": "United States", "count": 5}],
            "2024-11-30",
            "2026-07-13",
            2,
            self.centroids,
        )
        later_start = dict(
            existing,
            period={"start": "2025-01-01", "end": "2026-07-13"},
        )
        lower_total = dict(existing, total_visitors=4)

        with self.assertRaisesRegex(ValueError, "later start date"):
            updater.validate_snapshot_update(later_start, existing)
        with self.assertRaisesRegex(ValueError, "lower total"):
            updater.validate_snapshot_update(lower_total, existing)

    def test_write_rejects_a_country_count_regression(self):
        existing = updater.build_snapshot(
            [
                {"id": "US", "name": "United States", "count": 5},
                {"id": "GB", "name": "United Kingdom", "count": 2},
            ],
            "2024-11-30",
            "2026-07-13",
            2,
            self.centroids,
        )
        regressed = updater.build_snapshot(
            [
                {"id": "US", "name": "United States", "count": 6},
                {"id": "GB", "name": "United Kingdom", "count": 1},
            ],
            "2024-11-30",
            "2026-07-14",
            2,
            self.centroids,
        )

        with self.assertRaisesRegex(ValueError, "cumulative visitor count for GBR"):
            updater.validate_snapshot_update(regressed, existing)


if __name__ == "__main__":
    unittest.main()
