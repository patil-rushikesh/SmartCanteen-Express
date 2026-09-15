#!/usr/bin/env python3
"""Explicitly seed demo accounts in the exam ECS backend database."""
import argparse
import json
from ecs_release import aws, service_state

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--cluster', default='smartcanteen-exam')
parser.add_argument('--service', default='smartcanteen-exam-backend')
args = parser.parse_args()
if args.cluster != 'smartcanteen-exam' or args.service != 'smartcanteen-exam-backend':
    parser.error('This demo seeder is restricted to the exam deployment')
service = service_state(args.cluster, args.service)
result = aws('ecs', 'run-task', '--cluster', args.cluster, '--task-definition', service['taskDefinition'], '--launch-type', 'FARGATE', '--platform-version', '1.4.0', '--network-configuration', json.dumps(service['networkConfiguration']), '--overrides', json.dumps({'containerOverrides': [{'name': 'backend', 'command': ['seed'], 'environment': [{'name': 'SEED_DEMO_DATA', 'value': 'true'}]}]}))
if result.get('failures') or not result.get('tasks'):
    raise SystemExit('Seed task failed to start')
task = result['tasks'][0]['taskArn']
aws('ecs', 'wait', 'tasks-stopped', '--cluster', args.cluster, '--tasks', task)
stopped = aws('ecs', 'describe-tasks', '--cluster', args.cluster, '--tasks', task)['tasks'][0]
if not any(c['name'] == 'backend' and c.get('exitCode') == 0 for c in stopped['containers']):
    raise SystemExit('Seed failed; inspect the task CloudWatch logs')
print('Exam accounts seeded successfully.')
