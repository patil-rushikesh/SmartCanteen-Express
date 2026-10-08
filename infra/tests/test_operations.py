import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock, patch, MagicMock

spec = importlib.util.spec_from_file_location('operations', Path(__file__).parents[1] / 'lambda/operations.py')
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)

class OperationsTests(unittest.TestCase):
    def test_explicit_flag_controls_both_resources(self):
        for flag in ['true', 'false']:
            self.assertEqual(ops.operating_state(flag), {'database': flag == 'true', 'application': flag == 'true'})
        for flag in [None, '', 'TRUE', 'on', True]:
            with self.subTest(flag=flag), self.assertRaises(ValueError):
                ops.operating_state(flag)

    def clients(self, status='available', running=0, pending=0, desired=0, tasks=None):
        ecs, rds = Mock(), Mock()
        rds.describe_db_instances.return_value = {'DBInstances': [{'DBInstanceStatus': status}]}
        ecs.describe_services.return_value = {'services': [{'serviceName': 'backend', 'desiredCount': desired, 'runningCount': running, 'pendingCount': pending}]}
        ecs.list_tasks.return_value = {'taskArns': tasks or []}
        return ecs, rds

    def run_at(self, flag, **kwargs):
        ecs, rds = self.clients(**kwargs)
        ops.reconcile(ecs, rds, 'cluster', ['backend'], 'database', 2, flag)
        return ecs, rds

    def test_on_starts_database_before_application(self):
        ecs, rds = self.run_at('true', status='stopped')
        rds.start_db_instance.assert_called_once()
        ecs.update_service.assert_not_called()

    def test_does_not_start_application_until_database_available(self):
        ecs, _ = self.run_at('true', status='starting')
        ecs.update_service.assert_not_called()
        ecs, _ = self.run_at('true')
        ecs.update_service.assert_called_once_with(cluster='cluster', service='backend', desiredCount=2)

    def test_shutdown_drains_services_before_stopping_database(self):
        ecs, rds = self.run_at('false', desired=2, running=2)
        ecs.update_service.assert_called_once_with(cluster='cluster', service='backend', desiredCount=0)
        rds.stop_db_instance.assert_not_called()
        _, rds = self.run_at('false')
        rds.stop_db_instance.assert_called_once()

    def test_migration_or_pending_task_prevents_database_shutdown(self):
        for kwargs in [{'tasks': ['migration']}, {'pending': 1}, {'status': 'stopping'}]:
            _, rds = self.run_at('false', **kwargs)
            rds.stop_db_instance.assert_not_called()

    def test_already_correct_capacity_is_not_modified(self):
        ecs, rds = self.run_at('true', desired=2, running=2)
        ecs.update_service.assert_not_called()
        rds.start_db_instance.assert_not_called()

    def test_missing_service_fails_closed(self):
        ecs, rds = self.clients()
        ecs.describe_services.return_value = {'failures': [{'arn': 'missing'}], 'services': []}
        with self.assertRaises(RuntimeError):
            ops.reconcile(ecs, rds, 'cluster', ['backend'], 'database', 2, 'false')
        rds.stop_db_instance.assert_not_called()

class HandlerTests(unittest.TestCase):
    def test_probe_success_failure_and_off_silence(self):
        for opened, response_error in [(True, False), (True, True), (False, False)]:
            with self.subTest(opened=opened, response_error=response_error):
                aws = Mock()
                response = MagicMock()
                response.__enter__.return_value.status = 200
                config = {'CLUSTER':'cluster','SERVICES':'["backend"]','DATABASE':'db',
                          'REPLICAS':'2','APPLICATION_ENABLED':str(opened).lower(),'APP_URL':'https://canteen.example.com','METRIC_NAMESPACE':'SmartCanteen/test'}
                with patch.dict('sys.modules', {'boto3':aws}), patch.dict('os.environ',config), \
                     patch.object(ops, 'reconcile', return_value={'application':opened,'database':opened}), \
                     patch.object(ops, 'urlopen', side_effect=OSError('unavailable') if response_error else None, return_value=response) as probe:
                    ops.handler({}, None)
                data = aws.client.return_value.put_metric_data.call_args.kwargs['MetricData']
                self.assertEqual(data[0]['MetricName'], 'OperationsHeartbeat')
                self.assertEqual(len(data), 3 if opened else 1)
                self.assertEqual(probe.call_count, 2 if opened else 0)
                if opened:
                    self.assertEqual(data[1]['Value'], 0 if response_error else 1)

if __name__ == '__main__':
    unittest.main()
