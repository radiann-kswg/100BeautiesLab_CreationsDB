# AppearanceDetail — Attrs 型付きスキーマ設計案

- **作成日**: 2026-06-28
- **ステータス**: 設計確定（Phase A 完了）・未実装（Phase B〜E は追加フェーズ）
- **前提**: `refactor-appearance-detail` ブランチ / Phase 1〜2 完了後

---

## 背景・動機

Phase 2 で `AppearanceDetail[].Attrs[]` に `#Element_TailsUnit` エントリを実装した際、
`#DesignAttr_Branch` の値が「上2束×3本+下1束×1本」のような構造化テキスト（文字列）になっている問題が浮上した。

現状の課題:

- `Value_JP`/`Value_EN` が純粋な文字列で、機械的な集計・比較・導出が困難
- `#DesignAttr_Count`（本数）は `#DesignAttr_Branch` があれば総和として導出できるのに、
  現状は冗長入力が必要
- 「位置（上/下）」「束数（クラスター数）」「本数」など、異なる次元の情報が1つの文字列に混在している

---

## 設計方針（確定）

### 方針1: 同一 AttrLabel の複数エントリを許可

`Attrs[]` 内で同じ `AttrLabel` を持つ複数のオブジェクトを認める。
`#DesignAttr_Branch` の場合、位置グループごとに1エントリとして分割する。

```json
// 現状（文字列1件）
{ "AttrLabel": "#DesignAttr_Branch", "Value_JP": "上2束×3本+下1束×1本", ... }

// 提案後（1グループ1エントリ）
{ "AttrLabel": "#DesignAttr_Branch", "vdict_Laterality": "#Lat_Upper", "value_Num_1": 3, "value_Num_2": 2 },
{ "AttrLabel": "#DesignAttr_Branch", "vdict_Laterality": "#Lat_Lower", "value_Num_1": 1, "value_Num_2": 1 }
```

総本数（4本）は `value_Num_1` の総和から導出可能。`#DesignAttr_Count` の入力が不要になる。

### 方針2: 小文字プレフィックスによる規約駆動フィールド

`value_*` / `about_*` / `vdict_*` で始まるフィールドは **規約駆動（convention-driven）** として扱い、
`db_type.json/$DefType` での個別宣言を不要にする。SW/API が命名規則から型を推論する。

これは既存の `_JP`/`_EN`/`_DBLink` サフィックス規則の拡張版にあたる。

---

## フィールド命名規則（確定）

### 小文字プレフィックス規約（新規）

| フィールドパターン | 型 | 意味 |
|---|---|---|
| `value_Num` | `#Int\|#Null` | 主要な数値（単一の場合）|
| `value_Num_{n}` (`n`=1,2,…) | `#Int\|#Null` | n番目の数値（複数必要な場合）|
| `vdict_{DictName}` | `#DictIndex\|#Null` | `$EnumDef_{DictName}` への辞書参照 |
| `value_Color` | `#String\|#Hexcode_Color\|#Null` | 色名またはカラーコード |
| `value_JP` | `#String\|#Null` | 日本語テキスト |
| `value_EN` | `#String_EN\|#Null` | 英語テキスト |
| `value` | `#String\|#Null` | ロケール共通テキスト |
| `about_JP` | `#String\|#Null` | 補足テキスト（日本語）|
| `about_EN` | `#String_EN\|#Null` | 補足テキスト（英語）|

**命名規則の補足**:

- `value_Num` は単一数値のとき使用。2つ以上が必要な場合は `value_Num_1`/`value_Num_2`/… に切り替える（`value_Num` と `value_Num_{n}` は同一オブジェクト内で混在しない）
- `vdict_Laterality` は `$EnumDef_Laterality` を参照、`vdict_ShapeType` は `$EnumDef_ShapeType` を参照（DictName が辞書名に直結）
- `value_*` / `about_*` は typedef 宣言不要。フィールド名の構造から SW が型を解決する

### 後方互換フィールド（段階的廃止予定）

| フィールド | 廃止後の代替 |
|---|---|
| `Value_JP`（大文字 V） | `value_JP` |
| `Value_EN`（大文字 V） | `value_EN` |

Phase C のデータ変換時に一括置換する。移行期間中は SW が両方を読み、`value_JP`/`value_EN` を優先し、なければ `Value_JP`/`Value_EN` にフォールバックする。

---

## `$Def_AppearanceAttr` の新構造

宣言が必要なのは `AttrLabel`（辞書参照型）のみ。残りは規約駆動フィールドのため `$DefType` 宣言不要。

