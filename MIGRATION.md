# Migration to v15.0.0

## From v14.9.4

v15 is a lifecycle-contract migration, not a cosmetic rename. Preserve product code, filled product/design documents, completed task evidence, and release/incident records. Do not overwrite an existing application `package.json` or lockfile when applying the harness overlay.

### What changes

- project working states become `PLANNING`, `DESIGNING`, and `ACTIVE`; former approval-named states become independent `phaseGates` records;
- task working states become `DESIGNING`, `DEVELOPING`, `VERIFYING`, `REVIEWING`, and `DEPLOY_READY`;
- task `specApproval` / `planApproval` become `scopeApproval` / `designApproval`;
- new task design source is `design.md`; an existing approved `plan.md` remains a supported legacy design document;
- implementation evidence is bound to `design_baseline_hash`;
- technology option/decision documents move from `docs/product/` to `docs/architecture/`;
- canonical phase Skills become `planning`, `design`, `development`, and `executor-fallback`; obsolete generated Skills are pruned by generation.

### Safe migration sequence

1. Back up the repository/branch and ensure the worktree has no unrelated changes. Do not use destructive Git cleanup.
2. Overlay v15 canonical files. For an application repository, merge package fragments instead of replacing application package metadata.
3. Run the project-state migration:

```bash
npm run project:migrate-v15
```

The command writes `harness/project.v14.backup.json` before changing persistent project state. It maps v14 states conservatively, moves legacy technology documents only when safe, and reconstructs phase-gate approvals only when historical human evidence supports them. It does not fabricate approvals.

4. For each active legacy task whose `gate.json` is schema v1.x, run:

```bash
npm run task:migrate-gates -- --approved-by human:<name> --reason "v15 gate migration" --base-sha <40-char-commit-sha>
```

The gate migration first validates the current scope/design, requires a fresh human migration approval bound to the supplied commit, and creates backups of both the legacy gate and `_active.md`. Evidence that cannot be trusted under the v2 contract is reset rather than silently accepted.

5. Regenerate projections and run verification:

```bash
npm run harness:generate
npm run harness:check
npm run verify:harness
```

6. Review `harness/project.json`, `docs/specs/_active.md`, active task `gate.json`, profile resolution, and any migration backups before resuming work.

### State mapping

| v14 project state | v15 result |
|---|---|
| `MIGRATION_PENDING` | `MIGRATION_PENDING` |
| `DISCOVERY` | `PLANNING` |
| `PRODUCT_APPROVED`, `STACK_APPROVED`, `ARCHITECTURE_APPROVED` | normally `DESIGNING` when reconstructable approval evidence exists; otherwise fail-safe `PLANNING` |
| `ACTIVE` | `ACTIVE`; old delivery remains usable, with reconstructed gates only where evidence exists |
| `RETIRED` | `RETIRED` |

| v14 task state | v15 semantic destination |
|---|---|
| `IDEA`, `SPEC_READY`, `PLAN_READY` | `DESIGNING` |
| `IMPLEMENTING`, `VERIFYING`, `REVIEW_READY`, `DEPLOY_READY` | `DEVELOPING` |
| `DONE` | do not migrate as an active task; archive/complete it under v14 first |

The conservative restart at `DEVELOPING` is intentional: v14 implementation/verification/review evidence is not accepted as v15 evidence because it is not bound to the v15 `design_baseline_hash`. The migration command resets downstream evidence, updates `_active.md` and the gate together, and requires the task to rebuild implementation evidence before advancing. Do not alter only `_active.md` to simulate this mapping.

### Rollback

Before resumed v15 work creates new approvals, restore the v14.9.4 harness overlay plus `harness/project.v14.backup.json`, any `gate.v*.backup.json`, and `docs/specs/_active.v14.backup.md` created for active tasks, then regenerate the v14.9.4 projections. Once a task has been re-approved and developed against a v15 Design Baseline, rollback requires reverting those v15 task changes/evidence as a unit; never mix a v15 gate with a v14 task-state contract.

