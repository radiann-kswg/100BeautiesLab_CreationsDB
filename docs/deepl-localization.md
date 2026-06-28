# DeepL 翻訳 運用ガイド（創作 DB ローカライズ）

> **対象**: Claude（Cowork）/ Claude Code / GitHub Copilot / リポジトリ運用者
> **目的**: DeepL 翻訳を 100BeautiesLab. Creations DB のローカライズ運用に組み込み、固有名詞をブレなく訳すための手順とルールを定義する
> **最終更新**: 2026-06-28（初版）
> **関連**: [`localization-en-rules.md`](localization-en-rules.md)（和英ルール）/ [`jp-notation-rules.md`](jp-notation-rules.md)（和文記法）

---

## 0. 位置づけと最優先原則

DeepL は **既存ローカライズルールを置き換えるものではなく、補助** です。最終的な `_EN` / `_JP` 値の採否は人間（User）が判断します。

1. **既存値を自動上書きしない**: DeepL の出力でデータの `_JP` / `_EN` を機械的に書き換えない。`localization-en-rules.md` §0 の上書き禁止原則を厳守する。
2. **創作本文の自動生成はしない**: 台詞・未公開設定・固有用語などの「創作内容そのもの」を DeepL で新規生成しない（CLAUDE.md「会話パターン情報追加時の運用制約」準拠）。DeepL の用途は **既存対訳の一貫適用** と **英訳の突き合わせ（添削補助）** に限定する。
3. **固有名詞は用語集で固定**: 作品名・地名・人物名・種族名などは、監修済み辞書から生成した **DeepL 用語集（glossary）** で訳語を固定する。
4. **公開範囲とライセンス**: 訳出物は CC BY-NC 4.0 と第三者利用ガイドラインの範囲で扱う。

---

## 1. 用語集（glossary）の仕組み

固有名詞の対訳は、リポジトリ内の **監修済み辞書** をソース・オブ・トゥルースとする。

| ソース | 場所 | キー |
|---|---|---|
| Localization 翻訳辞書 | `data/Localization/trans_*.json` | `Term_JP` / `Term_EN`（+ `Aliases`） |
| References 資料 | `data/References/ref_*.json` | `Term_JP` / `Term_EN`（+ `Aliases`） |
| Dictionaries 辞書 | `data/Dictionaries/dict_*.json` | `X` / `X_EN` または `X` / `X_JP`（型はファイル依存・自動判定） |

これらから JP↔EN の短い対訳だけを抽出して、DeepL の用語集を **双方向** で登録する。

- **`100BL-CreationsDB JA-EN`**（JA→EN）: 翻訳の主用途（英訳）。
- **`100BL-CreationsDB EN-JA`**（EN→JA）: 逆引き・海外閲覧者向け応答・添削の相互確認用。

> 文章系フィールド（`Summary` / `BodyBlocks` / `about` / `TransNote` 等）は用語集に含めない（固有名詞対訳ではないため）。抽出スクリプト側でベース名ブロックリスト・文字数・改行で除外している。

---

## 2. スクリプトと npm コマンド

すべて `tools/deepl/` に配置。`.cache/deepl/`（Git 管轄外・再生成可能）へ出力する。

| コマンド | スクリプト | 役割 | API キー |
|---|---|---|---|
| `npm run deepl:build-glossary` | `build-glossary-source.mjs` | 辞書から用語集ソース（TSV / JSON / 衝突ログ）を生成 | 不要 |
| `npm run deepl:sync-glossary` | `sync-glossary.mjs` | DeepL 上の用語集を「同名削除→再作成」で更新し `glossary-ids.json` を更新 | **要** |
| `npm run deepl:eval` | `evaluate-translations.mjs` | 既存 `_EN` を DeepL 機械訳と突き合わせ、`eval-report.md` を出力（**書き換えなし**） | **要** |

`deepl-client.mjs` は DeepL REST API の薄いラッパ（`.env` を自動読込）。

### 生成物（`.cache/deepl/`）

