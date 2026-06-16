# 進捗レポート: NumberMarkLocation フィールド追加

## 目的

ナンバーテールズのキャラクターが持つ「番号の印字」情報（印字位置・印字色・表記方式）を
形態（Formation）ごとに構造化して管理するため、新規フィールド `NumberMarkLocation` を追加する。

---

## 変更点の要約

### 1. `data/Works_NumberTales/DataBases/db_type.json`

- `$DefType` に `NumberMarkLocation`（型: `$Def_NumberMarkLocation[]|#Null`）を追加
  - 挿入位置: `TailsUnit_EN` の直後
- `$VersDef` に以下の2つの型定義を追加
  - `$Def_NumberMark`: 印字1件の詳細（位置・色・表記方式、JP/EN各フィールド）
  - `$Def_NumberMarkLocation`: Formation（形態名）+ Marks（印字詳細の配列）

#### フィールド構造

```
NumberMarkLocation: $Def_NumberMarkLocation[]|#Null
└── Formation: #DictIndex ($dict: Formation)
└── Marks: $Def_NumberMark[]|#Null
    ├── MarkPosition     / MarkPosition_EN   # 印字位置（JP未記入→ユーザー要補完）
    ├── MarkColor        / MarkColor_EN      # 印字色
    └── MarkNotation     / MarkNotation_EN   # 表記方式（アラビア数字 等）
```

#### 設計意図
- `Marks: null` → その形態に番号印字なし（確定）
- `Marks: [{...}]` → 1か所
- `Marks: [{...}, {...}]` → 複数個所
- フィールド自体が `null` or 未設定 → 未調査

---

### 2. `data/Works_NumberTales/DataBases/db_Primary.json`

- Python スクリプトで `addon-ai-tag` ブランチの `AIHints.common.immutable_traits` と
  `AIHints.forms.humanoid.ai_tags` / `outfit_features` から印字情報を抽出・変換して仮入力
- **更新: 69キャラ**（corefolder のみ、または corefolder+humanoid）
- **スキップ: 36キャラ**（`addon-ai-tag` ブランチ側にデータなし）

#### スキップされたキャラ一覧
```
15, 17, 25, 27, 37, 38, 40, 51, 54, 55, 59, 60, 61,
'67-old', 67, 70, 71, 72, 73, 76, 79, 80, 82, 83, 85,
87, 88, 90, 91, 92, 95, 99, '2-alt', '10-alt', '0', '00'
```

#### 仮入力の注意点
- `MarkPosition`（日本語位置）は **全キャラ `null`** で、ユーザーが手動補完する
- `MarkPosition_EN` は `immutable_traits` の英語原文を転記（精度高め）
- 印字なし確定キャラ（Num 29, 58）は `corefolder: Marks: null`
- 特殊表記キャラ:
  - Num 39: `Arabic numeral (stylized)` / `アラビア数字（スタイライズド）`
  - Num 56: `Arabic numeral with kanji annotation` / `アラビア数字＋漢数字（注記）`
  - Num 57: `Arabic numeral (vertical)` / `アラビア数字（縦書き）`
  - Num 000: `Arabic numeral (underlined)` / `アラビア数字（下線付き）`

---

## 影響範囲

- `db_type.json`（NumberTales DataBases）: スキーマ追加のみ、既存フィールドへの影響なし
- `db_Primary.json`（NumberTales DataBases）: 69キャラに `NumberMarkLocation` を追加
- UI / Service Worker: `NumberMarkLocation` は未 typedef な表示設定がなく、
  自動表示されるかどうかは実装依存。表示調整が必要な場合は別途対応。

---

## 未完了タスク

- [ ] スキップ36キャラへの `NumberMarkLocation` 手動入力（ユーザー作業）
- [ ] 全キャラの `MarkPosition`（日本語）補完（ユーザー作業）
- [ ] humanoid 形態の印字位置詳細入力（ユーザー作業）
- [ ] UI 表示確認・調整（必要に応じて）
