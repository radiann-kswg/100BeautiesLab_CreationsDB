# 進捗レポート: 配色検出コードの整備・リファクタリング (2026-08-10)

## 目的

同日中に 3 度拡張した配色検出コード（チップ検出の修正 → 透過イラスト抽出 → typedef 宣言駆動）に
溜まった負債を、**削除だけで**解消する。挙動は変えない。

前段: `2026-08-10_progress_colorpalette-secondary.md` / `2026-08-10_progress_colorpalette-artwork.md`

## 解消した負債

| 負債 | 対応 |
| ---- | ---- |
| 役目を終えた旧 CLI（`extract-palette.mjs` 内、約 500 行） | 削除。`extract-palette.mjs` を純粋なライブラリにした |
| 色語 → HSV 範囲テーブルが 2 ファイルに重複 | `COLOR_WORD_RANGES` を唯一の正にし、`colorWordMatchesHex()` を export |
| hex 間の RGB 距離が 4 箇所に重複 | `colorDistance(hexA, hexB)` へ一本化 |
| `parseRecordSpec` が両ファイルに重複 | 旧 CLI と一緒に消えて自動解消 |
| `insertColorPaletteIntoRecord` と `upsertColorPaletteInRecord` の二重実装 | 前者を削除（後者が置換・末尾追記にも対応した上位互換） |

### 旧 CLI を削除してよいと判断した根拠

- `package.json` の npm script に未登録（導線が無い）
- median-cut 推定は「複数色の平均＝実在しない中間色を作る」と同日の検証で判明済み。
  現在はチップ検出（作者指定色そのもの）と透過イラストの色ヒストグラムという、より正確な手段がある
- `.private/` への下書き出力は `patch-colorpalette.mjs` の dry-run で代替できる
- git 履歴から復元可能

### 意図的に残したもの

- **ピクセル走査ループ内のインライン RGB 距離計算（5 箇所）** — 数十万画素を回すため、
  関数呼び出しへ置き換える意味がない。`colorDistance()` の JSDoc にその旨を明記した
- **`SWATCH_SOURCES` フォールバック** — `$palette` 宣言は NumberTales / UnibyteLive /
  DestinyFoxRecords にしか無い。他作品は宣言が入るまでこの表で動く
- **`medianCut` / `buildForegroundMask`** — 前者は後者の背景色推定が、後者は
  `measurePaletteCoverage()` が使っている。CLI 専用ではない

## 影響範囲（編集したファイル）

- `tools/extract-palette.mjs`（1,746 → 1,248 行）
- `tools/patch-colorpalette.mjs`（866 → 823 行）
- `tests/extract-palette.test.js`（367 → 226 行。削除機能のテスト 12 件を除去）
- `CHANGELOG.md`

差分は **53 insertions / 735 deletions**。`data/` は 1 行も触っていない。

## 検証

**挙動不変の証明を最優先に置いた。**

| 観点 | 結果 |
| ---- | ---- |
| リファクタ前後の出力比較 | 3 コマンド（`--all --force -v` / `--verify-artwork -v` / UnibyteLive の `--from-artwork`）の **259 行が完全一致**（`diff` が空）。チップ経路・透過経路・Role 割当・照合精度 82.3% がすべて同一 |
| `npm test` | **67 files / 1192 件すべて成功**（削除した 12 件ぶん減） |
| `git diff --stat -- data/` | 変更なし |
| `import` の健全性 | `extract-palette.mjs` の export 19 個をすべて解決できることを確認 |

## 踏んだ落とし穴（記録）

**`tools/` に prettier をかけてはいけない。** 作業中に一度 `npx prettier --write tools/*.mjs` を実行したところ、
インデント（4 → 2 スペース）とクォート（シングル → ダブル）が全体で変わり、
**1,998 insertions / 2,191 deletions** の巨大差分になった。削除だけのはずの変更が埋もれてしまう。

`tools/normalize-field-order.mjs` / `tools/build-agent-instructions.mjs` も prettier 非準拠であり、
このリポジトリは `tools/` を prettier の対象にしていない（`data/` の JSON とは運用が違う）。
`git checkout -- <3 ファイル>` で index の状態へ戻し、prettier を挟まずに再実行した。

## 未完了タスク（前レポートからの持ち越し）

- **DestinyFoxRecords の共通造形色が未宣言**: `#FFFFFF` が配色に入っている
- **`_DBCrossLinkPath` 形式の画像参照は未対応**（DestinyFoxRecords `Primary` の「ラジアン」）
- **NumberTales `Primary` の 26 レコードが縁色のまま**: 最頻色修正を反映するには `--all --force --apply` の再実行が要る
- **`ColorName_*` / `Formation` / `Note_*`**: 創作内容のため全レコードで `null`
