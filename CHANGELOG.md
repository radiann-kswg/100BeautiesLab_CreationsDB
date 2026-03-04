# 最新のリファクタリング・仕様変更履歴

## 2025.08.21〜2025.08.30

### DB大規模拡張・データ構造整備 / APIテストページ整備

- 複数作品（NumberTales / FLInvestigator78 / ShouArRiders / SinisterChangingGirls / Proxies / DestinyFoxsRecords 等）の DB 更新と、`db_meta.json` などメタ情報の整理を実施。
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
- `data/Works_DestinyFoxsRecords/DataBases/db_type.json`
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

### フェーズ2: DB 種別多様化への耐性（メタ欠損フォールバック）

- SW 共通（`lib/sw-common.js`, `pages/sw.js`）: 作品別 `db_meta.json` の欠損/取得失敗時に、DB取得/検索/エンリッチが 500 で落ちないようにし、`_Commons` 適用のみスキップして継続。
- SW 共通（`lib/sw-common.js`）: メタが欠損している場合の DB 列挙フォールバック候補に `PrimaryDealer` / `PrimaryMobs` / `UnproceededSecondary` を追加。
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
