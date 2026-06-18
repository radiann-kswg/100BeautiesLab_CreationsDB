# Relation Section モジュール化 & RelationTo_{DBName} 汎用化

## 目的

- `renderBuiltInRelationSection` を `lib/section-renders/relation.js` へ分離
- `RelationToPrimary` → `RelationTo_Primary` リネームで `RelationTo_{DBName}` 汎用パターンへ移行
- 同作品内の他DBキャラクターをService Worker経由でフェッチしてキャラ名をDOMにハイドレーション

## 変更点の要約

### 新規ファイル
- `lib/section-renders/relation.js` — `relationSection` renderer（`renderBuiltInRelationSection` + 全ヘルパーを移動）
  - `RelationTo_{DBName}` パターン検出（`/^RelationTo_(.+)$/` regex）
  - SW fetch + 非同期DOMハイドレーションでクロスDBキャラ名を表示
  - セッション内フェッチキャッシュ（`_crossDbFetchCache` Map）

### 修正ファイル
- `lib/section-wrapper-common.js`
  - `pickRelationLabelCode`, `localizeRelationLabels`, `getIndexIdentifierFromRelation`, `formatRelationComments`, `renderBuiltInRelationSection` 削除（計300行超）
  - `registerSectionRenderer('relationSection', ...)` 削除（`relation.js` が代替）
- `pages/characters.js`
  - `import '../lib/section-renders/relation.js'` 追加
  - `relationRendererApi` に `fetchDbRecords` 追加（`fetchDB(workId, dbName, { resolve: false })`）
  - `shownKeys`: `rec.RelationToPrimary` → `/^RelationTo_/` ループ
  - `renderStandaloneFieldSection`: 明示キーチェック → regex パターン
  - fallback ブロック: `RelationToPrimary` 固定 → `RelationTo_*` キー動的マップ
  - `renderRelations`: fallback label から `RelationToPrimary` 条件分岐を削除
- `data/Works_NumberTales/DataBases/db_type.json` — `RelationToPrimary` → `RelationTo_Primary`
- `data/Works_PastDivers/DataBases/db_type.json` — 同上
- `data/Works_UnibyteLive/DataBases/db_type.json` — 同上
- `data/Works_NumberTales/DataBases/db_Secondary.json` — データエントリ8箇所リネーム
- `tests/section-wrapper-common.test.js` — `beforeAll` に `relation.js` の import 追加

## 影響範囲
- ナンバーテールズ Secondary DB の `RelationTo_Primary`（旧 `RelationToPrimary`）
- パストダイヴァー・アンオースドロジカの `RelationTo_Primary` スキーマ
- 全作品の `Relation` フィールド（renderer が relation.js に移動）

## クロスDB動作仕様
- `RelationTo_Primary` → `targetDbName = "Primary"` → SW fetch `fetchDB(workId, "Primary", { resolve: false })`
- 取得レコードはセッション内でキャッシュ（同一DB複数参照の重複フェッチを防止）
- キャラクター名はアンカー要素の `span.textContent` を Promise 解決後に更新
- テスト環境（モック要素）では `typeof element.textContent !== 'string'` でガードし skip

## テスト結果
- `section-wrapper-common.test.js`: 4/4 PASS

## 未完了タスク
- [ ] ブラウザ確認（NumberTales Secondary DB キャラの `RelationTo_Primary` 表示）
  - URL: `http://127.0.0.1:5500/pages/characters.html?work=Works_NumberTales&db=Secondary&num=1&idx=1&idxKey=Num&q=&lang=jp`
  - 確認項目: `RelationTo_Primary` セクションの表示・リンク生成・キャラ名のハイドレーション
