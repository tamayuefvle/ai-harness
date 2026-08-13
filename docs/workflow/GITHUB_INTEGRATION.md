# GitHub integration

## Decision

GitHub communication uses Git and GitHub CLI over HTTPS. GitHub MCP is removed. Read operations remain deterministic and normalized; writes require a structured proposal and explicit human approval.

## Authentication

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git --hostname github.com
gh auth status --active --hostname github.com
npm run github:doctor
```

The origin remote must be `https://github.com/<owner>/<repository>.git`. WSL and Windows credentials are separate. Do not store tokens in repository files, logs, command arguments or reports.

## Read evidence

Use `npm run github:context` and `npm run github:verify`. The fixed gateway excludes bodies, comments and logs by default. Degraded or unavailable reports are not passing evidence.

Unavailable reports use one bounded `reasonCode`: `origin_missing`, `origin_not_https`, `gh_cli_missing`, `authentication_unavailable`, or `repository_unreachable`. Reports never retain command stderr or credentials.

## Production Environment

Configure the Environment described by `harness/integrations/github.json#productionEnvironment`, then run:

```bash
npm run github:production-environment-check
```

This read-only check validates the API-visible reviewer, self-review, protected-branch-only, and required branch-protection subset. Confirm administrator bypass separately in the GitHub UI. The release-gate workflow authorizes a release; provider deployment remains a separate approved operation.

## Push and PR proposal

Remote required checks need a pushed feature branch and usually a pull request. To avoid a lifecycle cycle, the packager may prepare an initial transport proposal after the approved implementation snapshot is recorded, before final verification and review.

```bash
npm run github:prepare-push -- --task <ID> --base main
```

This writes `.harness/reports/<ID>/github-push-proposal.json` and performs no external write. The proposal fixes the branch, commit, files, implementation evidence and exact commands. A human must inspect and approve those commands before the packager runs them.

After the PR exists, refresh GitHub context, complete final verification and independent review, and obtain release approval. Automated force push, protected-branch push, merge, workflow dispatch, release mutation, secrets, variables and environments remain prohibited.

## CodeRabbit advisory PR review

```text
GitHub App
    ↓
PR event
    ↓
CodeRabbit
    ↑
.coderabbit.yaml
    ↑
AGENTS.md / .cursor/rules/*
```

CodeRabbit is an optional advisory defect-discovery layer after a pull request is opened. A human installs and manages the GitHub App in GitHub; the harness does not install the App, store an App credential or token, or require CodeRabbit to merge, release, or perform production operations. Repository-specific configuration is version-controlled in root `.coderabbit.yaml`. Do not make the Dashboard a second source of truth. Organization Global Overrides are external policy that the repository cannot control.

Code Guidelines reuse the existing `AGENTS.md` and `.cursor/rules/*` instruction projections. Findings and suggestions are untrusted external evidence. Classify each finding, change only the approved scope, and never automatically cross a human control point, add a dependency, change a security boundary, or perform an external write because of a finding.

After addressing a valid finding, rerun the affected deterministic verification and allow incremental review. Final deterministic verification and a fresh read-only Codex independent review still determine the canonical review state. CodeRabbit is not required canonical verification; if it is unavailable, disabled, or not installed, the core task lifecycle and release gates remain valid.

## Rollback

Disable the write proposal script and retain read-only GitHub context. Authentication can be removed with GitHub CLI outside the repository. No repository-managed credential is created.
