# 進捗: Copilot 英訳(_EN)入力補助 — 用語集対応 (2026-07-01)

## 目的

GitHub Copilot（VSCode）で、創作 DB の英訳フィールド（`_EN`）入力を、監修済み辞書に沿って補助できるようにする。User の要望は「前に実装した DeepL 翻訳機能を Copilot のコード補助に活かして、英訳フィールドの入力補助にしたい」。

## 前提の整理（仕組み上の制約）

- **Copilot インライン補完（ゴーストテキスト）は DeepL API を呼べない**し、**カスタム指示ファイル（`copilot-instructions.md` / `*.instructions.md`）も読み込まない**。効くのは近傍タブ／開いているファイルの文脈のみ。
- **カスタム指示ファイルが効くのは Copilot Chat / Agent / Edits**（GitHub Docs / VS Code Docs 2026 で確認）。
- 既存の `tools/deepl/` はバッチ運用（用語集生成・同期・eval）。単発の「選択 JP → EN 挿入」コマンドは今回スコープ外（User 判断で見送り）。

→ 方針: **① Copilot Chat の用語集対応**（確実に効く）＋**② インライン補完向けに早見表を隣接タブ文脈として供給**（限定的だが唯一のレバー）。

## 変更点の要約

| 種別 | ファイル | 内容 |
|---|---|---|
| 新規 | `.github/instructions/localization-en.instructions.md` | `applyTo` = `data/**/db_*.json, trans_*.json, ref_*.json, dict_*.json`。`_EN` 補助の追加ルール＋中核固有名詞のインライン早見 |
| 新規(生成物) | `docs/localization-glossary-quickref.md` | 監修辞書から抽出した固有名詞 JP↔EN 対訳 164 件を出典別に整形 |
| 新規 | `tools/deepl/build-copilot-quickref.mjs` | 早見表ジェネレータ（`glossary_source.json` を整形出力） |
| 変更 | `package.json` | `deepl:build-quickref` スクリプト追加 |
| 変更 | `.github/copilot-instructions.md` | 「英訳(_EN)入力補助の参照先」ルール追記 |
| 変更 | `CLAUDE.md` | 主要ドキュメント参照先表に行追加 |
| 変更 | `docs/deepl-localization.md` | §6 参照先に Copilot 指示／早見表を追加 |
| 変更 | `CHANGELOG.md` | 本変更のセクション追記 |

## 合意事項（ルール）

- **創作本文の新規生成はしない**。英訳補助は「既にある `_JP` を訳す」場合のみ。翻訳元が無いフィールドは空のまま。
- **既存 `_EN` は上書きしない**（空のときだけ補助）。`hideText` は尊重。
- **固有名詞は辞書対訳に固定**。参照順序: 早見表 → 辞書本体（`trans_*`/`ref_*`/`dict_*`）→ `localization-en-rules.md`。
- **作品タイトルの英名は捏造しない**（`Works_` 識別子が正）。監修辞書に対訳が無いため中核表からも除外。
- 最終採否は User。迷う訳は候補提示に留める。

## 実装方針メモ

- 早見表は手打ちせず**ジェネレータで生成**（164 行の転記事故防止 ＋ 辞書更新時の再現性）。抽出は既存 `build-glossary-source.mjs` の出力（`.cache/deepl/glossary_source.json`、読みグロス正規化済み）を再利用。
- 早見表は自動生成ヘッダ付き（直接編集禁止・`npm run deepl:build-quickref` で再生成）。

## 検証

- `node --check tools/deepl/build-copilot-quickref.mjs` → OK。
- `npm run deepl:build-glossary` → `npm run deepl:build-quickref` 実行成功（164 対訳出力）。
- `data/**` JSON 154 件パース確認 OK（**データは未変更＝回帰対象外**）。`package.json` パース OK。
- **`npm test`（Vitest）はサンドボックスで実行不可**: `node_modules` が Windows ネイティブ（`rolldown` の `.linux-x64-gnu.node` 欠落）。→ 本体/Windows で `npm.cmd test` により確認すること（推奨・未実施）。

## 未完了タスク / 引き継ぎ

- [ ] 本体/Windows で `npm.cmd test`（Vitest）を実行し pass 確認。
- [ ] sub1（`develop`）でコミット → push → 本体/他ローカルへ `pull`。sandbox からは git 書き込み不可のため User 側で実施。
- [ ] （任意）Copilot Chat で実地に「NT の未英訳 `_EN` を早見表準拠で提案させる」動作確認。
- [ ] （任意・将来）DeepL オンデマンド翻訳コマンド（選択 JP → EN 挿入）を追加するかは別途判断。

## 作業環境

- ローカル: **sub1**（`C:\Visual Studio Code UserFile\...\100BeautiesLab_CreationsDB-sub1`）／ブランチ `develop`（着手時クリーン）。
- 本体ローカルと sub2 は未コミット変更を抱えていたため回避（二重編集防止）。

## 参考

- GitHub Docs: Adding repository custom instructions for GitHub Copilot
- VS Code Docs: Use custom instructions in VS Code
- 関連: `docs/deepl-localization.md` / `docs/localization-en-rules.md`
