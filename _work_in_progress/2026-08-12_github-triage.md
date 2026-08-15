# GitHub 未解決問題トリアージ（2026-08-12）

自動実行（毎朝のGitHub未解決問題トリアージ）による生成物。**実コードの修正・commit/push は行っていません**（読み取り専用調査）。

調査手段:

- Gmail 通知（`from:notifications@github.com newer_than:14d` ＋ Dependabot / security alert を `newer_than:30d` で二重走査）
- GitHub 読み取り専用 API（`get_me` / `list_issues` / `search_issues` / `list_pull_requests` / `pull_request_read` / `list_commits` / `list_branches`）
- ローカル読み取り専用参照（`git log` / `git show` / `git archive` によるテンポラリ複製での再現実験）

GitHubコネクタは**正常に利用できました**（`get_me` → `radiann-kswg` で疎通確認済み。認証エラー・アクセス拒否なし）。
ただし **Actions の実行履歴・ジョブログ、および Dependabot / Code scanning のアラート一覧を読むツールはコネクタに存在しません**。
CI 関連の判定はメール通知＋PR メタデータ（`pull_request_read`）＋ローカル再現実験によるもので、**Actions のジョブログ本文は未確認**です。

保存先は本リポジトリの規約（`AGENTS.md` / `CLAUDE.md`）どおり `_work_in_progress/`（`.wip/` は使わない）。
出力は **Dドライブの main 環境のみ**。sub 環境（Cドライブ側）には一切書き込んでいません。

> 前回ログ: `2026-08-10_github-triage.md`（その前は `2026-08-08_github-triage.md`）。
> **本ログは前回ログ §1 の結論を、新しい実測証拠に基づいて大きく訂正します。**

---

## 1. 🟡 AIHints 構造的再同期 workflow — 「壊れている」→「散発的に落ちる」へ格下げ

### 結論（先に）

- **データの滞留は解消済み。** 08-11 07:50 UTC の run が **成功して PR #22 を作成**し、同 07:50:57 に `addon-ai-tag` へマージ済み（`6e4f3e2`）。
- したがって前回ログの 🔴「Num=99 の AIHints 乖離が取り込まれないまま」という**実害は消えています**。
- 残る問題は **「同じコミットでも落ちたり通ったりする散発的な失敗」** で、性質は *ノイズ*（通知が飛ぶ／再実行が必要）であり、データ欠落ではありません。優先度を 🔴 → 🟡 に下げます。

### 実測タイムライン（コネクタで確定）

| 日時(UTC) | ブランチ SHA | 結果 | 根拠 |
| --- | --- | --- | --- |
| 08-08 06:01 | `892a91c` | ❌ 失敗（29s / annotations 3） | メール |
| 08-10 03:53 | `5ccf04c` | ❌ 失敗（32s / annotations 3） | メール |
| 08-10 03:55 | **`5ccf04c`（同一SHA）** | ✅ **成功** → PR #19 作成（09:55:11）→ 03:56:07 マージ | `pull_request_read(19)`: `base.sha = 5ccf04c7ef...`, `user = github-actions[bot]` |
| 08-11 02:40 | `0beee71` | ❌ 失敗（33s） | メール |
| 08-11 04:18 | `3d1a2c3` | ❌ 失敗（29s） | メール |
| 08-11 05:28 | `5a5d158` | ❌ 失敗（45s） | メール |
| 08-11 07:50 | `801ac6d` | ✅ **成功** → PR #22 作成 → 07:50:57 マージ（`6e4f3e2`） | `pull_request_read(22)`: `base.sha = 801ac6d2ec...`, `merged = true`, `+225 / -216` 1ファイル |

### 前回ログの仮説を2つとも棄却

**(a) 「リポジトリの Workflow permissions が OFF になった」説 → 棄却。**
最後の失敗（08-11 05:28）の **2時間22分後**、同じトークン・同じ permissions で `github-actions[bot]` が
PR #22 を**作成してマージまで到達**しています。設定が落ちていたなら成功し得ません。

