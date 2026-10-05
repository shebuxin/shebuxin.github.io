"""Read explicitly selected private credentials without shell/dotenv evaluation."""
import os
from pathlib import Path
import re
import stat

from export_ece685_chat_corpus import ROOT, private_output


def load_credentials(path):
    path = Path(path).absolute()
    private_output(ROOT, path)
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(descriptor, 'rb') as stream:
            info = os.fstat(stream.fileno())
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                    or stat.S_IMODE(info.st_mode) & 0o077):
                raise ValueError('Credentials file must be owned by you and readable only by you (chmod 600)')
            raw = stream.read(16385)
    except OSError:
        raise ValueError('Cannot read private credentials file; check its path and permissions') from None
    if len(raw) > 16384:
        raise ValueError('Credentials file is too large')
    try:
        content = raw.decode('utf-8')
    except UnicodeError:
        raise ValueError('Credentials file must use UTF-8') from None
    values = {}
    for number, line in enumerate(content.splitlines(), 1):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        name, separator, value = line.partition('=')
        if (not separator or name not in {'OPENAI_API_KEY', 'INVITE_PEPPER'}
                or name in values or not re.fullmatch(r'[A-Za-z0-9_.:-]*', value)):
            # Never include the offending line/name/value in an error message.
            raise ValueError(f'Invalid credentials entry on line {number}; use unquoted NAME=value')
        values[name] = value
    return values