---

# Migration to v14.9.4

## From v14.9.3

Compatible overlay. Overlay v14.9.4 without overwriting filled product documents, merge fragments if needed, then run `npm run harness:generate` and `npm run verify:harness`.

Before delegated Codex `ai:*` commands, run `npm run codex:preflight`. In addition to effective project config, v14.9.4 requires the current repository project hook to be discovered, enabled, and trusted. If trust is pending, review the exact hook definition interactively with `/hooks`; do not write user trust configuration or bypass hook trust automatically.

Cursor security-critical `preToolUse` is now fail-closed. A hook crash, timeout, or invalid response is therefore expected to block the action until the hook is healthy. Planning seed templates now live under `harness/templates/planning`; existing filled `docs/product/*` and architecture documents remain project state and must not be overwritten during migration.

---

# Migration to v14.9.3

## From v14.9.2

Compatible overlay. Overlay v14.9.3, merge fragments if needed, then run `npm run harness:generate` and `npm run verify:harness`. Planning and profile harness tests now use isolated fixtures, so filled product documents and resolved profiles no longer fail `verify:harness`.

---

# Migration to v14.9.2

## From v14.9.1

Compatible overlay. Overlay v14.9.2, merge `package.scripts.fragment.json` and `package.devDependencies.fragment.json` if needed, then run `npm run harness:generate` and `npm run verify:harness`. After a clone takes product package metadata, change `package.json.name` away from `ai-harness`; `verify:harness` then checks the fragment merge instead of exact substrate identity. Do not replace an application `package.json`.

---

# Migration to v14.9.1

## From v14.9.0

Compatible overlay. Interactive Cursor IDE sessions with an unset or empty `HARNESS_CURSOR_ROLE` may now write approved repository paths. Explicit Cursor CLI read-only/reviewer roles remain write-denied, while generated instruction projections and dangerous commands remain denied for every session. Keep the generated `.cursor/cli.json` `Write(**/*)` deny as the CLI baseline, overlay v14.9.1, then run `npm run harness:generate` and `npm run verify:harness`.

---

# Migration to v14.9.0

## From v14.8.0

Compatible upgrade. Overlay v14.9.0, merge `package.scripts.fragment.json` if needed, run `npm run harness:generate`, then `npm run verify:harness`. To host on AWS, add `deployment/aws` to the approved profile list instead of (or, only if dual-hosting, in addition to) `deployment/vercel`, record the AWS topology in `docs/architecture/baseline.md`, and follow `docs/operations/aws-deployment.md`. Do not add AWS SDK/CLI to the harness substrate.

---

# Migration to v14.8.0

## From v14.7.0

Compatible upgrade. Overlay v14.8.0 **without replacing an existing application `package.json` or lockfile**. Merge `package.scripts.fragment.json` and `package.devDependencies.fragment.json`, refresh the application lockfile with `npm install`, run `npm run harness:generate`, then `npm run verify:harness`.

If this repository is the harness checkout itself (no separate application manifest), keep the shipped private substrate and run `npm ci`. `profile:check` is a no-op while profile resolution remains unresolved. React Doctor and Playwright E2E stay skipped until those profiles are selected.

---

# Migration to v14.7.0

## From v14.6.0

Compatible upgrade. Overlay v14.7.0, including root `.coderabbit.yaml`, merge `package.scripts.fragment.json`, run `npm run harness:generate`, then `npm run verify:harness`.

The overlay does not install or change the CodeRabbit GitHub App. A human may install the optional App in GitHub and validate it with a test PR. `.coderabbit.yaml` is the repository-specific configuration source of truth; organization Global Overrides remain external policy. Existing verification, review, evidence, and lifecycle contracts are unchanged, and CodeRabbit does not replace the fresh read-only Codex independent review.

---

# Migration to v14.6.0

## From v14.5.0

Compatible upgrade. Merge `package.scripts.fragment.json`, run `npm run harness:generate`, then `npm run verify:harness`.

New behavior:

