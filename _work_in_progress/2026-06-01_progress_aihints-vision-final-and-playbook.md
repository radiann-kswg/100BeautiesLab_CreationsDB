# 2026-06-01 進捗: AIHints 視覚解析セッション最終ラウンド（#85-#99 + 特殊番号）と再現用パッチ整備

## 目的

`Works_NumberTales` / `DB_Primary` の `AIHints` 視覚解析を完走させ、本セッション以降も同様のワークフローを Agent モードで再現できるように `tools/patch-aihints.mjs` を拡張、ドキュメントを整備する。

## 適用範囲（重要）

- **本セッションの作業・パッチ・検証はすべて `data/Works_NumberTales/DataBases/db_Primary.json` のみを対象に実施されている。**
- 他作品（`Works_FLInvestigator78` / `Works_ShouArRiders` / `Works_SinisterChangingGirls` / `Works_UnauthedLogica` / `Works_PastDivers` / `Works_DestinyFoxRecords` / `Works_Proxies`）、および同 `Works_NumberTales` 内の他 DB（`Secondary` / `SemiPrimary` / `SelfSecondary` / `Proxy` 等）への適用は **未検証**。
- 他作品・他 DB へ転用する際は、画像ディレクトリ構造、`Images.*_PNGPath` 規則、作品別 `db_type.json($VersDef)` の差異を個別に検証してから `--work` / `--db` と画像パス解決ロジックを調整すること。

## 変更点の要約

### 1. `tools/patch-aihints.mjs` の拡張（特殊番号対応）

- `parseRecordSpec()`: `000` / `2-alt` / `10-alt` / `67-old` のような string `Num` トークンを受理（純整数は number / string 両形式を Set へ追加し後方互換）。
- `gen-vision-tasks` メインループ / メインループ本体の `typeof num !== 'number'` ガードを「存在 + (number|string)」へ緩和（2 箇所）。
- humanoid 画像マッチ正規表現を `art_img([0-9A-Za-z\-]+?)-humanoid` に拡張し、文字列ベース照合 + 数値同士の後方互換比較を併用。
- `--records <spec>` のヘルプに特殊番号トークン例を追記。

### 2. `Works_NumberTales/db_Primary.json` のデータ更新

- `#97`（ココナ）、`#98`（キュウヤ）、`#99`（ツクモ）、`#000`（チトセ）、`#2-alt`（バイナ／ツギ）、`#10-alt`（ディケ／ツナイ）の 6 レコードに `AIHints` を付与（vision-applied=6）。
- 特殊番号 3 件は `--suggest --apply` で scaffold 生成→`--apply-vision-results --apply` で視覚情報適用→`--fill-todos --apply` で JSON 由来 TODO 補完まで実施。
- `common.natural_language_description` は作品設定本文に踏み込む領域のため自動補完を保留し、User 手動入力を待つ（残 TODO 3 件）。

### 3. ドキュメント整備

- `docs/ai-hints-usage.md` に `§9 Agent セッション再現用プレイブック` を追加。Mermaid フロー図 + 各 Step の標準コマンド + 特殊番号レコードの取り扱い + チェックリストを記載。**冒頭で適用範囲が `Works_NumberTales/DB_Primary` のみであることを強調**。
- `CHANGELOG.md` に今回の変更を追記。同様に適用範囲を明示。

## 影響範囲（編集ファイル）

- `tools/patch-aihints.mjs`
- `data/Works_NumberTales/DataBases/db_Primary.json`
- `docs/ai-hints-usage.md`
- `CHANGELOG.md`
- `.cache/vision-results.json`（マージ済み）
- `.cache/vision-results-batch-85-96.json`（新規・キャッシュ）
- `.cache/vision-results-batch-97-99-special.json`（新規・キャッシュ）

## 未完了タスク

- `#000` / `#2-alt` / `#10-alt` の `common.natural_language_description`（User 手動入力推奨）
- 画像未提供の 13 レコード（`#38`, `#54`, `#59`, `#67-old`, `#79`, `#80`, `#82`, `#83`, `#90`, `#91`, `#95`, `#0`, `#00`）は恒久的に AIHints 未付与（方針確定）
- 他作品・他 DB への展開（要件発生時に個別検証）

## 検証

- `.\node_modules\.bin\vitest.cmd run tests/data.sanity.test.js tests/sw.enrich.basic.test.js` → 5/5 pass
- AIHints 付与済み: 92 records / TODO 残: 3 records（上記 NL のみ）

## 参考リンク

- [docs/ai-hints-usage.md §9](../docs/ai-hints-usage.md)
- [CHANGELOG.md](../CHANGELOG.md)
- [tools/patch-aihints.mjs](../tools/patch-aihints.mjs)
