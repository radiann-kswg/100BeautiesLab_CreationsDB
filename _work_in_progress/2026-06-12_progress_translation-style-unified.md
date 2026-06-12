# 2026-06-12 統合進捗ログ：英訳対応総覧と共通ルール（localize-perfection 反映版）

## 目的

`Works_NumberTales` 以外の創作タイトルと、`Works_NumberTales` の `DB_SemiPrimary` で実施してきた英訳対応を 1 本に統合し、
今後の全タイトル共通で使える英訳ルール・書式ルール・確認手順を明文化する。

このログは、`localize-perfection` での運用知見を `develop` でも再利用するための基準書として扱う。

## 対象範囲

- 対象データ:
  - `data/Works_*/DataBases/db_*.json`
  - `data/Works_*/DataBases/db_meta.json`
  - `data/Works_*/DataBases/db_type.json`
  - `data/Works_*/Dictionaries/dict_*.json`
  - 必要に応じて `data/db_type.json`, `data/db_meta.json`
- 今回の統合主対象:
  - Non-NumberTales 全作品
  - NumberTales の `DB_SemiPrimary`

## これまでの対応サマリ（俯瞰）

### 1. Non-NumberTales 側で実施した主な対応

- `Works_DestinyFoxRecords`
  - `db_Primary.json` の `Unit_EN` を全エントリで補完。
  - `db_meta.json` の `DB_Summary_EN` を補完。
- `Works_FLInvestigator78`
  - `db_meta` の `#List_*` を `Dictionaries/dict_*.json` へ分離。
  - `dict_Material` / `dict_DualizePattern` / `dict_SpecialPattern` の EN ラベル補完。
  - `DB_Summary_EN` を `#DB_Primary` / `#DB_PrimaryDealer` に補完。
- `Works_PastDivers`
  - `db_Primary.json` の未英訳トップレベル項目を補完。
  - `#List_Lunar` の辞書化（`dict_Lunar.json`）を実施。
- `Works_UnauthedLogica`
  - `db_Primary.json` の `ModelName_EN` 残件を最終補完（4件）。
- `Works_Proxies` / `Works_ShouArRiders` / `Works_SinisterChangingGirls` / `Works_UnibyteLive`
  - 現行ルール上の未英訳残件を順次消化。
  - wording 調整、表記ゆれ是正、shared/fallback 運用へ寄せる整理を実施。

### 2. NumberTales `DB_SemiPrimary` 側で実施した主な対応

- `data/Works_NumberTales/DataBases/db_SemiPrimary.json`
  - `Num 100, 111, 222, 444, 666, 777, 777.Jackpot, 999, 3x11` など主要個体の `_EN` 欠損を補完。
  - 呼称系、`Character/Hobby/SpecialSkill/Favor/Unlike`、`RelationNotes`、`NumerospecAbout`、`Summary`、`Backgrounds` を中心に対応。
  - `dev` 系の `Backgrounds_EN` を連番で補完。
- 方針上の除外:
  - `ThisMasters_EN` は運用未正式化のため追加対象外（現時点）。

### 3. 表示系・基盤側で実施した主な対応

- `langMode: shared` の導入拡張
  - 和英共通値フィールド（例: `ModelNumber`, `BustSize`, 一部辞書値）を base 値再利用に統一。
- `hideText` の英語表示
  - `#List_hideText` からの英語解決を優先し、フィールド別 `_EN` の重複を削減。
- 辞書分離
  - `db_meta` の `#List_*` を `Dictionaries/dict_*.json` へ段階移行可能な運用を整備。

## 全JSON DB 再確認（`Works_NumberTales` `DB_Primary` 除外）

### 再確認の実施条件

- 対象:
  - `data/Works_*/DataBases/db_*.json`
  - ただし `data/Works_NumberTales/DataBases/db_Primary.json` は除外
- 判定観点:
  - `*_JP` が存在する項目に対して `*_EN` の有無を確認
  - 既定除外ルール（`langMode: shared`, `hideText`, `ThisMasters`）は従来方針どおり適用
- 出力:
  - `.cache/translation_completion_report.json` に集計結果を保存

### 集計結果（2026-06-12）

- 走査ファイル数: 17
- 完了ファイル数: 16
- 未完了ファイル数: 1
- 判定対象ペア総数: 94
- 完了ペア数: 93
- 未完了ペア数: 1

### 完了確認できた主な DB

