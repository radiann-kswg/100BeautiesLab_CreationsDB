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

## 追記（2026-08-20）: 反省事項の取り込みと即時運用

### 取り込み済み

- 本ログに「逆マージの再発防止チェックリスト」を固定化し、以後の棚卸し時に参照する運用へ変更。
- 全体棚卸しログ `2026-08-20_progress_task-inventory.md` に本件の状態を反映（全面保留ではなく、文書化完了・ブランチ別追記のみ保留へ更新）。
- 母艦台帳 `2026-07-25_remaining-task.md` の T-31 を同じ状態へ同期。

### 再発防止チェックリスト（逆マージ防止）

1. マージ直前に `git branch --show-current` で現在ブランチを確認する。
2. `git rev-list --left-right --count develop...origin/addon-ai-tag` で差分方向を確認する。
3. 方向は `develop` → `addon-ai-tag` の一方向のみ許可し、逆方向は実行しない。
4. マージ実行前に、作業ログへ「実行予定の方向」を 1 行で明記する。
5. マージ後は `git log --oneline --decorate -n 5` で直近履歴を確認し、想定外の merge commit がないかを確認する。

### 現在の残作業（最小）

- なし（2026-08-20 実施済み）。

### 実施結果（2026-08-20）

- `addon-ai-tag` 側の追記対象としていた
   `2026-07-01_progress_addon-ai-tag-merge-conflict-and-log-cleanup.md` は、現行の
   `origin/addon-ai-tag` に存在しないことを確認した。
- 後日談は `addon-ai-tag` 側の現行母線ログ
   `2026-07-14_progress_addon-ai-tag-log-inventory.md` へ統合追記した。
- これに伴い、`2026-07-25_remaining-task.md`（T-31）と
   `2026-08-20_progress_task-inventory.md` の状態を完了へ同期した。

## 参考ログ

- `_work_in_progress/README.md`
- `_work_in_progress/2026-07-14_progress_addon-ai-tag-log-inventory.md`
