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

---

## 追記（2026-06-16）: AIHints 番号タグの NumberMarkLocation 準拠更新

`NumberMarkLocation` が入力済みの 38 キャラ（`AIHints` を持つキャラと重複するもの）について、
`AIHints` 内の番号マーク関連タグを `NumberMarkLocation` の内容に準拠する形式へ更新。

### 更新対象フィールド

| フィールド | 変更内容 |
|---|---|
| `AIHints.common.immutable_traits` | 印字位置・色・スロット数を NML から再生成 |
| `AIHints.common.identity_tags` | corefolder の色情報を付与（例: `"number '3' marking"` → `"dark number '3' marking"`）|
| `AIHints.forms.[formation].ai_tags` | 色情報を付与、付記（"(usual)" 等）は保持 |
| `AIHints.forms.[formation].outfit_features` | 同上 |
| `AIHints.forms.[formation].silhouette_notes.attached_items` | 同上 |
| `AIHints.forms.[formation].natural_language_description` | マーク位置記述を NML の `MarkPosition_EN` で上書き |
| `AIHints.forms.[formation].prompt_export` | ai_tags から再生成 |
| `AIHints.forms.[formation].negative_prompt_export` | negative_visuals から再生成 |

### 構造変更

- `Marks: null` の形態のマークタグ → `ai_tags` から `negative_visuals` へ移動
- `negative_visuals` にあったが NML で `Marks` あり → `ai_tags` に移動（色情報付き）
- `AIHints` に番号タグがなかったが NML で `Marks` あり → `ai_tags` に新規追加

### 更新キャラ数

**38 キャラ**（`AIHints` あり + `NumberMarkLocation` に `Marks` あり のキャラ全件）

---

## 未完了タスク

- [ ] スキップ36キャラへの `NumberMarkLocation` 手動入力（ユーザー作業）
- [ ] 全キャラの `MarkPosition`（日本語）補完（ユーザー作業）
- [ ] humanoid 形態の印字位置詳細入力（ユーザー作業）
- [ ] AIHints のない残りキャラへの AIHints 追加後、番号タグの NML 準拠化（未実施）
- [ ] UI 表示確認・調整（必要に応じて）