- `Works_DestinyFoxRecords`: `db_Primary`
- `Works_FLInvestigator78`: `db_Primary`, `db_PrimaryDealer`
- `Works_NumberTales`: `db_Secondary`, `db_SelfSecondary`, `db_SemiPrimary`, `db_UnprocessedSecondary`
- `Works_PastDivers`: `db_Primary`
- `Works_ShouArRiders`: `db_Primary`
- `Works_SinisterChangingGirls`: `db_Primary`
- `Works_UnauthedLogica`: `db_Primary`, `db_PrimaryMobs`
- `Works_UnibyteLive`: `db_Primary`, `db_PrimaryPerformer`, `db_temp`

### 要確認 1 件（未完了）

- `data/Works_Proxies/DataBases/db_Proxy.json`
  - レコード: 3 代目ラジアン
  - 項目: `GenderType.about_JP` に対する `about_EN` が未配置（`GenderType.about`）

注記:

- 本件は `about_EN` の schema 運用粒度（`DayAbout_EN` / `about_EN`）未確定という既知課題とも関係する。
- 厳密完了扱いにする場合は `about_EN` を補完し、暫定運用でよい場合は「保留ルール」に明示して管理する。

## 英訳の共通ルール（全タイトル共通）

### A. キー運用ルール

- 既存 JP フィールドに対して、対応する `_EN` を同一レコード内に追加する。
- 例外として、以下は `_EN` を必須にしない:
  - `$display.langMode: "shared"` のフィールド
  - `hideText` で varsdef 側に英語対があるもの
  - 運用未正式化キー（例: `ThisMasters_EN`）
- 新規創作本文の自動生成は行わない。既存 JP 内容の英訳補完に限定する。

### B. 書式・語法ルール

- 呼称系の書式:
  - `FirstPersonCalling_EN`, `SecondPersonCalling_EN`, `ThirdPersonCalling_EN`, `ForMasterCalling_EN` は既存レコードのスタイルに合わせる。
  - 括弧注記は既存フォーマットを優先（例: `I (watashi)`, `you (kimi)`, `[*by name]`）。
- 大文字・小文字:
  - 固有称号は大文字、一般呼称は小文字。
  - 例: `Master`（固有） / `my lord`（一般）
- 記号・句読点:
  - 末尾の不要な `;` や二重スペースを残さない。
  - 改行区切りの多値は JP 側構造を維持しつつ英訳も同段数で揃える。
- 固有名詞:
  - 既存辞書・既存 EN 表記を優先し、同一概念を複数綴りにしない。
  - 例: `LotusNinea` を正とし、派生は文脈に応じ `LotusNinea(n)` / `LotusNinean` を使い分ける。

### C. 代名詞ルール

- `GenderType` と既存英訳の慣例を優先する。
- 迷った場合は同作品・同系統レコードの既存 `_EN` を参照し、独自解釈で揺らさない。
- `Neutral` の扱いは、既存文体に合わせて `he/she` などを用いる。

### D. プレースホルダ運用

- `[*???]` / `[※？？？]` は「流動・秘匿」運用の定型として、原則そのまま維持する。
- プレースホルダを英訳で置換するのは、運用ルール変更の合意がある場合のみ。

### D-2. wrapper / about 系の運用ルール（追補）

- `*_withAbout` 系や `value + about` 構造では、`about_JP` と `about_EN` を対で管理する。
- `about_EN` の追加対象は「公開表示で意味差が出る項目」を優先する。
- `about_EN` の運用未確定領域（例: 一部 `DayAbout` 系）は、保留対象として明示し、無断で一括補完しない。

### D-3. `DialogueExamples` / 会話例の運用ルール（追補）

- 会話例は次の 2 形式を許容する。
  - 文字列単体（既存互換）
  - オブジェクト形式（`value_JP`, `value_EN`, `about_JP`, `about_EN`）
- 英訳補完時は、既存の日本語例を尊重し、創作本文の新規生成にならない範囲で対応する。
- `about_*` は文脈注釈であり、本体台詞より後回しにしてもよいが、UI 表示で必要なら優先補完する。

### D-4. メタ情報英訳の優先順位（追補）

- 作品概要:
  - `data/db_meta.json` の `CreationWorks.#Works_*.Works_Summary_EN` を正とする。
- DB 概要:
  - 各作品 `DataBases/db_meta.json` の `Databases.#DB_*.DB_Summary_EN` を正とする。
- 辞書ラベル:
  - `Dictionaries/dict_*.json` 内の `*_EN` を優先し、`db_meta` 直書きより辞書分離を優先する。

### E. ユーザー手直し書式マッピング（優先適用）

- 本節は、ユーザーがセッション中に明示した「表記テンプレート」「置換方針」を記録したもの。
- 既存英訳の揺れを修正する際は、まず本節の書式を優先し、そのうえで作品内既存文体へ寄せる。

