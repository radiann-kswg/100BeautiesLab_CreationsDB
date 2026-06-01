# 作業進捗: AI スキーマ作品別移動 + `--fix-refs` 実装

## 目的

1. `$Def_AI*` スキーマ定義を作品ごとに異なる形態構造に合わせて、グローバル `$VarsDef` から作品別 `$VersDef` へ移動する。
2. `$Def_AIReferenceImages` に concept-first 対応のフィールドを追加する。
3. `tools/patch-aihints.mjs` に `--fix-refs` フラグを追加し、既存 AIHints の `reference_images` のみを再構築できるようにする。

## 変更点の要約

### `data/db_type.json`

- `$VarsDef` から `$Def_AIColorPalette` / `$Def_AIReferenceImages` / `$Def_AIHintsCommon` / `$Def_AIFormVariant` / `$Def_AIHintsForms` / `$Def_AIHints` を削除
- グローバル `$DefType` 内の `AIHints` フィールド宣言（`"$type": "$Def_AIHints|#Null"`, `"$display": {"auto": false}`）は保持

### `data/Works_NumberTales/DataBases/db_type.json`

- `$VersDef` に上記 6 定義を追加（`$Def_Relations` の直後に挿入）
- `$Def_AIReferenceImages` に追加したフィールド:
  - `concept`: コンセプト画像URL（形態非依存 `concept/` ディレクトリ）
  - `corefolder`: コアフォルダ形態の代表参照画像URL
  - `humanoid`: ヒューマノイド形態の代表参照画像URL
  - `corefolder_arts`: コアフォルダ形態の追加アート画像URL集（`arts/corefolders/`）

### `tools/patch-aihints.mjs`

- `resolveImageInfo()` を拡張
  - `corefolderImages[]`: 全 corefolder 画像（先頭を `corefolderUrl` に設定）
  - `corefolderArtImages[]`: `arts/corefolders/` 系画像
  - `humanoidImages[]`: `arts/humanoids/` 系画像
- `buildFormReferenceImages(conceptUrl, formSpecificUrl, formKey, extraArts)` 新規追加
  - concept 画像がある場合: `main = conceptUrl`, `formKey = formSpecificUrl`
  - concept なし: `main = formSpecificUrl`（後方互換）
- `fixRefsInRecord(text, openIdx, closeIdx, imageInfo)` 新規追加
  - AIHints をディープコピーして `reference_images` のみ差し替え
  - `identity_tags` / `ai_tags` / `natural_language_description` 等は保持
- `patchFileText()` に `opts.fixRefs` 分岐を追加
  - AIHints なし: `skipped-no-aihints`
  - AIHints あり: `fixRefsInRecord()` 呼び出し → `refs-fixed`
- `PatchResult` typedef に `refs-fixed` / `skipped-no-aihints` を追加
- サマリ集計・表示を `--fix-refs` モード用に拡張
- `CliOptions` / `parseArgs()` / `printHelpAndExit()` に `--fix-refs` 追加（前セッションから継承）

## 影響範囲（編集したファイル）

| ファイル                                        | 変更内容                                |
| ----------------------------------------------- | --------------------------------------- |
| `data/db_type.json`                             | `$Def_AI*` 6 定義を `$VarsDef` から削除 |
| `data/Works_NumberTales/DataBases/db_type.json` | `$Def_AI*` 6 定義を `$VersDef` に追加   |
| `tools/patch-aihints.mjs`                       | `fixRefsInRecord` / `--fix-refs` 実装   |
| `CHANGELOG.md`                                  | 上記変更の履歴追記                      |

## 未完了タスク

- なし（今セッションの実装タスクは完了）

## 検証

- `node -e "JSON.parse(...)"` で `data/db_type.json` / `data/Works_NumberTales/DataBases/db_type.json` の JSON 構文確認 → OK
- `patch-aihints.mjs --records 1-5 --fix-refs -v` dry-run → 5件 `refs-fixed`
- `patch-aihints.mjs --records 41-43 --fix-refs -v` dry-run（AIHints なし）→ 3件 `skipped-no-aihints`
- `patch-aihints.mjs --records 41-43 --suggest -v` dry-run → 3件 `patched`
- `tests/data.sanity.test.js` / `tests/sw.enrich.basic.test.js` → 全件 pass

## 補足

- `data.shape.test.js` の 2 件の失敗（`BelongingArea` / `Works_NumberTales/References/db_type.json`）は今回の変更前から存在する既存失敗であり、今回の変更とは無関係。
- `--fix-refs` の `--apply` 実行は User が任意のタイミングで行う（dry-run で確認後に `--apply` 追加）。
