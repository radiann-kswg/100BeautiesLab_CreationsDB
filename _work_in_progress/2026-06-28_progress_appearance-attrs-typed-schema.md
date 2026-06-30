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

| フィールドパターン          | 型                               | 意味                               |
| --------------------------- | -------------------------------- | ---------------------------------- |
| `value_Num`                 | `#Int\|#Null`                    | 主要な数値（単一の場合）           |
| `value_Num_{n}` (`n`=1,2,…) | `#Int\|#Null`                    | n番目の数値（複数必要な場合）      |
| `vdict_{DictName}`          | `#DictIndex\|#Null`              | `$EnumDef_{DictName}` への辞書参照 |
| `value_Color`               | `#String\|#Hexcode_Color\|#Null` | 色名またはカラーコード             |
| `value_JP`                  | `#String\|#Null`                 | 日本語テキスト                     |
| `value_EN`                  | `#String_EN\|#Null`              | 英語テキスト                       |
| `value`                     | `#String\|#Null`                 | ロケール共通テキスト               |
| `about_JP`                  | `#String\|#Null`                 | 補足テキスト（日本語）             |
| `about_EN`                  | `#String_EN\|#Null`              | 補足テキスト（英語）               |

**命名規則の補足**:

- `value_Num` は単一数値のとき使用。2つ以上が必要な場合は `value_Num_1`/`value_Num_2`/… に切り替える（`value_Num` と `value_Num_{n}` は同一オブジェクト内で混在しない）
- `vdict_Laterality` は `$EnumDef_Laterality` を参照、`vdict_ShapeType` は `$EnumDef_ShapeType` を参照（DictName が辞書名に直結）
- `value_*` / `about_*` は typedef 宣言不要。フィールド名の構造から SW が型を解決する

### 後方互換フィールド（段階的廃止予定）

| フィールド             | 廃止後の代替 |
| ---------------------- | ------------ |
| `Value_JP`（大文字 V） | `value_JP`   |
| `Value_EN`（大文字 V） | `value_EN`   |

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

| AttrLabel                                  | 使用フィールド                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `#DesignAttr_Shape`                        | `vdict_ShapeType`（形状 enum あり）、`value_JP`、`value_EN`                                |
| `#DesignAttr_Count`                        | `value_Num`（総本数・総個数）                                                              |
| `#DesignAttr_Branch`（1グループ1エントリ） | `value_Num_1`（グループ内本数）、`value_Num_2`（クラスター数）、`vdict_Laterality`（位置） |
| `#DesignAttr_Segment`                      | `value_Num`（節数）                                                                        |
| `#DesignAttr_Color`                        | `value_Color`（色名 or カラーコード）、`value_JP`、`value_EN`                              |
| `#DesignAttr_Position`                     | `vdict_Laterality`（方向）、`value_JP`、`value_EN`                                         |
| `#DesignAttr_Notation`                     | `vdict_NotationType`（表記 enum あり）、`value_JP`、`value_EN`                             |
| `#DesignAttr_Material`                     | `value_JP`、`value_EN`                                                                     |
| `#DesignAttr_Overview`                     | `value_JP`、`value_EN`                                                                     |

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
    {
      "AttrLabel": "#DesignAttr_Shape",
      "Value_JP": "キツネ(枝分かれ)型",
      "Value_EN": "Fox (branched)"
    },
    {
      "AttrLabel": "#DesignAttr_Count",
      "Value_JP": "4本",
      "Value_EN": "4 tails"
    },
    {
      "AttrLabel": "#DesignAttr_Branch",
      "Value_JP": "上2束×3本+下1束×1本",
      "Value_EN": "upper: 2 clusters × 3, lower: 1 cluster × 1"
    }
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
    {
      "AttrLabel": "#DesignAttr_Shape",
      "vdict_ShapeType": "#ShapeType_FoxBranched",
      "value_JP": "キツネ(枝分かれ)型",
      "value_EN": "Fox (branched)"
    },
    {
      "AttrLabel": "#DesignAttr_Branch",
      "vdict_Laterality": "#Lat_Upper",
      "value_Num_1": 3,
      "value_Num_2": 2
    },
    {
      "AttrLabel": "#DesignAttr_Branch",
      "vdict_Laterality": "#Lat_Lower",
      "value_Num_1": 1,
      "value_Num_2": 1
    }
  ]
}
```

（`#DesignAttr_Count` は `value_Num_1` 合計 3+1=4 から SW/UI で導出）

