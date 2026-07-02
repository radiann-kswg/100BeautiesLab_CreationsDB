# DeepL 用語集ソース衝突の解消（併記形分割・単数/複数の除外）

## 目的

`npm run deepl:build-glossary` 実行時に EN→JA で 10 件の衝突（`glossary-conflicts.md`）が発生していた件を調査し、根本原因を構造的に解消する。

## 経緯・原因

`.cache/deepl/glossary-conflicts.md` の内容（端末表示は文字化けしていたが中身は正常なUTF-8）を確認したところ、2種類の別モノが混在していた。

1. **構造バグ（大半）**: `data/References/ref_Society.json` の `Term_EN` が `"WDCE. / the \"World Development & Creation Era\""` のように「略号 / 全文」を1つの文字列に同居させており、`Aliases` にも略号自体（`WDCE.` 等）がJP別表記のフリして混入していた。`build-glossary-source.mjs` の EN→JA 集計は EN文字列そのものをキーにするため、`Term_JP` 由来のペアと `Aliases` 由来のペアが同じ結合文字列キーに集約され、異なる JP ターゲット同士が衝突していた。
2. **本当の表記ゆれ**: `data/Dictionaries/dict_Faction.json`「創造主」→ `Regiowners`（複数形）と `data/References/ref_Vocabulary.json`「創造主」→ `Regiowner`（単数形）。これは JA→EN の同一 JP ソースに対する真の衝突。

## User確認事項と回答

- 「創造主」の英訳: **文法通り単数は `Regiowner`・複数は `Regiowners` を使い分けたい**（強制的にどちらかへ統一しない）。
- 「略号/全文」分割ロジック: **`/` 区切り・`\n` 区切りのどちらでも任意に分割できる汎用ロジック**にしてほしい（`ref_Society.json` の Aliases 整理と併せて実施）。
- 残る「正式名 vs 通称」10件（EN→JA）: **冗長な説明文では通称・略称、該当語自体を定義・説明する文では正式名**で使い分けたい（一次対応の追加依頼、2026-07-02 追記）。

## 変更点（実装）

- **`tools/deepl/build-glossary-source.mjs`**
  - `splitMultiForm(en)`（新規）: EN側の値を ` / `（前後空白必須）または改行で分割。`Demotion/Retrograde` のような複合語中スラッシュ（前後空白なし）は分割しない誤爆防止付き。
  - `isPluralPair(a, b)`（新規）: 片方が `${他方}s` と一致する単数/複数ペアを検出。
  - `buildJaEnMap()`: 併記形は先頭断片（本文中で優先される略号）を訳語に採用。単数/複数ペアを検出した場合は登録をスキップし、`grammar: true` フラグ付きで衝突ログへ記録。
  - `buildEnJaMap()`: 併記形は分割後の全断片を個別キーとして登録。加えて `Term_JP` 由来（正式名）ペアと `Aliases` 由来（通称・略称）ペアが同一 EN キーで衝突した場合も**登録を見送る**（`registerDependent: true` フラグ付きで衝突ログへ記録）。冗長な説明文では通称・略称、該当語自体を定義・説明する文では正式名という文脈依存の使い分けを、DeepL の単一キー用語集では機械的に固定できないため。
  - `main()` の衝突ログ出力: `grammar` / `registerDependent` フラグ付きエントリをそれぞれ `[文法差につき用語集登録なし]` `[文脈依存につき用語集登録なし]` として別形式で出力するよう分岐を追加。
- **`data/References/ref_Society.json`**: 5レコードの `Aliases` からEN側略号トークン（`WDCE.` / `WDC.VII` / `WDP.VII` / `WDC.VIII` / `WDP.VIII`）を削除。JP側の本当の別表記（`創世記` 等）は維持。
- **`docs/deepl-localization.md`**: §8（新規）に分割ロジック・単数複数の扱いを追記。最終更新日を更新。
- **`CHANGELOG.md`**: 本変更のエントリを追加。

## 影響範囲

- `tools/deepl/build-glossary-source.mjs`
- `data/References/ref_Society.json`
- `docs/deepl-localization.md`
- `CHANGELOG.md`

## 検証

- `npm run deepl:build-glossary` 再実行（2回目・最終版）:
  - JA→EN: 衝突1件（`創造主` → `[文法差につき用語集登録なし]`、想定通り）
  - EN→JA: 一意エントリ 162→152件（10件減）。衝突10件はすべて `[文脈依存につき用語集登録なし]`（正式名 vs 通称。例: `WDC.VII` → 候補 `『第7の世界創造』`/`多様化社会`）に変わり、以前あった自己参照ノイズおよび「先勝ちで正式名を強制」は解消済み。
  - `glossary_ja-en.tsv` / `glossary_en-ja.tsv` を目視確認。`WDCE.`↔`創世期`、`the "World Development & Creation Era"`↔`創世期` が双方向とも正しく登録され、`Regiowner`→`創造主`・`Regiowners`→`創造主`（EN→JA）も両方登録されていることを確認。JA→EN からは `創造主` が意図通り除外されていることを確認。
- `npm test`: 152 passed（既存テストへの影響なし。2回とも確認）。

## 未完了タスク

- EN→JA の `[文脈依存につき用語集登録なし]` 10件（正式名 vs 通称）は、実際の EN→JA 訳出（添削・逆引き）時に人間が文脈（冗長な説明文か・語自体を定義する文か）で個別判断する運用。自動化はしない方針で確定。
- `npm run deepl:sync-glossary` （DeepL側への実反映）は未実施（API キー要・Userの実行判断待ち）。

## 参考リンク

- [`docs/deepl-localization.md`](../docs/deepl-localization.md) §8
- [`tools/deepl/build-glossary-source.mjs`](../tools/deepl/build-glossary-source.mjs)
