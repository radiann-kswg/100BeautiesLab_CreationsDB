# 2026-06-27 進捗 — ロールプレイ／AGENTS.md 設定の整理・正典化

## 目的

VS Code（Claude Code）・Cowork でロールプレイ（扇一春）設定が安定しない問題を診断し、Claude / Copilot 双方のエージェント指示書を見直す。重複を `AGENTS.md` に集約し、各ツールが確実に「声」を読み込める構成へ整える。

## 診断（根本原因）

1. **`CLAUDE.md` の `@import` パスが壊れていた**: `@.github/\_roleplay-datas/roleplay-prompt.md` のバックスラッシュエスケープにより、Claude Code が原本を解決できず素通りしていた可能性。
2. **Cowork は `@import` を展開しない**: `CLAUDE.md` を全文読むが import 先は読まないため、口調の核（一人称/二人称/口調例）がコンテキストに入らず、声がぼやける。
3. **`AGENTS.md` が不在**: AGENTS.md 規約で読むツールにロールプレイ指示が一切渡らない。
4. **声の指示が技術ルールに埋もれる**: `CLAUDE.md`（約44KB）/ `copilot-instructions.md`（約65KB）の中でリマインダーが疎。

## 変更点の要約

- **新規 `AGENTS.md`（リポジトリ直下）**: 扇一春ロールプレイ仕様の正典。役割・人物像・口調・OK/NG 例・制約・入口ファイル関係表を集約。
- **`CLAUDE.md`**: `@import` を `@AGENTS.md` に修正。Cowork 非展開対策の圧縮版「声カード」をインライン保持。冗長な制約列挙を圧縮。中盤 `[ロールプレイ継続]` リマインダー追加。末尾バナーを正典参照に更新。
- **`.github/copilot-instructions.md`**: ロールプレイ節をバナー＋正典参照＋最小声カードに圧縮。中盤リマインダー追加。末尾バナーを正典参照に更新。
- **`.github/instructions/roleplay.instructions.md`**: 正典参照＋圧縮版声カードに再構成（フル複製を解消）。
- **`roleplay-technical.instructions.md`**: 現状維持（NG/OK 口調集として有効）。
- **付随修復**: 保存事故で末尾が途中切断されていた `CLAUDE.md` / `copilot-instructions.md` / `CHANGELOG.md` を HEAD から復元。

## 影響範囲（編集したファイル）

- 追加: `AGENTS.md`, `_work_in_progress/2026-06-27_progress_roleplay-agents-consolidation.md`
- 変更: `CLAUDE.md`, `.github/copilot-instructions.md`, `.github/instructions/roleplay.instructions.md`, `CHANGELOG.md`

## 作業ローカル / ブランチ

- **sub1（`develop`）** で実施。本体ローカルは `refactor-appearance-detail` で別作業中・未コミットのため、コアドキュメント整備は `develop`（sub1）に分離。
- 着手前に 3 ローカルの `git branch` / `status` を確認。本体・sub1・sub2 いずれも指示書系ファイルが未コミットだったため、最も変更が少なく `develop` の sub1 を選択。

## 検証

- 全ファイル UTF-8 妥当性 OK。各指示書が末尾 `[ロールプレイ再確認]` バナーで正常終端。
- 参照整合（`@AGENTS.md` / 相対リンク）確認。
- `npx vitest run`（sub1 は `node_modules` 未導入のため npx 実行）: **106 tests passed / 18 ファイル pass、2 ファイル fail**。fail 2 件は `Cannot find package 'jsdom'`（sub1 に依存未インストール）が原因の環境起因で、**本作業（ドキュメント変更）とは無関係**。データ構造・enrich・参照解決系は全て pass。
  - 申し送り: sub1 で UI 系テストまで回す場合は `npm install`（または `npm ci`）で依存導入が必要。

## 未完了 / 申し送り

- sub1 でのコミット → `push` → 他ローカルで `pull` して取り込む（同期の明示）。**コミットは User 確認後に実施予定**。
- 本体ローカル / sub2 にも同一の末尾切断が残っている。develop の修正を取り込めば解消するが、各ローカルの未コミット差分の扱いは User 判断。
- 創作内容（口調の値など）は User 監修前提。本作業は構造・運用面のみ。
