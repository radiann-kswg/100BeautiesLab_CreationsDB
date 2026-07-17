# AIHints 対象拡張: NumberTales `DB_SemiPrimary` / `DB_SelfSecondary`（基盤整備）

> ブランチ: `addon-ai-tag`（AIHints は `develop` に含めない運用）／ 2026-07-17

## 目的

User から「`DB_SemiPrimary` と `DB_SelfSecondary`（いずれも User 自身が作者）も AI 学習の対象にしたい。
まだ `AppearanceDetail` の実装が追い付いていないが、事前準備はできるようにしたい」という要件。

**本ラウンドのスコープは基盤整備のみ。AIHints の実データは 1 件も投入しない**（seed は `AppearanceDetail` が揃ってから）。
`AppearanceDetail` が揃った時点でコマンド一発で seed できる状態にすることがゴール。

## 調査の結論: 拡張のためのコード追加はほぼ不要で、実体は既存バグの修正だった

- **パイプラインは変更ゼロ**: `migrate-aihints.mjs` は config 駆動（`CreationWorks` → 作品別 `db_meta.json` の `Databases` を走査、`DB_Hidden` のみ除外、あとは「レコードが `AIHints` を持つか」だけ）。`CONVENTIONAL_FILES` に両 DB は既に記載済み。`worker.js` / `cf-api-sync.yml` / `d1-aihints.sql` も編集不要。
- **スキーマも変更ゼロ**: `AppearanceDetail` / `ColorPalette` / `AIHints` はグローバル `data/db_type.json` の `$DefType` 宣言。`$Def_AIHints` 一式は作品別 `db_type.json` の `$VersDef` = **作品単位**（DB 単位ではない）。両 DB は宣言上すでに射程内。
- **`SemiPrimary` は着手前から動いていた**（`_Secondaries` を持たず `AI_Optout: false`）。
- **`SelfSecondary` は既存バグで壊れていた**（下記 1.）。

### 実測ベースライン（着手前 dry-run）

```
Primary        default : patched=3, skipped-existing=92, skipped-no-image=10
SemiPrimary    default : patched=9, skipped-no-image=43
SelfSecondary  default : patched=5, skipped-ai-optout=96, skipped-no-image=5   ← バグの現物
SelfSecondary  --force-ai-optout : patched=7, skipped-no-image=99
```

## 変更点の要約

### 1. `_Secondaries` の opt-out 判定バグ（本命）

`tools/patch-aihints.mjs` は opt-out を `sec_SeriesTitle` のみをキーにした Map で保持していた。
`#DB_SelfSecondary._Secondaries` は 3 定義中 **2 つが `sec_SeriesTitle: null`**（「リクエストナンバー」= `AI_Optout: false` と catch-all = `true`）。
ループが opt-in を読み飛ばした後 catch-all が既定 opt-out を立てるため、**`sec_SeriesTitle` が null の 96 件が全て弾かれていた**
（明示的に opt-in の `#223-jw` / `#753` を含む）。

- `lib/sw-common.js`（正）/ `pkg/nodejs/index.mjs:335` の 3 軸マッチャを `findSecondaryDef()` として移植（export）。
  **返すのは `_Commons` ではなく定義そのもの** — `AI_Optout` と `_Commons` を 1 回の解決から取るため。
- あわせて `applyCommonsToRecord()` を追加し `_Commons` 継承を適用（`GenderType: "Neutral"` 等が AIHints 生成の入力に効く）。
  継承値は DB へ書き戻さない（書き戻しは openIdx/closeIdx のテキスト操作のため構造上あり得ない）。

**移植を選んだ理由**（`pkg/nodejs` から import しない）:

| 案 | 判定 |
| --- | --- |
| `pkg/nodejs/index.mjs` から import | 却下。`findSecondaryCommons` は `applyCommonsToRecords` 内のクロージャで未 export。export 化は `pkg` の公開 API を広げ python/csharp との三言語パリティを崩す。**さらに決定的に `pkg/nodejs/index.mjs` は `develop` 所有ファイル**で、逆マージ禁止のため `addon-ai-tag` で改修すると永久分岐しマージのたびに衝突する |
| `lib/sw-common.js` から import | 却下。classic script（`self` グローバル前提）で ESM CLI からは `vm` 経由でしか読めない |
| **`tools/patch-aihints.mjs` 内へ移植 + export** | **採用**。同ファイルの `loadMergedVarsDef`（`lib/section-renders/appearanceDetail.js` からの移植）が同じ前例。`develop` 所有ファイルを 1 本も触らない |

