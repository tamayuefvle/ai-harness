# User project harness maintenance

## Scope

`harness/` は **このプロジェクト** の規約・lifecycle・profiles・schemas・生成物を保守する領域です。配布パッケージ（ai-harness）自体の major 公開、メンテナ制御面、自己改善オーケストレーションはここでは扱いません。

## Source of truth

ハーネス規約の正本は `harness/rules/*.md` と `harness/rules/manifest.json` です。

次は生成物であり、直接編集しません。

- root `AGENTS.md`
- すべての `CODEX.md`
- すべての `.cursor/rules/*.mdc`

変更手順:

1. role source を更新する。
2. manifest の target / routing / `requiresProfiles` を更新する。
3. `npm run harness:generate`
4. `npm run harness:check`
5. `npm run harness:route -- <representative path>` で instruction chain を確認する。
6. Git hook と CI を実行する。

## Design principles

- ルートは薄い shared policy に限定し、詳細規約は Codex `CODEX.md` / Cursor scoped `.mdc` へ consumer 別に投影する。
- 子 role は目的、入力、許可範囲、禁止、verification を持つ。
- 同一内容を複数 source へ複製しない。
- stack 固有 rule は profile 選択後のみ生成する（`requiresProfiles`）。
- 下位 role は上位の安全境界を弱めない。

## Harness change gate

ハーネス変更は通常のプロダクト機能と分けます。生成同期、JSON schema、代表 route、Git hook、CI YAML の整合を確認します。未使用の optional scaffold は削除してよいが、profile 未選択時に stack rule が誤生成されないことを確認します。
