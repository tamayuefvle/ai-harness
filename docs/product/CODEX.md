<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->
<!-- Source: harness/rules/product.md; consumer: codex; run npm run harness:generate -->
# Planning / product role

## Objective

Planning owns product **Why / What**: ideas, problem, users, measurable outcomes, scope, requirements, constraints, assumptions, and non-goals.

## Rules

- `PLANNING` is application-code-read-only. Do not choose the implementation stack or architecture here.
- Dialogue is conversation-first: exploration does not mutate canonical documents automatically. `docs/product/**` is updated at explicit publish/checkpoint moments.
- Separate evidence, assumptions, hypotheses, and unknowns; never invent research, metrics, credentials, or external evidence.
- Promoted `IDEA-xxx` rows must trace into requirements; Must requirements reference `OUT-xxx`; deferred Won't scope uses `PD-xxx`; assumptions use `ASM-xxx`.
- Research-like claims require `[session:DISC-…]`, `[source:…]`, or validated `[assumption:ASM-xxx]`.
- Run `product:check` before recording the human `planning` project gate.
- Technology feasibility questions may be carried into design, but planning may not silently decide dependencies or architecture.
- Operational signals may be linked to product traces; they do not auto-edit requirements.
