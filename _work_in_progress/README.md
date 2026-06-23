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

- 2026-06-24_progress_calendar-ics.md（誕生日・記念日の Google カレンダー連携: ICS 自動生成・配信。⚠️ `npm test` は User 環境で実行、Google 購読登録は User 手動）

- 2026-06-22_progress_jp-en-naming-standardization.md（JP/EN フィールド命名標準化・**Phase 2〜5 全完了** ⚠️ D1/R2 再同期は手動実施が必要）

- 2026-06-01_remaining-task.md（未完了タスク一覧・2026-06-01 時点）
- 2026-06-12_progress_translation-style-unified.md（英訳ルール基準書・継続参照用）
- 2026-06-13_remaining-task.md（希望タスク一覧・2026-06-13 時点・最新）
- 2026-06-13_progress_vocabulary-db.md（語彙DB実装完了・各作品の実データ入力は User 手動進行中）
- 2026-06-18_progress_dblink-enrich.md（`*_DBLink` suffix エンリッチ処理・typedef 設定とブラウザ確認が残）
- 2026-06-18_progress_dblink-renderer.md（`*_DBLink` suffix セクションレンダラー・db_type.json 追記とブラウザ確認が残）
- 2026-06-21_progress_cloudflare-api-adr2-gcloud.md（ADR-0002 Draft・Google Cloud 画像生成バックエンド設計中）
- 2026-06-09_progress_aihints-from-identitymotif.md（`--apply-identitymotif` 実装・NumberTales/DB_Primary 全件再構築完了。他作品対応・docs 追記・cleared 3 件再適用が残留）
- 2026-06-09_progress_corefolder-nld-template-and-silhouette-structure.md（corefolder NLD テンプレ化・silhouette_notes object 構造化完了。`#28` base color・他作品確認・humanoid NLD 未実装が残留）

補足:

- 2026-04-18 に旧進捗ログを整理し、未完了事項は `2026-03-31_remaining-task.md` へ集約しました。
- 2026-04-21 に、4/18 と 4/19 の完了済み progress ログを `.completed` へ整理しました。
- 2026-04-21 に、`_Secondaries` の fallback 優先順位整理ログも完了扱いとして `.completed` へ退避しました。
- 2026-05-11 の棚卸しで、完了済みの `2026-03-31_remaining-task.md`、`2026-04-21_progress_multi-index-display.md` 他を `.completed` へ整理しました。
- 2026-05-15 に、NumberTales #1〜#40 への AIHints フィールド追加（#38除く 39件）を完了しました。詳細は `.completed/2026-05-15_progress_aihints-numbertales-1to40.md` を参照。
- 2026-06-01 の棚卸しで、`2026-04-21_progress_secondary-commons-defaults.md`・`2026-04-22_progress_requested-tasks-overview.md`・`2026-04-22_remaining-task.md`・`2026-05-29_progress_guideline-consolidation.md` を `.completed` へ退避しました。
- `2026-06-01_remaining-task.md` に、現時点の未完了・着手中タスクを統合しました。
- 2026-06-11 の棚卸しで、`2026-04-22_progress_task1-day-era-softcoding.md`・`2026-04-23_progress_requested-tasks-implementation-plan.md`・`2026-05-11_progress_storyera-schema.md`・`2026-05-15_progress_subfields-wrapper-unification.md`・`2026-06-02_progress_pkg-client-libraries.md`・`2026-06-02_progress_pkg-library.md` を `.completed` へ退避しました。
- 2026-06-11 の addon-ai-tag ブランチ棚卸しで、`2026-05-15_progress_aihints-numbertales-1to40.md`・`2026-05-30_progress_aihints-twolayer.md`・`2026-06-01_progress_aihints-schema-move-fixrefs.md`・`2026-06-01_progress_aihints-vision-final-and-playbook.md`・`2026-06-02_progress_ai-optout-flag.md`・`2026-06-08_progress_aihints-corefolder-enhancements.md`・`2026-06-08_progress_aihints-corefolder-vision-fill.md`・`2026-06-08_progress_aihints-remove-harness-contamination.md` を `.completed` へ退避しました。
- 2026-06-23 の棚卸しで、`2026-06-23_progress_security-ci-audit.md`（セキュリティ/CI 監査・全 7 件完了）を `.completed` へ退避。残留テスト失敗 5 件と軽微確認事項は `2026-06-01_remaining-task.md` へ引き継ぎ済み。
- 2026-06-21 の棚卸しで、以下 10件を `.completed` へ退避しました:
  - `2026-05-29_progress_bilingual-wrapper-apiswui.md`（bilingual wrapper enrich 基盤完了）
  - `2026-06-09_progress_identitymotif-conversion.md`（IdentityMotif 新形式変換完了）
  - `2026-06-12_progress_language-toggle.md`（言語トグル実装完了）
  - `2026-06-15_progress_localization-audit.md`（ローカライズ監査・全対応完了）
  - `2026-06-16_progress_NumberMarkLocation.md`（NumberMarkLocation スキーマ・データ実装完了）
  - `2026-06-18_progress_stats-modulize.md`（Stats 系レンダラーモジュール化完了）
  - `2026-06-18_progress_relation-modulize.md`（Relation レンダラーモジュール化完了）
  - `2026-06-18_progress_thisMasters-merge.md`（ThisMasters DB 参照マージ完了）
  - `2026-06-21_progress_claude-md-merge.md`（CLAUDE.md 統合更新完了）
  - `2026-06-21_progress_cloudflare-api-adr.md`（ADR-0001 Cloudflare Workers 実装完了）

