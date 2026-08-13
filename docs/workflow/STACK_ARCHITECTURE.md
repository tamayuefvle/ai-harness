# Stack and architecture operating loop

## Purpose

After **`PRODUCT_APPROVED`**, choose a technology stack, record architecture baselines, resolve profiles, then advance to **`ACTIVE`**. Delivery tasks (`task:start`) remain blocked until `ACTIVE`.

This loop is separate from task-level design (`ai:research` after `SPEC_READY`).

## Discovery tiers

| Tier | Command | Use when |
|---|---|---|
| **lite** | `npm run design:status -- --tier lite` | Small MVP: one candidate, baseline-only architecture |
| **full** | `npm run design:status -- --tier full` (default: `discoveryTier`) | Production-bound stack with rejected options and OUT traces |

`designTier` defaults to `discoveryTier` when unset.

## Entry

```bash
npm run design:status
```

## Phases

| State | Documents / evidence | Check | Gate |
|---|---|---|---|
| `PRODUCT_APPROVED` | `docs/product/technology-options.md`, `technology-decision.md` | `npm run stack:check` | → `STACK_APPROVED` |
| `STACK_APPROVED` | `docs/architecture/baseline.md` (full: also security/quality baselines) | `npm run architecture:check` | → `ARCHITECTURE_APPROVED` |
| `ARCHITECTURE_APPROVED` | `harness/generated/profile-resolution.json` | `npm run profile:resolve` | → `ACTIVE` |

## Stack rules

- Compare at least one real candidate in technology-options.
- Record a non-pending decision with rationale.
- List selected profiles as `category/name` ids that exist in `harness/profiles/registry.json`.
- Deployment profiles (`deployment/vercel`, `deployment/aws`) record the hosting intent only. They do not install CLIs, create cloud resources, or deploy. AWS humans follow `docs/operations/aws-deployment.md`.
- Full tier: record at least one Rejected options row.
- Selected profiles are copied into `proposedProfiles` at `STACK_APPROVED` when that list is empty.
- Do not install application dependencies or activate profiles until human stack approval.

## Architecture rules

- Fill System context, Boundaries, Quality attributes, and Rollback with project-specific content.
- Reference `OUT-xxx` from `docs/product/outcomes.md` in Quality attributes (lite: at least one; full: every declared outcome).
- Full tier: review security and quality baselines; keep them free of template placeholders.
- Lite tier: shipped security/quality defaults may remain; they still participate in the lifecycle hash.
- Do not implement application features during architecture approval.

## Agent sessions

Use `npm run ai:evaluate-stack` during `PRODUCT_APPROVED` (stack) or `STACK_APPROVED` (architecture) to record Codex read-only turns in `.harness/design/DSN-*.json`. Finalize always records a `stack:check` or `architecture:check` snapshot, including `ok: false` while documents are still incomplete. The session command succeeds when the turn is recorded; gate with `stack:check` / `architecture:check` separately. This does not edit docs or advance gates.

Do not use task `ai:research` for project design; that path is delivery-only after `ACTIVE` / `SPEC_READY`.

## Agent behavior

- Run `npm run design:status` before proposing the next edit.
- Update **one design document per turn**.
- After substantive dialogue, run `npm run ai:evaluate-stack` (Codex read-only).
- Never invent latency/security claims; label assumptions.
- Use `.cursor/skills/stack-architecture/SKILL.md` for facilitation.
- Use task `ai:research` only after project state `ACTIVE`.

## Validation and approval

```bash
npm run stack:check
npm run project:gate -- --to STACK_APPROVED --actor human:<name> --reason "..."
npm run project:advance -- --to STACK_APPROVED

npm run architecture:check
npm run project:gate -- --to ARCHITECTURE_APPROVED --actor human:<name> --reason "..."
npm run project:advance -- --to ARCHITECTURE_APPROVED

npm run profile:resolve
npm run project:gate -- --to ACTIVE --actor human:<name> --reason "..."
npm run project:advance -- --to ACTIVE
```

`project:gate` runs the matching semantic check before recording approval.

## After ACTIVE

Continue with task lifecycle (`task:start`, plan, implement, verify). See `docs/workflow/FULL_LIFECYCLE.md`.
