# DeepL 翻訳 運用ガイド（創作 DB ローカライズ）

> **対象**: Claude（Cowork）/ Claude Code / GitHub Copilot / リポジトリ運用者
> **目的**: DeepL 翻訳を 100BeautiesLab. Creations DB のローカライズ運用に組み込み、固有名詞をブレなく訳すための手順とルールを定義する
> **最終更新**: 2026-07-02（§8 併記形の分割・単数/複数の扱いを追加）
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
| `npm run deepl:draft` | `draft-translate.mjs` | 空の `_EN` をキャラ文脈（GenderType・呼称）付きで下書き翻訳、`draft-report.md` を出力（`--apply` 時のみ警告無し候補を書き戻し） | **要** |

`deepl-client.mjs` は DeepL REST API の薄いラッパ（`.env` を自動読込）。`pronoun-normalize.mjs` は代名詞正規化・警告検知の純粋関数群（`draft-translate.mjs` から利用、ネットワーク I/O なし）。

### 2-1. Python 版（`tools/deepl_py/`）

`draft-translate.mjs` 相当の下書き翻訳は、外部ライブラリ非依存の Python 実装としても提供している（Node 環境が無い開発機や、外部リポジトリから Python で使いたい場合向け）。

```sh
python tools/deepl_py/draft_translate.py --work Works_NumberTales [--db Primary] \
  [--id 8] [--under ConversationPattern] [--field Summary] [--limit 30] [--apply]
```

- CLI オプション・`.cache/deepl/draft-report.md` の出力形式は Node 版と共通（`--field` はトップレベルの `field_EN` 名で絞り込み。例: `--field Summary` → `Summary_EN` のみ対象。Node 版にも同時追加済み）。
- 用語集の作成・同期（`build-glossary-source` / `sync-glossary`）は Node 版に一元化し、Python 側は生成済みの `.cache/deepl/glossary-ids.json` を読むだけ（二重管理を避けるため、Python 版に用語集作成コマンドは無い）。
- 詳細・トラブルシューティング・Node 版との対応表: [`tools/deepl_py/README.md`](../tools/deepl_py/README.md)

### 2-2. `field_EN` キーが未追加のとき（Claude 自身が翻訳する Skill）

Node 版・Python 版のいずれも「**既存の `field_EN` キーが空値のときだけ**」を対象にし、スキーマに無い新規キーは追加しない。まだ一度も `_EN` フィールドが書かれていないレコード（新規キー挿入が必要なケース）は、Claude Code / Cowork のセッション内で Skill **`localize-en-draft`**（[`.claude/skills/localize-en-draft/SKILL.md`](../.claude/skills/localize-en-draft/SKILL.md)）を使う。DeepL の MCP コネクタは対話セッション専用のツールでスクリプトから呼び出せないため、「Claude 自身が本書のルールに従って翻訳し、キー順序を守って挿入する」運用をこの Skill として型化している。

### 生成物（`.cache/deepl/`）

- `glossary_ja-en.tsv` / `glossary_en-ja.tsv` — DeepL 入力用 TSV
- `glossary_source.json` — 出典付きエントリ（レビュー・再現用）
- `glossary-conflicts.md` — 同一ソースに複数訳がある場合の衝突ログ（先勝ち。要正規化箇所の把握）
- `glossary-ids.json` — 登録済み用語集の `glossary_id`
- `eval-report.md` — 英訳突き合わせレポート
- `draft-report.md` — 下書き英訳レポート（`deepl:draft` 出力。JP/DeepL生訳/正規化後候補/⚠警告）

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

### 3-4. キャラ文脈（GenderType・呼称）を踏まえた下書き翻訳をしたいとき

空の `*_EN` フィールドを DeepL で下書き翻訳するとき、DeepL は素の状態だと代名詞を `he` や一人称 `I` で返しがちで、そのキャラ自身の既存フィールド（`GenderType` / `ForMasterCalling_EN` 等）と食い違うことがある。`draft-translate.mjs` はこれを補正する。

```bash
npm run deepl:draft -- --work Works_NumberTales --db Primary --id 8 --under ConversationPattern
# 警告（⚠️）が無い候補だけ、実際に空の _EN へ書き戻す場合
npm run deepl:draft -- --work Works_NumberTales --db Primary --id 8 --under ConversationPattern --apply
```

Python 版（Node 環境が無い場合／外部リポジトリから使う場合。オプション・出力は共通。詳細は [`tools/deepl_py/README.md`](../tools/deepl_py/README.md)）:

