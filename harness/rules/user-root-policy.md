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
2. 対象パスの router rule に従い、該当ドメインの provider-specific instruction へ進む（詳細 routing は各 router rule を参照）。
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
