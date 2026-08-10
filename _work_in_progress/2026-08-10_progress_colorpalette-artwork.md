# 進捗レポート: 透過キャラクター単体イラストからの配色検出 (2026-08-10)

## 目的

設定画のカラーチップが無いレコードでも `ColorPalette` を取り込めるよう、**背景を透過した
キャラクター単体イラスト**（コアフォルダ / キーキャッパー / 衰弱形態）からの配色検出を実装する。
あわせて「どの画像を配色検出の入力にするか」を typedef で宣言できるようにする。

同日の `_work_in_progress/2026-08-10_progress_colorpalette-secondary.md`（チップ検出の修正）の続き。

## 設計の根拠（実測）

チップ由来 `ColorPalette` を持つ NumberTales Primary **89 件**を正解として照合しながら決めた。

| 判断                                                | 根拠                                                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 完全一致の色ヒストグラムを使う（median-cut は不可） | べた塗りなので作者の使用色がそのまま取れる。Num 1 は抽出 4 色すべてチップと**距離 0**                |
| `buildForegroundMask()` を使わない                  | 紙面付き設定画向けの処理で、透過画像では**白い塗りを紙面と誤判定して落とす**                         |
| 純黒（`v < 0.08 && s < 0.5`）を除外                 | 輪郭線。面積 5〜9% を占めるが配色ではない                                                            |
| 共通造形色を除外                                    | コアフォルダの白は「肌色（毛）」という共通色。除外で一致率 **60.8% → 82.3%**、空になるレコード 0 件  |
| 面積比の下限 2%                                     | 下限なし 43% → 2% で 82%。平均 3.0 色残り、`Primary`/`Secondary`/`Accent` + `Sub` を埋められる       |
| アルファ 250 以上のみ採用                           | 128 だと半透明の縁が混じる                                                                           |
| 検出対象を typedef 宣言で絞る                       | 衣装差分（`designAlt`）等が混ざると 80.1% に落ちる。宣言で 82.3% を維持し、実行時間も 15 秒 → 3.4 秒 |

共通色の出典は `data/Works_NumberTales/Images/General/catalog/chr-dsgn_NTsCatalog-Summary.png` の
「Common Colors & Color Codes」（User の示唆による）。ハンカクライブ分は User 提供。

## 変更点の要約

### 新しいスキーマ宣言

- **`$palette`（作品別 `db_type.json` の `Images` 配下）**
  `{ "source": "swatch" }` = 設定画のチップ検出の入力 / `{ "source": "artwork" }` = 透過イラスト抽出の入力。
  `patch-colorpalette.mjs` の `SWATCH_SOURCES` ハードコードより優先される（宣言が無い作品ではフォールバック）。
  宣言済み: NumberTales（`concept` / `catalog` = swatch、`corefolder` = artwork）、
  UnibyteLive（`concept` = swatch、`keycapper` = artwork）、
  DestinyFoxRecords（`weakening` = artwork ※ **User が追加**）。
- **`$EnumDef_CommonColor`（作品別 `db_meta.json` の `General.$VarsDef`）**
  全キャラ共通の造形色。透過イラスト抽出から除外する。宣言が無い作品では除外しない。

### `tools/extract-palette.mjs`

- `extractSolidColors(images, opt)` — 透過素材からの配色抽出（複数枚を合算）
- `isTransparentArtwork(img, threshold)` — 透過率による素材判定
- `listImageFields(workDir)` — `db_type.json` から `Images` の子要素と `$palette.source` を列挙
- `readCommonColors(workDir)` — `$EnumDef_CommonColor` から HEX を読む

### `tools/patch-colorpalette.mjs`

- `--from-artwork`（オプトイン）/ `--min-ratio <n>`（既定 0.02）/ `--verify-artwork`（照合レポート・読み取り専用）
- `resolvePaletteImageFields()` — `$palette.source` から検出対象を解決（swatch / artwork 共通）
- `resolveArtworkSources()` / `detectArtworkColorsForRecord()` — 拡張子込み（`keycapper`）/ なし（`corefolder`）の両パスを吸収
- `upsertColorPaletteInRecord()` — `AppearanceDetail` が無いレコードは末尾へ追記（`appended`）
- `recordLabel()` — `Num` を持たない作品（`Letter` / `Unit` / `Generation`）でも読める進捗表示

