# 2026-09-06 進捗: AIHints seed 本体（NumberTales `DB_SemiPrimary` / `DB_SelfSecondary`）

> ブランチ: `addon-ai-tag`（AIHints は `develop` に含めない運用）

## 目的

下流リポジトリ [100BeautiesLab_CreationsAI](https://github.com/radiann-kswg/100BeautiesLab_CreationsAI) の
[Issue #1](https://github.com/radiann-kswg/100BeautiesLab_CreationsAI/issues/1) 「依頼1: AIHints の収録範囲拡大
（SemiPrimary / SelfSecondary）」への対応。

> character レコード 159 件中 67 件が `has_ai_hints: false`（`3x11` を含む SemiPrimary / SelfSecondary が丸ごと該当）。
> GeneratorsAI の `get_characters()` は `has_ai_hints` で絞るため、これらはローカル manifest から列挙できず
> 実 API フォールバック頼み（オフライン・API 障害時に生成不可）。

`_work_in_progress/2026-07-17_progress_aihints-scope-semiprimary-selfsecondary.md` で基盤整備（opt-out 判定バグ修正・
Class 辞書合流・`AI_Unready` ゲート）は完了しており、未完了タスクとして残っていた **seed 本体**を実行した。

同ログでは seed の前提を「`AppearanceDetail` の入力待ち」としていたが、着手時点で
**画像を持つレコードの `ColorPalette` は 100%（13/13・8/8）、`AppearanceDetail` も 21 件中 16 件**が揃っており、
scaffold だけでなく中身の入った AIHints を機械生成できる状態になっていた。

## 変更点の要約

### 1. seed 本体（4 段パイプライン）

新規コードは書かず、既存モードの組み合わせだけで実施した。

| 段 | コマンド | 結果 |
| --- | --- | --- |
| 1. scaffold | `--all --suggest --apply` | SemiPrimary `patched=11` / SelfSecondary `patched=7` |
| 2. 構造由来タグ | `--records <AppearanceDetail 保有分> --apply-appearancedetail --apply` | `appearancedetail-applied=10` / `=5` |
| 3. パレット | `--all --apply-colorpalette --apply` | `palette-applied=11` / `=7` |
| 4. JSON 由来 TODO | `--all --fill-todos --apply` | `todos-filled=9` / `=7` |

**計 18 レコードに AIHints が入った**（SemiPrimary 11 / SelfSecondary 7）。Issue が名指ししていた `3x11` を含む。

第 2 段だけ `--records` で対象を絞ったのは、`--apply-appearancedetail` が
「`AppearanceDetail` が無い／全空のレコードは AI タグ系を空配列にクリアする」fallback を持つため。
第 1 段の scaffold を潰さないよう、`AppearanceDetail` を持つレコードだけへ適用した。

対象外の内訳（＝依頼1の到達上限）:

| 除外理由 | SemiPrimary | SelfSecondary |
| --- | ---: | ---: |
| `skipped-no-image`（参照画像が 1 枚も無い） | 43 | 115 |
| `skipped-progress`（`AI_Unready` な `Progress`） | 2 | 1 |
| `skipped-ai-optout`（`_Secondaries` のカテゴリ単位 opt-out） | 0 | 2 |

**`skipped-no-image` の 158 件は画像を追加しない限り機械生成できない。** 依頼1 は「画像を持つ全レコード」で完了しており、
残りは画像投入待ちという別軸のタスクになる（依頼2 とは独立。あちらは既存画像の解像度の話）。

### 2. `--resync-structural` を収束させた

seed 直後は SemiPrimary `resync-applied=10` / SelfSecondary `=5` となり、**no-op ではなかった**。
このまま push すると `.github/workflows/aihints-structural-resync.yml` が即座に差分を検出して PR を起こすため、
先に `--resync-structural --apply` を実行して provenance（`AIHints._meta`）を記録済みの状態へ収束させた。

適用後の dry-run は **3 DB とも no-op**:

```
Primary        resync-unchanged=92, skipped-no-aihints=13
SemiPrimary    resync-unchanged=11, skipped-no-aihints=45
SelfSecondary  resync-unchanged=7,  skipped-ai-optout=2, skipped-no-aihints=116
```

`--apply-colorpalette` の結果が resync で失われていないことを 18 件全件で確認済み（`palette_priority` の差分 0 件）。

### 3. `tools/patch-aihints.mjs`: `--records` が `.` を含む Num を弾いていた（既存バグ）

`parseRecordSpec()` の許可文字集合が `^[0-9A-Za-z_\-]+$` で、`777.Jackpot` / `777.Jackpot-mp` を
`Invalid --records token` で throw していた。同ファイルの `compareNums()` の JSDoc 自身が
`"777.Jackpot-mp"` を実在 Num として挙げており、単純な取りこぼし。

**兄弟ツール `tools/patch-colorpalette.mjs` の同名関数**は「範囲でも純整数でもなければそのまま文字列 Num」で通しており、
そちらへ揃える形で許可文字の列挙を削除した（`%` / `∞` 等の他の string Num にも同時に効く）。
不正トークンは throw ではなく「どのレコードにも一致しない」＝実質 no-op に落ちるが、
これは元々許可文字集合内の未知トークンで起きていた挙動と同じで、新しい失敗モードは増えていない。

### 4. テスト更新

| ファイル | 変更 |
| --- | --- |
| `tests/patch-aihints.gates.test.js` | 「SemiPrimary / SelfSecondary には AIHints がまだ無い」→「seed 済みで、AIHints は参照画像を持つレコードだけに付く」へ差し替え |
| `tests/aihints.schema.test.js` | レコード側 `describe` を `describe.each` で 3 DB へパラメータ化。corefolder NLD のテンプレ判定は `TODO:` プレースホルダをスキップ |

ゲートテストは**件数のスナップショットにしなかった**。同ファイルの方針
（2026-08-13 / 08-14 の CI 連続失敗を受けた「データが増えても成立し続ける規則だけを固定する」）に従い、
「AIHints を持つレコードは必ず `Images` を持つ」＝画像ゲートが実効していることだけを固定した。
User が画像を追加して seed 対象が増えても落ちない。

> **2026-07-17 ログの予測が 1 つ外れた**: 「両 DB には humanoid 画像が 0 枚のため `forms.humanoid` は欠落する見込み」
> としていたが、humanoid form は**参照画像ではなく `AppearanceDetail` の `Formation: "humanoid"` エントリ**から
> 生成されるため、corefolder 画像しか無い両 DB にも humanoid form が 10 件 / 5 件できた。
> 予定していた `expectHumanoid` フラグは不要だったため入れていない。

## 影響範囲（編集ファイル）

- `data/Works_NumberTales/DataBases/db_SemiPrimary.json`（AIHints 11 件追加）
- `data/Works_NumberTales/DataBases/db_SelfSecondary.json`（AIHints 7 件追加）
- `tools/patch-aihints.mjs`（`parseRecordSpec` の許可文字集合を削除）
- `tests/aihints.schema.test.js` / `tests/patch-aihints.gates.test.js`

**`data/Works_NumberTales/DataBases/db_Primary.json` は 1 バイトも変更していない**
（`git status` に現れない／`AIHints` 件数 92 のまま／`resync-unchanged=92`）。

## 検証

- `npm test`: **81 ファイル / 1480 件すべて成功**
- `npm run data:order:check`: **0/1337**（21 ファイルすべて正準順。AIHints が最終キーであることを含む）
- `npx prettier --check`（更新した 2 つの JSON）: 準拠
- `--resync-structural` dry-run が 3 DB とも no-op（上記）

> **注意（作業中に踏んだ罠）**: `npx prettier --write` を `tests/*.js` / `tools/*.mjs` へ実行してはいけない。
> 本リポジトリの JS/MJS は 4 スペース + シングルクォートで書かれており prettier 準拠ではない
> （`.claude/settings.json` の PostToolUse フックも `.json` だけを対象にしている）。
> 誤って実行すると 6,000 行超の一括整形差分が出る。今回は気づいて `git checkout HEAD --` で戻し、
> 編集分だけを入れ直した（最終差分は 3 ファイル計 32 行）。

## 未完了タスク

- [ ] **視覚情報の TODO 補完（User 入力 or vision prompt 待ち）**。機械生成できない項目が 47 件残る。
      内訳: `age_appearance`（`ConceptAge` 未設定）9 / `eye color` 6 / `hair color` 6 /
      `natural_language_description` 6 / `expression_tendency`（`Character` 未設定）3 /
      `ear type`（`AppearanceDetail` に `#Element_Ear` エントリが無い）3 / corefolder 衣装系 6 /
      `AppearanceDetail` を持たない 3 件（SemiPrimary `#222` / SelfSecondary `#223` `#753`）の body_description・attached_items 8。
      補完経路は `.github/prompts/aihints-fill.prompt.md`。
- [ ] `#444` / `#444-mp` の corefolder NLD が `"a spherical cushion-like body in Fox"` となっている。
      `silhouette_notes.body_description` の先頭要素（`"Fox"`）を base color として拾ってしまうため。
      `AppearanceDetail` 側の記述で解決するのか、抽出側で色語だけを拾うようにするのかは要判断。
- [ ] `migrate-aihints.mjs` の per-record `_Secondaries` opt-out 判定（現状 DB レベルのみ）。
      **SelfSecondary に AIHints 実データが入ったため latent ではなくなった**。同 DB は
      `skipped-ai-optout=2` のカテゴリを持つ。D1 投入前に対応が必要。
- [ ] 下流（CreationsAI）へ反映後、`has_ai_hints: false` の残件数を再計測して Issue #1 へ報告する。

## 参考リンク

- 上流の基盤整備ログ: `_work_in_progress/2026-07-17_progress_aihints-scope-semiprimary-selfsecondary.md`
- 仕様: `docs/aihints-spec.md` / `docs/ai-hints-usage.md` / `docs/api-sw-spec.md` §5.5
- 下流 Issue: https://github.com/radiann-kswg/100BeautiesLab_CreationsAI/issues/1
- 下流 PR（回避策として下流側で `derived` AIHints を生成する提案）: https://github.com/radiann-kswg/100BeautiesLab_CreationsAI/pull/2
