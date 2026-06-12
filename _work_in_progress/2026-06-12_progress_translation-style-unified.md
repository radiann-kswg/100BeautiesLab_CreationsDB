# 2026-06-12 統合進捗ログ：英訳ルール完全改稿（localize-perfection 実データ正準版）

## 目的

この文書は、localize-perfection ブランチで実際に追加・更新された英文フィールドを唯一の正（Source of Truth）として、
和文フィールドに対する厳密な英訳ルールと、既存英文フィールドとの整合性ルールを再定義するための基準書である。

以後の英訳作業は、この文書の「実データ準拠ルール」を優先し、一般的な翻訳規則よりも既存 JSON 実装との一致を優先する。

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
- 完了: 92
- 未完了: 1

未完了 1 件:

- data/Works_Proxies/DataBases/db_Proxy.json
  - record: index:1（3代目ラジアン）
  - path: about_JP（GenderType 内）
  - expected: about_EN

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

- 3キャラ単位で追加（運用上のレビュー粒度を維持）
- ConversationPattern がある場合は同時に英訳対を追加

### 手順 4: 記号・語形検査

- [*by name] / [*second-person calling] / 小文字呼称を確認
- 既知誤記と固有名詞揺れを確認

### 手順 5: テスト

- npm test
- 必要に応じて対象テストのみ再実行（bilingual-fields 等）

## 作業運用ルール（継続英訳向け）

1. 英訳は番号順で進める。
2. 1セッション 3キャラ単位で進める。
3. ConversationPattern があるキャラは同時に英訳対応する。
4. 長期対応は develop から作業ブランチを分ける。

## 保留事項（明示管理）

1. ThisMasters_EN の正式運用は未確定。
2. about_EN / DayAbout_EN の適用粒度は要整理。
3. data/Works_Proxies/DataBases/db_Proxy.json の about_EN 欠損 1 件は未解消。

## 今後の適用方針

1. 本書を英訳対応の一次基準とし、以降の翻訳判断は本書へ追記して一本化する。
2. ルール変更時は「先に本書更新、次にデータ更新」の順で運用する。
3. 次回以降の英訳追加は、必ず localize-perfection 実データと同じ記法体系へ収束させる。
