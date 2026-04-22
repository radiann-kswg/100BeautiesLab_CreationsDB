# API / Service Worker 技術仕様メモ

このドキュメントは、`/api/v1/*`・`/pages/v1/*`・`/svc/v1/*` の擬似 API と、その背後にある Service Worker / 共通ライブラリの役割分担を、実装に沿って整理した技術メモです。

対象読者:

- API / SW 周辺のコードを追いたい人
- `db_meta.json` と `db_type.json` の責務差を理解したい人
- `_enrichment` や `_DBLink` の挙動を修正したい人

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

### 3.3 `db_meta.json`

- 補助メタ情報です
- 主な役割:
  - `General.$VarsDef`: enum/list 辞書
  - `$MetaType`: 作品/DB カタログ向けメタ情報の補助 schema 宣言
  - `CreationWorks.<work>.Title` / `Title_EN` / `Works_Summary` / `OldTitles`: 作品一覧・作品概要のカタログ情報
  - `CreationWorks.<work>.$DetailLayout`: 詳細表示レイアウト補助
  - `Databases.#DB_<DbName>.DB_Label` / `DB_Label_EN` / `DB_Summary` / `StoryEra`: DB 一覧・DB概要のカタログ情報
  - `Databases.#DB_<DbName>._Commons`: DB 全体の共通穴埋め
  - `Databases.#DB_<DbName>._Secondaries`: `sec_**` 条件に応じた `_Commons` 分岐
    - 全ての `sec_**` 条件が `null` / 空の定義はデフォルト fallback として扱い、`null` 以外の条件を持つ定義が一致した場合はそちらを優先します

補足:

- 作品別 `db_meta.json` は未整備の作品が存在します
- そのため SW は `db_meta.json` 欠損を 500 エラーにせず、追加価値の処理だけをスキップして継続します

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
  - 各 DB ごとに `key`, `file`, `metaKey`, `DB_Label`, `DB_Label_EN`, `DB_Summary`, `StoryEra`, `SecondarySummary` を返します
- `GET /pages/v1/bootstrap`
  - 各作品項目に `workInfo` を含め、`databases[]` も上記の DB カタログ情報付きで返します

注意:

- `works/{work}/db` は作品別 `db_meta.json` が欠損していても 200 を維持し、概要情報だけ空文字 / `null` になります
- `StoryEra` は構造化データのまま返すため、UI 側では `about_JP` / `about_EN` を優先して整形します
- `DB_Label` / `DB_Label_EN` が未定義の旧メタでも、SW 側で既定表示名を補完して UI の破綻を避けます

### 5.2 カタログ用メタ schema 宣言

グローバル `data/db_type.json` では、作品/DB のカタログ情報を補助的に宣言するために `General.$MetaType` ではなくトップレベルの `$MetaType` を持ちます。

- `$Def_CreationWorkCatalog`
  - `Title`, `Title_EN`, `Works_Summary`, `OldTitles[]`
- `$Def_OldTitleCatalog`
  - `Title`, `Title_EN`, `ArchivedYear`
- `$Def_DatabaseCatalog`
  - `DB_Label`, `DB_Label_EN`, `DB_Summary`, `StoryEra`, `SecondarySummary`
- `$Def_StoryEraCatalog`
  - `about_JP`, `about_EN`

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
- `.github/copilot-instructions.md`: 現在の実装方針と運用制約の詳細
