# GitHub 未解決問題トリアージ（2026-08-15）

自動実行（毎朝のGitHub未解決問題トリアージ）による生成物。**実コードの修正・commit/push は行っていません**（読み取り専用調査）。

調査手段:

- Gmail 通知（`from:github.com newer_than:14d` ＋ Dependabot / security alert を `newer_than:30d` で二重走査）
- GitHub 読み取り専用 API（`get_me` / `search_issues` / `search_pull_requests` / `list_pull_requests` / `pull_request_read` / `list_commits` / `get_commit` / `get_file_contents` / `search_code`）
- ローカル読み取り専用参照（`git log` / `git status --porcelain` / `npm audit`。いずれもリポジトリを変更しない）

GitHubコネクタは**正常に利用できました**（`get_me` → `radiann-kswg` で疎通確認済み。認証エラー・アクセス拒否なし）。
ただし **Actions の実行履歴・ジョブログ、および Dependabot / Code scanning のアラート一覧を読むツールはコネクタに存在しません**。
CI 判定はメール通知＋コミット実測＋PR メタデータによるもので、**Actions のジョブログ本文は未確認**です。

保存先は本リポジトリの規約どおり `_work_in_progress/`（`.wip/` は使わない）。
出力は **Dドライブの main 環境のみ**。sub 環境（Cドライブ側）には一切書き込んでいません。

> 前回ログ: `2026-08-12_github-triage.md`。
> **本ログは前回ログ §1 の「原因未特定」を、User 自身のコミットという決定的証拠によって確定させます。**

---

## 1. 🟢 AIHints 構造的再同期 workflow — 原因確定・**すでに修正済み**（ただし CI 上では未実証）

### 結論（先に）

- 08-13 / 08-14 の失敗の原因は **`npm test` ステップの失敗**。`tests/patch-aihints.gates.test.js` の
  「Progress ゲートの実効範囲」テストが**対象レコードの Num を列挙して固定**していたため、
  キャラや画像が 1 件増えるたびに落ちていた。
- **User 自身が 2026-08-14 01:55 UTC の `cb68ffe` で修正済み**（列挙 → `expect(gated.length).toBeGreaterThan(0)` へ変更）。
- したがって本件は 🟡 → 🟢（**対応済み**）へ。残タスクは「修正後に差分ありの run が通ることを 1 回見届ける」だけ。

### 根拠（実測）

`cb68ffe` に同梱された User の進捗ログ `_work_in_progress/2026-08-14_progress_aihints-resync-gate-test.md` が、
失敗 run を**番号で名指し**しています。推測ではなく一次資料です。

> CI「AIHints 構造的再同期」（run 31761318136）が `npm test` で失敗し、PR が作られないまま止まっていたので復旧する。

run `31761318136` は 08-14 01:41 の失敗通知メールに記載された run ID と一致します。

`get_commit(cb68ffe, full_patch)` で差分も実測しました:

| ファイル | 変更 |
| --- | --- |
| `tests/patch-aihints.gates.test.js` | `expect(gated).toEqual([...3件の Num 列挙...])` → `expect(gated.length).toBeGreaterThan(0)`（+12 / -15） |
| `data/Works_NumberTales/DataBases/db_Primary.json` | Num 64 の `_meta.structuralSourceHash` と `lastStructuralResync`（→ `2026-08-14`）の 2 行のみ |
| `_work_in_progress/2026-08-14_progress_aihints-resync-gate-test.md` | 新規（上記の進捗ログ） |

### 失敗タイムライン（確定版）

