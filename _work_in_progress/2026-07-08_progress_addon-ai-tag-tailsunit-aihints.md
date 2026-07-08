# `addon-ai-tag`: AIHints 生成ロジックを新しい構造化 `TailsUnit` に追従

## 目的

`develop` ブランチで `TailsUnit` が旧来の自由記述 `TailsUnit_JP`/`TailsUnit_EN` から構造化型 `$Def_TailsUnit[]`（`TailShapeType`/`Count`/`Segment`/`Branches[]`/`LayoutDirection`/`Note_JP`/`Note_EN`）へ移行済み（本移行自体は `2026-07-07_progress_tailsunit-dedicated-type.md` / `2026-07-08_progress_tailsunit-layoutdirection.md` を参照）。この変更は User により `develop` → `addon-ai-tag` へ一方向マージ済み。

`addon-ai-tag` 側の AIHints 生成 CLI ツール `tools/patch-aihints.mjs` は旧フラット文字列前提の `parseTailsUnit(tailsUnit: string)` を使っており、新しい配列/オブジェクト値を渡すと常に `null` を返して沈黙的に壊れる状態だった。本作業でこれを追従修正した。

## 作業ブランチ

`addon-ai-tag`（本体ローカル、User が事前に `develop` からマージ済みの状態から着手）。

## 変更点の要約

### `tools/patch-aihints.mjs`

- `parseTailsUnit(tailsUnit, varsDef)`: シグネチャ変更（`varsDef` 引数追加）。`TailsUnit[0]`（先頭エントリ、配列の複数エントリは非対応・主形状のみ扱う方針）から `TailShapeType`/`Count`/`Segment`/`Branches`/`LayoutDirection` を読み取り、`TailShapeType`/`Laterality` は既存の `resolveEnumLabelEN`/`loadMergedVarsDef`（`--apply-appearancedetail` モードで既に使われていたヘルパー）で解決する実装に全面書き換え。返り値の形状も `{animal, count, branching, unit}` から `{shapeLabel, animalWord, count, segment, branches, direction, branching}` に変更。
- `buildTailDescription(tu)`: 新しい `tu` 形状に追従（`animalWord || shapeLabel` を使用）。`unit`（feather/blade 区別）は新スキーマの `$EnumDef_TailShapeType`（14種）に該当概念が無いため廃止し、常に "tail(s)" 表記に統一。
- `buildTailBundleDescription(tu)`（新規 export）: 旧来ハードコードされていた「upper trunk forks into TODO bundles of TODO tails each, lower trunk has TODO single tail」という TODO だらけのシルエットテンプレを、`Branches[]`/`LayoutDirection` の実データから TODO なしで具体的に生成するよう置き換え（User 承認済みの改善）。N個の `Branches` に汎用対応（旧実装は upper/lower の2段決め打ち）。
- 呼び出し箇所（`buildScaffold`/`buildSuggestedScaffold`/`buildNegativeVisuals`/`buildSuggestedCorefolderForm`/`buildSuggestedHumanoidForm`/`fillJsonTodosInRecord`/`buildAihintsFromIdentityMotif`+`applyIdentityMotifToAihintsInRecord`/`buildAihintsFromAppearanceDetail`）を全て新シグネチャに追従。うち `fillJsonTodosInRecord`・`applyIdentityMotifToAihintsInRecord` は `varsDef`/`work` を新たに受け取る必要があったため、既存の兄弟モード（`upgradeAihintsSchemaInRecord`・`applyAppearanceDetailToAihintsInRecord`）と同じパターンでパラメータを追加し、呼び出し元（`main()` 内のモード分岐）まで引き渡した。
- `fillJsonTodosInRecord` 内の重複挿入防止用正規表現（`--fill-todos` の冪等性ガード）を旧テンプレ形状（`upper trunk` 固定文字列）から新テンプレ形状に合わせて修正。**これを直さないと再実行のたびに新テンプレが重複挿入されるバグになるため必須の修正だった。**
- 耳タグ（`"fox ears"` 等）は `TailShapeType` の14種類のうち Fox/Cat/Nekomata/Dog 系統のみに限定して生成し、それ以外（Scorpion/Bud/CaudalFin/Octopus/Mixed/Reptile）は既存の `TODO: ear type from TailsUnit` フォールバックのまま据え置いた（User 確認済みの暫定対応。「耳」概念の正式な切り分けは `develop` 側の DB/スキーマ調整で行う予定）。
- 死んだ `ELEMENT_CATEGORY` マップエントリ `['#Element_TailsUnit', 'skip']` を削除（対応する `AppearanceDetail` 側の `#Element_TailsUnit` enum 値は前回セッションで既に削除済みのため、このエントリは二度とマッチしない到達不能コードだった）。