**(b) 「DB の中間状態が壊れていて落ちた」説 → 棄却。**
失敗 SHA `5a5d158` を `git archive` でテンポラリへ複製し、ワークフローの各ステップを実機で再現しました
（**リポジトリ本体・`.git` には一切書き込んでいません**。展開は UTF-8 ファイル名を保つため Python `tarfile` を使用）。

| ステップ | 再現結果 | 判定 |
| --- | --- | --- |
| `npm ci` | exit 0 | ✅ 原因でない |
| 構造的再同期（`--resync-structural --apply`） | **exit 0** / `resync-applied=59, resync-unchanged=33, skipped-no-aihints=13` | ✅ 原因でない |
| `npx prettier --write`（対象1ファイル） | exit 0 | ✅ 原因でない |
| 差分の判定（対象外ファイル混入ガード） | 変化は `db_Primary.json` の1件のみ。`::error::` 未発火 | ✅ 原因でない |
| `npm test`（vitest） | **77ファイル / 1348テスト 全成功**、14.9秒 | ✅ 原因でない |

さらに決定打として、**08-10 は同一 SHA `5ccf04c` が 03:53 に失敗し 03:55 に成功**しています。
入力が同一で結果が変わる以上、**決定論的な原因（依存・データ・テスト・整形ガード・権限）はすべて除外**されます。

### 残る疑い（未検証・順位付き）

失敗は最終ステップ **「PR の作成 / 更新」** の非決定的な事象に絞り込まれます。

1. **`gh pr create` の「A pull request already exists」衝突。**
   直前の PR がマージされた直後は、`gh pr list --head "$BRANCH" --state open` が参照する検索インデックスと
   REST の実体に**数十秒〜数分のラグ**が出ます。ガードをすり抜けて `gh pr create` に落ち、422 で失敗しうる。
2. **`git push -f origin auto/aihints-structural-resync` と、PR マージ時のブランチ自動削除の競合。**
   `list_branches` の実測で `auto/aihints-structural-resync` は**現在リモートに存在しません**（PR #19 / #22 のマージ時に自動削除されている）。
   削除処理と push が重なると ref ロックで弾かれ得ます。
3. GitHub API の一過性 5xx。

> ⚠️ **断定はできません。** Actions のジョブログをコネクタから読む手段が無いため、上記は消去法＋PR メタデータからの推定です。

### 修正方針の提案（未適用）

**手順1（最短・まずこれ）— annotations 3 件を目視する。**
失敗 run のいずれかを開き、`PR の作成 / 更新` ステップの末尾を読む。
`https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/actions/runs/31461715846`（08-11 05:28 / `5a5d158`）

**手順2（ローリスクな恒久対策・上の2案はどちらも「作成の衝突」に効く）**

- 案A: 存在確認を `--state open` → **`--state all`** に変える。マージ済み PR も拾うので、
  同一 head での再作成衝突をそもそも起こさない（ただし「毎回スキップされ続ける」ことのないよう、
  `git push -f` で既存 PR が更新される設計であることが前提。現状の設計はそれを満たしています）。
- 案B: 作成をフォールバック付きにする。
  ```bash
  gh pr create ... || {
    echo "::notice::PR 作成に失敗（既存 PR への force-push で更新済みの可能性）"
    gh pr list --head "$BRANCH" --state all --limit 1 --json url -q '.[0].url'
  }
  ```
  **※ 案B は真のエラーも握り潰すため、手順1で原因を確認してから採用すること。**

**手順3（診断性の改善・任意／前回から継続提案）**
`PR の作成 / 更新` の直前に `git diff --stat -- $TARGET_FILES` を `$GITHUB_STEP_SUMMARY` へ書き出し、
同ステップに `set -x` を付ける。次に落ちたとき 1 画面で切り分けられます。

**手順4（運用回避策・コード変更ゼロ）**
落ちたら **同じ run を「Re-run failed jobs」する**。08-10 の実績どおり、同一 SHA で通ります。

---

## 2. 🟡 Issue #13「キャラ別『数秘解説』『スキンシップ反応』フィールドの追加（Bot F-06/F-15 連携）」

- 状態: 🟡 **未解決（OPEN 継続）** — 2026-08-12 に `search_issues(is:issue is:open owner:radiann-kswg)` で実測。
  **radiann-kswg アカウント全体で OPEN な Issue はこの 1 件のみ。**
