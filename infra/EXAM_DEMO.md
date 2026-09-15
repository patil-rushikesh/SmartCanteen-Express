# Exam demonstration script

Start with [DEPLOYMENT.md](DEPLOYMENT.md) for the live application, monitoring dashboard and successful workflow runs.

## Opening explanation (one minute)

“This is a two-repository React and Express application. GitHub Actions tests the code and builds Docker images. CloudFormation bootstraps Terraform's state and AWS authentication. Terraform provisions the application infrastructure. The ALB routes requests to ECS Fargate tasks. Nginx serves React, PM2 supervises Express, RDS stores orders, Redis shares carts, SSM stores encrypted credentials, and CloudWatch monitors the system. Ansible runs the backend release and health verification.”

The exam uses Mumbai, fake payments and an HTTP ALB address with demo data. Kubernetes is not used.

## Demonstration order and evidence

| Step | Show | What to explain |
|---|---|---|
| 1 | `AWS_SETUP.md`, IAM role trust policy | Your user assumes a temporary provisioning role with MFA; GitHub uses OIDC |
| 2 | CloudFormation stack → Resources/Outputs | CloudFormation owns the bootstrap bucket and OIDC role |
| 3 | Terraform files, `terraform plan`, S3 state object | Infrastructure as code, state and S3 locking |
| 4 | SSM → Parameter Store → `/smartcanteen/exam/` | SecureString encryption; show names/types, not decrypted values |
| 5 | GitHub PR checks | TypeScript, runtime tests, Docker smoke tests and infrastructure validation |
| 6 | GitHub main-branch release | ECR push, immutable digest, Ansible migration task, ECS rollout |
| 7 | ECR image and ECS task definition | The same image digest identifies the deployed release |
| 8 | ALB listener rules and target groups | `/api/*` routes to Express; other paths route to Nginx |
| 9 | Browser login and fake-payment order | Demonstrate the actual application and persistent data |
| 10 | PM2 list, restart and logs | Process supervision within the API task |
| 11 | Nginx config and local status | Static frontend hosting and connection counts |
| 12 | CloudWatch dashboard/logs/alarms | Infrastructure metrics and application evidence |
| 13 | Ansible verification and cleanup plan | Repeatable operations and responsible teardown |

Provision RDS and the first release before the exam starts; show the completed resources and workflow evidence. Do not depend on first-time provisioning finishing within a short presentation.

## Local checks

From `Backend/`:

```sh
pnpm build
node --test tests/*.test.mjs
python3 -m unittest discover -s infra/tests -p 'test_*.py'
terraform -chdir=infra/terraform validate
ansible-playbook -i localhost, infra/ansible/deploy.yml --syntax-check
```

For a local Docker demonstration:

```sh
docker compose up -d --build
docker compose exec app pm2 list
docker compose exec app pm2 logs smartcanteen-api --lines 20 --nostream
docker compose exec app pm2 restart smartcanteen-api
docker compose exec app pm2 list
docker compose exec frontend nginx -t
docker compose exec frontend wget -qO- http://127.0.0.1:8080/nginx_status
```

The local Compose configuration explicitly runs migrations and seeds demo data. AWS performs these as separate tasks.

## AWS PM2 and Nginx demonstration

Use the `smartcanteen` CLI profile and install the AWS Session Manager plugin. Get the running task IDs:

```sh
export AWS_PROFILE=smartcanteen
export AWS_REGION=ap-south-1
aws ecs list-tasks --cluster smartcanteen-exam --service-name smartcanteen-exam-backend
aws ecs list-tasks --cluster smartcanteen-exam --service-name smartcanteen-exam-frontend
```

Substitute the task ARN returned for each component:

```sh
aws ecs execute-command --cluster smartcanteen-exam --task BACKEND_TASK_ARN \
  --container backend --interactive --command 'pm2 list'
aws ecs execute-command --cluster smartcanteen-exam --task BACKEND_TASK_ARN \
  --container backend --interactive --command 'pm2 logs smartcanteen-api --lines 20 --nostream'
aws ecs execute-command --cluster smartcanteen-exam --task FRONTEND_TASK_ARN \
  --container frontend --interactive --command 'nginx -t'
aws ecs execute-command --cluster smartcanteen-exam --task FRONTEND_TASK_ARN \
  --container frontend --interactive --command 'wget -qO- http://127.0.0.1:8080/nginx_status'
```

`/nginx_status` is only accessible from loopback inside the container. The public ALB request to this path should return 403. Never show `env`, PM2 `jlist`, or decrypted SSM values on screen: those can reveal injected credentials.

To demonstrate restart safely, prefer the local Docker process above. PM2 supervises one API process per ECS task; ECS replaces unhealthy tasks and scales the number of containers.

## Monitoring

Open the `monitoring_dashboard_url` Terraform output. Show:

- Backend/frontend ECS CPU and memory.
- ALB request count, target errors and response time.
- RDS CPU and connections.
- Redis engine CPU.
- API request records and PM2 process messages.

CloudWatch log groups:

- `/ecs/smartcanteen-exam/backend`
- `/ecs/smartcanteen-exam/frontend`

```sh
aws logs tail /ecs/smartcanteen-exam/backend --since 10m
aws logs tail /ecs/smartcanteen-exam/frontend --since 10m
```

Generate a small, bounded amount of traffic for visible metrics:

```sh
export APP_URL=http://YOUR_ALB_DNS_NAME
for request in $(seq 1 30); do
  curl --fail --silent "$APP_URL/api/health" > /dev/null
  sleep 1
done
```

Allow several minutes for metrics to appear. Alarms cover high ECS CPU, unhealthy ALB targets and low database storage. They demonstrate alarm states; notification subscriptions are not configured. Avoid claiming email alerts are enabled.

## Ansible demonstration

```sh
export APP_URL=http://YOUR_ALB_DNS_NAME
export ALLOW_HTTP_DEMO=true
ansible-playbook -i localhost, infra/ansible/verify.yml
```

Explain the distinction: Terraform owns infrastructure state; Ansible orchestrates release operations. The backend GitHub job invokes `ansible/deploy.yml`, which waits for the migration's successful exit before updating the service.

## Useful viva answers

- **Why both CloudFormation and Terraform?** CloudFormation bootstraps the state bucket and GitHub identity. Terraform manages the application resources. Their ownership does not overlap.
- **Why PM2 and ECS?** PM2 supervises the Node process and provides process diagnostics; ECS schedules, replaces and scales containers.
- **Why ALB and Nginx?** ALB distributes requests across services; Nginx serves the built frontend and handles its local web-server behavior.
- **Why SSM?** Credentials stay outside Git, images and Terraform state. ECS injects SecureStrings at startup using IAM permissions.
- **What happens if migration fails?** The pipeline fails before replacing the running service.
- **What happens if the new task is unhealthy?** ECS's deployment circuit breaker can roll back; the release checks that the expected task revision actually became current.
- **What survives a container restart?** Orders persist in RDS, shared carts in Redis, and logs in CloudWatch.
- **Is this highly available?** The cost-conscious exam settings use one NAT, one database instance, one Redis node and one replica per service. The separate production example enables additional availability and HTTPS.
