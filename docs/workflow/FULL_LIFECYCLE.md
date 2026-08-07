# Full lifecycle operating model

## Hierarchy

1. Project lifecycle controls product, technology, and architecture baselines.
2. Task lifecycle retains the v10.1.1 specification-to-delivery gates.
3. Release and incident lifecycles track external outcomes without granting autonomous production authority.
4. Operational signals are assessed before becoming tasks or project-decision changes.

## Bootstrap and migration

The distributed v11 package starts at `MIGRATION_PENDING`. Run `npm run profile:resolve`, review the generated resolution and baseline documents, record approval with `project:gate`, then advance to `ACTIVE`. Until then new implementation tasks are blocked in full lifecycle mode.

## Commands

```bash
npm run profile:resolve
npm run project:gate -- --to ACTIVE --actor human:tama --reason "v10.1.1 baseline reviewed"
npm run project:advance -- --to ACTIVE
npm run task:start -- "Feature title" "feature-slug"
npm run release:start -- --id REL-2026-08-06-example --tasks PF-004-feature --commit <sha>
npm run signal:record -- --id SIG-2026-08-06-example --type user-feedback --source redacted-reference --severity medium --summary "..."
```

Commands record state and evidence only. They do not create cloud resources, install a stack, deploy production, or expose secrets.
