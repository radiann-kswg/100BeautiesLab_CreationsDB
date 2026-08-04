# ハンカクライブ `StreamingActivity` の和英フィールド整理（2026-08-04）

## 目的

`Works_UnibyteLive` の `StreamingActivity` 配下で、和英の持ち方が 3 流儀混在していたのを整理する。
User からの相談「和英共有がし切れていないフィールドが結構ある気がする。スマートにまとめられるところはないか」への対応。

## 背景・課題

`StreamingActivity` は 1 セクションの中に次の 3 種類が同居していた。

| 子フィールド                   | 変更前の持ち方    |
| ------------------------------ | ----------------- |
| `StreamingCategory_JP` / `_EN` | 並列 2 本立て     |
| `StreamingGreeting`            | bilingual wrapper |
| `ListenerNickname`             | bilingual wrapper |
| `StreamingAwards_JP` / `_EN`   | 並列 2 本立て     |
| `StreamingSummary_JP` / `_EN`  | 並列 2 本立て     |

課題は次の 3 点。

1. **配列の要素対応が保証されない**: JP/EN で別々の配列を持つため、片方だけ更新すると対応がずれる。実際 Z:1（ジグザ）は `StreamingCategory_JP: []` のみで `_EN` キーが存在しなかった。
2. **翻訳補助の対象外**: `tools/deepl/draft-translate.mjs` は「`_EN` が空 かつ 兄弟の JP 値が**文字列**」を候補にするため、配列フィールドは丸ごと下書き対象から外れていた。
3. **ラベルの言語モード欠け**: 並列形は `Field_JP` に `hashTag_JP` だけ・`Field_EN` に `hashTag_EN` だけを持つ（これ自体はグローバル標準どおり）。1 フィールドへまとめれば親に両方を宣言できる。

## 合意した基準（User 判断）

- **配列** → 要素内共有フィールド（`[{ value_JP, value_EN, about_JP, about_EN }]`）。`ChronoizedPurity` / `ConversationPattern.DialogueExamples` と同じ流儀。
- **単一の長文テキスト** → 並列 `Field_JP` / `Field_EN` のまま（グローバル標準の `Summary_JP`/`Summary_EN`・`ConversationPattern.*` と同じ）。
- **単一の対訳ペア** → bilingual wrapper のまま（`ListenerNickname`）。

## 変更点の要約

### schema（`data/Works_UnibyteLive/DataBases/db_type.json`）

| 変更後                        | `$type`                                           | 備考                           |
| ----------------------------- | ------------------------------------------------- | ------------------------------ |
| `StreamingCategory`           | `#String_withAbout[]｜#String_bilingual[]｜#Null` | `_JP`/`_EN` の 2 宣言を 1 つへ |
| `StreamingGreeting`           | `#String_withAbout[]｜#String_bilingual[]｜#Null` | bilingual wrapper から移行     |
| `ListenerNickname`            | （変更なし）                                      | bilingual wrapper 維持         |
| `StreamingAwards`             | `#String[]｜#String_bilingual[]｜#Null`           | `_JP`/`_EN` の 2 宣言を 1 つへ |
| `StreamingSummary_JP` / `_EN` | （変更なし）                                      | 並列維持                       |

- `_bilingual` は既存の `#Dialogue_bilingual[]`（グローバル `DialogueExamples`）に倣った型名。UI は型名ではなく**値の形**で分岐するため、宣言面へ「データの形」を明示する役割。
- union に `#String_withAbout[]` を残しているのは、配列の 1 要素 1 行連結（`formatValueForDisplay()` の `_withAbout` 判定）を維持するため。

### データ（`data/Works_UnibyteLive/DataBases/db_Primary.json`）

- S:2（ナーミィ）: `StreamingCategory` 5 要素・`StreamingGreeting` 1 要素・`StreamingAwards` 2 要素を `value_JP`/`value_EN`（＋ `about_JP`/`about_EN`）形式へ変換。
- Z:1（ジグザ）: `StreamingCategory: []` / `StreamingAwards: []` へリネーム、`StreamingGreeting` を 1 要素の共有形式へ変換。
- キー順は `$DefType` 宣言順のまま（`npm run data:order:check` で `db_Primary.json` 0/35）。

## 影響範囲

- `data/Works_UnibyteLive/DataBases/db_type.json`
- `data/Works_UnibyteLive/DataBases/db_Primary.json`
- `tests/pages.characters.ui-output.test.js`（新規 2 件）
- `tests/bilingual-fields.test.js`（合成フィクスチャのコメント追従のみ）
- `docs/localization-en-rules.md` §4-7 / `docs/schema-meta-processing.md` §3.2
- `CHANGELOG.md`

