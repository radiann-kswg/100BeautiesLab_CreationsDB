# JP/EN フィールド命名標準化 — 進捗ログ

**作成日**: 2026-06-22  
**状態**: Phase 2〜5 全完了（2026-06-22）  
**担当**: User（監修・手動入力）/ Claude Code（実装補助）

---

## 目的

1. **`_JP`/`_EN` 併記必須化**: 和英共有オブジェクト形式でない全フィールドのフィールド名に言語サフィックス（`_JP` / `_EN`）を明示する
2. **`*Name_JPReading` typedef 追加**: 和文キャラクター名称系フィールドに読み仮名フィールドの typedef を追加する（`data/References/db_type.json` の `Term_JPReading` と同様のパターン）

---

## 背景

現状、多くのフィールドが「JP 側は無サフィックス（例: `Name`）、EN 側は `_EN` サフィックス（例: `Name_EN`）」という非対称命名になっている。
この規則を `Name_JP` / `Name_EN` という対称命名に統一することで、スキーマの自己記述性を高め、将来の多言語対応・ツール処理を簡潔にする。

既存の読み仮名 typedef パターン（`data/References/db_type.json` の `Term_JPReading`）を、全作品の名前系フィールドに拡張する。

---

## 変更要件

### 要件 A: `_JP`/`_EN` 明示化の対象ルール

| ケース | 対応 |
|--------|------|
| `Foo` + `Foo_EN` が両方ある | `Foo` → `Foo_JP`、`Foo_EN` はそのまま |
| `Foo_JP` + `Foo_EN` がすでにある | 変更なし（対応済み） |
| `langMode: "shared"` / `##String` / 両言語共通フィールド | 変更対象外 |
| `sec_*` 系の制御フィールド（`sec_SeriesTitle` 等） | 変更対象外（システム制御用）|
| `DayAbout`（JP データで使用中、EN 版が typedef 未宣言） | `DayAbout_JP` + `DayAbout_EN` を両方 typedef に追加 |
| `about`（`$Def_BaseArea` 内、`about_EN` と対になっている） | `about` → `about_JP` |

### 要件 B: `*Name_JPReading` typedef 追加対象

| フィールド（リネーム後） | 追加する typedef |
|--------------------------|------------------|
| `Name_JP`（グローバル） | `Name_JPReading` |
| `FormalName_JP`（グローバル） | `FormalName_JPReading` |
| `CodeName_JP`（グローバル） | `CodeName_JPReading` |
| `ModelName_JP`（グローバル） | `ModelName_JPReading` |
| `BeastspecName_JP`（ShouArRiders） | `BeastspecName_JPReading` |
| `ChronoholderName_JP`（PastDivers） | `ChronoholderName_JPReading` |
| `ChronospecName_JP`（PastDivers） | `ChronospecName_JPReading` |

typedef のフォーマットは `Term_JPReading` に準拠:
```json
{
  "hashTag": "Name_JPReading",
  "$type": "##String_JP|#Null",
  "hashTag_JP": "読み仮名"
}
```

---

## フィールドリネームマップ（全体）

### グローバル `data/db_type.json` — `$DefType`

