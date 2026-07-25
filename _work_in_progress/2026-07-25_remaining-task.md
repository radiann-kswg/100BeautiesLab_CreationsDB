# 2026-07-25 残留タスク一覧（統合版・進捗ログ索引つき）

> **このファイルが残タスクの唯一の起点です。**
> 旧 `2026-07-03_current-task-ledger.md`（進行中タスク台帳）と `2026-07-08_remaining-task.md`（残タスク母艦）を
> 統合し、**1 タスク = 1 エントリ**へ概略化しました。両ファイルは `.completed/` へ退避済みです。

- 作成: 2026-07-25
- 対象ブランチ: `develop`（AIHints 関連の実装先は `addon-ai-tag`。`AGENTS.md`「ブランチ運用方針」参照）

## このファイルの使い方

- **タスクは `T-xx` の ID で一意**。複数の進捗ログに内容が散っていたものは 1 つへ束ね、
  「関連ログ」欄に**跨っているログをすべて**列挙しています。
- 「関連ログ」が 1 本だけのタスクは、そのログが唯一の詳細情報源です。
- 各ログの位置づけは末尾の **進捗ログ索引** を参照してください。
- 完了したタスクは、このファイルで打ち消し線 + 完了印にしてから、次の棚卸しで節ごと削除します。

### 状態の凡例

| 印 | 意味 |
| --- | --- |
| 🔴 | Claude 側ですぐ着手できる（判断待ちが無い） |
| 🟡 | User の判断・入力を待っている（Claude 側の準備は完了） |
| 🔵 | 長期保留（着手判断そのものが保留、または外部要因待ち） |
| ✅ | 完了（次の棚卸しで削除） |

---

## A. 技術タスク（Claude 側で着手できる）

### T-01 🔴 Cloudflare Worker のデプロイ（`Works_OfficialLinks` の本番反映）

- **関連ログ**: `.completed/2026-07-16_progress_official-links.md`（単一）
- **状態**: **コードは完了・未デプロイ**。`pkg/cloudflare/worker.js` の `/works` 整形へ
  `Works_OfficialLinks: info.Works_OfficialLinks ?? []` を追加済み（`58aed8f`）
- **残作業**: `wrangler deploy` のみ。2026-07-25 の実測では本番 `/api/v1/works` の公開キーは
  `key` / `Title` / `Title_EN` / `Works_Summary` / `OldTitles` の **5 種のまま**
- **完了条件**: 本番 `/api/v1/works` に `Works_OfficialLinks` が現れること。
  **デプロイ後、`docs/readme.en.md` の「次のデプロイで現れる」注記を外す**

### T-02 🔴 AIHints への配色導出（`--apply-colorpalette`）— **3 ログに跨るタスク**

- **関連ログ**（3 本）:
  - `2026-07-08_progress_aihints-structural-resync-proposal.md`（構造的再同期の設計提案）
  - `2026-07-13_progress_aihints-palette-deadlock.md`（`palette_priority` が埋まらない原因の診断・3 階建て設計）
  - `2026-07-13_progress_colorpalette-schema.md`（`ColorPalette` スキーマと抽出ツールの実装）
- **状態**: **前提はすべて揃い、繋ぐ 1 本だけが未実装**
  - ✅ 第0階（`palette_priority` の `null` ハンドリング）… `addon-ai-tag` で実装済み
  - ✅ 第1階（`_meta` provenance + `--resync-structural` + CI）… **稼働済み**。2026-07-25 に本番 Actions で
    PR 自動作成 → マージ後 no-op まで確認（PR #14 / `6bf1e50`）
  - ✅ 第2階（`tools/extract-palette.mjs`）… `develop` で実装済み。`ColorPalette` を **94 件**投入済み（全件 5 色以上）
  - ❌ **`ColorPalette` → `palette_priority` の導出モードが無い**
- **なぜ効くか**: これが入って初めて `palette_priority` が「構造由来」になり、再ビルドで巻き戻らなくなる。
  現状は本体 DB に色があるのに AIHints からは見えず、**92/92 件 `null` のまま**
