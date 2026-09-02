# GitHub 未解決問題トリアージ（2026-08-22）

自動実行（毎朝のGitHub未解決問題トリアージ）による生成物。**実コードの修正・commit/push は行っていません**（読み取り専用調査）。

調査手段:

- Gmail 通知（`from:notifications@github.com newer_than:14d` ＋ Dependabot / security alert を `newer_than:30d` で二重走査）
- GitHub 読み取り専用 API（`get_me` / `search_issues` / `search_pull_requests` / `list_issues` / `list_pull_requests` / `pull_request_read` / `list_commits` / `list_branches` / `get_file_contents`）
- ローカル読み取り専用参照（`git log` / `git show` / `git status --porcelain` / `npm audit`。いずれもリポジトリを変更しない）

GitHubコネクタは**正常に利用できました**（`get_me` → `radiann-kswg` で疎通確認済み。認証エラー・アクセス拒否なし）。
ただし **Actions の実行履歴・ジョブログ、および Dependabot / Code scanning のアラート一覧を読むツールはコネクタに存在しません**。
CI 判定はメール通知＋コミット実測によるもので、**Actions のジョブログ本文は未確認**です。

保存先は本リポジトリの規約どおり `_work_in_progress/`（`.wip/` は使わない）。
出力は **Dドライブの main 環境のみ**。sub 環境（Cドライブ側）には一切書き込んでいません。

> 前回ログ: `2026-08-15_github-triage.md`。
> **本ログの主眼は「CI は User の手で決着した」ことの確認と、新規発生した MisskeyAIBot PR #37 の Copilot 指摘 4 件です。**

---

## 1. 🟢 AIHints 構造的再同期 workflow — **決着**（前回からの継続案件）

### 結論

前回ログ時点では「`cb68ffe` で修正済み・CI 上では未実証」でした。その後 **User が 2026-08-20 に真因を別途特定し直して修正**しており、
以降 **失敗通知はゼロ**です。本件はクローズ扱いとします。

### 根拠（実測）

`9efe04c`「CI修正(AIHints再同期の失敗解消)」（2026-08-20 08:11 UTC）と同梱の進捗ログ
`_work_in_progress/2026-08-20_progress_aihints-resync-ci-fix.md` が、失敗 run を番号で名指ししています（一次資料）。

真因は 2 段構え:

| # | 原因 | 修正 |
| --- | --- | --- |
| 1 | `db_Primary.json` の `NumerospecStats` 1 箇所が prettier 未整形のまま commit されており、workflow の整形ステップが毎回書き換え → **no-op でも常に `changed=true`** になり、本来スキップされるテスト／PR 作成が毎回起動していた | 該当 3 行を prettier 整形（値の変更なし） |
| 2 | `tests/graph.edge-route.test.js` の perf 閾値 40ms が GitHub Actions 共有ランナーで成立しない（CI 実測 41.1〜66.3ms / ローカルは数 ms） | 閾値を `process.env.CI ? 200 : 40` に分離 |

User のログは、過去の失敗 run（`31453020469` / `31458041928` / `31461715846` / `31654488491` / `31761318136` / `32322154786`）が
**すべて同じ perf テスト**由来だったと記録しています。これは前回ログ §1「未解明の残り（08-08〜08-11 の別原因）」を
**そのまま解消**するもので、当該項目は追跡終了とします。

### 失敗の終息（メール実測）

| 日時(UTC) | SHA | 結果 |
| --- | --- | --- |
| 08-20 01:46 | `2e97494` | ❌ 失敗（**最後の失敗通知**） |
| 08-20 08:11 | `9efe04c` | 修正コミット（`develop` → `addon-ai-tag` へマージ） |
| 08-21 | `5253284` / `78320f5` / `37c353d` | data/ 配下を含む push（＝ path フィルタに合致し workflow は起動しているはず）。**失敗通知なし** |

`list_branches` で `auto/aihints-structural-resync` がリモートに存在せず、`list_pull_requests(open)` も 0 件のため、
08-21 の run は **`changed=false` の no-op 成功**で終わったと判断できます（＝原因 1 の修正が効いている決定的傍証）。

### 残る小さな宿題（🔵 低）

User のログの「未完了タスク」に、workflow の annotation にある **Node.js 20 の deprecation**
（`actions/checkout@v4` / `actions/setup-node@v4`）が未対応として残っています。

**提案（未適用）**: `.github/workflows/aihints-structural-resync.yml` の 2 アクションを `@v5` に上げるだけ。
他の workflow（`cf-api-sync.yml` / `codeql.yml` / `gcal-sync.yml` / `jekyll-gh-pages.yml` / `notify-ai-dataset.yml`）にも
同じ pin があれば一度にまとめると手戻りが少ないです。急ぎではありません。