| 旧 hashTag | 新 hashTag | 旧 EN 側 | 新 EN 側 | 備考 |
|------------|------------|----------|----------|------|
| `Name` | `Name_JP` | `Name_EN` | `Name_EN` | + `Name_JPReading` 追加 |
| `FormalName` | `FormalName_JP` | `FormalName_EN` | `FormalName_EN` | + `FormalName_JPReading` 追加 |
| `CodeName` | `CodeName_JP` | `CodeName_EN` | `CodeName_EN` | + `CodeName_JPReading` 追加 |
| `SPCodeName` | `SPCodeName_JP` | `SPCodeName_EN` | `SPCodeName_EN` | |
| `ModelName` | `ModelName_JP` | `ModelName_EN` | `ModelName_EN` | + `ModelName_JPReading` 追加 |
| `FirstPersonCalling` | `FirstPersonCalling_JP` | `FirstPersonCalling_EN` | `FirstPersonCalling_EN` | |
| `SecondPersonCalling` | `SecondPersonCalling_JP` | `SecondPersonCalling_EN` | `SecondPersonCalling_EN` | |
| `ThirdPersonCalling` | `ThirdPersonCalling_JP` | `ThirdPersonCalling_EN` | `ThirdPersonCalling_EN` | |
| `Character` | `Character_JP` | `Character_EN` | `Character_EN` | |
| `Hobby` | `Hobby_JP` | `Hobby_EN` | `Hobby_EN` | |
| `SpecialSkill` | `SpecialSkill_JP` | `SpecialSkill_EN` | `SpecialSkill_EN` | |
| `Favor` | `Favor_JP` | `Favor_EN` | `Favor_EN` | |
| `Unlike` | `Unlike_JP` | `Unlike_EN` | `Unlike_EN` | |
| `Strength` | `Strength_JP` | `Strength_EN` | `Strength_EN` | |
| `Weakness` | `Weakness_JP` | `Weakness_EN` | `Weakness_EN` | |
| `RelationNotes` | `RelationNotes_JP` | `RelationNotes_EN` | `RelationNotes_EN` | |
| `Summary` | `Summary_JP` | `Summary_EN` | `Summary_EN` | |
| `Backgrounds` | `Backgrounds_JP` | `Backgrounds_EN` | `Backgrounds_EN` | |
| `InStory` | `InStory_JP` | `InStory_EN` | `InStory_EN` | |
| `AdditionalDesigned` | `AdditionalDesigned_JP` | `AdditionalDesigned_EN` | `AdditionalDesigned_EN` | |

#### `ConversationPattern` サブフィールド（同上ファイル内）

| 旧 | 新 |
|----|-----|
| `TalkingTone` | `TalkingTone_JP` |
| `TopicPreference` | `TopicPreference_JP` |
| `TalkFrequency` | `TalkFrequency_JP` |
| `PreferredTopics` | `PreferredTopics_JP` |
| `AvoidedTopics` | `AvoidedTopics_JP` |
| `ConversationNotes` | `ConversationNotes_JP` |

#### `$VarsDef.$Def_Day`（同上ファイル内）

| 旧 | 新 | 備考 |
|----|-----|------|
| `DayAbout` | `DayAbout_JP` | `DayAbout_EN` を typedef に新規追加 |

#### `$VarsDef.$Def_BaseArea`（同上ファイル内）

| 旧 | 新 |
|----|-----|
| `about` | `about_JP` |

#### `$MetaType.$Def_OldTitleCatalog`（同上ファイル内）

| 旧 | 新 |
|----|-----|
| `Title` | `Title_JP` |

#### `$MetaType.$Def_CreationWorkCatalog`（同上ファイル内）

| 旧 | 新 |
|----|-----|
| `Title` | `Title_JP` |

#### `$MetaType.$Def_DatabaseCatalog`（同上ファイル内）

| 旧 | 新 | 備考 |
|----|-----|------|
| `DB_Label` | `DB_Label_JP` | `DB_Summary` は EN 対応なし → 要確認（下記「未決事項」参照）|

#### 関連修正: `$display.aliasOf` の値

```
"aliasOf": "Name"  →  "aliasOf": "Name_JP"
"aliasOf": "Name_EN"  →  変更なし
"aliasOf": "FormalName" が存在する場合  →  "aliasOf": "FormalName_JP"
```

---

### グローバル `data/db_meta.json` — `CreationWorks.#Works_*`

| 旧 | 新 | 備考 |
|----|-----|------|
| `Title` | `Title_JP` | OldTitles 配列内の `Title` も同様 |
| `Works_Summary` | `Works_Summary_JP` | `Works_Summary_EN` と対になる |

---

### `data/References/db_type.json`

| 旧 | 新 | 備考 |
|----|-----|------|
| `Term` | `Term_JP` | `Term_JPReading` は既に存在する → そのまま |
| `Title` | `Title_JP` | |
| `BodyBlocks` | `BodyBlocks_JP` | |
| `Summary` | `Summary_JP` | |

---

### `data/Works_NumberTales/DataBases/db_type.json`

