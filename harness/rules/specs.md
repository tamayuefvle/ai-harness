# Specification and gatekeeper role

## Ownership

この領域は、タスクの状態遷移と、実装開始・レビュー・リリースの入退場条件を管理します。

## Active task

コード、テスト、設定、依存を変更する前に `docs/specs/_active.md` を確認します。

- `active_spec: none` の場合、仕様文書とハーネス以外の実装を開始しない。
- active spec は同時に1件だけ。
- active spec のディレクトリがない、必須ファイルがない、task IDとbranchが矛盾する場合は開始しない。

## Required files

active specには以下が必要です。

- `brief.md`: 背景、目的、対象者、scope、non-scope、assumption
- `acceptance.md`: `AC-001` 形式の観察可能な受入条件
- `plan.md`: 調査結果、変更ファイル、実装順、リスク、rollback
- `test-plan.md`: 各ACに対応する自動・手動検証
- `review.md`: finding、検証証拠、残存risk、release判断
- `delegation.md`: Cursor / Codexの役割判断、発火理由、report、handoff
- `gate.json`: 承認・baseline・証拠digestの参照インデックス。要求本文や状態の正本ではない


## Mechanical lifecycle validation

All state transitions are fail-closed and are executed only through the lifecycle scripts. `gate.json` records approvals, the approved baseline, evidence paths and SHA-256 digests, and release authorization. It does not duplicate acceptance criteria or active state.

- `task:gate` records phase-specific approval or evidence.
- `task:advance` validates the target gate before changing `_active.md`.
- `task:rework` returns a failed downstream phase to `IMPLEMENTING` and invalidates downstream evidence.
- `task:rebaseline` requires explicit human approval and invalidates implementation and later evidence.
- `task:complete` replays every transition validator, including approved specification/plan hashes, artifact schemas, semantic report outcomes, exact HEAD, and all recorded digests.
- Gate status, Preview/rollback values, and review severity counts are derived from validated reports; CLI values are assertions only.
- Missing, stale, replaced, inconsistent, or unparseable evidence is a failure.

## Gate conditions

### SPEC_READY

- Goal、scope、non-scope、Must ACが明確。
- 「適切に」「使いやすく」だけの条件がない。
- 未決事項と仮定が区別されている。

### PLAN_READY

- 既存実装を調査済み。同等・重複・再利用可能な既存機能を記録し、`reuse | extend | replace | create` を決定済み。
- 変更予定ファイル、変更境界、非変更範囲、依存、再利用部品が明確。
- data、error、empty、responsive、Server/Client boundaryを説明。
- test-planとrollbackを記載。
- 依存・構造判断はADRへ分岐。

### IMPLEMENTING

- 外部状態は増やさず、実装内部で必要に応じて Red → Green → Refactor を実施する。
- implementation reportの`test_discipline`に適用判断と証拠を構造化する。適用可能な変更ではRed/Green証拠を必須とし、適用不能な変更では具体的理由を必須とする。
- 既存機能の拡張で実現できる場合は新規機能を作らない。
- ACを満たす最小の縦切りから実装。
- 無関係な変更を混ぜない。
- TODOはspecの未完了項目へ紐づける。

### VERIFYING

1. harness sync
2. GitHub / Git hook / React Doctor harness tests
3. lint
4. typecheck
5. React Doctor changed scan（React関連変更時）
6. unit / component
7. production build
8. E2E
9. GitHub context refresh（PR gate時はfail-closed verification）
10. accessibility / responsive manual check
11. Preview smoke

React Doctorをskipできるのは、React projectが検出されない、Git worktreeでない、またはReact関連差分がない場合だけです。正規化reportへskip理由を残します。`partial`、不正JSON、version mismatch、base未解決を成功扱いにしません。

`verification.json` must conform to `harness/schemas/verification.schema.json`. A passing record requires passing/skipped checks, rollback confirmation, and the exact current HEAD. GitHub context must be complete with a PR and passing/skipped required checks. React-related changes require a passing React Doctor report for the same task and HEAD.

失敗した段階を飛ばさない。

### REVIEW_READY

- diff、AC、GitHub context、React Doctorを含む検証reportを根拠に独立レビュー。
- `review.json` のverdictとfinding件数をgateへ導出し、手入力値との不一致を拒否。
- `verification.json`、レビュー時GitHub context、必要なReact Doctor reportをdiagnostic evidenceとして確認し、finalizerが各SHA-256を固定する。
- レビュー時GitHub contextは`github-context-review.json`へ分離し、verificationで固定した`github-context.json`を上書きしない。
- P0 / P1は0件。
- P2は修正または受容理由を`review.md`へ記録。

### DEPLOY_READY

- completeなGitHub context reportでrequired checks成功（React変更ではReact Doctor checkを含む）
- Previewの主要導線確認済み
- metadata、OGP、404、連絡導線確認済み
- rollback記載済み
- productionは人間承認済み

### Terminal completion operation

`DONE` is not an active status. From `DEPLOY_READY`, `task:complete` validates all AC evidence and release gates, writes `DONE.md`, and returns `_active.md` to `active_spec: none` / `status: IDEA`.


## Delegation evidence

`delegation.md` には各Codex判断を記録します。

- role: researcher / implementer / reviewer
- decision: required / recommended / cursor_preferred / skipped
- reason
- target AC
- sandbox: read-only / workspace-write
- report path
- Cursorによる確認結果
- 未解決事項

Codexを使わなかった場合も、重要なruntime変更でreviewを省略した理由を記録します。
