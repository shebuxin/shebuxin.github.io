"""Compare the complete student course in both hosting builds."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import unittest
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--github-dir', type=Path, default=ROOT / '_site')
parser.add_argument('--cloudflare-dir', type=Path, default=ROOT / 'tmp/ece685-chat/named-site')
args, remaining = parser.parse_known_args()
CATALOG = json.loads((ROOT / '_data/ece685.json').read_text())
HOSTS = re.compile(r'https://(?:shebuxin\.github\.io|shebuxin\.pages\.dev)(?=/|$)')
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}


def attribute(key, value):
    if not value:
        return value
    value = HOSTS.sub('', value)
    if key in ('src', 'href', 'data-source', 'data-worker'):
        url = urlsplit(value)
        if url.path.startswith('/assets/'):
            # Separate builds have different cache timestamps, but identical bytes.
            query = urlencode([(name, entry) for name, entry in parse_qsl(url.query, keep_blank_values=True) if name != 'v'])
            value = urlunsplit((url.scheme, url.netloc, url.path, query, url.fragment))
    return value


class StudentPage(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.tokens = []
        self.progress_version = None
        self.chat_ids = []
        self.feed(path.read_text())

    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        if 'data-ece-platform' in fields:
            self.progress_version = fields['data-progress-version']
        if 'data-course-chat' in fields:
            self.chat_ids.append(fields['data-lecture-id'])
        if not self.depth:
            if 'data-ece-platform' not in fields and 'data-course-chat' not in fields:
                return
            self.depth = 1
        elif tag not in VOID:
            self.depth += 1
        # Progress storage is browser-local and retains each host's existing key.
        canonical = sorted((key, attribute(key, value))
                           for key, value in attrs if key != 'data-progress-version')
        self.tokens.append(('start', tag, canonical))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if self.depth and tag not in VOID:
            self.tokens.append(('end', tag))
            self.depth -= 1

    def handle_data(self, text):
        if self.depth and text.strip():
            self.tokens.append(('text', re.sub(r'\s+', ' ', HOSTS.sub('', text)).strip()))


class MirrorTest(unittest.TestCase):
    def test_all_bilingual_pages_and_ai_entries_match(self):
        pages = [('', 'COURSE', True)] + [(lecture['slug'] + '/', lecture['id'], lecture['status'] == 'live')
                                         for lecture in CATALOG['lectures']]
        for language in ('', 'zh/'):
            for slug, lecture_id, released in pages:
                relative = language + 'teaching/ece685/' + slug + 'index.html'
                with self.subTest(page=relative):
                    github = StudentPage(args.github_dir / relative)
                    cloudflare = StudentPage(args.cloudflare_dir / relative)
                    self.assertTrue(github.tokens)
                    self.assertEqual(github.tokens, cloudflare.tokens)
                    self.assertEqual(github.chat_ids, [lecture_id] if released else [])
                    self.assertEqual(github.progress_version, 'transformers')
                    self.assertEqual(cloudflare.progress_version, 'knowledge')

    def test_shared_code_diagrams_and_student_slide_assets_match(self):
        assets = [path.relative_to(ROOT).as_posix() for path in (ROOT / 'assets/slides/ece685').rglob('*') if path.is_file()]
        assets += ['assets/js/ece685.js', 'assets/js/ece685-stage-lesson.js', 'assets/js/ece685-stage-model.js',
                   'assets/js/ece685-stage-diagrams.js', 'assets/js/ece685-chat.js',
                   'assets/css/ece685-chat.css', 'assets/code/ece685_stage_one.py']
        for asset in assets:
            with self.subTest(asset=asset):
                source = hashlib.sha256((ROOT / asset).read_bytes()).digest()
                for site in (args.github_dir, args.cloudflare_dir):
                    self.assertEqual(hashlib.sha256((site / asset).read_bytes()).digest(), source)

    def test_retired_assessments_and_private_build_sources_are_absent(self):
        retired = ['l16-exam1-practice', 'l17-exam1-review', 'l30-exam2-review', 'l41-comprehensive-final-review']
        for site in (args.github_dir, args.cloudflare_dir):
            for prefix in ('teaching/ece685/', 'zh/teaching/ece685/',
                           'teaching/course-development/ece685/', 'zh/teaching/course-development/ece685/'):
                for slug in retired:
                    self.assertFalse((site / prefix / slug).exists(), (site, prefix, slug))
            for private in ('_source', '_site', 'scripts', 'services', 'functions', 'tmp'):
                self.assertFalse((site / private).exists(), (site, private))
            for asset in (site / 'assets/slides/ece685').rglob('*'):
                self.assertIsNone(re.search(r'(^|[_-])exam(?:[0-9]|[_-])', asset.name.lower()), asset)


if __name__ == '__main__':
    unittest.main(argv=[sys.argv[0]] + remaining)
