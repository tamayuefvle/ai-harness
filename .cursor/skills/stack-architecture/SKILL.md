<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->
<!-- Source: harness/skills/stack-architecture/SKILL.md; run npm run harness:generate -->

# Stack and architecture design skill

Use after project state `PRODUCT_APPROVED` and before `ACTIVE`.

## When to use

- Choosing or justifying a technology stack
- Writing architecture / security / quality baselines
- Preparing `STACK_APPROVED` or `ARCHITECTURE_APPROVED` gates

## Workflow

1. Run `npm run design:status [--tier lite|full]` and follow `nextAction`.
2. For stack: update `docs/product/technology-options.md`, then `technology-decision.md` (one file per turn).
3. Selected profiles must be real ids from `harness/profiles/registry.json`. Full tier needs a Rejected options row.
4. After substantive dialogue, run `npm run ai:evaluate-stack` (Codex read-only) to append a design session artifact.
5. Run `npm run stack:check` before proposing `project:gate --to STACK_APPROVED`.
6. For architecture: fill `docs/architecture/baseline.md` and reference `OUT-xxx` in Quality attributes.
7. Full tier: review security/quality baselines. Lite may keep shipped defaults.
8. Run `npm run architecture:check` before proposing `ARCHITECTURE_APPROVED`.
9. After architecture approval: `npm run profile:resolve`, then gate to `ACTIVE`.

## Do not

- Start `task:start` or application implementation before `ACTIVE`
- Invent performance/security evidence
- Treat the shipped Next.js/React profiles as mandatory defaults
- Confuse this loop with task `ai:research` (delivery design after ACTIVE)

See `docs/workflow/STACK_ARCHITECTURE.md`.
