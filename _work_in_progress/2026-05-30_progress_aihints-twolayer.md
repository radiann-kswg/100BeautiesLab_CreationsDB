# 2026-05-30 進捗: `AIHints` 二層構造（common / forms）への移行

## 目的

`AIHints` がフラット構造のままだと、corefolder（装備姿）と humanoid（人型通常姿）の差分を 1 レコード内で表現できず、画像生成用 prompt の使い分けに支障が出ていた。これを「姿勢共通の不変属性 (`common`)」と「形態別の差分 (`forms.<form>`)」の二層構造に分離する（採用案: B）。

## 変更点の要約

### Schema (`data/db_type.json`)

- `$Def_AIHints` を二層化:
  - `$Def_AIHintsCommon`: `identity_tags` / `silhouette_features` / `immutable_traits` / `expression_tendency` / `age_appearance` / `palette_priority` / `natural_language_description`
  - `$Def_AIHintsForms`: `corefolder` / `humanoid`（いずれも `$Def_AIFormVariant|#Null`）
  - `$Def_AIFormVariant`: `form_tags` / `outfit_features` / `ai_tags` / `negative_visuals` / `natural_language_description` / `prompt_export` / `negative_prompt_export` / `reference_images`
- top-level の `AIHints` field 宣言（`"$type": "$Def_AIHints|#Null"`) は維持。
- 画像が存在しない形態の `forms.<form>` は省略可能。

### Docs (`docs/ai-hints-usage.md`)

- 二層構造前提で全面改訂。用語統制（fox ears / branching fox tails 等）、`ai_tags` の合成順（`form_tags` → identity → expression → outfit）、URL 規約、付与対象判定、NovelAI / ChatGPT / Gemini 各環境での使い方を整理。

### データ移行 (`data/Works_NumberTales/DataBases/db_Primary.json`)

- 本セッション継続分も含め、**#1〜#37 と #39〜#40** を二層構造へ変換（#38 は notProceeded のためスキップ）。
  - `corefolder` + `humanoid` の両形態あり: `#1`, `#7`, `#12`, `#15`, `#17`, `#20`, `#23`, `#24`, `#25`, `#27`, `#37`, `#39`
  - `corefolder` のみ（`reference_images` 通常）: `#2`, `#3`, `#4`, `#5`, `#6`, `#8`, `#9`, `#10`, `#11`, `#13`, `#14`, `#16`, `#18`, `#19`, `#21`, `#22`, `#26`, `#29`, `#30`, `#31`, `#32`, `#33`, `#34`, `#35`, `#36`, `#40`
  - `corefolder` のみ（`reference_images: null`、emstk_corefolder 画像が無い）: `#28`
- #26 以降の旧フォーマット（`identity_tags` / `natural_language_description` / `prompt_export` / `negative_prompt_export` / `reference_images` 未整備、`palette_priority` が記述文字列）レコードについては、既存値からの合成と hex 推定により二層構造へアップグレードした。

## 影響範囲（編集ファイル）

- `data/db_type.json`
- `docs/ai-hints-usage.md`
- `data/Works_NumberTales/DataBases/db_Primary.json`（#1〜#37, #39〜#40）
- `CHANGELOG.md`
- `_work_in_progress/2026-05-30_progress_aihints-twolayer.md`（本ファイル）

## 検証

- `npx vitest run tests/data.sanity.test.js` → 3/3 pass（各バッチ後にも確認）
- UI/SW 側に flat `AIHints` を直接消費するコードは存在しないことを grep で確認済み（データファイルと docs のみ参照）。

## 未完了タスク

- NumberTales DB_Primary の **#41 以降** は、調査の結果既存 `AIHints` ブロックが一切存在せず、ゼロからの新規生成（創作内容の自動生成）に該当する。本セッションでは対応しず、**後日 User 監修のもとで自動パッチ適用により段階的に付与する方針**とした（copilot-instructions.md 「創作内容の自動生成を避ける」に従う）。
  - スキップ対象の確認済みレコード: `#51`（画像は concept のみ、`AIHints` なし）、`#54` / `#59`（notProceeded）。
  - 自動パッチ対象候補（画像存在・#41-#60）: `#41`, `#42`, `#43`, `#44`, `#45`, `#46`, `#47`, `#48`, `#49`, `#50`, `#52`, `#53`, `#55`, `#56`, `#57`, `#58`, `#60`。humanoid 画像あり: `#42`, `#47`, `#49`, `#55`, `#57`, `#60`。
