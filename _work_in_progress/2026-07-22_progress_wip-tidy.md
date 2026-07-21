# 進捗ログの棚卸し（2026-07-22 / `develop`）

## 目的

前回（2026-07-16）の棚卸し後、`_work_in_progress/` 直下が 24 件（+README）まで増えたため、
`develop` ブランチを対象に進捗ログを棚卸しする。

## 方針（前回踏襲）

- 退避判断は**書面上の「完了/未実施」記載を鵜呑みにせず、実際に確認して裏取りする**。
- 実地確認は **User 提示の環境**で行う（開発: `http://127.0.0.1:5500/` / 本番: `https://database.numbertales-radiann.net/`）。
- 棚卸し成果は**未コミットで残す**（User の確認後にコミット指示を出す運用）。
- コード（`pages/` `lib/` `data/` `tests/`）は本棚卸しでは**変更しない**。発見した課題は母艦へ登録して申し送る。

## 実施内容

### 1. 裏取り

対象 HEAD は `develop` の `72cb428`（`origin/develop` と 0/0 同期）。
検証スクリプト: `.cache/verify-wip-20260722.mjs`（Git 管轄外・再実行可）。

#### 1-1. 複合 Index 圧縮ロケータ（`composite-index-locator`）

ログは 🟢 完了扱いだったが、User 報告の不具合 2 件が実環境で解消しているかを Playwright Chromium で確認した。

| ケース | 入力 URL | 表示名 | 最終 URL |
| --- | --- | --- | --- |
| ①複合 Index（当初不具合1） | `?c=FLInvestigator78/Primary/Suit:Major,SuitNum:16` | バベル | 同左（`Suit` が落ちない） |
| ②複合 Index（当初不具合2） | `?c=UnibyteLive/Primary/Alphabet:S,AlphaGen:2` | S:ナーミィ | 同左（`c=` が使われる） |
| ③単一キー回帰 | `?c=NumberTales/Primary/Num:57` | 57(イズナ) | 同左 |
| ④エイリアス root 抜き | `?c=UnauthedLogica/PrimaryMobs/Num:141` | ニッキー | `?c=UnauthedLogica/PrimaryMobs/Logic.LogicSeries:K1` |
| ⑤旧形式の書き換え | `?work=Works_FLInvestigator78&db=Primary&idx=7&idxKey=Card.Num` | アクセラ | `?c=FLInvestigator78/Primary/Suit:Major,SuitNum:7` |

- 全ケースで `pageerror` 0 件 / 4xx 0 件。
- ④は「読み取りは root 抜きを許容し、生成は正準形へ書き戻す」設計どおりの挙動。
- ⑤は旧パラメータ形式が読み取り互換のまま新形式へ書き換わることを確認。
- → 退避可。残る `#IndexAlt` 宣言化のみ母艦 P5-4 へ引き継ぎ。

#### 1-2. 前回棚卸しの申し送り（`develop` → `addon-ai-tag` 一方向マージ）

前回ログの申し送りだった一方向マージの完了を git で裏取り。

- `git branch --contains f78cfdb` に `addon-ai-tag` が含まれる（グローバル辞書解決の修正が取り込み済み）。
- `git rev-list --left-right --count develop...addon-ai-tag` = **0 / 98**（develop 側の未取り込み 0）。
- → 申し送り事項は消化済み。`2026-07-16_progress_wip-tidy.md` は退避可。

#### 1-3. 本番実 API（母艦 P4-6 の現況確認）

`https://database.numbertales-radiann.net/api/v1/works` を実測（200 / 10 作品）。

- 各エントリの公開キーは `key` / `Title` / `Title_EN` / `Works_Summary` / `OldTitles` の 5 種のみ。
- `OfficialLinks` は**未露出**＝母艦 P4-6 は未対応のままであることを確認し、母艦へ確認日を追記した。

#### 1-4. ロールプレイプロンプト生成 フェーズ0〜3（`roleplay-prompt-generator`）

