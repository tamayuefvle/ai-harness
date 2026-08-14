# ADR-0011 — Provider instruction and hook trust boundaries

- Status: Accepted
- Date: 2026-08-14
- Owner: approved improvement IMP-20260814-04

## Context

v14 retired nested `AGENTS.md` generation, but canonical rules and generated projections still described nested AGENTS routing. Codex preflight proved only that project config was effective, not that the project safety hook was discovered, enabled, and trusted. Cursor security-critical `preToolUse` hooks failed open. Planning document fixtures duplicated full markdown bodies inside JavaScript.

## Decision

1. Keep a single shared root `AGENTS.md`. Directory specialization is `CODEX.md` for Codex and scoped `.cursor/rules/*.mdc` for Cursor. Nested `AGENTS.md` is not generated.
2. `codex:preflight` requires effective repo-local config **and** project hook discovery, enabled state, and current-definition trust via read-only `hooks/list`. Trust remains a human decision.
3. Cursor security-critical `preToolUse` hooks are fail-closed and sit in layered controls with CLI permissions, IDE approvals, sandbox, worktree isolation, authorization, and human control points.
4. Planning seed documents have one canonical directory: `harness/templates/planning`. Live `docs/product/*` and `docs/architecture/*` remain mutable project state after bootstrap.

## Rejected alternatives

- Reintroduce nested `AGENTS.md`
- Parse or write Codex private trust files
- Make hook trust bypass a normal operational path
- Keep Cursor fail-open `preToolUse`
- Keep full planning document bodies duplicated in JavaScript

## Consequences

- Stale nested AGENTS references are a deterministic canonical check.
- Codex hook trust is a human checkpoint before delegated `ai:*`.
- Cursor hook infrastructure failure blocks the action.
- Planning templates have a single canonical directory; migration does not overwrite filled live docs.

## Rollback

Restore v14.9.3 canonical rules, policy projection, and preflight, then run `npm run harness:generate`. No persistent lifecycle or task-state migration is required.
