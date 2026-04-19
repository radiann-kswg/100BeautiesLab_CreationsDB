# 2026-04-19 API/SW 技術仕様メモ・注釈補強

## 目的

「APIおよびSW周辺のコード仕様について技術的な注釈とドキュメントの強化」に対応するため、擬似 API の役割差、`_enrichment` の出力仕様、`db_meta.json` 欠損時ポリシー、`db_type.json` / `db_meta.json` / 予約語の責務分担を、コードと docs の両面で追いやすくする。

## 変更点の要約

- `docs/api-sw-spec.md` を新規追加
- `docs/README.md` / `docs/viewer-guide.md` から API/SW 技術メモへ導線を追加
- `lib/sw-common.js` に bootstrap / DB取得 / search / varsdef の設計意図コメントを追加
- `lib/data-common.js` に work context 合成、cross-work `_DBLink` 制約、`_enrichment` / `displaySections` の位置づけコメントを追加
- `CHANGELOG.md` に今回のドキュメント整備を追記

## 影響範囲

- `docs/api-sw-spec.md`
- `docs/README.md`
- `docs/viewer-guide.md`
- `lib/sw-common.js`
- `lib/data-common.js`
- `CHANGELOG.md`

## 未完了タスク

- 英語版の API/SW 技術メモは未作成
- 必要に応じて、今後 `defs` / `bootstrap` / `enrich` のレスポンス例 JSON を docs へ追加する余地あり

## 参考リンク

- `docs/db-update-guidelines.md`
- `tests/sw.dbmeta.tolerance.test.js`
- `tests/sw.enrich.basic.test.js`
- `tests/enrich.dblink.jump.merge.test.js`