UI コード（`pages/characters.js` / `lib/section-renders/streamingActivity.js`）は**無改修**。

## 検証

- `npm test`: 59 ファイル / 1073 件中 **1070 件成功**（新規 2 件込み）。
- 残る 3 件は**本変更以前からの既存の赤**（変更前の状態でも同じく落ちることを確認済み）:
  - `tests/data.field-order.test.js` × 2 … `db_PrimaryPerformer.json` のキー順未整列（`CHANGELOG` 2026-08-03 に記録済み。`npm run data:order:write` で解消できるが User のデータ入力作業の範囲として据え置き）。
  - `tests/pages.characters.ui-output.test.js` の Relation 複合インデックステスト × 1 … フィクスチャに使う `N:ギザン` レコードが `RelationTo_PrimaryPerformer` を持たない（`git show HEAD:` で変更前のデータにも無いことを確認）。
- `npm run data:order:check`: `db_Primary.json` は 0/35（差分なし）。
- `npx prettier --check`: JSON 2 ファイルは適合。docs の 2 ファイルは warn になるが、原因は `.gitattributes`（`* text=auto` + `core.autocrlf=true`）由来の CRLF で、追記内容自体は LF 化して確認したところ prettier スタイルに適合（`--write` すると全行が改行コード差分になるため実行していない）。

## 追記: `StreamingActivity` の UI 構成を他 subField へ揃えた（2026-08-04 / sub1 環境）

> 上記の作業とは**別ローカル（sub1）**での後続対応。User から「`StreamingActivity` の UI ラッパーが他の UI よりも浮いて見える」との指摘を受けての追従。

### 課題

`lib/section-renders/streamingActivity.js` は子フィールドを `ラベル: 値` の 1 タグへ詰めた `detail-tag-grid` ＋ `detail-prose` で描画していた。
一方で他の standalone subField（`ConversationPattern` 等の汎用 `structuredObjectSection` / `thisMastersSection` / `appearanceDetailSection`）は
「親ラベルタグ → 子ラベルタグ + 本文ブロックの縦積み」で統一されており、同じ詳細ページ内でこのセクションだけ構成が異なっていた。

### 変更点

- 出力を `div(margin-bottom:10px) > tag(親ラベル) + div(子ブロック群)` ／ 子ブロック `div(margin-bottom:10px) > tag(子ラベル) + 本文` へ変更。
  `pages/characters.js` の `buildObjectChildBlocks()` と同じ DOM 形になり、bilingual wrapper を持たないレコードでは
  汎用 `structuredObjectSection` と**バイト一致**の出力になることを確認（`$display.sectionWrapper` を外した描画結果と比較）。
- `SUMMARY_KEYS`（`StreamingSummary_JP` / `_EN`）のフィールド名ハードコードを削除し、`#Summary` も配列系も `preWrapText()` の同一ルートへ統一。
  → 下記「未完了・残タスク」に挙げていた項目はこれで解消。
- 維持: ページ言語による `_JP` / `_EN` フィルタ、`_enrichment.bilingualWrapperFields` 駆動の JP/EN 2 列表示（`ListenerNickname`）。
  2 列ノードは子ブロックの**本文**として入るため、ラベルの出方も他 subField と揃う。本レンダラー独自の処理はこの 2 列表示だけになった。
- schema（`db_type.json`）・データ（`db_Primary.json`）は無改修。

### 追加対応: 残っていた赤 3 件を現行 DB へ追従（同 sub1 セッション）

User 指示「テストを現行の DB に合わせて対応してほしい」への対応。DB 更新に対するテスト側の追従漏れを解消した。

- **Relation 複合インデックスのフィクスチャ差し替え**: `N:ギザン` は DB 更新で `RelationTo_PrimaryPerformer` を持たなくなり、
  別DB参照セクションが描画されず落ちていた。**`Z:ジグ`** へ差し替え。同レコードは `Relation.Related[0]` が S/2（S:ナーミィ）、
  `RelationTo_PrimaryPerformer.Commented[0]` が S/1 を指すため、「`Alphabet` を落とすと A/2（A:エイリ）へ誤爆する」という
  本テストの検証条件と期待値（`?c=UnibyteLive/Primary/Alphabet:S,AlphaGen:2` / `?c=UnibyteLive/PrimaryPerformer/Alphabet:S,AlphaGen:1`）を
  そのまま満たす。テスト意図は変えていない。
