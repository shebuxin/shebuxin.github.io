#!/usr/bin/env python3
"""Loopback-only UI demonstration for ECE 685; no models, keys or cloud resources.

Serve a Jekyll preview built with services/course-chat/preview.yml. The mock
API accepts DEMO as an invitation code, validates real corpus positions and
streams clearly labeled fixed examples. It is never a production backend.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import secrets
import time
from urllib.parse import urlsplit

from export_ece685_chat_corpus import ROOT, SECTIONS, canonical, digest


def load_corpus(folder):
    folder = Path(folder)
    manifest = json.loads((folder / 'manifest.json').read_text())
    data = (folder / 'documents.jsonl').read_bytes()
    if manifest.get('schema_version') != 2 or manifest.get('course_id') != 'ECE685' or digest(data) != manifest['documents_sha256']:
        raise ValueError('Invalid corpus manifest/hash')
    records = [json.loads(line) for line in data.decode().splitlines()]
    if len(records) != manifest['document_count'] or len({r['doc_id'] for r in records}) != len(records):
        raise ValueError('Invalid corpus count/IDs')
    for row in records:
        if row['content_sha256'] != digest(row['text'].encode()) or row['course_id'] != 'ECE685':
            raise ValueError('Invalid corpus document')
        if row['kind'] == 'reference' and (not row.get('index_eligible') or set(row.get('quality_flags', [])).intersection({'no_extracted_text', 'suspect_glyphs', 'unverified_math_font_encoding'})):
            raise ValueError('Quarantined reference cannot enter preview context')
    return manifest, {r['doc_id']: r for r in records}


def validate_message(body, documents, lecture_ids):
    if not isinstance(body, dict) or set(body) - {'course_id', 'lecture_id', 'language', 'context', 'message', 'client_request_id'}:
        raise ValueError('invalid_request')
    lecture, language = body.get('lecture_id'), body.get('language')
    if body.get('course_id') != 'ECE685' or lecture not in lecture_ids or language not in {'en', 'zh'}:
        raise ValueError('invalid_request')
    if not isinstance(body.get('message'), str) or not 1 <= len(body['message'].strip()) <= 4000:
        raise ValueError('invalid_request')
    if not isinstance(body.get('client_request_id'), str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,128}', body['client_request_id']):
        raise ValueError('invalid_request')
    context = body.get('context')
    if context is None:
        return None
    if not isinstance(context, dict) or set(context) - {'kind', 'section_id', 'slide_number', 'selection_text'}:
        raise ValueError('invalid_context')
    kind, section = context.get('kind'), context.get('section_id')
    if kind not in {'slide', 'lesson', 'selection', 'code'} or section not in SECTIONS:
        raise ValueError('invalid_context')
    selected = context.get('selection_text', '')
    if not isinstance(selected, str) or len(selected) > 4000:
        raise ValueError('invalid_context')
    number = context.get('slide_number')
    if number is not None:
        if type(number) is not int or number < 1 or section != 'lecture-overview' or kind not in {'slide', 'selection'}:
            raise ValueError('invalid_context')
        source_id = f'ECE685:{lecture}:slide:{number:03}'
    else:
        if kind == 'slide' or (kind == 'code' and section != 'lecture-code'):
            raise ValueError('invalid_context')
        source_id = f'ECE685:{lecture}:lesson:{language}:{section}'
    if source_id not in documents:
        raise ValueError('invalid_context')
    return documents[source_id]


def source_label(row, language):
    if row['kind'] == 'reference':
        return dict(doc_id=row['doc_id'], label=row['citation']['label'], url=None)
    position = (('课件第 ' if language == 'zh' else 'slide ') + str(row['page_number']) + (' 页' if language == 'zh' else '')) if row['kind'] == 'slide' else row['section_id']
    return dict(doc_id=row['doc_id'], label=row['lecture_id'] + ' · ' + position, url=row['source_urls'][language])


def demonstration(body, source, documents, count):
    zh = body['language'] == 'zh'
    position = source_label(source, body['language'])['label'] if source else ('课程问题 · 不附背景' if zh else 'Course question · no context')
    if zh:
        text = (f'**界面演示，第 {count} 个问题。** 已收到提问，附带位置为 {position}。\n\n'
                '这段固定回答用于核对流式显示、公式与出处；真实模型尚未接通。它不会根据问题生成解释。\n\n'
                '固定的排版示例：对零直流偏置的正弦波，峰值和 RMS 的关系为\n'
                '$$V_{\\mathrm{rms}}=\\frac{V_{\\max}}{\\sqrt2}.$$\n\n'
                '- 所附位置保存在发送时，之后翻页不会改变这条消息。\n'
                '- 下方显示公开课程链接或私有教材出处。\n\n'
                '```python\nimport math\nrms = peak / math.sqrt(2)\n```')
    else:
        text = (f'**UI demonstration, question {count}.** Received your question with context: {position}.\n\n'
                'This fixed response checks streaming, equations and citations. The real model is not connected; it does not generate an explanation from your question.\n\n'
                'Fixed formatting example for a sinusoid with no DC offset:\n'
                '$$V_{\\mathrm{rms}}=\\frac{V_{\\max}}{\\sqrt2}.$$\n\n'
                '- Context is captured when you send. Turning slides later does not change this message.\n'
                '- Sources below show public course links or private textbook citation labels.\n\n'
                '```python\nimport math\nrms = peak / math.sqrt(2)\n```')
    sources = [source_label(source, body['language'])] if source else []
    note = documents.get('ECE685:reference:glover-6e-2017:verified:rms-definition-and-sinusoid')
    if note:
        sources.append(source_label(note, body['language']))
    return text, sources


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, site, manifest, documents, sessions, **kwargs):
        self.manifest, self.documents, self.sessions = manifest, documents, sessions
        super().__init__(*args, directory=str(site), **kwargs)

    def json_response(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if urlsplit(self.path).path == '/api/course-chat/health':
            self.json_response(200, dict(status='ok', mode='demo', course_id='ECE685', corpus_version=self.manifest['corpus_version']))
        elif self.path.startswith('/api/'):
            self.json_response(404, dict(error=dict(code='not_found')))
        else:
            super().do_GET()

    def do_POST(self):
        # Same-origin loopback preview. There is no permissive production CORS.
        if self.headers.get('Origin') not in {None, f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'}:
            self.json_response(403, dict(error=dict(code='origin_rejected')))
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 65536 or self.headers.get_content_type() != 'application/json':
                raise ValueError('invalid_request')
            body = json.loads(self.rfile.read(size))
            route = urlsplit(self.path).path
            if route == '/api/course-chat/session':
                if not isinstance(body, dict) or set(body) != {'course_id', 'language', 'invitation_code'} or body.get('course_id') != 'ECE685' or body.get('language') not in {'en', 'zh'}:
                    raise ValueError('invalid_request')
                if body.get('invitation_code') != 'DEMO':
                    self.json_response(401, dict(error=dict(code='invite_invalid')))
                    return
                token = secrets.token_urlsafe(24)
                expires = time.time() + 3600
                self.sessions[token] = dict(expires=expires, questions=0)
                self.json_response(200, dict(session_token=token, expires_at=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(expires)), mode='demo'))
            elif route == '/api/course-chat/messages':
                token = self.headers.get('Authorization', '').removeprefix('Bearer ')
                session = self.sessions.get(token)
                if not session or session['expires'] <= time.time():
                    self.json_response(401, dict(error=dict(code='unauthorized')))
                    return
                source = validate_message(body, self.documents, self.manifest['lecture_ids'])
                session['questions'] += 1
                text, sources = demonstration(body, source, self.documents, session['questions'])
                frames = [('start', dict(request_id=body['client_request_id'], mode='demo', corpus_version=self.manifest['corpus_version']))]
                frames += [('delta', dict(text=text[n:n+80])) for n in range(0, len(text), 80)]
                frames += [('sources', dict(sources=sources)), ('done', dict(complete=True))]
                data = [f'event: {event}\ndata: {canonical(value)}\n\n'.encode() for event, value in frames]
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
                self.send_header('Content-Length', str(sum(map(len, data))))
                self.send_header('Cache-Control', 'no-store')
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.end_headers()
                for frame in data:
                    self.wfile.write(frame)
                    self.wfile.flush()
                    time.sleep(.1)
            else:
                self.json_response(404, dict(error=dict(code='not_found')))
        except (ValueError, KeyError, TypeError) as error:
            code = str(error) if str(error) in {'invalid_context', 'invalid_request'} else 'invalid_request'
            self.json_response(400, dict(error=dict(code=code)))
        except (BrokenPipeError, ConnectionResetError):
            pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site-dir', type=Path, default=ROOT / 'tmp/ece685-chat/site')
    parser.add_argument('--corpus', type=Path, required=True)
    parser.add_argument('--port', type=int, default=8788)
    args = parser.parse_args()
    if not (args.site_dir / 'index.html').is_file():
        parser.error('Build the preview site first')
    manifest, documents = load_corpus(args.corpus)
    handler = partial(PreviewHandler, site=args.site_dir.resolve(), manifest=manifest, documents=documents, sessions={})
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
    print(f'UI demonstration at http://127.0.0.1:{args.port}/teaching/ece685/l05-single-phase-ac-i/?slide=12#lecture-overview', flush=True)
    print('Invitation code: DEMO. Fixed demonstration responses only; no model calls.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
