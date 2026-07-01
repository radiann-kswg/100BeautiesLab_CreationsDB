# 進捗レポート: AIタグビルド機能の AppearanceDetail 対応（addon-ai-tag）(2026-07-01)

## 目的

将来的に新フィールド `AppearanceDetail` へ完全移行できるように、AIタグのビルド機能（`tools/patch-aihints.mjs`）を `AppearanceDetail` フィールドに適応させる。今回は「並行モードの追加・検証」までがスコープで、`IdentityMotif` からの完全移行・データの一括書き換えは対象外（User 判断待ちの別タスク）。

## 背景

- `AppearanceDetail`（`Formation` × `DesignElement` × `BodyPart[]` × `Laterality` × `Attrs[]` の構造化フィールド）は `2026-06-29` に `develop` へ統合済み、`addon-ai-tag` にも一方向マージ済み（`_work_in_progress/2026-06-29_progress_appearance-detail-merge-integration.md` / `2026-06-30_progress_appearance-detail-cleanup.md`）。
- 現在の AIタグビルド機能（`tools/patch-aihints.mjs --apply-identitymotif`、`docs/ai-hints-usage.md` §9.8）は `IdentityMotif`（自由文の `Motif_EN[]`）だけを正源にしており、`AppearanceDetail` は一切参照していなかった。
- NumberTales/Primary の現況（105 体中）: `AppearanceDetail` 保有 97 体、`IdentityMotif` 保有 95 体（両方保有 95 体）、既存 `AIHints` 保有 92 体。`AppearanceDetail` の方がやや先行しているため、AIタグ側もこのフィールドを読めるようにしておく必要がある。

## 実施内容

### 1. 新モード `--apply-appearancedetail` を追加（`tools/patch-aihints.mjs`）

- `buildAihintsFromAppearanceDetail(record, varsDef)`: `AppearanceDetail[]` を正源に `AIHints.common` / `AIHints.forms.<formation>` を再構築。
  - `Formation: null`（共通）/ `corefolder` / `humanoid` の明示区分をそのまま common/forms 振り分けに利用（`IdentityMotif` モードのキーワード分類は不要）。
  - `DesignElement` → カテゴリ対応: `Motif`/`BodyType`/`Ear` → body、`Expression` → `common.expression_tendency`（**IdentityMotif モードでは未対応だった項目**）、`CostumeItem` → outfit、`Halo`/`Emblem`/`Tag` → attached、`NumberMark` → immutable_traits、`TailsUnit` → 対象外（`TailsUnit` フィールドを正源として使うため二重化回避）。
  - `TailsUnit` / `Height_cm` / `ConceptAge` は `IdentityMotif` モードと同じく構造的正源として優先（既存 helper を再利用）。
- `buildAttrPhraseEN(attrs, varsDef, warnings, num)`: `Attrs[]`（`vdict_*` / `value_*` / `about_*`）から英語フレーズを合成。`lib/section-renders/appearanceDetail.js` の `buildAttrRows`（UI 表示用）と同じ解決規約に揃えた。`value_EN` 欠落時は `value_JP` を `[JA] ...` 付きで用い、警告ログに手動翻訳を促す（創作内容の自動翻訳はしない）。
- `loadMergedVarsDef(work)` / `resolveEnumLabelEN(...)`: `data/db_meta.json`（グローバル）と作品別 `db_meta.json` の `General.$VarsDef` をマージして `vdict_*` を英語ラベル解決（`$EnumDef_TailShapeType` / `$EnumDef_EarType` / `$EnumDef_NotationType` 等は作品ローカル定義）。
- `buildCorefolderNldFromAppearanceDetail(...)`: corefolder の `natural_language_description` を AppearanceDetail 由来の body_description / marking フレーズから直接組み立てる専用ビルダー（`IdentityMotif` モードの正規表現抽出とは別実装、抽出不能時は `TODO:` を残す）。
- fallback（AppearanceDetail が無い/全空）は `IdentityMotif` モードの `clearAihintsTagsForNoIdentityMotif` をそのまま共用（処理内容が同一のため関数を分けず再利用）。
- CLI: `--apply-appearancedetail` フラグ、ヘルプ、集計ラベル（`appearancedetail-applied` / `-cleared` / `-unchanged` / `-no-source`）を追加。既存モードと対称の命名規則。

