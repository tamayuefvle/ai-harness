# Lifecycle gates

## Principle

v15 separates **phase** from **approval/evidence**. A task being in `DESIGNING` does not mean its design is approved, and a stored approval does not remain valid after its hashed contract changes.

The executable transition graph is `harness/lifecycle/manifest.json`; serialized evidence follows `harness/schemas/lifecycle-gate.schema.json`.

## Task lifecycle

```text
DESIGNING → DEVELOPING → VERIFYING → REVIEWING → DEPLOY_READY → DONE
```

### DESIGNING

Artifacts:

- `brief.md`
- `acceptance.md`
- `design.md` (new tasks) or legacy `plan.md`
- `test-plan.md`

Human gates:

```bash
npm run task:gate -- confirm-scope --by human:<name> --reason "..."
npm run task:gate -- approve-design --by human:<name> --reason "..."
npm run task:advance -- DEVELOPING
```

`scopeApproval` hashes scope artifacts. `designApproval` hashes the complete design contract and records a Git `baselineSha` plus the exact `designDocument` used.

### DEVELOPING

Only an approved Design Baseline may be implemented. Implementation evidence must contain `design_baseline_hash` equal to `designApproval.contractHash`.

```bash
npm run task:gate -- record-implementation --by <agent> --reason "..." --report <path>
npm run task:advance -- VERIFYING
```

### VERIFYING

Verification is deterministic evidence against the current implementation. GitHub context and profile-dependent evidence such as React Doctor are validated where applicable.

```bash
npm run task:gate -- record-verification --by <agent> --reason "..." --report <verification.json> --github-context <github.json> [...]
npm run task:advance -- REVIEWING
```

### REVIEWING

Independent review replays the relevant evidence and blocks unresolved P0/P1 findings.

```bash
npm run task:gate -- record-review --by <reviewer> --reason "..." --report <review.json>
npm run task:gate -- approve-release --by human:<name> --reason "..." --mode preview
npm run task:advance -- DEPLOY_READY
```

Production mode remains an explicit human decision and does not itself deploy.

### DEPLOY_READY / DONE

Release/operations commands handle external deployment evidence. Completing the task replays the lifecycle contract rather than trusting chat memory.

## Rework and rebaseline

Use rework for a design gap, not an untracked implementation deviation:

```bash
npm run task:rework -- --target design --by human:<name> --reason "design decision required"
```

Returning to `DESIGNING` clears the design approval and downstream implementation/verification/review/release evidence. A new approval creates a new Design Baseline.

`task:rebaseline` is human-only and valid only in `DESIGNING`; it rebinds an approved design to a deliberate Git baseline when the design contract itself remains valid.

## Migration compatibility

Gate schema v2 uses `scopeApproval` and `designApproval`. `task:migrate-gates` migrates supported legacy gate formats only after a fresh human scope/design validation, creates versioned gate and active-state backups, and resets evidence that cannot be trusted under the v2 contract. Legacy downstream task states restart at `DEVELOPING` so v15 implementation/verification/review evidence is rebuilt against `design_baseline_hash`. Existing `plan.md` is accepted only as a legacy design document; new tasks are generated with `design.md`.
