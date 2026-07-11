# `data/References/` + `data/GeneralImages/` を「共通資料」仮想作品として公開

## 目的

`data/References/`（種族・組織・社会情勢・地域文化・語彙などの全作品共通辞書、`ref_*.json`）と `data/GeneralImages/`（全作品共通の画像、現状 `Ref_Region8/cnsp-map_region8.png` のみ）を、各作品の `References`/`Images` と同様に、API（SW疑似API・Cloudflare Workers実API）・キャラシートUIから閲覧・表示できるようにしたい、という User からの依頼を発端とする。

調査の結果、既存の利用経路は「各作品のReferences層DB表示に `data/References/db_type.json` を共有スキーマとして合流する」フロントエンド専用のオーバーレイ機構（`fetchSharedLayerTypeDef`等）のみで、グローバルの `data/References/ref_*.json` 自体は一度も `works/{work}/db/{dbName}` の一覧・詳細として取得されたことがなく、`data/GeneralImages/` はコードベース中どこからも参照されていない孤立アセットだった。

## 合意事項（設計上の決定）

- **モデル化方針（User確認済み）**: 新規の並行エンドポイントは作らず、`#Works_CommonReferences`（表示名: 共通資料 / Common References）という**仮想作品**として、既存の `works/{work}/db/{dbName}` の仕組みをそのまま再利用する。
- **キー命名（User確認済み）**: `#Works_CommonReferences` という技術キーで確定。当初 `#CommonReferences`（`Works_` 無し）という代替案も検討したが、`toWorkKey`/`normalizeWorkKey`（SW・UI・Workers 3箇所）が現状「`#Works_`必須」という前提になっており、これを緩めると3箇所の検証ロジックへ手を入れる必要が出てスコープが広がるため見送り。技術キーは`#Works_`規約のままにし、個別の創作タイトルと混同されないよう `Works_Shared: true` という新規フラグを立て、UI側の作品セレクトで別`<optgroup>`へ分離することで対応した。
- **物理レイアウトの不一致への対応**: `data/References/`・`data/GeneralImages/` は `Works_<Name>/DataBases/...` という通常の作品レイアウト規約に沿わない（`Works_`接頭辞なし・`DataBases/`サブフォルダなし・画像も別ルート直下）。既存ファイルを規約に合わせて移動すると、他作品のReferences層DB表示が依存する既存の shared layer 上乗せ機構（`data/References/db_type.json`/`db_meta.json` を直接fetchする）が壊れるため、**ファイルは一切移動せず**、`CreationWorks.<key>` に `Works_Dir`（物理ディレクトリ名オーバーライド）・`Works_ImagesDir`（画像ルートオーバーライド）という宣言的フィールドを新設して解決する設計とした。両フィールドは省略時デフォルトが従来動作と完全一致するため、既存作品には一切影響しない。
- **レイヤー畳み込み規則**: `DB_Layer` が解決済み`workDir`自身と一致する場合（`workDir==='References'` かつ `DB_Layer==='References'`）、パス結合時にレイヤーセグメントを畳み込み `/data/References/References/...` の二重化を避ける。既存作品では`DB_Layer`が`Works_<Name>`と一致することはないため非破壊。
- **Cloudflare Workers実API側の対応範囲（User確認済み: 対応する）**: 現状Workers側は作品別Referencesレイヤーのマージ（`readRefMeta`/`mergeLayerDatabases`相当）自体が未実装という既存ギャップがあったが、今回は「共通資料」疑似作品を成立させるための`Works_Dir`オーバーライド・rootフォールバック・レイヤー畳み込みのみを追加し、他作品自体のReferencesレイヤーをWorkers上で使えるようにする改修は明示的にスコープ外とした。
- **DB全体の代表画像（User確認済み: 対応する）**: `data/GeneralImages/Ref_Region8/cnsp-map_region8.png` は特定レコードに紐づかない第8界全体の俯瞰マップ（User確認済み）。per-record画像フィールドの仕組み（`extractImageFields`系のフォルダ推論）は使わず、`$MetaType.$Def_DatabaseCatalog`に`DB_Image`という新規カタログレベルのフィールドを追加し、DB概要欄（`renderSelectionMeta()`）に専用の単純なリゾルバ（`resolveDbCoverImageUrl()`）で表示する設計とした。
- **`RelatedTerms`リンク修正（User確認済み: 今回含めて修正）**: `renderReferenceConnectionsSection()`が`RelatedTerms`タグのリンク先として実在しない`'Glossary'` DBを指しており常に壊れていたバグを発見。今回新設する共通`Vocabulary` DB（`#Works_CommonReferences`/`Vocabulary`）への参照に修正した（元々壊れていたリンクの修正であり、既存動作への影響なし）。
- **サーバ/enrich側画像解決（`lib/data-common.js`）は今回スコープ外**: UIは`_enrichment.images`/`primaryImage`を一切参照せず独自の画像解決（`buildImagePath`等）を使うため、実害がないと判断し変更を見送った。既存作品の per-work References DB でも同じ不整合が既にある（今回新規に持ち込んだものではない）。