> **手動同期が必要**: `_Secondaries` マッチャの正は `lib/sw-common.js`。移植先は `pkg/nodejs/index.mjs` と
> `tools/patch-aihints.mjs` の 2 つになった。正の仕様変更時は両方へ反映すること。

### 2. `AI_Optout` を「権利軸」へ純化（意味論の分離）

User の説明:

> `DB_SelfSecondary` は原則として自分が自分で二次創作しているものだけ入れているから **AIオプトアウトそのものはいらない**のだけど、
> **キャラデザ未着手のキャラクターを除外する意図**があって `AI_Optout: true` にしていた。

`docs/api-sw-spec.md` §5.5 は `AI_Optout` を「AI 学習・LLM 取り込みへの opt-out **表明**」（外部スクレイパー向けシグナル含む）と定義済み。
User 自身の創作物 94 件に `true` が立っている状態は**仕様に反する誤った対外宣言**にあたる。
→ **仕様変更ではなくデータを仕様へ合わせる修正**として `false` へ倒し、失う意味論をコードで受け止める。

| 軸 | 意味 | 実装 |
| --- | --- | --- |
| `AI_Optout` | 権利上の**付与不可** | DB レベルは exit 2 / カテゴリ単位はレコードスキップ（`--force-ai-optout`） |
| `Progress: notProceeded` | 未着手のため**付与不要** | 新設 `skipped-progress-notproceeded` の soft skip（`--include-not-proceeded`） |
| 画像なし | 生成の材料が無い | 既存 `skipped-no-image` |

- **フリップは出力を変えない**（実測）: `notProceeded` ∩ 画像あり = **0 件（3 DB とも）**。
  `patched=7` のまま、除外理由が「権利」から「データなし」へ移るのみ。
- **Progress ゲートは今日 no-op だが将来の保険**: 未完成レコードに WIP 画像が 1 枚置かれた瞬間、
  現状のガード（画像ゲート）は無音で消える。その日から本ゲートが仕事を始める。
- **soft skip であって exit 2 ではない**: `docs/ai-hints-usage.md` は「付与不要」と「付与不可」を書き分けている。
  hard refusal にすると `aihints-structural-resync.yml` のループが `set -e` 下でワークフローごと落ちる。
- **配置は画像ゲートの後段**: 前段に置くと既存 `skipped-no-image` が移動して集計が変わり、no-op 証明が濁る。
- `stillTentative` はガードしない（Primary に正当な AIHints 保持レコードが 1 件ある）。

**副作用としての意味論決定**: `ai-hints-usage.md` の「画像あり → 付与必須」と「notProceeded → 付与不要」は
`notProceeded` かつ画像ありのレコードで矛盾する。該当 0 件だが、本ゲートは**後者を優先**すると決めた。

### 3. Class 辞書の合流

`CLASS_NAMES_EN`（29 件・Primary スコープ）に無いクラス名を raw の日本語のまま `identity_tags` へ素通ししていた
（未マップ: SemiPrimary 31/40 / SelfSecondary 36/39）。

- `loadMergedClassDictEN(work)` を追加。各 `db_meta.json` の `Dictionaries` 宣言から `keyField: "Class"` を導出し
  （ファイル名はハードコードしない）、グローバル 5 本 + 作品ローカル 2 本 = **88 対訳**を合流 → **3 DB とも未解決 0 件**。
- 優先順は **① `CLASS_NAMES_EN` → ② 辞書の `Class_EN` → ③ `TODO:`**。未対訳は日本語を漏らさず TODO 化。
- **★ ハードコードが優先（辞書で置き換えてはいけない）**:
  - 両者はレジスタが異なり **29 件中 28 件で値が違う**（`'uni-digits class'` = AI タグ vs `"Uni-Digits"` = 表示名）。辞書優先にすると Primary の `identity_tags` が総書き換え。
  - `営業補助用個体` は**ハードコードにしか無い** → 辞書は superset ではない。
