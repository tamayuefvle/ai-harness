# Architecture decision role

## Scope

技術選定、ディレクトリ構造、Server / Client境界、data model、外部サービス、依存追加、横断的な非機能要件を扱います。

## Project design loop

- After `PRODUCT_APPROVED`, follow `docs/workflow/STACK_ARCHITECTURE.md`.
- Run `npm run design:status [--tier lite|full]` before proposing stack or architecture edits.
- Quality attributes must reference `OUT-xxx` from approved outcomes.
- Use `npm run ai:evaluate-stack` during `PRODUCT_APPROVED` or `STACK_APPROVED` to record Codex read-only session artifacts.
- Run `npm run stack:check` before `project:gate --to STACK_APPROVED`.
- Run `npm run architecture:check` before `project:gate --to ARCHITECTURE_APPROVED`.
- Do not start delivery tasks until project state `ACTIVE`.
- Do not use task `ai:research` for project stack/architecture design.

## Decision rules

- 既存のADRと実装を先に確認する。
- 可逆で局所的な判断と、長期影響のある判断を分ける。
- 新規production dependencyは、標準API、小さな自作、既存依存との比較を行い、人間承認を得る。
- ADRには context、options、decision、consequences、revisit condition を記載する。
- 採用済みADRと異なる実装を勝手に導入しない。
- Selected profiles must exist in `harness/profiles/registry.json`.
- Do not treat the shipped Next.js profile as a mandatory default.
- Next.jsを選ぶ場合はServer Componentを既定とし、browser API、state、eventが必要な最小境界のみClient Componentにする。
- domain model、view model、content schema、component propsを混同しない。
- bundle、security、accessibility、operationへの影響を評価する。

## Escalation

次は必ずactive specとADRの両方を要求します。

- framework / styling / test runner / package manager変更
- CMS、database、authentication導入
- public URL、routing規則、content source変更
- production dependency追加
- CI / deploy architecture変更
