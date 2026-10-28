import importlib.util
from pathlib import Path
import unittest
import os
from unittest.mock import patch, Mock

spec = importlib.util.spec_from_file_location('signing_guard', Path(__file__).resolve().parents[1] / 'scripts/ios-store-preflight.py')
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class SigningGuardTests(unittest.TestCase):
    def test_locked_registry_is_rejected(self):
        self.assertTrue(guard.locked_from_registry({'IOConsoleUsers': [{'CGSSessionScreenIsLocked': True}]}))

    def test_unlocked_registry_is_accepted(self):
        self.assertFalse(guard.locked_from_registry({'IOConsoleUsers': [{'CGSSessionScreenIsLocked': False}]}))

    def test_unknown_state_fails_closed(self):
        with self.assertRaises(ValueError):
            guard.locked_from_registry({'IOConsoleUsers': []})

    def test_any_locked_session_blocks_signing(self):
        self.assertTrue(guard.locked_from_registry([{'CGSSessionScreenIsLocked': False}, {'CGSSessionScreenIsLocked': True}]))

    def test_locked_mac_never_starts_xcodebuild_or_caffeinate(self):
        with patch.object(guard, 'screen_is_locked', return_value=True), patch.object(guard.subprocess, 'Popen') as start:
            with self.assertRaises(ValueError):
                guard.run_xcodebuild(Path('/unused'), {}, ['-archive'])
            start.assert_not_called()

    def test_current_console_session_omits_unlocked_flag(self):
        self.assertFalse(guard.locked_from_registry({'IOConsoleUsers': [{'kCGSSessionOnConsoleKey': True, 'kCGSSessionUserIDKey': os.getuid()}]}))

    def test_other_user_without_flag_is_unknown(self):
        with self.assertRaises(ValueError):
            guard.locked_from_registry({'kCGSSessionOnConsoleKey': True, 'kCGSSessionUserIDKey': os.getuid() + 1})

    def test_off_console_without_flag_is_unknown(self):
        with self.assertRaises(ValueError):
            guard.locked_from_registry({'kCGSSessionOnConsoleKey': False, 'kCGSSessionUserIDKey': os.getuid()})

    def test_relock_before_build_stops_sleep_assertion(self):
        awake = Mock()
        awake.poll.return_value = None
        with patch.object(guard, 'screen_is_locked', side_effect=[False, True]), patch.object(guard.subprocess, 'Popen', return_value=awake) as start:
            with self.assertRaises(ValueError):
                guard.run_xcodebuild(Path('/unused'), {}, ['-archive'])
            self.assertEqual(start.call_count, 1)
            awake.terminate.assert_called_once()
            awake.wait.assert_called_once()

    def test_relock_during_build_cleans_only_owned_processes(self):
        awake, build = Mock(), Mock()
        awake.poll.return_value = None
        build.poll.return_value = None
        with patch.object(guard, 'screen_is_locked', side_effect=[False, False, True]), patch.object(guard.subprocess, 'Popen', side_effect=[awake, build]), patch.object(guard, 'stop_own_build') as stop:
            with self.assertRaises(ValueError):
                guard.run_xcodebuild(Path('/unused'), {}, ['-archive'])
            stop.assert_called_once_with(build)
            awake.terminate.assert_called_once()
            awake.wait.assert_called_once()
