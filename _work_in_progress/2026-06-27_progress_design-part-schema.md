# デザイン部位統合スキーマ仕様案

- **作成日**: 2026-06-27
- **ステータス**: 仮実装中（`refactor-appearance-detail` ブランチ）
- **起案者**: 扇一春（会話中の検討メモ）

---

## 目的

キャラクターごとに分散している外見特徴フィールド（`NumberMarkLocation` / `TailsUnit` / `IdentityMotif` / `AccessoryUnit` / 新規 `designParts`）を、「**部位ラベル + 属性値ラベル + 画像(optional) + 補足テキスト**」の統一フォーマットに統合する。

- あらゆる創作タイトルで運用できる汎用スキーマにする
- フリーテキスト主体の現状を enum ベースに移行し、検索・表示の一貫性を高める
- 細部デザイン拡大資料（腕章・ヘイロー・紋様等）の画像を DB に格納できる場所を作る

---

## 仕様確定事項（2026-06-27 セッション）

### BodyPart / Laterality に関する決定

| 論点 | 決定内容 |
|---|---|
| 非人型形態（corefolder 等）での BodyPart | 「部位的な位置」として運用。形態を問わず同じ enum を使う |
| 複数部位にまたがるケース（例：右肩から二の腕） | `BodyPart` を配列型 `#DictIndex[]|#Null` にして複数指定可とする |
| IdentityMotif の BodyPart | モチーフテキストから対応する BodyPart を解釈し付与する（キーワードマッピングで自動推論、要目視確認） |
| Formation 単位のグルーピング | `appearanceDetailSection` sectionWrapper で Formation ごとに折りたたむ（UI 側での将来実装） |

### 推論ルール（`scripts/migrate-appearance-detail.mjs` に実装済み）

- **`inferBodyParts(jp)`**: モチーフテキストのキーワードマッピング（優先度順）で `BodyPart` の配列を返す。マッチなしは `null`
- **`inferLaterality(jp)`**: 「左/右/両」キーワード検出。「右」→ `#Lat_Right`、「左」→ `#Lat_Left`、「両」複合語 → `#Lat_Both`、未マッチ → `null`
- **NML エントリ**: `BodyPart` は `null`（位置テキストから自動推論困難）、`Laterality` は MarkPosition_JP から推論
- **TailsUnit**: `BodyPart: ["#BodyPart_Tail"]`（固定単要素配列）
- **AccessoryUnit**: `BodyPart: null`（複合部位記述のため）

### 仮実装の実施結果（2026-06-27）

| 実施内容 | 状態 |
|---|---|
| `data/db_meta.json` BodyPart の `$type` を `#DictIndex[]|#Null` に変更 | ✅ 完了 |
| `data/db_meta.json` `$Def_AppearanceAttr` 新規追加 + `$Def_AppearanceDetail` の `AttrLabel/Value_JP/Value_EN` を `Attrs: $Def_AppearanceAttr[]|#Null` に変更 | ✅ 完了 |
| `scripts/migrate-appearance-detail.mjs` を `Attrs` 構造 + BodyPart/Laterality 推論 + IdentityMotif グルーピングに更新 | ✅ 完了 |
| NT db_Primary 再マイグレーション（97/105 件 / 合計1422エントリ / 平均14.7/キャラ） | ✅ 完了 |
| UnibyteLive db_Primary 再マイグレーション（2/3 件） | ✅ 完了 |
| Vitest テスト 131/131 通過 | ✅ 確認済み |
| `lib/section-renders/appearanceDetail.js` 新規実装（`appearanceDetailSection` 登録） | ✅ 完了 |
| `pages/characters.js` に `appearanceDetail.js` の import 追加 | ✅ 完了 |

### 推論後の目視確認が必要な主なケース

- `IdentityMotif` で部位に対応しないモチーフ（服装・表情・体型描写）の `BodyPart: null` は正しい
- `"狐の耳（左耳が垂れている）"` → `BodyPart: ["#BodyPart_Ear"]`, `Laterality: "#Lat_Left"` と推論されるが、耳のペア全体の説明として `Laterality: null` が適切か要確認
- 複数部位マッチ（例：「右肩の番号付きの腕章」 → `["#BodyPart_Shoulder", "#BodyPart_Arm"]`）は意図通り
- NML の `MarkColor` / `MarkNotation` エントリは MarkPosition テキストから Laterality を引き継ぐ（位置が同じ仮定）

