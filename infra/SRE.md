# SmartCanteen operations and production activation

These controls are code until Terraform is applied, the GitHub workflow is merged,
and the corresponding services are verified. The existing `exam` environment is
HTTP with simulated payments; it must not be represented as production.

## Application power

The shared `APPLICATION_ENABLED` flag on the operations Lambda controls both ECS
services and RDS. No time zone, daily cron or business-hour override controls power.
In the backend repository, open **Actions → Application power → Run workflow** on
`main`. Check `enabled` to turn ON; leave it unchecked to turn OFF.

- **ON (`true`):** start RDS, wait for `available`, then restore application replicas.
- **OFF (`false`):** scale both ECS services to zero, then stop RDS only after all
  service and standalone migration tasks have drained. Data is preserved.
- The initial flag is OFF. Terraform preserves the live flag on later applies;
  the power workflow serializes with infrastructure applies and uses a Lambda
  revision check to avoid overwriting concurrent configuration changes.
- EventBridge still invokes the controller every minute to reconcile the flag and
  retry transitions. This is polling, not a timed startup/shutdown schedule.
  Missing or invalid flags fail without changing resources and stop the heartbeat.
- **Operations status** shows the flag, ECS counts, database state and heartbeat.
  A successful power workflow confirms the requested flag, not completed startup
  or shutdown. Allow several minutes for RDS and service transitions.
- CI and Sonar run on every commit. Releases read the same flag and skip deployment
  when OFF or when the flag is changing. They recheck before rollout; capacity is
  owned only by the controller, so a release cannot scale services back up after OFF.
  A power change during a release may cause that release to fail; inspect it before
  rerunning. After ON and healthy services, manually run **CI and ECS release** in
  both repositories to deploy the latest main commits accumulated while OFF.
- The separate `ENABLE_AWS_DEPLOYMENT` repository variable remains the release
  kill switch; it does not control application power.
- Redis, ALB, NAT gateways, storage, snapshots and monitoring still incur charges
  while OFF. RDS may automatically restart after seven stopped days; the controller
  returns it to OFF once AWS permits stopping it again.
- The controller uses shared Lambda capacity by default. Its 45-second timeout is
  shorter than its one-minute polling interval; the heartbeat detects failures.
- OFF endpoints return ALB errors and cannot process payment callbacks. Confirm
  provider retries/reconciliation before real payment launch. This is not 24/7 service.

## Service objectives and alert response

Owner: repository maintainer until an operational rota is assigned. Confirm an SNS
subscription and send a test message before treating notifications as operational.

| Indicator | Initial objective over rolling 30 days | Implementation |
|---|---|---|
| Availability | 99.9% of expected one-minute probes while the power flag is ON | `/api/ready` (PostgreSQL + Redis) and `/healthz`; `Availability` metric per component |
| Latency | p95 ALB target response time below 1 second in at least 99% of enabled five-minute windows with traffic | ALB metric, dashboard and alarm |
| Server errors | Fewer than 1% target 5xx responses | ALB error-rate alarm with a 20-request minimum to reduce noise |
| Monitoring coverage | No missing controller heartbeat for 10 minutes | Always-on `OperationsHeartbeat` alarm, missing data is breaching |

The availability error budget is 0.1% of expected enabled minutes in each rolling
30-day period. Record power changes from workflow history and count successful
probe minutes against all expected ON minutes, including startup. Missing ON
samples are unknown/unavailable, never success. Explicit OFF periods are excluded.
A simple average of only reported samples can hide monitoring gaps: cross-check
heartbeat and expected samples. Probe checks do not establish business transaction
correctness; browser tests cover representative order flows in CI.

On an availability alarm, acknowledge and start investigation within 10 minutes.
Check the power flag, heartbeat, Lambda logs, RDS state, ECS service events and ALB target
health. Failed probes in 3 of 5 minutes alert; missing probes while OFF do not.
CPU >80%, low database storage (<5 GiB), unhealthy targets, p95 latency and error
rate send SNS ALARM/recovery notifications. CloudWatch is the alert authority;
Grafana visualizes the same metrics rather than duplicating paging rules.

