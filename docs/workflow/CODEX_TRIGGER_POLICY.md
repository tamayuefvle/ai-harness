# Codex trigger policy

## Overview

Cursorはオーケストレーター、Codexは限定された専門agentとして扱います。

```text
企画: Cursor
  ↓
設計前調査: Codex researcher（必要時）
  ↓
設計確定: Cursor + human
  ↓
実装: Cursor または Codex implementer
  ↓
検証: deterministic commands
  ↓
独立レビュー: Codex reviewer（原則必須）
  ↓
Preview / release: Cursor + CI + human
```

## Trigger 1: researcher

### Timing

`SPEC_READY`から設計へ進む前。

### Required or recommended when

- 変更候補が5file以上
- 2role以上へまたがる
- 新規routeやServer/Client boundaryがある
- ADR、dependency、外部service判断がある
- 影響範囲が不明
- 既存部品の再利用調査が必要

### Execution boundary

- new ephemeral session
- read-only sandbox
- no file edit
- no dependency installation
- report: `.harness/reports/<TASK>/research.json`

### Output use

Cursorがreportを読み、verified factとrecommendationを分け、
`plan.md`と`test-plan.md`へ必要部分だけ反映します。

## Trigger 2: implementer

### Timing

`PLAN_READY`または`IMPLEMENTING`。

### Required conditions

- target AC is explicit
- active plan and test-plan exist
- feature branch
- Codex decision is `recommended`
- no production, dependency, secret, destructive operation
- no simultaneous editing in the same worktree

### Suitable tasks

- type + data + UI + testの一貫変更
- 5file以上の横断実装
- 複数roleにまたがる機械的・構造的変更
- repository横断のfailure修正
- 仕様と設計が十分に固定された変更

### Cursor-preferred tasks

- copy、色、余白、animation、responsive微調整
- browserを見ながら反復するUI
- 1〜3fileの局所変更
- 未確定の仕様を含む変更

### Execution boundary

- new ephemeral session
- workspace-write sandbox
- one AC per invocation
- no commit, push, PR, deploy, dependency
- report: `.harness/reports/<TASK>/implementation-AC-xxx.json`

完了後、Cursorは実diffを確認し、テストを再実行します。

## Trigger 3: reviewer

### Timing

検証後、release判断前。

### Policy

runtime、config、test、user-visible behaviorに影響する変更は原則必須です。

省略可能:

- typoのみ
- commentのみ
- internal Markdownのみ

省略理由を`delegation.md`へ残します。

### Execution boundary

- implementerとは別のnew ephemeral session
- read-only sandbox
- diff + active spec + ACを評価
- report: `.harness/reports/<TASK>/review.json`

## Decision command

Cursor内部で次を使用します。

```bash
npm run ai:decide -- research
npm run ai:decide -- implementation
npm run ai:decide -- review
```

これは最終判断ではなくdeterministicな補助判定です。Cursorはspecと実際の状況も確認します。