`72cb428` 時点で `npm test` を再実行し、roleplay 系 5 テストファイル
（`calling-common` / `type-common` / `roleplay-render` / `roleplay-sections` / `data.roleplay-prompts`）が
**全件緑**であることを確認。フェーズ4（EN 版）は後続ログで管理されているため退避可。

### 2. 棚卸し中に判明した課題（赤テスト 3 件・母艦 P4-7 へ登録）

`npm test` は **41 ファイル / 564 件中 3 件が失敗**（561 件成功）。3 件とも
`2026-07-21_progress_composite-index-locator.md` に「本変更前から失敗している既存分」と記録されていたもので、
本棚卸しで原因まで特定した。**いずれも実装バグではなく、DB 更新に対する追従漏れ**。

| テスト | 原因 | 対処 |
| --- | --- | --- |
| `data.field-order` ×2 | `db_SelfSecondary.json` の **106 件中 2 件**がキー順未整列（`SameMPSeries_DBLink` / `sec_Category` / `sec_DesignedBy` の位置、うち 1 件は `Class` / `TailsUnit` 等も）。他 18 ファイル 1,282 件は整列済み | `npm run data:order:write`（値は変えずキー順のみ整列） |
| `pages.characters.ui-output` ×1 | テストが掴む `Num: "223-jw"` の `sec_Category` が `7f87f33` の `"リクエストナンバー"` → 現行 `72cb428` で `null` へ User が更新済み。**null なので行が出ないのが正しい挙動**で、描画側は正常（セクション自体は出ており他の行も描画されている） | フィクスチャの掴み先を `sec_Category` を持つレコード（Num `127`/`223`/`496`/`753`）へ変更 |

- `CLAUDE.md`「データ更新時のテスト追従」に沿えば、後者は**テスト側を新データ仕様へ追従**させるケース
  （実装側の追従漏れではないため、テスト期待値の変更で隠す形にはならない）。

#### 2-1. 対応結果（User 承認のうえ本棚卸し内で実施）

User の承認（「3 件まとめて直す」）を受けて修正し、**`npm test` は 41 ファイル / 564 件すべて成功**へ回復した。

| 対応 | 内容 |
| --- | --- |
| `npm run data:order:write` | `db_SelfSecondary.json` の 2 レコードをキー順整列（`合計: 2/1284 レコードを整列（19 ファイル）`） |
| `tests/pages.characters.ui-output.test.js` | フィクスチャ `requestNumberRecord` の掴み先を `Num: "223-jw"` → `Num: 223` へ変更。理由を日本語コメントで明記 |

- **データ安全性の検証**: 整列前後の JSON をキー順を無視して深い比較し、**値の変更が無い**こと
  （レコード数 106 件のまま・内容完全一致）をプログラムで確認済み。整列されたのはキー順のみ。
- 差し替え先の `Num: 223` は `sec_Category: "リクエストナンバー"` / `sec_DesignedBy: ["RadianN"]` を持ち、
  テストが期待する 4 つの文字列（`二次創作分類` / `リクエストナンバー` / `キャラクターデザイン・考案` /
  `ラジアン（柏木主税）`）をすべて満たす。同条件のレコードは他に Num `127` / `496` / `753` がある。
- 仕様変更ではない（キー順整列とテストのフィクスチャ追従のみ）ため `CHANGELOG.md` への追記は行っていない。

### 3. 退避（6 件 → `.completed/`）

**`_work_in_progress/` 直下: 24 件 → 18 件（+ 棚卸しログ本体 1 件で 19 件・+README）**

| ログ | 退避理由 |
| --- | --- |
| `2026-07-21_progress_composite-index-locator.md` | 直リンク 5 ケースをブラウザ実地確認で消化（残: `#IndexAlt` → 母艦 P5-4） |
| `2026-07-18_progress_roleplay-prompt-generator.md` | フェーズ0〜3 完了・roleplay 系テスト全件緑を再確認（フェーズ4 は後続ログ） |
| `2026-07-16_progress_wip-tidy.md` | 前回の棚卸し作業ログ本体。申し送りの一方向マージ完了を git で確認 |
| `2026-07-16_github-triage.md` | `2026-07-22_github-triage.md` へ世代交代 |
| `2026-07-18_github-triage.md` | 同上 |
| `2026-07-20_github-triage.md` | 同上（未追跡ファイル） |

