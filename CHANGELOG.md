# 最新のリファクタリング・仕様変更履歴

### add: データベース改善用に GitHub Issues 機能を追加（サイト連携付き） (2026-07-04)

- **リポジトリ設定**: `radiann-kswg/100BeautiesLab_CreationsDB` の GitHub Issues を有効化。
- **`.github/ISSUE_TEMPLATE/`**:
  - `data-correction.yml` — データ内容の誤り・修正報告用フォーム（対象作品/DB/キャラクター識別情報/該当フィールド/詳細/該当URL）。
  - `feature-suggestion.yml` — 機能・改善提案用フォーム。
  - `config.yml` — 白紙Issueを無効化し、ガイドライン・ホームページへの導線を追加。
- **`pages/characters.html` / `characters.js` / `characters.sass`（`characters.css` も同期反映）**:
  - キャラ詳細表示の `.detail-header` に「⚠ データの誤りを報告」リンク（`#btn-report-issue`）を追加。
  - コントロール行に「⚙ サイト機能を提案」リンク（`#btn-feature-issue`）を追加し、`feature-suggestion.yml` のIssueフォームへ遷移可能に。
  - `buildDataCorrectionIssueUrl()` で表示中の 作品/DB/キャラクター識別情報/現在URL を `data-correction.yml` の各フィールドidへ事前入力し、GitHub Issue作成画面へ遷移させる（サーバー呼び出し無し、静的サイトの制約内で完結）。
  - 言語切替に連動してIssueボタン文言をJP/ENで切替（`#btn-report-issue` / `#btn-feature-issue`）。
  - 非公開キャラクター表示時・一覧表示時はリンクを非表示に維持。
  - `<meta name="asset-version">` を `2026.07.04.1` へ更新。
- 確認: `npm test`（163 tests passed）。ローカルHTTPサーバー + Playwright でキャラ詳細deep link（`?work=NumberTales&db=Primary&idx=2&idxKey=Num`）からのリンク表示・事前入力URL組み立てを目視確認。

### fix: `Relation` のリンク表示名が英名寄りになるケースを修正（pageLang 優先） (2026-07-03)

- **`lib/section-renders/relation.js`**:
  - `Relation` / `RelationTo_*` のリンク名解決に `pickRelationRecordName()` を追加。
  - JP表示時は `Name_JP` 系、EN表示時は `Name_EN` 系を優先するよう統一し、旧互換の `Name` はフォールバックへ移動。
  - 同DB表示（同期）とクロスDBハイドレーション（非同期）で同じ命名優先ロジックを使うように整理。
- **`tests/section-wrapper-common.test.js`**:
  - `pageLang=jp` で `Relation` のリンクラベルが `Name_JP` を優先する回帰テストを追加。
- テスト: `section-wrapper-common` / `pages.characters.ui-output`。

### refine: `sec_Category` / `sec_DesignedBy` の二次創作情報 UI を整理（表示文脈の明確化 + テーブル統一） (2026-07-03)

- **`pages/characters.js`**:
  - `secondaryInfo` セクションを `isSecondaryDbName(dbName)` でガードし、`Secondary` / `SelfSecondary` / `UnprocessedSecondary` 文脈でのみ表示するように整理。
  - セクション内の表示を「タグ + 段落」から `kvTable` ベースへ統一し、基本情報と同じ視認性・読み順に揃えた。
  - `toDisplayNode()` 呼び出しに `recordContext` を渡し、辞書解決の文脈整合を強化。
- **`tests/pages.characters.ui-output.test.js`**:
  - 既存の `secondary metadata fields` 表示テストを維持。
  - Primary 文脈では `sec_*` 値が存在しても `二次創作情報` セクションを出さない回帰テストを追加。
- テスト: `pages.characters.ui-output` / `commons.secondaries`。

### fix: `$display.unit` の和英対応と英語序数化（`0th Gen.`）を追加し、言語切替で別キャラへ飛ぶ不具合を修正 (2026-07-03)

- **`pages/characters.js`**:
  - `formatValueForDisplay()` の unit 処理を拡張し、`$display.unit_JP` / `$display.unit_EN` をページ言語で出し分けるように変更（未定義時は既存 `unit` へフォールバック）。
  - `unit_EN_ordinal: true` 指定時、英語表示で `#Number` 系の値を序数化（`1st/2nd/3rd/...`）してから unit を付与するように対応。
  - `collectIndexEntries()` の比較値 `value` を「表示文字列」ではなく raw 値に変更し、言語切替や表示フォーマット変更の影響を受けない一致判定へ修正。
  - `getIndexIdentifierFromRecord()` を改善し、単一キーで一意に引けない場合は `idxKey=__conditions__` + JSON 条件（複合キー）を生成して同一レコードを再特定できるように対応。
- **`data/Works_UnibyteLive/DataBases/db_type.json`**:
  - `Generation.$display` に `"unit_EN_ordinal": true` を追加（英語表示を `0th Gen.` 形式に統一）。
- **`tests/pages.characters.ui-output.test.js`**:
  - `unit_JP` / `unit_EN + unit_EN_ordinal` の表示回帰（`0期生` / `0th Gen.`）を追加。
  - 単一インデックスが曖昧なケースで複合識別子（`__conditions__`）が生成される回帰を追加。
- テスト: `pages.characters.ui-output` / `wrapper-common` / `enrich.wrapper-summaries`（37 passed）。

### fix: Day wrapper 表示を言語別（JP/EN）へ切替し、`5月19日` / `May.19` を出し分け (2026-07-03)

- **`lib/wrapper-common.js`**: `daySummary` の日付本体を `context.pageLang` で分岐するよう修正。
  - `lang=jp`（既定）: `5月19日`
  - `lang=en`: `May.19`
  - 注釈（`DayAbout_JP` / `DayAbout_EN`）は既存どおり role 解釈に従って末尾へ付与。
- `#List_Month` が読み取れない経路でも、月番号 1..12 を `Jan..Dec` へフォールバックするため EN 表示が安定。
- テスト更新:
  - **`tests/wrapper-common.test.js`**: JP期待値を更新し、`pageLang: 'en'` の `May.19` ケースを追加。
  - **`tests/enrich.wrapper-summaries.test.js`**: enrich の `wrapperSummaries.BirthDay` を JP既定表示へ更新。
  - **`tests/pages.characters.ui-output.test.js`**: 基本情報テーブルの誕生日期待値を JP表示へ更新。
- テスト: `wrapper-common` / `enrich.wrapper-summaries` / `pages.characters.ui-output`（35 passed）。

### add: Day / Era / Area の typedef 駆動を SW/enrich 側へ拡張（role 解釈 + searchable 判定） (2026-07-03)

- **`lib/data-common.js`**:
  - `buildWrapperSummaries()` の wrapper 解決 `typeSources` に `globalMeta` と `mergedVars` 由来 source を追加。これにより `data/db_meta.json` の `General.$VarsDef.$Def_Day.$display.role`（`month`/`dayOfMonth`/`annotation`）を SW/enrich 側でも利用可能にし、field 名依存フォールバック（`Month`/`DayOfMonth` 固定）への依存を緩和。
  - `TypeDefUtils.looksSearchableType()` に `#DictIndex` / `$Def_Day` / `$Def_StoryEra` / `$Def_BaseArea` を追加し、Day / Era / Area 系フィールドを `_enrichment.searchableText` の対象へ typedef 駆動で取り込み。
- **`lib/sw-common.js`**: DB カタログ装飾（bootstrap / `works/{work}/db`）の wrapper summary 解決で `typeSources` に `globalMeta` を追加。
- **`tests/enrich.wrapper-summaries.test.js`**:
  - Day role 定義を vars 側に寄せたケース（`MM`/`DD`/`Note`）で `BirthDay` summary が `1/7（記念日）` になることを追加検証。
  - Day/Era/Area 系型が `_enrichment.searchableText` に含まれることを追加検証。
- テスト: `enrich.wrapper-summaries` / `sw.work-meta-info` / `pages.characters.ui-output`（32 passed）。
- 参照: [`_work_in_progress/2026-07-03_progress_p6-day-era-area-typedef-sw-enrich.md`](_work_in_progress/2026-07-03_progress_p6-day-era-area-typedef-sw-enrich.md)。

### add: bilingual wrapper の UI 列分割表示（StreamingActivity）を `_enrichment.bilingualWrapperFields` 駆動で実装 (2026-07-03)

- **`pages/characters.js`**: enrich メタ `rec._enrichment.bilingualWrapperFields` を path キーで参照する `resolveBilingualWrapperMeta()` を追加。standalone section renderer へ `bilingualColumnsText` と同メタ resolver を helper として受け渡すよう変更。
- **`lib/section-renders/streamingActivity.js`**: `streamingActivitySection` で子フィールドごとに `resolveBilingualWrapperMeta("<親>.<子>")` を照合し、bilingual wrapper（例: `StreamingGreeting` / `ListenerNickname`）は JP/EN を `bilingualColumnsText()` で 2 列表示するルートを追加。既存のタググリッド表示・Summary 表示は維持。
- 目視確認: `Works_UnibyteLive` / `Primary` / `Letter.Generation=5`（S:ナーミィ）で `StreamingActivity` セクション内に `.bilingual-lines-grid` が 2 件生成されることを確認。
- テスト: `pages.characters.syntax` / `pages.characters.ui-output` / `section-wrapper-common` / `enrich.wrapper-summaries`（32 passed）。
- 参照: [`_work_in_progress/2026-07-03_progress_p6-bilingual-wrapper-ui.md`](_work_in_progress/2026-07-03_progress_p6-bilingual-wrapper-ui.md)。

### add: `*_DBLink` タグにクロスワーク参照先の創作名（作品タイトル）を併記 (2026-07-02)

- **`lib/section-renders/dblink.js`**: `dbLinkSection` renderer で、参照先 `_Work` が現在表示中の作品と異なる（クロスワーク）場合のみ、キャラ名リンクの直後に参照先の作品タイトルを併記するようにした（例: `⇒ 零 零（ナンバーテールズ）`）。タイトルは非同期 hydrate で埋め、取得失敗時は無表示のまま（同一作品内の参照には併記しない）。
- **`pages/characters.js`**: `relationApi.getWorkTitle(workKey, lang)` helper を追加。グローバルメタ `CreationWorks.#Works_*.Title_JP / Title_EN` を `fetchGlobalMeta()`（キャッシュ付き）経由で参照し、`lang=jp` は `Title_JP` 優先・`lang=en` は `Title_EN` 優先で返す（和英モード対応）。
- **`pages/characters.sass` / `.css`**: `.tag .dblink-work`（muted・小サイズ）を追加。`pages/characters.html` の `asset-version` を `2026.07.02.1` へ更新。
- テスト: `npm test`（156 passed、回帰なし）。
- 参照: [`_work_in_progress/2026-07-02_progress_jump-dblinkref.md`](_work_in_progress/2026-07-02_progress_jump-dblinkref.md)。

### add: `$enrich` の `$Def_DBLinkRef` 解決で null 入りネストインデックスを許容（1件一致のみ） (2026-07-02)

- **`lib/data-common.js`**:
  - `dbLinkSubsetMatch()`: クエリ側の null を「参照先レコード側も null/undefined」の明示マッチとして扱うよう変更。UnauthedLogica の `Model: { "LogicSeries": null, "Num": null }`（型番未確定インデックス）のような参照を解決可能にした。
  - `dbLinkIndexHasNull()`（新規）: `$Def_DBLinkRef` インデックスに null が含まれるか判定（ネスト対応）。
  - `resolveDbLinkSuffixRef()`: null 入りインデックスは複数レコードに一致し得るため、曖昧一致防止として **1 件一致のみ採用**するガードを追加（null を含まないインデックスは従来どおり先頭一致採用）。
- **`data/Works_UnauthedLogica/DataBases/db_Primary.json`**: `AnotherRegions_DBLink` のインデックスキー誤り `"Num": "N"` / `"Num": "S"` → `"Drc": "N"` / `"Drc": "S"` を修正（SinisterChangingGirls/Primary のインデックスは `Drc`）。
- 効果: SinisterChangingGirls/Primary「六花 雙葉」（Drc: `S`）の `AnotherRegions_DBLink`（→ UnauthedLogica/Primary `Model` 全 null レコード）で `$enrich` マージが機能し、`Height_cm` 等の空値フィールドが参照先から補完されるように。
- テスト: `tests/enrich.dblink.jump.merge.test.js` に成功系（実データ・1件一致）と曖昧一致スキップ（全 null インデックス 2 件一致）の2件を追加。`npm test`（156 passed）。
- ドキュメント: `docs/api-sw-spec.md` §8.2 を新設。
- 参照: [`_work_in_progress/2026-07-02_progress_jump-dblinkref.md`](_work_in_progress/2026-07-02_progress_jump-dblinkref.md)。

### add: `_Jump` に `$Def_DBLinkRef` 形式の `_DBLink` を指定してフィールド単位で参照先を明示できるように (2026-07-02)

- **`lib/data-common.js`**:
  - `EnrichmentProcessor.resolveJumpsWithDbLinkRefs()`（新規）: `{ "_Jump": { "hashTag", "_DBLink": { "_Work", "_DB", "<IndexKey>": <IndexValue> }, "_Search"? } }` 形式の `_Jump` を、レコードルートの `_DBLink`（旧形式・マージ用）が無くても解決・置換できるようにした。参照先の特定は `*_DBLink` suffix フィールドと同じ `resolveDbLinkSuffixRef()`（`$Def_DBLinkRef` 解決・`isPrivate` 除外・ネストインデックス対応）を再利用。解決失敗時は `_Jump` ラッパーを維持し誤置換しない。
  - `enrichRecords()` のステップ 1.75 として組み込み（ルート `_DBLink` 解決より前）。
  - `resolveJumpsInAny()`: 自前 `_DBLink` を持つ `_Jump` はルート `_DBLink` 由来のパスでは置換しないようスキップ条件を追加（二重解決・誤参照防止）。
- **`data/Works_PastDivers/DataBases/db_SemiPrimary.json`**（六花 ルノ）:
  - `BirthDay` の `_Jump` に `_DBLink`（SinisterChangingGirls/Primary の `Drc: "E"`）を明示し、キャラシートで誕生日が表示されるように修正。
  - `AnotherRegions_DBLink` のインデックスキー誤り `"Num": "E"` → `"Drc": "E"` を修正（SinisterChangingGirls/Primary のインデックスは `Drc` のため、旧記述では suffix 解決が常に失敗していた）。
- テスト: `tests/enrich.dblink.jump.merge.test.js` に成功系（実データ参照）と解決失敗時フォールバックの2件を追加。`npm test`（154 passed）。
- ドキュメント: `docs/api-sw-spec.md` §8（順序更新・§8.1 新設）、`docs/db-update-guidelines.md` §6 に追記。
- 参照: [`_work_in_progress/2026-07-02_progress_jump-dblinkref.md`](_work_in_progress/2026-07-02_progress_jump-dblinkref.md)。

### fix: `ChronoizedPurity`（PastDivers）を JP/EN 分割から共有フィールドへ修正 + `data/` 全体の JP→EN 未指定箇所を下書き翻訳 (2026-07-02)

- **`data/Works_PastDivers/DataBases/db_type.json`**: `ChronoizedPurity_JP`（`#String|#String_withAbout`）/`ChronoizedPurity_EN`（`#String_EN|#Null`）の2エントリ構成を、`BustSize` と同じ単一フィールド構成（`ChronoizedPurity`・`hashTag_JP`+`hashTag_EN`両持ち・`$display.langMode: "shared"`）に統合。値がパーセンテージ範囲の数値文字列のみ（例: `91.70-97.11%`）で言語に依存しないにもかかわらず、2026-06-22 の JP/EN 命名標準化作業で機械的に `_JP` サフィックスが付与され、`_EN` 側は一度も入力されていなかった（13レコード中0件）ことが判明したため。
- **`data/Works_PastDivers/DataBases/db_Primary.json`**: `ChronoizedPurity_JP` キーを全13件 `ChronoizedPurity` へリネーム（値は変更なし。`{value, about_JP}` 併記形の `about_JP`/`about_EN` はそのまま翻訳対象として維持）。
- **`data/` 全体の JP→EN 未指定箇所の下書き翻訳**: 一回限りの調査（scratchpad・非コミット）で `data/` の記録系ファイル（`db_*`/`ref_*`/`dict_*`/`trans_*`。スキーマ・メタ系ファイルと `.private/` は除外）を走査し、`localize-en-draft` Skill の手順で下書きを補完:
  - `data/Works_NumberTales/DataBases/db_Primary.json`: `CodeName_EN`（80/90/99番機、§3-1 の桁別変換規則で機械算出）3件、`ConversationPattern.DialogueExamples` の `value_EN`/`about_EN`（2(Twiny)・3(Treiya)・5(Fifa)、GenderType別代名詞ルールに準拠）5件。
  - `data/Works_NumberTales/References/ref_Reference.json`: `Summary_EN`（ヒューマノイド原則法、既存ファイル内パターンに整合）1件。
