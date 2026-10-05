"""Private index sync must be manifest-bound and never activate incomplete uploads."""
import copy
import io
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import export_ece685_chat_corpus as corpus
import sync_ece685_chat_index as index


class IndexTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.folder=self.root/'corpus';(self.folder/'upload').mkdir(parents=True)
        selection=dict(authority='instructor',edition=6)
        self.doc=dict(doc_id='ECE685:reference:platform-textbook-selection:decision:edition',kind='reference',
            course_id='ECE685',index_eligible=True,access='private_reference',quality_flags=[],lecture_id=None,
            lecture_ids=[],source_type='course_material_selection',source_role='platform_textbook_basis',language='en',
            source_url=None,source_urls={},edition=6,publication_year=2026,math_fidelity='not_applicable',
            authors=['Instructor'],title=dict(en='Textbook selection'),citation=dict(label='Instructor choice'),
            textbook_selection=selection,source_sha256=corpus.digest(corpus.canonical(selection).encode()),
            text="Use sixth edition; don't rewrite the syllabus.",compatible_for_assigned_problem_lookup=True)
        self.write()

    def tearDown(self): self.temp.cleanup()

    def write(self):
        row=copy.deepcopy(self.doc);row['content_sha256']=corpus.digest(row['text'].encode())
        version='ece685-'+corpus.digest(corpus.canonical(dict(documents=[row],reference_version='references-test')).encode())[:20]
        row['corpus_version']=version
        data=(corpus.canonical(row)+'\n').encode();(self.folder/'documents.jsonl').write_bytes(data)
        relative='upload/'+row['doc_id'].replace(':','-')+'.md';markdown=corpus.upload_markdown(row)
        (self.folder/relative).write_text(markdown)
        upload={k:row.get(k) for k in ['doc_id','lecture_id','kind','language','source_url','source_urls','source_type','citation']}
        upload.update(path=relative,sha256=corpus.digest(markdown.encode()))
        self.manifest=dict(schema_version=2,course_id='ECE685',corpus_version=version,reference_version='references-test',
            platform_textbook_edition=6,textbook_selection_doc_id=row['doc_id'],lecture_ids=['L05'],document_count=1,
            documents_sha256=corpus.digest(data),uploads=[upload],rag_status='preparation_in_progress')
        self.save_manifest()

    def save_manifest(self): (self.folder/'manifest.json').write_text(json.dumps(self.manifest))

    def test_allowlist_hashes_and_regenerated_upload_content_are_all_checked(self):
        self.assertEqual(len(index.bundle(self.folder)[1]),1)
        relative=self.manifest['uploads'][0]['path'];(self.folder/relative).write_text('malicious extra content')
        self.manifest['uploads'][0]['sha256']=corpus.digest(b'malicious extra content');self.save_manifest()
        with self.assertRaisesRegex(ValueError,'content mismatch'): index.bundle(self.folder)

    def test_extra_missing_traversal_and_symlink_files_cannot_be_uploaded(self):
        for path in ['../outside.md','upload/other.md']:
            self.write();self.manifest['uploads'][0]['path']=path;self.save_manifest()
            with self.assertRaisesRegex(ValueError,'Invalid upload path'): index.bundle(self.folder)
        self.write();self.manifest['uploads'].append(copy.deepcopy(self.manifest['uploads'][0]));self.save_manifest()
        with self.assertRaisesRegex(ValueError,'allowlist'): index.bundle(self.folder)

    def test_quarantine_and_instructor_edition_provenance_cannot_be_rehashed_away(self):
        self.doc['quality_flags']=['unverified_math_font_encoding'];self.write()
        with self.assertRaisesRegex(ValueError,'Quarantined'): index.bundle(self.folder)
        self.doc['quality_flags']=[];self.doc['textbook_selection']['authority']='student';self.write()
        with self.assertRaisesRegex(ValueError,'instructor textbook selection'): index.bundle(self.folder)

    def test_complete_mock_mapping_generates_sql_and_db_activation_rejects_partial_import(self):
        manifest,docs,mhash=index.bundle(self.folder);state=index.mapping(manifest,mhash,'mock')
        state.update(vector_store_id='vs_mock',status='ready',files={self.doc['doc_id']:
            dict(file_id='file-mock',sha256=manifest['uploads'][0]['sha256'],status='completed')})
        output=self.root/'sql';output.mkdir();index.sql_bundle(manifest,docs,state,mhash,output)
        db=sqlite3.connect(':memory:');db.executescript((ROOT/'services/course-chat/migrations/0001.sql').read_text())
        statements=(output/'import-000.sql').read_text().splitlines()
        db.executescript(statements[0]);
        with self.assertRaisesRegex(sqlite3.IntegrityError,'version_not_ready'): db.executescript((output/'activate.sql').read_text())
        db.executescript('\n'.join(statements[1:]));db.executescript((output/'activate.sql').read_text())
        self.assertEqual(db.execute('SELECT active_version FROM courses').fetchone()[0],manifest['corpus_version'])
        self.assertEqual(db.execute('SELECT text FROM documents').fetchone()[0],self.doc['text']);db.close()

    def test_staging_and_extra_files_do_not_produce_activation_sql(self):
        manifest,docs,mhash=index.bundle(self.folder);state=index.mapping(manifest,mhash,'openai')
        state.update(vector_store_id='vs_test',files={})
        output=self.root/'sql';output.mkdir()
        with self.assertRaisesRegex(ValueError,'not complete'): index.sql_bundle(manifest,docs,state,mhash,output)
        state['files']['outside']=dict(file_id='file-extra',sha256='fake',status='completed')
        with self.assertRaisesRegex(ValueError,'outside the manifest'): index.validate_mapping(state,manifest,mhash)
        self.assertFalse((output/'activate.sql').exists())

    def test_resuming_reuses_file_hashes_and_checks_remote_membership(self):
        manifest,docs,mhash=index.bundle(self.folder);output=self.root/'index'/'version';output.mkdir(parents=True)
        class FakeAPI:
            def __init__(self): self.uploads=0;self.attachments=0;self.extra=False
            def upload(self,path): self.uploads+=1;return 'file-test'
            def call(self,method,path,body=None):
                if path=='/vector_stores': return dict(id='vs_test')
                if method=='POST': self.attachments+=1;return dict(status='completed')
                if '?limit=' in path:
                    data=[dict(id='file-test',status='completed')]
                    if self.extra: data.append(dict(id='file-extra',status='completed'))
                    return dict(data=data,has_more=False)
                return dict(status='completed')
        api=FakeAPI();first=index.sync(self.folder,manifest,mhash,output,api)
        self.assertEqual(first['status'],'ready');index.sync(self.folder,manifest,mhash,output,api)
        self.assertEqual((api.uploads,api.attachments),(1,1));api.extra=True
        with self.assertRaisesRegex(ValueError,'membership mismatch'): index.sync(self.folder,manifest,mhash,output,api)

    def test_bounded_parallel_upload_and_lost_attachment_recovery_do_not_repeat_post(self):
        manifest,docs,mhash=index.bundle(self.folder)
        manifest['uploads']=[dict(manifest['uploads'][0],doc_id=f'ECE685:test:{i}',
            path=f'upload/test-{i}.md',sha256=f'{i:064x}') for i in range(8)]
        manifest['document_count']=8
        output=self.root/'parallel'/'version';output.mkdir(parents=True)
        class FakeAPI:
            def __init__(self):
                self.files={};self.uploads=0;self.posts=0;self.active=0;self.peak=0;self.lost=True;self.lock=threading.Lock()
            def upload(self,path):
                with self.lock:
                    self.active+=1;self.uploads+=1;self.peak=max(self.peak,self.active)
                time.sleep(0.01)
                with self.lock: self.active-=1
                return 'file-'+path.stem
            def call(self,method,path,body=None):
                if path=='/vector_stores': return dict(id='vs_parallel')
                if method=='GET': return dict(data=list(self.files.values()),has_more=False)
                with self.lock:
                    self.posts+=1
                    self.files[body['file_id']]=dict(id=body['file_id'],status='completed',attributes=body['attributes'])
                    if body['file_id']=='file-test-0' and self.lost:
                        self.lost=False;raise ValueError('lost attachment response')
                return dict(status='completed')
        api=FakeAPI()
        with self.assertRaisesRegex(ValueError,'lost attachment'):
            index.sync(self.folder,manifest,mhash,output,api,concurrency=4)
        self.assertEqual(api.uploads,4)
        state=index.sync(self.folder,manifest,mhash,output,api,concurrency=4)
        self.assertEqual(state['status'],'ready');self.assertEqual(len(state['files']),8)
        self.assertEqual((api.uploads,api.posts),(8,8));self.assertLessEqual(api.peak,4)
        self.assertFalse((output/'activate.sql').exists())

    def test_transient_get_can_retry_but_unknown_post_is_never_repeated(self):
        def unavailable(): return HTTPError('https://api.openai.com/v1/vector_stores',503,'temporary',{},None)
        with patch.object(index,'urlopen',side_effect=[unavailable(),io.BytesIO(b'{"data":[]}')]) as network, patch.object(index.time,'sleep'):
            self.assertEqual(index.API('fake-test-key').call('GET','/vector_stores'),{'data':[]})
            self.assertEqual(network.call_count,2)
        with patch.object(index,'urlopen',side_effect=unavailable()) as network, patch.object(index.time,'sleep'):
            with self.assertRaisesRegex(ValueError,'HTTP 503'):
                index.API('fake-test-key').call('POST','/vector_stores',{})
            self.assertEqual(network.call_count,1)


if __name__=='__main__': unittest.main()
