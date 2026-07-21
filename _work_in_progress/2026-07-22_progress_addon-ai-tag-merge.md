# `addon-ai-tag`: develop 取り込みマージ + ログ棚卸し（2026-07-22）

## 目的

2026-07-22 の `develop` 側作業（進捗ログ棚卸し + エージェント指示書の SSOT 化 / Codex 本採用）をコミット後、
`develop` → `addon-ai-tag` の一方向マージで取り込み、本ブランチ側の進捗ログも棚卸しする。
本作業は 2 ブランチ横断棚卸しの**後半（addon-ai-tag パス）**。

> ブランチ運用方針（`AGENTS.md`）: `develop` → `addon-ai-tag` の一方向マージのみ。逆マージは禁止。

## 1. マージ実行と衝突解消

- マージ: `develop`（`2b30754`）→ `addon-ai-tag`（`8392433`）。取り込んだ `develop` コミット **2 件**:
  - `dfe2273` 進捗ログ整備＆テスト回路修正（develop 側棚卸し・キー順整列・ui-output フィクスチャ追従）
  - `2b30754` GPT Codex導入（`AGENTS.md` の SSOT 化・生成ツール・`data/AGENTS.md` 新設ほか）
- コンフリクトは **2 ファイル**: `.github/copilot-instructions.md` / `_work_in_progress/README.md`。
- `data/Works_NumberTales/DataBases/db_Primary.json`（本ブランチは AIHints データを持つ）や
  `tools/patch-aihints.mjs` は変更領域が重ならず**自動マージ成功**。

### 1-1. `.github/copilot-instructions.md`（⚠️ 単純解決だと内容が消えるケース）

develop 側で本ファイルは **`AGENTS.md` からの生成物**になった。一方、本ブランチの同ファイルには
**AIHints 固有の運用ルールが 11 箇所**あり、`AGENTS.md` 側には **0 箇所**だった。

> **このまま `npm run agents:build` で再生成すると、AIHints ルールが丸ごと消滅する。**

そこで、再生成の**前に**内容を正典へ移送した。

