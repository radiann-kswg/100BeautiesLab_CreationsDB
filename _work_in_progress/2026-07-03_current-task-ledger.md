# 現行タスク台帳（起点）

> 作成: 2026-07-03 / **最終更新: 2026-07-25（棚卸し実施・退避 4 件／放置タスクの洗い出しと着手順の明文化）**

## 目的

進行中の実務タスクだけを 1 枚に集約し、次回セッションの起点を明確にする。
詳細経緯は各 progress ログを参照し、本台帳は「いま何が残っているか」に限定する。

---

## 着手順の推奨（2026-07-25 の棚卸しで確定）

「何から手を付けるか」で迷わないための順序。**上ほど先に片付ける**。
根拠は `2026-07-25_progress_wip-tidy.md`「今後の対応方針」。

| 順 | 対象 | なぜこの順か | 参照 |
| --- | --- | --- | --- |
| **1** | ロールプレイプロンプトの `[object Object]` ほか 3 件 | **配布用の成果物に実害が出ている唯一の項目**（66 件中 10 件）。再生成では直らない | 母艦 P4-8 |
| **2** | `docs/readme.en.md` の更新 | 公開ドキュメントが 3 か月弱ノータッチで、実 API が英語圏へ案内されていない | 母艦 P4-9 |
| **3** | `basicFields` 整列後の実機目視 | 表示順を変えた変更が**未検証のまま 8 日**。後続の UI 作業すべての前提になる | 母艦 P4-10 |
| **4** | AIHints `--apply-colorpalette` の実装（`addon-ai-tag`） | `ColorPalette` 94 件の投資が AIHints へ届いていない。**繋ぐ 1 本だけが欠けた状態** | 母艦 P7-1 |
| **5** | field-order Phase 6（UI/SW マージ順の統一） | 既知の実装不整合。放置するほど後続の UI 変更が乗りにくい | 母艦 P4-10 |
| **6** | Worker `/works` への `OfficialLinks` 明示追加 | 実害は無いが、SW / `pkg/` / UI と Workers の対応差が残り続ける | 母艦 P4-6 |

**User 判断が要るもの**（Claude 側の実装は完了済み・下記 P2 / P7 参照）は、上記と並行して随時。
**創作本文の入力待ち**（P1 / P3、母艦 P3）は User のペースで進める性質のため、上記の順序には含めない。

---

## 現行タスク一覧（develop 観点・優先順）

### P1) ConversationPattern handoff の後処理（継続中）

- 対象ログ: `2026-06-28_progress_conversationpattern-handoff.md`
- 残作業:
  - sub2 側 stale lock（`.git/index.lock`）解消 — **User 端末で実施要**
  - Num 92/94/95/98/99/2/10 の ConversationPattern 仮入力
    （**DialogueExamples 先行方式**: User が `DialogueExamples[].value_JP`/`about_JP` を先に入力 → Claude が 6 項目を仮入力）
- 完了条件: handoff に記載されたユーザ端末作業がすべて完了し、再開不要状態になること

### P2) User レビュー・入力待ちの実務（Claude 側の実装は完了済み）

いずれも実装・テスト・確認は完了しており、**User の目視/創作判断のみ**が残っている。
「滞留」列は 2026-07-25 時点で当該ログが動いていない日数（長いものほど、着手するか畳むかの判断が要る）。

| 項目                      | 内容                                                                                                  | 滞留 | ログ                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------- |
| ColorPalette              | `Role` の妥当性レビュー、7〜8 色検出 22 件の過検出確認、`ColorName_*` / `Formation` / `Note_*` の入力 | 12 日 | `2026-07-13_progress_colorpalette-schema.md`                                |
| AppearanceDetail 参考画像 | `10` / `10alt` の corefolder/humanoid 割当の正誤確認、保留 4 枚の扱い                                 | 14 日 | `2026-07-11_progress_appearancedetail-images.md`                            |
| UnibyteLive 苗字命名      | 下書き 24+2 件の最終レビュー。I・O の2代目は `Height_cm` 等が未設定・配置も保留                       | 19 日 | `2026-07-06_progress_unibytelive-formalname-draft.md`                       |
| Localization Summary 入力 | `Summary_JP`/`_EN` の未入力 **7 件**（地名 4 / 人物名 2 / FL78 現象・能力 3 のうち一部）＋第1〜7界    | 30 日 | `2026-06-25_progress_localization-summary-inputs.md`                        |
| アンオースドロジカ辞書    | `dict_ModelSeries` / `dict_LogicSeries` の null キー行ラベル                                          | —    | `.completed/2026-07-13_progress_unauthedlogica-index-alias.md`（母艦 P3-3） |

