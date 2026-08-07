この後に書かれた日本語を、ポートフォリオ開発の作業意図として処理してください。

最初に `npm run task:context` を使い、ルート司令塔と
`01-natural-language-orchestrator` に従って工程を判定してください。

Codex発火方針:

- 設計前: `npm run ai:decide -- research`
  - required / recommendedなら `npm run ai:research`
- 実装前: `npm run ai:decide -- implementation`
  - recommendedかつ対象ACが明示されている場合だけ
    `npm run ai:implement -- AC-xxx`
  - cursor_preferredならCursorが実装
- 検証後: `npm run ai:decide -- review`
  - requiredなら `npm run ai:review`
  - docs-onlyで省略する場合はdelegation.mdへ理由を記録

安全条件:

- researcherとreviewerはread-only。
- implementerはPLAN_READY以降、feature branch、明示ACの条件を満たす場合だけ。
- 同じCodexセッションを実装とレビューへ使わない。
- production、dependency、secret、破壊的Git操作は自動実行しない。
- Codex reportをCursorがdiffと検証結果で確認する。
- ユーザーに内部コマンドを入力し直すよう求めない。
