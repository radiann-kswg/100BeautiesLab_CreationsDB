# 2026-03-04 進捗: セキュリティアラート（CodeQL）対応

## 目的

GitHub CodeQL のセキュリティアラートとして指摘されやすい箇所（DOM XSS / パス注入）を、既存仕様を大きく変えずに最小差分で修正する。

## 変更点の要約

- UI（`pages/characters.js`, `pages/characters_final.js`）
  - `innerHTML` へ動的文字列（例: `error.message`）を埋め込む描画を廃止。
  - エラー/ローディング/デバッグ表示は `textContent` と DOM 要素生成で描画。
- SW（`lib/sw-common.js`, `pages/sw.js`）
  - `works` / `db` パラメータを **英数字+`_` のみ**許可（不正な入力を 400 で拒否）。
  - DB 不存在なども 500 で落とさず、400/404 のレスポンスに整理。
- 共通DOMユーティリティ（`lib/frontend-common.js`）
  - `DOMUtils.createElement()` で `innerHTML` を直接セットしないよう変更。

## 影響範囲（編集したファイル）

- `lib/sw-common.js`
- `pages/sw.js`
- `pages/characters.js`
- `pages/characters_final.js`
- `lib/frontend-common.js`
- `CHANGELOG.md`

## 検証

- `vitest`（既存テスト一式）: 全てパス

## 未完了タスク

- GitHub 側の Security alerts（CodeQL）画面で、該当アラートが解消済みになっているか確認（リポジトリ設定/解析タイミングに依存）。

## 補足

- 本対応は「危険な sink（`innerHTML`）の排除」と「外部入力をパス生成に使う箇所の厳格化」を主眼にしています。
- 実際に指摘されていたアラートの種類が異なる場合は、GitHub のアラート内容（クエリ名/箇所）に合わせて追加対応します。
