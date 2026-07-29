# `addon-ai-tag`: develop 取り込みマージ + 進捗ログ棚卸し（2026-07-29）

## 目的

2026-07-29 の `develop` 側作業（`Belonging` の `$Def_Faction[]` 化・Worker の検索 400 化・進捗ログの棚卸し）を
`develop` → `addon-ai-tag` の一方向マージで取り込み、あわせて本ブランチ側の進捗ログを整理する。

> ブランチ運用方針（`AGENTS.md`）: `develop` → `addon-ai-tag` の一方向マージのみ。逆マージは禁止。

## 1. マージ実行と衝突解消

- マージ: `develop`（`a4ee3c9`）→ `addon-ai-tag`（`e17df30`）。マージコミット **`46a3845`**。
- 取り込んだ `develop` コミット **9 件**（主なもの）:
  - `aded5e0` DB 大幅改修（`Belonging` の `$Def_Faction[]` 化・`$dictRef` 参照解決・basicFields wrapper）
  - `d42011a` 進捗整理（テスト回路補填 / Worker の検索 400 化 / トリアージログ取り込み）
  - `a4ee3c9` 進捗整理 続き（`develop` 側の棚卸し・4 件退避）
  - `51f3993` PR #17（README 技術仕様）/ `a12fe4a` PR #16・`cd91354` PR #15（Dependabot）
- コンフリクトは **5 ファイル**。いずれも**両取り**で解消した（片側採用だと情報が落ちる）。

### 1-1. データ 3 ファイル（`_Commons` × `AI_Optout` の衝突）

`data/Works_{DestinyFoxRecords,FLInvestigator78,UnibyteLive}/DataBases/db_meta.json`。
**同じ `#DB_*` ブロックの隣接行**を両側が別々に変更していた。

| 側 | 変更内容 |
| --- | --- |
| `addon-ai-tag`（HEAD） | `"AI_Optout": true` の付与（本ブランチ固有） |
| `develop` | `_Commons` の中身更新（`Belonging` の構造化 / `FromArea` 追加 / `_ListLinkIf_Suit` 追加） |

**排他ではないため両方を保持**（`develop` の `_Commons` ＋ HEAD の `AI_Optout`）。
解消後に `node -e "JSON.parse(...)"` で構文を確認し、`npx prettier --write` で整形（3 ファイルとも `unchanged`）。

### 1-2. `docs/api-sw-spec.md`（前回と同じ形の衝突）

実 API エンドポイント表で、HEAD 側が `/api/ai/:work/:db/aihints` 系 **2 行**を持ち、
`develop` 側は列幅だけが異なる同内容の表だった。**HEAD 側を採用**して AIHints 2 行を保持。
（2026-07-25 のマージでも同じ箇所が衝突しており、**この表は毎回衝突する**と考えてよい。）

### 1-3. `_work_in_progress/README.md`（毎回衝突する）

退避一覧の節で、HEAD 側が `2026-07-25 addon-ai-tag マージ棚卸し（1件・本ブランチ固有）`、
`develop` 側が `2026-07-29 棚卸しで追加退避（4件）` を追加していた。**両方の節を保持**し、
`develop` 由来の 4 件のうち 2 件（`aihints-palette-deadlock` / `aihints-structural-resync-proposal`）は
**本ブランチでは 2026-07-14 に先行退避済み**で、今回のマージで**両ブランチの状態が揃った**旨を注記した。

## 2. マージで持ち込まれた赤テストの修正（台帳 A11）

マージ後の `npm test` で **1 件失敗**（`tests/cloudflare-search-errors.test.js`）。

- **原因**: `develop` で新設された同テストは `/api/v1/:work/search?q=*` を**ハードコード**で叩くが、
  本ブランチの Worker は `pathname.match(/^\/api\/ai(\/.*)?$/)` で **`/api/ai` しかルーティングしない**。
  そのため 400 ではなく **404**（`Not found`）が返り、`develop` では通るテストが本ブランチでは必ず落ちる。
