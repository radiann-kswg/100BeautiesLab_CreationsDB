# 2026-07-22 進捗: Issue #13（モチーフ解説 / 接触反応フィールド）

- 対象Issue: https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/13
- ブランチ: `develop`
- 状態: **Phase 1〜3 実装完了**（2026-08-20）。Phase 4（`*specAbout` 集約）は未着手・User 確認待ち

## 目的

NumberTales-MisskeyAIBot の F-06（名前ヌメロジー・数秘解説）/ F-15 Phase 3（コアフォルダのスキンシップ反応）へ、
監修済みコンテンツを DB フィールドから供給する。Bot 側はフィールド未存在でもフォールバックする。

## 確定した設計判断（2026-08-20 / User 回答）

| 判断 | 決定 |
| --- | --- |
| 命名 | 両方とも汎用名（`MotifCommentaries` / `TouchReactions`）。他作品でも同じ器を使い回す |
| キー項目の型 | 辞書コード ＋ 数値（`#ListIndex` + `$dict` / `TopicValue`） |
| 配置 | 台詞は `ConversationPattern` 配下、台詞以外のモチーフ情報は `*specStats` 配下 |
| 表示 | キャラシートに表示する |
| プロンプト | 両方載せる |
| 追加要望 | `*specAbout` / `*specName` を `*specStats` へ集約 → **Phase 4 として分離**（500 行超のため別着手） |

## 調査で確定した技術的制約

- 作品別 `$DefType` の同名エントリは**グローバル定義を丸ごと置換**する（`lib/data-common.js:2278-2295`）。
  作品側から `ConversationPattern` へ子だけ足すことは不可 → `TouchReactions` はグローバル宣言が唯一の選択肢。
- `searchable: false` はトップレベルのキー単位で効く（`lib/data-common.js:991-998`）。
  `ConversationPattern` / `NumerospecStats` 配下に入れれば台詞本文は自動的に検索索引から外れる。
- キー順整列（`data:order:check`）はトップレベルのみが対象（ネスト整列は T-04 で未実装）→ 今回はキー順に影響なし。
- `numSpecSection` は残りフィールドを `buildObjectChildBlocks` へ委譲している（`lib/section-renders/numSpec.js:36`）。
  つまり `ConversationPattern` と `NumerospecStats` の子は**同じ描画経路**を通るため、表示対応は 1 箇所で済んだ。
- `formatValueForDisplay` の bilingual 分岐（`pages/characters.js:3991-4000`）が `value_JP` を持つ object を
  wrapper registry（同 4038 行）より**先に**食べる。キー項目は放置すると表示から消えるため、
  `buildObjectChildBlocks` 側での対応が必須だった。

## 変更点の要約

### Phase 1 — スキーマ・辞書（非破壊追加）

- `data/db_meta.json` … `General.$VarsDef` へ `$Def_MotifCommentary` / `$Def_TouchReaction` と辞書 `#List_TouchAction` を追加
- `data/db_type.json` … `ConversationPattern.$type` へ `TouchReactions`（`$Def_TouchReaction[]|#Null`）を追加
- `data/Works_NumberTales/DataBases/db_type.json` … `NumerospecStats.$type` へ `MotifCommentaries`（`$Def_MotifCommentary[]|#Null`）を追加
- `data/Works_NumberTales/DataBases/db_meta.json` … 作品別辞書 `#List_MotifTopic`（13 行）を追加
- レコードへの空の器の事前挿入は**しない**（値は User が埋めるたびに追加）

### Phase 2 — 表示

- `lib/basic-renders/keyedDialogue.js`（新規）… `キー：台詞（補足）` の共通整形。`$display.role: "dialogueKey"` /
  `"dialogueKeyValue"` だけでキー項目を判別し、field 名依存の分岐を持たない
- `pages/characters.js` … `childKey === 'DialogueExamples'` のハードコード分岐を schema 駆動へ置換（正味 −21 行）。
  `DialogueExamples` / `TouchReactions` / `MotifCommentaries` が 1 経路に集約された
- `lib/section-renders/numSpec.js` は**無変更**（既に `buildObjectChildBlocks` へ委譲済みのため）

#### 実装時に踏んだ落とし穴（要注意）

