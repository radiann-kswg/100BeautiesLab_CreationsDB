# 2026-06-08 進捗ログ: AIHints corefolder 形態 vision-fill バッチ（NumberTales/DB_Primary）

## 目的

`Works_NumberTales/DataBases/db_Primary.json` の AIHints 保有レコードについて、前セッションで `--upgrade-schema` により投入された corefolder 形態のキャラ固有 TODO スロット（`silhouette_notes` / `immutable_constraints` / `negative_keywords` / 番号マーキング位置）を、`Images/DB_Primary/<Num>/corefolder/` 配下の参照画像を vision 解析しながら穴埋めする。

## 変更点の要約

- 整数 Num `#1`〜`#99` のうち 80 件、特殊番号 `2-alt` / `10-alt` / `000` の 3 件、合計 83 件のキャラ固有 corefolder スロットを vision 観察結果で穴埋め。
- `tools/patch-aihints.mjs` の `applyVisionResultsToAihints()` で `numberMarkingPlacement` の置換正規表現を 4 パターンに拡張（`flatMap` + `replacedOnce` フラグで「レコード内 1 件のみ置換」を保証）。
- CHANGELOG.md にバッチ実施・正規表現拡張・既知の小バグを追記。

## 影響範囲（編集したファイル）

- `data/Works_NumberTales/DataBases/db_Primary.json`: AIHints の `forms.corefolder.silhouette_notes` / `immutable_constraints` / `negative_keywords`、`common.immutable_traits` 内の番号マーキング記述を 83 件分更新。
- `tools/patch-aihints.mjs`: `applyVisionResultsToAihints()` の番号マーキング置換正規表現拡張（4 パターン）。
- `CHANGELOG.md`: 本セッションの追加項目を冒頭に追記。
- `_work_in_progress/README.md`: 進行中ファイル一覧を更新。
- `.cache/vision-results-batch-corefolder-*.json` × 17 + `.cache/vision-results-batch-corefolder-specials.json` + `.cache/vision-results.json`（88 entries）: gitignore 対象なので Git には残らない。

## バッチ実施一覧

| バッチ   | 対象 Num                   | 備考                                                                                                                                                                |
| -------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01       | #1-12                      | `#5` / `#8` は -1 画像にマーキング無し → 追加画像（`-2.png` / `concept/cnsp_img8.png` のサムネ）から `.cache/fill-marking-5-8.mjs` で手動補正                       |
| 02       | #13-17                     | `#15` はハーネスベルト裏のローマ数字 `XV` を手動補正、`#17` は髪留め `17`                                                                                           |
| 03       | #18-22                     | `#20` チャーム、`#22` 鈴チャーム                                                                                                                                    |
| 04       | #23-27                     | `#25` 隠し配置、`#27` ネームタグ                                                                                                                                    |
| 05       | #29-33                     | `#29` は標準どおりマーキング無し                                                                                                                                    |
| 06       | #34-37                     | `#37` ネクタイピン                                                                                                                                                  |
| 07       | #39-43                     | `#39` 幾何模様、`#40` モチーフのみ                                                                                                                                  |
| 08       | #44-48                     | `#46` 左胸                                                                                                                                                          |
| 09       | #49-53                     | `#50` スカーフ結び目                                                                                                                                                |
| 10       | #55-58                     | `#55` 分割、`#56` +漢数字、`#58` マーキング無し                                                                                                                     |
| 11       | #60-64                     | `#60` 印章スタイル、`#61` 衣装バリエ                                                                                                                                |
| 12       | #65-69                     | `#66` 分割                                                                                                                                                          |
| 13       | #71-75                     | `#71` かんざし、`#72` バーコード、`#73` ベレー帽パッチ                                                                                                              |
| 14       | #76-81                     | `#76` デュアル、`#78` モチーフのみ                                                                                                                                  |
| 15       | #84-88                     | `#85` マーキング無し、`#87` 微弱モチーフ、`#88` ピアノピン                                                                                                          |
| 16       | #89-94                     | `#92` マーキング無し                                                                                                                                                |
| 17       | #96-99                     | `#97` 十字+帽子、`#99` 漢字「九十九」                                                                                                                               |
| specials | `2-alt` / `10-alt` / `000` | `2-alt` は化学異性体プレフィックス風 `Bi 2 nor`、`10-alt` は保護ケース正面のローマ数字 `X`（本体は完全格納で本体マーキング不可視）、`000` はネコ耳 + 下線付き `000` |

## スキップしたレコード

- **corefolder 参照画像が未整備**: `#28` / `#51` / `#67` / `#70`
- **キャラデザインが保留中**: `#38` / `#54` / `#59` / `#79` / `#80` / `#82` / `#83` / `#90` / `#91` / `#95`

最終時点で残る TODO スロットは `#28`（要画像追加）のみ。

## 既知の小バグ（後続セッション課題）

- `--records` に `000` のような整数化できる string Num と他の特殊番号を同時指定すると、集計表示で `0` に丸められて vision-applied カウントが減ることがある。実体は `parseRecordSpec()` が string/number 両形を `Set` に追加しており、`000` 単独実行では正常に書き込めることを確認済み。集計ロジック / 表示の改修は後続セッションで対応予定。

## 検証

- AIHints 系テスト（`tests/aihints.schema.test.js` 等）は本変更後も pass を維持。
- `npm test` 全体結果: 16 files passed / 4 files failed（6 ケース）。失敗 6 件は `commons.secondaries` / `data.shape` / `enrich.dblink.jump.merge` / `pages.characters.ui-output` で、いずれも AIHints とは無関係な既存失敗。

## 運用ルール（再掲）

- 編集対象は `Works_NumberTales/DataBases/db_Primary.json` のみ。他 DB は `AI_Optout: true` により対象外。
- vision 観察は「視覚事実の記録」に留め、創作的な解釈・補完を加えない。
- 初期 corefolder -1 画像でマーキングを確認できない場合は、追加 corefolder 画像（`-2.png` / idol variants）や `concept/cnsp_img*.png` のサムネを必ず併せて確認する。

## 関連ドキュメント

- `CHANGELOG.md` 冒頭エントリ
- `docs/ai-hints-usage.md`（corefolder 形態節 / `--apply-vision-results` 節）
- `_work_in_progress/2026-06-08_progress_aihints-corefolder-enhancements.md`（前セッション: schema 追加 + structural default 投入）
- `_work_in_progress/2026-06-01_progress_aihints-vision-final-and-playbook.md`（前々セッション: 92 件 vision-fill のプレイブック）
