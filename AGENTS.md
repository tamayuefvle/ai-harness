<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->
<!-- Source: harness/rules/user-root-policy.md; consumer: shared-agents; run npm run harness:generate -->
# User root policy

## Mission

このリポジトリでは、企画・仕様・設計・実装・検証・リリース・運用を追跡可能な工程で進めます。ルートの役割は詳細規約を抱えることではありません。作業を分類し、対象パスの provider-specific instruction（Codex は `CODEX.md`、Cursor は scoped `.mdc`）へ導き、工程ゲートと全体安全境界を守ることです。

## Authority

判断が競合した場合は、次の順序で優先します。

1. 現在の明示的なユーザー指示
2. `docs/specs/_active.md` が指す active spec（設定されている場合）
3. active spec の acceptance criteria
4. root `AGENTS.md` と対象パスの provider-specific instruction chain
5. 採用済み ADR
6. 既存コードから推測した慣習

同じ階層では、より具体的で対象範囲の狭い指示を優先します。下位の指示が上位の安全境界を弱めることはできません。

## Instruction chain procedure

作業開始時に、次の順序で判断します。

1. 依頼の成果物と変更対象を特定する。
2. 対象パスの router rule に従い、該当ドメインの provider-specific instruction へ進む。
3. root `AGENTS.md` と、対象パスまでの provider-specific instruction（Codex は `CODEX.md`、Cursor は scoped `.mdc`）を読む。
4. 複数領域にまたがる場合は、各経路の指示をすべて適用する。
5. 規約が衝突した場合は、対象に最も近い下位指示を採用し、衝突を報告する。
6. full lifecycle mode では project state が `ACTIVE` であり、active spec と必要な工程ゲートが整うまで実装を始めない。

経路確認:

```bash
npm run harness:route -- path/to/target
```

タスク工程の自然言語ディスパッチは `.cursor/rules/01-user-task-dispatcher.mdc` と `npm run ai:decide` が担当します。

## Source of truth

ハーネス規約の正本は `harness/rules/*.md` と `harness/rules/manifest.json` です。

次は生成物であり、直接編集しません。

- root `AGENTS.md`
- すべての `CODEX.md`
- すべての `.cursor/rules/*.mdc`

変更は source を更新してから `npm run harness:generate` を実行します。

## Universal stop conditions

明示的な人間承認なしに、次を実行しません。

- production deploy、domain、production alias の変更
- 新しい production dependency の追加
- secret、token、credential の作成・表示・送信
- データまたは Git 履歴を破壊する操作
- `main` への直接 push / commit
- 大規模な無関係変更

常に禁止します。

- `.env`、秘密鍵、個人情報のコミット
- `git reset --hard`、`git clean -fdx`、force push
- テストや検査を削除・無効化して成功扱いにすること
- 実行していない検証、存在しない仕様・URL・数値の捏造
- 既存のユーザー変更を意図なく巻き戻すこと
- 生成済み `AGENTS.md` / `CODEX.md` / `.cursor/rules` の直接編集

## Verification honesty

- 実装前に目的、対象、非対象、受入条件、検証方法を確認する。
- 失敗を隠さず、実行したコマンドと結果を証拠として残す。
- 未実行の検証は `未実行` と明記する。
- agent の自己申告を検証証拠として扱わない。diff と実行結果で突合する。

<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->
<!-- Source: harness/rules/public.md; consumer: shared-agents; run npm run harness:generate -->
# Public asset role

## Rules

- licenseと利用条件を確認できるassetだけを追加する。
- 個人情報、内部資料、第三者の機密画像を含めない。
- filenameは用途が分かる安定した名前にする。
- source fileと生成物を区別する。
- 画像は適切なformat、寸法、圧縮を使う。
- 装飾か情報提供かを実装側へ伝え、alt方針を決める。
- font追加はlicense、weight、subset、performance impactをADRまたはspecへ記録する。
- 未使用の大容量assetを残さない。

<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->
<!-- Source: harness/rules/lifecycle.md; consumer: shared-agents; run npm run harness:generate -->
# Phase / gate lifecycle controller