- 起票: 2026-07-21 / 起票者: radiann-kswg（Bot 実装側からの依頼） / 経過: **22日間**
- URL: https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/13
- `updated_at` は `2026-07-21T02:09:02Z` のまま＝**起票以降ノーアクション**。前回（08-10）から進展なし。
- 関連ログ: `_work_in_progress/2026-07-22_progress_issue13-numerology-skinship.md`。台帳では **T-25**。

### 修正方針の提案（未適用・前回から変更なし）

1. **命名と配置を先に確定する**（コード変更を伴わない意思決定）。Bot 側はフィールド未存在でもフォールバックするため、DB 側の都合で決めてよい。
2. **`db_type.json` に型定義だけ先行投入**し、`db_Primary.json` へは器（空配列）のみ非破壊追加。本文は User 手動入力。
3. 表示系（キャラシート）への接続は後回しでよい。Bot 供給専用として始めれば UI/API の回帰リスクはゼロ。
4. 対象は当面 **NumberTales / Primary の released 個体のみ**。

> なお 08-11 の配色作業は `issue #21` を参照して進んでいます（コミット `eabb2b5`）。
> #21 / #20 は `pull_request_read` が 404 を返す＝**PR ではなく Issue**（すでにクローズ済み）。
> 一方で **#13 だけが 22日間 OPEN のまま放置**されています。**1（命名・配置の確定）だけでも先に決める**ことを推奨します。

---

## 3. 🟡 GeneratorsAI PR #17 — Copilot レビュー指摘 5 件が「マージ後」に届いており、未対応

これは**新規検出項目**です。

- PR #17「AppearanceDetail 照合レビューツールの追加と AIHints 構造的再同期への追従」
  - `merged_at` = **2026-08-11T08:09:00Z**
  - Copilot のレビューコメント到着 = **2026-08-11T08:12:34Z**（`updated_at` = 08:12:13Z）
  - つまり **レビューが届く前にマージ**されており、指摘は反映されていません。
- URL: https://github.com/radiann-kswg/100BeautiesLab_GeneratorsAI/pull/17

### 指摘内容（メール本文より・優先度順）

| # | 対象 | 内容 | 優先 |
| --- | --- | --- | --- |
| 1 | `src/tools/verify_appearance_detail.py` | `node` が PATH に無い環境で `subprocess.run` が `FileNotFoundError` のまま落ち、原因が分からないスタックトレースになる。捕捉して「Node.js を入れて PATH を通す」旨のメッセージで終了すべき | 🟡 中（運用時に効く） |
| 2 | `docs/tools.md` | フラグ表で `--all` を「`--check coverage` 専用」としているが、直前のコマンド例に `--all --check hexmap` があり矛盾。`--check` の説明に `hexmap` が欠落 | 🔵 低 |
| 3 | `tests/test_appearance_detail_review.py` | 冒頭コメント「固定したい挙動は 3 つ」に対し、実際は 1〜4 の **4項目** | 🔵 低 |
| 4-5 | `_tasks/2026081*_submodule-sync.md` | コミット一覧のコードブロックに文字化け `窶・`（本来は `—`）。ログの可読性が落ちる | 🔵 低 |

### 提案（未適用）

1 だけ拾えば十分です。`node` 呼び出しを `try/except FileNotFoundError` で包み、
`SystemExit("Node.js が見つかりません。PATH を通してください")` で終える小さな修正。2〜5 はドキュメント・コメントの整合で、次に同ファイルを触るときで構いません。

> **提案ログは本リポジトリ（CreationsDB）にのみ保存しています。**
> GeneratorsAI のローカルは C ドライブのみ（`C:\Visual Studio Code UserFile\100BeautiesLab_GeneratorsAI`）で、
> 出力先ルール（Dドライブ main 環境へ集約）に該当する main 環境が D 側に無いため、**同リポジトリへの書き込みは行っていません**。

---

## 4. 🔵 npm の高深刻度脆弱性 2 件（devDependencies のみ・低優先／前回から変化なし）

再現用の複製上で実測（lockfile は `addon-ai-tag` の `5a5d158` 時点）:

