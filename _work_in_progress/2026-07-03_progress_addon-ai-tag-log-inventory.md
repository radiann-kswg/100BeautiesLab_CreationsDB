# 2026-07-03 進捗: addon-ai-tag ログ棚卸し

## 目的

`addon-ai-tag` ブランチで、`develop` 取り込み時の競合を考慮しつつ
`_work_in_progress` の進捗ログを再整理する。

## 実施内容

1. `_work_in_progress/README.md` の競合マーカー（2箇所）を手動解消
2. README 目録と実在ファイルを突き合わせ
3. 未掲載だった addon-ai-tag 由来ログを README に反映
4. 日付フォーマットが崩れていたログ名を正規化

## 反映したログ

- `2026-06-19_progress_db-images-phase2.md`（旧: `20260619_progress_db-images-phase2.md`）
- `2026-06-21_progress_addon-ai-tag-api-separation.md`

## 現在の整理方針

### 進行中として保持

- `2026-07-02_progress_addon-ai-tag-reverse-merge-incident.md`
  - 逆マージ是正の後日談追記が残るため保持
- `2026-06-19_progress_db-images-phase2.md`
  - `_creations-ai` 側反映確認など後続タスクが残るため保持

### 完了ログ（参照用）

- `2026-06-21_progress_addon-ai-tag-api-separation.md`
  - 実装・文書反映は完了、運用参照として README の完了セクションで管理

## 競合解消メモ

- `GitHub / CI` セクションは 2026-07-03 時点の最新結論（未解決なし）へ統一
- addon-ai-tag 固有の復旧ログは `ブランチ運用（記録）` に集約
- `2026-07-01` 完了セクションは、現存ファイルに合わせて記載を整理

## 未完了タスク

- [ ] `data/Works_NumberTales/DataBases/db_Primary.json` の変更意図（AIHints/画像更新系）を別ログと突き合わせて確定
- [ ] 必要であれば addon-ai-tag 専用の退避候補（.completed 移動対象）を次回棚卸しで確定