---

## 2. 🟡 Issue #13「キャラ別『数秘解説』『スキンシップ反応』フィールドの追加」 — **実装は済み・Issue が開いたまま**

- 状態: 🟡 **OPEN 継続**（`list_issues(OPEN)` で実測。**radiann-kswg アカウント全体で OPEN な Issue はこの 1 件のみ**）
- 起票: 2026-07-21 / `updated_at` = `2026-07-21T02:09:02Z` のまま＝**Issue 上はノーアクション**。経過 **32日**
- URL: https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/13

### 前回からの変化（重要）

前回ログは「命名・配置の確定すらされていない」と書きましたが、**その後 2026-08-20 の `e984414`
「DB機能拡張(Bot向け)」で実装が入っています**（コミットメッセージに「Issue#13 対応」と明記）。

`git show e984414 --stat` の実測:

| ファイル | 内容 |
| --- | --- |
| `data/Works_NumberTales/DataBases/db_type.json` | `MotifCommentaries` (`$Def_MotifCommentary[]\|#Null` / 「数秘についての語り」) を追加 |
| `data/Works_NumberTales/DataBases/db_meta.json` / `data/db_meta.json` | 同上の meta 定義（+67 / +105 行） |
| `lib/basic-renders/keyedDialogue.js` | 新規（+203 行）。キー付き台詞の共通レンダラ |
| `tests/keyedDialogue.render.test.js` / `tests/pages.characters.ui-output.test.js` | 回帰テスト（+178 / +39 行） |
| `tools/build-roleplay-prompts.mjs` / `tools/roleplay/render.mjs` | ロールプレイプロンプトへの出力経路 |
| `docs/*` 3 本 | 仕様の文書化 |

**Issue 本文の提案名（`NumerologyExamples` / `SkinshipReactions`）とは名前が異なります。**
`git grep` でリポジトリ全体を走査しても、この 2 名は過去のトリアージログ以外に出現しません。

### 残タスク（`2026-07-22_progress_issue13-numerology-skinship.md` の「未完了タスク」より）

1. 実データの入力（`value_JP` / `about_JP`。**User 手動・監修前提**）→ 入力後にローカル実機目視
2. **Issue #13 へ確定した命名・形式をコメント**（Bot 側がフィールド名を合わせられるように）
3. （別件・大物）Phase 4 の `*specAbout` / `*specName` 集約 = 台帳 T-34

### 提案（未適用）

**残タスク 2 が最優先です。** DB 側は `MotifCommentaries` で確定しているのに、Bot 側は Issue 本文の
`NumerologyExamples` を見て実装する可能性があります。**名前がずれたままだと Bot のフォールバックが永久に解除されません。**

- Issue #13 に「DB 側は `MotifCommentaries`（＋スキンシップ側の確定名）を採用した」と 1 コメント入れる
- 実データが未入力でも、命名が伝われば Bot 側は参照コードを先に書ける
- コメント後は Issue をクローズしてよい（残りは DB 側の入力作業であり、Bot への依頼は完了しているため）

> 本タスクは**読み取り専用**のため、Issue へのコメント投稿は行っていません。User の手で実施してください。

---

## 3. 🔴 NumberTales-MisskeyAIBot PR #37 の Copilot 指摘 4 件 — **新規・未対応**

PR #37「chore: creations-db 追従・F-16 計算問題チャレンジ・deploy 手動実行対応を master へ反映」は
**2026-08-19 23:16 UTC にマージ**され、Copilot レビューは **23:18 UTC**（＝ マージの 2 分後）に着弾しました。
GeneratorsAI PR #17 と**まったく同じ「レビュー前マージ」パターン**です。

`pull_request_read(get_review_comments)` で実測: **未解決スレッド 4 件**（`is_resolved: false` / `is_outdated: false`）。
`list_commits` の実測では master 先端は `c7b1a5d`（08-19 のマージコミット）のままで、**以降コミットなし＝1 件も反映されていません**。

詳細と修正方針は、規約どおり MisskeyAIBot 側の提案ログに記載しました:
`D:\VisualStudio Code Userfile\NumberTales-MisskeyAIBot\_tasks\github-triage\2026-08-22_github-triage.md`

サマリだけ再掲します（**優先度順**）:

