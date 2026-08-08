# Changelog

## v12.0.0 - 2026-08-07

- Redesigned package metadata (`PACKAGE_MANIFEST.json` schemaVersion 2.0.0) with core / optionalProfiles / generated categories; removed maintainer-only fields.
- Replaced maintainer-style root rules with user `user-root-policy` and `user-task-dispatcher` (generated as `00-user-root-policy.mdc` / `01-user-task-dispatcher.mdc`).
- Separated bootstrap template (`harness/templates/project.bootstrap.json`) from live `harness/project.json`; default `projectId` is `change-me` with empty `proposedProfiles`.
- Shipped unresolved `profile-resolution.json` stub until profiles are chosen and resolved.
- Added `optionalPaths` / `optionalRuleSources` to stack profiles; stack rules generate only when matching profiles are active or proposed.
- Soft-templated product docs and architecture baseline; dropped completed PF specs and internal improvement records from the distribution bundle.
- Renamed Cursor command `portfolio` → `develop` for generic project development entry.
- Added fail-closed `codex:preflight` and `harness:doctor`; Chrome DevTools MCP is a complete disabled-by-default config entry, and role launchers no longer use partial `-c mcp_servers.*` overrides. Project trust is diagnosed only and never auto-written.
- Added inventory-scoped `security:check` (FILE_INVENTORY only) and wired it into `verify:harness`.
- Added GitHub `productionEnvironment` contract (integration schema 2.1.0), read-only `github:production-environment-check`, and bounded GitHub context `reasonCode` values.
- Added package-less onboarding via `NEW_REPOSITORY_SETUP.md` and dependency-free `bootstrap-new-repository.mjs` (check/write; does not advance lifecycle, projectId, or profiles).
- Updated GitHub-owned Actions (`checkout`, `setup-node`, `upload-artifact`) to major v7.

## v11.0.0 - 2026-08-06

- Added canonical project, task, release, and incident lifecycle manifest.
- Added migration-gated product discovery, technology selection, and architecture baselines.
- Extracted the existing Next.js/React/npm assumptions into composable technology profiles.
- Added profile dependency/conflict resolution and profile-specific verification commands.
- Added release evidence, production approval records, deployment observation, incidents, operational signals, and improvement proposals.
- Preserved lifecycle gate schema 1.1.0 and the v10.1.1 delivery task states for compatibility.
- Added deterministic schemas, fixtures, tests, migration guide, ADR-0007, implementation record, and independent review.

## v10.1.1 - 2026-08-06

### Fixed

- Added a fail-closed npm CI project-state preflight so a harness-only Git root commit can pass with an explicit bootstrap notice instead of failing in `actions/setup-node` cache resolution.
- Required a complete harness overlay for the one-time root bootstrap, then `package.json` plus exactly one npm lockfile on every ready or post-bootstrap commit; rejected missing/deleted metadata, foreign or multiple lockfiles, symlinked root metadata, and shallow history.
- Deferred cached `actions/setup-node`, `npm ci`, GitHub context, React Doctor, and Playwright until the project is classified as ready.
- Passed the canonical npm lockfile explicitly through `cache-dependency-path` and enabled full-history checkout in E2E.
- Added root-commit React Doctor full-scan selection while preserving changed-scope validation for commits with a parent.

### Added

- `scripts/harness/ci-project-state.sh` and adversarial project-state tests.
- `scripts/harness/react-doctor-ci.mjs` and root/non-root scope tests.
- ADR-0006 and improvement record IMP-20260806-01.

### Compatibility

- npm is now explicit as the canonical CI package manager. Yarn, pnpm, and Bun repositories require a separately approved workflow migration.
- Target applications keep their own `package.json` and lockfile; the harness package remains an overlay and does not ship dummy dependency metadata.

## v10.1.0 - 2026-08-05

### Fixed

- Replaced trusted CLI lifecycle outcomes with report-derived implementation, verification, Preview, rollback, review verdict, and severity values.
- Added fail-closed JSON Schema and semantic validation for implementation, verification, GitHub context, React Doctor, review, and lifecycle gate artifacts.
- Replayed approved specification and plan contract hashes at every downstream transition and terminal completion.
- Restricted implementation-fingerprint exclusions to explicit lifecycle metadata instead of the entire active specification directory.
- Unified task-ID validation across task creation, worklog, lifecycle, schemas, and GitHub push proposals.
- Standardized review verdict vocabulary on `approved | changes_requested`.
- Required complete GitHub context, a pull request, and passing/skipped required checks for passing verification evidence.
- Required passing, version-matched React Doctor evidence for React-relevant changes at the same task and HEAD.
- Replayed all earlier evidence gates at each later transition, rejected symlinked evidence, and required complete approval metadata before writing gate state.
- Separated review-time GitHub context from the verification snapshot and bound independent-review diagnostics to canonical paths, actual statuses, task/HEAD, and SHA-256 digests.
- Added schema `1.1.0` migration guidance and dynamic validation of task gates and recognized evidence reports.
- Removed duplicate Playwright installation and E2E execution from the Quality workflow; E2E remains in its dedicated workflow.
- Corrected MCP documentation wording and the stale version label in a rule test.

