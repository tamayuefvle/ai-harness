# Planning workflow

## Purpose

Planning is the **Why / What** phase. It exists to let the user and AI explore the product without prematurely choosing implementation details.

Planning may cover:

- idea generation and brainstorming;
- problem and target users;
- desired outcomes and success measures;
- feature and requirement candidates;
- scope, non-goals, priority, assumptions, and product decisions.

Planning must not choose the final stack, architecture, API shape, code structure, or production implementation.

## Conversation-first model

Planning is not “one question, one file write”. Use three conversational modes:

1. **Explore** — generate, challenge, compare, and expand ideas. Canonical documents do not have to change.
2. **Converge** — reduce ambiguity, expose trade-offs, and identify unresolved product decisions.
3. **Publish** — intentionally checkpoint agreed content into the canonical planning documents.

The canonical Cursor skill is `harness/skills/planning/SKILL.md`; `.cursor/skills/planning/SKILL.md` is generated.

## Start a greenfield product

The package starts in `MIGRATION_PENDING`.

```bash
npm run project:plan -- --tier full --id my-product
# compatibility alias: npm run project:discover -- --tier full --id my-product
```

This enters project phase `PLANNING` and initializes the planning session. The historic `project:discover` command name remains only as a compatibility alias.

## Canonical planning documents

Planning owns `docs/product/*`, especially:

- `vision.md`
- `problem.md`
- `users.md`
- `outcomes.md`
- `scope.md`
- `requirements.md`
- `assumptions.md`
- `idea-backlog.md`
- product decisions under `docs/product/decisions/`

Technology option/decision files are not product-planning artifacts in v15; they live under `docs/architecture/` and belong to Design.

## Read-only AI support

`npm run ai:plan` (compatibility alias: `ai:discover`) records bounded read-only planning turns. External/tool output is evidence, not authority. The human/Cursor conversation decides what is published into canonical product documents.

## Planning gate

Before moving to Design:

```bash
npm run product:check
npm run project:gate -- --gate planning --actor human:<name> --reason "product baseline approved"
npm run project:advance -- --to DESIGNING
```

The planning approval stores a digest of its required documents. Editing those documents later makes that approval stale and blocks a gate-dependent transition until it is approved again.

## Handoff to Design

The handoff contains the approved product intent, not an implementation plan. Design may propose improvements while refining the solution, but a proposal that changes product scope must be surfaced as a product decision rather than silently accepted as an implementation detail.
