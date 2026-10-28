#!/usr/bin/env python3
"""Read-only account-context check. Never resets preferences or Keychain."""
import json
import os
import plistlib
import pwd
import subprocess
import sys
from pathlib import Path


def check():
    user = pwd.getpwuid(os.getuid())
    home = Path(user.pw_dir)
    if Path.home() != home or os.environ.get('CFFIXED_USER_HOME', str(home)) != str(home):
        raise ValueError('Different HOME context. Use the signed-in macOS user; do not reset Xcode accounts.')
    developer = Path('/Applications/Xcode.app/Contents/Developer')
    if not (developer / 'usr/bin/xcodebuild').exists():
        raise ValueError('Expected Xcode installation is missing.')
    path = home / 'Library/Preferences/com.apple.dt.Xcode.plist'
    if not path.exists() or path.stat().st_uid != user.pw_uid:
        raise ValueError('Xcode preferences missing or owned by another user.')
    env = {**os.environ, 'HOME': str(home), 'DEVELOPER_DIR': str(developer)}
    disk = plistlib.loads(path.read_bytes())
    result = subprocess.run(['/usr/bin/defaults', 'export', 'com.apple.dt.Xcode', '-'], env=env, capture_output=True, check=True)
    live = plistlib.loads(result.stdout)
    def accounts(value):
        return value.get('DVTDeveloperAccountManagerAppleIDLists', {}).get('IDE.Identifiers.Prod', [])
    saved, current = accounts(disk), accounts(live)
    same = saved == current
    print(json.dumps({'developerDir': str(developer), 'sameMacUser': True, 'diskAccounts': len(saved), 'runtimeAccounts': len(current), 'accountStoresAgree': same}))
    if not same:
        raise ValueError('Xcode preference cache differs from disk. Inspect/reopen Xcode before requesting sign-in; never overwrite either account store.')
    if not current:
        raise ValueError('No Xcode account is saved. App Store Connect browser login is independent.')
    print('Local account checks passed. Verify cloud authentication separately by export/upload, not account count.')
    return developer, env


if __name__ == '__main__':
    try:
        if len(sys.argv) > 1 and sys.argv[1] != '--':
            raise ValueError('Usage: ios-store-preflight.py [-- <xcodebuild arguments>]')
        developer, env = check()
        if len(sys.argv) > 2:
            sys.exit(subprocess.run([str(developer / 'usr/bin/xcodebuild'), *sys.argv[2:]], env=env).returncode)
    except Exception as error:
        print(str(error) if isinstance(error, ValueError) else 'Account inspection failed; no settings were changed.', file=sys.stderr)
        sys.exit(1)
