# API / Service Worker 技術仕様メモ

このドキュメントは、`/api/v1/*`・`/pages/v1/*`・`/svc/v1/*` の擬似 API と、その背後にある Service Worker / 共通ライブラリの役割分担、および Cloudflare Workers 実 API の仕様を、実装に沿って整理した技術メモです。

対象読者:

- API / SW 周辺のコードを追いたい人
- `db_meta.json` と `db_type.json` の責務差を理解したい人
- `_enrichment` や `_DBLink` の挙動を修正したい人
- Cloudflare Workers 実 API (`pkg/cloudflare/`) を参照したい人

---

## 0. API 二層構成（ADR-0001 採択、2026-06-21）

本リポジトリの API は以下の二層で提供される。

| 層 | エンドポイント | 実装 | データソース | 主な用途 |
|----|--------------|------|------------|--------|
| **実 API** | `database.numbertales-radiann.net/api/v1/*` | Cloudflare Workers (`pkg/cloudflare/worker.js`) | R2（JSON ミラー）+ D1（FTS5） | 外部クライアント・curl・モバイルアプリ |
| **疑似 API** | `(同一オリジン)/api/v1/*` `/pages/v1/*` `/svc/v1/*` | Service Worker (`pages/sw.js` 等) | GitHub Pages 静的 JSON | ブラウザ・キャラシート UI |

- 疑似 API（SW）は完全 enrich（`_DBLink`/`_Jump` 解決）付き。実 API（Workers）は現時点で `_Commons` 適用のみ（次フェーズで拡張予定）。
- クライアント（`pkg/nodejs`, `pkg/python`, `pkg/csharp`）はローカル JSON を直接読むため、どちらの API にも依存しない。
- Workers のセットアップ手順: `pkg/cloudflare/README.md` を参照。

### Cloudflare Workers 実 API エンドポイント

| メソッド | パス | データソース | 説明 |
|---------|------|------------|------|
| GET | `/api/v1/meta` | R2 | グローバルメタ (`data/db_meta.json`) |
| GET | `/api/v1/works` | D1 `works` | 作品一覧（`Works_Hidden=true` 除外） |
| GET | `/api/v1/:work/meta` | R2 | 作品別メタ (`data/Works_*/DataBases/db_meta.json`) |
| GET | `/api/v1/:work/dbs` | D1 `dbs` | DB 一覧（`DB_Hidden=true` 除外） |
| GET | `/api/v1/:work/:db/records` | D1 `records` | レコード一覧（`isPrivate=0`・`_Commons` 適用） |
| GET | `/api/v1/:work/:db/records/:idx` | D1 `records` | 1 件取得（`?idxKey=X` でフィールド指定） |
| GET | `/api/v1/:work/:db/search?q=` | D1 FTS5 | DB 内全文検索 |
| GET | `/api/v1/:work/search?q=` | D1 FTS5 | 作品横断全文検索 |
| GET | `/api/v1/:work/:db/aihints` | D1 `aihints` | AIHints 一覧（addon-ai-tag ブランチ） |
| GET | `/api/v1/:work/:db/aihints/:idx` | D1 `aihints` | 1件取得（`?form=<form>` で形態絞り込み） |

### D1 スキーマ概要

- `works`: 作品メタ（`key`, `title`, `title_en`, `summary`, `is_hidden`, `meta_json`）
- `dbs`: DB メタ（`work_key`, `db_key`, `db_label`, `db_label_en`, `db_layer`, `is_hidden`）
- `records`: レコード本体（`work_key`, `db_name`, `idx_key`, `idx_value`, `is_private`, `searchable_text`, `data_json`）
- `records_fts`: FTS5 仮想テーブル（`records` を content として外部コンテンツ。INSERT/DELETE/UPDATE トリガーで自動同期）
- `aihints`: AIHints 専用テーブル（`work_key`, `db_name`, `idx_key`, `idx_value`, `forms`, `common_json`, `forms_json`, `data_json`）— addon-ai-tag ブランチ

