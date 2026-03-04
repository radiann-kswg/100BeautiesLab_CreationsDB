# 2026-03-04 進捗ログ: フェーズ2（DB 種別多様化への耐性）

## 目的

- `db_SelfSecondary` 等を含む「DB 種別が多様」な状態でも、Service Worker API が作品別 `db_meta.json` の欠損/不整合で 500 にならずに動作する耐性を付ける。

## 変更点の要約

- SW(API): 作品別 `db_meta.json` の読み込み失敗時は `_Commons` 適用をスキップして継続（DB取得/検索/Pages enrich）。
- SW(API): メタ欠損時の DB 列挙フォールバック候補に `PrimaryDealer` / `PrimaryMobs` / `UnproceededSecondary` を追加。
- SW(API): `db_meta.json.Databases.#DB_*._Secondaries[]` の `sec_Category` 等を分岐キーとして扱う際、primary（`sec_SeriesTitle`）未指定の定義では必須一致として扱い、誤適用を防止。
- Tests: `readWorkMeta()` が失敗するケースの回帰テストを追加。
- Tests: `sec_Category` による `_Secondaries` 分岐適用の回帰テストを追加。

## 影響範囲（編集したファイル）

- `lib/sw-common.js`
- `pages/sw.js`
- `tests/sw.dbmeta.tolerance.test.js`
- `CHANGELOG.md`

## 未完了タスク

- 作品別メタが欠損している場合の "DB表示名（ラベル）" の仕様化（必要なら `$IndexDef` と同様に typedef へ寄せる案の検討）。
- 「メタ無しでも発見できるDB種別」の追加候補が増えた場合の運用方針（ハードコードに寄せるのか、別の宣言を用意するのか）。

## 検証

- Vitest: 未実施（このログ時点）。

## 参考リンク

- `_work_in_progress/2026-03-04_remaining-task.md`（フェーズ2）
- `_work_in_progress/2026-02-21_remaining-task.md`（中小-3 の原文）
