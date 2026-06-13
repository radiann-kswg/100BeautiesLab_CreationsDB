# 2026-06-12 統合進捗ログ：英訳ルール完全改稿（localize-perfection 実データ正準版）

## 目的

この文書は、localize-perfection ブランチで実際に追加・更新された英文フィールドを唯一の正（Source of Truth）として、
和文フィールドに対する厳密な英訳ルールと、既存英文フィールドとの整合性ルールを再定義するための基準書である。

以後の英訳作業は、この文書の「実データ準拠ルール」を優先し、一般的な翻訳規則よりも既存 JSON 実装との一致を優先する。

## このログの使い方

この文書は、次の順で読むと現状把握と次の作業判断がしやすい。

1. まず本節直下の「実務用サマリ」で、完了済み範囲と残留監査の全体像を把握する。
2. 次に「英訳の厳密ルール」で、実データ準拠の訳語・トークン・書式ルールを確認する。
3. 最後に後半の追記群を参照し、各判断の経緯と個別対応の証跡を確認する。

補足:

- 後半の時系列追記は削除せず、監査証跡として保持する。
- 今後の実作業では「このログの上部サマリを正」「後半の時系列を根拠資料」として使う。

## 実務用サマリ（2026-06-12 時点）

### 1. ここまでで完了したこと

- `EffectText` / `SafetyLevelText` は、和英共通化可能な項目として整理方針を確立し、少なくとも `Works_NumberTales` ではレコード側 `*_EN` 重複を削減済み。
- `ThisMaster(s)` / `BirthDay` / `AnivDay` / `Relation.Comments` の構造的な EN 欠損は、いったん全作品横断で補完済み。
- `Works_NumberTales` の `db_Primary` 以外（`db_Secondary` / `db_SelfSecondary` / `db_SemiPrimary` / `db_UnprocessedSecondary`）は、前段の重点補完対象として一通り埋め終えている。
- `*_EN` をパッチ追記した JSON では、`db_UnprocessedSecondary` 準拠で「元キーの直後に対応 EN」を置く並び順ルールを導入済み。

### 2. 今後の優先作業対象（結論）

最優先は `data/Works_NumberTales/DataBases/db_Primary.json`。

理由:

- 精査版監査で残留候補 1300 件のうち 1141 件がこの 1 ファイルに集中している。
- 特に `Character_EN` / `Hobby_EN` / `Favor_EN` / `Unlike_EN` / `SpecialSkill_EN` / `Summary_EN` / `NumerospecAbout_EN` / 呼称 EN 群が大量に未補完。
- `Comments_EN` 607 件も和文のまま残っており、翻訳済み構造だが本文未英訳の代表例になっている。

### 3. 次点の重点ファイル

- `data/Works_NumberTales/DataBases/db_Secondary.json`
- `data/Works_NumberTales/DataBases/db_SelfSecondary.json`

補足:

- `data/Works_Proxies/DataBases/db_Proxy.json` の軽量残件 3 件（2代目 `Unlike_EN` / 3代目 `GenderType.about_EN` / 初代 `SpecialSkill_EN`）は 2026-06-12 追補で解消済み。
- `data/Works_PastDivers/DataBases/db_Primary.json` と `data/Works_SinisterChangingGirls/DataBases/db_Primary.json` の軽量残件も 2026-06-12 追補で解消済み。
- `data/Works_FLInvestigator78/DataBases/` / `data/Works_UnauthedLogica/DataBases/` / `data/Works_UnibyteLive/DataBases/` は 2026-06-12 再監査時点で、現行の「同ファイル内の既存 EN 実績基準」では追加補完対象 0 を確認済み。

### 4. 実務上の読み替え

- 「未補完」は、即英訳対象として扱ってよい候補。
- 「和文混入 EN」は、英訳キーが存在するが本文が和文のまま残っている候補。
- 「要人手判定」は、固有名詞保持・日本語字形の説明・ENミラー構造の都合で、機械判定だけでは即 NG と言い切れない候補。

## 横断残留監査（精査版）

### 監査条件

- 対象: `data/Works_*/DataBases/db*.json` の実データ本体（`db_meta.json` / `db_type.json` を除く）
- 走査ファイル数: 19
- 共通化除外:
  - `EffectText` / `SafetyLevelText`
  - 親に `*_EN` ミラーがあるサブツリー
  - bilingual wrapper で内部に `*_JP` / `*_EN` を持つ構造（例: `IdentityMotif[].Motif`）
- 判定カテゴリ:
  - `*_EN` 欠損候補
  - `*_EN` が存在するが和文が残る候補

### 監査結果サマリ

- `*_EN` 欠損候補: 1300
- 欠損候補が存在するファイル数: 13
- 和文混入 EN 候補: 662

### `*_EN` 欠損候補のファイル別件数

- `data/Works_NumberTales/DataBases/db_Primary.json`: 1141
- `data/Works_NumberTales/DataBases/db_Secondary.json`: 83
- `data/Works_NumberTales/DataBases/db_SelfSecondary.json`: 12
- `data/Works_PastDivers/DataBases/db_Primary.json`: 14
- `data/Works_PastDivers/DataBases/db_temp.json`: 1
- `data/Works_Proxies/DataBases/db_Proxy.json`: 10
- `data/Works_Proxies/DataBases/db_temp.json`: 7
- `data/Works_FLInvestigator78/DataBases/db_Primary.json`: 6
- `data/Works_DestinyFoxRecords/DataBases/db_Primary.json`: 2
- `data/Works_SinisterChangingGirls/DataBases/db_Primary.json`: 4
- `data/Works_UnauthedLogica/DataBases/db_Primary.json`: 6
- `data/Works_UnauthedLogica/DataBases/db_PrimaryMobs.json`: 4
- `data/Works_UnibyteLive/DataBases/db_Primary.json`: 10

### `*_EN` 欠損候補の主要キー（上位）

- `NumerospecAbout_EN`: 84
- `Unlike_EN`: 75
- `Character_EN`: 73
- `Favor_EN`: 73
- `Hobby_EN`: 72
- `SpecialSkill_EN`: 72
- `Summary_EN`: 62
- `TailsUnit_EN`: 60
- `RelationNotes_EN`: 52
- `ForMasterCalling_EN`: 49
- `ThirdPersonCalling_EN`: 47
- `Backgrounds_EN`: 44
- `InStory_EN`: 43
- `AdditionalDesigned_EN`: 38
- `FirstPersonCalling_EN`: 36
- `SecondPersonCalling_EN`: 35
- `TalkingTone_EN` / `TopicPreference_EN` / `TalkFrequency_EN` / `PreferredTopics_EN` / `AvoidedTopics_EN` / `ConversationNotes_EN`: 各 21
- `ChronoizedPurity_EN`: 14
- `LogicspecAbout_EN`: 6

補足:

- `value_EN` / `about_EN` の検出は 217 件あるが、`ThisMasters`・`Age`・`Weight_kg` などの wrapper 構造と EN ミラー構造が混在しており、即翻訳対象とは断定しづらい。
- これらは「要人手判定」の束として扱い、通常の `Name_EN` / `Summary_EN` 欠損とは分けて処理する。

### 和文混入 EN の監査結果

#### 明確に本文未英訳として扱う候補

- `Comments_EN`: 607
  - ほぼすべて `data/Works_NumberTales/DataBases/db_Primary.json`
  - 構造は EN 済みだが、中身は和文のまま複製されている