- `scopeField`（`#Dict_Triples` の `isTriple` 等）はラベル引きに適用しない。全 7 辞書 88 対訳で
  ユニーク Class 88 件・**値の衝突 0 件**を実測しており、スコープ無しで一意に引けるため。
- **User の対訳入力は不要だった**: `ベヴストザイン課 ヒューマノイド開発部` は
  グローバル `data/Dictionaries/dict_SymphonyXVI.json` に既訳あり（参照は生成ではない）。

### 4. Num ソートの NaN 修正

`(a, b) => a.num - b.num` は string Num を含むと NaN でソートが成立しない（実質ファイル順のまま出力されていた）。
`compareNums()` を追加し **3 箇所**（結果サマリ / `--records` 表示 / vision tasks）へ適用。number 同士では `a - b` と恒等。
`--records` 表示の重複（`parseRecordSpec` が純整数を Number/String 両形で Set に入れる仕様に由来）も解消。

> **計画時の想定が 1 つ外れた**: 「Primary は全部 number だから出力順は不変」としていたが、
> Primary にも `"0"` / `"00"` / `"2-alt"` / `"67-old"` 等の string Num があり、**ソートは Primary でも壊れていた**。
> 本修正で Primary の表示順も直る（集計・レコード→status の割り当ては不変）。

### 5. `migrate-aihints.mjs` の多層防御

DB レベル `AI_Optout: true` を D1 投入時に遮断。
**per-record の `_Secondaries` 判定は未対応 → 下記「未完了タスク」へ**。

### 6. 併せて修正した既存バグ（CLI 実行ガード）

`patch-aihints.mjs` の末尾ガードが `process.argv[1]` 未定義時に throw し、かつ `basename('')` により
`endsWith('')` が常に true となって **import しただけで `main()` が走り得た**。実行パスを先に取り出して空なら CLI 実行でないと判定するよう修正。

### 7. データ修正

`db_SemiPrimary.json` の `"Progress": "notProseed"` 2 件（**レコード `Num: "%"` / `Num: "∞"` の `Progress` フィールド**。`$EnumDef_Progress` 未定義の不正値）を `notProceeded` へ。
`Num` の値（`"%"` / `"∞"` = `#String` 型の正当な採番）は**一切変更していない**。

`tests/data.shape.test.js` に enum ガードを **2 本**追加した。
**正規値に `"accepted\nnowRemaking"` / `"accepted\nremadeReleased"` という改行複合値が 2 件あるため、`\n` で分割せず完全一致で判定すること**（分割すると偽陽性が 8 件出る）。

1. **レコード側**: 全作品の `db_*.json` を走査（21 ファイル / 1285 レコード）。`Progress` 未設定は `_Commons` 継承の正当な形なので対象外。
2. **メタ側（`_Commons.Progress`）**: 全作品の `db_meta.json` を**再帰走査**（16 箇所）。
   `#DB_UnprocessedSecondary` が `#DB_Secondary` の中に入れ子になっている（＝キー構造を決め打ちすると見えない）ため、
   構造を仮定せず `_Commons` を再帰的に拾う。**この入れ子こそが下記 `NotProcessed` が長く見逃されていた理由**。

### 関連: `#DB_UnprocessedSecondary._Commons.Progress`（User 対応済み・解決）

`$EnumDef_Progress` 未登録の `"NotProcessed"`（先頭大文字）が残っていた。**2 段階で User が修正**:

- `b37691a` … `"NotProcessed"` → `"notProcessed"`（先頭小文字化）。ただし `notProcessed` も enum 未登録のままだった
- `29dca9e` … `"notProcessed"` → `"notProceeded"`（**採用**: enum 登録済みの語彙へ統一）

