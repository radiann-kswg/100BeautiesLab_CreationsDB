(更新日/Updated on 2026.1.27)

# 創作作品ガイドライン / Creation Works Guidelines

百花繚乱研究所/100BeautiesLab. の一次/二次創作に関するライセンス・利用許可・違反行為・二次創作OK/NGリストは、以下の **言語別ガイドラインファイル** に集約しています。

- 日本語版（正本）: [guideline.md](./guideline.md)
- English version: [guideline.en.md](./guideline.en.md)

> ガイドラインの本文（権利・運用上の重要情報）は上記ファイルが正です。GitHub Pages 上の UI / API などの導線や、リポジトリの技術情報は本 README に続けて記載しています。

---

# README ナビゲーション / Navigation

- GitHub Pages トップ: https://database.numbertales-radiann.net/
- まず閲覧する（UI）: https://database.numbertales-radiann.net/pages/characters.html
- API（GUI 付）: https://database.numbertales-radiann.net/api/
- 擬似 API: `https://database.numbertales-radiann.net/api/v1/*` / `https://database.numbertales-radiann.net/pages/v1/*` / `https://database.numbertales-radiann.net/svc/v1/*`
- ガイドライン（日本語版）: [guideline.md](./guideline.md)
- 閲覧者向けガイド: [docs/viewer-guide.md](docs/viewer-guide.md)
- データ更新ガイドライン（編集者向け）: [docs/db-update-guidelines.md](docs/db-update-guidelines.md)
- 第三者ポリシー（再配布/商用/AI 学習など）: [docs/third-party-policy.md](docs/third-party-policy.md)
- English (technical README): [docs/readme.en.md](docs/readme.en.md)
- English (guidelines): [guideline.en.md](./guideline.en.md)

# 当リポジトリについて(日本語版)

## まず見る（閲覧者向け）

- メインUI: `pages/characters.html`
- UI の使い方: `pages/README.md`
- 直リンクやデータ構造の説明: `docs/viewer-guide.md`

## 開発・貢献（編集者/開発者向け）

- 開発ルールと貢献手順: [CONTRIBUTING.md](CONTRIBUTING.md)
- テスト実行手順: [README.test.md](README.test.md)
- データベース更新ガイドライン: [docs/db-update-guidelines.md](docs/db-update-guidelines.md)
- 第三者のデータベース運用規約: [docs/third-party-policy.md](docs/third-party-policy.md)
- 閲覧者向けガイド: [docs/viewer-guide.md](docs/viewer-guide.md)

## 利用方法（概要）

### 基本的な手順

1. **ページアクセス**: `/pages/characters.html` にアクセス
2. **作品選択**: ドロップダウンから閲覧したい作品を選択
3. **キャラクター検索**:
   - 検索ボックスでキャラクター名・設定キーワード検索
   - 作品フィルターで特定作品に絞り込み
4. **詳細表示**: キャラクターカードをクリックして詳細プロフィールを表示

### 検索・フィルタリング機能

- **テキスト検索**: キャラクター名、説明文、設定情報での部分一致検索
- **作品フィルター**: 「全作品」または特定作品での絞り込み表示
- **リアルタイム更新**: 入力と同時に検索結果が更新される遅延処理実装

### 表示される情報

#### 基本情報セクション

- **キャラクター名**: 日本語名・英語名・別名
- **基本属性**: 性別、年齢、身長、体重等の物理的特徴
- **所属・役職**: 組織名、役職、階級等の社会的地位

#### 詳細設定セクション

- **性格・特徴**: 人格設定、行動パターン、価値観
- **背景・経歴**: 生い立ち、重要な出来事、関係性
- **能力・技能**: 特殊能力、戦闘技能、専門知識

#### 画像ギャラリー

- **キャラクターイラスト**: concept, design, arts フォルダから自動収集
- **設定資料**: designAlt, conceptAlt 等の派生デザイン
- **その他関連画像**: cardDesign、catalog 等の特殊画像

#### 関連情報（参照解決）

- **\_DBLink 参照**: 他のデータベース・キャラクターへの関連情報
- **クロスリファレンス**: 作品間・DB 間の関係性表示
- **動的リンク**: 関連キャラクターへの直接ジャンプ機能

