# Localization DB — Summary 入力進捗ログ

## 目的

各 trans_Dict の `Summary_JP` / `Summary_EN` フィールドへのユーザー入力待ちエントリを管理する。
Claude は創作内容・設定文を自動生成しないため、値はユーザーが手動で順次入力する。

## 完了の定義

- `Summary_JP` と `Summary_EN` の両方が入力済みであればチェック `[x]`
- 片方のみ（JP だけ等）の場合は `[~]` で区別

---

## 優先度 ★★★ — グローバル dict / 地名（クロスワーク共通）

ファイル: `data/Localization/trans_PlaceName.json`

地名は複数作品にまたがる設定の起点になるため、最初に揃えると後続エントリに一貫性が出る。

| 状態 | Term_JP                    | Term_EN                 | Scope（主な登場）                        |
| ---- | -------------------------- | ----------------------- | ---------------------------------------- |
| [x]  | 九蓮国                     | LotusNinea              | NT / FL78 / UnauthedLogica / UnibyteLive |
| [ ]  | 龍天国                     | LóngTiān's.Republic     | ShouArRiders                             |
| [ ]  | 英皇国                     | Internic.Kingdom        | FL78                                     |
| [ ]  | 雄志結国                   | United.Heroic.Nation    | 全作品共通                               |
| [ ]  | 海陸国(シーバイランド)諸島 | Seabyislands            | 未定                                     |
| [ ]  | 紅雪連邦                   | United.SnowRed.Republic | UnauthedLogica                           |
| [ ]  | 四蓮島                     | LotasQuadrup.Island     | 未定                                     |
| [ ]  | 黒薔薇国                   | SchwarzeRoseland        | 未定                                     |
| [ ]  | 神皇国                     | SaintPapis              | 未定                                     |
| [ ]  | 算象(アリスマ)諸国         | Alismathians            | 未定                                     |
| [ ]  | 金源(アウルムゲン)諸国     | Aurumgenics             | 未定                                     |
| [ ]  | 南雌(イヴソース)大陸       | Evesouth Mainland       | 未定                                     |
| [ ]  | 然天(ネーザ)大陸           | Naitus Mainland         | 未定                                     |

---

## 優先度 ★★ — グローバル dict / クロスワーク人物名

ファイル: `data/Localization/trans_PersonName.json`

複数作品に登場するキャラクターのため、ひと言説明があると翻訳・参照時に便利。
**設定未確定の人物については入力を急がなくてよい。**

| 状態 | Term_JP             | Term_EN            | 主な登場作品                   |
| ---- | ------------------- | ------------------ | ------------------------------ |
| [ ]  | 零 零               | Zera Norumber      | NT / UnauthedLogica / SCG      |
| [ ]  | 千歳 玲             | Zeena Thouser      | NT                             |
| [ ]  | 零 百               | Hudret Norumber    | NT / UnauthedLogica            |
| [ ]  | 千歳 励             | Hadler Thouser     | NT                             |
| [ ]  | 扇 三春             | Mikhail Arch       | SCG                            |
| [ ]  | 六花 ルノ           | Luno Hexacrys      | PD / SCG                       |
| [ ]  | 九 叶               | Canna Ninie        | SCG / ShouArRiders             |
| [ ]  | 六花 雙葉           | Dozenne Hexacrys   | SCG / UnauthedLogica           |
| [ ]  | クィーン.トゥエルヴ | Queen.XII          | SCG / UnauthedLogica           |
| [ ]  | ミル.ニュクスフ     | Lamill.NuXV        | SCG                            |
| [ ]  | 神夜崎 ユノ         | Juno Theolessnight | PD / SCG                       |
| [ ]  | 財前 小里           | Foster Empressor   | SCG / PD / ShouArRiders / FL78 |
| [ ]  | 終藤 こさと         | Formar Endrof      | SCG / PD / ShouArRiders / FL78 |

> 略称: NT=NumberTales, FL78=FLInvestigator78, SCG=SinisterChangingGirls, PD=PastDivers

---

## 優先度 ★★ — DestinyFoxRecords / SI 単位キャラ

