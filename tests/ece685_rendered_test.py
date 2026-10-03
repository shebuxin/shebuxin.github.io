"""Check the imported lecture shell after a Jekyll build."""
import json
import os
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / "_data/ece685.json").read_text())
STAGE = json.loads((ROOT / "_data/ece685_stage_one.json").read_text())
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
        self.feed(path.read_text())

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            self.ids.add(attrs["id"])
        if tag == "a":
            self.links.append(attrs.get("href", ""))
        if "data-lecture-card" in attrs:
            self.card_ids.append(attrs["data-lecture-card"])
        if "data-lecture-id" in attrs:
            self.current_lecture = attrs["data-lecture-id"]
        if tag == "li" and "value" in attrs:
            self.outline_slides.append(int(attrs["value"]))


class LectureShellTest(unittest.TestCase):
    def test_complete_seven_module_path_in_both_languages(self):
        modules = STAGE["modules"]
        self.assertEqual(len(modules), 7)
        self.assertEqual([m["number"] for m in modules], list(range(1, 8)))
        for prefix in ("", "zh/"):
            course = SITE / prefix / "teaching/course-development/ece685"
            base = course / "modules"
            overview = (course / "index.html").read_text()
            self.assertEqual(overview.count('data-stage-card="'), 7)
            self.assertIn('data-stage-progress', overview)
            self.assertNotIn('Lecture 01', overview)
            self.assertIn('id="ece-catalog-title"', overview)
            legacy_overview = (course / "lecture-01/index.html").read_text()
            self.assertIn('http-equiv="refresh"', legacy_overview)
            self.assertNotIn('data-stage-index', legacy_overview)
            self.assertNotIn('course-python-runner.js', overview)
            for module in modules:
                with self.subTest(language=prefix, module=module["id"]):
                    path = base / module["id"] / "index.html"
                    html, page = path.read_text(), Page(path)
                    self.assertNotIn('Lecture 01', html)
                    self.assertIn('/teaching/course-development/ece685/#course-modules', html)
                    for section in ("concepts", "experiment", "code", "practice"):
                        self.assertIn("stage-" + section, page.ids)
                    for marker in ('data-stage-config', 'data-stage-param', 'data-stage-diagram',
                                   'data-stage-plot', 'data-experiment-editor', 'data-solver-editor',
                                   'data-stage-practice', 'data-stage-quiz', 'data-stage-solution'):
                        self.assertIn(marker, html)
                    for asset in ('ece685-stage-model.js', 'ece685-stage-lesson.js',
                                  'ece685-stage.css', 'ece685_stage_one.py', 'course-python-runner.js'):
                        self.assertIn(asset, html)
                    stage_nav = html.split('<nav class="stage-navigation"', 1)[1].split('</nav>', 1)[0]
                    self.assertEqual(stage_nav.count('aria-current="page"'), 1)
                    self.assertNotIn('power-flow-model.js', html)
                    lang = "zh" if prefix else "en"
                    self.assertIn(module["title"][lang], html)
                    self.assertTrue((SITE / "assets/images/teaching" / ("stage-" + module["id"] + ".svg")).exists())
                    for source in module["sources"] + module["extension"]:
                        lecture = next(l for l in MANIFEST["lectures"] if l["id"] == source)
                        source_html = (course / lecture["slug"] / "index.html").read_text()
                        self.assertIn('modules/' + module["id"] + '/', source_html)
                        self.assertNotIn('class="ece-planned"', source_html)
                    legacy = (course / "lecture-01" / module["id"] / "index.html").read_text()
                    self.assertIn('http-equiv="refresh"', legacy)
                    self.assertIn('modules/' + module["id"] + '/', legacy)

    def test_l05_teaching_loop_and_scoped_assets(self):
        lecture = next(item for item in MANIFEST["lectures"] if item["id"] == "L05")
        self.assertEqual(lecture["status"], "live")
        for prefix in ("", "zh/"):
            base = SITE / prefix / "teaching/course-development/ece685"
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
        self.assertEqual(ids[ids.index("L17") + 1], "L20")
        for prefix in ("", "/zh"):
            course = prefix + "/teaching/course-development/ece685/"
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
                    self.assertNotIn(prefix + "/teaching/course-development/power-flow/", page.links)
                    html = path.read_text()
                    lang = "zh" if prefix else "en"
                    self.assertIn(lecture["title"][lang], html)
                    for slide in lecture["slide_outline"]:
                        self.assertTrue(slide["title"])
                        self.assertNotIn("\\", slide["title"])

    def test_removed_demo_and_shared_course_styles(self):
        for prefix in ("", "zh/"):
            self.assertFalse((SITE / prefix / "teaching/course-development/power-flow/index.html").exists())
            teaching = Page(SITE / prefix / "teaching/index.html")
            self.assertTrue(any("/ece685/" in url for url in teaching.links))
        for asset in ("power-flow-model.js", "power-flow-lab.js"):
            self.assertFalse((ROOT / "assets/js" / asset).exists())
        for slug in ("balanced-power-flow", "unbalanced-power-flow"):
            html = (SITE / "teaching/course-development/physics-informed-gnn" / slug / "index.html").read_text()
            self.assertIn("/assets/css/course.css", html)
            self.assertNotIn('href="/assets/css/power-flow.css"', html)


if __name__ == "__main__":
    unittest.main()
