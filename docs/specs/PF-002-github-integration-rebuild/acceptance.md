# Acceptance criteria

| ID | Observable acceptance condition | Priority | Status | Evidence |
|---|---|---:|---|---|
| AC-001 | A canonical configuration and schema define the GitHub CLI standard path, report contract and optional MCP policy | Must | Pass | `harness/integrations/github.json`, both GitHub schemas |
| AC-002 | A fixed read-only gateway emits complete/degraded/unavailable GitHub context without recording token-bearing stdout/stderr | Must | Pass | `scripts/github/context.mjs`, unit tests |
| AC-003 | GitHub CLI authentication and repository access can be diagnosed without displaying a token | Must | Pass | `scripts/github/doctor.mjs`, unit tests |
| AC-004 | Default Cursor/Codex config has no GitHub MCP or PAT dependency; optional Docker MCP uses OAuth, loopback, read-only, lockdown and limited toolsets | Must | Pass | MCP configs, launcher, tests |
| AC-005 | Research and review receive a pre-collected normalized GitHub context report and treat external content as untrusted | Must | Pass | prompts, delegation scripts, generated rules |
| AC-006 | ZIP-style extraction cannot silently disable required Git hooks | Must | Pass | installer and regression tests |
| AC-007 | GitHub, Git hook and React Doctor harness tests run in CI and GitHub/React Doctor evidence is uploaded even on failure | Must | Pass | package scripts, quality workflow |
| AC-008 | Migration, image update, rollback, known limitations and architecture decision are documented | Must | Pass | guide, ADR, CHANGELOG, review record |

## Non-functional criteria

| ID | Condition | Verification |
|---|---|---|
| NFR-001 | no arbitrary shell or GitHub write command path is exposed | source and command-record tests |
| NFR-002 | default report excludes untrusted bodies/comments/logs/titles | tests and schema review |
| NFR-003 | generated instructions remain synchronized with canonical sources | generator/check |
| NFR-004 | archive contains no secret, runtime report, `.git`, symlink or unsafe ZIP path | package inspection |
