# \_work_in_progress について

このフォルダは、作業中の設計メモ・進捗ログ・未完タスクの管理に使います。

## 運用ルール（簡易）

- **原則ここに置くもの**: 進行中のタスク、直近の検討メモ、検証ログ（公開可能な範囲）
- **完了ログの退避**: 完了したログは `_work_in_progress/.completed/` へ移動します（Git 管轄外 / `.gitignore` 対象）
- **個人メモ**: 非公開メモは `_work_in_progress/.private/` を利用します（Git 管轄外）

> **ブランチについての注記**: `_work_in_progress/` はブランチ間で内容が分岐します（`develop` → `addon-ai-tag` の一方向マージ運用のため）。`addon-ai-tag` 側には AIHints 関連の進捗ログが追加で存在し、`.completed/` の中身も Git 管轄外のためブランチ・ローカル環境ごとに異なります。本 README は「今チェックアウトしているブランチでの現在地」を示すものとして扱ってください。

## ファイル命名

- 推奨: `YYYY-MM-DD_progress.md` または `YYYY-MM-DD_progress_<topic>.md`
- タスク一覧（起点）: 進行中の「残留タスク一覧」を置きたい場合は、`_work_in_progress/` 直下に `YYYY-MM-DD_remaining-task.md` などで作成する

---

## 進行中タスクと進捗ログの索引

**残タスクと進捗ログの索引は [2026-07-25_remaining-task.md](./2026-07-25_remaining-task.md) に一本化しました。**

- 「いま何が残っているか」は同ファイルの**タスク一覧**（`T-xx`）を見てください。
  複数の進捗ログに内容が跨っていたタスクは 1 エントリへ束ね、「関連ログ」欄に跨り先を列挙しています。
- 「どのログがどのタスクの情報源か」は同ファイルの**進捗ログ索引**にまとまっています。
- 本 README は、フォルダの**運用ルール**・**系列の補足**・**退避の履歴**を扱います
  （索引を二重に持つとズレるため、トピック別索引は母艦へ移設しました）。

> 旧 `2026-07-03_current-task-ledger.md`（台帳）と `2026-07-08_remaining-task.md`（母艦）は
> 統合のうえ `.completed/` へ退避済みです。

### 本ブランチ（`addon-ai-tag`）固有の進捗ログ

統合母艦は `develop` 由来のため、**AIHints 関連の固有ログは母艦の索引に載りません**。本節が索引を兼ねます。

| ログ                                                                                                                               | 主題                                                           | 状態                              |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------- |
| [2026-08-19_progress_aihints-optout-dvines.md](./2026-08-19_progress_aihints-optout-dvines.md)                     | `D-Vines` / 未整理枠への `AI_Optout` 宣言 ＋ opt-out テスト回路の整備 | 🟢 現行（`migrate-aihints` のカテゴリ単位対応が残る） |
| [2026-08-08_progress_aihints-refactor.md](./2026-08-08_progress_aihints-refactor.md)                                               | `develop` 取り込みマージ ＋ AIHints 固有コードの同種リファクタ | 🟢 現行（実地実行の確認が残る）   |
| [.completed/2026-07-29_progress_addon-ai-tag-merge.md](./.completed/2026-07-29_progress_addon-ai-tag-merge.md)                     | `develop` 取り込みマージ（`46a3845`）＋ 本ブランチの棚卸し     | ✅ 完了・退避済み                 |
| [2026-07-17_progress_aihints-scope-semiprimary-selfsecondary.md](./2026-07-17_progress_aihints-scope-semiprimary-selfsecondary.md) | AIHints の適用範囲（SemiPrimary / SelfSecondary）              | ⚠️ seed 本体ほか 4 件が継続       |
| [2026-07-14_progress_addon-ai-tag-log-inventory.md](./2026-07-14_progress_addon-ai-tag-log-inventory.md)                           | 本ブランチのログ棚卸し記録＋**AIHints 残課題台帳（A1〜A11）**  | 🟢 台帳（AIHints の残課題はここ） |

> **AIHints の残課題は統合母艦ではなく `2026-07-14_progress_addon-ai-tag-log-inventory.md` の
> 「AIHints 残課題台帳」に集約**しています。母艦は `develop` と共通のファイルであり、AIHints 固有の項目を
> 書き込むと取り込みマージのたびに衝突するためです。

#### 母艦の索引との差異（本ブランチでは実ファイルが無い 1 件）

統合母艦 `2026-07-25_remaining-task.md` の「進捗ログ索引」には、**本ブランチには存在しないログ**が
含まれることがあります（本ブランチが先に `.completed/` へ退避しているため）。
母艦からのリンクは本ブランチではリンク切れになります。

| 母艦の索引にある行                                           | 本ブランチでの扱い |
| ------------------------------------------------------------ | ------------------ |
| `2026-07-02_progress_addon-ai-tag-reverse-merge-incident.md` | 退避済み           |

> **2026-07-29 で差異が 3 件 → 1 件へ縮みました。** かつて差異だった
> `2026-07-08_progress_aihints-structural-resync-proposal.md` と `2026-07-13_progress_aihints-palette-deadlock.md`
> は、2026-07-29 の `develop` 側棚卸しで **`develop` でも `.completed/` へ退避**され、母艦の索引からも
> 外れました（＝両ブランチの状態が揃い、リンク切れも解消）。

### 系列の補足（過去フェーズは `.completed/` 参照）