- 背景: `npm run deepl:build-glossary` の衝突調査（本ファイル前項）に続き、DeepL 用語集とは別に「そもそも `_EN` が未入力の箇所」を User から一通り洗い出すよう依頼された。初回スキャンは `dict_RaceType.json` 等の「素キー=EN・`_JP`が和名」パターン（`extractPairs()` と同型）を誤検知していたため（117→16件に絞り込み）、`obj[base]` が非空文字列なら EN 既存とみなす判定を追加して除外した。`ChronoizedPurity` は残る候補のうち唯一「数値のみで翻訳判断を要さないのに全件未入力」という不自然な傾向を示したため User に確認したところ、`BustSize` 同様の共有フィールド化が妥当と判断し、今回のスキーマ修正に至った。
- 検証: JSON構文確認（両ファイル）、`npm test`（152 passed）。
- 参照: [`_work_in_progress/2026-07-02_progress_data-en-gap-fill.md`](_work_in_progress/2026-07-02_progress_data-en-gap-fill.md)。

### fix: DeepL 用語集ソース生成の EN→JA 衝突を構造的に解消（併記形の分割・単数/複数の除外） (2026-07-02)

- **`tools/deepl/build-glossary-source.mjs`**:
  - `splitMultiForm()`（新規）: `Term_EN` に `"WDCE. / the \"World Development & Creation Era\""` のように略号と全文が併記されているエントリを、`/`（前後空白必須）または改行で分割する。`Demotion/Retrograde` のような複合語中のスラッシュ（前後空白なし）は分割しない。
  - `buildJaEnMap()`: 併記形は**先頭断片**（本文中で優先的に使われる略号・優先表記）を JA→EN の訳語として採用するよう変更。
  - `buildEnJaMap()`: 併記形は**分割後の全断片**を個別の EN ソースキーとして登録するよう変更。これにより `ref_Society.json` の世代呼称（`WDCE.` 系）で、`Term_JP` 由来のペアと `Aliases` 由来のペアが同一の結合文字列キーに集約されて衝突していた問題（EN→JA 10件中ほぼ全てが自己参照ノイズ）を解消。
  - `isPluralPair()`（新規）: 単数形/複数形だけが異なる EN 候補（例: `Regiowner`/`Regiowners`）を検出した場合、JA→EN 用語集への登録を見送り `[文法差につき用語集登録なし]` として `glossary-conflicts.md` に候補を併記するのみに変更。JP側は文法上の数を持たないため、用語集で強制的に片方へ固定すると逆の文脈で誤訳になるため。EN→JA は元々キーが異なり衝突しないため両方とも正しく登録される。
  - `buildEnJaMap()`: `Term_JP` 由来（正式名）のペアと `Aliases` 由来（通称・略称）のペアが同一 EN キーで衝突した場合も同様に**登録を見送る**よう変更（`registerDependent`）。冗長な説明文では通称・略称、該当語自体を定義・説明する文では正式名という文脈依存の使い分けがあり、EN→JA の単一キーには機械的に固定できないため。`glossary-conflicts.md` に `[文脈依存につき用語集登録なし]` として両論併記し、訳出時は人間が文脈判断する運用にした。
- **`data/References/ref_Society.json`**: `Aliases` からEN側の略号トークン（`WDCE.` / `WDC.VII` / `WDP.VII` / `WDC.VIII` / `WDP.VIII`）を削除（本来 JP 別表記のためのリストに EN トークンが紛れていたのが上記衝突の一因だったため）。JP側の本当の別表記（`創世記` 等）は維持。
- 背景: `npm run deepl:build-glossary` 実行時に EN→JA で 10 件の衝突が発生し、内容（文字化けした端末表示）から原因が分かりにくいとの相談を受けて調査。実際は「略号/全文併記」構造がスクリプト側で考慮されていなかったことが主因で、`創造主`（Regiowner/Regiowners）は本当の単数/複数の表記揺れ、残る10件は「正式名 vs 通称」の文脈依存の使い分けだった。いずれも用語集の単一キーには機械的に固定できないため、強制登録せず人間判断に委ねる方針で統一した。
- 検証: `npm run deepl:build-glossary` で `WDCE.` 系の自己参照ノイズが解消し、JA→EN・EN→JA 双方に略号・全文の両方が個別に登録されることを確認（`WDCE.`→`創世期`、`the "World Development & Creation Era"`→`創世期` など）。`創造主` は JA→EN から、`WDC.VII` 系10件は EN→JA から自動除外され、それぞれ `[文法差につき用語集登録なし]` `[文脈依存につき用語集登録なし]` として記録されることを確認。`npm test`（152 passed）。
- ドキュメント: `docs/deepl-localization.md` §8（新規、§8-1〜8-3）に分割ロジック・単数複数・正式名/通称の扱いを追記。
- 参照: [`docs/deepl-localization.md`](docs/deepl-localization.md) §8。

### add: DeepL 下書き翻訳の Python 版 + Claude 自身が翻訳する Skill を追加 (2026-07-02)

- **`tools/deepl_py/`（新規）**: `tools/deepl/draft-translate.mjs`（Node 版）の Python 移植。外部ライブラリ非依存（標準ライブラリの `urllib`/`json`/`re`/`argparse` のみ）。
  - `deepl_client.py`: DeepL REST API 薄いクライアント（`translate()` / `list_glossaries()`。`.env` 自動読込）。用語集の作成・同期は Node 側に一元化し、Python 側には持たせない。
  - `pronoun_normalize.py`: `tools/deepl/pronoun-normalize.mjs` の 1:1 移植（GenderType 別代名詞の確定的正規化、一人称混入・呼称不一致の検知）。Node 版と同じテストケースで出力一致を確認済み。
  - `draft_translate.py`: CLI 本体（`--work --db --id --under --field --limit --apply`）。`.cache/deepl/glossary-ids.json`（Node 版が生成）を共用し、`.cache/deepl/draft-report.md` も Node 版と同じ形式で出力。
  - 用途: Node 環境が無い開発機、または本リポジトリをサブモジュールとして持つ外部リポジトリから Python でローカライズ作業を行いたい場合。`pkg/`（DB 読み取り専用クライアント群）とは目的が異なるため `pkg/` 配下には置かず `tools/deepl_py/` に配置。詳細は [`tools/deepl_py/README.md`](tools/deepl_py/README.md)。
- **`tools/deepl/draft-translate.mjs` に `--field` オプションを追加**: トップレベルの `field_EN` 名で絞り込む（例: `--field Summary` で `Summary_EN` のみ対象）。Python 版にも同時実装。
- **`.claude/skills/localize-en-draft/SKILL.md`（新規）**: Node/Python の下書き翻訳ツールは「既存の `field_EN` キーが空値のときだけ」を対象にし新規キーは追加しないため、まだ一度も `_EN` フィールドが書かれていないレコード（新規キー挿入が必要なケース）向けに、Claude Code / Cowork のセッション内で Claude 自身が `docs/localization-en-rules.md` に従って翻訳・挿入する手順を Skill として型化した。DeepL の MCP コネクタは対話セッション専用でスクリプトから呼び出せないための代替導線。
- 背景: `Works_FLInvestigator78/DataBases/db_Primary.json` の `Summary_JP` はあるが `Summary_EN` キー自体が存在しないレコード（ドゥームズ・ルネ）を手動翻訳した際、(1) 同じ作業を Python からも自動化したい、(2) DeepL の MCP コネクタでは自動化できない旨の要望・質問を受けて対応。
- ドキュメント: `docs/deepl-localization.md` に §2-1（Python 版）・§2-2（Skill）を追加、§3-4 に Python 実行例・`--field` 説明を追記、§6 参照表を更新。
- 検証: `npm test`（152 passed）。Python 側は `pronoun_normalize.py` を Node 版テストと同一ケースで手動突き合わせ、`draft_translate.py` は `translate()` をモック化したフィクスチャで候補抽出・`--field` 絞り込み・`--apply` 書き戻し・スキップ挙動（既存値保持）・レポート出力を確認（DeepL API 呼び出し自体は API キー未設定のため未検証）。
- 参照: [`docs/deepl-localization.md`](docs/deepl-localization.md) §2-1/§2-2。

### add: DeepL 下書き翻訳をキャラ文脈（GenderType・呼称）対応に強化 (2026-07-02)

- **`tools/deepl/pronoun-normalize.mjs`（新規）**: `GenderType`（`FemaleNeutral`/`Female`→she, `MaleNeutral`/`Male`→he, `Neutral`→ze/zir, 未設定→avoid）から代名詞ポリシーを決定し、英文中の代名詞トークンを確定的に正規化する純粋関数群。あわせて一人称混入（`I`/`my` 等）・呼称不一致（`ForMasterCalling_EN` に無い `big bro/sis` 等）を検知するが、これらは自動修正せず警告のみ（文法崩壊やレコード固有の誤爆を避けるため）。
- **`tools/deepl/draft-translate.mjs`（新規・`npm run deepl:draft`）**: `data/Works_*/DataBases/db_*.json` の空 `*_EN` フィールドを再帰走査で収集し、同一レコードの `GenderType`/`ForMasterCalling_EN` 等を踏まえて DeepL 下書き翻訳を行う。代名詞は上記モジュールで正規化、DeepL の `context` パラメータ（`deepl-client.mjs` に追加）もベストエフォートのヒントとして付与。既定では `.cache/deepl/draft-report.md` へレポート出力するのみでデータは書き換えず、`--apply` 指定時のみ**警告が一つも無い候補だけ**を対象レコードの空 `_EN` へ書き戻す。警告付き候補は常にレポート止まり。
- 背景: DeepL は LLM ではなく NMT のため文脈指示に確実には従わない。既存の `evaluate-translations.mjs`（突き合わせ）は書き換えを行わない設計だったが、新規の空 `_EN` を埋める下書き作業では代名詞・呼称の食い違いが頻発していたため、確定的な後処理で補う設計とした。
- テスト: `tests/deepl.pronoun-normalize.test.js`（純粋関数のみ、DeepL API 呼び出しは対象外）。
- 参照: [`docs/deepl-localization.md`](docs/deepl-localization.md) §3-4。

### fix: `/pages/v1/deftype/global` 等が `$DefType` を欠落させる不具合を修正 (2026-07-01)

- **`lib/sw-common.js` `ApiEndpointHandlers.mergeMetaAndTypeVars()`**: `db_type.json` 側の `$VarsDef` / `$MetaType` は合流していたが、**`$DefType`（hashTag / `$dict` 宣言の配列）を結果へコピーしていなかった**。これにより `/pages/v1/deftype/global` と `/pages/v1/works/{work}/meta` のレスポンスから `$DefType` が丸ごと欠落していた。
- 影響: `pages/characters.js` の `findDictNameInSchema()` は `globalDefType.$DefType` を見て「フィールド名→辞書名」（例: `Belonging` → `Faction`）を解決するが、`$DefType` が無いためこの解決が常に失敗し、フィールド名と辞書名が異なる項目（`Belonging`/`FromArea` 等）は EN 表示時に辞書引きへフォールバックできず**未翻訳の生JPテキストがそのまま表示**されていた（`Class` のようにフィールド名＝辞書名の項目は `fn`/`keyBase` 経由のフォールバックで偶然救われていたため気付かれにくかった）。
- 本タスクの `scopeField` 実装とは無関係の既存バグ（今回 Belonging の英語表示崩れを調査する過程で発見）。`type.$DefType` が配列で存在する場合は結果へ `result.$DefType = type.$DefType` として含めるよう修正。
- 検証: Playwright（headless Chromium）で `pages/characters.html?work=Works_SinisterChangingGirls&...&lang=en` を実描画確認。修正前は `Belonging: 百花繚乱研究所`（生JP）だったのが、修正後は `Belonging: HundredBeauties Laboratory` と正しく英訳されることを確認。`npm test` も従来通り 135 passed（既知の無関係2件のみ失敗）。

### 辞書ファイル単位のスコープ条件（`scopeField`）— Belonging別Class辞書の参照解決 (2026-07-01)

- **`data/Dictionaries/db_meta.json`**: `Dictionaries.#Dict_SymphonyXVI` に `"scopeField": { "Belonging": "シンフォニー.XVI(ゼクズィン)" }` を追加。辞書カタログエントリに任意で「その辞書ファイル1本まるごとがどのフィールド＝値のキャラクター向けか」を宣言できる汎用機構（複数キー指定でAND条件）。
- **`data/Dictionaries/dict_SymphonyXVI.json`**: 行ごとのタグ付けは不要（`scopeField` 側にフィールド名・値の両方を持たせたため）。
- **`lib/sw-common.js` / `pages/characters.js`（直fetchフォールバック） / `tests/pages.characters.ui-output.test.js`（テストフィクスチャ）**: 辞書読み込み時（`readDictionaryBundle()` / `fetchDirectDictionaryBundle()` / `loadDictionaryBundle()`）に、カタログの `scopeField` を辞書の全行へ自動合成するよう統一。行側に同名キーがあれば行を優先。
- **`pages/characters.js`**:
  - `findDictScopeCondition()`（旧 `findDictScopeField()`）: カタログから `scopeField` 条件オブジェクトを取得するよう変更。
  - `resolveVarsDefLabelPack()` に第6引数 `recordContext`（対象レコード）を追加。`scopeField` の全キーが同一レコードの対応フィールド値と一致する行を優先解決し、一致が無ければ `scopeField` を持たない共通行へフォールバックする（`rowMatchesRecordScope()` / `rowHasScopeTag()`）。`recordContext` 省略時は従来通りスコープ無視（後方互換）。
  - `formatValueForDisplay()` の `opt.recordContext` を経由して主要な呼び出し箇所（一覧chip・詳細テーブル・関連キャラプレビュー等）へ配線。
  - `mergeVarsDefLayers()` 新設: global/Localization/作品別の `$VarsDef` と `Dictionaries` カタログを、単純な object spread（先勝ち/後勝ち）ではなく「配列は連結・objectは浅いマージ」で合成するよう修正。これにより、global辞書（`#Dict_SymphonyXVI`）と作品別辞書（`data/Works_NumberTales/Dictionaries/dict_Class.json` の `#Dict_Class`）が同じ `compatListKey`（`#List_Class`）を共有していても、作品別辞書に上書きされて global 側が参照不能になる既存の不具合を解消。
- **`docs/schema-meta-processing.md`**: §3.4.1 に `scopeField`（辞書ファイル単位の条件）の仕様と `mergeVarsDefLayers()` の合成方針を追記。
- 背景: NumberTales「錦野 舞」の `Class: ["...", "ベヴストザイン課 D-Vines開発部"]` が、作品別の汎用クラス辞書（`dict_Class.json`）に無い値のため、既存実装では常に未解決（生文字列表示）だった。所属（`Belonging: ["シンフォニー.XVI(ゼクズィン)"]`）を軸に専用辞書 `dict_SymphonyXVI.json` を参照できるようにして解消。
- 詳細は `_work_in_progress/2026-07-01_progress_class-dict-scope-field.md`。

### `README.LOCAL.md` ローカル作業メモ運用ルール追加 (2026-07-01)

- **`CLAUDE.md`**: 「サブローカル並行作業運用（予備作業場）」節の直後に **「`README.LOCAL.md`（ローカル環境ごとの作業メモ）」** 小節を新設。
- **`.github/copilot-instructions.md`**: 同節を同等内容で反映（指示書の両反映ルールに準拠）。
- 決定事項: `README.LOCAL.md` は `.gitignore` 対象（既存）の**ローカル専用メモファイル**で、各ローカルクローン固有の情報（物理パス・作業中ブランチ・引き継ぎ注意点等）を記録する用途に限定。複数ローカル横断で共有すべき正式な進捗・決定事項は引き続き `_work_in_progress/` に記録し、`README.LOCAL.md` はその代替にはしない。パス以外の内容は User が手動追記する前提とし、Claude/Copilot が創作内容や未確認の推測を書き込まない。
- 詳細は `_work_in_progress/2026-07-01_progress_readme-local-agents-rule.md`。

### Copilot 英訳(\_EN)入力補助 — 用語集対応 (2026-07-01)

- **`.github/instructions/localization-en.instructions.md` 新規追加**: `applyTo: data/**/db_*.json, trans_*.json, ref_*.json, dict_*.json`。Copilot Chat/Agent/Edits が `_EN` を補助するときの追加ルール（既存値の上書き禁止・創作本文の新規生成禁止・固有名詞は辞書対訳固定・`hideText` 尊重・最終採否は User）と、外しやすい中核固有名詞（種族・組織）のインライン早見を収録。
- **`docs/localization-glossary-quickref.md` 新規追加（生成物）**: 監修済み辞書（`trans_*`/`ref_*`/`dict_*`）から抽出した固有名詞 JP↔EN 対訳（164 件）を出典別に整形。Copilot Chat 参照用＋インライン補完（ゴーストテキスト）の隣接タブ文脈用。**インライン補完はカスタム指示を読み込まない**ため、早見表を開いて近傍文脈に入れる運用。
- **`tools/deepl/build-copilot-quickref.mjs` 新規追加 / `npm run deepl:build-quickref`**: 上記早見表を `glossary_source.json`（`deepl:build-glossary` の出力）から再生成するジェネレータ。辞書更新時に作り直す。創作本文は元スクリプト側で除外済み。
- **導線追記**: `.github/copilot-instructions.md`・`CLAUDE.md`（主要ドキュメント参照先表）・`docs/deepl-localization.md`（§6 参照先）に相互リンクを追加。
- 仕組み上の注意: カスタム指示ファイル（`copilot-instructions.md` / `*.instructions.md`）が効くのは Chat/Agent/Edits のみで、インライン補完には直接効かない（英訳精度はデータの `_JP`/`_EN` 近接＋早見表の隣接タブ提示で補う）。
- 作業ローカル: sub1（`develop`）。`data/**` は未変更（回帰対象外）。`node_modules` が Windows ネイティブのためサンドボックスで `npm test` 不可 → 本体/Windows で `npm.cmd test` 確認を推奨。詳細は `_work_in_progress/2026-07-01_progress_copilot-localization-en.md`。

