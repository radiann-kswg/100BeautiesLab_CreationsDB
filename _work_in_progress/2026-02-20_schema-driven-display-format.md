# db_type.json による表示書式（Display Format）宣言化 - 設計案（2026-02-20）

## 目的

現状、キャラシート（pages/characters.js）側で「単位付き表示」などの表示ルールを個別実装している。
これを `db_type.json`（typedef）側で宣言できるようにし、

- UI 側: 表示フォーマットをスキーマ駆動で一般化
- SW/API 側: typedef 駆動の正規化・検索・（将来の）表示分類の拡張余地
  を得る。

## 現状整理（前提）

- typedef はすでに `hashTag`, `$type`, `hashTag_JP` などを持ち、拡張プロパティを追加しても JSON としては互換。
- `lib/data-common.js` の `TypeDefUtils.pickDisplaySection()` は **既に** `entry.$display.section` を参照する（＝ `$display` オブジェクト拡張は既存設計に馴染む）。
- UI 側（pages/characters.js）は `$DefType` からラベル・フィールド順序を抽出するが、表示用の「単位」はコード側に埋め込まれている（Height/Weight など）。

## 設計方針

- **後方互換**: `$display` を追加しても、未対応箇所は従来どおりフォールバック。
- **最低限の宣言**から段階導入:
  1. まずは `unit`（cm/kg 等）を宣言し UI の hardcode を削減
  2. 次に `join`（配列の区切り）や `value/about` 表示などを宣言で上書き可能に
  3. 余力があれば SW 側の検索対象文字列生成にも利用（※API 返却値そのものは原則加工しない）
- **typedef（db_type.json）を唯一の宣言元**に寄せる。work 作品側の db_type.json で override もできるようにする。

## スキーマ拡張案（db_type.json）

### 1) `$DefType` entry に `$display` を追加

`$DefType[]` の各エントリに任意で `$display` を追加する。

```json
{
  "hashTag": "Height_cm",
  "$type": "#Number|#Number_withAbout[]",
  "hashTag_JP": "身長_cm",
  "$display": {
    "unit": "cm"
  }
}
```

```json
{
  "hashTag": "Weight_kg",
  "$type": "#Number|#Number_withAbout[]",
  "hashTag_JP": "体重_kg",
  "$display": {
    "unit": "kg"
  }
}
```

#### `$display` の想定キー（最小セット）

- `unit`（任意）: `"cm"`, `"kg"`, `"歳"` など
- `arrayJoin`（任意）: 配列表示の join 文字（デフォルト `", "`）
- `section`（任意）: `"basic" | "profile" | "spec" | "images" | "other"`
  - 既に `TypeDefUtils.pickDisplaySection()` が参照可能。
- `kind`（任意・原則不要）: `"number" | "string" | "date" | "enum" | "list" | "object"`
  - **正は `$type`** とし、`$type` から推定できない/推定が誤りやすい場合の上書き用途。

### 1.5) `$type` を活用して kind を推定する（今回の提案の要点）

`$type` には `#String_JP/#String_EN/#Number/#Summary/#Enum/$EnumDef` などの **型宣言**が含まれており、
`$display.kind` を別途持たせなくても「表示上の扱い（文字列/数値/列挙/配列など）」を推定できる。

この提案では次を原則にする。

- **`$type` を正（source of truth）**とし、`$display` は unit など “表示の追加ヒント” を担う
- `kind` は原則省略し、どうしても `$type` だけでは誤判定しやすい場合に限って上書き

#### `$type` からの推定ルール（最小）

- 数値系: `$type` に `#Number` を含む → number
- 文字列/長文系: `$type` に `#String` / `#Stiring`（綴り揺れ吸収）/ `#Summary` を含む → string
- 列挙/リンク系: `$type` に `#Enum` / `$EnumDef` を含む → enum
- リスト/インデックス系: `$type` に `#ListIndex` / `#ListLink` を含む → list
- 配列: `$type` に `[]` を含む → array（上記 kind と組み合わせて扱う）

※ union（`|`）や複合（`,`）がある場合は「含まれている要素で最も優先度が高いもの」を採用する。
（例: `#Number|#Number_withAbout[]` は number + array とみなす）

### 2) 既存の Object パターン（hideText / {value, about\_\*}）との整合

表示処理の優先順位は以下を標準化する。

