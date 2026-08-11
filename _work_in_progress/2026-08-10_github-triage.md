# GitHub 未解決問題トリアージ（2026-08-10）

自動実行（毎朝のGitHub未解決問題トリアージ）による生成物。**実コードの修正・commit/push は行っていません**（読み取り専用調査）。

調査手段:

- Gmail 通知（`from:github.com newer_than:14d` / `Run failed`・Dependabot・security alert を `newer_than:45d` で二重走査）
- GitHub 読み取り専用 API（`get_me` / `list_issues` / `list_pull_requests` / `list_commits` / `list_branches` / `get_file_contents`）
- ローカル読み取り専用参照（`git log` / `git show` / `git ls-tree` / `git archive` によるテンポラリ複製での再現実験）

GitHubコネクタは**正常に利用できました**（`get_me` → `radiann-kswg` で疎通確認済み。認証エラー・アクセス拒否なし）。
ただし **Actions の実行履歴・ジョブログ、および Dependabot / Code scanning のアラート一覧を読むツールはコネクタに存在しません**。
CI 関連の判定はメール通知＋**ローカル再現実験**によるもので、Actions のジョブログ本文は未確認です。

保存先は本リポジトリの規約（`AGENTS.md` / `CLAUDE.md`）どおり `_work_in_progress/`（`.wip/` は使わない）。
出力は **Dドライブの main 環境のみ**。sub 環境（Cドライブ側）には一切書き込んでいません。

> 補足: 前回ログは `2026-08-08_github-triage.md`。**08-09 のログは存在しません**（当日の実行が無かったものと思われます）。
> 本ログは 08-08 実行**以降**に発生した事象を主に扱います。

---

## 1. 🔴 【本日の最優先】AIHints 構造的再同期 workflow の失敗（08-08 06:01 UTC）— 未解決

- 状態: 🔴 **未解決**。前回ログ §5 では「07-25 以降通知なし → 追跡終了」としましたが、**その判断の直後（08-08 15:01 JST）に再発**しています。
- 対象: run `31242946161` / ブランチ `addon-ai-tag` / HEAD `892a91c` / ジョブ `構造的再同期と PR 作成` が **29 秒で Failed**（annotations 3 件）。
- URL: https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/actions/runs/31242946161

### 前回ログの誤りを訂正

前回ログは「`.github/workflows/aihints-structural-resync.yml` は**存在せず**」と記載していますが、これは **`develop` を見ていたための誤り**です。
本ワークフローは設計上 **`addon-ai-tag` 限定で保持**されており（ファイル冒頭のコメントに明記）、`addon-ai-tag` には確かに存在します。台帳 **T-09 の「追跡終了」は撤回**が必要です。

```
$ git ls-tree -r --name-only addon-ai-tag .github/workflows
.github/workflows/aihints-structural-resync.yml   ← 存在する
.github/workflows/cf-api-sync.yml
.github/workflows/codeql.yml
.github/workflows/gcal-sync.yml
.github/workflows/jekyll-gh-pages.yml
.github/workflows/notify-ai-dataset.yml
```

### 失敗の経緯（メール通知ベース）

| 日時(UTC) | ブランチ / SHA | 結果 |
| --- | --- | --- |
| 2026-07-16 03:46 / 04:08 | `addon-ai-tag` `7fb4d43` | ❌ 失敗（Attempt #2 も失敗） |
| 2026-07-25 02:41 / 02:42 | `addon-ai-tag` `8f5cf12` | ❌ 失敗（Attempt #2 も失敗） |
| 2026-08-02 05:55 | — | ✅ **成功**（PR #18「AIHints: 構造的再同期（自動生成）」が作成され、その後マージ済み） |
| 2026-08-08 06:01 | `addon-ai-tag` `892a91c` | ❌ 失敗（29 秒 / annotations 3） |

08-02 に一度成功しているため、**パイプライン全体が壊れているわけではありません**。

### ローカル再現実験（`git archive` で `addon-ai-tag` をテンポラリへ複製し、ワークフローの各ステップを順に実行）

> 複製は `%TEMP%` 配下。**リポジトリ本体には一切書き込んでいません。**
> なお Windows 標準の `tar` は UTF-8 のファイル名を文字化けさせるため、**Python の `tarfile` で展開**しています
> （最初 Windows `tar` で展開したところ、和名画像 `attr_tagNTS-2B-試用.png` 等が化けて `data.image-links` テストが偽陽性で落ちました。実機の作業ツリーではファイル名は正常です）。

