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

### 未完了タスク一覧・継続参照

- 2026-06-01_remaining-task.md（未完了タスク一覧・2026-06-01 時点。継続更新中）
- 2026-06-13_remaining-task.md（希望タスク一覧・2026-06-13 時点。継続参照中）
- 2026-06-12_progress_translation-style-unified.md（英訳ルール基準書・継続参照用）

### 設計・仕様（進行中 or 継続参照）

- 2026-06-21_progress_cloudflare-api-adr2-gcloud.md（ADR-0002 Draft・Google Cloud 画像生成バックエンド設計中）
- 2026-06-13_progress_vocabulary-db.md（語彙DB実装完了・各作品の実データ入力は User 手動進行中）

### GitHub / CI（User 判断待ち）

- 2026-06-24_progress_github-triage.md（GitHub 未解決通知トリアージ: CodeQL alert PR #9・vitest Dependabot PR・cf-api-sync CI 失敗。⚠️ 全件 User 判断・手動操作待ち）
- 2026-06-25_progress_github-triage.md（GitHub 未解決問題トリアージ 2 回目。⚠️ PR #9・vitest Dependabot PR・cf-api-sync 確認は全件 User 判断待ち）
- 2026-07-01_progress_github-triage.md（GitHub トリアージ提案 3 回目。06-30 `develop` 失敗 run を反映。`cf-api-sync` Worker デプロイ失敗はトークンスコープ不足/route 競合の切り分け提案、CodeQL alert #5（+ #6/#7 可能性）を継続監視。⚠️ 全件 User 判断待ち・提案のみ）

### データ / ローカライズ（User 手動作業残り）

- 2026-06-22_progress_jp-en-naming-standardization.md（JP/EN フィールド命名標準化・**Phase 2〜5 全完了** ⚠️ D1/R2 再同期は手動実施が必要）
- 2026-06-24*progress_localization-db.md（英訳固有辞書 DB（Localization レイヤー）実装。✅ 130/130 pass。trans_Dict.json → trans*{Category}.json 分割完了（2026-06-25）。Summary 入力・TransPolicy 確認・能力名等の追記は User 手動）
- 2026-06-25_progress_localization-summary-inputs.md（Localization Summary 入力進捗チェックリスト。地名 9/13 ✅・人物名 11/13 ✅・SI 9/9 ✅・残 7 件 User 入力待ち）
- 2026-06-28_progress_deepl-localization.md（DeepL 翻訳のローカライズ運用組み込み。用語集生成/同期/添削スクリプト・`docs/deepl-localization.md`・用語集実登録 JA-EN144/EN-JA138（大陸名修正後）。✅ 疎通確認済み。⚠️ `npm test` ローカル確認・`.env` 設定・コミットは User 端末で）
- 2026-07-01_progress_copilot-localization-en.md（Copilot 英訳(\_EN)入力補助の用語集対応。`localization-en.instructions.md`＋早見表 `docs/localization-glossary-quickref.md`（164 対訳・生成物）＋ジェネレータ `deepl:build-quickref`。sub1/`develop`。⚠️ `npm test`（Windows）・コミット/push は User 端末で）

### データ変換（手動入力残り）

- 2026-06-30_progress_appearance-detail-cleanup.md（#5〜99 AppearanceDetail 一括変換: EXPR 71件・Formation 統合 282件・BodyPart 推論 113件・136 pass ✅。⚠️ 6件 BodyPart 手動入力待ち / Num:8・32・60 既存不整合手動修正待ち）

### 機能実装（ブラウザ確認残り）

- 2026-06-18_progress_dblink-enrich.md（`*_DBLink` suffix エンリッチ処理・実装済み・typedef 設定済み（`AnotherRegions_DBLink`: `$enrich:true`）。⚠️ ブラウザ動作確認が残）
- 2026-06-18_progress_dblink-renderer.md（`*_DBLink` suffix セクションレンダラー `dbLinkSection` 実装済み・`db_type.json` / NT `db_type.json` 追記済み・実データあり。⚠️ ブラウザ動作確認が残 → **Copilot で対応予定**）
- 2026-06-09_progress_aihints-from-identitymotif.md（`--apply-identitymotif` 実装・NumberTales/DB_Primary 全件再構築完了。他作品対応・docs 追記・cleared 3 件再適用が残留）
- 2026-06-09_progress_corefolder-nld-template-and-silhouette-structure.md（corefolder NLD テンプレ化・silhouette_notes object 構造化完了。`#28` base color・他作品確認・humanoid NLD 未実装が残留）

