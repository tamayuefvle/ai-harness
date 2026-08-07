# Verification result

## Successful checks

- Generated 50 AGENTS / Cursor rule outputs from canonical sources.
- Confirmed root `AGENTS.md` contains both command-center and Public asset
  canonical sources in deterministic order.
- Confirmed `.cursor/rules/public-assets.mdc` uses `public/**/*` and is not
  globally always-applied.
- Confirmed `public/` contains no harness instruction file or nested agent rule.
- Passed 4 new rule-generator and public-boundary tests.
- Passed 41 total harness tests, including GitHub, optional MCP, Git hooks and
  React Doctor regression coverage.
- Passed generated-rule synchronization and public-boundary enforcement.
- Confirmed duplicate targets and repository-escaping targets fail closed.
- Passed JavaScript and shell syntax checks.
- Parsed 13 JSON files and 3 GitHub Actions workflow YAML files.
- Validated all 6 committed JSON Schemas and the canonical GitHub integration
  configuration.
- Confirmed the 179-file inventory exactly matches the reviewed repository.
- Built the v8 ZIP and confirmed it has one expected root, 179 files, no unsafe
  relative path, no symbolic link and no `.git` or `.harness` runtime entry.
- Extracted the final ZIP into an independent directory and repeated rule
  synchronization plus all 41 harness tests successfully.
- Simulated ZIP-style Git hook mode loss in the extracted artifact and confirmed
  the installer restored executable permissions and `core.hooksPath`.
- Secret-pattern and dangerous-path scans reported no finding.

## Environment-dependent checks

Application lint, typecheck, build and E2E remain unavailable because the v8
starter intentionally contains no application package manifest or framework
installation. Those checks belong to the target application environment.

## Result

- v8 harness safety improvement: **PASS**
- application framework integration: **NOT PART OF THIS PACKAGE**
