# New repository setup

Use this runbook only when this harness is at the Git root and no `package.json` exists. Its purpose is to establish the minimum npm substrate required to generate and verify the harness. It does not choose or approve the product stack.

## Safety boundary

- Do not auto-advance `MIGRATION_PENDING`, replace `projectId: change-me`, or treat unresolved profiles as approved.
- Do not install React, Next.js, deployment providers, or other product dependencies during bootstrap.
- Do not create remotes, secrets, cloud resources, Codex trust, commits, or pushes.
- Do not overwrite an existing manifest, delete a lockfile, or bypass an install error.
- Edit canonical rule sources and regenerate; never edit generated `AGENTS.md` or Cursor rules directly.

## 1. Read-only preflight

Read `AGENTS.md`, this file, `README_HARNESS.md`, `SECURITY.md`, and `docs/workflow/FULL_LIFECYCLE.md`. At the Git root, inspect without changing files:

```bash
pwd
git rev-parse --show-toplevel
git status --short
node -p 'JSON.stringify({version:process.version,lts:process.release.lts})'
npm --version
npm config get registry
for f in package.json package-lock.json npm-shrinkwrap.json yarn.lock pnpm-lock.yaml bun.lock bun.lockb; do
  [ -e "$f" ] && echo "FOUND $f"
done
```

Stop and report if the directory is not the Git root, `package.json` already exists, any root lockfile exists without it, Node is not LTS, or required harness fragments are missing. Report only the registry URL and error code for registry failures; never print `.npmrc` or credentials.

## 2. Check, then create the minimum manifest

```bash
node scripts/harness/bootstrap-new-repository.mjs --check
# After reviewing the normalized package name:
node scripts/harness/bootstrap-new-repository.mjs --write
```

Use `--name <approved-name>` in both commands only when a name was explicitly selected. The script creates a private `0.0.0` manifest from the committed script and development-dependency fragments and merges missing ignore lines. It performs no network access and refuses to overwrite `package.json`.

## 3. Install only the harness substrate

```bash
npm install
npm ls --depth=0
```

Keep the resulting npm lockfile and do not mix package managers. Do not add `--force`, `--legacy-peer-deps`, `--ignore-engines`, or `npm audit fix --force`. This install authorizes no product framework or runtime choice.

## 4. Generate and verify

```bash
npm run harness:generate
npm run harness:install
npm run verify:harness
npm run harness:doctor
git config --get core.hooksPath
git diff --check
```

If Codex delegation will be used, `npm run codex:preflight` must pass first. An ineffective project config requires an interactive user trust decision; never write trust automatically or use a partial MCP command-line override.

## 5. Product stack and lifecycle remain pending

Review the product goals, technology decision, available profiles, and architecture baseline. Only after the user selects and approves the proposed product profiles should you set them and run:

```bash
npm run profile:resolve
```

Resolution is not approval. Keep `MIGRATION_PENDING` until the product baseline and profile resolution have been reviewed and explicit human approval has been recorded. Do not replace `projectId: change-me` without an approved project identifier. Advance to `ACTIVE` only through the documented project gate after those decisions.

Application dependencies and framework scaffolding belong in a separate approved foundation task after activation.

## 6. External services and Git

GitHub is optional during local bootstrap. Before relying on GitHub context, establish the intended HTTPS `origin` and GitHub CLI authentication, then run `npm run github:doctor`. Configure the production Environment only when release operations are in scope.

Before any initial commit or push, rerun `npm run verify:harness`, inspect `git status --short`, and ensure secrets, `.harness/`, logs, and `node_modules/` are excluded. Commit and push require their own explicit scope and approval.

## Completion report

Report the files created or changed, Node/npm versions, lockfile state, verification results, unresolved product/profile decisions, and any stopped checks. Never claim that bootstrap activated the project or approved its stack.