### Verification

- 103 deterministic harness tests passed, including adversarial completion tests for invalid JSON, failed-verification masquerading, review-count masquerading, stale contracts, failed GitHub checks, and invalid gate schemas.
- 12 Draft 2020-12 canonical schema cases and dynamic lifecycle artifact validation passed.

## v10.0.0 - 2026-08-05

### Added

- Mechanical lifecycle gate validation without introducing a second state machine.
- `gate.json` approval/evidence index with semantic contract hashes, approved baseline, change-set fingerprint, evidence SHA-256, rework and rebaseline operations.
- Canonical verification groups: `verify:harness`, `verify:static`, `verify:react`, `verify:application`, `verify:e2e`, and `verify:ci`.
- Draft 2020-12 schema validation manifest, canonical fixtures, Ajv provider, and Python jsonschema bootstrap fallback.
- CI regression tests preventing hand-written duplication of harness test commands.
- Required structured `test_discipline` evidence with lifecycle semantic validation.
- Append-only Worklog correction command and hardened Worklog input validation.
- Shared local-date/UTC time utility and explicit time policy.

### Changed

- Context7 fallback policy is normative only in the Capability manifest; prompts and rules reference it instead of copying its conditions.
- Documentation Capability routing is separated from optional MCP browser routing.
- `DONE` is documented as a terminal completion outcome rather than an active status.
- Feature-branch push/PR proposals may be prepared after recorded implementation evidence so remote checks can run; final release still requires verification, review, and human approval.
- GitHub Actions now invokes the canonical `verify:ci` entrypoint.
- Active-spec and completion calendar dates now use the execution environment's local date, while approvals and evidence retain UTC ISO 8601 timestamps.
- Worklog entries now include local time, IANA time zone, UTC time, evidence paths, and immutable correction references.

### Security and integrity

- Missing, stale, replaced, or unparseable lifecycle evidence fails closed.
- Evidence files are bound by SHA-256; verification is bound to the exact recorded HEAD; completion revalidates implementation, verification, GitHub, React Doctor, review, and accepted-P2 evidence.
- Plan changes invalidate approval through semantic contract hashes.
- Worklog rejects secret-like values, multiline/structure injection, traversal, unsafe evidence links, invalid enums, and unknown options.

## v9.0.0 - 2026-08-04

- Added a declarative Capability Layer without introducing a second workflow.
- Added duplicate-capability discovery and reuse/extend/replace/create planning gate.
- Applied SDD contract and internal TDD principles to existing v8 stages.
- Replaced GitHub MCP with GitHub CLI over HTTPS and approval-gated push proposals.
- Removed Context7 MCP; retained optional Context7 CLI discovery through Documentation Capability.
- Added deterministic Documentation Capability routing and non-blocking fallback.
- Retained Chrome DevTools MCP only as an optional Browser Capability provider.
- Incorporated v8 operational fixes: worklog contract, local-date IDs, Codex structured-output required evidence, valid MCP disable flags, and commit-SHA React Doctor bases.

## v8 — 2026-07-28

### Added

- explicit append composition for generated AGENTS targets
- fail-closed duplicate-target and repository-path validation
- public-directory instruction safety checks
- rule generator regression tests wired into CI
- ADR-0004 and PF-003 improvement records

### Changed

- Public asset rules are composed into root `AGENTS.md` for Codex
- Cursor public asset rules now live at `.cursor/rules/public-assets.mdc` and apply only to `public/**/*`
- `harness:check` now verifies synchronization and the public deployment boundary

### Removed

- `public/AGENTS.md`
- `public/.cursor/rules/assets.mdc`

## v7 — 2026-07-28

### Added

- deterministic read-only GitHub CLI context gateway and doctor
- versioned GitHub integration configuration and JSON Schemas
- GitHub context and optional MCP unit tests
- optional OAuth Docker GitHub MCP launcher with read-only, lockdown and limited toolsets
- GitHub integration ADR, operating guide, migration and rollback records
- ZIP-extraction Git hook installation regression tests

### Changed

- GitHub MCP removed from default Cursor and Codex configuration
- researcher and reviewer receive normalized GitHub context reports
- quality workflow runs all harness tests and uploads GitHub/React Doctor evidence
- `verify:ci` includes GitHub, Git hook and React Doctor harness tests
- Git hook installer restores and verifies POSIX execute permissions

### Removed

- PAT-file-based `scripts/mcp/start-github-mcp.sh`
- `GITHUB_PAT_TOKEN` from the committed MCP environment example

### Known limitation

- optional GitHub MCP used an exact release tag but was not registry-digest pinned in the historical v7 design
