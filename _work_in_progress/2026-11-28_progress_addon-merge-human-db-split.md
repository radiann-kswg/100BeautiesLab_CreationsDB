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

## 追記: 参照画像 URL の検出回路（同日）

マージコミット `14bd1dfb` を push したあと、再同期が参照画像を作り直さない件へ対応した。

- `--fix-refs` を AIHints のある全 DB へ試し打ちして差分を調べた（ファイルは元へ戻した）。獣爾騎兵・豹変系女子は差分なし。NumberTales は次の 2 種類だけが変わる。
  - 切れた URL 6 本: `SemiPrimary` の `777`・`777.Jackpot`、`SelfSecondary` の `777-mp`・`777.Jackpot-mp` の `concept_variants`。画像の改名に追従していなかった。
  - 空欄の穴埋め: `Primary` の 80（corefolder / humanoid）と `SemiPrimary` の 333（humanoid）の `reference_images` が `null`。
- 切れた URL は `--fix-refs --records` で該当 4 レコードだけ作り直した。空欄の 2 レコードは意図が分からないため触っていない。
- `--fix-refs` を自動再同期へ組み込む案は採らなかった。`--all` は空欄や手で据えた参照画像まで作り直すため。代わりに、切れた URL を `npm test` で検出する（`tests/aihints.schema.test.js`）。修正前のデータで落ちることを確認済み。
- `docs/ai-hints-usage.md` §9.10 に手順を追記。

## 未完了タスク

- [ ] 上記追記分の push（User の判断）。
- [ ] `cf-api-sync` の成功と `/api/ai/NumberTales/PrimaryHuman/aihints/0` の応答を確認する。
- [ ] CreationsAI 自動同期（`sync-dataset.yml`）の結果を確認する。
- [ ] 80・333 の `reference_images` が `null` のままでよいか（User の判断。埋めるなら `--fix-refs --records 80` 等）。
