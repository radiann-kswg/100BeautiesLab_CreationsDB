# 進捗レポート: addon-ai-tag → develop 逆マージ・インシデントと是正 (2026-07-02)

## 目的

- 2026-07-01 に発生した「`addon-ai-tag` → `develop` への逆方向マージ」インシデントの経緯・是正内容を記録として残す。
- この逆マージにより `develop` から巻き添えで消えた `_work_in_progress/2026-07-01_progress_addon-ai-tag-merge-conflict-and-log-cleanup.md`（マージコンフリクト解消ログ）について、実体は `addon-ai-tag` ブランチ側に残存していることを確認し、状況を整理する。

## 経緯

1. **`dc93d095`**（2026-07-01 16:57:59）: `develop` 側の通常コミット（「DB・API大幅整備 その11続き」）。
2. **`b0c539c`**（2026-07-01 16:58:38）: `Merge branch 'addon-ai-tag' into develop` が実行され、`addon-ai-tag` → `develop` の逆マージが発生。
   - `CLAUDE.md` / `AGENTS.md` のブランチ運用方針（`addon-ai-tag` → `develop` への逆マージは行わない）に反する状態。
   - この逆マージにより、AIHints 関連ファイル（`.github/prompts/aihints-fill.prompt.md` 等）や `addon-ai-tag` 側の進捗ログ（AIHints 系ログ、および本来 `addon-ai-tag` にのみ存在すべき `2026-07-01_progress_addon-ai-tag-merge-conflict-and-log-cleanup.md`）が `develop` に混入。
   - あわせて `data/Works_NumberTales/DataBases/db_Primary.json` 等、データ側にも大規模な差分（13,580行規模）が混入。
3. **`f9a3ebe`**（2026-07-01 17:50:23）: `Revert "Merge branch 'addon-ai-tag' into develop"` により `b0c539c` を打ち消し、`develop` を `dc93d095` 相当の状態へ復帰。
   - 巻き添えで `_work_in_progress/2026-07-01_progress_addon-ai-tag-merge-conflict-and-log-cleanup.md` も `develop` から削除された。

## 現状確認（2026-07-02 時点）

- `develop` / `origin/develop`: `b0c539c` の内容は完全に取り除かれ、ブランチ運用方針に沿った状態に復帰済み。✅
- `origin/addon-ai-tag`: 巻き添え削除の対象だった `2026-07-01_progress_addon-ai-tag-merge-conflict-and-log-cleanup.md` は**そのまま残存**していることを確認済み（`git show origin/addon-ai-tag:...` で内容確認済み）。実体消失はしていない。
- 削除自体は「`develop` に紛れ込んだ `addon-ai-tag` 由来のファイルを取り除く」という運用方針どおりの是正動作であり、対応そのものは正しい。

## 影響範囲（本ログで編集したファイル）

- `_work_in_progress/2026-07-02_progress_addon-ai-tag-reverse-merge-incident.md`（本ファイル・新規）
- `_work_in_progress/README.md`（一覧更新）

## 未完了タスク

- `addon-ai-tag` ブランチ側の `2026-07-01_progress_addon-ai-tag-merge-conflict-and-log-cleanup.md` への後日談追記（本インシデントの経緯を踏まえた更新）は、現在 `develop` ブランチで作業中のため保留。`addon-ai-tag` チェックアウト環境（別ブランチ用のサブローカル等）で対応予定。
- 逆マージが発生した原因（デスクトップ版 Claude によるマージ操作時の対象ブランチ取り違え等）の再発防止策の検討は User 判断待ち。

## 参考ログ

- `_work_in_progress/README.md`
- （`addon-ai-tag` ブランチのみ）`_work_in_progress/2026-07-01_progress_addon-ai-tag-merge-conflict-and-log-cleanup.md`