> Issue テンプレートの見た目確認は **2026-07-14 に解消済み**（外部ユーザーが Issue #11 をテンプレート経由で実起票していたことで裏取り）。
>
> **注**: これらは「Claude 側で先に進められない」ため滞留しているもので、放置しても壊れるものではない。
> ただし ColorPalette は母艦 P7-1（AIHints への導出）の前提になるため、着手順 4 の前に `Role` だけでも確定できると進みやすい。

### P3) 創作用語DB / 基本資料DB（保留中）

- 対象ログ: `2026-07-08_remaining-task.md`（母艦 P2）
- 残作業: 最小テンプレート案の作成 → 承認 → API/UI 受け皿整備
- 制約: 辞書本文は User 手動入力前提（自動生成しない）

### P4) 技術的な追従・既知の負債

- 対象ログ: `2026-07-08_remaining-task.md`（母艦 P4・**2026-07-25 に 7 項目を追加して 1〜14 へ拡張**）
- **直近で着手すべき 3 件**（着手順 1 / 2 / 3。詳細は冒頭の表）
  - **P4-8 ロールプレイプロンプトの体裁くずれ**: `[object Object]` が 66 件中 10 件に実在（配布物への実害）
  - **P4-9 `docs/readme.en.md` の陳腐化**: 2026-04-30 以降ノータッチ・`Cloudflare` の記載 0 件
  - **P4-10 `basicFields` 整列後の実機目視**: 2026-07-17 の変更が実ブラウザ未確認のまま
- 従来からの項目: Workers 側 `_Secondaries` マッチャの乖離、`ImageProcessor.resolveImagePath()` の既知バグ、
  `pkg/python`・`pkg/csharp` のテスト不在、Worker `/works` への `OfficialLinks` 明示追加（P4-6）
- 2026-07-25 に新規登録: field-order Phase 4 / Phase 6（P4-10）、`$VersDef`/`$VarsDef` 表記ゆれ（P4-11）、
  AIHints 再同期の `npm test` 全体依存（P4-12）、`develop`→`addon-ai-tag` 未マージ 1 件（P4-13）、
  ICS カレンダーの外部反映（P4-14）
- **✅ `npm test` の赤 3 件は 2026-07-22 の棚卸しで解消済み（母艦 P4-7 クローズ）**。
  いずれも実装バグではなく DB 更新に対する追従漏れだった。
  - `data.field-order` ×2 → `npm run data:order:write` で解消（`db_SelfSecondary.json` の 2 レコードのみ・値の変更なし）
  - `pages.characters.ui-output` ×1 → フィクスチャの掴み先を `Num: "223-jw"` → `Num: 223` へ差し替え
  - **2026-07-25 時点も 42 ファイル / 582 件すべて成功**（再燃なし）

### P5) AIHints 系（addon-ai-tag 側の別タスク）

- 対象ログ: `2026-07-08_progress_aihints-structural-resync-proposal.md` /
  `2026-07-13_progress_aihints-palette-deadlock.md` / `2026-07-13_progress_colorpalette-schema.md`
- **ステータスを 2026-07-25 に更新**: 提案 2 本は「優先度判断待ち」のままだが、**実装は実際に進んでいる**。
  - ✅ 第0階（`palette_priority` の `null` ハンドリング）: `addon-ai-tag` で実装済み
  - ✅ 第1階（`_meta` provenance + `--resync-structural` + CI ワークフロー）: **稼働済み**。
    2026-07-25 に本番 Actions で PR 自動作成 → マージ後 no-op までを実データで確認（PR #14 / `6bf1e50`）
  - ✅ 第2階（`tools/extract-palette.mjs`）: `develop` 側で実装済み。`ColorPalette` を **94 件**投入済み
  - ❌ **繋ぎの 1 本（`--apply-colorpalette` 相当）だけが未実装** → 母艦 P7-1。
    このため AIHints の `palette_priority` は依然 92/92 件 `null` で、**`ColorPalette` の投資が回収できていない**
- 実装先: `addon-ai-tag` ブランチ（`tools/patch-aihints.mjs`）

### P6) ロールプレイプロンプト EN 版生成（着手前調査・実装計画）

