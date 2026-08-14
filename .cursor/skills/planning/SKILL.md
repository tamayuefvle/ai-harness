<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->
<!-- Source: harness/skills/planning/SKILL.md; run npm run harness:generate -->

---
name: planning
description: Use during project PLANNING for conversation-first product ideation, brainstorming, problem framing, outcomes, scope, and requirements without choosing implementation technology.
---

# Planning

Planning owns **Why / What**. Keep the user in product thinking rather than implementation thinking.

## Workflow

1. Confirm project state `PLANNING`; if `MIGRATION_PENDING`, enter planning with `npm run project:plan [--tier lite|full]`.
2. Use `npm run product:status` to understand gaps, but do not force document edits on every conversational turn.
3. Explore first: brainstorm, challenge assumptions, compare product alternatives, clarify users, outcomes, scope, requirements, constraints, and non-goals.
4. Treat canonical `docs/product/**` files as published checkpoints. Update them only when the user asks to consolidate, publish, checkpoint, or approve the current direction.
5. Keep facts, evidence, assumptions, hypotheses, and unknowns distinct. Promoted ideas use `IDEA-xxx`, outcomes `OUT-xxx`, deferred scope `PD-xxx`, validated assumptions `ASM-xxx`.
6. `npm run ai:plan` may be used as an independent read-only planning facilitator. It must not manufacture research evidence.
7. Before planning approval run `npm run product:check`, then record `npm run project:gate -- --gate planning --actor human:<name> --reason <reason>` and advance to `DESIGNING`.

## Boundary

Do not choose the stack, architecture, dependencies, implementation files, or write production code. Technology questions that materially affect product feasibility may be recorded as design questions, not silently decided in planning.
