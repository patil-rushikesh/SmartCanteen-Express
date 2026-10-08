"""Deployment admission: leave a 45-minute buffer before the nightly shutdown."""
import argparse
import os
from datetime import datetime
from zoneinfo import ZoneInfo


def allowed(now):
    local = now.astimezone(ZoneInfo('Asia/Kolkata'))
    return 360 <= local.hour * 60 + local.minute < 975


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = allowed(datetime.now(ZoneInfo('Asia/Kolkata')))
    if args.check:
        if not result:
            raise SystemExit('Release window closed (06:00-16:15 IST); next morning run will deploy latest passing main.')
    else:
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write(f'allowed={str(result).lower()}\n')