- `about_EN`: 9
  - 主に `ThisMasters` 配下の補足文で、`(専属契約不可,未リリース状態)` や `仕方なく所持` などが和文のまま残る

#### 要人手判定（即 NG ではない）

- `ThisMasters_EN`: 41
  - キャラクター名・組織名・肩書を日本語固有名詞のまま保持している例が多い
  - 一方で `about_EN` 側に和文注記が混ざるケースがあるため、本文と固有名詞を分けて判断する
- `Motif_EN`: 4
  - 英文説明内で日本語字形・記号そのものに触れているケースが含まれる
- `Backgrounds_EN`: 1
  - 英文本文中で漢字字形（例: `㐂`）を説明対象として引用しているケース

### 直近の実作業優先順

1. `data/Works_NumberTales/DataBases/db_Primary.json` の `Comments_EN` / 呼称 EN 群 / 概要系 EN 群を重点処理
2. `data/Works_NumberTales/DataBases/db_Secondary.json` の `AdditionalDesigned_EN` と残る説明系 EN を処理
3. `data/Works_NumberTales/DataBases/db_SelfSecondary.json` の残件を再点検し、`db_Primary` 着手前の軽量な取りこぼしが無いか確認
4. `data/Works_NumberTales/DataBases/db_Primary.json` の `Comments_EN` 和文混入を番号順・5キャラ単位で処理
5. `data/Works_NumberTales/DataBases/db_Primary.json` の `Character_EN` / `Hobby_EN` / `Favor_EN` / `Unlike_EN` / `SpecialSkill_EN` を同じ5キャラ束で継続補完

## 正準データの定義

### 1. 正準ブランチ

- 正準: localize-perfection ブランチ上の JSON 実データ
- 比較元: develop ブランチ

### 2. 正準対象ファイル

- data/Works*\*/DataBases/db*\*.json
- data/Works\_\*/DataBases/db_meta.json
- data/Works\_\*/DataBases/db_type.json
- data/Works*\*/Dictionaries/dict*\*.json
- data/Works\_\*/Dictionaries/db_meta.json
- data/References/db_type.json
- data/Dictionaries/db_type.json

### 3. 重要原則

- 既に localize-perfection で追加済みの \*\_EN は、文体・語彙・記法を含めて正とする。
- 新規英訳は「既存 EN へ寄せる」ことを必須とし、翻訳者の自由裁量を最小化する。
- 既存 EN と矛盾する改善案は、先にルール側へ追記してから適用する（先にデータを壊さない）。

## 実データ差分サマリ（develop...localize-perfection）

### 1. EN 差分の総量

- \*\_EN 追加/更新が発生した JSON ファイル数: 40
- \*\_EN 追加件数: 1283
- \*\_EN 既存値変更件数: 5

### 2. 主要追加先（抜粋）

- data/Works_NumberTales/DataBases/db_Primary.json: 406 追加
- data/Works_NumberTales/DataBases/db_SemiPrimary.json: 114 追加
- data/Works_DestinyFoxRecords/DataBases/db_Primary.json: 98 追加
- data/Works_PastDivers/DataBases/db_Primary.json: 94 追加
- data/Works_FLInvestigator78/DataBases/db_PrimaryDealer.json: 78 追加
- data/Works_ShouArRiders/DataBases/db_Primary.json: 66 追加
- data/Works_Proxies/DataBases/db_Proxy.json: 46 追加
- data/Works_SinisterChangingGirls/DataBases/db_Primary.json: 40 追加
- data/Works_UnauthedLogica/DataBases/db_PrimaryMobs.json: 24 追加

### 3. 既存 EN の更新（追加ではなく上書き）

- data/Works_DestinyFoxRecords/DataBases/db_Primary.json: [1].FormalName_EN
- data/Works_NumberTales/Dictionaries/dict_Class.json: [25].Class_EN
- data/Works_Proxies/DataBases/db_Proxy.json: [1].Name_EN
- data/Works_ShouArRiders/DataBases/db_Primary.json: [1].BeastspecName_EN
- data/Works_UnauthedLogica/DataBases/db_Primary.json: [0].FormalName_EN

上記は「既存 EN の品質補正」が現実に行われた証跡であり、今後も必要時に更新を許容する。
ただし更新条件は本書「既存 EN 更新ルール」に従う。

## 現在の充足率（DB本体のみ再計測）

判定条件:

- 対象: data/Works*\*/DataBases/db*\*.json
- 除外: data/Works_NumberTales/DataBases/db_Primary.json（本集計上の運用除外）
- 判定: 値を持つ _\_JP に対応する _\_EN が同一オブジェクト内に存在するか
- 例外: ThisMasters_JP は未正式運用として必須対象から除外

再計測結果（2026-06-12）:

- 走査ファイル数: 18
- JP/EN 判定対象: 93
- 完了: 93
- 未完了: 0

未完了 0 件:

- `about_JP/about_EN` の軽量 wrapper 欠損として最後に残っていた `data/Works_Proxies/DataBases/db_Proxy.json` の 3代目 `GenderType.about_EN` は、2026-06-12 追補で解消済み。

## 英訳の厳密ルール（実データ正準）

### A. キー対の厳密性

1. _\_JP に値がある場合、同階層・同オブジェクトに対応する _\_EN を置く。
2. \*\_EN のみ先行追加は禁止（JP が未定義なら EN も追加しない）。
3. value/about 構造では value_JP/value_EN と about_JP/about_EN を同じ粒度で管理する。
4. 例外運用キー（ThisMasters など）は「保留キー一覧」に明示されている場合のみ未追加を許容する。

### B. 既存 EN 優先の整合性

1. 同一作品・同一 DB 種別で既に使われている語彙を優先する。
2. 新規 EN は「意味が同じなら既存表現と完全一致」を原則にする。
3. 同義語の新規導入は禁止（例: 既存が favor の場合に like を新規採用しない）。
4. 同一キーの文体（句点、改行、括弧、プレースホルダ）を合わせる。

### C. トークン・プレースホルダ整合

実データ確認（現状）:

- [*by name] 出現: 66
- ~[*by name] 出現: 0
- [*second-person calling] 出現: 8
- my lord（小文字）出現: 3
- young sir/lady（小文字）出現: 5

運用ルール:

1. 呼称参照は [*by name] のみ許可する。
2. [*second-person calling] を正規参照とし、旧式記法は新規追加で使わない。
3. 一般呼称は小文字（my lord, young sir/lady）を標準にする。
4. 末尾の不要セミコロン、二重スペース、記号連結の揺れを禁止する。

### D. 固有名詞・既知語形

実データ確認（現状）:

- LotusNinea: 11
- RotusNinea: 0
- Finaly: 0
- Fourty: 0
- OvderRoll: 1（意図表記として維持）

運用ルール:

1. 既存正規形（LotusNinea 等）を固定語彙として扱う。
2. 既知誤記（Finaly/Fourty/RotusNinea 等）の再導入を禁止する。
3. OvderRoll は意図語として修正対象に含めない。
4. Name_EN にダイアクリティカルマークを含む語（例: `Fifívan`）は、ASCII 近似へ置換せず原表記を維持する。

### E. 代名詞・呼称の整合

1. GenderType と同作品既存 EN の慣用を優先する。
2. 主語代名詞は作品内先例を優先し、単独レコードだけで独自最適化しない。
3. 呼称系キー（FirstPersonCalling_EN など）は既存テンプレートを踏襲する。

