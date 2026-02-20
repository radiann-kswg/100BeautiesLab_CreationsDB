# 2026-02-20 進捗ログ: `$display.section` / `$display.tagSpace` の作品別展開

## 目的

- `db_type.json($DefType)` を起点に、UI/SW の「表示分類」「単位表示」「タグ領域（管理主体）」をスキーマ宣言で表現できるようにする。
- まずは後方互換なメタ情報 `"$display"` の追記を進め、実装側（UI/SW）のスキーマ駆動化に備える。

## 変更点の要約

- 作品別の `data/Works_*/DataBases/db_type.json`（7件）へ、以下を中心に `"$display"` を追記。
  - `Images`: `section="images"`, `tagSpace="internal"`
  - enum/list 系（例: `SpetialPattern`, `SpecLevel`, `Material` 等）: `section="spec"`, `tagSpace="creation"`
  - 関係ラベル（NumberTales の `RelationLabel`）: `section="profile"`, `tagSpace="creation"`
- UnauthedLogica の enum link（`ExistingRarity`）にも `section/tagSpace` を付与。

## 影響範囲（編集したファイル）

- data/Works_DestinyFoxsRecords/DataBases/db_type.json
- data/Works_FLInvestigator78/DataBases/db_type.json
- data/Works_NumberTales/DataBases/db_type.json
- data/Works_Proxies/DataBases/db_type.json
- data/Works_ShouArRiders/DataBases/db_type.json
- data/Works_SinisterChangingGirls/DataBases/db_type.json
- data/Works_UnauthedLogica/DataBases/db_type.json
- CHANGELOG.md

## 検証（テスト・確認観点）

- `npm test`（Vitest）: passed（7/7）
  - JSON 構文・shape・SW enrich 基本テストの回帰がないことを確認。

## 未完了タスク

- UI/SW 実装側で `"$display"` を解釈し、既存のハードコード（分類など）をスキーマ駆動へ移行。
- UI（`pages/characters.js`）は `"$display.unit"` を参照して単位表示を typedef 駆動化済み（cm/kg ハードコード撤去）。
- UI（`pages/characters.js`）は `"$display.section"` を参照して、未表示のトップレベル項目を `basic/profile/spec/other` に自動振り分けして表示するよう対応済み。
- `section`/`tagSpace` の値（`basic/profile/spec/images/other`、`creation/creatorProgress/system/internal` 等）をどこまで厳格にするかの確定。

## 参考リンク

- `_work_in_progress/2026-02-20_schema-driven-display-format.md`（設計メモ）
