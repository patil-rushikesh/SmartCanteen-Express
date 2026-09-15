# AWS access setup for the exam

Confirmed setup: Mumbai (`ap-south-1`), AWS-provided ALB URL over HTTP, ECS Fargate, no Kubernetes. Use fake payments and demo data over HTTP. Nginx serves the frontend; PM2 runs the API; CloudWatch provides monitoring; SSM Parameter Store holds secrets.

## 1. Create your local provisioning identity

You currently use the root account. Use it for this one-time IAM setup, then sign out. Do not create root access keys or share credentials in chat.

### A. Create an IAM user

1. Open **IAM → Users → Create user**.
2. Name it `smartcanteen-student` and enable AWS Console access if you want to demonstrate role switching in the console.
3. Initially give the user no application permissions.
4. In the user's **Security credentials**, assign an **Authenticator app** MFA device and record its ARN. You can keep the existing passkey as an additional console sign-in method.

### B. Create the provisioning permissions policy

1. Open **IAM → Policies → Create policy → JSON**.
2. Paste [provisioner-policy.json](cloudformation/provisioner-policy.json).
3. Name the policy `SmartCanteenExamProvisioning`.

This is a powerful provisioning policy for a dedicated exam account. It covers the infrastructure services used here; IAM role mutations are limited to `smartcanteen-exam-*`, SSM access to `/smartcanteen/exam/*`, and bootstrap S3/CloudFormation resources to `smartcanteen-*`. Some AWS create/list operations require `Resource: "*"`. It is not intended as a general student policy in a shared production account.

### C. Create the role

1. Open **IAM → Roles → Create role → Custom trust policy**.
2. Paste [provisioner-trust-policy.example.json](cloudformation/provisioner-trust-policy.example.json).
3. The trust policy is filled for account `645024328844` and user `smartcanteen-student`.
4. Attach `SmartCanteenExamProvisioning`.
5. Name the role **`SmartCanteenProvisioner`**.

This role trusts your IAM user with MFA. It does not trust ChatGPT, an unknown AWS account, or every user on the internet.

### D. Allow the IAM user to assume the role

Under **IAM → Users → smartcanteen-student → Permissions → Add inline policy**, paste [student-assume-role-policy.json](cloudformation/student-assume-role-policy.json), or use the JSON below:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "sts:AssumeRole",
    "Resource": "arn:aws:iam::645024328844:role/SmartCanteenProvisioner"
  }]
}
```

### E. Configure the local AWS CLI

**Rotate the access key previously shared in chat before configuring credentials.** In IAM → Users → smartcanteen-student → Security credentials → Access keys, deactivate the exposed key. Create a replacement and enter it only at the local CLI prompt; delete the old key after verifying access.

A **U2F/passkey** device (`...:u2f/user/...`) cannot be used as `mfa_serial` for the STS role-assumption flow below. Add an **Authenticator app** MFA device, scan its QR code, and complete registration with two consecutive six-digit codes. Copy the resulting `arn:aws:iam::645024328844:mfa/...` ARN. Keep MFA required in the role's trust policy.

Install AWS CLI v2 and the Session Manager plugin (the plugin is needed for the ECS Exec demonstration). On this Mac, AWS CLI can be installed with `brew install awscli`.

Using the root console only for this initial setup, create an access key for the **IAM user**, not for root. Enter it directly into your terminal:

```sh
aws configure --profile smartcanteen-user
# Enter the IAM user's access key and secret locally.
# Default region: ap-south-1. Output: json.

aws configure set role_arn arn:aws:iam::645024328844:role/SmartCanteenProvisioner --profile smartcanteen
aws configure set source_profile smartcanteen-user --profile smartcanteen
aws configure set mfa_serial arn:aws:iam::645024328844:mfa/Redmi --profile smartcanteen
aws configure set region ap-south-1 --profile smartcanteen
aws sts get-caller-identity --profile smartcanteen
```

Enter the MFA code when prompted. The final ARN should contain `assumed-role/SmartCanteenProvisioner/`. AWS CLI caches temporary role credentials. Tell Codex when the `smartcanteen` profile works; do not send the access key, secret, MFA code, or session token.

If you later use IAM Identity Center, create a permission set with the provisioning policy and use `aws configure sso --profile smartcanteen` instead of maintaining an IAM user key.

## 2. Roles created by the implementation

| Role | Trusts | Permissions |
|---|---|---|
| `SmartCanteenProvisioner` | Your IAM user + MFA | Bootstrap and operate the exam infrastructure |
| `smartcanteen-exam-terraform` | Backend repo, GitHub environment `infrastructure` | Terraform infrastructure and state; reads only the database password parameter |
| `smartcanteen-exam-backend-deploy` | Backend repo, GitHub environment `exam` | Backend ECR pushes, task registration, migrations, service rollout |
| `smartcanteen-exam-frontend-deploy` | Frontend repo, GitHub environment `exam` | Frontend ECR pushes and service rollout |
| `smartcanteen-exam-backend-execution` | ECS tasks | Pull image, send logs, read application SSM parameters |
| `smartcanteen-exam-frontend-execution` | ECS tasks | Pull image and send logs |
| Task roles | ECS tasks | SSM Messages channels for the ECS Exec demonstration |

GitHub uses OIDC; do not add AWS access keys to GitHub secrets. An existing GitHub OIDC provider can be reused through the CloudFormation parameter.

## References

- [AWS: create a role for an IAM user](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-user.html)
- [AWS: root account best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html)
- [AWS: CLI with IAM Identity Center](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html)
- [GitHub: OIDC with AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)

- [AWS: passkey limitations for CLI/API MFA](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_fido_supported_configurations.html)

## Troubleshooting this account's role session

Verified on 2026-09-15: the `Redmi` authenticator allows the `smartcanteen` profile to assume `SmartCanteenProvisioner`. A role request without MFA is correctly denied. If a later login fails, check the following:

1. With your existing administrative console access, open IAM → Roles → `SmartCanteenProvisioner`. Create it if absent.
2. Its Permissions tab must include `SmartCanteenExamProvisioning`, created from `provisioner-policy.json`.
3. Its Trust relationships tab must match `provisioner-trust-policy.example.json`.
4. IAM → Users → `smartcanteen-student` → Permissions must include the inline policy in `student-assume-role-policy.json`.
5. Under that user's Security credentials, assign an **Authenticator app** MFA device. The existing passkey can remain registered.
6. Configure the authenticator ARN as `mfa_serial` in the `smartcanteen` CLI profile and run `aws sts get-caller-identity --profile smartcanteen` in your terminal. Enter the six-digit code locally.

Successful output contains `arn:aws:sts::645024328844:assumed-role/SmartCanteenProvisioner/`. The frontend GitHub repository's current canonical name is `patil-rushikesh/SmartCanteenFrontend`; Terraform's OIDC trust uses that name.
