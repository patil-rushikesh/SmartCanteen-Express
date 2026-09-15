#!/usr/bin/env python3
"""Run a command with the AWS CLI's cached MFA role session, without printing keys."""
import json
import os
import subprocess
import sys

if len(sys.argv) < 2:
    raise SystemExit('Usage: with_aws_session.py COMMAND [ARGS...]')
profile = os.environ.get('AWS_PROFILE', 'smartcanteen')
credentials = json.loads(subprocess.check_output([
    'aws', 'configure', 'export-credentials', '--profile', profile, '--format', 'process',
], text=True))
environment = dict(os.environ)
environment.pop('AWS_PROFILE', None)
environment.pop('AWS_DEFAULT_PROFILE', None)
environment.update(
    AWS_ACCESS_KEY_ID=credentials['AccessKeyId'],
    AWS_SECRET_ACCESS_KEY=credentials['SecretAccessKey'],
    AWS_SESSION_TOKEN=credentials['SessionToken'],
    AWS_REGION=os.environ.get('AWS_REGION', 'ap-south-1'),
)
os.execvpe(sys.argv[1], sys.argv[1:], environment)
