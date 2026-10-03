import unittest
from scripts.update_owned_visitor_countries import build_snapshot


class OwnedMapTests(unittest.TestCase):
    def test_public_snapshot_uses_pageviews_hides_small_counts_and_keeps_unknown_total(self):
        report = {"metric": "pageviews", "period": {"start": "2026-10-03", "end": "2026-10-04"},
                  "countries": [{"id": "US", "count": 5}, {"id": "CN", "count": 1}, {"id": "Unknown", "count": 2}]}
        countries = [{"cca2": "US", "cca3": "USA", "name": {"common": "United States"}, "latlng": [38, -97]},
                     {"cca2": "CN", "cca3": "CHN", "name": {"common": "China"}, "latlng": [35, 105]}]
        snapshot = build_snapshot(report, countries)
        self.assertEqual(snapshot["metric"], "pageviews")
        self.assertEqual(snapshot["source"], "Self-hosted analytics")
        self.assertEqual(snapshot["total_visitors"], 8)
        self.assertEqual(snapshot["displayed_visitors"], 5)
        self.assertEqual(snapshot["suppressed_visitors"], 1)
        self.assertEqual(snapshot["unmapped_visitors"], 2)
        self.assertEqual([row["iso3"] for row in snapshot["countries"]], ["USA"])
        self.assertNotIn("visitor", snapshot["countries"][0])

    def test_rejects_negative_counts_wrong_metric_and_threshold(self):
        base = {"metric": "pageviews", "period": {"start": None, "end": None}, "countries": []}
        for report, minimum in (({**base, "countries": [{"id": "US", "count": -1}]}, 2),
                                ({**base, "metric": "visitors"}, 2), (base, 0)):
            with self.assertRaises(ValueError):
                build_snapshot(report, [], minimum)