- **実装先**: `addon-ai-tag` の `tools/patch-aihints.mjs`
- **前提**: T-20（`Role` のレビュー）が済んでいると手戻りが減る
- **積み残しの判断事項**: `AIHints` を持たない 13 件・画像を持たない 10 件の扱い、
  `concept` 画像（赤ペン注釈あり）を抽出ソースへ含めるか

### T-03 🔴 実 API の検索が不正クエリで 500 を返す

- **関連ログ**: `.completed/2026-07-25_progress_priority-tasks.md`（単一・2026-07-25 に実測で発見）
- **事象**: `GET /api/v1/:work/:db/search?q=*` が `{"error":"Internal server error","status":500}`。
  FTS5 の特殊構文がそのままクエリへ渡り、例外がハンドリングされていないとみられる
- **正常な範囲**: 通常の検索は動作する（`?q=Fivens` / `?q=イズナ`〈要 URL エンコード〉で Num 57 が返る）
- **あるべき挙動**: 不正クエリは 500 ではなく **400**
- **実装先**: `pkg/cloudflare/worker.js`（FTS5 クエリのサニタイズ／try-catch）

### T-04 🔴 フィールド順整列 Phase 4（ネスト整列のツール化）

- **関連ログ**: `2026-07-17_progress_field-order-typedef.md`（単一）
- **状態**: トップレベル整列・実機目視・Phase 6（UI/SW 統一）は**すべて完了済み**。残るのは Phase 4 のみ
- **内容**: `normalize-field-order.mjs` に `--nested` を追加し、`Images` の子キー（26 通り → 1 通り / 189 出現）を整列する。
  `$DetailLayout.subFields` の 21 フィールドと `RelationTo_*` は表示順が変わるため除外＝**表示に効かない範囲に限定できる**
- **補足**: 2026-07-25 に `Images` 子キーの整列が 3 ファイル 8 レコード分だけ先行実施済み（`58aed8f`）だが、
  ツール化はされていない

### T-05 🔴 `$VersDef` / `$VarsDef` の表記ゆれ

- **関連ログ**: `2026-07-17_progress_field-order-typedef.md`（単一）
- **実測（2026-07-25）**: `$VersDef` を持つのは 4 作品の `DataBases/db_type.json`
  （`FLInvestigator78` / `NumberTales` / `PastDivers` / `UnibyteLive`）。中身は
  `$Def_Relations` / `$Def_EffectText` / `$Def_ThisMastersEntry` で、**いずれもグローバル
  `data/db_meta.json` の `General.$VarsDef` には存在しない**
- **懸念**: `lib/data-common.js` は `$VarsDef` のみを辞書へ合成する（`:361-362`）ため、これらは合成経路から漏れている。
  表示は別経路で成立しているとみられ**実害は観測されていない**が、「表記ゆれだけ」と断定するには合流経路の裏取りが要る
- **改名する場合**: 4 ファイル + 参照箇所の同時変更

### T-06 🔴 ロールプレイプロンプト EN 版の生成（フェーズ4）

- **関連ログ**: `2026-07-18_progress_roleplay-prompt-en-phase4.md`（単一。フェーズ0〜3 の完了ログは `.completed/`）
- **状態**: 着手前スキャンは完了（実データ・実コードで裏取り済み）。**着手条件は User 確認 2 件**
  - 出力先の形式: `RoleplayPrompts_EN/`（プラン既定）か `roleplay-prompt-<id>.en.md` suffix か
  - 呼称の EN 表記: EN 原文フィールドを使うか、辞書対訳で解決するか
- **主な実装**: `build-roleplay-prompts.mjs` の lang 分岐（名称 / 辞書ラベル / 呼称 / 連結語 / 日付書式）、
  テンプレ選択と出力先の lang 分離、EN テンプレ 3 本の新設
- **制約**: **LLM で創作本文を訳出・生成しない**。`_EN` 欠落はその節を空のまま出す

### T-07 🔴 `calling.js` のユニットテスト・UI 動作確認

- **関連ログ**: `2026-06-24_progress_localization-rules-audit.md`（単一）
- **状態**: `lib/section-renders/calling.js` の実装は完了しているが、**ユニットテストが未追加**で、
  ローカル HTTP サーバー上での表示確認も未実施（2026-06-24 から継続）