If the availability error budget is exhausted, pause feature releases using
`ENABLE_AWS_DEPLOYMENT=false` and prioritize reliability fixes. Record impact,
timeline, resolution, owner and follow-up work in an incident issue; review within
2 business days. Assign a backup responder before operating with real customers.

## Release and rollback

Main-branch commits deploy only after TypeScript build, tests, container smoke checks
and the SonarQube quality gate pass. Backend includes migration/rollback tests;
frontend includes Chromium order flows against backend containers and unit coverage.
Missing `SONAR_TOKEN` blocks trusted CI. Fork PRs never receive the token and must
be analyzed by a trusted main-branch run before deployment. Scan scopes include
infrastructure and code; low coverage and existing findings remain visible.

Use backwards-compatible expand/contract database migrations. ECS automatically
rolls back unhealthy revisions, and release checks reject a rollback as failure.
To roll back code, select the previous successful immutable ECS task definition,
update the service while the power flag is ON and verify both endpoints and an order
flow. Database changes are NOT automatically rolled back. Stop releases if a
migration fails; diagnose its CloudWatch log before rerunning. The operations
controller waits for migration tasks before stopping the database.

## Backup and disaster recovery

RDS retains seven days of automated backups; Redis retains seven snapshots. Start
with recovery objectives **RPO <=24 hours, RTO <=2 hours**, subject to a measured
restore rehearsal. These are targets, not verified guarantees. Monthly: restore
RDS to a NEW private instance, point an isolated application at it, check schema,
row counts and order/payment consistency, record recovery duration and recovery
point, then remove only rehearsal resources. Never overwrite the live database.
Before launch, demonstrate point-in-time recovery and confirm the objectives with
actual backup timestamps. Redis carts are ephemeral; paid orders live in PostgreSQL.

## Setup and credentials

Never paste tokens into chat or source. Rotate the AWS key previously shared in chat.
Use AWS SSO/a local `smartcanteen` profile; GitHub uses short-lived OIDC credentials.

1. **SonarQube Cloud:** organization `patil-rushikesh`; projects
   `patil-rushikesh_SmartCanteen-Express` and `patil-rushikesh_SmartCanteenFrontend`.
   Add `SONAR_TOKEN` as a repository secret in each repository. Select CI analysis,
   disable Automatic Analysis to prevent conflicting scans, and retain the quality
   gate rather than suppressing findings. The current personal CI token expires
   7 November 2026: rotate before then. Consider scoped organization tokens when
   available for your plan. GitHub Actions must finish a successful scan before
   reporting integration as verified.
2. **Grafana Cloud:** create a stack. Add a CloudWatch data source using **Grafana
   Assume Role** and copy Grafana's displayed AWS account ID and external ID. Put
   these in backend `infrastructure` environment variables `GRAFANA_AWS_ACCOUNT_ID`
   and `GRAFANA_EXTERNAL_ID`. Terraform creates a read-only CloudWatch role with
   external-ID trust. The Terraform-managed data source is named `SmartCanteen
   CloudWatch`; an initial UI data source used to retrieve trust instructions can
   be removed after provisioning to avoid duplicates.
3. **Alerts:** set `ALERT_EMAIL` in backend `infrastructure`; apply and confirm the
   SNS subscription link. Topic creation alone does not verify delivery.
4. **Bootstrap:** update the existing CloudFormation bootstrap stack using the
   reviewed `infra/cloudformation/bootstrap.json` and its existing parameter values.
   New permissions cover the scoped operations Lambda, EventBridge rule, SNS topic
   Lambda pass-role and a tagged customer-managed KMS key for encrypted alerts. The trust policy includes the `observability` environment.
   This is a prerequisite to Terraform apply; an old bootstrap role cannot create
   these resources. Keep GitHub environments restricted to `main`.
