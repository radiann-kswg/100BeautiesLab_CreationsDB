# 2026-04-19 `_DBLink` 別作品参照の schema guard

## 目的

別作品のレコードを `_DBLink` で参照した際、参照先のトップレベル項目を無条件に穴埋めせず、対象作品側の global/work typedef に宣言されている項目だけを取り込むようにする。

## 変更点の要約

- `lib/data-common.js`
  - `_DBLink` の同名フィールド穴埋めで、別作品参照時のみ `db_type.json($DefType)` ベースの許可キー集合を適用
  - 未宣言のトップレベル項目はマージ対象から除外
- `tests/enrich.dblink.jump.merge.test.js`
  - 別作品参照で `Name` は補完される一方、未宣言の `Relations` は持ち込まれないことを確認するテストを追加
- `CHANGELOG.md`
  - 上記仕様変更を追記

## 影響範囲

- `lib/data-common.js`
- `tests/enrich.dblink.jump.merge.test.js`
- `CHANGELOG.md`

## 未完了タスク

- 実データを含む全体テストで、別作品 `_DBLink` を持つ既存作品への副作用がないかを確認する

## 参考リンク

- `Works_UnauthedLogica` の `_DBLink` 参照例: `data/Works_UnauthedLogica/DataBases/db_Primary.json`
- 回帰テスト: `tests/enrich.dblink.jump.merge.test.js`