```bash
python tools/deepl_py/draft_translate.py --work Works_NumberTales --db Primary --id 8 --under ConversationPattern --apply
```

- **`--work`**（必須） `--db`（省略時は作品内の全 `db_*.json`） `--id`（`Num` 等でレコードを1件に絞る） `--under`（例: `ConversationPattern` でサブツリー限定） `--field`（例: `Summary` でトップレベルの `field_EN` 名だけに絞り込み） `--limit`（既定 30 件）
- **代名詞の確定的正規化**: レコードの `GenderType` から代名詞ポリシー（she/he/ze/avoid）を決定し、`docs/localization-en-rules.md` §1 のルール通りに DeepL の生訳文を機械的に書き換える（`ze/zir` 活用表含む）。DeepL は LLM ではなく NMT のため、「she で訳して」という指示は信頼できない — この正規化が実質的な正しさの担保になる。
- **一人称混入・呼称不一致は検知のみ**: `I/my/me` 等の一人称が残っていないか、`ForMasterCalling_EN` に無い呼称語（`big bro/sis` 等）が紛れ込んでいないかを検知するが、**自動では書き換えない**（文法崩壊やレコード固有の誤爆を避けるため）。⚠️ 付きでレポートに出るので人間が確認する。
- **既定ではデータを書き換えない**: `.cache/deepl/draft-report.md` にレポートを出力するだけ。`--apply` を付けたときのみ、**警告が一つも無い候補だけ** を対象レコードの空 `_EN` へ書き戻す。警告付き候補は `--apply` 指定時も常にレポート止まり。
- スキーマに無いキーを新規追加することはない（`db_type.json` に既に定義され、値が空の `_EN` キーのみを対象にする）。

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
| スクリプト（Node） | `tools/deepl/`（`build-glossary-source` / `sync-glossary` / `evaluate-translations` / `draft-translate` / `deepl-client`） |
| スクリプト（Python） | [`tools/deepl_py/`](../tools/deepl_py/README.md)（`draft_translate.py` / `deepl_client.py` / `pronoun_normalize.py`） |
| Claude Skill（`field_EN` 新規挿入・少数レコードの丁寧な翻訳） | [`.claude/skills/localize-en-draft/SKILL.md`](../.claude/skills/localize-en-draft/SKILL.md) |
| Copilot 英訳補助指示 | [`.github/instructions/localization-en.instructions.md`](../.github/instructions/localization-en.instructions.md) |
| 固有名詞 早見表（生成物） | [`localization-glossary-quickref.md`](localization-glossary-quickref.md)（`npm run deepl:build-quickref`） |
| 作業ログ | `_work_in_progress/2026-06-28_progress_deepl-localization.md` |

---

## 7. 読み仮名グロスの正規化（`漢字(かな)`）

同じ概念が、辞書によって **読み仮名併記形**（`算象(アリスマ)諸国`）と **素形**（`算象諸国`）の 2 通りで記録されることがある（リッチ表示系の `trans_*` / `dict_*` と、資料系 `ref_*` の差など）。両者は同じ EN（`Alismathians`）に対応するため、素朴に集約すると **EN→JA で訳先が一意に定まらず衝突**する。

`build-glossary-source.mjs` はこれを構造的に吸収する（`stripReadingGloss`）。

- **検出対象**: 「**漢字の直後**に来る、**かなのみ**の丸括弧」だけを読みグロスとみなす（全角/半角括弧対応）。
  - 剥がす: `算象(アリスマ)諸国` → `算象諸国` / `海陸国(シーバイランド)諸島` → `海陸国諸島`
  - 剥がさない（誤爆防止）: `(後天的)` `(拡張装備あり)` `(時空遷移者)` など**中身に漢字を含む修飾括弧**、漢字以外（カタカナ・英字）に続く括弧。
- **EN→JA**: 訳先 JP は常に **素形**（グロス除去後）を採用する。「併記形 vs 素形」だけの差は衝突として扱わない。読みは `Term_JPReading` から復元できる。
- **JA→EN**: グロスを剥いた素形も**自動的にソースへ追加**する。DB 本文が素形・併記形どちらで出ても英訳が効く（マッチ網羅の拡張）。
- **真の衝突だけ残す**: 素形にしても EN が食い違う場合（例: `南雌大陸` に `Evesouth Mainland` と `Ivesouth Continent` の 2 訳）は本物の表記不一致として `glossary-conflicts.md` に残す。和文側の正規化は User が判断する。