スキーマ定義: `pkg/cloudflare/schema/d1-init.sql`（基本テーブル）/ `pkg/cloudflare/schema/d1-aihints.sql`（AIHints テーブル）
マイグレーション: `pkg/cloudflare/scripts/migrate.mjs`（基本データ）/ `pkg/cloudflare/scripts/migrate-aihints.mjs`（AIHints）

詳細: `docs/aihints-spec.md`

### Workers 実 API と SW 疑似 API の URL 書式比較

両 API は `/api/v1/` を共有するが、`:work` と `:db` の配置が異なる。

| 操作 | Workers 実 API | SW 疑似 API |
|------|---------------|-------------|
| 作品一覧 | `/api/v1/works` | `/api/v1/works` |
| DB 一覧 | `/api/v1/:work/dbs` | `/api/v1/works/:work/dbs` |
| レコード一覧 | `/api/v1/:work/:db/records` | `/api/v1/works/:work/db/:db/records` |
| レコード 1 件 | `/api/v1/:work/:db/records/:idx` | `/api/v1/works/:work/db/:db/records/:idx` |
| DB 内検索 | `/api/v1/:work/:db/search?q=` | `/api/v1/works/:work/db/:db/search?q=` |
| 作品横断検索 | `/api/v1/:work/search?q=` | `/api/v1/works/:work/search?q=` |

主な差分:
- SW 疑似 API: `works/` プレフィックスと `db/` インフィックスを持つ
- Workers 実 API: `:work` と `:db` が直接パスに並ぶ（`works/` / `db/` は省略）
- 疎通確認の具体的な URL 例は `docs/deploy-howto.md` §3 を参照。

---

## 1. 全体像

このリポジトリでは GitHub Pages の静的配信上で、3 つの Service Worker スコープが擬似 API を提供します。

- `/api/v1/*`
  - 標準 API
  - 既定では `resolve=true`, `enrich=false`
- `/pages/v1/*`
  - キャラシート UI 用 API
  - 既定で `resolve=true`, `enrich=true`
- `/svc/v1/*`
  - `/api` が広告ブロッカーに妨げられる環境向けのミラー
  - 既定では `resolve=true`, `enrich=false`

実装ファイルの対応:

- `api/sw.js`: `/api/v1/*` の入り口
- `pages/sw.js`: `/pages/v1/*` の入り口。加えて `/svc/v1/*` と `/api/v1/*` のエイリアスも扱う
- `svc/sw.js`: `/svc/v1/*` の入り口
- `lib/sw-common.js`: ルーティング、レスポンス生成、DB 読み込み、標準エンドポイントの共通実装
- `lib/data-common.js`: 参照解決、enrich、typedef 駆動の正規化・検索・画像抽出の共通実装

---

## 2. リクエスト処理の流れ

典型的な `GET /pages/v1/works/{work}/db/{dbName}` は次の順序で処理されます。

1. 各 `sw.js` がリクエストパスを自分の prefix と照合する
2. `StandardEndpointHandlers.handleDbEndpoint()` が対象 DB JSON を読む
3. 作品別 `db_meta.json` が読めれば `_Commons` / `_Secondaries` を適用する
4. `resolve=1` の場合、`ReferenceResolver.resolveAllInAny()` で `#Works` / `#DB` / `#$image` を解決する
5. `enrich=1` の場合、`EnrichmentProcessor.enrichRecords()` で `_DBLink` / `_Jump` / `$alt` / 画像情報 / searchableText / displaySections を付与する
6. JSON レスポンスとして返す

補足:

- `/pages/v1/*` は UI がそのまま使うため、既定で enrich 有効です
- `/api/v1/*` と `/svc/v1/*` は既存互換を優先し、`?enrich=1` を付けたときだけ enrich します
- `resolve=0` を付けると、`#Works` や `#DB` などの参照解決をスキップできます
- `isPrivate: true` を持つレコードは、`db` / `search` / `enrich` 系レスポンスから除外します
- `_DBLink` の参照先探索でも `isPrivate: true` の候補は採用しません
- `Works_Hidden: true` を持つ作品は、作品一覧・配下のDB・検索の全エンドポイントから除外または 404 で遮断されます（後述の §5.4 を参照）
- `DB_Hidden: true` を持つDBは、作品配下のDB一覧・直接アクセス・検索から除外または 404 で遮断されます（後述の §5.3 を参照）

