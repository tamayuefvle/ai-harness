# ADR-0011 — Provider instruction and hook trust boundaries

- Status: Accepted
- Date: 2026-08-14
- Decision owner: approved improvement `IMP-20260814-04`

## Context

v14 moved directory-specific instructions away from nested `AGENTS.md`, but several canonical rule bodies still named retired paths and regenerated them into `CODEX.md`. Separately, provider trust and hook failure behavior can make a configured policy appear present while it is not actually enforced. Planning test isolation also introduced duplicate seed text.

## Decision

1. `AGENTS.md` is shared root policy only. Codex directory specialization uses generated `CODEX.md`; Cursor directory specialization uses scoped generated `.cursor/rules/*.mdc`. Canonical rule validation rejects nested `.../AGENTS.md` path references.
2. Codex delegated execution requires both effective repository config and verified current project-hook state. The preflight queries `codex app-server` `hooks/list` read-only and requires the repository hook to be discovered, enabled, and trusted. For linked Git worktrees, a root-checkout project-hook source is accepted only when its manifest is semantically identical to the current worktree copy. Trust remains a human action; the harness does not edit user trust state or normalize bypassing trust.
3. Cursor security-critical `preToolUse` policy is fail-closed. Permissions, approvals/sandbox, policy hook, and implementer worktree isolation are complementary controls.
4. Planning seed content is canonical under `harness/templates/planning`. Harness tests consume those templates, and the distribution keeps its shipped seed copies synchronized; live product/architecture documents become mutable project state after initialization.

## Rejected alternatives

- Reintroducing nested `AGENTS.md`: recreates same-consumer duplication and conflicts with the v14 projection model.
- Parsing or writing private Codex trust files, or routinely bypassing hook trust: couples the harness to user-private implementation details and removes the human approval boundary.
- Keeping Cursor hooks fail-open and relying only on project permissions: a security-critical policy failure could permit an operation the canonical policy intended to deny.
- Keeping full planning templates duplicated in JavaScript fixtures: creates two manually maintained definitions.

## Consequences

- Provider projections have a deterministic stale-reference check.
- Machines that intend to use delegated Codex commands must establish both project and current hook trust before `ai:*` can run.
- Cursor hook infrastructure failures stop affected tool calls instead of silently allowing them.
- Planning template edits happen in one canonical directory; live filled documents are not automatically overwritten.

## Rollback

Restore v14.9.3 canonical rule/policy/preflight behavior and regenerate projections. No project lifecycle or persistent task-state migration is required.

## Reconsider when

Provider-native instruction routing or hook/trust APIs materially change, or a stronger first-party policy primitive makes the project hook redundant.
