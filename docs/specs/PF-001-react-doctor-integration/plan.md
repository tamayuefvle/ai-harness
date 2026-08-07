# Implementation plan

## Existing implementation inspected

canonical rulesとmanifestからAGENTS / Cursor Rulesを生成し、`verify:ci`、Git hooks、GitHub Actions、Codex reviewerへ接続する構成を確認した。実アプリpackage.jsonとReact sourceはstarter ZIPに含まれない。

## Proposed design

Cursor plugin、project-local wrapper、GitHub Actionを分離する。wrapperはReact Doctor JSONを内部schemaへ正規化し、state gateとreviewerは内部reportを参照する。

## Files to change

| File | Change | Reason |
|---|---|---|
| `doctor.config.json` | canonical config | deterministic local behavior |
| `package.devDependencies.fragment.json` | exact CLI version | reproducibility |
| `scripts/harness/react-doctor.mjs` | four-mode wrapper | shared behavior and evidence |
| `harness/schemas/react-doctor-result.schema.json` | normalized contract | external output isolation |
| `.githooks/pre-commit`, workflows | local / CI gates | execution coverage |
| canonical rules and review assets | state / role contracts | scope and safety |
| guide, ADR, README | operation and rollback | adoption |

## Implementation sequence

1. Pin dependency and config.
2. Implement wrapper and schema.
3. Add fixture tests.
4. Wire scripts, hook, quality CI, PR Action.
5. Update canonical rules, review contract, templates.
6. Generate derived instructions.
7. Validate syntax, schema, tests, synchronization, archive.
8. Independent diff review and record completion.

## Server / Client boundary

No application runtime code changes. React Doctor diagnoses both boundaries, but wrapper remains Node developer tooling.

## Data and type changes

Adds internal report schema version `1.0.0`. Existing review schema gains an optional backward-compatible `diagnostic_evidence` field.

## Risks

- external CLI output changes: isolated behind normalized schema and exact version
- false positives: advisory rollout and narrow suppression policy
- CI base resolution: full history and explicit failure in CI
- third-party Action risk: exact release commit and least permissions in dedicated workflow

## Rollback

Remove workflow, hook call, package fragment entry, wrapper/config/schema, canonical rule additions; regenerate instructions. Existing `.harness` reports may be retained as audit evidence.
