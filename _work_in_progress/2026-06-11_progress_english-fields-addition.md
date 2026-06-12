# 2026-06-11 進捗レポート：英訳フィールド追加依頼（完全英訳フィールド対応）

## 目的

全作品の DB・参照系データおよびグローバル/作品別 `db_type.json` に対して、
既存の日本語フィールドに対応する英訳フィールド（`*_EN`）を横断的に追加する。
bilingual 表示・参照・将来的な多言語対応の土台づくりが目的。

---

## コミット別 変更内容

### その１（`84e7c6d` / 2026-06-11 13:12）

#### グローバル `data/db_type.json`

以下の英訳フィールド定義を新規追加（`$type`: `#String_EN` / `#Summary|#Null` 等）:

| 追加フィールド           | 対応するJP側       |
| ------------------------ | ------------------ |
| `FirstPersonCalling_EN`  | 一人称             |
| `SecondPersonCalling_EN` | 二人称             |
| `ThirdPersonCalling_EN`  | 三人称             |
| `ForMasterCalling_EN`    | 主人の呼び方       |
| `Character_EN`           | 性格               |
| `Hobby_EN`               | 趣味               |
| `SpecialSkill_EN`        | 特技               |
| `Favor_EN`               | 好きなもの         |
| `Unlike_EN`              | 嫌いなもの         |
| `Strength_EN`            | 強み               |
| `Weakness_EN`            | 弱み               |
| `TalkingTone_EN`         | 口調               |
| `TopicPreference_EN`     | 話題好感度         |
| `TalkFrequency_EN`       | 会話頻度           |
| `PreferredTopics_EN`     | やりがちな話題     |
| `AvoidedTopics_EN`       | 避けがちな話題     |
| `ConversationNotes_EN`   | 会話における補足   |
| `RelationNotes_EN`       | 関連性について     |
| `Summary_EN`             | 概要・紹介文       |
| `Backgrounds_EN`         | キャラクターの背景 |
| `InStory_EN`             | 作中では           |

#### 作品別 `db_type.json`（6作品）

| ファイル                                        | 追加フィールド                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `Works_NumberTales/DataBases/db_type.json`      | `ForMasterCalling_EN`, `TailsUnit_EN`, `NumerospecAbout_EN`                   |
| `Works_FLInvestigator78/DataBases/db_type.json` | `For79thDealerCalling_EN`, `For80thDealerCalling_EN`, `ArcanamspecAbout_EN`   |
| `Works_ShouArRiders/DataBases/db_type.json`     | `BeastspecName_EN`, `BeastspecAbout_EN`                                       |
| `Works_UnauthedLogica/DataBases/db_type.json`   | `ForMasterCalling_EN`, `LogicspecAbout_EN`                                    |
| `Works_UnibyteLive/DataBases/db_type.json`      | `AccessoryUnit_EN`, `StreamingCategory_EN`, `StreamingSummary_EN`             |
| `Works_PastDivers/DataBases/db_type.json`       | `Career_EN`, `ChronoholderName_EN`, `ChronospecName_EN`, `ChronospecAbout_EN` |

#### データファイル（実データへの英訳追加）

| ファイル                                                 | 内容                                                  |
| -------------------------------------------------------- | ----------------------------------------------------- |
| `Works_FLInvestigator78/DataBases/db_Primary.json`       | 複数キャラに `ArcanamspecAbout_EN`, `Summary_EN` 追加 |
| `Works_FLInvestigator78/DataBases/db_PrimaryDealer.json` | `ArcanamspecAbout_EN`, `Summary_EN` 追加              |
| `Works_NumberTales/DataBases/db_Primary.json`            | 冒頭数件（1番機など）への英訳フィールド追加           |
| `Works_Proxies/DataBases/db_Proxy.json`                  | 英訳フィールド追加（途中）                            |
| `Works_ShouArRiders/DataBases/db_Primary.json`           | `BeastspecAbout_EN`, `Summary_EN` 等を追加            |
| `Works_SinisterChangingGirls/DataBases/db_Primary.json`  | `Summary_EN` 等を追加                                 |
| `Works_UnauthedLogica/DataBases/db_Primary.json`         | `LogicspecAbout_EN`, `Summary_EN` 等を追加            |
| `Works_UnauthedLogica/DataBases/db_PrimaryMobs.json`     | 同様の英訳フィールド追加                              |
| `Works_UnibyteLive/DataBases/db_Primary.json`            | `AccessoryUnit_EN`, `StreamingSummary_EN` 等を追加    |

---

### その２（`3941a10` / 2026-06-11 13:59）

