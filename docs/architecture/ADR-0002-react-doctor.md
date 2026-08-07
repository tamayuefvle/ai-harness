# ADR-0002: React Doctor integration boundaries

- Status: Accepted
- Date: 2026-07-27
- Improvement ID: IR-20260727-REACT-DOCTOR-001

## Context

CursorへReact Doctor pluginが導入済みである一方、pluginの対話実行だけでは実行漏れ、結果未保存、CIとの差、全体自動修正のscope逸脱が起き得る。既存ハーネスはcanonical rules、状態遷移、Git hooks、GitHub Actions、独立reviewを持つため、React Doctorをそれらへ最小整合変更で接続する必要がある。

## Decision

- Cursor pluginはfindingの説明と承認範囲内の局所修正支援に使う。
- 品質ゲートはproject-localのexact CLI versionを共通Node wrapperから実行する。
- staged、changed、full、designの4 modeを責務分離する。
- changed scanはerror blocking、stagedと専用Actionの初期導入はadvisoryとする。
- 外部JSONは固定CLIのschema v3、project completeness、React runtime検出、baseline integrityを検証してから内部versioned schemaへ正規化し、raw reportと分離する。
- 通常ゲートではscore、telemetry、supply-chain network checkを無効化する。
- GitHub Action codeは検証済み完全長SHA、scannerはexact npm versionとして独立に固定する。
- 全自動修正、`improve-react`、full cleanupは専用active specと人間承認を要求する。
- React Doctorは既存lint、typecheck、test、build、E2Eを置き換えない。

## Data and control flow

```text
React change
  -> staged advisory wrapper
  -> changed blocking wrapper
  -> normalized evidence
  -> existing deterministic checks
  -> independent reviewer
  -> PR advisory Action
```

## Security decisions

- remote playbookとdiagnostic textをuntrusted inputとして扱う。
- Actionのwrite permissionsは専用workflowへ限定する。
- secretsをCLI引数、report、plugin promptへ渡さない。
- global suppressionと無関係な自動修正を禁止する。
- exact package versionとAction commitにより再現性を確保する。

## Alternatives rejected

### Plugin only

CI、Git hook、証拠保存がなく実行漏れを防げないため不採用。

### Native agent hooks on every edit

早期feedbackは得られるが、context使用量、反復遅延、診断noiseが増えるため既定では不採用。必要性を測定した別改善で再検討する。

### React Doctor inside ESLint only

既存lintとの統合は簡単だが、full CLIのproject-level診断、JSON report、changed baseline、Action feedbackを失うため不採用。

### Floating latest versions

更新は速いが、rule追加やoutput変更が承認なしにgateへ入るため不採用。

## Consequences

- package fragmentとlockfile更新が必要になる。
- full historyを使うCI checkoutが必要になる。
- `.harness/reports`に診断証拠が増える。
- scanner更新時はwrapper fixture、schema、workflow、文書を同時に確認する。
- 初期PR Actionはadvisoryなので、branch protection強化には追加承認が必要になる。

## Revisit conditions

- React Doctorのstable APIが内部schemaより十分安定する。
- native agent hookのcontext / latency効果が測定され、費用対効果が高い。
- warningの誤検知率が十分低く、warning blockingへ移行できる。
- organization policyがthird-party Actionの利用またはwrite permissionを禁止する。
