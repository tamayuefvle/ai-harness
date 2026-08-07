# Migration from v11.0.0 to v12.0.0

1. Back up the repository and record the current commit. Do not use destructive Git commands.
2. Overlay the v12 package while preserving application files and existing task evidence.
3. Merge `package.scripts.fragment.json`, `package.devDependencies.fragment.json`, and `.gitignore.harness-fragment` using your existing bootstrap procedure.
4. Run `npm run harness:generate` and `npm run harness:check`.
5. Set `harness/project.json` → `projectId` to your project identifier (replace `change-me`).
6. Choose `migration.proposedProfiles` (see `harness/profiles/` and `docs/product/technology-decision.md`). Web/React/Next bundles are optional scaffold examples, not pre-selected.
7. Run `npm run profile:resolve`.
8. Review soft-templated `docs/product/*` and `docs/architecture/baseline.md`; fill or replace with your project content.
9. Record explicit approval: `npm run project:gate -- --to ACTIVE --actor human:<name> --reason "..."`.
10. Advance: `npm run project:advance -- --to ACTIVE` (only after human approval).
11. Run harness verification and application profile checks.

## State behavior

- v12 does **not** auto-advance `MIGRATION_PENDING` → `ACTIVE`. Existing v11 clones keep their live state until you explicitly migrate.
- Bundled `profile-resolution.json` is `unresolved` until you resolve profiles.
- Unused optional scaffold paths (e.g. `app/`, `e2e/`) may be deleted if you did not select matching profiles.

## Compatibility

Task lifecycle and gate schema 1.1.0 are retained. Existing `.harness/reports` remain valid. Cursor slash command is now `/develop` (formerly `/portfolio`).

## Rollback

Restore backed-up v11 harness files, regenerate rules, and restore prior `harness/project.json` / `profile-resolution.json` if needed. Application source and task evidence should not be deleted.