- `glossary_ja-en.tsv` / `glossary_en-ja.tsv` — DeepL 入力用 TSV
- `glossary_source.json` — 出典付きエントリ（レビュー・再現用）
- `glossary-conflicts.md` — 同一ソースに複数訳がある場合の衝突ログ（先勝ち。要正規化箇所の把握）
- `glossary-ids.json` — 登録済み用語集の `glossary_id`
- `eval-report.md` — 英訳突き合わせレポート

---

## 3. 標準ワークフロー

### 3-1. 辞書を更新したら（用語集の作り直し）

```bash
# 1) 辞書 (trans_/ref_/dict_) を編集後、ソースを再生成
npm run deepl:build-glossary

# 2) 衝突ログを確認し、必要なら辞書側を正規化して 1) をやり直す
cat .cache/deepl/glossary-conflicts.md

# 3) DeepL 上の用語集を更新（.env に DEEPL_API_KEY が必要）
npm run deepl:sync-glossary          # --dry-run で対象だけ確認も可
```

> Cowork の DeepL コネクタで用語集を作る場合は API キー不要。TSV の中身（`glossary_ja-en.tsv` 等）を渡して作成し、得た `glossary_id` を `glossary-ids.json` に控える。

### 3-2. 翻訳するとき（必ず用語集を指定）

- **JP → EN（英訳の主用途）**: `target_lang=EN-US`（または `EN-GB`）、`glossary_id` = ja-en の ID。
- **EN → JA（逆引き・海外向け応答）**: `target_lang=JA`、`glossary_id` = en-ja の ID。`formality` は文脈に応じて（DB 説明文は `prefer_more`＝敬体寄り、キャラ台詞は原文の口調に合わせて `default`/`less`）。
- 用語集 ID は `.cache/deepl/glossary-ids.json` を参照。

### 3-3. 既存英訳を点検したいとき（添削補助）

```bash
npm run deepl:eval -- --fields Summary,Character --work Works_NumberTales --limit 25
```

`.cache/deepl/eval-report.md` に「既存 EN」「DeepL 訳」を類似度の低い順で並べる。**乖離＝誤りではない**（文体・意訳の揺れが大半）。採否は人間が判断し、必要な修正は `localization-en-rules.md` の規則（キー順序・上書き条件）に従って手作業で反映する。

---

## 4. ローカル環境設定

1. `.env.example` をコピーして `.env` を作成。
2. `DEEPL_API_KEY` を設定（無料プランのキーは末尾 `:fx`。エンドポイントは自動判定）。
3. `.env` は `.gitignore` 済み（**コミット禁止**）。`sync` / `eval` スクリプトは `.env` を自動読込する（Node 18 でも可）。

```bash
cp .env.example .env
# .env を編集して DEEPL_API_KEY=... を設定
```

---

## 5. 注意・既知の制約

- **DeepL は用語集の部分更新に非対応**。更新は常に「削除→再作成」で `glossary_id` が変わる（`sync-glossary.mjs` が `glossary-ids.json` を書き戻す）。
- **用語集は単語・固有名詞向け**。文単位の訳し分けは保証されない。文体は `formality` と原文側の記法で制御する。
- **方向ごとのエントリ数差**: 表記ゆれの別表記は片方向で重複し得るため、JA→EN と EN→JA でエントリ数が一致しないことがある（先勝ちで吸収）。
- **コネクタ経由とローカル CLI は別経路**: Cowork の DeepL コネクタはアカウント認証済みで API キー不要。ローカル CLI（`sync`/`eval`）は `DEEPL_API_KEY` が必要。

---

## 6. 参照先

| 対象 | 参照先 |
|---|---|
| 和英ローカライズ規則 | [`localization-en-rules.md`](localization-en-rules.md) |
| 和文記法規則 | [`jp-notation-rules.md`](jp-notation-rules.md) |
| 翻訳辞書ソース | `data/Localization/trans_*.json` / `data/References/ref_*.json` / `data/Dictionaries/dict_*.json` |
| スクリプト | `tools/deepl/`（`build-glossary-source` / `sync-glossary` / `evaluate-translations` / `deepl-client`） |
| 作業ログ | `_work_in_progress/2026-06-28_progress_deepl-localization.md` |
