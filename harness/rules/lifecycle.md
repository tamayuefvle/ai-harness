# Phase / gate lifecycle controller

`harness/lifecycle/manifest.json` is the canonical transition source. Keep four concepts separate:

- **Phase/state**: what work is happening now.
- **Gate**: what a human approved or deterministic verification fixed as evidence.
- **Artifact**: the canonical source of truth for a decision or design.
- **Agent**: what a role may read/write during the current phase.

Project phases are `MIGRATION_PENDING → PLANNING → DESIGNING → ACTIVE`, with terminal `RETIRED`; planning/stack/architecture/design approvals are project gates rather than pseudo-states. Task phases are `DESIGNING → DEVELOPING → VERIFYING → REVIEWING → DEPLOY_READY`, with terminal `DONE`. Release and incident lifecycles remain separate. Full lifecycle mode blocks delivery until project `ACTIVE`; delivery-only mode is controlled migration compatibility.