- **補足**: 後続の `fix_calling-schema-duplication` は 2026-07-14 に完了・退避済み。
  作品別 typedef に残る `ForMasterCalling_JP`/`_EN` の suffix 宣言は表示バグを起こさないことを確認済み

### T-08 🔴 既知の技術負債（まとめ）

- **関連ログ**: 各所の `.completed/` から引き継ぎ（`pkg-sync` / `dbcrosslinkpath` ほか）
- 個々は小さく、単独で着手できる。
  1. **Workers 側 `_Secondaries` マッチャの乖離**: `pkg/cloudflare/worker.js` は `sec_SeriesTitle` の完全一致のみの
     簡略版で、`lib/sw-common.js` / `pkg/` FS クライアント（スコアリング方式）と食い違う。現行データでは実害なし
  2. **`ImageProcessor.resolveImagePath()`**: 値にスラッシュを含む場合 `folderHint` を付与しない（SW/enrich 側）。
     UI は独自経路のため実害は出ていない
  3. **`ref_Reference.json` の `../../` 相対パス 1 件**（`catalog_PNGName`）: `_DBCrossLinkPath` への移行候補だが保留中
  4. **`pkg/python` / `pkg/csharp` に自動テストが無い**（Vitest 管轄外。同一 API サーフェスの担保は手動追従に依存）
  5. **Cloudflare Workers 版の `_DBLink` / `_Jump` 参照解決 enrich は未対応**（次フェーズ）

### T-09 🔴 AIHints 再同期がリポジトリ全体の `npm test` に依存する

- **関連ログ**: `.completed/2026-07-25_progress_aihints-resync-ci-failure.md`（単一）
- **問題**: `.github/workflows/aihints-structural-resync.yml`（`addon-ai-tag`）の `テスト` ステップは
  **全体の `npm test`** を実行する。**AIHints と無関係な赤が 1 件でもあると、自動 PR が無言で止まる**
- **判明している失敗 2 件（7/16・7/25）はどちらもこのステップが原因**で、再同期ツール本体は一度も失敗していない
- **当面の予防策**: `develop` で赤を残したまま `addon-ai-tag` へマージしない。
  特に `data/Dictionaries/` の辞書構造を変えるときは、`addon-ai-tag` 限定のテストが黙って壊れうる
- **設計上の制約**: `workflow_dispatch` 未設定・トリガーが `data/Works_*/DataBases/db_*.json` のみのため、
  **テストやツールだけを直しても再実行されない**

### T-10 🔴 `develop` → `addon-ai-tag` 一方向マージ（定常運用）

- **関連ログ**: `2026-07-02_progress_addon-ai-tag-reverse-merge-incident.md`（事故記録）
- **確認コマンド**: `git rev-list --left-right --count develop...origin/addon-ai-tag`
- **2026-07-25 実測**: **1 / 108**（未取り込みは `b737891`〈進捗ログのみ〉1 件で、コード差分は無い）
- **注意**: **逆マージは禁止**。棚卸しのたびにこのカウントを確認する

### T-11 🔴 ICS カレンダーの外部反映

- **関連ログ**: `.completed/calendar-same-person-dblink.md`（単一）
- **状態**: 実装（`tools/build-calendar-ics.mjs`）は `a20fb7b` で `develop` へ着地済み・テスト全緑
- **残作業**（いずれも Git 作業ツリー外・User 環境での操作）:
  - Drive ミラー `100beautieslab-creations-events.json` の再生成・再アップロード（別名義の反映）
  - ライブアーティファクト `birthday-anniversary-calendar` の表示確認

### T-12 🔴 エイリアス Index の宣言化（`#IndexAlt`・User 提案の案B）

- **関連ログ**: `.completed/2026-07-21_progress_composite-index-locator.md`（単一）
- **内容**: `LogicAlt` のようなエイリアス Index を、現在の推論（`#Index` 型で主 Index の root 以外）ではなく宣言で表す
- **難所**: エイリアス性が DB コンテキスト依存（`Logic` は `PrimaryMobs` では主 Index）のため、
  `#Index` の文脈依存挙動は残す必要がある
