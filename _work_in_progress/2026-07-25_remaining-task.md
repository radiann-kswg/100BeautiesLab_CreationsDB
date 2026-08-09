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

### T-01 ✅ Cloudflare Worker のデプロイ（`Works_OfficialLinks` の本番反映）— **完了**（2026-07-29 実測）

- **関連ログ**: `.completed/2026-07-16_progress_official-links.md`（単一）
- **実測（2026-07-29）**: 本番 `GET /api/v1/works` の `#Works_NumberTales` に
  `Works_OfficialLinks[]`（`LinkType` / `URL` / `Label_JP` / `Label_EN`）が**露出済み**。
  2026-07-25 時点の「公開キー 5 種のまま」は解消され、デプロイは着地している
- **同日の後処理**: `docs/readme.en.md` の「次のデプロイで現れる」注記を除去し、
  実測ベースの記述（公開キー 6 種）へ更新済み
- **補足**: デプロイは `.github/workflows/cf-api-sync.yml` が `develop` への push（`pkg/cloudflare/worker.js`
  変更）で自動実行する。手動 `wrangler deploy` は不要（`workflow_dispatch` の `deploy-only` でも可）

### T-02 ✅ AIHints への配色導出（`--apply-colorpalette`）— 完了・**2026-07-29 の棚卸しで削除**

> 本エントリは 2026-07-25 に完了確認済みのため、運用ルールどおり本文を削除しました。
> 経緯は `.completed/2026-07-13_progress_aihints-palette-deadlock.md` の「追記（2026-07-25）」を、
> 残る積み残し（`AIHints` 未保持 13 件の扱い / SemiPrimary 系の seed）は `addon-ai-tag` 側の
> 残課題台帳 **A3** を参照してください。教訓は末尾「運用ルール」へ移設済みです。

### T-03 ✅ 実 API の検索が不正クエリで 500 を返す — **完了**（2026-07-29・**本番反映まで確認**）

- **関連ログ**: `.completed/2026-07-25_progress_priority-tasks.md`（単一・2026-07-25 に実測で発見）
- **コード対応（`d42011a`）**:
  - `pkg/cloudflare/worker.js` に検索クエリ正規化（`normalizeSearchQuery`）を追加し、`*` / `?` を含む
    不正クエリを `ApiError(400, "Invalid search query")` で早期拒否
  - DB 単位検索（`searchRecordsInD1`）・作品横断検索（`searchAllRecordsInD1`）の D1 実行を try-catch 化し、
    FTS5 由来の例外を 500 ではなく 400 へ正規化
  - 回帰テスト `tests/cloudflare-search-errors.test.js` を追加（`npm test` → 46 files / 627 tests pass）
- **本番反映（同日）**: 棚卸し時点では未 push のため本番が **500** のままだったが、その後 `develop` を
  push したことで `cf-api-sync.yml` が `pkg/cloudflare/worker.js` の変更を検出して**自動デプロイ**。
  実測で `GET /api/v1/NumberTales/search?q=*` が **400** を返すことを確認した（`addon-ai-tag` マージ作業中に再確認）
- **備考**: 通常検索（例: `q=Fivens` / `q=イズナ`）の既存挙動は維持
- **教訓**: 本タスクは「コード完了」と「本番反映」が同日中に**別々のタイミング**で起きた。
  Workers 側の変更は push（＝自動デプロイ）まで済んで初めて完了とする（末尾「運用ルール」に明文化済み）

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

### T-07 ✅ `calling.js` のユニットテスト・UI 動作確認 — 完了（2026-07-29）・**同日の棚卸しで削除**

> `tests/section-renders.calling.test.js` の追加（`calling-common` と合わせ 16 件成功）と、
> ローカル UI（`?c=SinisterChangingGirls/Primary/Drc:SW&lang=jp`）での Calling 描画確認をもって完了。
> 詳細は `.completed/2026-06-24_progress_localization-rules-audit.md` を参照してください。

### T-08 🔴 既知の技術負債（まとめ）

- **関連ログ**: 各所の `.completed/` から引き継ぎ（`pkg-sync` / `dbcrosslinkpath` ほか）＋
  `addon-ai-tag` の残課題台帳（A7 / A9 → 下記 6・7。**`develop` 所有ファイルのため `develop` でしか直せない**）
