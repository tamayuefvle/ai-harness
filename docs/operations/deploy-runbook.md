# Deployment runbook

Provider-specific hosting is selected by profile (`deployment/vercel` or `deployment/aws`). The harness does not deploy. Use this runbook with the matching provider doc.

## Preview

1. feature branch を push
2. `npm run github:verify`でcompleteなGitHub contextとrequired checksを確認
3. Preview URL を取得
   - Vercel: Preview deployment URL
   - AWS: `docs/operations/aws-deployment.md` の Preview（Amplify branch、preview stack 等）
4. Preview を対象に主要 E2E / smoke test
5. screenshots と結果を PR に記録

## Production prerequisites

- protected main に PR merge 済み
- `github:verify`成功とcontext report記録
- Preview 検証成功
- 人間による production 承認
- rollback 対象の直前正常 deployment を確認
- `npm run github:production-environment-check` 成功
- GitHub UI で production Environment の administrator bypass 無効を確認

release-gate workflow は承認境界のみを検証し、provider deployment は実行しない。実際の deployment は別の明示承認済み手順として扱う。AWS の人間作業は `docs/operations/aws-deployment.md`。

## Production smoke test

- `/`
- 自己紹介・経歴 section
- 作品一覧
- 代表作品詳細
- 連絡導線
- 存在しない URL の 404
- title / description / OGP
- mobile navigation
- browser console

## Rollback

直前の正常 deployment へ戻し、原因調査は新しい fix branch で行う。本番上で直接修正しない。

- Vercel: 直前正常 deployment へ alias を戻す
- AWS: 記録した `rollbackTarget`（直前の Amplify job / CloudFormation stack / ECS service revision 等）へ戻す

## Production prerequisites

- protected main に PR merge 済み
- `github:verify`成功とcontext report記録
- Preview 検証成功
- 人間による production 承認
- rollback 対象の直前正常 deployment を確認
- `npm run github:production-environment-check` 成功
- GitHub UI で production Environment の administrator bypass 無効を確認

release-gate workflow は承認境界のみを検証し、provider deployment は実行しない。実際の deployment は別の明示承認済み手順として扱う。

## Production smoke test

- `/`
- 自己紹介・経歴 section
- 作品一覧
- 代表作品詳細
- 連絡導線
- 存在しない URL の 404
- title / description / OGP
- mobile navigation
- browser console

## Rollback

Vercel の直前正常 deployment へ alias を戻し、原因調査は新しい fix branch で行う。
本番上で直接修正しない。
