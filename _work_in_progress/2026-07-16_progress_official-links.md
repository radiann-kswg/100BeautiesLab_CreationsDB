# 進捗レポート: 作品公式サイトリンクをキャラシート「作品情報」欄へ表示

- 日付: 2026-07-16
- ブランチ: `develop`
- 種別: 機能追加（スキーマ駆動）

## 目的

創作タイトルに公式 HP がある場合（ナンバーテールズ / 運命線探偵78）、キャラシート UI の「作品情報」欄から公式サイトへの導線を張れるようにする。

## 合意事項（設計判断）

- フィールド構造は **複数リンク配列**を採用（User 選択）。既存の `OldTitles[]`（`$Def_...Catalog[]`）と同じ配列パターンで、将来 pixiv / X / BOOTH 等の追加にも耐える。
- 実 URL・表示ラベルは **User 提供**（創作内容は User 管理の原則）。
  - ナンバーテールズ → `https://www.numbertales-radiann.com/`
  - 運命線探偵78 → `https://fateline-investigator78.com/`
  - ラベル: JP `公式サイト` / EN `Official Site (JAPANESE ONLY)`（日本語限定サイトである旨を英語表示に含める）
- UI ハードコードは「リンク 1 種の描画」に限定し、宣言 → SW パススルー → UI 描画のスキーマ駆動で通す。

## 変更点の要約

1. **スキーマ宣言** `data/db_type.json` `$MetaType`
   - `$Def_OfficialLinkCatalog`（`LinkType` / `URL` / `Label_JP` / `Label_EN`）を新設
   - `$Def_CreationWorkCatalog` に `Works_OfficialLinks`（`$Def_OfficialLinkCatalog[]|#Null`）を追加
2. **データ** `data/db_meta.json`
   - `#Works_NumberTales` / `#Works_FLInvestigator78` に `Works_OfficialLinks` を追加
3. **疑似 API パススルー** `lib/sw-common.js` `buildWorkCatalogEntry()`
   - `Works_OfficialLinks` を配列パススルー（未宣言作品は `[]` フォールバック）
4. **UI 描画** `pages/characters.js`
   - `buildSafeExternalUrl()`（`http/https` のみ許可）と `renderWorkOfficialLinks()` を追加
   - `renderSelectionMeta()` から呼び出し、`#meta-work-links` へチップ状 `<a>` を描画
5. **UI 構造 / スタイル** `pages/characters.html` / `.sass` / `.css`
   - `#meta-work-links` 枠を追加、`.meta-overview__links` / `__link` のスタイル追加
   - `asset-version` → `2026.07.16.1`
6. **pkg ミラー同期** `pkg/nodejs` / `pkg/python` / `pkg/csharp`（+各 README）
7. **ドキュメント / 変更履歴** `docs/api-sw-spec.md` / `CHANGELOG.md`
8. **テスト** `tests/sw.work-meta-info.test.js` に `Works_OfficialLinks` パススルー検証を追加

## 影響範囲（編集ファイル）

- `data/db_type.json`, `data/db_meta.json`
- `lib/sw-common.js`
- `pages/characters.js`, `pages/characters.html`, `pages/characters.sass`, `pages/characters.css`
- `pkg/nodejs/index.mjs`, `pkg/nodejs/README.md`
- `pkg/python/creationsdb/client.py`, `pkg/python/README.md`
- `pkg/csharp/CreationsDBClient.cs`, `pkg/csharp/README.md`
- `docs/api-sw-spec.md`, `CHANGELOG.md`
- `tests/sw.work-meta-info.test.js`

## 検証

- `npm test`（Vitest）— 33 ファイル / 373 件すべて成功。
- 静的検証（JSON 構文 / 形状 / SW パススルー / スキーマ宣言存在）は自動テストで確認済み。

## 未完了タスク / 補足

- **ローカル HTTP サーバー上でのビジュアル確認**（`pages/characters.html` で公式リンクが実際に表示・クリックできるか）は User 環境での目視確認を推奨。
- `.sass` → `.css` 変換は VS Code 拡張の自動生成が原則。本作業ではヘッドレスのため、拡張と同一出力になるよう `.css` へ手動で最小差分を反映済み（次回 `.sass` 保存で再生成されても同一）。
- Cloudflare 実 API（`pkg/cloudflare`）は `migrate.mjs` が `CreationWorks` の生 JSON をそのまま保存するため、R2/D1 再投入時に `Works_OfficialLinks` は自動的に含まれる（Worker 側の `/works` レスポンス整形での明示追加は次フェーズ対象）。
