---
mode: agent
description: NumberTales db_Primary の AIHints TODO フィールドを既存キャラデータから半自動入力するエージェントセッション
tools:
  - read_file
  - grep_search
  - replace_string_in_file
  - run_in_terminal
---

# AIHints 半自動入力 — Agent セッション

## 目的と制約

**目的**: `data/Works_NumberTales/DataBases/db_Primary.json` の指定レコードにある `AIHints` の
`TODO:` / `[TRANSLATE → ...]` プレースホルダを、**既存キャラクターデータから導出・翻訳**して補完する。

**重要制約（copilot-instructions.md §会話パターン情報追加時の運用制約 準拠）**:

- 新しい創作情報（外見設定・台詞・性格など）を **生成・発明しない**。
- すべての値は対象レコードの **既存フィールドの変換・翻訳** に限定する。
- `palette_priority` は画像参照が必要なため **常に TODO のまま** 残す。
- 不確かな項目は TODO のまま残し、ユーザーに確認を促す。
- 1 セッションにつき最大 5 レコードを推奨（品質確保のため）。

---

## 使い方

ユーザーが対象の Num を指定したら（例: 「#41 を入力してください」）、以下の手順で実行してください。

### Step 0: scaffold が未挿入なら先に適用

AIHints キー自体がまだない場合は以下をターミナルで実行してください（`--suggest` で半自動 scaffold を挿入）:

```powershell
node tools/patch-aihints.mjs --records <Num> --suggest --apply
```

### Step 1: レコードを読み込む

`grep_search` で対象 Num のレコード付近を特定し、`read_file` で以下のフィールドを取得してください:

- `Name`, `GenderType`, `ConceptAge`, `TailsUnit`, `Character`
- `Summary`, `InStory`, `NumerospecAbout`, `Class`
- `AIHints`（現在の TODO 状況確認）

### Step 2: 変換・提案

以下の **フィールド対応ルール** に従って各 TODO / `[TRANSLATE...]` プレースホルダの置換候補を提示してください。

#### `common` フィールドの変換ルール

| フィールド                     | 導出元                             | 変換方針                                                                                                               |
| ------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `identity_tags`                | `Num`, `TailsUnit`, `Class[]`      | Num を番号識別子に。TailsUnit[0] の `TailShapeType` を `$EnumDef_TailShapeType` で英語化。Class は固有名詞のまま残す。Summary に特徴的な外見描写があれば追加。 |
| `silhouette_features`          | `TailsUnit` + `Summary` の視覚描写 | 耳・尾を英語化。髪色・目色は Summary に記述があれば抽出。なければ TODO 維持。                                          |
| `immutable_traits`             | `TailsUnit`                        | 動物耳の種類・尾の本数を `(immutable)` 付きで英語化。                                                                  |
| `expression_tendency`          | `Character`                        | 性格テキストのキーワードを表情タグに変換（→ 変換早見表を参照）。                                                       |
| `natural_language_description` | `Summary` 先頭文                   | 1〜2 文の英語にまとめる。外見/印象の説明として（設定の羅列にしない）。                                                 |
| `palette_priority`             | （画像参照が必要）                 | **変更しない。TODO のまま維持。**                                                                                      |

#### `forms` フィールドの変換ルール

| フィールド                     | 導出元                             | 変換方針                                          |
| ------------------------------ | ---------------------------------- | ------------------------------------------------- |
| `outfit_features`              | `InStory` / `Summary` の服装記述   | 服装・装備を英語化。記述不足なら TODO 維持。      |
| `ai_tags` の `TODO:` 項目      | `common` の確定値 + 形態特有の服装 | 確定した身体的特徴・服装タグで TODO を置換。      |
| `natural_language_description` | `InStory` の形態別記述             | 形態ごとの 1 文英語説明。記述なければ TODO 維持。 |
| `prompt_export`                | `ai_tags` 完成後                   | TODO を除いたタグをカンマ結合して再生成。         |
| `negative_prompt_export`       | `negative_visuals`                 | タグをカンマ結合して再生成。                      |

---

### TailsUnit の読み方（構造化型 `$Def_TailsUnit[]`）

`TailsUnit` は自由記述ではなく構造化配列。**先頭エントリ `TailsUnit[0]`（主形状）のみ**を対象にする。

| フィールド                | 内容                                                        | 英語化の方法                                                                 |
| -------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `TailShapeType`             | 形状の enum キー（例: `#TailShapeType_FoxBranched`）        | `data/db_meta.json` / 作品別 `db_meta.json` の `$EnumDef_TailShapeType` から `TailShapeType_EN` を引く（例: "Fox (branched)"）。 |
| `Count`                     | 総本数（数値）                                               | そのまま `"N tails"` / `Count===1` なら `"single tail"`。                     |
| `Segment`                   | 節・分割数（数値、任意）                                     | 補足情報。identity_tags 等では通常省略可。                                    |
| `Branches[]`                | `{Laterality, TailCount, ClusterCount}` の配列（任意）       | 各 `Laterality` を `$EnumDef_Laterality` の `Laterality_EN` で解決し、`"<Laterality>: <TailCount> tails x<ClusterCount> clusters"` の形で列挙。 |
| `LayoutDirection`           | `{LayoutFrom, LayoutTo}`（`Laterality` と同じ enum、任意）   | 同様に解決し `"from <From> to <To>"`。                                        |
| `Note_JP` / `Note_EN`       | 補足自由記述（任意）                                          | 既に対訳が入っている場合はそのまま参照可。                                    |

