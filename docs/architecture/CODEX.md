<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->
<!-- Source: harness/rules/architecture.md; consumer: codex; run npm run harness:generate -->
# Design / architecture role

## Scope

Design owns **How / Exactly what to build**: technology selection, architecture, data/control boundaries, security and quality baselines, selected profiles, task-level behavior, affected paths, tests, risks, and rollback.

## Project design

- Project state must be `DESIGNING` with a fresh planning gate.
- Technology records live under `docs/architecture/technology-options.md` and `technology-decision.md`.
- Selected profiles must exist in `harness/profiles/registry.json`; shipped framework profiles are optional, not defaults.
- `stack:check` precedes the human `stack` gate; `architecture:check` precedes the human `architecture` gate.
- Resolve profiles before the composite human `design` gate and transition to `ACTIVE`.
- Project design is implementation-read-only.

## Decision rules

- Inspect existing ADRs and implementation first; distinguish reversible local choices from long-lived architecture decisions.
- Compare a new production dependency against standard APIs, small local implementation, and existing dependencies; require human approval where policy demands it.
- ADRs record context, options, decision, consequences, and revisit conditions.
- Quality attributes trace to approved `OUT-xxx` outcomes.
- Product-scope expansion discovered in design must be proposed back to planning/product decision rather than silently accepted.
