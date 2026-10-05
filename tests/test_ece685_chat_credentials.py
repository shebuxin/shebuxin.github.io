"""Private key input must not execute text, leak values, or read shared files."""
import os
import hashlib
import hmac
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'scripts'))
from ece685_chat_credentials import load_credentials


class CredentialsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        self.path = self.folder/'credentials.env'

    def tearDown(self):
        self.temp.cleanup()

    def write(self, text):
        self.path.write_text(text)
        self.path.chmod(0o600)

    def test_owner_only_input_and_blank_fields(self):
        self.write('# private\nOPENAI_API_KEY=\nINVITE_PEPPER=sample-safe-value\n')
        self.assertEqual(load_credentials(self.path), {'OPENAI_API_KEY':'', 'INVITE_PEPPER':'sample-safe-value'})
        self.path.chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'only by you'):
            load_credentials(self.path)

    def test_invalid_entries_do_not_execute_or_reveal_secret_values(self):
        sentinel = self.folder/'executed'
        for line in ['OPENAI_API_KEY=SECRET$({})'.format('touch '+str(sentinel)),
                     'SECRET_BAD_KEY=SECRET_VALUE', 'OPENAI_API_KEY="SECRET_VALUE"',
                     'OPENAI_API_KEY=first\nOPENAI_API_KEY=SECRET_VALUE']:
            self.write(line)
            with self.assertRaises(ValueError) as caught:
                load_credentials(self.path)
            self.assertNotIn('SECRET', str(caught.exception))
            self.assertFalse(sentinel.exists())

    def test_symlinks_and_publishable_repo_paths_are_rejected(self):
        self.write('OPENAI_API_KEY=fake-key')
        link = self.folder/'link.env'
        link.symlink_to(self.path)
        with self.assertRaises(ValueError):
            load_credentials(link)
        with self.assertRaisesRegex(ValueError, 'ignored'):
            load_credentials(ROOT/'assets/credentials.env')

    def test_invitation_cli_reuses_pepper_without_printing_it(self):
        pepper = 'fake-preview-pepper-for-test-only-12345'
        self.write('OPENAI_API_KEY=\nINVITE_PEPPER='+pepper+'\n')
        result = subprocess.run([sys.executable, str(ROOT/'scripts/create_ece685_chat_invite.py'),
            '--output', str(self.folder/'invite'), '--credentials-file', str(self.path)],
            capture_output=True, text=True, env=dict(os.environ, INVITE_PEPPER='wrong-environment-value'))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(pepper, result.stdout+result.stderr)
        self.assertTrue((self.folder/'invite/invitation.sql').exists())
        self.assertEqual((self.folder/'invite/invitation-private.json').stat().st_mode & 0o777, 0o600)

    def test_owner_selected_code_uses_the_same_backend_hash_and_private_outputs(self):
        pepper = 'fake-preview-pepper-for-test-only-12345'
        self.write('INVITE_PEPPER='+pepper+'\n')
        folder = self.folder/'course-code'
        result = subprocess.run([sys.executable, str(ROOT/'scripts/create_ece685_chat_invite.py'),
            '--output', str(folder), '--code', 'ECE685', '--credentials-file', str(self.path)],
            capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(pepper, result.stdout+result.stderr)
        self.assertNotIn('ECE685', result.stdout+result.stderr)
        self.assertEqual(json.loads((folder/'invitation-private.json').read_text())['invitation_code'],'ECE685')
        self.assertEqual((folder/'invitation-code.txt').read_text(),'ECE685\n')
        expected = hmac.new(pepper.encode(),b'invite:ECE685',hashlib.sha256).hexdigest()
        self.assertIn(expected,(folder/'invitation.sql').read_text())
        for name in ('invitation.sql','invitation-private.json','invitation-code.txt'):
            self.assertEqual((folder/name).stat().st_mode & 0o777,0o600)

    def test_invalid_owner_code_cannot_enter_generated_sql(self):
        for code in ('ECE68',"ECE685');DELETE",'ECE 685','x'*129):
            result = subprocess.run([sys.executable, str(ROOT/'scripts/create_ece685_chat_invite.py'),
                '--output', str(self.folder/'invalid'), '--code', code],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('Invalid invitation code format',result.stderr)
            self.assertFalse((self.folder/'invalid/invitation.sql').exists())


if __name__ == '__main__':
    unittest.main()
