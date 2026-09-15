#!/usr/bin/env python3
"""Create SSM SecureString exam parameters without overwriting existing values."""
import json
import secrets
import subprocess
import tempfile

prefix = '/smartcanteen/exam'
values = {key: secrets.token_urlsafe(48) for key in ['DB_PASSWORD', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'JWT_QR_SECRET']}
values.update(RAZORPAY_KEY_ID='rzp_test_key', RAZORPAY_KEY_SECRET='exam-fake-secret', RAZORPAY_WEBHOOK_SECRET=secrets.token_urlsafe(32), CLOUDINARY_CLOUD_NAME='demo', CLOUDINARY_API_KEY='exam-placeholder', CLOUDINARY_API_SECRET='exam-placeholder')
for key, value in values.items():
    name = f'{prefix}/{key}'
    metadata = json.loads(subprocess.check_output(['aws', 'ssm', 'describe-parameters', '--parameter-filters', json.dumps([{'Key': 'Name', 'Option': 'Equals', 'Values': [name]}]), '--output', 'json'], text=True))
    if metadata['Parameters']:
        print(f'Preserved {name}')
        continue
    # NamedTemporaryFile is owner-only and removed on exit. AWS CLI can read it
    # reliably on macOS as well as Linux without exposing values in arguments.
    with tempfile.NamedTemporaryFile(mode='w+', suffix='.json') as payload:
        json.dump({'Name': name, 'Value': value, 'Type': 'SecureString', 'Tier': 'Standard', 'Overwrite': False}, payload)
        payload.flush()
        subprocess.run(['aws', 'ssm', 'put-parameter', '--cli-input-json', f'file://{payload.name}'], check=True, stdout=subprocess.DEVNULL)
    print(f'Created {name} (SecureString)')
print('Exam SSM parameters ready. Use fake payments; real Cloudinary uploads need real provider values.')
