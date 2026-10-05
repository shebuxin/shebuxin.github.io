"""Feature gating and bilingual UI checks against actual Jekyll output."""
import argparse
import json
from pathlib import Path
import sys
import unittest
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from export_ece685_chat_corpus import LessonHTML, course_path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--site-dir', type=Path, default=ROOT / '_site')
parser.add_argument('--enabled', action='store_true', help='Expect chat on released lectures')
parser.add_argument('--lectures', nargs='+', default=['*'], help='Enabled lecture IDs, or * for all released lectures')
parser.add_argument('--api-base', help='Expected public API URL when chat is enabled')
args, unittest_args = parser.parse_known_args()


class ChatRenderingTest(unittest.TestCase):
    def test_course_homepage_has_overview_chat_in_both_languages(self):
        for lang in ('en','zh'):
            prefix = 'zh/' if lang == 'zh' else ''
            tree = LessonHTML((args.site_dir / prefix / 'teaching/ece685/index.html').read_text()).root
            self.assertEqual(len(tree.find(lambda n:n.attrs.get('id')=='course-overview')),1)
            chats = tree.find(lambda n:'data-course-chat' in n.attrs)
            self.assertEqual(len(chats),int(args.enabled),lang)
            if not chats:
                continue
            chat = chats[0]
            self.assertEqual(chat.attrs['data-lecture-id'],'COURSE')
            self.assertEqual(chat.attrs['data-lang'],lang)
            if args.api_base:
                self.assertEqual(chat.attrs['data-api-base'],args.api_base)
            context = chat.find(lambda n:'data-chat-context' in n.attrs)[0]
            self.assertEqual([n.attrs['value'] for n in context.find(lambda n:n.tag=='option')],['current','none'])
            self.assertEqual([n.attrs['data-chat-prompt'] for n in chat.find(lambda n:'data-chat-prompt' in n.attrs)],['overview','prerequisites','start'])
            self.assertIn('hidden',chat.find(lambda n:'data-chat-attach-code' in n.attrs)[0].attrs)

    def pages(self):
        for lecture in json.loads((ROOT / '_data/ece685.json').read_text())['lectures']:
            for lang in ('en','zh'):
                path = args.site_dir / course_path(lecture,lang).lstrip('/') / 'index.html'
                yield lecture, lang, LessonHTML(path.read_text()).root

    def test_only_enabled_released_lectures_receive_the_component(self):
        count = 0
        expected_count = 0
        for lecture,lang,tree in self.pages():
            chats = tree.find(lambda n:'data-course-chat' in n.attrs)
            expected = args.enabled and lecture['status'] == 'live' and ('*' in args.lectures or lecture['id'] in args.lectures)
            expected_count += int(expected)
            self.assertEqual(len(chats),int(expected),(lecture['id'],lang))
            if chats:
                count += 1
                self.assertEqual(chats[0].attrs['data-lecture-id'],lecture['id'])
                self.assertEqual(chats[0].attrs['data-lang'],lang)
                if args.api_base:
                    self.assertEqual(chats[0].attrs['data-api-base'],args.api_base)
                slugs = chats[0].attrs['data-live-slugs'].split()
                self.assertNotIn('l20-three-phase-transformers-i',slugs)
        self.assertEqual(count,expected_count)

    def test_labels_and_dialog_targets_are_real_and_private_files_are_absent(self):
        for lecture,lang,tree in self.pages():
            chats = tree.find(lambda n:'data-course-chat' in n.attrs)
            if not chats:
                continue
            chat = chats[0]
            ids = {n.attrs['id'] for n in chat.find(lambda n:'id' in n.attrs)}
            for label in chat.find(lambda n:n.tag=='label'):
                self.assertIn(label.attrs['for'],ids)
            dialog = chat.find(lambda n:n.tag=='dialog')[0]
            self.assertIn(dialog.attrs['aria-labelledby'],ids)
            self.assertEqual(chat.find(lambda n:'data-chat-open' in n.attrs)[0].attrs['aria-controls'],dialog.attrs['id'])
            question = chat.find(lambda n:'data-chat-question' in n.attrs)[0]
            self.assertEqual(question.attrs['maxlength'],'4000')
        for private in ('_source','scripts','services','functions','.wrangler','.dev.vars','tmp/ece685-chat'):
            self.assertFalse((args.site_dir / private).exists(),private)

    def test_chat_resources_follow_the_feature_switch(self):
        for lecture,lang,tree in self.pages():
            scripts = tree.find(lambda n:n.tag=='script' and urlsplit(n.attrs.get('src','')).path.endswith('/assets/js/ece685-chat.js'))
            styles = tree.find(lambda n:n.tag=='link' and n.attrs.get('href','').endswith('/assets/css/ece685-chat.css'))
            self.assertEqual(bool(scripts),args.enabled,(lecture['id'],lang))
            self.assertEqual(bool(styles),args.enabled,(lecture['id'],lang))


if __name__ == '__main__':
    unittest.main(argv=[sys.argv[0]]+unittest_args)
