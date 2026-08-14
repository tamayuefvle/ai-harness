# Task design, development, and gatekeeper role

## Ownership

Task state expresses the active phase. `gate.json` separately records human approvals and immutable evidence. The canonical task phases are `DESIGNING → DEVELOPING → VERIFYING → REVIEWING → DEPLOY_READY`, with terminal `DONE`.

## Required artifacts

- `brief.md`: background, goal, scope/non-scope, assumptions
- `acceptance.md`: observable `AC-xxx` conditions
- `design.md`: exact design, existing-capability decision, affected/allowed paths, implementation order, risks, rollback. Legacy migrated tasks may retain `plan.md`.
- `test-plan.md`: AC-linked automated/manual verification
- `review.md`, `delegation.md`, `gate.json`

## Gates and phase boundaries

### DESIGNING

Application implementation is forbidden. Confirm scope first (`task:gate -- confirm-scope`), then complete/refine design and test plan. Human `approve-design` records the design contract hash, design document, and baseline SHA. `task:advance -- DEVELOPING` requires both approvals to be fresh.

### DEVELOPING

Implement only the approved design baseline. Implementation evidence must carry the exact `design_baseline_hash`. Do not expand scope, alter architecture, or invent missing requirements. If the approved design is insufficient or infeasible, use `task:rework -- --target design`, reapprove, and rebaseline rather than deciding inside implementation.

### VERIFYING

Run deterministic harness/profile/application checks as applicable and record schema-valid evidence for the exact HEAD, change fingerprint, approved design baseline, GitHub context, and React Doctor evidence when required. Missing, stale, partial, or inconsistent evidence fails closed.

### REVIEWING

Use independent review over the diff, ACs, verification evidence, GitHub context, and required diagnostics. Derive verdict/severity counts from the structured review; P0/P1 block release readiness. Human release approval is recorded here.

### DEPLOY_READY / DONE

Production remains human-authorized. `task:complete` replays all validators, writes `DONE.md`, and resets `_active.md` to `active_spec: none` / `status: DESIGNING`; `DONE` is terminal rather than an active status.

## Rework

`task:rework` normally returns downstream failures to `DEVELOPING` and invalidates downstream evidence. `--target design` returns to `DESIGNING`, clears design approval, and requires a new approved design baseline. `task:rebaseline` is human-authorized and invalidates implementation and later evidence.
