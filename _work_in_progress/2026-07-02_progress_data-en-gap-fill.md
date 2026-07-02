# data/ 全体の JP→EN 未指定箇所の洗い出しと下書き翻訳

## 目的

`data/` 配下で「JPフィールドはあるがENフィールドが未指定（キー無し/空文字/null）」な箇所を一通り探し、`localize-en-draft` Skill の手順で下書き翻訳を補完する。

## 調査方法

一回限りの調査スクリプト（scratchpad、リポジトリ非コミット）で `data/**/*.json` を再帰走査。対象は「レコード系ファイル」（`db_*.json` / `ref_*.json` / `dict_*.json` / `trans_*.json`）に限定し、`db_meta.json` / `db_type.json`（スキーマ・メタ設定）と `.private/` 配下（`.gitignore` 対象）は除外。

検出パターンは2種類:
- `X_JP`/`X_EN` ペア型（安全・広範囲）
- `Comments`/`Comments_EN`（Relation のみ・localize-en-draft skill の明示スコープ）

**誤検知の除去**: 初回スキャンで `dict_RaceType.json` 等の「素キー＝EN・`_JP`が和名」パターン（`{ "RaceType": "Human", "RaceType_JP": "人間" }` 形式。`extractPairs()` と同じ判定）を誤って `_JP`単独欠落と検知していたため（101件）、`obj[base]` が非空文字列なら EN 既存とみなすよう調整して除外した。

## 結果（16件が真の対象）

| ファイル | 件数 | 内容 |
|---|---|---|
| `data/Works_NumberTales/DataBases/db_Primary.json` | 8 | `ConversationPattern.DialogueExamples` の `value_JP`/`about_JP` 5件・`CodeName_JP`（Num 80/90/99）3件 |
| `data/Works_NumberTales/References/ref_Reference.json` | 1 | `Summary_JP`（ヒューマノイド原則法） |
| `data/Works_PastDivers/DataBases/db_Primary.json` | 7 | `ChronospecStats.ChronoizedPurity_JP`（パーセンテージ範囲の数値文字列のみ） |

## 対応（`localize-en-draft` Skill 経由）

### 完了（9件）

- **`CodeName_EN`**（NumberTales、3件）: `docs/localization-en-rules.md` §3-1 の桁別変換規則（漢数字1桁ずつ→英語数詞、ハイフン連結）で機械的に算出。`SPCodeName_EN`（標準数詞: Eighty 等）と方式が異なる点に注意し、既存の `SPCodeName_EN` と混同していないことを確認済み。
  - `[80]`: `八〇` → `Eight-Zero`
  - `[90]`: `九〇` → `Nine-Zero`
  - `[99]`: `九九` → `Nine-Nine`
- **`Summary_EN`**（NumberTales References、1件）: 同ファイル内の既存 `Summary_EN` パターン（`"Basic reference material on ... '<Title_EN>'."`）に整合させて作成。`BodyBlocks_EN` は既に翻訳済みだったため、既存の英訳スタイル（`ze`/`zir` 含む）と整合性を確認済み。
  - `[2]`: `Basic reference material on the fictional law 'Humanoid Basis Principles Act' in this fictional world.`
- **`ConversationPattern.DialogueExamples` の `value_EN`/`about_EN`**（NumberTales db_Primary、5件）: 各レコードの `GenderType`・`FirstPersonCalling_EN`・既存の対訳固有名詞（`1(Unitta)` 等）を確認したうえで docs/localization-en-rules.md §3-9 に従い下書き。**創作ダイアログの訳出のため、文体・ニュアンスは下書き（要確認）として提示**（詳細は次節）。

### 保留（7件・User確認待ち）

- **`ChronoizedPurity_EN`**（PastDivers db_Primary）: 値がパーセンテージ範囲の数値文字列のみ（例: `91.70-97.11%`）で翻訳判断を要さない内容だが、**この作品の db_Primary.json は全レコードで `ChronoizedPurity_EN` が1件も存在しない**ことが判明。意図的に未着手の可能性があるため、機械的にJP値をそのままコピーしてよいか確認してから対応する（今回は編集を見送り）。

