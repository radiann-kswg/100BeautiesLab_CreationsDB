# \_work_in_progress について

このフォルダは、作業中の設計メモ・進捗ログ・未完タスクの管理に使います。

## 運用ルール（簡易）

- **原則ここに置くもの**: 進行中のタスク、直近の検討メモ、検証ログ（公開可能な範囲）
- **完了ログの退避**: 完了したログは `_work_in_progress/.completed/` へ移動します（Git 管轄外 / `.gitignore` 対象）
- **個人メモ**: 非公開メモは `_work_in_progress/.private/` を利用します（Git 管轄外）

## ファイル命名

- 推奨: `YYYY-MM-DD_progress.md` または `YYYY-MM-DD_progress_<topic>.md`
- タスク一覧（起点）: 進行中の「残留タスク一覧」を置きたい場合は、`_work_in_progress/` 直下に `YYYY-MM-DD_remaining-task.md` などで作成する

---

## いま進行中のファイル（トピック別索引）

同じトピックでも複数ログが並ぶとどれが最新か分かりづらくなるため、**トピック単位**でまとめています。
各トピックの「現行ログ」が最新の状態を追える起点です。過去の実装フェーズの詳細ログは `.completed/` にあります。

| トピック                                 | 現行ログ                                                                                                                                                            | 状態                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| タスク管理・起点                         | [2026-07-03_current-task-ledger.md](./2026-07-03_current-task-ledger.md)                                                                                            | 進行中タスクの一覧（P1/P2/P3）                                                                   |
| タスク管理・母艦                         | [2026-07-08_remaining-task.md](./2026-07-08_remaining-task.md)                                                                                                     | 未完了タスクの統合版（旧 `2026-06-01` / `2026-06-13` は `.completed/` へ退避）                                                     |
| GitHub Issue/PR トリアージ               | [2026-07-08_github-triage.md](./2026-07-08_github-triage.md)                                                                                                        | 🟡 新規失敗通知なし。Jekyll Pages の最終ステータスは Actions 画面での目視確認のみ残              |
| ConversationPattern 引き継ぎ             | [2026-06-28_progress_conversationpattern-handoff.md](./2026-06-28_progress_conversationpattern-handoff.md)                                                          | ⚠️ sub2側後処理が残（current-task-ledger P2）                                                    |
| `*_DBLink` enrich/renderer               | [2026-06-18_progress_dblink-enrich.md](./2026-06-18_progress_dblink-enrich.md) / [2026-06-18_progress_dblink-renderer.md](./2026-06-18_progress_dblink-renderer.md) | ⚠️ 作品別typedefへのフィールド追加・ブラウザ確認待ち                                             |
| 英訳ルール基準書                         | [2026-06-12_progress_translation-style-unified.md](./2026-06-12_progress_translation-style-unified.md)                                                              | 継続参照用（ルール本体・バッチ作業ログ）                                                         |
| Localization DB（`trans_*.json`）        | [2026-06-24_progress_localization-db.md](./2026-06-24_progress_localization-db.md)                                                                                  | ⚠️ enum解決の合流・原作者確認・項目追加継続中                                                    |
| Localization Summary 入力                | [2026-06-25_progress_localization-summary-inputs.md](./2026-06-25_progress_localization-summary-inputs.md)                                                          | ⚠️ 入力チェックリスト（残7件、User手動）                                                         |
| 英訳ルール追補・calling.js               | [2026-06-24_progress_localization-rules-audit.md](./2026-06-24_progress_localization-rules-audit.md)                                                                | ⚠️ calling.js のユニットテスト/UI確認が残（後続: `fix_calling-schema-duplication`）              |
| Calling系表示バグ修正                    | [2026-07-04_fix_calling-schema-duplication.md](./2026-07-04_fix_calling-schema-duplication.md)                                                                      | ⚠️ 他作品への影響スポット確認・テストケース追加検討が残                                          |
| Issue機能追加                            | [2026-07-04_progress_issue-feature.md](./2026-07-04_progress_issue-feature.md)                                                                                      | ⚠️ GitHub上のテンプレート最終表示確認のみ残（構造・デプロイ状態はAPI経由で検証済み）             |
| ADR-0002（Google Cloud 画像生成）        | [2026-06-21_progress_cloudflare-api-adr2-gcloud.md](./2026-06-21_progress_cloudflare-api-adr2-gcloud.md)                                                            | Draft・設計検討中                                                                                |
| addon-ai-tag 逆マージ事故記録            | [2026-07-02_progress_addon-ai-tag-reverse-merge-incident.md](./2026-07-02_progress_addon-ai-tag-reverse-merge-incident.md)                                          | ⚠️ addon-ai-tag側ログへの後日談追記が保留中                                                      |
| UnibyteLive アルベッツ苗字命名           | [2026-07-06_progress_unibytelive-formalname-draft.md](./2026-07-06_progress_unibytelive-formalname-draft.md)                                                        | ⚠️ 下書き入力24件・User最終レビュー待ち（`npm test` 22files/178tests成功済み）                   |
| NumberTales TailsUnit 専用型移行         | [2026-07-07_progress_tailsunit-dedicated-type.md](./2026-07-07_progress_tailsunit-dedicated-type.md)                                                                | 表示方針の未完了タスクは `tailsunit-image-reference` で解消済み                                  |
| NumberTales TailsUnit 参考画像 + `$subfolder` | [2026-07-10_progress_tailsunit-image-reference.md](./2026-07-10_progress_tailsunit-image-reference.md)                                                         | ⚠️ ブラウザ目視確認待ち（`npm test` 22files/207tests成功済み）                                   |
| 画像フィールド専用DB/Work横断参照 `_DBCrossLinkPath` | [2026-07-11_progress_dbcrosslinkpath.md](./2026-07-11_progress_dbcrosslinkpath.md)                                                                       | ⚠️ ブラウザ目視確認・SW API実地確認待ち（`npm test` 23files/218tests成功済み）                   |
| 共通資料（`data/References`+`GeneralImages`）の疑似作品化 | [2026-07-11_progress_global-references.md](./2026-07-11_progress_global-references.md)                                                             | ⚠️ ブラウザ目視確認・Workers実API疎通確認待ち（`npm test` 23files/226tests成功済み）             |
| Works_DestinyFoxRecords / Works_Proxies 統合  | [2026-07-11_progress_works-merge-dfr-proxies.md](./2026-07-11_progress_works-merge-dfr-proxies.md)                                                      | ⚠️ 全フェーズ実装完了・`npm test` 233件成功。ブラウザ実地確認とコミットはUser待ち               |
| NumberTales 耳の形状(EarShapeType)再設計 | [2026-07-08_progress_numbertales-earshapetype-restructure.md](./2026-07-08_progress_numbertales-earshapetype-restructure.md)                                        | ⚠️ ブラウザ目視確認待ち（`npm test` 22files/199tests成功済み・addon-ai-tag側追従は実施済み）     |
| AIHints 構造的再同期 設計提案            | [2026-07-08_progress_aihints-structural-resync-proposal.md](./2026-07-08_progress_aihints-structural-resync-proposal.md)                                            | 📝 提案書のみ・実装未着手。User の優先度判断待ち（実装は addon-ai-tag 側の別タスク）             |
| NumberTales `NumberMarkLocation`/`IdentityMotif` 廃止（appearance-detail-cleanup） | [2026-07-11_progress_remove-nummark-identitymotif.md](./2026-07-11_progress_remove-nummark-identitymotif.md) | ✅ 実装完了・`npm test` 243/244件成功（既存無関係の1件失敗は対象外）。ブラウザ目視確認は未実施 |