### カレンダー

- 2026-06-24_progress_calendar-ics.md（誕生日・記念日の Google カレンダー連携: ICS 自動生成・配信。✅ 配信確認済み・購読登録済み。⚠️ Google カレンダー初回同期待ち）

---

## 完了（直近 — .completed 退避前）

以下のファイルは実装が完了しています。ログとして `_work_in_progress/` に残しつつ、User 依頼のタイミングで `.completed/` へ退避します。

### 2026-07-01 完了

- 2026-07-01_progress_addon-ai-tag-merge-conflict-and-log-cleanup.md（`develop`→`addon-ai-tag` 取り込み時の `_work_in_progress/README.md` 競合を解消し、Claude/Copilot の 7/1 ログを反映した進捗棚卸しを実施。⚠️ マージ commit/push は User 手動）
- 2026-07-01_progress_readme-local-agents-rule.md（README.LOCAL.md ローカル作業メモ運用ルール追加。`CLAUDE.md` / `.github/copilot-instructions.md` に運用小節追加・`CHANGELOG.md` 追記完了。⚠️ commit/push は User 手動）
- 2026-07-01_progress_conversationpattern-refine.md（ナンバーテールズ ConversationPattern 推敲完了: Num8〜99+特殊枠90キャラ。136 pass ✅。⚠️ DialogueExamples 入力・コミットは User 手動予定）
- 2026-07-01_progress_copilot-localization-en.md（Copilot 英訳補助環境整備: `localization-en.instructions.md` + 早見表 `docs/localization-glossary-quickref.md`（164件）+ ジェネレータ `deepl:build-quickref` 実装完了。⚠️ `npm test`（Windows）・コミット/push は User 手動）

### 2026-06-29 完了

- 2026-06-29_progress_appearance-detail-merge-integration.md（AppearanceDetail 改修マージ整合プラン・Phase 0〜E 全完了・136 テスト全 pass）
- 2026-06-29_runbook_appearance-detail-merge.md（AppearanceDetail マージ実行ランブック・Phase 0〜5 全完了）

### 2026-06-28 完了

- 2026-06-28_progress_appearance-attrs-typed-schema.md（`$Def_AppearanceAttr` 型付きスキーマ設計案。Phase A〜E 実装完了・`develop` / `addon-ai-tag` マージ済み）

### 2026-06-27 完了

- 2026-06-27_progress_sci-fantasy-theme.md（サイトUI 紺×水色サイエンスファンタジー化。キャラ紹介ヒーロー帯・quickStats opt-in 対応含む。✅ `develop` / `addon-ai-tag` 反映済み）
- 2026-06-27_progress_design-part-schema.md（外見デザイン部位統合スキーマ仕様案。`AppearanceDetail` / `$Def_AppearanceDetail` 実装完了）
- 2026-06-27_progress_roleplay-agents-consolidation.md（ロールプレイ／AGENTS.md 設定の整理・正典化。`AGENTS.md` 新規作成・`CLAUDE.md` 修正完了）
- 2026-06-27_progress_sublocal-parallel-ops.md（サブローカル並行作業の運用ルール追加。`CLAUDE.md` / `.github/copilot-instructions.md` に運用節追加完了）

### 2026-06-24 完了

- 2026-06-24_progress_red-tests-triage.md（赤テスト 2 系統の調査・修正。✅ 全 3 件解消済み）
- 2026-06-24_progress_ui-output-test-triage.md（ui-output テスト 7 件の調査・修正。✅ 136/136 pass（2026-06-29 Phase E で 5 件追加・修正 3 件込み））
- 2026-06-24_progress_localization-rules-audit.md（英訳ルール追補・calling.js 実装。✅ ThirdPersonCalling_EN 要確認 6 件 全件解消（2026-06-25）。⚠️ calling.js UI 確認は User 手動）

---

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

## 整理履歴

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
- 2026-06-29 の棚卸しで、2026-06-24 〜 2026-06-29 の完了済みファイルをステータス更新。未登録だった 2026-06-27（ × 3）・2026-06-29（ × 2）のログを一覧に追加しました。
