# 2026-02-20 \_DBLink / \_Jump マージ出力対応

## 目的

- Object 型フィールドとして投入されている `_Jump` / `_DBLink` を、クライアント側（API/キャラシート）で柔軟に扱えるようにする。
- 特に `_Jump` は `_DBLink` や `hashTag`/`_Search` を基点に参照先DBの値を取り込み、**出力に直接マージ**する。
- `_Jump` が無い場合でも、`_DBLink` で参照している他DBに同名フィールドがあれば、空値を参照先で穴埋めして出力する。

## 変更点の要約

- SW のエンリッチ処理（`EnrichmentProcessor.enrichRecords`）に `_DBLink` 解決→マージ→`_Jump` 置換を追加。
  - `_DBLink._Search` で参照先レコードを特定（曖昧一致/大量取得は避け、**1件一致のみ**を採用）。
  - 参照先レコードの同名フィールドを、現在レコードの空値（`undefined/null/''/[]` など）に限って穴埋め。
  - `{ _Jump: { hashTag, _Search } }` は参照先の `hashTag` フィールド（ドットパス可）から値を取り出し、必要に応じて `_Search` で配列要素を絞って置換。
  - `hideText` は意図的マスクとして尊重し、参照先値で上書きしない。
- Vitest で in-process テストを追加（SinisterChangingGirls ↔ NumberTales の相互リンクを利用）。
- Node(Vitest) でも `EnrichmentProcessor` を利用できるよう `globalThis` にクラスを公開（`self/window` が無い場合のみ）。

## 影響範囲（編集したファイル）

- lib/data-common.js
- tests/enrich.dblink.jump.merge.test.js
- \_work_in_progress/2026-02-20_dblink-jump-merge.md

## 検証

- Vitest 全体が成功（追加テスト含む）。

## 未完了タスク / 今後の検討

- `_DBLink` が複数定義（配列）されるケースのマージ合成ルールは未確定のため、現状は先頭のみ採用。
- `_Jump` の `_Search` マッチングは最低限の比較（`value` ラッパー/配列 any-match など）に留めている。必要なら `searchRecords` 同等の比較器へ寄せる。
