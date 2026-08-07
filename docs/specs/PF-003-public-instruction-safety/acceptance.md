# Acceptance criteria

| ID | Observable acceptance condition | Priority | Status | Evidence |
|---|---|---:|---|---|
| AC-001 | No generated AGENTS, Cursor or Codex instruction exists below `public/` | Must | Pass | manifest, generated inventory, synchronization check |
| AC-002 | Codex receives the canonical Public asset role through generated root `AGENTS.md` | Must | Pass | append target and generated root output |
| AC-003 | Cursor receives the same canonical source only for `public/**/*` | Must | Pass | `.cursor/rules/public-assets.mdc` |
| AC-004 | Duplicate replace targets and repository-escaping targets fail closed | Must | Pass | `rule-lib.mjs`, regression tests |
| AC-005 | CI and `verify:ci` execute the new rule-generator regression suite | Must | Pass | package fragment and quality workflow |
| AC-006 | Documentation, inventory and generated outputs are synchronized | Must | Pass | ADR, workflow guide, README, inventory check |

## Non-functional criteria

| ID | Condition | Verification |
|---|---|---|
| NFR-001 | `harness/rules/public.md` remains the only manually maintained Public asset definition | manifest and output comparison |
| NFR-002 | Existing generated roles remain byte-for-byte reproducible from canonical sources | `harness:generate` then `harness:check` |
| NFR-003 | The v8 archive inventory exactly matches the reviewed repository files | archive extraction and inventory comparison |
