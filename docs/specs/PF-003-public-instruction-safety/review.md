# Review record

## Scope

Canonical manifest, generator composition semantics, public-directory guard,
generated root/Cursor outputs, tests, CI wiring, documentation and final archive.

The review was performed as a role-separated read-only pass after implementation.
A separate Codex CLI reviewer was unavailable, so deterministic tests, adversarial
fixtures, generated-output comparison and isolated archive re-extraction were
used. This is not represented as an external independent review.

## Findings

| Severity | Finding | Resolution |
|---|---|---|
| HIGH | Nested instructions below `public/` could be deployed as static assets. | Removed all public instruction targets and added a fail-closed guard. |
| MEDIUM | The previous output map silently overwrote duplicate targets. | Duplicate replace targets now throw; composition requires explicit append mode. |
| MEDIUM | A malformed manifest target could escape the repository root. | Added normalized relative-path validation and a regression test. |
| LOW | Public asset routing still named the removed nested file. | Updated canonical command center, README and instruction-tree documentation. |

No unresolved BLOCKER or HIGH finding remains.

## Verification evidence

| Check | Status | Reviewer confirmation |
|---|---|---|
| Rule/public-boundary tests | Pass — 4/4 | append order, duplicate rejection, traversal rejection and real manifest inspected |
| Complete harness regression | Pass — 41/41 | GitHub, MCP, Git hook and React Doctor behavior preserved |
| Generated synchronization | Pass — 50 outputs | root composition and scoped public Cursor rule inspected |
| JSON/YAML/Schema parsing | Pass | 13 JSON, 3 YAML and 6 Draft 2020-12 schemas validated |
| Archive inspection | Pass — 179 files | inventory exact; no unsafe path, symlink, `.git` or `.harness` entry |
| Isolated extraction rerun | Pass | synchronization and 41 tests repeated from distributed content |
| ZIP-mode hook recovery | Pass | execute bits and `.githooks` configuration restored |
| Secret-pattern scan | Pass | no token-like value or private-key marker found |

## Residual risk

The public-boundary scan identifies instruction filenames and directories. It
does not classify arbitrary asset text as sensitive; normal content review and
secret scanning remain required. Full application gates remain pending until a
framework and application dependencies are installed in the target repository.

## Recommendation

- [x] v8 starter artifact ready
- [ ] application production ready only after framework integration and full CI
