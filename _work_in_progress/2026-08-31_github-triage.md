# 2026-08-31 GitHub 未解決トリアージ（調査・提案のみ / コード変更なし）

## 実施範囲

- Gmail の GitHub 通知（直近14日 = 2026-08-17〜08-31）を走査（22 スレッド）
- GitHub コネクタ（`mcp__github__*` 読み取り系のみ）で Issue / PR / コミット / ラベルの実状を確認
  → **省略なし・全件実測**（`get_me` で認証確認済み、401/403 なし）
- ローカル（D ドライブ main 環境）の読み取り専用 git / node で原因を切り分け

書き込みは本ログのみ。コード・ワークフロー・設定・git 状態は一切変更していません。

---

## 結論サマリ

| #   | 項目                                                                | 優先度 | 状態                        |
| --- | ------------------------------------------------------------------- | ------ | --------------------------- |
| 1   | jsdom@30 が Node 20 を要求外にしており CI（Node 20 固定）と不整合    | **高** | **未対応**（8/29 から継続） |
| 2   | `github-actions` ラベルが存在せず Dependabot が毎回警告             | 低     | **未対応**（実測で再確認）  |
| 3   | PR #26（glob 13.0.6）の意図が重複キー解消で実質差し戻し             | 低     | 要判断（8/29 から変化なし） |
| 4   | Issue #28 Images 拡充（corefolder 完成絵 0 枚が 65%）               | 中     | 未対応（新規・8/29 起票）   |
| 5   | Issue #13 数秘解説 / スキンシップ反応フィールド追加                 | 中     | 未対応（仕様待ち・41日経過）|
| 6   | AIHints 再同期 CI の `npm ci` 失敗（lockfile 破損）                 | —      | 対応済み（8/28）            |

**本日の新規失敗通知はゼロです。** 8/29 以降に届いた GitHub 通知 4 件はすべて
マージ済み PR に対する Copilot レビューコメントで、実状確認の結果すべて解決済みでした（後述）。

---

## 1.【高】jsdom@30 と CI の Node 20 固定が不整合（**8/29 から未変化**）

### 本日の実測（`origin/addon-ai-tag` tip = `7967612`, 2026-08-30T02:24:53Z）

`package-lock.json` から engines を読み出した実測値:

| パッケージ | 版      | engines                                | Node 20 で満たすか |
| ---------- | ------- | -------------------------------------- | ------------------ |
| jsdom      | 30.0.1  | `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` | **✗ 不適合**       |
| vite       | 8.2.2   | `^20.19.0 \|\| >=22.12.0`              | △（20.19+ なら可） |
| vitest     | 4.1.11  | `^20.0.0 \|\| ^22.0.0 \|\| >=24.0.0`   | ○                  |
| glob       | 11.1.0  | `20 \|\| >=22`                         | ○                  |
| playwright | 1.62.1  | `>=20`                                 | ○                  |

- `package.json` の `engines.node` は依然 `>=18.0.0`（jsdom の要求と矛盾）
- ワークフローの Node 固定も未変更（実測 5 箇所）:
  `aihints-structural-resync.yml` / `cf-api-sync.yml`（2 箇所） / `gcal-sync.yml` / `jekyll-gh-pages.yml`
  すべて `node-version: "20"`
- ワーキングツリーと `origin/addon-ai-tag` の `package.json` / `package-lock.json` は差分ゼロ
  （= ローカルに未 push の修正も無い）

### 失敗の出方（予測の精緻化）

`npm ci` は既定で engines を強制しない（`engine-strict=false`）ため、
**「依存関係のインストール」は EBADENGINE 警告を出しつつ成功し、`テスト`ステップで落ちる**と見ています。
jsdom を使うのは以下 5 本:

```
tests/lib.viewer-locator.test.js
tests/pages.characters.ui-output.test.js
tests/pages.characters.url-params.test.js
tests/pages.characters.value-format.test.js
tests/section-renders.relation.test.js
```

### なぜまだ表面化していないか

`aihints-structural-resync.yml` のトリガーは `data/Works_*/DataBases/db_*.json` のパス限定です。
8/28 の lockfile 修正以降 `addon-ai-tag` に入った push（`4c46003` ロールプレイデータ更新 /
`a50c52c` VRM モデル追加 / `7967612` develop マージ）は、実測で **db\_\*.json を 1 件も含みません**
（`7967612` の変更は roleplay-prompt-49/77.md と VRM/PNG の 6 ファイルのみ）。
そのためワークフローが走っておらず、不具合が潜伏したままです。**次の DB 変更 push で顕在化します。**

### 提案（最小差分・8/29 から変更なし）

上流 JsonCharacterDB-Framework が 8/26 に `a53970b`
「Node.js のバージョン要件引き上げ、GitHub Pages 配信をオプトイン制に変更」で同じ問題を解消済みです。
これを踏襲するのが最短:

