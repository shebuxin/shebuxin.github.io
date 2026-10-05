"""Private reference provenance, edition separation and retrieval quality gates."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import export_ece685_chat_corpus as corpus
import import_ece685_chat_references as references


class Page:
    def __init__(self, text, font=None):
        self.text, self.font = text, font

    def extract_text(self, visitor_text=None):
        if visitor_text and self.font:
            visitor_text(self.text, [], [], {"/BaseFont": self.font}, 12)
        return self.text


class Destination:
    def __init__(self, title, page):
        self.title, self.page = title, page


class Reader:
    def __init__(self, pages, labels=None, outline=None):
        self.pages = pages
        self.page_labels = labels or [str(i) for i in range(1, len(pages) + 1)]
        self.outline = outline or []
        self.trailer = {"/Root": {"/PageLabels": True}} if labels else {"/Root": {}}

    def get_destination_page_number(self, node):
        return node.page - 1


class ReferenceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.materials = self.root / "materials"
        self.materials.mkdir()
        self.registry_path = self.root / "sources.json"
        self.notes_path = self.root / "notes.json"
        self.output = self.root / "output"
        self.sources = [
            dict(id="syllabus-2026", filename="syllabus-2026.pdf", kind="syllabus", role="current_course_policy",
                 title=dict(en="Fall 2026 Syllabus", zh="课程大纲"), year=2026, term="Fall 2026", page_count=1,
                 page_ranges=[[1, 1]], identity_check=dict(page=1, contains=["Fall 2026"]), access="private_reference"),
            dict(id="glover-6e", filename="glover-6e.pdf", kind="textbook", role="supplementary_edition",
                 title=dict(en="Textbook, Sixth Edition", zh="教材第六版"), year=2017, edition=6, page_count=2,
                 page_ranges=[[1, 2]], identity_check=dict(page=1, contains=["Sixth Edition"]),
                 section_lectures={"2.1": ["L05"], "2.2": ["L06"]}, access="private_reference")]
        for source in self.sources:
            data = source["filename"].encode()
            (self.materials / source["filename"]).write_bytes(data)
            source["sha256"] = corpus.digest(data)
        (self.materials / "grades.pdf").write_bytes(b"NOT_REGISTERED")
        self.registry = dict(schema_version=1, course_id="ECE685", current_term="Fall 2026",
                             platform_textbook_edition=7, sources=self.sources,
                             gaps=[dict(id="required-textbook-7e", status="missing")])
        self.readers = {"syllabus-2026.pdf": Reader([Page("Fall 2026. AI learning policy and course requirements.")]),
                        "glover-6e.pdf": Reader([Page("Sixth Edition. V 5 120/608; unsafe font mapping.", "/ABC+MathematicalPiLTStd-1"),
                                                Page("This section describes AC circuit references without damaged glyphs.")],
                                               labels=["41", "42"], outline=[Destination("Ch 2: Fundamentals", 1),
                                                                                [Destination("2.1: Phasors", 1), Destination("2.2: Power", 2)]])}
        self.notes = [dict(id="phasor", source_id="glover-6e", source_sha256=self.sources[1]["sha256"],
                           pdf_page_number=1, printed_page="41", section_id="2.1", lecture_ids=["L05"],
                           review_method="Visually checked source page", text=r"Verified RMS phasor: $$\mathbf V=120\angle60^\circ$$.")]

    def prepare(self):
        self.registry_path.write_text(json.dumps(self.registry))
        self.notes_path.write_text(json.dumps(dict(notes=self.notes)))
        return references.prepare(self.registry_path, self.materials, self.output, self.notes_path,
                                  reader_factory=lambda path: self.readers[path.name])

    def rows(self, path):
        return [json.loads(line) for line in path.read_text().splitlines()]

    def select_sixth_edition(self):
        self.registry.update(platform_textbook_edition=6, gaps=[], textbook_selection=dict(
            id="platform-textbook-selection", source_id="glover-6e", edition=6,
            selected_on="2026-10-04", authority="instructor", instruction="就按照第六版来准备就行",
            syllabus_source_id="syllabus-2026", syllabus_stated_edition=7,
            scope="Platform textbook basis; original syllabus unchanged."))
        self.sources[1]["role"] = "platform_textbook"
        self.readers["syllabus-2026.pdf"].pages[0].text = "Fall 2026. Required reading: Seventh Edition. AI policy."

    def test_platform_choice_is_indexed_without_rewriting_syllabus_or_page_citations(self):
        self.select_sixth_edition()
        folder, report = self.prepare()
        records, _, _ = corpus.collect_references(folder)
        syllabus = next(r for r in records if r["source_type"] == "syllabus")
        decision = next(r for r in records if r["source_type"] == "course_material_selection")
        self.assertIn("Required reading: Seventh Edition", syllabus["text"])
        self.assertEqual(syllabus["source_sha256"], self.sources[0]["sha256"])
        self.assertEqual(report["platform_textbook_edition"], 6)
        self.assertEqual(report["gaps"], [])
        self.assertEqual(report["material_selection_document_count"], 1)
        self.assertEqual(report["quarantined_pdf_pages"], 1)
        self.assertIsNone(decision["pdf_page_number"])
        self.assertIsNone(decision["printed_page"])
        self.assertIn("not a PDF excerpt", corpus.upload_markdown(decision))
        for record in records:
            if record["reference_id"] == "glover-6e":
                self.assertTrue(record["compatible_for_assigned_problem_lookup"])
                self.assertNotIn("different_from_platform_edition", record["quality_flags"])
        with patch.object(corpus, "collect", return_value=([], [], [])):
            combined, _ = corpus.export(ROOT, output=self.root / "combined", references=folder)
        manifest = json.loads((combined / "manifest.json").read_text())
        self.assertEqual(manifest["platform_textbook_edition"], 6)
        self.assertEqual(manifest["textbook_selection_doc_id"], decision["doc_id"])
        self.assertFalse(any("unsafe font mapping" in (combined / u["path"]).read_text() for u in manifest["uploads"]))

    def test_inconsistent_selection_cannot_label_a_different_edition_as_the_platform_basis(self):
        self.select_sixth_edition()
        self.registry["textbook_selection"]["edition"] = 7
        with self.assertRaisesRegex(ValueError, "selection does not match"):
            self.prepare()

    def test_material_selection_cannot_claim_a_pdf_page_even_in_a_rehashed_bundle(self):
        self.select_sixth_edition()
        folder, _ = self.prepare()
        records = self.rows(folder / "references.jsonl")
        decision = next(r for r in records if r["source_type"] == "course_material_selection")
        decision["pdf_page_number"] = decision["citation"]["pdf_page_number"] = 1
        data = "".join(json.dumps(r) + "\n" for r in records)
        (folder / "references.jsonl").write_text(data)
        manifest = json.loads((folder / "manifest.json").read_text())
        manifest["documents_sha256"] = corpus.digest(data.encode())
        (folder / "manifest.json").write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, "selection provenance"):
            corpus.collect_references(folder)

    def test_quality_gate_withholds_bad_math_and_keeps_verified_note(self):
        folder, report = self.prepare()
        records, _, _ = corpus.collect_references(folder)
        self.assertEqual(report["selected_pdf_pages"], 3)
        self.assertEqual(report["quarantined_pdf_pages"], 1)
        self.assertEqual(report["verified_note_count"], 1)
        self.assertEqual(len(records), 3)
        self.assertFalse(any("unsafe font mapping" in r["text"] for r in records))
        self.assertTrue(any(r["source_type"] == "verified_reference_note" for r in records))
        blocked = self.rows(folder / "quarantine.jsonl")
        self.assertFalse(blocked[0]["index_eligible"])
        self.assertIn("unverified_math_font_encoding", blocked[0]["quality_flags"])
        self.assertFalse(any("NOT_REGISTERED" in r["text"] for r in records))

    def test_editions_problem_numbers_and_private_citations_remain_separate(self):
        folder, _ = self.prepare()
        records, _, _ = corpus.collect_references(folder)
        note = next(r for r in records if r["source_type"] == "verified_reference_note")
        self.assertEqual(note["edition"], 6)
        self.assertFalse(note["compatible_for_assigned_problem_lookup"])
        self.assertEqual(note["citation"]["pdf_page_number"], 1)
        self.assertEqual(note["citation"]["printed_page"], "41")
        self.assertEqual(note["source_urls"], {})
        self.assertIsNone(note["source_url"])
        self.assertIsNone(note["citation"]["url"])
        self.assertIn("cannot identify the problem numbers", corpus.upload_markdown(note))

    def test_page_boundary_can_contain_two_sections(self):
        folder, _ = self.prepare()
        records, _, _ = corpus.collect_references(folder)
        page = next(r for r in records if r["reference_id"] == "glover-6e" and r["pdf_page_number"] == 2)
        self.assertEqual(page["section_ids"], ["2.1", "2.2"])
        self.assertEqual(page["lecture_ids"], ["L05", "L06"])

    def test_archived_syllabus_cannot_override_current_policy(self):
        self.sources[0]["term"] = "Fall 2025"
        with self.assertRaisesRegex(ValueError, "archived syllabus"):
            self.prepare()

    def test_file_hash_identity_and_page_count_are_checked(self):
        (self.materials / "glover-6e.pdf").write_bytes(b"wrong edition file")
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            self.prepare()
        (self.materials / "glover-6e.pdf").write_bytes(b"glover-6e.pdf")
        self.sources[1]["identity_check"]["contains"] = ["Seventh Edition"]
        with self.assertRaisesRegex(ValueError, "identity/version"):
            self.prepare()
        self.sources[1]["identity_check"]["contains"] = ["Sixth Edition"]
        self.sources[1]["page_count"] = 3
        with self.assertRaisesRegex(ValueError, "page count"):
            self.prepare()

    def test_material_paths_cannot_escape_registered_folder(self):
        self.sources[0]["filename"] = "../private-syllabus.pdf"
        with self.assertRaisesRegex(ValueError, "basename"):
            self.prepare()

    def test_stale_verified_notes_are_rejected(self):
        self.notes[0]["printed_page"] = "40"
        with self.assertRaisesRegex(ValueError, "stale source/page"):
            self.prepare()

    def test_verified_note_section_must_belong_to_the_cited_page(self):
        self.notes[0]["section_id"] = "3.3"
        with self.assertRaisesRegex(ValueError, "stale source/page"):
            self.prepare()

    def test_absent_printed_page_labels_are_not_invented(self):
        folder, _ = self.prepare()
        records, _, _ = corpus.collect_references(folder)
        syllabus = next(r for r in records if r["source_type"] == "syllabus")
        self.assertIsNone(syllabus["printed_page"])
        self.assertIn("PDF p. 1", syllabus["citation"]["label"])
        self.assertNotIn("printed p.", syllabus["citation"]["label"])

    def test_report_cover_label_is_not_claimed_as_a_printed_page(self):
        self.sources[0].update(kind="reading", role="dated_generation_data")
        self.readers["syllabus-2026.pdf"].trailer = {"/Root": {"/PageLabels": True}}
        folder, _ = self.prepare()
        records, _, _ = corpus.collect_references(folder)
        report = next(r for r in records if r["reference_id"] == "syllabus-2026")
        self.assertEqual(report["pdf_page_label"], "1")
        self.assertIsNone(report["printed_page"])
        self.assertNotIn("printed p.", report["citation"]["label"])

    def test_duplicate_and_invalid_page_ranges_are_rejected(self):
        self.sources[1]["page_ranges"] = [[1, 2], [2, 2]]
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            self.prepare()
        self.sources[1]["page_ranges"] = [[1, 3]]
        with self.assertRaisesRegex(ValueError, "Invalid reference page range"):
            self.prepare()

    def test_corpus_checks_bundle_hashes_before_any_upload(self):
        folder, _ = self.prepare()
        with (folder / "references.jsonl").open("a") as output:
            output.write("{}\n")
        with self.assertRaisesRegex(ValueError, "hash/file mismatch"):
            corpus.collect_references(folder)

    def test_even_rehashed_font_damaged_records_cannot_be_uploaded(self):
        folder, _ = self.prepare()
        records = self.rows(folder / "references.jsonl")
        records[0]["quality_flags"] = ["unverified_math_font_encoding"]
        data = "".join(json.dumps(r) + "\n" for r in records)
        (folder / "references.jsonl").write_text(data)
        manifest = json.loads((folder / "manifest.json").read_text())
        manifest["documents_sha256"] = corpus.digest(data.encode())
        (folder / "manifest.json").write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, "Quarantined"):
            corpus.collect_references(folder)

    def test_stable_version_and_combined_manifest_exclude_quarantine(self):
        folder, _ = self.prepare()
        again, _ = self.prepare()
        self.assertEqual(folder, again)
        with patch.object(corpus, "collect", return_value=([], [], [])):
            combined, report = corpus.export(ROOT, output=self.root / "combined", references=folder)
        self.assertEqual(report["rag_status"], "preparation_in_progress")
        manifest = json.loads((combined / "manifest.json").read_text())
        self.assertEqual(manifest["schema_version"], 2)
        self.assertEqual(manifest["document_count"], 3)
        self.assertFalse(any(u["doc_id"].endswith("page:0001") and u["reference_id"] == "glover-6e" for u in manifest["uploads"]))
        self.assertNotIn(str(self.materials), (combined / "manifest.json").read_text())

    def test_footer_cleanup_retains_body_equations_and_note_labels(self):
        text = "Body 2.1\nEquation (2.1.1)\n32134_ch02_ptg01.indd   41 07/12/15\nCopyright notice and broken watermark\n"
        self.assertEqual(references.clean_pdf_text(text, "textbook"), "Body 2.1\nEquation (2.1.1)")
        self.assertIn("Copyright notice", references.clean_pdf_text(text, "syllabus"))

    def test_private_corpus_cannot_be_written_into_public_site_assets(self):
        folder, _ = self.prepare()
        with patch.object(corpus, "collect", return_value=([], [], [])):
            with self.assertRaisesRegex(ValueError, "Private references must stay"):
                corpus.export(ROOT, output=ROOT / "assets/references", references=folder)
        with self.assertRaisesRegex(ValueError, "Private references must stay"):
            references.prepare(self.registry_path, self.materials, ROOT / "_site/private-books", self.notes_path)


if __name__ == "__main__":
    unittest.main()
