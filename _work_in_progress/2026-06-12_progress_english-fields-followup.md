# 2026-06-12 進捗レポート：英訳フィールド追補（Num15-17 / enum・relation辞書）

## 目的

既存の英訳対応に続き、以下の未整備ポイントを補完する。

- `#Enum` 系フィールド（`SpecialPattern`）の英語表示対応
- 他キャラ紐づけ項目（`Relation`）のラベル英語化
- wrapper 関連（`AnivDay`）の英語注釈追記
- NumberTales 実データの連番 3 キャラ（Num15〜17）の EN 補完

## 変更点の要約

### 1. 実データ（Num15〜17）

対象ファイル:

- `data/Works_NumberTales/DataBases/db_Primary.json`

対応内容:

- Num15/16/17 に `ForMasterCalling_EN` を追加
- Num15/16/17 に `RelationNotes_EN` を追加
- Num15/16/17 に `Summary_EN` を追加
- Num15/16/17 の `AnivDay[]` 各要素へ `about_EN` を追加
- Num15/16/17 の `InStory_EN` / `Backgrounds_EN`（存在する項目）を追加

注記:

- キャラクター名・固有呼称は原文を保持し、説明文のみ英訳
- 創作上の造語は既存英名（例: `15(Fifteeld)`）を踏襲

### 2. Enum 辞書 (`SpecialPattern`) の英訳追加

対象ファイル:

- `data/Works_NumberTales/DataBases/db_meta.json`

対応内容:

- `General.$VarsDef.$Def_NumerospecStats.#List_SpecialPattern` を
  文字列配列からオブジェクト配列へ更新
- 各エントリに以下を付与
  - `SpecialPattern`（既存JPコード文字列）
  - `SpecialPattern_EN`（英語訳）

期待効果:

- `lang=en` 表示時に `SpecialPattern` が英語ラベル解決されやすくなる

### 3. Relation ラベル辞書の英訳追加

対象ファイル:

- `data/Works_NumberTales/DataBases/db_meta.json`

対応内容:

- `General.$VarsDef.$Def_Relations.#List_RelationLabel[]` 各エントリへ
  `RelationLabel_EN` を追加

期待効果:

- `Relation` セクションのタグ表記で EN 表示対応を強化

## 影響範囲

- `data/Works_NumberTales/DataBases/db_Primary.json`
- `data/Works_NumberTales/DataBases/db_meta.json`

## 未完了タスク

- `ThisMasters` 系の英訳表示運用（現状は `value` が主で、EN専用キー運用が未確立）
- wrapper `DayAbout` の完全 bilingual 化方針（`DayAbout_EN` を schema 正式化するか）
- `db_type.json` `$MetaType` と `db_meta.json` の EN メタ項目（`DB_Summary` など）の体系化

## 参考

- `_work_in_progress/2026-06-11_progress_english-fields-addition.md`
- `_work_in_progress/2026-06-12_progress_language-toggle.md`
- `docs/schema-meta-processing.md`

---

## 2026-06-12 追記：`#Enum` 系の `dict_*.json` 分離（全タイトル対応基盤）

### 目的

- `#List_*`（実質 `#Enum` 相当）を作品別 `Dictionaries/dict_*.json` へ切り出しやすくし、
  NumberTales 以外のタイトルにも同じ運用を適用できるようにする。

### 追加したもの

- `tools/extract-enum-lists-to-dictionaries.mjs`
  - `DataBases/db_meta.json` 内の `#List_*` を探索
  - 作品別 `Dictionaries/db_meta.json` と `dict_*.json` を生成可能
  - `--write` で書き込み、`--prune` で元 `db_meta` の `#List_*` を削除可能
  - `--work=Works_<title>` で対象作品を限定可能

- `package.json` scripts
  - `dict:plan-enums`（dry-run）
  - `dict:export-enums`（生成）
  - `dict:export-enums:prune`（生成 + 元定義削除）

- `docs/db-update-guidelines.md`
  - 4.0節として辞書分離運用ルールと実行コマンドを追記

### 動作確認（dry-run）

- 実行: `npm.cmd run dict:plan-enums`
- 検出結果:
  - 対象作品: 5/9
  - 対象 `#List_*`: 11
  - 生成予定ファイル: 16

### 備考

- 今回は安全のため dry-run のみ実施（データ本体の大量移行は未実行）。
- 実際の一括移行は、差分量が大きくなりやすいため段階実行を推奨。

---

## 2026-06-12 追記：非 NumberTales 1作品目（Works_DestinyFoxRecords）

### 目的

- NumberTales 以外の作品から、1作品ずつ未英訳フィールド対応を進める。
- 今回は `Works_DestinyFoxRecords` を対象に、構造を壊さない最小単位の補完を行う。