### AppearanceDetail 型付きスキーマ改修 — develop 統合 (2026-06-29)

- **`$Def_AppearanceDetail` / `$Def_AppearanceAttr` 正式スキーマ化**: `data/db_meta.json($VarsDef)` に `$Def_AppearanceDetail` / `$Def_AppearanceAttr` の `$DefType` を追加。`data/db_type.json($DefType)` の `AppearanceDetail` フィールドに `"$type": "$Def_AppearanceDetail[]|#Null"` / `"searchable": false` / `"$display.sectionWrapper": "appearanceDetailSection"` を宣言。`$ScalarDef` に `#Hexcode` / `#Hexcode_Color` の base type を追加。
- **`lib/section-renders/appearanceDetail.js` 新規追加**: `$Def_AppearanceDetail[]` を描画する専用セクションレンダラー。Formation でグループ化し、各エントリを「DesignElement / BodyPart / Laterality タグ ＋ 属性リスト（`vdict_*` / `value_Num_*` / `value_JP` / `about_JP`）＋ 補足テキスト」として描画。`$EnumDef_*` を global+local でマージ（`getMergedEnumDef`）し、NT ローカル辞書（`$EnumDef_DesignElement` 等）と global 辞書（`$EnumDef_DesignBodyPart` 等）の両方に対応。
- **NT Primary `db_Primary.json` 大量更新**: 旧形式の uppercase `Value_JP` / `Value_EN` を規約駆動の `value_JP` / `value_EN` へ全件移行（97 レコード × 複数エントリ）。`Formation: null` / `Laterality: null` の省略化・整合も実施。
- **`pages/characters.js` 修正 2 件**:
  - `quickStats` を **opt-in 専用** に変更（`$DetailLayout.quickStats` 配列が明示されている作品のみヒーロー帯に表示。未設定時は全 basicFields をテーブルに表示し、ヒーロー帯には出さない。以前は未設定時も先頭 3 項目を誤ってヒーロー帯に出していた）。
  - `AppearanceDetail` renderer import 追加（`lib/section-renders/appearanceDetail.js`）。
- **テスト修正 3 件** (既知失敗の解消):
  - テスト「`正式名称` が `''` を返す」「`Model Number` が `''` を返す」: quickStats opt-in 修正に伴い解消。
  - テスト「`資料名` が `''` を返す」: NT References メタフィクスチャに `#Ref_Reference` を追加し、fetch モックに NT References typedef ハンドラを追加して解消。
- **テスト新規追加 5 件** (Phase E):
  - `data.shape.test.js`: AppearanceDetail 正式スキーマ検証（`$DefType` 宣言・`$ScalarDef`・`$Def_AppearanceAttr` 内容・NT Primary uppercase フィールド件数）。
  - `pages.characters.ui-output.test.js`: NT キャラ #9 の AppearanceDetail セクション描画検証（折りたたみセクション・辞書解決ラベル・`vdict_*` / `value_Num` の表示）。
- Vitest: 136 テスト全 pass（修正 3 + 新規 5 込み）。
- ブランチ: `refactor-appearance-detail` → `develop` → `addon-ai-tag` の順でマージ・push 済み（Phase 0–3 完了）。詳細は `_work_in_progress/2026-06-29_progress_appearance-detail-merge-integration.md`。

### ローカライズ辞書 — 大陸名の英語表記統一 (2026-06-28)

- **`南雌大陸` の英訳を `Ivesouth Mainland` に統一**（`Evesouth Mainland`／`Ivesouth Continent` の表記不一致を解消）。対象: `data/Dictionaries/dict_Area.json`・`data/Localization/trans_PlaceName.json`・`data/References/ref_Region8.json`。
- **`然天大陸` の英訳を `Naitus Mainland` に統一**（`Naitus Continent` を是正）。対象: `data/References/ref_Region8.json`。
- これは DeepL 用語集再生成時の「読みグロス正規化」が炙り出した真の表記不一致への対応（User 判断）。修正後、用語集ソースは JA→EN 144／EN→JA 138 で**衝突 0**。DeepL 用語集も再登録（疎通確認済み: `南雌大陸→Ivesouth Mainland`／`然天大陸→Naitus Mainland`）。
- 作業ローカル: sub2（`develop`）。`data/**` 変更のため、本体ローカルで `npm test`（Vitest）の確認を推奨。

### DeepL 用語集 — 読み仮名グロス正規化（衝突対策） (2026-06-28)

- **`tools/deepl/build-glossary-source.mjs` v1.1**: 読み仮名併記形（`漢字(かな)`、例 `算象(アリスマ)諸国`）と素形（`算象諸国`）が同一 EN に対応して **EN→JA で衝突**する問題を構造的に解消。`stripReadingGloss` を追加し、「漢字直後のかなのみ丸括弧」だけを読みグロスとして検出（`(後天的)`/`(拡張装備あり)` 等の修飾括弧は誤爆させない）。
- **EN→JA**: 訳先 JP は常に素形を採用（機械訳にフリガナを混ぜない／素の漢字形を正とする）。**JA→EN**: グロスを剥いた素形もソースへ自動追加し、素形・併記形どちらの入力でも英訳が効くようにした（マッチ網羅の拡張）。
- **衝突ログの意味変更**: 読みグロス差は自動正規化され `glossary-conflicts.md` に出なくなり、残るのは「素形でも EN が食い違う」真の衝突のみ。これにより既存データの英語表記不一致 2 件（`南雌大陸`: Evesouth Mainland vs **I**vesouth Continent / `然天大陸`: Naitus **Mainland** vs **Continent**）を検出（User 判断で正規化）。
- 用語集を再登録: JA-EN 142→144（素形展開分）・EN-JA 140。`docs/deepl-localization.md` に §7「読み仮名グロスの正規化」を追記。作業ローカル: sub2（`develop`）。

### DeepL 翻訳 — 創作 DB ローカライズ運用の組み込み (2026-06-28)

- **監修済み辞書から DeepL 用語集を生成する仕組みを追加**: `data/Localization/trans_*.json` / `data/References/ref_*.json` / `data/Dictionaries/dict_*.json` の JP↔EN 対訳を抽出し、双方向の DeepL 用語集として登録できるようにした。固有名詞（作品名・地名・人物名・種族名等）の訳語ブレを防止。文章系フィールド（`Summary`/`BodyBlocks`/`about` 等）は用語集対象外。
- **`tools/deepl/` 新規スクリプト群**: `build-glossary-source.mjs`（辞書走査→用語集ソース TSV/JSON 生成・キー型自動判定・衝突ログ出力）、`deepl-client.mjs`（DeepL REST API 薄いラッパ・`.env` 自動読込・Node 18 対応）、`sync-glossary.mjs`（同名削除→再作成方式で用語集更新・`glossary_id` 書き戻し）、`evaluate-translations.mjs`（既存 `_EN` と DeepL 機械訳の突き合わせレポート・**データ書き換えなし**の添削補助）。
- **DeepL 用語集を実登録**: `100BL-CreationsDB JA-EN`（142 件）/ `100BL-CreationsDB EN-JA`（140 件）を作成。疎通確認で固有名詞（NumberTales / LotusNinea / Shôbai Technology / Zera Norumber 等）が正規表記に固定されることを確認。
- **npm スクリプト追加**: `deepl:build-glossary` / `deepl:sync-glossary` / `deepl:eval`。
- **ローカル環境設定**: `.env.example`（`DEEPL_API_KEY`）追加、`.gitignore` に `.env` 系を追加。生成物は `.cache/deepl/`（Git 管轄外・再生成可能）。
- **ドキュメント**: `docs/deepl-localization.md`（運用ガイド：用語集の仕組み・ワークフロー・方向別運用・添削補助・上書き禁止の境界・既知の制約）を新規作成し、`docs/localization-en-rules.md` §8 から相互リンク。
- **運用原則**: 既存 `_EN`/`_JP` の自動上書き禁止・創作本文の自動生成禁止を厳守。DeepL は「既存対訳の一貫適用」と「英訳突き合わせ（添削補助）」に限定。
- 作業ローカル: 本体（`develop`）。詳細は `_work_in_progress/2026-06-28_progress_deepl-localization.md`。

### サイトUI 紺×水色サイエンスファンタジー化 — テーマCSS＋キャラ紹介ヒーロー帯 (2026-06-27)

- **共通デザインシステム（`pages/characters.sass` / `pages/characters.css`）を「紺×水色 近代サイエンスファンタジー」へ刷新**: `:root` パレットを再設計（`--bg`/`--card`/`--accent`/`--border` ほか値変更）し、新トークン `--bg-deep` / `--panel` / `--accent-bright` / `--azure` / `--glow` / `--border-strong` を追加。既存変数名を維持して `var(--*)` 参照を一括追従させる最小差分方式。
- **空気感の追加**: `body` に紺グラデーション背景、`body::before` で微細グリッド＋星屑テクスチャ。`.site-header` を紺ガラス＋上端発光ライン、`.site-header h1` / `.name` を白→水色グラデーション文字。`.card` をガラス質＋14px角丸＋影、`.card h2` に左端の水色発光バー（`.detail-header h2` は抑制）。`.poster` を発光ボーダー＋内側グロー、`.pill` / `th` / `.tag` の可読性向上。
- **API GUI（`api/stylesheet.sass` / `api/stylesheet.css`）を同テーマへ統一**: 紺グラデ背景・ガラスカード・水色ボタン/フォーカス・深紺の出力エリア。
- **キャラ紹介ヒーロー帯（`pages/characters.js` + CSS）**: 詳細ビューを「枠付き発光バナー」構成へ再構成。`.detail` を縦積みにし、上部 `.detail-hero`（`.detail-hero__portrait` 縦長ポートレート ＋ `.detail-hero__main` 名前見出し/英名/チップ/クイックステータス）、下部 `.detail-body`（ギャラリー＋各セクション）を全幅で配置。`.detail-hero` は発光ボーダー＋上端アクセントライン＋ラジアルグロー（初回モックアップ準拠）。クイックステータス `.detail-quickstats` / `.detail-stat` は **`$DetailLayout.quickStats` を明示した時のみ**表示し、表示項目は基本情報テーブルから除外する（**1 項目 1 箇所**の原則・重複表示の防止）。既定では非表示。値解決は基本情報テーブルと同じ `resolveBasicField` を再利用。DOM は再構成したが `img.poster` / `.name-en` / `.kv-table` / `.section` 等の要素・クラスは保持し、全 UI 回帰テストのセレクタを維持。
- **`pages/characters.html`**: `<meta name="asset-version">` を `2026.06.27.1` に更新（キャッシュ反映）。
- 検証: jsdom で `renderDetail` を直接実行し、ヒーローバナー構成・クイックステータス生成・既存要素維持を確認（13/13・重複解消/既定オフ含む）。`.css` は正なる `.sass` から再コンパイルして整合（編集ツールの大容量ファイル末尾切断を `sass` 直生成で復旧）。Vitest 本体はローカルで実行（当環境は `rolldown` ネイティブバイナリ不在のため起動不可）。
- **クラッタ低減 / 視線誘導**: 背景テクスチャ（グリッド＋星屑）を `opacity 0.5 → 0.28` に抑制。ヒーローは発光控えめの静かな見出し帯（`--border` / `--shadow-md`、上端アクセントは細く）に調整し、ポートレートは `max-height` でバランス。`.detail-header h2`（#detail-title）はパンくず的に控えめ化し、ヒーローの名前を唯一の主役にして重複感を解消。
- **情報量バランス / 可読性 / サイズ感**: ヒーローを大きめ（ポートレート clamp 最大320px・名前 clamp 最大40px）にして余白の間延びを解消。既定でヒーローに基本情報先頭3項目の「要約タイル」を表示し、その項目はテーブルから除外（**1 項目 1 箇所**・重複なし）。詳細ギャラリーは `minmax(240px, 1fr)` の多列、本文系フォントは 15〜16px に拡大、テーブル行間も拡張。
- 詳細は `_work_in_progress/2026-06-27_progress_sci-fantasy-theme.md`。

### ロールプレイ／AGENTS.md 設定の整理・正典化 (2026-06-27)

- **`AGENTS.md`（リポジトリ直下）を新規作成し、扇一春ロールプレイ仕様の「正典（source of truth）」に集約**: 役割・人物像・口調（一人称/二人称/三人称）・OK/NG 口調例・制約・入口ファイル関係表を一本化。AGENTS.md 規約に従うエージェントの入口も兼ねる。
- **`CLAUDE.md` の `@import` バグ修正**: バックスラッシュエスケープでパス解決不能だった `@.github/\_roleplay-datas/...` を `@AGENTS.md` に修正。Cowork 等の `@import` 非展開環境でも声が届くよう、圧縮版「声カード」（一人称/二人称/OK・NG 例）をインライン保持。
- **重複削減**: `.github/copilot-instructions.md` のロールプレイ節をバナー＋正典参照＋最小声カードに圧縮。`.github/instructions/roleplay.instructions.md` も正典参照＋圧縮版声カード化（フル複製を解消）。`roleplay-technical.instructions.md` は現状維持。
- **リマインダー分散**: 巨大指示書の前半に `[ロールプレイ継続]` リマインダーを追加（CLAUDE 4 / copilot 3 箇所）。
- **付随修復**: 保存事故で末尾が途中切断されていた `CLAUDE.md` / `.github/copilot-instructions.md` / `CHANGELOG.md` の末尾を HEAD から復元。
- 作業ローカル: sub1（`develop`）。

### サブローカル並行作業の運用ルール追加 (2026-06-27)

- **`CLAUDE.md` / `.github/copilot-instructions.md` に「サブローカル並行作業運用（予備作業場）」節を追加**: 同一リモートを参照する複数ローカルクローン（本体ローカル + 汎用予備作業場のサブローカル ×2）の運用ルールを明文化。
- **発動条件**: Claude / AI エージェントは、本体ローカルと同時作業できない状況（特に本体が特定ブランチで作業中に別ブランチを並行する必要があるとき）では、サブローカルでの別ブランチ作業を自律判断で行う（当該状況では必須）。
- **安全則**: 着手前の `git branch --show-current` / `git status` 確認、同一ファイルの多重編集回避、`push`/`pull` による同期明示、`_work_in_progress/` への横断作業ログ記録、既存「ブランチ運用方針」の遵守。
- **配布方式**: git 管理ファイルへの記載で全ローカル環境へ commit / pull 経由共通配布（個別ローカルへの手書き複製は行わない）。`develop` ブランチに反映。

### カレンダー ICS 生成 — SUMMARY 改行バグ修正 (2026-06-26)

- **`tools/build-calendar-ics.mjs` SUMMARY 改行問題を修正**: `Name_JP` に改行文字が含まれるキャラクター名（例: `バイナ\n2(ツギ)`）が ICS の `SUMMARY` フィールドにそのまま流れ込み、Google Calendar のインポート・購読パースが失敗していた問題を修正。`summaryName` 変数を追加し、SUMMARY 生成前に改行を `/` に置換するよう変更。`DESCRIPTION` の英名フィールドは変更なし。

### Localization レイヤー 構造改善・仮データ投入 (2026-06-25)

- **`#Loc_Dict` エントリを `DataBases/db_meta.json` から `Localization/db_meta.json` へ移動**: References レイヤーと同様に、各作品の `Localization/db_meta.json` がカタログ所在地となる。`DataBases/db_meta.json` には `#Loc_Dict` を含めない。
- **`lib/sw-common.js` — `mergeLayerDatabases` 汎用メソッド追加**: `mergeRefDatabases` の実装を `mergeLayerDatabases(baseMeta, layerMeta, defaultLayer)` として一般化。`mergeRefDatabases` は thin wrapper に変更。
- **`DataFetcher.readLocMeta` 追加・`readWorkMeta` で呼び出し**: `Works_*/Localization/db_meta.json` を読み込み、`mergeLayerDatabases` で DataBases にマージする。
- **全 9 作品に `Localization/db_meta.json` 新規作成**: `#Loc_Dict` エントリ（`DB_Layer: "Localization"`）を収録。
- **全 9 作品の仮データ投入**: 作品タイトル + 一次キャラクター全名称（`Name_JP` / `Name_EN`）+ NT FormalName（`ナンバーテールズ#番機 → NumberTales ##`）を `trans_Dict.json` に格納（NT: 211件・FL78: 14件・その他 4〜14件）。`TransPolicy`・`Category` は既存英訳パターンから仮判定（原作者による確認・修正を前提とする）。
- **テスト追加**: `readWorkMeta merges Localization/db_meta.json` + `readDB resolves via Localization/db_meta.json` の 2 ケース追加。
- **全スイート 130/130 pass** ✅

### Localization レイヤー（英訳固有辞書 DB）追加 (2026-06-24)