## 変更点の要約

1. **データ**: `data/db_meta.json`に`CreationWorks.#Works_CommonReferences`（`Works_Dir`/`Works_ImagesDir`/`Works_Shared`）を新設。`data/References/db_meta.json`の5つの`Databases.#Ref_*`エントリに`DB_Layer: "References"`を追加、`#Ref_Region8`に`DB_Image`を追加。`data/References/db_type.json`に`$IndexDef`（`Term_JP`）を新設。`data/db_type.json`（グローバル）の`$Def_DatabaseCatalog`に`DB_Image`を追加。
2. **`lib/sw-common.js`**: `DataFetcher.getWorksDirOverrides()`/`resolveWorkDir()`（TTLキャッシュ付きオーバーライド解決）・`fetchWorkBaseMeta()`（rootフォールバック）を新設。`readWorkMeta`/`readWorkType`/`readRefMeta`/`readLocMeta`/`readDB`/`listWorkDBs`を更新（7箇所の`resolveWorkDirName(`呼び出しを置換）。`decorateDatabaseCatalogEntries()`/`buildWorkCatalogEntry()`に`DB_Image`/`Works_Shared`のpass-throughを追加。
3. **`pages/characters.js`**: `resolveWorkDirName()`をオーバーライド対応に更新（シグネチャ不変）。新設`resolveImagesRootOverride()`。`buildImagePath()`（第6引数`imagesRootOverride`追加）・`resolveImageStatically()`の画像パス組み立てを`imagesBase`経由に統一（計15箇所の書き換え）。新設`resolveDbCoverImageUrl()`を`renderSelectionMeta()`から呼び出し。`populateWorks()`は`Works_Shared:true`の項目を別`<optgroup>`へ分離。`renderReferenceConnectionsSection()`の`RelatedTerms`リンク先を修正。
4. **`pages/characters.html`/`.sass`/`.css`**: `#meta-db-image`（`.meta-overview__cover`）を追加。`asset-version`を更新。
5. **`pkg/cloudflare/worker.js`**: `getWorksDirOverrides()`/`resolveWorkDirWithOverride()`を新設し、`getWorkMeta()`（rootフォールバック）・`resolveAndFetchDbFromR2()`（レイヤー畳み込み、現状ルーティング未使用のコードだがコード整合性のため反映）に適用。
6. **`pkg/cloudflare/scripts/migrate.mjs`**: `resolveWorkDirForMigrate()`/`readWorkBaseFile()`を新設し、STEP3（dbs投入）・STEP4（records投入）の作品別メタ・型定義読み込みに反映。R2アップロード（`data/**/*.json`を無条件・再帰的にアップロードする既存実装）は変更不要（グローバルReferencesも既にカバー済みと確認）。
7. **テスト**: `tests/sw.db-layer-routing.test.js`（オーバーライド解決・rootフォールバック・レイヤー畳み込み、3件追加）、`tests/data.shape.test.js`（新規フィールドの存在検証、3件追加）、`tests/pages.characters.ui-output.test.js`（オーバーライド反映・optgroup分離、2件追加＋既存1件を新リンク先に合わせて更新）。
8. **ドキュメント**: `docs/api-sw-spec.md`§5.5（新設）+ §3.3/§5.1/§5.2/§7、`docs/schema-meta-processing.md`§2.3/§4.1/§4.3、`CHANGELOG.md`。

## 影響範囲（編集ファイル）

- `data/db_meta.json` / `data/References/db_meta.json` / `data/References/db_type.json` / `data/db_type.json`
- `lib/sw-common.js`
- `pages/characters.js` / `pages/characters.html` / `pages/characters.sass` / `pages/characters.css`
- `pkg/cloudflare/worker.js` / `pkg/cloudflare/scripts/migrate.mjs`
- `tests/sw.db-layer-routing.test.js` / `tests/data.shape.test.js` / `tests/pages.characters.ui-output.test.js`
- `docs/api-sw-spec.md` / `docs/schema-meta-processing.md` / `CHANGELOG.md`

## 副次発見: `migrate.mjs` の既存バグ修正（`idx_key`解決）

「共通資料」の`--dry-run`検証中に、`records`テーブル投入ロジック（STEP4）の既存バグを発見した。`resolveIdxKey(undefined)`が呼び出し元の期待に反して既定値`"Num"`を返す実装のため、`idxKey = resolveIdxKey(dbSpecificType) || defaultIdxKey`という式は`dbSpecificType`（DB固有`$IndexDef`）が無い場合でも常に`"Num"`（真値）を返し、work-level `$IndexDef`（ネスト型）による`defaultIdxKey`が実質的に使われていなかった。

