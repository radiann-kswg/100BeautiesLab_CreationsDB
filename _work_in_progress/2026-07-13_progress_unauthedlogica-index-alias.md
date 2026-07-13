# アンオースドロジカ Index 機能拡張（エイリアスIndex・辞書解決・二重ネスト修正）

## 目的

アンオースドロジカで `DB_Primary`（`$IndexDef`: `Model`）と `DB_PrimaryMobs`（`$IndexDef_PrimaryMobs`: `Logic`）にIndex処理を分割した際に「Index解決が上手くいかない」症状が出たため、原因修正と併せて User 依頼の汎用Index機能を拡張する。

- `LogicAlt` のような複数Index（エイリアスIndex）を持てるようにする
- `(Model|Logic)Series` を運命線探偵78の `Suit` と同様の辞書解決にしつつ、`null` もキーとして許容する
- 代理周辺・アンオースドロジカ専用ではなく、他タイトルでも使える汎用 typedef 機能として実装する

## 原因調査の結果（実バグ）

`TypeDefUtils.normalizeValueByTypeSpec()`（`lib/data-common.js`）の `#Index` 正規化が、ネストIndexのフィールド値を rootKey で二重に包んでいた（`Logic: {Logic:{LogicSeries,...}}`）。このため **ネストIndexを持つ全作品**（運命線探偵78・パストダイヴァー・アンオースドロジカ）で、enrich 済みレコードに対する以下が黙って外れていた:

- UI `collectIndexEntries()`（一覧チップ / 詳細ピル / 直リンク照合）
- `supplementIndexFieldFromVarsDef()`（Index辞書補完）

また、`supplementIndexFieldFromVarsDef()` は `$Def_<rootKey>.#List_<key>` しか参照しておらず、`Dictionaries/dict_*.json` + `compatListKey` によるルート実行時合流（`#List_*`）が Index 辞書として機能していなかった。

## 変更点の要約

1. **`lib/data-common.js`**
   - `normalizeValueByTypeSpec()`: ネストIndexの正規形を「サブフィールドを直接持つオブジェクト」に修正。プリミティブは `{主キー: 値}`、旧二重ネスト形は unwrap。
   - `supplementIndexFieldFromVarsDef()`: 辞書解決を `$Def_<rootKey>.#List_<key>` → ルート `#List_<key>` → ルート `#Dict_<key>` へフォールバック。null キー行（`{ ModelSeries: null, ... }`）の解決を許容。
   - `TypeDefUtils.collectIndexAliasDefs()` 新設: `$DefType` 上の `#Index` 型 field（rootKey 以外）をエイリアスIndexとして収集。形状は hashTag 一致の `$IndexDef*` → 現行 IndexDef の順で継承。`$display.index: none/false` で opt-out。
   - `enrichRecords()`: エイリアス field も per-field IndexDef で正規化（`normalizeRecordByTypeDef()` に `indexDefByField` opt 追加）+ 辞書補完。
   - `searchRecords()`: エイリアスの dot-path 型ヒントを `typeByPath` へ追加。
2. **`pages/characters.js`**
   - `getWorkIndexAliasDefs()` 新設（data-common のUIミラー）。
   - `collectIndexEntries()`: 旧二重ネスト unwrap 耐性 / null キーの辞書ラベル表示（表示のみ・link対象外）/ エイリアスエントリ合流（一覧チップには出さず、詳細ピル+直リンクのみ。priority を主Indexより下げる）。
   - `pickPrimaryIndexSubDef()` に `#IndexListKey` スコア追加、詳細 `shownKeys` にエイリアス field 追加（二重表示抑止）、composite 直リンクから null キー/エイリアス除外。
   - `pages/characters.html` の `asset-version` → `2026.07.13.1`。
3. **データ**
   - `data/Works_UnauthedLogica/Dictionaries/db_meta.json`: `#Dict_ModelSeries` / `#Dict_LogicSeries` をカタログ登録（辞書本体は User 作成済みの `dict_ModelSeries.json` / `dict_LogicSeries.json`）。
4. **テスト**: `tests/enrich.index-alias-dict.test.js` 新設（13件）。
5. **ドキュメント**: `docs/schema-meta-processing.md` §3.5.2 / §3.5.3 追加、`CHANGELOG.md` 追記。

## 影響範囲（編集したファイル）

- `lib/data-common.js`
- `pages/characters.js` / `pages/characters.html`
- `data/Works_UnauthedLogica/Dictionaries/db_meta.json`
- `tests/enrich.index-alias-dict.test.js`（新規）
- `docs/schema-meta-processing.md` / `CHANGELOG.md`

## 検証

- `npm test`: 28ファイル / 271件 全成功
- 実ブラウザ（Live Server + SW更新後）:
  - UnauthedLogica PrimaryMobs: 一覧チップ「ロジック番号: N」復帰、ニッキー詳細に主Index（`Logic`）+ エイリアス（`LogicAlt`）ピル + 辞書ラベル（キリルシリーズ / 7400シリーズ）表示
  - エイリアス直リンク `?idx=141&idxKey=LogicAlt.Num` でニッキー解決
  - UnauthedLogica Primary: 「ロット番号: N」チップ + 「モデル系統: 人形兵ゼロイド」ピル（辞書解決）。`ModelSeries: null` レコードも正常表示
  - 回帰: FLInvestigator78（カード番号チップ復帰）/ PastDivers（月暦番号チップ復帰 + 辞書補完）/ NumberTales（番号チップ、スカラーIndex無変化）/ DestinyFoxRecords（`Unit` ピル + DBLinkマージ由来 `Generation` がエイリアスピルとして表示）

## 未完了タスク（User 引き継ぎ）

- [ ] `dict_ModelSeries.json` / `dict_LogicSeries.json` への null キー行のラベル値追記（例: `{ "ModelSeries": null, "ModelSeries_JP": "…" }`）— 創作文言のため User 入力に委ねる
- [ ] コミットは未実施（User の指示待ち）

## 参考

- `docs/schema-meta-processing.md` §3.5.1〜§3.5.3
- `_work_in_progress/2026-07-11_progress_works-merge-dfr-proxies.md`（サイドカーキー `$IndexDef_<DbNorm>` の先行実装）
