import importlib.util
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import unittest

spec = importlib.util.spec_from_file_location('window', Path(__file__).parents[2] / 'scripts/release-window.py')
window = importlib.util.module_from_spec(spec)
spec.loader.exec_module(window)

class WindowTests(unittest.TestCase):
    def test_releases_cannot_restart_application_overnight(self):
        for hour, minute, expected in [(5,59,False),(6,0,True),(16,14,True),(16,15,False),(17,0,False),(23,59,False)]:
            now = datetime(2026,10,8,hour,minute,tzinfo=ZoneInfo('Asia/Kolkata'))
            with self.subTest(time=now):
                self.assertEqual(window.allowed(now), expected)
                self.assertEqual(window.allowed(now.astimezone(ZoneInfo('UTC'))), expected)

class WindowCommandTests(unittest.TestCase):
    def test_ci_output_and_pre_rollout_check(self):
        import os
        import runpy
        import tempfile
        from unittest.mock import patch
        script = Path(__file__).parents[2] / 'scripts/release-window.py'
        for hour, expected in [(12, True), (23, False)]:
            instant = datetime(2026, 10, 8, hour, 0, tzinfo=ZoneInfo('Asia/Kolkata'))
            class Clock(datetime):
                @classmethod
                def now(cls, tz=None):
                    return instant.astimezone(tz)
            with tempfile.TemporaryDirectory() as directory:
                output = Path(directory) / 'output'
                with patch('datetime.datetime', Clock), patch('sys.argv', [str(script)]), patch.dict(os.environ, {'GITHUB_OUTPUT':str(output)}):
                    runpy.run_path(str(script), run_name='__main__')
                self.assertEqual(output.read_text(), f'allowed={str(expected).lower()}\n')
                with patch('datetime.datetime', Clock), patch('sys.argv', [str(script), '--check']):
                    if expected:
                        runpy.run_path(str(script), run_name='__main__')
                    else:
                        with self.assertRaisesRegex(SystemExit, 'Release window closed'):
                            runpy.run_path(str(script), run_name='__main__')