### 系列の補足（過去フェーズは `.completed/` 参照）

- **AppearanceDetail系**: `design-part-schema` → `appearance-attrs-typed-schema` → `appearance-detail-merge-integration` / `runbook` は実装完了につき `.completed/` へ退避済み。残作業だった `appearance-detail-cleanup`（NumberTales `NumberMarkLocation`/`IdentityMotif` 廃止）も 2026-07-11 に実装完了。
- **DeepL/ローカライズ運用系**: `deepl-localization` / `deepl-draft-translate` / `deepl-glossary-multiform` / `deepl-py-and-skill` / `deepl-production-run` は、2026-07-03 の本番実行ログ（`deepl-production-run`）で実API疎通・Python版・用語集同期まで確認済みにつき `.completed/` へ退避済み。データ内容そのものの継続作業は `localization-db` / `localization-summary-inputs` 側で管理。

---

## 完了（.completed へ退避済み）

以下のファイルは実装・検証が完了し、`_work_in_progress/.completed/` へ移動済みです（Git 管轄外）。

### 2026-07-08 棚卸しで追加退避（8件）

- `2026-07-06_progress_wip-cache-tidy.md`（棚卸し作業ログ本体。未完了タスクなし）
- `2026-07-06_github-triage.md`（日次トリアージ履歴。最新版 `2026-07-08_github-triage.md` へ更新済み）
- `2026-07-07_github-triage.md`（日次トリアージ履歴。最新版 `2026-07-08_github-triage.md` へ更新済み）
- `2026-07-07_progress_secondary-tailsunit-en.md`（TailsUnit_EN 補完完了ログ。後続の専用型移行で役割完了）
- `2026-07-07_progress_tailsunit-appearancedetail-migration.md`（中間フェーズログ。後続の `tailsunit-dedicated-type` で置換完了）
- `2026-07-08_progress_tailsunit-layoutdirection.md`（LayoutDirection 追加・テスト完了、反映済み）
- `2026-06-01_remaining-task.md`（旧残留タスク母艦。未完了項目は `2026-07-08_remaining-task.md` へ統合済み）
- `2026-06-13_remaining-task.md`（旧希望タスク母艦。履歴参照用として退避）