- **影響範囲**: `data/db_type.json` の `$slot`/`$slotMatch` / `lib/data-common.js` の `#Index` 判定 /
  `pages/characters.js`（`getWorkIndexAliasDefs` 他）/ `docs/schema-meta-processing.md` /
  キー順テスト（`/#Index\b/` は `#IndexAlt` にマッチしないため判定の明示的拡張が必要）

---

## B. User の判断・入力を待っているもの（Claude 側の準備は完了）

「滞留」は 2026-07-25 時点で当該ログが動いていない日数。**放置しても壊れないが、長いものは
「進めるか畳むか」の判断が要る**ものです。

### T-20 🟡 ColorPalette のレビューと色名入力 — **T-02 の前提**

- **関連ログ**: `2026-07-13_progress_colorpalette-schema.md`（単一）／滞留 12 日
- **待ち項目**:
  - `Role` の妥当性レビュー（被覆率の降順で機械決定した仮の値。デザイン上の主従とは異なりうる）
  - 7〜8 色を検出した **22 件**の過検出確認（領域内で条件を緩めた副作用）
  - `ColorName_JP` / `ColorName_EN` / `Formation` / `Note_*` の入力（**色に名前を付ける行為は創作内容**のため User 手入力）
  - 色語と一致しなかった 7 件（Num 12/21/26/33/39/62/87）の個別確認
  - 画像を持たない 10 件（Num 38/54/59/79/80/82/83/90/91/95）の扱い
- **補足**: 専用の色スウォッチ renderer（`colorPaletteSection`）は未実装で、現状は汎用 renderer にフォールバック

### T-21 🟡 ConversationPattern の入力（`DialogueExamples` 先行方式）

- **関連ログ**: `2026-06-28_progress_conversationpattern-handoff.md`（単一）／滞留 15 日
- **手順（2026-07-10 に変更・こちらが正）**:
  1. **User が先に `DialogueExamples[].value_JP` / `about_JP` を入力**
  2. その `DialogueExamples` と既存フィールドのみを根拠に、Claude が 6 項目（`TalkingTone` / `TopicPreference` /
     `TalkFrequency` / `PreferredTopics` / `AvoidedTopics` / `ConversationNotes`）を**仮入力**
  3. `DialogueExamples` 自体には手を加えない
- **対象**: Num 92/94/95/98/99/2/10
- **User 端末での作業**: sub2 の stale lock（`.git/index.lock`）解消

### T-22 🟡 UnibyteLive アルベッツの苗字・コードネーム レビュー

- **関連ログ**: `2026-07-06_progress_unibytelive-formalname-draft.md`（単一）／滞留 19 日
- **待ち項目**: 下書き 24+2 件の最終レビュー（User が推敲を継続中）
- **未設定**: I・O の 2 代目は `Height_cm` / `ConceptAge` / `BustSize` / `AnivDay` / `Class` が未入力。
  配置（初代を末尾へ移設するか）も保留

### T-23 🟡 AppearanceDetail 参考画像の割当確認

- **関連ログ**: `2026-07-11_progress_appearancedetail-images.md`（単一）／滞留 14 日
- **待ち項目**:
  - `10` / `10alt` の corefolder/humanoid 割当の正誤（色記述ベースの推定のため要確認）
  - 保留 4 枚の扱い（`2alt` 用エントリ追加 / `earingBack` の複数画像対応 / `halo99` 用エントリ追加 / `tag/` の正式化）

### T-24 🟡 Localization の入力（Summary 残 7 件ほか）— **2 ログに跨るタスク**

- **関連ログ**（2 本）:
  - `2026-06-25_progress_localization-summary-inputs.md`（入力チェックリスト本体）／滞留 30 日
  - `2026-06-24_progress_localization-db.md`（Localization レイヤーの実装・仮データ投入）
- **待ち項目**:
  - `Summary_JP` / `_EN` の未入力（地名 4 件〈算象・金源・南雌・然天〉/ 人物名 2 件〈六花ルノ・神夜崎ユノ〉/
    FL78 の現象・能力 3 件）＋ 第1〜7界の個別 Summary（世界観確定後）
  - `TransPolicy` / `Category` の仮判定に対する原作者確認
  - `trans_PlaceName.json` の Scope 空 4 件（登場作品確定後）