| パッケージ | 深刻度 | 内容 | 修正 |
| --- | --- | --- | --- |
| `brace-expansion` (4.0.0 - 5.0.8) | high | DoS via unbounded intermediate arrays（GHSA-rgw5-rvv9-x895） | `npm audit fix` で可 |
| `nanoid` (<3.3.17) | high | custom generators can loop indefinitely when size is zero（GHSA-2v37-7h3g-55p8） | `npm audit fix` で可 |

- **`npm audit --omit=dev` → `found 0 vulnerabilities`。公開成果物には一切載りません。**
- OPEN な Dependabot PR は **0 件**（`list_pull_requests(state=open)` で実測）。
- 提案: 急ぎではありません。次に依存を触るときに `npm audit fix` を当てるか、Dependabot PR を待てば十分。

---

## 5. ✅ OPEN PR — 0 件（アカウント全体）

`list_pull_requests(state=open)` を実測 → **すべて空**。

| リポジトリ | OPEN PR |
| --- | --- |
| 100BeautiesLab_CreationsDB | 0 |
| 100BeautiesLab_GeneratorsAI | 0 |
| APHRNTs_100 | 0 |
| NumberTales-MisskeyAIBot | 0（初回 500 エラー、再実行で `[]`） |
| Tarot-byFateLineDealer | 0 |
| NTsWallpaperEngine | 0 |

直近14日の Gmail に出ていた PR は**いずれもマージ済み**であることを個別に確認:

- CreationsDB #22（08-11 07:50 マージ）/ #19（08-10 03:56 マージ）/ #18 / #16 / #15
- GeneratorsAI #17（08-11 08:09 マージ）/ #16 / #15 / #14 / #13
- NTsWallpaperEngine #1（08-10 05:47 マージ・`+76776 / -132` / 146ファイル）
- APHRNTs_100 #41〜#33 / Tarot #6 #5 #4 / NumberTales-MisskeyAIBot #35

---

## 6. ✅ 他リポジトリの CI — 追跡終了 / 保留

| リポジトリ | 最後の失敗 | 判定 | 根拠 |
| --- | --- | --- | --- |
| 100BeautiesLab_GeneratorsAI | 08-02 `Deploy MCP Server to Cloud Run`（master `e9720f3`、2連続） | ✅ 解決済み | PR #14（`mcp<2` 上限ピン）＋ PR #16（ゼロスケール是正）。以降10日間、失敗通知ゼロ |
| 100BeautiesLab_CreationsDB | 08-04 `Cloudflare API 自動更新`（develop `689e143` / `R2/D1 データ同期` failed・`Worker デプロイ` skipped） | ✅ 解消と判断 | 以降8日間、同 workflow の `Run failed` 通知ゼロ |
| NumberTales-MisskeyAIBot | 07-26 `Deploy to GCP VM / SSH deploy` | ✅ 追跡終了 | 08-05 の PR #35（共用 Spot VM 移設追従）マージ済み。以降通知なし |
| NumberTales-HTML_CSS / ShouArRider-HTML_CSS | 07-03 / 07-15 `Deploy static content to Pages` | ✅ 追跡終了 | その後の push で失敗通知なし |
| ChearSheet-of_Numbers / CheatSheet-of_HttpResponceDataCode | 07-16 Jekyll / Pages | ⚪ 保留 | 以降の失敗通知なし。更新頻度が低く再トリガーされていない可能性 |
| 100BeautiesLab_CreationsAI | 07-11 `Sync & Format AI Dataset`（3連続） | ⚪ 保留 | 以降の失敗通知なし。OPEN Issue / PR とも 0 件 |

> ⚠️ 「保留」は、Actions のログも実行履歴もコネクタから読めないため、**「通知が来ていない」以上のことが言えない**という意味です。

---

## 7. 🔵 参考: 未使用リモートブランチの滞留（軽微・任意対応）

`list_branches` の実測（**6 本**、前回から本数変わらず・内容は変化）:

