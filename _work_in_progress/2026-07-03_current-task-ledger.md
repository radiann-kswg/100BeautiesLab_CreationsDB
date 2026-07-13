# 現行タスク台帳（起点）

> 作成: 2026-07-03 / **最終更新: 2026-07-14（棚卸しセッションで更新）**

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

| 項目 | 内容 | ログ |
| ---- | ---- | ---- |
| AppearanceDetail 参考画像 | `10` / `10alt` の corefolder/humanoid 割当の正誤確認、保留 4 枚の扱い | `2026-07-11_progress_appearancedetail-images.md` |
| UnibyteLive 苗字命名 | 下書き 24+2 件の最終レビュー | `2026-07-06_progress_unibytelive-formalname-draft.md` |
| ColorPalette | `Role` の妥当性レビュー、7〜8 色検出 22 件の過検出確認、`ColorName_*` / `Formation` / `Note_*` の入力 | `2026-07-13_progress_colorpalette-schema.md` |
| アンオースドロジカ辞書 | `dict_ModelSeries` / `dict_LogicSeries` の null キー行ラベル | `.completed/2026-07-13_progress_unauthedlogica-index-alias.md`（母艦 P3-3） |

> Issue テンプレートの見た目確認は **2026-07-14 に解消済み**（外部ユーザーが Issue #11 をテンプレート経由で実起票していたことで裏取り）。

### P3) 創作用語DB / 基本資料DB（保留中）

- 対象ログ: `2026-07-08_remaining-task.md`（母艦 P2）
- 残作業: 最小テンプレート案の作成 → 承認 → API/UI 受け皿整備
- 制約: 辞書本文は User 手動入力前提（自動生成しない）

### P4) 技術的な追従・既知の負債

- 対象ログ: `2026-07-08_remaining-task.md`（母艦 P4）に集約
- 主要項目: Workers 側 `_Secondaries` マッチャの乖離（`.completed/2026-07-13_progress_pkg-sync.md`）、
  `ImageProcessor.resolveImagePath()` の既知バグ、`pkg/python`・`pkg/csharp` のテスト不在

### P5) AIHints 構造的再同期（addon-ai-tag 側の別タスク）

- 対象ログ: `2026-07-08_progress_aihints-structural-resync-proposal.md`
- ステータス: 📝 提案書のみ・実装未着手。**User の優先度判断待ち**
- 実装先: `addon-ai-tag` ブランチ（`tools/patch-aihints.mjs` の `--resync-structural` モード + 専用ワークフロー）

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

- triage 系は `2026-07-14_github-triage.md` を最新判断の正とする。過去 triage は履歴参照用。
- 残タスク母艦は `2026-07-08_remaining-task.md`。本台帳は「いま着手すべきもの」の起点に限定する。
