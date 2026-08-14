# Full lifecycle operating model

## Lifecycle hierarchy

v15 organizes work into four user-facing concerns while retaining independent safety gates and evidence:

1. **Planning** — Why / What.
2. **Design** — How / Exactly what to build.
3. **Development** — implement, test, verify, independently review the approved design.
4. **Release / Operations** — existing preview, production approval, deployment evidence, monitoring, incident, and rollback flows.

`docs/workflow/PHASE_MODEL.md` is the canonical conceptual map. The executable graph is `harness/lifecycle/manifest.json`.

## Greenfield project

```text
MIGRATION_PENDING
  → PLANNING
  → [planning approval]
  → DESIGNING
  → [stack approval]
  → [architecture approval]
  → [profile resolution]
  → [project design approval]
  → ACTIVE
```

Commands:

```bash
npm run project:plan -- --tier full --id my-product
npm run product:check
npm run project:gate -- --gate planning --actor human:<name> --reason "..."
npm run project:advance -- --to DESIGNING

npm run design:status
npm run stack:check
npm run project:gate -- --gate stack --actor human:<name> --reason "..."
npm run architecture:check
npm run project:gate -- --gate architecture --actor human:<name> --reason "..."
npm run profile:resolve
npm run project:gate -- --gate design --actor human:<name> --reason "..."
npm run project:advance -- --to ACTIVE
```

The old `project:discover` / `ai:discover` names remain compatibility aliases; new documentation uses `project:plan` / `ai:plan`.

## Delivery task

```text
DESIGNING
  → [scope confirmation + design approval]
DEVELOPING
  → VERIFYING
  → REVIEWING
  → [release approval]
DEPLOY_READY
  → DONE
```

Start with:

```bash
npm run task:start -- "Feature title" "feature-slug"
```

Development is not authorized by conversational intent alone. It consumes the approved task Design Baseline and must preserve its contract hash in implementation evidence.

## Release and incidents

Release and incident lifecycles continue to record external outcomes without granting autonomous production authority. Examples:

```bash
npm run release:start -- --id REL-2026-08-14-example --tasks PF-004-feature --commit <sha>
npm run signal:record -- --id SIG-2026-08-14-example --type user-feedback --source redacted-reference --severity medium --summary "..."
```

Commands record state/evidence only unless their individual contract explicitly says otherwise. They do not create cloud resources, expose secrets, or bypass production approval.

## Detailed guides

- Planning: `docs/workflow/PLANNING.md`
- Design: `docs/workflow/DESIGN.md`
- Task gates: `docs/workflow/LIFECYCLE_GATES.md`
- Agent delegation: `docs/workflow/AI_OPERATING_MODEL.md`
- Verification: `docs/workflow/VERIFICATION_PIPELINE.md`
- Release/operations: `docs/operations/`