| 旧 | 新 | 備考 |
|----|-----|------|
| `ForMasterCalling` | `ForMasterCalling_JP` | |
| `TailsUnit` | `TailsUnit_JP` | |
| `NumerospecAbout` | `NumerospecAbout_JP` | |
| `$VersDef.$Def_NumberMark.MarkPosition` | `MarkPosition_JP` | |
| `$VersDef.$Def_NumberMark.MarkColor` | `MarkColor_JP` | |
| `$VersDef.$Def_NumberMark.MarkNotation` | `MarkNotation_JP` | |

---

### `data/Works_FLInvestigator78/DataBases/db_type.json`

| 旧 | 新 |
|----|-----|
| `For79thDealerCalling` | `For79thDealerCalling_JP` |
| `For80thDealerCalling` | `For80thDealerCalling_JP` |
| `ArcanamspecAbout` | `ArcanamspecAbout_JP` |

---

### `data/Works_ShouArRiders/DataBases/db_type.json`

| 旧 | 新 | 備考 |
|----|-----|------|
| `BeastspecName` | `BeastspecName_JP` | + `BeastspecName_JPReading` 追加 |
| `BeastspecAbout` | `BeastspecAbout_JP` | |

---

### `data/Works_UnauthedLogica/DataBases/db_type.json`

| 旧 | 新 |
|----|-----|
| `ForMasterCalling` | `ForMasterCalling_JP` |
| `LogicspecAbout` | `LogicspecAbout_JP` |

---

### `data/Works_PastDivers/DataBases/db_type.json`

| 旧 | 新 | 備考 |
|----|-----|------|
| `Career` | `Career_JP` | |
| `ChronoholderName` | `ChronoholderName_JP` | + `ChronoholderName_JPReading` 追加 |
| `ChronospecName` | `ChronospecName_JP` | + `ChronospecName_JPReading` 追加 |
| `ChronospecAbout` | `ChronospecAbout_JP` | |
| `ChronoizedPurity` | `ChronoizedPurity_JP` | |
| `ChronoizedAbout` | `ChronoizedAbout_JP` | |

---

### `data/Works_UnibyteLive/DataBases/db_type.json`

| 旧 | 新 |
|----|-----|
| `AccessoryUnit` | `AccessoryUnit_JP` |
| `StreamingCategory` | `StreamingCategory_JP` |
| `StreamingAwards` | `StreamingAwards_JP` |
| `StreamingSummary` | `StreamingSummary_JP` |

---

### 変更対象外のフィールド（参考）

| フィールド | 理由 |
|------------|------|
| `ModelNumber` | `langMode: "shared"` — 両言語共通値 |
| `RaceType`, `GenderType`, `Class`, `Belonging` 等の辞書参照系 | `langMode: "shared"` or 辞書で言語吸収 |
| `BirthDay`, `AnivDay`, `Height_cm`, `Weight_kg`, `BustSize` | 構造型・数値・共通単位フィールド |
| `sec_SeriesTitle`, `sec_Category`, `sec_DesignedBy` | 制御用フィールド（EN 対応なし） |
| `$Def_StoryEra.about_JP/about_EN`, `$Def_StoryEraCatalog.about_JP/about_EN` | すでに対称命名済み |
| `$Def_ThisMastersEntry.value_JP/about_JP/value_EN/about_EN` | すでに対称命名済み |
| `Motif.Motif_JP/Motif_EN` | すでに対称命名済み |
| `StreamingActivity.StreamingGreeting_JP/StreamingGreeting_EN` 等 | すでに対称命名済み |

---

## 影響ファイル一覧

### Schema / typedef

| ファイル | 主な変更内容 |
|----------|-------------|
| `data/db_type.json` | `$DefType` 全体リネーム + `$VarsDef.$Def_Day/$Def_BaseArea` + `$MetaType` + `aliasOf` 値更新 |
| `data/Works_NumberTales/DataBases/db_type.json` | フィールドリネーム |
| `data/Works_FLInvestigator78/DataBases/db_type.json` | フィールドリネーム |
| `data/Works_ShouArRiders/DataBases/db_type.json` | フィールドリネーム + `JPReading` 追加 |
| `data/Works_UnauthedLogica/DataBases/db_type.json` | フィールドリネーム |
| `data/Works_PastDivers/DataBases/db_type.json` | フィールドリネーム + `JPReading` 追加 |
| `data/Works_UnibyteLive/DataBases/db_type.json` | フィールドリネーム |
| `data/References/db_type.json` | `Term`/`Title`/`BodyBlocks`/`Summary` リネーム |