| ブランチ | HEAD | 由来 / 備考 |
| --- | --- | --- |
| `addon-ai-tag` | `6e4f3e2` | 現用（PR #22 マージ後） |
| `develop` | `8beaa57` | 現用 |
| `alert-autofix-5` / `-6` / `-7` | — | Code scanning の autofix 提案。対応 PR は見当たらず、残骸と思われる |
| `dependabot/npm_and_yarn/npm_and_yarn-3f9ee708be` | `e530173` | PR #5（picomatch 4.0.4）。2026-03-27 マージ済み。ブランチだけ残存 |

- **`auto/aihints-structural-resync` は現在存在しません**（PR マージ時に自動削除されている＝正常動作）。
- Code scanning アラートの open/close はコネクタから読めないため、`alert-autofix-*` が「未対応アラートあり」を意味するかは**未確認**。

---

## 8. ローカル環境の状態（参考・書き込みなし）

- `D:\VisualStudio Code Userfile\100BeautiesLab_CreationsDB`（**main 環境**）: ブランチ `develop` / HEAD `8beaa57`（リモート `develop` と一致）。
  ローカルの `origin/addon-ai-tag` は `801ac6d` で、**リモートの `6e4f3e2` より 1 マージ分古い**（PR #22 のマージ commit を未取得）。
  `git fetch` は書き込み操作のため**実行していません**。差分はコネクタ側の `list_commits` で確認済み。
- 再現実験は `%TEMP%\aihints-repro-0812`（`git archive` によるテンポラリ複製）で実施し、確認後に削除。
  **リポジトリ本体・`.git` には一切書き込んでいません。**
- `git fetch` / `pull` / `stash` / `add` / `commit` / `checkout` 等の書き込み系・作業ツリー変更系操作は一切実行していません
  （Windows マウント上の `.git/index` 破損回避）。
- sub 環境（`C:\Visual Studio Code UserFile\100BeautiesLab_Creations-subLocal\`）には**書き込みを行っていません**（参照もしていません）。
- D ドライブ側のリポジトリ配置: `100BeautiesLab_CreationsAI` / `100BeautiesLab_CreationsDB` / `7400SeriesCollection` /
  `CheatSheet-of_*` / `ImageFrequencyCheckerForHandmaidsVsAI` / `NumberTales-MisskeyAIBot` / `WebSites`。
  このうち**未解決項目があるのは CreationsDB のみ**のため、提案ログは本ファイル 1 本だけです。

---

## まとめ

| 項目 | 優先度 | 状態 | 確認方法 |
| --- | --- | --- | --- |
| AIHints 構造的再同期 workflow の散発的失敗（08-11 に3回） | 🟡 中（**データ滞留は解消済み**・通知ノイズと再実行の手間） | 🟡 **未解決（原因未特定）** | メール＋`pull_request_read` で成功/失敗を実測、ローカル再現で決定論的原因を全消去 |
| Issue #13（数秘解説 / スキンシップ反応） | 🟡 中〜高 — Bot F-06 Stage B/C をブロック中・**22日据え置き** | 🟡 **未解決（OPEN）** | コネクタで**実測** |
| GeneratorsAI PR #17 の Copilot 指摘 5 件（マージ後着弾） | 🟡 中（1件のみ実害・残りは文書整合） | 🟡 **未対応**（**新規検出**） | メール本文＋`pull_request_read` の時刻比較で実測 |
| npm 高深刻度 2 件（brace-expansion / nanoid） | 🔵 低（devDeps のみ・本番0件） | 🔵 **未対応** | 複製上で `npm audit` / `npm audit --omit=dev` を実測 |
| OPEN PR（6 リポジトリ） | — | ✅ 0 件 | コネクタで**実測** |
| OPEN Issue（アカウント全体） | — | ✅ #13 の 1 件のみ | `search_issues` で**実測** |
| 他リポジトリの CI | — | ✅ 追跡終了 / ⚪ 一部保留 | 失敗通知の途絶＋後続 push を実測 |
| Code scanning アラートの open/close | — | ⚪ **未確認**（コネクタに読み取り手段なし） | — |

**本日の要対応は 3 件**: ①AIHints workflow の annotations 目視（原因特定の最短経路）、②Issue #13 の命名・配置決定、③GeneratorsAI の `node` 未検出ハンドリング。

実コード・ワークフロー・設定ファイルの変更、git の書き込み系操作、GitHub コネクタの書き込み系ツールは一切使用していません。
