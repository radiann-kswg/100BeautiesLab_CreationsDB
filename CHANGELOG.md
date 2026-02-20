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
   - `lib/sw-common.js`: Service Worker 共通機能の統合
   - `lib/data-common.js`: データ処理共通機能の統合
   - 全 Service Worker 間での機能統一とコード重複削減

2. **StandardEndpointHandlers クラスの実装**
   - Service Worker 間で重複していた標準エンドポイント処理を統合
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
