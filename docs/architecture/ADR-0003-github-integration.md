# ADR-0003: GitHub CLI gateway with optional Docker GitHub MCP

- Status: Superseded by ADR-0005
- Date: 2026-07-28
- Improvement: `IMP-20260728-01`

## Context

Cursor running in WSL could not reliably receive a PAT through the user's
`~/.cursor/mcp.json` environment substitution. v6 therefore introduced a Docker
launcher that sourced a private PAT file. That solved host environment passing
but made GitHub context dependent on an IDE/MCP-specific secret path and did not
provide deterministic, schema-validated evidence for CI or review.

## Decision

Use GitHub CLI as the required read-only GitHub integration. Fixed commands
produce `github-context.schema.json` reports for planning, research,
verification and review.

Keep the official Docker GitHub MCP server only as an optional exploration path.
Use OAuth, loopback callback binding, read-only mode, lockdown mode and limited
toolsets. Do not commit it as a required Cursor or Codex server.

## Rationale

- GitHub CLI authentication is independent from Cursor's environment-variable
  interpolation and can use the credential store available in the execution
  environment.
- Fixed `--json` commands are easier to normalize, test, audit and fail closed.
- MCP remains useful for conversational exploration but external text and tool
  discovery are not suitable as deterministic quality gates.
- Removing the PAT-file launcher narrows secret handling owned by the harness.

## Consequences

Positive:

- one standard GitHub context contract across Cursor, Codex and CI
- no repository-owned GitHub PAT loading path
- explicit complete/degraded/unavailable status
- required checks can be verified independently of an LLM
- optional MCP can be removed without affecting gates

Costs:

- `gh` must be installed and authenticated in each execution environment
- OAuth GitHub MCP may require login again when its temporary token is lost
- the selected Docker image remains release-tag pinned until a verified registry
  digest is recorded

## Rejected alternatives

### GitHub MCP only

Rejected because MCP output is less deterministic and harder to validate as a
merge/release gate.

### GitHub CLI only, remove MCP entirely

Viable, but rejected because optional cross-repository conversational exploration
has value when explicitly requested and isolated from required controls.

### Continue PAT secret-file launcher

Rejected because it preserves duplicate authentication paths and secret-handling
logic solely to work around host interpolation.

## Reconsider when

- Cursor or another primary host supports reliable OAuth to the remote GitHub MCP
  server across WSL with policy controls
- GitHub CLI removes required structured fields
- the optional MCP becomes necessary for an approved, measured workflow that
  cannot be met through deterministic API/CLI collection

## References

- https://github.com/github/github-mcp-server
- https://github.com/github/github-mcp-server/blob/main/docs/oauth-login.md
- https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md
- https://cli.github.com/manual/gh_auth_login
- https://cli.github.com/manual/gh_pr_checks
