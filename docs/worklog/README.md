# Worklog

Monthly append-only work records are stored as `YYYY-MM.md` using the execution environment's local calendar date. Each entry also records its IANA time zone and UTC timestamp.

```bash
npm run worklog:context
npm run worklog:search -- "query"
npm run worklog:append -- \
  --actor agent \
  --task PF-001-example \
  --summary "Implemented the accepted slice" \
  --files "src/example.ts,tests/example.test.ts" \
  --evidence ".harness/reports/PF-001-example/implementation.json" \
  --verification passed
```

Do not edit an existing entry. A human factual correction is appended as a new entry:

```bash
npm run worklog:correct -- \
  --id WL-20260805-example \
  --actor human \
  --reason "Corrected the verification result" \
  --summary "Verification was partial, not passed"
```

The CLI rejects secret-like text, multiline or control-character injection, invalid actors/tasks/statuses, absolute paths, traversal, and missing evidence files. Raw reports remain under `.harness/reports/` and are referenced by path rather than copied here.