- NumberTales 以外の作品（Secondary 等含む）は本セッション対象外。同様に自動パッチ適用での一括付与を想定。

## 自動パッチツール `tools/patch-aihints.mjs`

User 監修下で #41 以降（および他作品）へ二層構造 AIHints を段階適用するための CLI。本セッションで新規追加した。

### 設計方針

- **創作内容を自動生成しない**: タグ本体・自然文・台詞などは `TODO: ...` プレースホルダ文字列のまま挿入する。User が手動で書き起こすことを前提。
- **構造のみ確定値で埋める**: `common.age_appearance`（`ConceptAge` から age band 推定）、`form.ai_tags` 先頭の `1girl|1boy|1other`（`GenderType` から）、`forms.<form>.reference_images`（実ファイル存在を `fs.existsSync` で検証してから URL 採用）の3点のみ機械的に確定。
- **既存 AIHints は保護**: デフォルトで `skipped-existing`。`--force` 指定時のみ置換（要 User 確認）。
- **画像欠落レコード**: corefolder / humanoid のどちらも存在しない場合は `skipped-no-image` として何も書き換えない。
- **テキスト挿入で実装**: 既存ファイルの整形（4 スペース・キー順・コメント無し JSON）を完全保持するため、`JSON.parse/stringify` での round-trip ではなく balanced-brace でレコード範囲を取り、最後のプロパティの直後にカンマ＋新規 `"AIHints": {...}` 行を差し込む。
- **書き込み前 JSON 検証**: 加工後テキストを `JSON.parse` で再検証し、失敗時は書き込まず中断。

### CLI

```powershell
# dry-run（既定）
node tools/patch-aihints.mjs --work NumberTales --db Primary --records 41-60

# 実書き込み
node tools/patch-aihints.mjs --work NumberTales --db Primary --records 41-60 --apply

# 個別指定
node tools/patch-aihints.mjs --work NumberTales --db Primary --records 41,42,47 --apply

# 全レコード対象
node tools/patch-aihints.mjs --work NumberTales --db Primary --all --apply

# 既存 AIHints を上書き
node tools/patch-aihints.mjs --work NumberTales --db Primary --records 5 --force --apply
```

### dry-run 結果

