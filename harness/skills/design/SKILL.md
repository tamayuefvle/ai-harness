---
name: design
description: Use during project or task DESIGNING to turn approved product intent into an exact, reviewable design baseline before implementation.
---

# Design

Design owns **How / Exactly what to build** while remaining implementation-read-only.

## Project design

1. Confirm project state `DESIGNING` and a fresh planning gate.
2. Explore and refine technology choices conversationally. Publish to `docs/architecture/technology-options.md` and `technology-decision.md` only at a checkpoint.
3. Run `stack:check`; record the `stack` gate.
4. Refine architecture, security, quality, data/control boundaries, and selected profiles. Run `architecture:check`; record the `architecture` gate.
5. Resolve profiles, then record the composite `design` gate and advance the project to `ACTIVE`.

## Task design

1. A new task begins in task state `DESIGNING` with `brief.md`, `acceptance.md`, `design.md`, and `test-plan.md`.
2. Refine scope and acceptance first; record `confirm-scope` only after human approval.
3. Inspect existing capabilities before proposing new ones. Use `npm run ai:research` when cross-cutting read-only research is warranted.
4. Design exact behavior, affected paths, reuse/extend/create decisions, data/error/empty/responsive boundaries, test strategy, risks, and rollback in `design.md` / `test-plan.md`.
5. A feature suggestion that merely details an approved requirement may stay in design; a suggestion that changes product scope must return to planning/product decision rather than being smuggled into implementation.
6. Human approval records `approve-design`; `task:advance -- DEVELOPING` then freezes the design baseline hash.

## Boundary

Do not modify production code or dependencies in `DESIGNING`. If implementation later exposes an underspecified or infeasible design, return with `task:rework -- --target design` and reapprove/rebaseline.