### 2026-07-06 棚卸しで追加退避（4件）

- `2026-07-04_progress_gcal-push-sync.md`（Googleカレンダーpush同期・初回同期でDB側187件とカレンダー側187件が完全一致・運用フェーズへ移行済み）
- `2026-07-04_progress_calendar-color-leap-jp.md`（作品色分け・2/29対応・和文統一。commit `dc38112` 既push済み・Actions run 28722297754 で `追加=0 更新=187 削除=0` 確認・ローカル `npm test` 22files/178tests 成功確認）
- `2026-07-06_progress_dict-triples-consolidation.md`（dict_Triples.json 30クラス再編成。`777.Jackpot`のClass欠落解消済みを確認し、新クラス名30件をUserが正式採用済み）
- `2026-06-30_progress_appearance-detail-cleanup.md`（P1最優先タスク完了。Costumeフィールド新設・BodyPart enum拡張・Num8/16/18/23/32/34/35/53/60/61/71/81/99のデータ修正。詳細は「整理履歴」参照）

### 2026-07-04 棚卸しで追加退避（22件）

- `2026-06-13_progress_vocabulary-db.md`（語彙DB実装完了・エントリ入力はUser手動継続）
- `2026-06-22_progress_jp-en-naming-standardization.md`（JP/EN命名標準化 Phase1〜5完了）
- `2026-06-24_progress_calendar-ics.md`（カレンダー連携 実装・配信完了）
- `2026-06-24_progress_red-tests-triage.md`（赤テスト3件解消完了）
- `2026-06-24_progress_ui-output-test-triage.md`（ui-output赤テスト7件解消完了）
- `2026-06-27_progress_design-part-schema.md`（AppearanceDetailスキーマ仕様案・後続フェーズへ引き継ぎ完了）
- `2026-06-27_progress_roleplay-agents-consolidation.md`（AGENTS.md正典化完了）
- `2026-06-27_progress_sci-fantasy-theme.md`（サイトUIテーマ刷新完了）
- `2026-06-27_progress_sublocal-parallel-ops.md`（サブローカル運用ルール追加完了）
- `2026-06-28_progress_appearance-attrs-typed-schema.md`（AppearanceDetail型付きスキーマ Phase A〜E完了）
- `2026-06-28_progress_deepl-localization.md`（DeepL運用組み込み・実API疎通は production-run で確認済み）
- `2026-06-29_progress_appearance-detail-merge-integration.md`（AppearanceDetail改修マージ・Phase E完了）
- `2026-06-29_runbook_appearance-detail-merge.md`（マージ実行ランブック・Cloudflareデプロイ完了確認済み）
- `2026-07-01_progress_class-dict-scope-field.md`（`scopeField`辞書スコープタグ実装完了）
- `2026-07-01_progress_conversationpattern-refine.md`（ConversationPattern推敲完了）
- `2026-07-01_progress_copilot-localization-en.md`（Copilot英訳補助環境整備完了）
- `2026-07-02_progress_data-en-gap-fill.md`（JP→EN未指定箇所の下書き翻訳完了）
- `2026-07-02_progress_deepl-draft-translate.md`（DeepL下書き翻訳ツール実装・production-runで実行確認済み）
- `2026-07-02_progress_deepl-glossary-multiform.md`（用語集衝突解消・sync-glossary実行確認済み）
- `2026-07-02_progress_deepl-py-and-skill.md`（Python版・Skill実装・production-runで疎通確認済み）
- `2026-07-03_progress-log-retire-candidates.md`（棚卸し候補整理・実行完了）
- `2026-07-03_progress_deepl-production-run.md`（DeepL本番実行・ブロッカーなし完了）