- `npm run ai:evaluate-stack` during `PRODUCT_APPROVED` or `STACK_APPROVED` records Codex read-only turns under `.harness/design/`.
- Finalize snapshots `stack:check` or `architecture:check` without failing the session when documents are still incomplete, and without editing design docs or advancing gates.
- Do not use task `ai:research` for project stack/architecture design.

---

# Migration to v14.5.0

## From v14.4.0

Compatible upgrade. Merge `package.scripts.fragment.json`, run `npm run harness:generate`, then `npm run verify:harness`.

New behavior:

- `npm run design:status -- --tier lite|full` stores `designTier` (defaults to `discoveryTier`).
- Architecture Quality attributes must reference `OUT-xxx`.
- Full-tier stack decisions need a Rejected options row.
- Empty `proposedProfiles` is filled from the technology decision at `STACK_APPROVED`.

---

# Migration to v14.4.0

## From v14.3.0

Compatible upgrade. Merge `package.scripts.fragment.json`, run `npm run harness:generate`, then `npm run verify:harness`.

New behavior:

- After `PRODUCT_APPROVED`, use `npm run design:status` for the stack/architecture path.
- `stack:check` / `architecture:check` are required before the matching `project:gate` transitions.
- Selected profiles in `technology-decision.md` must exist in `harness/profiles/registry.json`.

---

# Migration to v14.3.0

## From v14.2.0

Compatible upgrade. Merge `package.scripts.fragment.json`, run `npm run harness:generate`, then `npm run verify:harness`.

New behavior:

- `npm run ai:discover` during `DISCOVERY` records Codex read-only turns under `.harness/discovery/`.
- Must requirements referencing `ASM-xxx` require validated assumptions in `docs/product/assumptions.md`.
- Research-like product claims require explicit citations or fail `product:check`.
- Link operational signals to product traces with `npm run product:signal-link`.

---

# Migration to v14.2.0

## From v14.1.0

Compatible upgrade. Merge `package.scripts.fragment.json`, run `npm run harness:generate`, then `npm run verify:harness`.

New behavior:

- `npm run project:discover -- --tier lite|full` stores `discoveryTier`.
- Product templates now use `OUT-xxx`, `IDEA-xxx`, and `PD-xxx` trace ids.
- Full-tier discovery requires decision files under `docs/product/decisions/` for Won't items.

---

# Migration to v14.1.0

## From v14.0.0

Compatible control-plane upgrade. Preserve product code, lifecycle state, tasks, and `.harness/` evidence.

1. Overlay v14.1 and merge `package.scripts.fragment.json`.
2. Run `npm run harness:generate`.
3. Run `npm run verify:harness`.

New commands:

```bash
npm run project:discover      # MIGRATION_PENDING → DISCOVERY
npm run product:status        # next planning action
npm run product:check         # semantic validation of docs/product/*
```

If you already skipped straight to migration documents, stay on the migration path in the section below. Use `project:discover` only for greenfield product planning.

---

# Migration to v14.0.0

## From v13.2.0

1. Back up the repository and record the current commit. Preserve product files, lifecycle/task state, approved evidence, and `.harness/` records.
2. Overlay v14 and merge `package.scripts.fragment.json`; do not replace the product `package.json` wholesale.
3. Run `npm run harness:generate`. Marker-owned nested generated `AGENTS.md` files are removed, directory Codex rules become `CODEX.md`, Cursor keeps scoped `.mdc`, and policy projections are generated.
4. Run `npm run verify:harness`.
5. If Cursor CLI is installed and the repository has a clean committed base, optionally run `npm run cursor:preflight`. Implementer results remain in an isolated worktree and are never auto-applied. Provider-free regression for this path lives in `scripts/harness/cursor-exec.test.mjs` (live authentication remains a workstation smoke check).

The Project/Task/Release/Incident lifecycle and `harness/project.json` state are unchanged. Switching between Cursor IDE and CLI is not a new strategy budget. Rollback restores reviewed v13.2 harness-owned sources and reruns its generator; preserve product and runtime evidence.

