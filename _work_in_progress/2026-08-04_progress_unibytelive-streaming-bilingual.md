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

## 未完了・残タスク

- `lib/section-renders/streamingActivity.js` の `SUMMARY_KEYS`（`StreamingSummary_JP` / `_EN`）は**フィールド名ハードコード**のまま。`#Summary` を含む型で判定する schema 駆動へ寄せられるが、今回はキー名が変わらないため対象外とした（`AGENTS.md`「作業の粒度」に従い、今回触る範囲に限定）。
- `data/db_meta.json` の `CreationWorks.#Works_UnibyteLive.$DetailLayout.basicFields` に、`db_type.json` から削除済みの `Generation` が残っている（`CHANGELOG` 2026-08-03 記載の掃除漏れ。表示上は無視されるだけ）。
- 上記の既存の赤 3 件。

## 参考

- `docs/localization-en-rules.md` §3-9（`value_JP`/`value_EN` の流儀）/ §4-7（UnibyteLive）
- `docs/schema-meta-processing.md` §3.2（`$type` の型一覧）
- `CHANGELOG.md` 2026-07-02「`ChronoizedPurity` を JP/EN 分割から共有フィールドへ修正」
- `CHANGELOG.md` 2026-07-03「bilingual wrapper の UI 列分割表示」
