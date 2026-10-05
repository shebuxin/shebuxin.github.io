"""Course corpus boundaries, formula fidelity, source identity and repeatability."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("ece685_corpus", ROOT / "scripts/export_ece685_chat_corpus.py")
corpus = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = corpus
SPEC.loader.exec_module(corpus)


class CorpusTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.site = self.root / "_site"
        self.lecture = dict(id="L05", slug="l05-example", status="live", released=True,
                            lesson="l05-phasors", title=dict(en="Phasors", zh="相量"))
        self.catalog = [self.lecture, dict(id="L20", status="unreleased", released=False),
                        dict(id="L16", status="live", released=True)]
        self.write_json("_data/ece685.json", dict(lectures=self.catalog))
        self.write_json("_data/ece685_topics.json", dict(excluded_lectures=["L16", "L17", "L30", "L41"]))
        self.write("assets/slides/ece685/l05/student.pdf", "Student PDF fixture")
        self.metadata = dict(pdf="/assets/slides/ece685/l05/student.pdf",
                             sha256=corpus.digest(b"Student PDF fixture"), page_count=2,
                             pages_json="/assets/slides/ece685/l05/pages.json")
        self.write_json("_data/ece685_slides.json", dict(L05=self.metadata))
        self.pages = [dict(src=f"/assets/slides/ece685/l05/page-{n:03}.webp", text="Original page " + str(n)) for n in (1, 2)]
        self.write_json("assets/slides/ece685/l05/pages.json", self.pages)
        for page in self.pages:
            self.write(page["src"].lstrip("/"), "image fixture")
        self.write("assets/code/l05_phasors.py", "import math\nDEFAULTS = dict(rms=120)\ndef wrap(x):\n    return x % 360\ndef solve(case):\n    return wrap(case['rms'])\n")
        self.html = '<div data-ece-platform data-lecture-id="L05" data-lang="{lang}">' + "".join(
            '<section id="' + section + '"><h2>Published lesson</h2>'
            '<div data-math="V_{{rms}}^2=\\frac{{1}}{{T}}\\int_0^T v^2(t)\\,dt">lossy fallback</div>'
            '<script>UNRELEASED_SHARED_CONFIG</script><nav>NAVIGATION_ONLY</nav>'
            '<div data-slide-reader>UNNUMBERED_SLIDE_COPY</div><textarea>STUDENT_EDITOR</textarea>'
            '<details class="stage-source">L20_FUTURE_SOURCE</details><p hidden>HIDDEN_SOLUTION</p>'
            '<p role="status">LOADING_PLACEHOLDER</p><p>RMS uses a cosine reference.</p></section>'
            for section in corpus.SECTIONS) + '</div>'
        self.write_html()

    def write(self, relative, text):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def write_json(self, relative, value):
        self.write(relative, json.dumps(value))

    def write_html(self):
        for language in ("en", "zh"):
            path = "_site" + corpus.course_path(self.lecture, language) + "index.html"
            self.write(path, self.html.format(lang=language))

    def collect(self, **kwargs):
        return corpus.collect(self.root, self.site, **kwargs)

    def test_published_allowlist_and_exact_latex(self):
        docs, coverage, excluded = self.collect()
        self.assertEqual({d["lecture_id"] for d in docs}, {"L05"})
        self.assertIn("L20", excluded)
        self.assertIn("L16", excluded)
        self.assertEqual(coverage[0]["pdf_pages"], 2)
        lessons = [d for d in docs if d["kind"] == "lesson"]
        self.assertEqual(len(lessons), 8)
        for lesson in lessons:
            self.assertIn(r"$$V_{rms}^2=\frac{1}{T}\int_0^T v^2(t)\,dt$$", lesson["text"])
            for prohibited in ("lossy fallback", "UNRELEASED_SHARED_CONFIG", "NAVIGATION_ONLY", "UNNUMBERED_SLIDE_COPY",
                               "STUDENT_EDITOR", "L20_FUTURE_SOURCE", "HIDDEN_SOLUTION", "LOADING_PLACEHOLDER"):
                self.assertNotIn(prohibited, lesson["text"])

    def test_source_map_uses_physical_pdf_pages_and_language_paths(self):
        docs, _, _ = self.collect()
        page = next(d for d in docs if d["doc_id"] == "ECE685:L05:slide:002")
        self.assertEqual(page["source_url"], "/teaching/ece685/l05-example/?slide=2#lecture-overview")
        self.assertEqual(page["source_urls"]["zh"], "/zh" + page["source_url"])
        self.assertTrue(page["pdf_url"].endswith("#page=2"))

    def test_rejects_unreleased_exams_and_unknown_ids(self):
        for lecture_id in ("L20", "L16", "L99"):
            with self.subTest(lecture_id=lecture_id), self.assertRaisesRegex(ValueError, "Only released"):
                self.collect(lecture_ids=[lecture_id])

    def test_pdf_hash_must_match(self):
        self.write("assets/slides/ece685/l05/student.pdf", "Changed PDF")
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            self.collect()

    def test_page_count_and_image_order_must_match(self):
        self.write_json("assets/slides/ece685/l05/pages.json", self.pages[:1])
        with self.assertRaisesRegex(ValueError, "coverage mismatch"):
            self.collect()
        self.pages[1]["src"] = self.pages[0]["src"]
        self.write_json("assets/slides/ece685/l05/pages.json", self.pages)
        with self.assertRaisesRegex(ValueError, "physical page"):
            self.collect()

    def test_refuses_assets_outside_student_lecture_folder(self):
        self.metadata["pages_json"] = "/assets/slides/ece685/l05/../instructor.json"
        self.write_json("_data/ece685_slides.json", dict(L05=self.metadata))
        with self.assertRaisesRegex(ValueError, "Invalid student asset"):
            self.collect()

    def test_requires_built_sections_and_matching_lecture_identity(self):
        self.html = self.html.replace('data-lecture-id="L05"', 'data-lecture-id="L20"')
        self.write_html()
        with self.assertRaisesRegex(ValueError, "identity mismatch"):
            self.collect()

    def test_code_dependency_selection_does_not_execute_source(self):
        self.lecture.update(lesson="integrated", interactive_model="generation")
        self.write("assets/code/ece685_stage_one.py", "raise RuntimeError('must not execute')\nimport math\n"
                   "DEFAULTS = {'generation': dict(hours=2000), 'overview': dict(load_mw=80)}\n"
                   "def screening(p):\n    return p['hours']\ndef generation(p):\n    return screening(p)\n"
                   "def overview(p):\n    return 'UNRELATED_MODEL'\ndef solve(case):\n    return HANDLERS[case['module']](case)\n")
        docs = corpus.code_documents(self.root, self.lecture)
        self.assertEqual({d["function_name"] for d in docs}, {"screening", "generation", "solve"})
        text = "\n".join(d["text"] for d in docs)
        self.assertNotIn("UNRELATED_MODEL", text)
        self.assertNotIn("load_mw", text)
        self.assertIn("hours=2000", text)

    def test_quality_report_retains_empty_page_without_inventing_content(self):
        self.pages[1]["text"] = ""
        self.write_json("assets/slides/ece685/l05/pages.json", self.pages)
        docs, coverage, _ = self.collect()
        page = coverage[0]["pages"][1]
        self.assertFalse(page["text_searchable"])
        self.assertEqual(page["flags"], ["no_extracted_text"])
        self.assertEqual(next(d["text"] for d in docs if d["doc_id"].endswith("slide:002")), "")
        self.assertIn("math_layout_needs_review", corpus.quality_flags("x̂2 cos2 θ\n𝑇\n𝑋"))
        self.assertIn("suspect_glyphs", corpus.quality_flags("bad \ufffd glyph"))

    def test_export_repeatability_hashes_and_content_version(self):
        output = self.root / "output"
        first, report = corpus.export(self.root, self.site, output)
        before = (first / "manifest.json").read_bytes()
        second, _ = corpus.export(self.root, self.site, output)
        self.assertEqual(first, second)
        self.assertEqual(before, (second / "manifest.json").read_bytes())
        manifest = json.loads(before)
        self.assertEqual(manifest["documents_sha256"], corpus.digest((first / "documents.jsonl").read_bytes()))
        for upload in manifest["uploads"]:
            self.assertEqual(upload["sha256"], corpus.digest((first / upload["path"]).read_bytes()))
        self.assertEqual(report["document_counts"]["slide"], 2)
        self.pages[0]["text"] += " changed"
        self.write_json("assets/slides/ece685/l05/pages.json", self.pages)
        third, _ = corpus.export(self.root, self.site, output)
        self.assertNotEqual(first, third)


if __name__ == "__main__":
    unittest.main()