```json
"$Def_AppearanceAttr": {
  "$DefType": [
    {
      "hashTag": "AttrLabel",
      "$type": "#DictIndex|#Null",
      "$dict": "DesignAttrLabel",
      "hashTag_JP": "属性値ラベル",
      "hashTag_EN": "Attribute Label"
    }
  ]
}
```

> `value_*` / `about_*` / `vdict_*` フィールドは規約で定義済みのため `$DefType` に列挙しない。

---

## AttrLabel ごとのフィールド使用マッピング

`$EnumDef_DesignAttrLabel` の各エントリで使用フィールドを定義（`_usedFields` 等のメタとして持つ案。詳細は Phase B で確定）。

| AttrLabel | 使用フィールド |
|---|---|
| `#DesignAttr_Shape` | `vdict_ShapeType`（形状 enum あり）、`value_JP`、`value_EN` |
| `#DesignAttr_Count` | `value_Num`（総本数・総個数）|
| `#DesignAttr_Branch`（1グループ1エントリ） | `value_Num_1`（グループ内本数）、`value_Num_2`（クラスター数）、`vdict_Laterality`（位置）|
| `#DesignAttr_Segment` | `value_Num`（節数）|
| `#DesignAttr_Color` | `value_Color`（色名 or カラーコード）、`value_JP`、`value_EN` |
| `#DesignAttr_Position` | `vdict_Laterality`（方向）、`value_JP`、`value_EN` |
| `#DesignAttr_Notation` | `vdict_NotationType`（表記 enum あり）、`value_JP`、`value_EN` |
| `#DesignAttr_Material` | `value_JP`、`value_EN` |
| `#DesignAttr_Overview` | `value_JP`、`value_EN` |

### Count の導出ルール

- `#DesignAttr_Branch` エントリが1件以上ある場合、総本数 = 全 Branch エントリの `value_Num_1` の総和
- → `#DesignAttr_Count` を省略可能（または `derived: true` フラグで明示）
- `#DesignAttr_Branch` がない場合（単純型）は `#DesignAttr_Count` の `value_Num` を使う

### 複数エントリのルール

- 同一 `AttrLabel` の複数エントリは **連続して配置**（表示グループを保つため）
- UI/SW は同一 AttrLabel の連続エントリをグループとして処理・表示する

---

## `#Hexcode` 型の新設

### 設計

`#Hexcode` を **16進数エンコーディング全般のベース型** として新設し、サフィックスで種別を修飾する。

```
#Hexcode               → 基底型: # + 16進数文字列（長さ・用途は未指定）
#Hexcode_Color         → カラーコード用: #RRGGBB または #RRGGBBAA
#Hexcode_{Future}      → 将来の他用途 hex コード向け拡張
```

これは `#String` → `#String_EN` / `#String_JP` の修飾パターンと同じ設計原則に従う。

### `#Hexcode_Color` の検証規則

```
形式:  # + [0-9A-Fa-f]{6} または # + [0-9A-Fa-f]{8}
例:   #FF0000（赤・RGB）/ #FF000080（半透明赤・RGBA）
```

### `value_Color` の typedef

```
#String|#Hexcode_Color|#Null
```

- `#String` → 色名テキスト（例: "緋色", "scarlet"）
- `#Hexcode_Color` → 16進カラーコード（例: "#8B0000"）
- `#Null` → 未指定

---

## 変換後のデータ例（TailsUnit / キツネ(枝分かれ)型4本）

**現状（Phase 2 実装後）**:
```json
{
  "Formation": null,
  "BodyPart": ["#BodyPart_Tail"],
  "Laterality": null,
  "DesignElement": "#Element_TailsUnit",
  "Attrs": [
    { "AttrLabel": "#DesignAttr_Shape", "Value_JP": "キツネ(枝分かれ)型", "Value_EN": "Fox (branched)" },
    { "AttrLabel": "#DesignAttr_Count", "Value_JP": "4本", "Value_EN": "4 tails" },
    { "AttrLabel": "#DesignAttr_Branch", "Value_JP": "上2束×3本+下1束×1本", "Value_EN": "upper: 2 clusters × 3, lower: 1 cluster × 1" }
  ]
}
```

**提案後（規約駆動・Count 省略可）**:
```json
{
  "Formation": null,
  "BodyPart": ["#BodyPart_Tail"],
  "Laterality": null,
  "DesignElement": "#Element_TailsUnit",
  "Attrs": [
    { "AttrLabel": "#DesignAttr_Shape", "vdict_ShapeType": "#ShapeType_FoxBranched", "value_JP": "キツネ(枝分かれ)型", "value_EN": "Fox (branched)" },
    { "AttrLabel": "#DesignAttr_Branch", "vdict_Laterality": "#Lat_Upper", "value_Num_1": 3, "value_Num_2": 2 },
    { "AttrLabel": "#DesignAttr_Branch", "vdict_Laterality": "#Lat_Lower", "value_Num_1": 1, "value_Num_2": 1 }
  ]
}
```