- 個々は小さく、単独で着手できる。
  1. **`_Secondaries` マッチャの三重化**: 同一ロジックが 3 箇所に存在し、**正は `lib/sw-common.js`**。
     - `pkg/cloudflare/worker.js` … `sec_SeriesTitle` の完全一致のみの簡略版（現行データでは実害なし）
     - `pkg/nodejs/index.mjs:335` … `applyCommonsToRecords` 内のクロージャ・未 export。
       **`_Commons` だけを返し `AI_Optout` を捨てている**点が既に乖離（`addon-ai-tag` 台帳 A7）
     - `tools/patch-aihints.mjs` `findSecondaryDef()`（`addon-ai-tag` 限定）… 定義そのものを返す
     - 統合するなら `develop` 側で行う（`addon-ai-tag` で触ると逆マージ禁止により永久分岐する）
  2. **`ImageProcessor.resolveImagePath()`**: 値にスラッシュを含む場合 `folderHint` を付与しない（SW/enrich 側）。
     UI は独自経路のため実害は出ていない
  3. **`ref_Reference.json` の `../../` 相対パス 1 件**（`catalog_PNGName`）: `_DBCrossLinkPath` への移行候補だが保留中
  4. **`pkg/python` / `pkg/csharp` に自動テストが無い**（Vitest 管轄外。同一 API サーフェスの担保は手動追従に依存）
  5. **Cloudflare Workers 版の `_DBLink` / `_Jump` 参照解決 enrich は未対応**（次フェーズ）
  6. **`tools/extract-enum-lists-to-dictionaries.mjs` にシェバンが残存**（`addon-ai-tag` 台帳 A9）。
     `tools/build-roleplay-prompts.mjs` のシェバンは **vitest 4.1.0 で suite ごと `SyntaxError` にする実害**があり
     除去済みだが、本ファイルには残っている（2026-07-25 実測。`tools/*.mjs` で唯一）。
     現状テストから import されていないため無害だが、**将来テストが import すると同じ事故が起きる**
  7. **`CLASS_NAMES_EN` と Class 辞書のレジスタ乖離**（`addon-ai-tag` 台帳 A8・**要 User 判断**）:
     AI タグ用のハードコード（`'uni-digits class'`）と辞書の表示名（`"Uni-Digits"`）はレジスタが異なり、
     29 件中 28 件で値が違う。辞書側へ AI タグ用フィールド（例 `Class_AITag`）を足してハードコードを
     退役させるのが筋だが、スキーマ変更 + 創作判断が要る
  8. **`tests/cloudflare-search-errors.test.js` の API プレフィックス分岐**（`addon-ai-tag` 台帳 A11・
     2026-07-29 のマージで発覚）: 本ファイルは `/api/v1/:work/search` を**ハードコード**で叩くが、
     `addon-ai-tag` の Worker は **`/api/ai` しかルーティングしない**ため、同じテストが向こうでは
     404 を返して**必ず落ちる**（T-09 が言う「無関係な赤」の実例。実測 1 failed / 745）。
     `addon-ai-tag` 側では `/api/v1` → `/api/ai` の順に叩いて 404 以外を採るプレフィックス自動検出
     （`resolveApiPrefix()`）を入れて解消済み。**`develop` 側も同じ形へ揃えると分岐が消える**。
     `develop` 単独では現状のままでも緑なので急がないが、**次にこのファイルを触るときは必ず揃える**

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
- **2026-07-29 実測 → 同日マージ実施で解消**: 着手時 **8 / 114** → マージコミット `46a3845` で **0 / 116**。
  取り込んだのは `aded5e0`（`Belonging` の `$Def_Faction[]` 化）/ `d42011a`・`a4ee3c9`（検索 400 化・棚卸し）ほか 9 件
- **このマージで起きたこと**（詳細は `addon-ai-tag` の `2026-07-29_progress_addon-ai-tag-merge.md`）:
  - 衝突 **5 ファイル**。`db_meta.json` ×3 は「`develop` の `_Commons` 更新」と「`addon-ai-tag` の `AI_Optout`」が
    隣接行で衝突したもので、**両取り**で解消（片側採用だとどちらかが消える）
  - **`develop` 由来のテストが `addon-ai-tag` で 1 件赤になった**（下記 T-08 項目 8）。T-09 の実例
  - `dict_Faction.json` の構造変更は **AIHints へ波及ゼロ**（`--resync-structural` / `--apply-colorpalette` の
    dry-run がいずれも `No changes to write.`）
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

