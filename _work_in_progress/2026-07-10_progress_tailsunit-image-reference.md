# TailsUnit 参考画像フィールド追加 + `$subfolder` スキーマ属性新設

## 目的

`TailsUnit`（`$Def_TailsUnit[]`）の複雑な分岐配置（`Branches`/`LayoutDirection`）は、テキストの一行サマリーだけでは伝わりにくい。User が用意した尻尾ユニット参考画像11枚（`Images/DB_Primary/.private/attr_tailsUnit{Num}.png`、Num: 4/6/16/23/39/49/57/61/73/85/93）を `TailsUnit` に紐付けて表示できるようにする。

`2026-07-07_progress_tailsunit-dedicated-type.md` の「未完了タスク」に挙げられていた `img_PNGName` 相当の参考画像表示・`tailsUnitSection` の未使用状態を、本セッションで解消した。

## 変更点の要約

1. **スキーマ**: `data/Works_NumberTales/DataBases/db_meta.json` の `$Def_TailsUnit.$DefType`（`LayoutDirection` と `Note_JP` の間）に `TailsUnit_PNGName`（`$type: "#PNGFileName|#Null"`）を追加。新設した `$subfolder`（`"attr/tailsUnit"`）で画像フォルダの相対パスを明示宣言。
2. **`$subfolder` スキーマ属性の新設**（User指示）: `_PNG` 接頭辞からの自動フォルダ名推測（`TypeDefUtils.inferFolderHintFromKey()`）より優先される、画像フィールド向けの明示的な相対パス宣言。`lib/data-common.js`（SW enrich 側）・`pages/characters.js`（`extractImageFields()`、UIギャラリー側）の両方で対応。
3. **根本原因の修正（User承認済みスコープ）**: `TypeDefUtils.buildImagePathHints()` が `"$Def_TailsUnit[]"` のような名前付き型参照文字列を展開できず、`$Def_TailsUnit`/`$Def_AppearanceDetail` 内部の画像フィールドが typedef 駆動の画像抽出（`indices.imagePathHints`）から漏れていた問題を修正。`lib/wrapper-common.js` の既存公開ヘルパー `CharacterValueWrapperRegistry.helpers.resolveTypeDefEntries()` を再利用して解決した（SW側で `wrapper-common.js` が `data-common.js` より先に `importScripts` されるため、同一グローバルスコープから参照可能）。
4. **UI描画**: `lib/section-renders/tailsUnit.js` の `tailsUnitSection.render()` に、`TailsUnit_PNGName` があれば `$subfolder` をスキーマから解決した上でURLを構築し、既存の `createGalleryImageItem`（ライトボックス拡大表示対応、`pages/characters.js`）でサムネイル表示する処理を追加。
5. **想定外だった発見と対応**: `TailsUnit` は `data/db_meta.json` の `CreationWorks.#Works_NumberTales.$DetailLayout.basicFields`（一行サマリー）にのみ登録されており、`subFields` には未登録だったため、`tailsUnitSection`（標準セクションレンダラー、`$display.sectionWrapper` で宣言済みだが実際には描画されていなかった）が一度も呼ばれていないことが判明した。画像を表示する場所を確保するため、`subFields` にも `TailsUnit` を追加。`pages/characters.js` の「1項目1箇所の原則」（`isPromotedSubFieldKey` フィルタ）により、`basicFields`（一行サマリー）からは自動的に除外され、`AppearanceDetail` と同様の専用折りたたみセクション「尻尾ユニット」でのみ表示されるようになった（サマリーと詳細の二重表示にはならない）。
6. **データ移行**: `scripts/backfill-tailsunit-image.mjs`（新規）で `db_Primary.json` の対象11レコードへ `TailsUnit_PNGName` を機械的に付与（dry-run既定・`--write`で反映、レコード境界検出+Prettier整形の既存方式を踏襲）。
7. **画像フォルダ移動**: `.gitignore`（`.[pP]rivate/`）により未追跡だった `.private/` から、`git mv` ではなく通常のファイル移動 + `git add` で `Images/DB_Primary/attr/tailsUnit/` へ移動（ファイル名は変更なし）。

## 影響範囲（編集ファイル）

- `data/Works_NumberTales/DataBases/db_meta.json`（`$Def_TailsUnit.TailsUnit_PNGName` 追加）
- `data/Works_NumberTales/DataBases/db_Primary.json`（対象11件へ `TailsUnit_PNGName` 投入）
- `data/db_meta.json`（グローバル、`CreationWorks.#Works_NumberTales.$DetailLayout.subFields` に `TailsUnit` 追加）
- `data/Works_NumberTales/Images/DB_Primary/attr/tailsUnit/`（新規、画像11枚）
- `lib/data-common.js`（`TypeDefUtils.buildImagePathHints`/`extractFromTypeDefinition`/`buildEnrichmentIndices`）
- `lib/section-renders/tailsUnit.js`（参考画像表示）
- `pages/characters.js`（`extractImageFields` の `$subfolder` 対応、`buildTailsUnitImageUrl` ヘルパー追加、`context.helpers` 拡張）
- `scripts/backfill-tailsunit-image.mjs`（新規）
- `tests/data.shape.test.js` / `tests/pages.characters.ui-output.test.js` / `tests/enrich.wrapper-summaries.test.js`
- `CHANGELOG.md` / `docs/schema-meta-processing.md` / `docs/wrapper-summary-registry.md`
- `_work_in_progress/2026-07-07_progress_tailsunit-dedicated-type.md`（未完了タスクの解消を追記）

## 検証

- `npm test`: 全22ファイル・207件成功（新規/更新テスト含む）。
  - `tests/data.shape.test.js`: `$Def_TailsUnit` フィールド名・`$subfolder` 宣言・対象11件のデータ/画像ファイル存在確認。
  - `tests/pages.characters.ui-output.test.js`: `TailsUnit` が専用セクションとして描画され基本情報テーブルとは重複しないこと、参考画像あり/なし双方の描画確認（`<img>` の `src` が実際に `/Images/DB_Primary/attr/tailsUnit/attr_tailsUnit4.png` を指すことまで確認）。
  - `tests/enrich.wrapper-summaries.test.js`: 名前付き `$Def_*` 参照内の画像フィールド解決、`$subfolder` が `_PNG` 接頭辞推測より優先されることを確認。
- ブラウザでの目視確認（ローカルHTTPサーバー、`pages/characters.html`）: 未実施（次のステップ）。

## 未完了タスク

- ローカルHTTPサーバーでの実ブラウザ目視確認（TailsUnitセクションの参考画像表示・ライトボックス拡大・画像なしキャラでの非表示）。
