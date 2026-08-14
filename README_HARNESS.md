# AI Development Harness v15.0.0

## Purpose

v15 reorganizes the harness around clear responsibility boundaries without removing the accumulated safety, verification, fallback, review, GitHub, React Doctor, release, or incident controls.

```text
Planning       Why / What
   ↓ human planning approval
Design         How / exactly what to build
   ↓ human design approval
Development    Implement → verify → independent review
   ↓ human release approval
Release / Ops  Existing preview / production / monitoring / incident flow
```

The key separation is documented in `docs/workflow/PHASE_MODEL.md`:

- **Phase** = what kind of work is happening;
- **Gate** = what is approved or verified;
- **Artifact** = the canonical evidence/design;
- **Agent** = which role and permissions are allowed.

## Start a new product

The distribution ships in `MIGRATION_PENDING`.

```bash
npm ci
npm run project:plan -- --tier full --id my-product
```

Then follow:

1. `docs/workflow/PLANNING.md`
2. `docs/workflow/DESIGN.md`
3. `docs/workflow/LIFECYCLE_GATES.md`
4. existing release/operations docs under `docs/operations/`

`project:discover` / `ai:discover` remain compatibility aliases for v14 automation, but new workflows use `project:plan` / `ai:plan`.

For an existing v14.9.4 repository, use `MIGRATION.md` and `npm run project:migrate-v15`; do not manually rename a task's legacy `plan.md` if its existing approval/evidence depends on that artifact.

## Canonical instruction model

The rule source of truth is:

```text
harness/rules/*.md
harness/rules/manifest.json
harness/skills/*/SKILL.md
```

Generation produces provider projections:

```text
AGENTS.md
**/CODEX.md
**/.cursor/rules/*.mdc
.cursor/skills/*/SKILL.md
```

Generated projections must not be edited directly. `harness:generate` also removes retired marker-owned generated Cursor Skills, preventing obsolete phase instructions from surviving an upgrade.

```bash
npm run harness:generate
npm run harness:check
npm run harness:route -- path/to/target
```

## Development contract

A delivery task starts in `DESIGNING`. New tasks use:

```text
docs/specs/<TASK>/brief.md
docs/specs/<TASK>/acceptance.md
docs/specs/<TASK>/design.md
docs/specs/<TASK>/test-plan.md
docs/specs/<TASK>/gate.json
```

After human scope confirmation and design approval, the task may enter `DEVELOPING`. The approval stores a Design Baseline contract hash and Git baseline SHA. Implementation evidence must carry the same `design_baseline_hash`; development cannot silently invent missing design decisions.

If implementation discovers a design gap, return to task Design, re-approve, and create a new baseline instead of expanding implementation scope.

## Cursor and Codex

Cursor is the interactive orchestrator. Detailed phase procedure is loaded from generated Skills (`planning`, `design`, `development`) while cross-cutting safety policy stays always-on.

Codex remains a bounded specialist:

1. **researcher** — read-only investigation during Design when useful;
2. **implementer** — workspace-write only in `DEVELOPING` against an approved Design Baseline;
3. **reviewer** — separate read-only independent review after verification.

Each delegated `ai:*` launcher runs Codex preflight. Project/hook trust remains a human decision; the harness does not auto-write user trust state.

## Verification

Canonical commands include:

```bash
npm run harness:check
npm run execution:check
npm run security:check
npm run verify:ci
npm run verify:all
```

Profile-dependent checks activate only when their profiles are selected/resolved. CodeRabbit remains optional advisory PR review and does not replace canonical deterministic verification, independent review, or human release approval.

## NPM substrate / overlay rule

This distribution includes a private harness `package.json` and `package-lock.json` so the harness checkout can run its own verification. When overlaying onto an existing application, **do not overwrite application package metadata**. Merge `package.scripts.fragment.json` and `package.devDependencies.fragment.json`, then refresh that application's lockfile normally.

## Safety boundary

Profiles describe checks/capabilities; they do not authorize dependency installation, cloud-resource creation, secret access, production deployment, destructive Git operations, or protection-rule bypass. Release commands record/verify evidence according to their contract and never turn a conversational request into autonomous production authority.

See `SECURITY.md`, `NEW_REPOSITORY_SETUP.md`, `docs/workflow/AI_OPERATING_MODEL.md`, `docs/workflow/EXECUTION_SAFETY.md`, and `PACKAGE_MANIFEST.json`.
