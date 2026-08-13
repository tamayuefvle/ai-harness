# ADR-0010: AWS deployment profile

- Status: Accepted
- Date: 2026-08-13
- Improvement: IMP-20260813-03

## Context

The registry shipped `deployment/vercel` only. Teams that host on AWS had no selectable deployment profile, so stack documents either omitted deployment or invented an unregistered id (which `stack:check` rejects).

The harness never executes provider deployment. Vercel and AWS are both evidence targets, not auto-deploy integrations.

## Decision

Add `deployment/aws`. It requires `runtime/node`, records preview/production capabilities, and keeps production, secrets, IAM, and rollback as human controls. It does not select Amplify vs S3/CloudFront vs ECS; that topology belongs in `docs/architecture/baseline.md`. It does not add AWS SDK/CLI dependencies to the harness substrate.

`deployment/aws` does not conflict with `deployment/vercel`. Dual-hosting needs an explicit stack decision.

## Rejected alternatives

- Require `framework/nextjs-app-router` like Vercel: AWS can host static or non-Next Node apps.
- Ship a GitHub Action that deploys to AWS: would grant production write from CI without a separate human deploy step.
- Encode one AWS service in the profile id (`deployment/aws-amplify`): too early; topology is a product architecture choice.

## Rollback

Remove `deployment/aws` from the registry and overlay docs. Existing projects that selected it must change `proposedProfiles` / `activeProfiles` before `profile:resolve`.
