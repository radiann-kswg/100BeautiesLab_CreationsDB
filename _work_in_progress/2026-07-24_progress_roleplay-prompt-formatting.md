# ロールプレイプロンプト生成の体裁修正（余分な改行 / 複数名の鉤括弧表記）

- 日付: 2026-07-24
- ブランチ: `develop`（本体ローカル）
- 関連: `docs/roleplay-prompt-generation.md` / `CHANGELOG.md`（2026-07-24 エントリ）

## 目的

User 要望 2 件への対応。

1. 生成時に改行が冗長に入るのを直す
2. 複数の名前エイリアスを `87(ヤシナ) または 87(ハナ)` ではなく `「87(ヤシナ)」または「87(ハナ)」` にする

## 背景・調査（原因は 3 つ）

直近生成の 24 / 50 / 78 / 87 を実データで再現し、既存生成物と現行生成の差分から切り分けた。

| 症状 | 原因 |
| --- | --- |
| セクション間に空行が 2 つ入る | `finalizeText()` の畳み込みが LF 前提の正規表現で、CRLF のテンプレ／既存ファイルに一致していなかった |
| `- )。` という壊れた箇条書き行 | `sentences` フィルタが `split('。')` で、括弧内で完結する補足文の閉じ括弧だけが次の文へ落ちていた |
| 省略フィールドの跡に空行が残る | 同上（CRLF）。空 `- ` 行自体は除去されるが、その跡の空行を詰める正規表現が効いていなかった |

CRLF になるのは `.gitattributes` の `* text=auto` ＋ `core.autocrlf=true` によるチェックアウト変換のため。
副次的に、既存（CRLF）と生成物（LF）の比較が改行コード差だけで全セクション `updated` 判定になっていた
（`plan` が毎回「全節更新」を報告する状態）。

## 変更点の要約

- `tools/roleplay/render.mjs`
  - `normalizeEol()` 新設。`renderTemplate()` / `finalizeText()` / `applyFilter()` の入口で LF へ正規化
  - `splitSentences()` 新設。括弧の深度を数え、括弧内の句点・「。）」では文を切らない
  - フィルタ `orquote` / `altquote` を追加（名の間だけを `」または「` で繋ぐ。外側の `「` `」` はテンプレが持つ）
- `tools/roleplay/sections.mjs` — `splitSections()` / `normalizeBlock()` を LF 正規化。CRLF 既存との比較を正常化
- `tools/build-roleplay-prompts.mjs` — 名前系合成変数を `orquote` / `altquote` へ切替（読みは `orjoin` のまま）。
  変更判定を LF へ揃えてから比較（CRLF ワークツリーで毎回「更新あり」にならないように）
- `data/Works_NumberTales/RoleplayPrompts/roleplay-prompt.tpl.md` — `altnames` → `altquote` / `orjoin` → `orquote`

## 影響範囲（編集したファイル）

- 実装: `tools/roleplay/render.mjs`, `tools/roleplay/sections.mjs`, `tools/build-roleplay-prompts.mjs`
- テンプレ: `data/Works_NumberTales/RoleplayPrompts/roleplay-prompt.tpl.md`
- 生成物 10 件:
  - `--force` 再生成（見出しが変わるため）: NumberTales `35` / `61` / `85` / `87` / `3x11`、DestinyFoxRecords Proxy `3`
  - 通常マージ更新: NumberTales `24` / `50` / `78` / `100`
- テスト: `tests/roleplay-render.test.js`, `tests/roleplay-sections.test.js`
- ドキュメント: `docs/roleplay-prompt-generation.md`, `CHANGELOG.md`

## 検証

- `npm test`（Vitest）42 ファイル / 582 件すべて成功
- `node tools/build-roleplay-prompts.mjs --check` → `changed=0 unchanged=57`（冪等）
- `--force` 対象 6 件は事前に見出し一覧を確認し、手書き独自見出しが無いことを確認済み

