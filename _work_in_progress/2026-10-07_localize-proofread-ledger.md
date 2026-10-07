# ローカライズ校正 判断台帳（localize-proofread ledger）

> **役割**: `localize-proofread` が出した指摘のうち、User が判断すべきもの（`fix` / `suggest`）を 1 行 1 件で持ち越す Git 管理の台帳。
> レポート本体（`.cache/localize/proofread-report.md`）は Git 管轄外で再生成されるため、**判断の履歴はここだけに残る**。
> 恒常運用（DB・創作構想の更新とセット）の手順は `.agents/skills/localize-proofread/SKILL.md` の「恒常運用」節。
>
> - **判断** 列: `保留`（未判断）/ `採用`（反映する）/ `見送り`（直さない。理由を備考へ）/ `反映済`（コミット ID を備考へ）
> - 同じ場所・同じ趣旨の指摘は再実行時に**新しい行を足さず**、この行を更新する（`note` は台帳に載せない。再実行で再提示される）
> - 反映は `localize-en-draft` の挿入規則（`field_EN` は JP キー直後・`hideText` 尊重）で行い、`npm test` を通す

## 実行履歴

| 日付 | 対象 | 入力 | 結果 | 実行者 |
|---|---|---|---|---|
| 2026-10-07 | 全 `trans_*.json`（295 行・B/C）+ `References/ref_Region8.json` / `ref_Faction.json`（A/D）| DeepL eval 25 件（Works_NumberTales）| fix 15 / suggest 32 / note 41 | Claude Code（扇一春）/ `multi-localized` |

## 判断待ち（fix）

| ID | 場所 | レーン | 要旨 | 判断 | 備考 |
|---|---|---|---|---|---|
| G-01 / R-47 / R-48 | ref_Faction.json シンフォニー.XVI Summary_EN | B | 'Diversified Society' → 'the Diversification Society'、'Assignable Society' → 'the Demotable Society'（trans_Society 準拠） | 保留 | |
| R-03 | ref_Region8.json 九蓮国 BodyBlocks[1]_EN | A | `#REGION's` → `'#REGION.8''s`（界番号欠落） | 保留 | |
| R-04 | ref_Region8.json 九蓮国 BodyBlocks[1]_EN | A | 「その創作活動ともいえる国柄から」訳抜け・二重の伝聞構造の復元（文芸校正案あり） | 保留 | |
| R-08 | ref_Region8.json 龍天国 BodyBlocks[0]_EN | A | "eastern part '#REGION.8'" → "eastern part of '#REGION.8'" | 保留 | |
| R-09 | ref_Region8.json 龍天国 BodyBlocks[1]_EN | A | 「近年」訳抜け → "in recent years, …" | 保留 | |
| R-16 | ref_Region8.json 海陸国 BodyBlocks[2]_EN | A | 「こと運命線探偵」訳抜け → "…, a.k.a. the FateLine Investigators" | 保留 | |
| R-21 | ref_Region8.json 黒薔薇国 BodyBlocks[1]_EN | A | 先頭の半角スペース削除 | 保留 | |
| R-23 | ref_Region8.json 黒薔薇国 BodyBlocks[3]_EN | A | 'WCP.IV' → 'WDC.IV'（データ全体で WCP はこの 1 件） | 保留 | |
| R-36 | ref_Region8.json 暁美諸国 BodyBlocks[1]_EN | A | 恩恵を受ける主語が入れ替わっている（九蓮国が主語）。"contents" → content。伝聞「だとか」 | 保留 | |
| R-37 | ref_Region8.json 暁美諸国 BodyBlocks[2]_EN | A | WDE.VII / WDE.VI → WDCE.VII / WDCE.VI（創世期コード） | 保留 | |
| R-40 | ref_Faction.json レゾンデイトルカンパニー Summary_EN | A | "for world destruction"（目的が逆転）→ "in response to world destruction" | 保留 | |
| R-43 | ref_Faction.json シンフォニー.X Summary_EN | A | 閉じ引用符だけ残った `the Symphony.XVI(Sechzehn)'.` → `'Symphony.XVI(Sechzehn)'.` | 保留 | |
| R-44 | ref_Faction.json シンフォニー.X Summary_EN | A | 「冷戦的対立関係にある分化機関」が訳抜け（設計ノートの東西冷戦モチーフ） | 保留 | |

