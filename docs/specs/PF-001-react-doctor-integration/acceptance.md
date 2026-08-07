# Acceptance criteria

| ID | Observable acceptance condition | Priority | Status | Evidence |
|---|---|---:|---|---|
| AC-001 | React Doctor CLIがexact versionで宣言され、canonical configがscore、telemetry、supply-chain network checkを通常ゲートから外す | Must | Pass | `package.devDependencies.fragment.json`, `doctor.config.json` |
| AC-002 | staged / changed / full / designを1つのdeterministic wrapperで実行し、skip・failure・partialをversioned reportへ記録する | Must | Pass | `scripts/harness/react-doctor.mjs`, schema, wrapper tests |
| AC-003 | pre-commitはstaged advisory、quality CIはchanged error gate、専用PR Actionはadvisoryで動く | Must | Pass | hook、quality workflow、react-doctor workflow |
| AC-004 | Cursor rulesとtask lifecycleが通常診断、全体監査、自動修正、suppressionの境界を明示する | Must | Pass | canonical rulesと生成物 |
| AC-005 | independent reviewerがReact Doctor reportを証拠として読み、findingをdiffで再確認する | Must | Pass | review prompt/schema/templates |
| AC-006 | 導入、更新、移行、rollback、障害対応が文書化される | Must | Pass | guide、ADR、README |

## Non-functional criteria

| ID | Condition | Verification |
|---|---|---|
| NFR-001 | wrapperはrepository root以外から呼ばれても正しいrootを解決する | source review + test override |
| NFR-002 | 外部JSON不正、version mismatch、CI base未解決を成功扱いにしない | Node fixture tests |
| NFR-003 | generated AGENTS / Cursor Rulesがcanonical sourcesと同期する | `node scripts/harness/check-rules.mjs` |
| NFR-004 | archiveにsecret、`.git`、runtime reportを含めない | package inspection |
