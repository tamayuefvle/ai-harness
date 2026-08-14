<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->
<!-- Source: harness/lifecycle/manifest.json; run npm run harness:generate -->

# Lifecycle reference

## project

- Initial: `PLANNING`
- Active: `MIGRATION_PENDING` → `PLANNING` → `DESIGNING` → `ACTIVE`
- Terminal: `RETIRED`

| From | To | Approval | Required documents |
|---|---|---|---|
| `MIGRATION_PENDING` | `PLANNING` | none | — |
| `MIGRATION_PENDING` | `ACTIVE` | human | `docs/product/vision.md`<br>`docs/product/scope.md`<br>`docs/architecture/technology-decision.md`<br>`docs/architecture/ADR-0001-stack.md`<br>`docs/architecture/baseline.md` |
| `PLANNING` | `DESIGNING` | gate:planning | `docs/product/problem.md`<br>`docs/product/users.md`<br>`docs/product/outcomes.md`<br>`docs/product/requirements.md` |
| `DESIGNING` | `PLANNING` | human | — |
| `DESIGNING` | `ACTIVE` | gate:design | `docs/architecture/technology-options.md`<br>`docs/architecture/technology-decision.md`<br>`docs/architecture/baseline.md`<br>`docs/architecture/security-baseline.md`<br>`docs/architecture/quality-strategy.md`<br>`harness/generated/profile-resolution.json` |
| `ACTIVE` | `RETIRED` | human | `docs/operations/retirement-plan.md` |

## task

- Initial: `DESIGNING`
- Active: `DESIGNING` → `DEVELOPING` → `VERIFYING` → `REVIEWING` → `DEPLOY_READY`
- Terminal: `DONE`

| From | To | Approval | Required documents |
|---|---|---|---|
| `DESIGNING` | `DEVELOPING` | gate:design | `docs/specs/{{TASK_ID}}/brief.md`<br>`docs/specs/{{TASK_ID}}/acceptance.md`<br>`docs/specs/{{TASK_ID}}/design.md`<br>`docs/specs/{{TASK_ID}}/test-plan.md` |
| `DEVELOPING` | `VERIFYING` | none | — |
| `VERIFYING` | `REVIEWING` | none | — |
| `REVIEWING` | `DEPLOY_READY` | gate:release | — |
| `DEPLOY_READY` | `DONE` | none | — |

## release

- Initial: `CANDIDATE`
- Active: `CANDIDATE` → `PREVIEW_VERIFIED` → `PRODUCTION_APPROVED` → `DEPLOYED` → `OBSERVING`
- Terminal: `ACCEPTED`, `ROLLED_BACK`, `CANCELLED`

| From | To | Approval | Required documents |
|---|---|---|---|
| `CANDIDATE` | `PREVIEW_VERIFIED` | none | — |
| `PREVIEW_VERIFIED` | `PRODUCTION_APPROVED` | human | — |
| `PRODUCTION_APPROVED` | `DEPLOYED` | human | — |
| `DEPLOYED` | `OBSERVING` | none | — |
| `OBSERVING` | `ACCEPTED` | human | — |
| `DEPLOYED` | `ROLLED_BACK` | human | — |
| `CANDIDATE` | `CANCELLED` | human | — |

## incident

- Initial: `DETECTED`
- Active: `DETECTED` → `TRIAGED` → `MITIGATION_APPROVED` → `RECOVERED` → `POSTMORTEM_READY`
- Terminal: `CLOSED`

| From | To | Approval | Required documents |
|---|---|---|---|
| `DETECTED` | `TRIAGED` | none | — |
| `TRIAGED` | `MITIGATION_APPROVED` | human | — |
| `MITIGATION_APPROVED` | `RECOVERED` | human | — |
| `RECOVERED` | `POSTMORTEM_READY` | none | — |
| `POSTMORTEM_READY` | `CLOSED` | human | — |

