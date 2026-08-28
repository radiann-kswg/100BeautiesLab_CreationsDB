# 2026-08-28 進捗: AIHints 構造的再同期ワークフローの npm ci 失敗を解消（package-lock.json 破損）

## 目的

`AIHints 構造的再同期`（`.github/workflows/aihints-structural-resync.yml`）が `addon-ai-tag` への push
（Merge branch 'develop' into addon-ai-tag / 2ac050a）で失敗した問題の原因究明と修正。

- 失敗した run: https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/actions/runs/33145934460
- 症状: 「依存関係のインストール」ステップの `npm ci` が
  `EUSAGE: The npm ci command can only install with an existing package-lock.json ...` で失敗。

## 原因

**`package-lock.json` が壊れた JSON のまま commit されていた。**

- 破損起点: マージコミット `307cf94`（Merge branch 'develop' into dependabot/npm_and_yarn/glob-13.0.6）。
  コンフリクト解決の失敗で以下が混入していた。
  - `node_modules/ws` エントリの閉じ括弧 2 個欠落（1874 行目付近で JSON parse error）
  - lockfile 内バージョンが `glob 13.0.6` / `jsdom 26.1.0` になっており、
    `package.json` の宣言（`glob ^11.1.0` / `jsdom ^30.0.1`）と不整合
  - 既存エントリ（`@isaacs/cliui` 等）の欠落
- npm（Arborist）は **parse できない lockfile を「lockfile 無し」として扱う**ため、
  ファイル自体は存在するのに「package-lock.json が無い」という紛らわしいエラーになっていた。
- この破損 blob が develop → addon-ai-tag のマージで伝播し、addon-ai-tag 上の CI が落ちた。
- 再実行（rerun）でも同一失敗 → 決定的原因。ローカルで 2ac050a を worktree 展開して
  `npm ci --dry-run` の失敗と `JSON.parse` エラーを再現・確認済み。

## 変更点

| ファイル            | 変更                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `package-lock.json` | `npm install --package-lock-only` で package.json から再生成（lockfileVersion 2 → 3、glob 11.1.0 / jsdom 30.0.1 に整合） |

## 検証

- `node -e "JSON.parse(...)"` → JSON OK
- `npm ci --dry-run` → 成功
- `npm test` → 70 files / 1271 tests すべて成功

## 影響範囲・反映手順

1. `develop` へ commit（本修正）
2. `develop` → `addon-ai-tag` へマージ（一方向マージ方針どおり）
3. addon-ai-tag への push で本ワークフローが再走行 → `npm ci` 成功を確認

## 未完了タスク

- リモートへの push と addon-ai-tag へのマージ反映（User 確認後）
- 再発防止の検討（任意）: lockfile の JSON 妥当性を `tests/` か CI で軽く検査する案

## 参考リンク

- 前回の CI 失敗調査: `_work_in_progress/2026-08-20_progress_aihints-resync-ci-fix.md`
