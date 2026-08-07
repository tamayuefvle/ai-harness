# Deployment runbook

## Preview

1. feature branch を push
2. `npm run github:verify`でcompleteなGitHub contextとrequired checksを確認
3. Vercel Preview URL を取得
4. Preview を対象に主要 E2E / smoke test
5. screenshots と結果を PR に記録

## Production prerequisites

- protected main に PR merge 済み
- `github:verify`成功とcontext report記録
- Preview 検証成功
- 人間による production 承認
- rollback 対象の直前正常 deployment を確認

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
