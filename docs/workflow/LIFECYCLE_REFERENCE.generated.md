<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->
<!-- Source: harness/lifecycle/manifest.json; run npm run harness:generate -->

# Lifecycle reference

## project

- Initial: `DISCOVERY`
- Active: `MIGRATION_PENDING` → `DISCOVERY` → `PRODUCT_APPROVED` → `STACK_APPROVED` → `ARCHITECTURE_APPROVED` → `ACTIVE`
- Terminal: `RETIRED`

| From | To | Approval | Required documents |
|---|---|---|---|
| `MIGRATION_PENDING` | `ACTIVE` | human | `docs/product/vision.md`<br>`docs/product/scope.md`<br>`docs/product/technology-decision.md`<br>`docs/architecture/ADR-0001-stack.md`<br>`docs/architecture/baseline.md` |
| `DISCOVERY` | `PRODUCT_APPROVED` | human | `docs/product/problem.md`<br>`docs/product/users.md`<br>`docs/product/outcomes.md`<br>`docs/product/requirements.md` |
| `PRODUCT_APPROVED` | `STACK_APPROVED` | human | `docs/product/technology-options.md`<br>`docs/product/technology-decision.md` |
| `STACK_APPROVED` | `ARCHITECTURE_APPROVED` | human | `docs/architecture/baseline.md`<br>`docs/architecture/security-baseline.md`<br>`docs/architecture/quality-strategy.md` |
| `ARCHITECTURE_APPROVED` | `ACTIVE` | human | `harness/generated/profile-resolution.json` |
| `ACTIVE` | `RETIRED` | human | `docs/operations/retirement-plan.md` |

## task

- Initial: `IDEA`
- Active: `IDEA` → `SPEC_READY` → `PLAN_READY` → `IMPLEMENTING` → `VERIFYING` → `REVIEW_READY` → `DEPLOY_READY`
- Terminal: `DONE`

| From | To | Approval | Required documents |
|---|---|---|---|
| `IDEA` | `SPEC_READY` | human | `docs/specs/{{TASK_ID}}/brief.md`<br>`docs/specs/{{TASK_ID}}/acceptance.md` |
| `SPEC_READY` | `PLAN_READY` | human | `docs/specs/{{TASK_ID}}/plan.md`<br>`docs/specs/{{TASK_ID}}/test-plan.md` |
| `PLAN_READY` | `IMPLEMENTING` | none | — |
| `IMPLEMENTING` | `VERIFYING` | none | — |
| `VERIFYING` | `REVIEW_READY` | none | — |
| `REVIEW_READY` | `DEPLOY_READY` | human | — |
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

