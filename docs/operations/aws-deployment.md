# AWS deployment (human-operated)

Profile: `deployment/aws`

This profile records that production and preview may run on AWS. It does **not** create an AWS account, IAM user, bucket, or CloudFront distribution, and it does **not** deploy. `release-gate` still only records authorization. Actual AWS writes stay a separate human-approved operation.

Do not select `deployment/vercel` unless Vercel is also an intended target. Both may be selected only when dual-hosting is an explicit stack decision.

## What the profile requires

- `runtime/node` (expanded automatically)
- Human stack approval that names the AWS service topology in `docs/architecture/baseline.md`
- Human production approval before any production AWS write
- A recorded rollback target (previous good deployment ID or stack)

It does **not** require Next.js. If the product is Next.js App Router, also select `framework/nextjs-app-router`.

## Human-only setup (once per AWS account / project)

These steps are outside the repository. Agents must not perform them.

1. Create or choose an **AWS account**. Enable MFA on the root user. Prefer AWS IAM Identity Center (SSO) over long-lived access keys.
2. Create a **least-privilege IAM role or user** for this project. Do not use the root user for deploy.
3. Choose an **AWS Region** and record it in the architecture baseline.
4. Choose a **service topology** and record it (examples only; pick one and justify):
   - **Amplify Hosting** — closest to Vercel for Next.js (preview branches + production)
   - **S3 + CloudFront** — static export / static site
   - **App Runner** or **ECS/Fargate** — long-running Node/Next server
   - **Elastic Beanstalk** or **Lambda + API Gateway** — only with an explicit architecture reason
5. Create the AWS resources for preview and production **as a human** (Console, or locally after approval). Do not commit access keys, `.env`, or `~/.aws/credentials`.
6. If GitHub later runs a deploy job, store credentials as **GitHub Environment secrets** on `production`, preferably **OIDC to an IAM role** rather than `AWS_ACCESS_KEY_ID`. That workflow is not shipped by this harness.
7. Confirm `npm run github:production-environment-check` and that administrator bypass is disabled in the GitHub UI (same as Vercel).

## Workstation tools (human laptop)

| Tool | Required? | Purpose |
|---|---|---|
| AWS account + browser Console | Yes | Account, IAM, billing, emergency rollback |
| [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) | Recommended | Identity check and approved deploys from your machine |
| IAM Identity Center login (`aws sso login`) or `aws configure` | Yes if using CLI | Credentials stay on the workstation, never in git |
| Amplify CLI / SAM CLI / AWS CDK | Only if that topology was chosen | Human-run deploy after production approval |
| GitHub CLI (`gh`) | Already used by the harness | PR / checks evidence, not AWS deploy |

Install AWS CLI yourself. Do **not** add `aws-sdk`, CDK, or Amplify as harness `devDependencies`. Product AWS libraries, if any, wait for an approved foundation task after `ACTIVE`.

Useful read-only checks after CLI login (these do not deploy):

```bash
aws sts get-caller-identity
aws configure list
```

## Release flow (same lifecycle, AWS evidence)

Preview:

1. Push a feature branch and wait for required GitHub checks.
2. Human publishes or promotes the AWS preview (Amplify branch, preview stack, or equivalent).
3. Record the preview URL and evidence on the release gate (`preview.url`, `preview.evidence`).
4. Run smoke / E2E against that URL.

Production:

1. Merge to protected `main`.
2. Human approves production (`human:<name>`).
3. Human deploys from the approved commit (Console or CLI).
4. Record `deployment.deploymentId`, `environment`, `commitSha`, and `rollbackTarget` on the release gate.
5. Observe, then accept.

Rollback: restore the recorded previous-good AWS deployment (previous Amplify job, previous CloudFront / ECS / CloudFormation stack). Do not hotfix production in place.

## Agent boundary

Agents may draft architecture text, runbook steps, and release-gate fields. Agents must not:

- create AWS resources
- run `cdk deploy`, `sam deploy`, `aws cloudformation deploy`, `amplify publish`, or `amplify push`
- read or write AWS access keys
- claim a deployment that the human did not perform
