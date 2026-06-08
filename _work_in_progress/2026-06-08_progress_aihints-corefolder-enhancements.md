# 2026-06-08 progress: AIHints corefolder enhancements (NumberTales)

## 目的

User 要望に基づき、画像生成 AI（特に NumberTales のコアフォルダ形態）への対応強化を実装する。要望は 6 項目（[A]-[F]）あり、本セッションでは Copilot で扱える「構造的デフォルト」「スキーマ拡張」「ツール拡張」に絞って実装した。創作設定やキャラクターデザインそのものに関する情報補完は画像 / User 入力を正とし、Copilot による自動生成はしない。

## 変更点の要約

### 1. `data/Works_NumberTales/DataBases/db_type.json`

- `$Def_AIFormVariant` に 3 フィールド追加（順序: `outfit_features` → `silhouette_notes` → `immutable_constraints` → `negative_keywords` → `ai_tags`）。
  - `silhouette_notes` (`#String[]|#Null`)
  - `immutable_constraints` (`#String[]|#Null`)
  - `negative_keywords` (`#String[]|#Null`)
- `outfit_features` の JP description を「キャラ固有の corefolder 装備等」を含む形へ更新。
- `$Def_AIHints` トップレベルに 2 セクション追加（順序: `common` → `work_common` → `forms` → `alt_modes`）。
  - `work_common.reference_images.{corefolder_reference[], humanoid_reference[]}`
  - `alt_modes.corefolder_dressed.{allowed: #Boolean|#Null, outfit_source: #String|#Null}`
- 補助型を新設: `$Def_AIHintsWorkCommonReferenceImages`, `$Def_AIHintsWorkCommon`, `$Def_AIAltCorefolderDressed`, `$Def_AIAltModes`。

### 2. `tools/patch-aihints.mjs`

- **`--upgrade-schema` モード新設**: 既存レコードへ差分追加のみ（`!('field' in obj)` ガード）。corefolder には structural default を投入、humanoid とキャラ固有スロットは TODO 残し。
- **scaffold 生成 (`buildCorefolderForm` / `buildSuggestedCorefolderForm` / `buildHumanoidForm` / `buildSuggestedHumanoidForm`)** を 3 新フィールド対応に更新。
- **`buildScaffold` / `buildSuggestedScaffold`** に `work` パラメータを追加し、`work_common`（`Images/Ref_Glossary/concept-figure/` 等から `cnsp-fg_*CoreFolder.png` / `cnsp-fg_*Humanoid.png` を自動収集）と `alt_modes:null` をトップレベルへ追加。
- **`buildSuggestedScaffold`** の `silhouette_features` に [D] 尻尾本数テンプレを `TailsUnit` から自動投入（`exactly N ${unit} total: upper trunk forks into TODO bundles of TODO ${unit} each, lower trunk has TODO single ${unit}, no more no less`）。
- **`buildSuggestedScaffold`** の `immutable_traits` の旧「number marking location」TODO を [E] 単一スロット強制テンプレへ置換（`TODO: number 'N' marking placement (single fixed slot, e.g., back center / collar tag / harness front)`）。
- **`--fill-todos` モード拡張**: `TailsUnit` から尻尾本数テンプレを `common.silhouette_features` に自動追記（既に同形式があれば再追加しない）。
- **`--apply-vision-results` の `VisionResult` typedef** に 7 フィールド追加: `corefolderSilhouetteNotes[]` / `humanoidSilhouetteNotes[]` / `corefolderImmutableExtras[]` / `humanoidImmutableExtras[]` / `corefolderNegativeKeywords[]` / `humanoidNegativeKeywords[]` / `numberMarkingPlacement`。corefolder は重複除去で追記、humanoid は TODO スロット置換、`numberMarkingPlacement` は `common.immutable_traits` の対応 TODO を単一スロット記述で置換。
- 結果集計 (`counts`) に `schema-upgraded` / `schema-unchanged` を追加。`main()` のサマリ表示にも反映。
- 補助 helper: `reorderObjectKeys()` / `resolveWorkCommonRefs()` / `buildWorkCommonBlock()` / `upgradeAihintsSchemaInRecord()`。

### 3. データ適用

- `node tools/patch-aihints.mjs --work NumberTales --db Primary --all --upgrade-schema --apply` を実行。
- 結果: **schema-upgraded=91 + schema-unchanged=1（テスト用に先行適用した #1）= 計 92 レコード**、skipped-no-aihints=13。
- corefolder の structural default（腕/脚禁止・humanoid 衣装禁止・ハーネス保持・negative keywords 10 件）、`work_common.reference_images`、`alt_modes:null` がすべての AIHints 保有レコードに投入された。

### 4. テスト

