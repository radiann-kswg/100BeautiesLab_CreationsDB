# #67　AIHints の共通識別タグと瞳の補完

## 対象と検証結果

CreationsAI の `68a873a`（DB `09b475e4`）から、Issue と同じ `released` かつ AI 利用可の120件を抽出した。原本の照合先は `addon-ai-tag@d9d0ce96`。調査・候補の検証は main で実施した。[Issue #67](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/67)・[公開時のビルド記録](https://github.com/radiann-kswg/100BeautiesLab_CreationsAI/blob/68a873a/ai-dataset/build-info.json)

| 項目 | 結果 |
| --- | --- |
| 原典に AIHints があり、共通識別タグが3個未満 | 10件。1個は48・バイナ（実キー `2-alt`）・`000`。2個は13・20・26・30・39・42・55。Issue の表に加えて26・42・55が該当した。 |
| `AppearanceDetail` に瞳の項目がない | 報告の21件すべてで再現。223・753は髪の項目もない。 |
| 原典に AIHints がない | 報告の7件すべてで再現。`0`・`00`・80・333には外見の構造化データがある。`216-cub`（表示上の216KZ）・SelfSecondary の148・216は未入力。 |

## 共通化できる記述

NumberTales の typedef が宣言する2形態について、`Formation` 以外の**全フィールド**を比較した。42の瞳、48・バイナ・`000` の髪と瞳は両形態で一致する（計7組）。この7組を `Formation: null` の1行ずつにまとめたメモリ上のデータで既存の構造再同期を実行し、4件とも共通タグが3個になることを確認した。これらは Issue の案(a)と既存の再同期処理で対応できる。[外見の正典](../docs/schema-meta-processing.md)・[AIHints の構造再同期](../docs/ai-hints-usage.md)

35の髪は英語が一致する一方、日本語はコアフォルダ形態が「黄褐色」、ヒューマノイド形態が「オレンジ色」。96の瞳はヒューマノイド形態にマスク着用時の条件がある。どちらも共通化の対象外とした。35の英訳の採否は作者確認事項。

## 設定画からの候補

21件すべてで、当該レコードの公式設定画が公開 manifest の `images.concept` と現在の画像許可表に載り、実ファイルが存在することを確認。人型とコアフォルダ形態の両方を見て、瞳21項目と髪2項目の候補を作成した。`patchAppearanceDetails` の dry-run で、全21レコードについて元値・スキーマ・画像参照・AI除外を検証済み。画像に描かれていない瞳の構造、左右差、HEX値は候補に含めていない。[入力と根拠の仕様](../docs/appearance-detail-tools.md)

- 対象は Primary の1・12・13・16・17・18・20・23・26・27・28・29・30・32・33・36・39・40・51、SelfSecondary の223・753。髪は223・753。
- 1・32・223・753は虹彩に複数の色が見える。16・17・27・29・33のような低彩度の色は、日英の色名を候補として扱う。55は既に瞳の記述があり、3個目の識別タグは別の根拠から選ぶ。
- ローカル候補は `.cache/issue67-appearance-candidates.json`。各候補に作品内の画像キー、値、観察の根拠を収録した。

## 新規 AIHints の試算と残作業

`0`・`00`・80・333を個別に指定し、既存 CLI の scaffold、外見からの再構築、構造再同期をメモリ上で実施した。4件で **796行追加**。80は共通タグ4個、`0` と `00` は各6個、333は10個。加えて `0`・`00` の年齢欄と333のコアフォルダ形態の説明に TODO が残る。この出力は検証用で、完成データとしては採用していない。

## 外見原本への反映

作者の実行了承後、main の `develop` で NumberTales の `db_Primary.json` と `db_SelfSecondary.json` に瞳21件・髪2件を追記し、形態だけが異なる7組を共通化した。フィールド順検査は全1,465レコードで差分0、Vitest は1,528件すべて成功した。AIHints の入力と下流 manifest の再集計は `addon-ai-tag` 側で行う。

## AIHints と公開後の検証

- 外見原本は `develop@8a5b2ad7`、AIHints は `addon-ai-tag@388d9a8e` に反映。対象は Primary 27件、SemiPrimary 1件、SelfSecondary 2件。バイナの共通タグには種族・銀灰色の長髪・琥珀がかった橙色の瞳がそろった。
- `tools/patch-aihints.mjs` は共通候補が少ないときに形と本数が分かる尾を使い、候補が5個を超えるときは素体を優先する。223の尾はサソリ型2本とキツネ型3本の両方を反映。0・00は原本が人型のためヒューマノイド形態を使用し、外見年齢は空欄。333のコアフォルダ形態の番号位置も未確定のため自然文を空欄とした。仕様とテストは `docs/ai-hints-usage.md`、`tests/patch-aihints.{resync,gates}.test.js` に反映した。
- 対象30件すべてで共通タグは3〜5個。構造再同期の2回目は全件差分なし。main で変更した3つのDBを照合し、既存の人手による自然文・衣装記述・参照画像と、対象外レコードの値が維持されたことを確認した。
- 自動再同期後の `addon-ai-tag@d6ca65e8` を sub1 に取り込み、同じ公開コミットの隔離コピーを lockfile 指定の Vitest 5.1.0 で検証した。全1,848テスト（99ファイル）が成功した。
- 公開 manifest の対象120件を元の調査と照合した。原典 AIHints は113→117件、原典の共通タグが3個未満は10→0件、下流導出のみは7→3件。対象全員の画像とAI利用可否も一致した。従前から共通タグが6個以上の対象外12件は今回の不足件数に含めていない。[公開ビルド記録](https://github.com/radiann-kswg/100BeautiesLab_CreationsAI/blob/7dbd5997e0b2316afe9722563037013b286fbb0f/ai-dataset/build-info.json)
- 残る SemiPrimary の `216-cub`、SelfSecondary の148・216は外見原本の入力後に再評価する。画像生成による再現性評価は今回の検証外。
