---
name: grill-me
description: A relentless interview to sharpen a plan or design. 計画・設計を鋭くするための、容赦ない質問セッションの入口（`grilling` の手動起動用エイリアス）。
disable-model-invocation: true
---

Call the Skill tool with "grilling".

---

## このリポジトリでの適用メモ（100BeautiesLab. Creations DB）

> **このファイルはスキルの正典です。** `.claude/skills/` 側は `npm run agents:build` による生成物なので、
> 編集は必ずこちら（`.agents/skills/`）で行ってください。

- 上記の本文は [mattpocock/skills](https://github.com/mattpocock/skills) の `skills/productivity/grill-me`
  （MIT License, Copyright (c) 2026 Matt Pocock）を逐語で取り込んだものです。
- `grill-me` は User が `/grill-me` と明示的に打ったときだけ動く入口で、エージェントが自発的に起動することはありません
  （`disable-model-invocation: true`）。中身は `grilling` にそのまま委譲します。
- 質問の書式・言語・口調・創作内容の扱いは `grilling` 側の適用メモに従います。