- **AppearanceDetail系**: `design-part-schema` → `appearance-attrs-typed-schema` → `appearance-detail-merge-integration` / `runbook` → `appearance-detail-cleanup` → `remove-nummark-identitymotif` はいずれも実装・確認完了につき `.completed/` へ退避済み。データ入力側の継続作業のみ `appearancedetail-images` で管理。
- **TailsUnit系**: `tailsunit-appearancedetail-migration` → `tailsunit-dedicated-type` → `tailsunit-layoutdirection` → `tailsunit-image-reference` は 2026-07-13 のブラウザ目視確認をもって全て完了・退避済み。
- **`*_DBLink` / 画像横断参照系**: `dblink-enrich` / `dblink-renderer` / `crosswork-dblink-audit` / `dbcrosslinkpath` は実データ稼働＋ブラウザ・SW API 確認まで完了につき退避済み。
- **Cloudflare 実API系**: `global-references`（共通資料の疑似作品化）と `r2-sync-outage`（R2 未同期障害）は 2026-07-13 に本番実 API で疎通・是正を確認し退避済み。運用の残課題は `pkg-sync` 側で管理。
- **DeepL/ローカライズ運用系**: `deepl-localization` / `deepl-draft-translate` / `deepl-glossary-multiform` / `deepl-py-and-skill` / `deepl-production-run` は、2026-07-03 の本番実行ログ（`deepl-production-run`）で実API疎通・Python版・用語集同期まで確認済みにつき `.completed/` へ退避済み。データ内容そのものの継続作業は `localization-db` / `localization-summary-inputs` 側で管理。
- **Issue 機能系**: `issue-feature` は 2026-07-14 に、外部ユーザーによる Issue #11 の**テンプレート経由での実起票**をもって本番稼働を確認し退避済み。同時に発見した `data-correction` ラベル未定義も修正済み。
- **Calling 表示系**: `fix_calling-schema-duplication` は 2026-07-14 にブラウザ実地確認 + 回帰テスト追加で完了・退避済み。作品別 typedef に残る `ForMasterCalling_JP`/`_EN` の suffix 宣言は、renderer 側の base 統合により**表示バグを起こさない**ことを確認済み（スキーマ整理は任意）。ローカライズ観点を担っていた `localization-rules-audit` も、2026-07-29 に `calling.js` のユニットテスト追加（`tests/section-renders.calling.test.js`）と UI 実測をもって完了・退避済み。**本系列は完結**し、英訳ルール本体の参照先は `docs/localization-en-rules.md`、データ入力側の継続作業は `localization-db` / `localization-summary-inputs`（母艦 T-24）へ移っています。
- **所属 / 出身地の構造型化**: `belonging-faction-typedef`（2026-07-29・`aded5e0`）で `Belonging` を `$Def_Faction[]` へ移行し、`dict_Faction.json` の二重管理（`Faction` / `Belonging` の 2 列）を統合。辞書行の参照解決（`$dictRef`）と basicFields wrapper（`factionSummary` / `baseAreaSummary`）まで実装・テスト済みで、**実機目視と Workers 側の `dictRefs` 対応判断のみ**が母艦 **T-33** に残っています。
- **pkg/ 追従系**: `pkg-sync` は 2026-07-13 の実装・検証で完了。残る技術負債（Workers 側 `_Secondaries` マッチャの乖離ほか）は母艦 `2026-07-08_remaining-task.md` の P4 へ引き継ぎ済み。
- **アンオースドロジカ Index 系**: `unauthedlogica-index-alias` は実装・テスト・ブラウザ確認完了、コミットも `develop` へ着地済み（`f3c18ae`）。残る辞書ラベル（創作文言）は母艦 P3 へ引き継ぎ済み。
- **キャラシート URL / 辞書解決系**: `url-params`（圧縮ロケータ `?c=`・`a36ba32`）と `global-dict-resolution-fix`（`fetchGlobalDefType()` の妥当性判定をスキーマ形状ベースへ・`f78cfdb`）は 2026-07-16 の棚卸しで完了・退避済み。前者は錦野姉妹（Dealer カード）対応まで、後者は辞書和英併記の復旧をブラウザ実地確認済み。`global-dict-resolution-fix` の `addon-ai-tag` への一方向マージは本棚卸しの `addon-ai-tag` パスで実施する。
- **公式サイトリンク系**: `official-links`（作品情報欄への公式 HP 導線・スキーマ駆動・`6646d50`）は実装・テスト（373件）・ブラウザ実地確認まで完了し退避済み。Worker 側 `/works` レスポンスへの明示追加のみ次フェーズ（母艦 P4-6。**2026-07-22 に本番 `/api/v1/works` を実測し、公開キーが `key / Title / Title_EN / Works_Summary / OldTitles` の 5 種のみで `OfficialLinks` 未露出＝未対応であることを再確認**）。
- **キャラシート直リンク（Index 解決）系**: `url-params`（圧縮ロケータ `?c=`）→ `unauthedlogica-index-alias` → `composite-index-locator`（オブジェクト型 `$IndexDef` の複合条件対応）で一連の URL 文法整備が完結。最後の `composite-index-locator` は 2026-07-22 の棚卸しで開発環境（`127.0.0.1:5500`）実地確認まで済ませて退避。残る `#IndexAlt` によるエイリアス Index の宣言化のみ母艦 P5 へ引き継ぎ。
- **ロールプレイプロンプト生成系**: `roleplay-prompt-generator`（フェーズ0〜3: 符号化フィールドの `lib/` 化・生成ツール本体・見出しアンカーマージ・`--reconcile`/`--adopt`）は実装・テスト完了につき退避済み。フェーズ4（EN 版）は `roleplay-prompt-en-phase4` が現行ログ。

---

## 完了（.completed へ退避済み）

以下のファイルは実装・検証が完了し、`_work_in_progress/.completed/` へ移動済みです（Git 管轄外）。

### 2026-08-09 棚卸しで追加退避（6件）

完了済みの相関図ログ 2 件と、世代交代済みの日次 triage ログ 4 件を退避。
直下 26 件 → 20 件（README 含む）に整理。

- `2026-08-02_progress_relations-graph.md`（相関図の初期計画ログ。実装完走ログへ引き継ぎ済み）
- `2026-08-04_progress_relations-tri-grid.md`（相関図の実装完走ログ。`T-13` 完了につき退避）
- `2026-07-29_github-triage.md`（日次 triage。現行は `2026-08-08_github-triage.md`）
- `2026-08-01_github-triage.md`（日次 triage。現行は `2026-08-08_github-triage.md`）
- `2026-08-03_github-triage.md`（日次 triage。現行は `2026-08-08_github-triage.md`）
- `2026-08-05_github-triage.md`（日次 triage。現行は `2026-08-08_github-triage.md`）

### 2026-08-09 addon-ai-tag 棚卸しで追加退避（1件・本ブランチ固有）

- `2026-07-29_progress_addon-ai-tag-merge.md`（`develop` 取り込みマージ（`46a3845`）と棚卸し作業ログ。未完了タスクなしで役割完了）

### 2026-07-29 addon-ai-tag マージ棚卸しで追加退避（1件・本ブランチ固有）

- `2026-07-25_progress_addon-ai-tag-merge.md`（前回のマージ + 棚卸し作業ログ本体。未完了だった
  「本棚卸しの成果は未コミット」は着地済み、最重要の申し送り「`develop` 側で母艦 T-02 を訂正」も
  **`develop` 側で完了**して台帳 A10 がクローズ。`2026-07-29_progress_addon-ai-tag-merge.md` へ世代交代）

### 2026-07-29 棚卸しで追加退避（4件・`develop` 由来）

`npm test` / `agents:check` / `data:order:check` / `roleplay:check` の定点観測に加え、
**本番実 API（`https://database.numbertales-radiann.net`）を叩いてデプロイ状態まで裏取り**してから退避。
直下 17 件 → 13 件（+ 母艦 1 件・+README）。実測値は母艦の「定点観測 → 2026-07-29 実測値」に記録。

- `2026-06-24_progress_localization-rules-audit.md`（**母艦 T-07 完了**。`calling.js` のユニットテスト追加と
  UI 実測が済み、他の申し送り 2 件〈`docs/readme.en.md` の旧さ / 要手動確認 6 件〉も解消済みを確認）
- `2026-07-13_progress_aihints-palette-deadlock.md`（**母艦 T-02 完了**に伴い役割終了。残る積み残しは
  `addon-ai-tag` の残課題台帳 A3 へ移管済み）
- `2026-07-08_progress_aihints-structural-resync-proposal.md`（提案した構造的再同期が `addon-ai-tag` で
  実装・稼働済み〈PR #14 の自動作成 → マージ後 no-op を確認〉）
- `2026-07-25_github-triage.md`（`2026-07-29_github-triage.md` へ世代交代。§1〜§3 は全て解決済みで確定）

