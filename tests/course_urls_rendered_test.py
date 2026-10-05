"""Verify published course URLs and compatibility with shared lecture links."""
import json
import os
import re
import subprocess
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = Path(os.environ.get("ECE685_SITE_DIR", ROOT / "_site"))


class Links(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.links = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.links.append(dict(attrs).get("href", ""))


class CourseURLs(unittest.TestCase):
    def test_course_pages_and_navigation_use_short_paths(self):
        for folder in ("course-development", "zh/course-development"):
            for source in (ROOT / "_pages" / folder).rglob("*.md"):
                front = source.read_text().split("---", 2)[1]
                permalink = re.search(r'^permalink:\s*[\"\']?([^\"\'\n]+)', front, re.M)[1].strip()
                self.assertNotIn("/course-development/", permalink, source)
                page = SITE / permalink.lstrip("/") / "index.html"
                self.assertTrue(page.is_file(), permalink)
                for link in Links(page.read_text()).links:
                    self.assertNotIn("/teaching/course-development/", link, (source, link))
                legacy = permalink.replace("/teaching/", "/teaching/course-development/", 1)
                redirect = SITE / legacy.lstrip("/") / "index.html"
                self.assertTrue(redirect.is_file(), legacy)
                self.assertIn('http-equiv="refresh"', redirect.read_text())
                self.assertIn(permalink, redirect.read_text())

    def test_redirect_preserves_origin_slide_number_and_section(self):
        cases = []
        for prefix in ("", "/zh"):
            path = prefix + "/teaching/course-development/ece685/l05-single-phase-ac-i/"
            html = (SITE / path.lstrip("/") / "index.html").read_text()
            script = re.search(r"<script>(.*?)</script>", html, re.S)[1]
            for origin in ("https://shebuxin.github.io", "https://shebuxin.pages.dev", "http://127.0.0.1:8788"):
                suffix = "?slide=12#lecture-overview"
                cases.append({"script": script, "href": origin + path + suffix,
                              "expected": origin + path.replace("/course-development", "") + suffix})
        runner = """
          const fs = require('node:fs'), vm = require('node:vm');
          const cases = JSON.parse(fs.readFileSync(0, 'utf8'));
          for (const item of cases) {
            const url = new URL(item.href); let redirected;
            const location = {href:url.href, search:url.search, hash:url.hash,
                              replace(value) { redirected = value; }};
            vm.runInNewContext(item.script, {URL, window:{location}});
            if (redirected !== item.expected) throw Error(redirected + ' != ' + item.expected);
          }
        """
        subprocess.run(["node", "-e", runner], input=json.dumps(cases), text=True, check=True)


if __name__ == "__main__":
    unittest.main()
