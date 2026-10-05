"""The local mock uses authoritative positions and cannot accept client model settings."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import export_ece685_chat_corpus as corpus
import serve_ece685_chat_preview as preview


class PreviewContractTest(unittest.TestCase):
    def setUp(self):
        self.docs = {
            'ECE685:L05:slide:034': dict(doc_id='ECE685:L05:slide:034'),
            'ECE685:L05:lesson:zh:lecture-code': dict(doc_id='ECE685:L05:lesson:zh:lecture-code'),
            'ECE685:L05:lesson:zh:lecture-overview': dict(doc_id='ECE685:L05:lesson:zh:lecture-overview')}
        self.body = dict(course_id='ECE685',lecture_id='L05',language='zh',message='什么意思？',client_request_id='example-1',
                         context=dict(kind='slide',section_id='lecture-overview',slide_number=34,selection_text=''))

    def test_real_physical_page_is_used_instead_of_outline_count(self):
        self.assertEqual(preview.validate_message(self.body,self.docs,['L05'])['doc_id'],'ECE685:L05:slide:034')
        self.body['context']['slide_number'] = 35
        with self.assertRaisesRegex(ValueError,'invalid_context'):
            preview.validate_message(self.body,self.docs,['L05'])

    def test_client_model_configuration_and_unreleased_lectures_are_rejected(self):
        for field in ('model','system_prompt','vector_store_id'):
            bad = dict(self.body, **{field:'override'})
            with self.assertRaisesRegex(ValueError,'invalid_request'):
                preview.validate_message(bad,self.docs,['L05'])
        self.body['lecture_id'] = 'L20'
        with self.assertRaisesRegex(ValueError,'invalid_request'):
            preview.validate_message(self.body,self.docs,['L05'])

    def test_selected_code_has_an_explicit_code_position_and_cannot_claim_a_slide(self):
        self.body['context'] = dict(kind='code',section_id='lecture-code',slide_number=None,selection_text='print(1)')
        self.assertEqual(preview.validate_message(self.body,self.docs,['L05'])['doc_id'],'ECE685:L05:lesson:zh:lecture-code')
        self.body['context']['slide_number'] = 34
        with self.assertRaisesRegex(ValueError,'invalid_context'):
            preview.validate_message(self.body,self.docs,['L05'])

    def test_empty_background_is_a_course_question_and_boolean_is_not_a_page_number(self):
        self.body['context'] = None
        self.assertIsNone(preview.validate_message(self.body,self.docs,['L05']))
        self.body['context'] = dict(kind='slide',section_id='lecture-overview',slide_number=True,selection_text='')
        with self.assertRaisesRegex(ValueError,'invalid_context'):
            preview.validate_message(self.body,self.docs,['L05'])

    def test_course_homepage_uses_orientation_source_and_rejects_slide_context(self):
        source = dict(doc_id='ECE685:L01:lesson:zh:lecture-overview')
        self.docs[source['doc_id']] = source
        self.body['lecture_id'] = 'COURSE'
        self.body['context'] = dict(kind='lesson',section_id='course-overview',slide_number=None,selection_text='')
        self.assertEqual(preview.validate_message(self.body,self.docs,['L01','L05']),source)
        self.body['context']['slide_number'] = 1
        with self.assertRaisesRegex(ValueError,'invalid_context'):
            preview.validate_message(self.body,self.docs,['L01','L05'])

    def test_corpus_hashes_and_reference_quarantine_are_checked_before_serving(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            record = dict(doc_id='ECE685:reference:book:page:0001',course_id='ECE685',kind='reference',text='Text',
                          index_eligible=True, quality_flags=[])
            record['content_sha256'] = corpus.digest(record['text'].encode())
            def write():
                data = (json.dumps(record)+'\n').encode()
                (root/'documents.jsonl').write_bytes(data)
                manifest = dict(schema_version=2,course_id='ECE685',document_count=1,documents_sha256=corpus.digest(data))
                (root/'manifest.json').write_text(json.dumps(manifest))
            write()
            self.assertEqual(len(preview.load_corpus(root)[1]),1)
            (root/'documents.jsonl').write_text('{}\n')
            with self.assertRaisesRegex(ValueError,'manifest/hash'):
                preview.load_corpus(root)
            record['quality_flags'] = ['unverified_math_font_encoding']
            write()
            with self.assertRaisesRegex(ValueError,'Quarantined reference'):
                preview.load_corpus(root)


if __name__ == '__main__':
    unittest.main()
