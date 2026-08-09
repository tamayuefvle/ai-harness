# AI Harness v13.1.0

## Standalone user harness

v13.1 is a **standalone** engineering harness: clone this repository and run product → spec → implement → verify → release → operate without external maintainer tooling. It preserves the v12 lifecycle and thin user root policy while adding Task-bound Execution Runs, deny-by-default operation authorization, fail-closed recovery, and a bounded Cursor → Codex → Human executor fallback.

The package ships in `MIGRATION_PENDING`. Set `projectId`, choose `proposedProfiles`, run `npm run profile:resolve`, review baselines, approve migration, then advance to `ACTIVE`. See `docs/workflow/FULL_LIFECYCLE.md` and `MIGRATION.md`.

### Safety boundary

Profiles describe checks and capabilities; they do not authorize dependency installation, cloud-resource creation, production deployment, or secret access. Release commands record external evidence only.

---

# Hierarchical AI Engineering Harness

Cursor と Codex CLI を、同じ仕様、同じ役割分担、同じ品質ゲートで動かすための階層型スターターです。

## Core concept

ルート `AGENTS.md` は詳細規約を全部持つファイルではありません。

```text
AGENTS.md                # User root policy: authority, chain, stop conditions
├─ docs/AGENTS.md        # Documentation router
│  ├─ product/AGENTS.md
│  ├─ specs/AGENTS.md
│  ├─ architecture/AGENTS.md
│  └─ operations/AGENTS.md
├─ app/AGENTS.md         # Optional: Next.js (profile-selected)
├─ src/AGENTS.md
├─ components/AGENTS.md
├─ tests/AGENTS.md
├─ e2e/AGENTS.md
├─ scripts/AGENTS.md
├─ harness/AGENTS.md
└─ .github/AGENTS.md
```

Optional scaffold directories remain bundled but apply only when matching profiles are selected. You may delete unused paths.

## One source, two agent systems

規約の正本:

```text
harness/rules/*.md
harness/rules/manifest.json
```

ここから次を同時生成します。

- 階層化された `AGENTS.md`
- 階層化された `.cursor/rules/*.mdc`

生成先を直接編集すると同期検査が失敗します。

## Generate and inspect

```bash
npm run harness:generate
npm run harness:check
npm run harness:route -- path/to/target
npm run execution:check
```

## Install into an existing repository

1. このフォルダの内容を Git root へコピーする。
2. `package.scripts.fragment.json` と `package.devDependencies.fragment.json` を既存 `package.json` へマージする。
3. 次を実行する。

```bash
npm run harness:generate
npm run harness:check
npm run harness:install
```

4. `harness/project.json` の `projectId` と `proposedProfiles` を設定し、`npm run profile:resolve` を実行する。

Git root に `package.json` がない新規配置では、先に `NEW_REPOSITORY_SETUP.md` を使います。bootstrap はハーネス実行用の最小 npm manifest だけを作り、製品 stack の選択や lifecycle 承認は行いません。

## Recommended profile bundle (example)

Web/React/Next 向けの推奨例（bootstrap には含めません）:

`runtime/node`, `package-manager/npm`, `language/typescript`, `framework/react`, `framework/nextjs-app-router`, `test/vitest-rtl`, `test/playwright`, `quality/react-doctor`, `ci/github-actions`, `deployment/vercel`, `observability/web-basic`

## Natural-language Cursor entrypoint

```text
/develop <日本語の依頼>
```

`.cursor/rules/01-user-task-dispatcher.mdc` が意図を工程へ変換します。詳細は `docs/workflow/CURSOR_CHAT_GUIDE.md`。

## Three-stage Codex delegation

1. `researcher`: conditional read-only research before design
2. `implementer`: conditional one-AC workspace-write implementation
3. `reviewer`: independent read-only review after verification

各 `ai:*` launcher は最初に `codex:preflight` を実行します。project trust は診断のみで自動設定せず、repo-local MCP transport は完全定義のまま Chrome DevTools を disabled-by-default にします。

GitHub の production Environment は `harness/integrations/github.json` が正本です。`npm run github:production-environment-check` で API-visible な設定を read-only 検査し、administrator bypass は UI で確認します。release gate 自体は deploy しません。

## Canonical verification pipeline

```bash
npm run verify:ci
npm run verify:all
```

See `docs/workflow/EXECUTION_SAFETY.md`, `docs/workflow/VERIFICATION_PIPELINE.md`, `docs/workflow/LIFECYCLE_GATES.md`, and `PACKAGE_MANIFEST.json` for package categories and constraints.
