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
   - **2026-07-22 実測**: 本番 `https://database.numbertales-radiann.net/api/v1/works` は 10 作品を返し、各エントリの公開キーは `key` / `Title` / `Title_EN` / `Works_Summary` / `OldTitles` の 5 種のみ。`OfficialLinks` は未露出で**本項は未対応のまま**であることを確認。

7. ~~**`npm test` の赤 3 件**~~ → **✅ 2026-07-22 の棚卸しで解消済み（`npm test` 41 ファイル / 564 件すべて成功）**。
   対応: `npm run data:order:write` でキー順整列（値の変更が無いことをキー順無視の深い比較で検証済み）＋
   `tests/pages.characters.ui-output.test.js` のフィクスチャを `Num: "223-jw"` → `Num: 223` へ差し替え。
   以下は記録として残す。いずれも直近の DB 更新に対するテスト/データ整列の追従漏れで、実装バグではなかった。
   - `tests/data.field-order.test.js` ×2: `data/Works_NumberTales/DataBases/db_SelfSecondary.json` の **106 件中 2 件**がキー順未整列（`SameMPSeries_DBLink` / `sec_Category` / `sec_DesignedBy` の位置、うち 1 件は `Class` / `TailsUnit` 等も）。他 18 ファイル 1,282 件は整列済み。
     - 対処: `npm run data:order:write`（値は変えずキー順のみ整列する既定ツール）。
   - `tests/pages.characters.ui-output.test.js` ×1: 「二次創作情報」セクションに `二次創作分類` が出ない件。**テストのフィクスチャが陳腐化しただけ**で描画は正常。テストが掴む `db_SelfSecondary.json` の `Num: "223-jw"` は、`7f87f33` 時点の `sec_Category: "リクエストナンバー"` から現行 `72cb428` では `null` へ User が更新済み（null なので行が出ないのが正しい挙動）。同ファイルには `sec_Category: "リクエストナンバー"` を持つレコードが Num `127` / `223` / `496` / `753` の 4 件残っている。
     - 対処案: フィクスチャの掴み先を `sec_Category` を持つレコードへ変更する（`CLAUDE.md`「データ更新時のテスト追従」に沿ってテスト側を新データ仕様へ追従させる）。
   - いずれも `2026-07-21_progress_composite-index-locator.md` の時点で「本変更前から失敗している既存分」として記録されていたもの。

8. **ロールプレイプロンプト生成物の体裁くずれ 3 件**（**2026-07-25 の棚卸しで優先度を格上げ**）
   - 参照: `2026-07-24_progress_roleplay-prompt-formatting.md`（「追記（2026-07-25 棚卸し）」節）
   - **`[object Object]`: 全 66 件中 10 件に実在**（体重 7 / 年齢 3 / 身長 1）。`Height_cm` / `Weight_kg` /
     `@Age` が `{value, about}` object のときテンプレでアンラップされない。**元ログの「`@Age` はアンラップ済み」は誤り**
   - 句点の二重化（`…接しやすい。。`）と `Weakness_JP` 欠落時の文断裂（`…である一方、` で終わる）は
     `NumberTales/RoleplayPrompts/DB_SemiPrimary/roleplay-prompt-100.md` に現存（影響はこの 1 ファイル）
   - **なぜ優先か**: `RoleplayPrompts/` は**配布用の成果物**で、体裁くずれがそのまま外部へ渡る。
     `--check` は `changed=0` の冪等状態なので**再生成では直らない**（`render.mjs` / テンプレ側の修正が必要）
   - 着手時は文面が変わるため User 確認を取る（創作本文には踏み込まない機械的整形）

9. **`docs/readme.en.md` の陳腐化**（**2026-07-25 の棚卸しで新規登録**）
   - 最終更新 `b37ba54`（**2026-04-30**）以降ノータッチ。`Cloudflare` の文字列が **0 件**で、
     実 API（`database.numbertales-radiann.net/api/v1/`）が英語圏読者に一切案内されていない
   - 引き継ぎ元: `2026-06-24_progress_localization-rules-audit.md`「未完了 / 申し送り」（2026-06-24 に指摘済み）
   - 公開ドキュメントのため、技術セクションの更新は `AGENTS.md`「更新が許可される部分」の範囲内
     （`guideline.md` / `guideline.en.md` 本文は編集禁止なので混同しないこと）

