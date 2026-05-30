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

- NumberTales DB_Primary の **#41 以降**（画像が存在するもののみ）の二層化を、後続セッションで 20 体ずつ実施予定。
  - `#28` は `emstk_corefolder28-1` が無いため `forms.corefolder.reference_images: null` で対応済み（参考用に `cnsp_img28-onBusiness/onPrivate` の存在は自然言語側で言及）。
  - `#38` は notProceeded のため対象外（スキップ済）。
- NumberTales 以外の作品（Secondary 等含む）は本セッション対象外。後日、自動パッチ適用での一括付与を想定。

## 合意事項（運用ルール）

- 1 セッションにつき 20 体ずつ進める。
- 適用範囲は「ナンバーテールズのキャラクター画像が存在する一次創作」のみ。他キャラクターは後続セッション・自動パッチで対応。
- 編集前に該当レコードを必ず再読込し、手動修正の有無を確認する。
