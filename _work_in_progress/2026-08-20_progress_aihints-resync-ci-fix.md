# 2026-08-20 進捗: AIHints 構造的再同期ワークフローの CI 失敗を解消

## 目的

`AIHints 構造的再同期`（`.github/workflows/aihints-structural-resync.yml`）が `addon-ai-tag` への push のたびに
失敗していた問題を、手動で原因究明・解消する。

- 失敗した run: https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/actions/runs/32322154786

## 原因（2 段構え）

再同期処理そのものは正常。ローカルで dry-run すると全レコードが `resync-unchanged` で **差分ゼロ**（設計どおりの no-op）。
落ちていたのは以下の 2 点の連鎖だった。

### 原因 1: `db_Primary.json` の 1 箇所が prettier 未整形のまま commit されていた

`data/Works_NumberTales/DataBases/db_Primary.json` の `NumerospecStats`（`NumerospecAbout_EN` /
`SpecialPattern` の行）が prettier 準拠になっておらず、ワークフローの「整形（prettier / 対象ファイルのみ）」
ステップが毎回この 1 箇所を書き換えていた。

結果、再同期が no-op でも「差分の判定」が常に `changed=true` になり、本来スキップされるはずの
テストステップと PR 作成ステップが毎回起動していた。

> 補足: 手編集時の整形は `.claude/settings.json` の PostToolUse フック頼りで、
> ツール（`patch-aihints.mjs`）やエディタ外の編集経路では効かない。今回はその取りこぼし。

### 原因 2: perf テストの閾値が GitHub Actions の共有ランナーで成立しない

`tests/graph.edge-route.test.js` の「850 辺を実用的な時間で処理する」が、中央値 40ms 未満を要求していた。
CI 実測は **41.1 / 45.1 / 45.6 / 48.6 / 60.1 / 66.3ms**（ローカルは数 ms）で、テストステップが走れば必ず落ちる。

過去の失敗 run（31453020469 / 31458041928 / 31461715846 / 31654488491 / 31761318136 / 32322154786）は
**すべて同じテスト**が原因だった。つまり「PR を作るべき場面で必ずブロックされる」状態だった。

## 変更点

| ファイル | 変更 |
| --- | --- |
| `data/Works_NumberTales/DataBases/db_Primary.json` | prettier で 1 箇所を整形（値の変更なし。3 行の整形のみ） |
| `tests/graph.edge-route.test.js` | perf 閾値を `process.env.CI ? 200 : 40` に分離。CI では回帰検知に足りる緩い上限にする |

閾値を緩めても、アルゴリズムが悪化すれば桁で増えるため回帰検知力は残る（CI 実測の上振れ 66ms に対して 200ms）。

## 影響範囲

- `develop` で上記 2 ファイルを修正 → `addon-ai-tag` へマージ（`develop` が source of truth のため）
- ワークフロー YAML は無変更

## 検証

- `develop`: 全テスト成功（70 files / 1271 tests）
- `CI=true` での `tests/graph.edge-route.test.js`: 26 tests 成功
- `addon-ai-tag`: マージ後に全テスト成功、および `--resync-structural` dry-run が no-op であることを確認

## 未完了タスク

- 上記のリモート反映（push）後、`addon-ai-tag` への push で本ワークフローが no-op 成功に戻ることの確認
- ワークフローの annotation にある Node.js 20 の deprecation（`actions/checkout@v4` / `actions/setup-node@v4`）は今回未対応

## 参考リンク

- ワークフロー: `.github/workflows/aihints-structural-resync.yml`
- 再同期ツール: `tools/patch-aihints.mjs`
