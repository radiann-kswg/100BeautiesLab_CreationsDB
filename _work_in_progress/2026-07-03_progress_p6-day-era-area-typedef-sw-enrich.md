# 2026-07-03 進捗: P6 Day / Era / Area の typedef 駆動拡張（SW/enrich）

## 目的

P6 残件のうち「Day / Era / Area の typedef 駆動を SW/enrich 側へ拡張」を先行実装し、
field 名依存フォールバックに寄っていた挙動を schema/vars role 宣言へ寄せる。

## 変更点

- `lib/data-common.js`
  - `buildWrapperSummaries()`:
    - wrapper 解決の `typeSources` に `ctx.globalMeta` と `ctx.mergedVars` 由来 source を追加。
    - `wrapper-common` の `resolveTypeDefContainer()` が参照する `source.$VarsDef` / `source.General.$VarsDef` の両経路を満たす形で供給。
    - これにより、`data/db_meta.json` 側の `General.$VarsDef.$Def_Day.$display.role`（`month` / `dayOfMonth` / `annotation`）を SW/enrich 側 summary でも利用可能にした。
  - `TypeDefUtils.looksSearchableType()`:
    - `#DictIndex`, `$Def_Day`, `$Def_StoryEra*`, `$Def_BaseArea` を検索対象判定へ追加。
    - Day / Era / Area 系フィールドを `_enrichment.searchableText` へ typedef 駆動で取り込めるようにした。

- `lib/sw-common.js`
  - `decorateDatabaseCatalogEntries()` 呼び出し側（bootstrap / works/{work}/db）で
    wrapper summary 解決用 `typeSources` に `globalMeta` を追加。

## テスト

- `tests/enrich.wrapper-summaries.test.js`
  - Day role 定義（`MM`/`DD`/`Note`）を `readGeneralVarsDefGlobal()` 経由で与え、
    SW/enrich 側で role 解釈された `BirthDay` summary（`1/7（記念日）`）が生成されることを追加検証。
  - Day/Era/Area 系型（`$Def_Day`, `$Def_StoryEraCatalog`, `$Def_BaseArea`, `#DictIndex[]`）が
    `_enrichment.searchableText` に含まれることを追加検証。

- 実行結果:
  - `tests/enrich.wrapper-summaries.test.js`
  - `tests/sw.work-meta-info.test.js`
  - `tests/pages.characters.ui-output.test.js`
  - 合計: 32 passed / 0 failed

## 影響範囲

- `lib/data-common.js`
- `lib/sw-common.js`
- `tests/enrich.wrapper-summaries.test.js`
- `_work_in_progress/2026-07-03_current-task-ledger.md`

## 未完了 / 次アクション

- P6 残件:
  - 二次創作 DB 表示（`sec_Category` / `sec_DesignedBy`）の UI 整理
  - 創作用語 DB / 基本資料 DB のテンプレート設計と承認
