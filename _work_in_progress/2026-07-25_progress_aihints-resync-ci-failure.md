# AIHints 構造的再同期ワークフローの失敗と復旧（2026-07-25）

## 目的

GitHub Actions「AIHints 構造的再同期」（run [30140856253](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/actions/runs/30140856253)）が
失敗した原因を特定し、復旧させる。あわせて、今回発覚したが今回の対応では**見送った件**を記録する。

> **ブランチについて**
> 修正の実体は `addon-ai-tag`（AIHints は `develop` に含めない運用方針のため）。
> 本ログは `develop` 側へ置く**注記**であり、下記「見送った件」のうち Node 20 非推奨は
> リポジトリ横断の課題、辞書整備時の注意点は `develop` 側の作業者に効く申し送りである。

---

## 事象

ワークフローの `テスト` ステップ（`npm test`）だけが exit 1 で失敗し、PR 作成まで進まなかった。
再同期の実行・prettier 整形・差分判定はすべて成功しており、**ワークフローとツールのロジックは正常**だった。

```
✓ 対象 DB の列挙 / ✓ 構造的再同期の実行 / ✓ 整形 / ✓ 差分の判定
✗ テスト        ← ここだけ失敗
- PR の作成 / 更新（スキップ）
```

失敗したのは `tests/patch-aihints.classdict.test.js` の 2 アサーションのみ（他 698 件は成功）。

---

## 原因

`develop` のコミット `5a4bdcb`（DB構造整備＆情報追加(辞書周り＆所属情報)）でクラス辞書の構造が変わり、
テストの期待値が追従できていなかった。

`data/Dictionaries/dict_SymphonyXVI.json` の該当エントリ:

| 項目             | 変更前                                 | 変更後                                     |
| ---------------- | -------------------------------------- | ------------------------------------------ |
| `Class`（キー）  | `ベヴストザイン課 ヒューマノイド開発部` | `ヒューマノイド開発部(シンフォニー.XVI)`   |
| `Class_JP`（表示名） | —（未分離）                        | `ベヴストザイン課 ヒューマノイド開発部`    |
| `Class_EN`       | `Bewusstsein Division, ...`            | `Bew**ß**tsein Division, ...`（ß 表記へ）  |

`Class` が短縮キー化されて表示名が `Class_JP` へ分離され、さらに英訳の綴りも変わった。
テストは旧キー・旧綴りを**ハードコード**していたため、`dict.get(...)` が `undefined` になった。

### なぜ `develop` の CI では検知できなかったか

`tests/patch-aihints.classdict.test.js` と `tools/patch-aihints.mjs` は **`addon-ai-tag` にしか存在しない**
（ブランチ運用方針: AIHints 関連は `develop` に含めない）。
そのため `develop` 側で辞書を整備した時点ではテストが存在せず、
`develop` → `addon-ai-tag` のマージ（`8f5cf12`）で持ち込まれて初めて赤くなった。

### 実装側の不具合ではないことの確認

`AGENTS.md`「データ更新時のテスト追従」に従い、実装バグを期待値の書き換えで隠していないか検証した。

- レコード側の `Class` 値は新しい短縮キーに揃っており、カバレッジテスト（`db_Primary` / `db_SemiPrimary` /
  `db_SelfSecondary` の全 Class が辞書で解決できる）は**未解決 0 件で成功**していた
- 辞書 94 件（グローバル 17 + 作品ローカル 77）を全走査して**キー衝突ゼロ**を確認。
  短縮キー化は `ヒューマノイド開発部(シンフォニー.XVI)` のように衝突回避込みで行われている
- `loadMergedClassDictEN()` は `Class` をキーに索引する実装で、レコードの持つ値と一致している

→ 実装・データとも正しく、**テスト側の追従漏れのみ**が原因と確定。

---

## 対応

**コミット**: `dde4484`「AIHints辞書テストを新しい辞書構造へ追従」（`addon-ai-tag`）

**変更ファイル**: `tests/patch-aihints.classdict.test.js` のみ（+28 / -3）

期待値のハードコードをやめ、グローバル辞書ファイルから解決する形へ変更した。

- 「グローバル辞書が合流できているか」というテストの意図は維持
- 作品ローカルを一切読まない `loadMergedClassDictEN('NoSuchWorkXYZ')` でも同じ値が引けることで、
  その値が**グローバル由来である**ことを証明する構成にした（従来のハードコードより検証が強い）
- 創作側の改名・綴り変更だけで CI が止まる構図を解消

`npm test` = **700 件全緑**（修正前は 2 件失敗）。

---

## 検証（本番 Actions で確認済み）

| run                                                                                                   | 時刻(JST) | 結果      | 内容                                       |
| ----------------------------------------------------------------------------------------------------- | --------- | --------- | ------------------------------------------ |
| [30140856253](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/actions/runs/30140856253)     | 11:41     | ❌ failure | 報告のあった失敗                            |
| [30141731380](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/actions/runs/30141731380)     | 12:09     | ✅ success | テスト通過 → PR #14 を作成                  |
| [30141803427](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/actions/runs/30141803427)     | 12:11     | ✅ success | PR #14 マージ後の 2 周目が **no-op** で停止 |

3 本目が差分ゼロで止まったことにより、ワークフロー header に書かれている
**「PR マージ後も無限ループしない（`structuralSourceHash` 一致で no-op）」設計が実データで裏取りできた。**

