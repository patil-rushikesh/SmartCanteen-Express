#!/usr/bin/env python3
"""Deploy an immutable ECS image, running backend migrations before rollout."""
import argparse
import json
import re
import subprocess


def aws(*args):
    result = subprocess.run(['aws', *args, '--output', 'json'], check=True, capture_output=True, text=True)
    return json.loads(result.stdout) if result.stdout.strip() else {}


def render_task(task, container, image):
    if not re.fullmatch(r'[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/[^\s@]+@sha256:[a-f0-9]{64}', image):
        raise ValueError('Deploy an ECR image pinned by sha256 digest')
    task = json.loads(json.dumps(task))
    for key in ['taskDefinitionArn', 'revision', 'status', 'requiresAttributes', 'compatibilities', 'registeredAt', 'registeredBy', 'deregisteredAt']:
        task.pop(key, None)
    matches = [item for item in task['containerDefinitions'] if item['name'] == container]
    if len(matches) != 1:
        raise ValueError('Expected exactly one matching container')
    matches[0]['image'] = image
    return task


def service_state(cluster, service):
    result = aws('ecs', 'describe-services', '--cluster', cluster, '--services', service)
    if result.get('failures') or len(result.get('services', [])) != 1:
        raise RuntimeError('ECS service was not found')
    return result['services'][0]


def deploy(args):
    service = service_state(args.cluster, args.service)
    source = args.template or service['taskDefinition']
    task = aws('ecs', 'describe-task-definition', '--task-definition', source)['taskDefinition']
    task = render_task(task, args.container, args.image)
    revision = aws('ecs', 'register-task-definition', '--cli-input-json', json.dumps(task))['taskDefinition']['taskDefinitionArn']
    print(f'Registered {revision}', flush=True)
    if args.container == 'backend':
        result = aws('ecs', 'run-task', '--cluster', args.cluster, '--task-definition', revision,
                     '--launch-type', 'FARGATE', '--platform-version', '1.4.0',
                     '--network-configuration', json.dumps(service['networkConfiguration']),
                     '--overrides', json.dumps({'containerOverrides': [{'name': 'backend', 'command': ['migrate']}]}))
        if result.get('failures') or len(result.get('tasks', [])) != 1:
            raise RuntimeError('Migration task could not start; service was not updated')
        migration = result['tasks'][0]['taskArn']
        try:
            aws('ecs', 'wait', 'tasks-stopped', '--cluster', args.cluster, '--tasks', migration)
        except subprocess.CalledProcessError:
            aws('ecs', 'stop-task', '--cluster', args.cluster, '--task', migration, '--reason', 'Migration waiter timed out')
            raise
        stopped = aws('ecs', 'describe-tasks', '--cluster', args.cluster, '--tasks', migration)['tasks'][0]
        containers = [c for c in stopped['containers'] if c['name'] == 'backend']
        if len(containers) != 1 or containers[0].get('exitCode') != 0:
            raise RuntimeError(f'Migration failed ({migration}); inspect CloudWatch logs. Service was not updated.')
        print('Migration completed successfully', flush=True)
    aws('ecs', 'update-service', '--cluster', args.cluster, '--service', args.service,
        '--task-definition', revision, '--desired-count', str(args.desired_count))
    aws('ecs', 'wait', 'services-stable', '--cluster', args.cluster, '--services', args.service)
    updated = service_state(args.cluster, args.service)
    if updated['taskDefinition'] != revision or updated['runningCount'] < args.desired_count:
        raise RuntimeError('New revision did not become healthy; ECS may have rolled back')
    print(f'Deployed {args.service}: {revision}', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['cluster', 'service', 'image', 'container']:
        parser.add_argument(f'--{name}', required=True)
    parser.add_argument('--template', default='', help='Optional task template ARN from Terraform output')
    parser.add_argument('--desired-count', type=int, default=2)
    arguments = parser.parse_args()
    if arguments.container not in ['backend', 'frontend'] or arguments.desired_count < 1:
        parser.error('Use backend/frontend and at least one replica')
    deploy(arguments)
