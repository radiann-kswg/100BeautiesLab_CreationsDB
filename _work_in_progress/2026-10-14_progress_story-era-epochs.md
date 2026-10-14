# 2026-10-14 進捗: 創世紀元年の meta 宣言と `YearInEra` の統一、`StoryEra` / `Age` 整合テスト

- 作業環境: `main`（本体ローカル）/ ブランチ `develop`
- 状態: 実装完了・`npm test` 通過（末尾「検証」参照）。
  - 初版（元年の meta 宣言・`YearInEra` 統一・テスト・formatter）は User の推敲を含めて `0f01a5c6`「DB全体meta設定整備(年代設定周り) その１」でコミット済み。本ログの「データ」節は**その推敲後の最終状態**（作業前 `eaf9c85e` → `0f01a5c6` の正味差分）で記述している。
  - その後 User の指示で `Age` 照合ルールを「誕生年の一貫性」へ組み替えた（`tests/data.story-era.test.js` / `docs/schema-meta-processing.md` §4.4 / `CHANGELOG.md` / 本ログ。2026-10-14 時点で未コミット）。

## 目的

1. テスト回路で次を検証できるようにする。
   - `Age`（`ConceptAge` ではなく、`hideText` で注釈化されていない数値の年齢）が、その DB の `db_meta.json` `StoryEra.InEra[].byRealYear` と対応しているか（実装は後述「誕生年の一貫性」）。
   - `StoryEra` の各点で、`EraGen`（創世紀）の元年（`YearInEra: 1` の `byRealYear`）に対する `YearInEra` の相対年数が `byRealYear` と一貫しているか（第8創世紀以降へ遷移しない作品があるため、記載された `EraGen` ごとの相対年数だけを見る）。
2. `byRealYear` を変えずに `YearInEra` を次の元年へ統一する: 第6=1995 / 第7=2021 / 第8=2046 / 第9=2050。
3. （User 追記）創世紀元年を meta で定義する。

## 合意事項・判断

- **元年の宣言場所**: グローバル `data/db_meta.json` の `General.StoryEraEpochs`。既存の `$Def_StoryEra` 型をそのまま使い、`YearInEra: 1` の点を並べる（新しい typedef は増やさない）。
- **元年より前の年**: `YearInEra` を負数で表す。`-1` = 元前1年（元年の前年）、0 年は無い。
  - 最終状態で元前になっている点: FLInvestigator78 Primary / PrimaryDealer の `InEra`（2045 = 第8創世紀元前1年。第7創世紀25年を併記）、PastDivers SemiPrimary の `InEra`（同）。
  - UnibyteLive は初版で第9創世紀元前 / 第8創世紀元前の点があったが、User の推敲で第7・第8創世紀表記へ一本化され元前は無くなった（下表）。UnauthedLogica PrimaryMobs の About 文言にあった「第8創世紀元前1〜」も User が外した。
  - 表示: `eraSummary` が「第8創世紀元前1年 / 西暦2045年」「Gen.8 BCE 1 / 2045 CE」を出す。
- **`Age` の照合方法（User 指示で確定）**: 実年齢キャラクター = 「`$enrich: true` の `*_DBLink` で参照していて」「`Age`（数値）と `BirthDay` に値があり」「`ConceptAge` / `AnivDay`（実年齢・生誕日に相当しない項目）に値が無い」レコード。DB ごとの `InEra.byRealYear - Age` で西暦相当の誕生年を割り出し、参照先の誕生年と一致することを見る。
  - 参照先側は `Age` が数値で `ConceptAge` / `AnivDay` を持たないことだけ要求し、`BirthDay` は要求しない（enrich で参照元から穴埋めされ得るため。例: 錦野姉妹の NumberTales SemiPrimary 側は `BirthDay` 未入力）。
  - 対象リンクは typedef（グローバル + 作品別 `db_type.json` の `$DefType`）から `$enrich: true` の `*_DBLink` を拾う（固定リストにしない）。UnibyteLive の `ThisPerformer_DBLink`（アバター→演者、別人）は、アバター側に `BirthDay` が無いので上の条件で自然に除外される。
  - `_Secondaries[].StoryEra`（`sec_SeriesTitle` 分岐の InEra）は年齢照合では未解決（Secondary 系レコードは全て `ConceptAge` のため現状影響なし）。元年整合の方は `_Secondaries[].StoryEra` も走査対象。
- **`StoryEraAbout_JP/EN` の文言**: 初版では `YearInEra` を書き換えた点に対応する年数表記だけを機械的に追従させ、その後 User が各作品の年代構成ごと推敲して `0f01a5c6` で確定した（下表は確定後の文言）。UI は構造値より `StoryEraAbout_*` を優先表示するため、構造値と文言は常に揃えておく。

