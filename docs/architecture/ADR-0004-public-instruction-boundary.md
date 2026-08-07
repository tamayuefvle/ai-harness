# ADR-0004: Keep harness instructions outside public web assets

- Status: Accepted
- Date: 2026-07-28
- Improvement: `IMP-20260728-02`

## Context

The harness originally generated `public/AGENTS.md` and a nested Cursor rule.
Frameworks such as Next.js serve files below `public/` as static web content.
That would expose internal development instructions and make a generated control
file part of the deployed application surface.

Codex normally receives role specialization through nested `AGENTS.md` files.
The public directory cannot safely use that pattern, but its canonical asset
rules must still be available to both Codex and Cursor without manual duplication.

## Decision

- `harness/rules/public.md` remains the single canonical Public asset role.
- The generator supports an explicit `append` mode for AGENTS targets.
- The Public asset role is appended to the generated root `AGENTS.md`.
- Cursor receives the same source in `.cursor/rules/public-assets.mdc` with a
  `public/**/*` glob and `alwaysApply: false`.
- No harness instruction is generated under `public/`.
- Synchronization checks reject `public/AGENTS.md`, `public/.cursor`, and
  `public/.codex` even when they are stale or manually added.
- Duplicate replace targets and paths escaping the repository fail closed.

## Consequences

- Public assets remain free of internal harness instructions.
- Codex still receives the asset policy, though it appears in the root command
  center rather than a nested file.
- Multiple canonical sources can safely compose one AGENTS output when the
  manifest explicitly requests append mode.
- The generator contract is stricter; accidental duplicate outputs now fail
  instead of silently overwriting earlier content.

## Rejected alternatives

### Keep `public/AGENTS.md`

Rejected because it can be deployed as a static asset.

### Copy Public asset rules manually into the root source

Rejected because it would create two manually maintained canonical definitions.

### Drop Codex-specific Public asset rules

Rejected because asset licensing, privacy and optimization rules remain relevant
regardless of the agent host.

## Rollback

Revert the manifest, generator, generated outputs and synchronization guard as a
single change. Restoring an instruction file under `public/` is not recommended
and requires an explicit security review.