### 2. 既存モードにはない安全対応（レビュー中に発見）

- `buildAihintsFromAppearanceDetail` の実装中、AIHints のスキーマ外トップレベルキー（例: `concept_contains_forms`。NumberTales/Primary の 90 レコードに存在、コード上は未参照）を再構築時に**保持する**よう実装（`{ ...baseAihints, common, work_common, forms, alt_modes }` のスプレッド）。form 単位のスキーマ外キーも同様に保持。
- **既知の非対称点**: `--apply-identitymotif` 側（既存実装、2026-06-09 導入）は `newAihints = { common, work_common, forms, alt_modes }` で構築しており、スキーマ外トップレベルキーを再構築のたびに落とす形になっている。今回は `--apply-appearancedetail` 側のみ対応し、`--apply-identitymotif` 側の修正はスコープ外として据え置いた（IdentityMotif モードは既に本番データへ適用済みのため、挙動変更は別途相談してから行う）。

## 影響範囲（編集ファイル）

- `tools/patch-aihints.mjs`（新モード本体。データファイルは未変更）
- `docs/ai-hints-usage.md`（§9.9 新設）
- `CHANGELOG.md`（エントリ追加）
- `_work_in_progress/2026-07-01_progress_appearancedetail-aihints-mode.md`（本ファイル）

## 検証

- `node --check tools/patch-aihints.mjs` OK
- `node tools/patch-aihints.mjs --work NumberTales --db Primary --all --apply-appearancedetail`（dry-run）: `appearancedetail-applied=92, appearancedetail-cleared=0, appearancedetail-unchanged=0, appearancedetail-no-source=0, skipped-no-aihints=13`（既存 AIHints 保有数と一致、エラーなし）。警告 25 件（`about_EN` / `value_EN` 未入力の Ear 系エントリ、既知のデータ完備待ち）。
- `#9` を対象に `--apply` → 出力内容を目視確認（`common.expression_tendency` が新たに埋まる、corefolder/humanoid で NumberMark 位置が正しく分岐する、`negative_visuals` が形態間差分から機械生成される、`concept_contains_forms` 等の既存キーが保持される ことを確認）→ `git restore` でデータファイルを HEAD へ復元済み（**本番データへの適用はまだ実施していない**）。
- `UnibyteLive/Primary`（`AI_Optout: true` 設定済み）に対して実行 → 既存の AI_Optout ガードが新モードにも正しく適用され `[ABORT]` で拒否されることを確認（モード固有の特別扱いなしで安全機構が効くことを確認）。
- `npm test` → **147 passed, 0 failed**。

## 未完了タスク（今回の範囲外）

- [ ] `AppearanceDetail` → `AIHints` の実データ適用（`--apply-appearancedetail --apply`）の実施可否・タイミングは User 判断。
- [ ] `IdentityMotif` と `AppearanceDetail` の両方を持つレコードに対する適用順序・優先方針の確定（現状はどちらのモードを後から適用したかで結果が変わる）。
- [ ] `--apply-identitymotif` 側のスキーマ外トップレベルキー欠落（`concept_contains_forms` 等）の扱い方針（修正するか、現状維持で `--apply-appearancedetail` 側だけ安全側に倒すか）。
- [ ] `value_EN` 未入力の Ear 系 Attrs（今回の dry-run で 25 件検出）の手動翻訳。
- [ ] `IdentityMotif` からの完全移行（本タスクは準備段階まで。移行実行は別タスク）。

## 参考リンク

- `_work_in_progress/2026-06-29_progress_appearance-detail-merge-integration.md`
- `_work_in_progress/2026-06-30_progress_appearance-detail-cleanup.md`
- `_work_in_progress/2026-06-09_progress_aihints-from-identitymotif.md`
- `_work_in_progress/2026-07-01_progress_aihints-remaining-tasks-closure.md`
- `docs/ai-hints-usage.md` §9.8（IdentityMotif モード）/ §9.9（AppearanceDetail モード、新設）
- `lib/section-renders/appearanceDetail.js`（Attrs 解決規約の参照元）