- **新レイヤー `Localization` を追加**: フォルダ名 `Localization/`、カタログキープレフィックス `#Loc_*`、ファイル命名規則 `trans_*.json`（TRANSlate 由来）。
- **グローバル schema 新規作成**:
  - `data/Localization/db_type.json` — 12 フィールド定義（`Term_JP/EN`, `Term_EN_Alt`, `Category`, `TransPolicy`, `Scope`, `Summary_JP/EN`, `TransNote_JP/EN`, `RelatedTerms`, `Links`）
  - `data/Localization/db_meta.json` — `$EnumDef_TransPolicy`（5 件: 原語維持 / 意音ローカライズ / 意訳 / 音訳 / 和英併記）/ `$EnumDef_Category`（13 件）
- **全 9 作品に `#Loc_Dict` エントリを追加**（後に Localization/db_meta.json へ移動）。
- **9 作品の `trans_Dict.json` 作成**・ルーティング拡張（詳細は上のエントリ参照）。
- **テスト `tests/sw.db-layer-routing.test.js`**: Localization 層ルーティング・`#Loc_` prefix 剥がし・`findMetaDbEntry` の 3 ケースを追加。
- **全スイート 129/129 pass** ✅

### References レイヤー basicFields のレイヤー typedef 駆動化 (2026-06-24)

- **`pages/characters.js` `basicFieldKeys` をレイヤー typedef 駆動に変更**: `renderDetail` 内で、`currentLayerName` が非空のとき（References レイヤー等）、`layeredTypeDef.$DefType` の `$display.section:"basic"` エントリから `basicFieldKeys` を自動収集するよう変更した（従来は常に作品の `$DetailLayout.basicFields` を使用）。
- **`data/Works_NumberTales/DataBases/db_meta.json` に `#Ref_Reference` / `#Ref_Vocabulary` を追加**: `findDbCatalogEntry` が `DB_Layer:"References"` を返せるよう、NT 作品メタの `Databases` 直下に両エントリを追加した。これにより `currentLayerName = "References"` が確定し `fetchSharedLayerTypeDef` が実行される。
- **テスト**: `tests/pages.characters.ui-output.test.js` が 24/24 pass（旧 B-2 テストも解消）。全スイート 126/126 pass。

### Google カレンダー連携: 誕生日・記念日 ICS 自動生成・配信 (2026-06-24)

- **`tools/build-calendar-ics.mjs` 新規追加**: `data/Works_*/DataBases/db_*.json` の全公開レコードから `BirthDay`(単一) / `AnivDay`(配列) を収集し、終日・毎年繰り返し(`RRULE:FREQ=YEARLY`)の iCalendar(.ics) を生成する。
- **公開ルール順守**: `isPrivate` レコード、グローバル `CreationWorks.#Works_*.Works_Hidden`、作品別 `Databases` 配下(ネスト含む)の `#DB_*` に付く `DB_Hidden`/`Works_Hidden`、`{hideText}`・日付欠損を除外する。
- **決定的出力**: UID 安定化(作品+DB+索引+種別の SHA-1)・月日順ソート・固定 DTSTAMP により、購読側の再読込時に冪等反映される。
- **`package.json`** に `calendar:build` スクリプト、**`.gitignore`** に生成物 `/calendar/*.ics`(ビルド成果物・コミット対象外)を追加。
- **`.github/workflows/jekyll-gh-pages.yml`** に Node セットアップ＋生成ステップを追加し、`develop` への push 毎に `.ics` を生成して GitHub Pages へ配信する(`https://database.numbertales-radiann.net/calendar/100beautieslab-creations.ics`)。コミットバック不要。
- **テスト `tests/calendar.ics.test.js` 追加**: 除外ルール・UID 一意・終日繰り返し・行折返し(≤75 オクテット)・決定性を検証。
- **ドキュメント**: 利用方法・Google カレンダー購読手順は `docs/calendar-ics-spec.md` を参照。
- **初回イベント数**: 誕生日 19・記念日 131(計 150)。

### JP/EN 命名規則の標準化（Phase 2〜5 完了）(2026-06-22)

- **Phase 2 — typedef リネーム**: `data/db_type.json` および `data/Works_*/DataBases/db_type.json` の全 `$DefType` エントリで、`Name → Name_JP`、`FormalName → FormalName_JP`、`ModelName → ModelName_JP`、`Title → Title_JP`、`Term → Term_JP`、`DayAbout → DayAbout_JP`、`DB_Label → DB_Label_JP` 等の言語サフィックス付与を適用した。
- **Phase 3 — コードフォールバック追加**: Phase 4 のデータ移行完了まで旧フィールド名を許容する一時フォールバックを `lib/` / `pages/` / `pkg/` に追加した（`Name_JP || Name` 等のチェーン）。
- **Phase 4 — データ一括リネーム**: `data/Works_*/DataBases/*.json` 等の全レコードデータと `db_meta.json`（全 works）の `DB_Label → DB_Label_JP` を一括移行した。
- **Phase 4.5 — テスト修正 & `basicFields`/`subFields` ベース名化**: Phase 4 で生じたテスト失敗（`DB_Label`/`FormalName`/`Character` 参照）を修正し、`db_meta.json`（全 works）の `$DetailLayout.basicFields`/`.subFields` から `_JP`/`_EN` サフィックスを除去するベース名書式へ統一した。コードサイドでは `detailSubFieldKeySet`（`pages/characters.js`）と `detailSubFieldSet`（`lib/data-common.js`）がベース名・`_JP`・`_EN` の 3 バリアントを自動展開するよう拡張した。
- **Phase 5 — フォールバック除去（本 PR）**: Phase 3 で追加した旧フィールド名フォールバックを全箇所から削除した。
  - `lib/wrapper-common.js`: `?? value.DayAbout` 削除
  - `lib/section-renders/dblink.js`、`relation.js`: `|| found?.Name`、`|| found?.FormalName`、`|| found?.ModelName` 削除
  - `pages/characters.js`: `getRecordPrimaryTitle`、`getRecordSecondaryTitle`、画像ログ、`shownKeys` 分岐から旧裸フォームを除去
  - `pkg/cloudflare/scripts/migrate.mjs`: `?? info?.Title`、`?? info?.Works_Summary` 削除
  - `pkg/nodejs/index.mjs`: `listWorks()` 戻り値から廃止フィールド `Title`、`Works_Summary` を除去し JSDoc 更新
- **テストデータ更新**: `tests/wrapper-common.test.js` のテストデータを `DayAbout → DayAbout_JP` に更新。
- **注意**: Cloudflare D1/R2 の再同期（`scripts/migrate.mjs` 再実行 → `wrangler deploy`）は別途実施が必要。

### Cloudflare Workers 実 API 初回デプロイ完了・疎通確認 (2026-06-21)

- **`pkg/cloudflare/wrangler.toml` TOML パース修正**: `routes = [...]` が `[vars]` / `[[d1_databases]]` スコープ内に誤配置されており、wrangler が `vars.routes` または `d1_databases[0].routes` として解釈する問題を修正。TOML の root-level キーはすべての `[section]` / `[[array]]` ヘッダーより前に配置しなければならない仕様に従い、`routes = [...]` を先頭スカラー群の直後に移動した。合わせて `[env.production]` セクション（冗長な重複定義）を削除。
- **`pkg/cloudflare/scripts/migrate.mjs` SQLITE_TOOBIG 修正**: `records` テーブルへの D1 INSERT で D1 の 1 文あたり約 100KB 上限を超えて `SQLITE_TOOBIG` が発生する問題を修正。`d1BatchInsert()` を複数 VALUES の一括 INSERT から 1 レコード 1 INSERT 文（`D1_BATCH_SIZE = 10` ファイルあたり 10 文）に変更した（`migrate-aihints.mjs` と同方式）。
- **初回デプロイ・疎通確認完了**: `database.numbertales-radiann.net/api/v1/*` への Worker デプロイが完了し、全エンドポイントの動作を確認した（`/works` 7件・`/Primary/records` 376件・単一レコード取得・FTS5 全文検索）。

### ADR-0001 採択: API 配信基盤を Cloudflare Workers + R2 + D1 へ移行 (2026-06-21)

- **ADR-0001** を採択。API 配信基盤を GitHub Pages + Service Worker の疑似 API から、Cloudflare Workers + R2 + D1 による実 API へ移行する設計を確定した。
- **インフラ作成**: R2 バケット `creationsdb-data`（JSON 静的ミラー）、D1 データベース `creationsdb-d1`（FTS5 検索インデックス）を Cloudflare アカウントに作成した。
- **D1 スキーマ適用**: `pkg/cloudflare/schema/d1-init.sql` を新規作成し、`works` / `dbs` / `records` テーブルと FTS5 仮想テーブル (`records_fts`)・同期トリガーを D1 に適用した。
- **マイグレーションスクリプト**: `pkg/cloudflare/scripts/migrate.mjs` を新規作成。`data/**/*.json` の全 JSON を R2 へアップロードし、作品メタ・DB メタ・レコードを D1 へ投入する。`$IndexDef`（フラット型・ネスト型両対応）から主インデックスキーを自動解決する。
- **Worker 全面改修** (`pkg/cloudflare/worker.js` v2.0.0):
  - データアクセス層を GitHub Pages HTTP fetch → R2 `env.BUCKET.get()` / D1 `env.DB.prepare()` に差し替えた。
  - 検索エンドポイント (`/search`) を D1 FTS5 クエリに変更した。
  - `Works_Hidden` / `DB_Hidden` を D1 クエリレベルで判定するよう改修した。
  - 単一レコード取得を D1 `records` テーブルのインデックスクエリに変更した。
- **wrangler.toml 更新**: R2 バインディング・D1 バインディング・カスタムドメインルーティング (`database.numbertales-radiann.net/api/v1/*`) を追加した。
- **ドキュメント更新**: `CLAUDE.md` / `.github/copilot-instructions.md` / `docs/api-sw-spec.md` / `pkg/cloudflare/README.md` を新アーキテクチャに合わせて更新した。
- **ADR-0002 ドラフト**: Google Cloud (Cloud Run / GCE) を画像生成・バッチ処理専用バックエンドとして設計するドラフトを `_work_in_progress/2026-06-21_progress_cloudflare-api-adr2-gcloud.md` に作成した。GCP プロジェクト ID 確認後に正式着手予定。
- **Service Worker 疑似 API は継続稼働**: `/pages/v1/`, `/svc/v1/` は `_DBLink`/`_Jump` 解決を含む完全 enrich 付き疑似 API として GitHub Pages 上で引き続き稼働する。

### `*_DBLink` suffix セクションレンダラー実装・`ThisMasters` リンク対応

- `lib/section-renders/dblink.js` を新規実装し、`*_DBLink` suffix フィールドを「キャラクターリンク参照」セクションとして描画する `dbLinkSection` renderer を追加した。
  - `$display.sectionWrapper` の指定は不要。`*_DBLink` suffix を自動検出して `CharacterSectionRendererRegistry` に登録する suffix-based dispatch。
  - `$Def_DBLinkRef` 形式（`{ _Work, _DB, {IndexKey: Value} }`）に基づき非同期でキャラクター名をハイドレーション。同DB・クロスDB・クロスワーク参照に対応。ネストインデックス（例: FLInvestigator78 の `Card: { Stoat, StoatNum }`）は subset match で解決。
  - `isPrivate: true` への参照はクライアント側フィルタで非表示にし、全タグ非表示の場合はセクションごと隠す。
- `lib/section-wrapper-common.js` の `structuredObjectSection.match` に `*_DBLink` suffix 除外を追加した。単一オブジェクト形式（`$Def_DBLinkRef|#Null`）の `*_DBLink` フィールドが `structuredObjectSection` に横取りされる問題を修正。
- `lib/section-renders/thisMasters.js` の `hydrateThisMastersLink` を `$Def_DBLinkRef` 形式へ刷新した。
  - 旧フォーマット: `{worksTitle, dbName, _Search: [{hashTag, key}]}` → 新フォーマット: `{_Work, _DB, {IndexKey: Value}}`
  - スカラーインデックス（`Drc: "E"` など）・ネストオブジェクト（`Card: {Stoat, StoatNum}` など）どちらも解決。
  - `about` テキストが空のエントリでリンクが付与されないバグを修正した（`!aboutText` 早期 return がリンク処理を飛ばす問題）。
- `data/Works_NumberTales/DataBases/db_Primary.json`（18件）と `db_SemiPrimary.json`（3件）の `ThisMasters._DBLink` を新フォーマットへ一括移行した。
  - `EnrichmentProcessor` が使うレコードルートの `_DBLink`（マージ用、`db_SelfSecondary.json` 等）は旧フォーマットのまま維持。

### `pkg/` クライアントライブラリ群を新規追加

- サブモジュールとして別リポジトリに導入するための独立クライアントパッケージ群 `pkg/` を新規実装した。
- 含まれるパッケージ: Node.js ESM ライブラリ / Python モジュール / C# クライアント / Cloudflare Workers API / MCP サーバー。
- **コンストラクタ引数の省略対応**: `repoRoot`（リポジトリルートパス）の引数を省略可能にし、サブモジュール配置時は `new CreationsDBClient()` のみで動作するようにした。
  - Node.js: `import.meta.url` から 2 階層上を自動解決
  - Python: `__file__` から 4 階層上を自動解決
  - C#: `FindRepoRoot()` がアセンブリ位置から `data/db_meta.json` を目印に上方探索
- 既存の `lib/` / `pages/` / `api/` / `svc/` への変更はなし（非破壊）。
- 詳細設計: `docs/pkg-client-libraries.md`

### `Works_Hidden` による作品単位の完全非公開フラグを追加

- `data/db_meta.json` の `CreationWorks.#Works_<WorkName>` に `"Works_Hidden": true` を置くことで、その作品全体をAPIから完全に非公開にできる仕様を追加した。
- 適用エンドポイント: `GET .../works` 一覧、`GET .../index`、`GET .../bootstrap` から該当作品を除外。`GET .../works/{work}` / `.../works/{work}/db` / `.../works/{work}/db/{dbName}` / `search?works=...` は 404 `"Work not found"` を返す。
- グローバルメタ (`data/db_meta.json`) 欠損時はチェックをスキップし、既存の耐性設計を維持する。
- `DB_Hidden`（DB単位）と同様の設計で、`isPrivate`（レコード単位）との段階的非公開を構成する。

### `DB_Hidden` による DB 単位の完全非公開フラグを追加

- `db_meta.json` の `Databases.#DB_<DbName>` に `"DB_Hidden": true` を置くことで、そのDBをAPIから完全に非公開にできる仕様を追加した。
- `lib/sw-common.js` の `listWorkDBs()` を修正し、`DB_Hidden: true` のエントリをDBリスト (`works/{work}/db`) から除外するようにした。
- `lib/sw-common.js` の `handleDbEndpoint()` を修正し、直接URL (`works/{work}/db/{dbName}`) へのアクセスも `DB_Hidden: true` の場合は 404 を返すようにした。メタ欠損時はチェックをスキップし、既存の耐性設計を維持する。
- 初期適用として `Works_NumberTales/DataBases/db_meta.json` の `#DB_UnprocessedSecondary` に `"DB_Hidden": true` を設定した。

### 創作作品ガイドラインを言語別ファイルへ集約

- 一次/二次創作ガイドラインの本文と「二次創作 OK/NG リスト」を、リポジトリ直下の `guideline.md`（日本語版・正本）および `guideline.en.md`（英語版）の 2 ファイルへ集約した。
- 既存の文面は一言一句変更せずに移植し、OK/NG リストはこれまで PNG 画像で配布していた表を Markdown 表として書き起こした（既存の `SecondaryWorksPermissionList_*.png` ファイル自体はリポジトリに残置）。
- `README.md` の冒頭ガイドライン章はリンクのみに簡略化し、`docs/guidelines.en.md`（paraphrased な英訳メモ）は重複回避のため削除した。
- 併せて `CONTRIBUTING.md` / `.github/copilot-instructions.md` / `docs/README.md` を、ガイドラインの正本が `guideline.md` / `guideline.en.md` であることを示す表記に更新した。

### `subFields` の非文字列型 standalone section を折りたたみ UI 化

- `pages/characters.js` は `data/db_meta.json` の `CreationWorks.*.$DetailLayout.subFields` により standalone 描画された top-level subField のうち、文字列表示型ではない section を `details/summary` ベースの折りたたみ UI で包むようにした。
- 折りたたみ対象の standalone section は初期状態を展開済みではなく閉じた状態とし、必要なときだけユーザーが開く挙動へ調整した。
- 判定は field 名ハードコードではなく、primitive / `#String` / `#Summary` / `#Dialogue` を text-like と見なし、それ以外の object / list / relation / stats 系を折りたたみ対象にする方針へ寄せた。
- `Relation` / `RelationToPrimary` は `renderRelations()` に `wrapInSection: false` オプションを追加し、既存の relation tag-grid 本体を保ったまま standalone subField 側の共通シェルへ包めるようにした。
- `pages/characters.sass` には `.section--collapsible` と `summary` の最小スタイルを追加し、見出しのトグル affordance を明示した。あわせて `pages/characters.html` の asset version を更新した。
- 回帰確認として `tests/pages.characters.ui-output.test.js` に `data-subfield-key` ベースの assertion を追加し、ConversationPattern / AbilityStats / NumerospecStats / Relation は折りたたみ UI、NumerospecAbout は通常 section のまま描画されることを確認した。

### `Relation` の特殊描画を `section-wrapper-common.js` へ移設

