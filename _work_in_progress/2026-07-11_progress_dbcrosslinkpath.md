# `#PNGFilePath`/`#PNGFileName` 画像フィールド専用のDB/Work横断参照 `_DBCrossLinkPath` 新設

## 目的

ナンバーテールズの Num=22「22(フジ)」のイラストに、別DB（SemiPrimary）のキャラクター「トレッド」（Num="3x11"）が同じ絵に描かれているケースのように、画像の相対パス（`#PNGFilePath` 型）でDB・作品を跨いで同じ画像を参照したい、という User からの依頼を発端とする。

既存データでは `../../DB_SemiPrimary/arts/corefolders/autumnMoon/art_autumnMoon2025` のような手書き相対パスで「事故的に」動いていた（`db_Primary.json:8809`）。この手法は次の問題があった:

- クライアント側 `pages/characters.js` の `buildImagePath()` は、ブラウザのURL正規化が `..` を畳み込むことで**偶然**動いているだけで、パス走査を検証・計算していない。
- SW/enrich側 `lib/data-common.js` の `ImageProcessor.resolveImagePath()` は同じ入力に対して異なる（かつバグのある）文字列連結を行い、`Images/` セグメントが1段欠落したパスを生成する（既知の潜在バグ、今回のスコープ外・非修正のまま残置）。
- 同一作品内のDBまたぎしかできない。作品（Work）をまたぐ画像参照は原理的に不可能（`wdir` が常に参照元レコード自身の `workId` に固定されるため）。

これを、既存の `_DBLink`（`$Def_DBLinkRef` 形式・DB/Work横断のレコード参照機構）を参考にしつつ、画像パス専用の軽量な宣言的機構 `_DBCrossLinkPath` として正式実装した。

## 合意事項（設計上の決定）

- **`_DBLink` との決定的な違い**: `_DBLink` は「対象レコードをインデックスで検索して見つけ、そのレコードのフィールド値を穴埋めする」レコード参照機構。`_DBCrossLinkPath` は「対象Work/DBの画像フォルダ内の相対パスを直接指す」パス参照機構であり、対象キャラクターのレコードを検索・照合する必要がない（`_IsoPath` の値自体がそのまま参照先の相対パス）。そのため `_DBLink` のような動的インデックスキー検出・`_Search`・曖昧一致ガード・`isPrivate`レコード除外といったレコード照合まわりの仕組みは一切不要で、実装は大幅に軽量になった。
- **スキーマ（User指定・複数回の設計反復を経て確定）**: `$Def_DBCrossLinkPath` は `_DB`（必須・`#String`）/`_Work`（省略可）/`_Field`（省略可）/`_IsoPath`（必須・`#PNGFilePath`、単一パス固定）の4フィールド。当初 `_IsoPath` は配列unionも検討したが、ユーザー確認により単一パス固定にシンプル化した（複数枚参照したい場合は配列フィールド内に `_DBCrossLinkPath` を複数個並べる）。`_DB`/`_IsoPath` を必須にしたのは「省略すると自動解決が困難になるフィールド」という基準による（`_DBLink`/`$Def_DBLinkRef` 側は同じ基準で監査した結果、明確なデフォルトがあるため変更不要と判断）。
- **安全策（新規追加）**: (1) `_Field`（またはデフォルト値）が参照先Workの実効スキーマで画像型として宣言されている場合のみ解決（未宣言なら安全側フェイルクローズ）。(2) 参照先Workが `Works_Hidden: true`、または参照先DBが `DB_Hidden: true` の場合は解決しない（レコード単位の `isPrivate` は概念上適用できないが、Work/DB単位の完全404遮断だけは同じ強度で尊重）。(3) 連鎖禁止（`_IsoPath` は常に単一文字列で対象レコードを介さないため、構造上そもそも連鎖しない）。
- **既存の `_DBLink` ルールには一切手を加えない**: `_DBLink` の「別DBからは画像を穴埋めしない」ルール（`allowImages` ゲート、`lib/data-common.js`）・回帰テスト（`tests/enrich.dblink.jump.merge.test.js:314-348`）は無変更。`_DBCrossLinkPath` は別の型・別の解決経路を持つ、意図的な別機構として実装した。
- **SW側の出力方針**: `_enrichment.images` への追記のみ（`ImageProcessor` と同じ非破壊方針）。`Images.*` の生値（`_DBCrossLinkPath` ラッパーそのもの）は書き換えない。理由: クライアント側resolverも同じ生JSONを取得して独自に解決するため、SW側で in-place 置換すると二重解決・不整合が起きる。

## 変更点の要約