5. **AWS infrastructure workflow:** `DEPLOY_ENVIRONMENT` defaults to `exam` and
   `TF_STATE_KEY` to `smartcanteen/exam/terraform.tfstate`. Set `ECS_DESIRED_COUNT`
   consistently in both release environments and infrastructure (default 2).
   Run plan, review resource changes, then apply. The flag controller is enabled by this
   workflow. Do not apply stale state or delete existing infrastructure.
6. **Grafana provisioning:** create backend GitHub environment `observability`,
   restrict it to `main`, store `GRAFANA_AUTH` as an environment secret. Set variables:
   `GRAFANA_URL` (https://your-stack.grafana.net), `AWS_REGION`,
   `AWS_TERRAFORM_ROLE_ARN`, `TF_STATE_BUCKET`, `GRAFANA_STATE_KEY` (separate from AWS
   state), `GRAFANA_CLOUDWATCH_ROLE_ARN`, `ECS_CLUSTER`, `DATABASE_IDENTIFIER`, and
   `ALB_ARN_SUFFIX`. Obtain resource values from Terraform outputs `grafana_role_arn`
   and `grafana_settings`. Run **Grafana provisioning**, first plan then apply.
   The service-account token needs folder/dashboard/data-source provisioning rights.
7. **Real production:** use a separate bootstrap/state/GitHub environment. Set
   `DEPLOY_ENVIRONMENT=production`, `TF_STATE_KEY=smartcanteen/production/terraform.tfstate`,
   `ENABLE_HTTPS=true`, `APP_DOMAIN`, `ACM_CERTIFICATE_ARN`, optional `ROUTE53_ZONE_ID`,
   `HIGH_AVAILABILITY=true`, `DATABASE_MULTI_AZ=true`, `DELETION_PROTECTION=true`,
   `PAYMENT_MODE=razorpay`, `RAZORPAY_PUBLIC_KEY`, `ALERT_EMAIL`, and
   `ECS_DESIRED_COUNT=2`. Populate production SSM parameters with distinct random
   JWT secrets >=32 characters, live payment/webhook credentials and storage keys.
   Request/validate the ACM certificate in ap-south-1; configure DNS after ALB creation.
   Set repository `DEPLOY_ENVIRONMENT=production` in BOTH repositories only when ready;
   create their production GitHub environments with resource variables from the new
   Terraform outputs and `ALLOW_HTTP_DEMO=false`. Leave `ENABLE_AWS_DEPLOYMENT=false`
   until first rollout verification is complete, then enable it.

Require `check` (and backend infrastructure `validate`) before merging to main.
Protection must be configured on GitHub, not merely mentioned in YAML. Retain the
release gate even if a PR is merged by an administrator. A green infrastructure
schema check does not verify IAM permissions or deployment behavior in AWS.

## Go-live evidence

Record passing CI/Sonar scans; HTTPS and certificate checks; successful live order,
payment webhook and refund flow; confirmed alert delivery; Grafana populated data;
flag-driven stop/start; rollback rehearsal; and a backup restore. Until these
checks pass and outstanding security findings are resolved/reviewed, this work is
production-readiness preparation, not a production-readiness certification.

## IAM review notes

The metrics read APIs used by Grafana, CloudWatch Logs query-result APIs and
namespace-scoped `PutMetricData` include wildcard resources where required by AWS's
classic metrics/query authorization model. Grafana cannot mutate metrics or services;
log-start permissions are restricted to the application's log groups, and its trust
requires the stack's external ID. The operations role can update only this cluster's
services/database and publish only its metric namespace. KMS `Resource: "*"` in a
key policy denotes the key to which the policy is attached; alarm use is limited by
source account and application alarm ARN. Bootstrap CreateKey is limited by request
tags, with later management limited by resource tags. Review these distinctions in
Sonar findings; do not remove required runtime permissions or conceal the findings
solely to obtain a green gate.

References: [CloudWatch IAM actions](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cloudwatch.html),
[namespace restrictions](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/iam-cw-condition-keys-namespace.html),
[encrypted CloudWatch notifications](https://repost.aws/knowledge-center/cloudwatch-configure-alarm-sns).
