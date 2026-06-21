# 2026-06-21 進捗レポート — CLAUDE.md 統合更新（デスクトップ版 Claude / Cowork 向け翻案）

## 目的

`.github/copilot-instructions.md`（GitHub Copilot 用 / 868 行）と既存 `CLAUDE.md`（146 行の簡易版）の 2 つの AGENTS 設定を読み取り、デスクトップ版 Claude（Cowork）が実際に読むプロジェクト設定 `CLAUDE.md` へ統合・翻案する。

## 方針（User 確認済み）

- 出力先: デスクトップ版 Claude がプロジェクト設定として読む `CLAUDE.md` を直接更新。
- 環境差分の扱い: **原文の運用ルールを優先**。Windows/PowerShell 前提の運用ルールはほぼ維持し、Cowork 環境差分は最小限の注記に留める。

## 変更点の要約

- `CLAUDE.md` を 146 行 → 約 320 行に拡張。`copilot-instructions.md` の運用ルール詳細を Claude 向けに整理して反映。
- 「Copilot」「GitHub Copilot」表記を「Claude（デスクトップ版 / Cowork）」へ翻案。
- 追加・反映した主な節:
  - 基本ルール（前提条件）に `_work_in_progress/.completed/` 退避ルール、`.cache` 詳細、CHANGELOG トリガ条件を追記。
  - 「実行環境メモ（デスクトップ版 Claude / Cowork）」を新設（最小注記）: Linux サンドボックス、成果物のワークスペース保存、`.claude/settings.json` の Prettier フックは Claude Code CLI 向けで Cowork では自動実行されない旨、npm/PowerShell 実行注記。
  - 「最近の実装運用ルール」（UI 表示・wrapper/section renderer・`_DBLink`/`$Def_DBLinkRef`/`ThisMasters` 等）を全面反映。
  - 「会話パターン情報追加時の運用制約」「スキーマ駆動 UI」「直リンク」「`_Commons`/`_Secondaries`」「参照マージ（`_DBLink`/`_Jump`）」「pkg/ 開発ルール」「テスト戦略」「コーディング規約」「アンチパターン」「セキュリティ」「a11y」「ガイドライン編集禁止」を反映。
  - 日本語 JSDoc 標準は要点 + 最小テンプレートへ圧縮（冗長なコード例は削減）。
  - ロールプレイ設定は維持し、`@.github/_roleplay-datas/roleplay-prompt.md` 参照と `roleplay.instructions.md` への補足リンクを記載。

## 影響範囲

- 編集: `CLAUDE.md`（本体）
- 新規: `_work_in_progress/2026-06-21_progress_claude-md-merge.md`（本ファイル）
- `.github/copilot-instructions.md` は変更なし（原本として維持）。

## 未完了タスク / 留意点

- `copilot-instructions.md` を今後更新する場合は `CLAUDE.md` との二重メンテが必要（両者同期の前提）。将来的に片方を正本化し他方を導線リンクにする選択肢あり。
- 日本語 JSDoc 標準の詳細なテンプレート群は `copilot-instructions.md` 側に残存。詳細が必要な場合はそちらを参照。

## 参考リンク

- 原本: `.github/copilot-instructions.md`
- ロールプレイ原本: `.github/_roleplay-datas/roleplay-prompt.md` / `.github/instructions/roleplay.instructions.md`