| ワークフローのステップ | 再現結果 | 判定 |
| --- | --- | --- |
| `npm ci` | lockfile から 125 packages を **3 秒で正常インストール**。`declared but missing from lock` = 0 | ✅ 原因ではない |
| 対象 DB の列挙（`grep -q '"AIHints"'`） | 対象は **`NumberTales:Primary` の 1 件のみ**。`db_type.json` / `db_meta.json` は引用符付き `"AIHints"` を含まないため誤検出なし | ✅ 原因ではない |
| 構造的再同期（`--resync-structural`） | **exit 0**。`#99: resync-applied`（＝再同期すべき差分が実在する）、他は `resync-unchanged` / `skipped-no-aihints` | ✅ 原因ではない |
| 整形（prettier） | exit 0 | ✅ 原因ではない |
| 差分の判定（対象外ファイル混入ガード） | 再同期＋prettier で変化したファイルは **`data/Works_NumberTales/DataBases/db_Primary.json` の 1 件のみ**。`::error::` ガードは発火しない | ✅ 原因ではない |
| テスト（`npm test` = vitest） | **76 ファイル / 1307 テスト すべて成功（exit 0）** | ✅ 原因ではない（Windows 実行） |
| PR の作成 / 更新（`git push -f` → `gh pr create`） | ローカルでは再現不可（実リモートへの書き込みになるため未実行） | ⚠️ **未検証** |

### 現時点の切り分け結論

上流のステップはすべてローカルで正常再現したため、**残る疑いは最終ステップ「PR の作成 / 更新」に集中**します。
補強材料として、`list_branches` の実測で **`auto/aihints-structural-resync` ブランチはリモートに存在しません**（現存は
`addon-ai-tag` / `develop` / `alert-autofix-5,6,7` / `dependabot/...` の 6 本）。
つまり `git push -f origin auto/aihints-structural-resync` が**通っていない**か、そこへ到達する前に落ちた可能性が高いです。

> ⚠️ **断定はできません。** Actions のジョブログをコネクタから読む手段が無いため、上記は「上流ステップがローカルで再現しない」ことによる**消去法**です。

### 修正方針の提案（未適用）

1. **まず annotations 3 件の中身を確認する**（これが最短）。
   `https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/actions/runs/31242946161` を開き、
   `PR の作成 / 更新` ステップのログ末尾を見る。以下のどれかが出ているはずです。
   - `GitHub Actions is not permitted to create or approve pull requests`
     → Settings → Actions → General → Workflow permissions の
     **「Allow GitHub Actions to create and approve pull requests」が OFF** になっている。ON にすれば解消。
     08-02 に成功しているため、その後に設定が変わった／組織ポリシーが効いた可能性がある。
   - `remote: Permission to ... denied` / `403`
     → `permissions:` は job 側で `contents: write` / `pull-requests: write` を宣言済みなので、
       リポジトリ既定の Workflow permissions が **Read repository contents** に落ちていないかを確認。
   - `pull request already exists` 系
     → `gh pr list --head "$BRANCH" --state open` は**マージ済み PR を拾わない**ため、
       同じ head で再作成しようとして衝突しうる。`--state all` での存在確認、または
       `gh pr create || gh pr edit` へのフォールバックを入れると堅くなる。

2. **失敗を握り潰さない小さな改善（任意）**
   現状は失敗しても「再同期が落ちた」ことがメール以外に残りません。
   `PR の作成 / 更新` ステップの前に、`git diff --stat -- $TARGET_FILES` の内容を
   `$GITHUB_STEP_SUMMARY` へ書き出しておくと、次に落ちたとき原因追跡が 1 画面で済みます。

3. **実害の確認（重要）**
   再現実験で `#99` に `resync-applied` が出ています。**Num=99 の AIHints が DB の構造ソースと乖離したまま**であり、
   ワークフローが失敗し続ける限りこの差分は取り込まれません。
   急ぐなら、ワークフローの冒頭コメントにある手順でローカルから手動 PR を出せます（**未実行**）:

   ```
   node tools/patch-aihints.mjs --work NumberTales --db Primary --all --resync-structural --apply
   ```

---

## 2. 🟡 Issue #13「キャラ別『数秘解説』『スキンシップ反応』フィールドの追加（Bot F-06/F-15 連携）」

