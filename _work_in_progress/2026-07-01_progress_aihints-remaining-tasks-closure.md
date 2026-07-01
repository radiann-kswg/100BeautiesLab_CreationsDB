# 進捗レポート: AIHints 残タスク2件の整理（2026-07-01 / addon-ai-tag）

## 目的

`2026-06-09` の AIHints 系ログに残っていた「未完了 2 件」を現状に合わせて整理し、実施可能な項目をこのセッションで完了させる。

対象:

- `2026-06-09_progress_aihints-from-identitymotif.md`
- `2026-06-09_progress_corefolder-nld-template-and-silhouette-structure.md`

## 実施内容

### 1) `--apply-identitymotif` ドキュメント未反映の解消

- `docs/ai-hints-usage.md` に新節 `9.8 --apply-identitymotif` を追加。
- 記載内容:
  - モードの目的（IdentityMotif 正源で再構築）
  - structural 優先項目（`TailsUnit` / `ConceptAge` / `Height_cm`）
  - dry-run / apply のコマンド
  - 集計ラベル（`applied` / `cleared` / `no-source` / `skipped-no-aihints`）の意味
  - 再適用時の注意点

### 2) `identitymotif-cleared 3件` の再適用待ち状態を再評価

- 実行（dry-run）:
  - `node tools/patch-aihints.mjs --work NumberTales --db Primary --all --apply-identitymotif`
- 結果:
  - `identitymotif-applied=92`
  - `identitymotif-cleared=0`
  - `identitymotif-no-source=0`
  - `skipped-no-aihints=13`
- 判定:
  - 旧ログで未完扱いだった「cleared 3 件の再適用待ち」は現時点で解消済み。

### 3) 進捗ログ/ハブ更新

- `2026-06-09_progress_aihints-from-identitymotif.md` の「未完了タスク」を更新。
  - docs 未反映 → 反映済みに変更
  - cleared 3 件待ち → `2026-07-01 dry-run で cleared=0` に更新
- `2026-06-09_progress_corefolder-nld-template-and-silhouette-structure.md` の未完了メモを現状注記に更新。
  - `#28` base color TODO は 2026-07-01 時点でも手動入力対象であることを明記
- `_work_in_progress/README.md` の該当2行を最新状態へ更新（残タスクの内容を現状に合わせて補正）。

## 影響範囲

- `docs/ai-hints-usage.md`
- `_work_in_progress/2026-06-09_progress_aihints-from-identitymotif.md`
- `_work_in_progress/2026-06-09_progress_corefolder-nld-template-and-silhouette-structure.md`
- `_work_in_progress/README.md`
- `_work_in_progress/2026-07-01_progress_aihints-remaining-tasks-closure.md`（本ファイル）

## 未完了タスク（今回の範囲外）

- 他作品（FLInvestigator78 / ShouArRiders 等）への `IdentityMotif` 整備と `--apply-identitymotif` 適用。
- `#28` の base color 手動入力（創作監修を伴うため User 手動）。
- `--rewrite-humanoid-nld`（humanoid 版 NLD 再生成モード）の新規実装要否判断。

## 補足

- 今回は docs / ログ整理中心のため、データ本体 (`data/**`) は未変更。
- dry-run の集計確認のみで `--apply` は実行していない。
