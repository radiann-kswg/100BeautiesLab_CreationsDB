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

| トピック                              | 現行ログ                                                                                                                   | 状態                                                                                                                                                                                                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| タスク管理・起点                      | [2026-07-03_current-task-ledger.md](./2026-07-03_current-task-ledger.md)                                                   | 進行中タスクの一覧（P1〜P7）                                                                                                                                                                                                                                                |
| 棚卸し（現行）                        | [2026-07-22_progress_wip-tidy.md](./2026-07-22_progress_wip-tidy.md)                                                       | 🟢 2026-07-22 実施。6 件退避・赤テスト 3 件を解消（`npm test` 564 件全緑）。成果は未コミット                                                                                                                                                                                |
| エージェント指示書の SSOT 化          | [2026-07-22_progress_agents-ssot.md](./2026-07-22_progress_agents-ssot.md)                                                 | 🟢 `AGENTS.md` を唯一の正典化・Copilot 版を生成物へ・Codex 本採用（`data/AGENTS.md` 新設）。`npm test` 569 件全緑。成果は未コミット                                                                                                                                         |
| タスク管理・母艦                      | [2026-07-08_remaining-task.md](./2026-07-08_remaining-task.md)                                                             | 未完了タスクの統合版（旧 `2026-06-01` / `2026-06-13` は `.completed/` へ退避）                                                                                                                                                                                              |
| GitHub Issue/PR トリアージ            | [2026-07-22_github-triage.md](./2026-07-22_github-triage.md)                                                               | 🟡 Issue #13（希望タスク）を新規検知。AIHints再同期失敗は原因仮説あり（要確認）。Cloudflare API同期失敗は既知の一過性として鎮静化。                                                                                                                                         |
| ConversationPattern 引き継ぎ          | [2026-06-28_progress_conversationpattern-handoff.md](./2026-06-28_progress_conversationpattern-handoff.md)                 | ⚠️ sub2側後処理 + DialogueExamples先行方式での仮入力（Num 92/94/95/98/99/2/10）が残                                                                                                                                                                                         |
| 英訳ルール基準書                      | [2026-06-12_progress_translation-style-unified.md](./2026-06-12_progress_translation-style-unified.md)                     | 継続参照用（ルール本体・バッチ作業ログ）                                                                                                                                                                                                                                    |
| Localization DB（`trans_*.json`）     | [2026-06-24_progress_localization-db.md](./2026-06-24_progress_localization-db.md)                                         | ⚠️ enum解決の合流・原作者確認・項目追加継続中                                                                                                                                                                                                                               |
| Localization Summary 入力             | [2026-06-25_progress_localization-summary-inputs.md](./2026-06-25_progress_localization-summary-inputs.md)                 | ⚠️ 入力チェックリスト（残7件、User手動）                                                                                                                                                                                                                                    |
| 英訳ルール追補・calling.js            | [2026-06-24_progress_localization-rules-audit.md](./2026-06-24_progress_localization-rules-audit.md)                       | ⚠️ calling.js のユニットテスト/UI確認が残（後続の `fix_calling-schema-duplication` は 2026-07-14 に完了・退避済み）                                                                                                                                                         |
| ADR-0002（Google Cloud 画像生成）     | [2026-06-21_progress_cloudflare-api-adr2-gcloud.md](./2026-06-21_progress_cloudflare-api-adr2-gcloud.md)                   | Draft・設計検討中                                                                                                                                                                                                                                                           |
| addon-ai-tag 逆マージ事故記録         | [2026-07-02_progress_addon-ai-tag-reverse-merge-incident.md](./2026-07-02_progress_addon-ai-tag-reverse-merge-incident.md) | ⚠️ addon-ai-tag側ログへの後日談追記が保留中                                                                                                                                                                                                                                 |
| UnibyteLive アルベッツ苗字命名        | [2026-07-06_progress_unibytelive-formalname-draft.md](./2026-07-06_progress_unibytelive-formalname-draft.md)               | ⚠️ 下書き入力24件・User最終レビュー待ち                                                                                                                                                                                                                                     |
| AIHints 構造的再同期 設計提案         | [2026-07-08_progress_aihints-structural-resync-proposal.md](./2026-07-08_progress_aihints-structural-resync-proposal.md)   | 📝 提案書のみ・実装未着手。User の優先度判断待ち（実装は addon-ai-tag 側の別タスク）                                                                                                                                                                                        |
| AIHints カラーセット デッドロック診断 | [2026-07-13_progress_aihints-palette-deadlock.md](./2026-07-13_progress_aihints-palette-deadlock.md)                       | 📝 診断完了。`palette_priority` が 92/92 件 null で固定される原因を特定（上の再同期提案と対で読む）。第0階の修正は `addon-ai-tag` で実装済み                                                                                                                                |
| ColorPalette スキーマ + 配色候補抽出  | [2026-07-13_progress_colorpalette-schema.md](./2026-07-13_progress_colorpalette-schema.md)                                 | ⚠️ スキーマ・抽出ツール実装済み（`npm test` 325件成功）。実データ入力は `.private/` の下書きを User がレビュー後。AIHints への機械導出は未実装                                                                                                                              |
| AppearanceDetail 参考画像の一括登録   | [2026-07-11_progress_appearancedetail-images.md](./2026-07-11_progress_appearancedetail-images.md)                         | ⚠️ `10`/`10alt` の割当正誤（User確認待ち）・保留4枚の扱い                                                                                                                                                                                                                   |
| フィールド順整列（typedef + `$slot`） | [2026-07-17_progress_field-order-typedef.md](./2026-07-17_progress_field-order-typedef.md)                                 | ⚠️ トップレベル整列は完了。実機目視・ネスト整列（Phase 4）・UI/SW統一（Phase 6）が未着手。                                                                                                                                                                                  |
| Issue #13 希望タスク（数秘/反応）     | [2026-07-22_progress_issue13-numerology-skinship.md](./2026-07-22_progress_issue13-numerology-skinship.md)                 | 📝 要件整理ログを新規作成。フィールド命名・配置・適用範囲は User 判断待ち。                                                                                                                                                                                                 |
| ロールプレイプロンプト生成            | [2026-07-18_progress_roleplay-prompt-en-phase4.md](./2026-07-18_progress_roleplay-prompt-en-phase4.md)                     | 🟢 フェーズ0〜3（JP生成・見出しアンカーマージ・`--reconcile`/`--adopt`）完了（詳細は `.completed/2026-07-18_progress_roleplay-prompt-generator.md`）。フェーズ4（EN版）は本ログに着手前調査＋実装計画を集約（未着手・出力先形式は User 確認待ち）                             |

