# 進捗レポート: 二次創作 DB への ColorPalette 追加とチップ検出の修正 (2026-08-10)

## 目的

`data/Works_NumberTales/DataBases/db_Secondary.json` の「ナンバーテールズ化企画」レコードへ、
設定画（`concept` 画像）に描き込まれたカラーチップから `ColorPalette` を追加する。

## 背景・課題

既存の `tools/patch-colorpalette.mjs` を `--work NumberTales --db Secondary` で回したところ、
ナンバーテールズ化企画絵 **26 件すべてが 0〜1 チップ**で検出に失敗した（`Primary` では 94/105 成功）。

設定画の作りが `Primary` と違うことが原因だった。企画参加者の絵には
「thank you for reaction!」のような**手描きメッセージがカラーチップと同じ色で大きく**書き込まれている。

| 段階 | 失敗の内容 |
| ---- | ---------- |
| 第1段（領域特定） | ストロークが `strict` 判定を通り、文字の方が数も広がりも大きいためパレット領域を見失う |
| クラスタ選定 | 手描き文字の**閉じた字画**（"o" / "a" の丸）がチップ列と融合し「9 個以上」で棄却される |
| 代表色の決定 | 連結成分の色を**起点ピクセル**で決めており、チップ上端のアンチエイリアス縁の色が登録される |

## 変更点の要約

### `tools/extract-palette.mjs`

1. **領域特定を円形成分に限定** — 第1段のクラスタリング候補を `strict && round` に絞った。
   チップは必ずべた塗りの円、手描きストロークは `fill` が低く歪むため、これで文字が落ちる。
2. **近接しきい値の段階的な絞り込み** — クラスタリングを `pickSwatchCluster()` へ切り出し、
   `7 → 5 → 3.5` と狭めながら最初に成立した分割を採る。第2段は `refineChips()` へ切り出した。
3. **成分の代表色を最頻色へ** — `rescanPaletteRegion()` の `hex` を起点ピクセルから最頻色に変更。

### `data/Works_NumberTales/DataBases/db_Secondary.json`

- 新規 26 件へ `ColorPalette` を挿入（`AppearanceDetail` の直後 = `$DefType` のフィールド順）。
- 既存 4 件（227RZ / 387RZ / 411RZ / 625RZ）を画像基準で再生成（**User 判断**）。
- 結果、ナンバーテールズ化企画 **31 件すべて**が `ColorPalette` を持つ状態になった。

## 影響範囲（編集したファイル）

- `tools/extract-palette.mjs`
- `data/Works_NumberTales/DataBases/db_Secondary.json`
- `CHANGELOG.md`

## 検証

| 観点 | 結果 |
| ---- | ---- |
| `npm test` | **67 files / 1181 件すべて成功**（`tests/patch-colorpalette.test.js` 21 件を含む） |
| `npm run data:order:check` | 0/1315 レコード（キー順のズレなし） |
| `Primary --all --force` の dry-run 差分 | 退行なし。Num 40 が新規に自動検出できるようになった |
| 代表色の妥当性 | 画素数で裏取り（Num 8: 塗り `#FFA3A2` 22,375px / 旧登録値 `#FFA9A8` 374px、Num 19: 塗り `#874545` 33,918px / 旧 `#854F50` 253px、263RZ: 塗り `#FFCEED` 30,206px / 旧 `#FFD7F0` 1,481px） |
| `npx prettier --write` | 変更なし（挿入時点で整形済み） |

## 未完了タスク

- **`0xFF`（ヘキサデミカル・テールズ）**: 設定画にカラーチップが無く未検出のまま。手入力（`--chips`）が必要。
- **`Primary` の 26 レコードが縁色のまま**: 今回 `--force` を使っていないため既存値を温存した。
  最頻色の修正を反映するには `--all --force --apply` の再実行が要る（**User 判断待ち**）。
  対象と新旧の差は `.cache/primary-before.txt` と `.cache/primary-after3.txt` の diff で確認できる。
- **`387RZ` の黒 `#010101` が落ちた**: 再生成の副作用。User が許容済みだが、必要なら手で戻す。
- **`ColorName_JP` / `ColorName_EN` / `Formation` / `Note_*`**: 創作内容のためすべて `null`。User が記入する。

## 参考リンク

- 前回の設計: `_work_in_progress/2026-07-13_progress_colorpalette-schema.md`
- スキーマ: `data/db_type.json`（`$DefType[hashTag=ColorPalette]`） / `data/db_meta.json`（`$Def_ColorPalette` / `$EnumDef_ColorRole`）
- ツール: `tools/extract-palette.mjs` / `tools/patch-colorpalette.mjs`
