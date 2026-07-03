# 2026-07-03 現行タスク台帳

## 目的

進行中の実務タスクだけを 1 枚に集約し、次回セッションの起点を明確にする。
詳細経緯は各 progress ログを参照し、本台帳は「いま何が残っているか」に限定する。

## 現行タスク一覧（develop 観点・優先順）

### P1) AppearanceDetail 手動入力の残件処理（最優先）

- 対象ログ:
  - `2026-06-30_progress_appearance-detail-cleanup.md`
- 残作業:
  - BodyPart 手動入力 6 件
  - Num:8 / 32 / 60 の既存不整合修正
- 完了条件:
  - データ修正後にテスト再実行し、差分内容をログへ反映

### P2) DeepL 運用系の実環境確認（依存ブロッカー解消）

- 対象ログ:
  - `2026-06-28_progress_deepl-localization.md`
  - `2026-07-02_progress_deepl-glossary-multiform.md`
  - `2026-07-02_progress_deepl-draft-translate.md`
  - `2026-07-02_progress_deepl-py-and-skill.md`
- 完了条件:
  - 実運用コマンド実行ログが揃い、採用/保留の判断が記録されること
 - 補足:
  - 実施済み（2026-07-03）:
    - `npm run deepl:sync-glossary`（本反映）
    - `npm run deepl:draft -- --work Works_NumberTales --db Primary --id 8 --apply --limit 30`（候補 0 / 適用 0）
    - `npm run deepl:draft -- --work Works_NumberTales --db Primary --field Summary --limit 5 --apply`（候補 0 / 適用 0）
    - `npm run deepl:draft -- --work Works_FLInvestigator78 --db Primary --limit 5 --apply`（候補 0 / 適用 0）
    - `npm run deepl:eval`
    - `data/Works_*/DataBases/db_*.json` 横断で空 `_EN` を探索し、該当なしを確認
    - `winget install --id Python.Python.3.12 --exact --source winget --accept-package-agreements --accept-source-agreements`
    - `py -3.12 tools/deepl_py/draft_translate.py --work Works_NumberTales --db Primary --id 8 --under ConversationPattern`（実行成功 / 候補 0）
  - `python` コマンドは App Execution Alias の影響で未解決の場合があるため、当面は `py -3.12` で運用。
- 状態:
  - 完了

### P3) クラウド同期・デプロイ確認（公開系の整合）

- 対象ログ:
  - `2026-06-22_progress_jp-en-naming-standardization.md`
- 実施結果（2026-07-03）:
  - `node pkg/cloudflare/scripts/migrate.mjs --clean` 実行完了（`[migrate] 完了 ✓`）
  - `wrangler deploy` 実行完了（Worker `creationsdb-api` / Version `4fb7b409-eea4-4bc5-9801-aa4cd1f4f3f7`）
- 状態:
  - 完了

### P4) ConversationPattern handoff の後処理

- 対象ログ:
  - `2026-06-28_progress_conversationpattern-handoff.md`
- 残作業:
  - sub2 側 stale lock 解消
  - 必要コミット確定
  - 本体側の切断 WIP 取り下げ確認
- 完了条件:
  - handoff に記載されたユーザ端末作業がすべて完了し、再開不要状態になること

### P5) UI 目視・追加確認（任意）

- 対象ログ:
  - `2026-06-18_progress_dblink-enrich.md`
  - `2026-06-18_progress_dblink-renderer.md`
  - `2026-07-03_progress_dblink-browser-check.md`
- 残作業:
  - 追加スポット確認まで実施済み（`Works_FLInvestigator78/PrimaryDealer/Card.Num=79`、`Works_DestinyFoxRecords/Primary/Unit=rad`）。
- 完了条件:
  - 追加確認ログが反映されていること。
- 状態:
  - 完了

### P6) 中長期の設計残タスク（段階着手）

- 対象ログ:
  - `2026-06-01_remaining-task.md`
- 残作業:
  - bilingual wrapper の UI 列分割表示
  - Day / Era / Area の typedef 駆動を SW/enrich 側へ拡張
  - 二次創作 DB 表示（`sec_Category` / `sec_DesignedBy`）の UI 整理
  - 創作用語 DB / 基本資料 DB のテンプレート設計と承認
- 完了条件:
  - 仕様承認を取りながら小分けで実装し、回帰テストとログ更新を都度実施

## 参照タスク（中長期）

- `2026-06-01_remaining-task.md`（残留タスク母艦）
- `2026-06-13_remaining-task.md`（希望タスク整理）
- `2026-06-12_progress_translation-style-unified.md`（英訳ルール基準）

## 運用メモ

- triage 系は `2026-07-03_progress_github-triage.md` を最新判断の正とする。
- 過去 triage は履歴参照用とし、現行タスク判断には直接使わない。
- ログ退避は `2026-07-03_progress-log-retire-candidates.md` の候補 A → B の順で段階実施する。
