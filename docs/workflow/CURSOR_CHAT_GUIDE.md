# Cursor chat operation guide

npmやCodex CLIのコマンドを覚える必要はありません。通常の日本語で依頼します。

## Planning

```text
作品一覧ページの企画を始めて。
採用担当者が、代表作品と私の役割を比較できるようにしたい。
今回は企画と受入条件まで。コードはまだ書かないで。
```

## Design with conditional Codex research

```text
この企画を設計に進めて。
必要ならCodexにread-onlyで既存コードを調査させて、
その結果を使ってplanとtest-planを作って。
```

## Implementation owner selection

```text
設計どおりAC-001を実装して。
CursorとCodexのどちらが適切か判定してから進めて。
```

- 小さなUI修正: Cursor
- data/type/UI/testの横断変更: Codex implementer候補
- Codexを使う場合も1回につき1AC

## Verification

```text
現在の変更をCI相当で検証して。
Codex実装だった場合も、Cursor側でもう一度結果を確認して。
```

## Independent review

```text
検証が通ったら、別セッションのCodexをread-onlyで起動して独立レビューして。
```

## Release preparation

```text
レビュー指摘を確認して、Previewに出せる状態か判定して。
本番には出さないで。
```

## Optional entrypoint

```text
/develop <日本語の依頼>
```

通常チャットでも同じルールが適用されます。
