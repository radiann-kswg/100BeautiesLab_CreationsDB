# 2026-09-14 進捗: 旧綴り別名解決を Python / C# クライアントへ追従（PR #34 レビュー指摘対応）

## 背景

PR #34（マージ済み `a6ab69a`）に対する Copilot レビューの未解決コメント 2 件への対応。

1. `pkg/nodejs` に追加した旧綴りエイリアスの回帰テストが無い（既存 `tests/pkg.nodejs.test.js` は `Proxies` のみ検証）
2. **本命**: 同一 API サーフェスを持つ `pkg/python` / `pkg/csharp` にエイリアスが無く、
   両クライアントは `ShouArRiders` を旧ディレクトリ `Works_ShouArRiders` へ解決してしまう
   （＝互換性修正が言語ごとに分岐する）

`pkg/mcp` は `pkg/nodejs` の `CreationsDBClient` を import しているだけなので自動追従する（対応不要）。

## 方針

- Node.js / Cloudflare と**同じ位置**（作品ID正規化 = `_to_work_key()` / `ToWorkKey()`）で読み替える。
  ディレクトリエイリアスだけでは `db_meta.json` の `CreationWorks` キー参照が旧キーのまま残るため。
- エイリアス表は SSOT を持たず 7 ファイルへ独立に書かれている（これが今回の取りこぼしの原因）。
  表を 1 箇所へ寄せる大きなリファクタは影響範囲が広いので採らず、
  **「全ファイルで一致すること」を機械検査するテスト**を置いて同じ漏れが再発しないようにした。

### エイリアス表の所在（7 ファイル）

| 種別 | ファイル | 識別子 |
| ---- | -------- | ------ |
| 作品ID | `lib/viewer-locator.js` | `LEGACY_WORK_ALIASES` |
| 作品ID | `lib/sw-common.js` | `LEGACY_WORK_ID_ALIASES` |
| 作品ID | `lib/data-common.js` | `DATA_COMMON_LEGACY_WORK_ID_ALIASES` |
| 作品ID | `pkg/cloudflare/worker.js` | `LEGACY_WORK_ID_ALIASES` |
| 作品ID | `pkg/nodejs/index.mjs` | `LEGACY_WORK_ID_ALIASES` |
| 作品ID | `pkg/python/creationsdb/client.py` | `_LEGACY_WORK_ID_ALIASES` |
| 作品ID | `pkg/csharp/CreationsDBClient.cs` | `LegacyWorkIdAliases` |

ディレクトリ側（`*_WORK_DIR_ALIASES` / `LegacyWorkDirAliases`）は上記から `viewer-locator` を除き
`pages/characters.js` を加えた 6 ファイル。

## 変更点

- `pkg/python/creationsdb/client.py`: `_LEGACY_WORK_ID_ALIASES` 新設 → `_to_work_key()` へ適用、
  `_LEGACY_WORK_DIR_ALIASES` へ `ShouArRiders` → `Works_ShauErRiders` を追加
- `pkg/csharp/CreationsDBClient.cs`: `LegacyWorkIdAliases` 新設 → `ToWorkKey()` へ適用、
  `LegacyWorkDirAliases` へ同エントリを追加
- `pkg/cloudflare/worker.js`: `LEGACY_WORK_ID_ALIASES` の宣言を `toWorkKey()` の前へ移動
  （PR #34 では参照より後に宣言していた。実行時は問題ないが宣言順として不適切だったため）
- `tests/pkg.client-alias-parity.test.js`（新規、23 テスト）
- `tests/pkg.nodejs.test.js`: 旧綴りでの `getRecords()` / `getWorkMeta()` 回帰テストを追加
- `docs/pkg-client-libraries.md`: 対応機構の表と更新履歴を追記
- `CHANGELOG.md`

## 検証

- `npm test`（vitest）: 75 ファイル / 1364 テスト 全パス
- **パリティテストの実効性確認**: Python 側の表を一時的に空へ書き換えると当該テストが RED になることを確認してから元へ戻した（落ちないテストを置かないため）
- **Python クライアントの実挙動**: `python3` で実行し、`_to_work_key('ShouArRiders')` → `#Works_ShauErRiders`、
  `get_records('ShouArRiders', 'Primary')` が現行綴りと同一（10 件）、`get_work_meta()` も一致することを確認
- **C# クライアント**: サンドボックスに dotnet が無いためコンパイル・実行の検証は未実施。
  既存 `LegacyWorkDirAliases` / `ResolveWorkDirName()` と同一の構文パターン（`new()` 初期化子 + `TryGetValue`）に
  揃えており、波括弧・丸括弧の対応数は HEAD 時点と同一であることを確認済み。**User 側での `dotnet build` 確認を推奨**

## 未完了タスク（申し送り）

- [ ] C# クライアントのビルド確認（サンドボックスに dotnet 無し）
- [ ] PR #34 のレビューコメント 2 件を、本 PR マージ後に resolve する
- [ ] 下流（`JsonCharacterDB-Framework`）への波及: `pkg/` 配下の変更。API シグネチャの変更は無し
- [ ] エイリアス表の SSOT 化（7 ファイルの重複解消）は今回スコープ外。
      パリティテストで漏れは止まるので、必要になったら別途検討する

## 参考

- PR #34: https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/pull/34
- レビュー指摘: `pkg/nodejs/index.mjs` L51-58 への 2 スレッド
- 前段の作業ログ: `_work_in_progress/2026-09-12_progress_shauer-api-alias.md`
