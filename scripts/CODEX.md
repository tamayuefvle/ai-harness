<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->
<!-- Source: harness/rules/scripts.md; consumer: codex; run npm run harness:generate -->
# Automation and developer tooling role

## Scope

generator、validation script、Git hook、local command、review wrapperを扱います。

## Rules

- deterministicで再実行可能にする。
- repository root以外から実行されても正しいrootを解決する。
- failureはnon-zero exit codeと具体的なremediationを返す。
- partial writeを避け、生成処理は可能な限りatomicにする。
- user fileを意図せず上書きしない。
- destructive operation、network script pipe、secret出力を禁止する。
- Linux / WSLを基準とし、Windows native対応を記載する場合は別commandを明示する。
- generated fileとcanonical sourceを明確に分ける。
- commandの変更時はREADME、Git hook、CI利用箇所を検索して同期する。
- 外部scannerの可変JSONを状態遷移へ直接結合せず、version付き内部schemaへ正規化する。
- React Doctorはproject-localのexact versionだけを実行し、`npx ...@latest`を品質ゲートで使用しない。
- React Doctorの通常ゲートではscore、telemetry、supply-chain network checkを無効にし、診断と終了codeを決定論的に扱う。
- worklog CLIはローカル日付・IANA time zone・UTC timestampを記録し、既存entryを変更せず、証拠本文や秘密情報を複製しない。
- human-facingな日付とmachine timestampは`scripts/harness/time.mjs`を使用し、`toISOString().slice(0, 10)`でローカル日付を生成しない。
- GitHub gatewayは固定read-only commandだけを配列引数で実行し、任意shell、任意`gh api`、write commandを受け付けない。
- GitHub commandのstdout/stderrをreportへ保存せず、外部title/body/comment/logは既定で除外する。
- staged scanはwrapperとして正しいexit codeを返し、Git hook側でadvisory化する。hard failureをclean scanへ変換しない。
- CI project-state preflightは`bootstrap | ready | invalid`を決定論的に分類し、bootstrapをroot commitだけに制限する。package metadata削除によるCI回避を許可しない。
- React Doctor CI wrapperはroot commitだけfull scanを選び、それ以外はcanonical changed scanとbase解決へ委譲する。

## Verification

- syntax validation
- fixtureまたはtemporary directoryでのsuccess / failure test
- exit code確認
- generated outputのidempotence確認
- React Doctor wrapperのno-project、no-change、blocking、invalid JSON、version mismatch fixture
- GitHub gatewayのcomplete/degraded/unavailable、untrusted opt-in、required-check failure fixture
- ZIP-style hook permission loss and execution fixture
- root/bootstrap/ready/invalid npm project-state、foreign lockfile、metadata deletion、symlink fixture
- root commit full scanと通常commit changed scanのReact Doctor CI fixture
