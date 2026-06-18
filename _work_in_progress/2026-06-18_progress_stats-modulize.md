# Stats Section Renderer モジュール化

## 目的
`renderStatsSubFieldSection` を `lib/section-renders/` に分離し、
AbilityStats 共通レンダラーと作品固有 specStats レンダラーに再構成する。

## 変更点の要約

### 新規ファイル
- `lib/section-renders/_specStatsHelpers.js` — EffectStats / SafetyLevel / SpecMetric の共通ビルダー
- `lib/section-renders/abilityStats.js` — `statsSection` 担当（AbilityStats 専用）
- `lib/section-renders/numSpec.js` — `numSpecSection` 担当（NumerospecStats）
- `lib/section-renders/arcanumSpec.js` — `arcanumSpecSection` 担当（ArcanumspecStats）
- `lib/section-renders/chronoSpec.js` — `chronoSpecSection` 担当（ChronospecStats）

### 修正ファイル
- `data/Works_NumberTales/DataBases/db_type.json` — NumerospecStats `sectionWrapper`: `"statsSection"` → `"numSpecSection"`
- `data/Works_FLInvestigator78/DataBases/db_type.json` — ArcanumspecStats `sectionWrapper`: `"statsSection"` → `"arcanumSpecSection"`
- `data/Works_PastDivers/DataBases/db_type.json` — ChronospecStats `sectionWrapper`: `"statsSection"` → `"chronoSpecSection"`
- `lib/section-wrapper-common.js` — `statsSection` 委譲ブロックを除去（コメントのみ残存）
- `pages/characters.js` — 前計算ブロック ~300行削除・5ファイル import 追加・helpers 拡張・FLInvestigator 互換ブロック削除・specSection 簡略化
- `tests/section-wrapper-common.test.js` — `statsSection` を期待リストから除去・dispatch テストを削除

## 影響範囲
- ナンバーテールズ（NumerospecStats → numSpecSection）
- 運命線探偵78（ArcanumspecStats → arcanumSpecSection + FLI compat 廃止）
- パストダイヴァー（ChronospecStats → chronoSpecSection）
- 全作品共通（AbilityStats → statsSection / lib/section-renders/abilityStats.js）

## 仕様変更ポイント（旧動作との差分）
- `specSection`（スペック/能力ブロック）は `$display.section: "spec"` のトップレベルフィールドのみを表示するようになった。
  以前は AbilityStats / specStats の内容も inline 表示していたが、これらはサブフィールドセクション（collapsible）として独立表示される。
- `specStats` 配下のフィールド（ChronoizedPurity 等）の profile/spec セクションへの振り分けは廃止。
  各専用レンダラーが `buildObjectChildBlocks` 経由で specStats ブロック内に表示する。

## 未完了タスク
- [ ] ブラウザ動作確認（NumberTales・FLInvestigator78・PastDivers の各 specStats 表示）
  URL: `http://127.0.0.1:5500/pages/characters.html?work=Works_NumberTales&db=&num=1&idx=1&idxKey=Num&q=&lang=jp`

## テスト結果
- `section-wrapper-common.test.js`: 4/4 PASS
- 既知の失敗（作業前から存在）: commons.secondaries, data.shape, enrich.dblink.jump.merge, pages.characters.ui-output — 計7件（今回の変更と無関係）