| # | 場所 | 内容 | 深刻度 |
| --- | --- | --- | --- |
| 1 | `src/bot/handlers/mention.ts:740` | 公開出題の `answeredUserIds` が read→append→write でロストアップデート。**1ユーザー1回制限の破れ／親密度の重複加算** | 🔴 高 |
| 2 | `src/bot/handlers/mention.ts:1177` | 連続正解時の返信に次問題が含まれ、`generateF06Framing()` に渡ると **LLM が答えを漏らす** | 🔴 高 |
| 3 | `src/bot/scheduler/index.ts:280` | 定期出題が `isOnCooldown()` で抑止され、**8/12/16/20時の仕様を満たさない**（月曜7時の直後は 8時がほぼ確実にスキップ） | 🟡 中 |
| 4 | `src/bot/classifier/intent.ts:117` | `CALC_QUIZ_PATTERNS` のコメント行に制御文字が混入 | 🔵 低 |

---

## 4. 🟡 Num 64（ゼフィア）の `common.palette_priority` が旧割り当てのまま — **継続未対応（7日）**

`origin/addon-ai-tag` の `db_Primary.json` を実測（`git show` → JSON パース）:

```
AIHints.common.palette_priority = { primary: #B8507C, secondary: #6AA6D7, accent: #F26383 }
ColorPalette                    = Primary #B8507C / Secondary #F26383 / Accent #6AA6D7, #387EB6 / Sub #E55951, #EBDBDA
```

**secondary と accent が完全に入れ替わったまま**です。前回ログ（08-15）から変化なし。

`--apply-colorpalette` は既存の確定値を保護するため `palette-unchanged` でスキップされ、
`--resync-structural` でも直りません（palette は構造的再同期の対象外）。放置すると **AIHints が旧配色を語り続けます**。

### 提案（未適用・前回から変更なし）

`--force-palette` を Num 64 に限定して当てるか、「64番機は配色改訂中なので AIHints の配色は保留」と
`_meta` にメモを残すか、どちらかを明示的に決める。判断は User に委ねます。

---

## 5. 🟡 GeneratorsAI PR #17 の Copilot 指摘 — **継続未対応（11日）**

- `list_commits` の実測: リモート先端は **`5a3fd54`（08-11 08:09 のマージコミット）のまま**。11 日間 push なし。
- ローカル（Cドライブ）には `8522add`(08-14) / `415e877`(08-15) / `e189c7b`(08-21) のサブモジュール追従ログが**未 push**で溜まっています。
- 実害のある指摘 1 の現況をローカルで実測:

```
C:\Visual Studio Code UserFile\100BeautiesLab_GeneratorsAI\src\tools\verify_appearance_detail.py
  subprocess.run    … 3 箇所（447 / 1342 / 1355 行）
  FileNotFoundError … 0 箇所
```

`node` が PATH に無い環境では、依然として素の `FileNotFoundError` スタックトレースで落ちます。

### 提案（未適用）

`node` 呼び出しを `try/except FileNotFoundError` で包み、
`SystemExit("Node.js が見つかりません。PATH を通してください")` で終える小さな修正。残り 4 件は文書・コメントの整合で、次に同ファイルを触るときで構いません。

> **提案ログは GeneratorsAI 側には保存していません。** 同リポジトリのローカルは C ドライブのみで、
> 出力先ルール（D ドライブ main 環境へ集約）に該当する環境が D 側に無いためです。

---

## 6. ✅ 解決済み（前回からのクローズ分）

| 項目 | 前回の状態 | 今回の実測 |
| --- | --- | --- |
| OPEN PR: APHRNTs_100 #42（postcss） | 🟡 未マージ | ✅ `list_pull_requests(open)` = 0 件 → クローズ済み |
| OPEN PR: NumberTales-MisskeyAIBot #36（postcss） | 🟡 未マージ | ✅ `740de25` で 08-15 04:48 UTC にマージ済み |
| 08-08〜08-11 の CI 失敗（原因不明・ドーマント） | 🔵 未解明 | ✅ §1 のとおり perf テストが真因と判明・修正済み |

**`search_pull_requests(is:open user:radiann-kswg)` = 0 件。アカウント全体で OPEN な PR はありません。**

---

## 7. 🔵 npm の高深刻度脆弱性 2 件（devDependencies のみ・低優先）

ローカル `develop` の lockfile に対し `npm audit` を実測（**インストールも修正も行っていません**）:

| パッケージ | 深刻度 | 範囲 |
| --- | --- | --- |
| `brace-expansion` | high | 4.0.0 - 5.0.8 |
| `nanoid` | high | <3.3.18 |

- 集計: `{ info: 0, low: 0, moderate: 0, high: 2, critical: 0, total: 2 }`。**前回（08-15）から増減なし。**
- いずれも devDependencies 経由。公開成果物には載りません。
- 本リポジトリの OPEN な Dependabot PR は **0 件**。
- 提案: 急ぎません。次に依存を触るときに `npm audit fix` を当てれば十分。

