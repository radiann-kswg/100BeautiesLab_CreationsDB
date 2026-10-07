---
name: localize-proofread
description: 既存の英訳（`_EN`）・対訳辞書・キャラスト本文（`BodyBlocks` / `Dialogue` / `Summary` 系）を、JP 原文と作品コンセプトに照らして校正し、候補を `.cache/localize/proofread-report.md` に提示する。データは書き換えない。「英訳を校正して」「この訳おかしくない？」「造語・固有名詞・劇中スラングの英語版を見直して」「命名の由来（ラテン語・ドイツ語など）を精査して」「小説・サウンドノベル・ナレーションの英文を自然にして」のときに使う。空の `_EN` を埋めるのは `localize-en-draft`。
---

# localize-proofread — 創作ローカライズ校正（候補提示のみ）

`data/` 配下の既存英訳と対訳辞書、キャラスト本文を**校正**し、採否を User が決めるためのレポートを出す手順書。
`localize-en-draft`（空欄を埋める）の対になる Skill で、**こちらは一切データを書き換えない**。

> **このファイルはスキルの正典です。** `.claude/skills/` 側は `npm run agents:build` による生成物なので、
> 編集は必ずこちら（`.agents/skills/`）で行ってください。

## 前提・正典

- 和英ルール: [`docs/localization-en-rules.md`](../../../docs/localization-en-rules.md)（代名詞 §1、フィールド別 §3、作品別 §4、表記 §5）
- 日本語表記: [`docs/jp-notation-rules.md`](../../../docs/jp-notation-rules.md)（JP 原文側の揺れを見つけたときの照合先）
- 固有名詞: 早見表 [`docs/localization-glossary-quickref.md`](../../../docs/localization-glossary-quickref.md) → 辞書本体 `data/Localization/trans_*.json` / `data/References/ref_*.json` / `data/Dictionaries/dict_*.json`
- 作品コンセプト: `data/db_meta.json` → `CreationWorks["#Works_<Title>"]` の `Works_Summary_JP/EN` と `Works_OfficialLinks[].URL`（公式サイト）
- DeepL 併用: [`docs/deepl-localization.md`](../../../docs/deepl-localization.md) §3-3（`npm run deepl:eval`）

## 守ること

- **提案止まり**。`data/**` と `docs/**` は読むだけ。反映は User が手で行うか、User の明示指示で `localize-en-draft` の挿入規則（キー順序・`hideText` 尊重）に従って別途行う。
- **既存の文を直す**のが仕事。未記入の設定・台詞・用語・筋書きを新しく作らない。原文に無い内容を提案に足さない。
- **固有名詞は辞書が正**。辞書と食い違う `_EN` は辞書側に寄せる提案にし、辞書自体を直すべきと判断したときは「辞書修正案」として分けて書く。
- **公式サイトは参照のみ**。取得できない環境（Web 取得不可の Copilot 等）では User に該当ページの本文貼り付けを頼む。
- **判断が割れる箇所は候補を複数並べる**。最終採否は User。

## 校正の 4 レーン

| レーン | 見るもの | 主な観点 |
|---|---|---|
| **A. 対訳** | `field_JP` ↔ `field_EN` のペア、`Comments` ↔ `Comments_EN` | 誤訳・訳抜け・代名詞（§1）・呼称（§3-3）・口語のニュアンス落ち・フィールド別規則（§3） |
| **B. 用語** | 造語・固有名詞・慣用表現・劇中スラング | 辞書対訳との一致、作品内での一貫性、英語圏で誤読される語（既存語と衝突／意図しない含意） |
| **C. 命名由来** | ラテン語・ドイツ語・中国語・フランス語など他言語に由来する名前・用語（`Term_EN` / `Name_EN` / `Aliases` / `Term_JPReading` / 括弧グロス）と、辞書行の `Origin[]`（`$Def_TermOrigin`: `OriginLang` / `OriginTerm` / `OriginReading_JP` / `OriginNote_JP/EN`。`docs/localization-en-rules.md` §9） | 元言語での綴り・語形・性数の妥当性、ローマ字化（拼音は声調）の一貫性、由来と設定の整合。`Origin` が未記入の語は「`Origin` への記入候補」（言語コード・原綴り・読み）を別表で出す（値は既存データ由来のみ。User が記入する）。`Origin` に由来が明記済みの語は、標準綴りとの差を `note` で再提示しない。**言語サフィックスの新設（`_DE` 等）は提案しない**。由来言語が `#List_OriginLang`（`data/db_meta.json`）に無ければ行の追加を提案する |
| **D. 文芸** | `BodyBlocks(_JP/_EN)`、`#Dialogue` 型、`Summary_*`、`InStory_*`、User が貼った小説・サウンドノベル・ナレーション原稿 | 作品コンセプト（`Works_Summary` ＋公式サイト）との調和、地の文と台詞の声の分離、キャラの話し方（`ConversationPattern` / 呼称フィールド）との一致、英文としての自然さ（直訳調・冗長・時制揺れ） |

## 手順