1. `{ hideText: string }` がある → hideText を表示（unit 等は付けない）
2. `{ value: X, about_JP/about_EN: Y }` 形式 → `value + unit` を基本に、`about_*` を括弧で追記
3. 配列 → 各要素を同ルールで表示して `arrayJoin` で連結
4. その他の Object → 現状の `formatValueForDisplay()` の leaf 抽出 / JSON短縮フォールバック

※この優先順位は現行 UI の挙動と近く、移行時の破壊が少ない。

## 実装案（コード側）

### A. typedef から display hint を抽出する

- 共通: `lib/data-common.js` に `TypeDefUtils.pickDisplayHint(entry)` を追加
  - `return entry.$display ?? entry._display ?? null` のような軽い抽出で十分
- UI: `pages/characters.js` の `extractTopLevelSchemaFields()` を拡張し、`display: item.$display ?? null` を持たせる
  - もしくは `buildFieldDisplayMap(workTypeDef, globalTypeDef)` を新設し、`{[key]: $display}` を返す

### B. 表示フォーマッタの I/F を「hint 対応」にする

- `formatValueForDisplay(value, labelMap, workMeta, globalDefType, opt?)` のように拡張し、
  - `opt.display`（= `$display`）を受け取れるようにする
- `unit` 表示は `opt.display.unit` がある時に適用。

また、`$type` も受け取れるようにしておくと、`$display.kind` に頼らずに表示挙動を揃えやすい。

- 例: `formatValueForDisplay(value, labelMap, workMeta, globalDefType, opt)`
  - `opt.typeSpec`（= `$type`）を追加し、数値/配列などの判定に利用

#### unit 適用の基本ルール

- hideText の場合: unit を付けない
- `{value}` の場合: value には unit を付ける（about は括弧）
- number/string の場合: `"${value}${unit}"`（unit 前に空白を入れるかは将来のルール）

### C. UI の hardcode を段階的に削る

- 現状: `renderDetail()` 内で `formatWithUnit(raw, 'cm')` のように個別呼び出し。
- 移行: 基本情報の構築時に、typedef の `$display.unit` を参照して自動適用。

例（イメージ）

- `basicFields` を生成する際に `displayMap['Height_cm']?.unit` を見て `formatBasicValue(raw, { display: ... })` へ。

### D. SW/API 側の活用（任意・将来）

- 検索 (`EnrichmentProcessor.searchRecords`) は「一致判定」中心なので unit の有無は本質ではない。
  - ただし **文字列化**や **正規化**の補助として `unit` を参照し「"170cm" を 170 と比較」等を将来実装しやすくなる。

また、SW 側はすでに `typeSpec`（= `$type`）判定ヘルパー（例: `TypeDefUtils.looksNumberType/isArrayType/looksSearchableType`）を持っているため、
`$type` を正として活用する方針は既存コードとも整合する。

- API の返却値自体に `*_Display` を追加する案もあり得るが、
  - データの純度（raw と display の混在）と互換性コストが大きいので、まずは **UI だけ**で消費する前提が安全。

## データ更新（最小）

- グローバル: data/db_type.json
  - `Height_cm`, `Weight_kg` に `$display.unit` を追加
- 作品側で上書きしたい場合:
  - `data/Works_*/DataBases/db_type.json` の同 hashTag エントリにも `$display` を追加（work が優先）

## 互換性とリスク

- `$display` は追加プロパティなので JSON としては互換。
- UI 側の適用順序を誤ると「hideText に unit が付く」「配列 join が崩れる」などの差分が出る。
- `pages/characters.js` と `lib/data-common.js` の typedef 抽出ロジックが二重化しているため、
  - 可能なら将来的に **UI も TypeDefUtils（もしくは同等）**へ寄せるのが望ましい。

## 実装チェックリスト（段階）

1. `db_type.json` に `$display.unit` を追加（Height/Weight）
2. UI に displayMap/hint 抽出を追加
3. `formatValueForDisplay` を hint 対応に拡張
4. hardcode unit 表示を削除（`formatWithUnit` の局所実装を撤去）
5. 目視確認: Height/Weight が
   - number
   - `{hideText}`
   - `{value, about_*}`
   - 配列
     のいずれでも破綻しない
6. （任意）Vitest: `TypeDefUtils` の hint 抽出の単体テストを追加

## 参考

- UI: pages/characters.js
  - `extractTopLevelSchemaFields()`
  - `formatValueForDisplay()`
  - `renderDetail()` の基本情報（Height/Weight）
- 共通: lib/data-common.js
  - `TypeDefUtils.pickDisplaySection()`（既に `$display.section` を参照）
