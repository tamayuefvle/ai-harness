# Full lifecycle operating model

## Hierarchy

1. Project lifecycle controls product, technology, and architecture baselines.
2. Task lifecycle retains the v10.1.1 specification-to-delivery gates.
3. Release and incident lifecycles track external outcomes without granting autonomous production authority.
4. Operational signals are assessed before becoming tasks or project-decision changes.

## Bootstrap and migration

The package starts at `MIGRATION_PENDING`.

**Greenfield product path**

1. `npm run project:discover` → product docs → `PRODUCT_APPROVED`
2. `npm run design:status` → stack docs → optional `ai:evaluate-stack` → `STACK_APPROVED`
3. Architecture baselines → optional `ai:evaluate-stack` → `ARCHITECTURE_APPROVED`
4. `npm run profile:resolve` → `ACTIVE`

**Legacy migration path**

Run `npm run profile:resolve`, review generated resolution and migration documents, then gate to `ACTIVE` per `MIGRATION.md`. Until `ACTIVE`, new implementation tasks are blocked in full lifecycle mode.

## Commands

```bash
npm run design:status
npm run ai:evaluate-stack
npm run stack:check
npm run architecture:check
npm run profile:resolve
npm run project:gate -- --to ACTIVE --actor human:tama --reason "baselines reviewed"
npm run project:advance -- --to ACTIVE
npm run task:start -- "Feature title" "feature-slug"
npm run release:start -- --id REL-2026-08-06-example --tasks PF-004-feature --commit <sha>
npm run signal:record -- --id SIG-2026-08-06-example --type user-feedback --source redacted-reference --severity medium --summary "..."
```

Commands record state and evidence only. They do not create cloud resources, install a stack, deploy production, or expose secrets.

See `docs/workflow/PRODUCT_DISCOVERY.md` and `docs/workflow/STACK_ARCHITECTURE.md` for the staged greenfield path.