実害の確認: `FLInvestigator78`（`Card.Suit`が正のはずが`'Num'`固定）・`ShouArRiders`（`BeastType.Beast`）・`UnibyteLive`（`Letter.AlphaGen`）で、D1 `records.idx_key`が常に誤って`'Num'`・`idx_value`が空文字になっていた（`getRecordFromD1`によるインデックス単体取得が実質機能しない状態）。「共通資料」の`Term_JP`インデックスでも同じ問題が顕在化したため、今回のスコープ内で修正した（`dbSpecificType ? resolveIdxKey(dbSpecificType) : defaultIdxKey`）。修正後の`--dry-run`で全対象作品が正しいネスト型idxKeyを使うことを確認済み。

## 検証

- `npm test`: 全23ファイル・226件成功（既存217件 + 新規9件、既存1件はリンク先修正に合わせて期待値更新）。
- `node --check` で `lib/sw-common.js` / `pages/characters.js` / `pkg/cloudflare/worker.js` / `pkg/cloudflare/scripts/migrate.mjs` の構文確認。
- **実データ検証（VMハーネス、`lib/sw-common.js`を実ファイルシステム裏付けfetchスタブで実行）**: `resolveWorkDir('#Works_CommonReferences')`→`'References'`、`listWorkDBs`で5DB全件が二重ディレクトリなく解決、`readDB`でVocabulary(7件)/Region8(15件)の実レコード取得、`handleWorksListEndpoint`/`handleWorkDbListEndpoint`で`Works_Shared`/`DB_Image`のpass-through確認、既存作品（NumberTales）が従来通り6DB解決される回帰確認、いずれも成功。
- **`node pkg/cloudflare/scripts/migrate.mjs --dry-run --d1-only`**: 全作品・全DBが警告/エラー無しで解決。「共通資料」の5DB・475件のレコードがD1投入形式で正しく生成されることを確認（`idx_key='Term_JP'`）。上記の既存バグ修正後、`FLInvestigator78`/`ShouArRiders`/`UnibyteLive`のネスト型idxKeyも正しく解決されることを確認。
- ローカルHTTPサーバーでの実ブラウザ目視確認（作品セレクトに「共通資料」optgroupが表示され、5DB選択・一覧・詳細表示・Region8代表画像表示ができること）: **実施済み（2026-07-11 追記）**。初回確認時に共通資料の meta が 500 / DB一覧が空になる事象が発生したが、原因は本機能ではなく、`Works_Proxies` 統合時に `lib/data-common.js` へ追加された `const LEGACY_WORK_DIR_ALIASES` が `lib/sw-common.js` 側の同名 `const` と衝突し、importScripts の同一グローバルスコープで SyntaxError → **SW3種すべてが登録・更新不能**（古いSWが残留稼働し `Works_Dir` オーバーライド未対応のまま）になっていたこと。`DATA_COMMON_LEGACY_WORK_DIR_ALIASES` へ改名して修正し、回帰テスト `tests/sw.importscripts-scope.test.js` を新設（詳細は `CHANGELOG.md` の fix エントリ参照）。修正後、共通資料の meta / 5DB一覧 / レコード一覧 / 詳細表示 / Region8 代表画像の表示をブラウザで確認済み。
- Cloudflare Workers実API側の実デプロイでの疎通確認（`wrangler deploy` → `.../api/v1/works` 等）: **未実施**（本番反映はUser判断、次のステップ。`--dry-run`でのロジック検証は上記で実施済み）。

## 未完了タスク

- ~~ローカルHTTPサーバーでの実ブラウザ目視確認。~~（2026-07-11 実施済み。上記「検証」参照）
- Cloudflare Workers実API側の実デプロイ環境がある場合の`wrangler deploy`後の疎通確認（`--dry-run`でのロジック検証は完了済み）。
- 他の実作品（`Works_NumberTales`等）自体の「作品別Referencesレイヤーのマージ」をCloudflare Workers/D1上でサポートする改修は、今回明示的にスコープ外とした既存ギャップとして残る。将来対応する場合は`pkg/cloudflare/worker.js`の`getWorkMeta()`に`readRefMeta`/`mergeLayerDatabases`相当の実装が必要になる。
- サーバ/enrich側画像解決（`lib/data-common.js`の`ImageProcessor`）の`Works_Dir`/`Works_ImagesDir`オーバーライド対応は見送った。将来`_enrichment.images`/`primaryImage`をUI側が参照するようになった場合は追従が必要。