## From v13.1.0 to v13.2.0

1. Back up the repository and record the current commit. Do not use destructive Git commands.
2. Overlay the v13.2 package while preserving application files, lifecycle state, and existing task evidence.
3. Merge `package.scripts.fragment.json`, `package.devDependencies.fragment.json`, and `.gitignore.harness-fragment` using your existing bootstrap procedure. Ensure `react-doctor@0.7.7` remains in `devDependencies` when `quality/react-doctor` is selected.
4. Run `npm run harness:generate` and `npm run harness:check`.
5. Run `npm run harness:generate`. This regenerates active projections and **removes retired generated root `app/AGENTS.md` / `app/.cursor/rules/application.mdc`** (GENERATED marker only). Hand-edited files under `app/` are left alone. Prefer `src/` for Next.js App Router layouts.
6. Re-run React Doctor evidence collection for in-flight React-relevant tasks if an older validator rejected schema v3 reports.
7. Existing Execution Runs, fallback artifacts, Project/Task lifecycle states, and capability schema 1.1.0 remain valid; no backfill is required.

## From v12.0.0

If you are still on v12, follow the v13.1 migration steps below after overlaying v13.2 (skip intermediate v13.1 packaging if jumping directly).

1. Back up the repository and record the current commit. Do not use destructive Git commands.
2. Overlay the v13.2 package while preserving application files, lifecycle state, and existing task evidence.
3. Merge `package.scripts.fragment.json`, `package.devDependencies.fragment.json`, and `.gitignore.harness-fragment` using your existing bootstrap procedure.
4. Run `npm run harness:generate` and `npm run harness:check`.
5. Set `harness/project.json` → `projectId` to your project identifier (replace `change-me`).
6. Choose `migration.proposedProfiles` (see `harness/profiles/` and `docs/product/technology-decision.md`). Web/React/Next bundles are optional scaffold examples, not pre-selected.
7. Run `npm run profile:resolve`.
8. Review soft-templated `docs/product/*` and `docs/architecture/baseline.md`; fill or replace with your project content.
9. Record explicit approval: `npm run project:gate -- --to ACTIVE --actor human:<name> --reason "..."`.
10. Advance: `npm run project:advance -- --to ACTIVE` (only after human approval).
11. Run harness verification and application profile checks.

If `package.json` is absent, use `NEW_REPOSITORY_SETUP.md` and the check-first bootstrap instead of inventing a manifest. This establishes only the harness substrate. Keep `MIGRATION_PENDING`, `projectId: change-me`, and unresolved profiles unchanged until product-stack selection and explicit approval are complete; run `profile:resolve` only after that selection.

## Execution Safety migration

- Project, Task, Release, and Incident lifecycle state lists are unchanged from v12. Execution Runs are subordinate to approved Task work and do not advance lifecycle state.
- Do not fabricate or backfill Runs for historical Tasks. Existing Tasks and evidence remain valid without a Run artifact.
- New Run and fallback artifacts are additive under `.harness/runs` and `.harness/reports/<task>/fallback`.
- Authorization references the existing capability schema 1.1.0 operations; no capability schema upgrade is required.

## State behavior

- v13.2 does **not** auto-advance `MIGRATION_PENDING` → `ACTIVE`. Existing clones keep their live state until you explicitly migrate.
- Bundled `profile-resolution.json` is `unresolved` until you resolve profiles.
- Unused optional scaffold paths (e.g. root `app/`, `e2e/`) may be deleted if you did not select matching profiles.

## Compatibility

Project, Task, Release, and Incident lifecycle states and capability schema 1.1.0 are retained. Existing `.harness/reports` remain valid. React Doctor evidence must satisfy raw `schema_version` 1 or 3 with `baseline_degraded !== true` for passing gates.

## Rollback

Restore backed-up v13.1 (or v12) harness files, regenerate rules, and restore prior `harness/project.json` / `profile-resolution.json` if needed. Application source and task evidence should not be deleted.
