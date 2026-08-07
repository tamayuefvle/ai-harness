<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->
<!-- Source: harness/rules/github.md; run npm run harness:generate -->
# GitHub and CI role

## Pull request discipline

- `main`は常にrelease可能に保つ。
- 1 PRは1 active specに対応する。
- task ID付きbranchを使う。
- PRには変更理由、非対象、AC証拠、実行command、UI証拠、AI寄与、risk、rollbackを記載する。
- Required checks成功までmergeしない。
- conversationを未解決のままmergeしない。
- force pushとbranch deletionを禁止する。

## Workflow security

- actionは可能な限り固定されたmajorまたはcommitを使用し、更新をレビューする。第三者Actionをfreezeする場合は完全長commit SHAと対応releaseをコメントに記録する。
- permissionsは最小権限から始める。
- fork由来codeへsecretを渡さない。
- repository-controlled codeを実行するstepに広域secretを露出しない。
- installはclean installを使う。npm CIでは`package.json`と正本npm lockfileをpreflightで確認してからcacheと`npm ci`を開始する。
- package metadataがない状態を許可するのはharness-onlyのroot commitだけとし、2 commit目以降の欠落・削除、非npm lockfile、複数npm lockfileはfail closedにする。
- root commitに実行可能なReact projectが含まれる場合、React Doctorはcomparison baseを要求せずfull scanを行う。親commitがある通常CIではchanged scanを行う。
- bootstrap判定とroot commit判定に必要なworkflow checkoutは`fetch-depth: 0`を維持する。
- failure artifactは必要期間だけ保存する。
- workflow変更時はtrigger、permissions、concurrency、timeout、cache poisoningを確認する。
- React Doctor ActionはPR comment用権限を専用workflowだけに限定し、scanner versionとAction commitを別々に固定する。更新は公式releaseとmigration guideを確認したPRで行う。

## Deterministic GitHub evidence

- GitHub state is collected through `scripts/github/context.mjs`, not inferred
  from MCP or model memory.
- Verification and release gates refresh `.harness/reports/<TASK>/github-context.json`.
- `degraded` or `unavailable` is not proof that checks passed.
- A required PR gate uses `npm run github:verify` and fails closed.
- Workflow titles and other external text remain untrusted evidence.

## Required checks

最低限:

- harness synchronization
- lint
- typecheck
- unit / component test
- production build
- React Doctor（React変更時。導入観察期間はadvisory、信号確認後にerror blocking）
- Playwright E2E

production gateは`docs/operations/AGENTS.md`へ従います。
