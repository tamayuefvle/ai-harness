# Portfolio AI Harness v11.0.0

## Full lifecycle edition

v11 extends the compatible v10.1.1 task-delivery core with project discovery and technology selection upstream, plus release, observation, incident, and improvement lifecycles downstream. It uses one repository and one harness with separate state machines, composable technology profiles, structured evidence, and explicit human production authority.

The package is shipped in `MIGRATION_PENDING`. Review the migrated product/architecture baselines, run `npm run profile:resolve`, approve the migration contract, then advance the project to `ACTIVE`. See `docs/workflow/FULL_LIFECYCLE.md`.

### Safety boundary

Profiles describe checks and capabilities; they do not authorize dependency installation, cloud-resource creation, production deployment, or secret access. Release commands record external evidence only.

---

# Hierarchical Portfolio AI Engineering Harness

Cursor と Codex CLI を、同じ仕様、同じ役割分担、同じ品質ゲートで動かすための階層型スターターです。

## Core concept

ルート `AGENTS.md` は詳細規約を全部持つファイルではありません。

```text
AGENTS.md                # 司令塔: 分類、経路、全体ゲート、安全境界
├─ docs/AGENTS.md        # 文書領域のrouter
│  ├─ product/AGENTS.md
│  ├─ specs/AGENTS.md
│  ├─ architecture/AGENTS.md
│  └─ operations/AGENTS.md
├─ app/AGENTS.md         # Next.js application
├─ src/AGENTS.md         # src構成用application
│  ├─ components/AGENTS.md
│  ├─ lib/AGENTS.md
│  ├─ content/AGENTS.md
│  └─ styles/AGENTS.md
├─ tests/AGENTS.md
├─ e2e/AGENTS.md
├─ scripts/AGENTS.md
├─ harness/AGENTS.md
├─ .github/AGENTS.md
└─ Public asset rules are composed into root AGENTS.md
```

上位は「どこへ進むか」を決め、下位は「その役割で何を守るか」を定義します。

## One source, two agent systems

規約の正本:

```text
harness/rules/*.md
harness/rules/manifest.json
```

ここから次を同時生成します。

- 階層化された `AGENTS.md`
- 階層化された `.cursor/rules/*.mdc`

これにより、Codexはnested `AGENTS.md` instruction chainを使い、Cursorはnested Project Rulesを使います。`public/` はWeb公開領域なので、Public asset roleはルート `AGENTS.md` へ合成し、Cursorでは `.cursor/rules/public-assets.mdc` のglobで適用します。生成先を直接編集すると同期検査が失敗します。

## Generate and inspect

```bash
npm run harness:generate
npm run harness:check
npm run harness:route -- src/components/ProjectCard.tsx
```

出力例:

```text
Target: src/components/ProjectCard.tsx
Instruction chain:
1. AGENTS.md (command center)
2. src/AGENTS.md (specialized role)
3. src/components/AGENTS.md (specialized role)
The deepest applicable file has the most specific guidance.
```

## Install into an existing repository

1. このフォルダの内容をGit rootへコピーする。
2. `package.scripts.fragment.json` のscriptsと、`package.devDependencies.fragment.json` のdevDependenciesを既存`package.json`へマージする。
3. `doctor.config.json` をGit rootへ配置した状態で、`npm install`をローカル実行し、`package-lock.json`または`npm-shrinkwrap.json`のどちらか一つを更新する。
4. 次を実行する。

```bash
npm run harness:generate
npm run harness:check
npm run harness:install
```

5. CodexをGit rootまたは対象ディレクトリで起動し、instruction sourceを確認する。

```bash
codex --cd src/components --ask-for-approval never \
  "読み込んだ指示ファイルをrootから順に列挙し、現在の役割を要約して"
```

6. CursorではAgent sidebarのactive rulesと、導入済みReact Doctor pluginを確認する。

### Initial commit and npm CI bootstrap

この配布物はoverlayであり、単体では`package.json`とlockfileを持ちません。推奨は、アプリケーションの`package.json`と正本npm lockfileを同じcommitへ含めてからpushすることです。

リポジトリのroot commitをharness-onlyで作る場合、`quality`、`e2e`、`react-doctor`はbootstrap noticeを出してNode依存検証だけをskipします。この例外はroot commitだけです。2 commit目以降は次を満たさない限りfail closedになります。

- `package.json`が存在する。
- `package-lock.json`または`npm-shrinkwrap.json`のどちらか一つだけが存在する。
- `yarn.lock`、`pnpm-lock.yaml`、Bun lockfileを混在させない。
- package metadataをsymbolic linkにしない。

