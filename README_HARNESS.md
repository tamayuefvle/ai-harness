# AI Development Harness v14.3.0

## Standalone user harness

v14.3 adds **agent discovery** (`ai:discover`, session artifacts, assumption register, anti-fabrication checks, signal→product linking) on top of v14.2 progressive tiers and v14.1 product discovery entry.

The package ships in `MIGRATION_PENDING`. For a **new product**, run `npm run project:discover` and follow `docs/workflow/PRODUCT_DISCOVERY.md`. For **legacy migration**, follow `MIGRATION.md`. Set `projectId`, choose profiles, resolve, review baselines, approve, then advance to `ACTIVE`.

### Safety boundary

Profiles describe checks and capabilities; they do not authorize dependency installation, cloud-resource creation, production deployment, or secret access. Release commands record external evidence only.

---

# Hierarchical AI Engineering Harness

Cursor と Codex CLI を、同じ仕様、同じ役割分担、同じ品質ゲートで動かすための階層型スターターです。

## Core concept

ルート `AGENTS.md` は shared global policy です。Codex の directory specialization は generated `CODEX.md`、Cursor は scoped `.cursor/rules/*.mdc` を使います。

```text
AGENTS.md                # User root policy: authority, chain, stop conditions
├─ docs/CODEX.md         # Codex directory specialization
├─ src/CODEX.md          # Optional: Next.js under src/ (profile-selected)
├─ scripts/CODEX.md
├─ harness/CODEX.md
└─ .cursor/rules/*.mdc   # Cursor scoped specialization
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