---

## 未解決事項（Phase B 着手前に確定が必要）

1. ~~**`value_Num_1` / `value_Num_2` の Branch における意味の確定**~~
   **✅ 解決（2026-06-28 Phase C）**: 実データの変換時に確定。
   - `value_Num_1` = そのグループの**合計本数**（Count 導出で合算する値）
   - `value_Num_2` = クラスター数（「束」の数）
   - 例: 「上2束×3本」→ `value_Num_1: 3`（上グループの本数合計）、`value_Num_2: 2`（束数）
   - Count 導出: Σ `value_Num_1` = 総本数 ✅
     **フォールバックケース（2件）**: `'2束'`（7件）と `'大1束+小9束'`（1件）は標準パターン外のため `value_JP` テキストで保持。

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

| 対象                                               | 変更内容                                                                                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `data/db_meta.json`                                | `$Def_AppearanceAttr` を簡素化（AttrLabel のみ宣言）。`$EnumDef_Laterality` に Upper/Lower 追加候補 |
| `data/db_type.json`                                | `#Hexcode` / `#Hexcode_Color` 型の新設登録                                                          |
| `data/Works_NumberTales/DataBases/db_meta.json`    | `$EnumDef_ShapeType` 新設。`$EnumDef_DesignAttrLabel` に per-label フィールド定義メタを追加         |
| `data/Works_NumberTales/DataBases/db_Primary.json` | TailsUnit Attrs の全エントリを新構造に変換（~97件）。`Value_JP/EN` → `value_JP/EN`                  |
| `lib/section-renders/appearanceDetail.js`          | `vdict_*` / `value_Num_{n}` / `value_Color` 対応。同一 AttrLabel グループ表示                       |
| `lib/sw-common.js` または `lib/data-common.js`     | 小文字プレフィックス規約の汎用パーサー実装                                                          |
| `pages/characters.js` / SW                         | Count 導出ロジック（Branch `value_Num_1` 総和）の実装                                               |
| `tests/`                                           | 新フィールド・規約駆動フィールドに対応したテストの追加・更新                                        |

---

## 実装フェーズ案

| フェーズ     | 内容                                                                                                       | 前提     |
| ------------ | ---------------------------------------------------------------------------------------------------------- | -------- |
| **Phase A**  | 設計確定 ✅                                                                                                | —        |
| **Phase B**  | スキーマ変更 ✅                                                                                            | Phase A  |
| **Phase C**  | データ変換 ✅                                                                                              | Phase B  |
| **Phase C+** | 耳形状・エレメント整理 ✅                                                                                  | Phase C  |
| **Phase D**  | SW/UI 対応: `vdict_*` 辞書解決・`value_Num_{n}` ペア表示・`value_JP/EN` 冗長スキップ・`#ListIndex` 統一 ✅ | Phase C+ |
| **Phase E**  | テスト更新: Vitest テスト追加・更新                                                                        | Phase D  |

### Phase C 実施内容（2026-06-28）

- **変換対象**: NT `db_Primary.json` の全 `AppearanceDetail[*].Attrs[]`（2077件→2144件）
- **`#DesignAttr_Shape`**: `Value_JP/EN` → `value_JP/value_EN` に改名。`vdict_ShapeType` を追加（7種全てマッピング）
- **`#DesignAttr_Count`**: `"N本"` → `value_Num: N`（整数）に変換
- **`#DesignAttr_Branch`**: `"上N束×M本+下P束×Q本"` → 位置グループごとに1エントリに分割（67件が2エントリへ展開。`vdict_Laterality` / `value_Num_1` / `value_Num_2` を設定）。非標準形式（`'2束'` 7件、`'大1束+小9束'` 1件）は `value_JP` フォールバック
- **`#DesignAttr_Segment`**: `"N節"` → `value_Num: N` に変換
- **その他全ラベル（Overview/Position/Color/Notation/Material）**: `Value_JP` → `value_JP`、`Value_EN` → `value_EN` に一括改名（1977件）