判断の根拠として提示した実測: `db_UnprocessedSecondary.json` の **795 件は全て明示的に `notProceeded` を持ち、この `_Commons` 既定値を継承するレコードは 0 件**だった
（＝既定値は一度も適用されておらず、実データは全て「未着手」。`notProcessed`〈未整理〉という別語を新設するより、実データへ揃える方が整合する）。
上記メタ側ガードで今後は検知できる（差し戻して赤くなることを確認済み）。

> なお本ログの初版および User への報告で、この値の所在を `data/db_meta.json:227` と記載していたが**誤り**。
> 正しくは `data/Works_NumberTales/DataBases/db_meta.json`（作品別・`#DB_Secondary` 内に入れ子）。
> 調査エージェントの報告をそのまま採用し、パスの裏を取らずに伝えてしまった。

> `db_SelfSecondary.json:740` の `notProseeded` も User が別途修正済み（`3549ba0`）。

### 8. 曖昧レコード Num 223 は変更しない

`sec_DesignedBy: ["RadianN"]` のみを持ち他が null。3 軸マッチャは追加改修なしで **catch-all へ落とす**（正しい挙動）:
「リクエストナンバー」定義は `sec_SeriesTitle` が無いため `sec_Category` / `sec_DesignedBy` が**必須一致に昇格**し、
レコード側 `sec_Category` が空で棄却。「量産型マスタートリプル」定義は primary 必須一致で棄却。
**`sec_DesignedBy` 単独で吸わせる特別扱いは入れてはいけない**（`sec_Category` の必須一致セマンティクスを壊す）。
挙動は回帰テストで固定し、データは触らない（作者の意図を推測することになるため）。

## 影響範囲（編集ファイル）

- `tools/patch-aihints.mjs`（マッチャ移植 / `_Commons` 継承 / Class 辞書 / Progress ゲート / `compareNums` / CLI ガード修正 / JSDoc / `--help`）
- `pkg/cloudflare/scripts/migrate-aihints.mjs`（DB レベル `AI_Optout` 遮断）
- `data/Works_NumberTales/DataBases/db_meta.json`（catch-all `AI_Optout` を `false` へ / `#DB_SelfSecondary` に DB レベル `AI_Optout: false` を明示追加）
- `data/Works_NumberTales/DataBases/db_SemiPrimary.json`（`notProseed` 2 件）
- `tests/data.shape.test.js`（Progress enum ガード）
- **新規**: `tests/patch-aihints.secondaries.test.js` / `.classdict.test.js` / `.gates.test.js` / `.numsort.test.js`
- `docs/api-sw-spec.md` / `docs/ai-hints-usage.md` / `docs/aihints-spec.md` / `docs/schema-meta-processing.md`
- `.github/copilot-instructions.md` / `.github/prompts/aihints-fill.prompt.md` / `.github/workflows/aihints-structural-resync.yml`
- `CHANGELOG.md`

**`data/Works_NumberTales/DataBases/db_Primary.json` は 1 バイトも変更していない。**

## 検証

### Primary 無影響の証明（最重要制約）— 「到達不能」を示す

1. **`_Commons` 継承**: ツールが読むフィールド（Images / Num / GenderType / ConceptAge / TailsUnit / Character / AppearanceDetail / Class / ColorPalette）と
   `#DB_Primary._Commons` の供給フィールド（Progress / Belonging / RaceType / isTriple）の**交差が空**。影響し得るのは SelfSecondary の `GenderType` のみ。
2. **Class 辞書**: `classTagsOf` の唯一の呼び出しは `fillJsonTodosInRecord`（`--fill-todos` 専用）で、`identity_tags` に `TODO:` 接頭辞がある場合のみ到達。
   **Primary の AIHints 92 件で該当 0 件** → 構造的に到達不能。かつハードコード優先で二重に安全。
3. **Progress ゲート**: 画像ゲート通過 3 件（`#0`/`#00` = `released(beta)`, `#67-old` = `released`）に `notProceeded` なし → ヒット 0 件。後段配置により既存 status も不動。
4. **ソート**: number 同士で恒等。

→ 1 と 2 は `tests/patch-aihints.gates.test.js` で CI に固定した（前提が崩れたら鳴る）。

### 実行結果

