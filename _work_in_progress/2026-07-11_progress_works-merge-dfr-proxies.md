# Works_DestinyFoxRecords と Works_Proxies の完全統合

## 目的

「運命線狐の記録（フィジカル9）」（`Works_DestinyFoxRecords`）と「ラジアン代理」（`Works_Proxies`）は、どちらも作者の近況報告用に描かれたタイトルで、既に `AnotherRegions_DBLink` で相互クロスリンクされている（DFRの `Unit:"rad"` レコード ⇔ Proxiesの `Generation:2` レコードが同一人物「二春」を指す）。運用上1タイトルにまとめた方が見やすいという User の提案を受け、`Works_Proxies` を `Works_DestinyFoxRecords` へ物理的に統合する。

## 背景・課題

これまで2つの別Worksフォルダとして扱ってきた理由は、キャラ一覧の主インデックス（`$IndexDef`）の型・意味が異なるため（DFR: `Unit` = 物理単位記号の `#String`、Proxies: `Generation` = 代理世代の `#Number`）。`$IndexDef` は現状 Work単位で1つしか持てない設計（`lib/data-common.js` の `EnrichmentProcessor.getWorkContext()`）のため、単純にフォルダをまとめるとIndexが衝突する。

調査の結果、`pkg/cloudflare/scripts/migrate.mjs`（391行目）に `$IndexDef_${dbNorm}` という「DB固有Indexがあれば優先、無ければWork既定にフォールバック」という命名規則が既に実装済みであることが判明。GitHub Pages側の本流（`lib/data-common.js` / `pages/characters.js`）にはまだこの仕組みがないため、思想を合わせて実装し、DB単位でIndex構造を持てるようアーキテクチャを拡張したうえでデータを統合する。

## 合意事項（ユーザー確認済み）

- 統合方式: 完全な物理統合（大規模改修、500行超見込み）
- Works識別子: `Works_DestinyFoxRecords` を存続させ、`Works_Proxies`（3レコード）を編入する
- 旧URL互換: `?work=Proxies&db=Proxy` 直リンクはクライアントシム（`LEGACY_WORK_ALIASES`）で新識別子へ自動リダイレクト
- `CalendarColorId`: DestinyFoxRecords側の色（`"5"`）に一本化
- 創作文言（`OldTitles` 追記など）は Claude が自動生成しない。追記の枠は用意するが、最終文言は User が確定する

詳細な設計判断は承認済みプラン（`C:\Users\s-chi\.claude\plans\db-9-1-works-index-wild-wind.md`）を参照。

## 実装方針（フェーズ）

1. フェーズ0: 本ログ作成（完了）
2. フェーズ1: `$IndexDef` のDB単位対応（サイドカーキー方式 `$IndexDef_<DbNorm>`）をアーキテクチャ拡張、データ変更なしで `npm test` グリーン確認
3. フェーズ2: データの物理統合（`git mv` 中心、`Images`/`DataBases`/`Dictionaries`/`References`/`Localization`/`db_meta.json` 統合、`AnotherRegions_DBLink` の `_Work` 削除、`Works_Proxies` 削除）
4. フェーズ3: UI/SW追従（`ISSUE_REPORT_WORK_LABELS`、`LEGACY_WORK_ALIASES` シム）
5. フェーズ4: テスト追従
6. フェーズ5: ドキュメント更新（本ログ含む）

## 影響範囲（編集予定ファイル）

- `lib/data-common.js`, `pages/characters.js`, `lib/sw-common.js`
- `data/db_meta.json`
- `data/Works_DestinyFoxRecords/DataBases/{db_type.json,db_meta.json,db_Proxy.json}`
- `data/Works_DestinyFoxRecords/{Images,Dictionaries,References,Localization}/`（Proxies由来ファイルの編入・マージ）
- `data/Works_Proxies/`（削除）
- `tests/pages.characters.ui-output.test.js`, `tests/enrich.dblink.jump.merge.test.js`, `tests/data.shape.test.js`
- `docs/schema-meta-processing.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `CHANGELOG.md`

## 進捗（2026-07-11 更新・全フェーズ完了）

- [x] フェーズ1: `$IndexDef` のDB単位対応（サイドカーキー方式）完了
  - `lib/data-common.js`: `EnrichmentProcessor.resolveIndexDefForDb()` 新設、`enrichRecords()`/`searchRecords()`/`normalizeRecordByTypeDef()` を接続
  - `pages/characters.js`: `getWorkIndexField(workKey, globalMeta, dbName)` に第3引数追加、8箇所の呼び出し元を更新
  - `tests/enrich.indexdef.perdb.test.js` 新設（5テスト）。既存9作品の後方互換も実データ（NumberTales）で確認
  - `docs/schema-meta-processing.md` §3.5.1 に追記
- [x] フェーズ2: データの物理統合完了
  - `Images/DB_Proxy/`・`DataBases/db_Proxy.json`・`Localization/trans_Rank.json`・`db_temp.json`（gitignore対象、`*_temp.json`）を `git mv`/`mv` で移動
  - `Dictionaries/dict_Formation.json`（orbifyエントリ追加）、`References/ref_Vocabulary.json`（Proxies側は空で実質DFR側採用）、`Localization/trans_PersonName.json`（配列連結、後述の通り一部ロールバック）をマージ
  - `DataBases/db_type.json`（`$IndexDef_Proxy` + `Generation` の `#Index` 追加）、`DataBases/db_meta.json`（`#DB_Proxy` 追加）、`Localization/db_meta.json`（`#Loc_Rank` 追加）を統合
  - `data/db_meta.json` から `#Works_Proxies` を削除（`OldTitles` への追記はしていない、後述）
  - `AnotherRegions_DBLink` の `_Work` を削除し同一Work内リンクへ簡略化（DFR "rad" ⇔ Proxy "Generation:2"）
  - グローバル `data/Localization/trans_{Regions,Phenomenon,PlaceName,Titles,FamilyName}.json` の `Scope` 配列に残っていた `Works_Proxies` を整理
  - `data/Works_Proxies/` を完全削除（`git rm -r` + 空ディレクトリの物理削除）
