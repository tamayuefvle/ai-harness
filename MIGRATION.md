# Migration from v13.1.0 to v13.2.0

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