---

## 3. 各定義ファイルの責務

### 3.1 `db_*.json`

- 実データ本体です
- キャラクターごとのフィールド値を持ちます
- `_DBLink` や `_Jump` のような機械処理キーも、ここに含まれることがあります

### 3.2 `db_type.json`

- 基本的に「正」として扱う型定義です
- 主な役割:
  - `$DefType`: フィールド定義、表示ラベル、`$display.section`、`$alt`、検索対象の補助
  - `$IndexDef`: 作品ごとの index 解釈
  - `$VarsDef`: enum/list 辞書の追加定義

UI と enrich/search は、可能な限りこの `db_type.json($DefType)` に追従します。

補足:

- live data 上の `$Def_*` 宣言は `$DefType` に統一します。新規追加・更新では `$TypeDef` を使わず、SW/UI も `$DefType` を前提に扱います。

### 3.3 `db_meta.json`

- 補助メタ情報です
- 主な役割:
  - `General.$VarsDef`: enum/list 辞書
  - `$MetaType`: 作品/DB カタログ向けメタ情報の補助 schema 宣言
  - `CreationWorks.<work>.Title` / `Title_EN` / `Works_Summary` / `OldTitles`: 作品一覧・作品概要のカタログ情報
  - `CreationWorks.<work>.$DetailLayout`: 詳細表示レイアウト補助
  - `Databases.#DB_<DbName>` / `Databases.#Ref_<RefName>` の `DB_Label` / `DB_Label_EN` / `DB_Summary` / `DB_Layer` / `DB_File` / `StoryEra`: DB 一覧・DB概要のカタログ情報
  - `Databases.#DB_<DbName>._Commons`: DB 全体の共通穴埋め
  - `Databases.#DB_<DbName>._Secondaries`: `sec_**` 条件に応じた `_Commons` 分岐
    - 全ての `sec_**` 条件が `null` / 空の定義はデフォルト fallback として扱い、`null` 以外の条件を持つ定義が一致した場合はそちらを優先します
  - `General.$VarsDef.#Dict_Faction[*].BelongingArea`: 陣営辞書に紐づく活動拠点の補助情報。`Belonging.$dict = Faction` のような参照先辞書として使います
  - top-level `Dictionaries`: 辞書 DB カタログ。`data/Dictionaries/` や `data/Works_<work>/Dictionaries/` の `db_meta.json` を runtime で合流したものです

補足:

- 作品別 `db_meta.json` は未整備の作品が存在します
- そのため SW は `db_meta.json` 欠損を 500 エラーにせず、追加価値の処理だけをスキップして継続します
- `Area` / `Belonging` のような共通辞書は `db_meta.json` 本体ではなく `Dictionaries/db_*.json` に分離でき、`DataFetcher.readGlobalMeta()` / `readWorkMeta()` が `General.$VarsDef` へ runtime 合流します
- `Databases.#DB_<DbName>` に `"DB_Hidden": true` を置くと、そのDB全体が API から非公開になります（後述の 5.3 を参照）

---

## 4. 予約語の役割

内部処理では、プレフィックスごとに意味を分けています。

- `_`: 手続き・機械処理キー
  - 例: `_DBLink`, `_Jump`, `_Search`, `_Commons`, `_Secondaries`, `_enrichment`
- `$`: 宣言・定義キー
  - 例: `$DefType`, `$VarsDef`, `$IndexDef`, `$EnumDef_*`, `$display`
- `#`: 特殊フィールド名や辞書キー
  - 例: `#Works`, `#DB`, `#List_*`, `#Index`

通常の公開データフィールドは、原則としてこれらのプレフィックスを避け、先頭大文字の通常キーを使う前提です。

---

## 5. `db_meta.json` 欠損時のポリシー

作品別 `db_meta.json` は追加価値のレイヤーとみなし、欠損しても DB 取得や検索を止めません。

欠損時の挙動:

- `works/{work}` の作品メタ取得は 404 になります
- `works/{work}/db/{dbName}` は継続します
- `search` も継続します
- `_Commons` / `_Secondaries` は適用されません
- `isPrivate: true` のレコードは、meta 欠損有無に関わらず公開 API 応答へ含めません

