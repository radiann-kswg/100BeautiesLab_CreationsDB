# 2026-07-03 現行タスク台帳

## 目的

進行中の実務タスクだけを 1 枚に集約し、次回セッションの起点を明確にする。
詳細経緯は各 progress ログを参照し、本台帳は「いま何が残っているか」に限定する。

## 現行タスク一覧（優先順）

### 1) ブラウザ動作確認（dblink 系）

- 対象ログ:
  - `2026-06-18_progress_dblink-enrich.md`
  - `2026-06-18_progress_dblink-renderer.md`
  - `2026-07-03_progress_dblink-browser-check.md`（確認実行ログ）
- 残作業:
  - 代表ケース確認は完了（SCG Primary Drc=E）。
  - 任意: 他作品・他 DB の `*_DBLink` で追加スポット確認を行う場合のみ継続。
- 完了条件:
  - 代表ケースの確認ログ化は完了済み。

### 2) AppearanceDetail 手動入力の残件処理

- 対象ログ:
  - `2026-06-30_progress_appearance-detail-cleanup.md`
- 残作業:
  - BodyPart 手動入力 6 件
  - Num:8 / 32 / 60 の既存不整合修正
- 完了条件:
  - データ修正後にテスト再実行し、差分内容をログへ反映

### 3) DeepL 運用系の実環境確認

- 対象ログ:
  - `2026-06-28_progress_deepl-localization.md`
  - `2026-07-02_progress_deepl-glossary-multiform.md`
  - `2026-07-02_progress_deepl-draft-translate.md`
  - `2026-07-02_progress_deepl-py-and-skill.md`
- 残作業:
  - `DEEPL_API_KEY` 実環境で Python 版の疎通確認
  - `deepl:sync-glossary` 実反映の要否判断
  - `npm run deepl:draft` の実データ確認（例: Num 8）
- 完了条件:
  - 実運用コマンド実行ログが揃い、採用/保留の判断が記録されること

### 4) ConversationPattern handoff の後処理

- 対象ログ:
  - `2026-06-28_progress_conversationpattern-handoff.md`
- 残作業:
  - sub2 側 stale lock 解消
  - 必要コミット確定
  - 本体側の切断 WIP 取り下げ確認
- 完了条件:
  - handoff に記載されたユーザ端末作業がすべて完了し、再開不要状態になること

### 5) クラウド同期・デプロイ確認（手動運用）

- 対象ログ:
  - `2026-06-22_progress_jp-en-naming-standardization.md`
- 残作業:
  - D1/R2 再同期（`migrate.mjs` + deploy）を手動で実施
- 完了条件:
  - 同期実施日時と結果がログに残ること

## 参照タスク（中長期）

- `2026-06-01_remaining-task.md`（残留タスク母艦）
- `2026-06-13_remaining-task.md`（希望タスク整理）
- `2026-06-12_progress_translation-style-unified.md`（英訳ルール基準）

## 運用メモ

- triage 系は `2026-07-03_progress_github-triage.md` を最新判断の正とする。
- 過去 triage は履歴参照用とし、現行タスク判断には直接使わない。
- ログ退避は `2026-07-03_progress-log-retire-candidates.md` の候補 A → B の順で段階実施する。
