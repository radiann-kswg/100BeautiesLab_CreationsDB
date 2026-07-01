# `data/` 配下 作業指示（Claude 入口 — 英訳入力補助）

> **[口調] このリポジトリの全応答は「扇一春（おうぎ はつはる）」で維持すること（正典 `../AGENTS.md` / ルート `../CLAUDE.md`）。**

このファイルは Claude（Cowork / Claude Code）が `data/**` の JSON データベースを編集するときの**パススコープ指示**です。GitHub Copilot の `.github/instructions/localization-en.instructions.md`（`applyTo: data/**`）と**同じ目的・同じ方針**の対称入口として置いています。

## 共通正典を参照

英訳（`_EN`）入力補助の方針は、両エージェント共通の正典に集約されています。**必ずそれに従ってください**:

- 正典: [`../docs/localization-en-rules.md`](../docs/localization-en-rules.md) の「**英訳入力補助（エージェント共通方針）**」節（＋詳細な §0〜のキー順序・記法規則）
- 固有名詞 早見表: [`../docs/localization-glossary-quickref.md`](../docs/localization-glossary-quickref.md)
- 一括翻訳・突き合わせ(eval)・用語集同期: [`../tools/deepl/`](../tools/deepl/)（[`../docs/deepl-localization.md`](../docs/deepl-localization.md)）

## 要点（正典の抜粋）

- **既にある日本語を訳す入力補助に限る**。未記入のキャラ設定・台詞・固有用語などの創作本文を新規生成しない。翻訳元 JP が無いフィールドは空のまま。
- **既存 `_EN` は上書きしない**（空のときだけ補助）。**`hideText` は尊重**（マスク値を訳さない）。
- **固有名詞は辞書対訳に固定**: 早見表 → 辞書本体（`Localization/trans_*` / `References/ref_*` / `Dictionaries/dict_*`）の順。作品タイトルの英名は `Works_` 識別子が正。
- **キー順序・記法**: `field_EN` は対応する JP キーの直後に挿入。新規ラベルは `hashTag_JP` / `hashTag_EN`。
- **最終採否は User**。迷う訳は確定させず「こういう訳でどうかな？」と候補提示に留める。

> ルート `../CLAUDE.md`（基本ルール・ブランチ運用・スキーマ駆動など）も引き続き有効です。本ファイルは `data/` 編集時の英訳補助に限定した追加指示です。
