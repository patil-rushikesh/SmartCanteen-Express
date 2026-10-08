import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release', Path(__file__).parents[1] / 'scripts/ecs_release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
IMAGE = '123456789012.dkr.ecr.ap-south-1.amazonaws.com/backend@sha256:' + 'a' * 64
TASK = {'taskDefinitionArn': 'old', 'revision': 1, 'family': 'backend', 'containerDefinitions': [{'name': 'backend', 'image': 'old', 'secrets': [{'name': 'DB_PASSWORD', 'valueFrom': 'secret-arn'}]}]}


class ReleaseTests(unittest.TestCase):
    def test_render_preserves_secrets_and_source(self):
        result = release.render_task(TASK, 'backend', IMAGE)
        self.assertNotIn('taskDefinitionArn', result)
        self.assertEqual(result['containerDefinitions'][0]['image'], IMAGE)
        self.assertEqual(result['containerDefinitions'][0]['secrets'], TASK['containerDefinitions'][0]['secrets'])
        self.assertEqual(TASK['containerDefinitions'][0]['image'], 'old')

    def test_rejects_mutable_image_and_wrong_container(self):
        with self.assertRaises(ValueError):
            release.render_task(TASK, 'backend', 'repo:latest')
        with self.assertRaises(ValueError):
            release.render_task(TASK, 'frontend', IMAGE)

    def run_deployment(self, migration_exit=0, rolled_back=False, power_off_after_migration=False):
        calls = []
        service_reads = 0
        power_reads = 0

        def aws(*args):
            nonlocal service_reads, power_reads
            calls.append(args)
            if args[1] == 'get-function-configuration':
                power_reads += 1
                return {'Environment': {'Variables': {'APPLICATION_ENABLED': 'false' if power_off_after_migration and power_reads > 1 else 'true'}}, 'LastUpdateStatus': 'Successful'}
            if args[1] == 'describe-services':
                service_reads += 1
                return {'services': [{'taskDefinition': 'old' if service_reads == 1 or rolled_back else 'new', 'runningCount': 2, 'networkConfiguration': {'awsvpcConfiguration': {'subnets': ['private'], 'securityGroups': ['api'], 'assignPublicIp': 'DISABLED'}}}]}
            if args[1] == 'describe-task-definition': return {'taskDefinition': TASK}
            if args[1] == 'register-task-definition': return {'taskDefinition': {'taskDefinitionArn': 'new'}}
            if args[1] == 'run-task': return {'tasks': [{'taskArn': 'migration'}]}
            if args[1] == 'describe-tasks': return {'tasks': [{'containers': [{'name': 'backend', 'exitCode': migration_exit}]}]}
            return {}

        args = SimpleNamespace(cluster='cluster', service='backend', template='', container='backend', image=IMAGE, desired_count=2)
        with patch.object(release, 'aws', side_effect=aws):
            if migration_exit or rolled_back or power_off_after_migration:
                with self.assertRaises(RuntimeError): release.deploy(args)
            else:
                release.deploy(args)
        return calls

    def test_failed_migration_never_updates_service(self):
        calls = self.run_deployment(migration_exit=1)
        self.assertFalse(any(c[1] == 'update-service' for c in calls))

    def test_migration_finishes_before_service_update(self):
        calls = self.run_deployment()
        actions = [c[1] for c in calls]
        self.assertLess(actions.index('describe-tasks'), actions.index('update-service'))
        self.assertNotIn('--desired-count', next(c for c in calls if c[1] == 'update-service'))

    def test_off_during_migration_prevents_rollout(self):
        calls = self.run_deployment(power_off_after_migration=True)
        self.assertFalse(any(c[1] == 'update-service' for c in calls))

    def test_missing_flag_denies_release(self):
        with patch.object(release, 'aws', return_value={}):
            with self.assertRaises(RuntimeError):
                release.require_power('cluster')

    def test_automatic_rollback_is_a_failed_release(self):
        self.run_deployment(rolled_back=True)


if __name__ == '__main__': unittest.main()