- **`db_PrimaryPerformer.json` のキー順整列**: `npm run data:order:write` を実行。`$DefType` の正準順に対して
  `OwningAvatar_DBLink` と `AnotherRegions_DBLink` が入れ替わっていた **2 レコード（I/2・O/2）だけ**が対象で、値は無変更（並べ替えのみ）。
  他 20 ファイル・1308 レコードは差分ゼロ。`npm run data:order:check` は 0/1310 になった。

### 影響範囲（追記分）

- `lib/section-renders/streamingActivity.js`
- `tests/pages.characters.ui-output.test.js`（ブロック構成の回帰テストを新規 1 件追加／EN モードの期待値を現行データの英訳へ追従／Relation 複合インデックスのフィクスチャを `Z:ジグ` へ差し替え）
- `data/Works_UnibyteLive/DataBases/db_PrimaryPerformer.json`（キー順整列のみ・値は無変更）
- `CHANGELOG.md`

### 検証（追記分）

- `npm test`: 59 ファイル / **1072 件すべて成功**（赤ゼロ）。
- `npm run data:order:check`: 0/1310（全ファイル差分なし）。
- ハンカクライブ全レコードの UI 通し確認: `db_Primary` 35 件 + `db_PrimaryPerformer` 11 件 × 日英 2 言語 = **92 通り**を
  `renderDetail()` へ流し、例外・空セクションが出ないことを確認（`.cache/` の一時スクリプト）。
  ただしこのハーネスは HTTP を提供しないため、クロスDB `_DBLink` のハイドレーション結果までは未検証。
- `npx prettier --check`: 対象 2 ファイルは変更前から warn（`.gitattributes` の CRLF 由来）で、本変更による増減なし。

### 申し送り

- EN モードのテスト期待値を `Main activity, activity within 'Unibyte Universe'` → `Main activity within 'Unibyte Universe'` へ更新した。
  データ側の `about_EN` が現在この文言のため。ただし JP は「メイン活動,「ユニバイト・ユニバース」内での活動」でカンマ区切りの 2 要素であり、
  他の要素（`Main activity, work streaming or individual performer activity` 等）はカンマ区切りを保っている。
  **英訳の揃え方は User 判断**のため、データ本文には手を入れていない。
- `README.LOCAL.md` の `## 作業分担`（2026-08-02 更新）では sub1 の担当は「DB 更新作業」「`addon-ai-tag` へのマージ」。
  本件は UI レンダラーの修正のため担当範囲外だが、User からの直接指示によりこの環境で対応した。`main` は相関図ページ実装中で `pages/` を触るため、
  取り込み時は `lib/section-renders/streamingActivity.js` の競合有無を確認すること。

## 未完了・残タスク

- ~~`lib/section-renders/streamingActivity.js` の `SUMMARY_KEYS`（`StreamingSummary_JP` / `_EN`）は**フィールド名ハードコード**のまま。~~
  → 上記「追記」（2026-08-04 / sub1）で削除済み。`#Summary` も配列系も `preWrapText()` の同一ルートへ統一した。
- ~~既存の赤 3 件（`data.field-order.test.js` × 2 / Relation 複合インデックス × 1）。~~
  → 上記「追加対応」（2026-08-04 / sub1）で解消。`npm test` は赤ゼロ。
- `data/db_meta.json` の `CreationWorks.#Works_UnibyteLive.$DetailLayout.basicFields` に、`db_type.json` から削除済みの `Generation` が残っている（`CHANGELOG` 2026-08-03 記載の掃除漏れ。表示上は無視されるだけなのでテストは通る）。**User 判断待ち**。
- `StreamingCategory.about_EN` の英訳ゆれ: S:ナーミィ の 1 要素だけ `Main activity within 'Unibyte Universe'` で、JP（「メイン活動,「ユニバイト・ユニバース」内での活動」）や他要素（`Main activity, work streaming or ...`）のカンマ区切り 2 要素の形と揃っていない。創作本文なのでデータは無改修、テスト期待値のみ現行データへ追従させた。**User 判断待ち**。

## 参考

- `docs/localization-en-rules.md` §3-9（`value_JP`/`value_EN` の流儀）/ §4-7（UnibyteLive）
- `docs/schema-meta-processing.md` §3.2（`$type` の型一覧）
- `CHANGELOG.md` 2026-07-02「`ChronoizedPurity` を JP/EN 分割から共有フィールドへ修正」
- `CHANGELOG.md` 2026-07-03「bilingual wrapper の UI 列分割表示」