### Phase C+ 実施内容（2026-06-28）: 耳形状・エレメント整理

- **`$EnumDef_EarType` 新設（NT ローカル `db_meta.json`）**: `#EarType_Fox`（狐の耳）/ `#EarType_Cat`（猫の耳）の2種を定義
- **`#DesignAttr_Ear` 追加（NT ローカル `$EnumDef_DesignAttrLabel`）**: `$fields: ["vdict_EarType", "about_JP", "about_EN"]`
- **耳エントリ変換（`db_Primary.json`）**: 全181件の `#BodyPart_Ear` + `#Element_Motif` エントリを変換
  - "狐の耳"/"猫の耳" → `DesignElement: null`、`#DesignAttr_Ear` + `vdict_EarType`
  - 修飾情報（垂れ耳・先の色・帽子で隠れている等）→ `about_JP` に格納
  - "狐の耳(イヤリング付き)" × 4・"狐の耳(左耳にアクセサリー付き)" × 4 → Ear エントリ + 別 `#Element_CostumeItem` エントリに分離（14件の追加エントリを生成）
  - "ダイヤとハート柄の耳マーキング" × 4 → `#Element_Emblem`
  - "ダングルイヤリング" × 2・"猫の耳型のアクセサリー" × 2 → `#Element_CostumeItem`
  - `BodyPart` なしで耳関連値を持つエントリ（"狐の垂れ耳" × 6、"猫の立った耳(フードに隠れている)" × 2）→ Ear 変換 + `BodyPart: ["#BodyPart_Ear"]` を付与
- **`#Element_Motif` → `#Element_CostumeItem` 移行**: キーワードベースで 355 エントリを移行（服装/靴/ソックス/ネクタイ/スカーフ/眼鏡/ゴーグル/ネックレス等）
- **`#Element_Motif` → `#Element_Emblem` 移行**: 11 エントリを移行（頬の横線模様・耳マーキング・クリスタル額マーキング等）
- **`#Element_Motif` → `#Element_Tag` 移行**: 8 エントリを移行（名札・バーコードタグ・注意ラベル等）
- **変換統計**: 耳変換 182件・追加エントリ 14件・CostumeItem 355件・Emblem 11件・Tag 8件・Motif 残存 568件
- **テスト**: `npm.cmd test` → 128 passed（既存 3 失敗は Phase C 前からの pre-existing）

### Phase D 実施内容（2026-06-28）: SW/UI 対応 + #ListIndex 統一

- **`$Def_AppearanceAttr.AttrLabel`**: `#DictIndex|#Null` + `$dict` → `#ListIndex|#Null`（`$dict` 削除）
- **`$Def_AppearanceDetail.BodyPart`**: `#DictIndex[]|#Null` + `$dict` → `#ListIndex[]|#Null`（`$dict` 削除）
- **`$Def_AppearanceDetail.Laterality`**: `#DictIndex|#Null` + `$dict` → `#ListIndex|#Null`（`$dict` 削除）
- **`$Def_AppearanceDetail.DesignElement`**: `#DictIndex|#Null` + `$dict` → `#ListIndex|#Null`（`$dict` 削除）
  - `Formation` のみ `#DictIndex` + `$dict` を維持（形態識別子として`formatValueForDisplay`経路で解決）
  - `characters.js` では `#DictIndex` と `#ListIndex` は同一分岐で処理されるため、表示挙動に変化なし
  - `$dict` は `resolveVarsDefLabelPack` で `#List_*`/`#Dict_*` 系を探すが、`$EnumDef_DesignBodyPart` 等の名称不一致で実質無効だったため削除
