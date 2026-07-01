# ConversationPattern 推敲（Num8以降）

## 目的
`data/Works_NumberTales/DataBases/db_Primary.json` の `ConversationPattern`（Num1〜7はサークル主が手直し済み）について、Num8以降・特殊枠（67-old/000/0/00）の仮入力（旧テンプレ文）を、Num1〜7の水準に合わせて推敲した。

## 変更点の要約
- 対象: Num8〜99（データがあるもののみ、90キャラ）+ 67-old / 000 / 0 / 00。
- `TalkingTone` / `TopicPreference` / `TalkFrequency` / `PreferredTopics` / `AvoidedTopics` / `ConversationNotes`（JP/EN計12フィールド）を書き直し。
- 根拠は既存フィールド（`Character` / `Hobby` / `SpecialSkill` / `Favor` / `Unlike` / `Strength` / `Weakness` / `RelationNotes` / `Relation[].Comments`）のみ。新規設定・エピソードは創作していない。
- `DialogueExamples` は未変更（対象外、ユーザーが別途入力予定）。
- 6バッチに分割してサブエージェントで並行推敲後、旧テンプレ文の残存（正規表現スキャン）を検証し、検出分（TalkFrequency/AvoidedTopics/PreferredTopicsの一部、約24キャラ）を手直しして反映。

## 影響範囲
- `data/Works_NumberTales/DataBases/db_Primary.json`

## 確認
- `npm test`: 20 files / 136 tests パス。
- 反映後のJSON構文チェックOK、`DialogueExamples`件数は変更前後で不変。

## 未完了タスク
- `2-alt` / `10-alt` はソース情報不足のためConversationPattern未入力のまま（従来通り）。
- `DialogueExamples` はサークル主が別途手入力予定。
