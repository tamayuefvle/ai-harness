# Cursor × Codex CLI operating model

## v14 provider projection and Cursor transport

Shared policy is generated only to root `AGENTS.md`. Directory specialization is generated to `CODEX.md` for Codex and scoped `.cursor/rules/*.mdc` for Cursor, avoiding duplicate Cursor context. The source remains `harness/rules/*` plus its manifest.

Cursor IDE and Cursor CLI are transports of one logical Cursor executor and share one bounded-strategy budget. `npm run cursor:preflight` checks the optional CLI and committed policy projections. Read-only/reviewer roles cannot write; implementer execution is confined to a linked worktree under the Git common directory, uses no auto-apply, and leaves the diff for human/agent inspection. Cursor Hooks are defense in depth; project permissions, worktree isolation, authorization, and human control points remain authoritative.

## Instruction architecture

ルート `AGENTS.md` は司令塔です。詳細ルールを保持せず、依頼と対象パスを分類して下位roleへ分岐します。

Codexは、Gitルートから現在の作業ディレクトリまでの `AGENTS.md` をinstruction chainとして読みます。深い階層の内容ほど対象に具体的です。

Cursorでは、ルート `AGENTS.md` を司令塔として使い、各ディレクトリの `.cursor/rules` を下位roleの実行規約として自動attachさせます。下位 `AGENTS.md` とCursor Rulesは同じcanonical sourceから生成します。

## Example routes

```text
docs/specs/PF-001/plan.md
├─ AGENTS.md
├─ docs/AGENTS.md
└─ docs/specs/AGENTS.md

src/components/ProjectCard.tsx
├─ AGENTS.md
├─ src/AGENTS.md
└─ src/components/AGENTS.md

e2e/portfolio.spec.ts
├─ AGENTS.md
└─ e2e/AGENTS.md
```

経路確認:

```bash
npm run harness:route -- src/components/ProjectCard.tsx
```

## Responsibilities

### Cursor

- 人間との企画対話（`DISCOVERY` では `.cursor/skills/product-discovery`）
- active file周辺のUI実装
- ブラウザを見ながらの微調整
- 学習内容と変更理由の説明

### Codex CLI

- リポジトリ全体の調査
- `DISCOVERY` 中の read-only product facilitation（`npm run ai:discover`）
- `PRODUCT_APPROVED` / `STACK_APPROVED` 中の read-only stack/architecture facilitation（`npm run ai:evaluate-stack`）
- spec / planに基づく複数ファイル変更
- test作成とfailure解析
- read-onlyの独立diff review
- 定型的な検証とレポート

同じbranch / worktreeを同時編集しません。

## Recommended task flow

1. ルート司令塔で依頼を分類する。
2. 対象経路の下位roleを読む。
3. `npm run task:new -- PF-001-slug "Title"` でactive specを作る。
4. product / specs / architectureの必要経路で設計を固める。
5. 独立branch / worktreeで実装し、implementation reportへ`test_discipline`証拠を記録する。
6. tests / e2e roleに従って検証する。
7. `npm run github:context` で必要なGitHub証拠を正規化し、`npm run verify:ci` を通す。
8. GitHub context reportを渡して`npm run ai:review`をread-onlyで実行する。
9. operations / GitHub roleのgateを通してPreview、本番承認へ進む。

## Handoff

toolを切り替えるときはchat履歴に依存せず、repositoryへ次を残します。

- active spec
- current branch
- `.harness/reports/<TASK>/github-context.json`（GitHub状態がmaterialな場合）
- instruction route
- completed AC
- changed files
- failing commandと主要log
- unresolved decision
- next concrete action

## Terminal completion

`DONE` is not an active status. Completion is an operation from `DEPLOY_READY` that writes a marker and clears the active task.