1. `package.json` の `engines.node` を `>=18.0.0` → `>=22.19.0`
2. `.github/workflows/aihints-structural-resync.yml` の `node-version: "20"` → `"22"`
   （運用を揃えるなら 4 ファイル 5 箇所すべて）

> 対案（jsdom を 26 系へ戻す）は PR #25 の差し戻しになり、上流とも乖離するため非推奨。
> 参考: 同じ上流を持つ RadianNs_SecondaryWorksDB は jsdom 26.1.0（`engines: >=18`）のままなので
> Node 20 でも問題が出ておらず、実際に 8/25 以降 Pages 失敗通知は届いていません。

### 検証方法（実施は人の判断で）

- Node 20 環境で `npm test` が落ちることを確認（ローカルは Node v24.16.0 のため素通りします）
- あるいは Node 22 化した後、通常の DB 変更 push で AIHints 再同期が緑になることを確認

---

## 2.【低】`github-actions` ラベルが存在しない（**本日コネクタで再確認**）

- `mcp__github__get_label`（読み取り）で実測 →
  `label 'github-actions' not found in radiann-kswg/100BeautiesLab_CreationsDB`（2026-08-31 確認）
- `.github/dependabot.yml` の `package-ecosystem: github-actions` セクションは
  `labels: [- github-actions]` を要求したまま
- 症状: PR #27 に dependabot が
  「The following labels could not be found: `github-actions`」と毎回コメントする

### 提案（どちらか一方 / 8/29 から変更なし）

- **A（最小差分・推奨）**: `.github/dependabot.yml` から `github-actions` ラベル行を削除。
  `dependencies` ラベルと `commit-message.prefix: 'chore(actions)'` で判別可能。
- **B**: Settings → Labels でラベル `github-actions` を作成。
  Actions 更新だけを絞り込む運用意図があるならこちら。

Dependabot の定期実行は毎週月曜 09:00 JST。**本日 8/31 は月曜**のため、
未対応なら本日中に同じ警告が再発する見込みです。

---

## 3.【低】PR #26（glob 13.0.6）の意図が差し戻されたまま

8/29 のログ（`2026-08-29_github-triage.md` 項目3）から状況変化なし。本日の実測:

- `package.json` devDependencies: `glob: ^11.1.0` / lockfile も 11.1.0
- 上流 JsonCharacterDB-Framework は同じ衝突を逆に解決し `glob: ^13.0.6` を採用（`7fc7279`）
- → 上流と本リポジトリで glob のメジャーが乖離

意図的に 11 系を維持しているなら対応不要ですが、Dependabot の週次実行で
glob 13 の PR が再度立つため、`ignore` 設定を入れるか都度クローズする運用になります。
上流に揃えるなら、項目1の Node 22 化と同時に行うのが安全です（glob 13 の engines は `20 || >=22`）。

---

## 4.【中】Issue #28: Images 収録拡充と characters タグ整備

- 状態: **OPEN**（作成 2026-08-29T05:36、コメント 2、最終更新 08-29T05:56）
- 依頼元: 100BeautiesLab_GeneratorsAI 側の実測調査
- 中身: 学習許可済み NT 112 キャラのうち **corefolder 完成イラスト 0 枚が 73 件（65%）**。
  参照が設定画・絵文字スタンプ（~450px）へ偏り、作風の正解を提示できていない。
