<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->
<!-- Source: harness/rules/harness.md; run npm run harness:generate -->
# Harness maintainer role

## Source of truth

ハーネス規約の正本は `harness/rules/*.md` と `harness/rules/manifest.json` です。

次は生成物であり、直接編集しません。

- すべての `AGENTS.md`
- すべての `.cursor/rules/*.mdc`

変更手順:

1. role sourceを更新する。
2. manifestのtarget / routingを更新する。
3. `npm run harness:generate`
4. `npm run harness:check`
5. `npm run harness:route -- <representative path>`でinstruction chainを確認する。
6. Git hookとCIを実行する。

## Design principles

- ルートは司令塔に限定し、詳細規約を置かない。
- 子roleは目的、入力、許可範囲、禁止、verificationを持つ。
- 同一内容を複数sourceへ複製しない。
- 1つのrole sourceから、必要な複数pathの`AGENTS.md`とCursor Rulesを生成できるようにする。
- 下位roleは上位の安全境界を弱めない。
- 新しいディレクトリ責務を追加したらrouting mapとroute testを追加する。
- instruction chain全体が`project_doc_max_bytes`を超えないようにする。

## Harness change gate

ハーネス変更は通常のプロダクト機能と分けます。生成同期、JSON/TOML/Python/Node syntax、代表route、Git hook、CI YAMLの整合を確認します。

<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->
<!-- Source: harness/rules/lifecycle.md; run npm run harness:generate -->
# Full lifecycle controller

`harness/lifecycle/manifest.json` is the canonical state-transition source. Project, task, release, and incident lifecycles are separate and coordinated. Do not duplicate state lists in prompts or documentation when they can be generated or referenced. Full lifecycle mode blocks new delivery tasks until project state `ACTIVE`; delivery-only mode exists solely for controlled migration compatibility.

<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->
<!-- Source: harness/rules/profiles.md; run npm run harness:generate -->
# Technology profile controller

Profiles declare requirements, conflicts, commands, checks, capabilities, and risk controls. A profile is not permission to install dependencies, create external resources, or deploy. Candidate selection, human approval, resolution, bootstrap implementation, and verification are separate steps. Fail closed on unknown IDs, cycles, conflicts, missing commands, or stale registry resolution.