- 状態: 🟡 **未解決（OPEN 継続）** — 2026-08-10 に `list_issues(state=OPEN)` で**実測確認済み**。
  **radiann-kswg の主要リポジトリで OPEN な Issue はこの 1 件のみ**
  （CreationsDB / GeneratorsAI / APHRNTs_100 / NumberTales-MisskeyAIBot / CreationsAI / NumberTales-HTML_CSS を個別に実測、他は 0 件）。
- 起票: 2026-07-21 / 起票者: radiann-kswg（Bot 実装側からの依頼） / 経過: **20日間**
- URL: https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/13
- `updated_at` は `2026-07-21T02:09:02Z` のまま＝**起票以降ノーアクション**。前回（08-08）から進展なし。
- 関連ログ: `_work_in_progress/2026-07-22_progress_issue13-numerology-skinship.md`。台帳では **T-25**。

### 修正方針の提案（未適用・前回から変更なし）

1. **命名と配置を先に確定する**（コード変更を伴わない意思決定）。Bot 側はフィールド未存在でもフォールバックするため、DB 側の都合で決めてよい。
2. **`db_type.json` に型定義だけ先行投入**し、`db_Primary.json` へは器（空配列）のみ非破壊追加。本文は User 手動入力。
3. 表示系（キャラシート）への接続は後回しでよい。Bot 供給専用として始めれば UI/API の回帰リスクはゼロ。
4. 対象は当面 **NumberTales / Primary の released 個体のみ**。

> Bot 側 F-06 Stage B/C は本フィールド待ちでブロック継続中（20日）。**1（命名・配置の確定）だけでも先に決めておく**と、後日の実装が機械作業になります。

---

## 3. 🔵 npm の高深刻度脆弱性 2 件（devDependencies・低優先）

再現用の複製で `npm audit --json` を実行した結果（**lockfile は addon-ai-tag のもの**）:

| パッケージ | 深刻度 | 内容 | 修正 |
| --- | --- | --- | --- |
| `brace-expansion` | high | DoS via unbounded intermediate arrays（CVE-2026-14257 の緩和策をバイパス） | あり |
| `nanoid` | high | custom generators can loop indefinitely when size is zero | あり |

- いずれも **devDependencies 経由**（`glob` / `jsdom` / `playwright` / `vitest` の推移的依存）で、**公開成果物には載りません**。
- 07-26 にマージ済みの Dependabot PR #15（brace-expansion 5.0.6→5.0.8）とは**別の新しい勧告**です。
- 現時点で **OPEN な Dependabot PR は 0 件**（`list_pull_requests(state=open)` で実測）。まだ自動 PR が来ていない状態。
- 提案: 急ぎではありません。次に依存を触るときに `npm audit fix` を当てるか、Dependabot PR を待てば十分です。

---

## 4. ✅ OPEN PR — 0 件（アカウント全体）

`list_pull_requests(state=open)` を 8 リポジトリで実測 → **すべて空**。

CreationsDB / GeneratorsAI / NumberTales-HTML_CSS / APHRNTs_100 / NumberTales-MisskeyAIBot / Tarot-byFateLineDealer / CreationsAI / ShouArRider-HTML_CSS

直近14日の Gmail に出ていた PR（GeneratorsAI #16 #15 #14 #13 / APHRNTs_100 #41〜#32 / Tarot #6 #5 #4 /
NumberTales-MisskeyAIBot #35 #34 / CreationsDB #18 #17 #16 #15 / radiann-kswg #1）は**いずれもクローズ／マージ済み**です。

## 5. ✅ 他リポジトリの CI — 追跡終了

| リポジトリ | 最後の失敗 | 判定 | 根拠 |
| --- | --- | --- | --- |
| 100BeautiesLab_GeneratorsAI | 08-02 `Deploy MCP Server to Cloud Run`（master `e9720f3`、2連続） | ✅ 解決済み | 同日マージの PR #14（`mcp<2` 上限ピン）＋ PR #16（Cloud Run ゼロスケール是正、08-09）。以降の失敗通知なし |
| 100BeautiesLab_CreationsDB | 08-04 `Cloudflare API 自動更新`（develop `689e143`） | ✅ 解消と判断 | 前回ログ §1 のとおり。以降 `Run failed` 通知ゼロ |
| NumberTales-MisskeyAIBot | 07-26 `Deploy to GCP VM / SSH deploy` | ✅ 追跡終了 | 08-05 の PR #35（共用 Spot VM 移設追従）マージ済み。以降通知なし |
| NumberTales-HTML_CSS | 07-03 `Deploy static content to Pages`（4連続） | ✅ 追跡終了 | その後 07-31 / 08-06 / 08-07 に push（最新 `49f443f`）があり失敗通知なし |
| ShouArRider-HTML_CSS | 07-15 `Deploy static content to Pages` | ✅ 追跡終了 | その後 07-28 に push（`7f3f566`）があり失敗通知なし |
| ChearSheet-of_Numbers / CheatSheet-of_HttpResponceDataCode | 07-16 Jekyll / Pages | ⚪ 保留 | 07-16 以降の失敗通知なし。更新頻度が低く再トリガーされていない可能性あり |
| 100BeautiesLab_CreationsAI | 07-11 `Sync & Format AI Dataset`（3連続） | ⚪ 保留 | 以降の失敗通知なし。OPEN Issue / PR とも 0 件 |

