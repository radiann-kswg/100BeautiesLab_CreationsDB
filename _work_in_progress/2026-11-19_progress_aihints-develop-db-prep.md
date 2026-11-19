# 2026-11-19 進捗: AIHints 拡張に合わせた `develop` 側の DB 整備

> ブランチ: `develop` / 作業環境: `main`（`README.LOCAL.md` の作業分担どおり。`sub1` には読み取りのみ）
> 対になるログ（`addon-ai-tag` / `sub1`）: `2026-11-19_progress_aihints-shauer-sinister.md`（`addon-ai-tag` ブランチにのみ存在）

## 目的

`sub1` / `addon-ai-tag` で進めている AIHints の獣爾騎兵・豹変系女子への拡張（`44805400` / `ef392ac4`）を受け、
AIHints の**導出元になる `develop` 側のデータ**を整える。AIHints 本体・`AI_Optout`・`tools/patch-aihints.mjs` は
ブランチ運用方針どおり `develop` へ持ち込んでいない。

## 変更点の要約

| # | 内容 | 理由 |
| --- | --- | --- |
| 1 | AIHints を載せる 5 DB へ prettier を適用（配列の折り返し 6 か所・畳み込み 2 か所。内容は不変） | `addon-ai-tag` だけ整形済みで、同じ行を `develop` で編集するとマージで衝突するため |
| 2 | 獣爾騎兵に形態辞書 `dict_Formation.json` を追加し、`Dictionaries/db_meta.json` へ `#Dict_Formation` を登録 | `AppearanceDetail.Formation`（`$dict: "Formation"`）に `beasted` を入力する受け皿が無かったため |
| 3 | ナンバーテールズ `0` の外見英訳 2 か所を修正 | `00` の英訳がコピーされたまま残り、JP・原画と食い違っていたため |

### 1. 整形

- 対象: 獣爾騎兵 `db_Primary.json` / 豹変系女子 `db_Primary.json`・`db_PrimaryStabilities.json` /
  ナンバーテールズ `db_Primary.json`・`db_SelfSecondary.json`。
- 整形後の `develop` と `addon-ai-tag`（`ef392ac4`）の差は、5 ファイルとも
  **AIHints ブロックの追加と、その直前キーの末尾カンマだけ**になった。
- `data/` にはほかに 26 件の未整形 JSON がある（辞書・`db_type.json`・`Works_StardustVsKaleidoscope` ほか）。
  AIHints を載せないため今回は触っていない。

### 2. 獣爾騎兵の形態辞書

| `Formation` | `Formation_JP` | `Formation_EN` |
| --- | --- | --- |
| `normal` | 通常時 | In normal form |
| `beasted` | 獣化時 | In beast form |

キーとラベルは、User が `addon-ai-tag` の `$Def_AIHintsForms` 用に指定したものをそのまま転記した（User 承認済み）。
豹変系女子と同じく「辞書ラベル = AIHints 形態ラベル」「`Formation` の値 = 形態キー」で揃う。
既存レコードの `Formation` はすべて `null` のままで、値の入力はしていない。

### 3. ナンバーテールズ `0` の外見英訳

| JP（変更なし） | 修正前 EN | 修正後 EN |
| --- | --- | --- |
| 赤い目 | green-brown eyes | red eyes |
| 淡い赤色の長いマフラー(端がストライプ模様) | long light teal scarf (ends with stripe pattern) | long light red scarf (ends with stripe pattern) |

修正前の 2 値は `00` の英訳と同一だった。設定原画（`cnsp_imgNTS-0.png`）でも赤い目・淡い赤のマフラーを確認し、
User の承認を得て修正した。豹変系女子 `N` は `AnotherRegions_DBLink` 経由でこの外見を継承するため、
`addon-ai-tag` 側の `N` の AIHints にも誤った色が入っている（`ef392ac4` の豹変系女子 `db_Primary.json` に 13 か所）。

## 影響範囲（編集ファイル）

- `data/Works_ShauErRiders/Dictionaries/{dict_Formation.json（新規）,db_meta.json}`
- `data/Works_ShauErRiders/DataBases/db_Primary.json`（整形のみ）
- `data/Works_SinisterChangingGirls/DataBases/{db_Primary.json,db_PrimaryStabilities.json}`（整形のみ）
- `data/Works_NumberTales/DataBases/db_Primary.json`（整形 1 か所 + 英訳 2 値）/ `db_SelfSecondary.json`（整形のみ）
- `CHANGELOG.md` / 本ログ / `2026-07-25_remaining-task.md`（索引）

フレームワーク（`lib/` / `pages/` / `tools/` / `tests/`）は変更していない。下流への波及は無い。

## 検証

| 項目 | 結果 |
| --- | --- |
| 整形前後の JSON 内容 | 5 ファイルとも一致（`JSON.parse` 後の比較）。改行コードは LF のまま |
| 形態辞書の読み込み | `pkg/nodejs` の `getWorkMeta('Works_ShauErRiders')` で `#List_Formation` に 2 行が合流 |
| `npm test` | 79 ファイル / 1448 件 成功 |
| `npm run data:order:check` | 0/1465 |

未実施: ブラウザでの表示確認（`Formation` に値を持つ獣爾騎兵のレコードがまだ無いため表示は変わらない）、
ロード時間の再計測（獣爾騎兵を開くときだけ辞書 1 ファイルの取得が増える）、本番 R2 / D1 同期。

## 未完了タスク

### `addon-ai-tag`（`sub1`）側で必要なこと

- [ ] `develop` をマージしたあと、豹変系女子 `N` の AIHints を作り直す。
      `green-brown eyes` / `light teal scarf` が豹変系女子 `db_Primary.json` から消えたことを確認する。
- [ ] ナンバーテールズ `0` / `00` は AIHints 未付与のまま（`sub1` のログの「既知の気づき」）。付与するなら修正後の英訳が使われる。

### データ入力待ち（User）

- [ ] 巳刻カミツの束縛形態の固有特徴。`AppearanceDetail` に `Formation: "beasted"` のエントリを入力できるようになった。

## 参考リンク

- 同日の `develop` 側ログ（外見・配色の整備）: [2026-11-19_progress_sar-scg-appearance-palette.md](./2026-11-19_progress_sar-scg-appearance-palette.md)
- 英訳ルール: [docs/localization-en-rules.md](../docs/localization-en-rules.md)
- 一時出力: `.cache/aihints-develop/`（Git 管理外）