- `pages/characters.js` 末尾に残っていた `renderRelations()` の個別組み立て本体を `lib/section-wrapper-common.js` の built-in `relationSection` renderer へ移し、relation label 解決・comment 整形・index link 組み立て・standalone wrapper 連携を subscript 側で扱うようにした。
- `pages/characters.js` の `renderRelations()` は、DOM/format/navigation の共通 helper をまとめて renderer へ渡す bridge に縮小した。
- `CharacterSectionRendererRegistry` には `renderNamedSectionRenderer()` を追加し、non-subField からも built-in section renderer を明示的に再利用できるようにした。
- 回帰確認として `tests/section-wrapper-common.test.js` に built-in relation renderer の最小ケースを追加し、`tests/pages.characters.ui-output.test.js` の Relation / RelationToPrimary 系ケースで表示互換を確認した。

### `subFields` 用 section renderer registry を `lib/section-wrapper-common.js` へ分離

- `lib/wrapper-common.js` は値 summary の wrapper registry に責務を限定し、`subFields` の standalone section 描画ディスパッチは新設した `lib/section-wrapper-common.js` へ分離した。
- `pages/characters.js` は `CharacterSectionRendererRegistry` を先に試し、`$display.sectionWrapper` で宣言された `structuredObjectSection` / `relationSection` / `statsSection` を通して `subFields` を描画するようにした。
- global / work typedef には `ConversationPattern`、`AbilityStats`、各作品の `*specStats`、`Relation` / `RelationToPrimary` へ `$display.sectionWrapper` を追加し、renderer 選択を meta/schema 駆動へ寄せた。
- 回帰確認として `tests/section-wrapper-common.test.js` を追加し、built-in section renderer 登録と helper dispatch の最小ケースを検証できるようにした。
- 続けて `pages/characters.js` は `subFields` に列挙された top-level key を basic/profile/relation の既定ルートより優先して扱うようにし、JSON 側で宣言した順序どおりに standalone section を並べるようにした。
- 続けて `pages/characters.js` は spec 系の leaf 値に `hideText` が指定された場合も raw 文字列で短絡せず、元の typedef が持つ表示書式に従って整形するようにした。`#String_JP` / `#ListLink` / `$EnumDef` などの書式を持つ項目では `data/db_type.json` の `#List_hideText` を参照して `hideText_JP` / `hideText_EN` も解決できるようにした。
- 追加で `hideText` だけを持つ wrapper object でも親 schema 配下の leaf typedef を推定できるようにし、`SafetyLevel` のような spec 項目も `hideText` 時に別ブロックへ崩さず通常の tag/grid 書式のまま表示するようにした。
- 追加で `alphaLabel` / `codeLabel` は `EnumLink` / `ListLink` の説明文を JP 単独ではなく JP/EN pack から組み立てるようにし、`A（強力 / Powerful）` のような和英併記表示へ統一した。

### NumberTales の `ConversationPattern` を subField 独立セクション化

- `data/db_meta.json` の `CreationWorks.#Works_NumberTales.$DetailLayout.subFields` に従い、`pages/characters.js` が top-level 項目を standalone subField section として描画できるようにした。
- これにより `ConversationPattern` は従来の「プロフィール/テキスト」内の専用ブロックではなく、`Relation` と同様に独立したセクション見出し付きで表示されるようになった。
- 既存の `Relation` / `RelationToPrimary` の個別描画は維持しつつ、meta に列挙された subField の順序を優先してレンダリングするよう整理した。
- 回帰確認として `tests/pages.characters.ui-output.test.js` に NumberTales の `ConversationPattern` が standalone section として描画されることを確認するケースを追加した。

### `subFields` による `Stats` 系 standalone 描画を他作品へ拡張

- `pages/characters.js` は `data/db_meta.json` の `CreationWorks.*.$DetailLayout.subFields` に列挙された `AbilityStats` と各作品の `*specStats` を、従来の共通 `スペック/能力` セクションに固定せず standalone section として描画できるようにした。
- promoted された `*specStats` 配下の子項目は、typedef 上の `$display.section` が `profile` / `spec` に分かれていても親 subField section 内へまとめて表示し、別セクションへの重複表示を防ぐようにした。
- これにより NumberTales / FLInvestigator78 / ShouArRiders / PastDivers など、meta 側で `subFields` に stats を宣言した作品が同じ描画ルートで表示されるようになった。
- 回帰確認として `tests/pages.characters.ui-output.test.js` に NumberTales の `能力値` と `“カバラの加護”(数秘的加護)の特性`、PastDivers の `時空遷移能力の特性` が standalone section として描画されるケースを追加した。

### Day / StoryEra の特殊整形を shared wrapper registry の受け口へ分離開始

- `lib/wrapper-common.js` を追加し、UI / Service Worker 共有で使える value wrapper registry を新設した。
- 最初の built-in wrapper として `daySummary` と `storyEraSummary` を登録し、`$display.role` を使った Day / StoryEra の summary 整形を shared 層へ切り出せる土台を用意した。
- `pages/characters.js` は object 値の整形時に registry を先に試し、未一致または空文字時のみ従来の Day / StoryEra fallback を使うようにしたため、初回導入時点では既存挙動を維持する。
- `api/sw.js` / `pages/sw.js` / `svc/sw.js` も `lib/wrapper-common.js` を読み込むようにし、今後 SW / enrich 側から同じ wrapper registry を利用できる shared 層を揃えた。
- 回帰確認として `tests/wrapper-common.test.js` を追加し、built-in wrapper 登録と Day / StoryEra summary の最小整形を単体で検証できるようにした。
- 続けて `StoryEra` は `$MetaType.$Def_StoryEraCatalog.$display.wrapper = storyEraSummary` を宣言し、characters 側の local formatter 実装を削除して shared registry 経由へ本格移行した。
- 続けて `Day` と `Era` も `$display.wrapper` 主体へ寄せ、`$Def_Day -> daySummary`, `$Def_StoryEra -> eraSummary`, `$Def_StoryEraCatalog -> storyEraSummary` という shared な割り当てを明示した。
- `lib/data-common.js` は enrich 結果に `_enrichment.wrapperSummaries` を追加し、top-level の wrapper 対象項目の summary を SW/UI から再利用できるようにした。
- `lib/sw-common.js` の DB カタログ応答は `StoryEraSummary` も返すようになり、works/{work}/db 系 API でも shared wrapper による summary を利用できるようになった。さらにこの summary 生成は `StoryEra` の個別ハードコードではなく、`$Def_DatabaseCatalog` の wrapper 対象項目から自動導出する方式へ寄せた。

### `StoryEra` 用の最小 meta schema を追加

- `data/db_type.json` のトップレベル `$MetaType` に `$Def_StoryEra` を追加し、`EraGen` / `YearInEra` / `byRealYear` / `about_JP` / `about_EN` を持つ単点年代の宣言を導入した。
- あわせて `$Def_StoryEraCatalog` を `FromEra[]` / `ToEra[]` / `InEra[]` + `about_JP` / `about_EN` を持つ構造へ拡張し、既存の作品別 `db_meta.json` で使っている StoryEra 実データ形状を global schema に追従させた。
- `tests/meta.catalog.schema.test.js` を更新し、新しい schema 宣言の存在と `Works_NumberTales` の StoryEra 実データが `FromEra` / `ToEra` / `InEra` を持つことを確認するケースを追加した。
- `docs/schema-meta-processing.md` と `docs/api-sw-spec.md` も、新設した `$Def_StoryEra` と拡張後の `$Def_StoryEraCatalog` の説明へ同期した。
- 追加で `pages/characters.js` の `StoryEra` summary 表示は `about_JP` / `about_EN` を優先しつつ、未指定時は `InEra` または `FromEra` / `ToEra` から自動整形できるようにし、`tests/pages.characters.ui-output.test.js` に回帰テストを追加して 14 件成功を確認した。
- 続けて `$display.role` を `$Def_StoryEraCatalog` / `$Def_StoryEra` / `$Def_Day` へ導入し、`pages/characters.js` 側も role 優先で summary を組み立てるようにした。Day は実データの `Day` ラッパーが残るため、現段階では role 解釈と既存 shape 互換の併用としている。

### `RelationToPrimary` を Primary DB 詳細へ遷移できるリンク表示へ調整

- `pages/characters.js` の関係表示で、`RelationToPrimary` は現在選択中 DB ではなく `Primary` DB の index 直リンクを生成するようにした。
- 同一 DB 内の `Relation` は従来どおり現在のレコード群から即時詳細表示しつつ、`RelationToPrimary` は現在 state に一次創作レコードが載っていない場合でも `work/db/idx/idxKey` を保ったまま `Primary` 側へ遷移できるようにした。
- 回帰確認として `tests/pages.characters.ui-output.test.js` に `RelationToPrimary` のリンク先が `db=Primary` になることを確認するケースを追加し、13 件成功を確認した。

### 画像ディレクトリ命名を `Images/DB_*` / `Images/Ref_*` へ移行

- `pages/characters.js` と `lib/data-common.js` の画像パス解決を更新し、通常 DB は `Images/DB_<DbName>/...`、References 系 DB は `Images/Ref_<RefName>/...`、作品共通画像は `Images/General/` を既定で解決するようにした。
- これに合わせて、各作品の `data/Works_*/Images/` 配下に残っていた `Primary` / `Secondary` / `Proxy` などの旧サブフォルダ名を `DB_Primary` / `DB_Secondary` / `DB_Proxy` などへ移行し、`Works_NumberTales` には `Ref_Glossary` / `Ref_Reference` を追加した。
- 回帰確認として `tests/pages.characters.ui-output.test.js` に References 画像パスの検証を追加し、`tests/data.sanity.test.js` に `Images` 直下の命名規則チェックを追加した。
- 追加で、References 画像は shared `data/References/db_type.json` だけでなく作品別 `References/db_type.json` も UI 側で合流して解釈し、`Images.*` 配下の field 名から folder hint を導出して `concept-figure` のようなサブフォルダを hardcode なしで解決できるようにした。
- あわせて `README.md`、`pages/README.md`、`docs/db-update-guidelines.md`、`docs/api-sw-spec.md`、`docs/schema-meta-processing.md`、`docs/readme.en.md`、`docs/viewer-guide.md`、`.github/copilot-instructions.md` を新規則へ同期した。

### References レイヤーの DB をキャラシート UI で表示可能にした

- `pages/characters.js` で、現在選択中 DB の catalog entry を参照し、`DB_Layer: References` の場合は shared `data/References/db_type.json` を追加で読み込んで work typedef へマージするようにした。
- これにより、`Title` / `Term` / `BodyBlocks` / `RelatedCreations` など、通常キャラクター DB とは異なる資料系フィールドでも、キャラシート詳細で label / section / 表示整形を shared references typedef に従って解釈できるようにした。
- 一覧・詳細の見出し fallback も `Name` / `FormalName` だけでなく `Title` / `Term` を使えるようにし、References レコードでもタイトル未設定扱いにならないようにした。
- 追加で、一覧検索を `Title` / `Term` 系も対象に広げ、`RelatedTerms` を Glossary DB の絞り込みリンク、`RelatedCreations` を対象 work/db への遷移リンクとして「関連情報」セクションに表示するようにした。
- 回帰確認として `tests/pages.characters.ui-output.test.js` に References 表示・一覧 fallback・関連リンクのケースを追加し、8 件成功、および `tests/pages.characters.syntax.test.js` の成功を確認した。

### References typedef を shared `data/References/db_type.json` へ集約

- References 用の共通 typedef は global `data/db_type.json` ではなく、shared layer の `data/References/db_type.json` を正本として扱う構成へ揃えた。
- `data/Works_NumberTales/References/db_type.json` は作品固有 typedef を持たない空オブジェクトへ縮退し、資料系フィールド宣言は shared references layer から供給する前提へ整理した。
- `tests/data.shape.test.js` を `data/References/db_type.json` 前提へ更新し、`tests/data.shape.test.js` の 3 件成功を確認した。

### References typedef の `RelatedWorks` を object 配列化

- `data/Works_NumberTales/References/db_type.json` では、資料系の関連先フィールドを `RelatedWorks` から `RelatedCreations` へ改名し、object 配列 typedef として各要素が `RelatedWorks` と `RelatedDB` を持てるようにした。
- これにより、資料系 DB でも `_DBLink` に近い粒度で「どの作品に紐づく関連か」「その作品内のどの DB まで紐づくか」を 1 要素ごとに表現できるようにした。
- 新構造の代表キーは `RelatedCreations[]` とし、その子要素に `RelatedWorks` / `RelatedDB` を持たせる形へ整理した。
- 回帰確認として `tests/data.shape.test.js` を更新し、`tests/data.shape.test.js` の 3 件成功を確認した。

### NumberTales の資料系 DB を `References/ref_*.json` へ統合

- `data/Works_NumberTales/DataBases/db_meta.json` と `data/Works_NumberTales/References/db_meta.json` の資料系 catalog key を `#DB_Glossary` / `#DB_Reference` から `#Ref_Glossary` / `#Ref_Reference` へ変更した。
- `data/Works_NumberTales/References/` へ glossary / reference の実データを統合し、`ref_Glossary.json` と `ref_Reference.json` に改名した。
- `lib/sw-common.js` は `#Ref_` prefix を資料系 catalog key として扱い、`References/ref_*.json` を `DB_File` なしで既定解決できるようにした。
- 回帰確認として `tests/sw.db-layer-routing.test.js`、`tests/data.sanity.test.js`、`tests/sw.work-meta-info.test.js` を実行し、通過を確認した。

### NumberTales に Glossaries / References の空テンプレートを追加

- `data/Works_NumberTales/DataBases/db_meta.json` に `#DB_Glossary` と `#DB_Reference` を追加し、それぞれ `DB_Layer: Glossaries` / `References` を宣言した。
- `data/Works_NumberTales/Glossaries/` と `data/Works_NumberTales/References/` に `db_meta.json`, `db_type.json`, 空の `db_Glossary.json` / `db_Reference.json` を追加し、User 手入力前提の最小テンプレートを配置した。
- これにより、既存の works/{work}/db 導線から NumberTales の新規レイヤー DB を段階的に増やせる土台を実ファイルとして用意した。

### `Databases.#DB_*` に `DB_Layer` を追加し、非 `DataBases/` レイヤーの受け皿を実装

- `data/db_type.json` の `$MetaType.$Def_DatabaseCatalog` に `DB_Layer` を追加し、作品別 `db_meta.json` から DB 実体の配置レイヤーを宣言できるようにした。
- `lib/sw-common.js` の `DataFetcher.readDB()` / `listWorkDBs()` は `Databases.#DB_<DbName>.DB_Layer` を参照して、`Glossaries/` や `References/` のような非 `DataBases/` レイヤー配下の `db_<DbName>.json` を読めるようにした。
- DB 一覧カタログでも `DB_Layer` を返すようにし、UI/API 側が各 DB の配置レイヤーを参照できるようにした。
- 回帰確認として `tests/sw.db-layer-routing.test.js` を追加し、layer-aware な DB 読み込みと一覧応答を検証した。

### 最小の `isPrivate` 公開制御を追加

- `lib/sw-common.js` の `db` / `search` エンドポイントで `isPrivate: true` のレコードを除外し、公開 API 応答へ含めないようにした。
- `lib/data-common.js` でも typedef 駆動検索と `_DBLink` 参照先探索から private レコードを除外し、enrich 経路での露出を抑えた。
- `pages/characters.js` では一覧再描画時に public レコードだけを扱い、private レコードが直接渡された場合も詳細画面に本文を描かず「非公開」表示で止めるようにした。
- 回帰確認として `tests/sw.dbmeta.tolerance.test.js` と `tests/pages.characters.ui-output.test.js` を更新し、通過を確認した。

### `_Secondaries` 要素用の `$MetaType` を追加し、二次創作情報 UI の hardcode を削減

- `data/db_type.json` のトップレベル `$MetaType` に `$Def_SecondaryMeta` を追加し、`sec_Category` / `sec_DesignedBy` など `_Secondaries[]` 要素で使う補助フィールドのラベルと型を宣言できるようにした。
- `pages/characters.js` の「二次創作情報」セクションは、この `$Def_SecondaryMeta` を参照して描画項目を決めるように変更し、sec 系フィールド配列のハードコードを外した。
- 回帰確認として `tests/meta.catalog.schema.test.js` と `tests/pages.characters.ui-output.test.js` を更新対象に含める前提を整えた。

### `_Secondaries` の series 一致から `sec_Category` / `sec_DesignedBy` も補完

- `lib/sw-common.js` と `pages/characters.js` で、`Databases.#DB_*._Secondaries[]` のうち `sec_SeriesTitle` などで一致した定義を保持し、その `_Commons` だけでなく `sec_Category` / `sec_DesignedBy` も空欄時にレコードへ補完するようにした。
- これにより、`db_Secondary.json` 側で `sec_SeriesTitle` のみを持つレコードでも、meta 側のシリーズ定義から二次創作分類と制作・考案者を UI/API で一貫して扱えるようにした。
- 回帰確認として `tests/commons.secondaries.test.js` と `tests/pages.characters.ui-output.test.js` を更新し、通過を確認した。

### `Class` を作品別 `dict_Class` 辞書参照へ移行

