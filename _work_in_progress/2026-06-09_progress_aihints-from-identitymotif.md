# 2026-06-09 progress: AIHints を IdentityMotif から再構築 (`--apply-identitymotif`)

## 目的

User からの要望「AIタグの正確性を図るため、`IdentityMotif` フィールドを作成しました。**この `IdentityMotif` フィールドのみを正として** AIタグの修正を行ってください。」を受けて、`tools/patch-aihints.mjs` に `IdentityMotif` を単一正源とする AIHints 再構築モードを追加し、`Works_NumberTales/DataBases/db_Primary.json` 全件に適用する。

ただし以下 3 種類のフィールドは構造データ側を正源として **IdentityMotif より優先**する:

- **尻尾形状**: `TailsUnit`（`parseTailsUnit` + `buildTailDescription`）
- **外見年齢**: `ConceptAge`（`ageBandOf`）
- **体格**: `Height_cm`（新ヘルパー `heightBandOf`）

加えて **番号部の位置やデザイン**は 2026-06-08 セッション（`_work_in_progress/2026-06-08_progress_aihints-corefolder-enhancements.md`, `_work_in_progress/2026-06-09_progress_corefolder-nld-template-and-silhouette-structure.md`）で導入した運用を正とし、`common.immutable_traits` の単一スロット記述（`'#N' number marking ...` / `no number identifier ...`）と corefolder NLD テンプレ（`extractMarkingInfo` 経由）を保持する。

## 変更点の要約

### 1. `tools/patch-aihints.mjs`

#### 新 CLI モード

- `--apply-identitymotif`: `IdentityMotif[]` を単一正源として AIHints を再構築する。
  - 集計タイプ: `identitymotif-applied` / `identitymotif-unchanged` / `identitymotif-cleared` / `identitymotif-no-source`。
  - `--apply` 併用で実書き込み、未指定なら dry-run。

#### 新ヘルパー

- `heightBandOf(height)`: 体格バンド（`petite` / `short` / `average` / `slightly tall` / `tall` + `(about Ncm)`）。
- `normalizeMotifEntry(s)`: lowercase + 括弧除去 + 空白正規化。重複判定用キー。
- `classifyMotifEntry(entry)`: `form` / `attached` / `outfit` / `body` / `misc` を末尾語ベース辞書（`ATTACHED_NOUNS` / `OUTFIT_NOUNS` / `BODY_NOUNS`）+ 正規表現フォールバックで判定。未マッチは `misc`。
- `synthesizeBaseColorFromMotif(bodyEntries)`: `COLOR_WORDS`（約 50 色、`red orange` / `reddish-pink` 等の複合色含む）辞書で body 系から base color を抽出。corefolder NLD テンプレ用 `extractBaseColor()` の入力源として `silhouette_notes.body_description` の 2 番目に `<color> base coloring (synthesized from IdentityMotif)` 行を差し込む。
- `buildAihintsFromIdentityMotif(record)`: AIHints オブジェクト全体を組み立てる。返り値 `{aihints, hasSource, formationsTouched}`。
- `clearAihintsTagsForNoIdentityMotif(baseAihints)`: IdentityMotif が空のレコード向け fallback。AI タグ系配列を空にクリアし、structural default / `reference_images` / `age_appearance` / `work_common` / `alt_modes` は保持。
- `applyIdentityMotifToAihintsInRecord(text, openIdx, closeIdx, record)`: 上記を text-based JSON 書き換え（`stringifyAihintsBlock` + `replaceAihintsInRecord`）でレコード内に反映する wrapper。

#### `buildAihintsFromIdentityMotif` の出力仕様（要点）

- **`common.identity_tags`**: 複数 formation の場合は normalize 集合の積集合（重複は 1 件目を保持）。1 formation のみの場合はその formation の全 Motif_EN（`isStructuralOverride` で構造的正源と重なる種類は除外）。
- **`common.silhouette_features`**: 先頭に `tail`（`TailsUnit`）/ `stature`（`Height_cm`）を必ず注入し、続けて IdentityMotif 由来 body 系を append。
- **`common.immutable_traits`**: 既存 `common.immutable_traits` の中から **番号刻印に関連する行のみ**を引き継ぐ（昨日の単一スロット記述を保持し、corefolder NLD テンプレの marking placement 部が TODO に戻らないようにする）。番号刻印行が無ければ `null`。
- **`common.age_appearance`**: `ageBandOf(record.ConceptAge)` で必ず上書き。
- **`common.palette_priority` / `expression_tendency` / `natural_language_description`**: IdentityMotif に正源が無いため `null`。
- **`common.reference_images`**: 既存値を保持（画像 URL は structural）。
- **`forms.<formation>.form_tags`**: `<formation> form` + IdentityMotif の form 系エントリ。
- **`forms.<formation>.outfit_features`**: outfit 系 + 取りこぼし防止の misc 系を末尾に append。
- **`forms.<formation>.silhouette_notes`**: object 形式（`body_description[]` / `attached_items[]`）。corefolder は球体本体行 + 合成 base color 行 + body 系を `body_description` へ、`attached` 系を `attached_items` へ。
- **`forms.<formation>.immutable_constraints` / `negative_keywords`**: corefolder は `COREFOLDER_DEFAULT_IMMUTABLE_CONSTRAINTS` / `COREFOLDER_DEFAULT_NEGATIVE_KEYWORDS` の structural default を再注入。humanoid は `null`（schema 上 `#String[]|#Null` で許容）。
- **`forms.<formation>.ai_tags`**: 先頭に `<formation> form` → `tail` → `stature` → `age band` → IdentityMotif 全 Motif_EN（構造的正源と重なるものは除外）。
- **`forms.<formation>.negative_visuals`**: 対向 formation の Motif_EN - 自 formation Motif_EN。body 系 + 構造的正源（尻尾本数・体格・年齢）は除外。
- **`forms.<formation>.natural_language_description`**: corefolder は `buildCorefolderNldFromTemplate` で再生成、humanoid は `null`。
- **`forms.<formation>.prompt_export` / `negative_prompt_export`**: `ai_tags` / `negative_visuals` を `, ` 結合で再生成。
- **`forms.<formation>.reference_images`**: 既存値を保持。
- **top-level `work_common` / `alt_modes`**: 既存値を保持（image-derived / structural）。
- **既存 forms 側にあって IdentityMotif に無い formation**: form タグ + structural default + reference_images のみ残し、AI タグ系配列はクリア（Y rule）。