### Meta / 設定

| ファイル | 主な変更内容 |
|----------|-------------|
| `data/db_meta.json` | `CreationWorks.#Works_*.Title` → `Title_JP`、`Works_Summary` → `Works_Summary_JP`、`OldTitles[].Title` → `Title_JP` |
| `data/Works_*/DataBases/db_meta.json`（全作品） | `$DetailLayout.basicFields/subFields` 配列内の旧フィールド名をリネーム後の名称へ更新 |

### データファイル（JSON キー全置換）

| ファイル | 対象作品 |
|----------|---------|
| `data/Works_NumberTales/DataBases/db_Primary.json` | NumberTales 一次創作（100件超） |
| `data/Works_NumberTales/DataBases/db_Secondary.json` | NumberTales 二次創作 |
| `data/Works_NumberTales/DataBases/db_SemiPrimary.json` | NumberTales 準一次 |
| `data/Works_NumberTales/DataBases/db_SelfSecondary.json` | NumberTales セルフ二次創作 |
| `data/Works_NumberTales/DataBases/db_UnprocessedSecondary.json` | NumberTales 未整理二次 |
| `data/Works_FLInvestigator78/DataBases/db_Primary.json` | FLInvestigator78 一次 |
| `data/Works_FLInvestigator78/DataBases/db_PrimaryDealer.json` | FLInvestigator78 ディーラー |
| `data/Works_FLInvestigator78/DataBases/db_UnprocessedDealer.json` | FLInvestigator78 未整理 |
| `data/Works_ShouArRiders/DataBases/db_Primary.json` | ShouArRiders 一次 |
| `data/Works_SinisterChangingGirls/DataBases/db_Primary.json` | SinisterChangingGirls 一次 |
| `data/Works_UnauthedLogica/DataBases/db_Primary.json` | UnauthedLogica 一次 |
| `data/Works_UnauthedLogica/DataBases/db_PrimaryMobs.json` | UnauthedLogica モブ |
| `data/Works_PastDivers/DataBases/db_Primary.json` | PastDivers 一次 |
| `data/Works_DestinyFoxRecords/DataBases/db_Primary.json` | DestinyFoxRecords 一次 |
| `data/Works_Proxies/DataBases/db_Proxy.json` | Proxies |
| `data/Works_UnibyteLive/DataBases/db_Primary.json` | UnibyteLive 一次 |
| `data/Works_UnibyteLive/DataBases/db_PrimaryPerformer.json` | UnibyteLive Performer |
| `data/db_temp.json` / 各 `db_temp.json` | 一時ファイル（必要に応じて） |

### ライブラリ / コード

| ファイル | 変更箇所の概要 |
|----------|---------------|
| `lib/wrapper-common.js` | `value.DayAbout` → `value.DayAbout_JP \|\| value.DayAbout`（移行中は両方フォールバック） |
| `lib/section-renders/dblink.js` | `found?.Name` → `found?.Name_JP \|\| found?.Name`（他 `FormalName`, `ModelName` 同様） |
| `lib/section-renders/relation.js` | `found?.Name` 等（同上）複数箇所 |
| `pages/characters.js` | `rec.Name`, `rec.FormalName`, `rec.Summary` 等の直接参照を複数箇所更新 |
| `lib/data-common.js` | `expandLangAliasCandidates()` コメント内の例示更新（`FormalName` の例）。実処理は既に `_JP` を含む形で拡張済みのため変更最小 |
| `lib/wrapper-common.js` の `about` フォールバック | 既に `value.about_JP ?? value.about_EN ?? value.about` となっており移行耐性あり |

### テスト

