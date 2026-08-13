# AI Development Harness v14.9.1

## Standalone user harness

v14.9 adds `deployment/aws` as a selectable hosting profile. It does not create AWS resources or deploy; humans operate AWS. See `docs/operations/aws-deployment.md`.

v14.8 ships a **private harness npm substrate** (`package.json` + `package-lock.json`) so post-root CI can enter `ready` and run `verify:harness`. This is not a product application runtime and does not select a product stack. Overlaying onto an existing application must merge the package fragments and must not overwrite that application's package metadata.

v14.7 added an optional CodeRabbit advisory PR review layer with repository-owned `.coderabbit.yaml`.

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

1. このフォルダの内容を Git root へコピーする。**既存アプリケーションの `package.json` / lockfile は上書きしない。** 配布物の `package.json` と `package-lock.json` はハーネス基板であり、製品メタデータではない。
2. `package.scripts.fragment.json` と `package.devDependencies.fragment.json` を既存 `package.json` へマージし、既存 lockfile を `npm install` で更新する。
3. 次を実行する。

```bash
npm run harness:generate
npm run harness:check
npm run harness:install
```

4. `harness/project.json` の `projectId` と `proposedProfiles` を設定し、`npm run profile:resolve` を実行する。

Git root に `package.json` がない新規配置では、先に `NEW_REPOSITORY_SETUP.md` を使います。この配布物を clone して新規リポジトリにする場合は、同梱のハーネス基板を使い `npm ci` します。`bootstrap --write` は既存 `package.json` を上書きしないため使いません。bootstrap は製品 stack の選択や lifecycle 承認は行いません。

## Recommended profile bundle (example)

Web/React/Next 向けの推奨例（bootstrap には含めません）:

`runtime/node`, `package-manager/npm`, `language/typescript`, `framework/react`, `framework/nextjs-app-router`, `test/vitest-rtl`, `test/playwright`, `quality/react-doctor`, `ci/github-actions`, `deployment/vercel`, `observability/web-basic`

AWS に出す場合は `deployment/vercel` の代わりに `deployment/aws` を選ぶ。手順は `docs/operations/aws-deployment.md`。Vercel と AWS の両方は、二重ホスティングを明示したときだけ同時選択する。

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

GitHub CodeRabbit App は任意の early defect-discovery layer です。repository 設定は `.coderabbit.yaml` を正本とし、Codex reviewer や canonical verification を置換しません。運用は `docs/workflow/GITHUB_INTEGRATION.md`、data handling と権限境界は `SECURITY.md` を参照してください。

GitHub の production Environment は `harness/integrations/github.json` が正本です。`npm run github:production-environment-check` で API-visible な設定を read-only 検査し、administrator bypass は UI で確認します。release gate 自体は deploy しません。

## Canonical verification pipeline

```bash
npm run verify:ci
npm run verify:all
```

See `docs/workflow/EXECUTION_SAFETY.md`, `docs/workflow/VERIFICATION_PIPELINE.md`, `docs/workflow/LIFECYCLE_GATES.md`, and `PACKAGE_MANIFEST.json` for package categories and constraints.
