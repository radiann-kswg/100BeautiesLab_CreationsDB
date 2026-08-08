# `develop` 取り込みマージと AIHints 固有コードの同種リファクタリング（2026-08-08）

- **ブランチ**: `addon-ai-tag`（+ 共通化のみ `develop` 経由）
- **ローカル環境**: `main`（本体ローカル）
- **状態**: 実装・自動テスト完了

> **担当分けについて**: `README.LOCAL.md` の `## 作業分担`（2026-08-02 更新）では
> `addon-ai-tag` へのマージ作業は `sub1` 担当で、`main` は「相関図ページの実装」担当。
> 本作業は担当外にあたるが、User の明示的な指示により `main` で実施した。

---

## 目的

`develop` で完了した SW / UI リファクタリング（[2026-08-08_progress_sw-ui-refactor.md](./2026-08-08_progress_sw-ui-refactor.md)、
Phase1〜5）を `addon-ai-tag` へ取り込み、**AIHints 固有コードにも同じ規律を適用する**。

機能追加はせず、削除・統合で解消できる負債だけを処理した。

---

## 発見した実バグ（本作業の主目的）

`pkg/cloudflare/scripts/migrate-aihints.mjs` は `migrate.mjs` の前半 168 行を**丸ごとコピー**して
持っていた。そして `migrate.mjs` 側に後から入った修正がコピーへ反映されず、**6 箇所が乖離**していた。

| # | 乖離 | `migrate.mjs`（現行） | コピー側 | 影響 |
| --- | --- | --- | --- | --- |
| 1 | wrangler config | `"--config", WRANGLER_CONFIG_REL` | 無し | **実測では実害なし**（後述「実機確認」）。`migrate.mjs` の注釈が記録する問題は本環境で再現せず、予防的措置として扱う |
| 2 | Windows shell | `...SPAWN_OPTS_BASE`（`{shell:true}`） | 無し | **実バグ**。Windows / Node v22+ で `npx.cmd` を `execFileSync` が起動できず `spawnSync npx ENOENT` で即死する |
| 3 | SQL パス | `relative(REPO_ROOT, tmpFile)` + `/` 正規化 | 絶対パスのまま | **実バグ**。#2 を直しても、`shell: true` 経由でスペースを含む絶対パスが分割され `Unknown arguments` で失敗する |
| 4 | `idxKey` の解決 | `dbSpecificType ? resolveIdxKey(...) : defaultIdxKey` | `resolveIdxKey(...) \|\| defaultIdxKey` | **`resolveIdxKey()` は引数が無くても `"Num"` を返す**ため defaultIdxKey へ絶対フォールバックしない。ネスト型 `$IndexDef` の作品で `idx_value` が取れず AIHints が丸ごと投入されない |
| 5 | `workDir` の解決 | `resolveWorkDirForMigrate()`（`Works_Dir` 対応） | `workKey.replace()` のみ | `Works_Dir` オーバーライド作品を解決できない |
| 6 | メタ読み込み | `readWorkBaseFile()`（`DataBases/` が無ければ直下） | `DataBases/` 固定 | `Works_CommonReferences` で読み込み失敗警告が出ていた |

**#4 は `migrate.mjs` 側のコメントに「実バグがあった」と明記されている修正**で、コピー側だけが
旧実装のまま取り残されていた。`develop` Phase2（SW 入口 3 本の統合）とまったく同じ構図なので、
乖離を個別に直すのではなく共通化で根本を潰した。

---

## 変更点の要約

### A. `develop` 側 — `migrate-common.mjs` の新設（`migrate.mjs` 527 → 344 行）

> ブランチ運用方針に従い、共通ファイル（`migrate.mjs`）に及ぶ変更は `develop` で行ってから
> `addon-ai-tag` へマージした（逆マージはしない）。コミットは `refactor/migrate-common` /
> `refactor/migrate-common-2` の 2 本。

集約したもの:

- **純粋関数**: `esc` / `resolveIdxKey` / `getByPath` / `findJsonFiles` / `readJson(filepath, tag)`
- **DB 名の解決**: `CONVENTIONAL_FILES` / `stripDbPrefix` / `capitalize`
  （`migrate.mjs` では STEP 4 の**ブロック内ローカル定義**だった）
