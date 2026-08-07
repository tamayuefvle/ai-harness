# Review record

## Review scope

Approved plan, canonical configuration, report schema, GitHub CLI commands,
Docker launcher, default MCP configuration, Codex handoff, CI workflow, Git hook
installer, tests, generated instructions, migration and rollback documentation.

The review was performed as a role-separated read-only pass after implementation.
A separate Codex CLI reviewer was unavailable, so deterministic tests and a
manual adversarial diff review were used. This limitation is not presented as an
independent external review.

## Findings

| Severity | File / location | Finding | Impact | Resolution |
|---|---|---|---|---|
| HIGH | `scripts/github/context.mjs` output and CLI selectors | Initial implementation allowed an explicit report path outside the repository and accepted an arbitrary PR selector that would be copied into command evidence. | A crafted invocation could overwrite an out-of-scope path or persist a credential-bearing URL. | Added repository-confined path resolution, strict task IDs, numeric-only PR selectors and regression tests. |
| MEDIUM | `scripts/github/context.mjs` external titles | Initial normalized workflow-run records retained `displayTitle` even when untrusted text was disabled. | Prompt-like external text could reach researcher/reviewer context by default. | Default now records `null`; bounded titles are included only with `--include-untrusted`. |
| MEDIUM | `scripts/github/context.mjs` required checks | GitHub CLI can return exit code 8 while emitting valid pending-check JSON. Treating every nonzero code as invalid would lose evidence and report only degradation. | Pending checks would be less precisely represented. | Parser accepts 0 or 8 only for `pr checks`, then fail-closed evaluation rejects non-passing buckets. |
| MEDIUM | `harness/integrations/github.json` image pin | The official MCP image is pinned to release tag `v1.0.5`, but no verified OCI digest could be obtained in the disconnected packaging environment. | A mutable registry tag has weaker supply-chain reproducibility. | MCP remains optional, emits a warning, records `imageDigest: null`, documents a verified update process and is prohibited from becoming a required control until digest validation. Accepted residual risk. |
| LOW | generated instructions and old MCP references | Canonical rule changes initially left generated files stale and historical/operational references needed separation. | Agents could follow obsolete `github-readonly` instructions. | Regenerated 51 files and confirmed no stale operational reference remains. Historical migration references are intentionally retained. |

No unresolved BLOCKER or HIGH finding remains.

## Verification evidence

| Tool / check | Report or command | Status | Reviewer confirmation |
|---|---|---|---|
| GitHub/MCP tests | `node --test scripts/github/context.test.mjs scripts/mcp/github-mcp.test.mjs` | Pass — 11/11 | allow-list, untrusted text, unavailable state, path confinement, pending checks and Docker constraints inspected |
| Git hook tests | `node --test scripts/harness/install-git-hooks.test.mjs` | Pass — 2/2 | ZIP-style mode loss repaired and real `git hook run` succeeds |
| React Doctor tests | `node --test scripts/harness/react-doctor.test.mjs` | Pass — 24/24 | prior wrapper behavior preserved |
| CLI integration fixture | temporary Git repo and fake `gh` | Pass | complete report and required checks gate passed; default titles excluded |
| JSON Schema | Draft 2020-12 validation | Pass | 6 schemas valid; config and generated reports conform |
| Generated files | `node scripts/harness/check-rules.mjs` | Pass | 51 outputs synchronized |
| Syntax | `node --check`, `bash -n`, JSON/YAML parse | Pass | all discovered files parsed |
| Secret/stale reference scan | repository grep | Pass | no token value/private key; no operational v6 PAT path |
| Distribution archive | isolated extraction, inventory comparison, hook repair, fake-`gh` fixture and 37-test rerun | Pass | no unsafe paths/symlinks/runtime directories; extracted artifact behaves as reviewed |

## Residual risks

- The exact Docker registry digest is not yet recorded.
- OAuth behavior and exposed MCP tools are not runtime-verified in this environment.
- The actual repository's ruleset and required checks may differ from the starter
  assumptions.
- The quality workflow and GitHub context token permissions require a real PR run.
- The starter does not contain a merged application package manifest, so full
  lint/typecheck/build/E2E cannot run here.

## Release recommendation

- [ ] Changes requested
- [x] Starter artifact ready
- [ ] Target repository production ready after integration, real PR CI and human approval