> リモートに `dependabot/npm_and_yarn/npm_and_yarn-3f9ee708be` / `alert-autofix-5` / `-6` / `-7` の
> 用済みブランチが残っています（対応 PR はマージ済み）。掃除は任意・実害なし。

---

## 8. ✅ 他リポジトリ — 通知なし

`newer_than:14d` の GitHub 通知メール 18 件は **すべて CreationsDB / MisskeyAIBot / GeneratorsAI / NTsWallpaperEngine**
のもので、以下は本日**一切通知が来ていません**。OPEN Issue / PR とも 0 件です。

| リポジトリ | 判定 |
| --- | --- |
| 100BeautiesLab_CreationsAI | ✅ 通知なし |
| 7400SeriesCollection | ✅ 通知なし |
| WebSites 配下（ShouArRider-HTML_CSS / SeventyEight-HTML_CSS / NumberTales-HTML_CSS / RadianNs_WebSite） | ✅ 通知なし |
| CheatSheet-of_Numbers / CheatSheet-of_HttpResponceDataCode | ⚪ 保留（更新頻度が低く再トリガーされていない可能性） |
| NTsWallpaperEngine | ✅ PR #1 はマージ済み・OPEN 0 件 |

> ⚠️ 「保留」は、Actions のログも実行履歴もコネクタから読めないため、**「通知が来ていない」以上のことが言えない**という意味です。

---

## 9. ローカル環境の状態（参考・書き込みなし）

- `D:\VisualStudio Code Userfile\100BeautiesLab_CreationsDB`（**main 環境**）: ブランチ `develop`。
  作業ツリーに **User の未コミット変更 3 件**あり（`data/Works_NumberTales/DataBases/db_Secondary.json` /
  `db_SelfSecondary.json` / `data/Works_NumberTales/lot.md`）。**一切触れていません。**
- `git fetch` / `pull` / `stash` / `add` / `commit` / `checkout` 等の書き込み系・作業ツリー変更系操作は一切実行していません
  （Windows マウント上の `.git/index` 破損回避）。`npm audit` は lockfile を読むだけで書き込みません。
- sub 環境（`C:\Visual Studio Code UserFile\100BeautiesLab_Creations-subLocal\`）には**書き込みも参照もしていません**。
- D ドライブ側のリポジトリ配置: `100BeautiesLab_CreationsAI` / `100BeautiesLab_CreationsDB` / `7400SeriesCollection` /
  `CheatSheet-of_HttpResponceDataCode` / `CheatSheet-of_Numbers` / `ImageFrequencyCheckerForHandmaidsVsAI` /
  `NumberTales-MisskeyAIBot` / `WebSites`。**APHRNTs_100 と GeneratorsAI は D 側に無し**。

---

## まとめ

| 項目 | 優先度 | 状態 | 確認方法 |
| --- | --- | --- | --- |
| MisskeyAIBot PR #37 の Copilot 指摘 4 件 | 🔴 **高（新規）** | 未対応（マージ後着弾・以降コミットなし） | `pull_request_read` ＋ `list_commits` で**実測** |
| Issue #13 の確定命名を Issue へ通知 | 🟡 中〜高 | 実装済み・**Issue は OPEN のまま／Bot へ命名未通知** | `list_issues` ＋ `git show e984414` で**実測** |
| Num 64 の `palette_priority` 未追従 | 🟡 中（**7日据え置き**） | User 判断待ち | `git show origin/addon-ai-tag` を**実測** |
| GeneratorsAI の `node` 未検出ハンドリング | 🟡 中（**11日据え置き**） | 継続未対応 | `list_commits` ＋ ローカル `findstr` で**実測** |
| AIHints 構造的再同期 workflow | 🟢 — | ✅ **決着**（08-20 `9efe04c`。以降 2 日間 失敗通知ゼロ） | User の進捗ログ＋メール実測 |
| workflow の Node 20 deprecation | 🔵 低 | 未対応 | User の進捗ログに記載 |
| npm 高深刻度 2 件（devDeps のみ） | 🔵 低 | 未対応（前回から増減なし） | `npm audit` を**実測** |
| OPEN Issue / PR（アカウント全体） | — | Issue #13 の 1 件のみ / PR 0 件 | `search_issues` / `search_pull_requests` で**実測** |
| Actions ログ・Code scanning アラート | — | ⚪ **未確認**（コネクタに読み取り手段なし） | — |

**本日の要対応は 4 件**: ①MisskeyAIBot PR #37 の指摘 1・2（動作バグ／情報漏洩）、②Issue #13 への命名コメント、
③Num 64 の配色追従の可否判断、④GeneratorsAI の `node` 未検出ハンドリング。

実コード・ワークフロー・設定ファイルの変更、git の書き込み系操作、GitHub コネクタの書き込み系ツールは一切使用していません。
