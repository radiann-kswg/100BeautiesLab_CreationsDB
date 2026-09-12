# 2026-09-12 進捗: 獣爾騎兵の旧綴り別名解決を API / SW 経路へ追加（PR #33 フォローアップ）

## 背景（GitHub トリアージ報告）

> CreationsDB PR #33（獣爾騎兵の改名）— 旧綴りの別名解決が viewer/characters.js にしか入っておらず、
> API/SW 経路（worker.js・sw.js・data-common.js）には無いため、D1 を --clean 再同期すると
> /api/v1/.../ShouArRiders が 404 になります。db_Primary.json の Summary_EN にも旧英名 Shou-Ar Riders が10箇所残存。

## 方針

- ディレクトリ名エイリアス（`Proxies → Works_DestinyFoxRecords` 方式）だけでは不十分。
  D1 の `works.key` / `dbs` / `records` や `db_meta.json` の `CreationWorks` キーは現行綴りのみなので、
  **作品IDの正規化点（`toWorkKey` / `normalizeWorkId`）で旧綴りを読み替える**。
- SW は `importScripts` で同一グローバルに読み込むため、`lib/data-common.js` 側の const は別名
  （`DATA_COMMON_LEGACY_WORK_ID_ALIASES`）にして `tests/sw.importscripts-scope.test.js` を通す。

## 変更点

- `pkg/cloudflare/worker.js`: `toWorkKey()` に `LEGACY_WORK_ID_ALIASES = { ShouArRiders: 'ShauErRiders' }` を適用
- `lib/sw-common.js`: `DataUtils.toWorkKey()` に同エイリアス適用、`LEGACY_WORK_DIR_ALIASES` にも追加
- `lib/data-common.js`: `normalizeLegacyWorkKey()` 新設 → `normalizeWorkId()` / `toWorkKeyFromWorksTitle()` から利用
- `pkg/nodejs/index.mjs`: `toWorkKey()` / `LEGACY_WORK_DIR_ALIASES` に追加
- `pages/characters.js`: `normalizeWorkKey()` を `workKeyForURL()` ベースへ、`LEGACY_WORK_DIR_ALIASES` に追加
- `data/Works_ShauErRiders/DataBases/db_Primary.json`: `Summary_EN` の `Shou-Ar Riders` → `Shau'er Riders`（15 箇所）
- `tests/legacy-shauer-work-alias.test.js`（新規、6 テスト）
- `CHANGELOG.md`

## 検証

- `npm test`（vitest）: 74 ファイル / 1347 テスト 全パス
- Prettier: 既存 5 ファイルは HEAD 時点で未整形だったため `--write` を掛けていない（差分肥大化回避）。新規テストのみ整形済み

## 申し送り

- [ ] マージ後に `wrangler deploy`（worker.js の変更反映）。D1 再同期は `db_Primary.json` の差分のみで可
- [ ] エイリアス表が 5 箇所に分散（viewer-locator / sw-common / data-common / worker / nodejs）。将来の改名時は同時更新
- [ ] 下流（`JsonCharacterDB-Framework`）への波及: 作品ID正規化のシグネチャは不変。取り込み時は CHANGELOG 参照
