# Migration from v10.1.1 to v11.0.0

1. Back up the repository and record the current commit. Do not use destructive Git commands.
2. Overlay the v11 package while preserving application files and existing task evidence.
3. Merge `package.scripts.fragment.json`, `package.devDependencies.fragment.json`, and `.gitignore.harness-fragment` using the existing bootstrap procedure.
4. Run the rule and schema generators.
5. Run `npm run project:migrate-full` when upgrading an existing v10.1.1 installation.
6. Review `docs/product/technology-decision.md`, architecture/security/quality baselines, and the proposed profile set.
7. Run `npm run profile:resolve`.
8. Record explicit approval: `npm run project:gate -- --to ACTIVE --actor human:<name> --reason "..."`.
9. Advance: `npm run project:advance -- --to ACTIVE`.
10. Run harness verification and application profile checks. Configure the GitHub `production` Environment before using the release gate workflow.

## Compatibility

The task lifecycle and gate schema 1.1.0 are retained. Existing completed specs and `.harness/reports` remain valid. `delivery-only` mode exists only as a temporary controlled compatibility option; new installations should use `full`.

## Rollback

Restore the backed-up v10.1.1 harness files, regenerate rules, restore prior required-check settings, and remove v11-only GitHub Environment/workflow configuration. Application source and existing task evidence should not be deleted.
