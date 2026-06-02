# 2026-06-02 進捗ログ: `AI_Optout` フラグの新設と初期適用

## 目的

- 作品別 `db_meta.json` に DB 単位の **AI タグ生成 / AI 学習抑止フラグ** を設置し、`tools/patch-aihints.mjs` 経由の書き込みをガード可能にする。
- 同時に AI 学習・LLM 取り込みに対する opt-out 表明シグナルを兼ねる単一フラグとして運用する。

## 設計判断

- フラグ名: **`AI_Optout`** （大文字 `O` + 小文字 `tout`。揺れ禁止）
- 配置: 作品別 `db_meta.json` の `Databases.#DB_<DbName>` 直下に `"AI_Optout": true`
- スキーマ宣言: `$Def_DatabaseCatalog` には宣言しない（既存の `DB_Hidden` / `Works_Hidden` と同様、表示メタではなくガード用フラグのため）
- メタ欠損時: チェックをスキップ（既存の欠損耐性方針を踏襲）
- バイパス手段: `tools/patch-aihints.mjs --force-ai-optout` で警告付き続行

## 変更点

### 1. `tools/patch-aihints.mjs`

- `CliOptions` typedef に `forceAiOptout` を追加
- `parseArgs()` に `--force-ai-optout` フラグを追加（初期値 `false`）
- `printHelpAndExit()` ヘルプに `--force-ai-optout` を追記
- `main()` の dbPath 読み込み直前に AI_Optout ガードを挿入:
  - `data/Works_<work>/DataBases/db_meta.json` を読み、`Databases['#DB_<db>' or '#Ref_<db>'].AI_Optout === true` なら exit 2
  - `forceAiOptout` 時のみ警告のみで継続
  - db_meta.json 読み込み失敗時は警告して継続

### 2. データ（19 DB エントリに `AI_Optout: true` を付与）

`data/Works_NumberTales/DataBases/db_meta.json` の `#DB_Primary` のみ未付与。以下 19 エントリに追加:

- `data/Works_DestinyFoxRecords/DataBases/db_meta.json` — `#DB_Primary`
- `data/Works_FLInvestigator78/DataBases/db_meta.json` — `#DB_Primary`, `#DB_PrimaryDealer`
- `data/Works_NumberTales/DataBases/db_meta.json` — `#DB_SemiPrimary`, `#DB_SelfSecondary`, `#DB_Secondary`, `#Ref_Glossary`, `#Ref_Reference`
- `data/Works_NumberTales/References/db_meta.json` — `#Ref_Glossary`, `#Ref_Reference`
- `data/Works_PastDivers/DataBases/db_meta.json` — `#DB_Primary`, `#DB_SemiPrimary`
- `data/Works_Proxies/DataBases/db_meta.json` — `#DB_Proxy`
- `data/Works_ShouArRiders/DataBases/db_meta.json` — `#DB_Primary`
- `data/Works_SinisterChangingGirls/DataBases/db_meta.json` — `#DB_Primary`
- `data/Works_UnauthedLogica/DataBases/db_meta.json` — `#DB_PrimaryMobs`, `#DB_Primary`
- `data/Works_UnibyteLive/DataBases/db_meta.json` — `#DB_Primary`, `#DB_PrimaryPerformer`

挿入方式: 既存フォーマット（インデント・単行オブジェクト）を保持する文字列挿入スクリプト（`.cache/add-ai-optout.mjs`）を使用。`JSON.stringify` による全体再シリアライズは行わず、diff は最小化（10 ファイル / 38 insertions / 19 deletions）。

### 3. ドキュメント

- `docs/api-sw-spec.md` に §5.5 `AI_Optout` セクションを追加（粒度比較表、初期適用範囲を含む）
- `docs/ai-hints-usage.md` §7「付与対象の判定」表に `DB に AI_Optout: true が設定` 行を追加
- `.github/copilot-instructions.md` 「最近の実装運用ルール」に `AI_Optout` の運用ルール項を追加
- `CHANGELOG.md` 先頭に新エントリを追加

## 影響範囲

- ツール: `tools/patch-aihints.mjs`
- データ: 上記 10 ファイルの `db_meta.json`
- ドキュメント: `docs/api-sw-spec.md` / `docs/ai-hints-usage.md` / `.github/copilot-instructions.md` / `CHANGELOG.md`
- API/SW 配信挙動: **影響なし**（`AI_Optout` はアクセス制御フラグではない）

## 検証

- `node --check tools/patch-aihints.mjs` — 構文 OK
- ガード動作確認:
  - `node tools/patch-aihints.mjs --work NumberTales --db Secondary --suggest` → `[ABORT] AI_Optout: true ... exit 2` を確認
  - `node tools/patch-aihints.mjs --work NumberTales --db Primary --records "1" --suggest` → 通過（既存 AIHints のため skipped-existing=1 で正常終了）
- 回帰テスト: `tests/data.sanity.test.js` / `tests/sw.enrich.basic.test.js` / `tests/meta.catalog.schema.test.js` / `tests/sw.dbmeta.tolerance.test.js` — **12/12 pass**

## 未完了タスク

- なし（本タスクは完了）

## 参考

- 関連ドキュメント: `docs/api-sw-spec.md` §5.3-§5.5、`docs/ai-hints-usage.md` §7
- 関連フラグ: `DB_Hidden`（DB 単位の API 遮断）、`Works_Hidden`（作品単位の API 遮断）、`isPrivate`（レコード単位の除外）