### 2026-07-03 実退避（4件）

- `2026-07-03_progress_dblink-browser-check.md`
- `2026-07-03_progress_p6-bilingual-wrapper-ui.md`
- `2026-07-03_progress_p6-day-era-area-typedef-sw-enrich.md`
- `2026-07-03_progress_p6-secondary-ui-tidy.md`

### それ以前

- `2026-06-23_progress_security-ci-audit.md`
- `2026-06-21_progress_cloudflare-api-adr.md`
- `2026-06-21_progress_claude-md-merge.md`
- `2026-06-18_progress_thisMasters-merge.md`
- `2026-06-18_progress_relation-modulize.md`
- `2026-06-18_progress_stats-modulize.md`
- `2026-06-16_progress_NumberMarkLocation.md`
- `2026-06-15_progress_localization-audit.md`
- `2026-06-12_progress_language-toggle.md`
- `2026-06-09_progress_identitymotif-conversion.md`
- `2026-05-29_progress_bilingual-wrapper-apiswui.md`
- `2026-06-02_progress_pkg-client-libraries.md`
- `2026-06-02_progress_pkg-library.md`
- `2026-05-15_progress_subfields-wrapper-unification.md`
- `2026-05-11_progress_storyera-schema.md`
- `2026-04-23_progress_requested-tasks-implementation-plan.md`
- `2026-04-22_progress_task1-day-era-softcoding.md`
- `2026-04-21_progress_secondary-commons-defaults.md`
- `2026-04-22_progress_requested-tasks-overview.md`
- `2026-04-22_remaining-task.md`
- `2026-05-29_progress_guideline-consolidation.md`
- `2026-04-21_progress_multi-index-display.md`
- `2026-04-22_progress_class-dict-migration.md`
- `2026-04-22_progress_creationwork-meta-api-ui.md`
- `2026-04-22_progress_dictionary-db-separation.md`
- `2026-04-22_progress_schema-meta-docs.md`
- `2026-04-23_progress_ui-output-tests.md`
- `2026-04-30_progress_image-directory-migration.md`
- `2026-03-31_remaining-task.md`
- `2026-04-18_progress_image-lightbox.md`
- `2026-04-19_progress_visual-qa-checklist.md`
- `2026-04-19_progress_typo-candidates.md`
- `2026-04-19_progress_dblink-schema-guard.md`
- `2026-04-19_progress_listindex-multiline.md`
- `2026-04-19_progress_api-sw-docs.md`
- `2026-04-19_progress_playbook-copilot-rules.md`
- `2026-03-04_progress_security-alert.md`
- `2026-03-04_progress_top-page.md`
- `2026-02-21_progress_typedef-driven-detail.md`
- `2026-02-21_progress_bilingual-enum-listindex.md`
- `2026-02-21_remaining-task.md`
- `2026-03-04_progress_phase0.md`
- `2026-03-04_progress_phase1_index`

---

## 整理履歴

