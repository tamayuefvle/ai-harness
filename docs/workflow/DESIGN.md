# Design workflow

## Purpose

Design is the **How / Exactly what to build** phase. It converts an approved product intent or task scope into an implementation-ready, testable baseline without changing production code.

Project Design and Task Design share one responsibility boundary but have different artifacts.

## Project Design

Project phase `DESIGNING` owns:

- technology options and decision;
- architecture baseline;
- security baseline;
- quality strategy;
- profile resolution;
- project design approval.

Canonical files include:

- `docs/architecture/technology-options.md`
- `docs/architecture/technology-decision.md`
- `docs/architecture/baseline.md`
- `docs/architecture/security-baseline.md`
- `docs/architecture/quality-strategy.md`

Typical flow:

```bash
npm run design:status
npm run ai:evaluate-stack          # optional read-only facilitation
npm run stack:check
npm run project:gate -- --gate stack --actor human:<name> --reason "stack approved"

npm run architecture:check
npm run project:gate -- --gate architecture --actor human:<name> --reason "architecture approved"

npm run profile:resolve
npm run project:gate -- --gate design --actor human:<name> --reason "project design approved"
npm run project:advance -- --to ACTIVE
```

The `design` project gate requires fresh stack and architecture approvals and a resolved profile set.

## Task Design

A new delivery task starts in task phase `DESIGNING`.

```bash
npm run task:start -- "Feature title" "feature-slug"
```

Canonical task design artifacts:

- `brief.md` — task intent and boundaries;
- `acceptance.md` — user-observable acceptance criteria;
- `design.md` — exact behavior, existing-capability decision, data/API/UX boundaries, allowed paths, implementation order, risks, rollback;
- `test-plan.md` — acceptance-criteria-linked verification plan.

Legacy migrated tasks may retain `plan.md`; do not rename it merely to modernize a task whose approval/hash already depends on it.

## Conversation-first design

The AI may:

- ask for missing behavior decisions;
- propose alternative technical approaches;
- identify reuse/extend/replace/create choices;
- propose necessary adjacent behavior, edge cases, error/empty/loading states, security and test implications;
- run or delegate read-only research.

The AI must not implement production code during design. A proposal that changes product scope must be returned to product authority rather than hidden in `design.md`.

## Task approvals

First approve task scope:

```bash
npm run task:gate -- confirm-scope --by human:<name> --reason "scope confirmed"
```

Then approve the complete design:

```bash
npm run task:gate -- approve-design --by human:<name> --reason "design approved"
npm run task:advance -- DEVELOPING
```

`designApproval` stores both the design contract hash and the Git baseline SHA. Development reports must carry the same `design_baseline_hash` as the approved design contract.

## Rework

If implementation reveals an unresolved design decision:

```bash
npm run task:rework -- --target design --by human:<name> --reason "design decision required"
```

This returns the task to `DESIGNING` and clears stale design/downstream evidence. Update the design, confirm/approve again as required, then resume development. Never fix a design gap by silently extending implementation scope.
