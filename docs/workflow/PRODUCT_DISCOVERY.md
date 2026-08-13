# Product discovery operating loop

## Purpose

Greenfield repositories start in `MIGRATION_PENDING`. Product discovery is the controlled path from idea to **`PRODUCT_APPROVED`** before stack selection, architecture approval, or delivery tasks.

This loop is separate from task delivery (`task:start` requires project state **`ACTIVE`** in full lifecycle mode).

## Discovery tiers

| Tier | Command | Use when |
|---|---|---|
| **lite** | `npm run project:discover -- --tier lite` | Small MVP, one metric, minimal docs |
| **full** | `npm run project:discover -- --tier full` (default) | Production-bound product with non-goals and Won't decisions |

Rules live in `harness/contracts/product-discovery.json` and are enforced by `npm run product:check`.

### Lite requirements

- `problem.md`: Context + Problem only
- `users.md`: Primary users only
- `outcomes.md`: one `OUT-xxx` metric row
- `requirements.md`: Must items referencing `OUT-xxx`

### Full requirements

- All lite requirements, plus Why now, Stakeholders, Non-goals
- Each **Won't** item references `PD-xxx` with `docs/product/decisions/PD-xxx-*.md`
- Promoted `IDEA-xxx` rows in `idea-backlog.md` must appear in `requirements.md`

## Entry

```bash
npm run project:discover [--tier lite|full]
npm run product:status
```

`project:discover` moves `MIGRATION_PENDING → DISCOVERY`. Use the migration path in `MIGRATION.md` instead when importing an existing v11/v12 asset bundle.

Optional:

```bash
npm run project:discover -- --id my-product
```

Replace bootstrap `change-me` with a real npm-safe project id.

## Phases

| Order | Document | Minimum content |
|---|---|---|
| 1 | `docs/product/problem.md` | Context, problem, why now |
| 2 | `docs/product/users.md` | Primary user segment table, stakeholders |
| 3 | `docs/product/outcomes.md` | At least one measurable metric row, non-goals |
| 4 | `docs/product/requirements.md` | At least one Must requirement |

Capture early ideas in `docs/product/idea-backlog.md`. When an idea is **promoted**, reuse the same `IDEA-xxx` id in `docs/product/requirements.md`.

Assign every metric an `OUT-xxx` id in `docs/product/outcomes.md` and reference it from Must requirements.

Defer scope explicitly with `PD-xxx` decision records under `docs/product/decisions/`.

## Agent behavior

During `DISCOVERY`:

- Use Cursor IDE Agent mode to facilitate the dialogue and write the resulting product document. Do not use Cursor Plan mode when the agent must write files.
- Treat product docs as the only writable product surface.
- Do not start implementation, add dependencies, or run `task:start`.
- Update **one document per turn** when facilitating discovery.
- Never invent user research, market facts, or metrics. Label unknowns explicitly.
- Run `npm run product:status` before proposing the next edit.
- Use `npm run ai:discover` to record Codex read-only discovery turns in `.harness/discovery/DISC-*.json`; it does not edit product documents.
- Register validated assumptions in `docs/product/assumptions.md` (`ASM-xxx`).
- Link operational signals with `npm run product:signal-link` into `docs/product/signal-feedback.md`.

Research-like claims require `[session:DISC-…]`, `[source:…]`, or validated `[assumption:ASM-xxx]`.

See `.cursor/skills/product-discovery/SKILL.md` for Cursor facilitation.

## Validation and approval

```bash
npm run product:check
npm run project:gate -- --to PRODUCT_APPROVED --actor human:<name> --reason "..."
npm run project:advance -- --to PRODUCT_APPROVED
```

`product:check` rejects unreplaced template placeholders, empty metric rows, and empty Must sections.

`project:gate` runs the same semantic check before recording approval.

## After product approval

Continue the **stack and architecture** loop (`docs/workflow/STACK_ARCHITECTURE.md`):

1. `npm run design:status`
2. `docs/product/technology-options.md` + `technology-decision.md` → optional `ai:evaluate-stack` → `stack:check` → `STACK_APPROVED`
3. Architecture baselines → optional `ai:evaluate-stack` → `architecture:check` → `ARCHITECTURE_APPROVED`
4. `npm run profile:resolve`
5. Human approval to `ACTIVE`

See `docs/workflow/FULL_LIFECYCLE.md`.

## Migration vs greenfield

| Path | Start | Goal |
|---|---|---|
| Greenfield product | `project:discover` | `DISCOVERY → PRODUCT_APPROVED → … → ACTIVE` |
| Legacy bundle import | `MIGRATION.md` | `MIGRATION_PENDING → ACTIVE` with migration documents |

Do not mix paths without an explicit human decision recorded in worklog or project history.
