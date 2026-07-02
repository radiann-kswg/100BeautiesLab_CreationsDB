# 進捗レポート: DeepL 下書き翻訳のキャラ文脈（GenderType・呼称）対応強化

- **日付**: 2026-07-02
- **作業ローカル / ブランチ**: 本体ローカル / `develop`
- **担当**: 扇一春（Claude / Cowork）
- **関連**: `docs/deepl-localization.md` §3-4（新規） / `docs/localization-en-rules.md` §1 / `tools/deepl/`

---

## 目的

`ConversationPattern`（`data/Works_NumberTales/DataBases/db_Primary.json` の「8(ワカツ)」）の空 `_EN` フィールドを DeepL で手動下書き翻訳したところ、`GenderType: FemaleNeutral`（she/her が正）にもかかわらず DeepL が `he`/一人称 `I` を返し、既存 `ForMasterCalling_EN: "Bro/Sis (aniki/aneki)"` とも異なる `"big bro/sis"` を返すなど、**同一レコード内の既存フィールドとの不整合**が発生した。これを毎回手作業で補正するのではなく、ツール側でレコードの既存フィールドを踏まえた下書きを出せるよう `tools/deepl/` を強化した。

---

## 変更点の要約

1. **`tools/deepl/deepl-client.mjs`**: `translate()` に任意の `context` 引数を追加（DeepL API v2 の `context` パラメータを中継）。ベストエフォートのヒントであり、DeepL は NMT のため指示としては機能しない旨を JSDoc に明記。
2. **`tools/deepl/pronoun-normalize.mjs`（新規）**: 純粋関数群。
   - `pronounPolicyForGenderType()`: `GenderType` → `she`/`he`/`ze`/`avoid`（`docs/localization-en-rules.md` §1 準拠）
   - `normalizePronouns()`: 代名詞トークンを targetPolicy へ確定的に変換（`ze/zir` 活用表対応、`her`/`zir` の目的格・所有格あいまい判定はヒューリスティック）
   - `detectFirstPersonLeakage()`: 一人称混入の検知（書き換えなし）
   - `detectCallingTermMismatch()`: `ForMasterCalling_EN` 等に無い呼称語（`big`/`bro`/`sis`等）の検知（書き換えなし）
3. **`tools/deepl/draft-translate.mjs`（新規・`npm run deepl:draft`）**:
   - `--work`（必須） `--db` `--id` `--under`（サブツリー限定） `--limit`（既定30） `--apply`
   - レコードを再帰走査し、`field_EN` が空で対応する JP 値がある箇所を収集（スキーマに無いキーは追加しない）
   - `GenderType`/`ForMasterCalling_EN` を踏まえて DeepL 翻訳 → 代名詞正規化 → 一人称/呼称の警告検知
   - 既定では `.cache/deepl/draft-report.md` へレポート出力のみ。`--apply` 時は**警告が一つも無い候補だけ**を対象 JSON の空 `_EN` へ書き戻す（警告付きは常にレポート止まり）
4. **テスト**: `tests/deepl.pronoun-normalize.test.js`（13件、`npm test` に統合。ネットワーク I/O 対象外）
5. **ドキュメント**: `docs/deepl-localization.md` §2（スクリプト表・生成物）/ §3-4（新設） を追記。`package.json` に `deepl:draft` 追加。`CHANGELOG.md` に追記。

---

## 影響範囲（編集・追加ファイル）

- 追加: `tools/deepl/pronoun-normalize.mjs` / `tools/deepl/draft-translate.mjs` / `tests/deepl.pronoun-normalize.test.js`
- 変更: `tools/deepl/deepl-client.mjs`（`context` 引数追加） / `docs/deepl-localization.md` / `package.json` / `CHANGELOG.md`
- 検証対象（未コミット・作業中）: `data/Works_NumberTales/DataBases/db_Primary.json`（「8(ワカツ)」`ConversationPattern` を `deepl:draft --apply` で試験反映予定）

---

## 未完了タスク

- [ ] `npm run deepl:draft -- --work Works_NumberTales --db Primary --id 8 --under ConversationPattern` を実行し、レポート内容を確認
- [ ] 問題なければ `--apply` を付けて実行し、`db_Primary.json` への反映結果と `npm test` の通過を確認
- [ ] `npx prettier --write` で整形（Cowork では PostToolUse フックが自動実行されないため手動）
- [ ] `git diff` を最終確認のうえ、コミットは User の指示を待つ

---

## 補足

- `--apply` はあくまでオプトイン機能。既存の `evaluate-translations.mjs`（書き換えなし方針）とは異なり、**警告なし候補に限定した自動反映**を新たに許可した点が今回の設計判断。`docs/deepl-localization.md` §3-4 に理由を明記。
- 代名詞のあいまい語（`her`/`zir` の目的格・所有格）はヒューリスティックのため 100% ではない。誤爆が疑われる場合は `--under` で対象を絞り、`draft-report.md` の内容を人間が確認してから `--apply` する運用を推奨。
