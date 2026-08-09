<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->
<!-- Source: harness/skills/executor-fallback/SKILL.md; run npm run harness:generate -->

---
name: executor-fallback
description: Use after one bounded Cursor implementation strategy fails; preserve failure evidence, obtain an independent read-only Codex diagnosis, and either run one materially different Codex implementation strategy or hand off to the human.
---

# Executor fallback

Use this skill only after a bounded Cursor strategy has failed, or immediately for a human-first operation.

1. Do not repeat the same Cursor strategy without materially new evidence.
2. For MFA, CAPTCHA, interactive authentication, secret creation, payment/contract, legal acceptance, or physical action, skip agent fallback and ask the human to act. Never ask the user to paste a secret into chat.
3. Preserve the failure signature, commands already executed, changed artifacts, and evidence.
4. Write a non-canonical draft input containing the failed goal/strategy/signature, commands, changed artifact refs, evidence refs, Cursor diagnosis, and prohibited repeats; then run `npm run fallback:create -- <draft-input.json>`. Use the returned immutable handoff path.
5. Run `npm run ai:fallback-diagnose -- <handoff.json>`. The Codex diagnostic session is fresh and read-only.
6. If the decision is `alternative_strategy`, run the existing Codex implementer once with that decision; the strategy must be materially different from Cursor's failed strategy.
7. If the decision is `human_decision`, `human_action`, or `blocked`, stop autonomous execution and present the human handoff.
8. If the Codex implementation attempt fails, stop autonomous execution. Do not return automatically to Cursor or launch another Codex attempt.
9. After human action, verify the result read-only before resuming.
10. Final independent review still uses the existing fresh read-only Codex reviewer; never treat the fallback implementation context as review context.
