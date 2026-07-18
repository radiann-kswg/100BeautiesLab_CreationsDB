# 進捗: `build-roleplay-prompts.mjs` シェバン除去による vitest テスト失敗の解消 (2026-07-18)

## 実施環境（サブローカル横断の明示）

- **ローカル**: サブローカル1（`…/100BeautiesLab_CreationsDB-sub1`）
- **ブランチ**: `addon-ai-tag`
- **並行状況**: 別ローカルで **ロールプレイプロンプト生成機能の更新が現在進行形**（同じ `tools/build-roleplay-prompts.mjs` 周辺）。二重編集を避けるため、本作業は当該ファイルへの差分を**1 行削除のみ**に限定した。

## 目的

`develop` を `addon-ai-tag` へマージ後、`npm test` で 1 件失敗していた原因を切り分け、仕様（データ/スキーマ）の衝突ではないことを確認したうえで、最小差分で復旧する。

## 調査と原因（確定）

- 失敗は `tests/data.roleplay-prompts.test.js` の **1 件のみ**。アサーションではなく **suite 読み込み時点で `SyntaxError: Invalid or unexpected token`**（`0 test` で suite ごと FAIL）。
- 切り分け:
  - コンフリクトマーカー残留なし（`LICENCE` の飾り線のみ）。
  - テストファイル本体・各 import 対象とも `node --check` OK / 素の `import()` OK / BOM・制御文字なし。
  - vitest v4.1.0 は esbuild 非同梱。エラー文言は **V8 由来**（esbuild なら "Unexpected …"）。
- 根本原因: **`tools/build-roleplay-prompts.mjs` 先頭のシェバン `#!/usr/bin/env node`**。テストが同ファイルから `generatePrompt` / `hasFilledConversationPattern` / `computeOutputPath` を import → vitest のモジュールランナーがコードを**関数ラップして評価** → 先頭でなくなった `#` を V8 が不正トークンと解釈し失敗。CLI 直接実行では node がシェバンを剥がすため無害だった（別ローカル実装時の旧 vitest では未顕在、マージで 4.1.0 に揃い表面化）。
- **再現確認**: `.cache` にシェバン除去コピーを作成し、シェバン付き import → 同一 `SyntaxError` / 除去版 import → 成功、で確定（一時ファイルは削除済み）。

## 判断（User 合意）

- 進め方は **二段構え**を選択（User 判断）。
  - **今回**: シェバン 1 行削除だけで復旧（該当ファイルの差分＝1 行 → 進行中の別ローカルとほぼ衝突しない）。
  - **後続（別担当・保留）**: CLI エントリと再利用ライブラリの分離（`tools/roleplay/` 配下へ移設する option 2 本体）は、別ローカルのロールプレイ更新が落ち着いてから担当を分けて実施。

## 変更点の要約

- `tools/build-roleplay-prompts.mjs`: 1 行目のシェバンを削除（差分 1 行のみ）。entry guard は `import.meta.url` 判定なので CLI 動作は不変。
- `CHANGELOG.md`: `fix:` エントリを追記（先頭 prepend）。

## 影響範囲（編集したファイル）

- `tools/build-roleplay-prompts.mjs`（1 行削除）
- `CHANGELOG.md`（追記）
- `_work_in_progress/2026-07-18_progress_roleplay-shebang-fix.md`（本ファイル・新規）

## 検証

- `npm test`（vitest 4.1.0） — **48 ファイル / 652 件すべて成功**（`addon-ai-tag`）。修正前は 47 passed + 1 failed suite（対象 6 件が suite ごと 0 実行）。
- CLI 疎通: `node tools/build-roleplay-prompts.mjs`（plan/dry-run）→ `errors=0`・既存ファイルは保護（`--force` なしで上書きせず）。

## 未完了タスク

- **option 2 本体（ライブラリ分離）**: 別ローカルのロールプレイ更新完了後に、担当を分けて `tools/roleplay/` へ移設。
- **`tools/extract-enum-lists-to-dictionaries.mjs`**: 同じくシェバン付き。現状テスト未 import のため無害だが、将来テストから import する場合は同様の分離／シェバン除去対象。

## 参考

- CHANGELOG: 2026-07-18 `fix:` エントリ
- 関連進捗: `_work_in_progress/2026-07-18_progress_roleplay-prompt-generator.md`