- **作品ディレクトリ**: `resolveWorkDirForMigrate` / `readWorkBaseFile` / `resolveDbBasePath`
- **共通引数**: `parseCommonArgs(argv)`
- **D1 投入**: `createD1Runner({repoRoot, dbId, dryRun, tmpDirName, batchSize})` → `{d1Execute, d1BatchInsert}`

`--config` / `SPAWN_OPTS_BASE` / 一時 SQL の相対パス化は `createD1Runner()` の内側**だけ**に持たせた。
`dryRun` / `dbId` / 出力先はスクリプトごとに違うためファクトリ引数にしている。

**共通化しなかったもの**: `sleepSync` / R2 アップロード本体は `migrate.mjs` 固有で対応物が無い。

### B. `migrate-aihints.mjs` を共通モジュールへ（293 → 178 行）

前半のコピーを import へ置換。上表の **6 つの乖離がすべて自動的に解消**された。

### C. `tools/patch-aihints.mjs` の重複統合

| 箇所 | 実態 | 対応 |
| --- | --- | --- |
| `main()` | **同じ `db_meta.json` を 2 回読んで 2 回パース**し、同じ `dbEntry` を 2 回導出していた | 1 回に統合 |
| `buildHumanoidForm` / `buildSuggestedHumanoidForm` | `extraHumanoid` ループ + `refs` 合成が**完全に同一の 10 行** | `buildHumanoidReferenceImages()` へ |
| `prompt_export` の生成 4 箇所 | `ai_tags.filter(t => !t.startsWith('TODO:')).join(', ')` を手書き。`regenerateFormExports` のローカル `join` は注釈自体が「scaffold 生成時と同じ規則」と宣言していた | `joinConfirmedTags()` へ |
| `--apply-vision-results` の TODO 置換 8 箇所 | `flatMap(f => { if (TODO) {changed=true; return X;} return [f]; })` が同じ形で 8 回 | `replaceTodoEntries(target, key, replacement)` へ |
| corefolder の追記 2 箇所 | `new Set` で重複除去して push する 8 行が 2 回 | `appendUniqueEntries()` へ |
| `silhouette_notes` の適用 2 箇所 | object 形式 + legacy flat array 対応の 23 行が corefolder / humanoid で同型 | `applyVisionToSilhouetteNotes()` へ |
| `ai_tags` の適用 2 箇所 | hair / eye / outfit スロット置換 12 行が同型（outfit のキーだけ違う） | `applyVisionToAiTags(form, vr, outfitTags)` へ |

**統合しなかったもの**:

- **`buildScaffold` と `buildSuggestedScaffold`** … 骨格は似ているが、分岐フラグを持ち込むと
  「どちらのモードの値か」が読めなくなる。`--suggest` の有無で呼び分ける現在の形を維持
- **corefolder と humanoid の `immutable_constraints` / `negative_keywords`** … corefolder は
  `COREFOLDER_DEFAULT_*` という構造的デフォルトを持つため**末尾へ追記**、humanoid は TODO 1 行しか
  持たないため**置換**。**意図的な差**なので、それぞれ別のヘルパー（`appendUniqueEntries` /
  `replaceTodoEntries`）に割り当て、名前で意図が読めるようにした
- **`earShapeLabel → earAnimalWord` の導出 3 箇所** … いずれも 1 行。ヘルパー化しても純減しない
  （`develop` 側で `isPlainObject` の 8 実装を見送ったのと同じ判断）

### D. 巨大関数の前段抽出（Phase5 相当）

**切る位置は感覚で決めず、`develop` と同じく「境界を跨ぐ変数の数」を実測して決めた**
（`.cache/boundary-scan.mjs`。各候補について「前半で宣言され後半で参照される変数」を数えたもの）。

| 関数 | 本体 | 最も薄い境界 | 扱い |
| --- | --- | --- | --- |
| `applyVisionResultsToAihints` | 230 行 | **2**（forms.corefolder の直前）/ 5（forms.humanoid の直前） | **抽出した** → 120 行 |
| `main` | 176 行 | **4**（DB 本体を読む直前） | **抽出した** → 118 行 |
| `buildAihintsFromAppearanceDetail` | 240 行 | 6 / 9（前段が 10〜22 行と小さすぎる）→ 14 → 24 / 28 / 16 / 16 → 8 / 7（後段が 7 行） | 据え置き |
| `patchFileText` | 300 行 | 2 / 3（前段が 3 行）→ 6〜14 | 据え置き |

