# 2026-02-21 2言語対応フィールド（_\_JP / _\_EN）の同義解釈

## 目的

- 和文フィールドと英文フィールド（例: `FormalName_JP` と `FormalName_EN`）を「言語が違うだけで同義のフィールド」として解釈できるようにし、
  - UI での重複表示を抑止
  - SW 側検索での一致判定を柔軟化
    する。

## 変更点の要約

- UI（pages）
  - 詳細ビューの「基本情報テーブル」と「スキーマ駆動の自動表示」で、`*_JP`/`*_EN` を 1 行に統合して表示するよう対応。
  - リスト側の簡易検索（`matchFilter`）に `Name_JP`/`FormalName_JP` などの互換キーを追加。
- SW（lib）
  - `EnrichmentProcessor.searchRecords()` で、クエリ hashTag の `base`/`*_JP`/`*_EN` を相互にエイリアス扱いして一致判定できるよう拡張。
- Test
  - `searchRecords()` の同義解釈を確認する最小テストを追加。

## 影響範囲（編集したファイル）

- pages/characters.js
- lib/data-common.js
- tests/bilingual-fields.test.js
- CHANGELOG.md

## 検証

- `npm test`（Vitest）: 全テスト成功（8/8）。

## 未完了タスク

- UI 上の「統合表示の見せ方」（区切り文字、改行、優先言語など）を、作品やフィールド単位で制御したい場合の設計（例: `db_type.json($DefType).$display` にヒントを追加）。
- dot-path（例: `Profile.Name_JP` のようなネスト）を同義統合の対象にするかの検討（現状はトップレベル中心）。

## 参考リンク

- \_work_in_progress/2026-02-20_remaining-task.md
- CHANGELOG.md
