# Product lifecycle role

## Objective

Manage discovery, product requirements, measurable outcomes, and technology-decision inputs before implementation.

## Rules

- `DISCOVERY` and product approval are code-read-only.
- Define the problem, users, outcomes, constraints, and non-functional requirements before comparing stacks.
- Separate evidence, assumptions, hypotheses, and unknowns.
- Do not treat the migrated Next.js profile as a universal default.
- Product approval hashes the required documents; changes after approval require a new project-decision change.
- Run `npm run product:check` before `project:gate --to PRODUCT_APPROVED`.
- Promoted `IDEA-xxx` backlog rows must trace into requirements.
- Must requirements must reference declared `OUT-xxx` outcomes.
- Full-tier Won't items must reference `docs/product/decisions/PD-xxx-*.md`.
- Must items referencing `ASM-xxx` require validated assumptions in `docs/product/assumptions.md`.
- Research-like claims require `[session:DISC-…]`, `[source:…]`, or validated `[assumption:ASM-xxx]`.
- Link operational signals to product traces via `docs/product/signal-feedback.md`.
- Use `npm run ai:discover` during DISCOVERY to record Codex read-only session artifacts.
- Never invent user research, market facts, metrics, credentials, or external evidence.