10. **フィールド順整列の残フェーズ**（**2026-07-25 の棚卸しで母艦へ引き上げ**）
    - 参照: `2026-07-17_progress_field-order-typedef.md`「未完了タスク」
    - **実機目視が未実施**: `basicFields` 整列で基本情報テーブルの表示順が変わった（人称呼称群が新規表示 /
      `UnibyteLive.Generation` が先頭 / `PastDivers.ChronoholderName` が subFields へ / `ShouArRiders.BeastspecName` が同）。
      jsdom のテストは通っているが**実ブラウザ未確認のまま 2026-07-17 から放置**
    - **Phase 4（ネスト整列 `--nested`）**: `Images` の子キー（26 通り → 1 通り / 189 出現）が主目的。表示に効かない範囲に限定可能
    - **Phase 6（`extractTopLevelSchemaFields()` の統一）**: 現状 UI（work 先）と SW（global 先）で**マージ順が逆**。
      `lib/wrapper-common.js` へ `mergeDefTypes` 相当を移設して単一実装へ収束させる。唯一の UI 変更点なので単独 PR
    - `isPrivate` を `$DefType` へ宣言するかは User 確認待ち（現状は宣言せず末尾に留置）

11. **`$VersDef` / `$VarsDef` の表記ゆれ**（**2026-07-25 の棚卸しで実測**）
    - `$VersDef` を持つのは 4 作品の `DataBases/db_type.json`（`FLInvestigator78` / `NumberTales` / `PastDivers` / `UnibyteLive`）
    - 中身は `$Def_Relations` / `$Def_EffectText` / `$Def_ThisMastersEntry`。**いずれもグローバル
      `data/db_meta.json` の `General.$VarsDef` には存在しない**
    - `lib/data-common.js` は `$VarsDef` のみを辞書へ合成する（`:361-362`）ため、これらは合成経路から漏れている。
      表示は別経路（`resolveTypeDefContainer` 互換の入口）で成立しているとみられ**現時点で実害は観測されていない**が、
      「表記ゆれだけ」と断定するには合流経路の裏取りが要る。改名する場合は 4 ファイル + 参照箇所の同時変更

12. **AIHints 再同期がリポジトリ全体の `npm test` に依存する**（**2026-07-25 の棚卸しで新規登録**）
    - 参照: `2026-07-25_progress_aihints-resync-ci-failure.md`「申し送り ①」
    - `.github/workflows/aihints-structural-resync.yml`（`addon-ai-tag`）の `テスト` ステップは**全体の `npm test`** を実行する。
      **AIHints と無関係な赤が 1 件でもあると、AIHints の自動 PR が静かに作られなくなる**
    - 判明している失敗 2 件（7/16・7/25）は**どちらもこのステップ**が原因で、再同期ツール本体は一度も失敗していない
    - 運用上の予防策: `develop` 側で赤を残したまま `addon-ai-tag` へマージしない。
      特に `data/Dictionaries/` の辞書構造を変えるときは、`addon-ai-tag` 限定のテストが黙って壊れうる点に注意
    - `workflow_dispatch` 未設定・トリガーが `data/Works_*/DataBases/db_*.json` のみのため、
      **テストやツールだけを直しても再実行されない**（次に DB を更新するまで緑を確認できない）

13. **`develop` → `addon-ai-tag` 一方向マージの未実施分**（定常運用・**2026-07-25 実測**）
    - `git rev-list --left-right --count develop...origin/addon-ai-tag` = **1 / 108**
    - 未取り込みは `b737891`（進捗ログ追加のみ）1 件で、コード・スキーマの差分は無い
    - 逆マージは禁止（`AGENTS.md`「ブランチ運用方針」）。棚卸しのたびにこのカウントを確認する運用にする

14. **ICS カレンダーの外部反映**（`calendar-same-person-dblink.md` から引き継ぎ・**2026-07-25 に退避**）
    - 実装（`tools/build-calendar-ics.mjs`）は `a20fb7b` で `develop` へ着地済み・テスト全緑
    - 残: Drive ミラー `100beautieslab-creations-events.json` の再生成・再アップロード（別名義の反映）
    - 残: ライブアーティファクト `birthday-anniversary-calendar` の表示確認（Git 作業ツリー外・User 環境）

### P5. 任意拡張（優先度低）

1. `Progress` 連動の派生非公開ルール検討（opt-in 前提）
2. `Day` の完全 key 非依存化（wrapper role 化含む追加整理）
3. 二次創作 UI の追加強化
   - 一次創作との関係表示強化
   - 一次/二次相当判定ルールの明文化