- 2026-04-18 に旧進捗ログを整理し、未完了事項は `2026-03-31_remaining-task.md` へ集約しました。
- 2026-04-21 に、4/18 と 4/19 の完了済み progress ログを `.completed` へ整理しました。
- 2026-04-21 に、`_Secondaries` の fallback 優先順位整理ログも完了扱いとして `.completed` へ退避しました。
- 2026-05-11 の棚卸しで、完了済みの `2026-03-31_remaining-task.md`、`2026-04-21_progress_multi-index-display.md` 他を `.completed` へ整理しました。
- 2026-06-01 の棚卸しで、`2026-04-21_progress_secondary-commons-defaults.md`・`2026-04-22_progress_requested-tasks-overview.md`・`2026-04-22_remaining-task.md`・`2026-05-29_progress_guideline-consolidation.md` を `.completed` へ退避しました。
- `2026-06-01_remaining-task.md` に、現時点の未完了・着手中タスクを統合しました。
- 2026-06-11 の棚卸しで、`2026-04-22_progress_task1-day-era-softcoding.md`・`2026-04-23_progress_requested-tasks-implementation-plan.md`・`2026-05-11_progress_storyera-schema.md`・`2026-05-15_progress_subfields-wrapper-unification.md`・`2026-06-02_progress_pkg-client-libraries.md`・`2026-06-02_progress_pkg-library.md` を `.completed` へ退避しました。
- 2026-06-23 の棚卸しで、`2026-06-23_progress_security-ci-audit.md`（セキュリティ/CI 監査・全 7 件完了）を `.completed` へ退避。残留テスト失敗 5 件と軽微確認事項は `2026-06-01_remaining-task.md` へ引き継ぎ済み。
- 2026-06-21 の棚卸しで、10件を `.completed` へ退避しました（bilingual wrapper enrich基盤、IdentityMotif変換、言語トグル、ローカライズ監査、NumberMarkLocation、Stats/Relation/ThisMasters モジュール化、CLAUDE.md統合、ADR-0001 Cloudflare実装）。
- 2026-06-29 の棚卸しで、2026-06-24 〜 2026-06-29 の完了済みファイルをステータス更新。未登録だった 2026-06-27（×3）・2026-06-29（×2）のログを一覧に追加しました。
- 2026-07-03 の棚卸しで、README 掲載漏れを補完し、表記ゆれを修正しました。
- 2026-07-03 の実行対応で、退避候補 A/B（計8件）を `.completed/` へ移動し、`*_DBLink` ブラウザ確認ログを追加しました。
- 2026-07-03 の再棚卸しで、P6完了ログ（bilingual wrapper / Day-Era-Area typedef / secondary UI tidy）を「完了・運用反映済み」へ反映しました。
- 2026-07-03 の実退避で、P6 完了ログ一式 + DBLink ブラウザ確認ログ（計4件）を `.completed/` へ移動しました。
- **2026-07-04 の大規模棚卸しで、後続ログ（`deepl-production-run` 等）で内容が上書き・解消済みと確認できたものを含む 22件を `.completed/` へ一括退避し、直下のファイル数を 37件 → 15件に削減。あわせて README のトピック索引を時系列列挙からトピック別テーブル形式に再構成し、「どのログがどのタスクに対応するか」を一目で追えるようにしました。**
- 2026-07-06 の棚卸しで、`gcal-push-sync`（初回同期・全件一致確認済み）を `.completed/` へ退避。`github-triage` の最新ログをトピック索引へ追加。他の ⚠️ 付きログ（`calendar-color-leap-jp` / `issue-feature` / `fix_calling-schema-duplication` / `dblink-enrich` / `dblink-renderer`）は中身を再確認したが、いずれも未完了タスクが実際に残っているため現状維持。あわせて `.cache/` 配下（一次翻訳・移行バッチ等、既に `data/` へ反映済み・再現可能な一時出力）を全件清掃。
- 2026-07-06 の追加対応で、`calendar-color-leap-jp` は commit `dc38112` 既push・Actions run 28722297754 で期待値どおりの同期結果・ローカル `npm test`（22files/178tests）成功を確認し、`.completed/` へ退避。`issue-feature` はGitHub API経由でテンプレートのデプロイ状態・YAML構造を検証（ブラウザでの最終見た目確認のみUser待ち）。`dict-triples-consolidation` は `777.Jackpot` のClass欠落解消をデータ側で確認したうえで、新クラス名30件をUserへ提示し「全30件、これで採用しよう」と正式採用を確認、`.completed/` へ退避。
- 2026-07-06、P1最優先タスク（`appearance-detail-cleanup`）をPlanモードで設計・実装。`Costume`フィールド新設（`db_meta.json`/`dict_Costume.json`/`appearanceDetail.js`）、`#BodyPart_Interchangeable`・`#BodyPart_FaceMaking`のenum追加、Num8/16/18/23/32/34/35/53/60/61/71/81/99のデータ修正（EN値修正・混在エントリ分割・BodyPart補完・プレースホルダー削除）を実施。`npm test`（22files/178tests）成功、Playwrightでの目視確認済み。`.completed/` へ退避。詳細は`CHANGELOG.md`参照。
- 2026-07-08 の棚卸しで、完了/履歴化済み 8件（`wip-cache-tidy` / 旧 `github-triage` 2件 / `secondary-tailsunit-en` / `tailsunit-appearancedetail-migration` / `tailsunit-layoutdirection` / 旧 `remaining-task` 2件）を `.completed/` へ退避し、未完了タスク母艦を `2026-07-08_remaining-task.md` へ一本化しました。
