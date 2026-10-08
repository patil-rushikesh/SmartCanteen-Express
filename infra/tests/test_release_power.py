import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('power', Path(__file__).parents[2] / 'scripts/release-power.py')
power = importlib.util.module_from_spec(spec)
spec.loader.exec_module(power)


def configuration(flag):
    return {'Environment': {'Variables': {'APPLICATION_ENABLED': flag}}, 'LastUpdateStatus': 'Successful'}


class PowerTests(unittest.TestCase):
    def test_only_explicit_true_admits_release(self):
        self.assertTrue(power.allowed(configuration('true')))
        self.assertFalse(power.allowed(configuration('false')))
        for flag in [None, '', 'TRUE', 'on', True]:
            with self.subTest(flag=flag), self.assertRaises(ValueError):
                power.allowed(configuration(flag))
        with self.assertRaises(ValueError):
            power.allowed({})
        config = configuration('true')
        config['LastUpdateStatus'] = 'InProgress'
        self.assertFalse(power.allowed(config))

    def test_output_and_fresh_rollout_check(self):
        for enabled in [True, False]:
            response = subprocess.CompletedProcess([], 0, json.dumps(configuration(str(enabled).lower())))
            with tempfile.TemporaryDirectory() as directory:
                output = Path(directory) / 'output'
                with patch.dict(os.environ, {'ECS_CLUSTER': 'smartcanteen-exam', 'GITHUB_OUTPUT': str(output)}), patch.object(power.subprocess, 'run', return_value=response) as aws:
                    with patch('sys.argv', ['release-power.py']):
                        power.main()
                    self.assertEqual(output.read_text(), f'allowed={str(enabled).lower()}\n')
                    self.assertIn('smartcanteen-exam-operations', aws.call_args.args[0])
                    with patch('sys.argv', ['release-power.py', '--check']):
                        if enabled:
                            power.main()
                        else:
                            with self.assertRaises(SystemExit):
                                power.main()

    def test_aws_failure_never_admits_release(self):
        with patch.dict(os.environ, {'ECS_CLUSTER': 'cluster'}), patch('sys.argv', ['release-power.py']), patch.object(power.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'aws')):
            with self.assertRaises(subprocess.CalledProcessError):
                power.main()