- 新規: `tests/aihints.schema.test.js`（10 ケース）
  - `$VersDef.$Def_AIFormVariant.$DefType` に 3 新フィールドが宣言・順序通り
  - `$VersDef.$Def_AIHints.$DefType` に `work_common` / `alt_modes` が宣言・順序通り
  - 補助型（`$Def_AIHintsWorkCommon` / `$Def_AIAltModes` / `$Def_AIAltCorefolderDressed` / `$Def_AIHintsWorkCommonReferenceImages`）が存在
  - 92 レコードすべての corefolder / humanoid form に 3 新フィールドが空でない配列として存在
  - corefolder の immutable_constraints に「腕/脚/humanoid」キーワード、negative_keywords に `legs`/`arms` が含まれる
  - 既存の `Num` / `Name` / `forms.corefolder.ai_tags` / `form_tags` を破壊していない
- 結果: 新規 10 ケース pass、全 109 ケース pass（既存失敗 6 件は本変更とは無関係な pre-existing failure / `stash + 再実行` で確認済み）。

### 5. ドキュメント

- `CHANGELOG.md`: 冒頭に新項目を追記。
- `docs/ai-hints-usage.md`: §4 表に 3 新フィールド行 + トップレベル `work_common` / `alt_modes` 追記。§9.5 として「`--upgrade-schema` モード（corefolder 強化フィールドの差分追加）」を新設。

## 影響範囲（編集したファイル）

- `data/Works_NumberTales/DataBases/db_type.json` (schema 拡張)
- `data/Works_NumberTales/DataBases/db_Primary.json` (92 レコード upgrade-schema 適用)
- `tools/patch-aihints.mjs` (新モード + scaffold + fill-todos + vision-results 拡張)
- `tests/aihints.schema.test.js` (新規)
- `docs/ai-hints-usage.md` (§4 + §9.5)
- `CHANGELOG.md` (冒頭追記)

## 未完了タスク

User 要望 6 項目 [A]-[F] のうち、本セッションで完了した範囲と、User 手動入力が必要な範囲:

| 項目 | 内容                                       | Copilot 範囲                                                                               | 残作業                                                                                                                          |
| ---- | ------------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| [A]  | corefolder の `silhouette_notes` 投入      | ✅ structural default 投入 (球体本体 + ハーネス)                                           | キャラ固有 1-2 行を User 入力（92 レコード × 2 形態）                                                                           |
| [B]  | corefolder の `immutable_constraints` 投入 | ✅ structural default 4 項目投入                                                           | キャラ固有制約を必要に応じて User 追記                                                                                          |
| [C]  | corefolder の `negative_keywords` 投入     | ✅ structural default 10 項目投入                                                          | キャラ固有 NG を User 追記                                                                                                      |
| [D]  | 尻尾本数テンプレ強化                       | ✅ scaffold + fill-todos で `TailsUnit` から自動投入可能                                   | 92 レコードへの fill-todos 実適用（必要なら追って実行）                                                                         |
| [E]  | 番号マーキング単一スロット化               | ✅ suggest scaffold で TODO 形式提供 + vision-results で `numberMarkingPlacement` 受け入れ | 既存 92 レコードの `'#N' number marking (immutable)` 行は User が単一スロット記述に書き換え（または vision-results を別途渡す） |
| [F]  | corefolder と humanoid の混同抑制          | ✅ form 別 negative_keywords / immutable_constraints で吸収                                | 必要なら humanoid form 側にも対称的なキャラ固有 NG を User 追記                                                                 |

## 検証

- `tests/aihints.schema.test.js`: 新規 10 ケース pass
- `tests/data.sanity.test.js`: pass（JSON 構文確認）
- `tests/data.shape.test.js` 他: 既存失敗 6 件は本変更前から残る pre-existing failure（`git stash + 再実行` で確認済み、無関係）
  - 失敗内訳: `$Def_BaseArea` 未定義系（`data.shape`, 2 件）/ `commons.secondaries` 1 件 / `enrich.dblink.jump.merge` の `ハジメ` / `フェニクス` 一致系 2 件 / `pages.characters.ui-output` の `能力レベル: S+` 一致系 1 件

## 補足（今後の運用）

- `--upgrade-schema` は冪等（再実行しても入力済み値を変えない）。新フィールドを追加する場合は本パターンを踏襲できる。
- 他作品（`Works_FLInvestigator78` 等）への展開時は、対象作品の `db_type.json($VersDef.$Def_AIFormVariant)` にも同じ 3 フィールドを宣言し、`Images/Ref_Glossary/concept-figure/cnsp-fg_*CoreFolder.png` 命名規約を整備する必要がある。
- 本セッションでは `AI_Optout` 設定済み DB は対象外（ガードが exit code 2 で拒否）。NumberTales/Primary のみが現在の対象。

## 関連リンク

- 要望元: 本セッションの最初の User メッセージ（addon-ai-tag ブランチ）
- 関連進捗: `_work_in_progress/2026-06-01_progress_aihints-vision-final-and-playbook.md`
- 関連 schema: `data/Works_NumberTales/DataBases/db_type.json` $Def_AIHints\*
- 関連 spec: `docs/ai-hints-usage.md` §4, §9.5
