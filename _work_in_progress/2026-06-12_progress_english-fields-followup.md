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
