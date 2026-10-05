#!/usr/bin/env python3
"""Generate a private invitation and SQL; prompt for the shared hashing secret."""
import argparse
import getpass
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import time
from export_ece685_chat_corpus import ROOT, private_output
from ece685_chat_credentials import load_credentials


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--days',type=int,default=7)
    parser.add_argument('--messages',type=int,default=200)
    parser.add_argument('--sessions',type=int,default=20)
    parser.add_argument('--code',help='Optional owner-selected course code: 6–128 letters, digits, underscores or hyphens')
    parser.add_argument('--credentials-file',type=Path,help='Private owner-only file containing INVITE_PEPPER')
    args=parser.parse_args()
    if args.code is not None and not re.fullmatch(r'[a-zA-Z0-9_-]{6,128}',args.code):
        parser.error('Invalid invitation code format')
    folder=private_output(ROOT,args.output);folder.mkdir(parents=True,exist_ok=True)
    if not (1<=args.days<=120 and 1<=args.messages<=10000 and 1<=args.sessions<=1000): parser.error('Invalid quota')
    try:
        pepper=(load_credentials(args.credentials_file).get('INVITE_PEPPER') if args.credentials_file else
                os.environ.get('INVITE_PEPPER') or getpass.getpass('INVITE_PEPPER (hidden, must match backend): '))
    except ValueError as error:
        parser.exit(1,'Invitation preparation stopped: '+str(error)+'\n')
    if not pepper: parser.error('INVITE_PEPPER is required')
    if len(pepper)<32: parser.error('Use a random secret of at least 32 characters')
    code=args.code if args.code is not None else secrets.token_urlsafe(24)
    expiry=int(time.time())+args.days*86400
    value=hmac.new(pepper.encode(),('invite:'+code).encode(),hashlib.sha256).hexdigest()
    (folder/'invitation.sql').write_text(f"INSERT INTO invitations(invite_hash,expires_at,max_messages,max_sessions) VALUES('{value}',{expiry},{args.messages},{args.sessions});\n")
    (folder/'invitation-private.json').write_text(json.dumps(dict(invitation_code=code,expires_at=expiry),indent=2)+'\n')
    (folder/'invitation-code.txt').write_text(code+'\n')
    for name in ('invitation.sql','invitation-private.json','invitation-code.txt'):
        os.chmod(folder/name,0o600)
    print('Private invitation files written to '+str(folder)+'. No secret values printed.')


if __name__=='__main__': main()