> **この回の発見**: 書面と本番のズレが**両方向**に出ました。T-01（`Works_OfficialLinks`）は
> 「未デプロイ」と書かれていたが**実は反映済み**、T-03（検索の 400 化）は「完了」と書かれていたが
> **未 push で本番は 500 のまま**。以降は「コード完了」と「本番反映」を分けて書く運用にしています。
>
> **その後（同日）**: `develop` を push したことで `cf-api-sync.yml` が自動デプロイし、
> 本番 `?q=*` が **400** を返すことを実測確認 → **T-03 も完了**。さらに `develop` → `addon-ai-tag` の
> 一方向マージ（`46a3845`）まで実施し、**T-10 のカウントも 0 / 116** になりました。

> **本ブランチでの注記**: 上記 4 件のうち `aihints-palette-deadlock` と
> `aihints-structural-resync-proposal` は、本ブランチでは 2026-07-14 の棚卸しで**先に退避済み**でした。
> 今回の取り込みマージ（`develop` → `addon-ai-tag`）で `develop` 側も退避され、**両ブランチの状態が揃いました**。

### 2026-07-25 addon-ai-tag マージ棚卸しで追加退避（1件・本ブランチ固有）

- `2026-07-22_progress_addon-ai-tag-merge.md`（前回のマージ + 棚卸し作業ログ本体。唯一の未完了だった
  「本マージ結果は未コミット」は `237b194` ほかで着地済み。`2026-07-25_progress_addon-ai-tag-merge.md` へ世代交代）

### 2026-07-25 タスク統合で追加退避（6件）

残タスクを **1 タスク = 1 エントリ**へ概略化した統合母艦
[2026-07-25_remaining-task.md](./2026-07-25_remaining-task.md) を新設し、役割が移ったもの・
同日に完了したものを退避。**直下 22 件 → 16 件（+ 母艦 1 件・+README）**。

- `2026-07-03_current-task-ledger.md`（**統合母艦へ役割移管**。進行中タスク台帳）
- `2026-07-08_remaining-task.md`（**統合母艦へ役割移管**。残タスク母艦。P1〜P7 は `T-xx` へ再編）
- `2026-07-25_progress_wip-tidy.md`（棚卸し完了。着手順の決定と対応方針は母艦へ移設）
- `2026-07-25_progress_priority-tasks.md`（着手順 1〜6 の対応完了。新規発見は母艦 T-03 へ登録）
- `2026-07-24_progress_roleplay-prompt-formatting.md`（**残 3 件を同日に解消**。`[object Object]` 10 件 /
  句点二重化 / 文断裂がいずれも 0 件に）
- `2026-07-25_progress_aihints-resync-ci-failure.md`（CI 失敗の原因特定と復旧が完了。
  運用上の注意〈全体 `npm test` 依存〉は母艦 T-09 へ登録）

### 2026-07-25 棚卸しで追加退避（4件）

書面の「未コミット」「要確認」を鵜呑みにせず、**git / `gh run list` / 生成物の実測で裏取りしてから**退避。
直下 24 件 → 20 件（+README）。**3 件は「未コミット」と書かれていたが、すべて既に着地済み**だった。

- `2026-07-22_progress_wip-tidy.md`（**「成果は未コミット」→ `dfe2273` で着地済み**を確認。申し送りだった
  未追跡の `.agents/` も追跡済みで、`npm run agents:check` = `0/2 件が要更新`。赤テストの再燃もなし）
- `2026-07-22_progress_agents-ssot.md`（**「成果は未コミット」→ `2b30754` で着地済み**。申し送りの
  `addon-ai-tag` 波及も `79cafd1` のマージで完了済みを確認）
- `calendar-same-person-dblink.md`（**「Claude Desktop 側の未コミット実装」→ `a20fb7b` で着地済み**。
  残る Drive ミラー再アップロードとライブアーティファクト確認は母艦 P4-14 へ引き継ぎ）
- `2026-07-22_github-triage.md`（`2026-07-25_github-triage.md` へ世代交代。**§3 の `AI_Optout` 仮説が誤り**
  だった旨と、§4 Pages 失敗の解消〈run `30143189878` success〉を追記してから退避）

### 2026-07-22 棚卸しで追加退避（6件）

前回同様、書面の「完了/未実施」を鵜呑みにせず、**User の開発環境（`http://127.0.0.1:5500`）と本番実 API
（`https://database.numbertales-radiann.net`）で裏取りしてから**退避。直下 24 件 → 18 件（+README）。

- `2026-07-21_progress_composite-index-locator.md`（**ブラウザ実地確認で消化**: Playwright で直リンク 5 ケースを往復確認。当初報告の不具合 2 件〈`Suit` が URL から落ちる / `c=` が使われない〉はいずれも再現せず、旧形式 URL の新形式書き換えとエイリアス Index の root 抜き解決も確認。pageerror 0 / 4xx 0。残る `#IndexAlt` 宣言化は母艦 P5 へ）
- `2026-07-18_progress_roleplay-prompt-generator.md`（フェーズ0〜3 完了ログ。`72cb428` 時点で roleplay 系 5 テストファイルが全件緑であることを再確認。フェーズ4 は `roleplay-prompt-en-phase4` で継続）
- `2026-07-16_progress_wip-tidy.md`（前回の棚卸し作業ログ本体。**申し送りだった `develop` → `addon-ai-tag` 一方向マージの完了を `git branch --contains f78cfdb` で確認**〈`develop...addon-ai-tag` = 0/98 で develop 側の未取り込み 0〉）
- `2026-07-16_github-triage.md` / `2026-07-18_github-triage.md` / `2026-07-20_github-triage.md`（日次トリアージ履歴。現行は `2026-07-22_github-triage.md`）

### 2026-07-16 棚卸しで追加退避（6件・develop 由来）

前回同様、書面の「未実施/確認待ち」を鵜呑みにせず、ローカル静的サーバー（`127.0.0.1:8123`・SW ヘッダー付き）+ Playwright で 2 件を実地確認してから退避。すべて `develop` にコミット＆push 済み。本ブランチへは 2026-07-16 の `develop` → `addon-ai-tag` 一方向マージで反映（退避対象の 4 ログはマージによる削除で本ブランチ直下からも除去）。

- `2026-07-14_progress_global-dict-resolution-fix.md`（**ブラウザ実地確認で消化**: グローバル辞書由来フィールド〈所属・種族・性別・作者名〉が素値でなく和英併記で復旧、EN モードは英語のみ、4xx/pageerror 0 件を確認。`f78cfdb` は本マージで `addon-ai-tag` にも取込確定）
- `2026-07-16_progress_official-links.md`（**ブラウザ実地確認で消化**: NT / FLInvestigator78 の公式リンクが「作品情報」欄に表示・EN ラベル切替・`rel="noopener noreferrer"` まで確認。Worker `/works` 明示追加のみ次フェーズ → 母艦 P4 へ）
- `2026-07-14_progress_url-params.md`（圧縮ロケータ `?c=` + 錦野姉妹 Dealer 対応。実装コミット済み〈`a36ba32`〉・Playwright 実機確認済み）
- `2026-07-14_progress_wip-tidy.md`（前回の棚卸し作業ログ本体。未完了タスクなし）
- `2026-07-14_github-triage.md` / `2026-07-15_github-triage.md`（日次トリアージ履歴。現行は `2026-07-16_github-triage.md`）

