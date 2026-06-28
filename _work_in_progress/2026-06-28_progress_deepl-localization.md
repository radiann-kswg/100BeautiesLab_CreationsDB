# 進捗レポート: DeepL 翻訳の創作 DB ローカライズ運用組み込み

- **日付**: 2026-06-28
- **作業ローカル / ブランチ**: 本体ローカル / `develop`
- **担当**: 扇一春（Claude / Cowork）
- **関連**: `docs/deepl-localization.md`（新規）/ `docs/localization-en-rules.md` / CLAUDE.md「会話パターン情報追加時の運用制約」

---

## 目的

新たに利用可能になった DeepL コネクタを、創作データベースのローカライズ運用に組み込む。固有名詞をブレなく訳すための DeepL 用語集（glossary）を、既存の監修済み辞書から生成・登録し、今後のローカライズで DeepL 翻訳を一貫運用できるようにする。

---

## 変更点の要約

1. **用語ソース抽出スクリプト** `tools/deepl/build-glossary-source.mjs`
   - `data/Localization/trans_*.json` / `data/References/ref_*.json` / `data/Dictionaries/dict_*.json` を走査。
   - キー型を自動判定（`X`/`X_EN`＝素キーJP、`X`/`X_JP`＝素キーEN の両対応）して JP↔EN 対を抽出。
   - 文章系ベース名（`summary`/`bodyblocks`/`about`/`transnote`/`comments`/`reading` 等）・改行・60 字超を除外。
   - `.cache/deepl/` に `glossary_ja-en.tsv` / `glossary_en-ja.tsv` / `glossary_source.json`（出典付き）/ `glossary-conflicts.md` を出力。
2. **DeepL REST クライアント** `tools/deepl/deepl-client.mjs`
   - `.env` 自動読込（Node 18 でも `--env-file` 非依存）、無料/Pro エンドポイント自動判定。translate / list / create / delete を提供。
3. **同期/更新スクリプト** `tools/deepl/sync-glossary.mjs`
   - 同名用語集を削除→再作成（DeepL は部分更新不可）。`--dry-run` 対応。`.cache/deepl/glossary-ids.json` を書き戻す。
4. **英訳評価/添削スクリプト** `tools/deepl/evaluate-translations.mjs`
   - 各作品 db の JP/EN ペアを DeepL 機械訳（JA→EN・用語集適用）と突き合わせ、`.cache/deepl/eval-report.md` を類似度の低い順に出力。**データは一切書き換えない**（人間レビュー用提案）。
5. **DeepL 用語集を実登録**（Cowork コネクタ経由）
   - `100BL-CreationsDB JA-EN`（142 件） / `100BL-CreationsDB EN-JA`（140 件）。
6. **ローカル環境設定**
   - `.env.example`（`DEEPL_API_KEY`）追加、`.gitignore` に `.env` 系追加、`package.json` に `deepl:build-glossary` / `deepl:sync-glossary` / `deepl:eval` 追加。
7. **ドキュメント / 履歴**
   - `docs/deepl-localization.md` 新規。`docs/localization-en-rules.md` §8 から相互リンク。`CHANGELOG.md` 追記。

---

## 影響範囲（編集・追加ファイル）

- 追加: `tools/deepl/build-glossary-source.mjs` / `deepl-client.mjs` / `sync-glossary.mjs` / `evaluate-translations.mjs`
- 追加: `docs/deepl-localization.md` / `.env.example` / 本進捗ログ
- 編集: `package.json`（scripts）/ `.gitignore`（`.env` 系）/ `CHANGELOG.md` / `docs/localization-en-rules.md`（§8 相互リンク）
- 生成物（Git 管轄外）: `.cache/deepl/*`（TSV / JSON / レポート / glossary-ids）

> `data/` 配下の創作データ JSON は**変更していない**（用語集はデータから「読むだけ」）。

---

## 合意事項（運用ルール）

- 既存 `_EN` / `_JP` を DeepL 出力で自動上書きしない（`localization-en-rules.md` §0 厳守）。
- 創作本文（台詞・未公開設定・固有用語）を DeepL で新規生成しない。DeepL は「既存対訳の一貫適用」と「添削補助」に限定。
- 翻訳時は必ず用語集 ID を指定（JA→EN=ja-en / EN→JA=en-ja、ID は `glossary-ids.json` 参照）。
- 用語集の更新は辞書 → `build-glossary` → 衝突確認 → `sync-glossary` の順。

---

## 検証

- `npm run deepl:build-glossary`: 延べ 186 ペアから JA→EN 142 / EN→JA 142 一意エントリを生成。衝突は表記ゆれ 4 件のみ（先勝ち）。
- 用語集疎通テスト（JA→EN, glossary 適用）:
  - 入力「ナンバーテールズの零零は九蓮国の照梅テクノロジーに所属する妖狐型のヒューマノイドである。」
  - 用語集なし: `Zero Zero of Number Tails ... Shomei Technology in the Kingdom of Kyuren`（固有名詞崩れ）
  - 用語集あり: `Zera Norumber of NumberTales ... Shôbai Technology in LotusNinea`（正規表記に固定）✓
- `npm test`（Vitest）: 別途ローカルで実行のこと（当サンドボックスは rolldown ネイティブ未対応で起動不可。データ非変更のため回帰リスクは低）。

---

## 未完了タスク / 申し送り

- `npm test` のローカル実行確認（User 端末）。
- `sync-glossary` / `eval` のローカル実行には `.env` の `DEEPL_API_KEY` 設定が必要（Cowork コネクタ経由なら不要）。
- 本変更は `develop` 想定。AIHints 非該当のため `addon-ai-tag` への波及なし。コミット/プッシュは User 端末で実施（サンドボックスからの git 書き込みは不可）。
- 将来案: 用語集ソースに人物呼称（`*Calling`）等の語彙を含めるかは、文章扱いとの線引きを要検討（現状は固有名詞・用語に限定）。