- **`git diff -- data/Works_NumberTales/DataBases/db_Primary.json` が空**／ `grep -c '"AIHints":'` = **92**（不変）
- **Primary 全 6 モードの dry-run**（`default` / `--suggest` / `--fill-todos` / `--resync-structural` / `--apply-appearancedetail` / `--fix-refs`）で
  **レコード→status の割り当てがベースラインと完全一致**（差は表示順のみ。壊れていたソートが直った結果）。
  比較ログ: `.cache/aihints-baseline/`（Git 管轄外）
- **`npm test`: 41 ファイル / 480 件すべて成功**（着手前 37 / 445 から +4 ファイル / +35 件）
- **ゲート・enum ガードは「わざと壊して赤くなること」まで確認**:
  - enum ガード → `notProseed` を戻すと `Works_NumberTales/db_SemiPrimary.json Num="%" Progress="notProseed"` を特定して失敗
  - Progress ゲート → 画像ありの Num 111 を `notProceeded` にすると `patched=9 → 8` + `skipped-progress-notproceeded=1`、`--include-not-proceeded` で復帰
- **最終 dry-run**: `Primary`: `patched=3, skipped-existing=92, skipped-no-image=10` ／
  `SemiPrimary`: `patched=9, skipped-no-image=43` ／ `SelfSecondary`: **`patched=7`**, `skipped-no-image=99`（`skipped-ai-optout` は 0 へ）
- `npx prettier --check` 済み（`db_meta.json` / `db_SemiPrimary.json`）

## 未完了タスク

- [ ] **seed 本体**（`AppearanceDetail` の入力待ち）。揃ったら
      `node tools/patch-aihints.mjs --work NumberTales --db SemiPrimary --all --suggest --apply` → PR。
      **`"AIHints"` キーが 1 つでも入った時点から `aihints-structural-resync.yml` が YAML 無編集で自動追尾を始める**
      （同ワークフローは `grep -q '"AIHints"'` で対象を列挙するため、0 件の DB は bootstrap できない = 初回は手動）。
- [ ] **seed 後に `tests/aihints.schema.test.js` の DB パラメータ化**（`describe.each` + Primary を 92 に pin + `expectHumanoid` フラグ）。
      両 DB には humanoid 画像が 0 枚のため `forms.humanoid` は欠落する見込みで、`:154-189` の humanoid ブロックは条件化が要る。
      あわせて `tests/patch-aihints.gates.test.js` の「両 DB の AIHints は 0 件」期待値も更新する。
- [ ] **`migrate-aihints.mjs` の per-record `_Secondaries` opt-out 判定**（現状 DB レベルのみ）。
      カテゴリ単位 `AI_Optout: true` を持つのは `#DB_Secondary` のみで AIHints 実データが無いため latent だが、
      同 DB へ AIHints を入れる前には必須。
- [ ] **`CLASS_NAMES_EN` と辞書のレジスタ乖離**。fallback で入る辞書値（`"Model Unit.1"` 等）は AI タグとしては行儀が悪い。
      中期的には辞書側へ AI タグ用フィールド（例 `Class_AITag`）を足してハードコードを退役させるのが筋だが、
      スキーマ変更 + User の創作判断が要るため別議論。
- [ ] `worker.js` の aihints ルートが `isPublicRecord` / `applyCommons` を通していない（`records` / `search` ルートとの非対称）。Bearer トークンが唯一のゲート。

## 参考

- 計画: `C:\Users\s-chi\.claude\plans\ai-db-semiprimary-db-selfsecondary-radi-gleaming-mountain.md`（ローカル・Git 管轄外）
- AIHints 残課題台帳: [`2026-07-14_progress_addon-ai-tag-log-inventory.md`](./2026-07-14_progress_addon-ai-tag-log-inventory.md)（A1〜A5）
- `docs/api-sw-spec.md` §5.5（`AI_Optout` の意味論・per-`_Secondaries` 軸）/ `docs/ai-hints-usage.md` §7（付与不可 vs 付与不要）
- `CLAUDE.md` / `AGENTS.md`（ブランチ運用: `develop` → `addon-ai-tag` の一方向マージのみ）