- 対象ログ: `2026-07-18_progress_roleplay-prompt-en-phase4.md`
- ステータス: 📝 着手前スキャン完了。**出力先形式と呼称 EN 表記の User 確認待ち**
- 残作業: `RoleplayPrompts_EN/` か suffix 方式かの確定、`build-roleplay-prompts.mjs` の lang 分岐、EN テンプレ 3 本の新設
- 実装先: `develop` での整理後、`addon-ai-tag` へも同作業を反映する

### P7) Issue #13 希望タスク（数秘解説 / スキンシップ反応）

- 対象ログ: `2026-07-22_progress_issue13-numerology-skinship.md`
- ステータス: 📝 要件整理ログを作成。**フィールド命名・配置・適用範囲は User 判断待ち**
- 残作業:
  - `db_type.json($DefType)` の追加方式を確定（`ConversationPattern` 配下か独立フィールドか）
  - `db_meta.json($DetailLayout)` での表示位置と `$slot` 追従方針を確定
  - 対象DB（NumberTales / Primary ほか）の段階導入順を確定
  - 実データ本文（`value_JP` / `about_JP` 等）は User 手動入力で進行
- 制約: 創作本文は自動生成しない（ロールプレイ制約 / 運用ルール準拠）

## 2026-07-25 棚卸しで完了・退避したもの

`develop` を対象に 4 件を `.completed/` へ退避（直下 24 → 20 件、+ 棚卸しログ本体）。
**書面の「未コミット」「要確認」を git / `gh` / 生成物の実測で裏取りしてから**退避した。

- **`2026-07-22_progress_wip-tidy.md`**: 「成果は未コミット」→ `dfe2273` で着地済みを確認。
  申し送りだった未追跡の `.agents/` も追跡済み（`npm run agents:check` = `0/2 件が要更新`）。
- **`2026-07-22_progress_agents-ssot.md`**: 「成果は未コミット」→ `2b30754` で着地済み。
  申し送りの `addon-ai-tag` 波及も `79cafd1` のマージで完了済みを確認。
- **`calendar-same-person-dblink.md`**: 「Claude Desktop 側の未コミット実装」→ `a20fb7b` で着地済み。
  残る Drive ミラー再アップロードとアーティファクト確認は母艦 P4-14 へ引き継ぎ。
- **`2026-07-22_github-triage.md`**: `2026-07-25_github-triage.md` へ世代交代。
  §3 の `AI_Optout` 仮説が誤りだった旨と、§4 Pages 失敗の解消（run `30143189878` success）を追記のうえ退避。

**訂正したもの**（退避せず現行に残置）:

- `2026-07-25_github-triage.md` §1 が、退避済み 07-22 triage と**同じ誤った仮説**（`AI_Optout` による exit 2）を
  再掲していたため、訂正注記を追加し「対応案は適用しないこと」を明記した。
- `2026-07-24_progress_roleplay-prompt-formatting.md` の「`@Age` は `buildVars()` 側でアンラップ済み」が
  **実データで否定された**（`設定年齢は[object Object]歳` が 3 件）ため訂正し、母艦 P4-8 へ格上げ登録した。

詳細は `2026-07-25_progress_wip-tidy.md` を参照。

## 2026-07-22 棚卸しで完了・退避したもの

`develop` を対象に 6 件を `.completed/` へ退避（直下 24 → 18 件、+ 棚卸しログ本体）。User 提示の開発環境
（`127.0.0.1:5500`）と本番実 API（`database.numbertales-radiann.net`）で裏取りしてから退避した。

- **複合 Index 直リンク**（`composite-index-locator`）: Playwright で 5 ケースを往復確認。当初報告の不具合
  2 件は再現せず、旧形式 URL の新形式書き換え・エイリアス Index の root 抜き解決も確認（pageerror 0 / 4xx 0）。
  残る `#IndexAlt` 宣言化は母艦 P5-4 へ。
- **ロールプレイプロンプト生成 フェーズ0〜3**（`roleplay-prompt-generator`）: roleplay 系 5 テストが全件緑を再確認。
  フェーズ4（EN 版）は `2026-07-18_progress_roleplay-prompt-en-phase4.md` で継続（本台帳 P6）。
- **前回棚卸しログ**（`2026-07-16_progress_wip-tidy.md`）: 申し送りだった `develop` → `addon-ai-tag`
  一方向マージの完了を git で確認（`develop...addon-ai-tag` = 0/98）。
