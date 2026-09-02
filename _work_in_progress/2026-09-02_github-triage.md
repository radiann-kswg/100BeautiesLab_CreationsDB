# 2026-09-02 GitHub 未解決トリアージ（調査・提案のみ / コード変更なし）

## 実施範囲

- Gmail の GitHub 通知（`from:github.com newer_than:14d` = 2026-08-19〜09-02、25 スレッド）を走査
- GitHub コネクタ（`mcp__github__*` 読み取り系のみ）で Issue / PR / ラベル / コミットを実測
  → **省略なし・全件実測**（`get_me` で認証確認済み。401/403 なし）
- ローカル（D ドライブ main 環境）の読み取り専用 git で状況を確認

書き込みは本ログのみ。コード・ワークフロー・設定・git 状態は一切変更していません。

---

## 結論サマリ

**本リポジトリ宛の新規通知はゼロです。**
8/31 のトリアージ以降に届いた GitHub 通知は、上流側 2 リポジトリの
「Upstream sync check」失敗 2 件のみで、本リポジトリの項目はすべて **8/31 からの継続**です。

| #   | 項目                                                             | 優先度 | 状態                          |
| --- | ---------------------------------------------------------------- | ------ | ----------------------------- |
| 1   | jsdom@30 が Node 20 を要求外にしており CI（Node 20 固定）と不整合 | **高** | **未対応**（8/29 から継続）   |
| 2   | `github-actions` ラベルが存在せず Dependabot が毎回警告          | 低     | **未対応**（9/2 実測で再確認）|
| 3   | glob が上流（13 系）と乖離したまま（本リポジトリは 11 系）       | 低     | 要判断（変化なし）            |
| 4   | Issue #28 Images 拡充（corefolder 完成絵 0 枚が 65%）            | 中     | OPEN 継続（4 日経過）         |
| 5   | Issue #13 数秘解説 / スキンシップ反応フィールド追加              | 中     | OPEN 継続（**43 日経過**）    |

---

## 1.【高】jsdom@30 と CI の Node 20 固定が不整合（8/29 から未変化・潜伏継続）

### 本日の実測（2026-09-02）

- `origin/addon-ai-tag` の tip は **`7967612`（2026-08-30T02:24:53Z）で 8/31 から変化なし**
  （`list_commits sha=addon-ai-tag` で確認）。
- したがって `2026-08-31_github-triage.md` 項目 1 の分析はそのまま有効です:
  - `package-lock.json` 実測で jsdom 30.0.1 の engines は
    `^22.22.2 || ^24.15.0 || >=26.0.0` → **Node 20 では不適合**
  - `package.json` の `engines.node` は `>=18.0.0` のまま
  - ワークフローの Node 固定は 4 ファイル 5 箇所すべて `node-version: "20"`
- **AIHints 再同期ワークフローのトリガーは `data/Works_*/DataBases/db_*.json` のパス限定**で、
  8/28 以降 `addon-ai-tag` に入った push（`4c46003` / `a50c52c` / `7967612`）は
  db_\*.json を 1 件も含みません。よってワークフローが走っておらず**潜伏したまま**です。
  **次の DB 変更 push で顕在化します。**

### 提案（8/29 から変更なし。上流と同じ解き方が最短）

上流 JsonCharacterDB-Framework は 8/26 の `a53970b` で同じ問題を解消済みです。

1. `package.json` の `engines.node` を `>=18.0.0` → `>=22.19.0`
2. `.github/workflows/aihints-structural-resync.yml` の `node-version: "20"` → `"22"`
   （運用を揃えるなら `cf-api-sync.yml` 2 箇所 / `gcal-sync.yml` / `jekyll-gh-pages.yml` も同時に）

> 対案（jsdom を 26 系へ戻す）は PR #25 の差し戻しになり、上流とも乖離するため非推奨。

### 検証方法（実施は人の判断で）

- Node 20 環境で `npm test` が落ちることを確認（ローカルは Node v24.16.0 のため素通りします）
- あるいは Node 22 化した後、通常の DB 変更 push で AIHints 再同期が緑になることを確認

---

## 2.【低】`github-actions` ラベルが存在しない（9/2 実測で再確認）

- `mcp__github__get_label` →
  `label 'github-actions' not found in radiann-kswg/100BeautiesLab_CreationsDB`（2026-09-02 確認）
- `.github/dependabot.yml` の `package-ecosystem: github-actions` セクションは
  `labels: [- github-actions]` を要求したまま
- 8/31（月）の Dependabot 定期実行では PR #29（glob 13.0.6）が立ち、その後マージ済み
  （develop の `7e7299a`）。Actions 系の新規 PR は今週は立っていません。

