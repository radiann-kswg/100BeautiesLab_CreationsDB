# \_work_in_progress について

このフォルダは、作業中の設計メモ・進捗ログ・未完タスクの管理に使います。

## 運用ルール（簡易）

- **原則ここに置くもの**: 進行中のタスク、直近の検討メモ、検証ログ（公開可能な範囲）
- **完了ログの退避**: 完了したログは `_work_in_progress/.completed/` へ移動します（Git 管轄外 / `.gitignore` 対象）
- **個人メモ**: 非公開メモは `_work_in_progress/.private/` を利用します（Git 管轄外）

## ファイル命名

- 推奨: `YYYY-MM-DD_progress.md` または `YYYY-MM-DD_progress_<topic>.md`
- タスク一覧（起点）: 進行中の「残留タスク一覧」を置きたい場合は、`_work_in_progress/` 直下に `YYYY-MM-DD_remaining-task.md` などで作成する

## いま進行中のファイル

- 2026-03-31_remaining-task.md
- 2026-04-18_progress_image-lightbox.md （キャラシート画像ギャラリーのポップアップ拡大表示）
- 2026-04-19_progress_typo-candidates.md （スペルミス修正候補の整理）

補足:

- 2026-04-18 に旧進捗ログを整理し、未完了事項は `2026-03-31_remaining-task.md` へ集約しました。

## 完了（.completed へ退避済み）

- 2026-03-04_progress_security-alert.md
- 2026-03-04_progress_top-page.md
- 2026-02-21_progress_typedef-driven-detail.md
- 2026-02-21_progress_bilingual-enum-listindex.md
- 2026-02-21_remaining-task.md
- 2026-03-04_progress_phase0.md
- 2026-03-04_progress_phase1_index.md
- 2026-03-04_progress_phase2_dbtype-resilience.md
- 2026-03-04_progress_phase3-prompt.md
- 2026-03-04_progress_phase3_reserved-keys.md
- 2026-03-04_progress_phase4_api-integration.md
- 2026-03-04_progress_phase5-prompt.md
- 2026-03-04_remaining-task.md
- 2026-03-06_progress_phase5_conversation-pattern.md
- 2026-04-06_progress_decave-enum-api-ui.md