- **Claude 側の残タスク**: Localization 層の enum 解決（`data/Localization/db_meta.json` の `$VarsDef` を
  `metaForLookup` へ合流）は、UI で enum ラベル表示が必要になった時点で対応

### T-25 🟡 Issue #13（数秘解説 / スキンシップ反応フィールドの追加）

- **関連ログ**: `2026-07-22_progress_issue13-numerology-skinship.md`（単一）／2026-07-21 起票・**OPEN 継続**
- **待ち項目（設計判断）**:
  1. フィールド命名（`NumerologyExamples` / `SkinshipReactions` を採用するか）
  2. 配置（`ConversationPattern` 配下か、トップレベル独立か）
  3. 表示系への接続要否（キャラシート表示対象にするか、Bot 供給専用か）
  4. 対象レコード範囲（released 判定の適用基準）
- **緊急度**: 低（Bot 側はフィールド未存在でもフォールバックする）
- **制約**: 内容文（`value_JP` / `about_JP`）は User 監修・手動入力

### T-26 🟡 創作用語DB / 基本資料DB

- **関連ログ**: なし（旧母艦 P2 から継承。専用ログは未作成）
- **残作業**: 最小テンプレート案の作成（保存場所・最小フィールド・作品/DB との関連付け・API 入口・UI 参照方針）
  → 承認 → API/UI 受け皿整備（`lib/sw-common.js` / `pages/characters.js`）
- **制約**: 辞書本文は User 手動入力前提（自動生成しない）

### T-27 🟡 創作文言の入力待ち（3 件）

- **関連ログ**: いずれも `.completed/` 配下（引き継ぎ済み）
  1. `$EnumDef_EarShapeType` の語彙拡張（Scorpion / Bud / Octopus 等、代替特徴の命名）
  2. `data/db_meta.json` の `#Works_DestinyFoxRecords.OldTitles` / `Works_Summary` への統合履歴文言
     （旧「ラジアン代理」の編入経緯）
  3. `dict_ModelSeries.json` / `dict_LogicSeries.json` の null キー行のラベル値

### T-28 🟡 `isPrivate` を `$DefType` へ宣言するかの判断

- **関連ログ**: `2026-07-17_progress_field-order-typedef.md`（単一）
- **現状**: `isTriple` / `Regioministration` / `isPrivate` は**あえて宣言しない**運用で、整列時は
  直前の宣言済みキーへアンカーされて元の位置に留まる
- **判断が要る理由**: 宣言にはラベル付け（`hashTag_JP`）が伴い、創作内容に踏み込むため

---

## C. 長期保留（着手判断そのものが保留）

### T-30 🔵 ADR-0002（Google Cloud での画像生成バックエンド）

- **関連ログ**: `2026-06-21_progress_cloudflare-api-adr2-gcloud.md`（単一）／Draft のまま約 1 か月
- **次アクション（未着手）**: `numbertales-imagegen` の Docker 化スコープ確認（別リポジトリ）/
  Cloud Run サービスの作成 / Secret Manager への仮 API Key 登録 / Workers への `/api/v1/generate` プロキシ追加
- **未解決**: Vertex AI の採用可否、GCE スポット VM の活用可否

### T-31 🔵 `addon-ai-tag` 逆マージ事故の後日談追記

- **関連ログ**: `2026-07-02_progress_addon-ai-tag-reverse-merge-incident.md`（単一）
- **残作業**: `addon-ai-tag` 側の `2026-07-01_progress_addon-ai-tag-merge-conflict-and-log-cleanup.md` への
  経緯追記（`addon-ai-tag` チェックアウト環境が必要）
- **User 判断待ち**: 再発防止策の検討（デスクトップ版 Claude のマージ操作時にブランチを取り違えた件）

### T-32 🔵 任意拡張

1. `Progress` 連動の派生非公開ルール検討（opt-in 前提）
2. `Day` の完全 key 非依存化（wrapper role 化を含む追加整理）
3. 二次創作 UI の追加強化（一次創作との関係表示強化 / 一次・二次相当判定ルールの明文化）