- **`hints.schemaType` は `$Def_*` 展開後の値**。`pages/characters.js` の `resolveSchemaTypeByPath()` が
  `$Def_TouchReaction[]|#Null` → `#ListIndex[]|#Null` のように子要素型へ展開してしまうため、
  `$Def_*` 名で wrapper 宣言を引く処理ではそのまま使えない。展開前の生宣言（`fieldTypeMap[schemaPath]`）を使う。
  この展開は単一子要素の `$Def_*`（`$Def_EffectText` 等）向けの既存機構で、今回は無効化せず参照側で回避した。
  → DOM テスト（`tests/pages.characters.ui-output.test.js`）を書いたことで発覚。純関数テストだけでは通っていた。
- **`mix`（和英併記。ページ言語の既定）でのキー接頭辞**。辞書ラベルの既定は mix で `JP / EN` 併記だが、
  本文は既存 `DialogueExamples` と同じく JP 優先で 1 本しか出ないため、そのままだと
  `なでる / Pat：<JPの台詞>` と言語が不揃いになる。接頭辞は JP へ寄せて 1 行の言語を揃えた。

### Phase 3 — ロールプレイプロンプト

- `tools/roleplay/render.mjs` … `formatDialogueItem(item, lang, keyLabel)` に接頭辞引数を追加。`expandEach` が
  `vars.__dialogueKeyLabel` からラベルを取得する（render.mjs は schema / 辞書を知らない純関数のまま）
- `tools/build-roleplay-prompts.mjs` … `__dialogueKeyLabel` リゾルバを追加。対象コンテナは
  `$display.wrapper: "keyedDialogueSummary"` を宣言した `$Def_*` から自動収集するため field 名の分岐は無い
- `data/Works_NumberTales/RoleplayPrompts/roleplay-prompt.tpl.md` … 2 節追加（データが空なら節ごと消える条件ブロック）

## `#List_MotifTopic` の語彙について（重要 / ライセンス）

