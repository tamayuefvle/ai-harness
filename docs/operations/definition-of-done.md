# Definition of Done

- active spec の Must AC がすべて証拠付きで Pass
- rule generation が同期済み
- GitHub / Git hook / React Doctor harness tests が成功
- lint / typecheck / unit / build / E2E が成功
- GitHub状態がmaterialな場合、最新context reportがcomplete。PR gateではrequired checks成功
- React関連変更ではReact Doctor changed scanが成功し、正規化reportをレビュー済み
- 320px、768px、1440px で主要画面確認
- keyboard 操作と focus を確認
- console error なし
- metadata / OGP / 404 / external links を確認
- P0 / P1 finding なし
- P2 finding とReact Doctor warningは修正または受容記録済み
- README / ADR / spec 更新済み
- Preview smoke test 成功
- production は人間承認済み
- rollback 方法が確認済み