> この正規化により、読みを振った地名・組織が増えても EN→JA 衝突が自然増殖しない。新しい固有名詞に読みグロスを付けるときは、`Term_JPReading`（資料系）か併記形（表示系）のどちらで持っても、用語集側は素形に正規化される。

---

## 8. 併記形（`略号 / 全文`）の分割と単数/複数の扱い

### 8-1. `略号 / 全文` の自動分割（`splitMultiForm`）

`Term_EN` に `"WDCE. / the \"World Development & Creation Era\""` のように**略号と全文を1つの文字列で併記**しているエントリがある（`ref_Society.json` の世代呼称など）。これをそのまま用語集ソースへ渡すと、EN→JA では「同じ結合文字列」がキーになり、`Term_JP` 由来のペアと `Aliases` 由来のペアが衝突してしまう。

`build-glossary-source.mjs` の `splitMultiForm()` がこれを構造的に吸収する。

- **区切り**: 前後に空白を伴う `/`（` / `）または改行。`Demotion/Retrograde` のような複合語中のスラッシュ（前後に空白が無い）は分割しない（誤爆防止）。
- **JA→EN**: 分割した**先頭の断片**（本文中で実際に多用される略号・優先表記）を訳語として採用する。例: `創世期` → `WDCE.`（`the "World Development & Creation Era"` ではなく）。
- **EN→JA**: 分割した**すべての断片**を個別のソースキーとして登録する。略号（`WDCE.`）・全文（`the "World Development & Creation Era"`）のどちらが本文中に出現しても同じ JP 用語へ解決できる。
- 併記の順序（どちらを先に書くか）が JA→EN の訳語選定に直結するため、新規に併記形を追加するときは**実際の英文中で優先的に使われる表記を先頭**に置く。

### 8-2. 単数形/複数形だけの差は用語集へ登録しない

日本語（JP側）は文法上の数（単数/複数）を持たないため、同じ JP 用語が英語側で単数形・複数形の両方を持ちうる（例: `創造主` → 個体を指す `Regiowner` / 集団・派生存在を指す `Regiowners`）。これは表記ゆれではなく**文脈依存の正しい使い分け**であり、用語集でどちらか一方に固定すると逆の文脈で誤訳を生む。

`buildJaEnMap()` の `isPluralPair()` がこのパターン（片方が `${他方}s` と一致）を検出した場合、その JA→EN エントリは**用語集へ登録せず**、`glossary-conflicts.md` に `[文法差につき用語集登録なし]` として候補を併記するだけに留める。EN→JA 側は `Regiowner`/`Regiowners` が別々のキーのため元々衝突せず、両方とも `創造主` へ正しく解決される。

> 該当語を実際に翻訳するときは、単数/複数どちらの文脈かを人間が判断して個別に訳語を選ぶ（用語集に頼らない）。

### 8-3. 正式名（Term_JP）vs 通称（Aliases）だけの差も用語集へ登録しない

`ref_Society.json` の世代呼称のように、1つの概念に**正式名**（`Term_JP`、例: `『第7の世界創造』`）と**通称・略称**（`Aliases`、例: `多様化社会`）の両方が存在するケースがある。EN側は `splitMultiForm`（§8-1）で `WDC.VII` / `the "World Development & Creation VII"` の2断片に分かれるが、どちらの断片であっても EN→JA では「正式名 vs 通称」のどちらへ解決すべきかは**文章の性質次第**で決まる。

- **冗長な説明文中で使う場合**: 通称・略称寄り（例: `多様化社会`）
- **該当語自体を定義・説明する文で使う場合**: 正式名寄り（例: `『第7の世界創造』`）

これも単数/複数の差（§8-2）と同様に**用語集の単一キーには機械的に固定できない**ため、`buildEnJaMap()` は `Term_JP` 由来のペアと `Aliases` 由来のペアが同一 EN キーで衝突した場合、どちらか一方を強制的に採用せず**登録を見送る**（`registerDependent`）。`glossary-conflicts.md` に `[文脈依存につき用語集登録なし]` として両論併記されるので、実際に EN→JA 訳出（添削・逆引き）するときは、上記の使い分けルールに沿って人間が個別に訳語を選ぶ。

> JA→EN 方向は影響を受けない: `『第7の世界創造』`・`多様化社会` はいずれも JP側では異なるキーなので、どちらを訳しても同じ EN（`WDC.VII` 系）に解決できる。問題になるのは EN→JA（1つのEN文字列→1つのJP）の一方向のみ。