---

## 現状フィールドの整理

| フィールド            | 定義場所                                                   | 型                                | 作品スコープ     | 問題点                                   |
| --------------------- | ---------------------------------------------------------- | --------------------------------- | ---------------- | ---------------------------------------- |
| `IdentityMotif`       | `data/db_type.json` + `data/db_meta.json($Def_FormsMotif)` | `Formation` + `Motif_JP/EN[]`     | 全作品           | モチーフ名がフリーテキスト配列、画像なし |
| `TailsUnit_JP/EN`     | NT `db_type.json`                                          | `#String` (1行テキスト)           | NT のみ          | フリーテキスト1行、形態別不可、画像なし  |
| `NumberMarkLocation`  | NT `db_type.json($VersDef/$Def_NumberMarkLocation)`        | `Formation` + `$Def_NumberMark[]` | NT のみ          | NT専用型、他作品に展開できない           |
| `AccessoryUnit_JP/EN` | UnibyteLive `db_type.json`                                 | `#String` (1行テキスト)           | UnibyteLive のみ | フリーテキスト、形態別不可、画像なし     |
| `designParts`（新規） | 未定義                                                     | 未定義                            | 未実装           | 今回の検討起点                           |

---

## 統合型の提案スキーマ

### フィールド名案

`AppearanceDetail` を `IdentityMotif` の後継として全作品共通化する。
（または `DesignPartDetail` — 名称は実装前に確定する）

### 統合型 `$Def_AppearanceDetail`（グローバル `db_meta.json` の `$VersDef` に定義）

「**身体部位**」と「**デザイン要素**」は別概念なので、それぞれ独立フィールドとして持つ。
`Laterality`（左右）は身体部位に付随し、左右が区別できる部位でのみ有意。

```json
"$Def_AppearanceDetail": {
  "$DefType": [
    {
      "hashTag": "Formation",
      "$type": "#DictIndex|#Null",
      "$dict": "Formation",
      "hashTag_JP": "形態名",
      "hashTag_EN": "Formation"
    },
    {
      "hashTag": "BodyPart",
      "$type": "#DictIndex|#Null",
      "$dict": "DesignBodyPart",
      "hashTag_JP": "身体部位",
      "hashTag_EN": "Body Part"
    },
    {
      "hashTag": "Laterality",
      "$type": "#DictIndex|#Null",
      "$dict": "Laterality",
      "hashTag_JP": "左右",
      "hashTag_EN": "Laterality"
    },
    {
      "hashTag": "DesignElement",
      "$type": "#DictIndex|#Null",
      "$dict": "DesignElement",
      "hashTag_JP": "デザイン要素",
      "hashTag_EN": "Design Element"
    },
    {
      "hashTag": "AttrLabel",
      "$type": "#DictIndex|#Null",
      "$dict": "DesignAttrLabel",
      "hashTag_JP": "属性値ラベル",
      "hashTag_EN": "Attribute Label"
    },
    {
      "hashTag": "Value_JP",
      "$type": "#String|#Null",
      "hashTag_JP": "属性値"
    },
    {
      "hashTag": "Value_EN",
      "$type": "#String_EN|#Null",
      "hashTag_EN": "Attribute Value"
    },
    {
      "hashTag": "img_PNGName",
      "$type": "#PNGFileName|#Null",
      "hashTag_JP": "部位詳細画像",
      "hashTag_EN": "Detail Image"
    },
    {
      "hashTag": "Note_JP",
      "$type": "#String|#Null",
      "hashTag_JP": "補足テキスト"
    },
    {
      "hashTag": "Note_EN",
      "$type": "#String_EN|#Null",
      "hashTag_EN": "Note"
    }
  ]
}
```

#### フィールドの使い分け早見表

