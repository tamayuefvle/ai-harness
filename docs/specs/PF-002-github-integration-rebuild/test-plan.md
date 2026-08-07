# Test plan

## Automated

- GitHub context: complete PR, explicit untrusted opt-in, no-PR branch,
  unavailable repository, pending required check, fixed command allow-list
- GitHub doctor: auth check does not request token display
- MCP launcher: loopback callback, read-only, lockdown, toolsets, no token/PAT env,
  digest override behavior
- Git hooks: ZIP-style mode loss is repaired and `git hook run` succeeds; missing
  required hook fails
- existing React Doctor wrapper fixtures
- JavaScript and shell syntax
- JSON/YAML parsing and JSON Schema validation
- generated rule synchronization
- inventory and archive safety

## Integration/static checks

- quality workflow permissions, test order and `if: always()` evidence upload
- default `.cursor/mcp.json` and `.codex/config.toml` contain no GitHub token/server
- Codex research/review scripts create GitHub context before starting sessions
- no stale `GITHUB_PAT_TOKEN` or old launcher reference

## Environment-dependent checks

- real `gh auth login` and repository context: pending in target environment
- GitHub Actions execution: pending in a real PR
- OAuth Docker browser/device flow: pending where Docker and browser access exist
- Docker registry digest verification: pending connected maintainer action
