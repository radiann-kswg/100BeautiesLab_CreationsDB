# AIHints 運用ガイド (Gemini / ChatGPT / NovelAI 三環境対応)

## 1. 目的

各キャラクターレコードに付与する `AIHints` フィールドは、**画像生成 AI に対してそのキャラクターの視覚的特徴を再現するためのヒント**を提供するためのものです。

GitHub 上に AI タグを置いただけでは、現在の生成 AI（ChatGPT 画像生成 / Gemini / NovelAI 等）は自動的にそれを参照しません。`AIHints` は **生成時にユーザーが手動でプロンプトへ貼り付けて利用すること**を前提に設計されています。

---

## 2. 二層構造 (common + forms)

ナンバーテールズ等の作品では、同一キャラクターが「**コアフォルダ形態 (装備姿)**」と「**ヒューマノイド形態 (人型 通常姿)**」のように複数の姿を持つことがあります。これを正しく区別するため、`AIHints` は **二層構造** を採用します。

```jsonc
"AIHints": {
  "common": {
    // 形態に依存しない素体特徴 (耳の種類・髪色・尻尾本数・表情傾向・年齢感・素体配色)
  },
  "forms": {
    "corefolder": { /* コアフォルダ形態 (装備姿) */ },
    "humanoid":   { /* ヒューマノイド形態 (人型 通常姿) */ }
  }
}
```

- `common` は **形態を問わず不変な素体特徴**を保持します。素体に紐づく `palette_priority` も `common` に置きます。
- `forms.<form>` は **その形態固有の衣装・装備・形態識別タグ・参照画像・即貼付プロンプト**を保持します。
- 画像の存在しない形態 (例: ヒューマノイド姿のイラスト未制作) は、対応する `forms.<form>` を **省略可** とします。`forms.<form>.reference_images` のみを省略しても構いません。

---

## 3. `common` 層のフィールド

| フィールド                     | 型          | 役割                                                                            | 主な対象環境      |
| ------------------------------ | ----------- | ------------------------------------------------------------------------------- | ----------------- |
| `identity_tags`                | `#String[]` | 一発で識別できる**素体**の視覚記号 (3〜5個)。耳の種類・尾の本数・固有モチーフ等 | 全環境            |
| `silhouette_features`          | `#String[]` | シルエットレベルで見える**素体**形状特徴                                        | 全環境            |
| `immutable_traits`             | `#String[]` | 変更してはいけない**素体**不変特徴                                              | 全環境 (識別保持) |
| `expression_tendency`          | `#String[]` | 表情の傾向(既定 / 状況別)                                                       | 全環境            |
| `age_appearance`               | `#String`   | 見た目年齢感                                                                    | 全環境            |
| `palette_priority`             | `object`    | **素体**の主色 / 補助色 / 差し色 (髪・瞳など)                                   | 全環境            |
| `natural_language_description` | `#String`   | **素体**を述べる短文の英語サマリ (1〜2文)                                       | Gemini / ChatGPT  |

---

## 4. `forms.<form>` 層のフィールド

| フィールド                     | 型          | 役割                                                                                               | 主な対象環境        |
| ------------------------------ | ----------- | -------------------------------------------------------------------------------------------------- | ------------------- |
| `form_tags`                    | `#String[]` | 形態識別タグ。**先頭に `"corefolder form"` または `"humanoid form"`** を必ず含める                 | 全環境 (必須)       |
| `outfit_features`              | `#String[]` | この形態固有の衣装・装備特徴 (ハーネス・コート・装甲等)                                            | 全環境              |
| `ai_tags`                      | `#String[]` | 順序付き完全タグ列 (`common` から合成済 + `form_tags` + `outfit_features`)。即貼付前提のフラット列 | 全環境 (NovelAI 強) |
| `negative_visuals`             | `#String[]` | この形態固有の禁止視覚要素 (素体共通のNGに加えて、その形態で特に避けたい要素)                      | NovelAI / SD        |
| `natural_language_description` | `#String`   | この形態を述べる短文の英語サマリ (1〜2文)                                                          | Gemini / ChatGPT    |
| `prompt_export`                | `#String`   | NovelAI / SD 向けの即貼付用カンマ区切り英語タグ列 (この形態用)                                     | NovelAI / SD        |
| `negative_prompt_export`       | `#String`   | カンマ区切りのネガティブタグ列 (この形態用)                                                        | NovelAI / SD        |
| `reference_images`             | `object`    | この形態の参照画像 URL (main / face / silhouette / palette)                                        | Gemini / ChatGPT    |

### 4.1 形態識別タグの規約

- `forms.corefolder.form_tags` の先頭: `"corefolder form"` (必須)
- `forms.humanoid.form_tags` の先頭: `"humanoid form"` (必須)
- 補助タグ例: `"with safety device harness"`, `"casual private outfit"`, `"on-duty outfit"` 等

