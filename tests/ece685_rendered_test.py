"""Check the imported lecture shell after a Jekyll build."""
import json
import hashlib
from collections import Counter
import os
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / "_data/ece685.json").read_text())
SLIDES = json.loads((ROOT / "_data/ece685_slides.json").read_text())
SITE = Path(os.environ.get("ECE685_SITE_DIR", ROOT / "_site"))


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.links = []
        self.headings = []
        self.card_ids = []
        self.current_lecture = None
        self.outline_slides = []
        self.ids = set()
        self.id_counts = Counter()
        self.lecture_navigation = 0
        self.navigation_ids = []
        self.current_links = []
        self.feed(path.read_text())

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            self.ids.add(attrs["id"])
            self.id_counts[attrs["id"]] += 1
        if tag == "a":
            self.links.append(attrs.get("href", ""))
            if attrs.get("aria-current") == "page" and "hreflang" not in attrs:
                self.current_links.append(attrs.get("href"))
        if tag == "nav" and attrs.get("aria-label") == "Lecture Navigation":
            self.lecture_navigation += 1
        if "data-reviewed-dot" in attrs:
            self.navigation_ids.append(attrs["data-reviewed-dot"])
        if "data-lecture-card" in attrs:
            self.card_ids.append(attrs["data-lecture-card"])
        if "data-lecture-id" in attrs:
            self.current_lecture = attrs["data-lecture-id"]
        if tag == "li" and "value" in attrs:
            self.outline_slides.append(int(attrs["value"]))