1. **スキーマ**: `data/db_type.json`（グローバル）に `$Def_DBCrossLinkPath` を新設（`$Def_DBLinkRef` の直後）。
2. **クライアント側解決ヘルパー**: `lib/section-renders/dbcrosslinkpath.js`（新規）。`_DBCrossLinkPath` wrapper の判定・値抽出・解決を行う。`_DBLink` 系（`dblink.js`）と異なり対象レコードの検索を行わないため fetch/セッションキャッシュ/曖昧一致ガードは不要。画像ギャラリー/ポスター構築が `CharacterSectionRendererRegistry` の汎用dispatchを経由しないハードコード実装のため、registry には登録せず `globalThis.DBCrossLinkPathResolver` として直接公開。
3. **`pages/characters.js`**: `resolveImageValueToUrl()`（新規共通ヘルパー）を追加し `buildImageGallery()`/`resolveImageFromFields()` の両方から利用。`_DBCrossLinkPath` wrapper ならターゲットWork/DBの `folderHint`/`layer` を解決して絶対パスを構築（既存 `buildImagePath()` を対象Work/DB向けに再利用）、通常文字列なら従来通り。`buildImageGallery`/`loadMoreImages` を `async` 化。`isCrossLinkTargetHidden()`（`Works_Hidden`/`DB_Hidden` 判定、既存の `fetchGlobalMeta()`/`fetchWorkMeta()`/`findDbCatalogEntry()` を再利用）・`resolveTargetImageFieldMeta()`（対象フィールドの画像型宣言検証 + folderHint/layer取得）・`getCrossLinkTargetImageFields()`（任意Workの画像フィールド一覧キャッシュ）を追加。
4. **SW側（`lib/data-common.js`）**: `EnrichmentProcessor` に `isCrossLinkTargetHidden()`/`resolveDbCrossLinkPathEntry()`/`resolveDbCrossLinkPathImages()` を追加。`enrichRecords()` のステップ3（画像情報処理）を拡張し、`_DBCrossLinkPath` の解決結果を `_enrichment.images` へ追記。新規トップレベル関数 `buildCrossLinkImageAbsolutePath()`（既存 `ImageProcessor.resolveImagePath()` のスラッシュ含有時バグを踏襲せずゼロから構築）・`findDbEntryInWorkMeta()`（`pages/characters.js` の `findDbCatalogEntry()` と同等のSW側実装）を追加。
5. **実データ移行**: `data/Works_NumberTales/DataBases/db_Primary.json` の Num=22「22(フジ)」`Images.arts_PNGPath[3]` を、手書き相対パスから `{ "_DBCrossLinkPath": { "_DB": "SemiPrimary", "_IsoPath": "corefolders/autumnMoon/art_autumnMoon2025" } }` へ移行。
6. **テスト**: `tests/enrich.dbcrosslinkpath.test.js`（新規、9件）・`tests/data.shape.test.js`（スキーマ構造チェック1件追加）。
7. **ドキュメント**: `docs/api-sw-spec.md` §8.3（新設）・`docs/schema-meta-processing.md`・`CHANGELOG.md`。

## 影響範囲（編集ファイル）

- `data/db_type.json`（`$Def_DBCrossLinkPath` 新設）
- `lib/section-renders/dbcrosslinkpath.js`（新規）
- `pages/characters.js`
- `lib/data-common.js`
- `data/Works_NumberTales/DataBases/db_Primary.json`（実データ移行、Num=22）
- `tests/enrich.dbcrosslinkpath.test.js`（新規）
- `tests/data.shape.test.js`
- `docs/api-sw-spec.md` / `docs/schema-meta-processing.md`
- `CHANGELOG.md`

## 検証

- `npm test`: 全23ファイル・218件成功（新規9件＋構造チェック1件を含む）。既存の `tests/enrich.dblink.jump.merge.test.js`（`_DBLink` 画像穴埋め禁止ルールの回帰テストを含む）は無変更のまま全件成功を確認。
- `node --check` で `lib/section-renders/dbcrosslinkpath.js` / `pages/characters.js` / `lib/data-common.js` の構文確認。
- JSON妥当性: `data/db_type.json` / `data/Works_NumberTales/DataBases/db_Primary.json` を `JSON.parse` で確認。
- ブラウザでの目視確認（ローカルHTTPサーバー、`pages/characters.html` で Num=22「22(フジ)」詳細ページのギャラリー表示、`_DBCrossLinkPath` 経由の4枚目画像が正しく表示されること）: **未実施**（次のステップ）。
- SW APIレスポンスの `_enrichment.images`/`Images.*` 非破壊性の実地確認（`/pages/v1/works/Works_NumberTales/db/Primary?resolve=1&enrich=1` 相当）: **未実施**（次のステップ）。

## 未完了タスク

- ローカルHTTPサーバーでの実ブラウザ目視確認（Num=22 詳細ページのギャラリー、DevTools Networkタブでの対象DBフェッチ確認）。
- SW側 `ImageProcessor.resolveImagePath()` の既知バグ（値にスラッシュを含む場合 `folderHint` を付与しない）は今回のスコープ外として意図的に未修正のまま残置している。将来的な別セッションでの修正候補として記録。
- `data/Works_NumberTales/References/ref_Reference.json` にも `../../` を使った類似の相対パス（`catalog_PNGName`、`#PNGFileName[]` 型・Referencesレイヤー→General）が1件存在するが、型・レイヤーの合流経路が `arts_PNGPath` のケースと異なり動作保証が難しいため、今回は移行を見送り現状維持とした。将来 `_DBCrossLinkPath` をReferencesレイヤーにも正式対応させる場合は、このファイルが移行候補になる。
