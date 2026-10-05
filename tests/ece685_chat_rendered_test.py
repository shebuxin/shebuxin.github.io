"""Verify chat corpus against the real bilingual Jekyll output; run after build."""
import json
from pathlib import Path
import sys
import unittest
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import export_ece685_chat_corpus as corpus


class RenderedCorpusTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.docs, cls.coverage, cls.excluded = corpus.collect(ROOT, ROOT / "_site")
        cls.catalog = json.loads((ROOT / "_data/ece685.json").read_text())["lectures"]
        cls.slides = json.loads((ROOT / "_data/ece685_slides.json").read_text())
        cls.profiles = json.loads((ROOT / "_data/ece685_lecture_lessons.json").read_text())
        cls.modules = {m["id"]: m for m in json.loads((ROOT / "_data/ece685_stage_one.json").read_text())["modules"]}

    def test_all_released_pages_and_bilingual_sections_are_covered(self):
        live = {r["id"] for r in self.catalog if r["status"] == "live" and r["released"]}
        self.assertEqual({d["lecture_id"] for d in self.docs}, live)
        self.assertEqual(len([d for d in self.docs if d["kind"] == "slide"]), sum(self.slides[n]["page_count"] for n in live))
        self.assertEqual(len({d["doc_id"] for d in self.docs}), len(self.docs))
        for row in self.coverage:
            self.assertEqual(row["lesson_documents"], 8)
            self.assertEqual([p["page_number"] for p in row["pages"]], list(range(1, row["pdf_pages"] + 1)))

    def test_selected_concept_formulas_match_the_actual_lecture_profile(self):
        for lecture in self.catalog:
            if lecture.get("lesson") != "integrated" or lecture["status"] != "live":
                continue
            concepts = self.modules[lecture["interactive_model"]]["concepts"]
            expected = {"$$" + concepts[i]["formula"] + "$$" for i in self.profiles[lecture["id"]]["concept_indices"] if concepts[i]["formula"]}
            for language in ("en", "zh"):
                doc = next(d for d in self.docs if d["doc_id"] == f"ECE685:{lecture['id']}:lesson:{language}:lecture-overview")
                actual = {line for line in doc["text"].splitlines() if line.startswith("$$")}
                self.assertEqual(actual, expected, (lecture["id"], language))

    def test_every_source_resolves_to_a_real_section_and_pdf_page(self):
        parsed_pages = {}
        for doc in self.docs:
            for url in doc["source_urls"].values():
                parsed = urlsplit(url)
                path = ROOT / "_site" / parsed.path.lstrip("/") / "index.html"
                self.assertTrue(path.is_file(), url)
                if path not in parsed_pages:
                    tree = corpus.LessonHTML(path.read_text()).root
                    parsed_pages[path] = {n.attrs["id"] for n in tree.find(lambda n: "id" in n.attrs)}
                self.assertIn(parsed.fragment, parsed_pages[path], url)
                if doc["kind"] == "slide":
                    self.assertEqual(parse_qs(parsed.query)["slide"], [str(doc["page_number"])])
                    self.assertTrue(doc["pdf_url"].endswith("#page=" + str(doc["page_number"])))

    def test_l05_physical_pages_and_formula_examples(self):
        slides = [d for d in self.docs if d["lecture_id"] == "L05" and d["kind"] == "slide"]
        self.assertEqual(len(slides), self.slides["L05"]["page_count"])
        self.assertIn("RMS derivation", slides[11]["text"])
        doc = next(d for d in self.docs if d["doc_id"] == "ECE685:L05:lesson:zh:lecture-overview")
        for expected in (r"\frac{1}{T}\int_0^T v^2(t)", "atan2(b, a)", "126.491∠11.565°", "余弦参考", "180°"):
            self.assertIn(expected, doc["text"])


if __name__ == "__main__":
    unittest.main()
