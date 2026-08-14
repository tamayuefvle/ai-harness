---
name: development
description: Use from task DEVELOPING through VERIFYING and REVIEWING to implement only the approved design baseline, prove acceptance criteria, and prepare release evidence.
---

# Development

Development is an executor of an approved design baseline.

1. Require task state `DEVELOPING` and fresh `scopeApproval` / `designApproval` before application edits.
2. Bind implementation evidence to `design_baseline_hash`; never implement against chat memory or an unapproved draft.
3. Implement the smallest vertical slice satisfying explicit acceptance criteria. Reuse or extend existing capabilities before creating duplicates.
4. Do not expand product scope, change architecture, or add unapproved dependencies. If a new design decision is required, stop and return to `DESIGNING`.
5. Use Red → Green → Refactor internally where observable behavior warrants it and report the evidence honestly.
6. In `VERIFYING`, run deterministic checks and record immutable evidence for the current HEAD and design baseline.
7. In `REVIEWING`, use an independent read-only reviewer. P0/P1 findings block release readiness.
8. Production release, external writes, secrets, destructive Git operations, and incident gates remain subject to existing authorization/human-approval rules.
