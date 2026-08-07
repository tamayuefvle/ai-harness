<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->
<!-- Source: harness/rules/frontend-app.md; run npm run harness:generate -->
# Next.js application implementation role

## Scope

この指示は、page、layout、route、Server Component、Client Component、およびアプリケーション組み立てへ適用します。

## Before editing

- active specと対象ACを確認する。
- 対象ディレクトリのさらに下位に `AGENTS.md` があれば読む。
- 既存route、layout、component、data sourceを調査する。
- architecture判断が必要なら実装前にADRへ分岐する。

## Implementation rules

- Next.js App RouterとTypeScript strictを維持する。
- Server Componentを既定にし、`"use client"`を必要最小限にする。
- page / layoutは組み立てに集中させ、再利用UI、domain logic、content dataを分離する。
- loading、empty、error、not-foundを設計する。
- route parameterや外部入力を境界で検証する。
- metadata、canonical、OGP、robotsの一貫性を保つ。
- 不要なfetch、effect、global state、client-side JavaScriptを増やさない。
- UIの見た目だけでなく、keyboard、responsive、reduced motionを満たす。
- public APIやvisitor-visible behaviorを変えた場合はspecとREADMEを更新する。

## Required verification

- lint
- typecheck
- relevant unit/component tests
- production build
- React Doctor changed scan（`npm run react:doctor:changed`）
- critical E2E
- 320px / 768px / 1440px manual check
- React Doctorのfindingは自動修正せず、active ACとServer / Client境界を確認してから最小修正する
