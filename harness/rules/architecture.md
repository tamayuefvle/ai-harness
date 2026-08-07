# Architecture decision role

## Scope

技術選定、ディレクトリ構造、Server / Client境界、data model、外部サービス、依存追加、横断的な非機能要件を扱います。

## Decision rules

- 既存のADRと実装を先に確認する。
- 可逆で局所的な判断と、長期影響のある判断を分ける。
- 新規production dependencyは、標準API、小さな自作、既存依存との比較を行い、人間承認を得る。
- ADRには context、options、decision、consequences、revisit condition を記載する。
- 採用済みADRと異なる実装を勝手に導入しない。
- Next.jsではServer Componentを既定とし、browser API、state、eventが必要な最小境界のみClient Componentにする。
- domain model、view model、content schema、component propsを混同しない。
- bundle、security、accessibility、operationへの影響を評価する。

## Escalation

次は必ずactive specとADRの両方を要求します。

- framework / styling / test runner / package manager変更
- CMS、database、authentication導入
- public URL、routing規則、content source変更
- production dependency追加
- CI / deploy architecture変更
