# v11.0.0 independent review

## Verdict

Approved for packaging with documented constraints.

## Findings

### BLOCKER

None.

### HIGH

None.

### MEDIUM-1 — Bundled stack coverage remains Next.js/React/npm

The architecture is profile-based, but the bundled profiles, bootstrap preflight, and CI setup cover the migrated Node.js/npm/React/Next.js stack. Python, Go, Rust, Java, mobile, infrastructure, and regulated-workload profiles are not included and are not turnkey.

**Disposition:** Accepted as a declared v11.0.0 scope constraint. New stacks require an approved profile package, setup contract, commands, CI setup, tests, and migration documentation before use.

### MEDIUM-2 — Local approval records are not an identity system

`human:<name>` records provide traceability but can be edited by a repository writer. They are not sufficient as a production security boundary.

**Disposition:** Mitigated by documented protected-branch requirements and the GitHub `production` Environment workflow. Production and other high-risk external writes must be enforced by the external platform, not local JSON alone.

### LOW-1 — Release workflow intentionally stops before deployment

The GitHub workflow verifies a production-approved release record and enters the configured Environment, but does not deploy or update the release record automatically.

**Disposition:** Intended safety design. Provider-specific deployment must be added as a separately approved workflow with least privilege and rollback evidence.

### LOW-2 — CLI errors are primarily developer-oriented

Several new commands rely on uncaught exceptions for non-zero failure and may print stack traces rather than a polished remediation message.

**Disposition:** Non-blocking. Deterministic failure behavior is present; user-facing error formatting can be improved later.

## Security review

- No autonomous production deployment path found.
- Human approval is required on production, deployment recording, release acceptance, project-baseline activation, mitigation, recovery, and incident closure transitions.
- Profile resolution rejects unknown profiles, dependency cycles, command conflicts, profile conflicts, and stale registry digests.
- Contract hashing rejects missing files, traversal, and symlinked contract files.
- Operational signal recording rejects several common secret patterns and explicitly requires redacted references.
- No executable use of destructive Git commands, force push, destructive clean, `rm -rf`, or remote-script-to-shell patterns was found.
- No symbolic links or secret-like literals were found in the package.

## Compatibility review

- Existing task lifecycle states and lifecycle gate schema `1.1.0` are retained.
- Existing completed specs and evidence paths are not deleted or migrated in place.
- React Doctor remains active for the migrated profile and is skipped by the CI wrapper/workflow when its quality profile is absent.
- Generated React/Next.js rules can be omitted when their required profiles are inactive.
- No application source file was changed.