| 記録したい内容           | `BodyPart`           | `Laterality` | `DesignElement`        |
| ------------------------ | -------------------- | ------------ | ---------------------- |
| 尻尾の形状               | `#BodyPart_Tail`     | —            | —                      |
| 右腕の番号印字（NT）      | `#BodyPart_Arm`      | `#Lat_Right` | `#Element_NumberMark`（NT ローカル）|
| 頬の刻印・模様           | `#BodyPart_Cheek`    | `#Lat_Left`等| `#Element_Emblem` 等   |
| 両肩の紋様               | `#BodyPart_Shoulder` | `#Lat_Both`  | `#Element_Emblem`      |
| キャラ全体のモチーフ     | —                    | —            | `#Element_Motif`       |
| 腕章・衣装小物           | `#BodyPart_Arm` 等   | 左右等       | `#Element_CostumeItem` |
| ヘイロー                 | —                    | —            | `#Element_Halo`        |
| タグ・ラベル             | 対象部位             | —            | `#Element_Tag`         |
| カードデザイン（FL78）    | —                    | —            | `#Element_Card`（FL78 ローカル）   |

### グローバル `data/db_type.json` の `IdentityMotif` エントリ変更案

```json
{
  "hashTag": "AppearanceDetail",
  "$type": "$Def_AppearanceDetail[]",
  "hashTag_JP": "外見デザイン詳細",
  "hashTag_EN": "Appearance Design Details",
  "searchable": false,
  "$display": {
    "section": "profile",
    "sectionWrapper": "appearanceDetailSection"
  }
}
```

---

## enum 設計案

### 身体部位 `$EnumDef_DesignBodyPart`

左右指定が意味を持つ部位（腕・手・耳・足・脚・肩・目・翼など）に使う。

```json
"$EnumDef_DesignBodyPart": {
  "#BodyPart_Head":     { "BodyPart": "Head",     "BodyPart_JP": "頭",     "BodyPart_EN": "Head",     "bilateral": false },
  "#BodyPart_Hair":     { "BodyPart": "Hair",     "BodyPart_JP": "髪",     "BodyPart_EN": "Hair",     "bilateral": false },
  "#BodyPart_Eye":      { "BodyPart": "Eye",      "BodyPart_JP": "目・瞳", "BodyPart_EN": "Eye",      "bilateral": true  },
  "#BodyPart_Ear":      { "BodyPart": "Ear",      "BodyPart_JP": "耳",     "BodyPart_EN": "Ear",      "bilateral": true  },
  "#BodyPart_Cheek":    { "BodyPart": "Cheek",    "BodyPart_JP": "頬",     "BodyPart_EN": "Cheek",    "bilateral": true  },
  "#BodyPart_Neck":     { "BodyPart": "Neck",     "BodyPart_JP": "首",     "BodyPart_EN": "Neck",     "bilateral": false },
  "#BodyPart_Shoulder": { "BodyPart": "Shoulder", "BodyPart_JP": "肩",     "BodyPart_EN": "Shoulder", "bilateral": true  },
  "#BodyPart_Arm":      { "BodyPart": "Arm",      "BodyPart_JP": "腕",     "BodyPart_EN": "Arm",      "bilateral": true  },
  "#BodyPart_Hand":     { "BodyPart": "Hand",     "BodyPart_JP": "手",     "BodyPart_EN": "Hand",     "bilateral": true  },
  "#BodyPart_Chest":    { "BodyPart": "Chest",    "BodyPart_JP": "胸",     "BodyPart_EN": "Chest",    "bilateral": false },
  "#BodyPart_Back":     { "BodyPart": "Back",     "BodyPart_JP": "背中",   "BodyPart_EN": "Back",     "bilateral": false },
  "#BodyPart_Waist":    { "BodyPart": "Waist",    "BodyPart_JP": "腰",     "BodyPart_EN": "Waist",    "bilateral": false },
  "#BodyPart_Leg":      { "BodyPart": "Leg",      "BodyPart_JP": "脚",     "BodyPart_EN": "Leg",      "bilateral": true  },
  "#BodyPart_Foot":     { "BodyPart": "Foot",     "BodyPart_JP": "足",     "BodyPart_EN": "Foot",     "bilateral": true  },
  "#BodyPart_Tail":     { "BodyPart": "Tail",     "BodyPart_JP": "尻尾",   "BodyPart_EN": "Tail",     "bilateral": false },
  "#BodyPart_Wing":     { "BodyPart": "Wing",     "BodyPart_JP": "翼",     "BodyPart_EN": "Wing",     "bilateral": true  }
}
```

