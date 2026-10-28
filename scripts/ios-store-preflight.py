#!/usr/bin/env python3
"""Read-only account-context check. Never resets preferences or Keychain."""
import json
import os
import plistlib
import pwd
import signal
import subprocess
import sys
import time
from pathlib import Path


def locked_from_registry(value):
    flags = []
    active_sessions = []
    def visit(node):
        if isinstance(node, dict):
            if node.get('kCGSSessionOnConsoleKey') is True and node.get('kCGSSessionUserIDKey') == os.getuid():
                active_sessions.append(node)
            for key, child in node.items():
                if key == 'CGSSessionScreenIsLocked' and isinstance(child, bool):
                    flags.append(child)
                elif isinstance(child, (dict, list)):
                    visit(child)
        elif isinstance(node, list):
            for child in node:
                visit(child)
    visit(value)
    if any(flags):
        return True
    if active_sessions:
        # IOConsoleUsers omits this flag when the current console session is unlocked.
        # Do not apply that interpretation to missing/other-user/off-console sessions.
        return any(session.get('CGSSessionScreenIsLocked', False) is not False for session in active_sessions)
    if not flags:
        raise ValueError('Cannot verify Mac screen-lock state. Signing was not started.')
    return False


def screen_is_locked():
    result = subprocess.run(['/usr/sbin/ioreg', '-n', 'Root', '-d1', '-a'], capture_output=True, check=True, timeout=5)
    return locked_from_registry(plistlib.loads(result.stdout))


def require_unlocked():
    if screen_is_locked():
        raise ValueError('Mac screen is locked. Unlock before signing; locked-screen provisioning can make Xcode discard the Apple account. No authentication settings were changed.')


def check():
    require_unlocked()
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
    print(json.dumps({'developerDir': str(developer), 'screenLocked': False, 'sameMacUser': True, 'diskAccounts': len(saved), 'runtimeAccounts': len(current), 'accountStoresAgree': same}), flush=True)
    if not same:
        raise ValueError('Xcode preference cache differs from disk. Inspect/reopen Xcode before requesting sign-in; never overwrite either account store.')
    if not current:
        raise ValueError('No Xcode account is saved. App Store Connect browser login is independent.')
    print('Local account checks passed. Verify cloud authentication separately by export/upload, not account count.', flush=True)
    return developer, env


def stop_own_build(child):
    if child and child.poll() is None:
        os.killpg(child.pid, signal.SIGTERM)
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()


def run_xcodebuild(developer, env, arguments):
    require_unlocked()
    child = None
    # Temporary display + idle-sleep inhibition, not a permanent lock-policy change.
    awake = subprocess.Popen(['/usr/bin/caffeinate', '-d', '-i', '-w', str(os.getpid())], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        require_unlocked()
        child = subprocess.Popen([str(developer / 'usr/bin/xcodebuild'), *arguments], env=env, start_new_session=True)
        while child.poll() is None:
            if screen_is_locked():
                raise ValueError('Mac locked during signing. Cancelled this build only; unlock and inspect account state before any retry.')
            time.sleep(1)
        return child.returncode
    finally:
        stop_own_build(child)
        if awake.poll() is None:
            awake.terminate()
        awake.wait()


if __name__ == '__main__':
    try:
        if len(sys.argv) > 1 and sys.argv[1] != '--':
            raise ValueError('Usage: ios-store-preflight.py [-- <xcodebuild arguments>]')
        developer, env = check()
        if len(sys.argv) > 2:
            sys.exit(run_xcodebuild(developer, env, sys.argv[2:]))
    except Exception as error:
        print(str(error) if isinstance(error, ValueError) else 'Account inspection failed; no settings were changed.', file=sys.stderr)
        sys.exit(1)
