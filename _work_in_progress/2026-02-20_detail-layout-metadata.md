# 2026-02-20 Detail Layout / Display Metadata

## 目的

- 詳細ビュー（pages/characters.js）の「表示済みキーの除外」「ヘッダピル」「基本情報テーブル」の構成を、できるだけ JSON メタデータ（db_type/db_meta）側で調整できるようにする。

## 変更点の要約

- UI: 詳細ビューが `data/db_meta.json` の `CreationWorks.<work>.$DetailLayout` を参照できるようにした。
  - `headerPills`: タイトル行のピルに表示するキー配列（未指定時は `Progress` のみ）。
  - `basicFields`: 基本情報テーブルの表示キー配列（未指定時は従来の固定セット + `ModelNumber` を含む）。
  - `suppressKeys`: 自動表示（schema-driven buckets）から除外するキー配列（任意）。
- UI: `data/db_type.json` の `"$display"` で `auto:false` を尊重し、スキーマ駆動の自動表示から除外できるようにした（別名/統合表示用途）。
- UI/Data: `data/db_type.json` の `$alt` を解釈し、該当フィールドが存在しない場合に代替フィールドを参照できるようにした（例: `Age` が無い場合に `ConceptAge` を参照）。
- Data: `data/db_type.json` に `ModelName`/`Class`/`Class_EN` を追加し、`CodeName`/`SPCodeName_EN`/`Class_EN` に `auto:false` + `aliasOf` を付与。
- Data: `data/db_meta.json` に全作品へ `$DetailLayout` の初期値（同一テンプレ）を追記。

## 影響範囲（編集ファイル）

- pages/characters.js
- data/db_type.json
- data/db_meta.json
- CHANGELOG.md

## 検証

- `npm test`（Vitest）: 7/7 pass

## ユーザー確認ポイント（重要）

- `data/db_type.json` の追加/変更
  - `CodeName` / `SPCodeName_EN` / `Class_EN` の `$display.auto:false` と `aliasOf` が意図通りか
  - `ModelName` / `Class` / `Class_EN` の型・ラベルが意図通りか
- `data/db_meta.json` の `$DetailLayout` 初期値が全作品で妥当か（作品ごとの差分が必要なら調整）

## 補足

- UI はメタデータ未設定時のフォールバックを持つため、段階的に JSON 側を調整可能。
