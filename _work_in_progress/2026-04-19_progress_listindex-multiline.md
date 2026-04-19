# 2026-04-19 `#ListIndex[]` 詳細表示の改行対応

## 目的

`$type: "#ListIndex[]"` や `#ListLink[]` のような配列型フィールドを詳細テーブルで表示する際、配列要素をカンマ連結せず要素ごとに改行して可読性を上げる。

## 変更点の要約

- `pages/characters.js`
  - `formatValueForDisplay()` で `#ListIndex[]` / `#ListLink[]` を改行連結へ変更
  - `kvTable()` で改行文字列を `preWrapText()` へ通し、td 内で改行が潰れないように調整
  - basic 補助テーブルは、`db_meta.json($DetailLayout.basicFields)` に既に含まれる `Belonging` / `Area` / `BirthDay` / `AnivDay` を重複表示しないよう調整
  - `##String_JP` / `##String_EN` の bilingual multiline 値は、詳細テーブル内で JP/EN 2 列の専用ノードへ変換
- `pages/characters.sass`
  - bilingual multiline 用の 2 列レイアウトスタイルを追加
- `CHANGELOG.md`
  - 上記 UI 表示仕様を追記

## 影響範囲

- `pages/characters.js`
- `CHANGELOG.md`

## 未完了タスク

- 実画面で `Belonging` 以外の `#ListIndex[]` / `#ListLink[]` 項目が意図通り 1 要素 1 行になっているか確認する

## 参考リンク

- `data/db_type.json` の `Belonging`
- `pages/characters.js`
