# 2026-08-19 進捗: `D-Vines` への `AI_Optout` 宣言と、opt-out テスト回路の整備

> 作業環境: **sub1**（サブローカル） / ブランチ: `addon-ai-tag`
> `README.LOCAL.md` の `## 作業分担`（2026-08-09 更新）で sub1 は「DB の更新作業」と
> 「`addon-ai-tag` ブランチへのマージ作業」を担当。本作業は担当範囲内。

## 目的

`addon-ai-tag` でステージされていた `AI_Optout` の宣言変更（データ側）に対して、
ドキュメントと注釈を追従させる。あわせて、opt-out のテスト回路が
「宣言を列挙するスナップショット」になっていて壊れやすい状態を解消する。

## 背景・課題

ステージ済みだったデータ変更は次の 3 箇所（`Works_NumberTales/DataBases/db_meta.json`）。

| 宣言箇所                                                                                | 変更                           |
| --------------------------------------------------------------------------------------- | ------------------------------ |
| `#DB_SelfSecondary._Secondaries`「散狐アタストさん協賛」（`sec_SeriesTitle: "D-Vines"`）   | 新規宣言 → `true`              |
| `#DB_Secondary._Secondaries`「散狐アタストさん協賛」（同上）                              | 未宣言だったのを `true` で明示 |
| `#DB_Secondary.#DB_UnprocessedSecondary`（ネスト DB / `DB_Hidden: true`）                 | `false` → `true`               |

ここで問題になったのが `#DB_SelfSecondary` の扱い。2026-07-17 に
「`AI_Optout` を権利軸へ純化」（catch-all の `true` を `false` へ倒した修正）を入れており、
その回帰テストが **「SelfSecondary の全カテゴリが `false`」という全称**だった。
D-Vines カテゴリへ `true` が入ったことで、この全称が成立しなくなっていた。

- ただしこれは**純化の巻き戻しではない**。2026-07-17 に落とした `true` は
  「キャラデザ未着手なので AI へ空データを渡したくない」という**充填ガードの代理**であり、
  その意味論は既に `AI_Unready`（Progress ゲート）と画像ゲートへ移譲済み。
- 今回の `true` は **第三者（散狐アタストさん）の関与に基づく権利軸の宣言**で、向きが逆。
  D-Vines は散狐アタストさんの提案による協賛シリーズであり、User 単独作ではない。

加えて、テストがそもそも**宣言箇所の列挙**に依存していたため、
2026-08-13 / 08-14 に Progress ゲートで起きたのと同じ「データが増えるたびに CI が落ちる」
構造を抱えていた（`2026-08-14_progress_aihints-resync-gate-test.md` 参照）。

## 変更点の要約

### 1. `tests/patch-aihints.gates.test.js`（opt-out テスト回路の整備）

旧 `describe('AI_Optout の宣言（db_meta.json）')`（2 件）を、2 つの describe・6 件へ作り替えた。
方針は **「宣言を列挙せず、データが増えても成立し続ける規則だけを固定する」**。

**A. 全作品横断の規則**（`scanAllDbMeta()` で全 37 個の `db_meta.json` を 1 回だけ走査）

| テスト                                            | 何を防ぐか                                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 宣言キーの綴りは `AI_Optout` ちょうど 1 種類      | `AI_OptOut` 等の綴り違いは例外にならず、既定の `false`＝**許可**へ黙って落ちる（権利上の事故）              |
| 値は必ず boolean                                  | 文字列 `"false"` は truthy。型が崩れると判定が意図と真逆になる                                              |
| 第三者関与カテゴリは必ず `AI_Optout: true`        | `sec_DesignedBy` に User(`RadianN`) 以外が入る＝第三者の権利が絡む。新しい共同/協賛シリーズの宣言忘れを検知 |

- **走査は再帰**にした。DB エントリは実データでネストしうる（`#DB_Secondary.#DB_UnprocessedSecondary`）ため、
  `Databases.#DB_*` の 1 階層だけを見る実装ではネスト DB の宣言を取りこぼす。
- 第三者ルールは**片方向の含意**。逆（User 単独なら `false`）は成り立たない
  — SelfSecondary の D-Vines は `sec_DesignedBy: ["RadianN"]` でも `true`。

**B. NumberTales の意味論の骨格**（実データ。Num は列挙しない）

- User 単独作 3 DB（Primary / SemiPrimary / SelfSecondary）は **DB レベルで** `false` を明示。
- `#DB_Secondary` は全 `_Secondaries` カテゴリ＋ネスト DB が `true`
  （**固定対象を SelfSecondary から移した**。Secondary 側は全カテゴリが第三者デザインを含むため
  全称が構造的に成立し、カテゴリ追加時も `true` であるべき側なのでスナップショットとして安定する）。