### 2026-07-14 addon-ai-tag 棚卸しで追加退避（4件・本ブランチ固有）

`develop` 取り込みマージ後に実施。**書面の「未着手」を鵜呑みにせず、コードと実データで実状を確認**した結果、
提案書のまま残っていた 2 件が**実際には完了済み**と判明した（実装がログを追い越していた）。

- `2026-07-08_progress_aihints-structural-resync-proposal.md`（**「📝 実装未着手」は陳腐化**: `--resync-structural` / `_meta.structuralEntries` / `structuralSourceHash` / CI ワークフロー / テスト 26 件がすべて実在し、実データ **92/92 件**に `_meta` が付与済みであることを確認。**未実施だった `docs/ai-hints-usage.md` への追記（§9.10）は本棚卸しで対応**）
- `2026-07-13_progress_aihints-palette-deadlock.md`（第0〜2階すべて完了。親ログに育った結果**「残る課題」節が実装結果と自己矛盾**していたため、最終状態を追記して整理し退避。`palette_priority` 確定 **91 件**）
- `2026-07-08_progress_addon-ai-tag-earshapetype-aihints.md`（「ビルド範囲の確認中」を消化: 実データで誤タグ `"nekomata ears"` **0 件**、Num:11 の耳は `AppearanceDetail` 由来の値であることを確認）
- `2026-07-11_progress_addon-ai-tag-identitymotif-removal.md`（「未完了タスク: なし」。マージ後も全テスト成功を確認）

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

### 2026-07-08 棚卸しで追加退避（9件・うち1件は addon-ai-tag 固有）

- `2026-07-06_progress_wip-cache-tidy.md`（棚卸し作業ログ本体。未完了タスクなし）
- `2026-07-06_github-triage.md`（日次トリアージ履歴。最新版 `2026-07-08_github-triage.md` へ更新済み）
- `2026-07-07_github-triage.md`（日次トリアージ履歴。最新版 `2026-07-08_github-triage.md` へ更新済み）
- `2026-07-07_progress_secondary-tailsunit-en.md`（TailsUnit_EN 補完完了ログ。後続の専用型移行で役割完了）
- `2026-07-07_progress_tailsunit-appearancedetail-migration.md`（中間フェーズログ。後続の `tailsunit-dedicated-type` で置換完了）
- `2026-07-08_progress_tailsunit-layoutdirection.md`（LayoutDirection 追加・テスト完了、反映済み）
- `2026-07-08_progress_addon-ai-tag-tailsunit-aihints.md`（`addon-ai-tag` 側のAIHints追従修正。`npm test` 207件成功・dry-run/apply検証まで完了し、未完了タスクなし）
- `2026-06-01_remaining-task.md`（旧残留タスク母艦。未完了項目は `2026-07-08_remaining-task.md` へ統合済み）
- `2026-06-13_remaining-task.md`（旧希望タスク母艦。履歴参照用として退避）

### 2026-07-06 棚卸しで追加退避（4件）

- `2026-07-04_progress_gcal-push-sync.md`（Googleカレンダーpush同期・初回同期でDB側187件とカレンダー側187件が完全一致・運用フェーズへ移行済み）
- `2026-07-04_progress_calendar-color-leap-jp.md`（作品色分け・2/29対応・和文統一。commit `dc38112` 既push済み・Actions run 28722297754 で `追加=0 更新=187 削除=0` 確認・ローカル `npm test` 22files/178tests 成功確認）
- `2026-07-06_progress_dict-triples-consolidation.md`（dict_Triples.json 30クラス再編成。`777.Jackpot`のClass欠落解消済みを確認し、新クラス名30件をUserが正式採用済み）
- `2026-06-30_progress_appearance-detail-cleanup.md`（P1最優先タスク完了。Costumeフィールド新設・BodyPart enum拡張・Num8/16/18/23/32/34/35/53/60/61/71/81/99のデータ修正。詳細は「整理履歴」参照）

### 2026-07-04 棚卸しで追加退避（develop由来・22件）

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

### 2026-07-04 棚卸しで追加退避（addon-ai-tag固有・10件）

- `2026-06-09_progress_aihints-from-identitymotif.md`（`--apply-identitymotif` 実装・NumberTales/Primary 92件適用完了。他作品対応は対象外として明記）
- `2026-06-09_progress_corefolder-nld-template-and-silhouette-structure.md`（corefolder NLDテンプレ化・silhouette_notes object化完了。`#28` base colorのみ恒常的な手動入力対象として保持）
- `2026-06-19_progress_db-images-phase2.md`（Images パス更新・`arts_metadata`/`designAlt_metadata`/`concept_contains_forms` 追加完了。`_creations-ai` 側ビルド反映は別リポジトリ管轄）
- `2026-06-21_progress_addon-ai-tag-api-separation.md`（`/api/ai/*` 分離・Bearer認証実装・デプロイ確認済み。未完了タスク: なし）
- `2026-07-01_progress_addon-ai-tag-merge-conflict-and-log-cleanup.md`（develop→addon-ai-tag取り込み時のREADMEコンフリクト解消・棚卸し。後日談追記まで完了）
- `2026-07-01_progress_addon-ai-tag-revert-cascade-recovery.md`（逆マージrevert差分の伝播事故を調査・復旧。npm test 147 pass確認済み）
- `2026-07-01_progress_aihints-remaining-tasks-closure.md`（AIHints残タスク2件（docs追記・cleared再評価）を解消完了）
- `2026-07-01_progress_appearancedetail-aihints-mode.md`（`--apply-appearancedetail`新モード実装+実データ適用完了。バグ2件修正込み。データコミットのみUser判断待ち）
- `2026-07-02_progress_addon-ai-tag-reverse-merge-incident.md`（`addon-ai-tag`→`develop`逆マージ事故の記録と是正。後日談追記済みで全項目解消）
- `2026-07-03_progress_addon-ai-tag-log-inventory.md`（前回のaddon-ai-tagログ棚卸し。今回の棚卸しへ引き継ぎ完了）

### 2026-07-03 実退避（4件）

- `2026-07-03_progress_dblink-browser-check.md`
- `2026-07-03_progress_p6-bilingual-wrapper-ui.md`
- `2026-07-03_progress_p6-day-era-area-typedef-sw-enrich.md`
- `2026-07-03_progress_p6-secondary-ui-tidy.md`

### 2026-07-03 以前（addon-ai-tag棚卸し分を含む）

- `2026-07-03_progress_github-triage.md` / `2026-07-02_progress_github-triage.md` / `2026-07-01_progress_github-triage.md` / `2026-06-25_progress_github-triage.md` / `2026-06-24_progress_github-triage.md`
- `2026-07-02_progress_jump-dblinkref.md`
- `2026-07-01_progress_readme-local-agents-rule.md`
- `2026-07-01_progress_appearance-detail-ear-en.md`
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

### addon-ai-tag ブランチ固有（2026-06-11 棚卸し・AIHints初期実装系）