- **これは T-09 の実例**: AIHints と無関係な赤が 1 件でも残ると、構造的再同期の自動 PR が静かに止まる。
- **対処**: テスト側に `resolveApiPrefix()` を追加し、`/api/v1` → `/api/ai` の順に `/works` を叩いて
  **404 以外を返したプレフィックスを採用**するようにした。プレフィックスをハードコードしないため、
  **同一ファイルが両ブランチで成立する**（＝次回以降このファイルで衝突しない）。
- **`develop` 側にも同じ修正が要る**（台帳 **A11**）。入れないと同名ファイルが別内容のまま分岐し続ける。
  ただし `develop` 側は `/api/v1` 固定でも緑のままなので急を要さない。

## 3. AIHints への影響確認 — **波及ゼロ**

今回のマージは `data/Dictionaries/dict_Faction.json` の**構造変更**（`Belonging` 列を削除し `Faction` へ一本化）を
含むため、AIHints の構造的再同期が大量発火しないかを実測で確認した。

| 確認項目 | 結果 |
| --- | --- |
| `STRUCTURAL_SOURCE_FIELDS` に `Belonging` が含まれるか | **含まれない**（`Num` / `GenderType` / `ConceptAge` / `Height_cm` / `TailsUnit` / `AppearanceDetail` / `ColorPalette`） |
| `tools/patch-aihints.mjs` の `Belonging` / `Faction` 参照 | **0 件**（grep で不在を確認） |
| `--resync-structural` dry-run | **`No changes to write.`**（全件 `resync-unchanged`） |
| `--apply-colorpalette` dry-run | **`No changes to write.`**（`10-alt` のみ `palette-no-colorpalette`） |
| AIHints 実データ（NumberTales / Primary） | **92 件** / `_meta` **92 件** / `palette_priority` 確定 **91 件** / `null` **1 件** — 前回から不変 |

→ **CI の構造的再同期は no-op で通る**見込み。辞書構造の変更が AIHints に波及しないことを確認できた。

## 4. 棚卸し（1 件 → `.completed/`）

**`_work_in_progress/` 直下: 17 件 → 16 件（+ 本ログで 17 件・+ 母艦・+README）**

| ログ | 退避理由 |
| --- | --- |
| `2026-07-25_progress_addon-ai-tag-merge.md` | 前回のマージ + 棚卸し作業ログ本体。未完了だった「本棚卸しの成果は未コミット」は着地済み、最重要の申し送り「`develop` 側で母艦 T-02 を訂正」も **`develop` 側で完了**（台帳 A10 クローズ）。本ログへ世代交代 |

### 残課題台帳の更新（`2026-07-14_progress_addon-ai-tag-log-inventory.md`）

- **状態一覧の表を新設**（A1〜A11 の現在地を 1 か所で読めるようにした）
- **A4 をクローズ**: CI の自動 PR 作成は PR #14（2026-07-25）で実証済み。監視観点は T-09 へ一本化
- **A10 をクローズ**: `develop` 側で母艦 T-02 が訂正され、2026-07-29 の棚卸しで**エントリごと畳まれた**。
  根拠だった 2 ログも `develop` 側で退避され、**両ブランチの状態が揃った**
- **A3 に再実測を追記**: マージ直後も AIHints 92 / palette 確定 91 で不変。辞書構造変更の波及もゼロ
- **A11 を新規登録**: 検索テストの API プレフィックス分岐（上記 §2）

**残置したログ**（いずれも未完了タスクが実在）:

- `2026-07-14_progress_addon-ai-tag-log-inventory.md` — **AIHints 残課題台帳（A1〜A11）**。本ブランチの実質的な母艦
- `2026-07-17_progress_aihints-scope-semiprimary-selfsecondary.md` — seed 本体ほか未完了 4 件

## 5. 検証

