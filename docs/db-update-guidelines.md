# データベース更新ガイドライン（DB Update Guidelines）

このドキュメントは、`data/**` 配下の JSON データベースを更新する際の「ルール」と「手順」をまとめたものです。

このリポジトリの基本方針は **スキーマ駆動（`db_type.json($DefType)` を正）**です。
データ（`db_*.json`）の追加・修正だけでなく、表示/検索/参照解決の挙動が破綻しないよう、必要に応じて型定義・メタ定義もセットで更新します。

---

## 1. まず決めること（どこを更新するか）

### A. 作品固有（推奨: まずはここ）

- 対象: 1つの作品（例: `Works_NumberTales`）だけに新フィールドを足す/調整する
- 更新先:
  - `data/Works_<作品>/DataBases/db_<種別>.json`
  - `data/Works_<作品>/DataBases/db_type.json`
  - （必要なら）`data/Works_<作品>/DataBases/db_meta.json`

### B. 全作品共通（慎重に）

- 対象: 複数作品に共通で追加したいフィールド（例: 表示制御の共通化）
- 更新先:
  - `data/db_type.json` / `data/db_meta.json`
  - 作品側の `db_type.json` で上書き（override）が必要な場合もあります

---

## 2. 最小の更新手順（フィールド追加の基本）

1. **データを更新**: 対象 `db_*.json` にフィールドを追加
2. **型定義を更新**: 対象 `db_type.json` の `$DefType` に宣言を追加（スキーマ駆動の前提）
3. **必要ならメタを更新**: 表示名辞書（enum/list）や、直リンク/詳細表示レイアウトなど
4. **テスト**: `npm test`
5. （UI/SW 変更を伴う場合）**ローカルで実機確認**: Service Worker が効く環境（HTTPサーバ）で確認

---

## 3. `db_type.json`（型定義）更新ルール

### 3.1 `$DefType` は「正（source of truth）」

- UI の自動表示順序・ラベル・整形は、可能な限り `$DefType` に追従します
- 新フィールドをデータに入れたら、基本的に `$DefType` へも追加します

### 3.2 ラベルキー

- 推奨: `hashTag_JP`
- 後方互換: `hashtag_JP`（綴り揺れ吸収）
- どちらも無い場合は、フィールド名がフォールバック表示になります

### 3.3 `$type` の書き方（目安）

- 文字列系: `#String_JP`, `#String_EN`, `#Summary` など
- 数値系: `#Number`
- 配列: `...[]`
- union（複数許容）: `A|B`（例: `#Number|#Number_withAbout[]`）
- 列挙/辞書参照:
  - enum: `$EnumDef` / `$EnumDef_<Name>`
  - list: `#ListIndex` / `#ListLink`（用途に応じて）

> 注意: `$type` は UI/SW の挙動にも影響します。迷う場合は既存フィールドの近い例を探して合わせてください。

### 3.4 `$display`（表示ヒント）の運用

表示を変えたい場合は、まず `"$display"` を使って宣言的に調整する方針です。

代表例:

- `section`: `basic/profile/spec/images/other`（表示セクション）
- `unit`: `cm/kg/歳` など（単位表示）
- `enumFormat` / `rankFormat` / `rarityFormat`: 表示形式のヒント
- `auto:false`: 自動表示（スキーマ駆動の列挙）から除外したいとき

---

## 4. `db_meta.json`（メタ定義）更新ルール

### 4.1 インデックス表示/直リンク

- 作品ごとのインデックス（一覧チップ/直リンクの基準）は、作品別 typedef（`data/Works_<作品名>/DataBases/db_type.json`）の `$IndexDef` を更新して追従させます
- `data/db_meta.json(CreationWorks.*.$DefType_Index / $Def_Index)` は廃止され、Index 定義の置き場は typedef 側に集約されました

### 4.2 詳細表示レイアウト

- 詳細の基本情報・ヘッダピル・抑制キーは `CreationWorks.<work>.$DetailLayout` で制御します
- UI 側のハードコードを増やす前に、まずメタで調整できないか検討してください

### 4.3 enum/list の「表示名辞書（JP/EN）」

`$VarsDef` に enum/list の辞書を定義し、UI が raw 値（英語コード等）から日本語表示名へ解決できるようにします。

- enum（例: `GenderType`）: `General.$VarsDef.$EnumDef_GenderType`
- list（例: `RaceType`）: `General.$VarsDef.#List_RaceType`

辞書要素の目安（例）:

```json
{
  "value": "PortableHumanoid(TaleBeastType)",
  "RaceType_JP": "妖獣型ポータブルヒューマノイド",
  "RaceType_EN": "Portable Humanoid (Tale Beast Type)"
}
```

- `*_JP` / `*_EN` のキー名は **フィールド名に合わせる**（例: `RaceType_JP`）
- `value` は DB に格納される raw 値（コード値）と一致させます

---

## 5. 2言語（JP/EN）フィールド運用ルール（最小）

- `Foo_JP` と `Foo_EN` のようにサフィックスで言語を区別します
- UI/検索が「同じ意味のフィールド」として扱えるよう、命名を揃えるのが前提です
- 同様に `*_JP` 表示名（辞書）を追加する場合も、ベース名を一致させます

---

## 6. 参照解決（`_DBLink` / `_Jump`）を伴う更新時の注意

- `_DBLink` は参照先レコードの同名フィールドを **空値のときだけ穴埋め**します（既存値は上書きしません）
- `{ hideText: "..." }` は意図的マスクなので上書きしません
- 画像系フィールドは **別DB（別JSON）から穴埋めしません**（同一DB内のみ許可）

詳細ルールは `.github/copilot-instructions.md` の「参照マージ」節を正とします。

---

## 7. 画像を追加/更新する場合

- 作品ごとの `data/Works_<作品>/Images/**` 配下へ配置します
- 画像の抽出/表示は `db_type.json` の `$image` 定義や型定義を参照します
- 画像を増やすだけであれば、必ずしも `db_meta.json` 更新は不要です（ただし型定義の設計次第）

---

## 8. 検証（最低限）

### 8.1 自動テスト

```powershell
npm test
```

- `tests/data.sanity.test.js`: JSON 構文・存在
- `tests/data.shape.test.js`: スキーマ/メタとの整合
- `tests/sw.enrich.basic.test.js`: enrich と基本エンドポイント
- `tests/enrich.dblink.jump.merge.test.js`: 参照マージの回帰

### 8.2 実機確認（UI/SWに影響する変更の場合）

Service Worker が必要なため、HTTP サーバ配下で確認します。

```powershell
python -m http.server 5500
# -> http://127.0.0.1:5500/pages/characters.html
```

確認観点（最小）:

- 対象作品/DB が読み込める
- 追加フィールドが想定のセクションに表示される（または抑制される）
- 検索/参照解決の回帰がない

---

## 9. PR（変更提案）の最小チェックリスト

- データ更新だけで完結するか（UI/SW 変更が必要か）
- `db_*.json` と `db_type.json` の整合が取れている
- enum/list 辞書が必要なら `db_meta.json($VarsDef)` を更新している
- `npm test` が通っている
- 重要な仕様変更の場合は `CHANGELOG.md` を更新している