## 完了（.completed へ退避済み）

- 2026-06-23_progress_security-ci-audit.md（GitHub 通知 6 件 + audit fix 完全対処済み）
- 2026-06-21_progress_cloudflare-api-adr.md（ADR-0001 Cloudflare Workers 実装完了・初回デプロイ済み）
- 2026-06-21_progress_claude-md-merge.md（CLAUDE.md 統合更新完了）
- 2026-06-18_progress_thisMasters-merge.md（ThisMasters 統合形式変換・スキーマ更新完了）
- 2026-06-18_progress_relation-modulize.md（Relation セクションレンダラーモジュール化完了）
- 2026-06-18_progress_stats-modulize.md（Stats 系レンダラーモジュール化完了）
- 2026-06-16_progress_NumberMarkLocation.md（NumberMarkLocation スキーマ追加・データ仮入力完了）
- 2026-06-15_progress_localization-audit.md（和英ローカライズ整合性監査・全24件対応完了）
- 2026-06-12_progress_language-toggle.md（ページ全体 JP/EN 切替トグル実装完了）
- 2026-06-09_progress_identitymotif-conversion.md（IdentityMotif 新形式変換完了・89件）
- 2026-05-29_progress_bilingual-wrapper-apiswui.md（bilingual wrapper enrich 基盤完了）
- 2026-06-08_progress_aihints-remove-harness-contamination.md（ハーネス汚染除去・完了）
- 2026-06-08_progress_aihints-corefolder-vision-fill.md（corefolder vision-fill 83件・完了）
- 2026-06-08_progress_aihints-corefolder-enhancements.md（corefolder 強化フィールド追加・schema 拡張・完了）
- 2026-06-02_progress_ai-optout-flag.md（`AI_Optout` フラグ新設・完了）
- 2026-06-02_progress_pkg-client-libraries.md（pkg/ クライアントライブラリ新規実装・完了）
- 2026-06-01_progress_aihints-vision-final-and-playbook.md（#41〜#99 + 特殊番号 視覚解析完走・完了）
- 2026-06-01_progress_aihints-schema-move-fixrefs.md（AI スキーマ作品別移動 + `--fix-refs` 実装・完了）
- 2026-05-30_progress_aihints-twolayer.md（AIHints 二層構造移行・完了）
- 2026-05-15_progress_aihints-numbertales-1to40.md（#1〜#40 AIHints 付与・完了）
- 2026-06-02_progress_pkg-library.md（pkg/ ライブラリ API 拡張・完了）
- 2026-05-15_progress_subfields-wrapper-unification.md（subFields/wrapper 統合・完了）
- 2026-05-11_progress_storyera-schema.md（StoryEra/Day/Era schema 整備・完了）
- 2026-04-23_progress_requested-tasks-implementation-plan.md（4タスク実装計画ログ・06-01 へ集約済み）
- 2026-04-22_progress_task1-day-era-softcoding.md（タスク1 初動実装・完了）
- 2026-04-21_progress_secondary-commons-defaults.md
- 2026-04-22_progress_requested-tasks-overview.md（実装計画ログへ引き継ぎ済み）
- 2026-04-22_remaining-task.md（06-01 残タスクログへ集約済み）
- 2026-05-29_progress_guideline-consolidation.md（完了）
- 2026-04-21_progress_multi-index-display.md
- 2026-04-22_progress_class-dict-migration.md
- 2026-04-22_progress_creationwork-meta-api-ui.md
- 2026-04-22_progress_dictionary-db-separation.md
- 2026-04-22_progress_schema-meta-docs.md
- 2026-04-23_progress_ui-output-tests.md
- 2026-04-30_progress_image-directory-migration.md
- 2026-03-31_remaining-task.md
- 2026-04-18_progress_image-lightbox.md
- 2026-04-19_progress_visual-qa-checklist.md
- 2026-04-19_progress_typo-candidates.md
- 2026-04-19_progress_dblink-schema-guard.md
- 2026-04-19_progress_listindex-multiline.md
- 2026-04-19_progress_api-sw-docs.md
- 2026-04-19_progress_playbook-copilot-rules.md
- 2026-03-04_progress_security-alert.md
- 2026-03-04_progress_top-page.md
- 2026-02-21_progress_typedef-driven-detail.md
- 2026-02-21_progress_bilingual-enum-listindex.md
- 2026-02-21_remaining-task.md
- 2026-03-04_progress_phase0.md
- 2026-03-04_progress_phase1_index