User の依頼により [CheatSheet-of_Numbers](https://github.com/radiann-kswg/CheatSheet-of_Numbers) から自動補完した。
ただし**取り込んだのは分類語彙（用語）だけ**で、同リポジトリの本文は転記していない。

- **CheatSheet-of_Numbers は CC BY-SA 4.0**、本リポジトリは **CC BY-NC 4.0**。
  CC BY-SA の ShareAlike 条項は「ライセンスが許すことを制限する追加条項」を禁じるため、
  **NC 付きの本リポジトリへ CC BY-SA 本文を取り込むことはライセンス非互換**になる。
  加えて CheatSheet の本文の多くは Wikipedia（CC BY-SA）由来であり、User でも再ライセンスできない。
- そのため取り込み対象は「分類名（著作物性のない用語）」に限定した。数字ごとの解説本文が必要な場合は、
  転記ではなく参照リンク（`https://radiann-kswg.github.io/CheatSheet-of_Numbers/numbers/<0xx>/<nnn>.html`）で導線を張る。
- `MotifCommentaries.value_JP` は「そのキャラが自分の口調で語る」創作本文なので、いずれにせよ User の手動入力・監修が正。

語彙の対応（CheatSheet 側の分類と 1:1）:

| コード | 由来 |
| --- | --- |
| `LifePath` / `Soul` | Bot F-06 の名前ヌメロジー（利用者の名前・生年から算出。CheatSheet には数字固有の項として無い） |
| `Numerology` / `Angel` / `HebrewNumeral` / `Gematria` | CheatSheet「数秘・占術・文化のいわれ」の機械導出分（全数字に一律付与） |
| `Kikkyo` / `Folklore` / `Gogen` / `Meisu` / `Goro` / `Fiction` | CheatSheet `tools/number_lore_v1.json` のキュレーション分類（`LORE_CATEGORY_ORDER` と同順） |
| `PlainNumber` | 分類を伴わない素の数字（Issue #13 の「数字の8」相当） |

### Phase 4 — `*specAbout` / `*specName` の `*specStats` 集約（2026-08-20 実施）

| 作品 | 移動 | レコード |
| --- | --- | --- |
| NumberTales | `NumerospecAbout_JP` / `_EN` → `NumerospecStats` | 120（Primary 103 / SemiPrimary 11 / Secondary 6） |
| FLInvestigator78 | `ArcanamspecAbout_JP` / `_EN` → `ArcanumspecStats` | 14 |
| PastDivers | `ChronospecName_*` / `ChronospecAbout_*` → `ChronospecStats` | 14 |
| ShouArRiders | `BeastspecName_*` / `BeastspecAbout_*` → `BeastspecStats` | 7 |
| UnauthedLogica | `LogicspecAbout_*` → `LogicspecStats`（器を新設） | 11（Primary 7 / PrimaryMobs 4） |

合計 166 レコード / 9 ファイル。`$DetailLayout.subFields` も 5 作品分を追従させた。

- **UnauthedLogica**: 当初は「`LogicspecAbout` 単体を包むだけの器は意味が薄い」として見送ったが、User 判断で
  他作品と揃えることにした。`LogicspecStats`（`$display.sectionWrapper: "specStatsSection"`）を新設し、
  ラベルは他作品の `*specStats` に倣って `ロジカ(論理特殊能力)の特性` / `Logicspec Ability Characteristics` とした。
  なお **typedef だけ足すのは不可**。トップレベルの宣言が消えると「schema 外の項目は自動表示しない」原則で
  レコード側の `LogicspecAbout_JP` が表示から落ちるため、データ 11 件の移行と同じ変更に含めている。
- **併せて解消した不備**:
  - `numSpecSection` と `chronoSpecSection` が登録名以外まったく同一だった → 汎用 `specStatsSection`
    （`lib/section-renders/specStats.js`）へ統合し `chronoSpec.js` を削除。
  - ShouArRiders `BeastspecStats` は `statsSection`（値をタグで並べる `AbilityStats` 用）を使っていた。
    移動してきた説明文がタグに詰め込まれてしまうため `specStatsSection` へ変更。
  - `pages/characters.js` の `ArcanumspecStats` ラベルハードコード 2 箇所を削除（`hashTag_JP` で解決できる。
    既存の UI テスト `アルカナムスペック(アルカナ能力)の特性` が通ることで冗長性を確認）。
- **移行手法**: `JSON.parse` → `JSON.stringify` の往復は書式を壊す（NumberTales で 15,408 行の差分になることを実測）。
  `tools/extract-palette.mjs` の `scanTopLevelRecords()` と `tools/normalize-field-order.mjs` の `scanRecordMembers()` を
  再利用した行単位のテキスト手術で行い、`canonical()` 比較で「移動以外は 1 ビットも変わっていない」ことを検証した。
  使い捨てスクリプトは `.cache/migrate-specstats.mjs` / `.cache/migrate-typedef.mjs`（Git 管轄外）。
- **踏まなかった落とし穴**: ロールプレイテンプレは移動対象フィールドを参照していなかったため、生成物への影響なし。

#### 綴り揺れ `Arcanam` / `Arcanum` → **`Arcanum` へ統一（User 判断・2026-08-20）**

当初は `References/ref_Reference.json` が `Term_EN: "Arcanamspec"` を創作上の正式英名として宣言していたため
判断を保留したが、User の指示で **`Arcanum` に統一**した。フィールド名・`hashTag_EN`・レコードキー（14 件）に加え、
`ref_Reference.json` の用語定義と `ref_Vocabulary.json` の本文表記も `Arcanumspec` へ揃えている。
`CHANGELOG.md` の過去エントリと完了済み WIP ログは当時の事実の記録なので書き換えていない。

### Phase 5 — 和英分離フィールドの suffix なし参照解決 ＋ `hideText` の言語共有（2026-08-20 実施）

Phase 4 の作業中に見つけた「UnauthedLogica の `_Jump` が以前から解決できていない」問題を掘ったところ、
原因は `_JP` / `_EN` 分離に起因する 2 系統だと分かったので、参照側と表示側の両方を直した。

#### 調査で分かったこと（部品は 2 つとも既にあった）

| 事実 | 位置 |
| --- | --- |
| `_Jump` の `getByPath` は**ドットパスに既に対応**。足りないのは末尾の言語別名解決だけ | `lib/data-common.js` `resolveJumpsInAny()` |
| 言語別名の展開（`FormalName_JP` → `[…, FormalName, FormalName_EN]`）は**既にあった**が、`searchRecords` 内のローカルクロージャで再利用できなかった。しかも**ドットパスの prefix を保って末尾だけ展開**する実装で、そのまま使えた | 同 `expandLangAliasCandidates` |
| `hideText` の和英解決も**既にあった**。`#List_hideText`（`極秘事項`↔`Confidential` 等 13 対）を引いて言語別に出し分ける | `pages/characters.js` `formatMaskedValue()` |
| 詰まっていたのは言語ルーティング側。EN では `_JP` 側を捨てるため、`_JP` にだけマスクがあるレコードが空欄になっていた | `formatBilingualGroup` / `buildObjectChildBlocks` |

#### 変更

1. `expandLangAliasCandidates()` を `TypeDefUtils` の static へ昇格し、`preferLang` を追加。`_Search` 側は呼び出しへ置換（並び不変）。
2. `resolveJumpsInAny()` の `getByPath` 1 回を候補ループへ。第 1 候補が `hashTag` そのものなので**既存挙動は不変**、
   全滅時はラッパー維持（fail-closed）。参照元フィールドのキー名を `walk()` で引き継いで優先言語にする。
3. `isMaskedValue()` を追加し、EN ルーティング 2 箇所で「マスクなら `_JP` 側を EN でも採用」。ラベルだけ `_EN` 側の `hashTag_EN` を使う。
4. UnauthedLogica の `_Jump` 6 件を明示パス（`NumerospecStats.NumerospecAbout`）へ更新。

**入れ子の参照は明示ドットパス方式**（User 判断）。レコード全体を名前で走査する案は採らなかったため、
当初懸念していた素の hashTag の衝突（実測で `Communication` / `Related` / `Commented` の 3 語）は問題ごと消えた。

#### 実害の解消

`NumerospecStats.NumerospecAbout_JP: { hideText }` があり `_EN` が無いレコード 6 件
（`db_Secondary` の `0xA`〜`0xF`）が英語ページで空欄になっていたのを解消した。

#### 残（User 判断）

UnauthedLogica の `_Jump` 6 件は、パスと言語別名が原因ではなくなったが**まだ値は解決しない**。
該当レコードにルート `_DBLink` も `_Jump._DBLink` も無く、参照先レコード自体が特定されないため。
参照先の指定は創作判断なので User 待ち。

## 検証

| 項目 | 結果 |
| --- | --- |
| `npm test`（Vitest） | ✅ 70 ファイル / 1259 件パス（新規 `tests/keyedDialogue.render.test.js` 15 件 ＋ DOM 配線テスト 1 件を含む） |
| `npm run data:order:check` | ✅ 0/1334 レコード（キー順への影響なし） |
| `npm run roleplay:plan` | ✅ NumberTales は 57 件すべて unchanged（データ未入力のため差分なし） |
| 合成データでの生成経路 | ✅ `なでる：ふや…、くすぐったいな。（照れている時）` / `ライフパス3：…` を確認 |
| 辞書ラベル解決（JP/EN） | ✅ `Pat: …` / `Life Path 3: …` を確認 |
| DOM 描画（jsdom / `pages.characters.ui-output`） | ✅ 合成データで `なでる：…` / `ライフパス3：…` がカードに出ることを確認 |
| `npm run agents:check` | ✅ 生成物は正典と一致 |
| ローカル HTTP サーバでの実機目視 | ⏳ **未実施**（実データ未入力のため。値を 1 件入れてからの確認が残る） |

### 既知のノイズ（本変更とは無関係）

`npm run roleplay:plan` は `data/Works_DestinyFoxRecords/RoleplayPrompts/DB_Proxy/roleplay-prompt-3.md` の
「概要」節に差分を 1 件報告する。`git stash` して変更前の状態で実行しても同じ差分が出るため、**本変更以前から
存在するドリフト**。巻き込みを避けるため `roleplay:write` は実行していない（別途 User 判断で反映する）。

## 未完了タスク

1. **Phase 4**: `*specAbout` / `*specName` の `*specStats` 集約（User の「できればこの際に」への対応）。
   実測で 5 作品・約 166 レコード＋テスト/docs 5 本に及び、**500 行を確実に超える**ため別着手・要事前確認。
   内訳は `_work_in_progress/2026-07-25_remaining-task.md` の T-34 を参照。
2. 実データの入力（`value_JP` / `about_JP`。User 手動）→ 入力後にローカル実機目視
3. Issue #13 へ確定した命名・形式をコメント（Bot 側がフィールド名を合わせられるように）

## 制約・注意

- 創作本文（`value_JP` / `about_JP`）と辞書語彙の拡張は User 手動入力・監修が前提
- 既存の `DialogueExamples` の値・表示・プロンプト出力は変更していない（回帰テストで固定済み）
- CC BY-SA 4.0 の素材（CheatSheet-of_Numbers / Wikipedia）の本文は本リポジトリへ転記しない

## 参考

- `_work_in_progress/2026-07-25_remaining-task.md`（**T-25** / Phase 4 は **T-34**）
- `docs/wrapper-summary-registry.md`（`keyedDialogueSummary`）
- `docs/schema-meta-processing.md`（`$display.role: dialogueKey / dialogueKeyValue`）
- `docs/roleplay-prompt-generation.md`（`__dialogueKeyLabel`）