（`#DesignAttr_Count` は `value_Num_1` 合計 3+1=4 から SW/UI で導出）

---

## 未解決事項（Phase B 着手前に確定が必要）

1. **`value_Num_1` / `value_Num_2` の Branch における意味の確定**  
   現状の文字列形式「上2束×3本」で「3本」が「1クラスターあたり3本」なのか「上グループの合計本数」なのかを
   データ設計上で明確に定義する必要がある。Count 導出の正確性に直結する。

2. ~~**`$EnumDef_Laterality` への `#Lat_Upper`/`#Lat_Lower` 追加**~~  
   **✅ 解決（2026-06-28）**: `$EnumDef_Laterality` を拡張する方針に確定し実装済み。  
   追加値: `#Lat_Upper`（上）/ `#Lat_Lower`（下）/ `#Lat_Front`（前方）/ `#Lat_Rear`（後方）/ `#Lat_Around`（周囲）  
   → `vdict_Laterality` で `#Lat_Upper` / `#Lat_Lower` をそのまま使用可能。

3. **`vdict_ShapeType` 用の形状辞書 `$EnumDef_ShapeType` の設計**  
   キツネ型・猫型・サソリ型 etc. は NT固有のため、NT作品別 `db_meta.json` に配置予定。
   将来的に他作品でも形状 enum を使う場合の共通化方針を決める。

4. **`$EnumDef_DesignAttrLabel` の per-label フィールド定義メタ**  
   各 AttrLabel に対して使用フィールドを定義するメタ（`_usedFields` 等）の具体的な構造と、
   SW がそれをどう参照するかを設計する。

5. **`#Hexcode` の全体 typedef 登録先**  
   `data/db_type.json` のどこに `#Hexcode` / `#Hexcode_Color` を登録するか（`$VarsDef` または新設 `$TypeDef`）。

---

## 影響範囲

| 対象 | 変更内容 |
|---|---|
| `data/db_meta.json` | `$Def_AppearanceAttr` を簡素化（AttrLabel のみ宣言）。`$EnumDef_Laterality` に Upper/Lower 追加候補 |
| `data/db_type.json` | `#Hexcode` / `#Hexcode_Color` 型の新設登録 |
| `data/Works_NumberTales/DataBases/db_meta.json` | `$EnumDef_ShapeType` 新設。`$EnumDef_DesignAttrLabel` に per-label フィールド定義メタを追加 |
| `data/Works_NumberTales/DataBases/db_Primary.json` | TailsUnit Attrs の全エントリを新構造に変換（~97件）。`Value_JP/EN` → `value_JP/EN` |
| `lib/section-renders/appearanceDetail.js` | `vdict_*` / `value_Num_{n}` / `value_Color` 対応。同一 AttrLabel グループ表示 |
| `lib/sw-common.js` または `lib/data-common.js` | 小文字プレフィックス規約の汎用パーサー実装 |
| `pages/characters.js` / SW | Count 導出ロジック（Branch `value_Num_1` 総和）の実装 |
| `tests/` | 新フィールド・規約駆動フィールドに対応したテストの追加・更新 |

---

## 実装フェーズ案

| フェーズ | 内容 | 前提 |
|---|---|---|
| **Phase A** | 設計確定 ✅ | — |
| **Phase B** | スキーマ変更: `$Def_AppearanceAttr` 簡素化。`$EnumDef_ShapeType` / per-label メタ追加。`#Hexcode_Color` 登録 | Phase A |
| **Phase C** | データ変換: NT TailsUnit Attrs を新構造に変換。`Value_JP/EN` → `value_JP/EN` 全置換 | Phase B |
| **Phase D** | SW/UI 対応: `vdict_*` 辞書解決・`value_Num_{n}` 集計・Count 導出・グループ表示 | Phase C |
| **Phase E** | テスト更新: Vitest テスト追加・更新 | Phase D |

---

## 参考リンク

- `_work_in_progress/2026-06-27_progress_design-part-schema.md` — AppearanceDetail 統合スキーマ全体設計
- `data/db_meta.json ($Def_AppearanceAttr)` — 現行の Attrs 型定義
- `data/Works_NumberTales/DataBases/db_meta.json ($EnumDef_DesignAttrLabel)` — NT固有 Attr ラベル定義
- `lib/section-renders/appearanceDetail.js` — 現行 Attrs 描画実装
- `docs/schema-meta-processing.md` — schema/meta 処理フロー
