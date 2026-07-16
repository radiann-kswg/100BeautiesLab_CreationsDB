# 2026-07-08 残留タスク一覧（引き継ぎ版）

## 目的

`2026-06-01_remaining-task.md` と `2026-06-13_remaining-task.md` の未完了タスクを統合し、
以後の実務で参照する残タスク母艦を一本化する。

## 参照元

- `2026-06-01_remaining-task.md`
- `2026-06-13_remaining-task.md`
- `2026-07-03_current-task-ledger.md`

## 現在の優先度

### P1. ConversationPattern handoff 後処理（継続中）

- 参照: `2026-06-28_progress_conversationpattern-handoff.md`
- 残作業:
  - sub2 側 stale lock 解消
  - 必要コミット確定
  - 本体側の切断 WIP 取り下げ確認
- 完了条件:
  - handoff に記載されたユーザ端末作業がすべて完了し、再開不要状態になること

### P2. 創作用語DB / 基本資料DB（継続中）

- 旧タスク対応:
  - `2026-06-01_remaining-task.md` タスク2
  - `2026-06-13_remaining-task.md` 希望タスク1
- 残作業:
  1. 最小テンプレート案の作成（保存場所・最小フィールド・作品/DBとの関連付け・API入口・UI参照方針）
  2. 造語候補の抽出支援（採否は User 判断）
  3. 承認後の API/UI 受け皿整備（`lib/sw-common.js` / `pages/characters.js`）
- 制約:
  - 辞書本文は User 手動入力前提（自動生成しない）

### P3. User の創作入力待ち（2026-07-13 棚卸しで各ログから引き継ぎ）

退避したログの残タスクのうち、**創作文言・創作判断が必要で Claude が自動生成しない**もの。

1. `$EnumDef_EarShapeType` の語彙拡張（Scorpion / Bud / Octopus 等、代替特徴の命名）
   - 引き継ぎ元: `.completed/2026-07-08_progress_numbertales-earshapetype-restructure.md`
2. `data/db_meta.json` の `#Works_DestinyFoxRecords.OldTitles` / `Works_Summary` への統合履歴文言（旧「ラジアン代理」の編入経緯）
   - 引き継ぎ元: `.completed/2026-07-11_progress_works-merge-dfr-proxies.md`
3. `dict_ModelSeries.json` / `dict_LogicSeries.json` の null キー行のラベル値
   - 引き継ぎ元: `.completed/2026-07-13_progress_unauthedlogica-index-alias.md`（2026-07-14 棚卸しで退避）

### P4. 技術的な追従・既知の負債（優先度低〜中）

1. **Workers 側 `_Secondaries` マッチャの乖離**: `pkg/cloudflare/worker.js` は `sec_SeriesTitle` の完全一致のみの簡略版で、`lib/sw-common.js` / `pkg/` FS クライアント（`sec_Category` / `sec_DesignedBy` を含むスコアリング方式）と実装が食い違っている。現行データでは実害なしだが、`sec_Category` 等で `_Commons` を分岐させると Workers 側だけ挙動が変わる。
   - 引き継ぎ元: `.completed/2026-07-13_progress_pkg-sync.md`（2026-07-14 棚卸しで退避）
2. **`ImageProcessor.resolveImagePath()` の既知バグ**: 値にスラッシュを含む場合 `folderHint` を付与しない（SW/enrich 側）。UI は独自の画像解決経路を使うため実害は出ていない。
   - 引き継ぎ元: `.completed/2026-07-11_progress_dbcrosslinkpath.md`
3. **`ref_Reference.json` の `../../` 相対パス 1 件**（`catalog_PNGName`、References レイヤー → General）: `_DBCrossLinkPath` への移行候補だが、型・レイヤーの合流経路が異なるため保留中。
   - 引き継ぎ元: 同上
4. `pkg/python` / `pkg/csharp` に自動テストが無い（Vitest 管轄外。同一 API サーフェスの担保は `tests/pkg.nodejs.test.js` への手動追従に依存）。
5. Cloudflare Workers 版の `_DBLink` / `_Jump` 参照解決 enrich は未対応（次フェーズ）。
6. **`Works_OfficialLinks` の Worker 明示追加**: SW / `pkg/` FS クライアント / UI は対応済みだが、`pkg/cloudflare/worker.js` の `/works` レスポンス整形での明示追加は未実施。`migrate.mjs` が `CreationWorks` 生 JSON を保存するため R2/D1 には自動的に含まれ実害は出ていないが、Worker レスポンス整形の追従は次フェーズ対象。
   - 引き継ぎ元: `.completed/2026-07-16_progress_official-links.md`（2026-07-16 棚卸しで退避）

### P5. 任意拡張（優先度低）

1. `Progress` 連動の派生非公開ルール検討（opt-in 前提）
2. `Day` の完全 key 非依存化（wrapper role 化含む追加整理）
3. 二次創作 UI の追加強化
   - 一次創作との関係表示強化
   - 一次/二次相当判定ルールの明文化

## 完了済みとして本台帳から除外した項目

- bilingual wrapper UI 対応（`StreamingGreeting` / `ListenerNickname` の JP/EN 2列表示）
- IdentityMotif UI 対応
- subFields / wrapper 統合作業（実装タスク）
- BasicInfo 和英切替の主要修正

## 運用ルール

- 本ファイルを残タスク母艦の正とする。
- 履歴参照は `.completed/2026-06-01_remaining-task.md` と `.completed/2026-06-13_remaining-task.md` を参照する。
- 進行中タスクの実務起点は `2026-07-03_current-task-ledger.md` を併用する。
