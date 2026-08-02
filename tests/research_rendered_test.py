from html.parser import HTMLParser
from pathlib import Path
import unittest


class ResearchPageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.theme_ids = []
        self.current_theme_id = None
        self.representative_works = {}
        self.theme_publications = {}
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
            self.current_theme_id = attrs.get("data-theme-id")
            self.theme_ids.append(self.current_theme_id)
            self.theme_publications[self.current_theme_id] = []
        if attrs.get("data-representative-work") and self.current_theme_id:
            self.representative_works[self.current_theme_id] = attrs["data-representative-work"]
        if attrs.get("data-publication-id") and self.current_theme_id:
            self.theme_publications[self.current_theme_id].append(attrs["data-publication-id"])
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

    def handle_endtag(self, tag):
        if tag == "article" and self.current_theme_id:
            self.current_theme_id = None


class ResearchRenderedPagesTest(unittest.TestCase):
    """Validate the built research pages after Jekyll has rendered them."""

    site = Path(__file__).resolve().parents[1] / "_site"
    root = Path(__file__).resolve().parents[1]

    representative_works = {
        "ibr-dynamics": "WRK-029",
        "operating-boundaries": "WRK-038",
        "dynamic-decisions": "WRK-030",
        "resilience-security": "WRK-002",
        "trustworthy-ai": "WRK-031",
        "engineering-agents": "WRK-004",
        "decision-intelligence": "WRK-040",
        "ai-infrastructure": "WRK-003",
    }

    publication_counts = {
        "ibr-dynamics": 18,
        "operating-boundaries": 24,
        "dynamic-decisions": 13,
        "resilience-security": 8,
        "trustworthy-ai": 6,
        "engineering-agents": 1,
        "decision-intelligence": 5,
        "ai-infrastructure": 2,
    }

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
            "Physics-grounded intelligence for IBR-dominant Power System",
            english.text,
        )
        self.assertIn("电力电子与人工智能驱动的新型电力系统", chinese.text)
        self.assertIn("Representative work", english.text)
        self.assertIn("Related publications", english.text)
        self.assertIn("代表性成果", chinese.text)
        self.assertIn("相关论文", chinese.text)
        self.assertTrue(any(text.startswith("展开研究问题与相关论文：") for text in chinese.text))
        self.assertIn("代表性", chinese.text)
        self.assertIn("研究成果", chinese.text)
        self.assertNotIn("精选", chinese.text)

        for page in (english, chinese):
            self.assertEqual(self.representative_works, page.representative_works)
            self.assertEqual(
                self.publication_counts,
                {theme_id: len(work_ids) for theme_id, work_ids in page.theme_publications.items()},
            )
            self.assertEqual(
                {f"WRK-{number:03d}" for number in range(1, 61)},
                {work_id for work_ids in page.theme_publications.values() for work_id in work_ids},
            )

        english_html = (self.site / "research/index.html").read_text(encoding="utf-8")
        chinese_html = (self.site / "zh/research/index.html").read_text(encoding="utf-8")
        self.assertNotIn("Public ·", english_html)
        self.assertNotIn("已公开 ·", chinese_html)
        self.assertNotIn("Selected public outputs", english_html)
        self.assertNotIn("精选公开产出", chinese_html)
        self.assertNotIn("公开研究成果", chinese_html)
        self.assertNotIn("rejected", english_html.lower())
        self.assertIn('href="/publications/#2020"', english_html)
        self.assertIn('href="/zh/publications/#2020"', chinese_html)
        self.assertNotIn('href="/publications/#', chinese_html)

    def test_social_preview_exists_and_other_pages_do_not_load_research_script(self):
        english = self.parse("research/index.html")
        expected_url = "https://shebuxin.github.io/images/research/research-portfolio-og.png"
        self.assertEqual(expected_url, english.meta.get("og:image"))
        self.assertTrue(
            (self.site / "images/research/research-portfolio-og.png").is_file()
        )

        home = self.parse("index.html")
        self.assertFalse(any(src.endswith("/research-landscape.js") for src in home.scripts))

    def test_research_palette_uses_restrained_academic_colors(self):
        stylesheet = (self.root / "_sass/_research.scss").read_text(encoding="utf-8")
        self.assertNotIn("radial-gradient", stylesheet)
        self.assertNotIn("linear-gradient", stylesheet)
        self.assertNotIn("#5d4aa0", stylesheet.lower())
        self.assertNotIn("#25657f", stylesheet.lower())
        self.assertNotIn("border-radius: 999", stylesheet)
        self.assertIn("$research-physical: #234a63", stylesheet)
        self.assertIn("$research-intelligent: #6a3f4b", stylesheet)
        self.assertIn(".research-theme:has(> .research-theme__details[open])", stylesheet)

    def test_home_publications_and_teaching_refinements(self):
        english_home = (self.site / "index.html").read_text(encoding="utf-8")
        chinese_home = (self.site / "zh/index.html").read_text(encoding="utf-8")
        english_teaching = (self.site / "teaching/index.html").read_text(encoding="utf-8")
        chinese_teaching = (self.site / "zh/teaching/index.html").read_text(encoding="utf-8")
        chinese_publications = (self.site / "zh/publications/index.html").read_text(encoding="utf-8")

        self.assertIn("IEEE PES Education Committee", english_home)
        self.assertIn("IEEE PES 教育委员会", chinese_home)
        self.assertNotIn("Awards and Service", english_home)
        self.assertNotIn("荣誉与学术服务", chinese_home)
        self.assertNotIn("Global Collaborations and Website Visitors", english_home)
        self.assertNotIn("全球合作与网站访客", chinese_home)

        selected_titles = [
            "Virtual Inertia Scheduling (VIS) for Real-Time Economic Dispatch",
            "Fusion of Microgrid Control with Model-free Reinforcement Learning",
            "Virtual Inertia Scheduling (VIS) for Microgrids",
            "Inverter PQ Control with Trajectory Tracking Capability",
            "A review of energy storage for power system resilience",
        ]
        positions = [english_home.index(title) for title in selected_titles]
        self.assertEqual(positions, sorted(positions))
        self.assertIn("2026 IEEE PES Prize Paper Award", english_home)
        self.assertIn("2026 IEEE PES Prize Paper Award", chinese_home)

        self.assertEqual(1, english_teaching.count("Contributed to:"))
        self.assertEqual(3, english_teaching.count("Responsible for:"))
        self.assertEqual(1, chinese_teaching.count("参与："))
        self.assertEqual(3, chinese_teaching.count("负责："))
        self.assertNotIn("正式标题保留其原始发表语言", chinese_publications)

    def test_bilingual_about_updates_and_cv_removal(self):
        english_home = (self.site / "index.html").read_text(encoding="utf-8")
        chinese_home = (self.site / "zh/index.html").read_text(encoding="utf-8")

        self.assertIn(
            "two U.S. Department of Energy Laboratory Directed Research and Development (LDRD) projects",
            english_home,
        )
        self.assertIn(
            "subject-matter expert for the IEEE PES Education Committee",
            english_home,
        )
        self.assertIn("高级研究员。在 PNNL 期间", chinese_home)
        self.assertIn("两项由美国能源部支持的实验室自主研究与开发", chinese_home)
        self.assertIn("同时，他还共同主持了一项", chinese_home)
        self.assertIn("IEEE PES 教育委员会专家，参与推出了", chinese_home)

        self.assertIn("长聘高级研究员", chinese_home)
        self.assertIn("长聘研究员", chinese_home)
        self.assertIn("研究助理", chinese_home)
        self.assertNotIn("Graduate Research Assistant", english_home)
        self.assertNotIn("研究生研究助理", chinese_home)

        for degree in (
            "电气工程博士",
            "电气工程硕士",
            "电气工程学士",
        ):
            self.assertIn(degree, chinese_home)

        self.assertIn(
            "Outstanding Reviewer of <em>Energy Conversion and Economics</em>, 2025.",
            english_home,
        )
        self.assertIn(
            "<em>Energy Conversion and Economics</em> 杰出审稿人，2025 年。",
            chinese_home,
        )
        self.assertNotIn("Outstanding Reviewer of <em>Energy Economics</em>", english_home)
        self.assertNotIn("<em>Energy Economics</em> 杰出审稿人", chinese_home)

        self.assertNotIn('href="/cv/"', english_home)
        self.assertNotIn('href="/zh/cv/"', chinese_home)
        for retired_page in (
            "cv/index.html",
            "zh/cv/index.html",
            "resume/index.html",
            "resume.html",
        ):
            self.assertFalse((self.site / retired_page).exists(), retired_page)
        self.assertTrue((self.root / "files/pdf/20250325_Faculty.pdf").is_file())


if __name__ == "__main__":
    unittest.main()
