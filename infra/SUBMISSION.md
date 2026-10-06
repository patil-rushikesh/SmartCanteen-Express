# Smart Canteen DevOps submission

Submission deadline: **10 October 2026**. Present this page with the [live deployment evidence](DEPLOYMENT.md) and [demonstration script](EXAM_DEMO.md).

## Rubric evidence

| Criterion | Evidence to show |
|---|---|
| Pipeline design (3 marks) | The [backend workflow](../.github/workflows/release.yml), [frontend workflow](https://github.com/patil-rushikesh/SmartCanteenFrontend/blob/main/.github/workflows/release.yml), [Terraform infrastructure](terraform), and [Ansible playbooks](ansible) cover source, build, tests, Docker images, deployment, and monitoring. Explain why ECS Fargate was selected instead of Kubernetes for this exam deployment. |
| Working implementation (5 marks) | Show successful GitHub Actions checks and deployment runs, ECR image digests, ECS service revisions, a new fake-payment order, the [CloudWatch dashboard](https://ap-south-1.console.aws.amazon.com/cloudwatch/home?region=ap-south-1#dashboards/dashboard/smartcanteen-exam), and the health checks below. The frontend check runs three Chromium browser tests against the backend Docker stack. |
| Timely submission (2 marks) | Upload the repository links, this evidence page, workflow screenshots, a short demo recording, and the submission receipt before the deadline. Save the receipt or timestamp in the course portal. |

## Links for the evaluator

- [Frontend application](http://smartcanteen-exam-951861607.ap-south-1.elb.amazonaws.com/login)
- [Backend readiness](http://smartcanteen-exam-951861607.ap-south-1.elb.amazonaws.com/api/ready)
- [Backend CI and deployment run](https://github.com/patil-rushikesh/SmartCanteen-Express/actions/runs/34992238867)
- [Frontend CI and deployment run](https://github.com/patil-rushikesh/SmartCanteenFrontend/actions/runs/34992913343)
- [Frontend browser-test CI run](https://github.com/patil-rushikesh/SmartCanteenFrontend/actions/runs/37496579680)
- [October frontend CI and deployment run](https://github.com/patil-rushikesh/SmartCanteenFrontend/actions/runs/37497012991)
- [Infrastructure validation run](https://github.com/patil-rushikesh/SmartCanteen-Express/actions/runs/34991023507)
- [Terraform plan and apply evidence](DEPLOYMENT.md#github-evidence)

The backend deployment run is from September 2026; the frontend was redeployed on 6 October 2026 after the browser tests passed. Check the current status of the live services immediately before the presentation. The demo uses HTTP and simulated payments; do not describe it as a production payment deployment.

## Demonstration in 5 minutes

1. Show both repository workflows. Point to the build, backend tests, frontend browser tests, Docker smoke checks, and deployment gates.
2. Open the live frontend and API readiness link. Show one customer login and place a fake-payment order.
3. Show the successful main-branch releases, ECR images, ECS services, and Terraform-managed infrastructure.
4. Open CloudWatch metrics, logs, and alarm states. Explain what each alarm watches. Notifications are not configured.
5. Show the Ansible migration and verification steps, then the submission receipt in the course portal.

Use [EXAM_DEMO.md](EXAM_DEMO.md) for the full 13-step demonstration and viva answers.

## Final checks on presentation day

```sh
curl --fail http://smartcanteen-exam-951861607.ap-south-1.elb.amazonaws.com/healthz
curl --fail http://smartcanteen-exam-951861607.ap-south-1.elb.amazonaws.com/api/ready
```

Record a short screen capture of a successful workflow, live order, and monitoring dashboard. Capture the course portal's submission receipt before **10 October 2026**.
