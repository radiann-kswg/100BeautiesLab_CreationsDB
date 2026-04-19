# 閲覧者向けガイド（Viewer Guide）

このガイドは、100BeautiesLab. Creations DB (Web) を **閲覧・参照** したい方向けのドキュメントです。

- まず見る: `pages/characters.html`（キャラシートUI）
- 仕組みを知る: 擬似 API（Service Worker）と `data/**` の JSON DB
- フィールド定義を見る: `db_type.json($DefType)` と `db_meta.json($VarsDef)`

---

## 0. 用語ミニ辞書（Works / DB / DefType / VarsDef）

このリポジトリは「データ（JSON）＋定義（型/辞書）＋擬似 API（Service Worker）」で構成されています。

- **Works（作品）**: `data/Works_<作品>/` の単位（例: `Works_NumberTales`）
- **DB（データベース種別）**: 作品内の DB ファイル（例: `DataBases/db_Primary.json`）
- **`$DefType`（型定義）**: `db_type.json` にあるフィールドの型・表示ヒント（例: `hashTag_JP`、`$display`）
- **`$VarsDef`（辞書/メタ）**: `db_meta.json` にある enum/list の辞書や補助情報（例: `#List_*`、`$EnumDef_*`）

擬似 API はおおむね次の役割です。

- `/api/v1/*`: 標準 API（既定はエンリッチ無し、`?enrich=1` で有効化）
- `/pages/v1/*`: UI 用 API（既定でエンリッチ有り）
- `/svc/v1/*`: 広告ブロッカー回避用のミラー（既定はエンリッチ無し、`?enrich=1` で有効化）

> 補足（アプリ機能について）
>
> - 本リポジトリのアプリ機能（Service Worker による擬似 API、キャラシート UI 等）の整備には、GitHub Copilot の支援が含まれます。
> - これらのソースコードについて、将来的に第三者が扱いやすい形での提供（公開範囲や方法を含む）を前向きに検討しています。

---

## 1. まずは閲覧する（UI）

- メインUI: `pages/characters.html`
- 使い方の詳細: `pages/README.md`

ポイント:

- 作品（Works）と DB 種別を選ぶと一覧が出ます
- 名前などで検索できます
- カードをクリックすると詳細（キャラシート）を見られます

---

## 2. 直リンク（URLパラメータ）

キャラ詳細は URL パラメータで直接開けます。

- 例: `?work=NumberTales&db=Primary&idx=2&idxKey=Num`

パラメータ:

- `work`: 作品ID（例: `NumberTales`）
- `db`: DB 種別（例: `Primary`）
- `idx`: インデックス値（番号など）
- `idxKey`: インデックスキー（例: `Num`、`Card.Num` など）

> 旧互換として `num` を解釈する場合があります（主に `Num` インデックス想定）。

---

## 3. データベースの構造（`data/**`）

大枠は以下です。

- `data/db_meta.json` : グローバルのメタ情報（作品一覧、辞書、表示・直リンクの補助情報など）
- `data/db_type.json` : グローバルの型定義（`$DefType`）
- `data/Works_<作品>/DataBases/` : 作品ごとの DB（`db_*.json`、作品メタ、作品型定義）
- `data/Works_<作品>/Images/` : 作品ごとの画像

作品ごとに `DataBases` フォルダ内へまとまっています。

---

## 4. フィールド定義の見方（型と辞書）

このリポジトリは **スキーマ駆動** を基本方針としており、表示や整形の多くが定義ファイルに追従します。

### 4.1 `db_type.json`（`$DefType`）

- どんなフィールドがあるか
- どんな型（`$type`）か
- 表示名（`hashTag_JP` / `hashtag_JP`）
- 表示ヒント（`$display.section` / `unit` / `auto:false` など）

### 4.2 `db_meta.json`（`General.$VarsDef`）

- enum/list の辞書（例: `GenderType` や `RaceType` の日本語表示名）
- `db_type.json($VarsDef)` 由来の辞書と API 上で合成される補助情報
- 直リンクの基準（作品インデックス定義）
- 詳細レイアウト補助（作品ごとの `CreationWorks.<work>.$DetailLayout` など）

キャラシートは、これらの定義を使って表示名や表示セクションを決めます。内部補助用の `_DBLink` などは enrich で使われても、そのまま画面へは表示しません。

---

## 5. 擬似 API（Service Worker）を使う

GitHub Pages の静的配信上でバックエンドの代わりに Service Worker を使い、`/pages/v1/*` を優先しつつ `/api/v1/*` / `/svc/v1/*` も含む擬似 API を提供します。

代表例:

- `GET /api/v1/index` : 作品一覧概要
- `GET /api/v1/works` : 作品一覧
- `GET /api/v1/works/{work}/db/{dbName}` : 指定DBのレコード（`?resolve=1` / `?enrich=1`）
- `GET /api/v1/varsdef` : `General.$VarsDef` 俯瞰
- `GET /api/v1/typedef` : `$DefType` 俯瞰

補足:

- `enrich=1` を付けると、参照マージ（`_DBLink` / `_Jump`）、`$alt` フォールバック、画像メタ（`_enrichment.images`）など「UI での表示に便利な付加情報」も含めた出力になります。
- UI は enrich 済みデータをそのまま全表示するのではなく、typedef / meta で定義された公開向け項目に限定してキャラシートを構成します。
- API / SW の内部仕様を追いたい場合は `docs/api-sw-spec.md` を参照してください。

> 注意: 擬似 API はサービス提供を保証するものではありません（SLA/レート保証なし）。短時間の大量アクセスは避け、可能ならキャッシュを利用してください。

---

## 6. 第三者による利用・再配布・AI学習・商用利用

第三者ポリシーは以下にまとめています。

- `docs/third-party-policy.md`

---

## 7. 更新手順を知りたい（貢献・編集者向け）

閲覧者向け範囲を超えますが、データ更新のルールは以下に集約しています。

- `docs/db-update-guidelines.md`
- `CONTRIBUTING.md`