- 日次トリアージ 3 件（`07-16` / `07-18` / `07-20`）。現行 triage は `2026-07-22_github-triage.md`。

あわせて本番実 API で母艦 P4-6（Worker `/works` への `OfficialLinks` 明示追加）が**未対応のまま**であることを
実測確認し、赤テスト 3 件を母艦 P4-7 へ新規登録した。詳細は `2026-07-22_progress_wip-tidy.md` を参照。

## 2026-07-16 棚卸しで完了・退避したもの

`develop` を対象に 6 件を `.completed/` へ退避（直下 21 → 15 件、+ 棚卸しログ本体）。ブラウザ実地確認（`127.0.0.1:8123` + Playwright）で 2 件の「確認待ち」を消化した。

- **辞書解決の破損修正**（`global-dict-resolution-fix` / `f78cfdb`）: グローバル辞書由来フィールド（所属・種族・性別・作者名）の和英併記復旧をブラウザ確認。**残: `develop` → `addon-ai-tag` の一方向マージ**（本棚卸しの `addon-ai-tag` パスで実施予定・逆マージ禁止）。
- **公式サイトリンク**（`official-links` / `6646d50`）: NT / FLInvestigator78 の公式リンク表示・EN ラベル切替・安全属性をブラウザ確認。残: Worker `/works` 明示追加 → 母艦 P4-6。
- **URL 簡略化**（`url-params` / `a36ba32`）: 圧縮ロケータ `?c=` + 錦野姉妹 Dealer 対応まで完了・退避。
- 日次トリアージ 2 件（`2026-07-14` / `2026-07-15`）と前回棚卸しログ本体を退避。現行 triage は `2026-07-16_github-triage.md`。

詳細は `2026-07-16_progress_wip-tidy.md` を参照。

## 2026-07-14 棚卸しで完了・退避したもの

- **Issue テンプレート**: 外部ユーザーが Issue #11 をテンプレート経由で実起票していたことを確認し、「見た目確認」を消化。あわせて `data-correction` ラベル未定義の不具合を発見・作成して修正。
- **Calling 表示バグ**: 作品別 typedef に残る `ForMasterCalling_JP`/`_EN` の suffix 宣言は表示バグを起こさないことをブラウザ実地確認し、回帰テスト 2 件で固定。
- **pkg-sync / unauthedlogica-index-alias**: 実装完了を確認し退避。残タスクは母艦 P3 / P4 へ引き継ぎ済み。

詳細は `2026-07-14_progress_wip-tidy.md` を参照。

## 2026-07-13 棚卸しで完了・退避したもの

以下は確認まで完了し `.completed/` へ退避済み（詳細は `README.md` の「2026-07-13 棚卸しで追加退避（17件）」）。

- **本番実 API で裏取り**: R2 未同期障害の是正（D1 `is_private` / FTS も是正済み）、共通資料（`#Works_CommonReferences`）の Workers 疎通
- **ブラウザ目視で裏取り**: `_DBCrossLinkPath` の画像解決 + SW enrich 非破壊性、TailsUnit 参考画像、`NumberMarkLocation`/`IdentityMotif` 廃止、EarShapeType 独立軸化
- **コミット状態を確認**: DFR / Proxies 統合、アンオースドロジカ Index 拡張はいずれも `develop` にコミット済み
- 日次 triage 4 件（現行は `2026-07-13_github-triage.md`）

## 運用メモ

- triage 系は **`2026-07-25_github-triage.md`** を最新判断の正とする。過去 triage は履歴参照用。
  ただし**自動トリアージは Actions 実行ログへ未接続**のため、CI 失敗の「推定原因」は仮説にとどまる。
  実行ログを確認するまでは提案を適用しない（2026-07-22 / 07-25 とも同じ誤った仮説を立てた実績がある）。
- 残タスク母艦は `2026-07-08_remaining-task.md`。本台帳は「いま着手すべきもの」の起点に限定する。
- **棚卸しのたびに確認する定点観測**（2026-07-25 に追加）:
  1. `npm test`（全緑か。赤があると `addon-ai-tag` の AIHints 自動 PR が止まる → 母艦 P4-12）
  2. `npm run agents:check` / `npm run data:order:check`（生成物・キー順のズレ）
  3. `git rev-list --left-right --count develop...origin/addon-ai-tag`（一方向マージの未実施分 → 母艦 P4-13）
  4. `gh run list` / `gh issue list`（CI の実状態と未解決 Issue。書面の推測で代用しない）