- `2026-05-15_progress_aihints-numbertales-1to40.md`（#1〜#40 AIHints付与完了）
- `2026-05-30_progress_aihints-twolayer.md`（AIHints二層構造移行完了）
- `2026-06-01_progress_aihints-schema-move-fixrefs.md`（AIスキーマ作品別移動 + `--fix-refs`実装完了）
- `2026-06-01_progress_aihints-vision-final-and-playbook.md`（#41〜#99 + 特殊番号 視覚解析完走完了）
- `2026-06-02_progress_ai-optout-flag.md`（`AI_Optout`フラグ新設完了）
- `2026-06-08_progress_aihints-corefolder-enhancements.md`（corefolder強化フィールド追加・schema拡張完了）
- `2026-06-08_progress_aihints-corefolder-vision-fill.md`（corefolder vision-fill 83件完了）
- `2026-06-08_progress_aihints-remove-harness-contamination.md`（ハーネス汚染除去完了）

---

## 整理履歴

- **2026-08-09、addon-ai-tag 側の追補棚卸しとして 1件 を `.completed/` へ退避しました。**
  対象は `2026-07-29_progress_addon-ai-tag-merge.md`（未完了タスクなしで役割完了）。
  これに合わせて本 README の「本ブランチ固有の進捗ログ」表を更新し、同ログの参照を
  `.completed/2026-07-29_progress_addon-ai-tag-merge.md` へ切り替えました。あわせて「完了」節に
  重複していた 2026-08-09（6件）/ 2026-07-29（1件）の重複ブロックを整理し、リンク切れと二重記載を解消しています。
- **2026-07-29、`develop`（`a4ee3c9`）を本ブランチへ取り込みマージし（`46a3845`）、1件 を `.completed/` へ退避しました。**
  コンフリクトは **5 ファイル**（`db_meta.json` ×3 / `docs/api-sw-spec.md` / 本 README）で、いずれも**両取り**で解消。
  データ 3 件は「`develop` の `_Commons` 更新（`Belonging` の構造化・`FromArea`・`_ListLinkIf_Suit`）」と
  「本ブランチの `AI_Optout: true`」が**同じ `#DB_*` ブロックの隣接行**で衝突したもので、両方を保持しています。
  **マージ後の `npm test` で 1 件が赤**になり（`tests/cloudflare-search-errors.test.js`）、原因は
  develop 側テストが `/api/v1` を**ハードコード**で叩く一方、本ブランチの Worker は `/api/ai` しか
  ルーティングしないためと特定。テスト側にプレフィックス自動検出を入れて**両ブランチで成立する形**へ直し、
  **54 ファイル / 745 件全緑**へ回復させました（台帳 **A11**・`develop` 側にも同じ修正が要ります）。
  あわせて今回のマージが含む `dict_Faction.json` の構造変更が AIHints に波及しないことを、
  `--resync-structural` / `--apply-colorpalette` の dry-run（**いずれも `No changes to write.`**）と
  実データ（AIHints 92 / `palette_priority` 確定 91・不変）で裏取り。台帳は **A4 / A10 をクローズ**し、
  状態一覧の表（A1〜A11）を新設しました。詳細は `.completed/2026-07-29_progress_addon-ai-tag-merge.md` を参照。
- **2026-07-29 の棚卸しで、4件 を `.completed/` へ退避し、直下を 17件 → 13件（+ 母艦・+README）に整理しました。**
  今回は定点観測（`npm test` 46 files / **627 件全緑** ・`agents:check` 0/2 ・`data:order:check` 0/1287 ・
  `roleplay:check` changed=0）に加えて、**本番実 API を curl で叩いてデプロイ状態まで裏取り**しています。
  その結果、書面と実態のズレが**両方向**に見つかりました。(1) 母艦 **T-01**（`Works_OfficialLinks` の本番反映）は
  「コードのみ完了・未デプロイ」と書かれていたが、本番 `/api/v1/works` に**すでに露出済み**＝完了。
  あわせて `docs/readme.en.md` の「次のデプロイで現れる」注記を除去。(2) 逆に **T-03**（実 API の検索を 400 化）は
  同日 `d42011a` で「完了」と記録されていたが、本番 `?q=*` は**まだ 500**。原因はローカル `develop` が
  `origin/develop` より **2 コミット先行（未 push）**で、`cf-api-sync.yml` の自動デプロイが走っていないため。
  T-03 は「本番反映」タスクとして残置しました。退避したのは T-07 完了に伴う `localization-rules-audit`、
  T-02 完了に伴う AIHints 系 2 本、世代交代した `2026-07-25_github-triage.md` の計 4 件。
  Copilot が進めた分（`calling.js` のテスト追加・検索 400 化）と、`aded5e0` の `Belonging` 構造型化
  （新規 **T-33** として登録）も母艦へ取り込み済みです。
  **同日中の続き**: `develop` を push したことで `cf-api-sync.yml` が自動デプロイし、本番 `?q=*` が
  **400** を返すことを実測 → **T-03 完了**。続けて `develop`（`a4ee3c9`）→ `addon-ai-tag` の一方向マージ
  （`46a3845`）を実施し、**T-10 も 0 / 116** へ。マージでは衝突 5 ファイル（`db_meta.json` ×3 は
  `_Commons` × `AI_Optout` の隣接行衝突）を**両取り**で解消し、`develop` 由来のテストが `addon-ai-tag` で
  404 になる問題（**T-08 項目 8** として登録）も向こう側で解消しています。詳細は `addon-ai-tag` の
  `.completed/2026-07-29_progress_addon-ai-tag-merge.md` を参照。
- **2026-07-25、`addon-ai-tag` への一方向マージ（`6f68df3`）の結果を `develop` 側へ反映しました。**
  マージ作業中に **統合母艦の T-02（AIHints への配色導出）が「未実装」と誤記されている**ことが判明したため、
  `develop` 側で訂正しています。実際は `addon-ai-tag` で `--apply-colorpalette` が実装・適用済みで、
  `palette_priority` は**確定 91 件**（残り 1 件は `ColorPalette` を持たないレコードで null が正しい）、
  dry-run も差分ゼロでした。母艦 T-02 を ✅ 完了へ、T-20 の「T-02 の前提」という位置づけを解除し、
  関連ログ 2 本（`aihints-palette-deadlock` / `colorpalette-schema`）にも同内容を追記。
  **誤記の原因は「AIHints のコード・スキーマを `develop` に含めない」運用上、`develop` 側のログが
  実装状況に対して構造的に遅れること**で、再発防止として「状態を書くときは `addon-ai-tag` で実データを見る」
  旨を T-02 の節に明記しました。あわせて `addon-ai-tag` 側の残課題台帳から **`develop` 所有ファイルの課題 3 件**
  （`_Secondaries` マッチャの三重化 / `extract-enum-lists-to-dictionaries.mjs` のシェバン残存 /
  `CLASS_NAMES_EN` のレジスタ乖離）を母艦 T-08 へ取り込みました。