ファイル: `data/Works_DestinyFoxRecords/Localization/trans_PersonName.json`

SI 基本単位に基づく命名体系。Term_EN の `_SI-X` サフィックスに次元記号が含まれるが、
Summary に「何の単位か」を明記すると辞書としての利便性が増す。

| 状態 | Term_JP  | Term_EN      | SI 単位 / 次元          |
| ---- | -------- | ------------ | ----------------------- |
| [ ]  | セコンド | Second_SI-T  | 秒 / 時間 T             |
| [ ]  | メトレ   | Metre_SI-L   | メートル / 長さ L       |
| [ ]  | キログラ | Kilogra_SI-M | キログラム / 質量 M     |
| [ ]  | カンデラ | Candela_SI-J | カンデラ / 光度 J       |
| [ ]  | ケルビン | Kelvin_SI-Θ  | ケルビン / 熱力学温度 Θ |
| [ ]  | アンプ   | Amp'\_SI-I   | アンペア / 電流 I       |
| [ ]  | モル     | Mol_SI-N     | モル / 物質量 N         |
| [ ]  | ラジアン | RadianN      | —                       |
| [ ]  | ステラ   | Srera'N      | —                       |

---

## 優先度 ★☆ — ShouArRiders / 現象

ファイル: `data/Works_ShouArRiders/Localization/trans_Phenomenon.json`

`ref_Vocabulary.json` に詳細解説あり。trans_Dict の Summary はあくまで補助的な一言説明で十分。

| 状態 | Term_JP | Term_EN        | 備考                       |
| ---- | ------- | -------------- | -------------------------- |
| [ ]  | 山月病  | Shanyu Disease | 詳細は ref_Vocabulary 参照 |

---

## 優先度 ★☆ — FLInvestigator78 / 現象・能力

ファイル: `data/Works_FLInvestigator78/Localization/trans_Phenomenon.json`（運命線・未来消失・アルカナ）、`data/Works_FLInvestigator78/Localization/trans_Ability.json`（アルカナムスペック）

| 状態 | Term_JP            | Term_EN        | 備考                             |
| ---- | ------------------ | -------------- | -------------------------------- |
| [ ]  | 運命線             | FateLine       | 作品名にも含まれる中心概念       |
| [ ]  | 未来消失           | Future Erasure | —                                |
| [ ]  | アルカナ           | Arcana         | タロット78枚に基づく能力体系     |
| [ ]  | アルカナムスペック | ArcanumSpec    | アルカナを用いた特殊能力の総称か |

---

## 将来対応 — グローバル dict / 第1〜7界 個別 Summary

ファイル: `data/Localization/trans_ProperNoun.json`

現状は全件同一テキスト（「この創作世界の外部にある」）。
世界観の設定が固まった段階でそれぞれ個別の説明を入力する。

| 状態 | Term_JP | Term_EN   | 現在の Summary（仮）     |
| ---- | ------- | --------- | ------------------------ |
| [ ]  | 第１界  | #REGION.1 | この創作世界の外部にある |
| [ ]  | 第２界  | #REGION.2 | この創作世界の外部にある |
| [ ]  | 第３界  | #REGION.3 | この創作世界の外部にある |
| [ ]  | 第４界  | #REGION.4 | この創作世界の外部にある |
| [ ]  | 第５界  | #REGION.5 | この創作世界の外部にある |
| [ ]  | 第６界  | #REGION.6 | この創作世界の外部にある |
| [ ]  | 第７界  | #REGION.7 | この創作世界の外部にある |

---

## 既存 Summary の参考（入力済み）

グローバル dict 内で既に Summary があるエントリ。入力スタイルの参考に。

| Term_JP                  | Summary_JP（現状）             | Summary_EN（現状）                                         |
| ------------------------ | ------------------------------ | ---------------------------------------------------------- |
| 第８界                   | この創作世界全域を意味する     | Refers to the entire creation world                        |
| 第１〜７界               | この創作世界の外部にある       | Outside of the creation world                              |
| 超次元執筆空間(アトリエ) | 創作世界には属されない特殊空間 | A special space that does not belong to the creation world |
