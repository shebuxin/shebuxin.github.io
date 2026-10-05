#!/usr/bin/env python3
"""Validate or explicitly run private course evaluations through the real backend."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from ece685_chat_credentials import load_credentials
from export_ece685_chat_corpus import ROOT, canonical, private_output
from sync_ece685_chat_index import bundle, validate_mapping


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corpus',type=Path,required=True)
    parser.add_argument('--index',type=Path)
    parser.add_argument('--output',type=Path)
    parser.add_argument('--model',default='gpt-6-astra')
    parser.add_argument('--reasoning',choices=['low','medium','high','xhigh','max'],default='medium')
    parser.add_argument('--limit',type=int,default=20)
    parser.add_argument('--credentials-file',type=Path)
    parser.add_argument('--run',action='store_true',help='Explicit real model calls; default only validates case sources')
    parser.add_argument('--retry-failed',action='store_true',help='Explicitly retry previously failed paid requests')
    args=parser.parse_args()
    try:
        if not 1<=args.limit<=50: raise ValueError('Evaluation limit must be 1 to 50')
        manifest,documents,mhash=bundle(args.corpus)
        cases=[]
        for name in ['course-evaluation-cases.json','evaluation-cases.json']:
            cases.extend(json.loads((ROOT/'_source/ece685-rag'/name).read_text())['cases'])
        cases=cases[:args.limit]
        for case in cases:
            if any(doc_id not in documents for doc_id in case['expected_docs']):
                raise ValueError('Evaluation source missing for '+case['id'])
        output=private_output(ROOT,args.output or ROOT/'tmp/ece685-chat/evaluations'/manifest['corpus_version']/args.model)
        output.mkdir(parents=True,exist_ok=True);output.chmod(0o700)
        index=private_output(ROOT,args.index or ROOT/'tmp/ece685-chat/index'/manifest['corpus_version'])
        metadata=dict(corpus_version=manifest['corpus_version'],manifest_sha256=mhash,model=args.model,
            reasoning=args.reasoning,max_output_tokens=8192,timeout_seconds=75,cases=cases)
        fingerprint=hashlib.sha256(canonical(metadata).encode()+(ROOT/'services/course-chat/src/provider.mjs').read_bytes()
            +(ROOT/'services/course-chat/src/worker.mjs').read_bytes()).hexdigest()
        if not args.run:
            (output/'preflight.json').write_text(json.dumps(dict(metadata,source_preflight='passed',paid_calls=0),ensure_ascii=False,indent=2)+'\n')
            print(f'Evaluation source preflight passed: {len(cases)} cases; no model calls.')
            return
        if not args.credentials_file: raise ValueError('--run requires --credentials-file')
        state=json.loads((index/'index-state.json').read_text());validate_mapping(state,manifest,mhash,ready=True)
        if state['provider']!='openai': raise ValueError('Live evaluation requires the completed OpenAI index')
        credentials=load_credentials(args.credentials_file)
        if not credentials.get('OPENAI_API_KEY'): raise ValueError('An API key is required')
        job=dict(metadata,index=str(index),output=str(output),fingerprint=fingerprint,retry_failed=args.retry_failed,
            api_key=credentials['OPENAI_API_KEY'])
        # Secrets travel in an anonymous pipe, never command-line arguments, files, or tool output.
        result=subprocess.run(['node',str(ROOT/'scripts/evaluate_ece685_chat.mjs')],input=canonical(job),text=True,
            stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        print(result.stdout,end='')
        if result.returncode: parser.exit(1,'Course evaluation stopped; see private results for the recorded error code.\n')
    except (ValueError,KeyError,OSError) as error:
        parser.exit(1,'Evaluation preparation stopped: '+str(error)+'\n')


if __name__=='__main__': main()
