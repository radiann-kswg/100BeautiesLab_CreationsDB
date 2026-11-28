# 2026-11-28 `addon-ai-tag` への取り込み: NumberTales 人間キャラクターの DB 分離

作業環境: `sub1`（サブローカル）/ ブランチ `addon-ai-tag`。`origin/develop`（`483b1c52`）をマージ。push は未実施。

`develop` 側の経緯は [2026-11-28_progress_numbertales-human-db-split.md](./2026-11-28_progress_numbertales-human-db-split.md)。

## 目的

`develop` で `Primary` の `0`・`00`、`SemiPrimary` の `%`・`∞` が `PrimaryHuman` / `SemiPrimaryHuman` へ移った。
本ブランチだけが持つ AIHints・`Images_Appearance` を移動先へ引き継ぎ、AIHints ツール・本番 API 同期・CreationsAI が新 DB 名で動くことを確認する。

## 変更点の要約

- マージの衝突は `CHANGELOG.md` と `db_Primary.json`（7 箇所）。後者は「両側が `Relation` の直後へキーを足した」5 箇所と、`0`・`00` の削除が絡む 2 箇所。
- `db_Primary.json` はレコード / キー単位のテキスト 3-way で解決した（書式を保つため再シリアライズしない）。同じキーを両側が触ったのは 95 の `AppearanceDetail` だけで、そこは行単位でマージできた。
- `0`・`00` の `Images_Appearance` と `AIHints` を `db_PrimaryHuman.json` へ移した。`%`・`∞` は本ブランチ固有のキーを持たないため移すものは無い。
- 移した AIHints の `reference_images`（6 箇所）を `Images/DB_Primary/` から `Images/DB_PrimaryHuman/` へ更新。値は `patch-aihints.mjs --fix-refs` の出力と一致することを確認し、書式を保つため同じ置換をテキストで当てた。
- `tests/patch-aihints.gates.test.js`: `0`・`00` の読み込み先を `db_PrimaryHuman.json` へ変更。
- キー順は `npm run data:order:write` で整列。

## 検証

| 観点 | 結果 |
| --- | --- |
| マージ結果の意味レベル検算（両側の変更を落としていないか） | 両側が変更した JSON 5 ファイルすべて一致 |
| `npm test` | 103 ファイル 1878 件成功 |
| `npm run data:order:check` / `agents:check` | 差分なし |
| `patch-aihints.mjs --resync-structural`（NumberTales 5 DB・dry-run） | 変更なし。`any` は `Progress=stillTentative` のため scaffold 対象外 |
| `sync-numbertales-art.mjs --check` | 更新対象 0 ファイル |
| `migrate.mjs --dry-run` | `PrimaryHuman` 3 件 / `SemiPrimaryHuman` 2 件を D1・R2 の対象に含む |
| `migrate-aihints.mjs --dry-run` | `PrimaryHuman` 2 件（`0`・`00`）。`Primary` は 93 件 |
| CreationsAI `build-dataset.js` / `validate-dataset.js`（このツリーを入力に、出力は作業用フォルダ） | 成功。許可 187 件で変わらず、`0`・`00` は `db_PrimaryHuman.json` 由来で AIHints 付き |

## 本番 API の状態（2026-11-28 17:50 JST 時点・読み取りのみ）

- `develop` の push で `cf-api-sync` が走り、レコードと R2 は新構成へ切り替わっている（`/api/v1/NumberTales/PrimaryHuman/records/0` が 200、`Primary/records/0` は 404）。
- `aihints` テーブルは本ブランチの同期でしか更新されないため、前回同期（`ba600515`）の `Primary` / `0`・`00` 行が残り、`PrimaryHuman` 側の行は無い。残っている行の参照画像 URL（`Images/DB_Primary/concept/cnsp_imgNTS-0.png`）は 404。
- AI 画像許可表は `develop` の同期で無効化されており、本ブランチの同期が完了するまで再公開されない（設計どおり）。
- 本ブランチを push すると `migrate.mjs --clean` → `migrate-aihints.mjs --clean` → 許可表の公開が走り、上記は解消する見込み。

## 未完了タスク

- [ ] 本ブランチの push（User の判断）。push 後、`cf-api-sync` の成功と `/api/ai/NumberTales/PrimaryHuman/aihints/0` の応答を確認する。
- [ ] push 後の CreationsAI 自動同期（`sync-dataset.yml`）の結果を確認する。
- [ ] `patch-aihints.mjs --resync-structural` は `reference_images` を作り直さない。今後レコードを別 DB へ移すときは `--fix-refs` を併せて実行する（手順書への追記は未実施）。
- [ ] 80 の `forms.*.reference_images` が `null` のまま（`--fix-refs` で埋まる。今回のマージとは無関係の既存状態）。
