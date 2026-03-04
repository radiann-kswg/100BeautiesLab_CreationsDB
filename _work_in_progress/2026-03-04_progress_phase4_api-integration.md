# 2026-03-04 進捗ログ: 希望タスク フェーズ4（API への統合）

## 目的

- 「キャラシート（UI）側で実施しているマージ機能」を、標準 API（`/api/v1` / `/svc/v1`）からも利用できるようにし、第三者利用を想定した API 出力の保証範囲を広げる。
- 互換維持のため、既定動作（エンリッチ無し）を壊さず **opt-in（`?enrich=1`）** で段階移行できる形にする。

## 変更点の要約

- API（`/api/v1`）の DB 取得/検索で `?enrich=1` を受け取り、`EnrichmentProcessor.enrichRecords()` を適用した出力を返せるようにした。
- SVC（`/svc/v1`）も同様に `?enrich=1` をサポート。
- 閲覧者ガイドへ `?enrich=1` の説明を追記。

## 影響範囲（編集したファイル）

- `api/sw.js`
- `svc/sw.js`
- `docs/viewer-guide.md`
- `CHANGELOG.md`

## 仕様メモ（現時点の合意）

- `/pages/v1` は UI 用として既定でエンリッチ有り。
- `/api/v1` と `/svc/v1` は後方互換のため既定でエンリッチ無し。
- `/api/v1` と `/svc/v1` は `?enrich=1` を付けることで、参照マージ（`_DBLink`/`_Jump`）、`$alt` フォールバック、`_enrichment` 付与などを含む「エンリッチ出力」を取得できる。

## 検証（観点）

- `npm test`（Vitest）が通ること。
- 手動確認（任意）:
  - `GET /api/v1/works/Works_NumberTales/db/Primary?resolve=1` と `...&enrich=1` の差分として、`_enrichment` 付与や `_DBLink/_Jump` の解決差分が見えること。
  - `GET /svc/v1/search?...&enrich=1` でも同様に動作すること。

## 未完了タスク

- 第三者向けに「どのキーがエンリッチで追加されるか（`_enrichment` の仕様）」を、`docs/` に短く整理する（必要になったタイミングで）。
