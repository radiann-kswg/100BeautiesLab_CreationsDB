# 2026-07-03 現行タスク台帳

## 目的

進行中の実務タスクだけを 1 枚に集約し、次回セッションの起点を明確にする。
詳細経緯は各 progress ログを参照し、本台帳は「いま何が残っているか」に限定する。

## 現行タスク一覧（develop 観点・優先順）

### P1) AppearanceDetail 手動入力の残件処理（最優先） → 2026-07-06 完了

- 対象ログ:
  - `.completed/2026-06-30_progress_appearance-detail-cleanup.md`
- 完了内容:
  - BodyPart 手動入力 6 件（Num:35/60/61 は `Costume` フィールド新設 + プレースホルダー削除で対応）
  - Num:8 / 32 / 60 の既存不整合修正
  - `Costume`フィールド新設・`#BodyPart_Interchangeable`/`#BodyPart_FaceMaking` enum追加（User判断による追加スコープ）
- テスト再実行済み（`npm test` 22 files / 178 tests）、詳細は`CHANGELOG.md`参照

### P2) ConversationPattern handoff の後処理

- 対象ログ:
  - `2026-06-28_progress_conversationpattern-handoff.md`
- 残作業:
  - sub2 側 stale lock 解消
  - 必要コミット確定
  - 本体側の切断 WIP 取り下げ確認
- 完了条件:
  - handoff に記載されたユーザ端末作業がすべて完了し、再開不要状態になること

### P3) 中長期の設計残タスク（段階着手）

- 現在ステータス（2026-07-03 更新）:
  - **一時保留**（P1/P2 と実装済み領域の回帰テストを優先）

- 対象ログ:
  - `2026-06-01_remaining-task.md`
- 残作業（保留中）:
  - 創作用語 DB / 基本資料 DB のテンプレート設計と承認
- 実施済み（2026-07-03）:
  - `streamingActivitySection` で `_enrichment.bilingualWrapperFields` を参照し、`StreamingGreeting` / `ListenerNickname` を JP/EN 2 列表示に対応
  - `lib/data-common.js` の `buildWrapperSummaries()` で wrapper の `typeSources` に `globalMeta` / `mergedVars` 由来の source を追加し、`$Def_Day` role（month/dayOfMonth/annotation）を SW/enrich 側で利用できるように対応
  - `TypeDefUtils.looksSearchableType()` に `#DictIndex` / `$Def_Day` / `$Def_StoryEra*` / `$Def_BaseArea` を追加し、Day / Era / Area 系フィールドを typedef 駆動で searchableText 対象へ拡張
  - `lib/sw-common.js` の DB カタログ装飾で wrapper summary 解決用 `typeSources` に `globalMeta` を追加
  - `pages/characters.js` で `$display.unit_JP` / `$display.unit_EN` / `unit_EN_ordinal` を解釈する unit 表示拡張を実装（例: `0期生` / `0th Gen.`）
  - `collectIndexEntries()` を raw 値照合へ変更し、`getIndexIdentifierFromRecord()` に複合条件（`idxKey=__conditions__`）フォールバックを追加して、言語切替時に別キャラへ遷移する不具合を修正
  - `sec_Category` / `sec_DesignedBy` の `secondaryInfo` 描画を二次創作DB文脈に限定し、UI表示を `kvTable` 形式へ統一
  - `Relation` / `RelationTo_*` のリンク表示名を pageLang 優先（JPは `Name_JP` 系、ENは `Name_EN` 系）へ修正し、英名が混在する表示不具合を解消
- 完了条件:
  - 仕様承認を取りながら小分けで実装し、回帰テストとログ更新を都度実施

## 直近優先（2026-07-03 切替）

- P3 はいったん保留し、実装済み作品の回帰テストを優先する
- 優先テスト対象:
  - `tests/pages.characters.ui-output.test.js`
  - `tests/section-wrapper-common.test.js`
  - `tests/enrich.wrapper-summaries.test.js`
  - `tests/wrapper-common.test.js`

## 本日完了（棚卸し反映済み）

- DeepL 運用系の実環境確認（旧P2）
  - 実行ログは `2026-07-03_progress_deepl-production-run.md` を正とし、本台帳では完了扱いへ移行。
- クラウド同期・デプロイ確認（旧P3）
  - `migrate --clean` / `wrangler deploy` 完了。完了扱いへ移行。
- UI目視・追加確認（旧P5）
  - `*_DBLink` のブラウザ確認まで実施済み（`2026-07-03_progress_dblink-browser-check.md`）。

## 参照タスク（中長期）

- `2026-07-08_remaining-task.md`（残留タスク母艦・統合版）
- `2026-06-12_progress_translation-style-unified.md`（英訳ルール基準）

## 運用メモ

- triage 系は `2026-07-08_github-triage.md` を最新判断の正とする。
- 過去 triage は履歴参照用とし、現行タスク判断には直接使わない。
- ログ退避方針は `2026-07-03_progress-log-retire-candidates.md`（`.completed/` 退避済み）で確立した基準を踏襲。2026-07-04 の棚卸しで README をトピック別索引に再構成済み（詳細は `README.md` を参照）。