## B. User の判断・入力を待っているもの（Claude 側の準備は完了）

「滞留」は 2026-07-25 時点で当該ログが動いていない日数。**放置しても壊れないが、長いものは
「進めるか畳むか」の判断が要る**ものです。

### T-20 🟡 ColorPalette のレビューと色名入力

> **T-02 は完了済み**（当初「T-02 の前提」と位置づけていたが、導出はすでに稼働している）。
> ただし `Role` は AIHints の `palette_priority` へ**そのまま導出される**ため、レビューで値を変えた場合は
> `addon-ai-tag` 側で `--apply-colorpalette --force-palette` を再実行して反映すること。

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
- **実行チェックリスト（着手時の入口）**:
  1. まず [2026-07-22_progress_issue13-numerology-skinship.md](./2026-07-22_progress_issue13-numerology-skinship.md) の
     「導入方針」「想定スコープ」「未完了タスク」を確認する
  2. 次に本項の 4 つの設計判断（命名 / 配置 / 表示系接続 / 対象範囲）を順に確定する
  3. 確定後、`schema` → `meta` → `DB` の順で非破壊追加の実装に進める
  4. 内容本文（`value_JP` / `about_JP`）は User 監修・手動入力として扱い、AI 側で自動生成しない
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

### T-33 🟡 `Belonging` の `$Def_Faction[]` 化の残確認（2026-07-29 実装分）

- **関連ログ**: `2026-07-29_progress_belonging-faction-typedef.md`（単一）
- **完了済み**: schema / 辞書統合 / レコード一括移行（16 ファイル・83 箇所）/ `$dictRef` 参照解決 /
  basicFields wrapper（`factionSummary` / `baseAreaSummary`）/ テスト（`npm test` 全緑）/ docs 反映
- **待ち項目**:
  - **ブラウザ実機での目視確認**（キャラシート詳細の `所属` / `出身地` 表示、複数所属時の改行）。
    `tests/pages.characters.ui-output.test.js` で end-to-end 検証は済んでいるが、実画面は未確認
  - Cloudflare Workers 実 API（`pkg/cloudflare/`）へ `_enrichment.dictRefs` を載せるかの判断
    （現状は SW 疑似 API 専用。載せない場合は「SW 専用」で確定させる）