#### E-1. 呼称・代名詞プレースホルダ

- `*れ` は文脈に応じて目的格側の語へ置換する。
  - 基本候補: `this` / `that` / `what` / `them (as objective)`
  - 選択基準: 前後文脈で指示対象が単数か複数か、具体対象か抽象対象かを優先する。
- `[※二人称]` は `[*second-person calling]` として扱う。
  - `SecondPersonCalling_EN` の値を呼び出す参照記法として統一する。

#### E-2. 呼称参照トークンの正規化

- 呼称参照は `[*by name]` 形式を正とする。
- 既存揺れ `~[*by name]` は不要記号を除去し、`[*by name]` に正規化する。
- 文中の接続記号は最小化し、`he/she; [*by name]` のように読みやすい区切りへ寄せる。

#### E-3. 既知の誤記・表記ゆれ修正（ユーザー合意済み）

- `Finaly` -> `Final`
- `Fourty` -> `Forty`
- `Fourty-Three` -> `Forty-Three`
- `3nd Gen.` -> `3rd Gen.`
- `OnesConcentration` -> `One'sConcentration`
- `UntiYardPonds` -> `AntiYardPounds`
- `RotusNinea` 系 -> `LotusNinea` 系

#### E-3.1 語調・書式の手直し（追加反映）

- 一般呼称の小文字化（固有称号と区別）
  - `My lord` -> `my lord`
  - `Young sir/lady` -> `young sir/lady`
- 呼称参照まわりの記号整理
  - `he/she; ~[*by name]` -> `he/she; [*by name]`
  - 文末の不要記号（例: 末尾 `;`）を削除
- 代名詞・語感の微調整
  - `GenderType` と既存訳調に合わせて、`Summary_EN` の代名詞選択を補正
  - 特に NumberTales 連番初期個体（Num1/Num2）は、既存文体との整合を優先して調整

#### E-3.2 DB_SemiPrimary 側での追加修正例

- NumberTales `db_SemiPrimary` でも、英訳補完と同時に既知誤記を是正
  - 例: `archaic` / `contractor` 周辺の誤記修正（Num666）

#### E-3.3 表記維持（修正しない）ルールの明示

- プレースホルダは維持:
  - `[*???]`, `[※？？？]` は置換しない
- 意図語は維持:
  - `OvderRoll` は意図表記として保持する
- 運用未確定キーは保留:
  - `ThisMasters_EN` は現時点で追加対象外

#### E-4. このマッピングの運用条件

- 作品固有設定で意図が明確な語は、ユーザーの判断を優先する。
- 意図表記（例: `OvderRoll`）は誤字修正対象に含めない。
- 新しい手直し指示が出た場合は、本節へ追記して全作品へ横展開する。

## 英訳作業の標準手順（再発防止向け）

1. 抽出

- 作品単位で「JP 値あり・対応 `_EN` なし」を機械抽出する。
- `shared` / `hideText` / プレースホルダは除外条件として先に適用する。

2. 追加

- 連番順に 3 キャラ単位で追加する（運用上のレビュー粒度を維持）。
- 追加は原則トップレベルの対になる項目から優先する。

3. 推敲

- 既存 EN との語調合わせ（同義語・句読点・括弧注記・改行）を行う。
- 明確な誤字（例: `Finaly`, `Fourty`）を同時に是正する。

4. 検証

- `tests/data.sanity.test.js`
- `tests/bilingual-fields.test.js`
- 必要に応じて表示系テスト（`pages.characters.*`）

## 表記ゆれ・誤植を防ぐための最低チェックリスト

- 同一キーで語順が揺れていないか（例: `I (watashi)` vs `watashi (I)`）。
- 同一概念で固有名詞綴りが揺れていないか（例: `LotusNinea`）。
- 呼称の大小文字ルールに反していないか。
- 末尾記号（`;`, `,`）の取り残しがないか。
- 既存 `GenderType` と代名詞が矛盾していないか。
- 同一作品内で似たキャラの訳調が極端に乖離していないか。

## 既知の保留事項

- `ThisMasters_EN` の正式運用は未決。
- `DayAbout_EN` / `about_EN` の schema 正式化粒度は今後の整理対象。
- 一部 `ConversationPattern` の全文英訳は段階導入（創作本文の新規生成制約に配慮）。

## 今後の適用方針

- この文書を英訳対応の一次基準にし、作品追加時も同ルールを流用する。
- ルール変更が出た場合は、差分のみ本書へ追記して運用を一本化する。
- NumberTales 本体（`DB_Primary`）の残件補完も同じ手順で続行する。