#### E-1. 「慣用」の定義（本書での意味）

- 本書でいう慣用は「同一作品・同一DB種別で、既に実データで使われている代名詞/呼称の訳し方と書式」を指す。
- 慣用は語義の自然さより優先される（例: やや直訳気味でも既存 EN に一致させる）。
- 慣用は単語だけでなく、次を含む。
  - 代名詞の選択（he/she, thou, you など）
  - 呼称トークン（[*by name], [*second-person calling]）
  - 敬称の大小文字（sir/lady, my lord）
  - 補注の入れ方（括弧注記、セミコロン区切り、改行）

#### E-2. 慣用の判定優先順位

1. 同一レコード内の既存 EN（最優先）
2. 同一キーの同一作品内 EN（例: ThirdPersonCalling_EN）
3. 同一 DB 種別内の多数派 EN（Primary/SemiPrimary など）
4. 同作品内の近縁キャラ（設定・口調が近い）
5. 全体標準ルール（C 節・D 節）

上位と下位で衝突した場合は、常に上位を採用する。

#### E-3. 代名詞・呼称の慣用マップ（実データ準拠）

- FirstPersonCalling_EN:
  - 私/わたし/僕/ぼく/俺/おれ の差は無理に I 以外へ展開せず、必要時のみ括弧で文体注記する。
  - 例: I, I (ore; rough, rare)
- SecondPersonCalling_EN:
  - 君/あなた/あんた/貴方 などは、既存の you 系テンプレートを優先し、丁寧差は括弧注記で吸収する。
  - 古風語（汝/お主 など）は thou 系を許容し、既存の archaic 注記形式へ合わせる。