1. **対象確定**: User の指示から `work`（例 `Works_NumberTales`）・DB/ファイル・フィールド・レーンを特定する。曖昧なら 1 回で確認する。完了条件: 対象レコード件数と対象レーンが言える。
2. **文脈読み込み**: `db_meta.json` の作品コンセプト、対象フィールドの §3/§4 規則、関係する辞書項目を読む。レーン D は公式サイト（取得可能なら）も読む。完了条件: 対象に登場する固有名詞が全て辞書で引けた（引けない語は B レーンの指摘候補）。
3. **DeepL 突き合わせ（任意）**: `DEEPL_API_KEY` がある環境では `npm run deepl:eval -- --work <work> --fields <f1,f2>` を先に回し、`.cache/deepl/eval-report.md` の乖離上位を A レーンの入力に使う。**乖離＝誤りではない**（文体・意訳の揺れが大半）。無い環境は省略する。
4. **校正**: 対象を 1 件ずつ読み、レーンごとに指摘を起こす。重さは 3 段階: `fix`（明確な誤り・規則違反）／`suggest`（より自然・一貫）／`note`（判断材料のみ）。完了条件: 対象レコード全件を見た（見送った件はその旨を書く）。
5. **レポート出力**: `.cache/localize/proofread-report.md` に次の形式で書く（`.cache/` は Git 管理外）。

   ```markdown
   # proofread-report — <work> / <対象> (<YYYY-MM-DD>)
   対象: N 件 / 指摘: fix a, suggest b, note c / DeepL eval: 使用 or 未使用

   | # | 場所 | レーン | 重さ | JP | 現EN | 提案 | 理由 |
   |---|------|--------|------|----|------|------|------|
   | 1 | db_Primary.json#8 Summary_EN | A | fix | … | … | … | §1: Neutral は ze/zir |

   ## 辞書修正案（あれば）
   | 辞書 | 項目 | 現行 | 提案 | 理由 |
   ```

   レーン D の長文は表に収めず、`## 文芸校正` 節に「原文 → 提案（差分が分かる最小単位）→ 理由」で書く。
   レーン C の `Origin` 記入候補は `## Origin への移し先候補` 節に「辞書 / 行 / OriginLang / OriginTerm / OriginReading_JP / 根拠」で書く。
6. **台帳追記**: `fix` / `suggest` を `_work_in_progress/2026-10-07_localize-proofread-ledger.md`（Git 管理）へ `判断: 保留` で転記する。同じ場所・同じ趣旨の行が既にあれば新しい行を足さず、その行の備考を更新する（`見送り` 済みの指摘は再提示しない）。`note` は台帳に載せない。
7. **報告**: 件数と `fix` の要点を User に伝え、採否を仰ぐ。反映を頼まれたら `localize-en-draft` の挿入規則に従い、反映後に `npm test` を通し、台帳の判断列を `反映済`（コミット ID）にする。

## 恒常運用（DB・創作構想の更新とセットで回す）

校正は一度きりの棚卸しではなく、**`data/**` の更新のたびに差分へ回す**。

- **トリガー**: 次のいずれかを含むコミット / PR / 作業単位
  - `data/**/db_*.json` の JP 本文（`Summary_JP` / `Character_JP` / `*_JP` / `Comments`）や `_EN` の追加・変更
  - `data/**/trans_*.json` / `ref_*.json` / `dict_*.json`（辞書・資料）の追加・変更
  - `data/db_meta.json` の `Works_Summary_JP/EN` / `Works_OfficialLinks`（作品コンセプト・公式サイト）の変更
- **対象の絞り方**: 全件ではなく差分。`git diff <base> -- data/` のハンクが触れたレコード・辞書行を手順 1 の対象にする（`<base>` は分岐元か前回の台帳の実行履歴にあるコミット）。差分が辞書行なら、その語を使っている本文（`grep` で `Term_EN` を引く）もレーン B の対象に含める。
- **レーン**: 本文の差分は A（+ D は `BodyBlocks` / `#Dialogue` / `Summary_*` のときだけ）。辞書の差分は B/C。`Works_Summary` や公式サイトの変更はその作品の D を再点検する。
- **出力**: レポートは毎回 `.cache/localize/proofread-report.md` を上書き（Git 管轄外）。判断の履歴は**台帳だけ**に残るので、手順 6 を省かない。台帳の「実行履歴」に日付・対象・ベースコミットを 1 行足す。
- **DeepL eval**: 本文の差分が多いとき（目安 20 件超）だけ `npm run deepl:eval -- --work <work> --fields <f1,f2>` を前段に回す。辞書だけの差分では回さない。
- **エージェント横断**: Claude Code / Copilot / Codex のどれで回しても同じ台帳へ追記する。台帳の ID 規則（`G-` 辞書 / `R-` References / `W-<Works_Code>-` 作品本文 / `E-` eval / `S-` スキーマ・辞書修正案）を守る。

## 他 Skill・ツールとの使い分け

| 状況 | 使うもの |
|---|---|
| `_EN` が空で、埋めたい | `localize-en-draft` ／ 大量なら `npm run deepl:draft` |
| `_EN` が既にあり、点検・改善したい | **本 Skill**（必要なら `npm run deepl:eval` を前段に） |
| 辞書を直した後の用語集同期 | `npm run deepl:sync-glossary` |