### 系列の補足（過去フェーズは `.completed/` 参照）

- **AppearanceDetail系**: `design-part-schema` → `appearance-attrs-typed-schema` → `appearance-detail-merge-integration` / `runbook` → `appearance-detail-cleanup` → `remove-nummark-identitymotif` はいずれも実装・確認完了につき `.completed/` へ退避済み。データ入力側の継続作業のみ `appearancedetail-images` で管理。
- **TailsUnit系**: `tailsunit-appearancedetail-migration` → `tailsunit-dedicated-type` → `tailsunit-layoutdirection` → `tailsunit-image-reference` は 2026-07-13 のブラウザ目視確認をもって全て完了・退避済み。
- **`*_DBLink` / 画像横断参照系**: `dblink-enrich` / `dblink-renderer` / `crosswork-dblink-audit` / `dbcrosslinkpath` は実データ稼働＋ブラウザ・SW API 確認まで完了につき退避済み。
- **Cloudflare 実API系**: `global-references`（共通資料の疑似作品化）と `r2-sync-outage`（R2 未同期障害）は 2026-07-13 に本番実 API で疎通・是正を確認し退避済み。運用の残課題は `pkg-sync` 側で管理。
- **DeepL/ローカライズ運用系**: `deepl-localization` / `deepl-draft-translate` / `deepl-glossary-multiform` / `deepl-py-and-skill` / `deepl-production-run` は、2026-07-03 の本番実行ログ（`deepl-production-run`）で実API疎通・Python版・用語集同期まで確認済みにつき `.completed/` へ退避済み。データ内容そのものの継続作業は `localization-db` / `localization-summary-inputs` 側で管理。
- **Issue 機能系**: `issue-feature` は 2026-07-14 に、外部ユーザーによる Issue #11 の**テンプレート経由での実起票**をもって本番稼働を確認し退避済み。同時に発見した `data-correction` ラベル未定義も修正済み。
- **Calling 表示系**: `fix_calling-schema-duplication` は 2026-07-14 にブラウザ実地確認 + 回帰テスト追加で完了・退避済み。作品別 typedef に残る `ForMasterCalling_JP`/`_EN` の suffix 宣言は、renderer 側の base 統合により**表示バグを起こさない**ことを確認済み（スキーマ整理は任意）。ローカライズ観点の残作業は `localization-rules-audit` 側で管理。
- **pkg/ 追従系**: `pkg-sync` は 2026-07-13 の実装・検証で完了。残る技術負債（Workers 側 `_Secondaries` マッチャの乖離ほか）は母艦 `2026-07-08_remaining-task.md` の P4 へ引き継ぎ済み。
- **アンオースドロジカ Index 系**: `unauthedlogica-index-alias` は実装・テスト・ブラウザ確認完了、コミットも `develop` へ着地済み（`f3c18ae`）。残る辞書ラベル（創作文言）は母艦 P3 へ引き継ぎ済み。
- **キャラシート URL / 辞書解決系**: `url-params`（圧縮ロケータ `?c=`・`a36ba32`）と `global-dict-resolution-fix`（`fetchGlobalDefType()` の妥当性判定をスキーマ形状ベースへ・`f78cfdb`）は 2026-07-16 の棚卸しで完了・退避済み。前者は錦野姉妹（Dealer カード）対応まで、後者は辞書和英併記の復旧をブラウザ実地確認済み。`global-dict-resolution-fix` の `addon-ai-tag` への一方向マージは本棚卸しの `addon-ai-tag` パスで実施する。
- **公式サイトリンク系**: `official-links`（作品情報欄への公式 HP 導線・スキーマ駆動・`6646d50`）は実装・テスト（373件）・ブラウザ実地確認まで完了し退避済み。Worker 側 `/works` レスポンスへの明示追加のみ次フェーズ（母艦 P4-6。**2026-07-22 に本番 `/api/v1/works` を実測し、公開キーが `key / Title / Title_EN / Works_Summary / OldTitles` の 5 種のみで `OfficialLinks` 未露出＝未対応であることを再確認**）。
- **キャラシート直リンク（Index 解決）系**: `url-params`（圧縮ロケータ `?c=`）→ `unauthedlogica-index-alias` → `composite-index-locator`（オブジェクト型 `$IndexDef` の複合条件対応）で一連の URL 文法整備が完結。最後の `composite-index-locator` は 2026-07-22 の棚卸しで開発環境（`127.0.0.1:5500`）実地確認まで済ませて退避。残る `#IndexAlt` によるエイリアス Index の宣言化のみ母艦 P5 へ引き継ぎ。
- **ロールプレイプロンプト生成系**: `roleplay-prompt-generator`（フェーズ0〜3: 符号化フィールドの `lib/` 化・生成ツール本体・見出しアンカーマージ・`--reconcile`/`--adopt`）は実装・テスト完了につき退避済み。フェーズ4（EN 版）は `roleplay-prompt-en-phase4` が現行ログ。

