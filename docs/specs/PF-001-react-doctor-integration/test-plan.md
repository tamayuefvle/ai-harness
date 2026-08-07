# Test plan

| Acceptance ID | Automated verification | Manual verification | Result |
|---|---|---|---|
| AC-001 | JSON parse、exact version assertion、config review | official 0.7.7 release / CLI / config cross-check | Pass |
| AC-002 | `node --test scripts/harness/react-doctor.test.mjs`（24 cases） | normalized / raw contract review | Pass |
| AC-003 | shell / YAML parse、workflow structure check | permissions、Action pin、advisory rollout review | Pass |
| AC-004 | generator + synchronization check | generated route and state gate inspection | Pass |
| AC-005 | review schema self-validation | reviewer prompt and diagnostic evidence inspection | Pass |
| AC-006 | path、inventory、archive checks | guide、migration、rollback、ADR review | Pass |

## Wrapper fixtures

1. non-React repository skip
2. staged React files / advisory gate
3. changed-scope blocking finding propagation
4. invalid JSON fail-closed
5. CLI version mismatch
6. unresolved CI comparison base
7. nonzero exit without blocking finding
8. stale raw report removal failure
9. incomplete project coverage
10. React runtime not detected
11. degraded changed baseline
12. unsupported raw schema version
13. raw tool version mismatch
14. raw mode / requested scope mismatch
15. repository-root-relative CLI and report paths
16. summary / diagnostic count mismatch
17. zero exit despite blocking findings
18. invalid zero max-duration
19. no React-relevant changed files
20. missing project-local CLI
21. React Doctor hard failure
22. analyzed file coverage mismatch
23. design-mode full advisory scan
24. staged warning remains advisory

## Verification commands

- `node scripts/harness/generate-rules.mjs`
- `node scripts/harness/check-rules.mjs`
- `node --check` for all JavaScript modules under `scripts/`
- `bash -n` for shell scripts and Git hooks
- JSON / YAML parsing and Draft 2020-12 schema self-validation
- normalized report validation against `react-doctor-result.schema.json`
- `node --test scripts/harness/react-doctor.test.mjs`
- `node scripts/harness/react-doctor.mjs changed --base HEAD^`
- `git diff --check`

## Expected starter behavior

The starter archive contains no application `package.json` or React source. The real scanner therefore records `skipped / no-react-project-detected`; this is an expected, schema-validated result rather than a claimed clean React scan.