| 日時(UTC) | SHA | 結果 | 原因 |
| --- | --- | --- | --- |
| 08-08 06:01 | `892a91c` | ❌ 失敗（29s / annot.3） | **不明**（下記「未解明の残り」参照） |
| 08-10 03:53 | `5ccf04c` | ❌ 失敗（32s / annot.3） | 同上 |
| 08-10 03:55 | `5ccf04c`（同一） | ✅ 成功 → PR #19 → マージ | — |
| 08-11 02:40 / 04:18 / 05:28 | `0beee71` / `3d1a2c3` / `5a5d158` | ❌ 失敗 | 同上 |
| 08-11 07:50 | `801ac6d` | ✅ 成功 → PR #22 → マージ | — |
| 08-13 00:28 / 00:30(#2) / 00:45(#3) | `c09c1c5` | ❌ 3連続失敗 | **`npm test`**（216系2件に画像が入り期待値と不一致） |
| 08-13 00:36 | `629129f` | （テスト期待値の追記で暫定対処） | — |
| 08-13 00:53 | `a1621e2` → PR #23 | ✅ **手動**再同期で回避（マージ済み `8418fa9`） | — |
| 08-14 01:41 | `9f24a82` | ❌ 失敗（annot.**4**） | **`npm test`**（`09232be` で 64番機にコアフォルダ絵が入り再発） |
| 08-14 01:55 | `cb68ffe` | **修正コミット** | — |

annotations が 3 → 4 に増えたのは、失敗テスト数がキャラ追加に比例して増えたためと整合します。
また **同一 SHA を 3 回 re-run しても全部落ちた（08-13）**ことが、前回ログの「非決定的な PR 作成衝突」説を
少なくとも 08-13 以降については明確に棄却します。

### 未解明の残り（🔵 低・現状ドーマント）

08-08〜08-11 の失敗は、前回ログのローカル再現（`5a5d158` で `npm test` 1348 件全通過）と矛盾するため、
**`npm test` 以外の別原因**です。ただし 08-12 以降このパターンの失敗は出ておらず、実害も観測されていません。
Actions のログを読む手段が無いため、**これ以上の切り分けは現状不可能**です。追跡は保留とします。

### 提案（未適用）

1. **次に「差分あり」で走る run を 1 回見届ける。** `cb68ffe` の push は path フィルタに合致するので
   workflow は起動しているはずですが、直前に手動再同期済みで `structuralSourceHash` が最新のため
   **`changed=false` の no-op で終わり、`npm test` に到達していない可能性が高い**です。
   つまり **修正は CI 上でまだ実証されていません**。次に DB の構造ソースが変わったときが実証の機会です。
2. （任意）テストの脆さは他にも残っています。User のログにあるとおり
   「Primary の AIHints 件数 92 / SemiPrimary・SelfSecondary が 0 件」等の固定値は据え置かれており、
   これらは seed 時にしか動かないため**現状は妥当**です。触る必要はありません。

---

## 2. 🟡 Issue #13「キャラ別『数秘解説』『スキンシップ反応』フィールドの追加（Bot F-06/F-15 連携）」

- 状態: 🟡 **未解決（OPEN 継続）** — `search_issues(is:open owner:radiann-kswg)` で実測。
  **radiann-kswg アカウント全体で OPEN な Issue はこの 1 件のみ。**
- 起票: 2026-07-21 / `updated_at` = `2026-07-21T02:09:02Z` のまま＝**起票以降ノーアクション**。経過 **25日**。
- URL: https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/13
- 関連ログ: `_work_in_progress/2026-07-22_progress_issue13-numerology-skinship.md`。台帳では **T-25**。

### 提案（未適用・前回から変更なし）

1. **命名と配置を先に確定する**（コード変更を伴わない意思決定）。Bot 側はフィールド未存在でもフォールバックする。
2. `db_type.json` に型定義だけ先行投入し、`db_Primary.json` へは器（空配列）のみ非破壊追加。
3. 表示系（キャラシート）への接続は後回しでよい。
4. 対象は当面 NumberTales / Primary の released 個体のみ。

> 3週間以上、**1（命名・配置の確定）だけでも先に決める**という同じ提案を繰り返しています。
> 判断コストが高いなら、Bot 側のフォールバックで当面回る以上「今期は着手しない」と明示的に決めるのも一手です。

---

## 3. 🟡 Num 64（ゼフィア）の `common.palette_priority` が旧割り当てのまま（**新規・User 申し送り**）

`cb68ffe` に同梱された User 自身の進捗ログに、未完了として明記されています。

- `09232be` で ColorPalette の Secondary / Accent が入れ替わった
  （Secondary `#E55951` → `#F26383` / Accent に `#387EB6` 追加 / Sub 2 色を新設）。
- しかし AIHints 側は `secondary: #6AA6D7` / `accent: #F26383` のまま。
- `--apply-colorpalette` は**既存の確定値を保護する仕様**のため `palette-unchanged` でスキップされる。
- 更新するなら `--force-palette` が必要で、これは確定値の上書きにあたる → **User 判断待ち**。

### 提案（未適用）

構造的再同期（`--resync-structural`）では直らない種類のズレなので、**放置すると AIHints が旧配色を語り続けます**。
`--force-palette` を Num 64 に限定して当てるか、「64番機は配色改訂中なので AIHints の配色は保留」と
`_meta` にメモを残すか、どちらかを明示的に決めるのが安全です。判断は User に委ねます。

---

## 4. 🔵 npm の高深刻度脆弱性 2 件（devDependencies のみ・低優先）

ローカル `develop` の lockfile に対し `npm audit` を実測（**インストールも修正も行っていません**）:

| パッケージ | 深刻度 | 内容 | 修正 |
| --- | --- | --- | --- |
| `brace-expansion` (4.0.0 - 5.0.8) | high | DoS via unbounded intermediate arrays（GHSA-rgw5-rvv9-x895） | `npm audit fix` で可 |
| `nanoid` (<3.3.18) | high | custom generators can loop indefinitely when size is zero（GHSA-2v37-7h3g-55p8） | `npm audit fix` で可 |

- **`npm audit --omit=dev` → `found 0 vulnerabilities`。公開成果物には一切載りません。**
- 本リポジトリの OPEN な Dependabot PR は **0 件**。
- `nanoid` の該当範囲が前回の `<3.3.17` から `<3.3.18` へ広がっています（アドバイザリ側の更新）。
- 提案: 急ぎません。次に依存を触るときに `npm audit fix` を当てれば十分。

---

## 5. 🟡 OPEN PR — アカウント全体で 2 件（**前回 0 件から増加**）

`search_pull_requests(is:open owner:radiann-kswg)` で実測。**いずれも本リポジトリ以外**です。

| リポジトリ | PR | 内容 | 作成 | 経過 |
| --- | --- | --- | --- | --- |
| APHRNTs_100 | [#42](https://github.com/radiann-kswg/APHRNTs_100/pull/42) | `postcss` 8.5.16 → 8.5.26（devDeps / Dependabot） | 08-12 | 3日 |
| NumberTales-MisskeyAIBot | [#36](https://github.com/radiann-kswg/NumberTales-MisskeyAIBot/pull/36) | `postcss` 8.5.20 → 8.5.26（devDeps / Dependabot） | 08-11 | 4日 |

- どちらも `check_runs` は 0 件（CI 未設定のため待ち状態ではない）。**マージを妨げているものは無い**。
- 詳細と提案は MisskeyAIBot 側の提案ログ（`_tasks/github-triage/2026-08-15_github-triage.md`）に記載。
- APHRNTs_100 は **D ドライブに main 環境が存在しない**ため、規約どおり同リポジトリへの書き込みは行っていません。

---

## 6. 🟡 GeneratorsAI PR #17 の Copilot 指摘 — **継続未対応**（前回検出分）

- PR #17 は `merged_at` = 08-11 08:09、Copilot レビュー着弾 = 08-11 08:12 で、**レビュー前にマージ**されていました。
- `list_commits` の実測で、GeneratorsAI の最新コミットは **08-11 08:09 のマージコミット `5a3fd54` のまま**。
  以降 4 日間コミットなし＝**指摘は 1 件も反映されていません**。
- 実害のある指摘 1 の現況をローカルで実測しました:

```
C:\Visual Studio Code UserFile\100BeautiesLab_GeneratorsAI\src\tools\verify_appearance_detail.py
  subprocess.run       … 3 箇所
  FileNotFoundError    … 0 箇所
```

`node` が PATH に無い環境では、依然として素の `FileNotFoundError` スタックトレースで落ちます。

### 提案（未適用）

`node` 呼び出しを `try/except FileNotFoundError` で包み、
`SystemExit("Node.js が見つかりません。PATH を通してください")` で終える小さな修正。残り 4 件は文書・コメントの整合で、次に同ファイルを触るときで構いません。

> **提案ログは GeneratorsAI 側には保存していません。** 同リポジトリのローカルは C ドライブのみで、
> 出力先ルール（D ドライブ main 環境へ集約）に該当する環境が D 側に無いためです。

---

## 7. ✅ 他リポジトリの CI — 追跡終了 / 保留

| リポジトリ | 最後の失敗 | 判定 | 根拠 |
| --- | --- | --- | --- |
| 100BeautiesLab_GeneratorsAI | 08-02 `Deploy MCP Server to Cloud Run` | ✅ 解決済み | PR #14 ＋ #16。以降13日間、失敗通知ゼロ |
| 100BeautiesLab_CreationsDB | 08-04 `Cloudflare API 自動更新` | ✅ 解消と判断 | 以降11日間、同 workflow の失敗通知ゼロ |
| NumberTales-MisskeyAIBot | 07-26 `Deploy to GCP VM / SSH deploy` | ✅ 追跡終了 | PR #35 マージ済み。以降通知なし |
| NumberTales-HTML_CSS / ShouArRider-HTML_CSS | 07-03 / 07-15 Pages | ✅ 追跡終了 | 以降失敗通知なし |
| ChearSheet-of_Numbers / CheatSheet-of_HttpResponceDataCode | 07-16 Jekyll / Pages | ⚪ 保留 | 更新頻度が低く再トリガーされていない可能性 |
| 100BeautiesLab_CreationsAI | 07-11 `Sync & Format AI Dataset` | ⚪ 保留 | 以降通知なし。OPEN Issue / PR とも 0 件 |
| 7400SeriesCollection / NTsWallpaperEngine / Tarot-byFateLineDealer | — | ✅ 通知なし | OPEN Issue / PR とも 0 件 |

> ⚠️ 「保留」は、Actions のログも実行履歴もコネクタから読めないため、**「通知が来ていない」以上のことが言えない**という意味です。

---

## 8. ローカル環境の状態（参考・書き込みなし）

- `D:\VisualStudio Code Userfile\100BeautiesLab_CreationsDB`（**main 環境**）: ブランチ `develop` / HEAD `993d225`。
  ローカルの `addon-ai-tag` はリモートより古く、`cb68ffe`（テスト修正）を未取得。
  `git fetch` は書き込み操作のため**実行していません**。差分はコネクタの `list_commits` / `get_commit` で確認済み。
- 作業ツリーの未追跡ファイルは前回ログ `_work_in_progress/2026-08-12_github-triage.md` の 1 件のみ（本ログ追加で 2 件）。
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
| AIHints 構造的再同期 workflow の失敗 | 🟢 — | ✅ **原因確定・修正済み**（`cb68ffe`）。CI 上での実証は次の差分あり run 待ち | User のコミット＋進捗ログを `get_commit` で**実測** |
| 08-08〜08-11 の失敗（別原因） | 🔵 低 | ⚪ 未解明・ドーマント | ログ読み取り手段が無く切り分け不可 |
| Issue #13（数秘解説 / スキンシップ反応） | 🟡 中〜高 — **25日据え置き** | 🟡 未解決（OPEN） | コネクタで**実測** |
| Num 64 の `palette_priority` 未追従 | 🟡 中（**新規**） | 🟡 User 判断待ち | User の進捗ログを**実測** |
| OPEN PR 2 件（APHRNTs_100 #42 / MisskeyAIBot #36） | 🔵 低（**新規**） | 🟡 未マージ | コネクタで**実測** |
| GeneratorsAI PR #17 の Copilot 指摘 5 件 | 🟡 中（1件のみ実害） | 🟡 **継続未対応** | `list_commits` ＋ ローカル実測 |
| npm 高深刻度 2 件（devDeps のみ・本番0件） | 🔵 低 | 🔵 未対応 | `npm audit` を**実測** |
| OPEN Issue（アカウント全体） | — | ✅ #13 の 1 件のみ | `search_issues` で**実測** |
| Code scanning アラートの open/close | — | ⚪ **未確認**（コネクタに読み取り手段なし） | — |

**本日の要対応は 3 件**: ①Issue #13 の命名・配置決定（または「今期は着手しない」の明示）、②Num 64 の配色追従の可否判断、③GeneratorsAI の `node` 未検出ハンドリング。
**AIHints workflow は User の手で解決済み**のため、本日の対応リストから外しました。

実コード・ワークフロー・設定ファイルの変更、git の書き込み系操作、GitHub コネクタの書き込み系ツールは一切使用していません。
