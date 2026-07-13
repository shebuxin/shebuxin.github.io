import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from scripts import import_goatcounter_export as importer


class GoatCounterExportImportTests(unittest.TestCase):
    def make_export(
        self,
        directory: str,
        *,
        site: str = importer.DEFAULT_SITE,
        version: str = "1.0",
        created_at: str = "2026-07-13T17:40:35Z",
        location_rows: list[dict] | None = None,
    ) -> Path:
        archive_path = Path(directory) / "goatcounter-export.zip"
        rows = location_rows or [
            {"day": "2024-11-30", "path_id": 1, "location": "US-WA", "count": 2},
            {"day": "2024-11-30", "path_id": 2, "location": "US-TN", "count": 3},
            {"day": "2026-07-13", "path_id": 2, "location": "GB", "count": 1},
        ]
        prefix = "goatcounter-export-test/"

        with ZipFile(archive_path, "w", ZIP_DEFLATED) as archive:
            archive.writestr(
                f"{prefix}info.json",
                json.dumps(
                    {
                        "export_version": version,
                        "created_for": site,
                        "created_at": created_at,
                    }
                ),
            )
            archive.writestr(
                f"{prefix}paths.jsonl",
                "\n".join(
                    [
                        json.dumps({"id": 1, "path": "/"}),
                        json.dumps({"id": 2, "path": "/publications"}),
                    ]
                ),
            )
            archive.writestr(
                f"{prefix}locations.jsonl",
                "\n".join(
                    [
                        json.dumps(
                            {
                                "country": "US",
                                "region": "WA",
                                "country_name": "United States",
                            }
                        ),
                        json.dumps(
                            {
                                "country": "US",
                                "region": "TN",
                                "country_name": "United States",
                            }
                        ),
                        json.dumps(
                            {
                                "country": "GB",
                                "region": "",
                                "country_name": "United Kingdom",
                            }
                        ),
                        json.dumps(
                            {"country": "", "region": "", "country_name": ""}
                        ),
                    ]
                ),
            )
            archive.writestr(
                f"{prefix}location_stats.jsonl",
                "\n".join(json.dumps(row) for row in rows),
            )

        return archive_path

    def test_import_aggregates_subdivisions_and_all_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = self.make_export(directory)
            rows, start, end, created_at = importer.import_rows(archive)

        self.assertEqual(start, "2024-11-30")
        self.assertEqual(end, "2026-07-13")
        self.assertEqual(created_at, "2026-07-13T17:40:35Z")
        self.assertEqual(
            rows,
            [
                {"id": "GB", "name": "United Kingdom", "count": 1},
                {"id": "US", "name": "United States", "count": 5},
            ],
        )

    def test_import_rejects_export_for_another_site(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = self.make_export(directory, site="other.goatcounter.com")
            with self.assertRaisesRegex(ValueError, "Export belongs to"):
                importer.import_rows(archive)

    def test_import_rejects_unsupported_version(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = self.make_export(directory, version="2.0")
            with self.assertRaisesRegex(ValueError, "Unsupported"):
                importer.import_rows(archive)

    def test_import_accepts_a_compatible_minor_version(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = self.make_export(directory, version="1.1")
            rows, _, _, _ = importer.import_rows(archive)

        self.assertEqual(sum(row["count"] for row in rows), 6)

    def test_import_rejects_duplicate_stat_rows(self):
        duplicate = {
            "day": "2026-07-13",
            "path_id": 1,
            "location": "US-WA",
            "count": 1,
        }
        with tempfile.TemporaryDirectory() as directory:
            archive = self.make_export(
                directory,
                location_rows=[duplicate, duplicate],
            )
            with self.assertRaisesRegex(ValueError, "duplicate row"):
                importer.import_rows(archive)

    def test_import_rejects_unknown_path(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = self.make_export(
                directory,
                location_rows=[
                    {
                        "day": "2026-07-13",
                        "path_id": 999,
                        "location": "US",
                        "count": 1,
                    }
                ],
            )
            with self.assertRaisesRegex(ValueError, "unknown path"):
                importer.import_rows(archive)

    def test_import_rejects_unknown_location_reference(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = self.make_export(
                directory,
                location_rows=[
                    {
                        "day": "2026-07-13",
                        "path_id": 1,
                        "location": "CA-ON",
                        "count": 1,
                    }
                ],
            )
            with self.assertRaisesRegex(ValueError, "unknown location code"):
                importer.import_rows(archive)

    def test_import_rejects_invalid_creation_timestamp(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = self.make_export(
                directory,
                created_at="</script><script>alert(1)</script>",
            )
            with self.assertRaisesRegex(ValueError, "invalid creation timestamp"):
                importer.import_rows(archive)

    def test_import_rejects_invalid_path_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = self.make_export(directory)
            replacement = Path(directory) / "invalid-path.zip"
            with ZipFile(archive) as source, ZipFile(
                replacement, "w", ZIP_DEFLATED
            ) as target:
                for info in source.infolist():
                    content = source.read(info)
                    if info.filename.endswith("paths.jsonl"):
                        content = json.dumps({"id": True, "path": "/"}).encode()
                    target.writestr(info, content)

            with self.assertRaisesRegex(ValueError, "invalid path ID"):
                importer.import_rows(replacement)

    def test_import_preserves_known_unknown_location_counts(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = self.make_export(
                directory,
                location_rows=[
                    {
                        "day": "2026-07-13",
                        "path_id": 1,
                        "location": "",
                        "count": 4,
                    }
                ],
            )
            rows, start, end, _ = importer.import_rows(archive)

        snapshot = importer.build_snapshot(
            rows,
            start,
            end,
            2,
            {"US": (38.0, -97.0)},
        )
        self.assertEqual(snapshot["total_visitors"], 4)
        self.assertEqual(snapshot["unmapped_visitors"], 4)
        self.assertEqual(snapshot["countries"], [])


if __name__ == "__main__":
    unittest.main()
