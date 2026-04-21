# 2026-04-21 progress secondary commons defaults

- 目的: 二次創作向け `_Secondaries` で、全 `sec_**` が `null` / 空の定義をデフォルト fallback とし、条件付き定義を優先するように揃える。
- 変更点の要約: Service Worker 側と pages 側の `_Secondaries` 選択ロジックを明示的な fallback 方式へ整理し、順序依存を避けるテストを追加。関連ドキュメントにも優先順位ルールを追記。
- 実データ補足: `data/Works_NumberTales/DataBases/db_SelfSecondary.json` の一部レコードで `sec_DesignedBy` が `sec_DesDesignedBy` になっており、`ナンバーテールズ化企画` 用 `_Commons` に一致していなかったため正規キーへ修正。
- 影響範囲: `lib/sw-common.js`, `pages/characters.js`, `tests/commons.secondaries.test.js`, `docs/api-sw-spec.md`, `docs/db-update-guidelines.md`, `.github/copilot-instructions.md`
- 未完了タスク: テスト実行で既存回帰がないか確認する。
- 参考リンク: `data/Works_NumberTales/DataBases/db_meta.json`, `data/Works_NumberTales/DataBases/db_SelfSecondary.json`
