#!/usr/bin/env python3
"""Validate a private corpus; prepare or resume an OpenAI index and D1 SQL.

Default is offline preparation. --mock makes a LOCAL-ONLY index mapping for
Wrangler. --upload is an explicit paid/upload action and prompts for the key
unless OPENAI_API_KEY or --credentials-file is supplied. No Cloudflare credentials
or remote SQL execution.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import time
from threading import Lock
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from export_ece685_chat_corpus import ROOT, canonical, digest, private_output, upload_markdown
from serve_ece685_chat_preview import load_corpus
from ece685_chat_credentials import load_credentials


def bundle(folder):
    folder = Path(folder).resolve()
    raw = (folder/'manifest.json').read_bytes()
    manifest, documents = load_corpus(folder)
    version = manifest['corpus_version']
    rows = list(documents.values())
    original = [{k:v for k,v in row.items() if k != 'corpus_version'} for row in rows]
    computed = 'ece685-'+digest(canonical(dict(documents=original, reference_version=manifest['reference_version'])).encode())[:20]
    if version != computed or manifest.get('platform_textbook_edition') != 6:
        raise ValueError('Invalid corpus version or platform textbook edition')
    uploads = manifest.get('uploads', [])
    if len(uploads) != len(rows) or {u['doc_id'] for u in uploads} != set(documents):
        raise ValueError('Upload allowlist must exactly match document IDs')
    for u in uploads:
        doc = documents[u['doc_id']]
        relative = 'upload/'+doc['doc_id'].replace(':','-')+'.md'
        path = (folder/relative).resolve()
        if (u['path'] != relative or not path.is_relative_to(folder) or path.is_symlink()
                or doc['corpus_version'] != version or doc['lecture_id'] not in [None]+manifest['lecture_ids']):
            raise ValueError('Invalid upload path, version or lecture')
        data = path.read_bytes()
        if digest(data) != u['sha256'] or data != upload_markdown(doc).encode():
            raise ValueError('Upload hash/content mismatch')
        for field in ['kind','language','source_url','source_urls','source_type','citation']:
            if u[field] != doc.get(field):
                raise ValueError('Upload metadata mismatch: '+field)
    selection = documents.get(manifest.get('textbook_selection_doc_id'))
    if (not selection or selection.get('source_type') != 'course_material_selection'
            or selection.get('edition') != 6 or selection.get('textbook_selection',{}).get('authority') != 'instructor'
            or selection['source_sha256'] != digest(canonical(selection['textbook_selection']).encode())):
        raise ValueError('Missing or invalid instructor textbook selection')
    return manifest, documents, digest(raw)


def save(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix+'.tmp')
    temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
    temporary.replace(path)


class API:
    def __init__(self, key):
        self.headers = {'Authorization':'Bearer '+key}
        if os.environ.get('OPENAI_PROJECT_ID'):
            self.headers['OpenAI-Project'] = os.environ['OPENAI_PROJECT_ID']

    def call(self, method, path, body=None, content_type='application/json'):
        data = canonical(body).encode() if body is not None and content_type == 'application/json' else body
        headers = dict(self.headers, **{'Content-Type':content_type})
        request = Request('https://api.openai.com/v1'+path,data=data,headers=headers,method=method)
        # No automatic POST retries: an unknown outcome must not silently duplicate uploads.
        for attempt in range(4):
            try:
                with urlopen(request,timeout=60) as response:
                    return json.load(response)
            except HTTPError as error:
                if method=='GET' and error.code in {429,500,502,503,504} and attempt<3:
                    time.sleep(2**attempt)
                    continue
                raise ValueError(f'Provider HTTP {error.code} at {path}; stopped. No key or provider error body logged.') from None

    def upload(self, path):
        boundary='ece685-'+os.urandom(16).hex()
        filename=path.name
        body=(f'--{boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\nassistants\r\n'
              f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
              'Content-Type: text/markdown\r\n\r\n').encode()+path.read_bytes()+f'\r\n--{boundary}--\r\n'.encode()
        return self.call('POST','/files',body,'multipart/form-data; boundary='+boundary)['id']


def mapping(manifest, manifest_hash, provider):
    return dict(schema_version=1,provider=provider,corpus_version=manifest['corpus_version'],
                manifest_sha256=manifest_hash,vector_store_id=None,files={},status='staging',
                project_id=os.environ.get('OPENAI_PROJECT_ID'))


def validate_mapping(state, manifest, manifest_hash, ready=False):
    if (state.get('schema_version') != 1 or state.get('corpus_version') != manifest['corpus_version']
            or state.get('manifest_sha256') != manifest_hash or state.get('provider') not in {'mock','openai'}):
        raise ValueError('Index mapping belongs to a different corpus/manifest')
    for u in manifest['uploads']:
        entry = state['files'].get(u['doc_id'])
        if entry and (entry['sha256'] != u['sha256'] or not re.fullmatch(r'file[-_][a-zA-Z0-9_-]+',entry['file_id'])):
            raise ValueError('Invalid indexed file/hash')
    if set(state['files']) - {u['doc_id'] for u in manifest['uploads']}:
        raise ValueError('Index contains documents outside the manifest')
    if ready and (state.get('status') != 'ready' or len(state['files']) != manifest['document_count']
                  or any(x.get('status') != 'completed' for x in state['files'].values())):
        raise ValueError('Index is not complete; no activation SQL is generated')


def remote_files(api,store_id):
    found={};after=None
    while True:
        result=api.call('GET',f'/vector_stores/{store_id}/files?limit=100'+('&after='+after if after else ''))
        found.update({row['id']:row for row in result['data']})
        if not result.get('has_more'): return found
        after=result['last_id']


def sync(folder, manifest, manifest_hash, output, api, max_files=100, concurrency=1):
    if not 1<=concurrency<=4: raise ValueError('Invalid concurrency; use 1 to 4')
    state_file=output/'index-state.json'
    state=json.loads(state_file.read_text()) if state_file.exists() else mapping(manifest,manifest_hash,'openai')
    validate_mapping(state,manifest,manifest_hash)
    if state['provider'] != 'openai' or state.get('project_id') != os.environ.get('OPENAI_PROJECT_ID'):
        raise ValueError('Cannot reuse mock state or state from another OpenAI project')
    state['status']='staging';save(state_file,state)
    (output/'activate.sql').unlink(missing_ok=True)
    if not state['vector_store_id']:
        result=api.call('POST','/vector_stores',dict(name='ECE685 '+manifest['corpus_version'],
            expires_after=dict(anchor='last_active_at',days=30)))
        state['vector_store_id']=result['id'];save(state_file,state)
    cache_file=output.parent/'file-cache.json'
    cache=json.loads(cache_file.read_text()) if cache_file.exists() else dict(project_id=os.environ.get('OPENAI_PROJECT_ID'),files={})
    if cache.get('project_id') != state.get('project_id'):
        raise ValueError('File cache project mismatch')
    store_id=state['vector_store_id']; found=remote_files(api,store_id)
    pending=[]
    for u in manifest['uploads']:
        entry=state['files'].get(u['doc_id'])
        if entry:
            if entry['file_id'] not in found: raise ValueError('A recorded file is missing remotely; stopped')
            entry['status']=found[entry['file_id']]['status']
        else:
            cached_id=cache['files'].get(u['sha256'])
            # Recover a known upload whose attachment response was lost, without repeating POST.
            if cached_id in found:
                remote=found[cached_id]
                attrs=dict(doc_id=u['doc_id'],kind=u['kind'],language=u['language'],source_type=u['source_type'])
                if remote.get('attributes')!=attrs:
                    raise ValueError('Unrecorded remote attachment metadata mismatch; manual review required')
                entry=dict(file_id=cached_id,sha256=u['sha256'],status=remote['status'])
                state['files'][u['doc_id']]=entry
            elif len(pending)<max_files:
                pending.append(u)
        if entry and entry['status'] in {'failed','cancelled'}:
            raise ValueError('Provider indexing failed for '+u['doc_id']+'; old active version is unaffected')
    save(state_file,state)
    lock=Lock();hash_locks={u['sha256']:Lock() for u in pending}

    def attach(u):
        # Different files may upload in parallel; shared JSON writes remain serialized.
        with hash_locks[u['sha256']]:
            with lock: file_id=cache['files'].get(u['sha256'])
            if not file_id:
                file_id=api.upload(Path(folder)/u['path'])
                with lock:
                    cache['files'][u['sha256']]=file_id;save(cache_file,cache)
        attrs=dict(doc_id=u['doc_id'],kind=u['kind'],language=u['language'],source_type=u['source_type'])
        remote=api.call('POST',f'/vector_stores/{store_id}/files',dict(file_id=file_id,attributes=attrs))
        with lock:
            state['files'][u['doc_id']]=dict(file_id=file_id,sha256=u['sha256'],status=remote['status'])
            save(state_file,state)
        if remote['status'] in {'failed','cancelled'}:
            raise ValueError('Provider indexing failed for '+u['doc_id'])

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        # At most one group is in flight. On failure, finish/save that group and stop.
        for start in range(0,len(pending),concurrency):
            futures=[executor.submit(attach,u) for u in pending[start:start+concurrency]]
            errors=[]
            for future in futures:
                try: future.result()
                except Exception as error: errors.append(error)
            if errors: raise errors[0]
            if (start+concurrency)%100<concurrency:
                print(f'Attached files: {len(state["files"])}/{manifest["document_count"]}',flush=True)
    if len(state['files'])==manifest['document_count']:
        # Check actual membership, not just local progress. Extra files block activation.
        found={file_id:row['status'] for file_id,row in remote_files(api,store_id).items()}
        expected={r['file_id'] for r in state['files'].values()}
        if set(found)!=expected:
            raise ValueError('Remote index membership mismatch; activation blocked')
        for entry in state['files'].values(): entry['status']=found[entry['file_id']]
        if all(v=='completed' for v in found.values()): state['status']='ready'
        save(state_file,state)
    return state


def quote(value):
    if value is None: return 'NULL'
    if isinstance(value,int): return str(value)
    return "'"+str(value).replace("'","''")+"'"


def sql_bundle(manifest,documents,state,manifest_hash,output):
    validate_mapping(state,manifest,manifest_hash,ready=True)
    if not re.fullmatch(r'vs_[a-zA-Z0-9_-]+',state['vector_store_id']):
        raise ValueError('Invalid vector store ID')
    version=manifest['corpus_version']
    values=[version,'ECE685',state['vector_store_id'],state['provider'],manifest['document_count'],
            manifest['textbook_selection_doc_id'],manifest_hash,'staging',int(time.time())]
    lines=['INSERT INTO course_versions VALUES('+','.join(map(quote,values))+');']
    # Individual statements are below D1's size limit; files stay small for dashboard inspection.
    for doc in documents.values():
        metadata={k:v for k,v in doc.items() if k!='text'}
        values=[version,doc['doc_id'],state['files'][doc['doc_id']]['file_id'],doc['content_sha256'],doc['text'],canonical(metadata)]
        statement='INSERT INTO documents VALUES('+','.join(map(quote,values))+');'
        if len(statement.encode())>90000: raise ValueError('Document too large for D1 SQL statement')
        lines.append(statement)
    parts=[]; chunk=[]; size=0
    for line in lines:
        if chunk and size+len(line.encode())>150000:
            parts.append('\n'.join(chunk)+'\n');chunk=[];size=0
        chunk.append(line);size+=len(line.encode())
    if chunk: parts.append('\n'.join(chunk)+'\n')
    for i,part in enumerate(parts): (output/f'import-{i:03}.sql').write_text(part)
    # Run only after imports and source/model evals. The DB activation trigger checks completeness.
    activate=(f"UPDATE course_versions SET status='ready' WHERE version={quote(version)};\n"
              f"UPDATE courses SET active_version={quote(version)} WHERE course_id='ECE685';\n"
              f"SELECT version,status,document_count FROM course_versions WHERE version={quote(version)};\n")
    (output/'activate.sql').write_text(activate)
    save(output/'sql-import-plan.json',dict(provider=state['provider'],corpus_version=version,
        document_count=len(documents),files=[f'import-{i:03}.sql' for i in range(len(parts))],
        activation_file='activate.sql',note='Private SQL; never copy into Jekyll output. Import once into staging; activation is separate.'))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corpus',type=Path,required=True)
    parser.add_argument('--output',type=Path)
    actions=parser.add_mutually_exclusive_group()
    actions.add_argument('--mock',action='store_true')
    actions.add_argument('--upload',action='store_true')
    actions.add_argument('--sql',action='store_true',help='Generate SQL from an existing completed index-state.json')
    parser.add_argument('--max-files',type=int,default=100,help='Max newly attached files per upload run (resume by rerunning)')
    parser.add_argument('--concurrency',type=int,default=1,help='Bounded upload concurrency, 1 to 4')
    parser.add_argument('--credentials-file',type=Path,help='Private owner-only file; used only with --upload')
    args=parser.parse_args()
    try:
        if args.credentials_file and not args.upload:
            raise ValueError('--credentials-file is used only with --upload')
        manifest,documents,mhash=bundle(args.corpus)
        output=private_output(ROOT,args.output or ROOT/'tmp/ece685-chat/index'/manifest['corpus_version'])
        output.mkdir(parents=True,exist_ok=True)
        if args.mock:
            state=mapping(manifest,mhash,'mock');state.update(vector_store_id='vs_mock',status='ready')
            state['files']={u['doc_id']:dict(file_id='file-mock-'+hashlib.sha256(u['doc_id'].encode()).hexdigest(),
                sha256=u['sha256'],status='completed') for u in manifest['uploads']}
            save(output/'index-state.json',state);sql_bundle(manifest,documents,state,mhash,output)
        elif args.upload:
            if not 1<=args.max_files<=1104: raise ValueError('Invalid max-files')
            if args.credentials_file:
                key=load_credentials(args.credentials_file).get('OPENAI_API_KEY')
            else:
                key=os.environ.get('OPENAI_API_KEY') or getpass.getpass('OpenAI API key (hidden, not saved): ')
            if not key: raise ValueError('An API key is required for uploads')
            state=sync(args.corpus,manifest,mhash,output,API(key),args.max_files,args.concurrency)
            if state['status']=='ready': sql_bundle(manifest,documents,state,mhash,output)
            print(f'Index progress: {len(state["files"])}/{manifest["document_count"]}, status {state["status"]}; rerun to resume/poll.')
        elif args.sql:
            sql_bundle(manifest,documents,json.loads((output/'index-state.json').read_text()),mhash,output)
        else:
            save(output/'sync-plan.json',dict(corpus_version=manifest['corpus_version'],manifest_sha256=mhash,
                document_count=len(documents),upload_count=len(manifest['uploads']),rag_status=manifest['rag_status'],
                platform_textbook_edition=6,textbook_selection_doc_id=manifest['textbook_selection_doc_id'],
                action='offline validation only; no uploaded files, no cloud resources'))
        print('Private output: '+str(output))
    except (ValueError,KeyError,OSError) as error:
        parser.exit(1,'Index preparation stopped: '+str(error)+'\n')


if __name__=='__main__': main()
