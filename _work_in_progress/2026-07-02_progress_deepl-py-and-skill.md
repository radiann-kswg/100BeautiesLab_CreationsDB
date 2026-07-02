# DeepL 下書き翻訳 Python 版 + Claude 翻訳 Skill 追加

## 目的

`Summary_EN` 等の空フィールドをキャラごとに手動で英訳した作業（`Works_FLInvestigator78/DataBases/db_Primary.json` のドゥームズ・ルネ）をきっかけに、User から「DeepL API や Claude のコネクタで自動実行するコマンドを、Python と Node.js の両方で欲しい」という依頼を受けた。

ヒアリングの結果、要望は以下の3点に整理された。

1. 既存の Node 版 DeepL 下書き翻訳ツール（`tools/deepl/draft-translate.mjs`）をベースに拡張したい。
2. 「Claude のコネクタ」＝ Cowork に設定済みの DeepL MCP コネクタを自動実行できないか、という意図だった。→ MCP コネクタは対話セッション専用のツールでスクリプトから呼び出せないため不可能。代替として、Claude Code / Cowork のセッション内で Claude 自身が翻訳する運用を仕組み化してほしい、という要望に転換。
3. Python 版が欲しい理由は、`pkg/python` のような別リポジトリ配布のクライアントから使いたいため。

## 変更点の要約

- **`tools/deepl_py/`（新規）**: `tools/deepl/draft-translate.mjs` の Python 移植（外部ライブラリ非依存）。
  - `deepl_client.py` / `pronoun_normalize.py` / `draft_translate.py` / `__init__.py` / `README.md`
  - 用語集の作成・同期（`build-glossary-source.mjs` / `sync-glossary.mjs`）は移植せず、Node 側に一元化（`.cache/deepl/glossary-ids.json` を Python 側から読むだけ）。
- **`tools/deepl/draft-translate.mjs`**: `--field` オプションを追加（トップレベルの `field_EN` 名で絞り込み）。Python 版にも同時実装。
- **`.claude/skills/localize-en-draft/SKILL.md`（新規）**: Claude Code / Cowork が「JP フィールドから空の `_EN` を下書き翻訳する」作業を型化した Skill。今回手動でやった手順（対象抽出→`docs/localization-en-rules.md`参照→キー順序を守って挿入→`npm test`）を一般化した。Node/Python の自動ツールは「既存キーが空のときだけ」対象にできる（新規キー追加はしない）ため、`field_EN` キー自体が無いケースの受け皿として位置づけた。
- **ドキュメント**: `docs/deepl-localization.md`（§2-1 Python 版・§2-2 Skill・§3-4 追記・§6 参照表更新）、`CHANGELOG.md`。

## 影響範囲（編集したファイル）

- `tools/deepl_py/__init__.py`（新規）
- `tools/deepl_py/deepl_client.py`（新規）
- `tools/deepl_py/pronoun_normalize.py`（新規）
- `tools/deepl_py/draft_translate.py`（新規）
- `tools/deepl_py/README.md`（新規）
- `tools/deepl/draft-translate.mjs`（`--field` オプション追加）
- `.claude/skills/localize-en-draft/SKILL.md`（新規）
- `docs/deepl-localization.md`
- `CHANGELOG.md`
- `data/Works_FLInvestigator78/DataBases/db_Primary.json`（本タスクの前段、`Summary_EN` 手動翻訳2件・ドゥームズ/ルネ。別作業だが同日）

## 検証

- `npm test`: 152 passed（Node 側の既存テストに回帰なし。`tests/deepl.pronoun-normalize.test.js` はそのまま Node 版を対象に pass）。
- Python 側は自動テストランナー未整備（リポジトリに pytest 等の構成なし）のため、スクラッチスクリプトで手動突き合わせを実施:
  - `pronoun_normalize.py`: `tests/deepl.pronoun-normalize.test.js` と同一ケースを移植して実行し、全件 Node 版と同じ出力になることを確認。
  - `draft_translate.py`: `deepl_client.translate()` をモック化したフィクスチャデータ（`DEEPL_DRAFT_DATA_DIR` で一時ディレクトリを指定）で、候補抽出・`--field` 絞り込み・`--apply` 書き戻し・既存値スキップ（`Character_EN` に値がある場合は触らない）・レポート出力（`.cache/deepl/draft-report.md`）を確認。
  - DeepL API への実通信（実際の翻訳結果・用語集適用）は `DEEPL_API_KEY` が本セッションに無いため未検証。

## 未完了タスク

- ⚠️ **実 API 疎通確認は User 側で必要**: `python tools/deepl_py/draft_translate.py --work <作品> ...` を実際の `DEEPL_API_KEY` ありで実行し、Node 版と同等の翻訳結果・レポートが得られるかを確認してほしい。
- ⚠️ **Skill の自動検出確認**: `.claude/skills/localize-en-draft/SKILL.md` を配置したが、本セッション内では新規追加した Skill 自体を呼び出して動作確認することはできなかった（次回セッション以降での認識を確認してほしい）。認識されない場合はファイル配置・frontmatter 形式の見直しが必要。
- Python 側に pytest 等のテストランナーを追加するかどうかは今回見送った（リポジトリ全体で Python テスト基盤が無いため）。必要なら別途相談。

## 参考リンク

- [`docs/deepl-localization.md`](../docs/deepl-localization.md) §2-1 / §2-2 / §3-4
- [`tools/deepl_py/README.md`](../tools/deepl_py/README.md)
- [`.claude/skills/localize-en-draft/SKILL.md`](../.claude/skills/localize-en-draft/SKILL.md)
- 前段の手動翻訳作業: `data/Works_FLInvestigator78/DataBases/db_Primary.json`（ドゥームズ・ルネの `Summary_EN` 新規挿入）
