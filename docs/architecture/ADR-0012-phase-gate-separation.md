# ADR-0012 — Separate phase, gate, artifact, and agent responsibilities

- Status: Accepted
- Date: 2026-08-14
- Decision owner: approved improvement `IMP-20260814-05`

## Context

By v14.9.4 the harness had strong product, design, task, verification, review, fallback, and release controls, but several lifecycle states were named after approvals (`PRODUCT_APPROVED`, `STACK_APPROVED`, `SPEC_READY`, `PLAN_READY`). Product-level design and task-level spec/plan also appeared as separate user experiences even though both answered design questions. Planning sessions were additionally coupled too closely to canonical file updates.

The result was correct but cognitively dense: state, approval, document readiness, and agent permission were partially encoded by the same labels.

## Decision

1. Represent **Phase**, **Gate**, **Artifact**, and **Agent** as distinct concepts.
2. Project phases become `MIGRATION_PENDING → PLANNING → DESIGNING → ACTIVE`, with `RETIRED` terminal. Planning, stack, architecture, and design approvals are independent hashed project gate records.
3. Task phases become `DESIGNING → DEVELOPING → VERIFYING → REVIEWING → DEPLOY_READY → DONE`.
4. Task scope and design are approved explicitly through `scopeApproval` and `designApproval`. Development is bound to the approved design contract by `design_baseline_hash` and the approved Git baseline.
5. New tasks use `design.md`. Legacy `plan.md` remains a compatibility design artifact so historical evidence is not broken by a cosmetic rename.
6. Planning is conversation-first (explore, converge, publish). Design is conversation-first (explore/refine, publish) but cannot edit production code. Development executes the approved design and returns to Design when a missing decision is discovered.
7. Cross-cutting policy remains always-on; phase procedure is canonical in `harness/skills/planning`, `design`, and `development` and generated for Cursor. Retired marker-owned Skill projections are pruned.
8. Release and incident behavior remains outside this reorganization except for input terminology needed to consume the new task gate model.

## Alternatives rejected

- **Presentation-only four-phase labels:** leaves approval-named states and duplicated design concepts in the executable lifecycle, so the confusion survives below the documentation layer.
- **Remove intermediate approvals:** simpler state graph but weakens safety and auditability; rejected because the goal is organization without feature loss.
- **Rename every legacy `plan.md` to `design.md`:** breaks approval hashes and historical evidence for active/migrated tasks.
- **Allow implementers to resolve small design gaps:** reduces round trips but makes the implementation agent an implicit product/designer authority and weakens auditability.

## Consequences

- Users reason about a small set of work phases while approval/evidence remains explicit and machine-verifiable.
- Project and task design share a clear responsibility boundary without forcing their artifacts into one physical document.
- Development can be checked deterministically against a frozen Design Baseline.
- Migrations need explicit compatibility logic for v14 states, gate schema v1.x, old command aliases, and legacy task `plan.md`.
- Any future phase must define its artifacts, gates, permitted agents, and rework route separately rather than encoding all four concerns in a state name.

## Rollback

Restore the v14.9.4 lifecycle/schema/rule set and v14 project/gate backups before new v15 baselines are used. After v15 work begins, roll back task state and evidence together; never combine a v15 `designApproval` with the v14 task transition model.

## Reconsider when

A provider supplies a durable first-class phase/gate model that can replace the local state machine without weakening offline validation, migration, human approval, or multi-provider portability.