4. **エイリアス Index の宣言化（`#IndexAlt` 案B・User 提案）**: `LogicAlt` のようなエイリアス Index を、現在の推論（`#Index` 型で主 Index の root 以外）ではなく宣言で表す。ラベル（`hashTag_JP`）と安定した直リンク（`LogicAlt.Num:141`）を保ったまま宣言化できるが、エイリアス性が DB コンテキスト依存（`Logic` は `PrimaryMobs` では主 Index）のため `#Index` の文脈依存挙動は残す必要がある。影響: `data/db_type.json` の `$slot`/`$slotMatch` / `lib/data-common.js` の `#Index` 判定 / `pages/characters.js`（`getWorkIndexAliasDefs` 他）/ `docs/schema-meta-processing.md` / キー順テスト（`/#Index\b/` は `#IndexAlt` にマッチしないため判定の明示的拡張が必要）。
   - 引き継ぎ元: `.completed/2026-07-21_progress_composite-index-locator.md`（2026-07-22 棚卸しで退避）

### P6. Issue #13 希望タスク（数秘解説 / スキンシップ反応）

- 参照: `2026-07-22_progress_issue13-numerology-skinship.md`
- 背景: NumberTales-MisskeyAIBot 側（F-06/F-15）から、監修済み文面を DB フィールドで供給したい依頼
- 残作業:
   1. フィールド追加方針の確定（`ConversationPattern` 配下 vs 独立）
   2. typedef 追加（`db_type.json`）と表示位置（`db_meta.json` / `$slot`）の設計
   3. 対象範囲の段階導入（当面 NumberTales / Primary の released 個体）
   4. User 手動入力の受け皿整備（創作本文は自動生成しない）
- 制約:
   - 内容文（`value_JP` / `about_JP`）は User 監修・手動入力を前提
   - Bot 側はフィールド未存在でもフォールバックするため、段階導入で問題なし

### P7. AIHints 系の実装待ち（`addon-ai-tag` 側・**2026-07-25 の棚卸しで新規登録**）

提案・診断のログは `develop` にあるが、実装先はすべて `addon-ai-tag`（AIHints は `develop` に含めない方針）。

- 参照: `2026-07-08_progress_aihints-structural-resync-proposal.md`（構造的再同期の設計提案）
- 参照: `2026-07-13_progress_aihints-palette-deadlock.md`（`palette_priority` デッドロック診断・3 階建て設計）
- 参照: `2026-07-13_progress_colorpalette-schema.md`（`ColorPalette` スキーマ実装済み・`develop` 側）

1. **`--apply-colorpalette`（仮称）が未実装 = `ColorPalette` の投資が回収されていない**（**最重要**）
   - `develop` 側では `ColorPalette` を **94 件**（全件 5 色以上）投入済み。しかし
     `tools/patch-aihints.mjs` に `ColorPalette` → `palette_priority` の導出モードが無いため、
     **AIHints 側の `palette_priority` は 92/92 件 `null` のまま**
   - これが入って初めて「palette が構造由来になり、再ビルドで巻き戻らなくなる」という当初の狙いが完成する
   - 現状は「本体 DB に色はあるのに AIHints からは見えない」状態が続いている
2. 第0階（`null` ハンドリング 3 点）は `addon-ai-tag` で実装済み（README のトピック索引に記載）
3. 第1階（`_meta` provenance + `--resync-structural` + CI）は**実装・稼働済み**。
   2026-07-25 に本番 Actions で PR 自動作成 → マージ後 no-op までを実データで確認（PR #14 / `6bf1e50`）
4. 第2階（`tools/extract-palette.mjs` による決定論的抽出）は `develop` 側で実装済み。
   ただし 1. が無いため AIHints へは届いていない
5. 積み残しの判断事項: `AIHints` を持たない 13 件・画像を持たない 10 件の扱い、
   `concept` 画像（赤ペン注釈あり）を抽出ソースへ含めるか

> **要点**: 提案ログ 2 本は「User の優先度判断待ち」のまま 2026-07-08 / 07-13 から動いていないが、
> その後 `ColorPalette`（develop）と `--resync-structural`（addon-ai-tag）は**実際に実装が進んでいる**。
> 残っているのは**両者を繋ぐ 1 本（`--apply-colorpalette`）だけ**という状態。

## 完了済みとして本台帳から除外した項目

- bilingual wrapper UI 対応（`StreamingGreeting` / `ListenerNickname` の JP/EN 2列表示）
- IdentityMotif UI 対応
- subFields / wrapper 統合作業（実装タスク）
- BasicInfo 和英切替の主要修正

## 運用ルール

- 本ファイルを残タスク母艦の正とする。
- 履歴参照は `.completed/2026-06-01_remaining-task.md` と `.completed/2026-06-13_remaining-task.md` を参照する。
- 進行中タスクの実務起点は `2026-07-03_current-task-ledger.md` を併用する。