- **2026-07-25 の addon-ai-tag 取り込みマージ（`6f68df3`）で、`develop` の 5 コミットを一方向マージしました。**
  コンフリクトは `docs/api-sw-spec.md` と `_work_in_progress/README.md` の 2 ファイル。**着手時点では
  前者が develop 側・後者が addon-ai-tag 側で片側採用されており、どちらも情報が落ちていた**ため、
  両方を**両取り**で解消し直しました（前者は AIHints エンドポイント 2 行と `Works_OfficialLinks[]` の併記、
  後者は develop の新構成を土台に本ブランチ固有の退避履歴 3 節・整理履歴 9 件・ブランチ注記を移植）。
  あわせて**着手順 4 番（統合母艦 T-02: AIHints への配色導出）を消化**しましたが、実データとコードで裏取りした結果
  **すでに実装・適用済み**（`--apply-colorpalette` 実装済み / `palette_priority` 確定 91 件 / dry-run 差分ゼロ）と判明し、
  新規実装は不要でした。**母艦の「未実装」記載は `develop` 側のログが 2026-07-13 で止まっていたことによる誤り**で、
  訂正は `develop` 側で行う必要があるため残課題台帳の **A10** へ登録しています。
  本ブランチの棚卸しでは 1 件を退避（直下 19 件 → 18 件）。詳細は `2026-07-25_progress_addon-ai-tag-merge.md` を参照。
- **2026-07-25、残タスクを統合母艦 `2026-07-25_remaining-task.md` へ一本化しました。**
  User 依頼により、**複数の進捗ログに内容が跨っていたタスクと、単一ログにのみ記録されていたタスクを
  等しく「1 タスク = 1 エントリ」へ概略化**し、あわせて進捗ログ全体の索引を同ファイルへ持たせました。
  跨りの代表例は **T-02（AIHints への配色導出）** で、`aihints-structural-resync-proposal` /
  `aihints-palette-deadlock` / `colorpalette-schema` の 3 ログに散っていた内容を 1 エントリへ束ね、
  「第0〜2階は実装済みで、繋ぐ 1 本だけが欠けている」という現在地を 1 か所で読めるようにしています。
  タスクは `T-xx` の ID を持ち、A（Claude 側で着手可）/ B（User 判断待ち）/ C（長期保留）に層別。
  役割が移った旧台帳・旧母艦と、同日に完了した 4 件をあわせて 6 件退避し、**直下 22 件 → 16 件（+ 母艦・+README）**。
  索引の二重管理を避けるため、README のトピック別索引は母艦へのポインタへ置き換えました。
- **2026-07-25、上記棚卸しで定めた着手順 1〜6 のうち 5 件を同日中に消化しました（`58aed8f` ほか）。**
  一春（Claude）が 1・2 を、GitHub Copilot が 3・5・6 を分担。担当範囲が `tools/roleplay/`＋`docs/` と
  `pages/`＋`pkg/cloudflare/` に分かれていたため衝突は発生していません。(1) 配布用ロールプレイプロンプトの
  `[object Object]` **10 件**・句点二重化・文断裂を解消（生成物 66 件で再走査していずれも 0 件・`npm test` 597 件全緑）。
  (2) `docs/readme.en.md` を約 3 か月ぶりに更新し、二層 API・圧縮ロケータ `?c=`・`$Def_DBLinkRef` 形式を反映
  （記載は実 API を curl で実測して裏取り）。(3)(5)(6) Copilot 分はコードレビューに加え、User の開発環境
  （`127.0.0.1:5500`）+ Playwright で**実機裏取り**を実施し、人称呼称群の表示・`Generation` の先頭化・
  `BeastspecName` の subFields 移動・画像順の typedef 準拠（`年賀絵原画` が先頭）を確認（pageerror 0 / 4xx 0）。
  これにより 2026-07-17 から未検証だった母艦 P4-10 の「実機目視」も同時にクローズしました。
  なお `Works_OfficialLinks` は**コードのみ完了・未デプロイ**（本番の公開キーは 5 種のまま）で、
  実 API が `?q=*` で 500 を返す新規課題を母艦 P4-15 へ登録しています。
  詳細は `2026-07-25_progress_priority-tasks.md` を参照。
- **2026-07-25 の棚卸しで、4件 を `.completed/` へ退避し、直下を 24件 → 20件（+README）に整理しました。**
  今回は仕分けよりも**「放置されている重大タスクが無いか」の洗い出し**に重心を置き、20 件すべての未完了節を
  読み合わせたうえで、母艦へ 7 項目（P4-8〜P4-14）と新設 P7（AIHints 系）を登録、台帳へ**着手順の推奨**を明文化しました。
  裏取りで判明した主な事実は 3 つ。(1) README が「成果は未コミット」と記していた 3 件は**すべて着地済み**
  （`dfe2273` / `2b30754` / `a20fb7b`）で、書面と実態がズレていた。(2) `2026-07-24` のログが
  「`@Age` は `buildVars()` 側でアンラップ済み」と書いていたのは**実データで否定**され、配布用ロールプレイ
  プロンプト 66 件中 **10 件**に `[object Object]` が実在（体重7 / **年齢3** / 身長1）＝**配布物に出ている実害**
  として母艦 P4-8 へ格上げ。(3) 当日の自動トリアージ `2026-07-25_github-triage.md` §1 が、退避済み 07-22 triage と
  **同じ誤った仮説**（`AI_Optout` による exit 2）を再掲していたため訂正注記を追加し、「対応案は適用しない」ことを明記。
  あわせて `gh run list` で AIHints / Cloudflare / Pages の直近 run がすべて success であることを実測し、
  **現時点で未解決の CI 失敗が無い**ことを確定させました。詳細は `2026-07-25_progress_wip-tidy.md` を参照。