## 判断待ち（suggest）

| ID | 場所 | レーン | 要旨 | 判断 | 備考 |
|---|---|---|---|---|---|
| G-02 | SCG trans_Items | B | general-purpose IC component → general-purpose **logic** IC component | 保留 | |
| G-03 | ShauEr trans_Ability（+ db_Primary.json:52） | B | ChildCroning → ChildCloning？（Croning が意図的造語なら見送り） | 保留 | |
| G-11 | trans_ServiceInfra R-デイトル | C | R-detre → R-d'être、または現状維持 + Origin(fr / raison d'être) | 保留 | fr 由来の初候補 |
| G-15 | ShauEr trans_Phenomenon 山月病（+ 本文 30 箇所超） | C | Shanyu → Shanyue（拼音なら）。日本語読み由来なら Origin で明示 | 保留 | 直すなら一括置換 |
| G-31 / S-03 | Works_Summary_EN ほか | B | '100 Beauties Lab.' vs 'HundredBeauties Laboratory' の統一（辞書行追加） | 保留 | |
| S-01 / R-42 | ref_Faction.json シンフォニー.X / XVI Term_EN | B | "Symphony.X / Symphony.Zehn" → "Symphony.X(Zehn)"（dict_Faction と同形） | 保留 | Origin 採用なら Term_EN から読みを外せる |
| S-02 / R-38 | ref_Faction.json 夜月機関 Term_EN | B | "Yadzuki Organization"（辞書）vs "Yadzuki Orgs"（散文・rules §4-4）の正を決める | 保留 | |
| S-04 | data/Localization/db_type.json | — | `Term_JPReading` / `isSecondary` の宣言追加（実データにあり typedef に無い） | 保留 | スキーマ |
| E-01 | NT db_Primary Num 2 Summary_EN | A | "1(Unitta)" → '1(Unitta)'（§3-6 引用符）、"99ers" の揺れ | 保留 | |
| E-02 | NT db_Primary Num 6 Summary_EN | A | "9(Nina)" → '9(Nina)'、symmetrical → contrasting（対称的＝対照的） | 保留 | |
| E-03 | NT db_Primary Num 6 Summary_EN | D | Uni-Digits の括弧説明を削って 1 文に | 保留 | |
| R-02 / R-12 / R-18 | ref_Region8.json 全体 | D | `'#REGION.8'` 引用符・`'WDP.VIII'` 冠詞/引用符・Internic.Kingdom の冠詞をファイル内で統一 | 保留 | 表記ゆれ 3 件まとめ |
| R-05 / R-07 / R-10 / R-11 / R-15 / R-17 / R-25 / R-31 / R-35 / R-45 | ref_Region8 / ref_Faction 各 BodyBlocks・Summary | D | 直訳調・冗長・1 文過多の書き直し（文芸校正案はレポート本体） | 保留 | 10 件まとめ |
| R-14 / R-19 | ref_Region8.json 海陸国 / 英州諸国 BodyBlocks | A | JP/EN のブロック数を 1:1 に揃える | 保留 | |
| R-20 | ref_Region8.json 黒薔薇国 / 神皇国 Summary_EN | D | 末尾コロン構造が主題を誤読させる → 関係節に | 保留 | |
| R-24 / R-26 / R-27 / R-29 / R-32 / R-34 | ref_Region8.json 各 BodyBlocks | A | 圧縮・強調落ち・伝聞/推量落ち・訳抜け（主力エリアの） | 保留 | 6 件まとめ |

## 申し送り（対象外・JP 側）

- ref_Faction レゾンデイトルカンパニー Summary_JP の「聖職業課」は dict_RaisondetreCompany の「聖職課」と不一致（JP 表記ゆれ。`docs/jp-notation-rules.md` 側）。
- 公式サイト shouar-riders.com は旧綴り（DB は Shau'er / ShauErRiders）。
- `#List_OriginLang` は de / zh / la / fr の 4 言語で開始。ru（Mikhail）など必要になったら行を足す。