- **補足**: `$Def_Faction` は所属以外へも再利用できる形だが、現時点の適用先は `Belonging` のみ

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
| [2026-08-04_progress_unibytelive-streaming-bilingual.md](./2026-08-04_progress_unibytelive-streaming-bilingual.md) | ハンカクライブ `StreamingActivity` の配列系を和英共有フィールドへ統一 | — | ✅ 完了（残は `SUMMARY_KEYS` の schema 駆動化と既存の赤 3 件） |
| [.completed/2026-08-02_progress_relations-graph.md](./.completed/2026-08-02_progress_relations-graph.md) | キャラクター相関図ページ（`pages/relations.html`）の新設（初期計画） | **T-13** | ✅ 完了・退避済み |
| [.completed/2026-08-04_progress_relations-tri-grid.md](./.completed/2026-08-04_progress_relations-tri-grid.md) | 相関図の実装完走ログ（tri-grid/route/UX/遷移/導線） | **T-13** | ✅ 完了・退避済み |
| [2026-08-02_progress_image-rename-index-badge.md](./2026-08-02_progress_image-rename-index-badge.md) | 画像ファイル名をインデックスバッジ（作品コード付き）へ一括改名（640 ファイル） | — | ✅ 完了（独立監査で受入可。指摘 8 件は相関図側の「前段」で解消済み） |
| [2026-08-08_github-triage.md](./2026-08-08_github-triage.md) | GitHub 未解決問題の日次トリアージ | **T-25** | 🟢 現行（未解決は Issue #13 のみ） |
| [2026-07-29_progress_belonging-faction-typedef.md](./2026-07-29_progress_belonging-faction-typedef.md) | `Belonging` の `$Def_Faction[]` 化・`$dictRef` 参照解決 | **T-33** | ⚠️ 実装完了・実機目視と Workers 側判断が残 |
| [2026-07-22_progress_issue13-numerology-skinship.md](./2026-07-22_progress_issue13-numerology-skinship.md) | Issue #13 の要件整理 | **T-25** | 📝 設計判断待ち |
| [2026-07-18_progress_roleplay-prompt-en-phase4.md](./2026-07-18_progress_roleplay-prompt-en-phase4.md) | ロールプレイプロンプト EN 版の着手前調査 | **T-06** | 📝 着手条件は User 確認 2 件 |
| [2026-07-17_progress_field-order-typedef.md](./2026-07-17_progress_field-order-typedef.md) | フィールドキー順の typedef 整列 | **T-04 / T-05 / T-28** | 🟢 Phase 4 以外は完了 |
| [2026-07-13_progress_colorpalette-schema.md](./2026-07-13_progress_colorpalette-schema.md) | `ColorPalette` スキーマ・配色抽出 | **T-20** | ⚠️ 実装済み・User レビュー待ち（AIHints への導出は完了） |
| [2026-07-11_progress_appearancedetail-images.md](./2026-07-11_progress_appearancedetail-images.md) | AppearanceDetail 参考画像の一括登録 | **T-23** | ⚠️ 割当確認待ち |
| [2026-07-06_progress_unibytelive-formalname-draft.md](./2026-07-06_progress_unibytelive-formalname-draft.md) | アルベッツの苗字・コードネーム下書き | **T-22** | ⚠️ User レビュー中 |
| [2026-07-02_progress_addon-ai-tag-reverse-merge-incident.md](./2026-07-02_progress_addon-ai-tag-reverse-merge-incident.md) | 逆マージ事故の記録と是正 | **T-10 / T-31** | ⚠️ 後日談追記が保留 |
| [2026-06-28_progress_conversationpattern-handoff.md](./2026-06-28_progress_conversationpattern-handoff.md) | ConversationPattern 補完の引き継ぎ | **T-21** | ⚠️ User 入力待ち |
| [2026-06-25_progress_localization-summary-inputs.md](./2026-06-25_progress_localization-summary-inputs.md) | Localization Summary の入力チェックリスト | **T-24** | ⚠️ 残 7 件 |
| [2026-06-24_progress_localization-db.md](./2026-06-24_progress_localization-db.md) | Localization レイヤーの実装 | **T-24** | ⚠️ 原作者確認・項目追加が継続 |
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
**「実装済み」と書かれていたら、本番 API を叩いてデプロイ済みかも確認**してください（2026-07-29 の棚卸しでは
T-01 が「未デプロイ」→ 実は反映済み、T-03 が「完了」→ 実は未 push で本番未反映、と**両方向にズレて**いました）。

### 2026-07-29 実測値

| 定点 | 結果 |
| --- | --- |
| `npm test` | ✅ 46 files / **627 tests** 全緑 |
| `npm run agents:check` | ✅ `0/2 件が要更新`（生成物は正典と一致） |
| `npm run data:order:check` | ✅ `0/1287 レコードを整列`（19 ファイル・キー順の差分なし） |
| `npm run roleplay:check` | ✅ `changed=0 unchanged=57 noCP=282 errors=0` |
| `develop...origin/addon-ai-tag` | 棚卸し時 **8 / 114** → 同日マージ実施（`46a3845`）で **0 / 116**（T-10 完了） |
| `develop...origin/develop` | 棚卸し時 **2 / 0**（未 push）→ その後 push して **0 / 0** |
| 本番 `/api/v1/works` | ✅ `Works_OfficialLinks` 露出済み（T-01 完了） |
| 本番 `/api/v1/NumberTales/search?q=*` | 棚卸し時 🔴 **500** → push による自動デプロイ後 ✅ **400**（T-03 完了） |

---

## 2026-07-29 に完了・退避したもの

`develop` 側で 4 件を `.completed/` へ退避しました（直下 17 → 13 件 + 本ファイル + README）。

