## Task

- Task ID:
- Active spec: `docs/specs/...`
- Change type: feature / fix / docs / refactor / test / operations

## Why

## Scope

### Included

### Excluded

## Acceptance evidence

| AC | Result | Evidence |
|---|---|---|
| AC-001 |  |  |

## Verification

- [ ] `npm run harness:check`
- [ ] `npm run test:harness:github`
- [ ] `npm run test:harness:git-hooks`
- [ ] `npm run test:harness:react-doctor`
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run react:doctor:changed`（React変更時）
- [ ] `npm run test:unit`
- [ ] `npm run build`
- [ ] `npm run test:e2e`
- [ ] Preview smoke test
- [ ] Accessibility / responsive manual check

## GitHub context evidence

- Normalized report: `.harness/reports/<TASK>/github-context.json`
- Generated at:
- Status: complete / degraded / unavailable
- Required checks: pass / pending / fail / not applicable

## React Doctor evidence

- Normalized report: `.harness/reports/<TASK>/react-doctor-changed.json`
- Status: passed / skipped / blocked / failed / partial
- Accepted warnings or suppressions:

## UI evidence

Preview URL:

Before / after screenshots:

## AI contribution

- Main tool used: Cursor / Codex CLI / both
- AI-generated or heavily modified areas:
- Human review focus:

## Risks and rollback

## Checklist

- [ ] No secret or personal information is included
- [ ] No unrelated changes are mixed in
- [ ] New dependency has an ADR and approval
- [ ] P0/P1 findings are resolved
- [ ] Remaining P2 and React Doctor findings are documented
- [ ] Production deployment has not been triggered from this PR