### 4.2 `ai_tags` の合成順 (前半が強く効くため統一)

```
[form_tags] → [1other/1girl 等の人物分類] → [age] → [hair] → [ears] → [tails] → [eyes/expression] → [outfit_features] → [motif] → [number 'N' marking]
```

例 (NumberTales #15 corefolder):

```
corefolder form, with safety device harness, 1other, young adult, pink hair,
right-side ponytail, fox ears, five branching fox tails, stoic minimal expression,
pale jacket, safety device harness on back, arms crossed stance, number '15' marking
```

### 4.3 用語統制

- Danbooru / NovelAI 互換語を優先する (`fox ears`, `1girl`, `short hair`, `military jacket` 等)
- プロジェクト固有の造語 (例: `branching fox tails`) は `identity_tags` / `silhouette_features` / `outfit_features` 側に隔離し、`prompt_export` 内では `multiple fox tails` のような互換語に置換する
- 色は slash 併記 (`salmon pink / coral red`) を **`prompt_export` では避ける**。`palette_priority` および `ai_tags` では主名のみを使い、別名併記が必要なら別タグに分割する

### 4.4 英語表記の原則

- すべての AI 系タグ・自然文は **英語固定**
- 元データ (JSON 内の日本語設定) およびキャラクターイラストの両方を「正」とする
  1. JSON 内の日本語特徴 (髪色、装飾、配色など) を**忠実に英訳**する
  2. イラストから読み取れる視覚特徴を**適切な英語タグ**で表現する
- 両者に乖離がある場合は、まずイラストを優先しつつ、JSON 設定との整合を保つよう調整する

---

## 5. 環境別の使い方

### 5.1 NovelAI / Stable Diffusion 系

形態を選んだうえで、その形態の `prompt_export` / `negative_prompt_export` を貼り付けます。

```
positive prompt: <forms.<form>.prompt_export をそのまま貼付>
negative prompt: <forms.<form>.negative_prompt_export をそのまま貼付>
```

### 5.2 ChatGPT (DALL-E 系)

```
このキャラクターを描いてください。

[素体特徴]
<common.natural_language_description>

[今回の姿]
<forms.<form>.natural_language_description>

[識別記号 (必須)]
<common.identity_tags>
<forms.<form>.form_tags>

[避けるべき要素]
<forms.<form>.negative_visuals>
```

### 5.3 Gemini

```
以下の画像を参考に、同じキャラクターを別ポーズで描いてください。

参照画像: <forms.<form>.reference_images.main>

[素体特徴]
<common.natural_language_description>

[今回の姿]
<forms.<form>.natural_language_description>

[識別記号]
<common.identity_tags>
<forms.<form>.form_tags>
```

---

## 6. `reference_images` の URL 規約

GitHub Pages の公開ドメインを使用する:

```
https://database.numbertales-radiann.net/data/Works_<作品名>/Images/DB_<DB種別>/<サブフォルダ>/<ファイル名>
```

例 (NumberTales #15 corefolder):

```
https://database.numbertales-radiann.net/data/Works_NumberTales/Images/DB_Primary/corefolder/emstk_corefolder15-1.png
```

例 (NumberTales #17 humanoid):

```
https://database.numbertales-radiann.net/data/Works_NumberTales/Images/DB_Primary/humanoids/2024/art_img17-humanoidHardStudy.png
```

種別:

- `main`: その形態の全身代表画 (推奨)
- `face`: 顔アップ (任意)
- `silhouette`: シルエット / 後ろ姿 (任意)
- `palette`: カラースキーム参照 (任意)

---

## 7. 付与対象の判定

| キャラの状態                                     | AIHints 付与                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 画像 / イラスト**あり**                          | **必須**。`common.identity_tags` を 3〜5個必ず含める。対応する `forms.<form>` を付与する                      |
| 画像 / イラスト**なし** (設定のみ)               | 任意。付与する場合でも `forms.<form>.reference_images` は省略し、`identity_tags` は設定から推測した範囲に限る |
| `"Progress": "notProceeded"`                     | 付与不要                                                                                                      |
| ある形態の画像のみ存在 (例: corefolder 画像のみ) | 存在する形態の `forms.<form>` のみを付与し、もう一方は省略                                                    |

---

## 8. 既存タグからの移行履歴

- **2026-05-30 (二層構造化)**: `AIHints` を `common` + `forms.{corefolder,humanoid}` の二層構造へ再編。旧フラット構造 (`ai_tags`/`prompt_export`/`reference_images` がトップレベル) は廃止。コアフォルダ装着姿と人型通常姿を明確に区別できるように。
- **2026-05-30 (3環境対応リファクタ)**: 旧フィールドの `motif_rendering` / `distinguish_from` は廃止し、`identity_tags` に統合。長文・複合表現は原子化。
- 詳細は `CHANGELOG.md` および `_work_in_progress/2026-05-30_progress_aihints-twolayer.md` を参照。
