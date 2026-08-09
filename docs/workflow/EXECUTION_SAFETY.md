# Execution Safety Kernel

v13 adds an execution safety layer underneath the existing v12 full SDLC lifecycle. It is intentionally **not** another product/task workflow.

## State ownership

The only SDLC lifecycle state machine remains `harness/lifecycle/manifest.json` with Project, Task, Release, and Incident lifecycles. **v13 Execution Runs bind only to an approved Task**; Project, Release, and Incident remain lifecycle-level control domains and are never mirrored into Run state. Runtime execution uses a separate run state:

```text
RUNNING -> PAUSED / AWAITING_APPROVAL / RECOVERING
        -> SUCCEEDED / FAILED / ABORTED
```

A runtime pause never changes a task from `IMPLEMENTING`, `VERIFYING`, etc. Resuming a run reloads canonical persisted state and revalidates the approved plan/invariants instead of relying on chat memory.

## Canonical contracts

- `harness/invariants/manifest.json`: non-negotiable safety/evidence/approval invariants.
- `harness/execution/manifest.json`: run states, stop reasons, checkpoint/resume rules, retry semantics, and runtime failure classification.
- `harness/authorization/manifest.json`: deny-by-default role-to-capability-operation authorization. It references, and never duplicates, operations from `harness/capabilities/manifest.json`.
- `harness/schemas/execution-run.schema.json`: persisted run/checkpoint state.
- `harness/schemas/operation-approval.schema.json`: exact operation-specific human decision.
- `harness/schemas/runtime-event.schema.json`: append-only trace event shape.

## Approval separation

Lifecycle approvals authorize lifecycle decisions. Operation approvals authorize one sensitive operation. An operation approval binds the exact capability/provider/operation, target, and argument digest and cannot be reused after a material change.

`approved`, `rejected`, `revoked`, and `expired` are approval decisions. `changes_requested` remains a review/workflow result and is not an approval state.

## Retry and external effects

- Read-only operations may use bounded retry.
- Idempotent writes may retry only with the same idempotency key.
- Non-idempotent writes are never blindly retried.
- If a remote response is lost and commit state is ambiguous, `STOP-CONNECTION` enters `RECOVERING`. Block the next write, query external state by the same idempotency identity, persist the reconciliation evidence under `.harness/reports/`, then run `run:reconcile`. A `not-applied` resolution returns to `PAUSED` and requires a fresh authorization check before retry; an `applied` resolution records the operation as completed so it is not repeated.

## Recovery vs Incident

A timeout, unavailable MCP/tool, stale checkpoint, or ambiguous external response begins runtime recovery. It becomes a canonical Incident only when there is production/customer/security impact, state-integrity risk, or bounded recovery is exhausted.

## Commands

```bash
npm run execution:check
npm run authorization:check -- --role implementer --capability repository --provider workspace-tools --operation write-approved-paths --condition work-scope-match --condition approved-path-match
npm run run:start -- --task DEV-001-example
npm run run:pause -- --run .harness/runs/DEV-001-example/<run>.json --reason STOP-INPUT --resume-cursor implement:AC-002
npm run run:resume -- --run .harness/runs/DEV-001-example/<run>.json
npm run run:authorize -- --run .harness/runs/DEV-001-example/<run>.json --approval .harness/runs/.../approvals/<approval>.json --role system-adapter
npm run run:reconcile -- --run .harness/runs/DEV-001-example/<run>.json --resolution not-applied --evidence .harness/reports/DEV-001-example/<reconciliation>.json
npm run run:operation-complete -- --run .harness/runs/DEV-001-example/<run>.json --operation-id OP-... --result-digest <sha256>
```

For `STOP-APPROVAL`, pause with a pending operation description, record a human operation decision, then resume. The execution CLI never performs the sensitive external write itself; it validates and records the control decision used by the provider adapter.

`authorization:check --condition ...` is a policy simulation/diagnostic command only. Conditions in the canonical authorization manifest are explicitly non-self-assertable. Sensitive provider adapters must derive them from persisted run state, exact operation approval, capability configuration, idempotency state, and command/path policy; `run:authorize` performs that evidence-derived check for a pending operation.

## Concurrency and approval freshness

Each Run is single-writer: mutating commands acquire an exclusive per-run lock and fail closed on concurrent mutation. Approval records are immutable and append-only; when multiple decisions exist for one pending operation, only the latest recorded decision is effective. Authorization is rechecked after reconciliation, and operation completion verifies that the exact approval artifact used for authorization has not changed.


## Executor fallback chain

Implementation fallback is subordinate runtime behavior, not a lifecycle transition. Cursor is the primary interactive executor. A single command failure does not trigger fallback; the trigger is failure of one bounded strategy tied to an explicit hypothesis and verification target.

After that failure, preserve evidence and use the generated `executor-fallback` Skill. Codex first runs in a fresh ephemeral read-only diagnostic session and returns one of `alternative_strategy`, `human_decision`, `human_action`, or `blocked`. Only `alternative_strategy` may reuse the existing Codex implementer, once, in a fresh workspace-write session. The proposed strategy must be materially different from the failed Cursor strategy. If that Codex implementation fails, autonomous fallback is exhausted and control goes to the human. Automatic Cursor↔Codex loops are forbidden.

MFA, CAPTCHA, interactive authentication, secret creation, payment/contract, legal acceptance, and physical actions are human-first. Human action must be verified read-only before the run resumes. Final independent review remains the existing fresh ephemeral read-only Codex reviewer and must not reuse implementation context.