CIで`npm install`へ切り替えず、ローカルでlockfileを生成・commitし、CIは`npm ci`を維持します。

v10.1.0のharness-only root commitがすでに存在するリポジトリでは、v11.0.0適用commitは2 commit目になります。そのcommitへアプリケーションの`package.json`と正本npm lockfileも同時に含めるか、公開前であればroot commitを作り直します。v11.0.0だけを2 commit目として追加し、package metadataを後続commitへ先送りするとfail closedになります。

## Start a task

```bash
# Preferred auto-numbered entrypoint
npm run task:start -- "Portfolio foundation" "foundation"

# Explicit canonical ID when an external tracker assigns it
npm run task:new -- PF-001-foundation "Portfolio foundation"
```

Task IDs use one shared contract: uppercase prefix, at least three digits, and an optional lowercase slug (`PF-001-foundation`, `SEC-0001-security`).

ルート司令塔から次の経路を通します。

```text
docs/specs
→ docs/architecture（技術判断がある場合）
→ app/src/components/lib/content/styles
→ tests/e2e
→ .github
→ docs/operations
```

## Enforcement layers

1. canonical role sources
2. generated hierarchical AGENTS / Cursor Rules
3. Codex config, command rules, PreToolUse hook
4. local Git hooks
5. GitHub Actions
6. GitHub branch ruleset
7. Vercel Preview / production protection

`AGENTS.md`とCursor Rulesはprompt instructionです。最終的な強制はGit hooks、CI、branch protection、deployment protectionへ重ねます。

## GitHub settings

`main`を対象に次を有効化します。

- Require pull request
- Required checks: `quality`, `e2e`。React Doctor専用checkは観察期間後に`error` blockingへ昇格して追加
- Require branch up to date
- Block force push
- Block deletion
- Require conversation resolution
- 原則bypassなし

## Vercel settings

- feature branch: Preview
- production branch: `main`
- deployment checksを利用可能ならCI成功をpromotion条件にする
- productionは人間承認
- secretはVercel Environment Variablesへ保存

## Generated files

次は直接編集しません。

- `AGENTS.md`
- 下位のすべての `AGENTS.md`
- すべての `.cursor/rules/*.mdc`

`public/` 配下には `AGENTS.md`、`.cursor/`、`.codex/` を置きません。`npm run harness:check` はこの公開境界も検査します。

変更は `harness/rules/*.md` と `manifest.json` へ行います。


## Natural-language Cursor entrypoint

ユーザーはnpmコマンドを覚えず、Cursor Chatへ通常の日本語で依頼できます。

```text
トップページHeroの企画を始めて
今のタスクの設計に進めて
AC-001だけ実装して
CI相当でテストして
Codexで独立レビューして
Previewに出せる状態か確認して
```

`.cursor/rules/01-natural-language-orchestrator.mdc` が意図を工程へ変換し、必要な内部scriptを実行します。

任意の単一slash command:

```text
/portfolio <日本語の依頼>
```

詳細は `docs/workflow/CURSOR_CHAT_GUIDE.md` を参照してください。


## Three-stage Codex delegation

Codex is not started for every action.

1. `researcher`: conditional read-only research before design
2. `implementer`: conditional one-AC workspace-write implementation
3. `reviewer`: independent read-only review after verification

Cursor chooses the role through the active task, status and deterministic
decision helper.

```text
この企画を設計に進めて。必要ならCodexで調査して。
AC-001を実装して。CursorとCodexの適任を判定して。
検証後、別セッションのCodexで独立レビューして。
```

Reports:

```text
.harness/reports/<TASK>/github-context.json
.harness/reports/<TASK>/github-context-review.json
.harness/reports/<TASK>/verification.json
.harness/reports/<TASK>/research.json
.harness/reports/<TASK>/implementation-AC-001.json
.harness/reports/<TASK>/review.json
```

Delegation decisions are recorded in:

```text
docs/specs/<TASK>/delegation.md
```



## GitHub integration

The required GitHub path is the deterministic GitHub CLI gateway: normalized read evidence plus human-approved feature-branch push/PR proposals.
Authenticate in the execution environment and generate a normalized report:

```bash
gh auth login
npm run github:doctor
npm run github:context
```

For a fail-closed pull-request and required-check gate:

```bash
npm run github:verify
```

The default report excludes PR bodies, comments, issue bodies, logs and external
titles. It records fixed command evidence and a `complete`, `degraded` or
`unavailable` status.

