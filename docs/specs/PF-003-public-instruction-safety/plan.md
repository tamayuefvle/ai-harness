# Implementation plan

1. Extend AGENTS targets to accept explicit replace or append mode.
2. Fail on accidental duplicate replace outputs and unsafe relative target paths.
3. Change the Public role manifest to append to root `AGENTS.md`.
4. Generate a repository-level Cursor rule scoped to `public/**/*`.
5. Remove stale instruction outputs below `public/`.
6. Add synchronization-time public boundary validation.
7. Add deterministic regression tests and run them in CI.
8. Update architecture, instruction-tree, README, changelog and inventory records.
9. Build and independently inspect the v8 archive without installer artifacts.

## Rollback

Revert the canonical manifest and generator changes together, regenerate outputs,
and restore the prior CI command. Do not restore public instruction files without
an explicit security exception.