## 適用結果（10 件）

| 作品 / DB                   | レコード        | 経路      | 色数      |
| --------------------------- | --------------- | --------- | --------- |
| NumberTales / Primary       | `10-alt`        | artwork   | 6         |
| NumberTales / SemiPrimary   | `100`           | artwork   | 2         |
| NumberTales / SemiPrimary   | `222`           | **chips** | 7         |
| UnibyteLive / Primary       | `I` / `S` / `Z` | artwork   | 4 / 4 / 5 |
| DestinyFoxRecords / Primary | `m`             | **chips** | 6         |
| DestinyFoxRecords / Primary | `-(normal)`     | artwork   | 8         |
| DestinyFoxRecords / Proxy   | `2` / `3`       | artwork   | 6 / 5     |

`222` と DestinyFoxRecords の `m` は設定画にチップがあったためチップ経路で入った（作者指定を優先）。

## 影響範囲（編集したファイル）

- `tools/extract-palette.mjs` / `tools/patch-colorpalette.mjs` / `tests/patch-colorpalette.test.js`
- `data/Works_NumberTales/DataBases/db_type.json` / `db_meta.json`
- `data/Works_UnibyteLive/DataBases/db_type.json` / `db_meta.json`
- `data/Works_NumberTales/DataBases/db_Primary.json` / `db_SemiPrimary.json`
- `data/Works_UnibyteLive/DataBases/db_Primary.json`
- `data/Works_DestinyFoxRecords/DataBases/db_Primary.json` / `db_Proxy.json`
- `CHANGELOG.md`

## 検証

| 観点                                      | 結果                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| `npm test`                                | **67 files / 1204 件すべて成功**（`patch-colorpalette.test.js` は 21 → 44 件） |
| `npm run data:order:check`                | 0/1315 レコード（`appended` 3 件は `data:order:write` で正準位置へ整列済み）   |
| `--verify-artwork`（NumberTales Primary） | 89 件 / 271 色中 223 色が一致（**82.3%**）                                     |
| 既存パレットの不変性                      | `--force` 未使用。削除された `Hex` 行 **0 件**を `git diff` で確認             |
| 回帰テスト                                | チップ由来パレットを正解として一致率 75% 未満で失敗する仕組みを追加            |

## 未完了タスク / User 判断待ち

- **DestinyFoxRecords の共通造形色が未宣言**: `#FFFFFF` が配色に入っている（`-(normal)` で 5%、`Proxy` の `3` で 19%）。
  共通色があれば `data/Works_DestinyFoxRecords/DataBases/db_meta.json` の `General.$VarsDef` へ
  `$EnumDef_CommonColor` を足し、`--from-artwork --force` で再生成すれば除外できる。
- **`_DBCrossLinkPath` 形式の画像参照は未対応**: DestinyFoxRecords `Primary` の「ラジアン」は
  `weakening_PNGPath` が `{ "_DBCrossLinkPath": { "_DB": "Proxy", "_IsoPath": "..." } }` という
  別 DB 参照形式で、文字列ではないため抽出対象から外れている（安全側にスキップ）。
  対応するなら参照解決を挟む必要がある。
- **ハンカクライブの `$EnumDef_CommonColor` の英語ラベル**: `CommonColor_EN` は `null` のまま（User 記入）。
- **`ColorName_JP` / `ColorName_EN` / `Formation` / `Note_*`**: 創作内容のため全レコードで `null`。
- **`Primary` の 26 レコードが縁色のまま**（前レポートからの持ち越し）: 同日の最頻色修正を反映するには
  `--all --force --apply` の再実行が要る。

## 参考リンク

- 前段: `_work_in_progress/2026-08-10_progress_colorpalette-secondary.md`
- 設計の元: `_work_in_progress/2026-07-13_progress_colorpalette-schema.md`
- 共通色の出典: `data/Works_NumberTales/Images/General/catalog/chr-dsgn_NTsCatalog-Summary.png`