### 変更点

- 対象ファイル: `data/Works_DestinyFoxRecords/DataBases/db_Primary.json`
  - 最初の 3 レコード（`Unit: s / m / kg`）に `Unit_EN` を追加。
    - `Time(KMS Method)`
    - `Length(KMS Method)`
    - `Mass(KMS Method)`

- 対象ファイル: `data/Works_DestinyFoxRecords/DataBases/db_meta.json`
  - `Databases.#DB_Primary` に `DB_Summary_EN` を追加。

### 補足

- `Relation` / `ThisMasters` / `IdentityMotif` / `SpecialPattern` など、初回指示の一部カテゴリは本作品データに該当が薄いため、今回は存在する未英訳要素（`Unit_JP` 対応の `Unit_EN`、`DB_Summary_EN`）を優先した。

### 追加対応（同日・一括補完）

- `data/Works_DestinyFoxRecords/DataBases/db_Primary.json` の残り 6 件について `Unit_EN` を追加。
  - `光度` -> `Luminous Intensity`
  - `絶対温度` -> `Thermodynamic Temperature`
  - `電流値` -> `Electric Current`
  - `物質量` -> `Amount of Substance`
  - `角度(弧度法)` -> `Plane Angle (Radian Measure)`
  - `立体角(弧度法)` -> `Solid Angle (Radian Measure)`

---

## 2026-06-12 追記：2作品目（Works_FLInvestigator78）

### 実施内容

- `tools/extract-enum-lists-to-dictionaries.mjs` を使い、`Works_FLInvestigator78` の `#List_*` を辞書化。
  - 実行: `npm.cmd run dict:export-enums:prune -- --work=Works_FLInvestigator78`
  - 反映: `dict_Stoat.json`, `dict_Material.json`, `dict_KinematicOrStatic.json`, `dict_RoleType.json`, `dict_DualizePattern.json`, `dict_SpecialPattern.json`
  - `DataBases/db_meta.json` 側から該当 `#List_*` は削除（辞書参照へ移行）

- 辞書化後の EN 補完を実施。
  - `dict_Material.json`: `Material_EN` を追加
  - `dict_DualizePattern.json`: `Pattern_EN` を追加
  - `dict_SpecialPattern.json`: `SpecialPattern_EN` を追加

- メタ英訳の補完。
  - `data/Works_FLInvestigator78/DataBases/db_meta.json`
  - `#DB_Primary`, `#DB_PrimaryDealer` に `DB_Summary_EN` を追加

### 追加対応（UIメタ表示の英訳反映）

- `pages/characters.js` の表示経路（`work.Works_Summary_EN` 優先）に合わせ、
  `data/db_meta.json` の `CreationWorks` 側へ以下を追加。
  - `#Works_FLInvestigator78.Works_Summary_EN`
  - `#Works_DestinyFoxRecords.Works_Summary_EN`

- これにより、`lang=en` 時の「Work Info」要約が JP ではなく EN を参照できる状態にした。

---

## 2026-06-12 追記：各作品 `DB_Summary_EN` の横展開

### 目的

- `Works_Summary_EN` 補完後の流れとして、各作品 `DataBases/db_meta.json` における
  `Databases.#DB_*` / `Databases.#Ref_*` の `DB_Summary_EN` を拡充し、
  `lang=en` 時の DB メタ概要表示を統一する。

### 対応ファイル

- `data/Works_NumberTales/DataBases/db_meta.json`
- `data/Works_PastDivers/DataBases/db_meta.json`
- `data/Works_ShouArRiders/DataBases/db_meta.json`
- `data/Works_SinisterChangingGirls/DataBases/db_meta.json`
- `data/Works_UnauthedLogica/DataBases/db_meta.json`
- `data/Works_UnibyteLive/DataBases/db_meta.json`
- `data/Works_Proxies/DataBases/db_meta.json`

### 主な追記

- NumberTales:
  - `#DB_Primary` / `#DB_SemiPrimary` / `#DB_SelfSecondary` / `#DB_Secondary`
  - `#DB_UnprocessedSecondary`（`#DB_Secondary` 配下）
  - `#Ref_Glossary` / `#Ref_Reference`
- PastDivers: `#DB_Primary` / `#DB_SemiPrimary`
- ShouArRiders: `#DB_Primary`
- SinisterChangingGirls: `#DB_Primary`
- UnauthedLogica: `#DB_PrimaryMobs` / `#DB_Primary`
- UnibyteLive: `#DB_Primary` / `#DB_PrimaryPerformer`
- Proxies: `#DB_Proxy`

### 備考