退避した 2 件（`composite-index-locator` / `roleplay-prompt-generator`）には、移動前に確認結果を追記した。

### 4. 索引・台帳の更新

- `README.md`: トピック索引から `composite-index-locator` 行を除去、roleplay 行の参照先を `.completed/` へ変更。
  「系列の補足」に「キャラシート直リンク（Index 解決）系」「ロールプレイプロンプト生成系」を追加し、
  公式サイトリンク系に本番実測の結果を追記。退避一覧に「2026-07-22 棚卸しで追加退避（6件）」、整理履歴に本棚卸しを追記。
- `2026-07-08_remaining-task.md`（母艦）: P4-6 に本番実測の確認日を追記、**P4-7（赤テスト 3 件）を新規追加**、
  P5-4（`#IndexAlt` 宣言化）を新規追加。
- `2026-07-03_current-task-ledger.md`: 「2026-07-22 棚卸しで完了・退避したもの」節を追加、
  P4 に「直近で着手しやすい項目」として赤テスト 3 件を明記。

## 影響範囲（編集ファイル）

**進捗ログ・台帳**

- `_work_in_progress/README.md`
- `_work_in_progress/2026-07-08_remaining-task.md`
- `_work_in_progress/2026-07-03_current-task-ledger.md`
- `_work_in_progress/2026-07-22_progress_wip-tidy.md`（本ファイル・新規）
- 退避した 6 件（`.completed/` へ移動、Git 管轄外。うち 2 件は移動前に確認結果を追記）

**赤テスト解消（「2-1」・User 承認済み）**

- `data/Works_NumberTales/DataBases/db_SelfSecondary.json`（キー順整列のみ・値の変更なし）
- `tests/pages.characters.ui-output.test.js`（フィクスチャの掴み先変更）

`pages/` `lib/` への変更は**なし**。

## 検証

- ブラウザ実地確認: 上記「1-1」のとおり（5 ケース / pageerror 0 件 / 4xx 0 件）。
- 本番実 API: `/api/v1/works` 200・10 作品・`OfficialLinks` 未露出を確認（GET のみ・書き込みなし）。
- `npm test`: **修正前** 564 件中 561 件成功・3 件失敗（既存分）→ **修正後 41 ファイル / 564 件すべて成功**。
- データ整列の非破壊性: 整列前後をキー順無視で深い比較し、値の変更が無いことを確認（106 件・内容完全一致）。
- コミット/同期状態: `git status` / `git rev-list --count` で確認（`origin/develop` と 0/0）。

## 未完了タスク

- **本棚卸しの成果は未コミット**（User の指示待ち）。
- 赤テスト 3 件は本棚卸し内で**解消済み**（母艦 P4-7 はクローズ）。

## 申し送り事項

1. **母艦 P4-6**（Worker `/works` への `OfficialLinks` 明示追加）: 本番実測で未対応を再確認。
2. **母艦 P5-4**（`#IndexAlt` 宣言化）: SW/enrich/検索/キー順スロットまで波及するため独立タスクとして実施。
3. `addon-ai-tag` 側の進行中ログ（`aihints-structural-resync-proposal` / `aihints-palette-deadlock` /
   `addon-ai-tag-reverse-merge-incident`）は、`addon-ai-tag` パスでの棚卸し対象として残置。
4. リポジトリ直下に未追跡の `.agents/` が出現している（本棚卸しでは未調査・未変更）。

## 参考

- `_work_in_progress/README.md`（トピック別索引・退避一覧・整理履歴）
- `.completed/2026-07-16_progress_wip-tidy.md`（前回の棚卸し）
- `.cache/verify-wip-20260722.mjs`（本棚卸しの実地確認スクリプト）
- `CLAUDE.md` / `AGENTS.md`（`_work_in_progress/` の運用ルール・ブランチ運用方針・データ更新時のテスト追従）