- `data/Works_NumberTales/DataBases/db_SelfSecondary.json`、`db_SemiPrimary.json`、`db_UnprocessedSecondary.json`、`data/Works_UnauthedLogica/DataBases/db_PrimaryMobs.json`、`data/Works_ShouArRiders/DataBases/db_Primary.json`、`data/Works_PastDivers/DataBases/db_meta.json` の `Class` / `Class_EN` を、作品別 `Dictionaries/dict_Class.json` を正とした `Class` 配列へ変換した。
- `data/Works_PastDivers/DataBases/db_meta.json` の隠し値 `{ hideText: "？？？" }` / `{ hideText_EN: "????" }` も、辞書プレースホルダ `"？？？"` を使う配列形式へ揃えた。
- `data/db_type.json` ではトップレベル `Class` を `#DictIndex[]` + `$dict: "Class"` へ変更し、旧 `Class_EN` のトップレベル宣言を削除した。
- `pages/characters.js` では一覧 chip と `_DBLink` 参照結果の Class 表示を `formatValueForDisplay()` 経由へ寄せ、配列化された辞書キーからラベル解決するようにした。
- 回帰確認として、対象 6 ファイルから `Class_EN` が消えていることを確認し、関連テストを実行して検証した。

### `Belonging` の参照先辞書を `Faction` へ改名し、`$dict` ベースで表示解決するよう統一

- `data/db_type.json` でトップレベル `Belonging` の `$dict` を `Faction` へ変更し、表示フィールド名と辞書名を分離した。
- `data/Dictionaries/db_meta.json` では辞書カタログを `#Dict_Faction` / `keyField: Faction` へ改名し、実体ファイルも `dict_Belonging.json` から `dict_Faction.json` へ変更した。
- `pages/characters.js` の辞書表示解決は、`#DictIndex` 系フィールドについて `fieldKey` 名ではなく typedef の `$dict` を優先して `#Dict_*` / `#List_*` を参照するようにした。
- これにより、record 側のフィールド名が `Belonging` のままでも、辞書項目側は `Faction` / `Faction_EN` を代表キーとして保持できるようにした。
- 回帰確認として `tests/data.shape.test.js`、`tests/sw.deftype.merge.test.js`、`tests/sw.enrich.basic.test.js`、`tests/pages.characters.syntax.test.js` を実行し、通過を確認した。

### `data/Dictionaries/` と作品別 `Dictionaries/` を追加し、`Area` / `Belonging` 辞書本体を分離

- グローバル辞書用に `data/Dictionaries/` を追加し、`db_meta.json` の辞書カタログと `dict_Area.json` / `dict_Belonging.json` の実体ファイルへ `Area` / `Belonging` 辞書を分離した。
- 作品別にも `data/Works_*/Dictionaries/` を追加し、作品固有辞書を今後増やせる受け皿として `db_meta.json` / `db_type.json` の空プレースホルダを用意した。
- `lib/sw-common.js` の `readGlobalMeta()` / `readWorkMeta()` は `Dictionaries/` 側のカタログと各 `dict_*.json` を runtime で読み込み、`General.$VarsDef` へ `#Dict_*` と後方互換の `#List_*` の両方を合流して返すようにした。
- `pages/characters.js` の direct fetch fallback も `data/Dictionaries/` を読むようにし、Service Worker を経由できない環境でも `BelongingArea` を含む辞書表示が崩れないようにした。
- `data/db_meta.json` からは `#List_Area` / `#List_Belonging` の実体配列を削除し、静的実体は辞書 DB 側を正とする構成へ切り替えた。
- 辞書カタログでは JSON ファイル名を個別指定せず、`#Dict_*` から `dict_{DictName}.json` を推論する方針へ変更した。
- 回帰確認として `tests/sw.deftype.merge.test.js`、`tests/sw.enrich.basic.test.js`、`tests/pages.characters.syntax.test.js`、`tests/data.shape.test.js`、`tests/enrich.dblink.jump.merge.test.js` を実行し、通過を確認した。

### `Area` / `Belonging` を `#DictIndex` 化し、`BelongingArea` 補助展開を廃止

- `data/db_type.json` で `Area` を `#DictIndex`、`Belonging` を `#DictIndex[]` として宣言し、いずれも `$dict` で辞書名を持てるようにした。
- これにより `BaseArea` は `$Def_BaseArea` という object typedef 名へ役割を限定し、トップレベル実フィールドは `BelongingArea` に統一した。
- `data/db_meta.json` の `#List_Belonging` でも、所属辞書の補助情報キーを `BaseArea` から `BelongingArea` へ改名した。
- `lib/data-common.js` では、`#List_Belonging` から top-level `BelongingArea` を自動補助展開する処理を削除し、所属辞書の拠点情報は辞書項目側の情報としてのみ保持するようにした。
- `pages/characters.js` は `#DictIndex` を `#ListIndex` と同系統の辞書参照型として表示解決できるようにし、将来 `#Dict_*` へ辞書定義を分離する準備を入れた。
- 回帰防止として `tests/data.shape.test.js` と `tests/enrich.dblink.jump.merge.test.js` を更新し、対象テストと `tests/pages.characters.syntax.test.js` の通過を確認した。

### basic セクションの既定表示を `basicFields` / typedef 指定のみに限定

- `pages/characters.js` で、`$DetailLayout.basicFields` 未指定時に使っていた固定 fallback 配列を廃止した。
- これにより、basic セクションへ出る項目は、作品別 `db_meta.json($DetailLayout.basicFields)` に列挙されたものと、`db_type.json($DefType).$display.section = basic` を持つものだけになった。
- `Belonging` / `BirthDay` / `AnivDay` / `BaseArea` / `Area` など schema 側で basic 指定がある項目は従来どおり表示されるが、未指定作品での `FormalName` / `ModelName` / `ModelNumber` などの自動 fallback 表示は行わないようにした。
- `pages/characters.html` の `asset-version` を更新し、ブラウザが新しい `characters.js` を取得しやすくした。

### `Belonging` 辞書内の `BaseArea` を enrich で `BaseArea` として補助展開

- `lib/data-common.js` で `#List_Belonging` の各項目に含まれる `BaseArea` を逆引きできる index を構築し、`Belonging` だけを持つレコードでも enrich 時に `BaseArea` を補助展開できるようにした。
- `BaseArea` が未設定で、所属から一意に活動拠点を導ける場合のみ top-level `BaseArea` に反映し、複数候補がある場合は `_enrichment.derivedBaseAreas` に保持するようにした。
- `data/db_type.json` / 作品別 `db_type.json` / `db_meta.json` に残っていた `$TypeDef` を `$DefType` へ統一し、live data 上の旧キー依存を解消した。
- `data/db_type.json` の `$Def_BaseArea` を `$DefType` ベースへ正規化し、`about` / `about_EN` を含む宣言へ拡張した。`BelongingArea` はこの object typedef を使い、top-level `Area` は `#ListIndex` の独立宣言として分離した。
- `pages/characters.js` では `$Def_BaseArea` の表示整形を `Area + about` 対応へ寄せ、`Area` の補助ハードコードを削減した。
- 回帰防止として `tests/enrich.dblink.jump.merge.test.js` に `Belonging -> BaseArea -> BelongingArea` の補助展開テストを追加し、通過を確認した。
- 追加で `tests/data.sanity.test.js` に「`/data` 配下で `$TypeDef` を使わない」検証を追加し、通過を確認した。

### `Day` / `StoryEra` の表示を typedef 駆動へ寄せ、basic 補助行ハードコードを削減

- `data/db_type.json` の `BirthDay` / `AnivDay` に `$display.section: basic` を追加し、キャラシートが schema に従って基本情報へ載せられるようにした。
- `pages/characters.js` の表示整形で、`$Def_Day` / `$Def_Day[]` を `DayAbout` 含みで generic に整形し、`AnivDay` 配列は改行ベースで表示するようにした。
- `pages/characters.js` で `StoryEra` の概要表示を共通 formatter 経由へ寄せ、DB 概要パネルの年代メモも `about_JP/about_EN/about` ベースの typedef 的な扱いへ揃えた。
- `pages/characters.js` では `Belonging` / `BirthDay` / `AnivDay` の basic 補助行ハードコードを減らし、schema と `$DetailLayout.basicFields` 側の責務を優先するようにした。
- 回帰確認として `tests/pages.characters.syntax.test.js` を実行し、通過を確認した。

### `db_type.json` / `db_meta.json` の宣言面と内部処理ドキュメントを補強

- `docs/schema-meta-processing.md` を追加し、`$DefType` / `$VarsDef` / `$IndexDef` / `$MetaType` と `CreationWorks` / `Databases` / `_Commons` / `_Secondaries` の責務、および SW/enrich/UI での合流順を整理した。
- `docs/db-update-guidelines.md` に、作品/DB カタログ schema、DB 表示名、`$VarsDef` 合流方針への補足を追加した。
- `docs/README.md`、`docs/api-sw-spec.md`、`docs/implementation-playbook.md` から新しい技術メモへ辿れるようにした。

### セッション完了状態に合わせて指示書と進捗ログを同期

- `.github/copilot-instructions.md` に、`docs/schema-meta-processing.md` の参照方針、`$MetaType` / `DB_Label` の運用、`$VarsDef` の実行時合流前提を追記した。
- `_work_in_progress/2026-03-31_remaining-task.md` に、希望タスク 1〜3 の完了状況を追記した。
- `_work_in_progress/2026-04-21_progress_multi-index-display.md`、`_work_in_progress/2026-04-22_progress_creationwork-meta-api-ui.md`、`_work_in_progress/2026-04-22_progress_schema-meta-docs.md` の未完了タスク欄を完了状態へ更新した。

### `db_meta.json` の創作タイトル情報を API/UI で参照可能に拡張

- `lib/sw-common.js` の `works` / `works/{work}` / `works/{work}/db` / `bootstrap` 応答へ、`CreationWorks` の `Title` / `Title_EN` / `Works_Summary` / `OldTitles` と、作品別 `Databases` の `DB_Summary` / `StoryEra` を正規化して含めるようにした。
- `pages/characters.html` / `pages/characters.js` / `pages/characters.sass` に、選択中の作品情報と DB情報を表示する概要パネルを追加し、作品概要・旧題・年代メモ・DB概要を閲覧できるようにした。
- 回帰確認として `tests/sw.work-meta-info.test.js` と `tests/pages.characters.syntax.test.js` を実行し、通過を確認した。

### DB 表示名とカタログ用 schema 宣言を追加

- 作品別 `data/Works_*/DataBases/db_meta.json` の各 `Databases.#DB_*` に `DB_Label` / `DB_Label_EN` を追加し、DB セレクトや概要表示で人間向けラベルを使えるようにした。
- `lib/sw-common.js` の DB カタログ整形で `DB_Label` / `DB_Label_EN` を返し、旧メタには既定ラベルを補完するようにした。
- `pages/characters.js` と `pages/characters.html` で DB キー直表示をやめ、表示名優先で選択肢と概要ヘッダを描画するようにした。
- `data/db_type.json` に `$MetaType` を追加し、CreationWorks / OldTitles / DatabaseCatalog / StoryEra の補助 schema 宣言を持たせた。
- 回帰確認として `tests/sw.work-meta-info.test.js`、`tests/pages.characters.syntax.test.js`、`tests/meta.catalog.schema.test.js` を実行し、通過を確認した。

### object 形式 `#Index` の複数要素表示と `$display.index` 制御を追加

- `pages/characters.js` で object 形式の `#Index` を複数要素として収集できるようにし、一覧 chip / 詳細 pill / `#Index` 値整形 / `idx` `idxKey` 一致判定を同じ helper 群へ統一した。
- 既定値として、一覧 chip と canonical な直リンクは主要サブ要素を優先しつつ、詳細ヘッダと `#Index` 値表示では非空の全サブ要素を表示するようにした。
- 各サブ要素の `"$display": { "index": { list, detail, value, link, priority, order } }` により、作品別 typedef 側で表示対象と優先順位を宣言的に調整できるようにした。
- 運用ルールを `docs/db-update-guidelines.md`、`docs/implementation-playbook.md`、`.github/copilot-instructions.md` へ同期した。

### `_Secondaries` の default fallback 優先順位を明確化

- `lib/sw-common.js` と `pages/characters.js` で、`Databases.#DB_<DbName>._Secondaries[]` のうち全 `sec_**` 条件が `null` / 空の定義をデフォルト fallback として扱い、条件付き定義が一致した場合はそちらを優先するように整理した。
- これにより、`_Secondaries` 配列の並び順に依存せず、`sec_Category` / `sec_DesignedBy` / `sec_SeriesTitle` を持つ具体定義が fallback 定義より優先されるようにした。
- `data/Works_NumberTales/DataBases/db_SelfSecondary.json` では、一部レコードの `sec_DesignedBy` typo を正規キーへ揃え、`ナンバーテールズ化企画` 向け `_Commons` に一致するよう修正した。
- 回帰確認として `tests/commons.secondaries.test.js`、`tests/sw.enrich.basic.test.js`、`tests/sw.dbmeta.tolerance.test.js` を実行し、通過を確認した。

### 実装運用プレイブックと Copilot 指示書を更新

- `docs/implementation-playbook.md` を追加し、UI / API / SW / data / docs の各レイヤーで「まずどこを正にするか」「どのファイルを先に確認するか」「変更後にどの docs を同期するか」を整理した。
- `.github/copilot-instructions.md` に、2026-04 セッションで確定した運用ルールとして、List 系詳細の multiline 表示、bilingual multiline の 2 列表示、basic 補助行の重複抑制、cross-work `_DBLink` 制約、`db_meta.json` 欠損耐性、docs 同期方針を追記した。
- `docs/README.md` から新しい実装運用プレイブックへ辿れるようにした。

### API / SW 周辺の技術仕様ドキュメントと注釈を補強

- `docs/api-sw-spec.md` を追加し、`/api/v1` / `/pages/v1` / `/svc/v1` の役割差、`db_type.json` / `db_meta.json` / 予約語の責務分担、`_enrichment` の出力仕様、`db_meta.json` 欠損時ポリシーを整理した。
- `docs/README.md` と `docs/viewer-guide.md` から新しい API/SW 技術メモへ辿れるようにした。
- `lib/sw-common.js` に、bootstrap / DB取得 / search / varsdef の設計意図が分かる注釈を追加した。
- `lib/data-common.js` に、work context の辞書合成、cross-work `_DBLink` の schema 制約、`_enrichment` / `displaySections` の位置づけが分かる注釈を追加した。

### `_DBLink` の別作品参照で schema 未宣言項目を抑止

- `lib/data-common.js` の `_DBLink` 穴埋めマージで、別作品から参照する場合は対象作品の `db_type.json($DefType)` とグローバル `data/db_type.json($DefType)` に宣言されたトップレベル項目だけを取り込むようにした。
- これにより、`Works_UnauthedLogica` から `Works_NumberTales` を `_DBLink` 参照した際に、UnauthedLogica 側で宣言していない `Relations` などのトップレベル項目が不要に混入する経路を遮断した。
- 回帰防止として `tests/enrich.dblink.jump.merge.test.js` に「別作品 + schema 未宣言キーはマージしない」テストを追加した。

### `#ListIndex[]` / `#ListLink[]` の詳細表示を要素ごと改行

- `pages/characters.js` の表示整形で、typedef 上の `#ListIndex[]` / `#ListLink[]` は配列要素を `, ` 連結せず改行連結するようにした。
- `kvTable()` 側でも改行文字列を `white-space: pre-wrap` で表示するようにし、`Belonging` のような複数所属が 1 要素 1 行で読めるようにした。
- 詳細ビューの basic 補助テーブルでは、`Belonging` / `Area` / `BirthDay` / `AnivDay` が `db_meta.json($DetailLayout.basicFields)` ですでに表示されている場合に重複追加しないようにした。
- `##String_JP` / `##String_EN` の名称系フィールドで、和英のどちらかに改行が含まれる場合は詳細テーブル内で JP/EN を左右 2 列に分けて表示するようにした。

### データ schema の typo・命名修正

- 共有 schema と作品別データで、relation label の typo `secletRelation` を `secretRelation` へ統一した。
- 共有 schema / NumberTales / PastDivers の relation 応答キー `ComeBacked` を `Reply` へ改名した。
- 共有 schema と NumberTales 系データの関連メモ項目 `RelationAbouts` を `RelationNotes` へ改名した。
- 共有 schema と複数作品データの能力値キー `Communicating` を `Communication` へ統一した。
- 共有 schema と複数作品データの弱点項目 `Weakpoint` を `Weakness` へ改名した。
- 作品識別子 `DestinyFoxsRecords` を `DestinyFoxRecords` へ更新した。
- 回帰確認として `tests/data.sanity.test.js` / `tests/data.shape.test.js` / `tests/sw.deftype.merge.test.js` / `tests/sw.enrich.basic.test.js` を実行し、通過を確認した。

### Decave enum 辞書の API/UI 合成対応

- `lib/sw-common.js` の `v1/deftype/global` で、`db_meta.json` に加えて `data/db_type.json($VarsDef)` も `General.$VarsDef` へ合流して返すようにした。
- `lib/sw-common.js` の `v1/works/{work}/meta` でも、作品別 `db_type.json($VarsDef)` を `meta.General.$VarsDef` に含めるようにした。
- `pages/characters.js` の `fetchGlobalDefType()` で、API 応答が古い/不完全な場合でも `db_type.json` 側の `$EnumDef_*` を補完し、`Decave` の表示解決を維持するようにした。
- 回帰防止として `tests/sw.deftype.merge.test.js` を追加した。

### キャラシートの wrapper/spec 表示修正