---

## 完了（.completed へ退避済み）

以下のファイルは実装・検証が完了し、`_work_in_progress/.completed/` へ移動済みです（Git 管轄外）。

### 2026-07-22 棚卸しで追加退避（6件）

前回同様、書面の「完了/未実施」を鵜呑みにせず、**User の開発環境（`http://127.0.0.1:5500`）と本番実 API
（`https://database.numbertales-radiann.net`）で裏取りしてから**退避。直下 24 件 → 18 件（+README）。

- `2026-07-21_progress_composite-index-locator.md`（**ブラウザ実地確認で消化**: Playwright で直リンク 5 ケースを往復確認。当初報告の不具合 2 件〈`Suit` が URL から落ちる / `c=` が使われない〉はいずれも再現せず、旧形式 URL の新形式書き換えとエイリアス Index の root 抜き解決も確認。pageerror 0 / 4xx 0。残る `#IndexAlt` 宣言化は母艦 P5 へ）
- `2026-07-18_progress_roleplay-prompt-generator.md`（フェーズ0〜3 完了ログ。`72cb428` 時点で roleplay 系 5 テストファイルが全件緑であることを再確認。フェーズ4 は `roleplay-prompt-en-phase4` で継続）
- `2026-07-16_progress_wip-tidy.md`（前回の棚卸し作業ログ本体。**申し送りだった `develop` → `addon-ai-tag` 一方向マージの完了を `git branch --contains f78cfdb` で確認**〈`develop...addon-ai-tag` = 0/98 で develop 側の未取り込み 0〉）
- `2026-07-16_github-triage.md` / `2026-07-18_github-triage.md` / `2026-07-20_github-triage.md`（日次トリアージ履歴。現行は `2026-07-22_github-triage.md`）