class LectureShellTest(unittest.TestCase):
    def test_one_complete_navigation_and_release_states(self):
        ids = [lecture["id"] for lecture in MANIFEST["lectures"]]
        released = [lecture for lecture in MANIFEST["lectures"] if lecture["status"] == "live"]
        self.assertEqual(len(ids), 30)
        self.assertEqual(len(released), 16)
        self.assertEqual(len(MANIFEST["groups"]), 10)
        self.assertEqual(set(SLIDES), {lecture["id"] for lecture in released})
        for prefix in ("", "zh/"):
            course = SITE / prefix / "teaching/ece685"
            for path in [course / "index.html"] + [course / lecture["slug"] / "index.html" for lecture in MANIFEST["lectures"]]:
                with self.subTest(path=path):
                    html, page = path.read_text(), Page(path)
                    self.assertEqual(page.lecture_navigation, 1)
                    self.assertEqual(page.navigation_ids, ids)
                    self.assertNotIn('stage-navigation', html)
                    self.assertNotIn('data-stage-index', html)
                    self.assertNotIn('data-stage-card', html)
                    self.assertEqual(len(page.current_links), 1)
                    self.assertFalse([name for name, count in page.id_counts.items() if count > 1])
            overview = (course / "index.html").read_text()
            self.assertNotIn('course-python-runner.js', overview)
            self.assertNotIn('Lecture 01', overview)
            for lecture in MANIFEST["lectures"]:
                html = (course / lecture["slug"] / "index.html").read_text()
                if lecture["status"] != "live":
                    body = html.split('<div class="ece-lecture-meta"', 1)[1]
                    self.assertIn('to be released', body)
                    for marker in ('data-slide-reader', 'data-stage-module=', 'data-l05', 'course-python-runner.js'):
                        self.assertNotIn(marker, body)
                    self.assertNotIn('/modules/', body)
                else:
                    self.assertIn('data-slide-reader', html)
                    self.assertIn(SLIDES[lecture["id"]]["pdf"], html)
                    self.assertIn(SLIDES[lecture["id"]]["pages_json"], html)
                    self.assertIn('ece685-slides.js', html)
                    if lecture.get("lesson") == "integrated":
                        self.assertIn('data-continuous="true"', html)
                        self.assertIn('data-stage-module="' + lecture["interactive_model"] + '"', html)
                        self.assertIn('data-practice-lecture="' + lecture["id"] + '"', html)
                        for marker in ('data-stage-param', 'data-stage-diagram', 'data-stage-plot',
                                       'data-experiment-editor', 'data-solver-editor', 'data-stage-practice',
                                       'data-stage-quiz', 'data-stage-solution'):
                            self.assertIn(marker, html)
                        for asset in ('ece685-stage-model.js', 'ece685-stage-lesson.js',
                                      'ece685_stage_one.py', 'course-python-runner.js'):
                            self.assertIn(asset, html)
                        self.assertNotIn('ece-module-bridge', html)

    def test_legacy_routes_redirect_to_original_lectures(self):
        targets = {"overview": "L01", "generation": "L03", "single-phase": "L06",
                   "three-phase": "L08", "transformers": "L10", "per-unit": "L13"}
        for prefix in ("", "zh/"):
            course = SITE / prefix / "teaching/ece685"
            root_redirect = (course / "lecture-01/index.html").read_text()
            self.assertIn('http-equiv="refresh"', root_redirect)
            self.assertNotIn('data-stage-index', root_redirect)
            for model, target in targets.items():
                slug = next(lecture["slug"] for lecture in MANIFEST["lectures"] if lecture["id"] == target)
                for family in ("modules", "lecture-01"):
                    with self.subTest(language=prefix, family=family, model=model):
                        html = (course / family / model / "index.html").read_text()
                        self.assertIn('http-equiv="refresh"', html)
                        self.assertIn('/ece685/' + slug + '/', html)
                        self.assertNotIn('data-stage-module=', html)
                        self.assertNotIn('stage-navigation', html)

    def test_original_student_pdf_fidelity_and_complete_web_pages(self):
        for lecture_id, slides in SLIDES.items():
            with self.subTest(lecture=lecture_id):
                pdf = ROOT / slides["pdf"].lstrip("/")
                self.assertEqual(hashlib.sha256(pdf.read_bytes()).hexdigest(), slides["sha256"])
                self.assertNotIn('narration', str(pdf))
                pages = json.loads((ROOT / slides["pages_json"].lstrip("/")).read_text())
                self.assertEqual(len(pages), slides["page_count"])
                self.assertEqual(pages[0]["src"], slides["first_page"])
                self.assertGreater(slides["width"], 1000)
                for index, page in enumerate(pages, 1):
                    self.assertTrue(page["src"].endswith(f"page-{index:03d}.webp"))
                    self.assertIsInstance(page["text"], str)
                    content = (ROOT / page["src"].lstrip("/")).read_bytes()
                    self.assertEqual(content[:4], b"RIFF")
                    self.assertEqual(content[8:12], b"WEBP")
                    self.assertTrue((SITE / page["src"].lstrip("/")).is_file())
                self.assertTrue((SITE / slides["pdf"].lstrip("/")).is_file())

    def test_l05_teaching_loop_and_scoped_assets(self):
        lecture = next(item for item in MANIFEST["lectures"] if item["id"] == "L05")
        self.assertEqual(lecture["status"], "live")
        for prefix in ("", "zh/"):
            base = SITE / prefix / "teaching/ece685"
            html = (base / lecture["slug"] / "index.html").read_text()
            for marker in ('data-continuous="true"', 'data-l05', 'data-phasor',
                           'data-waveform', 'data-phase-wave', 'data-numerical-practice',
                           'data-diagnostic', 'data-compatibility', 'data-experiment-editor',
                           'data-solver-editor', 'data-practice-solution'):
                self.assertIn(marker, html)
            for asset in ("l05-phasor-model.js", "l05-phasor-lesson.js", "l05-phasors.css", "l05_phasors.py"):
                self.assertIn(asset, html)
            other = (base / MANIFEST["lectures"][0]["slug"] / "index.html").read_text()
            self.assertNotIn('l05-phasor-lesson.js', other)

    def test_lecture_catalog_and_language_paths(self):
        lectures = MANIFEST["lectures"]
        ids = [item["id"] for item in lectures]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertIn("L09b", ids)
        self.assertEqual(ids[ids.index("L09") + 1], "L09b")
        self.assertEqual(ids[ids.index("L15") + 1], "L20")
        for prefix in ("", "/zh"):
            course = prefix + "/teaching/ece685/"
            overview_path = SITE / course.strip("/") / "index.html"
            overview = Page(overview_path)
            self.assertEqual(overview.card_ids, ids)
            self.assertEqual(overview.current_lecture, "")
            for index, lecture in enumerate(lectures):
                with self.subTest(language=prefix, lecture=lecture["id"]):
                    url = course + lecture["slug"] + "/"
                    self.assertIn(url, overview.links)
                    path = SITE / url.strip("/") / "index.html"
                    page = Page(path)
                    self.assertEqual(page.current_lecture, lecture["id"])
                    self.assertEqual(page.outline_slides, [slide["slide"] for slide in lecture["slide_outline"]])
                    for section in ("overview", "experiment", "code", "practice"):
                        self.assertIn("lecture-" + section, page.ids)
                    if index > 0:
                        self.assertIn(course + lectures[index - 1]["slug"] + "/", page.links)
                    if index + 1 < len(lectures):
                        self.assertIn(course + lectures[index + 1]["slug"] + "/", page.links)
                    self.assertNotIn(prefix + "/teaching/power-flow/", page.links)
                    html = path.read_text()
                    lang = "zh" if prefix else "en"
                    self.assertIn(lecture["title"][lang], html)
                    for slide in lecture["slide_outline"]:
                        self.assertTrue(slide["title"])
                        self.assertNotIn("\\", slide["title"])

    def test_assessment_pages_and_assets_are_not_published(self):
        removed_ids = {"L16", "L17", "L30", "L41"}
        self.assertFalse(removed_ids.intersection(lecture["id"] for lecture in MANIFEST["lectures"]))
        self.assertFalse({"exam-one", "exam-two", "final-review"}.intersection(group["id"] for group in MANIFEST["groups"]))
        removed_routes = ("l16-exam1-practice", "l17-exam1-review", "l30-exam2-review",
                          "l41-comprehensive-final-review", "modules/exam-review", "lecture-01/exam-review")
        for prefix in ("", "zh/"):
            course = SITE / prefix / "teaching/ece685"
            for route in removed_routes:
                self.assertFalse((course / route / "index.html").exists())
            for path in course.rglob("*.html"):
                html = path.read_text()
                for route in removed_routes:
                    self.assertNotIn("/ece685/" + route + "/", html)
                self.assertNotIn('data-stage-module="exam-review"', html)
        for base in (ROOT, SITE):
            for folder in ("l16", "l17"):
                self.assertFalse((base / "assets/slides/ece685" / folder).exists())
            self.assertFalse((base / "assets/images/teaching/stage-exam-review.svg").exists())

    def test_removed_demo_and_shared_course_styles(self):
        for prefix in ("", "zh/"):
            self.assertFalse((SITE / prefix / "teaching/power-flow/index.html").exists())
            teaching = Page(SITE / prefix / "teaching/index.html")
            self.assertTrue(any("/ece685/" in url for url in teaching.links))
        for asset in ("power-flow-model.js", "power-flow-lab.js"):
            self.assertFalse((ROOT / "assets/js" / asset).exists())
        for slug in ("balanced-power-flow", "unbalanced-power-flow"):
            html = (SITE / "teaching/physics-informed-gnn" / slug / "index.html").read_text()
            self.assertIn("/assets/css/course.css", html)
            self.assertNotIn('href="/assets/css/power-flow.css"', html)


if __name__ == "__main__":
    unittest.main()
