# Technology decision

## Status

Migration candidate from v10.1.1; human approval is required.

## Current candidate

Node.js LTS, npm, TypeScript, React, Next.js App Router, Vitest/React Testing Library, Playwright, React Doctor, GitHub Actions, Vercel, and basic web observability.

## Rationale

This preserves the existing v10.1.1 portfolio baseline. It is not a universal default. New projects must compare alternatives from their requirements before activating profiles.

## References

- `docs/architecture/ADR-0001-stack.md` retains the historical v10 decision.
- `harness/project.json` records migration state and proposed profiles.