> `"bilateral": true` は UI や入力補助のヒント用メタ。`Laterality` を入力する際の妥当性チェックに使える（将来的に）。

### デザイン要素 `$EnumDef_DesignElement`

身体部位とは独立した「デザイン上の要素・アイテム・装飾・モチーフ」。

**✅ 確定（2026-06-28）** — グローバル `data/db_meta.json` 更新済み。

```json
// グローバル data/db_meta.json — 汎用共通 enum のみ
"$EnumDef_DesignElement": {
  "#Element_Motif":       { "DesignElement": "Motif",       "DesignElement_JP": "モチーフ",        "DesignElement_EN": "Motif"         },
  "#Element_Halo":        { "DesignElement": "Halo",        "DesignElement_JP": "ヘイロー",        "DesignElement_EN": "Halo"          },
  "#Element_Emblem":      { "DesignElement": "Emblem",      "DesignElement_JP": "エムブレム/紋様", "DesignElement_EN": "Emblem / Pattern" },
  "#Element_Tag":         { "DesignElement": "Tag",         "DesignElement_JP": "タグ/ラベル",     "DesignElement_EN": "Tag / Label"   },
  "#Element_CostumeItem": { "DesignElement": "CostumeItem", "DesignElement_JP": "衣装アイテム",    "DesignElement_EN": "Costume Item"  }
}
```

> **ローカル移動済み（2026-06-28）**:
> - `#Element_NumberMark` → NT `Works_NumberTales/DataBases/db_meta.json`（`#Element_TailsUnit` と並列）
> - `#Element_Card` → FL78 `Works_FLInvestigator78/DataBases/db_meta.json`（新規追加）
> - `#Element_AccessoryUnit` → UL `Works_UnibyteLive/DataBases/db_meta.json`（Phase 1 から既存）
>
> **廃止（2026-06-28）**:
> - `#Element_Armband`（使用データなし。案A: `#Element_CostumeItem` に統合）
> - `#Element_Accessory`（使用データなし。UL の `#Element_AccessoryUnit` はローカルで維持）

### 左右・方向 `$EnumDef_Laterality`

`BodyPart.bilateral == true` の部位に `#Lat_Left/Right/Both` が有意。上下・前後は方向修飾（尻尾の位置グループ等）で使用。

**✅ 確定（2026-06-28）** — グローバル `data/db_meta.json` 更新済み。

```json
"$EnumDef_Laterality": {
  "#Lat_Left":   { "Laterality": "Left",   "Laterality_JP": "左",       "Laterality_EN": "Left"        },
  "#Lat_Right":  { "Laterality": "Right",  "Laterality_JP": "右",       "Laterality_EN": "Right"       },
  "#Lat_Both":   { "Laterality": "Both",   "Laterality_JP": "左右両方", "Laterality_EN": "Both"        },
  "#Lat_Upper":  { "Laterality": "Upper",  "Laterality_JP": "上",       "Laterality_EN": "Upper"       },
  "#Lat_Lower":  { "Laterality": "Lower",  "Laterality_JP": "下",       "Laterality_EN": "Lower"       },
  "#Lat_Front":  { "Laterality": "Front",  "Laterality_JP": "前方",     "Laterality_EN": "Front"       },
  "#Lat_Rear":   { "Laterality": "Rear",   "Laterality_JP": "後方",     "Laterality_EN": "Rear"        },
  "#Lat_Around": { "Laterality": "Around", "Laterality_JP": "周囲",     "Laterality_EN": "Surrounding" }
}
```

### 属性値ラベル `$EnumDef_DesignAttrLabel`

```json
"$EnumDef_DesignAttrLabel": {
  "#DesignAttr_Shape":    { "AttrLabel": "Shape",    "AttrLabel_JP": "形状",       "AttrLabel_EN": "Shape"    },
  "#DesignAttr_Color":    { "AttrLabel": "Color",    "AttrLabel_JP": "色",         "AttrLabel_EN": "Color"    },
  "#DesignAttr_Position": { "AttrLabel": "Position", "AttrLabel_JP": "位置",       "AttrLabel_EN": "Position" },
  "#DesignAttr_Notation": { "AttrLabel": "Notation", "AttrLabel_JP": "表記方式",   "AttrLabel_EN": "Notation" },
  "#DesignAttr_Count":    { "AttrLabel": "Count",    "AttrLabel_JP": "本数・個数", "AttrLabel_EN": "Count"    },
  "#DesignAttr_Material": { "AttrLabel": "Material", "AttrLabel_JP": "素材感",     "AttrLabel_EN": "Material" },
  "#DesignAttr_Overview": { "AttrLabel": "Overview", "AttrLabel_JP": "概要",       "AttrLabel_EN": "Overview" }
}
```