この方針は、DB ファイル自体は存在するが作品メタが未整備な作品でも、最低限の API 利用を成立させるためです。

関連テスト:

- `tests/sw.dbmeta.tolerance.test.js`

---

## 5.1 作品一覧 / DB一覧エンドポイントのカタログ情報

`StandardEndpointHandlers` の一覧系エンドポイントは、`db_meta.json` の創作タイトル情報を次のように返します。

- `GET /pages/v1/works`
  - 各作品ごとに `key`, `Title`, `Title_EN`, `Works_Summary`, `OldTitles[]` を返します
- `GET /pages/v1/works/{work}`
  - `meta` に加えて `workInfo` を返し、グローバル `CreationWorks.<work>` のカタログ情報を参照できます
- `GET /pages/v1/works/{work}/db`
  - 各 DB ごとに `key`, `file`, `layer`, `metaKey`, `DB_Label`, `DB_Label_EN`, `DB_Summary`, `DB_Layer`, `StoryEra`, `SecondarySummary` を返します
- `GET /pages/v1/bootstrap`
  - 各作品項目に `workInfo` を含め、`databases[]` も上記の DB カタログ情報付きで返します

注意:

- `works/{work}/db` は作品別 `db_meta.json` が欠損していても 200 を維持し、概要情報だけ空文字 / `null` になります
- `StoryEra` は構造化データのまま返すため、UI 側では `about_JP` / `about_EN` を優先して整形します
- `DB_Label` / `DB_Label_EN` が未定義の旧メタでも、SW 側で既定表示名を補完して UI の破綻を避けます
- `DB_Layer` を作品別 `Databases.#DB_<DbName>` または `Databases.#Ref_<RefName>` に置くと、SW は `DataBases/` 固定ではなく指定レイヤー配下を探索します
- `#Ref_` prefix の catalog key は既定で `ref_<Name>.json` を優先探索するため、資料系を `References/ref_Glossary.json` / `References/ref_Reference.json` のようにまとめる場合は `DB_File` 省略でも動作します
- `DB_File` は、`db_<DbName>.json` / `ref_<Name>.json` の既定名からさらに外したい場合だけ使います
- UI / enrich の画像解決は DB key と同じ接頭辞を使い、`Images/DB_<DbName>/...` または `Images/Ref_<RefName>/...` を既定として扱います。作品共通画像のみ `Images/General/` を使います
- References 系 DB の画像 field は、shared `data/References/db_type.json` だけでなく作品別 `References/db_type.json` も UI 側で合流して解釈し、`concept-figure_PNGName` のような field 名からサブフォルダ名を導出して解決します。

### 5.2 カタログ用メタ schema 宣言

グローバル `data/db_type.json` では、作品/DB のカタログ情報を補助的に宣言するために `General.$MetaType` ではなくトップレベルの `$MetaType` を持ちます。

- `$Def_CreationWorkCatalog`
  - `Title`, `Title_EN`, `Works_Summary`, `OldTitles[]`
- `$Def_OldTitleCatalog`
  - `Title`, `Title_EN`, `ArchivedYear`
- `$Def_StoryEra`
  - `EraGen`, `YearInEra`, `byRealYear`, `about_JP`, `about_EN`
- `$Def_DatabaseCatalog`
  - `DB_Label`, `DB_Label_EN`, `DB_Summary`, `DB_Layer`, `DB_File`, `StoryEra`, `SecondarySummary`
- `$Def_StoryEraCatalog`
  - `FromEra[]`, `ToEra[]`, `InEra[]`, `about_JP`, `about_EN`

補足 (`$Def_DatabaseCatalog` の補助フィールドについて):

- `DB_Hidden: true` を持つエントリは `works/{work}/db` の一覧と `works/{work}/db/{dbName}` の直接アクセスの両方で非公開扱いになります。スキーマ上は `$Def_DatabaseCatalog` に宣言されていませんが（非公開フラグは表示メタではなくアクセス制御フラグのため）、`db_meta.json` の `Databases.#DB_<DbName>` に直接置く運用です。

