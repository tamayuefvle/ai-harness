# Lifecycle gates

## Purpose

The harness keeps one active state machine and enforces each transition with deterministic, fail-closed validation. SDD and TDD do not introduce parallel top-level states. TDD evidence remains in the implementation report under `test_discipline`.

## State and terminal operation

```text
IDEA → SPEC_READY → PLAN_READY → IMPLEMENTING → VERIFYING → REVIEW_READY → DEPLOY_READY
```

`DONE` is a terminal outcome, not an active state. `task:complete` replays every transition validator, writes `DONE.md`, and resets `_active.md` to `active_spec: none` and `status: IDEA`.

## Canonical contracts

- Task IDs use one contract: uppercase prefix, at least three digits, and an optional lowercase slug, for example `PF-001-homepage` or `SEC-0001-security`.
- `brief.md` and `acceptance.md` form the approved specification contract.
- `brief.md`, `acceptance.md`, `plan.md`, and `test-plan.md` form the approved plan contract.
- `gate.json` is an index of approvals, evidence paths, SHA-256 digests, derived statuses, the approved baseline, and the implementation fingerprint. It is not the source of truth for report outcomes.
- Artifact schemas live under `harness/schemas/`. Dynamic `docs/specs/*/gate.json` and recognized `.harness/reports/**` files are checked by `schemas:check`.

## Report-derived gate values

`task:gate` parses and validates each JSON report before saving the gate. The following values are derived from report content and cannot be overridden by CLI assertions:

- implementation `passed | failed`;
- verification status, Preview status, rollback confirmation, and observed HEAD;
- review verdict and P0/P1/P2 counts.

Approved gate records must contain a non-empty human/actor identity, timestamp, reason, and contract hash. Schema-invalid gate state is rejected before it is written.

Legacy flags such as `--status`, `--preview-status`, `--rollback-confirmed`, `--verdict`, and `--p0` remain accepted only as optional assertions. A mismatch fails the command.

## Commands

```bash
npm run task:gate -- approve-spec --by "<human>" --reason "..."
npm run task:advance -- SPEC_READY

npm run task:gate -- approve-plan --by "<human>" --reason "..."
npm run task:advance -- PLAN_READY
npm run task:advance -- IMPLEMENTING

npm run task:gate -- record-implementation --by "<actor>" --reason "..." \
  --report .harness/reports/<TASK>/implementation.json
npm run task:advance -- VERIFYING

npm run task:gate -- record-verification --by "<actor>" --reason "..." \
  --report .harness/reports/<TASK>/verification.json \
  --github-context .harness/reports/<TASK>/github-context.json \
  --react-doctor .harness/reports/<TASK>/react-doctor-changed.json
npm run task:advance -- REVIEW_READY

npm run ai:review -- origin/main
npm run task:gate -- record-review --by "<reviewer>" --reason "..." \
  --report .harness/reports/<TASK>/review.json \
  --accepted-p2-evidence .harness/reports/<TASK>/accepted-p2.md
npm run task:gate -- approve-release --by "<human>" --reason "..." --mode preview
npm run task:advance -- DEPLOY_READY
npm run task:complete
```

Omit `--react-doctor` only when the repository is not React-based or the approved change set has no React-relevant files. A passing verification record for React-relevant changes requires a passing, version-matched React Doctor report for the same task and HEAD.

## Evidence snapshot sequence

Evidence recording changes `gate.json`, so use explicit commit boundaries:

1. Commit implementation changes and the implementation report.
2. Record implementation evidence.
3. Commit the updated `gate.json`.
4. Prepare the human-approved push/PR proposal.
5. After remote checks, create the verification, GitHub context, and React Doctor reports for the exact HEAD.
6. Record verification evidence and commit the gate update.
7. Run the independent review. It refreshes `.harness/reports/<TASK>/github-context-review.json`, preserves the verification-bound GitHub report, and finalizes SHA-256 digests for every diagnostic report cited by `review.json`.
8. Record review evidence, commit the review artifacts and gate update, then record human release approval and perform the final transition.

Every later transition replays all earlier evidence gates. Do not amend or rewrite an evidence-bound commit without re-recording all downstream evidence.

## Completion replay

Every downstream transition and `task:complete` rechecks:

- the approved specification and plan hashes;
- gate JSON Schema conformance;
- report JSON Schema and semantic conformance;
- evidence SHA-256 digests;
- implementation allowed paths and change fingerprint;
- verification HEAD equality;
- complete GitHub context and passing/skipped required checks;
- required React Doctor evidence;
- review verdict and severity counts;
- review diagnostic digests and actual verification/GitHub/React Doctor statuses;
- mandatory review coverage of `verification.json`, GitHub context, and React Doctor when React Doctor was required;
- accepted-P2 evidence and human release approval.

Missing, stale, replaced, inconsistent, or unparseable evidence is a failure.

## Recovery and migration

Use `task:rework` to return downstream work to `IMPLEMENTING`. Use `task:rebaseline` only with explicit human approval. Gates using schema `1.0.0` must be migrated with `task:migrate-gates` before other lifecycle commands. Migration creates `gate.v1.0.0.backup.json`, preserves history, and resets downstream evidence to pending; the backup is lifecycle metadata and is excluded from implementation fingerprints. Old reports are not silently treated as passing evidence; rewrite them to the current schemas or return the task to the relevant phase.