> ※ enum の確定は実装前に行う。`DesignBodyPart` / `DesignElement` はタイトルをまたぐので追加・変更コストが高い。

---

## 現行フィールドとの移行マッピング

| 旧フィールド・サブフィールド                        | 新 `BodyPart`    | 新 `Laterality`  | 新 `DesignElement`    | 新 `AttrLabel`         | 備考                  |
| --------------------------------------------------- | ---------------- | ---------------- | --------------------- | ---------------------- | --------------------- |
| `TailsUnit_JP/EN`                                   | `#BodyPart_Tail` | —                | —                     | `#DesignAttr_Shape`    | 値そのままコピー      |
| `NumberMarkLocation[*].Marks[*].MarkPosition_JP/EN` | 位置情報から特定 | 位置情報から特定 | `#Element_NumberMark` | `#DesignAttr_Position` | Formation もセット    |
| `NumberMarkLocation[*].Marks[*].MarkColor_JP/EN`    | 同上             | 同上             | `#Element_NumberMark` | `#DesignAttr_Color`    | Formation もセット    |
| `NumberMarkLocation[*].Marks[*].MarkNotation_JP/EN` | —                | —                | `#Element_NumberMark` | `#DesignAttr_Notation` | Formation もセット    |
| `IdentityMotif[*].Motif_JP/EN[*]`（配列展開）       | —                | —                | `#Element_Motif`      | `#DesignAttr_Overview` | 1要素→1エントリに展開 |
| `AccessoryUnit_JP/EN`（UL）                         | —                | —                | `#Element_AccessoryUnit`（UL ローカル）| `#DesignAttr_Overview` | 値そのままコピー  |
| 新規 `designParts`（画像用）                        | 部位によって選択 | 部位によって選択 | 要素によって選択      | 状況により選択         | 詳細画像も格納可      |

### 記入例（ナンバーテールズの場合）

```json
"AppearanceDetail": [
  {
    "Formation": "humanoid",
    "BodyPart": "#BodyPart_Arm",
    "Laterality": "#Lat_Left",
    "DesignElement": "#Element_CostumeItem",
    "AttrLabel": null,
    "Value_JP": null,
    "img_PNGName": "dsgn-parts_img57-humanoid-leftarm-armband.png"
  },
  {
    "Formation": "humanoid",
    "BodyPart": "#BodyPart_Arm",
    "Laterality": "#Lat_Right",
    "DesignElement": "#Element_NumberMark",
    "AttrLabel": "#DesignAttr_Position",
    "Value_JP": "右腕内側",
    "img_PNGName": null
  },
  {
    "Formation": "humanoid",
    "BodyPart": "#BodyPart_Tail",
    "Laterality": null,
    "DesignElement": null,
    "AttrLabel": "#DesignAttr_Shape",
    "Value_JP": "キツネ型1本",
    "img_PNGName": null
  },
  {
    "Formation": null,
    "BodyPart": null,
    "Laterality": null,
    "DesignElement": "#Element_Motif",
    "AttrLabel": "#DesignAttr_Overview",
    "Value_JP": "57の数字",
    "img_PNGName": null
  }
]
```

---

## 画像フォルダ規約

```
Images/DB_Primary/designParts/
  dsgn-parts_img{Num}-{formation}-{partLabel}.png

例 (NT):
  dsgn-parts_img57-humanoid-armband.png
  dsgn-parts_img22-humanoid-halo.png
  dsgn-parts_img40-humanoid-emblem.png
  dsgn-parts_img75-corefolder-numbermark.png

形態なし作品 (FL78 等):
  dsgn-parts_imgFLM1-card.png
```