## 未完了タスク（User 判断待ち）

今回の調査中に見つけた別系統の体裁くずれ。**要望の範囲外のため未修正**。

1. **句点の二重化**: `Character_JP` が「。」で終わるとテンプレの `{{Character_JP | commas}}。` と重なり
   `…接しやすい。。` になる（例: NumberTales `100`）。`commas` 側で末尾句点を落とす案が有力。
2. **`Weakness_JP` 欠落時の文断裂**: テンプレの
   `{{#Strength_JP}}- {{Strength_JP | commas}}である一方、{{#Weakness_JP}}…{{/Weakness_JP}}{{/Strength_JP}}`
   は Weakness が空だと `- …ことである一方、` で終わる（例: NumberTales `100`）。`{{^Weakness_JP}}` 分岐で
   言い切る形にするか、テンプレ構造を見直すか。
3. **`{value, about}` 形式が `[object Object]` になる**: `Height_cm` / `Weight_kg` が object 値のとき、
   テンプレから `{{Height_cm}}` で直接参照しているためアンラップされない（例: DestinyFoxRecords Proxy `3` の
   `身長[object Object]cm・体重[object Object]kg`）。~~`@Age` は `buildVars()` 側でアンラップ済み。~~
   `resolvePath()` に共通のアンラップを入れるのが筋だが、全フィールドへ効くため影響確認が要る。
   **本件は今回の変更以前から存在**（差分でも `[object Object]` は変わっていない）。

いずれも創作本文には踏み込まない機械的な整形の話だが、文面が変わるため User 確認のうえで着手する。

---

## 追記（2026-07-25 棚卸し）: 生成物の実測と、記述の訂正

棚卸しにあたり「User 判断待ち」3 件が**実際に生成物へ出ているか**を全 66 件で走査した。

### 3.（`[object Object]`）— 影響は想定より広く、記述に誤りがあった

| 項目 | 実測 |
| --- | --- |
| `[object Object]` を含む生成物 | **66 件中 10 件**（約 15%） |
| 内訳 | `体重[object Object]` **7 件** / `年齢は[object Object]` **3 件** / `身長[object Object]` **1 件** |
| 該当ファイル | NumberTales `8` / `15` / `25` / `37` / `52` / `56` / `61` / `96` / `97`、DestinyFoxRecords Proxy `3` |

**訂正**: 本ログは「`@Age` は `buildVars()` 側でアンラップ済み」と書いていたが、**これは誤り**。
`61` / `96` / `97` の 3 件は `設定年齢は[object Object]歳です。` になっており、`@Age` も同じ症状が出ている。
`15` は `体重[object Object], [object Object]kg` と配列 × object の二重化まで起きている。

**影響度の見直し**: `RoleplayPrompts/` の生成物は**配布用の成果物**であり、体裁くずれがそのまま外部へ渡る。
「User 判断待ち」の据え置きではなく、**修正を優先すべき項目**として母艦 P4-9 へ登録した。
（文面が変わるため、着手時に User 確認を取る点は変わらない。）

### 1. / 2.（句点の二重化・文断裂）— 現存を確認、影響は 1 ファイル

- 実測: いずれも `data/Works_NumberTales/RoleplayPrompts/DB_SemiPrimary/roleplay-prompt-100.md` の
  21 行目・22 行目に**現存**（`…接しやすい。。` / `…決して見放さないことである一方、`）。
- 他 65 件では再現せず、現時点の影響は**この 1 ファイルのみ**。
- 本ログ本文の「例: NumberTales `100`」は `DB_Primary` ではなく **`DB_SemiPrimary`** 配下（探すときの注意点）。

### 補足

- `node tools/build-roleplay-prompts.mjs --check` は `changed=0 unchanged=57` の冪等状態を維持しており、
  上記 3 件は**再生成では直らない**（テンプレ／`render.mjs` 側の修正が要る）。
