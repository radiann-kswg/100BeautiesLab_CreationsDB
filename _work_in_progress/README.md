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

- 2026-02-21_progress_typedef-driven-detail.md
- 2026-02-21_progress_bilingual-enum-listindex.md
- 2026-02-21_remaining-task.md

## 完了ログ（ローカル退避: `_work_in_progress/.completed/`）

この一覧はローカル作業ツリー上の退避ログを前提にしています（`.completed/` は Git 管轄外）。

- `.completed/2026-02-03_callings-normalize.md`
- `.completed/2026-02-18_characters-missing-fields.md`
- `.completed/2026-02-18_sw-typedef-driven-enrichment.md`
- `.completed/2026-02-20_changelog-refresh.md`
- `.completed/2026-02-20_contributing.md`
- `.completed/2026-02-20_dblink-jump-merge.md`
- `.completed/2026-02-20_detail-layout-metadata.md`
- `.completed/2026-02-20_enum-display-format.md`
- `.completed/2026-02-20_progress_display-metadata.md`
- `.completed/2026-02-20_remaining-task.md`
- `.completed/2026-02-20_schema-driven-display-format.md`
- `.completed/2026-02-21_bilingual-fields.md`
- `.completed/2026-02-21_progress_db-update-guidelines.md`
- `.completed/2026-02-21_progress_readme-polish.md`
- `.completed/2026-02-21_progress_third-party-policy.md`
- `.completed/2026-02-21_progress_viewer-docs.md`
- `.completed/2026-02-21_progress_wip-organize.md`
