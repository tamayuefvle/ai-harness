# Human control points

## Purpose

This document is the cross-lifecycle index for decisions that must remain human-controlled. It is **not** a second state machine and does not replace the canonical lifecycle, capability, security, or repository contracts. Transition truth remains in `harness/lifecycle/manifest.json`; provider risk/approval truth remains in `harness/capabilities/manifest.json`; bootstrap-specific checkpoints remain in `NEW_REPOSITORY_SETUP.md`.

The goal is risk-based human oversight, not blanket manual approval. Read-only research, deterministic verification, and scoped reversible local edits should remain automated when the active spec and role permissions already authorize them. Add a human checkpoint when the action changes authority, creates a high-impact external effect, weakens a quality/security control, or is difficult to reverse.

## Approval contract

Before asking for approval, present a decision packet containing the smallest useful set of facts:

- exact proposed action and target;
- why it is necessary and the accepted scope/decision that authorizes considering it;
- material evidence and failed/alternative options;
- external systems, data, credentials, permissions, or users affected;
- rollback/recovery path and blast radius;
- the exact operation the approval will authorize.

Approval is **specific and non-transferable**. A trust decision does not authorize a dependency install; plan approval does not authorize production deployment; commit approval does not authorize push; release approval does not authorize unrelated infrastructure or security-policy changes. If the material scope, target, permission, dependency, or risk evidence changes after approval, stop and obtain a new approval for the changed decision.

Do not request secrets as evidence. Record actor identity as `human:<name>` where the lifecycle contract requires it, together with a reason and the repository evidence path.

## Lifecycle approval vs Operation approval

**Lifecycle approval** authorizes a canonical Project/Task/Release/Incident transition or bounded lifecycle decision and remains owned by `harness/lifecycle/manifest.json` plus the existing gate artifacts. **Operation approval** authorizes one sensitive runtime effect and is represented by `harness/schemas/operation-approval.schema.json`.

Operation approval binds `capabilityId`, `providerId`, `operation`, target, argument digest, run/operation identity, decision, and human actor. It never advances a lifecycle by itself. Lifecycle approval never substitutes for an operation approval when the capability/authorization contract requires one. `changes_requested` is a review/workflow outcome, not an approval decision.

The execution kernel may pause a run at `AWAITING_APPROVAL`, but the Task/Project/Release/Incident state remains unchanged until its own canonical lifecycle command advances it.

## Control-point catalog

| ID | Trigger | Human decision | Agent behavior before approval | Resume condition |
|---|---|---|---|---|
| HCP-01 | Existing lifecycle gates: spec, plan, project `ACTIVE`, rebaseline, release/production, incident mitigation | Approve the bounded decision represented by the canonical lifecycle gate | Prepare evidence; do not synthesize a human actor or advance the gate | Canonical gate records the explicit human decision |
| HCP-02 | Adding/enabling an MCP or capability provider, adding an external-write/production operation, expanding OAuth/auth scopes, or changing tool permissions | Accept the new authority and blast radius | Keep the provider disabled/read-only where possible; inspect config and primary docs; do not self-authorize | Explicit approval identifies provider, operations/scopes, target, and reason |
| HCP-03 | New production dependency, or an update that introduces a material supply-chain risk signal (new source/registry, install lifecycle script, license-policy exception, known high/critical vulnerability exception, unexpected transitive expansion) | Accept the dependency/risk or choose an alternative | Present package/version/source/purpose and available dependency-review/audit evidence; do not use force/audit-fix bypasses | Explicit approval covers the dependency decision or the risk exception |
| HCP-04 | Security-relevant configuration or permission change: authentication/authorization, CI/workflow permissions, branch/ruleset/Environment protections, network exposure, secret lifecycle, production infrastructure | Accept the security-boundary change | Keep current boundary; produce diff, threat/impact analysis, least-privilege alternative, and rollback | Explicit approval names the affected control and intended new state |
| HCP-05 | Production data migration, backfill, retention change, destructive transform, or other change whose recovery depends on backup/restore | Accept data impact and recovery plan | Do not write production data; present backup/restore target, validation, rollout/rollback, and affected data set | Explicit approval after recovery evidence is available |
| HCP-06 | Exception/waiver to a quality or security control: accepted material review finding, global/static-analysis suppression, vulnerability/license exception, disabled required protection, or equivalent risk acceptance | Accept the residual risk | Prefer remediation or a narrow local exception; never mark a failing required check as passed | Human record contains scope, reason, owner, and revisit/expiry condition where applicable |
| HCP-07 | Material externally published facts, contact destinations, privacy-affecting telemetry, or licensed assets | Confirm truth, privacy, destination, and usage rights | Keep uncertain values as pending/placeholders; do not invent claims or consent | Human confirms the exact public value/policy/asset decision |

## Human action handoff

Human controlには「判断」と「実作業」を区別する。`human_decision`は仕様・設計・リスク受容など権限者の判断が必要な場合、`human_action`はMFA/SSO/CAPTCHA、Secret登録、OS/GUI/物理操作など人間が実行する方が確実または本人性が必要な場合に使う。これはLifecycle approvalやOperation approvalを置き換えない。

Cursorのbounded strategy失敗後はCodexがread-onlyで独立診断し、別戦略が無ければHuman Handoffへ進む。人間の操作後はAgentがread-onlyで結果を検証してからresumeする。Secretそのものをhandoff evidenceとして要求してはならない。

## Friction controls

Do **not** add a new approval prompt when an existing explicit approval already names the exact operation, target, and risk covered by one of the control points above. Do not make humans re-approve deterministic evidence collection, read-only diagnostics, retries of idempotent read operations, or edits already bounded by an approved plan unless new risk information appears.

Use automation to produce evidence first, then ask the human to decide only what cannot be safely or legitimately delegated.

## Tool and MCP notes

MCP tool annotations such as read-only/destructive/open-world are risk hints, not security guarantees. Treat annotations from untrusted servers as untrusted and keep enforcement in the capability manifest, sandbox/runtime policy, and explicit approval boundaries. A newly installed or newly enabled server is not authorized merely because it declares itself read-only.

For external-write and production capabilities, `harness/capabilities/manifest.json` must declare a non-`none` approval policy. `npm run capabilities:check` rejects an external-write/production provider that omits human approval semantics.

## Supply-chain notes

Human review is conditional on material risk, not every lockfile churn. Prefer deterministic dependency review, vulnerability/license information, provenance/source checks, and a small diff. If a check is unavailable because of GitHub plan/visibility or package-manager limitations, report the missing evidence rather than claiming it passed.

## Exceptions

A human may accept a bounded residual risk, but the agent may not create its own waiver. An exception must not rewrite failed evidence into success, bypass a mandatory lifecycle transition, expose secrets, permit force push/destructive Git, or authorize an operation that the harness marks as always prohibited.