- **コンフリクトマーカー**: リポジトリ全体で **0 件**
- **`npm test`: 54 ファイル / 745 件すべて成功**（修正前は 1 failed / 745。`develop` 単独では 46 / 627）
- **JSON 構文**: 衝突解消した 3 ファイルとも `JSON.parse` 成功・`prettier` は `unchanged`
- **AIHints 実データ**: マージ前後で不変（§3 の表）
- **AIHints dry-run 2 種**: いずれも `No changes to write.`（冪等）

## 6. 影響範囲（編集ファイル）

- 衝突解消: `data/Works_{DestinyFoxRecords,FLInvestigator78,UnibyteLive}/DataBases/db_meta.json` /
  `docs/api-sw-spec.md` / `_work_in_progress/README.md`
- テスト: `tests/cloudflare-search-errors.test.js`（プレフィックス自動検出へ）
- ログ: `_work_in_progress/2026-07-14_progress_addon-ai-tag-log-inventory.md`（台帳更新）/
  `_work_in_progress/2026-07-29_progress_addon-ai-tag-merge.md`（本ファイル・新規）
- 退避 1 件（`.completed/` へ移動、Git 管轄外）

**AIHints のコード・データ（`tools/patch-aihints.mjs` / `AIHints` 実データ）への変更は無し。**

## 7. 未完了タスク

- **なし**（マージと棚卸し自体は完了）。AIHints の残課題は台帳 **A1〜A11** を参照。

## 8. 申し送り事項

1. **`develop` 側で母艦 T-03 を完了へ更新すること**。2026-07-29 の `develop` 棚卸し時点では
   本番 `GET /api/v1/NumberTales/search?q=*` が **500** のままだった（未 push が原因）が、
   その後 `develop` が push され `cf-api-sync.yml` が自動デプロイした結果、
   **本マージ作業中の実測で 400 を返すことを確認**した。母艦は `develop` 由来の共有ファイルのため、
   **本ブランチでは書き換えない**（書き換えるとマージのたびに衝突する）。
2. **`develop` 側で `tests/cloudflare-search-errors.test.js` を prefix 検出版へ揃えること**（台帳 A11）。
3. **`docs/api-sw-spec.md` のエンドポイント表と `_work_in_progress/README.md` は毎回衝突する**。
   解消は**必ず両取り**で行うこと（片側採用だと AIHints エンドポイント 2 行や本ブランチ固有の履歴が黙って消える）。
4. **`data/**/db_meta.json` の `AI_Optout` は本ブランチ固有**。`develop` 側が同じ `#DB_*` ブロックの
   `_Commons` を触ると隣接行として衝突する。**`_Commons` は develop 側・`AI_Optout` は HEAD 側**を残す。
5. **辞書構造の変更を取り込んだときは AIHints の dry-run 2 種を必ず走らせる**（T-09 の予防）。
   今回のように波及ゼロなら `No changes to write.` で確認できる。
6. seed（SemiPrimary / SelfSecondary）を行うときは、`--suggest --apply` の後に
   **`--apply-colorpalette` も実行**する（`ColorPalette` は投入済みのため即座に効く）。

## 参考

- `.completed/2026-07-25_progress_addon-ai-tag-merge.md`（前回のマージ + 棚卸し）
- [`2026-07-14_progress_addon-ai-tag-log-inventory.md`](./2026-07-14_progress_addon-ai-tag-log-inventory.md)（AIHints 残課題台帳 A1〜A11）
- [`2026-07-17_progress_aihints-scope-semiprimary-selfsecondary.md`](./2026-07-17_progress_aihints-scope-semiprimary-selfsecondary.md)（seed の前提整備）
- [`2026-07-25_remaining-task.md`](./2026-07-25_remaining-task.md)（統合母艦・`develop` 由来）
- [`2026-07-29_progress_belonging-faction-typedef.md`](./2026-07-29_progress_belonging-faction-typedef.md)（今回取り込んだ `develop` 側の主変更）
- `docs/ai-hints-usage.md` §9.10 / §9.11 / `AGENTS.md`「ブランチ運用方針」