- **`applyVisionResultsToAihints`** … common / corefolder / humanoid の 3 ブロックが crossing 2〜5 で
  自然に割れる。C. のヘルパー群へ委譲する形で 230 → 120 行
- **`main`** … `resolveDbTarget(opts)` を抽出。「対象 DB のパス解決 + AI_Optout ゲート +
  `_Secondaries` / `_Commons` 注入」まで。**ファイルを一切書き換えない前段**なので単体で追える
  （`develop` の `loadDetailRenderContext()` が「DOM に触れない」単位だったのと同じ性質）
- **`buildAihintsFromAppearanceDetail`** … crossing 14 の位置が 1 箇所あるが、抽出すると 14 個の値を
  返すことになり、かつ中盤の密結合部（24 / 28）はそのまま残る。効果に対して差分が大きいため見送り
- **`patchFileText`** … 300 行のほぼ全部が「レコードごとの for ループ本体」で、薄い継ぎ目が存在しない。
  ループ本体の抽出は `text` の再代入とインデックス操作を跨ぐため、リスクに見合わないと判断

---

## 影響範囲（編集したファイル）

**コード**

- `pkg/cloudflare/scripts/migrate-common.mjs`（新規 323 行）※ `develop` 由来
- `pkg/cloudflare/scripts/migrate.mjs`（527 → 344 行）※ `develop` 由来
- `pkg/cloudflare/scripts/migrate-aihints.mjs`（293 → 178 行）
- `tools/patch-aihints.mjs`（4311 → 4325 行。重複を消してヘルパー 5 本 + JSDoc を足したため
  総行数は微増。個別の巨大関数は上表のとおり縮んでいる）

**テスト**

- 新規 `tests/migrate-common.test.js`（26 件）※ `develop` 由来。wrangler は起動しない
- 新規 `tests/patch-aihints.vision-apply.test.js`（14 件）

**ドキュメント**

- `CHANGELOG.md`（`develop` 側 1 件 + `addon-ai-tag` 側 1 件）
- 本ログ / `_work_in_progress/README.md`

---

## 検証

### 自動テスト（実施済み）

```
npm.cmd test                  → 75 ファイル / 1309 件すべて成功
npm.cmd run agents:check      → 緑（0/2 件が要更新）
npm.cmd run data:order:check  → 緑（0/1314 レコード）
```

着手時（`develop` マージ直後）は 73 ファイル / 1269 件 → 75 ファイル / 1309 件（新規 40 件）。

### 挙動不変の裏取り（実施済み）

リファクタ前に dry-run の標準出力を保存し、リファクタ後と差分を取った。

| コマンド | 結果 |
| --- | --- |
| `migrate.mjs --dry-run --repo-root .` | **427 行が完全一致**（差分ゼロ） |
| `patch-aihints.mjs --work NumberTales --db Primary --suggest` | **完全一致** |
| `patch-aihints.mjs --work NumberTales --db Primary` | **完全一致** |
| `migrate-aihints.mjs --dry-run --repo-root .` | **差分 2 行**（下記） |

`migrate-aihints.mjs` の 2 行は、乖離 #6 の解消により
`Works_CommonReferences/DataBases/db_meta.json` の**読み込み失敗警告が出なくなった**もの。
投入件数（92 件）は変わらない。**意図した改善**。

### 実機確認 — wrangler 経由の D1 投入（実施済み）

**乖離 #1〜#3 の切り分け**（`.cache/verify-d1-wrangler.mjs` / `.cache/verify-d1-isolate.mjs`。
いずれも `SELECT COUNT(*)` のみの**読み取り SQL で書き込みゼロ**）:

| 検証 | 起動条件 | 結果 |
| --- | --- | --- |
| (A) 現行実装 `createD1Runner` | `--config` / shell / 相対パス すべてあり | **OK**（92 rows read, 0 rows written） |
| (B) 旧 `migrate-aihints.mjs` の再現 | すべて無し | **FAILED** — `spawnSync npx ENOENT` |
| (C) `--config` だけ落とす | shell / 相対パス あり | **OK** |
| (D) SQL パスだけ絶対パスに戻す | `--config` / shell あり | **FAILED** — `Unknown arguments: Code, Userfile\100BeautiesLab_CreationsDB\...` |
| (E) 対照群（現行と同条件を直接起動） | すべてあり | **OK** |