---

## 5.3 `DB_Hidden` によるDB単位の完全非公開

`db_meta.json` の `Databases.#DB_<DbName>` に `"DB_Hidden": true` を設定すると、そのDB全体がAPIから非公開になります。

挙動:

- `GET .../works/{work}/db` — リスト応答に当該DBエントリが含まれません
- `GET .../works/{work}/db/{dbName}` — 404 `"Database not found"` を返します
- `search` の `?db=...` 指定でも同様に 404 になります
- メタ欠損時はチェックをスキップするため、`db_meta.json` が存在しない作品では本フラグは機能しません

`isPrivate: true`（レコード単位の非公開）と異なる点:

| 項目 | `isPrivate: true` | `DB_Hidden: true` |
|------|------------------|-------------------|
| 粒度 | レコード単位 | DB 全体 |
| 適用場所 | `db_*.json` の各レコード | `db_meta.json` の `Databases.#DB_<DbName>` |
| DBリスト (`works/{work}/db`) | DBエントリは残る | DBエントリごと除外 |
| `db/{dbName}` 直接アクセス | 対象レコードだけ除外 | 404 |

---

## 5.4 `Works_Hidden` による作品単位の完全非公開

`data/db_meta.json` の `CreationWorks.#Works_<WorkName>` に `"Works_Hidden": true` を設定すると、その作品全体がAPIから完全に非公開になります。

挙動:

- `GET .../works` — リスト応答に当該作品エントリが含まれません
- `GET .../index` — 同上
- `GET .../bootstrap` — 同上
- `GET .../works/{work}` — 404 `"Work not found"` を返します
- `GET .../works/{work}/db` — 404 `"Work not found"` を返します
- `GET .../works/{work}/db/{dbName}` — 404 `"Work not found"` を返します
- `search?works={work}&...` — 404 `"Work not found"` を返します
- グローバルメタ (`data/db_meta.json`) 欠損時はチェックをスキップするため、`db_meta.json` が存在しない場合は機能しません

`DB_Hidden`・`isPrivate` との粒度比較:

| 項目 | `isPrivate: true` | `DB_Hidden: true` | `Works_Hidden: true` |
|------|------------------|-------------------|---------------------|
| 粒度 | レコード単位 | DB 全体 | 作品全体 |
| 適用場所 | `db_*.json` の各レコード | `db_meta.json` の `Databases.#DB_<DbName>` | `db_meta.json` の `CreationWorks.#Works_<WorkName>` |
| 作品一覧 (`works`) | 作品は残る | 作品は残る | 作品ごと除外 |
| `works/{work}` 直接アクセス | 対象レコードだけ除外 | 作品情報は返る | 404 |
| `works/{work}/db` | DBエントリは残る | 該当DBが除外 | 404 |
| `works/{work}/db/{dbName}` | 対象レコードだけ除外 | 404 | 404 |

## 5.5 `AI_Optout` による AI タグ生成 / AI 学習の抑止

`db_meta.json` の `Databases.#DB_<DbName>` 直下に `"AI_Optout": true` を設定すると、そのDBに対して AI 関連の自動処理を抑止するフラグとして扱われます。`DB_Hidden` / `Works_Hidden` がアクセス制御フラグであるのに対し、`AI_Optout` は AI 利用に関する opt-out 表明であり、API 配信そのものは遮断しません。

挙動と用途:

- `tools/patch-aihints.mjs` の全モード（`--suggest` / `--apply` / `--fix-refs` / `--fill-todos` / `--gen-vision-tasks` / `--apply-vision-results`）は、対象 DB に `AI_Optout: true` が設定されている場合、書き込み・解析を行わず exit code `2` で終了します。
- 緊急時のバイパスとして `--force-ai-optout` を併用した場合のみ、警告を表示したうえで処理を続行します。
- 同時に AI 学習・LLM 取り込みへの opt-out 表明として外部利用者・スクレイパー向けのシグナルを兼ねます（規約面の解釈は `guideline.md` / `docs/third-party-policy.md` に委ねます）。
- 作品別 `db_meta.json` が欠損している場合はチェックをスキップします（既存の欠損耐性方針に合わせます）。
- スキーマ (`$Def_DatabaseCatalog`) には宣言しません。`DB_Hidden` / `Works_Hidden` と同様、表示メタではなくガード用フラグであるためです。

