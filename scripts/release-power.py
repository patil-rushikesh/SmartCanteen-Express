"""Read the shared application power flag; API errors and invalid values deny release."""
import argparse
import json
import os
import subprocess


def allowed(config):
    flag = config.get('Environment', {}).get('Variables', {}).get('APPLICATION_ENABLED')
    if flag not in ('true', 'false'):
        raise ValueError('APPLICATION_ENABLED is missing or invalid; release denied')
    if config.get('LastUpdateStatus') != 'Successful':
        return False
    return flag == 'true'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = subprocess.run(['aws', 'lambda', 'get-function-configuration',
                             '--function-name', os.environ['ECS_CLUSTER'] + '-operations',
                             '--output', 'json'], check=True, capture_output=True, text=True)
    enabled = allowed(json.loads(result.stdout))
    if args.check:
        if not enabled:
            raise SystemExit('Application power is off or changing; release denied.')
    else:
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write(f'allowed={str(enabled).lower()}\n')
        print('Application power is ' + ('on' if enabled else 'off or changing; deployment skipped'))


if __name__ == '__main__':
    main()