`$EnumDef_TailShapeType` / `$EnumDef_Laterality` は `tools/patch-aihints.mjs` の `loadMergedVarsDef(work)` / `resolveEnumLabelEN(varsDef, rawValue, enumDefKey, fieldBase)`（グローバル + 作品ローカル `db_meta.json` の `General.$VarsDef` をマージ）で解決する。同じロジックの export 済み関数 `parseTailsUnit(tailsUnit, varsDef)` / `buildTailDescription(tu)` / `buildTailBundleDescription(tu)` があるので、Agent セッションでも新規に変換ロジックを書かずこれらを再利用してよい。

**例**（`Num: 148` 相当）: `TailsUnit[0] = {TailShapeType:'#TailShapeType_FoxBranched', Count:8, Branches:[{Laterality:'#Lat_Upper',TailCount:1,ClusterCount:3},{Laterality:null,TailCount:3,ClusterCount:2},{Laterality:'#Lat_Lower',TailCount:4,ClusterCount:1}], LayoutDirection:{LayoutFrom:'#Lat_Upper',LayoutTo:'#Lat_Lower'}}`
→ `identity_tags`/`silhouette_features` 向け短句: `buildTailDescription` → `"branching fox 8 tails"`
→ `silhouette_features` の内訳文: `buildTailBundleDescription` → `"exactly 8 tails total: from Upper to Lower — Upper: 1 tails x3 clusters, 3 tails x2 clusters, Lower: 4 tails x1 clusters, no more no less"`

### Character → expression_tendency 変換早見表（代表例）

| 日本語キーワード | 英語タグ                       |
| ---------------- | ------------------------------ |
| 楽観（的）       | optimistic cheerful expression |
| 挑戦（的）       | daring confident expression    |
| 頑固             | stubborn determined expression |
| クール           | cool detached expression       |
| 元気             | energetic cheerful expression  |
| 真面目           | serious earnest expression     |
| 優しい           | warm gentle expression         |
| 天然             | carefree airheaded expression  |
| おとなし（い）   | gentle quiet expression        |
| 自信             | confident expression           |
| 勢い             | spirited energetic expression  |
| 不器用           | earnest awkward expression     |

---

### Step 3: ユーザー確認

変更案を以下の形式で提示し、確認を求めてください:

```
### #N 変更案

**common.identity_tags**:
  変更前: "TODO: add 2-3 distinctive visual identity tags"
  変更後: ["fox-type android unit", "class: デュアルファイブズ", "challenger type"]
  根拠: TailsUnit から fox / Class[] から クラス名 / Summary「チャレンジャー」から

**common.expression_tendency**:
  変更前: ["TODO: expression based on Character field"]
  変更後: ["daring confident expression", "optimistic cheerful expression"]
  根拠: Character フィールドの「挑戦的」「楽観的」から

...（以下同様）

この変更を適用しますか？
```

### Step 4: 承認後に書き込み

ユーザーが承認したら `replace_string_in_file` を使って書き込んでください。
JSON 全体の整合性（カンマ・括弧・インデント）を必ず確認してから書き込むこと。

> **注意**: `[TRANSLATE → 1 English sentence]: ...` や `[TRANSLATE COREFOLDER SECTION → 1 sentence]: ...`
> 形式のプレースホルダは日本語原文を英訳して完全な文字列に置換し、元のヒスト形式は削除してください。

### Step 5: 検証

書き込み後にサニティテストを実行して JSON 整合性を確認してください:

```powershell
node .\node_modules\.bin\vitest.cmd run tests/data.sanity.test.js
```

---

## 補足: --suggest scaffold の翻訳ヒント形式について

`--suggest --apply` で挿入した scaffold には以下の特殊形式のプレースホルダが含まれます:

| 形式                                                              | 意味                                     | 対処                                    |
| ----------------------------------------------------------------- | ---------------------------------------- | --------------------------------------- |
| `"[TRANSLATE → 1 English sentence]: <日本語原文>"`                | Summary 先頭文の翻訳待ち                 | 英語 1〜2 文に翻訳して置換              |
| `"[TRANSLATE COREFOLDER SECTION → 1 sentence]: <日本語テキスト>"` | InStory のコアフォルダ形態記述の翻訳待ち | 形態の説明として英語 1 文に翻訳して置換 |
| `"TODO: ..."`                                                     | 視覚情報などが必要な未決定フィールド     | 画像確認後に手動入力                    |
