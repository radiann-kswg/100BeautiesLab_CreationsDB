# 2026-08-29 GitHub 未解決トリアージ（調査・提案のみ / コード変更なし）

## 実施範囲

- Gmail の GitHub 通知（直近14日）を走査
- GitHub コネクタ（読み取り専用）で Issue / PR の実状を確認（**省略なし・全件実測**）
- ローカル（Dドライブ main 環境）の読み取り専用 git で原因を切り分け

書き込みは本ログのみ。コード・ワークフロー・設定・git 状態は一切変更していません。

---

## 結論サマリ

| # | 項目 | 優先度 | 状態 |
| --- | --- | --- | --- |
| 1 | `jsdom@30` と CI の Node 20 固定が不整合（AIHints 再同期 CI の次回失敗リスク） | **高** | 未対応 |
| 2 | `.github/dependabot.yml` が要求する `github-actions` ラベルが存在しない | 低 | 未対応 |
| 3 | PR #26（glob 13.0.6）の内容が重複キー解消時に実質差し戻されている | 低 | 要判断 |
| 4 | AIHints 再同期 CI の `npm ci` 失敗（package-lock.json 破損） | — | **対応済み**（8/28） |
| 5 | Issue #13（数秘解説 / スキンシップ反応フィールド追加依頼） | 中 | 未対応（仕様待ち） |

---

## 1.【高】jsdom@30 が要求する Node と、CI が固定している Node 20 が食い違っている

### 事実

- `package.json` devDependencies: `jsdom: ^30.0.1`（PR #25 で 26.1.0 → 30.0.1）
- `package-lock.json`（`origin/addon-ai-tag` 現行）の `node_modules/jsdom.engines`:
  `^22.22.2 || ^24.15.0 || >=26.0.0`
- 一方、リポジトリの全ワークフローが Node 20 固定:
  - `.github/workflows/aihints-structural-resync.yml:51` → `node-version: "20"`
  - `cf-api-sync.yml:85,131` / `gcal-sync.yml:45` / `jekyll-gh-pages.yml:34` も同様
- `package.json` の `engines` は `>=18.0.0` のまま（jsdom の要求と矛盾）
- jsdom は 5 本のテストで実際に使われている:
  `tests/lib.viewer-locator.test.js` / `tests/pages.characters.ui-output.test.js` /
  `tests/pages.characters.url-params.test.js` / `tests/pages.characters.value-format.test.js` /
  `tests/section-renders.relation.test.js`

### なぜ 8/28 の調査で見えなかったか

`_work_in_progress/2026-08-28_progress_aihints-resync-lockfile-fix.md` の検証は
**ローカル（Node v24.16.0）で実施**されており、そこでは jsdom 30 の要求を満たすため `npm test` が通ります。
CI ランナーだけ Node 20 のため、この不整合はローカル検証をすり抜けます。

同レポートの「未完了タスク: 次回の DB 変更 push 時に本ワークフローが成功することの確認」に対する、
**具体的な失敗予測**がこれです。lockfile 修正で `npm ci` は通るようになりましたが、
`テスト`ステップ（`npm test`）で落ちる可能性が残っています。

### 提案（最小差分）

上流の JsonCharacterDB-Framework が 8/26 に同じ問題を `a53970b` で解消済みなので、それを踏襲するのが最短:

1. `package.json` の `engines.node` を `>=18.0.0` → `>=22.19.0`
2. 各ワークフローの `node-version: "20"` → `"22"`
   （最低限 `aihints-structural-resync.yml` の 1 箇所。運用を揃えるなら 4 ファイル 5 箇所すべて）

> 対案（jsdom を 26 系に戻す）は、PR #25 を差し戻すことになり、上流フレームワークとも乖離するため非推奨。

### 検証方法（実施は人の判断で）

- ローカルで `nvm use 20` 相当の環境を作り `npm test` が落ちることを確認
- あるいは Node 22 へ上げた後、`data/Works_*/DataBases/db_*.json` を触る通常の push で
  AIHints 再同期ワークフローが緑になることを確認

---

## 2.【低】dependabot.yml が要求する `github-actions` ラベルが存在しない

### 事実

- PR #27（actions-all グループ更新）で dependabot が警告:
  「The following labels could not be found: `github-actions`」
- `.github/dependabot.yml` の github-actions エコシステム設定に `labels: [dependencies, github-actions]`
- コネクタで実測: `dependencies` ラベルは存在するが、`github-actions` ラベルは **存在しない**

### 提案（どちらか一方）

- **A（最小差分・推奨）**: `.github/dependabot.yml` の `github-actions` ラベル行を削除する。
  `dependencies` と `commit-message.prefix: 'chore(actions)'` で既に判別可能で、実害がない。
- **B**: リポジトリ設定でラベル `github-actions` を作成する（Settings → Labels）。
  Actions 更新だけを絞り込みたい運用意図があるならこちら。