> ⚠️ 「保留」は、Actions のログも実行履歴もコネクタから読めないため、**「通知が来ていない」以上のことが言えない**という意味です。

## 6. 🔵 参考: 未使用リモートブランチの滞留（軽微・任意対応・前回から変化なし）

`list_branches` の実測（6 本）:

| ブランチ | 由来 | 備考 |
| --- | --- | --- |
| `alert-autofix-5` / `-6` / `-7` | Code scanning の autofix 提案 | 対応 PR は見当たらず。過去のアラート対応の残骸と思われる |
| `dependabot/npm_and_yarn/npm_and_yarn-3f9ee708be` | PR #5（picomatch 4.0.4） | 2026-03-27 にマージ済み。ブランチだけ残存 |

> Code scanning アラートの open/close はコネクタから読めないため、`alert-autofix-*` の存在が「未対応アラートあり」を意味するかは**未確認**です。

---

## 7. ローカル環境の状態（参考・書き込みなし）

- `D:\VisualStudio Code Userfile\100BeautiesLab_CreationsDB`（**main 環境**）: ブランチ `develop` / HEAD `13a189f`。
  ローカルの `addon-ai-tag` は `13a189f`、リモートも `13a189f` で一致。
- 再現実験は `%TEMP%\aihints-repro3`（`git archive` によるテンポラリ複製）で実施。**リポジトリ本体・`.git` には一切書き込んでいません。**
- `git fetch` / `pull` / `stash` / `add` / `commit` / `checkout` 等の書き込み系・作業ツリー変更系操作は一切実行していません
  （Windows マウント上の `.git/index` 破損回避）。
- sub 環境（`C:\Visual Studio Code UserFile\100BeautiesLab_Creations-subLocal\`）には**書き込みを行っていません**。
- APHRNTs_100 / 100BeautiesLab_GeneratorsAI は C ドライブのみ、Tarot-byFateLineDealer はローカル未配置のため、
  出力先ルールに従い**提案ログの作成対象外**とし、読み取りのみ実施しました。

---

## まとめ

| 項目 | 優先度 | 状態 | 確認方法 |
| --- | --- | --- | --- |
| AIHints 構造的再同期 workflow の失敗（08-08） | 🔴 **最優先** — Num=99 の AIHints 乖離が取り込まれないまま | 🔴 **未解決** | メール通知＋**ローカル再現実験で上流ステップを全て消去**（Actions ログは未確認） |
| Issue #13（数秘解説 / スキンシップ反応） | 中〜高 — Bot F-06 Stage B/C をブロック中・**20日据え置き** | 🟡 **未解決（OPEN）** | コネクタで**実測** |
| npm 高深刻度 2 件（brace-expansion / nanoid） | 低（devDeps のみ） | 🔵 **未対応** | 複製上で `npm audit` を実測 |
| OPEN PR（8 リポジトリ） | — | ✅ 0 件 | コネクタで**実測** |
| 他リポジトリの CI | — | ✅ 追跡終了 / ⚪ 一部保留 | 失敗通知の途絶＋後続 push を実測 |
| 未使用リモートブランチ 4 本 | 低（任意） | 🔵 参考情報 | `list_branches` で実測 |
| Code scanning アラートの open/close | — | ⚪ **未確認**（コネクタに読み取り手段なし） | — |

**本日の要対応は「AIHints 構造的再同期 workflow の失敗」と「Issue #13」の 2 件です。**
前者は前回ログで誤って「追跡終了」としてしまった項目の再燃であり、**次の一手は Actions ログの annotations 3 件を目視すること**です（§1 の提案 1）。

実コード・ワークフロー・設定ファイルの変更、git の書き込み系操作、GitHub コネクタの書き込み系ツールは一切使用していません。