他フラグとの粒度比較:

| 項目 | `isPrivate: true` | `DB_Hidden: true` | `Works_Hidden: true` | `AI_Optout: true` |
|------|------------------|-------------------|---------------------|------------------|
| 粒度 | レコード単位 | DB 全体 | 作品全体 | DB 全体 |
| 適用場所 | `db_*.json` の各レコード | `db_meta.json` の `Databases.#DB_<DbName>` | グローバル `db_meta.json` の `CreationWorks.#Works_<WorkName>` | 作品別 `db_meta.json` の `Databases.#DB_<DbName>` |
| API 配信への影響 | 対象レコードを除外 | 該当DBを 404 | 作品ごと 404 | 影響なし（配信は継続） |
| AI 補助ツール（`tools/patch-aihints.mjs`）への影響 | なし | （配信遮断のため事実上不可） | （同左） | 全モードで exit 2（`--force-ai-optout` でのみバイパス） |
| AI 学習 opt-out 表明 | なし | なし | なし | あり |

2026-06-02 時点の初期適用範囲:

- `Works_NumberTales/DataBases/db_meta.json` の `#DB_Primary` のみ未付与（既存の自由運用 DB として例外扱い）。
- それ以外の作品別 `db_meta.json` の全 DB / Ref エントリには `AI_Optout: true` を付与済み（19 エントリ）。

---

補足:

- 2026-05-11 時点では `StoryEra` と `Day` の summary 組み立てに向けて `$display.role` を導入し始めており、UI は `preferredLabel` / `representativePoint` / `rangeStart` / `rangeEnd` や `month` / `dayOfMonth` / `annotation` を参照できる状態になっています。
- 追加で `lib/wrapper-common.js` に shared value wrapper registry を導入し、`$display.wrapper` を持つ typedef は UI / SW 共通の formatter へ委譲できるようにした。2026-05-11 時点では `Day`, `Era`, `StoryEra` が wrapper 解決対象である。
- wrapper handler の基本シグネチャは `format(value, context)` で、`context` には `schemaType`, `defName`, `typeSources`, `helpers` が含まれる。
- works/{work}/db 系の DB カタログ応答は、構造化 `StoryEra` を raw のまま返すだけでなく `StoryEraSummary` も返せるようにし、SW 側でも shared wrapper を使って summary を生成するようにした。
- `EnrichmentProcessor.enrichRecords()` は `$display.wrapper` を持つ top-level field の summary を `_enrichment.wrapperSummaries` へ格納する。これにより UI は raw 構造と summary の両方を必要に応じて再利用できる。
- `StoryEraSummary` 自体も `lib/sw-common.js` の個別分岐ではなく、`$MetaType.$Def_DatabaseCatalog` に宣言された field のうち wrapper 解決できる項目から自動生成する。現状では `StoryEra` がその対象で、応答キーは `StoryEraSummary` になる。

これは現状の UI/SW が使うカタログ情報の宣言面を明示するための補助ブロックで、既存のキャラクター本体 schema (`$DefType`) を置き換えるものではありません。

---

## 6. `varsdef` / `typedef` / `deftype` の違い

名前が似ていますが、返すものは少しずつ違います。

- `varsdef`
  - 主に `General.$VarsDef` の俯瞰です
  - enum/list の辞書を確認したいときに使います
- `typedef`
  - `db_type.json` 全体、またはその作品版を返します
  - `$DefType` を含む型定義そのものを見たいときに使います
- `deftype`
  - API 利用側が使いやすい「表示辞書寄り」の結果です
  - `db_meta.json` に加えて `db_type.json($VarsDef)` 側の辞書も `General.$VarsDef` へ合成して返します

特に enum/list 辞書は `db_meta.json` だけでなく `db_type.json($VarsDef)` にも分散し得るため、API/UI ともに両者の合成を前提にしています。

---

## 7. `_enrichment` の出力仕様

