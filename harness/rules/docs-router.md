# Documentation router

## Role

`docs/` は、実装より先に意思決定と検証可能な期待値を残す領域です。このファイルは文書作業を下位の担当へ分岐させます。

## Route

- プロダクトの目的、対象者、価値、情報構造: `product/CODEX.md`（Codex） / `product/.cursor/rules/product.mdc`（Cursor）
- active task、要求、受入条件、計画、レビュー証拠: `specs/CODEX.md`（Codex） / `specs/.cursor/rules/spec-gates.mdc`（Cursor）
- 技術選定、依存、設計上のトレードオフ: `architecture/CODEX.md`（Codex） / `architecture/.cursor/rules/architecture.mdc`（Cursor）
- デプロイ、運用、障害対応、Definition of Done: `operations/CODEX.md`（Codex） / `operations/.cursor/rules/operations.mdc`（Cursor）
- 作業履歴、過去判断、セッション継続: `worklog/CODEX.md`（Codex） / `worklog/.cursor/rules/worklog.mdc`（Cursor）
- Cursor / Codex の役割分担やhandoff: `workflow/`。ルートの指示と矛盾させない。

## Documentation contract

- 既存実装と事実を確認してから文書化する。
- 将来案、採用済み判断、現在の実装を区別する。
- 主観的な表現だけで完了条件を作らない。
- 文書変更がコード変更を要求する場合、active specへ紐づける。
- 同じ事実を複数文書へ重複させず、正本と参照先を明確にする。
