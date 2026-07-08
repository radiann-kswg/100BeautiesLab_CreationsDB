# 2026-07-08 残留タスク一覧（引き継ぎ版）

## 目的

`2026-06-01_remaining-task.md` と `2026-06-13_remaining-task.md` の未完了タスクを統合し、
以後の実務で参照する残タスク母艦を一本化する。

## 参照元

- `2026-06-01_remaining-task.md`
- `2026-06-13_remaining-task.md`
- `2026-07-03_current-task-ledger.md`

## 現在の優先度

### P1. ConversationPattern handoff 後処理（継続中）

- 参照: `2026-06-28_progress_conversationpattern-handoff.md`
- 残作業:
  - sub2 側 stale lock 解消
  - 必要コミット確定
  - 本体側の切断 WIP 取り下げ確認
- 完了条件:
  - handoff に記載されたユーザ端末作業がすべて完了し、再開不要状態になること

### P2. 創作用語DB / 基本資料DB（継続中）

- 旧タスク対応:
  - `2026-06-01_remaining-task.md` タスク2
  - `2026-06-13_remaining-task.md` 希望タスク1
- 残作業:
  1. 最小テンプレート案の作成（保存場所・最小フィールド・作品/DBとの関連付け・API入口・UI参照方針）
  2. 造語候補の抽出支援（採否は User 判断）
  3. 承認後の API/UI 受け皿整備（`lib/sw-common.js` / `pages/characters.js`）
- 制約:
  - 辞書本文は User 手動入力前提（自動生成しない）

### P3. 任意拡張（優先度低）

1. `Progress` 連動の派生非公開ルール検討（opt-in 前提）
2. `Day` の完全 key 非依存化（wrapper role 化含む追加整理）
3. 二次創作 UI の追加強化
   - 一次創作との関係表示強化
   - 一次/二次相当判定ルールの明文化

## 完了済みとして本台帳から除外した項目

- bilingual wrapper UI 対応（`StreamingGreeting` / `ListenerNickname` の JP/EN 2列表示）
- IdentityMotif UI 対応
- subFields / wrapper 統合作業（実装タスク）
- BasicInfo 和英切替の主要修正

## 運用ルール

- 本ファイルを残タスク母艦の正とする。
- 履歴参照は `.completed/2026-06-01_remaining-task.md` と `.completed/2026-06-13_remaining-task.md` を参照する。
- 進行中タスクの実務起点は `2026-07-03_current-task-ledger.md` を併用する。
