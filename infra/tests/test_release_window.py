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