- 既存の `DB_Summary`（JP）本文は変更せず、EN フィールドを追加する形で対応。
- 既に `DB_Summary_EN` が存在する `Works_FLInvestigator78` / `Works_DestinyFoxRecords` は今回対象外。

---

## 2026-06-12 追記：Works_PastDivers の辞書化（`#List_Lunar`）

### 実施内容

- 実行コマンド:
  - `npm.cmd run dict:plan-enums -- --work=Works_PastDivers`
  - `npm.cmd run dict:export-enums:prune -- --work=Works_PastDivers`

- 反映内容:
  - `data/Works_PastDivers/DataBases/db_meta.json`
    - `General.$VarsDef.$Def_Chronos.#List_Lunar` を辞書へ移行（prune）
  - `data/Works_PastDivers/Dictionaries/dict_Lunar.json`
    - `#List_Lunar` 由来の辞書データを新規追加
  - `data/Works_PastDivers/Dictionaries/db_meta.json`
    - `#Dict_Lunar` を新規追加

### ラベル推敲（FL 命名トーン準拠）

- `#Dict_Lunar` の表示名を以下へ調整。
  - `DB_Label`: `月暦種別辞書`
  - `DB_Label_EN`: `Lunar Type Dictionary`

### 検証

- `tests/data.sanity.test.js`: pass
- `tests/bilingual-fields.test.js`: pass

---

## 2026-06-12 追記：和英共通値フィールドの `langMode: shared` 導入

### 背景

- `ModelNumber` / `BustSize` / `Letter.Alphabet` のように、値自体は和英で共通に扱えるフィールドについて、
  常に `_EN` を併記しなくても EN 表示で流用できるようにしたい。
- 併せて、`hideText` は `data/db_type.json` の `#List_hideText` に和英対応があるため、
  フィールド別 `_EN` を足さずに varsdef 側の英語ラベルを優先できるようにする。

### 対応内容

- `pages/characters.js`
  - `$display.langMode === "shared"` の場合、EN 表示時も base 値をフォールバックとして採用するよう調整
  - `hideText` の表示は schema 種別に依存させず、常に varsdef (`#List_hideText`) から英語ラベル解決を試みるよう調整

- `data/db_type.json`
  - `ModelNumber` に `$display.langMode: "shared"` を追加
  - `BustSize` に `$display.langMode: "shared"` を追加

- `data/Works_UnibyteLive/DataBases/db_type.json`
  - `$IndexDef.Letter.Alphabet` に `$display.langMode: "shared"` を追加

- 実データ整理
  - `data/Works_PastDivers/DataBases/db_Primary.json`
    - `Yayoi.Unlike_EN` を削除（`hideText` varsdef 英訳へ委譲）
    - `Leap.ModelNumber_EN` / `Leap.RaceType_EN` を削除（共通値として base を利用）

### 検証

- `tests/pages.characters.ui-output.test.js`
  - 追加テスト:
    - `hideText` が EN で varsdef 英訳されること
    - `langMode: shared` な `ModelNumber` が `_EN` 空でも base 値で表示されること
- `tests/bilingual-fields.test.js`: pass
- `tests/data.sanity.test.js`: pass

### 備考

- `tests/pages.characters.ui-output.test.js` には今回変更と無関係の既知失敗 2 件が引き続き存在するため、
  追加した shared/hideText 回帰テストは個別実行で確認した。

---

## 2026-06-12 追記：shared 値フィールドの横展開と冗長 `_EN` 整理

### 方針

- 値そのものが和英共通で扱える field は、`$display.langMode: "shared"` を付けて
  EN 表示時も base 値をそのまま利用できるようにする。
- `#Dict_*` / `#List_*` / `hideText` のように、varsdef 側で和英解決または raw fallback が可能なものは
  冗長な `_EN` を削ってデータを簡素化する。

### typedef 追加・更新

- `data/Works_FLInvestigator78/DataBases/db_type.json`
  - `Card.Stoat`
  - `ArcanumspecStats.SpecType.Material`
  - `ArcanumspecStats.SpecType.KinematicOrStatic`
  - `ArcanumspecStats.SpecType.RoleType`
  - 以上に `langMode: "shared"` を追加

- `data/Works_PastDivers/DataBases/db_type.json`
  - `Chronos.Lunar` に `langMode: "shared"` を追加

### 冗長 `_EN` の削除

- `data/Works_FLInvestigator78/Dictionaries/`
  - `dict_Stoat.json`: `Stoat_EN` を削除
  - `dict_Material.json`: `Material_EN` を削除
  - `dict_KinematicOrStatic.json`: `KinematicOrStatic_EN` を削除
  - `dict_RoleType.json`: `RoleType_EN` を削除

