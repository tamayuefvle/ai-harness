# ADR-0009: Distribution ships a harness npm substrate

- Status: Accepted
- Date: 2026-08-13
- Improvement: IMP-20260813-02

## Context

ADR-0006 keeps CI fail-closed: after the Git root commit, `package.json` plus exactly one npm lockfile are required for `ready`. The distribution overlay previously shipped only package fragments, so the `ai-harness` GitHub repository itself stayed `invalid` on every post-root PR. That is not a product-language decision; the harness CI package manager is npm.

ADR-0006 rejected a dummy application `package.json` because overlay copies could overwrite a real application's metadata.

## Decision

Ship a **private harness substrate** (`package.json` + `package-lock.json`) in the distribution. It contains only harness scripts and harness `devDependencies` from the canonical fragments. It does not select a product stack, add application runtime dependencies, or replace Codex/lifecycle contracts.

Overlay policy:

- Existing application: merge fragments; do not overwrite `package.json` or the application lockfile.
- Clone of this repository as a new workspace: keep the substrate and run `npm ci`. Do not run `bootstrap --write`.

For verification, `package.json.name === "ai-harness"` identifies the distribution substrate and keeps the exact identity contract. Any other package name identifies a product overlay: `verify:harness` requires every fragment script and harness `devDependency` unchanged, permits product additions and independent package metadata, and still checks harness document headings against `PACKAGE_MANIFEST.json`.

`profile:check` skips unresolved resolution. Playwright E2E and React Doctor run only when those profiles are selected. Empty profile lists no longer default-enable React Doctor. Shipping Ajv makes it the primary `schemas:check` provider; schema `if`/`then` clauses that use `properties` declare `type: object` so Ajv `strictTypes` can compile them.

This does not relax ADR-0006's fail-closed states. npm remains the harness CI package manager.

## Rejected alternatives

- Leave the distribution packageless: post-root PRs remain `invalid`.
- Skip CI whenever `package.json` is absent: reopens the deletion bypass ADR-0006 closed.
- Treat the substrate as a product Node application: would imply a stack that has not been approved.

## Rollback

Remove the shipped `package.json` and `package-lock.json`, restore overlay docs, and regenerate. CI of the distribution repository returns to `invalid` after the root commit.
