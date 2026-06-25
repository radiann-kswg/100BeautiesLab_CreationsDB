# 2026-06-24 進捗ログ — pages.characters.ui-output.test.js 赤テスト7件の分類調査と対応

> 作成: 扇一春（調査・対応代理）
> 種別: テストファイル（`tests/pages.characters.ui-output.test.js`）のみ編集。実装(`pages/characters.js`)・データ(`data/**`)・スキーマは未変更。git 書き込み系（add/commit/push/stash/reset）は未実行。
> 参照の正は git blob（HEAD 実体）およびホスト側（Desktop Commander）実ファイル。サンドボックスのマウント読み取り切り詰め現象は本ログの判定に用いていない。

## ✅ 続セッション対応結果（2026-06-24）

- **(A) 6系統のテスト追従**: コミット `8684d85 テスト回路調整` で全件緑化確認。
- **B-1 getWorkLabel 修正**: `pages/characters.js` L7284 の `getWorkLabel` が `cw.Title` のみ参照していた実装バグを `Title_JP`/`Title_EN` フォールバックに修正。`renders related terms and related creations...` が緑化。（続セッション push 済み）
- **B-2 References basicFields 修正** ✅（2026-06-24 続セッション）:
  - `data/Works_NumberTales/DataBases/db_meta.json` の `Databases` 直下に `#Ref_Reference` / `#Ref_Vocabulary`（`DB_Layer: "References"`）を追加。
  - `pages/characters.js` の `basicFieldKeys` ロジックを IIFE に変更し、`currentLayerName` が非空のとき `layeredTypeDef.$DefType` の `$display.section:"basic"` エントリを優先使用するよう改修。
  - `Category` 期待値を `'キャラクターの基本情報'`（データ不在の誤値）→ `'基本情報'`（実値）に修正（前セッションの誤判定を訂正）。
- **現在のテスト状態**: 全体 126 件中 **126 pass / 0 fail** ✅（2026-06-24 実測）。

## 目的

ENOINT（`ref_Glossary.json` 欠落）解消後に表面化した、`tests/pages.characters.ui-output.test.js` の 7 件の失敗を 1 件ずつ「(A) テスト側の追従漏れ」か「(B) 実装・描画ロジック側の追従漏れ（実バグ）」に切り分け、(A) のみテストを新データ仕様へ最小修正、(B) はテストを変更せず本ログに記録する。

## 結論サマリ

| # | テスト / アサーション | 分類 | 根拠（要点） |
| --- | --- | --- | --- |
| 1 | 正式名称 `桜花 訫(とき) / …` | **A** | 読みは `FormalName_JPReading` へ分離済み。既定 mix 表示は JP/EN 併記のみ（読み付与は jp モード限定）。旧データのインライン読みに依存した期待値だった |
| 1' | （同テスト派生）クラス名 `第3幹部 / Executive Director.3` | **A** | PastDivers `dict_Class` は汎用 `幹部=Executive Director` のみで `第3幹部` を持たず raw 表示。テスト入力値が dict 非対応 |
| 2 | 二次創作 `ラジアン(柏木主税)` | **A（テスト fixture）** | `sec_DesignedBy` の `$dict` は `$MetaType.$Def_SecondaryMeta` 配下。テストの `mergeMetaAndTypeVars` が `$MetaType` を落としていたため dict 解決不能で raw `RadianN`。現 dict 値は全角 `ラジアン（柏木主税）` |
| 3 | 二次創作 `散狐アタスト(https://misskey.io/@atast)(…)` | **A（同 fixture）** | 同上。現 dict 値は `散狐アタスト / @AtastMaifox`（旧 misskey URL・二重表記は廃止） |
| 4 | `expected null not to be null`（時空遷移能力の特性） | **A** | `ChronospecStats` の `hashTag_JP` が `時空遷移(クロノシフト)能力の特性` に改名。テストの旧セクション名で `getSectionNode` が null |
| 5 | Name `(No Name)`（資料名 レイヤー） | **A（fixture）** | `ref_Reference` のキーが `Title→Title_JP`。テストの探索 `record?.Title` が undefined→レコード未取得で `(No Name)`。実装 `getDisplayName` は `Title_JP` を正しく読む（修正後 detail-title 緑で実証） |
| 5' | （同テスト派生）`資料名` が空 | **B 候補** | 下記 B-2 |
| 6 | 日付 `8/15（誕生日）` | **A** | `$Def_Day` は配列型（`$Def_Day[]`）。実データ日付は `[{Day:{Month,DayOfMonth},DayAbout_JP,DayAbout_EN}]`。テストは単一オブジェクト＋旧 `DayAbout` → daySummary 不発＋role `annotation`=`DayAbout_JP` を拾えず付記欠落 |
| 7 | `expected 0 to be greater than or equal to 2`（creationLinks） | **B** | 下記 B-1 |

- (A) 6 系統はテスト追従で緑化（#1,1',2,3,4,5-title,6）。
- (B) 2 系統（#7、#5 の `資料名`）は実装側の新命名未追従に起因。テスト期待値は正しいため変更せず赤のまま記録。

---

## (A) テスト修正 before → after（要点）

