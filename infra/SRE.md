# SmartCanteen operations and production activation

These controls are code until Terraform is applied, the GitHub workflow is merged,
and the corresponding services are verified. The existing `exam` environment is
HTTP with simulated payments; it must not be represented as production.

## Operating hours

- Time zone: **Asia/Kolkata**, every day including weekends.
- RDS starts warming up at **05:30**. ECS starts at **06:00**, only once RDS is available.
- At **17:00**, the controller sets both ECS services to zero. It stops RDS only
  after running/pending service tasks and standalone migration tasks have drained.
- EventBridge invokes an idempotent Lambda every minute. This also corrects drift
  and retries a failed start/stop on the next invocation. Transitions are not
  instantaneous: AWS startup, health checks and draining add delay. Confirm actual
  startup duration in a live rehearsal before promising readiness precisely at 06:00.
- Application releases are admitted between **06:00 and 16:15**. The 45-minute buffer
  protects the 17:00 shutdown. CI still runs on all pull requests/main commits.
  The daily 06:15 GitHub run builds/tests/scans/deploys the latest `main`; intermediate
  overnight commits can be superseded. GitHub scheduled runs may be delayed.
- Redis, ALB, NAT gateways, storage, snapshots and monitoring continue incurring
  charges overnight. Stopping RDS preserves data; it does not remove storage charges.
- RDS can restart automatically after seven stopped days; the controller reconciles
  state each minute. This database is PostgreSQL; do not apply this controller to
  an unsupported RDS topology or a shared cluster without adapting its task checks.
- Overnight endpoints return ALB errors because all targets are stopped. Payment
  callbacks cannot be processed then. Before real payment launch, validate provider
  retry/reconciliation behavior and decide whether an always-on webhook receiver is
  needed. The schedule is not a 24/7 availability promise.

## Service objectives and alert response

Owner: repository maintainer until an operational rota is assigned. Confirm an SNS
subscription and send a test message before treating notifications as operational.

| Indicator | Initial objective over rolling 30 days | Implementation |
|---|---|---|
| Availability | 99.9% of expected one-minute probes during 06:00–17:00 IST | `/api/ready` (PostgreSQL + Redis) and `/healthz`; `Availability` metric per component |
| Latency | p95 ALB target response time below 1 second in at least 99% of business-hour five-minute windows with traffic | ALB metric, dashboard and alarm |
| Server errors | Fewer than 1% target 5xx responses | ALB error-rate alarm with a 20-request minimum to reduce noise |
| Monitoring coverage | No missing controller heartbeat for 10 minutes | Always-on `OperationsHeartbeat` alarm, missing data is breaching |

The 99.9% availability objective gives **19.8 minutes** of error budget in a 30-day
period with 660 expected service minutes/day. For each component, count successful
probe minutes divided by expected business-hour minutes; treat missing business-hour
samples as unknown/unavailable, never as success. Planned overnight hours are excluded.
A simple average of only reported samples can hide monitoring gaps: cross-check
heartbeat and expected samples. Probe checks do not establish business transaction
correctness; browser tests cover representative order flows in CI.

On an availability alarm, acknowledge and start investigation within 10 minutes.
Check the clock, heartbeat, Lambda logs, RDS state, ECS service events and ALB target
health. Failed probes in 3 of 5 minutes alert; missing probes overnight do not.
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
update the service during operating hours and verify both endpoints and an order
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
   and Lambda pass-role. The trust policy includes the `observability` environment.
   This is a prerequisite to Terraform apply; an old bootstrap role cannot create
   these resources. Keep GitHub environments restricted to `main`.
5. **AWS infrastructure workflow:** `DEPLOY_ENVIRONMENT` defaults to `exam` and
   `TF_STATE_KEY` to `smartcanteen/exam/terraform.tfstate`. Set `ECS_DESIRED_COUNT`
   consistently in both release environments and infrastructure (default 2).
   Run plan, review resource changes, then apply. Scheduling is enabled by this
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
nightly stop/morning start; rollback rehearsal; and a backup restore. Until these
checks pass and outstanding security findings are resolved/reviewed, this work is
production-readiness preparation, not a production-readiness certification.
