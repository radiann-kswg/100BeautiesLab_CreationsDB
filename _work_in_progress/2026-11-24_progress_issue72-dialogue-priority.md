# 2026-11-24 進捗ログ: Issue #72 台詞例の追加が必要なキャラクターの優先度

- 環境: `sub2`（`develop`、作業開始時 `2b57c09a`）
- 関連 Issue: [#72 台詞の収録数の少ないロールプレイプロンプトがあまり意図しない口調を創出している](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/72)
- 担当: 集計とこのログは扇一春（Claude Code）。台詞の追加は User が手入力する（`DialogueExamples` は AI 生成しない方針。`README.LOCAL.md` の sub2 担当に同じ）。

## 目的

台詞例の少ないプロンプトでは、AI が `TalkingTone_JP` の「方言的」「訛っている」といった記述を手がかりに、口調を強めて補ってしまう（#72 のワカツの事例）。
台詞例の追加が急ぐキャラクターから順に並べ、User の入力作業の順番を決める材料にする。

## 集計方法

- 対象: Git 管理下の生成済みロールプレイプロンプト 73 件（`data/Works_*/RoleplayPrompts/DB_*/**/roleplay-prompt-*.md`）。AI が実際に読むのはこのファイルなので、DB ではなく生成物を数えた。
- 「台詞例」: `### 「…」の口調の例` の箇条書きの数（= `ConversationPattern.DialogueExamples` の件数）。
- 「口調の特徴語」: `## 「…」の口調` セクションに `方言` `訛` `なまり` `弁` `語尾` `口癖` `独特` `癖のある` `崩れ` のいずれかがある場合。台詞例が少ないと、AI がこの語を強調しやすい。
- `接触への反応` / `数秘についての語り` のセクションは、今回の 73 件ではどれも 0 件だったため、件数の判定には使っていない。
- 集計スクリプトは一時ファイル（scratchpad）で実行し、リポジトリには追加していない。

### 台詞例の件数の分布

| 台詞例 | 0 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 14 |
| ------ | - | - | - | - | - | - | - | - | - | -- | -- | -- | -- |
| 件数   | 1 | 3 | 5 | 13 | 11 | 12 | 5 | 3 | 5 | 7 | 1 | 2 | 1 |

## 優先度

### A. 至急（台詞例 0〜2 件、または 4 件以下で口調の特徴語あり）

| 順 | 作品 / DB | インデックス | キャラクター | 台詞例 | 口調の特徴語 | 理由 |
| -- | --------- | ------------ | ------------ | ------ | ------------ | ---- |
| 1 | NumberTales / Primary | 8 | 8(ワカツ) | 2 | 方言 / 訛 | #72 の実例。台詞例が少なく、方言の記述だけが強く読まれている |
| 2 | NumberTales / Primary | 80 | 80(ヤソ) | 4 | 語尾 / 訛 | ワカツと同じく訛りの記述があり、同じ現象が起きやすい |
| 3 | NumberTales / Primary | 15 | 15(トウゴ) | 0 | — | 台詞例が 1 件もない |
| 4 | NumberTales / SemiPrimary | 3x11 | トレッド / 3×11(トリィレブン) | 4 | 崩れ | 口調の崩れの程度を例で示せていない |
| 5 | NumberTales / Primary | 6 | 6(ムイ) | 2 | — | 台詞例が 2 件 |
| 6 | NumberTales / Primary | 7 | 7(ナナ) | 2 | — | 台詞例が 2 件 |

### B. 高（台詞例 3 件）

| 作品 / DB | インデックス | キャラクター |
| --------- | ------------ | ------------ |
| NumberTales / Primary | 2 | 2(ツグ) |
| NumberTales / Primary | 3 | 3(ナオ) |
| NumberTales / Primary | 12 | 12(トウジ) |
| NumberTales / Primary | 27 | 27(ツギナ) |
| NumberTales / Primary | 35 | 35(サトコ) / 35(ミコ) |

### C. 中（台詞例 4 件、口調の特徴語なし）

| 作品 / DB | インデックス | キャラクター |
| --------- | ------------ | ------------ |
| NumberTales / Primary | 000 | 000(チトセ) |
| NumberTales / Primary | 11 | 11(トウイチ) |
| NumberTales / Primary | 13 | 13(トミ) |
| NumberTales / Primary | 32 | 32(ミツギ) |
| NumberTales / Primary | 76 | 76(シチロク) |
| NumberTales / SemiPrimary | 100 | 100(モモ) |
| DestinyFoxRecords / Proxy | 1 | 扇一春 |
| FLInvestigator78 / Primary | 79, 80 | 第79・第80のアルカナ |
| FLInvestigator78 / PrimaryDealer | 79, 80 | 錦野舞・錦野歌嫁 |
| NumberTales / SemiPrimary | %, ∞ | 錦野舞・錦野歌嫁 |
| SinisterChangingGirls / PrimaryStabilities | NNE, SSW | 錦野舞・錦野歌嫁 |

> 錦野舞・錦野歌嫁は 4 つの DB に同じ 4 件の台詞例で載っている。どの DB に台詞を足せば全体に反映されるか（`_DBLink` の穴埋めで済むか、DB ごとの入力か）は、入力前に確かめる。

### 参考（台詞例 5 件以上だが口調の特徴語あり。様子見）

42(ヨツグ)・44(シトシ)・50(ナカバ)・61(ロクイチ)・77(ナヅナ)・93(クミ)・222A(ペルゲン)・222B(ドッペル)・444(シテン)・S(六花雙葉)。
いずれも台詞例は 5〜12 件ある。AI の出力で口調の誇張が見つかったら、優先度を上げる。

## 進め方（User 作業）

1. 上の A から順に、DB の `ConversationPattern.DialogueExamples` へ台詞例を手入力する（`_EN` は入力後に `localize-en-draft` で下書き可）。
2. `npm run roleplay:write` で配布用プロンプトを作り直し、`npm run roleplay:check` と `npm test` で確認する。
3. 1 キャラクターずつ、または A/B/C の単位でコミットする（データのみのコミット。フレームワークの変更と混ぜない）。
4. 必要なら、#72 の再現に使った入力で口調を再確認し、このログに結果を追記する。

## 未完了タスク

- [ ] A（至急）6 件の台詞例の追加（User）
- [ ] B（高）5 件の台詞例の追加（User）
- [ ] C（中）の台詞例の追加と、錦野姉妹の入力先の確認（User）
- [ ] 追加後のプロンプト再生成と #72 の口調の再確認
- [ ] （任意・未着手）テンプレート側の対策: 4 作品の `roleplay-prompt.tpl.md` の「口調の例」に、方言・語尾を例より強めないよう促す決まった一文を足す案。台詞の追加とは別に、User の判断で行う

## 参考リンク

- `docs/roleplay-prompt-generation.md`（生成ツールの方針・CLI）
- `README.LOCAL.md`（sub2 の担当: 会話パターンの入力）