- 関連: 100BeautiesLab_CreationsAI [Issue #1](https://github.com/radiann-kswg/100BeautiesLab_CreationsAI/issues/1)
  （AIHints 収録範囲を SemiPrimary / SelfSecondary へ拡大、原寸画像の併録）も **OPEN**

### 提案（DB 側で着手しやすい順）

1. **タグ棚卸しが最小コストで効く**: 既存の合同絵・イベント絵で `images` に未紐付けのものを拾う。
   新規制作ゼロで参照可能枚数が増えるため、まずここから。
2. corefolder 完成絵 0 枚の 73 キャラを優先度リスト化（本リポジトリ内で機械的に抽出可能）。
3. catalog の命名規則 `chr-dsgn_catalog<バッジ>.png` と配置は現状維持（GeneratorsAI 側が参照解禁済み）。

> 本項目は Issue #28 に既にコメントが 2 件付いています。**新しい調査は不要**で、
> 上記 1 の棚卸しに着手するかどうかの判断だけが残っている状態です。

---

## 5.【中】Issue #13: 数秘解説 / スキンシップ反応フィールドの追加依頼

- 状態: **OPEN**（作成 2026-07-21、以後更新なし・**41 日経過**）
- 依頼元: NumberTales-MisskeyAIBot（F-06 Stage B/C・F-15 Phase 3 連携）
- Bot 側はフィールド未存在でもフォールバックするため機能停止はなし（緊急度は低い）
- 止まっている判断: 命名・配置（`ConversationPattern` 配下 or 独立フィールド）／`$Def_*` 型の切り出し方／
  RoleplayPrompts に含めるか
- 提案（8/29 から変更なし）: 設計方針だけでも Issue にコメントし、Bot 側の待ち状態を解消する

---

## 6. AIHints 再同期 CI の `npm ci` 失敗 → 対応不要（解決済み・裏取り再実施）

- 失敗通知: 8/28 05:50（run 1）と 05:58（Attempt #2）、branch `addon-ai-tag`、commit `2ac050a`
- 原因・修正の記録: `_work_in_progress/2026-08-28_progress_aihints-resync-lockfile-fix.md`
- **本日の実測**（`origin/addon-ai-tag` = `7967612`）:
  - `package-lock.json` は `JSON.parse` 成功 / `lockfileVersion: 3`
  - lockfile と package.json が整合（glob 11.1.0 / jsdom 30.0.1 / playwright 1.62.1 / vitest 4.1.11）
- → `npm ci` 側は解消済み。ただし項目1が残るため「次回 push で緑」とはまだ言えません。

---

## 対応不要と判断した項目（根拠つき / 確認日時: 2026-08-31）

| 項目                                              | 判断根拠（GitHub コネクタ読み取りによる実測）                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------- |
| APHRNTs_100 PR #44（Copilot: Changes recommended） | `state: closed` / `merged: true`、`merged_at: 2026-08-30T07:29:18Z`               |
| APHRNTs_100 PR #43（Copilot: Changes recommended） | オープン PR 0 件（`list_pull_requests state=open` → `[]`）。8/29 ログで merged 確認済 |
| GeneratorsAI PR #19（Copilot: Changes recommended）| `state: closed` / `merged: true`、`merged_at: 2026-08-30T00:46:30Z`               |
| GeneratorsAI PR #18（Copilot: Changes recommended）| `state: closed` / `merged: true`、`merged_at: 2026-08-29T07:30:08Z`               |
| MisskeyAIBot PR #40 / #38 / #37                   | オープン PR 0 件・オープン Issue 0 件                                             |
| Dependabot PR #24 / #25 / #26 / #27               | オープン PR 0 件（すべてマージ済み）                                              |
| JsonCharacterDB-Framework Pages 失敗 5 件（8/25〜8/26）| `a53970b`（8/26 01:12）で解消。オープン Issue / PR ともに 0 件               |
| RadianNs_SecondaryWorksDB Pages 失敗 1 件（8/25）  | 以後 7 件の push（8/26〜8/30）で失敗通知なし → 沈静化。jsdom 26.1.0（`engines: >=18`）のため Node 20 でも不整合なし |

> Copilot の「Changes recommended」は 4 件すべて **マージ後**に届いたレビューコメントで、
> 未解決の PR は 1 件もありません。指摘内容を後追いで直すかは別途の判断です。

---

## 参考: 他リポジトリで見つけた低優先の気付き（本リポジトリの提案ログとしては行動不要）

- **JsonCharacterDB-Framework**: `a53970b` で `pages.yml` の build ジョブに
  `if: vars.ENABLE_PAGES == 'true' || github.event_name == 'workflow_dispatch'` が入りました。
  フレームワーク配布用のオプトイン設計として妥当ですが、**フレームワーク自身のリポジトリで
  リポジトリ変数 `ENABLE_PAGES` が設定されていないと、自分の Pages も静かに skip されます**。
  意図どおりかは Settings → Variables の確認が必要です（コネクタに変数読み取り API が無く未確認）。
- **RadianNs_SecondaryWorksDB**: 上流の `a53970b`（Node 22 化・オプトイン化）を未取り込み。
  ただし jsdom 26 系のため実害はなく、次回の upstream sync のタイミングで拾えば十分です。

---

## 未確認事項・制約

- **GitHub Actions のジョブログ本文（annotation の原文）は取得していません。**
  利用可能なコネクタツールに Actions 系の読み取り API が無いためで、原因特定は
  ワークフロー定義・依存関係メタデータ（lockfile の engines）・ローカル git の実測から行っています。
- **Dependabot セキュリティアラートの現況も未確認**（同じくコネクタに読み取り API が無いため）。
  8/28 に対応した alert 22（`brace-expansion` DoS / high）は `fixed` 確認済みですが、
  それ以降に新規アラートが立っていないかはブラウザでの確認が必要です。
- 本日の Gmail 走査範囲は `from:notifications@github.com newer_than:14d`（22 スレッド）です。
  Dependabot / Code scanning のアラートメールは、この期間内には 1 件も届いていませんでした。

## 参考リンク

- 前回のトリアージ: `_work_in_progress/2026-08-29_github-triage.md`
- lockfile 破損の調査: `_work_in_progress/2026-08-28_progress_aihints-resync-lockfile-fix.md`
- 最初の CI 失敗調査: `_work_in_progress/2026-08-20_progress_aihints-resync-ci-fix.md`