いずれも PR の中身に影響はなく、毎回出る警告コメントが消えるだけです。

---

## 3.【低】PR #26（glob 13.0.6）が重複キー解消時に実質差し戻されている

### 事実

`d7d6dda` "fix: resolve merge-conflict duplicates in package.json devDependencies" の差分:

```diff
   "devDependencies": {
-    "glob": "^13.0.6",
-    "jsdom": "^26.1.0",
     "glob": "^11.1.0",
     "jsdom": "^30.0.1",
```

- JSON の重複キーは後勝ちのため、**実挙動は修正前後で変わっていません**（glob 11 / jsdom 30）。
- ただし結果として、マージ済み PR #26（glob 11.1.0 → 13.0.6）の意図だけが消えています。
- 上流の JsonCharacterDB-Framework は同じ衝突を逆に解決しており、`glob: ^13.0.6` を採用。
  → 上流／本リポジトリで glob のメジャーが乖離している状態。

### 提案

- 意図的に glob 11 を維持しているなら **対応不要**。ただし次回の Dependabot 定期実行（毎週月曜 09:00 JST）で
  glob 13 の PR が再度立つため、`ignore` を入れるか、都度クローズする運用になります。
- 上流と揃えたいなら `glob: ^13.0.6` へ上げ、`npm install --package-lock-only` で lockfile 再生成。
  glob 13 の `engines` は `20 || >=22` なので、項目1の Node 22 化と同時に行うのが安全。

---

## 4. AIHints 再同期 CI の `npm ci` 失敗 → 対応不要（解決済み）

- 失敗通知: 8/28 05:50（run 1）と 05:58（Attempt #2）、branch `addon-ai-tag`、commit `2ac050a`
- 原因・修正は `_work_in_progress/2026-08-28_progress_aihints-resync-lockfile-fix.md` に記録済み
  （マージ衝突で `package-lock.json` が壊れた JSON のまま commit されていた）
- **本日の実測による裏取り**（`origin/addon-ai-tag` 現行 tip = `e759e64`）:
  - `package-lock.json` は `JSON.parse` 成功、`lockfileVersion: 3`
  - lockfile と package.json が整合: glob 11.1.0 / jsdom 30.0.1 / playwright 1.62.1 / vitest 4.1.11
  - `brace-expansion` は 5.0.9（Dependabot alert 22 の修正版）
- → `npm ci` 側の問題は解消済み。ただし項目1（Node 20 と jsdom 30）が残っているため、
  「次回 push で緑になる」とはまだ言い切れません。

---

## 5.【中】Issue #13: キャラ別「数秘解説」「スキンシップ反応」フィールドの追加依頼

- 状態: **OPEN**（作成 2026-07-21、以後更新なし・約39日経過）
- 依頼元: NumberTales-MisskeyAIBot 側（F-06 Stage B/C・F-15 Phase 3 連携）
- Bot 側はフィールド未存在でもフォールバックする実装のため、**機能停止はしていません**（緊急度は低い）
- 判断が必要な点: 命名・配置（`ConversationPattern` 配下 or 独立フィールド）・`$Def_*` 型の切り出し方・
  RoleplayPrompts に含めるか。いずれも DB 側の設計判断待ちで止まっています。
- 提案: 設計方針だけでも Issue にコメントして、Bot 側の待ち状態を解消する（実装は後追いで可）。

---

## 対応不要と判断した項目（根拠つき）

| 項目 | 判断根拠（確認日時: 2026-08-29） |
| --- | --- |
| PR #24 / #25 / #26 / #27（Dependabot） | コネクタ実測でオープン PR **0 件**。`git log origin/develop` で `29be42c` / `c37f294` / `70b304f` のマージコミットを確認 |
| APHRNTs_100 PR #43（Copilot が Changes recommended） | コネクタ実測で `state: closed` / `merged: true`（2026-08-28T08:10:17Z マージ済み） |
| NumberTales-MisskeyAIBot PR #38 / #37 | `#38` はコネクタ実測で merged（2026-08-28T07:31:14Z）。同リポジトリのオープン PR / Issue は 0 件 |

---

## 参考: 他リポジトリの状況（本リポジトリの判断材料）

- **JsonCharacterDB-Framework**: Pages デプロイ失敗 4 件（8/25〜8/26）は `a53970b` で解消済み。
  この commit が項目1の解決テンプレートになります。詳細は同リポジトリの同名ログ参照。
- **RadianNs_SecondaryWorksDB**: Pages デプロイ失敗 1 件（8/25）。以後 5 件の push で失敗通知なし → 沈静化。

## 未確認事項

- GitHub Actions のジョブログ本文（annotation の原文）は、利用可能なコネクタツールに
  Actions 系の読み取り API が無いため取得していません。原因特定はワークフロー定義・
  依存関係メタデータ・ローカル git の実測から行っています。
