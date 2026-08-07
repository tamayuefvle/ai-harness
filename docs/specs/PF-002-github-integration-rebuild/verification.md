# Verification result

## Summary

Deterministic checks available in the packaging environment passed on
2026-07-28. The target GitHub account, real pull request, GitHub-hosted runner,
Docker OAuth browser/device flow and registry digest require connected target
environments and are listed separately.

## Successful checks

- Generated 51 AGENTS / Cursor Rule files and confirmed canonical synchronization.
- Passed 11 GitHub gateway/MCP tests.
- Passed 2 ZIP-style Git hook installation tests.
- Passed 24 React Doctor wrapper tests.
- Passed JavaScript syntax checks for all discovered JS/MJS scripts.
- Passed shell syntax checks for all shell scripts and Git hooks.
- Parsed all committed JSON and all 3 workflow YAML files.
- Validated all 6 JSON Schemas as Draft 2020-12.
- Validated canonical GitHub integration config against its schema.
- Validated both `unavailable` and complete fixture GitHub context reports against
  `github-context.schema.json`.
- Ran a temporary Git repository plus fake `gh` integration fixture through the
  real CLI entrypoint with `--require-complete --require-checks-pass`; it passed.
- Confirmed default reports omit PR title and workflow display title.
- Confirmed reports do not contain captured command stdout/stderr or a fixture
  secret value.
- Confirmed only fixed `repo view`, `pr view`, `pr checks` and `run list` GitHub
  subcommands are used by the context gateway.
- Confirmed unsafe task IDs, output path traversal and non-numeric PR selectors
  are rejected.
- Confirmed Docker dry-run uses loopback callback, read-only, lockdown and limited
  toolsets, with no PAT/token environment forwarding.
- Confirmed no operational reference remains to the v6 GitHub MCP server name,
  PAT variable or shell launcher.
- Confirmed no token-like value or private-key marker is present.
- Built the v7 distribution archive with 169 inventoried files and confirmed the
  extracted inventory matches exactly.
- Confirmed the archive has no unsafe path, symbolic link, `.git` or `.harness`
  entry.
- Extracted the archive into a separate directory, simulated lost POSIX hook
  modes, ran the installer and confirmed both hooks were restored as executable.
- Ran the complete fake-`gh` CLI fixture and all 37 harness tests again from the
  extracted archive.

## Commands

```bash
node scripts/harness/generate-rules.mjs
node scripts/harness/check-rules.mjs
node --test scripts/github/context.test.mjs scripts/mcp/github-mcp.test.mjs
node --test scripts/harness/install-git-hooks.test.mjs
node --test scripts/harness/react-doctor.test.mjs
node --check <all scripts/*.js|*.mjs>
bash -n <all shell scripts and hooks>
node scripts/mcp/start-github-mcp.mjs --dry-run
python JSON/YAML/JSON-Schema validation
```

## Environment-dependent checks not executed

- `gh auth login` with the user's actual GitHub account
- context collection against the actual target repository and PR
- `npm run verify:ci` in a merged application with package.json, lockfile,
  dependencies, React source, build and E2E tests
- GitHub-hosted execution of the modified quality workflow
- browser or device-code OAuth login from the Docker MCP container
- actual MCP tool-list inspection after authentication
- verification and recording of the selected container registry digest
- separate Codex CLI reviewer; Codex CLI was unavailable in the packaging
  environment

## Result

- Starter artifact deterministic verification: **PASS**
- Target repository integration: **PENDING**
- Optional GitHub MCP promotion to a required control: **PROHIBITED until digest
  and runtime tool-list verification are complete**
