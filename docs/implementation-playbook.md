# 実装運用プレイブック

このドキュメントは、今後の実装対応で迷いやすい判断基準を、今回までのセッションで確定した内容に沿って整理した運用メモです。

対象:

- GitHub Copilot に実装依頼を出すときの前提整理
- User が API / UI / データ更新を追従修正するときの判断基準
- 「コードを直す前にどの定義や docs を見るべきか」を揃えたいとき

---

## 1. まずどこを正とするか

判断に迷った場合は、次の優先順で確認します。

1. `data/Works_<作品>/DataBases/db_type.json` の作品別定義
2. `data/db_type.json` のグローバル定義
3. `data/Works_<作品>/DataBases/db_meta.json` の作品別メタ
4. `data/db_meta.json` のグローバルメタ
5. UI / SW のコード上の後方互換処理

原則:

- 表示項目、表示順、型解釈、検索補助、画像ヒントは `db_type.json($DefType)` を優先します
- enum/list 辞書は `db_meta.json(General.$VarsDef)` と `db_type.json($VarsDef)` の両方を見ます
- UI の見た目崩れや表示漏れも、まず schema / meta で直せないかを確認します

---

## 2. タスク種別ごとの進め方

### 2.1 UI 表示修正

まず確認するファイル:

- `pages/characters.js`
- `pages/characters.sass`
- `data/db_type.json`
- 作品別 `data/Works_<作品>/DataBases/db_type.json`
- 必要なら `data/db_meta.json` / 作品別 `db_meta.json`

判断基準:

- 画面に出す項目の増減は、可能なら `$DefType` / `$display` / `$DetailLayout` で制御します
- 画面に見せない内部情報（例: `_DBLink`, `_DBLinkResolved`, `_enrichment`）は UI で直接出さない前提を維持します
- スタイル修正だけに見えても、表示データが JS 側で 1 つの文字列に潰れている場合は DOM 生成側の修正が必要です

今回確定した detail 表示ルール:

- `#ListIndex[]` / `#ListLink[]` の object 配列は、詳細テーブルで 1 要素 1 行表示を優先します
- `##String_JP` / `##String_EN` の bilingual 名称系フィールドで、和英のどちらかに改行がある場合は JP/EN 2 列表示を優先します
- `Belonging` / `Area` / `BirthDay` / `AnivDay` のような basic 補助項目は、`$DetailLayout.basicFields` に既に含まれているなら重複表示しません
- object 形式の `#Index` は、既定で「一覧/直リンクは主要要素」「詳細/値表示は全要素」とし、必要なら子要素の `$display.index` で `list/detail/value/link/priority/order` を上書きします

### 2.2 API / SW 修正

まず確認するファイル:

- `api/sw.js`
- `pages/sw.js`
- `svc/sw.js`
- `lib/sw-common.js`
- `lib/data-common.js`
- `docs/api-sw-spec.md`

判断基準:

- ルーティング差より先に、共通化できる処理は `StandardEndpointHandlers` と `EnrichmentProcessor` に寄せます
- 作品別 `db_meta.json` は追加価値レイヤーなので、欠損しても DB 取得 / 検索 / enrich を落とさない方針を維持します
- enum/list 辞書は `db_meta.json` と `db_type.json($VarsDef)` の合成を前提に扱います
- `pages/v1/*` は UI 用なので enrich 前提、`api/v1/*` / `svc/v1/*` は互換優先で opt-in enrich 前提です

今回確定した enrich / merge ルール:

- `_DBLink` の同名フィールド穴埋めは空値時のみ行い、既存値は上書きしません
- `{ hideText: '...' }` は意図的マスクとして尊重します
- 別 DB から画像フィールドは持ち込みません
- 別作品からの `_DBLink` は、対象作品の schema に宣言されたトップレベル項目だけを持ち込みます
- `_Jump` の `_Search` は 1 件一致のみ採用し、曖昧一致はスキップします

### 2.3 データ / schema 更新

まず確認するファイル:

- 対象 `db_*.json`
- 対象 `db_type.json`
- 必要に応じて `db_meta.json`
- `docs/db-update-guidelines.md`

判断基準:

- 新フィールドを追加したら、原則として `$DefType` も追加します
- インデックス表示や直リンクの基準変更は、まず `$IndexDef` で表現できるかを確認します
- object 形式の `$IndexDef` で複数要素を出し分けたい場合は、コード分岐を増やす前に各子要素の `$display.index` で制御できないかを確認します
- 表示名辞書や list/link 補助は、`$VarsDef` で宣言的に足せるならコード変更より先にそちらを選びます

---

## 3. 変更後に更新するドキュメント

変更内容ごとに、最低限更新する場所を揃えます。

### 3.1 UI 表示仕様が変わったとき

- `CHANGELOG.md`
- 必要に応じて `docs/implementation-playbook.md`
- 必要に応じて `.github/copilot-instructions.md`
- 大きめの変更なら `_work_in_progress/YYYY-MM-DD_progress_<topic>.md`

### 3.2 API / SW の仕様が変わったとき

- `CHANGELOG.md`
- `docs/api-sw-spec.md`
- 必要に応じて `docs/db-update-guidelines.md`
- 必要に応じて `.github/copilot-instructions.md`

### 3.3 データ運用ルールが変わったとき

- `docs/db-update-guidelines.md`
- 必要に応じて `docs/implementation-playbook.md`
- `.github/copilot-instructions.md`

---

## 4. 検証の最小セット

### 4.1 UI 修正時

- `tests/pages.characters.syntax.test.js`
- 必要に応じて対象機能に近い SW/enrich テスト
- HTTP サーバー上で `pages/characters.html` の目視確認

### 4.2 API / SW 修正時

- `tests/sw.enrich.basic.test.js`
- `tests/sw.dbmeta.tolerance.test.js`
- `tests/enrich.dblink.jump.merge.test.js`
- 変更内容によっては `tests/sw.deftype.merge.test.js`

### 4.3 docs 修正時

- `tests/docs.links.test.js`

---

## 5. Copilot へ依頼するときの書き方

将来の依頼では、次の情報があると修正方針がぶれにくくなります。

- 対象レイヤー
  - UI / API / SW / data / docs のどれか
- 対象作品と DB
  - 例: `Works_PastDivers`, `Primary`
- 正としたい定義
  - 例: 「作品別 `db_type.json($DefType)` を正にしたい」
- 期待する表示や API 例
  - 例: 「`Belonging` は 1 行 1 要素で表示したい」
- 影響を避けたい点
  - 例: 「`_DBLink` の既存互換は崩したくない」

---

## 6. 関連資料

- `docs/api-sw-spec.md`
- `docs/db-update-guidelines.md`
- `docs/schema-meta-processing.md`
- `docs/viewer-guide.md`
- `.github/copilot-instructions.md`