- `AGENTS.md` に **「AIHints 運用ルール（`addon-ai-tag` ブランチ限定`）」節を新設**し、次の 6 項目を移送:
  1. `AI_Optout` による AI タグ生成 / AI 学習の抑止（＋「権利上の可否のみを表す」の副条）
  2. `AI_Unready` による AIHints 付与の見送り（＋解決順・判定タイミング・soft skip・`_Secondaries` 判定・適用状況の 5 副条）
  3. AIHints corefolder 強化フィールドの運用
  4. AIHints `silhouette_notes` は object 形式
  5. AIHints corefolder NLD のテンプレ化
  6. AIHints schema 追加時の冪等パッチ
- あわせて `主要ドキュメント参照先` に `docs/aihints-spec.md`（`addon-ai-tag` 限定）を追加。
- **1 つの独立節にまとめた**のは、develop 側のルール更新と行単位で絡ませないため。
  今後 `AGENTS.md` が衝突した場合、**本節は `addon-ai-tag` 側を残す**のが正であることを節冒頭に明記した。
- 文言はツール中立化（「Copilot は画像から推定した…」→「エージェントは…」）。
- 移送後に `npm run agents:build` で再生成し、`npm run agents:check` が一致を報告することを確認。

### 1-2. `_work_in_progress/README.md`（4 箇所）

前回同様、**両ブランチの記載をどちらも失わずに**解消した。

- **トピック索引**: develop 側の新規行（SSOT 化 / 棚卸し / Issue #13 / triage 更新）を取り込みつつ、
  本ブランチ固有行（AIHints 残課題台帳 / AIHints 対象拡張）を保持。
  **develop 側にあって本ブランチには実ファイルが無い 3 行**（`addon-ai-tag 逆マージ事故記録` /
  `AIHints 構造的再同期 設計提案` / `AIHints カラーセット デッドロック診断` — いずれも本ブランチでは
  2026-07-14 の棚卸しで先に退避済み）は**索引から除外**し、その旨を表の上に注記した。
  ColorPalette 行は本ブランチの状態（`--apply-colorpalette` 適用済み）を採用。
- **系列の補足**: develop 側 2 項目（Index 解決系 / ロールプレイ生成系）を追加し、本ブランチ固有の
  AIHints 系 3 項目を保持。「エージェント指示書 / SSOT 系」を新設して AIHints 専用節の扱いを明記。
- **退避一覧・整理履歴**: 両ブランチのエントリを時系列で統合。

## 2. 棚卸し（2 件 → `.completed/`）

**`_work_in_progress/` 直下: 21 件 → 19 件（+ 本ログで 20 件・+README）**

| ログ | 退避理由 |
| --- | --- |
| `2026-07-16_progress_addon-ai-tag-merge.md` | 前回のマージ + 棚卸し作業ログ本体。未完了タスクなし。本ログへ世代交代 |
| `2026-07-18_progress_roleplay-shebang-fix.md` | **申し送りを実地確認で消化**（下記 2-1） |

### 2-1. `roleplay-shebang-fix` の申し送り確認

ログには 2 件の未完了が残っていた。実地で確認した結果:

- **「option 2 本体（ライブラリ分離）」→ 解消済み**。`tools/roleplay/` に `render.mjs` / `sections.mjs` が
  存在することを確認。develop 側のロールプレイプロンプト生成フェーズ1〜2 で移設が完了しており、
  申し送りの前提だった「別ローカルのロールプレイ更新完了後」という条件が本マージで満たされた。
- **`tools/build-roleplay-prompts.mjs` のシェバン → 除去が維持されている**ことを実測確認。
- **`tools/extract-enum-lists-to-dictionaries.mjs` のシェバン → 残存**（実測）。
  `tools/` は `develop` 所有のため本ブランチで触ると永久分岐する。
  `2026-07-14_progress_addon-ai-tag-log-inventory.md` の **A9** として引き継いだ。

## 3. 実データによる裏取り

書面の食い違いを実データで決着させた。

- `2026-07-13_progress_colorpalette-schema.md` の本文は「AIHints への機械導出は**未実装**」と書かれていたが、
  これは develop 側の状態を書いたものがマージで持ち込まれたもの。本ブランチでは:
  - `tools/patch-aihints.mjs` に `--apply-colorpalette` が**実装済み**（`applyColorPaletteToAihints()`）。
  - 実データ `db_Primary.json` を集計し、**AIHints 保有 92 件 / `_meta` 付与 92 件 /
    `palette_priority` 確定 91 件**（残り 1 件は `ColorPalette` を持たないレコード）を確認。
  - README の「確定 91 件」という既存記載と**一致**したため、記載が正しいことを裏取りできた。
  - 当該ログへ「本ブランチでの状況」を注記として追記（develop 側の記述は消さない）。

## 検証

- **コンフリクトマーカー**: リポジトリ全体（`.completed/` 除く）で **0 件**。
- **AIHints 内容の欠落検査**: マージ前の `HEAD:.github/copilot-instructions.md` と再生成後を機械照合。
  - AIHints 系の**太字ルールラベル 9 件 → 未収録 0 件**。
  - 重要キーワード 14 件（`--force-ai-optout` / `skipped-ai-optout` / `loadAiUnreadyProgressValues` /
    `--include-ai-unready` / `skipped-progress` / `--migrate-silhouette-structure` /
    `--rewrite-corefolder-nld` / `extractMarkingInfo` / `--upgrade-schema` / `--apply-vision-results` /
    `$Def_AISilhouetteNotes` / `$Def_AIFormVariant` / `migrate-aihints.mjs` / `isForSecondary`）
    → **失われたもの 0 件**。
- **生成物の一致**: `npm run agents:check` が `0/2 件が要更新` を報告。
- `npm test`: 後述（本ログ末尾の「テスト結果」を参照）。

## 影響範囲（編集ファイル）

- `AGENTS.md`（AIHints 運用ルール節を新設・`docs/aihints-spec.md` を参照先へ追加）
- `.github/copilot-instructions.md`（生成物・再生成で衝突解消）
- `_work_in_progress/README.md`（衝突解消 + 索引・退避一覧・整理履歴の更新）
- `_work_in_progress/2026-07-13_progress_colorpalette-schema.md`（本ブランチでの状況を注記）
- `_work_in_progress/2026-07-14_progress_addon-ai-tag-log-inventory.md`（A9 を追加）
- `_work_in_progress/2026-07-22_progress_addon-ai-tag-merge.md`（本ファイル・新規）
- 退避した 2 件（`.completed/` へ移動、Git 管轄外。うち 1 件は移動前に確認結果を追記）

コード（`lib/` `pages/` `tools/` `data/`）への機能変更は本作業では**なし**。

## 未完了タスク

- **本マージ結果は未コミット**（User の確認・指示待ち）。マージ解決済みファイルは `git add` 済みで、
  `git commit` すればマージコミットが作られる状態。
- AIHints の残課題は `2026-07-14_progress_addon-ai-tag-log-inventory.md`（**A1〜A9**）を参照。

## 申し送り事項

1. **`AGENTS.md` の AIHints 節は本ブランチ限定**。今後 `develop` からのマージで本ファイルが衝突したら、
   当該節は**こちら側を残す**（節冒頭にも明記済み）。逆マージは禁止。
2. **指示書のルール追加手順が変わった**: `AGENTS.md` を編集 → `npm run agents:build` → 生成物ごとコミット。
   `.github/copilot-instructions.md` を直接編集しても次のビルドで上書きされる。
   AIHints ルールを足すときも `AGENTS.md` の専用節へ入れること。
3. **A9**（`extract-enum-lists-to-dictionaries.mjs` のシェバン）は `develop` 側で対応する課題。
4. `.agents/` は develop 側で未追跡のまま持ち込まれている（スキルの正典）。コミット対象に含めるかは User 判断。

## 参考

- `_work_in_progress/2026-07-22_progress_wip-tidy.md`（develop パスの棚卸し）
- `_work_in_progress/2026-07-22_progress_agents-ssot.md`（SSOT 化の設計と検証）
- `.completed/2026-07-16_progress_addon-ai-tag-merge.md`（前回のマージ + 棚卸し）
- `AGENTS.md` §9（入口ファイルとの関係）/「AIHints 運用ルール（`addon-ai-tag` ブランチ限定）」節
