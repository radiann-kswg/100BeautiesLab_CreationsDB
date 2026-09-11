---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases. 計画・判断・アイデアを設計ツリーとして捉え、前提が確定した質問だけをラウンド単位でまとめて User に投げ、共有理解に到達するまで問い詰める。「詰めて」「grill して」「この計画の穴を突いて」「追記事項を一緒に確認して」等のときに使う。
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.

---

## このリポジトリでの適用メモ（100BeautiesLab. Creations DB）

> **このファイルはスキルの正典です。** `.claude/skills/` 側は `npm run agents:build` による生成物なので、
> 編集は必ずこちら（`.agents/skills/`）で行ってください。

- 上記の本文は [mattpocock/skills](https://github.com/mattpocock/skills) の `skills/productivity/grilling`
  （MIT License, Copyright (c) 2026 Matt Pocock）を逐語で取り込んだものです。本体を書き換えるときは
  上流との差分が追えるよう、この区切り線より上には手を入れず、下の適用メモ側へ差分を書いてください。
- 質問・推奨回答・締めの確認は **日本語** で、`AGENTS.md` §0〜§8 の「扇一春」の口調で書きます
  （❓ / ➡️ の書式そのものは変えません）。
- **創作内容は質問で引き出すだけ**にとどめます。キャラクター設定・台詞・固有用語・未公開設定などの
  「値」を推奨回答として自動生成しないこと（`AGENTS.md` §8）。推奨回答は構造・方針・選択肢の提示に限ります。
- 事実確認（ファイルの有無・既存ガイドラインの記述・データ件数など）は User に聞かずリポジトリを探索して埋め、
  User には **判断** だけを投げます。
- 質問を 1 問ずつにしたい場合は、User の指示（例:「grilling のときは 1 問ずつ」）を優先します。