`harness/lifecycle/manifest.json` is the canonical transition source. Keep four concepts separate:

- **Phase/state**: what work is happening now.
- **Gate**: what a human approved or deterministic verification fixed as evidence.
- **Artifact**: the canonical source of truth for a decision or design.
- **Agent**: what a role may read/write during the current phase.

Project phases are `MIGRATION_PENDING → PLANNING → DESIGNING → ACTIVE`, with terminal `RETIRED`; planning/stack/architecture/design approvals are project gates rather than pseudo-states. Task phases are `DESIGNING → DEVELOPING → VERIFYING → REVIEWING → DEPLOY_READY`, with terminal `DONE`. Release and incident lifecycles remain separate. Full lifecycle mode blocks delivery until project `ACTIVE`; delivery-only mode is controlled migration compatibility.

<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->
<!-- Source: harness/rules/execution-safety.md; consumer: shared-agents; run npm run harness:generate -->
# Execution safety kernel

## Ownership boundary

`harness/lifecycle/manifest.json` is the only SDLC lifecycle state machine. Project, task, release, and incident states must never be redefined by the execution kernel. v13 Execution Runs bind only to approved Task work. They are subordinate runtime state used to pause, resume, authorize, reconcile, and trace one bounded unit of already-approved work; Project, Release, and Incident are never mirrored into Run state.

`harness/invariants/manifest.json`, `harness/execution/manifest.json`, and `harness/authorization/manifest.json` are canonical. Generated AGENTS/Cursor projections are not canonical.

## Runtime rules

- Start execution only from canonical persisted task/project state and an approved contract digest; chat history is context, never resume authority.
- A paused run does not advance or rewrite Project/Task/Release/Incident lifecycle state.
- Lifecycle approval and operation approval are distinct. Plan approval does not authorize an external write. Operation approval is bound to capability/provider/operation, target, and argument digest.
- Authorization is deny-by-default. Capabilities define what a provider can do; authorization defines which role may invoke which existing capability operation under which conditions. Authorization must not invent capability operations.
- Researcher and reviewer remain read-only. Verifier may run deterministic checks and append evidence but may not modify implementation or perform external writes. Implementer may modify approved repository paths but may not directly perform external writes.
- External-write/production retries require idempotency protection. Never blindly retry a non-idempotent write. An ambiguous external commit enters runtime recovery and must be reconciled against persisted evidence before retry or continuation; a retry must be re-authorized after reconciliation.
- Runtime recovery handles tool/runtime failures locally when safe. Escalate into the Incident lifecycle only for operational/customer/production/security impact or exhausted recovery; recovery itself may not create Incident state transitions.
- Runtime trace events reference canonical evidence artifacts by path/digest instead of copying their contents.
- `STOP-INVARIANT` cannot be resumed in place. Fix the invariant violation or contract version and start a new run from canonical state.

- Runtime Run mutation is single-writer. Do not bypass per-run locking or hand-edit Run/approval/event artifacts to manufacture authorization. Latest immutable operation decision wins; stale approvals are invalid.

## Executor fallback

- Cursor is the default primary executor for interactive implementation. One failed shell command is not an executor failure; a failure is one bounded strategy based on one explicit hypothesis that did not satisfy its verification target.
- After a bounded Cursor strategy fails, preserve failure evidence and use the generated `executor-fallback` Cursor Skill. Do not repeat the same strategy without materially new evidence.
- The secondary path is a fresh read-only Codex diagnosis. Codex may invoke the existing implementer for one materially different bounded strategy, or it may escalate directly to `human_decision` / `human_action`.
- After the secondary Codex implementation fails, autonomous fallback ends. Do not automatically return to Cursor or start another Codex implementation session. A human may explicitly authorize a new run/strategy.
- MFA, CAPTCHA, interactive authentication, secret creation, payment/contract, legal acceptance, and physical action are human-first; skip the executor chain. Never ask the human to paste a secret into chat.
- Human action is not proof of success. Verify the resulting state read-only before resuming.
- Codex fallback implementation does not weaken independent review: the final reviewer remains a fresh ephemeral read-only Codex session.