---

## 進捗ログ索引（`_work_in_progress/` 直下）

各ログが「どのタスクの詳細情報源か」を示します。**タスクを持たないログは参照専用**です。

| ログ | 主題 | 関連タスク | 状態 |
| --- | --- | --- | --- |
| [2026-07-25_remaining-task.md](./2026-07-25_remaining-task.md) | **本ファイル**（残タスクの起点） | — | 🟢 現行 |
| [2026-07-25_github-triage.md](./2026-07-25_github-triage.md) | GitHub 未解決問題の日次トリアージ | — | 🟢 現行（未解決の CI 失敗なし。§1 の `AI_Optout` 仮説は誤りのため**対応案は適用しない**） |
| [2026-07-18_progress_roleplay-prompt-en-phase4.md](./2026-07-18_progress_roleplay-prompt-en-phase4.md) | ロールプレイプロンプト EN 版の着手前調査 | **T-06** | 📝 着手条件は User 確認 2 件 |
| [2026-07-17_progress_field-order-typedef.md](./2026-07-17_progress_field-order-typedef.md) | フィールドキー順の typedef 整列 | **T-04 / T-05 / T-28** | 🟢 Phase 4 以外は完了 |
| [2026-07-13_progress_colorpalette-schema.md](./2026-07-13_progress_colorpalette-schema.md) | `ColorPalette` スキーマ・配色抽出 | **T-02 / T-20** | ⚠️ 実装済み・User レビュー待ち |
| [2026-07-13_progress_aihints-palette-deadlock.md](./2026-07-13_progress_aihints-palette-deadlock.md) | `palette_priority` デッドロックの診断 | **T-02** | 📝 第0〜2階は実装済み |
| [2026-07-08_progress_aihints-structural-resync-proposal.md](./2026-07-08_progress_aihints-structural-resync-proposal.md) | AIHints 構造的再同期の設計提案 | **T-02** | 🟢 提案は実装・稼働済み（設計背景の参照用） |
| [2026-07-22_progress_issue13-numerology-skinship.md](./2026-07-22_progress_issue13-numerology-skinship.md) | Issue #13 の要件整理 | **T-25** | 📝 設計判断待ち |
| [2026-07-11_progress_appearancedetail-images.md](./2026-07-11_progress_appearancedetail-images.md) | AppearanceDetail 参考画像の一括登録 | **T-23** | ⚠️ 割当確認待ち |
| [2026-07-06_progress_unibytelive-formalname-draft.md](./2026-07-06_progress_unibytelive-formalname-draft.md) | アルベッツの苗字・コードネーム下書き | **T-22** | ⚠️ User レビュー中 |
| [2026-07-02_progress_addon-ai-tag-reverse-merge-incident.md](./2026-07-02_progress_addon-ai-tag-reverse-merge-incident.md) | 逆マージ事故の記録と是正 | **T-10 / T-31** | ⚠️ 後日談追記が保留 |
| [2026-06-28_progress_conversationpattern-handoff.md](./2026-06-28_progress_conversationpattern-handoff.md) | ConversationPattern 補完の引き継ぎ | **T-21** | ⚠️ User 入力待ち |
| [2026-06-25_progress_localization-summary-inputs.md](./2026-06-25_progress_localization-summary-inputs.md) | Localization Summary の入力チェックリスト | **T-24** | ⚠️ 残 7 件 |
| [2026-06-24_progress_localization-db.md](./2026-06-24_progress_localization-db.md) | Localization レイヤーの実装 | **T-24** | ⚠️ 原作者確認・項目追加が継続 |
| [2026-06-24_progress_localization-rules-audit.md](./2026-06-24_progress_localization-rules-audit.md) | 英訳ルールの追補・`calling.js` 実装 | **T-07** | ⚠️ テスト/UI 確認が残 |
| [2026-06-21_progress_cloudflare-api-adr2-gcloud.md](./2026-06-21_progress_cloudflare-api-adr2-gcloud.md) | ADR-0002（Google Cloud） | **T-30** | 🔵 Draft |
| [2026-06-12_progress_translation-style-unified.md](./2026-06-12_progress_translation-style-unified.md) | 英訳ルール基準書・バッチ作業ログ | — | 📖 **参照専用**（ルール本体） |