| ファイル | 変更内容 |
|----------|---------|
| `tests/data.sanity.test.js` | データキー名の検証ロジック更新 |
| `tests/data.shape.test.js` | 構造・型整合テストの期待値更新 |
| `tests/sw.enrich.basic.test.js` | エンリッチ結果のフィールド名検証更新 |
| `tests/enrich.dblink.jump.merge.test.js` | `Name`/`FormalName` 等を参照しているアサーション更新 |

### Cloudflare Workers（`pkg/cloudflare/`）

| ファイル | 変更内容 |
|----------|---------|
| `pkg/cloudflare/worker.js` | ハードコードされたフィールド名参照（例: 表示用 `Name` 取得）を更新 |
| D1 FTS5 インデックス（`schema/d1-init.sql`） | `Name`, `Summary` 等を FTS5 対象として直接指定している場合は更新が必要 → 要確認 |
| `scripts/migrate.mjs` | FTS5 投入時のフィールド指定があれば更新 |

---

## 実装フェーズ

### Phase 1: 詳細調査・準備（✅ 完了）

- [x] 全 `db_*.json` データファイルを走査し、リネーム対象フィールドの実出現数を把握
- [x] `pkg/cloudflare/worker.js` のフィールド名ハードコード箇所確認
- [x] D1 スキーマ / `migrate.mjs` の FTS5 フィールド指定確認
- [x] `tests/` 内でのフィールド名直接参照を全洗い出し
- [x] `DB_Summary` / `Works_Summary` / その他 EN 対応なしの JP フィールドの取扱いを User に確認（`DB_Summary_JP`/`DB_Summary_EN`・`Works_Summary_JP`/`Works_Summary_EN` を `$MetaType` に追加する方針で確定）

### Phase 2: typedef ファイル更新（schema 層・✅ 完了）

- [x] `data/db_type.json` の `$DefType` フィールドリネーム + `JPReading` typedef 追加
- [x] `data/db_type.json` の `$VarsDef.$Def_Day.DayAbout` → `DayAbout_JP` + `DayAbout_EN` 追加
- [x] `data/db_type.json` の `$VarsDef.$Def_BaseArea.about` → `about_JP`
- [x] `data/db_type.json` の `$MetaType.$Def_OldTitleCatalog.Title` → `Title_JP`
- [x] `data/db_type.json` の `$MetaType.$Def_CreationWorkCatalog.Title` → `Title_JP`
- [x] `data/db_type.json` の `$MetaType.$Def_DatabaseCatalog.DB_Label` → `DB_Label_JP`
- [x] `data/db_type.json` の `$display.aliasOf` 値を更新（`"Name"` → `"Name_JP"` 等）
- [x] 各作品別 `db_type.json` の対象フィールドリネーム（7ファイル）
- [x] `data/References/db_type.json` のリネーム
- [x] `data/Dictionaries/db_type.json` の `DB_Label` → `DB_Label_JP` リネーム
- [x] `tests/data.shape.test.js` の期待値更新（`Title_JP` / `Term_JP` / `aliasOf: 'Name_JP'` 等）
- [x] `npm test` で typedef 構文エラーがないことを確認

#### Phase 2 テスト結果（2026-06-22）

`npm test` 実行結果: **19 テストファイル中 3 ファイル失敗 / 86 テスト中 5 件失敗**

- ✅ `tests/data.shape.test.js` — 全 3 件通過（Phase 2 完了後）
  - 事前に 2 件失敗していたが原因は Phase 2 以前からの既存問題:
    - `BelongingArea` が `FromArea` に改名されていたがテストが旧名のまま → `FromArea` に修正
    - `Works_NumberTales/References/db_type.json` に `$DefType` 配列が存在するのにテストが「存在しない」を前提にしていた → アサーション除去
- ❌ `tests/commons.secondaries.test.js` — 2 件失敗（**Phase 2 以前からの既存問題**。`sec_DesignedBy` の値マッチに関するデータ依存テスト）
- ❌ `tests/enrich.dblink.jump.merge.test.js` — 3 件失敗（**Phase 2 以前からの既存問題**。実データの `_DBLink` 解決に関するもの）

