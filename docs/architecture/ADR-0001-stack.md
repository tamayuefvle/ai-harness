# ADR-0001: Portfolio baseline stack

- Status: Proposed
- Date: 2026-07-25

## Context

React ポートフォリオを、学習成果、採用提示品質、運用負荷のバランスを取りながら公開する。

## Decision

- Next.js App Router
- TypeScript strict mode
- CSS Modules + CSS custom properties
- Vitest + React Testing Library
- Playwright
- GitHub Actions
- Vercel Preview / Production
- npm
- Node.js LTS を CI の基準とする

## Consequences

- Server / Client Component 境界を学ぶ必要がある。
- CSS の基礎と設計意図をコード上で示しやすい。
- unit と E2E の責務を分けられる。
- production dependency を増やさず開始できる。

## Revisit conditions

- content 更新頻度が高まり CMS が必要になる。
- UI パターンが増え、独自 CSS の保守負荷が明確になる。
- server-side data または認証が必要になる。
