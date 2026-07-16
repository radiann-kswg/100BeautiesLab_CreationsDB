# `addon-ai-tag`: develop 取り込みマージ + ログ棚卸し（2026-07-16）

## 目的

2026-07-16 の `develop` 側棚卸し（[`2026-07-16_progress_wip-tidy.md`](./2026-07-16_progress_wip-tidy.md)）をコミット後、
`develop` → `addon-ai-tag` の一方向マージで develop の変更を取り込み、本ブランチ側の進捗ログも棚卸しする。
本作業は `develop` / `addon-ai-tag` の 2 ブランチ横断棚卸しの**後半（addon-ai-tag パス）**。

> ブランチ運用方針（`CLAUDE.md` / `AGENTS.md`）: `develop` → `addon-ai-tag` の一方向マージのみ。逆マージは禁止。

## 1. マージ実行と衝突解消

- マージ: `develop`（`0b65400` 進捗ログ整備）→ `addon-ai-tag`（マージ前 HEAD）。
- 取り込んだ `develop` コミット **3 件**:
  - `6c6fbf6` DB情報追加(ナンバーテールズ) — `db_Primary.json` + 参考画像 2 枚
  - `6646d50` キャラシートUI拡張 — 公式サイトリンク機能（`db_meta.json` / `db_type.json` / `lib/sw-common.js` / `pages/characters.*` / `pkg/*` / `docs` / `tests`）
  - `0b65400` 進捗ログ整備 — develop 側棚卸しの `_work_in_progress/` ドキュメント更新・ログ退避
- **コンフリクトは前回同様 `_work_in_progress/README.md` の 1 ファイルのみ**（3 箇所）。
  - db_Primary.json（本ブランチは AIHints データで +18534 行）・db_type.json（本ブランチ +7 行）は
    変更領域が重ならず**自動マージ成功**（コンフリクトなし）。
- 解消方針: **どちらの記載も失わずに統合**した（前回マージ `a1e259d` と同じ両取り方針）。
  1. **「系列の補足」**: develop 側の新規 2 項目（キャラシート URL / 辞書解決系・公式サイトリンク系）と、
     本ブランチ固有の 2 項目（addon-ai-tag / AIHints系・AIHints 再ビルド基盤）の**両方を保持**。
  2. **「完了（退避）一覧」**: develop 側「2026-07-16（6件）」と本ブランチ「2026-07-14 addon-ai-tag（4件）」を
     時系列で並べて**両方を保持**。
  3. **「整理履歴」**: 2026-07-14 develop / 2026-07-14 addon-ai-tag / 2026-07-16 develop の 3 エントリを保持し、
     本マージ（2026-07-16 addon-ai-tag）のエントリを追記。
  - 索引テーブルは自動マージ成功（triage 行 → `2026-07-16`、`global-dict-resolution-fix` 行の除去、
    本ブランチ固有の `addon-ai-tag-log-inventory` / `ColorPalette` 行の保持がいずれも正しく反映）。

## 2. 裏取り

- **`f78cfdb`（グローバル辞書解決修正）は既に本ブランチへ取込済み**だった（`git merge-base --is-ancestor` で確認）。
  develop 側 README の「`addon-ai-tag` への一方向マージが残」という記載は**stale**（実際は先行マージ済み）。
  同様に `a36ba32`（URL 簡略化）・`c99ab37`（DB 大幅整備）も取込済み。
- 本ブランチのコード（`pages/characters.*` / `lib/sw-common.js` / `db_meta.json`）は前回マージ基点（`f4b844e`）から
  **無変更**のため、develop の公式リンク実装は**クリーンに適用**された（辞書解決・公式リンクの UI 挙動は
  develop と同一コミット由来。develop パスのブラウザ実地確認〈`2026-07-16_progress_wip-tidy.md`〉がそのまま妥当）。
- `npm test`（vitest）: 全成功（`.cache/test-addon-merge-20260716.txt`）。

## 3. 退避（マージ削除による除去・4 ログ）

develop 側で `.completed/` へ退避された 4 ログは、マージによる**削除**で本ブランチ直下からも除去された
（`.completed/` はブランチ・ローカルごとに分岐する Git 管轄外領域のため、本ブランチの `.completed/` には
コピーを作らない。README の「完了」一覧に記録を残す運用とする）。

- `2026-07-14_progress_global-dict-resolution-fix.md`
- `2026-07-14_progress_url-params.md`
- `2026-07-14_progress_wip-tidy.md`
- `2026-07-14_github-triage.md`（現行 triage は `2026-07-16_github-triage.md`）

**`_work_in_progress/` 直下: マージ後 14 件（+README）**。うち `2026-07-14_progress_addon-ai-tag-log-inventory.md` は
本ブランチ固有の AIHints 残課題台帳（A1〜A5）として継続。

## 影響範囲（編集ファイル）

- `_work_in_progress/README.md`（コンフリクト 3 箇所を両取りで解消 + 本マージのエントリ追記）
- `_work_in_progress/2026-07-16_progress_addon-ai-tag-merge.md`（本ファイル・新規）
- マージにより取り込まれた develop の 3 コミット分の差分（コード・データ・ドキュメント。上記「1.」参照）

本マージでの手動編集は README のコンフリクト解消と本ログ作成のみ。コードへの追加変更はなし。

## 検証

- コンフリクトマーカー残存: `_work_in_progress/README.md` で 0 件。未解決衝突 0（`git diff --diff-filter=U` 空）。
- `npm test`: 全成功（`.cache/test-addon-merge-20260716.txt`）。
- 索引テーブル: 13 行（triage → `2026-07-16`、`global-dict` 行除去、addon 固有行保持）を確認。

## 未完了タスク

- **なし**（マージ + 棚卸し作業自体は完了）。
- AIHints の残課題は `2026-07-14_progress_addon-ai-tag-log-inventory.md`（A1〜A5）を参照。
- 本マージ結果の push は User 判断（本ログ時点では未 push）。

## 参考

- `2026-07-16_progress_wip-tidy.md`（`develop` 側の同日棚卸し）
- `2026-07-14_progress_addon-ai-tag-log-inventory.md`（前回マージ + AIHints 残課題台帳）
- `CLAUDE.md` / `AGENTS.md`（ブランチ運用方針: `develop` → `addon-ai-tag` の一方向マージのみ）
