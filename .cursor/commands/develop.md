この後に書かれた日本語を、プロジェクト開発の作業意図として処理してください。

最初に `npm run task:context` を使い、ルート policy と
`01-user-task-dispatcher` に従って工程を判定してください。

Codex 発火方針:

- 設計前: `npm run ai:decide -- research`
  - required / recommended なら `npm run ai:research`
- 実装前: `npm run ai:decide -- implementation`
  - recommended かつ対象 AC が明示されている場合だけ
    `npm run ai:implement -- AC-xxx`
  - cursor_preferred なら Cursor が実装
- 検証後: `npm run ai:decide -- review`
  - required なら `npm run ai:review`
  - docs-only で省略する場合は delegation.md へ理由を記録

安全条件:

- researcher と reviewer は read-only。
- implementer は PLAN_READY 以降、feature branch、明示 AC の条件を満たす場合だけ。
- 同じ Codex セッションを実装とレビューへ使わない。
- production、dependency、secret、破壊的 Git 操作は自動実行しない。
- Codex report を Cursor が diff と検証結果で確認する。
- ユーザーに内部コマンドを入力し直すよう求めない。
- `MIGRATION_PENDING` のときはセットアップ案内に留め、ACTIVE へ自動進行しない。
