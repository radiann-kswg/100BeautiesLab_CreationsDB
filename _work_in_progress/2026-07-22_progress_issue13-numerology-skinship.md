# 2026-07-22 進捗: Issue #13 希望タスク整理（数秘解説 / スキンシップ反応）

- 対象Issue: https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/13
- ブランチ: `develop`
- 状態: 要件整理ログを作成（実装未着手）

## 目的

Issue #13 の要望を、既存のスキーマ駆動方針と運用制約に沿って導入できる形へ整理し、次回実装時の着手点を固定する。

## Issue 要望の要点（受領内容）

1. Bot F-06（数秘解説）向けに、キャラ別の監修済み解説文を保持するフィールドが欲しい。
2. Bot F-15 Phase 3（コアフォルダのスキンシップ反応）向けに、行為別の反応台詞を保持するフィールドが欲しい。
3. 命名・配置は DB 側規約に委任。Bot 側はフィールド未存在でもフォールバック可能。
4. 対象は当面 NumberTales / Primary の released 個体で十分。

## 導入方針（整理メモ）

- 既存の `ConversationPattern.DialogueExamples` と同型の配列要素構造を基準に検討する。
- 内容本文（`value_JP` / `about_JP`）は User 手動入力・監修を前提とし、AI 側で創作本文は自動生成しない。
- 実装は段階導入にする（まず schema 追加、次に最小対象DBへ展開、最後に必要なら適用範囲を拡大）。

## 想定スコープ（実装時）

- `data/Works_NumberTales/DataBases/db_type.json`
- `data/Works_NumberTales/DataBases/db_meta.json`
- `data/Works_NumberTales/DataBases/db_Primary.json`（必要最小限の器追加のみ。本文は User 入力）
- 必要に応じて:
  - `docs/schema-meta-processing.md`
  - `CHANGELOG.md`

## 未完了タスク

1. フィールド命名の最終確定（例: `NumerologyExamples` / `SkinshipReactions` を採用するか）
2. フィールド配置の最終確定（`ConversationPattern` 配下か、トップレベル独立か）
3. 表示系への接続要否の確定（キャラシート表示対象にするか、Bot供給専用にするか）
4. 対象レコード範囲の確定（released 判定の適用基準）

## 制約・注意

- 創作本文は User 手動入力前提（ロールプレイ制約 / 運用ルール）
- 既存データの値上書きは行わない
- 既存 API / UI 挙動を壊さない非破壊追加を優先する

## 参考

- `_work_in_progress/2026-07-03_current-task-ledger.md`
- `_work_in_progress/2026-07-08_remaining-task.md`
- `_work_in_progress/2026-07-22_github-triage.md`
