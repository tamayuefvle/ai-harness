# MCP setup

The committed MCP surface contains only optional Chrome DevTools browser evidence:

```text
.cursor/mcp.json
.codex/config.toml
scripts/mcp/start-chrome-devtools.mjs
scripts/mcp/start-debug-chrome.ps1
scripts/mcp/doctor.mjs
```

GitHub MCP and a documentation MCP server are not part of the default harness. GitHub uses `git` + `gh` over HTTPS. Documentation lookup uses the Documentation Capability; an optional CLI provider may be installed separately and remains disabled by default.

Run `npm run mcp:doctor`. In WSL, start a dedicated Windows Chrome profile with `scripts/mcp/start-debug-chrome.ps1`; never sign in to sensitive services in that profile. Missing browser MCP degrades browser evidence only and must be reported.

Before any `ai:research`, `ai:implement`, or `ai:review`, run `npm run codex:preflight`. A committed file is not proof that Codex loaded it: the preflight inspects effective configuration and requires `chrome_devtools` to remain disabled by default.

If project configuration is not effective, stop and ask the user to make the trust decision interactively. Do not edit user-scoped Codex configuration or synthesize trust. Do not work around invalid transport configuration with partial `-c mcp_servers.<name>.*` overrides; keep the complete transport table in `.codex/config.toml`.
