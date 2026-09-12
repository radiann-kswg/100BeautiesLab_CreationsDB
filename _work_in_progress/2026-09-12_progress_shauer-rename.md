# 2026-09-12 進捗: 獣爾騎兵の英語表記を ShauErRiders / Shau'er Riders へ全改名

## 目的

作品識別子 `ShouArRiders` / 表示英名 `Shou'ar Riders` を、ガイドライン正典（`guideline.en.md`）の
`Shau'er Riders` に合わせて `ShauErRiders` / `Shau'er Riders` へ統一する
（2026-09-11 のログで保留していた表記統一を User 判断で実施。識別子含む全改名スコープも User 確認済み）。

## 変更点の要約

- `git mv data/Works_ShouArRiders data/Works_ShauErRiders`（ディレクトリ改名。リネーム検出を保つため mv 経由）
- 大文字小文字を区別した一括置換（36 ファイル）:
  - `ShouArRiders` → `ShauErRiders`（`#Works_*` キー・`Scope` 配列・コード・docs・テスト）
  - `Shou'ar` → `Shau'er`（`Shou'arSurpluses` 含む）、揺れ `Shou'Ar` → `Shau'er`
- 旧直リンク互換: `lib/viewer-locator.js` に `LEGACY_WORK_ALIASES` を追加し、
  `workKeyForURL()` / `parseViewerLocator()` / `pages/characters.js` の `getQS()` read 側で解決
- 生成物再生成: `.github/copilot-instructions.md`（`npm run agents:build`）/ `calendar/100beautieslab-creations.ics`

## 影響範囲（編集したファイル）

- `data/`: 旧 `Works_ShouArRiders` 配下一式（改名+置換）、`db_meta.json`、`Dictionaries/dict_Faction.json`、
  `Localization/trans_*.json`、`Works_SinisterChangingGirls/DataBases/db_Primary.json`（`Shau'er` 言及 2 箇所のみ）
- コード: `lib/viewer-locator.js`、`pages/characters.js`、lib コメント 3 件、`pkg/mcp`・`pkg/nodejs`
- テスト: 追従 5 件 + `tests/pages.characters.url-params.test.js`（期待値追従・別名解決の回帰テスト追加）
- docs / 指示書: `docs/localization-*` ほか 4 件、`AGENTS.md`、`.github/ISSUE_TEMPLATE/data-correction.yml`、`CHANGELOG.md`

## 不変のもの

- 公式サイト URL `shouar-riders.com`（実ドメイン）/ `Works_Code: SAR`（バッジ・相関図ロケータは無影響）
- `guideline*.md`（既に正典表記）/ 過去の履歴ログ（`_work_in_progress/` / `CHANGELOG.md` 旧記述）

## 検証

- `npm test`: 73 ファイル / 1341 テスト 全パス
- 置換後の残存 grep: 対象スコープ内 0 件、`shouar-riders.com` は温存を確認

## 未完了タスク（申し送り）

- [ ] R2/D1 の再同期: マージ後に `pkg/cloudflare/scripts/migrate.mjs` 再実行 + `wrangler deploy`（旧 `ShouArRiders` キーの掃除含む）
- [ ] 下流リポジトリへの波及確認（`lib/viewer-locator.js` / `pages/characters.js` の変更。CHANGELOG に記載済み）
- [ ] SCG `db_Primary.json` の User WIP（`concept_PNGName` + 未追跡画像 `cnsp_imgSCG-SW.png`）は本改名のコミットに含めず残置。User 側で継続

## 参考

- `CHANGELOG.md` 2026-09-12 エントリ / `_work_in_progress/2026-09-11_progress_guideline-new-titles.md`（保留の経緯）
