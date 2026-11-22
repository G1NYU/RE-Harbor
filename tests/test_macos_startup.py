import errno
import importlib.util
from contextlib import redirect_stderr
import io
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location(
    "startup", Path(__file__).resolve().parents[1] / "scripts/macos-startup-check.py"
)
startup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(startup)


class StartupTests(unittest.TestCase):
    def test_early_exit_fails_and_keeps_diagnostics(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            with self.assertRaisesRegex(RuntimeError, "status 42"):
                startup.probe([sys.executable, "-c", "import sys; print('dyld fixture', file=sys.stderr); sys.exit(42)"],
                              output, 10, dict(os.environ))
            self.assertIn("dyld fixture", (output / "stderr.log").read_text())

    def test_clean_immediate_exit_is_not_a_startup_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(RuntimeError, "status 0"):
                startup.probe([sys.executable, "-c", "pass"], Path(directory), 10, dict(os.environ))

    def test_surviving_process_is_stopped(self):
        with tempfile.TemporaryDirectory() as directory:
            startup.probe([sys.executable, "-c", "import time; time.sleep(30)"],
                          Path(directory), 0.3, dict(os.environ))

    def test_profile_cleanup_retries_active_webkit_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            profile = Path(directory) / "profile"
            profile.mkdir()
            real_rmtree = startup.shutil.rmtree
            attempts = 0

            def racing_cleanup(path):
                nonlocal attempts
                attempts += 1
                if attempts == 1:
                    raise OSError(errno.ENOTEMPTY, "Directory not empty", str(path))
                return real_rmtree(path)

            with mock.patch.object(startup.shutil, "rmtree", side_effect=racing_cleanup), \
                 mock.patch.object(startup.time, "sleep") as sleep:
                startup.cleanup_profile(profile)
            self.assertEqual(attempts, 2)
            sleep.assert_called_once_with(0.25)
            self.assertFalse(profile.exists())

    def test_busy_profile_cleanup_does_not_fail_successful_startup(self):
        with tempfile.TemporaryDirectory() as directory:
            profile = Path(directory) / "profile"
            profile.mkdir()
            stderr = io.StringIO()
            with mock.patch.object(startup.shutil, "rmtree", side_effect=OSError(errno.ENOTEMPTY, "Directory not empty")) as remove, \
                 mock.patch.object(startup.time, "sleep") as sleep, redirect_stderr(stderr):
                startup.cleanup_profile(profile)
            self.assertEqual(remove.call_count, 8)
            self.assertEqual(sleep.call_count, 7)
            self.assertIn("warning: temporary profile cleanup is still busy", stderr.getvalue())

    def test_profile_cleanup_does_not_hide_other_errors(self):
        with tempfile.TemporaryDirectory() as directory:
            profile = Path(directory) / "profile"
            profile.mkdir()
            with mock.patch.object(startup.shutil, "rmtree", side_effect=OSError(errno.EACCES, "Permission denied")):
                with self.assertRaises(PermissionError):
                    startup.cleanup_profile(profile)


if __name__ == "__main__":
    unittest.main()
