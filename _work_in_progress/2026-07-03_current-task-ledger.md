# 現行タスク台帳（起点）

> 作成: 2026-07-03 / **最終更新: 2026-07-22（棚卸し実施・退避 6 件／赤テスト 3 件を母艦 P4-7 へ登録）**

## 目的

進行中の実務タスクだけを 1 枚に集約し、次回セッションの起点を明確にする。
詳細経緯は各 progress ログを参照し、本台帳は「いま何が残っているか」に限定する。

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

| 項目                      | 内容                                                                                                  | ログ                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| AppearanceDetail 参考画像 | `10` / `10alt` の corefolder/humanoid 割当の正誤確認、保留 4 枚の扱い                                 | `2026-07-11_progress_appearancedetail-images.md`                            |
| UnibyteLive 苗字命名      | 下書き 24+2 件の最終レビュー                                                                          | `2026-07-06_progress_unibytelive-formalname-draft.md`                       |
| ColorPalette              | `Role` の妥当性レビュー、7〜8 色検出 22 件の過検出確認、`ColorName_*` / `Formation` / `Note_*` の入力 | `2026-07-13_progress_colorpalette-schema.md`                                |
| アンオースドロジカ辞書    | `dict_ModelSeries` / `dict_LogicSeries` の null キー行ラベル                                          | `.completed/2026-07-13_progress_unauthedlogica-index-alias.md`（母艦 P3-3） |

> Issue テンプレートの見た目確認は **2026-07-14 に解消済み**（外部ユーザーが Issue #11 をテンプレート経由で実起票していたことで裏取り）。

### P3) 創作用語DB / 基本資料DB（保留中）

- 対象ログ: `2026-07-08_remaining-task.md`（母艦 P2）
- 残作業: 最小テンプレート案の作成 → 承認 → API/UI 受け皿整備
- 制約: 辞書本文は User 手動入力前提（自動生成しない）

### P4) 技術的な追従・既知の負債

- 対象ログ: `2026-07-08_remaining-task.md`（母艦 P4）に集約
- 主要項目: Workers 側 `_Secondaries` マッチャの乖離（`.completed/2026-07-13_progress_pkg-sync.md`）、
  `ImageProcessor.resolveImagePath()` の既知バグ、`pkg/python`・`pkg/csharp` のテスト不在
- **✅ `npm test` の赤 3 件は 2026-07-22 の棚卸しで解消済み（母艦 P4-7 クローズ）**。
  いずれも実装バグではなく DB 更新に対する追従漏れだった。
  - `data.field-order` ×2 → `npm run data:order:write` で解消（`db_SelfSecondary.json` の 2 レコードのみ・値の変更なし）
  - `pages.characters.ui-output` ×1 → フィクスチャの掴み先を `Num: "223-jw"` → `Num: 223` へ差し替え
  - 現在 **41 ファイル / 564 件すべて成功**

### P5) AIHints 構造的再同期（addon-ai-tag 側の別タスク）

- 対象ログ: `2026-07-08_progress_aihints-structural-resync-proposal.md`
- ステータス: 📝 提案書のみ・実装未着手。**User の優先度判断待ち**
- 実装先: `addon-ai-tag` ブランチ（`tools/patch-aihints.mjs` の `--resync-structural` モード + 専用ワークフロー）

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

- triage 系は `2026-07-22_github-triage.md` を最新判断の正とする。過去 triage は履歴参照用。
- 残タスク母艦は `2026-07-08_remaining-task.md`。本台帳は「いま着手すべきもの」の起点に限定する。