- [x] フェーズ3: UI/SW追従完了
  - `pages/characters.js`: `ISSUE_REPORT_WORK_LABELS` から `Proxies` 削除、起動シーケンスに `?work=Proxies` 直リンク互換シムを追加
  - **重要な発見・修正**: `resolveWorkDirName()` が `lib/sw-common.js` / `lib/data-common.js` / `pages/characters.js` の3箇所に独立定義されていた。SW実行時は `importScripts('sw-common.js', 'data-common.js')` の順で読み込まれるため、`data-common.js` 側の定義が最終的に有効になり、`sw-common.js` 側だけにエイリアスを入れても実行時に反映されないバグを発見。3箇所すべてに `LEGACY_WORK_DIR_ALIASES`（`Proxies` → `Works_DestinyFoxRecords`）を追加して解消
  - `lib/sw-common.js`: `buildDefaultDatabaseCatalogLabels()` の到達しないプリセットキー `Proxies` を実際のDB名 `Proxy` に是正
- [x] フェーズ4: テスト追従完了
  - `tests/pages.characters.ui-output.test.js`: パス更新（33テスト成功）
  - `tests/enrich.dblink.jump.merge.test.js`: 同一Work内 `AnotherRegions_DBLink` マージの実データ回帰テスト2件追加（グローバル `$DefType` の `$enrich:true` 宣言も読む `GlobalTypeAwareDataFetcher` が必要だった点に注意）
  - `tests/data.shape.test.js`: 統合後の構造アサーション4件追加
  - `tests/legacy-work-alias.test.js`（新規）: `resolveWorkDirName` エイリアスを `ReferenceResolver.resolveWorksReference()` 経由で検証（4テスト）
- [x] フェーズ5: ドキュメント更新完了
  - `docs/schema-meta-processing.md` §5.3 に `resolveIndexDefForDb()` 経由の解決を補足
  - `CLAUDE.md` / `.github/copilot-instructions.md` の作品シリーズ一覧を1件に整理
  - `CHANGELOG.md` に統合エントリを追記
- 最終確認: `npm test` 25 files / 233 tests 全成功

## ユーザーからの修正指摘（作業中）

- `data/Works_DestinyFoxRecords/Localization/trans_PersonName.json` へのマージ時、一度Editツールで追加した「ラジアン(2代目)/(3代目)/(初代)」の3エントリが、PostToolUseフック（Prettier自動整形）実行後に消失する現象が発生（原因未特定、Editツール完了直後は正しかったが、その後のシステムリマインダーで消失が判明）。再追加して復旧したが、その後 User から「DB_Proxyにあった当該エントリは、既存の `Term_JP: "ラジアン", Term_EN: "RadianN"`（`#TP_SemanticTranslate`）で意味的にカバーされるため不要」との指摘を受け、再度削除。最終的に `trans_PersonName.json` は元のDFR側9件のみで確定。

## 未完了タスク

- [ ] `OldTitles` / `Works_Summary` への統合履歴文言は User 確定待ち（Claude は自動生成しない方針のため、`data/db_meta.json` の `#Works_DestinyFoxRecords.OldTitles` には未追記のまま）
- [ ] ブラウザでの実地確認（作品選択・DB切り替え・Index一覧・直リンク・旧URLリダイレクト）— 未実施
- [ ] コミットは未実施（User の指示待ち）

## 検証観点

- `npm test`（フェーズ1完了時点・フェーズ4完了時点の2回）
- ローカルHTTPサーバーでの `pages/characters.html` 実地確認
- 旧 `?work=Proxies&db=Proxy&idx=...` 形式URLでのリダイレクト確認
- `AnotherRegions_DBLink` 相互リンクの表示確認

## 参考リンク

- 承認済みプラン: `C:\Users\s-chi\.claude\plans\db-9-1-works-index-wild-wind.md`
- `docs/schema-meta-processing.md` §3.5（`$IndexDef`）・§5.3（`getWorkContext` 合流順）
