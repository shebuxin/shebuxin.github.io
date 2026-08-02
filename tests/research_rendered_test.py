from html.parser import HTMLParser
from pathlib import Path
import unittest


class ResearchPageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.theme_ids = []
        self.vision_count = 0
        self.main_count = 0
        self.h1_count = 0
        self.scripts = []
        self.local_anchors = []
        self.language_links = {}
        self.unwired_theme_links = []
        self.aria_controls = []
        self.html_lang = None
        self.meta = {}
        self.text = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "html":
            self.html_lang = attrs.get("lang")
        if attrs.get("id"):
            self.ids.append(attrs["id"])
        if tag == "main" or attrs.get("role") == "main":
            self.main_count += 1
        if tag == "h1":
            self.h1_count += 1
        if "data-theme-card" in attrs:
            self.theme_ids.append(attrs.get("data-theme-id"))
        if "data-vision-card" in attrs:
            self.vision_count += 1
        if tag == "script" and attrs.get("src"):
            self.scripts.append(attrs["src"])
        if tag == "a" and attrs.get("href", "").startswith("#"):
            self.local_anchors.append(attrs["href"][1:])
        if tag == "a" and attrs.get("href", "").startswith("#theme-"):
            required = ("data-theme-link", "data-theme-id", "data-vision")
            if any(attribute not in attrs for attribute in required):
                self.unwired_theme_links.append(attrs["href"])
        if tag == "a" and attrs.get("hreflang") and attrs.get("href"):
            self.language_links[attrs["hreflang"]] = attrs["href"]
        if attrs.get("aria-controls"):
            self.aria_controls.extend(attrs["aria-controls"].split())
        if tag == "meta" and attrs.get("property") and attrs.get("content"):
            self.meta[attrs["property"]] = attrs["content"]

    def handle_data(self, data):
        value = data.strip()
        if value:
            self.text.append(value)


class ResearchRenderedPagesTest(unittest.TestCase):
    """Validate the built research pages after Jekyll has rendered them."""

    site = Path(__file__).resolve().parents[1] / "_site"

    @classmethod
    def parse(cls, relative_path):
        path = cls.site / relative_path
        if not path.is_file():
            raise AssertionError(f"Missing generated page: {relative_path}")
        parser = ResearchPageParser()
        parser.feed(path.read_text(encoding="utf-8"))
        return parser

    def test_english_and_chinese_pages_share_the_same_structure(self):
        english = self.parse("research/index.html")
        chinese = self.parse("zh/research/index.html")

        self.assertEqual("en-US", english.html_lang)
        self.assertEqual("zh-CN", chinese.html_lang)
        self.assertEqual(2, english.vision_count)
        self.assertEqual(2, chinese.vision_count)
        self.assertEqual(8, len(english.theme_ids))
        self.assertEqual(english.theme_ids, chinese.theme_ids)
        self.assertTrue(english.language_links["en"].endswith("/research/"))
        self.assertTrue(english.language_links["zh-CN"].endswith("/zh/research/"))
        self.assertEqual(english.language_links, chinese.language_links)

        for page in (english, chinese):
            self.assertEqual(1, page.main_count)
            self.assertEqual(1, page.h1_count)
            self.assertEqual(len(page.ids), len(set(page.ids)), "Duplicate HTML IDs")
            self.assertEqual(1, sum(src.endswith("/research-landscape.js") for src in page.scripts))
            self.assertIn("main", page.local_anchors)
            self.assertTrue(set(page.local_anchors).issubset(set(page.ids)))
            self.assertTrue(set(page.aria_controls).issubset(set(page.ids)))
            self.assertEqual([], page.unwired_theme_links)

        self.assertIn(
            "Physics-grounded intelligence for verifiable power-system decisions",
            english.text,
        )
        self.assertIn("以物理机理与可信智能支撑可验证的电力系统决策", chinese.text)
        self.assertIn(
            "Public poster record; technical claims are not summarized here pending source review.",
            english.text,
        )
        self.assertIn(
            "公开海报记录；在完成原始来源审阅前，本页不据此概括技术结论。",
            chinese.text,
        )

    def test_social_preview_exists_and_other_pages_do_not_load_research_script(self):
        english = self.parse("research/index.html")
        expected_url = "https://shebuxin.github.io/images/research/research-portfolio-og.png"
        self.assertEqual(expected_url, english.meta.get("og:image"))
        self.assertTrue(
            (self.site / "images/research/research-portfolio-og.png").is_file()
        )

        home = self.parse("index.html")
        self.assertFalse(any(src.endswith("/research-landscape.js") for src in home.scripts))


if __name__ == "__main__":
    unittest.main()
