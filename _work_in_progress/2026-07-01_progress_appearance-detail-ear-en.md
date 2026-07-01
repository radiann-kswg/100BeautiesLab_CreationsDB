# AppearanceDetail 耳まわり value_EN/about_EN 補完

## 目的

`data/Works_NumberTales/DataBases/db_Primary.json` の `AppearanceDetail`（`BodyPart: ["#BodyPart_Ear"]` および `DesignElement: "#Element_Ear"` 関連）で、`value_EN` / `about_EN` が未入力だった 25 件を補完する。

## 変更点の要約

- 対象抽出: `BodyPart` に `#BodyPart_Ear` を含む、または `DesignElement === "#Element_Ear"` の `AppearanceDetail` 要素を全走査し、`Attrs[].value_JP` / `about_JP` に対応する `_EN` が欠落している箇所を機械抽出（25 件、ユーザー申告件数と一致）。
- 内訳: `#DesignAttr_Ear`（耳の状態説明・`about_EN`）21 件、`#DesignAttr_Overview`（イヤリング等・`value_EN`）4 件（Num 22, 69, 84 ほか）。
- 翻訳方針: `docs/localization-en-rules.md` §0（既存 `_EN` 上書き禁止・既存 JP のみ翻訳）・§3-13/3-14 の名詞句スタイルに準拠。用語集 (`docs/localization-glossary-quickref.md`) に該当語なし（固有名詞ではないため）。同一 JP 文言が複数キャラで重複するケース（例: `先がアクセントカラー` → `with accent color tips`、`垂れ耳` → `drooping ears`）は、ファイル内の既存訳例（Num 9 `先がアクセントカラー` → `with accent color tips` 等）と表記を統一。`左耳のアクセサリー`（Num 84）は既存の Num 88 `左耳のアクセサリー` → `left ear accessory` と完全一致させた。
- キー挿入は `insertAfterKey` 相当（対応する `_JP` キーの直後に `_EN` を挿入）。ただし実装は JSON.parse→stringify の再シリアライズを使わず、対象 25 行をテキストレベルでピンポイント編集（後述「実装メモ」参照）。

## 影響範囲（編集ファイル）

- `data/Works_NumberTales/DataBases/db_Primary.json`（25 箇所、+48/-25 行の差分。他の整形崩れなし）

## 実装メモ（再現性のため記録）

- 初回、ドキュメント記載の `JSON.parse` → `db.map(insertAfterKey)` → `JSON.stringify(data, null, 2)` パターンを試したところ、本ファイルは Prettier 側で短い配列/オブジェクトを 1 行に圧縮するフォーマット（例: `{ "AttrLabel": "...", "value_JP": "..." }` を 1 行で保持）になっており、素の `JSON.stringify` は全オブジェクト/配列を展開してしまうため巨大な無関係差分（+10590/-3173 行相当）が発生した。**この再シリアライズ方式は本ファイルには使わないこと。**
- 代替として、対象 25 行を行番号ベースで特定し（`Num` フィールドの直近出現でスコープを絞りつつ対象 JP 文言の行を走査）、該当行のみをテキスト差し替え（1 行 → 2 行 の展開、または 1 行内 `}` 直前への挿入）する方式に切り替えて解決。差分は想定通り 25 箇所のみ。

## テスト結果

- `npx vitest run` → 18 ファイル pass / 110 テスト pass。残り 2 ファイル（`tests/docs.links.test.js`, `tests/pages.characters.ui-output.test.js`）は `glob` / `jsdom` パッケージ未インストールによる実行時エラーで、今回のデータ変更とは無関係（環境側の既知課題）。

## 未完了タスク

- なし（申告された 25 件は全件補完済み）。念のため User による訳文の最終確認を推奨。
- `git commit` — User 手動判断のタイミングで実施。

## 参考リンク

- `docs/localization-en-rules.md`（英訳入力補助 正典）
- `docs/localization-glossary-quickref.md`（固有名詞早見表）
- 関連進捗: `2026-06-30_progress_appearance-detail-cleanup.md`