- `--records 1-40`: `skipped-existing=39`, `skipped-no-image=1` (#38 notProceeded) ─ 既存変換済みレコードは無改変。
- `--records 41-60`: `patched=18`, `skipped-no-image=2 (#54 #59)` ─ #51 は `cnsp_img51` のみ存在するため common.reference_images だけ持つ scaffold として patched 対象に昇格。
- `--all`: `patched=50`, `skipped-existing=39`, `skipped-no-image=10`。

### 共通リソース（concept / catalog 系）の扱い

User 要望に基づき、「1 枚に全形態が描かれた素体イラスト」も AIHints に取り込めるよう、schema (`data/db_type.json`) を以下のように拡張済み:

- `$Def_AIReferenceImages` に `concept` / `concept_variants[]` / `catalog` / `design_sheet` を追加。
- `$Def_AIHintsCommon` に `reference_images` 項目を新設（オプショナル / `#Null` 可）。

`patch-aihints.mjs` は `Images` 直下の以下フィールドを common 用画像として実在検証し、`common.reference_images` に格納する:

| フィールド                           | 解決先                              | common 内のキー                     |
| ------------------------------------ | ----------------------------------- | ----------------------------------- |
| `concept_PNGName` (string)           | `Images/DB_*/concept/<name>.png`    | `main` (= 同 URL を `concept` にも) |
| `conceptAlt_PNGName[]`               | `Images/DB_*/conceptAlt/<name>.png` | `concept_variants[]`                |
| `catalog_PNGName`                    | `Images/DB_*/catalog/<name>.png`    | `catalog`                           |
| `designAlt_PNGName` (string / array) | `Images/DB_*/designAlt/<name>.png`  | `design_sheet`                      |

### User 運用フロー（想定）

1. dry-run でサマリ確認。
2. `--apply` で書き込み → `npm test -- tests/data.sanity.test.js` で 3/3 pass を確認。
3. 挿入された `TODO: ...` プレースホルダを順次手動で本物のタグ・自然文・prompt_export 等に書き換える。
4. 書き換えごとに UI / SW 表示を任意で確認。

## 合意事項（運用ルール）

- 1 セッションにつき 20 体ずつ進める。
- 適用範囲は「ナンバーテールズのキャラクター画像が存在する一次創作」のみ。他キャラクターは後続セッション・自動パッチで対応。
- 編集前に該当レコードを必ず再読込し、手動修正の有無を確認する。

---

## セッション追記（2026-05-30 後半）: `--suggest` フラグ追加 + Agent プロンプトファイル作成

### 変更点

1. **`tools/patch-aihints.mjs` — `--suggest` フラグ追加**

   既存フィールドから機械的に導出できる値を自動入力する半自動モードを追加。
   - `parseArgs()` に `suggest: false` オプションとスイッチ分岐を追加。
   - `printHelpAndExit()` に `--suggest` の説明文を追加。
   - `patchFileText()` で `opts.suggest` が true なら `buildSuggestedScaffold()` を呼ぶよう分岐。
   - `main()` のサマリ表示に `/ suggest` 表記を追加。
   - `buildScaffold()` の `palette_priority` バグ修正（配列 `[...]` → オブジェクト `{primary, secondary, accent}` へ）。

2. **7 つの新関数を `tools/patch-aihints.mjs` に追加**

   | 関数名                                      | 役割                                                                |
   | ------------------------------------------- | ------------------------------------------------------------------- |
   | `parseTailsUnit(tailsUnit)`                 | TailsUnit 文字列を `{animal, count, branching, unit}` に分解        |
   | `buildTailDescription(tu)`                  | 分解済み情報を `"branching fox 4 tails"` 形式の英語文字列に変換     |
   | `extractExpressionHints(characterText)`     | Character フィールドのキーワードマッピング → 最大3件の表情タグ      |
   | `buildNlDescriptionHint(summary)`           | Summary 先頭文を `[TRANSLATE → 1 English sentence]: ...` 形式に変換 |
   | `buildNegativeVisuals(tu, formType)`        | 形態別 negative_visuals 文字列リストを生成                          |
   | `buildSuggestedCorefolderForm(...)`         | suggest モードの corefolder 形態 scaffold を生成                    |
   | `buildSuggestedHumanoidForm(...)`           | suggest モードの humanoid 形態 scaffold を生成                      |
   | `buildSuggestedScaffold(record, imageInfo)` | suggest モード全体のエントリポイント                                |

3. **`.github/prompts/aihints-fill.prompt.md` を新規作成**

   Agent モードで残 TODO を対話的に補完するワークフロープロンプトファイル。
   - YAML フロントマター: `mode: agent`、`tools`: read_file / grep_search / replace_string_in_file / run_in_terminal
   - Step 0-5 の構造化ワークフロー（scaffold 挿入 → 読み込み → 変換 → 確認 → 書き込み → テスト）
   - フィールド対応ルールテーブル（common / forms 各フィールドの導出元と変換方針）
   - TailsUnit 変換早見表 / Character → expression_tendency 変換早見表
   - `[TRANSLATE...]` 形式プレースホルダの扱い説明
   - 重要制約（palette_priority は常に TODO、新規創作情報を生成しない）の明記

### 影響範囲

- `tools/patch-aihints.mjs`（`--suggest` 追加、バグ修正、8 関数追加）
- `.github/prompts/aihints-fill.prompt.md`（新規作成）
- `CHANGELOG.md`（追記）

### 検証

- `node tools/patch-aihints.mjs --records 41-43 --suggest -v`: dry-run `patched=3` を確認
- `node tools/patch-aihints.mjs --help`: `--suggest` が表示されることを確認
- `tests/data.sanity.test.js` → 3/3 pass

### 未完了タスク

- #41 以降への `--suggest --apply` 実適用（User 監修のもとで順次実施）
- `palette_priority` / 視覚系 TODO の手動入力（User 監修）
- Agent プロンプトを使った対話型 TODO 補完の実施