- `pages/characters.js` で、`$EnumDef_*` / `#ListIndex` / `#ListLink` / `#Index` の wrapper object を汎用 object 展開より優先して整形するよう変更した。
- これにより、`Works_UnauthedLogica` の `ExistingRarity` が `Rarity: SSR` のような内部キー表示へ崩れる問題を修正した。
- `pages/characters.js` で `specStats` 内の `SpecType` 候補推定を補強し、`Works_FLInvestigator78` で `EffectStats` を誤って能力種別扱いしにくいよう調整した。
- `pages/characters.html` の `asset-version` を更新し、ブラウザ側で新しい `characters.js` を確実に取得できるようにした。
- `pages/characters.js` で `specStats` コンテナ自体を能力値グリッド推定から除外し、`Works_FLInvestigator78` の `ArcanumspecStats` が `能力種別: [object Object]` / `効果詳細: 普通, ...` として誤描画される経路を遮断した。
- `pages/characters.js` で `specStats` 配下の未処理フィールドを `$display.section` に従って spec/profile セクションへ合流するよう変更し、`Works_PastDivers` の `ChronoizedPurity` と `ChronoizedAbout` が表示されるようにした。
- `lib/data-common.js` の enrich 処理で `#ListLink_*` を varsdef から逆引きし、`EffectText` / `SafetyLevelText` などの wrapper object に `Rank` と補助ラベルを再帰補完するよう変更した。
- これにより、作品ごとの差分ではなく SW 側の共通正規化で「スペック/能力」の表示書式を揃えやすくした。
- 回帰防止として `tests/enrich.dblink.jump.merge.test.js` に `#ListLink` 補完テストを追加した。
- `pages/characters.js` の API fetch を `cache: 'no-store'` に変更し、ブラウザが古い enrich 応答を再利用して表示差分が反映されない状況を避けるようにした。
- `pages/characters.html` の `asset-version` を `2026.04.06.5` へ更新し、最新の `characters.js` を取得しやすくした。
- `pages/characters.js` の spec/effect 判定で使う「単一葉オブジェクト」判定を緩和し、SW enrich によって `Rank` や `*_EN` が補完された `#ListLink` wrapper でも `EffectStats` / `SafetyLevel` を表示対象として維持するよう修正した。
- `pages/characters.js` で `SpecLevel` のような rank 系 spec 項目を `SafetyLevel` と同じタグ群へ寄せ、`運命線探偵78` の「安全レベル」と「能力レベル」で表示レイアウトが分かれる問題を解消した。
- `pages/characters.js` で `BirthDay` を `AnivDay` と同じ basic 補助行として扱うよう修正し、`誕生日` が「その他の項目」へ落ちる不具合を解消した。
- `pages/characters.js` の詳細表示を typedef / meta 駆動へ寄せ、未定義のトップレベル項目を自動的に「その他の項目」へ流すフォールバック、および `_DBLink` / `_DBLinkResolved` の表示を停止した。

### API テスト UI のエンドポイント検証を強化

- `api/api.js` で、API テスト UI の入力値をそのまま `fetch()` しないよう変更した。
- カスタム入力およびボタン経由のパスは、同一オリジンかつ `'/api/v1/*'` に解決される場合のみ実行するよう制限した。
- `javascript:` などの不正スキーム、外部オリジン URL、許可外パスは UI 上で拒否し、エラーログ表示へ切り替えるようにした。
- 回帰防止として `tests/api.endpoint-guard.test.js` を追加した。

## 2025.08.21〜2025.08.30

### DB大規模拡張・データ構造整備 / APIテストページ整備

- 複数作品（NumberTales / FLInvestigator78 / ShouArRiders / SinisterChangingGirls / Proxies / DestinyFoxRecords 等）の DB 更新と、`db_meta.json` などメタ情報の整理を実施。
- `api/` 側のテストページ・スクリプトの整備を進め、疑似 API の動作確認導線を改善。

#### 影響範囲（代表）

- `api/api.js`, `api/index.html`
- `data/db_meta.json`
- `data/Works_*/DataBases/*.json`

## 2025.10.25〜2025.10.30

### キャラシート機能（pages）実装・安定化 / テスト導入

- `pages/characters.*` を中心に、キャラシート表示ページの実装と段階的な動作検証（試運転）を実施。
- `pages/sw.js` を含む Service Worker 連携の整備と bugfix を反復し、GitHub Pages 環境での動作安定性を向上。
- Vitest による基本テスト（データ整合・構造・SW エンドポイント）を追加。
- GitHub Pages 向けの運用整備として、`.nojekyll` の追加や GitHub Actions ワークフロー追加を実施。

#### 影響範囲（代表）

- `pages/characters.html`, `pages/characters.js`, `pages/characters.sass`, `pages/characters.css`
- `pages/sw.js`, `api/sw.js`, `svc/sw.js`
- `tests/data.sanity.test.js`, `tests/data.shape.test.js`, `tests/sw.enrich.basic.test.js`
- `.github/workflows/jekyll-gh-pages.yml`, `.nojekyll`

## 2025.11.23

### 共通ライブラリアーキテクチャの実装

#### 実装された変更内容

1. **SharedLibrary アーキテクチャの導入**
2. **StandardEndpointHandlers クラスの実装**
   - Service Worker 間で重複していた標準エンドポイント処理を統合

- UI: 詳細ビューの表示制御を拡張し、`data/db_meta.json` の `CreationWorks.<work>.$DetailLayout`（`headerPills`/`basicFields`/`suppressKeys`）に追従できるようにした。
- UI: `data/db_type.json` の `"$display"` に `auto:false` を追加し、自動表示から除外できるようにした（別名/統合表示向け）。
- Data: `data/db_type.json` に `ModelName`/`Class`/`Class_EN` のトップレベル定義を追加し、`CodeName`/`SPCodeName_EN`/`Class_EN` へ `auto:false` と `aliasOf` を付与した。
  - スコープ対応機能（API、Pages、SVC）
  - エンリッチメント制御（Pages スコープでのみ有効）
  - 約 300 行以上の重複コード削除を実現

3. **EnrichmentProcessor.enrichRecords()メソッドの追加**
   - キャラクターデータの充実化処理機能
   - 画像情報の自動抽出と処理
   - 検索可能テキストのインデックス化
   - エラーハンドリング機能付き

4. **Service Worker 統合とマルチスコープ対応**
   - api/sw.js: 標準 API エンドポイント（エンリッチメントなし）
   - pages/sw.js: キャラクターページ特化（エンリッチメント付き）
   - svc/sw.js: 広告ブロッカー回避用（エンリッチメントなし）

#### 技術的効果

- **保守性向上**: 共通ライブラリによる一元管理
- **コード削減**: 300 行以上の重複コード削除
- **機能統一**: 全スコープで統一された API 動作
- **エラー修正**: enrichRecords メソッド不存在エラーの解決
- **テスト通過**: 全 4 つのテストケースが成功

## 2025.11.26〜2025.12.27

### DB更新（コンテンツ追加・調整）

- DB進捗更新（例: ナンバーテールズ / 運命線探偵 / 獣爾騎兵）を継続。

#### 影響範囲（代表）

- `data/Works_NumberTales/DataBases/db_Primary.json`
- `data/Works_ShouArRiders/DataBases/db_Primary.json`

## 2026.01.24〜2026.01.27

### DB整備・README更新

- 複数作品の DB 情報追加と、`db_meta.json` / `db_type.json` 周辺の整備・軽微な bugfix を実施。
- `README.md` の更新（複数コミット）を実施。

#### 影響範囲（代表）

- `data/Works_*/DataBases/*.json`, `data/db_meta.json`, `data/db_type.json`
- `README.md`

## 2026.02.03

### 呼称フィールド正規化（後処理）と半自動チェックの追加

- 呼称フィールド（callings）正規化のための半自動チェック・後処理手順を整理。
- 正規化支援スクリプト `tools/normalize-callings.mjs` を追加。
- 作業ログを `_work_in_progress/2026-02-03_callings-normalize.md` に記録。

#### 影響範囲（代表）

- `tools/normalize-callings.mjs`
- `data/Works_*/DataBases/*.json`
- `_work_in_progress/2026-02-03_callings-normalize.md`

## 2026.02.18

### typedef 駆動エンリッチ強化 / キャラシート不足フィールドの改善

- `db_type.json($DefType)` を参照した typedef 駆動のエンリッチ・表示追従を強化。
- キャラシート側の不足フィールドや表示追従を改善し、挙動を作業ログに整理。

#### 影響範囲（代表）

- `lib/data-common.js`, `lib/sw-common.js`
- `pages/characters.js`, `pages/sw.js`
- `_work_in_progress/2026-02-18_characters-missing-fields.md`
- `_work_in_progress/2026-02-18_sw-typedef-driven-enrichment.md`

## 2026.02.20

## 2026.03.06

### 会話パターン情報追加のためのスキーマ拡張（typedef）

- `data/db_type.json($DefType)` に `ConversationPattern` を追加し、会話パターン（口調/話題傾向/頻度等）を格納できるようにした。
- `ConversationPattern` 配下の `DialogueExamples` を `#Dialogue[]|#Dialogue_withAbout[]|#Null` として整理し、台詞系テキストであることを typedef 上で明示した。
- 値（コンテンツ）は User 手動入力を前提とし、Copilot による創作内容の自動生成を避ける運用を想定。
- `ConversationPattern` は当面 `searchable:false` とし、表示は可能だが検索インデックスへは含めない方針を明示した。
- `#Dialogue[]|#Dialogue_withAbout[]|#Null` の運用確認として、ネストした array union 型の enrich 正規化と、`ConversationPattern` の構造化表示に対応した。
- `data/Works_NumberTales/DataBases/db_type.json` の `Relation.*.Comments` を `#Dialogue` 化し、関係欄コメントも台詞系として schema-driven に整形できるようにした。

### pages/characters.js の構文エラー修正

- `pages/characters.js` 先頭に関数内コード断片が混入し、ブラウザで `Illegal return statement` が発生してキャラシートが表示不能になる不具合を修正した。
- あわせて `tests/pages.characters.syntax.test.js` を追加し、`node --check` による構文スモークテストで同種の破損を検知できるようにした。

### `#Dialogue` 表示統一と nullable 型の整理

- `#Dialogue` 型は `Relation.Comments` の本文と同じ共通ノードで描画するようにし、会話例と関係コメントの表示書式を統一した。
- `Hobby` / `SpetialSkill` / `Favor` / `Unlike` / `Strength` / `Weakpoint` を `#String|#Summary|#Null` に統一した。
- `ConversationPattern` の `TalkingTone` / `TopicPreference` / `TalkFrequency` / `PreferredTopics` / `AvoidedTopics` / `ConversationNotes` も `#String|#Summary|#Null` に統一した。

### `ConversationPattern` の詳細表示レイアウト調整

- `ConversationPattern` は表形式ではなく、項目ごとの「見出し枠 + 本文」で表示するように変更した。
- `DialogueExamples` は `Relation` セクションに近い `kv-grid` の複数枠表示へ寄せ、各台詞例を独立した枠として表示するようにした。

### Object 型フィールド処理の強化（その1〜3）

#### 変更内容

1. **キャラシート表示の Object 値フォーマット強化**
   - `pages/characters.js` で、Object 型値が `[object Object]` にならないよう表示整形を強化
   - `_Jump` / `_DBLink` / `_Search` などの参照系オブジェクトを人間が読める形に整形
   - `Weight_kg` / `Height_cm` など単位付きの基本項目でも、`{ value, about_* }[]` / `{ hideText }` を含めて表示可能に
   - `_Commons` 適用時に `#List_*` 等のメタ定義がレコードへ混入しないよう、`#`/`_` 始まりキーを除外

2. **検索（EnrichmentProcessor.searchRecords）の Object 値比較を強化**
   - Object/配列/ラッパー（`{ value, about_* }` / `{ hideText }` 等）の揺れを吸収し、検索一致判定の耐性を向上

3. **参照マージ出力（\_DBLink / \_Jump）の実装**
   - `lib/data-common.js` の `EnrichmentProcessor.enrichRecords()` に、参照先DBの解決→同名フィールド穴埋め→`_Jump` 実値置換を追加
   - `_Search` は **1件一致のみ採用**（曖昧一致・複数一致はスキップ）
   - `hideText` は意図的マスクとして尊重（参照先値で上書きしない）
   - 画像系フィールドは **別DB（別JSON）から参照しない**（同一JSON参照の場合のみマージ許可）

4. **テスト追加**
   - `tests/enrich.dblink.jump.merge.test.js` を追加し、`_DBLink/_Jump` マージ挙動を回帰防止

5. **進捗ログ追加**
   - `_work_in_progress/2026-02-20_dblink-jump-merge.md` に実装方針・影響範囲・検証結果を記録

#### 影響範囲

- `pages/characters.js`
- `lib/data-common.js`
- `tests/enrich.dblink.jump.merge.test.js`
- `_work_in_progress/2026-02-20_dblink-jump-merge.md`

### typedef 表示メタデータ（`$display`）の試験導入

- `db_type.json($DefType)` に後方互換な表示メタ情報 `"$display"` を追加（宣言のみ・既存挙動は維持）。
- まず `unit`（例: `Height_cm`/`Weight_kg`）と、UI分類用の `section`、管理主体/タグ領域を表す `tagSpace`（`creation`/`creatorProgress`/`system`/`internal` 案）を導入。
- グローバルだけでなく、作品別 `data/Works_*/DataBases/db_type.json` にも `Images` や enum/list 系フィールドへ `section/tagSpace` を追記し、スキーマ駆動表示への移行準備を開始。
- クライアント（`pages/characters.js`）で `"$display.unit"` を参照し、身長/体重などの単位付き表示を typedef 駆動へ移行（cm/kg のハードコードを撤去）。
- クライアント（`pages/characters.js`）で `"$display.section"` を参照し、未表示のトップレベル項目を `basic/profile/spec/other` へ自動振り分けして表示するよう対応。
- 設計メモを `_work_in_progress/2026-02-20_schema-driven-display-format.md` に整理。

## 2026.02.21

### キャラシート: db_meta.json（$VarsDef）ネスト定義の参照強化

- `pages/characters.js` の `#ListIndex` 表示解決で、作品別 `db_meta.json` にある `$Def_*` 配下の `#List_*`（例: `$Def_ArcanumspecStats.$Def_SpecType.#List_Material`）も参照して表示名を解決できるようにした。
- `DualizePattern` のように `#List_<Field>` 内の実値キーが `Pattern` になるケースも、値一致による柔軟な逆引きで表示名へ解決するよう改善。

### キャラシート: object子要素の分解表示 / Relation表示の宣言駆動化

- UI（`pages/characters.js`）: typedef 上で子フィールドが定義されている object 値（例: `For79or80thDealerCalling` / `SpecType.ActionType`）を、子ラベル付きで展開して表示するようにし、`[object Object]` 表示を回避。
- UI（`pages/characters.js`）: `Relation.Related[].RelationLabel` を `db_meta.json($VarsDef.#List_RelationLabel)` でJP化して表示するようにした。
- Data（NumberTales）: `data/Works_NumberTales/DataBases/db_type.json` の `$VarsDef.$Def_Relations.$TypeDef` を `data/Works_NumberTales/DataBases/db_meta.json(General.$VarsDef.$Def_Relations.$TypeDef)` へ移動し、`db_type.json` からは `$VarsDef` を削除。
- Data（ShouArRiders）: `BeastspecName` / `BeastspecName_EN` に `$display.section:"profile"` を追加し、「プロフィール/テキスト」へ自動分類されるようにした。
- UI（`pages/characters.js`）: `resolveVarsDefLabel()` が `Databases.*._Commons`（例: ShouArRiders の `#List_Beast`）も探索して `#ListIndex` の表示名解決に利用できるようにした。
- UI（`pages/characters.js`）: `#ListIndex_withAbout[]`（例: `RaceType`）の `{ <Field>: code, about(_JP|EN) }` を「表示名（about）」として整形できるようにした。

#### 影響範囲（代表）

- `pages/characters.js`
- `db_type.json($DefType)` の `$alt`（代替フィールド参照）を UI と enrich 出力が解釈し、該当キーが無い場合に代替キーを参照できるようにした。

### EnumDef/EnumLink 表示のフィールド単位制御（Rank/Rarity）

- UI（`pages/characters.js`）で、typedef 由来の `$type` に含まれる `$EnumDef_*` / `$EnumLink` を汎用的に解釈し、Rank/Rarity などの定義型を共通ロジックで表示整形できるようにした。
- UI（`pages/characters.js`）の表示整形（`formatValueForDisplay()`）へ `fieldKey` を伝播し、作品別 `db_meta.json` の `$EnumLink_${Field}`（例: `$EnumLink_ExistingRarity`）から表示名を解決できるようにした。
- `$EnumLink` が存在する場合の既定表示は「alphaLabel（コード＋ラベル）優先」（仮設定）としつつ、`db_type.json($DefType)` の `$display` に `rankFormat` / `rarityFormat` / `enumFormat` を指定することでフィールド単位に表記を切り替えられるようにした。
- `$EnumLink_*` 定義が `db_meta.json` の `$VarsDef` 内でネストしているケース（例: `$Def_AbilityStats.$EnumLink_AbilityText`）を想定し、UI 側でネスト探索して解決できるようにした。
- `db_type.json($DefType)` の `$display.enumLinkKey` により、参照する `$EnumLink_*` をフィールド単位に指定できるようにした（例: `AbilityStats` → `AbilityText`、`SpecLevel` → `SpecLevelText`）。
- `#ListLink_*` が typedef で宣言されている「文字列ラッパー」（例: `{ EffectText: '絶大' }` / `{ SafetyLevelText: '安全' }`）について、`db_meta.json` の `#ListLink_*` 定義から逆引きして `Rank` を取り出せる場合は `alphaLabel`（例: `S（絶大）`）として表示できるようにした。
- `db_type.json($DefType).$display` に `listLinkShowEnum`（boolean）/ `listLinkEnumName`（string）を追加し、#ListLink の enum 併記可否・参照する enum キーを JSON 側で制御できるようにした（JS 側のハードコード削減）。
- Data: `data/db_type.json` の `AbilityStats` に `$display.rankFormat` を追記（例示）。
- Data: `data/Works_UnauthedLogica/DataBases/db_type.json` の `ExistingRarity` に `$display.rarityFormat` を追記（例示）。

