# ADR-0006: Bootstrap-safe npm CI

Status: Accepted
Date: 2026-08-06

## Context

The harness is distributed as an overlay for an existing or newly bootstrapped application. It intentionally contains package fragments rather than a complete `package.json` and lockfile. The v10.1.0 workflows nevertheless enabled npm caching and ran `npm ci` unconditionally, so a harness-only initial commit failed before any repository checks could run.

Simply disabling cache would move the failure to `npm ci`, while allowing every package-less commit to pass would let later commits bypass CI by deleting project metadata. React Doctor changed-scope validation also has no valid comparison base on a root commit that already contains a complete application.

## Decision

Adopt one fail-closed CI project-state preflight with three outcomes:

```text
bootstrap = root commit, complete harness overlay markers, no package.json, no supported or foreign lockfile
ready     = package.json plus exactly one of package-lock.json or npm-shrinkwrap.json
invalid   = every other state
```

Only `bootstrap` and `ready` exit successfully. `bootstrap` skips Node-dependent checks with an explicit notice. A second or later commit without project metadata fails, including metadata deletion after a previously ready state. Foreign package-manager locks, multiple npm locks, and symlinked root metadata also fail.

All npm workflows run the preflight before `actions/setup-node`, pass the selected npm lockfile to `cache-dependency-path`, and use `npm ci`. Full Git history is checked out so root-commit classification cannot be confused with a shallow clone.

The canonical React Doctor CI wrapper selects `full` for a root commit and `changed` when a parent exists. The dedicated Action applies the same scope selection after the project-state preflight.

## Consequences

- A harness-only initial commit can establish repository structure without a false dependency failure.
- The next commit must establish a complete npm project; the exception cannot become a permanent CI bypass.
- npm is the explicit CI package manager until a separately approved migration changes workflows, scripts, tests, and documentation together.
- Root application commits receive a whole-project React Doctor scan rather than an invalid diff.
- E2E also uses full history, with a small checkout cost increase.
- Repositories using Yarn, pnpm, or Bun must migrate the harness contract rather than silently mixing package managers.

## Rejected alternatives

- **Remove npm caching only:** `npm ci` would still require a lockfile.
- **Use `npm install` in CI:** would weaken reproducibility and permit lockfile mutation.
- **Ship a dummy package.json/lockfile:** would conflict with the overlay model and risk overwriting application metadata.
- **Skip whenever package.json is absent:** would allow post-bootstrap CI bypass through deletion.

## References

- actions/setup-node README and advanced lockfile guidance
- React Doctor GitHub Action and CLI scope references
