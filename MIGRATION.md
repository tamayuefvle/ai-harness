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