---

<details markdown="1">
<summary>技術仕様（詳細）</summary>

## 技術仕様

### フロントエンド技術

- **HTML5**: セマンティックマークアップによる構造化
- **CSS3 + SASS**: CSS Grid/Flexbox によるレスポンシブレイアウト
- **JavaScript ES6+**: モジュール化された非同期処理
- **Service Worker**: 疑似 API 実装とキャッシング
- **共通ライブラリ**: `lib/sw-common.js`, `lib/data-common.js` による機能統合

### データ処理・ API 統合

- **JSON データベース**: `/data/Works_*/DataBases/` 配下の構造化データ
- **参照解決エンジン**: `_DBLink` 仕様に基づくクロスリファレンス処理
- **エンリッチメント機能**: キャラクターデータの充実化処理（画像情報、検索インデックス）
- **画像パス解決**: `db_type.json` の型定義に基づく画像ファイル自動検出
- **キャッシング戦略**: Service Worker による効率的なデータキャッシュ
- **StandardEndpointHandlers**: Service Worker間の重複コード削減と統一API

### ファイル構成

```
lib/                         # 共通ライブラリ
├── sw-common.js             # Service Worker共通機能（StandardEndpointHandlers等）
└── data-common.js           # データ処理共通機能（EnrichmentProcessor等）

pages/
├── characters.html      # メインHTMLページ
├── characters.js        # アプリケーションロジック
├── characters.css       # コンパイル済みスタイルシート
├── characters.sass      # SASS ソースファイル
└── sw.js               # Service Worker（疑似 API 実装）

api/                         # APIスコープ用Service Worker
└── sw.js               # 標準APIエンドポイント

svc/                         # 広告ブロッカー回避用Service Worker
└── sw.js               # APIミラーエンドポイント
```

### 主要 JavaScript 関数

#### アプリケーションレベル (`characters.js`)

- `loadWorks()`: 作品データ読み込み・ UI 初期化
- `loadCharacters(workId, dbType)`: キャラクターデータ取得・表示
- `renderCharacterList(characters)`: キャラクターリスト動的生成
- `showCharacterDetails(character)`: 詳細プロフィール表示
- `buildImagePath()`: 画像パス自動構築
- `renderDBLinkResolved()`: 参照解決結果表示

#### 共通ライブラリレベル

- `StandardEndpointHandlers`: Service Worker間の統一APIエンドポイント処理
- `EnrichmentProcessor.enrichRecords()`: キャラクターデータの充実化処理
- `ImageProcessor.imageFromRecord()`: 画像情報の自動抽出と処理
- `ApiEndpointHandlers`: 共通 API エンドポイントの処理

### レスポンシブ対応

- **モバイル（～ 767px）**: 1 カラム縦積みレイアウト
- **タブレット（768px ～ 1023px）**: 2 カラムレイアウト
- **デスクトップ（1024px ～）**: 3 カラムグリッドレイアウト
- **大画面（1200px ～）**: 最大 4 カラム表示

## データベース連携

### 対応データベース種別

- **Primary**: 一次創作キャラクター（メイン設定）
- **Secondary**: 公認二次創作キャラクター
- **SemiPrimary**: 公式アンソロジーキャラクター
- **SelfSecondary**: 公式セルフ二次創作キャラクター
- **Proxy**: 代理キャラクター
- **Mobs**: モブキャラクター

### 参照解決(\_DBLink)機能

キャラクターデータ内の `_DBLink` フィールドを自動的に検出し、参照先のデータを取得・表示する機能です。

#### 対応参照形式

```json
{
  "_DBLink": {
    "作品名": {
      "データベース名": ["キャラクターID1", "キャラクターID2"]
    }
  }
}
```

#### 表示形式

- 参照先キャラクターの基本情報（名前、画像、概要）をカード形式で表示
- 参照先への直接リンク機能
- 参照関係の視覚的な階層表示

## 画像管理システム

### 画像ディレクトリ構造

```
data/Works_{作品名}/Images/{DB_種別 または Ref_種別}/
├── concept/           # コンセプトアート
├── design/           # キャラクターデザイン
├── arts/             # 完成イラスト
├── designAlt/        # 代替デザイン
├── conceptAlt/       # 代替コンセプト
├── cardDesign/       # カードデザイン
└── catalog/          # カタログ用画像
```