- `#DB_SelfSecondary` はカテゴリ単位で opt-in / opt-out が**混在**し、`findSecondaryDef` が
  実データのレコードを撃ち分ける（D-Vines のみ opt-out / 「リクエストナンバー」は opt-in のまま）。
  後者は 2026-07-17 の本命バグ（`sec_SeriesTitle: null` が複数ある DB での誤スキップ）の回帰でもある。

### 2. `tests/patch-aihints.classdict.test.js`（注釈のみ）

`develop` の `8829fae`「DB構造整備 bugfix」で `dict_Class.json` の `Class` が
`1桁番(ユニデジッツ)` → `1桁番` へ直り、ルビ付きの表示形は `Class_JP` へ移った。
`loadMergedClassDictEN()` は `Class`（＝レコードの `Class` 配列に入る生値）をキーにするため、
テストの期待キーもルビ無しへ追従する必要があった（AGENTS.md「データ更新時のテスト追従」）。
**理由が読み取れるよう注釈を追加**した（コード自体は既にステージ済みの変更のまま）。

### 3. ドキュメント

| ファイル                | 変更                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `docs/api-sw-spec.md`   | §5.5「適用状況」を 2026-08-19 時点へ更新。SelfSecondary のカテゴリ混在・ネスト DB を追記し、**純化の巻き戻しではない**旨を明記。テスト回路の方針も 1 段落追加 |
| `docs/aihints-spec.md`  | 「既知の未対応」（`migrate-aihints.mjs` のカテゴリ単位未対応）に、対象 DB が `#DB_SelfSecondary` へ広がり **seed 前の対応が必須**になったことを追記 |
| `docs/ai-hints-usage.md`| §9 の適用範囲を更新。dry-run の内訳を表へ起こして再計測値へ差し替え、`skipped-ai-optout=2` の意味と seed 時の注意を明記。`#DB_Secondary` の記述へネスト DB を追記 |
| `CHANGELOG.md`          | 本変更のエントリを追加                                                                                            |

## 影響範囲

- `data/Works_NumberTales/DataBases/db_meta.json`（ステージ済み。本作業では変更していない）
- `tests/patch-aihints.gates.test.js` / `tests/patch-aihints.classdict.test.js`
- `docs/api-sw-spec.md` / `docs/aihints-spec.md` / `docs/ai-hints-usage.md`
- `CHANGELOG.md` / 本ログ / `_work_in_progress/README.md`

## 検証

- `tests/patch-aihints.gates.test.js` + `tests/patch-aihints.classdict.test.js`: **26 件成功**（22 → 26）。
- **「わざと壊して赤くなること」を 4 通りで確認**（いずれも確認後 `git checkout --` で復元）:
  1. `AI_OptOut`（綴り違い）を混入 → 綴りテストが失敗し、該当パスをメッセージに出す
  2. 値を文字列 `"true"` に → boolean テストが失敗
  3. 第三者カテゴリ（`sec_DesignedBy: ["Atast"]`）の `AI_Optout` を削除 → 第三者ルールが失敗
  4. SelfSecondary の D-Vines を `false` に戻す → 混在テストが失敗
- dry-run（`node tools/patch-aihints.mjs --suggest --work NumberTales --db <DB>`、書き込みなし）:
  - `SemiPrimary`: `patched=10, skipped-no-image=43, skipped-progress=3`
  - `SelfSecondary`: `patched=7, skipped-ai-optout=2（Num 266 / 314）, skipped-no-image=115, skipped-progress=1`

## 未完了タスク / 申し送り

- **`migrate-aihints.mjs` のカテゴリ単位 `AI_Optout` 未対応**（優先度が上がった）。
  カテゴリ単位 opt-out を持つ DB が `#DB_Secondary` に加えて `#DB_SelfSecondary` にも生まれた。
  後者は AIHints の **seed 予定 DB** なので、seed 前にレコード単位の 3 軸解決を実装する必要がある。
  現時点では書き込み側（`tools/patch-aihints.mjs`）が `skipped-ai-optout` で止めているため latent。
- **`#DB_SelfSecondary` を seed するときは Num `266` / `314` を除く**。`--force-ai-optout` で通さないこと。
- `docs/ai-hints-usage.md` §9 の dry-run 値は 2026-08-19 再計測。キャラ追加で動くので、
  次に seed する際は再計測してから更新すること（テスト側はこの値を固定していない）。

## 参考リンク

- 仕様: `docs/api-sw-spec.md` §5.5 / `docs/ai-hints-usage.md` §7 / `docs/aihints-spec.md`
- 前提となる経緯: `CHANGELOG.md`「`AI_Optout` を権利軸へ純化」(2026-07-17)
- テストの脆さ解消の先例: `2026-08-14_progress_aihints-resync-gate-test.md`
- AIHints 残課題台帳: `2026-07-14_progress_addon-ai-tag-log-inventory.md`
