# Instruction tree

## Principle

上位の `AGENTS.md` は、下位の詳細を重複して持ちません。

- Root: classify, route, control lifecycle, preserve universal safety
- Router: choose a specialized documentation or engineering role
- Leaf role: define concrete implementation, test, or release behavior

## Conflict rule

1. User instruction
2. Active spec and acceptance criteria
3. Universal root safety
4. Deepest applicable role instruction
5. Parent role instruction
6. Existing convention

Deep role may specialize parent behavior, but may not weaken safety, truthfulness, or release approval.

## Multi-path task

A task can require more than one chain.

Example: adding a new project case-study page.

```text
Planning chain:
AGENTS.md
→ docs/AGENTS.md
→ docs/specs/AGENTS.md
→ docs/product/AGENTS.md

Implementation chain:
AGENTS.md
→ src/AGENTS.md
→ src/components/AGENTS.md
→ src/content/AGENTS.md

Verification chain:
AGENTS.md
→ scripts/github/AGENTS.md（GitHub evidenceが必要な場合）
→ tests/AGENTS.md
→ e2e/AGENTS.md

Release chain:
AGENTS.md
→ .github/AGENTS.md
→ docs/AGENTS.md
→ docs/operations/AGENTS.md
```

The active spec is the handoff point joining these chains.
## Public directory boundary

`public/` is deployed as web-visible static content by common frontend frameworks.
Harness instruction files must therefore never be generated below it.

- Codex receives the canonical Public asset role by composition into root `AGENTS.md`.
- Cursor receives the same source through `.cursor/rules/public-assets.mdc` with the `public/**/*` glob.
- `npm run harness:check` rejects `public/AGENTS.md`, `public/.cursor`, and `public/.codex`.

This is an intentional exception to the normal nested-instruction pattern.