### 2026-07-16 棚卸しで追加退避（6件）

前回同様、書面の「未実施/確認待ち」を鵜呑みにせず、ローカル静的サーバー（`127.0.0.1:8123`・SW ヘッダー付き）+ Playwright で 2 件を実地確認してから退避。すべて `develop` にコミット＆push 済み（`origin/develop` と 0/0 同期）。

- `2026-07-14_progress_global-dict-resolution-fix.md`（**ブラウザ実地確認で消化**: グローバル辞書由来フィールド〈所属・種族・性別・作者名〉が素値でなく和英併記で復旧、EN モードは英語のみ、4xx/pageerror 0 件を確認。`addon-ai-tag` への一方向マージのみ残 → 本棚卸しの `addon-ai-tag` パスで実施）
- `2026-07-16_progress_official-links.md`（**ブラウザ実地確認で消化**: NT / FLInvestigator78 の公式リンクが「作品情報」欄に表示・EN ラベル切替・`rel="noopener noreferrer"` まで確認。Worker `/works` 明示追加のみ次フェーズ → 母艦 P4 へ）
- `2026-07-14_progress_url-params.md`（圧縮ロケータ `?c=` + 錦野姉妹 Dealer 対応。実装コミット済み〈`a36ba32`〉・Playwright 実機確認済み）
- `2026-07-14_progress_wip-tidy.md`（前回の棚卸し作業ログ本体。未完了タスクなし）
- `2026-07-14_github-triage.md` / `2026-07-15_github-triage.md`（日次トリアージ履歴。現行は `2026-07-16_github-triage.md`）

### 2026-07-14 棚卸しで追加退避（6件）

書面上の「確認待ち」を鵜呑みにせず、実地で裏取りしてから退避。うち 2 件は確認の結果**未完了項目を実際に消化**した。

- `2026-07-13_progress_wip-tidy.md`（前回の棚卸し作業ログ本体。未完了タスクなし）
- `2026-07-13_github-triage.md`（日次トリアージ履歴。現行は `2026-07-14_github-triage.md`）
- `2026-07-04_progress_issue-feature.md`（**確認待ちを消化**: 外部ユーザー `rabbit-rail` が Issue #11 を `data-correction.yml` テンプレート経由で起票済みだったことを `gh issue view` で確認 → `issues/new/choose` の本番稼働が第三者の実利用で裏取りされた。**あわせて `data-correction` ラベルがリポジトリ未定義だった不具合を発見・作成して修正**）
- `2026-07-04_fix_calling-schema-duplication.md`（**確認待ちを消化**: 「他作品への影響」をブラウザ実地確認し、`ForMasterCalling_JP`/`_EN` の suffix 宣言が NumberTales / UnauthedLogica に残るものの**表示バグは再現しない**ことを確認。「テストケース追加」も回帰テスト 2 件を追加して完了）
- `2026-07-13_progress_pkg-sync.md`（実装・検証は完了。残る技術負債は母艦 P4 へ引き継ぎ済み）
- `2026-07-13_progress_unauthedlogica-index-alias.md`（コミット済み（`f3c18ae`）を確認。残る辞書ラベルは創作文言のため母艦 P3 へ引き継ぎ済み）