`$Def_AppearanceDetail.img_PNGName` に格納。`#Null` 許容なので画像なしエントリも可。

---

## 影響範囲（実装時に確認が必要なファイル）

### スキーマ・データ

- `data/db_type.json` — `IdentityMotif` → `AppearanceDetail` 置き換え
- `data/db_meta.json` — `$Def_FormsMotif` 廃止 / `$Def_AppearanceDetail` + enum 追加
- `data/Works_NumberTales/DataBases/db_type.json` — `TailsUnit`, `NumberMarkLocation` 削除（統合先へ移行後）
- `data/Works_UnibyteLive/DataBases/db_type.json` — `AccessoryUnit` 削除（統合先へ移行後）
- `data/Works_NumberTales/DataBases/db_*.json` — 全レコードの移行
- `data/Works_FLInvestigator78/DataBases/db_*.json` — `IdentityMotif` 書き換え
- `data/Works_UnibyteLive/DataBases/db_*.json` — `AccessoryUnit` + `IdentityMotif` 書き換え

### UI・ライブラリ

- `lib/wrapper-common.js` — `formsMotifSection` wrapper → `appearanceDetailSection` に移行
- `lib/section-wrapper-common.js` — 必要に応じて subField renderer を更新
- `pages/characters.js` — `AppearanceDetail` レンダリング対応
- `tests/` — 移行後の型・表示テストを追加

---

## 未解決事項（実装前に確定が必要）

1. **フィールド名の確定**: `AppearanceDetail` vs `DesignPartDetail` vs その他
2. **enum のグローバル vs 作品別**: `DesignBodyPart` / `DesignElement` / `Laterality` はグローバル定義 + 作品別追記か、完全作品別か（現行の `Formation` dict と同じ管理方式で統一する方が自然）
3. **`bilateral` メタの扱い**: `$EnumDef_DesignBodyPart` に `"bilateral": true/false` を持たせる場合、UI や入力支援でどう活用するかの設計が必要
4. **`NumberMarkLocation` の分解粒度**: 現状は `Formation → Marks[]` の2層だが、統合後は `Formation + BodyPart（印字箇所） + Laterality + DesignElement(=NumberMark) + AttrLabel` の1層に平坦化。移行時に MarkPosition テキストから BodyPart/Laterality を推論する必要がある
5. **後方互換の方針**: 旧フィールド（`TailsUnit`, `IdentityMotif`, `NumberMarkLocation` 等）の読み取りをいつまでサポートするか
6. **`IdentityMotif` の `Motif` 配列展開**: 現状1エントリに複数モチーフが配列で入っているが、統合後は1エントリ1モチーフに正規化が必要（データ量に注意）
7. **UI sectionWrapper の設計**: `appearanceDetailSection` で Formation / BodyPart / DesignElement ごとのグループ表示をするか、フラット表示にするか
8. **UnibyteLive の `Formation` dict**: 現状 NT の `Formation`（humanoid/corefolder）しかない。UnibyteLive 向けに `avatar`/`keycapper` 等を追加するか

---

## 未完了タスク（将来実装に向けて）

- [ ] フィールド名・enum 名の確定（User 承認）
- [ ] `$EnumDef_DesignBodyPart` / `$EnumDef_DesignElement` / `$EnumDef_Laterality` / `$EnumDef_DesignAttrLabel` の値一覧確定
- [ ] `data/db_meta.json` の `$VersDef` に `$Def_AppearanceDetail` を追加
- [ ] `data/db_type.json` の `IdentityMotif` → `AppearanceDetail` 移行
- [ ] NT `db_type.json` の `TailsUnit` / `NumberMarkLocation` 整理
- [ ] UnibyteLive `db_type.json` の `AccessoryUnit` 整理
- [ ] `lib/wrapper-common.js` の sectionWrapper 更新
- [ ] 全 DB レコードの移行スクリプト or 手動移行
- [ ] 画像フォルダ作成 + ファイル命名規則の周知
- [ ] テスト追加

---

## 参考リンク

- `docs/schema-meta-processing.md` — schema/meta 処理フロー
- `docs/wrapper-summary-registry.md` — sectionWrapper 一覧
- `_work_in_progress/2026-06-27_progress_design-part-schema.md`（本ファイル）
