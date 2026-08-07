# Test plan

| Acceptance ID | Automated verification | Manual verification | Result |
|---|---|---|---|
| AC-001 |  |  | Pending |
| AC-002 |  |  | Pending |

## React Doctor evidence

- Required when React / JavaScript / TypeScript implementation changes: `npm run react:doctor:changed`
- Normalized report: `.harness/reports/{{TASK_ID}}/react-doctor-changed.json`
- Skip is valid only with a recorded deterministic reason.
- `partial`, version mismatch, invalid JSON, or unresolved CI base is a failure.

## Browsers and viewports

- Chromium: 320x800
- Chromium: 768x1024
- Chromium: 1440x900

## Failure evidence

Record command output, trace, screenshots, and unresolved items here.