### 副次的に発見・修正したバグ（潜在バグ、今回のスコープと直接関係あり）

`tools/patch-aihints.mjs` 冒頭の shebang 行（`#!/usr/bin/env node`）が、このリポジトリの Windows 環境（`core.autocrlf=true`）の CRLF 改行と組み合わさると、Vite/Vitest の SSR モジュール変換パイプラインで `SyntaxError: Invalid or unexpected token` を起こす潜在バグを発見した。`node --check` や `esbuild` 単体 CLI では再現せず、vitest 経由でこのファイルを `import` した時のみ発生する。このファイルを import するテストがこれまで一つも存在しなかった（`tests/*patch-aihints*` は本作業で初めて新設）ため未発見だったもの。実行は常に `node tools/patch-aihints.mjs ...` 形式のため shebang 行は不要と判断し削除した（`tools/` 内の他ファイルで shebang を使っているのは `tools/extract-enum-lists-to-dictionaries.mjs` のみで、今回はスコープ外のため変更していない）。

### ドキュメント

- **`.github/prompts/aihints-fill.prompt.md`**: 「TailsUnit 変換早見表」を旧 JP 自由文字列変換表から、新しい構造化フィールド（`TailShapeType`/`Count`/`Segment`/`Branches`/`LayoutDirection`、`$EnumDef_TailShapeType`/`$EnumDef_Laterality` 解決）の読み方説明に全面差し替え。
- **`docs/ai-hints-usage.md`**: `parseTailsUnit(TailsUnit)` の署名変更（`varsDef` 引数追加）の注記、`--apply-appearancedetail` モードの `TailsUnit` 除外ルールの補足を追加。
- **`CHANGELOG.md`**: 本変更を追記。

### テスト

- **`tests/patch-aihints.tailsunit.test.js`（新規）**: `parseTailsUnit`/`buildTailDescription`/`buildTailBundleDescription` を、実データ（`db_Primary.json` Num:1 相当の単純形状、`db_SelfSecondary.json` Num:148 相当の分岐+方向）を模した最小フィクスチャで検証。`buildAihintsFromIdentityMotif` の `isStructuralOverride` 正規表現との整合性、null/旧形式/未知キーの穏当な劣化も確認。

## 影響範囲（編集したファイル）

- `tools/patch-aihints.mjs`
- `.github/prompts/aihints-fill.prompt.md`
- `docs/ai-hints-usage.md`
- `tests/patch-aihints.tailsunit.test.js`（新規）
- `CHANGELOG.md`

変更不要と確認済み（内部形状に依存しない汎用実装）: `docs/aihints-spec.md`、`pkg/cloudflare/schema/d1-aihints.sql`、`pkg/cloudflare/scripts/migrate-aihints.mjs`、`.github/workflows/cf-api-sync.yml`、`tests/aihints.schema.test.js`。

## 検証

1. `npm test`: 207件全成功（24ファイル）。
2. dry-run スモークテスト（`--suggest`/`--fill-todos`/`--apply-identitymotif`/`--apply-appearancedetail`）を NumberTales Primary 全105件に対して実行し、例外・`[object Object]` ゴミ・`error`/`exception` ログなしを確認。
3. Num:12（`Branches` 2要素・`AIHints` 既存）に対し `--suggest --force --apply` → `git diff` で生成内容を目視確認（`fox ears` / `branching fox 2 tails` / `exactly 2 tails total: Upper: 1 tails x2 clusters, Lower: 1 tails x1 clusters, no more no less` 等、TODO なしで具体的に生成されていることを確認）→ `git checkout --` で revert。
4. 同じ Num:12 に対し `--fill-todos --apply` を2回連続実行し、1回目で `todos-filled=1`（バンドル文が1件追加）、2回目で `todos-unchanged=1`（重複追加なし）となることを確認（冪等性ガード修正の検証）→ `git checkout --` で revert。

## 未完了タスク

なし。本作業で計画した範囲は全て完了。

## 補足

- 耳タグの対象形状限定（Fox/Cat/Nekomata/Dog のみ）は暫定対応。「耳」概念の正式な切り分けは `develop` 側の DB/スキーマ調整を待つ（User 指示）。
- `AI_Optout: true` の DB への `--apply` は本ツール側の既存ガードでブロックされる仕様（今回変更していない）。
