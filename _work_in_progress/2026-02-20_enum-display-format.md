# 2026-02-20 EnumDef/EnumLink 表示整形（Rank/Rarity）

## 目的

- Rank 表示で「アルファベット表示」と「非アルファベット（説明/ラベル）表示」を共存させる。
- Rank だけでなく Rarity も同様に一般化し、フィールド用途ごとに `db_type.json($DefType).$display` で表記を制御できるようにする。

## 変更点の要約

- UI（[pages/characters.js](../pages/characters.js)）
  - `formatValueForDisplay()` に `fieldKey` を渡す配線を追加。
  - typedef の `$type` に `$EnumDef_*` が含まれる場合、参照キー（例: `#Rank3` / `#Rarity5`）を解決して表示整形。
  - `$EnumLink` が付く場合、作品メタ（`db_meta.json`）の `$EnumLink_${Field}` から label を解決。
  - `$display.rankFormat` / `$display.rarityFormat` / `$display.enumFormat` で、alpha/label の出し分けをフィールド単位に制御可能。
    - 既定（仮設定）: `$EnumLink` が解決できた場合は alphaLabel（コード＋ラベル）優先。

- Data
  - [data/db_type.json](../data/db_type.json) に `AbilityStats.$display.rankFormat` を追記（例示）。
  - [data/Works_UnauthedLogica/DataBases/db_type.json](../data/Works_UnauthedLogica/DataBases/db_type.json) に `ExistingRarity.$display.rarityFormat` を追記（例示）。

## 追記（2026-02-20）: EnumLink の解決強化

- 課題: `AbilityStats` などで `$EnumLink` が付いていても、EnumLink 定義が `db_meta.json` の `$VarsDef` 内でネストしている（例: `data/db_meta.json` の `$Def_AbilityStats.$EnumLink_AbilityText`）場合、UI が辞書を見つけられず `alphaLabel` が `alpha` 相当に見えることがある。
- 対応:
  - UI（[pages/characters.js](../pages/characters.js)）で、`$VarsDef` のネストから `$EnumLink_*` を探索して解決できるようにした。
  - typedef の `$display.enumLinkKey` で、参照する `$EnumLink_*` をフィールド単位に指定できるようにした（例: `AbilityStats` → `AbilityText`、`SpecLevel` → `SpecLevelText`）。
  - 詳細表示では work meta と global meta の `General.$VarsDef` を統合して、共通辞書を参照できるようにした。

## 影響範囲（編集したファイル）

- [pages/characters.js](../pages/characters.js)
- [data/db_type.json](../data/db_type.json)
- [data/Works_FLInvestigator78/DataBases/db_type.json](../data/Works_FLInvestigator78/DataBases/db_type.json)
- [data/Works_ShouArRiders/DataBases/db_type.json](../data/Works_ShouArRiders/DataBases/db_type.json)
- [data/Works_UnauthedLogica/DataBases/db_type.json](../data/Works_UnauthedLogica/DataBases/db_type.json)
- [CHANGELOG.md](../CHANGELOG.md)

## 未完了タスク

- フィールド用途ごとに `rankFormat/rarityFormat` をどの項目へ適用するか（作品横断の方針）を詰める。
  - 例: Rank を `alpha` のみにしたい項目、`labelAlpha` にしたい項目など。

## 検証

- `npm test`（Vitest）: パス（7/7）。

## 参考

- `db_meta.json` 側の EnumLink 例: `Works_UnauthedLogica` の `$EnumLink_ExistingRarity`
