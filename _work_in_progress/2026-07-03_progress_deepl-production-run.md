# 2026-07-03 進捗: DeepL 本番ステップ実行（P2）

## 目的

`2026-07-03_current-task-ledger.md` の P2（DeepL 運用系の実環境確認）について、
`DEEPL_API_KEY` を利用した本番系コマンドを実行し、結果を記録する。

## 実施内容

- `.env` から `DEEPL_API_KEY` をプロセス環境へ読み込み（値は出力しない運用）。
- 実行コマンド:
  - `npm run deepl:sync-glossary`
  - `npm run deepl:draft -- --work Works_NumberTales --db Primary --id 8 --apply --limit 30`
  - `npm run deepl:draft -- --work Works_NumberTales --db Primary --field Summary --limit 5 --apply`
  - `npm run deepl:draft -- --work Works_FLInvestigator78 --db Primary --limit 5 --apply`
  - `npm run deepl:eval`
  - `data/Works_*/DataBases/db_*.json` の空 `_EN` 横断確認
  - `winget install --id Python.Python.3.12 --exact --source winget --accept-package-agreements --accept-source-agreements`
  - `py -3.12 tools/deepl_py/draft_translate.py --work Works_NumberTales --db Primary --id 8 --under ConversationPattern`

## 結果

- `deepl:sync-glossary`:
  - JA-EN 165 件、EN-JA 152 件で同名用語集を再作成し同期成功。
  - `.cache/deepl/glossary-ids.json` 更新。
- `deepl:draft --apply` (Num 8):
  - 候補 0 件 / 適用 0 件（データファイル変更なし）。
  - `.cache/deepl/draft-report.md` 出力。
- `deepl:draft --apply`（追加試行 2 件）:
  - `Works_NumberTales/Primary`（Summary 指定）: 候補 0 件 / 適用 0 件。
  - `Works_FLInvestigator78/Primary`: 候補 0 件 / 適用 0 件。
- 空 `_EN` 横断確認:
  - `data/Works_*/DataBases/db_*.json` に空 `_EN` フィールドは現時点で存在せず、
    `draft --apply` の候補 0 件は仕様どおり。
- `deepl:eval`:
  - 候補 359 件から 25 件を評価。
  - `.cache/deepl/eval-report.md` 出力。
- Python 版疎通:
  - `py -0p` で `3.14` と `3.12` の利用可能環境を確認。
  - `py -3.12 --version` は `Python 3.12.10`。
  - `draft_translate.py` 実行成功（候補 0 / 適用 0、レポート出力あり）。

## ブロッカー / 保留

- なし（P2 の実行範囲は完了）。
- 補足: `python` コマンドは App Execution Alias の影響で未解決のため、当面 `py -3.12` を使用する。

## 次アクション

- DataBases 配下で空 `_EN` が新たに発生したタイミングで、`deepl:draft --apply` を再実行する。
