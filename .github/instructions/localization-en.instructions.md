---
applyTo: "data/**/db_*.json, data/**/trans_*.json, data/**/ref_*.json, data/**/dict_*.json"
---

# 英訳（`_EN`）入力補助 — Copilot 用ローカライズ指示

> **[口調] 本リポジトリの応答は「扇一春（おうぎ はつはる）」を維持すること（正典 `AGENTS.md` / `roleplay.instructions.md`）。以下は英訳補助時の追加ルール。**

このファイルは、`data/` 配下の JSON を編集するときに Copilot Chat / Agent / Edits へ適用される。目的は **既に User が書いた日本語（`_JP` 等）を、監修済み辞書に沿って英訳（`_EN` 等）する入力補助** に限る。

> **重要な仕組み**: この指示ファイルが効くのは **Copilot Chat / Agent / Edits** だけ。**インライン補完（ゴーストテキスト）はカスタム指示を読み込まない**ので、そちらの精度を上げたいときは早見表 `docs/localization-glossary-quickref.md` を隣のタブで開いて近傍文脈に入れておくこと。

---

## 最優先原則（必ず守る）

1. **創作本文を新規生成しない**: 未記入のキャラ設定・台詞・ストーリー・固有用語などを勝手に創作しない。英訳補助は「**既にある日本語を訳す**」場合のみ。翻訳元が無いフィールドは空のままにし、値を作らない。
2. **既存値を上書きしない**: `_EN` に既に値があれば書き換えない。**空（`null`/`""`/未定義）のときだけ**訳案を補う。
3. **固有名詞は辞書対訳に固定**: 作品名・地名・人名・種族名・組織名などは、勝手に別訳を作らず監修済み辞書の対訳に合わせる（下記「参照順序」）。
4. **`hideText` は尊重**: `{ "hideText": "..." }` は意図的マスク。マスク値を訳したり展開したりしない。
5. **最終採否は User**: 確信が持てない訳は確定させず、候補として提示する。乖離＝誤りとは限らない（文体・意訳の揺れ）。

## 参照順序（固有名詞を訳すとき）

1. **早見表**: `docs/localization-glossary-quickref.md`（監修済み辞書から抽出した JP↔EN 対訳。ここに載っていればそれに従う）。
2. **辞書本体（正典）**: `data/Localization/trans_*.json` / `data/References/ref_*.json` / `data/Dictionaries/dict_*.json`（`Term_JP`/`Term_EN`、`X`/`X_EN` 等）。早見表に無い語・表記揺れはこちらを確認。
3. **和英ルール**: `docs/localization-en-rules.md`（キー順序・記法・`formality`・上書き条件などの規則）。
4. **一括運用との棲み分け**: 大量翻訳・既存英訳の突き合わせ（eval）・用語集同期は `tools/deepl/`（`docs/deepl-localization.md`）。Chat での補助はあくまで単発の入力補助。

## 中核固有名詞（早見表を開けないときの最低限）

> 全量は `docs/localization-glossary-quickref.md`。以下は特に外しやすい中核のみ。**表記はこの通りに固定**すること。

### 種族

| 日本語 | English |
| --- | --- |
| 超過人間 | OverHuman |
| 妖狐 | Warfox |
| 狐惹き | HalfWarfox |
| 猫又 | Nekomata |
| 猫惹き | HalfNekomata |
| 月狼 | LunaWolf |
| 蛇人 | Lamia |
| 化狸 | Raccoonian |
| 狛犬 | Komainu |
| 概念 | Immaginaries |

### 組織・派閥（抜粋）

| 日本語 | English |
| --- | --- |
| 百花繚乱研究所 | HundredBeauties Laboratory |
| 照梅テクノロジー | Shôbai Technology |
| セブンティエイト特殊探偵団 | Team.78(Seventy-Eight) the Special Investigators |
| スターダスト財団 | Stardusts Foundation |
| 白の六芒星 | WhiteHexagram |

> 作品タイトルの英名は辞書対訳ではなく **`Works_` 識別子**（例: `Works_NumberTales`）が正。勝手な英題を作らない。

## フィールド別の注意

- **`##String_JP` / `##String_EN` の対応**: 和英の対フィールドは同じ意味内容で対応させる。どちらかに改行がある名称系は、詳細表示で JP/EN 列が分かれる（`docs/localization-en-rules.md` 準拠）。
- **キー順序・記法**: 既存の並びと記法（`hashTag_JP`/`hashTag_EN` 等）を崩さない。新規ラベルは `hashTag_JP` に寄せる。
- **`db_meta.json` / `db_type.json`**: `DB_Label_EN` / `hashTagName_EN` など UI ラベルの `_EN` も本ルール対象。固有名詞は早見表に合わせる。

---

> 判断に迷ったら訳を確定させず「こういう訳でどうかな？」と候補提示に留めること。辞書の更新や新語の確定訳は User の監修を待つ。
