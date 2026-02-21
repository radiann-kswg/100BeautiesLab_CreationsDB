# 2026-02-21 progress: \_work_in_progress 整理

## 目的

`_work_in_progress/` に溜まっていた完了ログを整理し、今後の運用（進行中のみ残す／完了は退避）を明確化する。

## 変更点の要約

- 完了ログを `_work_in_progress/.completed/` に退避（Git 管轄外）
- `_work_in_progress/README.md` を追加し、運用ルールを明文化

## 影響範囲（編集したファイル）

- `.gitignore`
- `_work_in_progress/README.md`
- `_work_in_progress/`（完了ログの削除＝Git からは削除、作業ツリーには退避済み）

## 未完了タスク

- なし（整理ルールの適用まで完了）

## 補足

- 退避先の `_work_in_progress/.completed/` は `.gitignore` 対象のため、今後は Git の差分に出ません。
- 必要なら、退避ログを再度トラッキング対象へ戻す（元の場所へ戻す／gitignore から外す）運用も可能です。
