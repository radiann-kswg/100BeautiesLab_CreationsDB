# CI の Node バージョン不整合の修正（AIHints 構造的再同期の失敗解消）

- 日付: 2026-09-04
- 作業ローカル: `main`（本体ローカル）
- 対象ブランチ: `develop`（共通分）→ `addon-ai-tag`（AIHints 分）
- 起点: [Actions run 33830375654](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/actions/runs/33830375654)（`addon-ai-tag` / AIHints 構造的再同期）

## 目的

AIHints 構造的再同期ワークフローが「テスト」ステップで失敗し続けていた問題の原因を特定し、恒久修正する。

## 原因（確定）

再同期処理そのものは成功していた（「構造的再同期の実行」「差分の判定」ともに ✓）。落ちていたのは後段の `npm test`。

```
TypeError: webidl.util.markAsUncloneable is not a function
  ❯ new CacheStorage node_modules/undici/lib/web/cache/cachestorage.js:20:17
  ❯ Object.<anonymous> node_modules/jsdom/lib/api.js:12:33
```

- `jsdom@30.0.1` → `undici@8.10.0`（`engines: node >=22.19.0`）が
  `require('node:worker_threads').markAsUncloneable` を使用。
- `markAsUncloneable` は **Node 22.10.0 以降にしか存在しない**。
- 全ワークフローが `node-version: "20"` 固定だったため `undefined` となり、
  jsdom を使う 4 スイートが import 段階で落ちていた
  （`pages.characters.ui-output` / `pages.characters.url-params` /
  `pages.characters.value-format` / `section-renders.relation`）。
- **ローカル検証をすり抜ける構造**: 本体ローカルは Node v24.16.0 で `npm test` が
  81 files / 1466 tests 全緑になるため、手元では再現しない。

### 既知の未着手案件だった

`_work_in_progress/` に **8/29・8/31・9/2 の 3 回**トリアージ済みで、同じ対処案
（`engines.node` 引き上げ＋ワークフローの Node 22 化）が提案されたまま未着手だった。
今回はその提案どおりに実施している（上流フレームワーク側も 8/26 の `a53970b` で同じ解き方）。

## 変更点

### `develop` 側（共通分）

- `.github/workflows/cf-api-sync.yml`（2 箇所）/ `gcal-sync.yml` / `jekyll-gh-pages.yml`
  … `node-version: "20"` → `"22"`
- `package.json` … `engines.node` を `>=18.0.0` → `>=22.19.0`（実態に合わせた）
- `AGENTS.md` … 「テスト戦略」の Node 記述を 22.19.0 以上へ更新し、**下限の根拠を 1 行追記**（再発防止）
- `.github/copilot-instructions.md` … `npm run agents:build` で追従（生成物）
- `CHANGELOG.md` … 経緯と下流への申し送りを追記

### `addon-ai-tag` 側（AIHints 分）

- `.github/workflows/aihints-structural-resync.yml`
  … `node-version: "20"` → `"22"`、あわせて `actions/checkout@v4` / `actions/setup-node@v4` を
  他ワークフローと同じ `@v7` へ（Node 20 deprecation 警告の解消）

## 影響範囲

- CI のみ。アプリコード・データ・スキーマは無変更。
- `engines.node` の引き上げは**下流 2 本へ波及**する。`.github/**` は同期対象外なので、
  下流の CI の Node 固定は各リポジトリ側で個別に 22 以上へ揃える必要がある。

## 検証

- ローカル（Node v24.16.0）で `npm test` … **81 files / 1466 tests 全緑**
- `npm run agents:check` … 生成物は正典と一致

## 未完了タスク

- [ ] `develop` / `addon-ai-tag` の push（User 判断）
- [ ] push 後、`data/Works_*/DataBases/db_*.json` を含む通常の push で
      AIHints 構造的再同期ワークフローが緑になることの確認
- [ ] 下流 2 本（JsonCharacterDB-Framework / RadianNs_SecondaryWorksDB）の CI Node 固定の追従
- [ ] 過去トリアージで併記されていた別件（`dependabot.yml` の存在しない `github-actions` ラベル）は**未着手**

## 参考

- `_work_in_progress/2026-08-29_github-triage.md` 項目 1
- `_work_in_progress/2026-08-31_github-triage.md` 項目 1
- `_work_in_progress/2026-09-02_github-triage.md` 項目 1