- 2026-04-18 に旧進捗ログを整理し、未完了事項は `2026-03-31_remaining-task.md` へ集約しました。
- 2026-04-21 に、4/18 と 4/19 の完了済み progress ログを `.completed` へ整理しました。
- 2026-04-21 に、`_Secondaries` の fallback 優先順位整理ログも完了扱いとして `.completed` へ退避しました。
- 2026-05-11 の棚卸しで、完了済みの `2026-03-31_remaining-task.md`、`2026-04-21_progress_multi-index-display.md` 他を `.completed` へ整理しました。
- 2026-05-15 に、NumberTales #1〜#40 への AIHints フィールド追加（#38除く 39件）を完了しました（addon-ai-tag branch）。
- 2026-06-01 の棚卸しで、`2026-04-21_progress_secondary-commons-defaults.md`・`2026-04-22_progress_requested-tasks-overview.md`・`2026-04-22_remaining-task.md`・`2026-05-29_progress_guideline-consolidation.md` を `.completed` へ退避しました。
- `2026-06-01_remaining-task.md` に、現時点の未完了・着手中タスクを統合しました。
- 2026-06-11 の棚卸しで、`2026-04-22_progress_task1-day-era-softcoding.md`・`2026-04-23_progress_requested-tasks-implementation-plan.md`・`2026-05-11_progress_storyera-schema.md`・`2026-05-15_progress_subfields-wrapper-unification.md`・`2026-06-02_progress_pkg-client-libraries.md`・`2026-06-02_progress_pkg-library.md` を `.completed` へ退避しました。
- 2026-06-11 の addon-ai-tag ブランチ棚卸しで、`2026-05-15_progress_aihints-numbertales-1to40.md`・`2026-05-30_progress_aihints-twolayer.md`・`2026-06-01_progress_aihints-schema-move-fixrefs.md`・`2026-06-01_progress_aihints-vision-final-and-playbook.md`・`2026-06-02_progress_ai-optout-flag.md`・`2026-06-08_progress_aihints-corefolder-enhancements.md`・`2026-06-08_progress_aihints-corefolder-vision-fill.md`・`2026-06-08_progress_aihints-remove-harness-contamination.md` を `.completed` へ退避しました。
- 2026-06-23 の棚卸しで、`2026-06-23_progress_security-ci-audit.md`（セキュリティ/CI 監査・全 7 件完了）を `.completed` へ退避。残留テスト失敗 5 件と軽微確認事項は `2026-06-01_remaining-task.md` へ引き継ぎ済み。
- 2026-06-21 の棚卸しで、10件を `.completed` へ退避しました（bilingual wrapper enrich基盤、IdentityMotif変換、言語トグル、ローカライズ監査、NumberMarkLocation、Stats/Relation/ThisMasters モジュール化、CLAUDE.md統合、ADR-0001 Cloudflare実装）。
- 2026-06-29 の棚卸しで、2026-06-24 〜 2026-06-29 の完了済みファイルをステータス更新。未登録だった 2026-06-27（×3）・2026-06-29（×2）のログを一覧に追加しました。
- 2026-07-03 の棚卸しで、README 掲載漏れを補完し、表記ゆれを修正しました。
- 2026-07-03 の実行対応で、退避候補 A/B（計8件）を `.completed/` へ移動し、`*_DBLink` ブラウザ確認ログを追加しました。
- 2026-07-03 の再棚卸しで、P6完了ログ（bilingual wrapper / Day-Era-Area typedef / secondary UI tidy）を「完了・運用反映済み」へ反映しました。
- 2026-07-03 の実退避で、P6 完了ログ一式 + DBLink ブラウザ確認ログ（計4件）を `.completed/` へ移動しました。
- 2026-07-03 の addon-ai-tag 整理で、未掲載だった `2026-06-19_progress_db-images-phase2.md` / `2026-06-21_progress_addon-ai-tag-api-separation.md` を目録へ反映し、README コンフリクト（2箇所）を解消しました。
- **2026-07-04 の develop 側大規模棚卸しで、後続ログ（`deepl-production-run` 等）で内容が上書き・解消済みと確認できたものを含む 22件を `.completed/` へ一括退避し、README のトピック索引を時系列列挙からトピック別テーブル形式に再構成しました。**
- **2026-07-04 の addon-ai-tag 側棚卸しで、develop からの取り込みマージにより発生した `README.md` / `2026-07-03_current-task-ledger.md` のコンフリクトを解消。あわせて AIHints 関連の addon-ai-tag 固有ログ 10件（実装完了・マージ事故対応完了・棚卸し系ログの後継完了を含む）を `.completed/` へ退避し、直下のアクティブファイル数を 24件 → 14件に削減しました。**
- 2026-07-06 の棚卸しで、`gcal-push-sync`（初回同期・全件一致確認済み）を `.completed/` へ退避。`github-triage` の最新ログをトピック索引へ追加。他の ⚠️ 付きログ（`calendar-color-leap-jp` / `issue-feature` / `fix_calling-schema-duplication` / `dblink-enrich` / `dblink-renderer`）は中身を再確認したが、いずれも未完了タスクが実際に残っているため現状維持。あわせて `.cache/` 配下（一次翻訳・移行バッチ等、既に `data/` へ反映済み・再現可能な一時出力）を全件清掃。
- 2026-07-06 の追加対応で、`calendar-color-leap-jp` は commit `dc38112` 既push・Actions run 28722297754 で期待値どおりの同期結果・ローカル `npm test`（22files/178tests）成功を確認し、`.completed/` へ退避。`issue-feature` はGitHub API経由でテンプレートのデプロイ状態・YAML構造を検証（ブラウザでの最終見た目確認のみUser待ち）。`dict-triples-consolidation` は `777.Jackpot` のClass欠落解消をデータ側で確認したうえで、新クラス名30件をUserへ提示し「全30件、これで採用しよう」と正式採用を確認、`.completed/` へ退避。
- 2026-07-06、P1最優先タスク（`appearance-detail-cleanup`）をPlanモードで設計・実装。`Costume`フィールド新設（`db_meta.json`/`dict_Costume.json`/`appearanceDetail.js`）、`#BodyPart_Interchangeable`・`#BodyPart_FaceMaking`のenum追加、Num8/16/18/23/32/34/35/53/60/61/71/81/99のデータ修正（EN値修正・混在エントリ分割・BodyPart補完・プレースホルダー削除）を実施。`npm test`（22files/178tests）成功、Playwrightでの目視確認済み。`.completed/` へ退避。詳細は`CHANGELOG.md`参照。
- 2026-07-08 の棚卸しで、完了/履歴化済み 8件（`wip-cache-tidy` / 旧 `github-triage` 2件 / `secondary-tailsunit-en` / `tailsunit-appearancedetail-migration` / `tailsunit-layoutdirection` / 旧 `remaining-task` 2件）を `.completed/` へ退避し、未完了タスク母艦を `2026-07-08_remaining-task.md` へ一本化しました。
- 2026-07-08 の addon-ai-tag 追加入棚卸しで、`2026-07-08_progress_addon-ai-tag-tailsunit-aihints.md` を完了扱いで `.completed/` へ退避し、進行中索引から除外しました。
- 2026-07-11 の develop → addon-ai-tag 取り込みマージで発生した `README.md` のコンフリクトを解消。develop側の新規完了（NumberTales `NumberMarkLocation`/`IdentityMotif` 廃止）をトピック索引・系列補足へ反映し、addon-ai-tag側の既存記載（cross-work DBLink監査・github-triage最新版・EarShapeType追従済み表記・AppearanceDetail系Costume完了情報等）は失わず保持しました。
- **2026-07-13 の棚卸しで、「確認待ち」を実際に確認して解消したうえで 17件 を `.completed/` へ退避し、直下を 34件 → 17件（+README）に削減しました。** 単なる仕分けではなく、(1) Playwright + ローカル HTTP サーバーでブラウザ目視 4件（`_DBCrossLinkPath` / TailsUnit 参考画像 / `NumberMarkLocation`・`IdentityMotif` 廃止 / EarShapeType）、(2) 本番実 API での裏取り 3件（R2 復旧・D1 `is_private` 是正・共通資料の Workers 疎通）、(3) コミット状態の確認（`Works_Proxies` 削除済み・`origin/develop` と同期済み）を実施し、その結果を各ログへ追記してから退避しています。創作文言待ち・技術負債は `2026-07-08_remaining-task.md`（母艦 P3 / P4）へ引き継ぎ、`2026-07-03_current-task-ledger.md` も全面改訂しました。詳細は `2026-07-13_progress_wip-tidy.md` を参照。
- **2026-07-14 の develop 側棚卸しで、6件 を `.completed/` へ退避し、直下を 21件 → 15件（+README）に削減しました。** 前回同様、書面の「未完了」を鵜呑みにせず裏取りしてから退避しています。(1) Issue テンプレートの最終確認は、外部ユーザーが Issue #11 を**テンプレート経由で実起票**していたことを `gh issue view` で確認して消化（User の目視確認より強い実地証拠）。この過程で **`data-correction` ラベルがリポジトリに未定義**で、GitHub が未定義ラベルを自動作成せず黙って無視していた不具合を発見し、ラベルを作成して修正。(2) Calling 表示バグの「他作品への影響確認」は、`ForMasterCalling_JP`/`_EN` の suffix 宣言が作品別 typedef に残っていることを発見したものの、ブラウザ実地確認で**表示バグは再現しない**（renderer 側の `parseLangSuffix()` が base 統合するため）と確認し、その挙動を回帰テスト 2 件で固定して消化。詳細は `2026-07-14_progress_wip-tidy.md` を参照。
- **2026-07-14 の addon-ai-tag 棚卸しで、4件 を `.completed/` へ退避し、直下を 17件 → 13件（+README）に削減しました。** `develop` 取り込みマージ（`a1e259d`）で発生した `README.md` のコンフリクト 2 箇所を、**両ブランチの記載をどちらも失わずに**解消（「系列の補足」に develop 側 4 項目と addon 側 AIHints 項目の両方を保持、「整理履歴」も両者を時系列で統合）。あわせて本ブランチ側のログを棚卸ししたところ、**実装がログを追い越している**状態が判明: (1) AIHints 構造的再同期（第1階）は「📝 提案書のみ・実装未着手」と記載されていたが、`--resync-structural` / `_meta` provenance / CI ワークフロー / テスト26件がすべて実在し、実データ 92/92 件へ適用済みだった。(2) `palette-deadlock` ログは親ログに育った結果「残る課題」節が実装結果と自己矛盾していた（`prompt_export` 再生成・`--force` 阻止・CI 自動化はいずれも実装済み）。実データで裏取りし（`palette_priority` 確定 91 件・`_meta` 92/92 件・誤タグ 0 件）、最終状態を各ログへ追記してから退避。**この過程で `docs/ai-hints-usage.md` に `--resync-structural` / `--apply-colorpalette` の記載が欠落していた不備を発見し、§9.10 / §9.11 として追記しました。** AIHints の残課題は `2026-07-14_progress_addon-ai-tag-log-inventory.md` の台帳へ集約（共有母艦はマージ衝突を避けるため使わない）。
- **2026-07-16 の develop 側棚卸しで、6件 を `.completed/` へ退避し、直下を 21件 → 15件（＋棚卸しログ本体 1件で 16件・+README）に整理しました。** 前回同様、書面を鵜呑みにせず裏取りしてから退避。ローカル静的サーバー（`127.0.0.1:8123`）+ Playwright で (1) `global-dict-resolution-fix` の辞書和英併記復旧（所属・種族・性別・作者名、EN モードは英語のみ、4xx/pageerror 0）と (2) `official-links` の公式リンク表示（NT / FLInvestigator78・EN ラベル切替・安全属性）を実地確認して「未実施/確認待ち」を消化。`url-params`（`a36ba32`）と 日次トリアージ 2件、前回の棚卸しログ本体もあわせて退避。残タスクは母艦 P4（Worker `/works` 明示追加）へ引き継ぎ。詳細は `2026-07-16_progress_wip-tidy.md` を参照。
- **2026-07-16 の addon-ai-tag 取り込みマージで、`develop` の 3 コミット（`6c6fbf6` NT DB / `6646d50` 公式リンク / `0b65400` 進捗ログ整備）を一方向マージ。** コンフリクトは前回同様 `_work_in_progress/README.md` の 1 ファイルのみ（3 箇所）で、develop 側の 2026-07-16 更新と本ブランチ固有の AIHints 記載を**両取り**で解消。`global-dict-resolution-fix`（`f78cfdb`）は既に本ブランチへ取込済みだったことを確認（README の「マージ残」記載は stale だった）。退避対象 4 ログはマージによる削除で本ブランチ直下からも除去。詳細は `2026-07-16_progress_addon-ai-tag-merge.md` を参照。
- **2026-07-22 の develop 側棚卸しで、6件 を `.completed/` へ退避し、直下を 24件 → 18件（+README）に整理しました。** User 提示の開発環境（`127.0.0.1:5500`）で Playwright を回し、複合 Index 直リンク 5 ケース（複合条件 2・単一キー 1・エイリアス root 抜き 1・旧形式書き換え 1）がすべて正しいレコードへ解決すること（pageerror 0 / 4xx 0）を実地確認して `composite-index-locator` を消化。あわせて本番実 API で母艦 P4-6（Worker `/works` への `OfficialLinks` 明示追加）が**未対応のまま**であることを実測確認。**棚卸し中に `npm test` の赤 3 件（`data.field-order` ×2 / `pages.characters.ui-output` ×1）が残存していることを確認。原因はいずれも実装バグではなく DB 更新に対する追従漏れ（キー順未整列 2 レコード／`sec_Category` の null 化に追いつかないテストフィクスチャ）と特定し、User 承認のうえ解消して 564 件すべて成功へ回復させた**（詳細は `2026-07-22_progress_wip-tidy.md`）。
- **2026-07-22 の develop 側で、エージェント指示書を `AGENTS.md` 単一正典（SSOT）へ再編し、OpenAI Codex を本採用しました。** 技術・運用ルールの実体が `CLAUDE.md`（512行）と `.github/copilot-instructions.md`（936行）に 2 つあり「両方へ反映する」運用＝二重管理だったものを、`AGENTS.md` へ統合。`CLAUDE.md` は `@AGENTS.md` + Claude 固有の実行環境メモだけの薄い入口へ、`.github/copilot-instructions.md` は `tools/build-agent-instructions.mjs` による**生成物**へ変更。`data/AGENTS.md` を新設して Codex にも `data/` のパススコープ指示が届くようにし、スキルの正典を `.agents/skills/`（`.claude/skills/` は生成ミラー）へ一本化。`npm run agents:build` / `agents:check` と `tests/agent-instructions.sync.test.js` でビルド忘れを検出します。詳細は `2026-07-22_progress_agents-ssot.md`。
- **2026-07-22 の addon-ai-tag 取り込みマージで、`develop` の 2 コミット（`dfe2273` 進捗ログ整備＆テスト回路修正 / `2b30754` GPT Codex導入）を一方向マージし、あわせて本ブランチ側のログを棚卸ししました。** コンフリクトは `.github/copilot-instructions.md` と `_work_in_progress/README.md` の 2 ファイル。**前者は SSOT 化により生成物になったため、本ブランチ固有の AIHints ルール 6 項目（`AI_Optout` / `AI_Unready` / corefolder 強化フィールド / `silhouette_notes` object 化 / NLD テンプレ / 冪等パッチ）を先に `AGENTS.md` の専用節へ移送してから再生成**して解消（単純な再生成では AIHints ルールが消滅するところだった）。移送後に AIHints 系の太字ラベル 9 件・重要キーワード 14 件がすべて生成物へ復元されていることを機械照合で確認。棚卸しでは 2 件を退避し、`--apply-colorpalette` の適用状況を実データで裏取り（`palette_priority` 確定 91/92 件・`_meta` 92/92 件）。詳細は `2026-07-22_progress_addon-ai-tag-merge.md` を参照。