- 通常のキャラクター DB は `Images/DB_Primary/` や `Images/DB_Secondary/` のように、catalog key に対応する `DB_*` サブフォルダへ配置します。
- References 系 DB は `Images/Ref_Glossary/` や `Images/Ref_Reference/` のように、`#Ref_*` catalog key に対応する `Ref_*` サブフォルダへ配置します。
- 作品共通画像だけは従来どおり `Images/General/` を使います。

### 画像表示優先順位

1. **メイン画像**: `design`、`concept` フォルダを優先表示
2. **サブ画像**: `arts`、`designAlt`、`conceptAlt` を補完表示
3. **特殊画像**: `cardDesign`、`catalog` 等の特定用途画像

### 画像パス解決ロジック

- `db_type.json` の `$image` 定義に基づく自動パス構築
- ファイル名パターンマッチング（PNGName、JPGName フィールド対応）
- 存在しない画像のプレースホルダー表示

## パフォーマンス最適化

### Service Worker キャッシング

- **メタデータ**: 作品情報・DB 情報の効率的キャッシュ
- **キャラクターデータ**: 頻繁にアクセスされるデータの持続キャッシュ
- **画像リソース**: 画像ファイルのブラウザキャッシュ活用

### 遅延ローディング

- **画像の遅延読み込み**: Intersection Observer API による効率的画像ロード
- **詳細データの動的取得**: 必要時のみ詳細情報を API から取得
- **検索結果の段階的表示**: 大量データの分割表示対応

### UI/UX 最適化

- **デバウンス処理**: 検索入力での過度な API 呼び出し防止
- **ローディング表示**: 処理中の明確なフィードバック
- **エラーハンドリング**: 失敗時の分かりやすいエラーメッセージ

## 今後の開発予定

- **詳細検索機能**: 属性別・設定項目別の高度な検索機能
- **キャラクター比較機能**: 複数キャラクターの並列表示・比較
- **お気に入り機能**: ユーザーのキャラクター保存・管理機能
- **エクスポート機能**: キャラシートの PDF・画像出力
- **アクセシビリティ向上**: スクリーンリーダー対応・キーボードナビゲーション強化

## 技術的な注意事項

### GitHub Pages 制約対応

- **静的サイト設計**: サーバーサイド処理なしで完全動作
- **CORS 設定**: Service Worker による適切なヘッダー処理
- **相対パス管理**: GitHub Pages のプロジェクトページ対応

### ブラウザ対応

- **モダンブラウザ**: Chrome 60+, Firefox 55+, Safari 11+, Edge 79+
- **Service Worker**: 対応ブラウザでのみフル機能利用可能
- **フォールバック**: 非対応ブラウザでの基本表示保証

### データ整合性

- **JSON スキーマ検証**: `db_type.json` によるデータ構造検証
- **参照整合性**: `_DBLink` 参照先の存在確認
- **画像ファイル整合性**: 定義された画像ファイルの存在検証

</details>

---

<details markdown="1">
<summary>API（Service Worker pseudo-API）仕様（詳細）</summary>

# API (Service Worker pseudo-API)について

GitHub Pages 上で提供する擬似 API を使って、`data/` 配下の JSON を取得できます。（GUI 付ページは https://database.numbertales-radiann.net/api/ ）

## エンドポイント

### 作品データベース本体

- `GET /api/v1/index` … 作品一覧の概要
- `GET /api/v1/works` … 作品の一覧（キー、タイトル）
- `GET /api/v1/works/{work}` … 作品メタ情報の閲覧
- `GET /api/v1/works/{work}/db` … 作品ごとに閲覧可能な DB（存在検出）
- `GET /api/v1/works/{work}/db/{dbName}` … 各 DB のレコード（`?resolve=0` で解決オフ）
- `GET /api/v1/search?works={work}&db={dbName}&hashTag={k}&key={v}` … DB 内の単純検索（AND）

例

```
/api/v1/index
/api/v1/works
/api/v1/works/NumberTales
/api/v1/works/NumberTales/db
/api/v1/works/NumberTales/db/Primary
```

