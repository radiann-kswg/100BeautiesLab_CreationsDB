# 2026-07-03 進捗: P6 bilingual wrapper 列分割表示（第一弾）

## 目的

P6 の未完了項目「bilingual wrapper の UI 列分割表示」を先行着手し、
`_enrichment.bilingualWrapperFields` メタを使った描画ルートを実装する。

## 変更点

- `pages/characters.js`
  - `rec._enrichment.bilingualWrapperFields` を path キーで参照できる `resolveBilingualWrapperMeta()` を追加。
  - standalone section renderer 呼び出し時の helper に、`bilingualColumnsText` と `resolveBilingualWrapperMeta` を追加。
- `lib/section-renders/streamingActivity.js`
  - `streamingActivitySection` の子フィールド描画で `resolveBilingualWrapperMeta("<親>.<子>")` を参照する処理を追加。
  - bilingual wrapper 判定時（例: `StreamingActivity.StreamingGreeting` / `StreamingActivity.ListenerNickname`）、
    JP/EN を `bilingualColumnsText()` で 2 列表示するルートを追加。
  - 既存のタググリッド表示・Summary 表示は維持し、bilingual wrapper のみ追加経路で描画。

## 確認

- 自動テスト（抜粋）:
  - `tests/pages.characters.syntax.test.js`
  - `tests/pages.characters.ui-output.test.js`
  - `tests/section-wrapper-common.test.js`
  - `tests/enrich.wrapper-summaries.test.js`
  - 結果: 32 passed / 0 failed
- 目視確認（ローカルサーバー）:
  - `Works_UnibyteLive / Primary / Letter.Generation=5`（S:ナーミィ）
  - Playwright 評価で `StreamingActivity` セクション内の `.bilingual-lines-grid` が 2 件生成されることを確認
  - ラベル: `配信挨拶`, `リスナーのニックネーム`（JP/EN 2 列）

## 影響範囲

- `pages/characters.js`
- `lib/section-renders/streamingActivity.js`
- `_work_in_progress/2026-07-03_current-task-ledger.md`

## 未完了 / 次アクション

- P6 残件:
  - Day / Era / Area の typedef 駆動を SW/enrich 側へ拡張
  - 二次創作 DB 表示（`sec_Category` / `sec_DesignedBy`）の UI 整理
  - 創作用語 DB / 基本資料 DB のテンプレート設計と承認