## 変更点の要約

### データ（作業前 `eaf9c85e` → `0f01a5c6` の正味差分。`YearInEra` の元年基準統一 + User の年代構成推敲）

| 作品 / DB | `StoryEra` 構造の変更（旧 → 新） | `StoryEraAbout_JP`（新） |
| --- | --- | --- |
| FLInvestigator78 Primary / PrimaryDealer | ToEra: 第8創世紀2年＋第7創世紀26年 @2046 → **第8創世紀3年 @2048**（終了年代を 2048 へ・第7表記を外す）/ InEra: 第8創世紀 1 → **-1**（元前1年）@2045（第7創世紀25年は維持） | 「第7創世紀24年〜第8創世紀3年(西暦2044〜2048年相当)…」 |
| FLInvestigator78 MinorArcana / MinorsDealer | **`StoryEra` を新設**: FromEra 第8創世紀1年 @2046 / ToEra 第8創世紀3年 @2048 / InEra 第8創世紀1年＋第7創世紀26年 @2046 | 「第7創世紀26年〜第8創世紀3年(西暦2046〜2048年相当)」 |
| NumberTales Primary | 第8: 6→5 @2050, 7→6 @2051 / 第9: 3→1 @2050, 4→2 @2051 | 「第8創世紀5〜6年(第9創世紀1〜2年,西暦2050〜2051年相当)」 |
| NumberTales SemiPrimary | 第8: 6→5 @2050, 8→7 @2052, 7→6 @2051 / 第9: 3→1, 5→3 | 「第8創世紀5〜7年(第9創世紀1〜3年,西暦2050〜2052年相当)」 |
| NumberTales Secondary `_Secondaries[0]` | 第8: 7→6 / 第9: 4→2 @2051 | 「第8創世紀6年(第9創世紀2年,西暦2051年相当)周辺」 |
| NumberTales Secondary `_Secondaries[1][2]` / SelfSecondary `_Secondaries[2]` | 第8: 8→7 / 第9: 5→3 @2052 | 「第8創世紀7年(第9創世紀3年,西暦2052年相当)周辺」 |
| PastDivers Primary | 第8: 3→2 @2047, 4→3 @2048 | 「第8創世紀2〜3年(西暦2047〜2048年相当)」 |
| PastDivers SemiPrimary | ToEra 第8: 2→1 @2046 / InEra 第8: 1→**-1** @2045（第7創世紀 24/25/26 は維持） | 変更なし（第7創世紀表記のみで整合済み） |
| SinisterChangingGirls Primary / SemiPrimary | 第9: 3→1 @2050 / 6→4 @2053 | 「第9創世紀1年(西暦2050年相当)周辺」/「第9創世紀4年(西暦2053年相当)周辺」 |
| UnauthedLogica PrimaryMobs | FromEra 第7: 23→24 @2044 / ToEra: 第7創世紀31年＋第8創世紀7年 @2051 → **第7創世紀31年のみ**（第8表記を外す） | 「第7創世紀24〜31年(西暦2044〜2051年相当)」（旧「(第8創世紀元前1〜第8創世紀7年,…」の括弧内を削除） |
| UnauthedLogica Primary | 第8: 4→3 @2048, 7→6 @2051, 5→4 @2049（第7創世紀 28/29/31 は維持） | 「第7創世紀28〜31年(第8創世紀3〜6年,西暦2048〜2051年相当)」 |
| UnibyteLive Primary | FromEra: 第8創世紀2年 @2046 → **第8創世紀2年＋第7創世紀27年 @2047**（開始年代を 2047 へ）/ ToEra: 第9創世紀6年 @2053 → **第8創世紀8年**（第9表記を外す）/ InEra: 第9創世紀2年＋第8創世紀5年 @2049 → **第8創世紀4年のみ** | 「第8創世紀2〜第8創世紀8年(西暦2047〜2053年相当)」 |
| UnibyteLive PrimaryPerformer | FromEra: 第8創世紀1年 @2045 → **第7創世紀25年**（元前を避け第7で数える）/ ToEra: 第9創世紀6年 @2053 → **第8創世紀8年** / InEra: 第9創世紀2年＋第8創世紀5年 @2049 → **第8創世紀4年のみ** | 「第7創世紀25〜第8創世紀8年(西暦2045〜2053年相当)」 |
| VirtuesUs SemiPrimary | 第8: 6→5 @2050 | 「第8創世紀5年(西暦2050年相当)周辺」 |
| ShauErRiders Primary | 構造は変更なし（第7: 19/21/23 @2039/2041/2043 は元から整合） | About 文言のみ User が修正: 「第6創世紀3年(西暦1985年相当)」→「第6創世紀4年(西暦1998年相当)」（元年 1995 と整合） |

- 同コミットに含まれるその他の User 推敲: SinisterChangingGirls SemiPrimary の `DB_Summary` / `DB_Summary_EN` 文言（「アンソロジーキャラクター」表記）。`StoryEra` とは無関係。
- 第9創世紀表記が残っているのは NumberTales（第8と併記）と SinisterChangingGirls（第9のみ）。UnibyteLive は第8創世紀までで数える構成になった。

### フレームワーク

- `data/db_meta.json`: `General.StoryEraEpochs` を追加（`$VarsDef` の前）。
- `lib/wrapper-common.js` `formatEraSummary`: 負の `YearInEra` → 「元前M年」/「BCE M」。
- `tests/data.story-era.test.js`（新規。元年整合 + 誕生年の一貫性）/ `tests/wrapper-common.test.js`（元前表示のケース追加）/ `tests/meta.catalog.schema.test.js`（NumberTales Primary の `FromEra[0]` 期待値 6→5）。
- `docs/schema-meta-processing.md` §4.4 / `docs/wrapper-summary-registry.md` / `CHANGELOG.md`。

## 影響範囲（編集したファイル）

- `data/db_meta.json`
- `data/Works_FLInvestigator78/DataBases/db_meta.json`
- `data/Works_NumberTales/DataBases/db_meta.json`
- `data/Works_PastDivers/DataBases/db_meta.json`
- `data/Works_ShauErRiders/DataBases/db_meta.json`（User の About 文言修正）
- `data/Works_SinisterChangingGirls/DataBases/db_meta.json`
- `data/Works_UnauthedLogica/DataBases/db_meta.json`
- `data/Works_UnibyteLive/DataBases/db_meta.json`
- `data/Works_VirtuesUs/DataBases/db_meta.json`
- `lib/wrapper-common.js`
- `tests/data.story-era.test.js`（新規）/ `tests/wrapper-common.test.js` / `tests/meta.catalog.schema.test.js`
- `docs/schema-meta-processing.md` / `docs/wrapper-summary-registry.md` / `CHANGELOG.md`
- `_work_in_progress/2026-07-25_remaining-task.md`（索引行追加）

## 検証

- `tests/data.story-era.test.js`: 元年整合（全作品の `StoryEra` 点。`0f01a5c6` の推敲後構成で再確認済み）と `Age` 照合（誕生年の一貫性）が通ること。
- `npm test`（Vitest 全件）: 初版 2026-10-14 11:59 JST、誕生年ルール版 12:32 JST ともに 77 files / 1400 tests すべて通過。誕生年ルール版の照合組数は 11 組（参照元 = 実年齢キャラ、参照先 = `Age` 数値かつ `ConceptAge` / `AnivDay` 無し）、不一致 0。照合された人物: 錦野 舞 / 歌嫁（2028 年生）、零 零（2025）、桜花 信（2029）/ 礼（2023）/ 孝（2030）、六花 ルノ（2025）/ 雙葉（2023）。
- `npx prettier --check` を変更した `db_meta.json` 全件に対して実行し、整形差分が無いことを確認（初版時点）。
- 実機目視（キャラシートの DB 概要欄で「第8創世紀元前1年 / 西暦2045年」の表示）は未実施。

## 未完了タスク・申し送り

- 誕生年ルール版（`tests/data.story-era.test.js` / `docs/schema-meta-processing.md` §4.4 / `CHANGELOG.md` / 本ログ）のコミット。
- 年齢照合の対象リンクは `$enrich: true` の `*_DBLink` 全部（typedef 駆動）。`$enrich: false` のリンク（`AnotherVersions_DBLink` 等）を含めたくなったら typedef 側の判断。
- `_Secondaries[].StoryEra` の InEra を年齢照合で解決する処理は、Secondary 系に実年齢キャラクターが入ったら追加。
- `$MetaType` に `General` 用の typedef は増やしていない（`StoryEraEpochs` は既存 `$Def_StoryEra[]` の再利用として docs に記載）。宣言面を厳密にしたくなったら `$MetaType` へ `$Def_GeneralMeta` 相当を足す。
- 下流（JsonCharacterDB-Framework）へ: `tests/data.story-era.test.js` は `General.StoryEraEpochs` と `$enrich: true` の `*_DBLink` の実データ前提。該当データが無い下流は同テストを除外対象に加える（CHANGELOG 参照）。

## 参考リンク

- `docs/schema-meta-processing.md` §4.4（`StoryEra` と元年の規約）
- `docs/wrapper-summary-registry.md`（`eraSummary`）
- `CHANGELOG.md` 2026-10-14 エントリ
- コミット `0f01a5c6`（初版 + User 推敲）
