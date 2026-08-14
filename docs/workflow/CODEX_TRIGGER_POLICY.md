# Codex trigger policy

## Overview

Cursor is the interactive orchestrator. Codex is used as a bounded specialist so planning/design conversations remain focused and implementation/review responsibilities stay separated.

```text
Planning: Cursor + human
  └─ optional Codex read-only planning/research
Design: Cursor + human
  └─ optional Codex researcher / stack-architecture facilitation
Development: Cursor or bounded Codex implementer
Verification: deterministic commands
Independent review: separate Codex reviewer when required
Release / operations: Cursor + CI + human control points
```

Every `ai:*` launcher remains subject to Codex preflight, sandbox/tool restrictions, repository policy, and lifecycle state.

## Researcher

Use during task `DESIGNING` when repository-wide investigation would improve the design, for example multi-module impact, reuse discovery, ADR/dependency/external-service decisions, or unclear ownership.

Boundary:

- fresh/ephemeral context;
- read-only;
- no dependency installation;
- no production edits;
- evidence report under `.harness/reports/<TASK>/research.json`.

Research output is input to `design.md` and `test-plan.md`; it is not itself approval.

## Implementer

Use only in task `DEVELOPING` after a fresh human `designApproval` exists and the target acceptance criterion is explicit.

Suitable work includes cross-file implementation whose behavior and allowed paths are already fixed. Cursor remains preferable for tightly interactive visual tuning or very local edits, but either executor must obey the same Design Baseline.

Boundary:

- workspace-write only within authorized paths;
- one bounded AC/work unit per invocation;
- no commit, push, PR, deploy, secret access, or dependency change without a separate authorized path;
- implementation report must contain the approved `design_baseline_hash`.

## Reviewer

Run after verification and before release judgment for runtime/config/test/user-visible changes unless the documented review policy permits omission.

Boundary:

- independent from the implementer session;
- read-only;
- assess diff + approved design + acceptance + verification evidence;
- report under `.harness/reports/<TASK>/review.json`.

## Decision helper

```bash
npm run ai:decide -- research
npm run ai:decide -- implementation
npm run ai:decide -- review
```

The decision helper is deterministic routing support, not authority to bypass lifecycle, design approval, human control points, or verification.