#### 影響範囲（代表）

- `data/db_type.json`
- `data/Works_FLInvestigator78/DataBases/db_type.json`
- `data/Works_NumberTales/DataBases/db_type.json`
- `data/Works_ShouArRiders/DataBases/db_type.json`

### EnumDef/#ListIndex: JP/EN 併記と表示制御（langMode）

- UI（`pages/characters.js`）: `$EnumDef(|$EnumDef_withAbout)` および `#ListIndex(|#ListIndex_withAbout)` の表示で、辞書（`db_meta.json`）から JP/EN を取得し `JP / EN` 形式で併記できるようにした。
- UI（`pages/characters.js`）: 作品別メタで `#List_*` が `General.$VarsDef` 以外（例: `General.$Def_Relations.#List_RelationLabel`）に定義されている場合も探索して解決できるようにし、RelationLabel がコード（英語）だけになる問題を回避。
- UI（`pages/characters.js`）: typedef の `$display.langMode`（任意）で、JP/EN の表示切替・併記抑制ができるようにした（例: `'jp' | 'en' | 'enJp' | 'raw'`）。
- UI（`pages/characters.js`）: グローバル定義辞書の取得失敗時に「空オブジェクトをキャッシュして固定化」しないようにし、Service Worker が制御状態になった後に再試行で復旧できるようにした。
- UI（`pages/characters.js`）: グローバル辞書/typedef キャッシュが期待形でない場合は自動的に破棄して再フェッチする自己復旧を追加（古いキャッシュ等で辞書解決できずコード表示に戻るケースの緩和）。
- UI（`pages/characters.js`）: `fetchGlobalDefType()` の API 応答が期待形でない場合に、`/data/db_meta.json` を `cache:'no-store'` で直 fetch する最終フォールバックを追加（GenderType 等がコード表示に戻るケースの最終救済）。
- UI（`pages/characters.js`）: `fetchGlobalDefType()` の妥当性判定を強化し、`General.$VarsDef.$EnumDef_GenderType` を含まない不完全な辞書（誤レスポンス等）を有効キャッシュしないよう修正（「性別だけ FemaleNeutral が残る」根本原因の可能性に対応）。
- UI（`pages/characters.js`）: Service Worker の controller 待ちで「タイムアウトでも成功扱い」になっていたため未制御のまま `/pages/v1/works` を叩いて 404 になる問題を修正（制御されるまで待機し、失敗は初期化エラーとして扱う）。
- UI（`pages/characters.js`）: controller が付与されないケースの救済として、SW ready 後に `clients.claim()` を先に依頼し、短い待機→再試行の段階的待機に変更（SW/キャッシュリセット直後の初期化が 15s 固定で遅くなる問題を緩和）。
- UI（`pages/characters.js`）: `schemaType` 推定が `#String` 等になってしまう経路でも、`fieldKey` があれば `db_meta.json($VarsDef)` を最後に参照して Enum/List の表示名解決を試すよう改善（GenderType が英語コードのまま残るケースの緩和）。
- UI（`pages/characters.js`）: `fieldKey` が `GenderType_JP` のような言語サフィックス付きで伝播した場合でも、VarsDef 参照用のキーをベース名（`GenderType`）へ正規化して Enum/List の表示名解決ができるよう修正（kv-table の性別が `FemaleNeutral` のまま残るケースの根治）。
- UI（`pages/characters.js`）: `$display` 抽出拡張に伴う `ReferenceError`（`traverseTmp` 未定義）で初期描画が落ちる不具合を修正。
- UI（`pages/characters.js`）: `#List_Belonging` のように「ベースキーがJP文字列で \*\_JP が無い」辞書定義でも、JP/EN 併記が EN-only にならないようフォールバックを改善。
- `data/Works_SinisterChangingGirls/DataBases/db_type.json`
- `data/Works_Proxies/DataBases/db_type.json`
- `data/Works_DestinyFoxRecords/DataBases/db_type.json`
- `data/Works_UnauthedLogica/DataBases/db_type.json`
- `_work_in_progress/2026-02-20_schema-driven-display-format.md`

### Secondary DB（二次創作DB）の表示追従（isForSecondary / RelationToPrimary）

- UI（`pages/characters.js`）: `db_type.json($DefType)` のトップレベル項目抽出で `isForSecondary` を DB 文脈（Primary/Secondary）に応じてフィルタし、Secondary 専用フィールドが Primary 側に出ないよう制御を追加。
- UI（`pages/characters.js`）: `RelationToPrimary` を「関係」系セクションとして描画し、Secondary レコードで「原作との関係」を表示できるようにした。

## 2026.02.21

### 2言語対応フィールド（_\_JP / _\_EN）の同義解釈

- UI（`pages/characters.js`）: 詳細ビューの基本情報テーブルとスキーマ駆動の自動表示で、`*_JP`/`*_EN` を同義フィールドとして1行に統合し、重複表示を抑止。
- UI（`pages/characters.js`）: リスト側の簡易検索（`matchFilter`）に `Name_JP`/`FormalName_JP` などの互換キーも追加。
- SW（`lib/data-common.js`）: `EnrichmentProcessor.searchRecords()` が、クエリ hashTag の `base`/`*_JP`/`*_EN` を相互にエイリアス扱いして一致判定できるように拡張。
- Test: `tests/bilingual-fields.test.js` を追加。

### `_Commons` 既定値の適用強化（空値も未設定扱い）

- SW（`lib/sw-common.js`）: `CommonsProcessor.applyCommonsToRecords()` の既定値適用で、`undefined` だけでなく `null` / `''` / `[]` / `{}` も未設定扱いにして `_Commons` を適用するよう拡張。
- `{ hideText: '...' }` は意図的マスクとして扱い、空値として上書きしない。
- これにより、作品別 `db_meta.json` の `_Commons` で指定した初期値が、後段の `_DBLink` 参照で穴埋めされる値より優先される。

### キャラシート: JP/EN 併記・辞書表示・空表示抑止の追補

- UI（`pages/characters.js`）: スキーマ上に base キーしか無い場合でも、実データに `*_JP` / `*_EN` があれば 1 行に統合して表示するよう拡張。
- UI（`pages/characters.js`）: base キーが表示済みの場合は `*_JP` / `*_EN` を二重表示しないよう抑止。
- UI（`pages/characters.js`）: 空配列/空オブジェクト等を「表示不要」とみなす判定を強化し、空の能力種別が余分に出るケースを抑制。
- UI（`pages/characters.js`）: `_DBLink` 解決結果のチップ（`RaceType`/`GenderType`）を typedef/meta 駆動の整形へ統一。
- SW（`lib/sw-common.js`）: `v1/deftype/global` が誤って `db_type.json` を返していたため、`db_meta.json`（`General.$VarsDef` の定義辞書）を返すよう修正。これにより `GenderType` / `RelationLabel` 等の和文化が安定して動作する。
- UI（`pages/characters.js`）: `fetchGlobalDefType()` がラッパー形式（例: `{ meta: ... }`）のレスポンスを受け取った場合でも辞書本体を復元できるようにし、`GenderType` などが英語コード表示にフォールバックするケースを緩和。
- UI（`pages/characters.js`）: 詳細ビューの基本情報テーブルで、値整形に `metaForLookup`（work+global 統合メタ）を使うよう統一し、グローバル辞書（`$EnumDef_GenderType`）を確実に参照できるようにした。
- UI（`pages/characters.js`）: `#ListIndex` の表示名解決で「値一致を確認せずに先頭要素のラベルを返してしまう」不具合を修正。これにより `Belonging` 等が“常に同一値”になる問題を解消。
- UI（`pages/characters.js`）: typedef が `$EnumDef(|$EnumDef_withAbout)` / `#ListIndex[]` のフィールドについて、辞書定義に応じて「JP/EN 併記（例: `日本語 / English`）」で表示できるようにした（例: `GenderType`, `Belonging`, `RelationLabel`）。
- Data（NumberTales）: `Relation.Related` / `Relation.Commented` / `ComeBacked` の typedef を `$Def_Relations[]` に揃え、実データ（配列）と現行 UI ロジックに合わせて堅牢化。

### GenderType 辞書表示の堅牢化 / `Valiable` 統合

- UI（`pages/characters.js`）: `resolveVarsDefLabelPack()` で `$EnumDef_*` の辞書解決を「キー直引き（例: `#FemaleNeutral`）」優先にし、スキャン依存による取りこぼしを低減。
- UI（`pages/characters.js`）: `GenderType` の typo コード `Valiable` を `Variable` として正規化し、辞書に無くても表示が崩れないよう後方互換を追加。
- Data（`data/db_meta.json`）: `$EnumDef_GenderType` から `#Valiable` を削除し、`#Variable` に統合。
- UI（`pages/characters.js`）: typedef から `GenderType` の `schemaType` が取得できない経路でも、`$EnumDef` として辞書解決を試すフォールバックを追加（英語コード表示の取りこぼし対策）。
- UI（`pages/characters.js`）: デバッグON時に、詳細ビューDOM内に `GenderType` の生コードが残っている箇所を自動検出してコンソールへ出力（表示経路特定用）。

## 2026.03.04

### セキュリティアラート対応（CodeQL 指摘の修正）

- SW（`lib/sw-common.js`, `pages/sw.js`）: `works` / `db` パラメータを英数字+`_` のみ許可し、不正な入力は 400（Bad Request）として扱うように修正（パス注入/パストラバーサル対策）。
- SW（`lib/sw-common.js`）: `works/db` の不正入力や DB 不存在を 500 で落とさず、400/404 で返すようハンドリングを改善。
- UI（`pages/characters.js`, `pages/characters_final.js`）: `innerHTML` による動的文字列描画を廃止し、`textContent` と DOM 構築で表示（DOM XSS 対策）。
- UI共通（`lib/frontend-common.js`）: `DOMUtils.createElement()` で `innerHTML` を直接セットしないよう変更。

### トップページ導線（GitHub Pages / README）改善

- GitHub Pages: ルートに `index.html` を追加し、UI / API / ガイドラインへの入口を明確化。
- README（`README.md`）: トップ導線をデプロイ先 URL（`database.numbertales-radiann.net`）中心に整理。
- README（`README.md`）: 折りたたみ（`<details>`）内の Markdown 互換性向上のため `markdown="1"` を付与。

### `#Index` 型の段階導入（API 側: search/enrich）

- SW 共通（`lib/data-common.js`）: `EnrichmentProcessor.searchRecords()` が `hashTag:'#Index'` を解釈し、作品 typedef（`data/Works_*/DataBases/db_type.json.$IndexDef`）に基づいて実フィールドへ展開できるようにした。
  - スカラー（例: `key: 1`）だけでなく、ネスト index（例: `key: { Stoat: 'Major', Num: 0 }`）も AND 条件として展開して検索できる。
- 回帰修正（`lib/data-common.js`）: index 子要素が `#Number|#String` のような union の場合は数値比較を抑止し、`'0'` が `'000'` 等に誤一致して複数ヒットになるケースを回避。
- 回帰修正（`lib/data-common.js`）: 検索クエリで `key:null` を明示した場合は `val:null` を一致扱いにし、`#String|#Null` のような Null 許容サブキー（ネスト index）を含む検索が成立するようにした。
- 仕様整理（Breaking）（`lib/data-common.js`, `pages/characters.js`）: `$Index` 互換を削除し、`#Index` に統一。
- UI（`pages/characters.js`）: 一覧・詳細の `#Index` 表示（チップ/ピル/テーブル値）を直リンク（`idx/idxKey`）としてリンク化。
- Test（`tests/enrich.dblink.jump.merge.test.js`）: `#Index` 検索（スカラー/ネスト）の回帰テストを追加。
- Data（作品別 typedef）: 作品ごとの index ルートキー（例: `Num` / `Card` / `BeastType` / `Drc` / `Unit` / `Generation` / `Model`）を、各 `data/Works_*/DataBases/db_type.json($DefType)` に `"$type":"#Index"` として明示。
- Data（Breaking）: 作品ごとの index 定義（表示名/ネスト構造）は `data/Works_*/DataBases/db_type.json.$IndexDef` に集約し、`data/db_meta.json(CreationWorks.*.$DefType_Index / $Def_Index)` から削除。

### Enum/List 表示名解決の堅牢化（一覧の GenderType 回帰対策）

- UI（`pages/characters.js`）: `resolveVarsDefLabelPack()` が `#FemaleNeutral` のような「#付きコード」を受け取っても辞書（`$EnumDef_*` / `#List_*`）から JP/EN 表示名を解決できるようにし、一覧で英語コード表示へ退避する回帰を緩和。
- UI（`pages/characters.js`）: デバッグON時に、一覧の GenderType が生コードに退避した場合のみ最小ログを出力し、辞書欠損/値形式の切り分けを容易化。
- UI（`pages/characters.js`）: 一覧の GenderType チップ表示では `$display.langMode` を適用せず、既定の JP/EN 併記を優先（意図しない `langMode:'en'` 混入で英語コードのみになる回帰の暫定回避）。
- UI（`pages/characters.js`）: `schemaType:'$EnumDef|$EnumDef_withAbout'` を `$EnumDef_withAbout` の文字列一致で誤って enum 名扱いしないよう修正し、EnumDef の辞書解決がスキップされて raw（英語コード）に退避する問題を修正。

### フェーズ2: DB 種別多様化への耐性（メタ欠損フォールバック）

- SW 共通（`lib/sw-common.js`, `pages/sw.js`）: 作品別 `db_meta.json` の欠損/取得失敗時に、DB取得/検索/エンリッチが 500 で落ちないようにし、`_Commons` 適用のみスキップして継続。
- SW 共通（`lib/sw-common.js`）: メタが欠損している場合の DB 列挙フォールバック候補に `PrimaryDealer` / `PrimaryMobs` / `UnprocessedSecondary` を追加。
- SW 共通（`lib/sw-common.js`）: `db_meta.json.Databases.#DB_*._Secondaries[]` の `sec_Category` / `sec_DesignedBy` / `sec_SeriesTitle` による `_Commons` 分岐適用を調整。
  - `sec_SeriesTitle` が未指定の定義では、`sec_Category` 等の指定がある場合はレコード側でも必須一致として扱い、誤適用を防止。
- Test（`tests/sw.dbmeta.tolerance.test.js`）: `readWorkMeta()` 失敗時の耐性に関する回帰テストを追加。
- Test（`tests/commons.secondaries.test.js`）: `sec_Category` による `_Secondaries` 分岐（primary未指定時の必須一致）の回帰テストを追加。

### 開発支援（テスト/ドキュメント）

- Test（`tests/docs.links.test.js`）: Markdown 内の既知誤リンク（例: `pages/characters.html` の単数表記）を継続検知する軽量テストを追加。
- Docs（`README.test.md`, `CONTRIBUTING.md` ほか）: Windows/PowerShell の実行ポリシーで `npm.ps1` がブロックされる環境向けに、`npm.cmd test` / `.\node_modules\.bin\vitest.cmd run` の回避策を追記。

### フェーズ3: 予約語/機械処理キーの整理（命名の言語化・ハードコード削減）

- SW 共通（`lib/sw-common.js`）: 予約語（`_`/`$`/`#`）の判定・既知キー定数・`warnOnce` をまとめた `SchemaNaming` を追加。
- SW 共通（`lib/data-common.js`）: `_DBLink/_Jump/_Search/_enrichment` 等の処理で、`SchemaNaming` を参照して予約語判定・システムキー除外を統一（`startsWith('_')` 等の散在を削減）。
- 互換警告: 作品メタの旧キー `Secondaries` を参照した場合に、開発者向けに一度だけ警告を出す（正は `_Secondaries`）。
- Docs（`docs/db-update-guidelines.md`）: 予約語プレフィックスと命名運用の目安を追記。
- Data（UnauthedLogica）: typedef の legacy ラベルキー `hashtag_JP` を廃止し、`hashTag_JP` に統一。

### フェーズ4: API への統合（エンリッチ/マージの段階移行）

- API（`api/sw.js`）: `GET /api/v1/works/{work}/db/{dbName}` と `GET /api/v1/search` で `?enrich=1` を受け取り、UI 用 API（`/pages/v1`）と同等のエンリッチ出力（参照マージ・`$alt` フォールバック・`_enrichment` 付与など）を opt-in で返せるようにした（既定は互換維持のため enrich 無し）。
- SVC（`svc/sw.js`）: `/svc/v1` でも同様に `?enrich=1` をサポート。
- Docs（`docs/viewer-guide.md`）: `/api`/`/svc` の enrich opt-in を明記。
