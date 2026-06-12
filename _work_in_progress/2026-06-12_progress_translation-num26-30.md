# 2026-06-12 進捗: Works_NumberTales Num26-30 英訳補完

## 目的

- `data/Works_NumberTales/DataBases/db_Primary.json` の `Num 26` 〜 `Num 30` について、欠損している `*_EN` を 5 キャラ単位運用で補完する。
- `ConversationPattern` が存在するレコード（Num26, Num29）は同時に英訳キーを補完する。

## 実施内容（要約）

1. Num26

- 呼称 EN（`ThirdPersonCalling_EN`, `ForMasterCalling_EN`）を補完。
- 基本説明 EN（`Character_EN`, `Hobby_EN`, `SpecialSkill_EN`, `Favor_EN`, `Unlike_EN`）を補完。
- `RelationNotes_EN`, `NumerospecAbout_EN`, `Summary_EN` を補完。
- `Relation.*.Comments_EN` の和文残りを英訳。
- `ConversationPattern` の各 `*_EN` と `DialogueExamples[].value_EN` / `about_EN`（欠損分）を補完。

2. Num27

- 呼称 EN（`FirstPersonCalling_EN`, `SecondPersonCalling_EN`）を補完。
- 基本説明 EN（`Character_EN`, `Hobby_EN`, `Favor_EN`, `Unlike_EN`）を補完。
- `RelationNotes_EN`, `NumerospecAbout_EN`, `Summary_EN`, `InStory_EN` を補完。
- `Relation.*.Comments_EN` の和文残りを英訳。

3. Num28

- 基本説明 EN（`Character_EN`, `Hobby_EN`, `SpecialSkill_EN`, `Favor_EN`, `Unlike_EN`）を補完。
- `RelationNotes_EN`, `NumerospecAbout_EN`, `Summary_EN` を補完。
- `Relation.*.Comments_EN` の和文残りを英訳。

4. Num29

- 基本説明 EN（`Character_EN`, `Hobby_EN`, `SpecialSkill_EN`, `Favor_EN`, `Unlike_EN`）を補完。
- `RelationNotes_EN`, `NumerospecAbout_EN`, `Summary_EN` を補完。
- `Relation.*.Comments_EN` の和文残りを英訳。
- `ConversationPattern` の各 `*_EN` と `DialogueExamples[].value_EN`（欠損分）を補完。

5. Num30

- 基本 EN（`CodeName_EN`, `FirstPersonCalling_EN`, `ThirdPersonCalling_EN`）を補完。
- 基本説明 EN（`Character_EN`, `Hobby_EN`, `SpecialSkill_EN`, `Favor_EN`, `Unlike_EN`）を補完。
- `NumerospecAbout_EN`, `Summary_EN`, `Backgrounds_EN` を補完。
- `Relation.*.Comments_EN` の和文残りを英訳。

## 影響範囲

- `data/Works_NumberTales/DataBases/db_Primary.json`
- `tests/data.sanity.test.js`
- `tests/bilingual-fields.test.js`

## 検証結果

- `tests/data.sanity.test.js`: pass（3 passed / 0 failed）
- `tests/bilingual-fields.test.js`: pass（18 passed / 0 failed）

## 未完了タスク

1. 次バッチ（`Num 31` 〜 `Num 35`）の同様補完。
2. `Comments_EN` の文体統一（引用符・注記形式）の横断再監査。
3. `ThisMasters_EN` の固有名詞英訳方針（現状は原文維持）の要否確認。

## 参考

- `/_work_in_progress/2026-06-12_progress_translation-style-unified.md`
- `/_work_in_progress/2026-06-12_progress_translation-num23-25.md`

## 2026-06-12 追記: 手直し反映（最小差分）

### 修正内容

1. 呼称 EN の統一（大小文字・過剰敬称）

- `Num 26`: `ForMasterCalling_EN` を `Mr/Ms.~Master` から `Master` に修正
- `Num 29`: `ForMasterCalling_EN` を `big bro/sis` から `Big bro/sis` に修正

2. 文未完了の修正

- `Num 29 -> Relation.Commented -> Num 83 -> Comments_EN`
- `"I'm always overwhelmed by his/her..."` を `"I'm always overwhelmed by him/her."` に修正

### 意図

- 既存多数派の呼称 EN 慣用（`Master`, `Big bro/sis`）へ統一
- 省略記号で終わる未完了文を解消し、文法上の完結性を確保

## 2026-06-12 追記: 再手直し反映（my Master 統一）

### 修正内容

- `Num 26`: `ForMasterCalling_EN` を `Mr/Ms.Master` から `my Master` に変更
- `Num 26 -> ConversationPattern -> DialogueExamples`: 呼びかけ文中の `Mr/Ms.Master` を `my Master` に変更

### 意図

- `Mr/Ms.` と `Master` の直結による不自然さを避けつつ、丁寧さ・親密さを維持するため