- **`lib/section-renders/appearanceDetail.js` `buildAttrRows` 刷新（Phase D 主体）**:
  - `resolveVdict(rawKey, dictName)` 関数を追加: `vdict_{DictName}` → `$EnumDef_{DictName}` でラベル解決
  - 旧: `attr.Value_JP / Value_EN` のみ参照（Phase C 変換後のフィールドを読めず空欄になっていた）
  - 新: `vdict_*`（辞書解決）→ `value_Num_1 × value_Num_2`（Branch ペア）→ `value_Num`（数値）→ `value_JP/EN`（vdict と重複する場合はスキップ）→ `about_JP/EN`（補足、括弧付き）の順で処理
  - 後方互換: `Value_JP`（大文字）も `value_JP`（小文字）と同様に処理
- **テスト**: `npm.cmd test` → 128 passed（既存 3 失敗は pre-existing で変化なし）

### Phase C+ 追加実施（2026-06-28）: Ear/TailShapeType 整備

- **`#Element_Ear` 新設（グローバル `$EnumDef_DesignElement`）**: 耳ユニット専用エレメントを追加（`Ear` / `耳ユニット` / `Ear Unit`）
- **`$EnumDef_ShapeType` → `$EnumDef_TailShapeType` リネーム（NT ローカル `db_meta.json`）**: enum キー（`#TailShapeType_*`）・内部フィールド（`TailShapeType` / `TailShapeType_JP` / `TailShapeType_EN`）を一括変換（7エントリ）
- **`#DesignAttr_Shape.$fields` 更新（グローバル `db_meta.json`）**: `vdict_ShapeType` → `vdict_TailShapeType` に更新
- **`db_Primary.json` 一括更新**:
  - `vdict_ShapeType` → `vdict_TailShapeType` フィールドリネーム（97件）
  - `#ShapeType_*` → `#TailShapeType_*` 値リネーム（97件）
  - Ear エントリの `DesignElement: null` → `"#Element_Ear"` 設定（93件、Formation 統合後）
  - Ear Formation 統合: corefolder + humanoid で同一シグネチャの86エントリを `Formation: null` 1件に統合（87件が null、残りは corefolder 4件・humanoid 2件）
- **テスト**: `npm.cmd test` → 128 passed（既存 3 失敗は変更前から同一 pre-existing）

### Phase B 実施内容（2026-06-28）

- **`$Def_AppearanceAttr` 簡素化**: `$DefType` から `Value_JP`/`Value_EN` を削除。`AttrLabel`（辞書参照）のみ宣言。規約駆動フィールドは `$DefType` に列挙しない。
- **`$EnumDef_DesignAttrLabel` に `$fields` メタ追加（グローバル）**: 全7エントリに `$fields: [...]` を追加。各 AttrLabel で使用する規約駆動フィールドを列挙。
- **`$EnumDef_DesignAttrLabel` に `$fields` / `$multi` メタ追加（NT ローカル）**: `#DesignAttr_Branch` に `$multi: true`（複数エントリ許容）と `$fields: ["vdict_Laterality", "value_Num_1", "value_Num_2"]`。`#DesignAttr_Segment` に `$fields: ["value_Num"]`。
- **`$EnumDef_ShapeType` 新設（NT ローカル）**: TailsUnit で使用する形状7種を定義（Fox / FoxBranched / Cat / CatAccessory / Nekomata / Scorpion / Bud）。
- **`$ScalarDef` 新設（`data/db_type.json`）**: `#Hexcode` ベース型と `#Hexcode_Color` サブタイプを登録。⚠️ `$TypeDef` は廃止済みキーとして既存テストで禁止されているため、`$ScalarDef` を採用。

---

## 参考リンク

- `_work_in_progress/2026-06-27_progress_design-part-schema.md` — AppearanceDetail 統合スキーマ全体設計
- `data/db_meta.json ($Def_AppearanceAttr)` — 現行の Attrs 型定義
- `data/Works_NumberTales/DataBases/db_meta.json ($EnumDef_DesignAttrLabel)` — NT固有 Attr ラベル定義
- `lib/section-renders/appearanceDetail.js` — 現行 Attrs 描画実装
- `docs/schema-meta-processing.md` — schema/meta 処理フロー
