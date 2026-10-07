# 進捗ログ: `multi-localized` — 命名の由来言語（Origin）と恒常ローカライズ校正 (2026-10-07)

- 環境: `main`（本体ローカル）/ ブランチ `multi-localized`（`develop` から分岐。`f12c1878` の `localize-proofread` Skill 追加の直後）
- 実行者: Claude Code（扇一春）

## 目的

1. `localize-proofread` が「言語サフィックスの新設はスコープ外」として先送りしていた**言語の拡張**を、このブランチで実装する。
2. 初回の校正候補（辞書全件 + References 本文パイロット）を生成し、採否を User に委ねる。
3. 以後 **DB・創作構想の更新とセットで校正を回す**ための運用（台帳・トリガー・対象の絞り方）を型にする。

## 方針の決定（User 確認済み）

- **言語拡張は `_DE` 等のサフィックス汎用化ではなく、辞書行・資料行に「由来言語の器」を足す**。
  調査（サブエージェント）で `_JP`/`_EN` の 2 言語前提が `lib/` `pages/` `tools/` `pkg/` `tests/` に広く固定されており（`/_(JP|EN)$/` のコピーが 8 箇所超、`{jp, en}` ラベルパック、UI トグル 2 値）、全層汎用化は 1,000 行級で、かつ第三言語で表示するコンテンツも無いため見送り。
- 由来言語の初期登録: **de / zh / la / fr**（実データで確認できた由来 + User 指定）。
- 初回範囲: 辞書 `trans_*.json` 全 295 行（レーン B/C）+ `References/ref_Region8.json` / `ref_Faction.json`（レーン A/D）。DeepL eval（25 件）も前段で実行。

## 変更点

### スキーマ（データは書き換えていない。宣言のみ）

- `data/db_meta.json` `General.$VarsDef`
  - `#List_OriginLang`（de / zh / la / fr。`#List_hideText` と同じ在来の list 辞書）
  - `$Def_TermOrigin`（`OriginLang`: `#ListIndex` + `$dict: "OriginLang"` / `OriginTerm` / `OriginReading_JP` / `OriginNote_JP` / `OriginNote_EN`。`$display.wrapper: "termOriginSummary"`, `arrayLayout: multiline`）
- `data/Localization/db_type.json` / `data/References/db_type.json`: `Origin`（`$Def_TermOrigin[]|#Null`, `$display.section: basic`）を追加。Localization は `$DetailLayout.basicFields` にも列挙。
- 既存レコードに `Origin` はまだ無い。記入候補はレポート §2（値は User 監修）。

### フレームワーク

- `lib/basic-renders/termOrigin.js`（新規）: `termOriginSummary` wrapper。`由来言語：原綴り（読み） — 補足` の 1 行整形。`def-object-common.js` の辞書解決・配列連結を使う（`OriginTerm` が言語非依存のため `formatDefObject` には委譲しない）。
- `pages/characters.js` / `pages/sw.js`: 上記を import / importScripts。
- `tests/pages.characters.ui-output.test.js`: References レイヤーで `Origin` が基本情報の 1 行「ドイツ語 / German：Zehn（ツェーン）」として出ることを確認するテストを 1 件追加。

### 運用

- `.agents/skills/localize-proofread/SKILL.md`: レーン C が `Origin` を読む／記入候補を出す。「恒常運用」節（トリガー・差分対象・台帳）を追加。`npm run agents:build` でミラー更新。
- `_work_in_progress/2026-10-07_localize-proofread-ledger.md`（新規・Git 管理）: fix / suggest の判断台帳。
- `AGENTS.md`: 「命名の由来言語（`Origin`）と恒常校正」の運用ルールを 1 項目追加。
- docs: `docs/localization-en-rules.md` §9、`docs/schema-meta-processing.md` §4.5、`docs/wrapper-summary-registry.md`。
- `CHANGELOG.md` に背景・影響範囲を記載。

## 校正結果（初回）

- レポート: `.cache/localize/proofread-report.md`（Git 管轄外）。fix 15 / suggest 32 / note 41。
- 判断待ちは台帳へ転記済み。主な fix: ref_Faction の辞書違反（Diversified/Assignable Society）、誤訳（"for world destruction"）、訳抜け（冷戦的対立関係・近年・こと運命線探偵）、コード揺れ（WCP.IV / WDE.VII）、引用符破損。
- レーン C（由来言語）: R-デイトル（fr *raison d'être*）、山月病（zh *Shānyuè* vs Shanyu）、ゼン→Bene（la）、ルネ→Lune（fr）など。`Origin` の記入候補 22 行をレポート §2 に列挙。

## 検証

- `vitest run tests/pages.characters.ui-output.test.js -t "Origin entries"`: pass
- `npm run agents:build` → `npm run agents:check`: 生成物は正典と一致（2 件更新・ズレ 0）
- `npm run data:order:check`: 0/1449 レコードを整列（宣言追加のみで既存レコードのキー順に影響なし）
- `npm test`: 76 ファイル / 1392 件 pass（新規テスト 1 件を含む）
- ブラウザ実地確認: 未実施（`Origin` を持つ実レコードがまだ無いため。初回記入後に `pages/characters.html` で References / Localization の詳細を目視する）

## 未完了タスク

- [ ] User による台帳の採否判断 → 反映（`localize-en-draft` の挿入規則）
- [ ] `Origin` の初回記入（レポート §2 の候補から User が選ぶ）
- [ ] `#List_OriginLang` への言語追加（ru 等）が必要になった時点で追加
- [ ] `develop` への取り込み（PR）。`README.LOCAL.md` の作業分担表（2026-08-09）は `main` = DB 更新担当のままで、今回はその範囲として扱った

## 参考

- 前段コミット: `f12c1878` AGENTSスキル拡張(ローカライズ周り)
- 調査メモ: `_JP`/`_EN` のハードコード箇所一覧はサブエージェントの報告（セッション内）。中心は `lib/data-common.js` `TypeDefUtils.parseLangSuffix()` / `expandLangAliasCandidates()` / `detectBilingualWrapper()`。全層汎用化を再検討する場合はここから。
