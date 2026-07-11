# NumberTales `NumberMarkLocation` / `IdentityMotif` 廃止

## 目的

`AppearanceDetail`（外見デザイン詳細の一本化フィールド）への情報集約が進んだため、Works_NumberTales の旧フィールド `NumberMarkLocation`（番号の印字箇所）と `IdentityMotif`（キャラクター固有のモチーフ）を廃止する。両フィールドは `scripts/migrate-appearance-detail.mjs`（試験運用として並走追加）により、すでに `AppearanceDetail` へ変換済みだった。

## 事前確認

- `data/Works_NumberTales/DataBases/db_Primary.json` 全105レコード中95レコードが両フィールドを保持（片方のみ保持のケースはゼロ）。
- 該当95レコード全件で `AppearanceDetail` への移行が完了済み（移行漏れゼロ）を確認してから着手。
- `IdentityMotif` はグローバル `data/db_type.json`／`data/db_meta.json` に宣言されており、`scripts/migrate-appearance-detail.mjs` のコメントから Works_UnibyteLive（構想途中作品）でも将来使う想定だったことが判明。User に確認の上、「NumberTales以外で実データが存在しない」ことを踏まえグローバル定義ごと完全削除する方針で合意。

## 変更点（影響範囲）

- `data/Works_NumberTales/DataBases/db_type.json`: `NumberMarkLocation` フィールド宣言、専用型 `$Def_NumberMarkLocation` / `$Def_NumberMark`（他フィールド未使用のため道連れ削除）を削除。
- `data/db_type.json`（グローバル）: `IdentityMotif` フィールド宣言を削除。
- `data/db_meta.json`（グローバル）: `IdentityMotif` 専用型 `$Def_FormsMotif`（他フィールド未使用）を削除。
- `data/Works_NumberTales/DataBases/db_Primary.json`: 該当95レコードから `NumberMarkLocation` / `IdentityMotif` を削除。
- `lib/section-renders/formsMotif.js`: `formsMotifSection` レンダラーを削除（参照元フィールド廃止のため）。
- `pages/characters.js`: 上記ファイルの `import` を削除。sectionWrapper未登録時のスキップ挙動を説明するコメント例を `IdentityMotif`→`AppearanceDetail` に更新（内容が古くなるため）。
- `docs/wrapper-summary-registry.md`: `formsMotifSection` の記載を除去。
- `lib/section-wrapper-common.js` / `tests/section-wrapper-common.test.js`: built-in section renderer 一覧コメントから `formsMotifSection` を除去。
- `CHANGELOG.md`: 本変更を追記。
- 新設 `scripts/migrate-remove-nummark-identitymotif.mjs`: 削除用マイグレーションスクリプト（実行後も履歴として残置）。

## 実装メモ（ハマった点）

`db_Primary.json` は短い配列/オブジェクトをインライン化する独自フォーマット（例: `"Day": { "Month": 1, "DayOfMonth": 1 }`）を使っており、`JSON.parse` → `JSON.stringify(x, null, 2)` で再シリアライズすると全体が Prettier デフォルト相当の展開フォーマットに変換され、削除対象と無関係な箇所まで大量に差分が出てしまった（`npx prettier --write` で整形し直しても同様、`.prettierrc` 等の設定ファイルは本リポジトリに存在せず再現できなかった）。そのため、対象キーの開始行から角括弧の深さを追跡して終了行を特定し、該当行範囲だけを削除する行ベースの外科的削除に切り替えて対応した（`scripts/migrate-remove-nummark-identitymotif.mjs`）。事前に対象フィールドの値に `[`/`]` を含む文字列が無いこと、対象フィールドがオブジェクトの最後のキーになるケースが無いことを確認した上で実施。

## 検証

- `node scripts/migrate-remove-nummark-identitymotif.mjs` 実行後、`git diff` で追加行ゼロ・削除行のみ（NumberMarkLocation/IdentityMotifブロック以外に変更なし）を確認。
- `npm test` 実行: 244件中243件成功。
- 失敗した1件（`tests/data.shape.test.js` の `TailsUnit_PNGName` 拡張子欠落関連）は `git stash` で変更前の状態に戻して再実行し、**本変更前から存在する既存不具合**（今回の変更と無関係）であることを確認済み。今回のスコープ外として対応せず、別課題として記録のみ残す。

## 未完了タスク・課題

- 上記の `TailsUnit_PNGName` 拡張子欠落（Num:4 他）は別途対応が必要（本ログの対象外）。

## 参考リンク

- `scripts/migrate-appearance-detail.mjs`（旧: AppearanceDetail 並走追加スクリプト）
- `CHANGELOG.md`（本変更の要約）