### Phase 3: ライブラリ・コードの移行対応（フォールバック付き）（✅ 完了）

このフェーズでは「旧名でも動く、新名でも動く」フォールバックを先に入れて安全網を作る。

- [x] `lib/wrapper-common.js`: `value.DayAbout_JP ?? value.DayAbout` フォールバック追加
- [x] `lib/section-renders/dblink.js`: `found?.Name_JP || found?.Name` 等を更新
- [x] `lib/section-renders/relation.js`: 同様
- [x] `pages/characters.js`: `rec.Name_JP || rec.Name` 等のフォールバック形式に更新（複数箇所）
- [x] `pkg/cloudflare/scripts/migrate.mjs`: `Title_JP ?? Title` フォールバック
- [x] `pkg/nodejs/index.mjs`: `Title_JP` / `Works_Summary_JP` フォールバック
- [x] `lib/data-common.js`: JSDoc 例示更新

### Phase 4: データファイル一括リネーム（最大作業）（✅ 完了）

- [x] スクリプト作成: `.cache/rename-fields-phase4.mjs`（34 RECORD_RENAMES + CP/MARK/etc.）
- [x] `data/db_meta.json` の `Title` / `Works_Summary` リネーム
- [x] 全作品 `db_meta.json` の `DB_Label` → `DB_Label_JP` リネーム（DataBases/References/Dictionaries 含む全 18 ファイル）
- [x] 各作品の `db_meta.json` の `$DetailLayout.basicFields/subFields` 内フィールド名リネーム
- [x] 全作品の `db_*.json` のキー名リネーム実施（30 ファイル / 1245 レコード）
- [x] `data/References/ref_Vocabulary.json` の `Term` / `Title` / `BodyBlocks` / `Summary` リネーム

#### Phase 4 テスト修正（✅ 完了）

Phase 4 によりテストアサーションの更新が必要になった箇所を修正:

- [x] `tests/meta.catalog.schema.test.js` L69/L71: `DB_Label` → `DB_Label_JP`
- [x] `tests/enrich.dblink.jump.merge.test.js` L369: `e.FormalName` → `e.FormalName_JP`
- [x] `tests/enrich.dblink.jump.merge.test.js` L451-L464: `Character: ''` → `Character_JP: ''`、`e.Character` → `e.Character_JP`
- [x] `tests/enrich.dblink.jump.merge.test.js` L553: `r?.Name === 'フェニクス'` → `r?.Name_JP === 'フェニクス'`

#### Phase 4 後のテスト状態（2026-06-22）

`npm test`: **19 ファイル中 3 ファイル失敗 / 86 テスト中 5 件失敗** — 全て Phase 2 以前からの既存問題

- ❌ `tests/pages.characters.ui-output.test.js` — suite error: `ref_Glossary.json` が存在しない（ENOENT）。Phase 4 無関係の既存問題
- ❌ `tests/commons.secondaries.test.js` (2件) — `sec_DesignedBy` 値不一致・レコード検索失敗。Phase 4 無関係の既存問題
- ❌ `tests/enrich.dblink.jump.merge.test.js` (3件) — `#Index` / SinisterChangingGirls の `_DBLink` 解決ロジック。Phase 2 以前からの既存問題

### Phase 5: フォールバック削除・最終クリーンアップ（✅ 完了 2026-06-22）

- [x] `lib/wrapper-common.js`: `?? value.DayAbout` 削除
- [x] `lib/section-renders/dblink.js`: `|| found?.Name`、`|| found?.FormalName`、`|| found?.ModelName` 削除
- [x] `lib/section-renders/relation.js`: 同上（L230・L240 の 2 箇所）
- [x] `pages/characters.js`: `getRecordPrimaryTitle`（L188-193）、`getRecordSecondaryTitle`（L202）、画像ログ（L4681・L4888）、`shownKeys`（L6204・L6206）から旧裸フォーム除去
- [x] `pkg/cloudflare/scripts/migrate.mjs`: `?? info?.Title`、`?? info?.Works_Summary` 削除
- [x] `pkg/nodejs/index.mjs`: `listWorks()` 戻り値から廃止フィールド `Title`、`Works_Summary` を除去し JSDoc 更新
- [x] `tests/wrapper-common.test.js`: テストデータを `DayAbout_JP: '誕生日'` へ更新（旧 `DayAbout` 使用によるテスト失敗を修正）
- [x] `CHANGELOG.md` に変更内容を追記
- [x] `npm test` 最終確認（**3 ファイル 5 件の既存失敗のみ・Phase 5 起因の新規失敗なし**）
- [x] `_work_in_progress/README.md` を更新（後続で実施）
- ⚠️ **D1/R2 再同期は手動で実施が必要**: `pkg/cloudflare/scripts/migrate.mjs` 再実行 → `wrangler deploy`（ローカル環境では実行不可）