### 系列の補足（過去フェーズは `.completed/` 参照）

`_work_in_progress/README.md` の「系列の補足」に、完了・退避した系列（AppearanceDetail 系 / TailsUnit 系 /
`*_DBLink` 系 / Cloudflare 実 API 系 / DeepL 系 / Issue 機能系 / Calling 表示系 / `pkg/` 追従系 /
キャラシート URL 系 / ロールプレイプロンプト生成系）の経緯をまとめています。

---

## 定点観測（棚卸しのたびに実行する）

書面と実態のズレを機械的に検出するためのコマンド群です。

```bash
npm test                                                        # 赤があると addon-ai-tag の自動 PR が止まる（T-09）
npm run agents:check                                            # 指示書の生成物ズレ
npm run data:order:check                                        # データのキー順ズレ
node tools/build-roleplay-prompts.mjs --check                   # ロールプレイプロンプトの冪等性
git rev-list --left-right --count develop...origin/addon-ai-tag # 一方向マージの未実施分（T-10）
gh run list --limit 12                                          # CI の実状態（推測で代用しない）
gh issue list --state open                                      # 未解決 Issue
```

あわせて、**ログに「未コミット」と書かれていたら `git log -- <該当ファイル>` で必ず裏取り**してください。
2026-07-25 の棚卸しでは、そう書かれていた 3 件がすべて着地済みでした。

---

## 2026-07-25 に完了・退避したもの

本ファイルの新設にあわせて 6 件を `.completed/` へ退避しました（直下 22 → 16 件 + 本ファイル）。

| ログ | 退避理由 |
| --- | --- |
| `2026-07-03_current-task-ledger.md` | **本ファイルへ統合**（進行中タスク台帳の役割を引き継ぎ） |
| `2026-07-08_remaining-task.md` | **本ファイルへ統合**（残タスク母艦の役割を引き継ぎ） |
| `2026-07-25_progress_wip-tidy.md` | 棚卸し完了。着手順の決定と対応方針は本ファイルへ移設 |
| `2026-07-25_progress_priority-tasks.md` | 着手順 1〜6 の対応が完了（新規発見は T-03 へ登録） |
| `2026-07-24_progress_roleplay-prompt-formatting.md` | 残 3 件（`[object Object]` / 句点二重化 / 文断裂）を同日に解消 |
| `2026-07-25_progress_aihints-resync-ci-failure.md` | CI 失敗の原因特定と復旧が完了（運用上の注意は T-09 へ登録） |

同日に完了した主なタスク（詳細は `.completed/` 配下の各ログ）:

- **配布用ロールプレイプロンプトの体裁修正**: `[object Object]` 10 件・句点二重化・文断裂をすべて解消。
  `unwrapValueLike()` と単位付き合成変数を新設し、回帰テスト 15 件を追加（`npm test` 597 件全緑）
- **`docs/readme.en.md` の刷新**: 約 3 か月ぶりに更新し、二層 API・圧縮ロケータ `?c=`・`$Def_DBLinkRef` 形式を反映
- **フィールド順 Phase 6（UI/SW マージ順の統一）** と **`basicFields` 整列後の実機目視**（2026-07-17 から未検証だった項目）
- **AIHints 再同期 CI の復旧**: 原因は辞書構造変更へのテスト追従漏れ。`addon-ai-tag` で修正し本番 Actions で緑を確認

---

## 運用ルール

- **本ファイルを残タスクの正とする**。個別の詳細は「関連ログ」を参照する。
- タスクを完了したら、本ファイルの該当エントリへ完了印を付け、関連ログに未完了項目が残っていなければ
  そのログを `.completed/` へ退避する（**`git mv` ではなく `mv` を使う**。`.completed/` は `.gitignore` 対象）。
- 新しいタスクは末尾の空き番号へ追加する（ID は再利用しない）。
- 履歴参照は `.completed/2026-07-03_current-task-ledger.md` と `.completed/2026-07-08_remaining-task.md`。
