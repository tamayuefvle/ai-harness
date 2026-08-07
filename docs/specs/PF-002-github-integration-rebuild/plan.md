# Implementation plan

## Design

1. Make `harness/integrations/github.json` the source of truth.
2. Collect repository, PR, required-check and recent-run metadata through a fixed
   read-only `gh --json` command set.
3. Normalize results into `github-context.schema.json`; do not persist command
   output or error streams.
4. Generate the report before Codex research/review, outside their restricted
   sandboxes.
5. Remove GitHub MCP from default config and provide a manual opt-in Docker OAuth
   launcher.
6. Fix Git hook installation permissions and add ZIP-style regression tests.
7. Run harness tests in quality CI and retain evidence artifacts.
8. Regenerate instructions, validate, independently review and package v7.

## Security boundaries

- no GitHub write command
- no arbitrary `gh api`
- no PAT loading or token display
- MCP callback bound to loopback
- MCP read-only and lockdown enforced from canonical config
- external text excluded by default and always treated as untrusted
- optional release tag cannot be promoted to a required control until digest pin
  is verified

## Rollback

Each integration path is separable. The optional MCP can be removed without
changing the standard gateway. GitHub report calls can be removed from delegation
and CI without changing application code. The v6 PAT launcher may be restored
only through a reviewed change; secrets remain outside Git.