| ファイル                                     | 内容                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| `Works_PastDivers/DataBases/db_Primary.json` | 全キャラへ `Career_EN`, `ChronospecAbout_EN`, `Summary_EN` 等を大量追加（+83行） |

---

### その３（`898c2aa` / 2026-06-11 14:36）

| ファイル                                                 | 内容                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `data/References/db_type.json`                           | `BodyBlocks_EN`, `Summary_EN` の定義を追加                                        |
| `Works_NumberTales/References/ref_Glossary.json`         | 複数エントリに `Summary_EN`（英語説明文）を追加                                   |
| `Works_NumberTales/References/ref_Reference.json`        | `Summary_EN` 追加                                                                 |
| `Works_Proxies/DataBases/db_Proxy.json`                  | その１の続き: 英訳フィールド追加                                                  |
| `Works_FLInvestigator78/DataBases/db_PrimaryDealer.json` | 微修正                                                                            |
| `Works_SinisterChangingGirls/DataBases/db_Primary.json`  | 微修正                                                                            |
| `data/db_type.json`                                      | 微修正（表記修正）                                                                |
| **`pages/characters.js`**                                | **インデントをスペース→タブへ一括変換（ロジック変更なし、フォーマット整形のみ）** |

---

### その４（`3179930` / 2026-06-11 15:37）

| ファイル                                      | 内容                                                       |
| --------------------------------------------- | ---------------------------------------------------------- |
| `Works_PastDivers/DataBases/db_Primary.json`  | 追加英訳フィールド補完（+17行）                            |
| `Works_PastDivers/DataBases/db_type.json`     | `ChronoizedPurity_EN`, `ChronoizedAbout_EN` 等の定義を追加 |
| `Works_UnibyteLive/DataBases/db_Primary.json` | 追加英訳フィールド補完                                     |
| `Works_UnibyteLive/DataBases/db_type.json`    | 対応する型定義の追加                                       |

---

### その５（`bda82e5` / 2026-06-11 17:49）

| ファイル                                     | 内容                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Works_NumberTales/DataBases/db_Primary.json` | 英訳フィールドの追加・更新を大幅実施（Num9/10 まわりの `ConversationPattern` 英訳整備を含む） |
| `Works_Proxies/DataBases/db_Proxy.json`       | 英訳フィールドの補完・調整                                                               |

- 変更規模: 2 files changed, 351 insertions(+), 78 deletions(-)

---

### その６（`6935159` / 2026-06-11 18:19）

| ファイル                                      | 内容                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Works_NumberTales/DataBases/db_Primary.json` | 英訳フィールドを追加・更新（Num11〜13 のトップレベル英訳補完、Num14/20/22 の英訳追記・整備を含む） |

- 変更規模: 1 file changed, 210 insertions(+), 37 deletions(-)

---

## 影響範囲（変更ファイル一覧）

| 区分                                                                                          | ファイル数              |
| --------------------------------------------------------------------------------------------- | ----------------------- |
| グローバル schema (`data/db_type.json`, `data/References/db_type.json`)                       | 2                       |
| 作品別 schema (`*/db_type.json`)                                                              | 6                       |
| 実データ (`db_Primary.json`, `db_PrimaryDealer.json`, `db_Proxy.json`, `db_PrimaryMobs.json`) | 9                       |
| 参照系データ (`ref_Glossary.json`, `ref_Reference.json`)                                      | 2                       |
| UI (`pages/characters.js`)                                                                    | 1（インデント整形のみ） |
| **合計**                                                                                      | **20ファイル**          |

## 未完了タスク

- 他作品・他 DB（`Works_DestinyFoxRecords`, `Works_FLInvestigator78` の一部 DB など）への横展開要否の確認
- `Summary_EN` / 各補助フィールドの表記ゆれ・翻訳品質確認（User 監修待ち）
- bilingual 表示 UI 側の動作確認（`value_JP` / `value_EN` 形式の `DialogueExamples` への対応含む）
- `pages/characters.js` のインデント変更によるテスト影響の確認

## テスト確認

- 現時点では未実行
- `npm test` で影響範囲が広い場合は、以下を先に絞って確認:
  - `tests/bilingual-fields.test.js`
  - `tests/data.sanity.test.js`
  - `tests/data.shape.test.js`

## 参考リンク

- 関連方針: `docs/schema-meta-processing.md`
- bilingual 表示参照: `docs/wrapper-summary-registry.md`
- 会話パターン英訳の運用制約: `.github/copilot-instructions.md` §会話パターン情報追加時の運用制約