PR #14（`6bf1e50`）の実差分は `#70` の `structuralSourceHash` と `lastStructuralResync` の **2 行のみ**で、
構造タグ本体は変化なし。ツールの冪等性も期待どおり。

---

## 影響範囲

- `tests/patch-aihints.classdict.test.js`（`addon-ai-tag` / `dde4484`）
- `data/Works_NumberTales/DataBases/db_Primary.json`（`addon-ai-tag` / `6bf1e50`・ワークフローが自動生成）
- `develop` 側のコード・データへの変更は**なし**

---

## 見送った件（未完了）

### 1. `actions/checkout@v4` / `actions/setup-node@v4` の Node 20 非推奨警告

失敗した run のアノテーションに以下が出ている。

> Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on
> Node.js 24: `actions/checkout@v4`, `actions/setup-node@v4`

- **現状はエラーではなく警告**。今回の失敗とは無関係
- `.github/workflows/` の他のワークフロー（`cf-api-sync.yml` / `codeql.yml` / `gcal-sync.yml` /
  `jekyll-gh-pages.yml` / `notify-ai-dataset.yml`）も同じ `v4` 系を使っている
- **1 本だけ上げると整合が取れなくなる**ため、リポジトリ横断でまとめて `v5` へ更新する別作業として見送り
- 実施する場合、AIHints 関連は `addon-ai-tag`、それ以外は `develop` と、ブランチが分かれる点に注意

### 2. ワークフローを手動で再実行する手段が無い

- `workflow_dispatch` は未設定。GitHub の仕様上、デフォルトブランチ（`develop`）にワークフローファイルが
  必要だが、本ワークフローは AIHints 専用のため `addon-ai-tag` 限定で保持している（YAML header に記載済みの既知事項）
- トリガーは `paths: data/Works_*/DataBases/db_*.json` のみ。
  **テストやツールだけを直しても再実行されない**ため、修正の効果は次に DB を更新するまで確認できない
- 今回は直後に `develop` のマージ（`79cafd1`）でデータが動いたため結果的に検証できたが、
  一般には「テスト修正だけ push → 緑を確認できない」状態が発生しうる
- 設計上の意図的な制約なので**今回は変更せず**、運用上の注意点として記録するに留める

---

## 過去の失敗との照合（2026-07-22 トリアージの仮説を訂正）

[2026-07-22_github-triage.md](./2026-07-22_github-triage.md) の §3 が、本ワークフローの
**2026-07-16 の失敗**（run [29469744422](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/actions/runs/29469744422) / `7fb4d43`）について
「DB 全体レベルの `AI_Optout: true` を持つ DB が列挙に混入し、`patch-aihints.mjs` が exit 2 で終了。
`|| true` 等のハンドリングが無いためジョブごと失敗している」という仮説を立て、
ワークフローへのエラーハンドリング追加を提案していた（ステータス: 原因仮説あり・要確認）。

**この仮説は誤りだったことを確認した。** 実行ログを確認したところ、7/16 の失敗も
`構造的再同期の実行` ステップは ✓ で通過しており、落ちていたのは今回と同じ **`テスト` ステップ**だった。

```
X AssertionError: expected [ { Num: 444, idx: +0, …(2) }, …(1) ] to have a length of +0 but got 2
 ❯ tests/data.shape.test.js:263:21
```

`AI_Optout` ガード（exit 2）は一度も発火しておらず、**ワークフローへのエラーハンドリング追加は不要**。
提案されていた応急・恒久対応はいずれも着手しないでよい。

> 7/16 の赤（`data.shape` 2 件）はその後 `develop` 側で解消され、次の run（`29471236288`）で緑へ復帰している。

---

## 申し送り

### ① このワークフローの唯一の詰まりどころは `テスト` ステップ

判明している失敗 2 件（7/16・7/25）は**どちらも `npm test` の赤が原因**で、再同期ツール本体は
一度も失敗していない。そして `テスト` ステップは**リポジトリ全体の `npm test`** を実行するため、

**AIHints と無関係な赤テストが 1 件でもあると、AIHints の再同期 PR が作られなくなる。**

`develop` 側で赤を放置したままマージすると、`addon-ai-tag` の自動 PR が静かに止まる点に注意。

### ② 辞書構造を `develop` で変更するときの注意（`develop` 側の作業者向け）

**`data/Dictionaries/` や `data/Works_*/Dictionaries/` の辞書構造を `develop` で変更すると、
`addon-ai-tag` 側にだけ存在するテストが黙って壊れることがある。**

- `develop` の `npm test` は緑のままなので、マージするまで気づけない
- 今回の再発防止として、テスト側は期待値を実データから解決する形に直したが、
  同種のハードコードが他の `addon-ai-tag` 限定テストに残っている可能性はある
- 辞書のキー体系（`Class` = 索引キー / `Class_JP` = 表示名）を変える場合は、
  `addon-ai-tag` 側で `npm test` を通してからマージすると安全

---

## 参考

- ワークフロー: `.github/workflows/aihints-structural-resync.yml`（`addon-ai-tag`）
- ツール: `tools/patch-aihints.mjs`（`loadMergedClassDictEN()`）
- 関連ログ: [2026-07-08_progress_aihints-structural-resync-proposal.md](./2026-07-08_progress_aihints-structural-resync-proposal.md)（設計提案）
- 関連ログ: [2026-07-22_github-triage.md](./2026-07-22_github-triage.md)（§3 の `AI_Optout` 仮説は誤り。上記「過去の失敗との照合」で訂正済み）
- ブランチ運用方針: `AGENTS.md`「ブランチ運用方針」