- **#2 は実バグと確定**（B）。旧実装は**この Windows 環境では一度も起動できていない**。
  D1 に 92 件が入っていたのは CI（`cf-api-sync.yml` の Linux ランナー）経由の投入によるもので、
  Linux では `shell: true` が不要なため顕在化しなかった。
- **#3 も実バグと確定**（D）。`shell: true` を足しただけでは不十分で、リポジトリの絶対パスに
  スペース（`VisualStudio Code Userfile`）が含まれるため wrangler の引数が分割される。
  **#2 と #3 は両方直して初めてローカル実行が通る。**
- **#1 は実害なしと判明**（C）。`--config` を落としても DB 名 `creationsdb-d1` から解決できた。
  `migrate.mjs` の注釈が記録する「`database_id` を解決できない」状況は本環境では再現しない。
  害はないので予防的措置として残すが、**当初「実バグ」と書いたのは誤りだったので訂正する**。

**実投入**（`node pkg/cloudflare/scripts/migrate-aihints.mjs --repo-root .`）:

- `--clean` は**使っていない**（`DELETE FROM aihints` を避け、`INSERT OR REPLACE` のみの冪等な実行にした）。
  CI は `--clean` 付きで実行する（`cf-api-sync.yml`）。
- 10 バッチすべて `[D1] ✓`、**92 件投入して完了**。
- 投入後の D1 確認: `SELECT work_key, db_name, idx_key, COUNT(*) FROM aihints GROUP BY ...`
  → `#Works_NumberTales` / `Primary` / `idx_key = "Num"` / **92 件**。
  `NumberTales` の `$IndexDef` はフラット型なので `"Num"` が正しく、**乖離 #4 が latent である裏付け**にもなった。

### テストが実際にリグレッションを捕まえる状態

`applyVisionResultsToAihints` は既存テスト（`patch-aihints.palette.test.js`）が palette 中心で、
`silhouette_notes` / `ai_tags` / corefolder と humanoid の差は未カバーだった。
**リファクタ前に `tests/patch-aihints.vision-apply.test.js`（14 件）を先に書き、現行実装で
緑になることを確認してから**抽出した。特に corefolder（追記）と humanoid（置換）の
意図的な差を固定するケースを入れてある。

---

## 未完了タスク

- **`--apply-vision-results` の実データ実行は未検証**。自動テストは合成データまでで、
  実際に `.cache/vision-results.json` を用意した実行は行っていない（Agent の画像解析セッションが必要）。
- **乖離 #4 の顕在化条件**: 現在 AIHints を持つのは `NumberTales/Primary` のみで `$IndexDef` が
  フラット型のため、このバグは latent（実機確認でも `idx_key = "Num"` が正しいことを確認済み）。
  ネスト型 `$IndexDef` の作品（`FLInvestigator78` 等）へ AIHints を広げる際に効いてくる。
- **`--clean` 付きの実行は未検証**。今回は `INSERT OR REPLACE` のみの冪等な実行に留めた。
  CI（`cf-api-sync.yml`）は `--clean` 付きで走るが、`DELETE FROM aihints` を伴うためローカルでは試していない。
- **`migrate.mjs` 本体（records / works / dbs + R2）の実投入も未実施**。共通化の影響を受けるが、
  dry-run 出力の完全一致と、同じ `createD1Runner` を通る `migrate-aihints.mjs` の実投入成功までで確認を止めている。

### `develop` から引き継いだ未確認事項

`develop` のリファクタリング記録に**ブラウザ実地確認が未実施**と残っている
（SW 3 スコープの再登録 / キャラシート / 相関図）。マージでこれが `addon-ai-tag` にも入ったが、
本作業では SW / UI に触れていないため、`develop` 側の課題として引き継ぐ。

---

## 参考リンク

- [`2026-08-08_progress_sw-ui-refactor.md`](./2026-08-08_progress_sw-ui-refactor.md) — `develop` 側の元リファクタ
- [`AGENTS.md`](../AGENTS.md) — 正典（ブランチ運用方針 / 作業の粒度）
- [`docs/aihints-spec.md`](../docs/aihints-spec.md) — AIHints 仕様
- [`pkg/cloudflare/README.md`](../pkg/cloudflare/README.md) — マイグレーション手順