`enrich=1` または `/pages/v1/*` の既定挙動では、各レコードへ `_enrichment` が付与されます。

主なキー:

- `_enrichment.images`
  - 画像候補一覧
- `_enrichment.primaryImage`
  - 代表画像
- `_enrichment.imageCount`
  - 画像件数
- `_enrichment.searchableText`
  - typedef 駆動で抽出した検索用の連結文字列
- `_enrichment.displaySections`
  - `basic/profile/spec/images/other` へ分類したトップレベルキー一覧
- `_enrichment.altFallbacks`
  - `$alt` によりどの代替キーから穴埋めしたかの provenance
- `_enrichment.schemaDriven`
  - typedef 駆動で処理したことを示すフラグ
- `_enrichment.normalized`
  - 型定義に基づく軽い正規化を通したことを示すフラグ

注意:

- `_enrichment` は UI 制御用の補助メタです
- 公開表示では、そのまま全文を見せる前提ではありません
- UI 側は typedef / meta を使って、必要なキーだけを表示します

---

## 8. `_DBLink` / `_Jump` / `$alt` の順序

`EnrichmentProcessor.enrichRecords()` では、概ね次の順でレコードを整えます。

1. typedef に基づく軽い正規化
2. `_DBLink` の参照先を解決
3. `_Jump` ラッパーを参照先の実値へ置換
4. 同名フィールドを空値のときだけ穴埋めマージ
5. `$alt` による代替キーからの穴埋め
6. `#ListLink_*` を varsdef から補助補完
7. 画像メタ、検索テキスト、displaySections を付加

重要ルール:

- `_DBLink` の穴埋めは空値にだけ適用し、既存値は上書きしません
- `{ hideText: '...' }` は意図的マスクなので上書きしません
- 別 DB から画像フィールドは埋めません
- 別作品からの `_DBLink` では、対象作品の schema に宣言されたトップレベル項目だけを取り込みます
- `_Jump` の `_Search` は 1 件一致だけ採用し、曖昧一致はスキップします

---

## 9. 実装上の分担

### 9.1 `lib/sw-common.js`

- `SWConfig`
  - scope から `REPO_BASE` と `API_PREFIX` を計算します
- `DataFetcher`
  - `data/**` の JSON 読み込み、ファイル存在確認、DB 一覧取得を担当します
  - `readGlobalMeta()` / `readWorkMeta()` は `Dictionaries/` も読み、辞書 DB を `General.$VarsDef` と top-level `Dictionaries` へ合流します
- `ApiEndpointHandlers`
  - `meta`, `typedef`, `deftype` など定義系エンドポイントを担当します
- `StandardEndpointHandlers`
  - `index`, `works`, `bootstrap`, `db`, `search`, `varsdef` などの標準処理を担当します
- `ServiceWorkerBase`
  - install / activate / fetch の共通ライフサイクルと、画像パスのフォールバックを持ちます

### 9.2 `lib/data-common.js`

- `ReferenceResolver`
  - `#Works`, `#DB`, `#$image` などの参照を解決します
- `EnrichmentProcessor`
  - schema 駆動の正規化、`_DBLink`, `_Jump`, `$alt`, 検索補助、画像補助をまとめて処理します
- `TypeDefUtils`
  - `$DefType` の抽出、マージ、型解釈、index 解釈を支えます

---

## 10. 先に読むと追いやすいファイル

コードを読む順番の目安です。

1. `api/sw.js` / `pages/sw.js` / `svc/sw.js`
2. `lib/sw-common.js` の `StandardEndpointHandlers`
3. `lib/data-common.js` の `EnrichmentProcessor`
4. `tests/sw.dbmeta.tolerance.test.js`
5. `tests/sw.enrich.basic.test.js`
6. `tests/enrich.dblink.jump.merge.test.js`

---

## 11. 関連ドキュメント

- `docs/viewer-guide.md`: 閲覧者向けの入口説明
- `docs/db-update-guidelines.md`: DB 更新時の運用ルール
- `docs/schema-meta-processing.md`: `db_type.json` / `db_meta.json` の宣言面と内部処理の詳細
- `.github/copilot-instructions.md`: 現在の実装方針と運用制約の詳細