### 2026-07-13 棚卸しで追加退避（17件）

ブラウザ目視確認 4 件と本番実 API での裏取り 3 件を実施し、残っていた「確認待ち」を解消したうえで退避。

- `2026-07-13_progress_r2-sync-outage.md`（R2 未同期障害。本番で `/api/v1/meta` 復旧・Secondary 37件・FTS `?q=0xFF` → `[]` を確認し、**D1 `is_private` 是正済み**）
- `2026-07-13_progress_index-group-pills.md`（Index ルート単位のピル集約。未完了タスクなし）
- `2026-07-12_progress_vrm-viewer.md`（VRM 3Dビューア。実装・テスト・Playwright 実機確認まで完了）
- `2026-07-11_progress_global-references.md`（共通資料の疑似作品化。本番 `/api/v1/works` に `#Works_CommonReferences`、`/CommonReferences/dbs` で 5DB 取得を確認し **Workers 疎通完了**）
- `2026-07-11_progress_dbcrosslinkpath.md`（画像の DB/Work 横断参照。Num=22 のギャラリーで SemiPrimary 参照画像の表示と、SW enrich の非破壊性（生値は `_DBCrossLinkPath` のまま・`_enrichment.images` へ追記のみ）を確認）
- `2026-07-11_progress_works-merge-dfr-proxies.md`（DFR / Proxies 統合。コミット済み・`global-references` のブラウザ確認セッションで実地確認済み。`OldTitles` 文言のみ母艦へ引き継ぎ）
- `2026-07-11_progress_remove-nummark-identitymotif.md`（`NumberMarkLocation`/`IdentityMotif` 廃止。ブラウザで残存ゼロを確認。既存不具合として記録されていた `TailsUnit_PNGName` 拡張子欠落も解消済み）
- `2026-07-10_progress_tailsunit-image-reference.md`（TailsUnit 参考画像 + `$subfolder`。Num:4 の参考画像表示をブラウザ確認）
- `2026-07-08_progress_numbertales-earshapetype-restructure.md`（EarShapeType 独立軸化。Num:9「狐の耳」/ Num:11「猫の耳」をブラウザ確認。語彙拡張のみ母艦へ引き継ぎ）
- `2026-07-07_progress_tailsunit-dedicated-type.md`（TailsUnit 専用型移行。未完了項目は後続ログで解消済み）
- `2026-07-09_progress_crosswork-dblink-audit.md`（cross-work `_DBLink` 明示空値監査。該当 0 件で完了）
- `2026-06-18_progress_dblink-enrich.md` / `2026-06-18_progress_dblink-renderer.md`（`*_DBLink` enrich / renderer。実データが複数作品で稼働し、ブラウザ確認も後続ログで完了）
- `2026-07-08_github-triage.md` / `2026-07-09_github-triage.md` / `2026-07-10_github-triage.md` / `2026-07-11_github-triage.md`（日次トリアージ履歴。現行は `2026-07-13_github-triage.md`）

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
- **2026-07-14 の棚卸しで、6件 を `.completed/` へ退避し、直下を 21件 → 15件（+README）に削減しました。** 前回同様、書面の「未完了」を鵜呑みにせず裏取りしてから退避しています。(1) Issue テンプレートの最終確認は、外部ユーザーが Issue #11 を**テンプレート経由で実起票**していたことを `gh issue view` で確認して消化（User の目視確認より強い実地証拠）。この過程で **`data-correction` ラベルがリポジトリに未定義**で、GitHub が未定義ラベルを自動作成せず黙って無視していた不具合を発見し、ラベルを作成して修正。(2) Calling 表示バグの「他作品への影響確認」は、`ForMasterCalling_JP`/`_EN` の suffix 宣言が作品別 typedef に残っていることを発見したものの、ブラウザ実地確認で**表示バグは再現しない**（renderer 側の `parseLangSuffix()` が base 統合するため）と確認し、その挙動を回帰テスト 2 件で固定して消化。詳細は `2026-07-14_progress_wip-tidy.md` を参照。
- **2026-07-13 の棚卸しで、「確認待ち」を実際に確認して解消したうえで 17件 を `.completed/` へ退避し、直下を 34件 → 17件（+README）に削減しました。** 単なる仕分けではなく、(1) Playwright + ローカル HTTP サーバーでブラウザ目視 4件（`_DBCrossLinkPath` / TailsUnit 参考画像 / `NumberMarkLocation`・`IdentityMotif` 廃止 / EarShapeType）、(2) 本番実 API での裏取り 3件（R2 復旧・D1 `is_private` 是正・共通資料の Workers 疎通）、(3) コミット状態の確認（`Works_Proxies` 削除済み・`origin/develop` と同期済み）を実施し、その結果を各ログへ追記してから退避しています。創作文言待ち・技術負債は `2026-07-08_remaining-task.md`（母艦 P3 / P4）へ引き継ぎ、`2026-07-03_current-task-ledger.md` も全面改訂しました。詳細は `2026-07-13_progress_wip-tidy.md` を参照。
- **2026-07-22 の棚卸しで、6件 を `.completed/` へ退避し、直下を 24件 → 18件（+README）に整理しました。** User 提示の開発環境（`127.0.0.1:5500`）で Playwright を回し、複合 Index 直リンク 5 ケース（複合条件 2・単一キー 1・エイリアス root 抜き 1・旧形式書き換え 1）がすべて正しいレコードへ解決すること（pageerror 0 / 4xx 0）を実地確認して `composite-index-locator` を消化。前回の申し送りだった `develop` → `addon-ai-tag` の一方向マージ完了も git で裏取りし、`wip-tidy` 本体を退避。あわせて本番実 API で母艦 P4-6（Worker `/works` への `OfficialLinks` 明示追加）が**未対応のまま**であることを実測確認し、母艦へ確認日を追記。**棚卸し中に `npm test` の赤 3 件（`data.field-order` ×2 / `pages.characters.ui-output` ×1）が残存していることを確認。原因はいずれも実装バグではなく DB 更新に対する追従漏れ（キー順未整列 2 レコード／`sec_Category` の null 化に追いつかないテストフィクスチャ）と特定し、User 承認のうえ本棚卸し内で解消して `npm test` 41 ファイル / 564 件すべて成功へ回復させた**（詳細は `2026-07-22_progress_wip-tidy.md`）。
- **2026-07-16 の棚卸しで、6件 を `.completed/` へ退避し、直下を 21件 → 15件（＋棚卸しログ本体 1件で 16件・+README）に整理しました。** 前回同様、書面を鵜呑みにせず裏取りしてから退避。ローカル静的サーバー（`127.0.0.1:8123`）+ Playwright で (1) `global-dict-resolution-fix` の辞書和英併記復旧（所属・種族・性別・作者名、EN モードは英語のみ、4xx/pageerror 0）と (2) `official-links` の公式リンク表示（NT / FLInvestigator78・EN ラベル切替・安全属性）を実地確認して「未実施/確認待ち」を消化。`url-params`（`a36ba32`）と 日次トリアージ 2件、前回の棚卸しログ本体もあわせて退避。残タスクは母艦 P4（Worker `/works` 明示追加）と、`addon-ai-tag` への一方向マージ（`f78cfdb`）へ引き継ぎ。後者は本棚卸しの `addon-ai-tag` パスで実施する。詳細は `2026-07-16_progress_wip-tidy.md` を参照。