### 2. データ適用 (`data/Works_NumberTales/DataBases/db_Primary.json`)

- 実行: `node tools/patch-aihints.mjs --work NumberTales --db Primary --all --apply-identitymotif --apply`
- 結果: `identitymotif-applied=89, identitymotif-cleared=3, identitymotif-unchanged=0, identitymotif-no-source=0, skipped-no-aihints=13`
  - applied 89 件: IdentityMotif に少なくとも 1 件の Motif_EN がある通常レコード
  - cleared 3 件: IdentityMotif が全空 / 配列のみ存在
  - skipped 13 件: AIHints ブロックがそもそも存在しない（モブ等）

### 3. テスト (`tests/aihints.schema.test.js`)

- humanoid form の `immutable_constraints` / `negative_keywords` 期待値を「array または null」へ緩和。array の場合は引き続き非空必須。
- 結果: 11/11 pass。

### 4. ドキュメント

- `CHANGELOG.md` 先頭に新項目を追記。

## 影響範囲（編集したファイル）

- `tools/patch-aihints.mjs`（新モード `--apply-identitymotif` + ヘルパー群追加 / `heightBandOf` 追加）
- `data/Works_NumberTales/DataBases/db_Primary.json`（92 レコード再構築）
- `tests/aihints.schema.test.js`（humanoid の null 許容化）
- `CHANGELOG.md`

## 未完了タスク

- `docs/ai-hints-usage.md` への `--apply-identitymotif` モード追記（必要に応じて User と相談のうえ反映）。
- 他作品（FLInvestigator78 / ShouArRiders 等）への `IdentityMotif` フィールド整備および `--apply-identitymotif` 適用は本セッション対象外（NumberTales/DB_Primary のみ）。
- `identitymotif-cleared` となった 3 レコードのうち、明示的に「番号 0/00 系」など特殊個体については後段で User が IdentityMotif を埋めた時点で再適用が必要。

## 検証

- `node tools/patch-aihints.mjs --work NumberTales --db Primary --records 1-3 --apply-identitymotif --apply` で記録 #1 / #2 / #3 の出力をスポット確認:
  - #1 (`TailsUnit=キツネ型1本, Height_cm=146, ConceptAge=14`): silhouette_features = `["fox single tail", "short stature (about 146cm)", ...]`, age_appearance = `"early teenager"`, common.immutable_traits = `["small red number '1' marking on the front of the sphere body, center-bottom of the sphere, only one slot"]`, corefolder NLD = `"Corefolder form: a spherical cushion-like body in red orange, with the number '1' marking on the front of the sphere body, center-bottom of the sphere."`
  - #2 (`TailsUnit=キツネ型2本, Height_cm=146, ConceptAge=14`): silhouette_features 先頭 `"fox 2 tails"`, NLD `"... in orange, with the number '2' marking on the front-hanging end of the neck kerchief; rectangular glasses."`
  - #3 (`TailsUnit=キツネ型3本, Height_cm=160, ConceptAge=17`): silhouette_features 先頭 `"fox 3 tails"`, stature `"slightly tall stature (about 160cm)"`, age `"teenager"`, NLD `"... in yellow, with the number '3' marking on the right side of the front of the spherical body."`
- `npm.cmd test`: 110/116 pass。残り 6 件は本変更前から残る pre-existing failure（`commons.secondaries` / `data.shape` / `enrich.dblink.jump.merge` / `pages.characters.ui-output`、いずれも本変更対象外の領域）。
- aihints.schema 単体: 11/11 pass。

## 参考

- `.github/copilot-instructions.md`「会話パターン情報追加時の運用制約」と整合: 創作本文（Motif_JP 等）は User 入力を主体とし、本ツールは構造的合成・正源優先のみを行う。番号刻印を含む創作的位置記述は 2026-06-08 セッションで導入された単一スロット記述を継続使用。
- `_work_in_progress/2026-06-08_progress_aihints-corefolder-enhancements.md`（番号マーキング単一スロット化の根拠）
- `_work_in_progress/2026-06-09_progress_corefolder-nld-template-and-silhouette-structure.md`（corefolder NLD テンプレ化 / silhouette_notes object 化）
