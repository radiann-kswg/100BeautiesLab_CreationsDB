# 2026-02-18 キャラシート表示抜け対応（作品横断）

## 目的

- キャラシート生成機能（pages/characters.html）にて、NumberTales 以外の作品で表示されていないフィールドが発生していたため、DB のトップレベル項目を漏れなく表示できるようにする。

## 背景・課題

- 詳細ビューの表示が「基本情報＋能力系＋概要」中心になっており、作品固有フィールド（例: 獣爾騎兵の `BeastType` / `Beastspec*`、各種呼称、プロフィール文など）が UI 上で落ちていた。
- 一部作品の `db_type.json` に `hashTag_JP` の綴り揺れ（`hashtag_JP`）があり、ラベル取得ができないケースがあった。

## 変更点の要約

- 詳細ビューに「プロフィール/テキスト」「その他の項目」を追加し、既存の専用表示で扱っていないフィールドを自動列挙して表示。
- 追加で、`db_type.json` の `$DefType` からトップレベル項目（順序・ラベル・型）を抽出し、スキーマ順に「その他の項目」を生成するようにした（スキーマ外の項目は末尾にフォールバック表示）。
- `formatValueForDisplay()` を拡張し、`hideText` や `{value, about_*}`、`{Day:{Month,DayOfMonth}}` などの共通表現を読みやすく整形。
- ラベルマッピング/画像フィールド抽出で `hashtag_JP` を `hashTag_JP` のフォールバックとして扱う。

## 影響範囲（編集したファイル）

- pages/characters.js

## 検証

- Vitest（既存テスト）を実行し、成功を確認。

## 未完了タスク

- UI 上での実機確認（本番/開発環境で、任意の作品・DB を切り替えて「その他の項目」に落ちがないことを確認）。

## 参考

- 開発環境: http://127.0.0.1:5500/pages/characters.html
- 本番環境: https://database.numbertales-radiann.net/pages/characters.html
