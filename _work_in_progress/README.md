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

- 2026-05-29_progress_bilingual-wrapper-apiswui.md（bilingual wrapper API/SW 対応・UI 表示未完了）
- 2026-06-01_remaining-task.md（現行の未完了タスク一覧・最新）
- 2026-06-09_progress_identitymotif-conversion.md（IdentityMotif 新形式変換・Motif_JP 整備残）
- 2026-06-11_progress_english-fields-addition.md（英訳フィールド追加依頼・進捗記録）

補足:

- 2026-04-18 に旧進捗ログを整理し、未完了事項は `2026-03-31_remaining-task.md` へ集約しました。
- 2026-04-21 に、4/18 と 4/19 の完了済み progress ログを `.completed` へ整理しました。
- 2026-04-21 に、`_Secondaries` の fallback 優先順位整理ログも完了扱いとして `.completed` へ退避しました。
- 2026-05-11 の棚卸しで、完了済みの `2026-03-31_remaining-task.md`、`2026-04-21_progress_multi-index-display.md` 他を `.completed` へ整理しました。
- 2026-06-01 の棚卸しで、`2026-04-21_progress_secondary-commons-defaults.md`・`2026-04-22_progress_requested-tasks-overview.md`・`2026-04-22_remaining-task.md`・`2026-05-29_progress_guideline-consolidation.md` を `.completed` へ退避しました。
- `2026-06-01_remaining-task.md` に、現時点の未完了・着手中タスクを統合しました。
- 2026-06-11 の棚卸しで、`2026-04-22_progress_task1-day-era-softcoding.md`・`2026-04-23_progress_requested-tasks-implementation-plan.md`・`2026-05-11_progress_storyera-schema.md`・`2026-05-15_progress_subfields-wrapper-unification.md`・`2026-06-02_progress_pkg-client-libraries.md`・`2026-06-02_progress_pkg-library.md` を `.completed` へ退避しました。

## 完了（.completed へ退避済み）

- 2026-06-02_progress_pkg-client-libraries.md（pkg/ クライアントライブラリ新規実装・完了）
- 2026-06-02_progress_pkg-library.md（pkg/ ライブラリ API 拡張・完了）
- 2026-05-15_progress_subfields-wrapper-unification.md（subFields/wrapper 統合・完了）
- 2026-05-11_progress_storyera-schema.md（StoryEra/Day/Era schema 整備・完了）
- 2026-04-23_progress_requested-tasks-implementation-plan.md（4タスク実装計画ログ・06-01 へ集約済み）
- 2026-04-22_progress_task1-day-era-softcoding.md（タスク1 初動実装・完了）
- 2026-04-21_progress_secondary-commons-defaults.md
- 2026-04-22_progress_requested-tasks-overview.md（実装計画ログへ引き継ぎ済み）
- 2026-04-22_remaining-task.md（06-01 残タスクログへ集約済み）
- 2026-05-29_progress_guideline-consolidation.md（完了）
- 2026-04-21_progress_multi-index-display.md
- 2026-04-22_progress_class-dict-migration.md
- 2026-04-22_progress_creationwork-meta-api-ui.md
- 2026-04-22_progress_dictionary-db-separation.md
- 2026-04-22_progress_schema-meta-docs.md
- 2026-04-23_progress_ui-output-tests.md
- 2026-04-30_progress_image-directory-migration.md
- 2026-03-31_remaining-task.md
- 2026-04-18_progress_image-lightbox.md
- 2026-04-19_progress_visual-qa-checklist.md
- 2026-04-19_progress_typo-candidates.md
- 2026-04-19_progress_dblink-schema-guard.md
- 2026-04-19_progress_listindex-multiline.md
- 2026-04-19_progress_api-sw-docs.md
- 2026-04-19_progress_playbook-copilot-rules.md
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