- `data/Works_NumberTales/DataBases/db_Primary.json`
  - `Unlike_EN: { hideText: "???" }` を削除
    - `#List_hideText` の varsdef 英訳へ委譲

### 検証

- `tests/pages.characters.ui-output.test.js`
  - `renders varsdef-backed hideText values in English without requiring a field-specific _EN sibling`: pass
  - `renders shared-language fields in English from the base value even when the _EN sibling is blank`: pass
- `tests/bilingual-fields.test.js`: pass
- `tests/data.sanity.test.js`: pass

---

## 2026-06-12 追記：`Works_Proxies` / `Works_ShouArRiders` の現状整理

### 目的

- shared 値フィールド整理の後、次の翻訳対象候補だった `Works_Proxies` と `Works_ShouArRiders` を再点検し、
  直ちに手動英訳が必要な残件があるかを確認する。

### 結果

- `data/Works_Proxies/DataBases/db_Proxy.json`
  - 現在のデータでは、既存トップレベル項目の英訳は概ね充足している。
  - 一部 `hideText` 値（例: `Unlike`, `Weight_kg`, `SpecialSkill`）は `#List_hideText` の varsdef 英訳 fallback で対応可能。
  - `ConversationPattern` は存在するレコードでは EN 項目が概ね揃っており、未入力そのものの項目を新規創作的に補完する段階ではないと判断。

- `data/Works_ShouArRiders/DataBases/db_Primary.json`
  - 現行レコード群は、今回の運用基準（空値除外・hideText fallback 許容）では手動追補が必要な未英訳トップレベル項目なし。

### 補足

- この2作品については「今すぐ埋めるべき不足英訳」よりも、今後は wording 推敲や shared/fallback ルール適用の横展開が主眼になる見込み。

---

## 2026-06-12 追記：グローバル辞書の shared 境界整理

### 観点

- `data/Dictionaries/` 配下のグローバル辞書について、
  「base 値を EN でもそのまま使う shared 辞書」と
  「JP/EN の別ラベルを維持すべき辞書」を切り分ける。

### 判断結果

- `RaceType`:
  - base 値が `Human` / `Warfox(Acquired)` のような英字コードで、JP 表示側のみ `RaceType_JP` を持つ構造
  - EN 表示では base 値をそのまま使うのが自然なため、shared 扱いを正式化

- `Area` / `Artifact` / `Faction`:
  - base 値が JP 文字列、または EN 側に独立した訳語を持つため、`*_EN` を維持すべき辞書と整理

### 実装

- `data/db_type.json`
  - `RaceType` フィールドに `$display.langMode: "shared"` を追加

- `data/Dictionaries/db_meta.json`
  - `#Dict_RaceType.langMode: "shared"` を追加

- `data/Dictionaries/db_type.json`
  - 辞書カタログ schema に `langMode` を追加

### 検証

- `tests/pages.characters.ui-output.test.js`
  - `renders shared RaceType dictionary values in English from the base code`: pass

---

## 2026-06-12 追記：`Works_ShouArRiders` の `Beast` shared 化

### 背景

- `Works_ShouArRiders/DataBases/db_meta.json` の `General.$VarsDef.$Def_BeastType.#List_Beast` では、
  `Beast_EN` が `Beast` と同値の英字コードになっていた。
- これは `Stoat` / `Lunar` と同様に、EN 表示時は base 値をそのまま利用できる shared 値と判断した。

### 実施内容

- `data/Works_ShouArRiders/DataBases/db_type.json`
  - `$IndexDef.BeastType.$type[Beast]` に `$display.langMode: "shared"` を追加

- `data/Works_ShouArRiders/DataBases/db_meta.json`
  - `General.$VarsDef.$Def_BeastType.#List_Beast[]` から `Beast_EN` を削除

### 検証

- `tests/pages.characters.ui-output.test.js`
  - shared/hideText の既存 focused テスト 3 件: pass
- `tests/bilingual-fields.test.js`: pass
- `tests/data.sanity.test.js`: pass

---

## 2026-06-12 追記：Works_PastDivers キャラ本体 EN 補完（全数）

### 対象

- `data/Works_PastDivers/DataBases/db_Primary.json`

### 実施内容

- 既存データ 13 レコードを走査し、値が入っているトップレベル項目で
  `_EN` 未設定のものを抽出して補完。
- 今回の追加項目:
  - `Yayoi`: `Unlike_EN`（`hideText` 形式）
  - `Leap`: `ModelNumber_EN`, `RaceType_EN`

### 結果

- 抽出条件上の「未英訳トップレベル項目」は 0 件になった。

### 検証

- `tests/data.sanity.test.js`: pass
- `tests/bilingual-fields.test.js`: pass
