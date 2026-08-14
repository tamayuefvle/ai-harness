# Cursor × Codex CLI operating model

## Instruction architecture

Shared policy is generated to root `AGENTS.md`. Directory specialization is generated from `harness/rules/*` to `CODEX.md` for Codex and scoped `.cursor/rules/*.mdc` for Cursor. Phase-specific Cursor Skills are generated from canonical `harness/skills/*`.

Generated projections are never the source of truth and must not be edited directly.

## v15 phase context

The always-on instruction layer carries only cross-cutting policy: authority, security, approvals, dangerous-operation restrictions, canonical/generated ownership, and routing boundaries. Detailed procedures are loaded through phase Skills:

- `planning`
- `design`
- `development`
- `executor-fallback`

This keeps planning and design conversations from inheriting implementation procedure unless the lifecycle actually requires it.

## Responsibilities

### Human + Cursor: Planning

- brainstorm and challenge ideas;
- clarify users, problem, outcomes, scope, requirements, assumptions;
- converse freely before publishing canonical checkpoints;
- request read-only research when useful;
- never select implementation details merely to make planning “complete”.

### Human + Cursor: Design

Project Design owns stack, architecture, security/quality baselines, profiles, and project design approval. Task Design owns scope, acceptance, exact behavior, data/API/UX boundaries, test strategy, allowed paths, risks, rollback, and implementation sequence.

Design may propose adjacent features or refinements. A proposal that changes product scope is escalated to product authority; it is not silently converted into implementation work.

### Cursor / Codex implementer: Development

- starts only from a fresh approved Design Baseline;
- performs bounded implementation and tests;
- carries `design_baseline_hash` into implementation evidence;
- does not resolve missing design decisions by inventing behavior;
- returns the task to Design when a design gap blocks correct implementation.

### Deterministic verifier

- replays schema, lifecycle, repository, profile, CI/GitHub, React Doctor or other configured checks;
- records actual evidence;
- never reports an unexecuted check as passed.

### Independent reviewer

- is separate from the implementation context;
- is normally read-only;
- checks approved-design compliance, over/under-change, evidence, security, regressions, migration, rollback, and release readiness.

## Codex delegation

Use `docs/workflow/CODEX_TRIGGER_POLICY.md`. Research and review are read-only. Implementer is workspace-write with bounded scope. Preflight must confirm effective repo-local configuration and trusted hooks before delegated `ai:*` commands.

## Cursor IDE / CLI transport

Cursor IDE and CLI are transports of one logical Cursor executor and share the harness authorization/fallback model. CLI implementer work remains isolated and does not gain production, secret, dependency, or destructive Git authority from being a different transport.

## Example instruction route

For `docs/specs/PF-001/design.md`:

```text
AGENTS.md
├─ docs/CODEX.md
└─ docs/specs/CODEX.md
   or equivalent scoped Cursor rules + design Skill
```

For a product file during `PLANNING`, the planning Skill provides the conversational workflow; for source code during `DEVELOPING`, the development Skill and application/profile rules apply.

Inspect routing with:

```bash
npm run harness:route -- path/to/file
```