| ログ | 退避理由 |
| --- | --- |
| `2026-06-24_progress_localization-rules-audit.md` | **T-07 完了**（`calling.js` のテスト追加・UI 確認）。他の申し送り 2 件（`docs/readme.en.md` の旧さ / 要手動確認 6 件）も解消済みを確認 |
| `2026-07-13_progress_aihints-palette-deadlock.md` | **T-02 完了**に伴い役割終了。残る積み残しは `addon-ai-tag` 台帳 A3 へ移管済み |
| `2026-07-08_progress_aihints-structural-resync-proposal.md` | 提案した第1階（`--resync-structural` + CI）が `addon-ai-tag` で実装・稼働済み（PR #14） |
| `2026-07-25_github-triage.md` | `2026-07-29_github-triage.md` へ世代交代（§1〜§3 は全て解決済みで確定） |

同日に完了・確認した主なもの:

- **T-01（`Works_OfficialLinks` の本番反映）**: 本番実測で露出を確認し、`docs/readme.en.md` の
  「次のデプロイで現れる」注記を除去
- **T-07（`calling.js`）**: `tests/section-renders.calling.test.js` の追加と UI 実測で完了（Copilot 作業分）
- **T-03（検索 400 化）**: 棚卸し時点ではコードのみ完了・本番 500 のままだったが、**同日中に push →
  自動デプロイが走り、本番で 400 を確認**して完了（棚卸しの途中で状態が動いた例）
- **T-10（一方向マージ）**: 同日中に `develop`（`a4ee3c9`）→ `addon-ai-tag` のマージを実施（`46a3845`）。
  衝突 5 ファイルを両取りで解消し、`addon-ai-tag` 側の棚卸し（1 件退避・台帳 A4/A10 クローズ・A11 新設）まで完了
- **T-33 を新規登録**: `Belonging` の `$Def_Faction[]` 化（`aded5e0`）の実機目視確認と Workers 側判断

---

## 2026-07-25 に完了・退避したもの

### 追記: `addon-ai-tag` マージ後の反映（同日）

`develop` → `addon-ai-tag` の一方向マージ（`6f68df3`）を行った際、**本ファイルの記載に誤りが 1 件見つかり**、
また `addon-ai-tag` 側の台帳から `develop` 所有の課題 2 件を引き取りました。

| 対象 | 内容 |
| --- | --- |
| **T-02** | ❌ 「繋ぐ 1 本が未実装・92/92 件 `null`」→ ✅ **完了済み**へ訂正。`addon-ai-tag` で `--apply-colorpalette` が実装・適用済み（確定 **91 件** / dry-run 差分ゼロ）。関連ログ 2 本（`aihints-palette-deadlock` / `colorpalette-schema`）にも同内容を追記 |
| **T-20** | 「T-02 の前提」という位置づけを解除。`Role` を変更した場合は `--apply-colorpalette --force-palette` の再実行が要る旨へ差し替え |
| **T-08** | `addon-ai-tag` 台帳 **A7 / A8 / A9** のうち `develop` 所有ファイルの課題を項目 1・6・7 として取り込み（`_Secondaries` マッチャの三重化 / `extract-enum-lists-to-dictionaries.mjs` のシェバン残存 / `CLASS_NAMES_EN` のレジスタ乖離） |

**誤記の原因と再発防止**: 根拠にした `develop` 側 2 ログが 2026-07-13 時点の記述のままで、その後
`addon-ai-tag` で実装が進んだことが `develop` からは見えなかったため。**AIHints のコード・スキーマは
`develop` に含めない運用**なので、状態を書くときは `addon-ai-tag` で実データを見ること（T-02 の節に明記）。

---

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
- **「コードが完了」と「本番へ反映済み」を分けて書く**。Cloudflare Workers 側のタスクは、
  `develop` への push（`cf-api-sync.yml` の自動デプロイ）まで済んで初めて完了とする（T-01 / T-03 の教訓）。
- **AIHints の状態は `develop` 側のログだけで判断しない**。AIHints のコード・ツール・テストは
  `addon-ai-tag` にしか存在せず、`develop` 側のログは実装状況に対して構造的に遅れる。状態を書くときは
  `addon-ai-tag` をチェックアウトして実データ・実コードを見ること。残課題は同ブランチの
  `2026-07-14_progress_addon-ai-tag-log-inventory.md`「AIHints 残課題台帳（A1〜A10）」に集約されている。
- 履歴参照は `.completed/2026-07-03_current-task-ledger.md` と `.completed/2026-07-08_remaining-task.md`。
