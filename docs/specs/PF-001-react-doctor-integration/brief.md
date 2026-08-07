# PF-001-react-doctor-integration — React Doctor harness integration

## Background

CursorにReact Doctor pluginが適用済みだが、ハーネスの状態遷移、Git hook、CI、独立レビューへ接続されていない。

## Goal

React Doctorを効率的、再現可能、監査可能に運用し、通常のReact変更では差分だけを検査し、全体監査と自動修正を専用承認へ分離する。

## Target visitor

CursorとCodexを使ってReact / Next.jsポートフォリオを開発するrepository maintainer。

## In scope

- exact CLI dependency fragment
- canonical config
- staged / changed / full / design wrapper
- normalized result schema
- Git hookとCI
- Cursor rules、spec gate、review contract
- operation guide、ADR、templates

## Out of scope

- 実アプリの既存React finding修正
- React Doctor native agent hookの常時有効化
- production deploy
- warning blockingまたはbranch protection変更
- MCP追加

## Assumptions

- 実アプリ側でfragmentをpackage.jsonへmergeし、lockfileを生成する。
- Cursor pluginは既に利用可能。
- GitHubをCI providerとして利用する。

## Open questions

- 実アプリ適用後の誤検知率と平均実行時間はbaseline取得後に評価する。

## Approval record

- Approved by user: 2026-07-27
- Approved plan: three-layer integration with advisory staged/PR rollout and blocking changed scan
- Improvement ID: `IR-20260727-REACT-DOCTOR-001`
