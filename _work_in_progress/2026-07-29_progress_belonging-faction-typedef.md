# 2026-07-29 進捗: `Belonging` の `$Def_Faction[]` 化と `$dictRef` 参照解決 / basicFields wrapper

## 目的

- `Belonging` を、`FromArea`（`$Def_BaseArea`）と同じ流儀の**構造型**へ寄せる。
- `dict_Faction.json` で二重管理だった `Faction` / `Belonging` の 2 列を統合する。
- 辞書行が持つ活動地域（`FactionsBaseArea`）を**参照解決**して、UI 表示と API 出力の双方で使えるようにする。
- 基本情報テーブル（basicFields）用の UI レンダラーを、field 名依存の分岐なしで追加する。

## User との合意事項（着手前確認）

- レコードの値は `[{ "Faction": "…" }]` へ**一括移行**する（読み取りは旧形式の文字列も互換維持）。
- 表示は「所属先（活動地域）」の**括弧併記**。
- 参照解決結果は UI 表示だけでなく **enrich 出力にも載せる**。
- 作業中の追加要望: meta 定義名は `$Def_Belonging` ではなく **`$Def_Faction`**（所属以外でも再利用するため）。`FromArea`（`$Def_BaseArea`）にも同様の UI ラッパーを実装する。

## 変更点の要約

### schema / データ

- `data/db_meta.json`
  - `General.$VarsDef.$Def_Faction` を新設（`Faction` = `#DictIndex`/`$dict: "Faction"`、`FactionsBaseArea` = `$Def_BaseArea`）。
  - 新規宣言: `$dictRef: { from, field }` / `$shorthand` / `$display.arrayLayout` / `$display.wrapper: "factionSummary"`。
  - `$Def_BaseArea` に `$display.wrapper: "baseAreaSummary"` を追加。
- `data/db_type.json`: `Belonging.$type` を `#DictIndex[]` → `$Def_Faction[]` へ。
- `data/Dictionaries/dict_Faction.json`: `Belonging` / `Belonging_JP` / `Belonging_EN` を削除し `Faction` 系へ一本化（31 行）。活動地域の列名は `BelongingArea` → `FactionsBaseArea`。
- 各作品のレコード / `_Commons` / `_Secondaries[]._Commons`: `Belonging` を `[{ "Faction": "…" }]` へ一括移行（16 ファイル / 83 箇所）。空配列・`{ hideText }` は対象外。
  - 移行は書式を壊さないテキスト置換で実施（一時スクリプトは `.cache/migrate-belonging.mjs`、Git 管轄外）。実行後 `npx prettier --write` で整形。

### lib / UI / SW

- `lib/basic-renders/def-object-common.js`（新規）: `$Def_*` 構造型の共通整形。`$type` が `#DictIndex` / `#ListIndex` の子要素は辞書ラベルへ解決し、`_JP` / `_EN` の子要素を補足として併記する純関数群（DOM 非依存）。
- `lib/basic-renders/faction.js`（新規）: `factionSummary` wrapper。`所属先（活動地域／地域補足）` の 1 行へ整形。配列は `arrayLayout` に従い 1 要素 1 行。
- `lib/basic-renders/baseArea.js`（新規）: `baseAreaSummary` wrapper。`地域（補足）` の 1 行へ整形。
- `lib/basic-renders/type-common.js`: `resolveDictRow()` / `collectVarsDefRoots()` を追加。scopeField 照合を構造化値（object 配列）にも対応。
- `lib/data-common.js`: `TypeDefUtils.findDictRow()` と `EnrichmentProcessor.buildDictRefResolutions()` を追加し、`_enrichment.dictRefs` を出力。`looksSearchableType()` に `$Def_Faction` を追加。
- `pages/characters.js`: `$Def_*` コンテナ解決ヘルパーを追加し、`$shorthand` によるスカラー→子要素解釈を辞書ラベル解決より**前**に実施。`$display.arrayLayout` に従った配列連結を追加。`$Def_BaseArea` のハードコード分岐は `baseAreaSummary` へ置き換えて削除。
- `pages/sw.js` / `api/sw.js` / `svc/sw.js`: `importScripts` に `basic-renders` の 4 ファイルを追加。
- `tools/build-roleplay-prompts.mjs`: `$shorthand` 宣言に従って構造化値を平坦化してからラベル解決（生成物の出力は不変）。

### ドキュメント

- `docs/schema-meta-processing.md` §4.5: `$Def_Faction` / `$Def_BaseArea` と `$dictRef` / `$shorthand` / `arrayLayout` の宣言例。
- `docs/wrapper-summary-registry.md`: `factionSummary` / `baseAreaSummary` と共通部品 `def-object-common.js` を追記。
- `docs/api-sw-spec.md` §7: `_enrichment.dictRefs` を追記。
- `AGENTS.md`: 「辞書行からの参照解決（`$dictRef`）」「basicFields の構造型描画」の運用ルールを追加 → `npm run agents:build` で生成物を更新。
- `CHANGELOG.md`: 同日エントリを追記。

## 影響範囲（編集ファイル）

- data: `db_meta.json` / `db_type.json` / `Dictionaries/dict_Faction.json` / 各作品 `DataBases/db_*.json`・`db_meta.json`（16 ファイル）
- lib: `basic-renders/{type-common,def-object-common,faction,baseArea}.js` / `data-common.js`
- pages/api/svc: `pages/characters.js` / `pages/sw.js` / `api/sw.js` / `svc/sw.js`
- tools: `build-roleplay-prompts.mjs`
- tests: `faction.render.test.js`（新規）/ `baseArea.render.test.js`（新規）/ `data.shape.test.js` / `commons.secondaries.test.js` / `enrich.wrapper-summaries.test.js` / `pages.characters.ui-output.test.js` / `sw.importscripts-scope.test.js`
- docs / AGENTS.md / CHANGELOG.md / `.github/copilot-instructions.md`（生成物）

## 検証

- `npm test`: 44 ファイル / 623 件すべて成功（新規 30 件）。
- `npm run data:order:check`: 0/1287 レコード整列（キー順の差分なし）。
- `npm run roleplay:check`: `changed=0`（配布用プロンプト生成物への影響なし）。
- `npm run agents:build`: `.github/copilot-instructions.md` を更新。
- UI 表示は `tests/pages.characters.ui-output.test.js` で end-to-end 検証済み（`所属` = `夜月機関 / Yadzuki Organization（九蓮国 / LotusNinea）`、`出身地` = `九蓮国 / LotusNinea（幼少期のみ）`）。ローカル HTTP サーバーでの目視確認は未実施。

## 未完了タスク / 申し送り

- ブラウザ実機での目視確認（キャラシート詳細の `所属` / `出身地` 表示、複数所属の改行）。
- Cloudflare Workers 実 API（`pkg/cloudflare/`）は `_enrichment` を返さないため、`dictRefs` は SW 疑似 API 専用。Workers 側へ載せるかは今後の判断。
- `$Def_Faction` は所属以外のフィールドでも再利用できる形にしてあるが、現時点の適用先は `Belonging` のみ。
- 作業中、`data/Dictionaries/dict_Faction.json` の N3US 大学行（`Faction_JP`）と `Works_FLInvestigator78` の `_Commons` に、本作業とは別の未コミット編集が混在していた（User 側の編集と判断し非改変）。コミット前に差分確認を推奨。
