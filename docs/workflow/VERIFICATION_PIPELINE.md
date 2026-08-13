# Verification pipeline

## Canonical scripts

`package.scripts.fragment.json` is the canonical verification command map.

- `verify:harness`: generated-rule/Skill synchronization, Capability validation, Execution Safety cross-contract validation, Draft 2020-12 static and dynamic artifact validation, security checks, and all harness tests.
- `verify:static`: lint and typecheck.
- `verify:react`: normalized React Doctor CI validation; full scope on the Git root commit, changed scope once a parent exists.
- `verify:application`: unit/component tests and production build.
- `verify:e2e`: Playwright journeys.
- `verify:ci`: the non-E2E Quality Gate composition.
- `verify:all`: `verify:ci` followed by E2E for local or single-job full verification.

The `Quality Gate` workflow calls `npm run verify:ci`. The dedicated `E2E Gate` workflow installs Playwright and calls `npm run verify:e2e` only when profile resolution includes the `e2e` check, so pull requests do not install browsers or execute E2E twice. Unresolved profile resolution skips `profile:check` instead of failing `verify:ci`.

The Quality workflow passes the event comparison SHA as input. The canonical React Doctor CI wrapper chooses full scope only when `HEAD` is the Git root commit; otherwise it delegates to the normal changed-scope base resolution and fails closed when a React-relevant comparison base cannot be resolved.

## Advisory PR review

CodeRabbit adds early defect discovery inside the existing pull-request activity, but it is not a verification or lifecycle state:

```text
advisory review != deterministic verification
advisory review != canonical independent review evidence
```

Do not add CodeRabbit output to the verification schema or review schema as required evidence, and do not create a CodeRabbit lifecycle state. When CodeRabbit is unavailable, `verify:harness`, the task lifecycle, fresh read-only Codex final review, and release gates continue unchanged.

## Schema validation

`schemas:check` first validates the canonical fixtures listed in `harness/schemas/validation-manifest.json` against Draft 2020-12 schemas. Ajv is the primary Node provider; Python `jsonschema` is the bootstrap fallback.

It then validates dynamic lifecycle artifacts:

- every `docs/specs/*/gate.json`;
- recognized implementation, verification, GitHub context, React Doctor, and review reports under `.harness/reports/`.

Schema validity is necessary but not sufficient. Lifecycle transitions additionally perform semantic checks, such as report-derived statuses, exact HEAD binding, passing required checks, React Doctor version/status consistency, review severity counting, and SHA-256 validation of every diagnostic report cited by the independent review. Review-time GitHub context uses `github-context-review.json` so it cannot replace the verification-bound snapshot.

## Bootstrap-safe npm project state

Before `actions/setup-node`, npm cache resolution, `npm ci`, GitHub context collection, React Doctor, or Playwright, every Node-dependent workflow runs `scripts/harness/ci-project-state.sh`. Full Git history (`fetch-depth: 0`) is required for the classification.

| State | Required repository shape | Workflow result |
|---|---|---|
| `bootstrap` | Git root commit; harness overlay markers present; no `package.json`; no npm or foreign lockfile | pass with explicit notice; Node-dependent steps skipped |
| `ready` | `package.json` plus exactly one of `package-lock.json` or `npm-shrinkwrap.json` | cached setup, `npm ci`, and normal verification |
| `invalid` | every other shape | fail before dependency setup |

The distribution ships a private harness npm substrate so this repository itself is `ready` after the root commit. That substrate is not a product application. Overlay copies must merge `package.scripts.fragment.json` / `package.devDependencies.fragment.json` into an existing application manifest and must not overwrite it. Unresolved profile resolution skips `profile:check`; Playwright E2E and React Doctor remain off until those profiles are selected.

Invalid includes a package without an npm lock, a lock without a package, Yarn/pnpm/Bun locks, both npm lockfiles, symlinked root metadata, and package metadata missing on any non-root commit. The non-root rule prevents CI bypass by deleting the application manifest and lockfile.

The selected npm lockfile is passed to `actions/setup-node` through `cache-dependency-path`. CI never generates or rewrites the lockfile.