### 提案（どちらか一方 / 8/31 から変更なし）

- **A（最小差分・推奨）**: `.github/dependabot.yml` から `github-actions` ラベル行を削除。
  `dependencies` ラベルと `commit-message.prefix: 'chore(actions)'` で判別可能。
- **B**: Settings → Labels でラベル `github-actions` を作成。
  Actions 更新だけを絞り込む運用意図があるならこちら。

> 補足: 上流 2 リポジトリでも「ワークフローがラベルを前提にしているのに実在しない」ことが
> 原因で CI が落ちています（本日の Framework / SecondaryWorksDB のログ参照）。
> **ラベル前提の自動化は、ラベル不在で壊れる**という同じ弱点を共有しているため、
> B（ラベルを作る）より A（前提を減らす）の方が全体として筋が良いです。

---

## 3.【低】glob のメジャーが上流と乖離したまま

- 本リポジトリ: `glob ^11.1.0`（PR #26 のコンフリクト解消で実質差し戻し）
- 上流 JsonCharacterDB-Framework: `glob ^13.0.6`（`7fc7279` で 13 系を採用）
- 8/31 の Dependabot 実行で PR #29（glob 13.0.6）が再度立ち、マージされています
  （develop `7e7299a` / `ee82f1a`）。**8/31 時点の「11 系のまま」から状況が動いた可能性**があるため、
  次回は `package.json` の実値を再確認してください（本日はローカル develop 未 fetch のため未確定）。
- 意図的に 11 系を維持するなら `ignore` 設定を入れる、上流に揃えるなら項目 1 の Node 22 化と
  同時に行うのが安全です（glob 13 の engines は `20 || >=22`）。

---

## 4.【中】Issue #28: Images 収録拡充と characters タグ整備

- 状態: **OPEN**（作成 2026-08-29T05:36 / コメント 2 / 最終更新 08-29T05:56、**以後動きなし**）
- 中身: 学習許可済み NT 112 キャラのうち **corefolder 完成イラスト 0 枚が 73 件（65%）**
- 提案（8/31 から変更なし・着手しやすい順）:
  1. **既存イラストの `images` 未紐付けの棚卸し**（新規制作ゼロで参照可能枚数が増える）
  2. corefolder 完成絵 0 枚の 73 キャラを優先度リスト化
  3. catalog の命名規則 `chr-dsgn_catalog<バッジ>.png` と配置は現状維持

---

## 5.【中】Issue #13: 数秘解説 / スキンシップ反応フィールドの追加依頼

- 状態: **OPEN**（作成 2026-07-21、以後更新なし・**43 日経過**）
- Bot 側はフィールド未存在でもフォールバックするため機能停止はなし（緊急度は低い）
- 止まっている判断: 命名・配置（`ConversationPattern` 配下 or 独立フィールド）／`$Def_*` 型の切り出し方／
  RoleplayPrompts に含めるか
- 提案: 設計方針だけでも Issue にコメントし、Bot 側の待ち状態を解消する

---

## 対応不要と判断した項目（根拠つき / 確認日時: 2026-09-02）

| 項目                                    | 判断根拠（実測）                                                    |
| --------------------------------------- | ------------------------------------------------------------------- |
| Dependabot PR #24 / #25 / #26 / #27 / #29 | `list_pull_requests state=open` → `[]`（すべてマージ済み）         |
| AIHints 再同期 CI の `npm ci` 失敗（8/28）| 8/28 の lockfile 修正で解消済み（`2026-08-28_progress_aihints-resync-lockfile-fix.md`）。ただし項目 1 が残るため「次回 push で緑」とはまだ言えない |
| APHRNTs_100 / GeneratorsAI / MisskeyAIBot の Copilot レビュー | 対象 PR はすべて merged、オープン PR / Issue ともに 0 件 |

---

## 未確認事項・制約

- **Actions のジョブログ本文（annotation の原文）は取得していません。** 利用可能なコネクタに
  Actions 系の読み取り API が無いためです。
- **Dependabot / Code scanning のアラート現況は未確認**（同じく読み取り API 無し）。
  直近 14 日の Gmail にアラートメールは 1 件も届いていません。
- ローカル develop は `7e7299a` まで確認済みですが、fetch を行っていないため
  リモートの最新とは一致しない可能性があります（git の書き込み系コマンドを使わない方針のため）。

## 参考リンク

- 前回のトリアージ: `_work_in_progress/2026-08-31_github-triage.md`
- lockfile 破損の調査: `_work_in_progress/2026-08-28_progress_aihints-resync-lockfile-fix.md`
- 本日の上流側ログ: `JsonCharacterDB-Framework/_work_in_progress/2026-09-02_github-triage.md`
