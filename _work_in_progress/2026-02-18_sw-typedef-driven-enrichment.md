# 2026-02-18 SW: typedef駆動の enrichment/search（表示分類→正規化→画像→検索）

## 目的

- Service Worker 側でも `db_type.json($DefType)` を解釈し、`enrich` / `search` の挙動（表示分類・正規化・画像・検索比較）をスキーマ追従に寄せる。
- フィールド追加時に、基本的には `db_type.json`（＋必要なら `db_meta.json` の `$VarsDef`）更新で SW 側の挙動が追従する状態に近づける。

## 変更点の要約

- `lib/data-common.js`
  - `EnrichmentProcessor` に work context キャッシュを追加（typedef/varsdef を work ごとにマージ）。
  - `$DefType` の配列を扱う `TypeDefUtils` を追加し、以下を typedef 駆動で生成:
    - **表示分類**: `displaySections`（`basic/profile/spec/images/other`）を `_enrichment.displaySections` として付与。
    - **正規化**: `$type` に応じてトップレベル値を軽く正規化（例: `[]` 型は配列化、`#Number` は文字列数値を number 化など）。
    - **画像**: `$DefType` から画像フィールドの dot-path ヒントを抽出し、`ImageProcessor` がそのパスも参照して画像抽出/URL解決を行うよう拡張。
    - **検索**: 既存の「hashTag/key の構造検索」を維持しつつ、typedef を参照して数値比較などを補助する `EnrichmentProcessor.searchRecords()` を追加。
  - enrich したレコードには `_enrichment.schemaDriven=true` / `_enrichment.normalized=true` を付与。

- `lib/sw-common.js`
  - `enrichRecords(records, workId, dbName)` の **dbName 伝播**を追加（bootstrap/db/search いずれも）。
  - `search` は `enrichmentProcessor.searchRecords()` があれば優先して使用（なければ従来通り `SearchEngine.searchRecords()`）。

- `pages/sw.js`
  - `/pages/v1/enrich` でも `enrichRecords(records, workId, dbName)` に変更。

## 影響範囲（編集したファイル）

- lib/data-common.js
- lib/sw-common.js
- pages/sw.js

## 検証

- Vitest: 全テスト成功。

## 補足（運用/設計）

- `db_type.json` 側で各 `$DefType` エントリに `displaySection`（または `$display.section`）を追加すると、表示分類を **データ側で明示指定**できます。
  - 未指定の場合は `hashTag` と `$type` から推定します（最小実装）。

## 未完了タスク

- 実機確認: `/pages/v1/enrich` のレスポンスに `_enrichment.displaySections` が付くこと、画像 URL が期待のパスへ解決されることの確認。
- 必要なら `db_type.json` に `displaySection` を段階導入し、推定ロジック依存を減らす。