### フィールド定義情報

- `GET /api/v1/varsdef` … グローバルと全作品のフィールド定義（`General.$VarsDef`）を俯瞰（`?merge=1` でグローバルと作品のマージビューも同時出力）
- `GET /api/v1/varsdef/global` … グローバルの `General.$VarsDef` のみ
- `GET /api/v1/works/{work}/varsdef` … 指定作品の `General.$VarsDef` のみ

例

```
/api/v1/varsdef
/api/v1/varsdef/global
/api/v1/works/Works_NumberTales/varsdef
```

### 型定義（$DefType）およびハイブリッド俯瞰

- `GET /api/v1/typedef` または `GET /api/v1/deftype` … グローバルと全作品の `$DefType` を俯瞰
- `GET /api/v1/typedef/global` または `GET /api/v1/deftype/global` … グローバルの `$DefType` のみ
- `GET /api/v1/works/{work}/typedef` または `GET /api/v1/works/{work}/deftype` … 指定作品の `$DefType` のみ

- `GET /api/v1/defs` … `General.$VarsDef` と `$DefType` の統合出力（`?merge=1` で VarsDef のマージビューも付与）
- `GET /api/v1/defs/global` … グローバルの `General.$VarsDef` と `$DefType`
- `GET /api/v1/works/{work}/defs` … 指定作品の `General.$VarsDef` と `$DefType`（`?merge=1` 対応）

注意: `General.$VarsDef` および `$DefType` は、上記の `varsdef` / `typedef(deftype)` / `defs` 系エンドポイントでのみ出力されます。その他のエンドポイント（`/works`、`/db`、`/search` など）では定義情報は含みません。

</details>

---

<details markdown="1">
<summary>キャラシート生成機能（UI）と /pages/v1 API（詳細）</summary>

# キャラシート生成機能(beta)について

GitHub Pages 上で`data/` 配下のキャラクター情報に関するプロフィールページを生成します。（キャラシート生成機能ページは https://database.numbertales-radiann.net/pages/characters.html ）

## 機能概要

キャラシート生成機能は、創作データベースに収録されているキャラクターの詳細情報を、視覚的に分かりやすいカード形式で表示する機能です。Service Worker による疑似 API を活用し、GitHub Pages 上で完全に動作する静的ウェブアプリケーションとして実装されています。

### 主要機能

- **キャラクター検索・フィルタリング**: リアルタイムテキスト検索と作品別フィルタリング
- **詳細プロフィール表示**: キャラクターの基本情報、設定、関連画像の統合表示
- **画像ギャラリー**: キャラクター関連画像の自動収集・表示機能
- **参照解決(\_DBLink)**: データベース間のクロスリファレンス自動解決・表示
- **レスポンシブデザイン**: PC・タブレット・スマートフォン対応の適応的レイアウト

## エンドポイント・URL

### メインページ

- `GET /pages/characters.html` … キャラシート生成メインページ

### Service Worker API (マルチスコープ対応)

#### キャラクターページ用 API (`/pages/v1/*`)

- `GET /pages/v1/works` … 作品一覧取得
- `GET /pages/v1/works/{work}/db` … 作品の利用可能データベース一覧
- `GET /pages/v1/works/{work}/db/{dbName}` … キャラクターデータ取得（エンリッチメント付き）
- `GET /pages/v1/bootstrap` … 全データブートストラップ（エンリッチメント付き）
- `GET /pages/v1/search` … 検索機能（エンリッチメント付き）

#### 標準 API (`/api/v1/*`)

- 同様のエンドポイント（エンリッチメントなし）

#### 広告ブロッカー回避 API (`/svc/v1/*`)

- 標準APIのミラー（エンリッチメントなし）

例:

```
/pages/characters.html
/pages/v1/works/NumberTales/db/Primary
/pages/v1/image-resolve/NumberTales/Primary/nt_NumberTwins_TwoSpade
```

</details>

# About This Repository (English Version)

This README is primarily maintained in Japanese.

- Full English technical README: [docs/readme.en.md](docs/readme.en.md)
- Creation works guidelines (EN, canonical): [guideline.en.md](./guideline.en.md)
