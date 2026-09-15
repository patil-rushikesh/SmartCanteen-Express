# Exam deployment evidence

Deployment date: **15 September 2026**. AWS account: `645024328844`. Region: **Mumbai (`ap-south-1`)**.

## Open for the exam

- [Live application](http://smartcanteen-exam-951861607.ap-south-1.elb.amazonaws.com/login)
- [API readiness](http://smartcanteen-exam-951861607.ap-south-1.elb.amazonaws.com/api/ready)
- [CloudWatch dashboard](https://ap-south-1.console.aws.amazon.com/cloudwatch/home?region=ap-south-1#dashboards/dashboard/smartcanteen-exam)
- [Presentation sequence and viva answers](EXAM_DEMO.md)

This is an HTTP exam environment with simulated payments. Real money is never charged in fake mode. Cloudinary values are placeholders, so real image uploads are not configured. Kubernetes is excluded.

## Seeded demo logins

| Role | Email | Demo password |
|---|---|---|
| Owner | `owner@smartcanteen.com` | `SuperAdmin@123` |
| Canteen manager | `manager.alpha@smartcanteen.com` | `Manager@123` |
| Student | `student.alpha@smartcanteen.com` | `Customer@123` |

These are public demo credentials, unsuitable for real users. Create a fresh order during the exam because QR codes expire.

## What was deployed

| Component | Evidence |
|---|---|
| CloudFormation | Stack `smartcanteen-bootstrap`; state bucket, GitHub OIDC provider and Terraform role |
| Terraform | 63 application resources; encrypted S3 state and S3 lock file |
| Network | VPC, two AZs, public ALB, private tasks, isolated database subnets, one NAT gateway |
| ECS | Cluster `smartcanteen-exam`; one desired task each for backend and frontend |
| Docker/ECR | Immutable release tags and image digests; GitHub builds and publishes both images |
| ALB | `/api` and `/api/*` to Express; other paths to Nginx |
| RDS | Private encrypted PostgreSQL 16.13; migration and application TLS verification succeeded |
| Redis | ElastiCache with encryption at rest and in transit; cart write/read verified |
| SSM | Ten SecureString parameters under `/smartcanteen/exam/`; values excluded from Git and Terraform state |
| PM2 | `smartcanteen-api` verified online through ECS Exec |
| Nginx | Configuration test passed; loopback connection statistics work; public `/nginx_status` returns 403 |
| Monitoring | CloudWatch logs, five alarms, dashboard, Container Insights; ECS CPU datapoints received |
| Ansible | Backend migration gate and rollout; both public health checks passed |

The exam settings have one database, Redis node, NAT gateway and task per service. Alarm notifications are not configured. See [README.md](README.md) for rotation, production settings and teardown.

## GitHub evidence

- [Infrastructure validation](https://github.com/patil-rushikesh/SmartCanteen-Express/actions/runs/34991023507)
- [Terraform plan through GitHub OIDC — no changes](https://github.com/patil-rushikesh/SmartCanteen-Express/actions/runs/34991711493)
- [Terraform apply through GitHub OIDC — no changes](https://github.com/patil-rushikesh/SmartCanteen-Express/actions/runs/34993321154)
- [Backend CI, image publishing, migration and deployment](https://github.com/patil-rushikesh/SmartCanteen-Express/actions/runs/34992238867)
- [Frontend CI and final deployment](https://github.com/patil-rushikesh/SmartCanteenFrontend/actions/runs/34992913343)

Both repositories deploy main through their `exam` GitHub environment. Infrastructure uses the backend repository's `infrastructure` environment. These environments allow only `main`; GitHub authenticates with OIDC, with no AWS access keys stored in GitHub.

## Verified application behavior

- TypeScript builds, five Node tests and five deployment-ordering tests passed.
- Both production Docker images passed GitHub smoke tests.
- Demo accounts were seeded by a separate successful ECS task.
- Ansible verified `/healthz` and `/api/ready` through the ALB.
- The API smoke test completed order `b1efb0ac-de8d-4b85-bb62-06ebd3303b63`: login → cart → order → fake payment → QR confirmation → preparing → ready → completed.
- Chromium verified student login and fake checkout, including the success toast and QR-ready state, with no uncaught JavaScript errors.
- The final login page displayed live API health correctly in Chromium.

Repeat the business-flow check from `Backend/`:

```sh
python3 infra/scripts/smoke_exam.py \
  http://smartcanteen-exam-951861607.ap-south-1.elb.amazonaws.com \
  --create-demo-order
```

This creates one new simulated order. It prints no session tokens or SSM values.

## Migration failure gate demonstration

[The first backend release](https://github.com/patil-rushikesh/SmartCanteen-Express/actions/runs/34991712715) failed because Prisma's native migration engine could not validate the RDS CA chain. The service remained unchanged. Installing each RDS root in the container's system trust store fixed the connection while preserving strict certificate verification. The subsequent migration and rollout succeeded. This provides a real example of the migration gate for the exam.

The implementation follows [AWS's RDS trust-store guidance](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html). The local ECS Exec demonstration uses the [AWS Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/install-plugin-macos-overview.html).

## After the demonstration

AWS resources remain running and incur charges. Review and follow the teardown section in [README.md](README.md) after the exam. Retained state, snapshots and SSM parameters require separate intentional cleanup. Rotate the IAM access key previously shared in chat; GitHub releases use OIDC and do not depend on that key.