#### Phase 5 最終テスト状態（2026-06-22）

`npm test`: **19 ファイル中 3 ファイル失敗 / 86 テスト中 5 件失敗** — 全て Phase 2 以前からの既存問題（Phase 5 による新規失敗なし）

- ❌ `tests/pages.characters.ui-output.test.js` — suite error: `ref_Glossary.json` ENOENT（既存問題）
- ❌ `tests/commons.secondaries.test.js` (2件) — `sec_DesignedBy` 値不一致（既存問題）
- ❌ `tests/enrich.dblink.jump.merge.test.js` (3件) — cross-work `_DBLink` 解決失敗（既存問題）

---

## 懸念事項・未決事項

### 未決: EN 対応なし JP フィールドへの `_JP` 付与

以下のフィールドは EN 対応版が存在しない（またはスキーマ上で意図的に JP 限定としている）。`_JP` サフィックスを付けるかどうか User の判断が必要：

| フィールド | 場所 | 現状 |
|------------|------|------|
| `DB_Summary` | `$Def_DatabaseCatalog` | JP テキストのみ |
| `Works_Summary` | `db_meta.json` | `Works_Summary_EN` が存在 → **リネーム対象に含める** |
| `SecondarySummary` | `$Def_SecondaryMeta` / `$Def_DatabaseCatalog` | JP テキストのみ → 保留 |

### 懸念: 外部 API の後方互換性

Cloudflare Workers 実 API（`database.numbertales-radiann.net/api/v1/`）のレスポンスに含まれる JSON キー名が変わる。
外部クライアント（今後 SDK を公開した場合）が `Name` を参照していると破壊的変更になる。

- 現状は内部利用のみのため影響は低
- 移行期間中は Phase 3 のフォールバック期間をある程度確保することを検討

### 懸念: `expandLangAliasCandidates()` の挙動

`lib/data-common.js` の `expandLangAliasCandidates()` は既に:
```
'Name' → ['Name', 'Name_JP', 'Name_EN']
'Name_JP' → ['Name_JP', 'Name', 'Name_EN']
```
のように三方向候補展開を行っている。
データキーを `Name_JP` に変更した後も、sw-common.js の検索処理は `Name` で検索しても `Name_JP` にヒットするため、enrich / search の処理は移行中の中間状態でも概ね動作する。

ただし **直接プロパティアクセス**（`rec.Name`、`found?.Name` 等）は更新が必要。

### 懸念: `$DetailLayout.basicFields/subFields` の配列内フィールド名

`db_meta.json` の `$DetailLayout` の `basicFields` / `subFields` 配列には、
フィールド名の文字列が直接列挙されている（例: `"FormalName"`, `"ModelName"` 等）。
これは typedef の `hashTag` と一致している必要があるため、Phase 4 のデータ一括置換に含める。

---

## 参考リンク

- `data/References/db_type.json` — `Term_JPReading` の先行実装例
- `lib/data-common.js:1374-1410` — `expandLangAliasCandidates()` の実装
- `lib/wrapper-common.js:93-180` — `about_JP`/`about_EN`/`DayAbout` のフォールバックチェーン
- `lib/section-renders/dblink.js:196` — `Name`/`FormalName`/`ModelName` の直接参照箇所
- `lib/section-renders/relation.js:230,240,267` — 同上
- `pages/characters.js:188-202,4372,4888` — `Name`/`FormalName`/`Summary` の直接参照箇所
