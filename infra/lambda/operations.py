"""Reconcile the explicit power flag; never stop RDS while ECS tasks are still running."""
import json
import os
from datetime import datetime
from urllib.request import urlopen
from zoneinfo import ZoneInfo


def operating_state(flag):
    if flag not in ('true', 'false'):
        raise ValueError('APPLICATION_ENABLED must be true or false')
    return {'database': flag == 'true', 'application': flag == 'true'}


def reconcile(ecs, rds, cluster, services, database, replicas, flag):
    state = operating_state(flag)
    db = rds.describe_db_instances(DBInstanceIdentifier=database)['DBInstances'][0]
    status = db['DBInstanceStatus']
    result = ecs.describe_services(cluster=cluster, services=services)
    if result.get('failures') or len(result['services']) != len(services):
        raise RuntimeError('Not all configured ECS services were found')
    if state['database'] and status == 'stopped':
        rds.start_db_instance(DBInstanceIdentifier=database)
    # While starting, leave existing services alone; readiness removes unhealthy targets.
    if not state['application'] or status == 'available':
        desired = replicas if state['application'] else 0
        for service in result['services']:
            if service['desiredCount'] != desired:
                ecs.update_service(cluster=cluster, service=service['serviceName'], desiredCount=desired)
    if not state['database'] and status == 'available':
        # RUNNING desired status also includes pending/provisioning tasks. Check all
        # cluster tasks, including standalone migration jobs, before stopping RDS.
        tasks = ecs.list_tasks(cluster=cluster, desiredStatus='RUNNING', maxResults=1)
        if not tasks.get('taskArns') and all(s['runningCount'] == 0 and s['pendingCount'] == 0 for s in result['services']):
            rds.stop_db_instance(DBInstanceIdentifier=database)
    return state


def handler(event, context):
    import boto3
    now = datetime.now(ZoneInfo('Asia/Kolkata'))
    state = reconcile(boto3.client('ecs'), boto3.client('rds'), os.environ['CLUSTER'],
                      json.loads(os.environ['SERVICES']), os.environ['DATABASE'],
                      int(os.environ['REPLICAS']), os.environ['APPLICATION_ENABLED'])
    metrics = [{'MetricName': 'OperationsHeartbeat', 'Value': 1, 'Unit': 'Count'}]
    if state['application']:
        for component, path in [('backend', '/api/ready'), ('frontend', '/healthz')]:
            try:
                with urlopen(os.environ['APP_URL'] + path, timeout=5) as response:
                    available = int(response.status == 200)
            except Exception:
                available = 0
            metrics.append({'MetricName': 'Availability', 'Value': available, 'Unit': 'None',
                            'Dimensions': [{'Name': 'Component', 'Value': component}]})
    boto3.client('cloudwatch').put_metric_data(Namespace=os.environ['METRIC_NAMESPACE'], MetricData=metrics)
    print(json.dumps({'operatingState': state, 'time': now.isoformat()}))
    return state