GitHub MCP is not supported. Use `git` and `gh` over HTTPS.

See `docs/workflow/GITHUB_INTEGRATION.md` and ADR-0003.

## React Doctor integration

Cursor MarketplaceのReact Doctor pluginは、対話的な診断理解と局所修正に使います。ハーネスの品質ゲートはpluginの存在へ依存せず、project-localの`react-doctor@0.7.7`を共通wrapperから実行します。

```bash
npm run react:doctor:staged   # commit前。findingsはadvisory
npm run react:doctor:changed  # 通常のVERIFYING。errorでblocking
npm run react:doctor:full     # 専用改善taskのベースライン監査
npm run react:doctor:design   # suppressionを無視するread-only設計監査
npm run test:harness:react-doctor
```

結果は外部JSONのまま扱わず、次の内部schemaへ正規化します。

```text
harness/schemas/react-doctor-result.schema.json
.harness/reports/<TASK>/react-doctor-<mode>.json
.harness/reports/<TASK>/react-doctor-<mode>.raw.json
```

通常ゲートでは`--no-score`、`--no-telemetry`、`--no-supply-chain`を使用します。React Doctorはlint、typecheck、unit、build、E2Eを置き換えません。`/doctor`相当の全自動修正や`improve-react`による全体改善は、専用active specと人間承認がある場合だけ実行します。詳細は`docs/workflow/REACT_DOCTOR.md`を参照してください。

## Capability and optional MCP providers

The committed MCP configuration includes only optional Chrome DevTools browser evidence. Documentation is not routed through MCP: it uses the Documentation Capability, whose provider policy is canonical in `harness/capabilities/manifest.json`. Context7 CLI is an optional final fallback; Context7 MCP and GitHub MCP are unsupported.

```bash
npm run mcp:doctor
npm run capabilities:check
npm run github:doctor
```

No GitHub PAT is required by the committed harness configuration. See `docs/workflow/MCP_SETUP.md` and `docs/workflow/CAPABILITY_LAYER.md`.

## Capability and GitHub setup

Run `npm run capabilities:check`, then configure GitHub HTTPS with `gh auth login --git-protocol https --web` and `gh auth setup-git`. GitHub MCP and Context7 MCP are not included. See `docs/workflow/CAPABILITY_LAYER.md`.

## Mechanical lifecycle gates

The active lifecycle remains a single state machine:

```text
IDEA → SPEC_READY → PLAN_READY → IMPLEMENTING → VERIFYING → REVIEW_READY → DEPLOY_READY
```

`DONE` is a terminal completion operation, not an active state. Each spec contains a `gate.json` evidence index. Report outcomes and review counts are derived from Schema-validated artifacts rather than trusted CLI values. Every downstream transition and completion replays earlier gates and revalidates approvals, contract hashes, allowed paths, report semantics, evidence digests, exact HEAD, GitHub checks, React Doctor requirements, review diagnostics/findings, and release authorization. See `docs/workflow/LIFECYCLE_GATES.md`.

## Structured TDD evidence

SDD and TDD do not create parallel state machines. The implementation report records `test_discipline`: applicable changes require concrete Red and Green evidence; non-applicable changes require a concrete reason. Lifecycle gates validate this evidence before entering verification.

## Canonical verification pipeline

```bash
npm run verify:harness
npm run verify:static
npm run verify:react
npm run verify:application
npm run verify:e2e
npm run verify:ci
npm run verify:all
```

The Quality workflow calls `verify:ci`; the dedicated E2E workflow runs Playwright once per pull request. `verify:react` selects a full scan on the Git root commit and a changed scan once a parent commit exists. All Node-dependent workflows first apply the bootstrap-safe npm project-state contract. Use `verify:all` for a single local full run. Draft 2020-12 schema validation is included in `verify:harness`. See `docs/workflow/VERIFICATION_PIPELINE.md`.

## Worklog

Cross-session factual activity is recorded under `docs/worklog/`:

```bash
npm run worklog:context
npm run worklog:search -- "query"
npm run worklog:append -- --actor agent --task PF-001-example --summary "..." --evidence ".harness/reports/PF-001-example/implementation.json" --verification "passed"
npm run worklog:correct -- --id WL-... --actor human --reason "..." --summary "..."
```

Worklog IDs and monthly files use the machine's local calendar date, while each entry also records its IANA time zone and UTC timestamp. Existing entries are immutable; factual corrections are appended by a human. Evidence remains in `.harness/reports/`; worklog entries reference it without copying raw reports. See `docs/workflow/TIME_POLICY.md`.