- ThirdPersonCalling_EN:
  - [※名前呼び] は [*by name] へ統一する。
  - *いつ/*れ 系は that/this/who/which/what/them (as objective) 系テンプレートを流用する。
  - 彼/彼女 は he/she を基本とし、作品内既存の並記フォーマットを維持する。
- ForMasterCalling_EN:
  - 主/主人/主さん 系は Master 系を基本にし、作品内で既に定着した呼称（例: my lord, Master-kun）は上書きしない。
  - sir/lady 系は小文字慣用を標準とする。

#### E-3.1. 正例コーパスの明示（最重要）

- 代名詞・呼称の慣用判定は、次の2ファイルを最優先の実例コーパスとして扱う。
  - data/Works_SinisterChangingGirls/DataBases/db_Primary.json
  - data/Works_NumberTales/DataBases/db_SemiPrimary.json
- この2ファイルで確立された語法・トークン・注記粒度に合わせることを、慣用準拠の必須条件とする。

#### E-3.2. 正例コーパスから読み取れる慣用パターン

1. 一人称（FirstPersonCalling_EN）

- 基本軸は I で統一し、ニュアンス差は括弧注記で表す。
- 例: I (rough masc.), I (fem. neutral), I (warawa; fem. archaic)
- 複数人格・複数モードは改行で併記し、行頭ラベル（Doppels:, Pelgans:）を許容する。

2. 二人称（SecondPersonCalling_EN）

- 基本軸は you 系で統一し、乱暴さ/丁寧さ/古風さを括弧注記で差分化する。
- 例: you (blunt), you (very polite), thou (onushi; casually archaic)
- 固有呼称（lord, senpai 等）は、該当レコード内の既存文脈がある場合のみ採用する。

3. 三人称（ThirdPersonCalling_EN）

- [※名前呼び] 系は [*by name] を標準トークンとする。
- *れ/*いつ 系は that/this/who/which/what/them の列挙テンプレートで受ける。
- he/she の併記は維持し、削減しない。
- 敬称列挙は小文字（sir/mr/lady/ms.）を標準とし、~dono 等の補注は括弧で保持する。

4. 主人呼称（ForMasterCalling_EN）

- my lord / my sir/lady / young sir/lady / my contractor などの既存呼称は固定語彙として扱う。
- [*second-person calling] を後置して連動させる書式を許容し、既存採用レコードでは維持する。

#### E-3.3. 慣用の書式ルール（指定2DB準拠）

1. 1レコード内で口調モードが複数ある場合は、改行でモード単位に分ける。
2. モード識別子（例: Doppels:, Pelgans:）は英語ラベル+コロンで統一する。
3. 括弧注記は「語彙 + 空白 + (注記)」の形式を基本にする。
4. セミコロン区切りは意味ブロックの分割に限定し、冗長な区切りは増やさない。

#### E-3.4. 例外とレガシー扱い

- data/Works_SinisterChangingGirls/DataBases/db_Primary.json に [by name]（アスタリスク無し）の旧表記がある。
- 本書の正規形は [*by name] であり、新規追加では旧表記を使用しない。
- 既存データを更新する場合は「既存 EN 更新ルール」に従い、周辺表記との整合を確認してから置換する。

#### E-4. 慣用運用時の禁止事項

1. 同一キー内での勝手な言い換え（例: Master -> employer）
2. 既存トークンの別表記導入（例: [*by-name], [※名前呼び] を EN 側へ残す）
3. 敬称の大小文字をレコードごとに揺らすこと
4. 既存 EN の注記粒度を無断で削ること（archaic, rough など）

#### E-5. 慣用確認チェック（追加前）

1. 追加対象キーの同作品既存 EN を最低 3 例確認する。
2. 追加文が既存トークン規約（[*by name], [*second-person calling]）に一致しているか確認する。
3. 敬称の大小文字が同キー多数派と一致しているか確認する。
4. 差分レビュー時に「新語導入」がある場合は、理由をログへ明記する。

### F. 改行・複数値・長文項目

1. JP が改行区切りなら EN も同段数の改行区切りを優先する。
2. Summary/Backgrounds/Notes 類は既存 EN の情報密度と文長へ合わせる。
3. リスト項目の列挙順は JP と同順を維持する。

### F-1. 創作固有語（加護）の訳語固定

1. `Works_NumberTales` の文脈で「加護」を英訳する場合、原則 `Numerospec` を正規語として使用する。
2. `blessing` は一般語としては許容されるが、`Numerospec` と競合する箇所では新規追加・新規上書きに使わない。
3. `Summary_EN` / `RelationNotes_EN` / `Backgrounds_EN` など説明文内でも同じ規則を適用し、同一レコード内で `Numerospec` と `blessing` を混在させない。
4. 既存文の手直し時は、意味を変えずに `blessing` -> `Numerospec` の最小差分置換を優先する。

### F-2. 作品別語彙辞書（`#Ref_Vocabulary`）からの固定訳語（2026-06-13 追加）

各作品の `References/ref_Vocabulary.json` を正とする固定訳語一覧。
新規英訳および既存英訳の見直し時は、以下の表で確認・照合すること。

#### Works_NumberTales

| 日本語 | 英語（固定） | 備考 |
|--------|------------|------|
| 数秘加護 | Numerospec | F-1 ルール再掲（最重要） |
| ヒューマノイド形態 | Humanoid Form | |
| コアフォルダ（形態） | CoreFolder | |
| 安全レベル | Safety Level | フィールド名 `SafetyLevel` と同一概念 |
| 試験用個体 | Test Model | Class 値 |
| 1桁番 | UniDigits | Class 値 |
| 10倍番 | Tens-Digits | Class 値 |
| 1号機型 | Unit.1 lineage | 〃 |
| 2号機型 | Unit.2 lineage | 〃 |
| 10号機型 | Unit.10 lineage | 〃 |
| キャレ型ハイナンバーズ | Carré-Series HighNumbers | 〃 |
| キュビクザール型ハイナンバーズ | Kubikzahl-Series HighNumbers | 〃 |
| マスターテールズ9 | Master Tales 9 | 〃 |
| デシベルモデレーターズ | Decibel Moderators | 〃 |
| マスタートリプル | MasterTriples | 〃 |
| 仮説型ハイナンバー | Tentative HighNumbers | 〃 |

#### Works_FLInvestigator78

| 日本語 | 英語（固定） | 備考 |
|--------|------------|------|
| アルカナムスペック | Arcanamspec | ⚠️ フィールド名は `ArcanamspecAbout` / `ArcanumspecStats` で揺れあり（下記参照） |
| 采配幹部（ディーラーズ） | Dealers | |
| 元素属性 | Material | フィールド名 `Material` と同一 |
| ロールタイプ | Role Type | フィールド名 `RoleType` のラベル |
| 双極性パターン | Dualize Pattern | フィールド名 `DualizePattern` のラベル |

> **FLInvestigator78 表記ブレ備忘録**
> フィールド名 `ArcanamspecAbout`（Arcanaм） と `ArcanumspecStats`（Arcanum）の2系統が混在している。
> hashTag 名は変更不可（SW ルーティング依存）のため、`hashTag_EN` ラベルを "Arcanamspec" に統一する方針で対応済み（2026-06-13）。
> 新規 EN 文内で造語本体を記述する場合は `Arcanamspec`（Arcanaм 形式）を正とする。

#### Works_ShouArRiders

| 日本語 | 英語（固定） | 備考 |
|--------|------------|------|
| 獣爾騎兵 | Shou'ar Riders | 組織・作品タイトル |
| 獣騎能力 | Beastspec | フィールド名 `BeastspecAbout` / `BeastspecStats` と同一概念 |
| 山月病 | Shanyu Disease | |

#### Works_UnauthedLogica

| 日本語 | 英語（固定） | 備考 |
|--------|------------|------|
| ロジカ（論理特殊能力） | Logicspec | フィールド名 `LogicspecAbout` と同一概念 |

#### Works_PastDivers

| 日本語 | 英語（固定） | 備考 |
|--------|------------|------|
| 時空遷移 | ChronoidShift | 能力の固有名（一般概念の space-time とは別） |
| 時空遷移者 | Chronoholder | フィールド名 `ChronoholderName` と同一概念 |
| 時空遷移能力 | Chronospec | フィールド名 `ChronospecAbout` / `ChronospecStats` と同一概念 |
| 時空遷移純度 | Chronoized Purity | フィールド名 `ChronoizedPurity`（スペースなし）と表記差に注意 |
| クロノス | Chronos | `$IndexDef` フィールド名と同一 |
| 月明 | Lunar | |
| 夜月機関 | Yadzuki Orgs. | db_Primary.json 既存 EN より確認 |

> **PastDivers 補足**
> `ChronospecAbout_EN` 内で「時空」を描写する場合は `space-time` を使用してよい（一般物理概念）。
> 固有能力名として参照する場合のみ `Chronospec` / `ChronoidShift` を用いる。

#### Works_UnibyteLive

| 日本語 | 英語（固定） | 備考 |
|--------|------------|------|
| ユニバイト・ユニバース | Unibyte Universe | インフラ・サービス名 |

#### Works_DestinyFoxRecords

| 日本語 | 英語（固定） | 備考 |
|--------|------------|------|
| フィジカル9 | Physical 9 | 組織名 |
| 組織長 | Chief/Leader | 役職・肩書 |
| 第N界 | #REGION.N（例: #REGION.1） | 世界・地域の識別子形式 |

---

### G. 辞書・メタ・型定義の整合

1. DB概要は各作品 DataBases/db_meta.json の DB_Summary_EN を正とする。
2. 作品概要は data/db_meta.json の Works_Summary_EN を正とする。
3. 辞書ラベルは Dictionaries/dict\_\*.json を優先し、db_meta 直書きを増やさない。
4. 表示ラベル定義（hashTag_EN など）は db_type.json 側と表示実装の整合を優先する。

## 既存 EN 更新ルール（上書き時）

既存 EN を更新してよい条件は次のみ:

1. 既知誤記の修正である。
2. 同作品内の多数派表記へ統一するためである。
3. プレースホルダ規約違反の解消である。
4. UI/検索/参照解決の仕様整合に必要である。

更新時の必須対応:

1. 変更理由を \_work_in_progress ログへ記録する。
2. 該当キーの周辺レコードを横断確認する。
3. 既存 EN を壊す方向の言い換えを避け、最小差分で修正する。

## 整合性判定プロトコル（作業ごとに実施）

### 手順 1: 追加対象抽出

- 対象作品・対象 DB で「値あり _\_JP / 欠損 _\_EN」を抽出
- 保留キー（ThisMasters 等）と shared 運用キーを除外

### 手順 2: 既存 EN 参照

- 同作品・同キーの既存 EN 値を先に収集
- 既存語彙と競合する新規語彙を禁止

### 手順 3: 追加

- 5キャラ単位で追加（運用上のレビュー粒度を維持）
- ConversationPattern がある場合は同時に英訳対を追加

### 手順 4: 記号・語形検査

- [*by name] / [*second-person calling] / 小文字呼称を確認
- 既知誤記と固有名詞揺れを確認

### 手順 5: テスト

- npm test
- 必要に応じて対象テストのみ再実行（bilingual-fields 等）

## 作業運用ルール（継続英訳向け）

1. 英訳は番号順で進める。
2. 1セッション 5キャラ単位で進める。
3. ConversationPattern があるキャラは同時に英訳対応する。
4. 長期対応は develop から作業ブランチを分ける。

## 保留事項（明示管理）

1. ThisMasters_EN の正式運用は未確定。
2. about_EN / DayAbout_EN の適用粒度は要整理。
3. data/Works_Proxies/DataBases/db_Proxy.json の about_EN 欠損 1 件は 2026-06-12 追補で解消済み。

## 今後の適用方針

1. 本書を英訳対応の一次基準とし、以降の翻訳判断は本書へ追記して一本化する。
2. ルール変更時は「先に本書更新、次にデータ更新」の順で運用する。
3. 次回以降の英訳追加は、必ず localize-perfection 実データと同じ記法体系へ収束させる。

## 2026-06-12 追記：Works_NumberTales 英訳補完（第2便）

- 対象ファイル: data/Works_NumberTales/DataBases/db_Primary.json
- 対象レコード（番号順・3キャラ）:
  - Num 15
  - Num 16
  - Num 17
- 補完したキー:
  - FirstPersonCalling_EN
  - SecondPersonCalling_EN
  - ThirdPersonCalling_EN
- 運用ルール適用:
  - [*by name] を正規トークンとして適用
  - 呼称注記は既存慣用（rough/familiar/fem. casual など）に整合
  - 敬称・トークン表記の小文字/記号ルールに準拠
- 検証:
  - tests/data.sanity.test.js: pass
  - tests/bilingual-fields.test.js: pass

## 2026-06-12 追記：手直し差分の分析（今後の補完向け）

### 観測対象

- 対象ファイル: data/Works_NumberTales/DataBases/db_Primary.json
- 参照差分: Num 15 / 16 / 17 / 18 / 19 / 21 を中心とした呼称EN・CodeName_EN 補完

### 確認できた「採用慣用」

1. 呼称注記は短く固定語彙で揃える（例: `I (fem. casual)`, `you (familiar)`, `you (rough)`）。
2. 三人称は `he/she; ...` を起点にし、必要時のみ目的語群（`this/that/who/which/what/them (as objective)`）を追加する。
3. `[※名前呼び]` は `[*by name]` を正規トークンとして統一する。
4. 主人呼称の兄姉系は `~Bro/~Sis` を優先し、過剰説明を避ける。
5. `hideText` は意味展開せず、そのまま EN 側も `hideText` 構造を維持する。
6. CodeName_EN は数詞の直列化（例: `One-Zero`, `One-Eight`, `One-Nine`, `Two-One`）を優先する。

### 補完時チェックリスト（Num1〜22 以降にも適用）

1. `First/Second/ThirdPersonCalling_EN` は3点セットで同時確認する。
2. `ForMasterCalling_EN` は同系統キャラ（兄姉/ご主人様/センパイ）の既存訳を優先再利用する。
3. `RelationNotes_EN` / `Summary_EN` は逐語寄りにせず、既存英訳の文量・文体に合わせる。
4. 追加順は `CodeName_EN` → 呼称EN群 → 説明文EN群 の順で入れると差分レビューが安定する。
5. 他レコード参照名（例: `12(...)`, `28(...)`）は必ず対象レコードの `Name_EN` から転記し、類推綴りを使わない。

### 追加実施（第3便）

- Num 21 の未補完3件を追記:
  - `ForMasterCalling_EN`
  - `RelationNotes_EN`
  - `Summary_EN`

## 2026-06-12 追記：全作品横断の追加対応（ThisMaster/Day wrapper/Relation）

### 実施背景

- 未対応カテゴリとして次を全作品で横断補完した。
  - `ThisMaster` / `ThisMasters` 系（他キャラ・契約先等の紐づけ系）
  - `BirthDay` / `AnivDay` の wrapper 項目（`DayAbout`）
  - `Relation` の独自オブジェクト配下（`Related[]` / `Commented[]` の `Comments`）

### 対応方針（既存 EN 整合優先）

1. 既存キーは上書きせず、欠損している `*_EN` のみを追加する。
2. `ThisMaster(s)_EN` は構造整合を優先し、配列/オブジェクト形を保持して追加する。
3. `DayAbout_EN` は頻出語彙（例: `開発記念`）を既存文体に合わせた固定訳で補完し、未知語彙は元値保持で欠損をなくす。
4. `Relation.*.Comments_EN` はまず表示・参照の欠損解消を優先し、既存 `Comments` 値を EN 側へ複製して構造を統一する。

### 実施結果（全作品合計）

- 変更ファイル数: 7
- 追加件数:
  - `ThisMaster(s)_EN`: 41
  - `DayAbout_EN`（`BirthDay`/`AnivDay`）: 133
  - `Relation.*.Comments_EN`: 607
  - `IdentityMotif` 欠損: 0（既存で充足済み）

### 変更対象ファイル

- `data/Works_NumberTales/DataBases/db_Primary.json`
- `data/Works_NumberTales/DataBases/db_Secondary.json`
- `data/Works_NumberTales/DataBases/db_SemiPrimary.json`
- `data/Works_SinisterChangingGirls/DataBases/db_Primary.json`
- `data/Works_UnauthedLogica/DataBases/db_Primary.json`
- `data/Works_UnibyteLive/DataBases/db_Primary.json`
- `data/Works_UnibyteLive/DataBases/db_temp.json`

### 検証

- 追加後の再走査で未対応 0 を確認:
  - `ThisMaster(s)`: 0
  - `BirthDay|AnivDay (DayAbout_EN)`: 0
  - `Relation.Comments_EN`: 0
  - `IdentityMotif.Motif_EN`: 0
- テスト:
  - `tests/data.sanity.test.js`: pass
  - `tests/bilingual-fields.test.js`: pass

## 2026-06-12 追記：AnivDay 手直しの反映と hideText の和英対応書式

### AnivDay 手直しから確認できたこと

- `data/Works_NumberTales/DataBases/db_SemiPrimary.json` の `AnivDay.DayAbout_EN` について、手直し後の表記を今後の優先形として扱う。
- 特に次のような調整方針を確認した。
  1. 固有計画名は機械的に分かち書きせず、既存固有名詞のまとまりを優先する。
     - 例: `SquareElites project commemoration`
  2. 機体番号補足は冗長な説明語より、既存英名寄りの簡潔な略記を優先し得る。
     - 例: `Development commemoration (Mk.64)`
  3. `DayAbout_EN` は単なる逐語訳ではなく、同一作品内の命名慣用と読みやすさを優先してよい。

### hideText の和英対応書式（全作品確認結果）

- 全 JSON 実データを確認した結果、`hideText` の和英対応は次の2系統で運用されている。

1. 別フィールドで和英対応する項目（`Unlike` / `Unlike_EN` など）

- 入力書式は「JP 側と EN 側を別キーで持ち、両方とも `{ "hideText": "..." }` オブジェクトにする」。
- 例:

```json
"Unlike": { "hideText": "？？？" },
"Unlike_EN": { "hideText": "???" }
```

- 重要: `hideText_EN` を同一オブジェクト内へ直接書く方式は、実データ上の本体レコードでは採用しない。

2. 別フィールドを持たない項目・wrapper/能力値内部項目（`BirthDay`, `AnivDay`, `Rank`, `SafetyLevel` など）

- 入力は従来どおり `{ "hideText": "..." }` のみを置く。
- EN 表示は `data/db_type.json` の `#List_hideText` に定義された `hideText` / `hideText_EN` 対応表で解決する。
- つまり、実レコード側へ `hideText_EN` を直書きするのではなく、スキーマ辞書で英語表示を与える。

### 統一ルールとして記録すること

1. `*_EN` の別キーが存在する項目で hideText 化する場合は、EN 側も sibling key として `{ "hideText": "..." }` を持たせる。
2. `hideText_EN` を本体レコードの同一オブジェクト内へ埋め込む方式は採用しない。
3. `*_EN` 別キーを持たない項目の hideText 英語表示は、`data/db_type.json` の `#List_hideText` で統一管理する。
4. wrapper 項目（`DayAbout_EN` など）で hideText を使う場合も、別キー構造があるなら sibling object 方式を優先する。
5. sibling object 方式の EN 側 `hideText` 値は JP 側の文言を複製せず、対応する英語値（例: `????`）を書く。

## 2026-06-12 追記：Works_NumberTales（db_Primary 以外）英訳完了

### 対象

- `data/Works_NumberTales/DataBases/db_Secondary.json`
- `data/Works_NumberTales/DataBases/db_SelfSecondary.json`
- `data/Works_NumberTales/DataBases/db_SemiPrimary.json`
- `data/Works_NumberTales/DataBases/db_UnprocessedSecondary.json`

### 追加・補完内容

1. `db_Secondary.json`

- `AbilityStats.Leading.Rank.about_EN` を追加（`?`）
- `ConceptAge.about_EN` を追加（`Unknown`）

2. `db_SelfSecondary.json`

- `Num: 256` の `Name_EN` を追加（`256(Bytes)`）

3. `db_SemiPrimary.json`

- 欠損していた `CodeName_EN` を30件補完（`One-Zero-Zero` 系の既存命名慣用に準拠）
- `Num: 777` の `Backgrounds_EN` を追加

4. `db_UnprocessedSecondary.json`

- 欠損なし（追加不要）

### 確認結果

- `db_Primary` 以外4DBの再走査結果:
  - `db_Secondary.json`: 欠損 0
  - `db_SelfSecondary.json`: 欠損 0
  - `db_SemiPrimary.json`: 欠損 0
  - `db_UnprocessedSecondary.json`: 欠損 0

### 検証

- `tests/data.sanity.test.js`: pass
- `tests/bilingual-fields.test.js`: pass

## 2026-06-12 追記: 呼称 EN の敬称連結ルール（ForMasterCalling）

- `ForMasterCalling_EN` では `Mr/Ms.Master` のような敬称連結は不自然になりやすいため採用しない。
- 丁寧さを維持したい場合は `my Master` を優先する。
- 二人称の丁寧さ調整は、可能な限り会話文（`DialogueExamples[].value_EN`）側の語調で吸収する。

## 2026-06-12 追記：手直しフィードバック反映（名称・造語）

### 観測した手直し傾向

1. 造語統一

- 「加護」を文脈語として `Numerospec` へ統一する手直しが複数箇所で確認された。

2. 固有名詞の正準化

- 他キャラ参照名は、参照先 `Name_EN` の正準綴りを優先する方針が再確認された。
- 特に `55(イソゴ)` の英名参照は `55(Fifívan)` を正とし、旧来の便宜表記（例: Isogo）を説明文へ残さない。

3. 代名詞整合

- `Comments_EN` の主語代名詞は、対象キャラの `GenderType` と当該帯の既存慣用に合わせる手直しが入っている。
- Neutral を含む対象では `he/she` 系を優先し、単独の `he` / `she` 固定で先走らない。

### 反映した運用ルール

1. 用語辞書ルール

- NumberTales 文脈の「加護」は `Numerospec` 固定。

2. 名称参照ルール

- 他キャラ参照は必ず対象レコードの `Name_EN` を機械的に転記する。
- ダイアクリティカルマーク（例: `Fifívan`）を削らない。

3. コメント英訳ルール

- `Comments_EN` は引用符規則（`"..."` / `(...)`）を維持しつつ、代名詞は `GenderType` と既存慣用を優先する。
- 既存EN手直し時は語彙の統一を優先し、情報量を増やしすぎない。

### 補足（今後の推敲観点）

1. 新規5キャラ束ごとに、次を必ずレビューする。

- `Numerospec` と `blessing` の混在有無
- 参照キャラ名の `Name_EN` 一致
- Neutral 対象コメントの代名詞ぶれ（`he/she` 系か）

2. 上記に差分が出た場合は、この統合ログへ先に追記してからデータ補正する。

## 2026-06-12 追記：手直し反映ルール（呼称 EN / 文完結）

### 反映背景

- `ForMasterCalling_EN` で局所的な表記揺れ（例: `Mr/Ms.~Master`, `big bro/sis`）が発生した。
- `Comments_EN` に文末が未完了の文（`...` で終わる目的語不足）が混入した。

### 追加ルール

1. 呼称 EN は同キー多数派の定型を優先し、過剰合成をしない。

- `ForMasterCalling_EN` は原則 `Master` / `Big bro/sis` など既存定型を優先する。
- `Mr/Ms.~Master` のような合成語は、JP 側に明確な複合敬称根拠がない限り新規採用しない。

2. `Comments_EN` は1文として完結していることを必須とする。

- 末尾 `...` を使う場合も、主語・述語・目的語が欠けた不完全文にしない。
- 文意が続く演出目的の省略記号は許容するが、文法上の欠落は許容しない。

### 追加チェック（手順4の補助）

1. 呼称 EN の大小文字と慣用語を同キー既存 3 例以上で照合する。
2. `Comments_EN` の末尾を目視し、未完了文（目的語不足など）がないか確認する。

## 2026-06-12 追記：英訳追記後の項目順整列ルール（db_UnprocessedSecondary 準拠）

### 背景

- パッチで `*_EN` を後付けしたDBでは、元キーと英語キーが離れて差分レビューしづらくなるケースがあった。
- `db_UnprocessedSecondary.json` のように「元キーの直下へ対応する `_EN` を置く」並びを、今後の正準ルールとして扱う。

### 今回の対応

- 対象ファイル:
  - `data/Works_NumberTales/DataBases/db_Primary.json`
  - `data/Works_NumberTales/DataBases/db_Secondary.json`
  - `data/Works_NumberTales/DataBases/db_SelfSecondary.json`
  - `data/Works_NumberTales/DataBases/db_SemiPrimary.json`
- 実施内容:
  - 再帰的に各オブジェクトを走査し、`<base>` が存在する場合は `<base>_EN` をその直後へ移動
  - `<base>` が無く `<base>_JP` が存在する場合は、`<base>_JP` の直後へ `<base>_EN` を移動
  - `Relation.*.Comments_EN` や `ThisMasters_EN` のような入れ子配下も同じ規則で整列

### 整列後の確認

- 対象4ファイルの `_EN` 順序ずれ再検出: 0件

### 今後の運用ルール

1. パッチで `*_EN` を追加・追記した場合、その場で同一オブジェクト内の項目順も整列する。
2. 基本規則は `db_UnprocessedSecondary.json` と同じく「元キー → 対応 `_EN`」の順とする。
3. `about_JP/about_EN` のように JP 側しか基底キーが無い場合は「`*_JP` → `*_EN`」の順とする。
4. 英訳値だけ追加して順序調整を保留しない。差分レビューの見通し維持も翻訳作業の一部として扱う。

### 検証

- `tests/data.sanity.test.js`: pass
- `tests/bilingual-fields.test.js`: pass
- `tests/pages.characters.ui-output.test.js`: pass

## 2026-06-12 追記：`_DBLink` 参照オブジェクトの英訳キー整理（SW/API準拠）

### 背景

- `_DBLink._Search[]` に `hashTag_EN` が追加されていたが、参照解決は `hashTag` / `key` で成立するため、和英で同一参照を保つ方針に合わせて整理した。

### 対応

- 対象: `data/Works_NumberTales/DataBases/*.json`
- 内容: `_DBLink` 配下の `_Search` オブジェクトから `hashTag_EN` を除去
- 除去件数: 44
  - `db_Primary.json`: 11
  - `db_SelfSecondary.json`: 32
  - `db_SemiPrimary.json`: 1

### 方針メモ

- `_DBLink` 参照オブジェクトは、原則として和文・英文で同じ参照式を使う。
- 英訳対応は表示ラベル側（typedef/varsdef/UI）で担保し、参照キー本体には可能な限り言語差分を持ち込まない。

## 2026-06-12 追記：`EffectText` / `SafetyLevelText` の共用辞書準拠で再推敲

### 背景

- `NumerospecStats` 配下の `EffectText` / `SafetyLevelText` は、`db_type.json` の `#ListLink` 設定と `db_meta.json` の `#ListLink_*` 辞書（EN 付き）で和英共用表示できる設計。
- この前提に合わせ、レコード側で重複していた `EffectText_EN` / `SafetyLevelText_EN` を整理した。

### 対応方針

- 参照辞書に同値が存在し、かつレコード側 `*_EN` が辞書値と完全一致する場合のみ削除。
- 辞書定義（`db_meta.json`）側は保持し、レコード本体のみを削減対象とする。

### 実施結果（Works_NumberTales / DataBases 配下）

- `db_Primary.json`: `EffectText_EN` 411件 / `SafetyLevelText_EN` 81件 を削除
- `db_Secondary.json`: `EffectText_EN` 16件 / `SafetyLevelText_EN` 3件 を削除
- 合計: `EffectText_EN` 441件 / `SafetyLevelText_EN` 97件 を削除

### 再確認

- `db_*.json`（`db_meta.json` 除く）で `EffectText_EN` / `SafetyLevelText_EN` は残件 0
- `tests/data.sanity.test.js`: pass
- `tests/bilingual-fields.test.js`: pass

## 2026-06-12 追記：Works_NumberTales 横断見直し（ブランチ全体監査ベース）

### 監査観点

- `develop...localize-perfection` の差分対象を起点に、`Works_NumberTales` 配下の JSON を再走査。
- 欠損判定は「同一ファイル内で `_EN` 対応実績があるキーに対して、値あり JP/無印キーで `_EN` が欠ける箇所」。

### 今回の追加補完

1. `DataBases` 非Primaryの未対応を解消

- `db_Secondary.json`
  - `TailsUnit_EN` / `FirstPersonCalling_EN` / `SecondPersonCalling_EN` / `ForMasterCalling_EN` の残件を追補
- `db_SelfSecondary.json`
  - `CodeName_EN` を一括補完（和数字コード名を `One-Two-...` 形式へ変換）
  - `TailsUnit_EN` 残2件を追補
- `db_UnprocessedSecondary.json`
  - `CodeName_EN` を一括補完（和数字コード名を `One-Two-...` 形式へ変換）

2. `db_Primary.json` の既存訳再利用補完

- 同一キー・同一JP値に既存ENが存在するケースのみを対象に、自動再利用で `*_EN` を補完。
- 追加件数: 685
- 方針: 新規意訳はせず、既存英訳の完全一致流用のみを適用。

3. 辞書/型定義の未対応を解消

- `Dictionaries/dict_Formation.json`
  - 既存の誤記キー `Fromation_EN` を参照しつつ `Formation_EN` を追加
- `DataBases/db_type.json`
  - 欠損していた `hashTag_EN`（`ForMasterCalling` / `TailsUnit` / `NumerospecAbout` / `Images` / `EffectText` / `SafetyLevelText`）を追補
- `References/db_type.json`
  - `Images` の `hashTag_EN` を追補

### 再走査結果（2026-06-12 時点）

- `db_Secondary.json`: 欠損 0
- `db_SelfSecondary.json`: 欠損 0
- `db_SemiPrimary.json`: 欠損 0
- `db_UnprocessedSecondary.json`: 欠損 0
- `Dictionaries/dict_Formation.json`: 欠損 0
- `DataBases/db_type.json`: 欠損 0
- `References/db_type.json`: 欠損 0

補足:

- `db_Primary.json` には長文系・会話系・モチーフ系を中心に未補完が残る（再走査上 1342 件）。
- こちらは翻訳量が大きく、語彙統一の再レビューを要するため別フェーズで継続する。

### 検証

- `tests/data.sanity.test.js`: pass
- `tests/bilingual-fields.test.js`: pass

## 2026-06-12 追記：軽量残件 2 ファイル解消（PastDivers / SinisterChangingGirls）

### 対象

- `data/Works_PastDivers/DataBases/db_Primary.json`
- `data/Works_SinisterChangingGirls/DataBases/db_Primary.json`

### 追加・補完内容

1. `data/Works_PastDivers/DataBases/db_Primary.json`

- `桜花 信(とき)` の `Unlike_EN` を追加（`hideText: Non-Public at Pleasure`）

2. `data/Works_SinisterChangingGirls/DataBases/db_Primary.json`

- `六花(ろくばな) ルノ` の `Favor_EN` / `Unlike_EN` を追加
- `財前 小里 / 終藤(すどう) こさと` の `SpecialSkill_EN` / `Unlike_EN` を追加（いずれも `hideText: Judgement Failed`）

### 確認結果

- 同ファイル内の既存 EN 実績基準で再走査し、両ファイルとも未補完 0 を確認

### 検証

- `tests/data.sanity.test.js`: pass
- `tests/bilingual-fields.test.js`: pass

## 2026-06-12 追記：3作品再監査（FLInvestigator78 / UnauthedLogica / UnibyteLive）

### 対象

- `data/Works_FLInvestigator78/DataBases/*.json`
- `data/Works_UnauthedLogica/DataBases/*.json`
- `data/Works_UnibyteLive/DataBases/*.json`

### 実施内容

1. 各ファイルについて、同一ファイル内で既に `*_EN` が存在するキーを基準に「値あり・EN欠損」候補を再抽出
2. 同じ対象範囲で、`*_EN` に和文が残っている候補も再抽出

### 結果

- `data/Works_FLInvestigator78/DataBases/`: 欠損 0 / 和文混入 EN 0
- `data/Works_UnauthedLogica/DataBases/`: 欠損 0 / 和文混入 EN 0
- `data/Works_UnibyteLive/DataBases/`: 欠損 0 / 和文混入 EN 0

### 方針反映

- 上記 3 作品は、2026-06-12 時点では追加の実データ補完を行わず、直近の優先対象から外す
- 以後は `Works_NumberTales` 側の残件処理を優先する

## 2026-06-12 追記：Works_NumberTales `db_Primary` 先頭 10 キャラの `Comments_EN` 補完

### 対象

- `data/Works_NumberTales/DataBases/db_Primary.json`
- 対象レコード: `Num 1` 〜 `Num 10`

### 実施内容

1. 先頭 10 キャラについて、同一ファイル内の既存 EN 実績基準で欠損キーを再確認
2. 欠損キーは無かったため、`Relation.Related[].Comments_EN` / `Relation.Commented[].Comments_EN` の和文残りだけを抽出
3. `Num 1` 〜 `Num 10` のコメント英訳を、`Num 1-3` / `Num 4-6` / `Num 7-10` の3束に分けて順次補完

### 結果

- `Num 1` 〜 `Num 10` について、`Comments_EN` に残っていた和文を全件英訳
- 各束の補完後、対象 Num 範囲で `Comments_EN` に和文残り 0 を確認

### 検証

- `tests/data.sanity.test.js`: pass
- `tests/bilingual-fields.test.js`: pass

## 2026-06-12 追記：Num 1〜22 `Comments_EN` の括り書式統一（DialogueExamples 準拠）

### 対象

- `data/Works_NumberTales/DataBases/db_Primary.json`
- 対象範囲: `Num 1` 〜 `Num 22`
- 対象キー: `Relation.Related[].Comments_EN` / `Relation.Commented[].Comments_EN`

### 実施内容

1. `Comments_EN` が未括りの値を対象に書式を正規化。
2. JP 側 `Comments` が全角丸括弧（`（...）`）の注記文である場合は、EN 側を `(...)` で括る。
3. 上記以外は EN 側を `"..."` で括る（`DialogueExamples.value_EN` と同様の扱い）。
4. 既に `"..."` または `(...)` で括られている値は変更しない。

### 反映件数

- 変換件数: 81

### 運用ルール（固定）

1. `Comments_EN` は原則 `"..."` で保持する。
2. 注記・地の文メモに相当するもののみ `(...)` を許容する。
3. 今後の `Num 23+` 補完でも同じ括りルールを適用する。

### 検証

- `tests/data.sanity.test.js`: pass
- `tests/bilingual-fields.test.js`: pass

## 2026-06-12〜13 引継ぎ追記：翻訳進捗トラッカー（db_Primary.json）

以下のログを統合・削除したため、本ファイルに進捗情報を引き継ぐ。

統合元ログ（削除済み）:
- `2026-06-11_progress_english-fields-addition.md`
- `2026-06-12_progress_english-fields-followup.md`
- `2026-06-12_progress_translation-num11-13.md`
- `2026-06-12_progress_translation-num14-16.md`
- `2026-06-12_progress_translation-num23-25.md`
- `2026-06-12_progress_translation-num26-30.md`

### Relation.Comments_EN 完了状況

| 範囲 | 状態 | 備考 |
|---|---|---|
| Num 1〜10 | ✅ 完了 | Relation.Comments_EN 英訳・括り書式統一 |
| Num 11〜13 | ✅ 完了 | Relation.Comments_EN 英訳完了 |
| Num 14〜16 | ✅ 完了 | Relation.Comments_EN 英訳完了 |
| Num 17〜19 | ✅ 完了 | Relation.Comments_EN 英訳完了 |
| Num 20〜22 | ✅ 完了 | Relation.Comments_EN 英訳完了 |
| Num 23〜25 | ✅ 完了 | Relation.Comments_EN + ConversationPattern_EN 補完 |
| Num 26〜30 | ✅ 完了 | Relation.Comments_EN + 各種 _EN フィールド補完 |
| Num 31〜35 | ✅ 完了 | Relation.Comments_EN + 全トップレベル _EN + 呼称 EN 補完（2026-06-13） |
| Num 36〜 | ⏳ 未対応 | 次の作業対象 |

### トップレベル _EN フィールドの完了状況（db_Primary.json）

| Num 範囲 | 完了済み主要フィールド |
|---|---|
| Num 26〜30 | `Character_EN`, `Hobby_EN`, `SpecialSkill_EN`, `Favor_EN`, `Unlike_EN`, `RelationNotes_EN`, `NumerospecAbout_EN`, `Summary_EN`, `Backgrounds_EN` 等 |
| Num 31〜35 | `Character_EN`, `Hobby_EN`, `SpecialSkill_EN`, `Favor_EN`, `Unlike_EN`, `RelationNotes_EN`, `NumerospecAbout_EN`, `Summary_EN`, `TailsUnit_EN`, `InStory_EN`, `Backgrounds_EN`（Num 33）等 |
| Num 36〜 | 未対応（次の作業対象） |

注: Num 1〜25 のトップレベル _EN は部分的に補完済みだが、漏れの可能性がある。
`scan_numbertales_missing_en.mjs` で再走査して確認すること（`.cache/` に保持）。

### ConversationPattern が存在するキャラ（確認済み）

- Num 25: ConversationPattern_EN + DialogueExamples 対応済み
- Num 26: ConversationPattern_EN + DialogueExamples 対応済み
- Num 29: ConversationPattern_EN + DialogueExamples 対応済み

## 2026-06-13 追記：Num 26〜35 英訳補完（TailsUnit_EN + Num 31〜35 全フィールド）

### 対象

- `data/Works_NumberTales/DataBases/db_Primary.json`

### 実施内容

1. **TailsUnit_EN 追補（Num 26〜29）**
   - 前回バッチで漏れていた `TailsUnit_EN` を補完。
   - パターン: `Fox (branched) type: N tails (upper: X clusters xY, lower: Z cluster xW)`

2. **Num 31〜35 全トップレベル _EN 補完**
   - 補完フィールド: `TailsUnit_EN`, `Character_EN`, `Hobby_EN`, `SpecialSkill_EN`, `Favor_EN`, `Unlike_EN`, `RelationNotes_EN`, `NumerospecAbout_EN`, `Summary_EN`（全5件）
   - Num 33 のみ追加: `Backgrounds_EN`, `InStory_EN`
   - Num 34 のみ追加: `InStory_EN`
   - Num 35 のみ追加: `InStory_EN`

3. **呼称 EN 欠損補完**
   - Num 32: `FirstPersonCalling_EN` を追加（`Thirtwis (*by name)\nI (ore; rough masc.)`）
   - Num 33: `FirstPersonCalling_EN` を追加（`Thirthrey (*by name)`）
   - Num 34: 呼称 EN 全4フィールドを追加（Kansai 系語彙: `I (wai; Kansai rough masc.)`, `sir/lady\nyou (anta; rough)`, `[*second-person calling]\nthat/this/who/which/them; [*by name]`, `my lord(/my lady)\nMaster(/Milady)`）
   - Num 35: `ForMasterCalling_EN` を追加（`bro/sis (anisha/anesha; archaic)`）

4. **Num 31〜35 Relation.Comments_EN 英訳**
   - 全37件の `Comments_EN` を日本語から英語に置換。
   - 括り書式: 会話文 → `"..."`, 注記文 → `(...)` のルール適用。
   - Num 34 は関西弁キャラのため、コメントの語調も慣用に合わせて英訳。

### 新規確定訳語ルール（今回追加）

- Num 34 の `SecondPersonCalling_EN` として `sir/lady` を確定（`旦那さん/奥さん` の Kansai 系敬称形）
- `兄者(あにしゃ)/姉者(あねしゃ)` → `bro/sis (anisha/anesha; archaic)` パターンを確定

### 検証

```
Test Files  4 failed | 15 passed (19)
      Tests  6 failed | 78 passed (84)
```

失敗 6 件はすべて既存の不具合（今回変更とは無関係）:
- `data.shape.test.js`: BelongingArea / References 構造検証（既存）
- `commons.secondaries.test.js`: NumberTales SelfSecondary commons（既存）
- `enrich.dblink.jump.merge.test.js`: `_DBLink._Search` / `_Jump` 解決（既存）
- `pages.characters.ui-output.test.js`: UI 出力回帰テスト 2 件（既存・言語トグル対応時から）

今回の実装による新規テスト失敗: **0件**

---

## 2026-06-12 引継ぎ追記：Comments_EN の呼称整合ルール

### 追加ルール

- 和文コメント内に呼びかけ（例: 君, あんた, 妹/弟 など）が含まれる場合は、対象キャラの `SecondPersonCalling_EN` / `ForMasterCalling_EN` / `ThirdPersonCalling_EN` を参照して英訳語調を合わせる。
- 例:
  - `SecondPersonCalling_EN: you (familiar)` のキャラ: `君` を `you` ベースで翻訳
  - `SecondPersonCalling_EN: you (rough)` のキャラ: `あんた` を rough な語調で翻訳
  - `SecondPersonCalling_EN: thou` のキャラ: 古風口調（`Thou ...`）を維持
- Neutral を含む対象では `he/she` 系を優先し、単独の `he` / `she` 固定で先走らない。

### CodeName_EN の数詞直列化ルール（引継ぎ確定）

- `CodeName_EN` は和数字コード名を英語直列化で表現する。
- 形式: `One-Zero`, `One-Eight`, `One-Nine`, `Two-One`（ハイフン区切り・先頭大文字）
- `db_SemiPrimary.json` / `db_SelfSecondary.json` / `db_UnprocessedSecondary.json` の命名慣用を正準とする。