## 下書き翻訳の内容（要確認・創作台詞の訳出のため）

`docs/localization-en-rules.md` §3-9・§1（代名詞）・§3-7（固有名詞引用形式）に従って下書きしたが、口調・ニュアンスは人間による最終確認を推奨する。

1. `[1].ConversationPattern.DialogueExamples[1].value_EN`（2(Twiny)、FemaleNeutral）:
   > "I suppose I'm sort of standing in for '1(Unitta)' and the others — under the NumberTales master-servant contracts, I'm the one who ends up holding the very first number. '1(Unitta)' told me, 'As the original number, I feel like Unit.1 suits being behind the scenes,' though... so because of that too, I feel like I need to be the one holding all the NumberTales together."
2. `[2].ConversationPattern.DialogueExamples[1].value_EN`（3(Treiya)、Neutral／一人称は casual masc.）:
   > "Wanna talk about the new game or something? Seems like the latest entry in a popular series just came out, so I'm a little interested."
3. `[2].ConversationPattern.DialogueExamples[2].value_EN` / `about_EN`（同上）:
   > "Come on, now. It's not great if this makes you too anxious about it, but don't worry — if it crosses a line, I'll stop it." / about: "Easily resolving a problem"
4. `[4].ConversationPattern.DialogueExamples[0].value_EN`（5(Fifa)、FemaleNeutral／一人称は casual）:
   > "Yo! I'm 5(Fifa), NumberTales' Unit.5! Nice to meet ya, starting today!"

## 影響範囲

- `data/Works_NumberTales/DataBases/db_Primary.json`
- `data/Works_NumberTales/References/ref_Reference.json`

## 検証

- JSON構文確認（`node -e "JSON.parse(...)"`）: 両ファイルOK
- `npm test`: 152 passed（既存テストへの影響なし）

## 追記（2026-07-02）: `ChronoizedPurity` はスキーマ修正で解決

`ChronoizedPurity_EN`（PastDivers）について User に確認したところ、「英数字のみの文字列なのに JP/EN 分割の typedef になっているのはおかしいのでは」という指摘があった。調査したところ、同じ `#String|#String_withAbout` 型を使う `BustSize`（`data/db_type.json`）は JP/EN分割せず `hashTag_JP`+`hashTag_EN` 両持ちの単一フィールド + `$display.langMode: "shared"` で定義されており、`ChronoizedPurity` だけが 2026-06-22 の JP/EN 命名標準化作業（`_work_in_progress/2026-06-22_progress_jp-en-naming-standardization.md`）で機械的に `_JP`/`_EN` 分割されていたことが判明（実データは13レコード中 `_EN` が0件）。

**対応**: `BustSize` と同じ「共有フィールド」構成に修正。
- `data/Works_PastDivers/DataBases/db_type.json`: `ChronoizedPurity_JP`/`ChronoizedPurity_EN` の2エントリ → 単一 `ChronoizedPurity`（`hashTag_JP`+`hashTag_EN`両持ち、`$display.langMode: "shared"`）に統合。
- `data/Works_PastDivers/DataBases/db_Primary.json`: `ChronoizedPurity_JP` キーを全13件 `ChronoizedPurity` へリネーム（値は変更なし）。
- 検証: JSON構文確認・`npm test`（152 passed）。

これにより「7件のJP→EN未指定」は**翻訳の問題ではなくスキーマの問題**として解消済み。`lib/section-renders/chronoSpec.js` はスキーマ駆動の汎用レンダラーのため、フィールド名変更に伴うコード修正は不要だった。

## 未完了タスク

- 上記ダイアログ下書き4箇所（NumberTales）の口調・ニュアンス最終確認。

## 参考リンク

- [`.claude/skills/localize-en-draft/SKILL.md`](../.claude/skills/localize-en-draft/SKILL.md)
- [`docs/localization-en-rules.md`](../docs/localization-en-rules.md) §1・§3-1・§3-6・§3-9
