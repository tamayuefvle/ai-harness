# Product discovery skill

Use during project state `DISCOVERY` to facilitate greenfield product planning.

## When to use

- User wants to plan a new product from an idea
- `npm run product:status` shows incomplete product docs
- Before stack selection, architecture, or `task:start`

## Workflow

1. Confirm state is `DISCOVERY`. If `MIGRATION_PENDING`, run `npm run project:discover [--tier lite|full]` first.
2. Run `npm run product:status` and follow `nextAction`.
3. Ask **one question at a time**. Update **one file per turn** under `docs/product/`.
4. Capture promoted ideas as `IDEA-xxx`, metrics as `OUT-xxx`, deferred scope as `PD-xxx` decision files.
5. Record validated assumptions in `docs/product/assumptions.md` as `ASM-xxx`.
6. After substantive dialogue, run `npm run ai:discover` (Codex read-only) to append a discovery session artifact.
7. Run `npm run product:check` before suggesting `project:gate`.

## Anti-fabrication

Never claim user research, market validation, or metrics without:

- `[session:DISC-…]` from `.harness/discovery/`
- `[source:…]` with a concrete reference
- validated `[assumption:ASM-xxx]` in `docs/product/assumptions.md`

## Signal feedback

When operations signals challenge product outcomes, link them with:

```bash
npm run product:signal-link -- --signal SIG-2026-08-12-example --affects OUT-001 --action review --summary "..."
```

Do not auto-edit requirements from signals; propose human review first.

## Do not

- Start implementation or add dependencies during discovery
- Run `task:start` before project state `ACTIVE`
- Invent citations or research results