- **#1 正式名称**: `toBe('桜花 訫(とき) / Trustia Cherrybroom')` → `toBe('桜花 訫 / Trustia Cherrybroom')`
- **#1' クラス名**: 入力 `Class: ['第3幹部', …]` → `['幹部', …]` ／ 期待 `toContain('第3幹部 / Executive Director.3')` → `toContain('幹部 / Executive Director')`
- **#2/#3 fixture**: `mergeMetaAndTypeVars` に `$MetaType` 合流行を追加（production の `lib/sw-common.js:1338` の defType マージと整合）。併せて期待 `ラジアン(柏木主税)` → `ラジアン（柏木主税）`、`散狐アタスト(https://…)(https://…)` → `散狐アタスト`
- **#4 セクション名**: `'時空遷移能力の特性'` → `'時空遷移(クロノシフト)能力の特性'`（`getSectionNode`/`getSectionTagTexts` 2 箇所）
- **#5 fixture 探索**: `numberTalesReferenceRecord = …find(record => record?.Title === 'ナンバーテールズについて')` → `record?.Title_JP === …`
- **#6 日付**: `BirthDay: { Day:{…}, DayAbout: '誕生日' }` → `BirthDay: [{ Day:{…}, DayAbout_JP: '誕生日' }]`（`$Def_Day[]` 配列化＋role 整合）
- 併せて Glossary→Vocabulary 改名（`ref_Vocabulary`、`Term→Term_JP`、`db:'Vocabulary'`、`Ref_Vocabulary` 画像パス、`数秘加護→数秘的加護`）を完了。これは ENOINT 解消の取り残し追従。

---

## (B) 実バグ候補（テスト不変・要 User 判断）

### B-1: #7 関連創作リンクの作品名がローマ字化（creationLinks 0）

- 症状: `RelatedCreations` のリンク文が `NumberTales / …` となり、テストの `link.textContent.includes('ナンバーテールズ / ')` に一致せず 0 件。
- 原因: `pages/characters.js` `renderReferenceConnectionsSection` 内 `getWorkLabel`（概ね L7282 付近）が `globalMeta.CreationWorks[work].Title` を参照。だがメタは `Title_JP` / `Title_EN` に標準化済みで `.Title` は不在 → `#?Works_` 除去のローマ字フォールバックに落ちる。
- 読むべき新フィールド: `Title_JP` / `Title_EN`（言語に応じて選択。後方互換で `.Title` も残す）。
- 想定修正(実装): `const rawTitle = (lang==='en' ? cw.Title_EN : cw.Title_JP) || cw.Title_JP || cw.Title_EN || cw.Title;`
- テスト期待 `ナンバーテールズ / 語彙辞書` 等は正。**テスト不変**。
- 副次観察（今回は未変更）: 同関数の関連用語ナビが `buildViewerNavigationHref(currentWorkKey, 'Glossary', …)`（L7307 付近）と旧 DB 名 `Glossary` をハードコード。`Glossary`→`Vocabulary` 改名後も `Glossary` を出力する latent bug。現テストは `db==='Glossary'` を期待しており通過するため今回は触れていない（'Vocabulary' に変えると実装出力と不一致で赤化する）。実装側の追従検討対象。

### B-2: #5 References レイヤー基本情報テーブルに `資料名`/`分類` が出ない

- 症状: detail-title は `ナンバーテールズについて`（`Title_JP`）で緑だが、基本情報テーブルに `資料名`(Title) 行が生成されず `getBasicFieldValue('資料名')` が空。
- 原因（推定）: 基本情報テーブルは `detailLayout = globalMeta.CreationWorks[workId].$DetailLayout`（`pages/characters.js` L5808）の `basicFields` 駆動で、レイヤー分岐がない。NumberTales 作品の `basicFields` は `Name/FormalName/…` で `Title`/`Category` を含まないため、References レコードでも作品レイアウトが使われ Title 行が作られない。加えて `aliasOf`(Name_JP→Title_JP) は `basicFields` キーが base `Name` に正規化されてから引かれるため橋渡しされない。
- 想定修正(実装): References レイヤー時はレイヤーの `$DetailLayout`／References typedef 由来で `basicFields` を構成する、もしくは `aliasOf` を base 正規化前に解決して Title_JP を Name スロットへ供給する。
- テスト期待 `資料名 = 'ナンバーテールズについて / About NumberTales'`、`分類 = 'キャラクターの基本情報'` は正。**テスト不変**。
- 補足: 本テストの `(No Name)`（#5 本体）は fixture の `Title→Title_JP` 追従で解消済み。`資料名` の空は別系統の実装課題であり、fixture 追従では緑化しないため B として分離・記録した。

---

## 検証

- 実行（ホスト / Desktop Commander）: `npx vitest run tests/pages.characters.ui-output.test.js`
  - 結果: **24 中 22 pass / 2 fail**。fail は #7（creationLinks＝B-1）と #5 の `資料名`（B-2）のみ。(A) 分類の #1,1',2,3,4,6 と #5-title は緑化確認済み。
- ファイル整合: 910 行、末尾 `});\n});` で完結、describe/it ブロック閉じ整合。旧トークン（`ref_Glossary` / `Ref_Glossary` / `record?.Title ===` / 旧 `DayAbout:` / `第3幹部` / 旧セクション名）残存なし。`git diff` は意図行のみ（34 insertions / 22 deletions）、他テストファイルへの波及なし（`tests/enrich.dblink.jump.merge.test.js` の変更は本作業以前から存在する別件）。
- マウント書き込み切り詰め対策: 復元・編集は HEAD blob ＋ 自差分でホスト側再構成し、末尾完全性を検証済み。実装/データ/スキーマ・git への変更は未実施。

## 残課題（User 判断）

1. B-1（getWorkLabel の Title→Title_JP/EN 追従）と関連用語ナビの `Glossary`→`Vocabulary` ハードコード是正。
2. B-2（References レイヤーの basicFields をレイヤー別レイアウト/typedef 駆動にする、または aliasOf 解決順の見直し）。
3. #1' のクラス値は dict 整合のため `幹部` に変更したが、`第3幹部`（番号付き幹部）を dict に追加すべきか（データ方針）は User 判断。
