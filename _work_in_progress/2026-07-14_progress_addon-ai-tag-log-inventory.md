# `addon-ai-tag`: develop 取り込みマージのコンフリクト解消 + ログ棚卸し（2026-07-14）

## 目的

`develop` 側の棚卸し（[`2026-07-14_progress_wip-tidy.md`](./2026-07-14_progress_wip-tidy.md)）をコミット後、
`develop` → `addon-ai-tag` の取り込みマージで発生したコンフリクトを解消し、本ブランチ側の進捗ログも棚卸しする。

**本ログは、退避した AIHints 系ログから引き継いだ残課題の台帳も兼ねる**（下記「AIHints 残課題台帳」節）。

## 1. マージのコンフリクト解消

- マージ: `develop`（`06e1461` 進捗ログ整備・軽微な調整）→ `addon-ai-tag`（`b8c989b`）。マージコミット `a1e259d`。
- コンフリクト: **`_work_in_progress/README.md` の 1 ファイルのみ**（2 箇所）。
- 解消方針: **どちらの記載も失わずに統合**した。
  1. **「系列の補足」**: develop 側で新規追加された 4 項目（Issue 機能系 / Calling 表示系 / pkg 追従系 / アンオースドロジカ Index 系）と、`addon-ai-tag` 固有の「addon-ai-tag / AIHints系」項目の**両方を保持**。
     あわせて、addon 側の項目にあった「GitHub Issues機能は develop 側の `issue-feature` / `fix_calling-schema-duplication` を参照」の記述を、両ログが 2026-07-14 に完了・退避済みである旨へ更新。
  2. **「整理履歴」**: addon 側の履歴（2026-07-08 / 2026-07-11）と develop 側の 2026-07-14 エントリの**両方を保持**し、時系列順に並べ直した。
- 検証: リポジトリ全体でコンフリクトマーカー残存 0 件。`npm test` **36 ファイル / 427 件 全成功**。

## 2. 裏取り（棚卸しの根拠づくり）

**本ブランチでは「実装がログを追い越している」状態が複数あった。** 書面の「未着手」を鵜呑みにせず、
コードと実データで実状を確認した結果、提案書のまま残っていた 2 件が**実際には完了済み**と判明した。

### 2-1. AIHints 構造的再同期（第1階）は実装・適用済みだった

`2026-07-08_progress_aihints-structural-resync-proposal.md` は「📝 提案書のみ・実装未着手・User の優先度判断待ち」
と記載され、README の索引にもそう載っていたが、**実際には完全に実装・適用済み**だった。

| 提案項目 | 実状（2026-07-14 実測） |
| --- | --- |
| `--resync-structural` モード | ✅ CLI + `resyncStructuralAihints()` 実装済み |
| `_meta.structuralEntries` / `structuralSourceHash` | ✅ 実データ **92/92 件**に存在 |
| `.github/workflows/aihints-structural-resync.yml` | ✅ 存在。push で起動・成功を確認済み |
| テスト | ✅ `tests/patch-aihints.resync.test.js` **26 件全成功** |
| `docs/ai-hints-usage.md` への追記 | ❌ **未実施だった** → 本棚卸しで対応（下記 3.） |

### 2-2. `palette-deadlock` ログが自己矛盾していた

`2026-07-13_progress_aihints-palette-deadlock.md` は第0階の診断ログとして始まり、その後 AIHints 全体
（第0〜2階）の親ログへ育った。その結果、**上部に残る「残る課題」節（2 か所）が、下部の実装結果と矛盾**していた。

| 古い「残る課題」の記載 | 実状（2026-07-14 実測） |
| --- | --- |
| `--suggest --force` は依然として全面上書き | **解消済み**。人の手仕上げがあるレコードでは `--force` がブロックされ、`--force-destructive` を明示しない限り上書きされない |
| `prompt_export` がタグ変更後も再生成されない | **解消済み**。`regenerateFormExports()` が再同期の最後にソース配列から常に作り直す |
| GitHub Actions からの自動 PR 作成は未着手 | **実装済み**（PR 作成自体の実証のみ残。下記台帳 4） |
| 実データ 92 件の palette は未入力 | **完了**。確定値を持つレコード **91 件** |

→ 3 階すべて完了。第2階は当初案（median-cut 推定）ではなく、`develop` 側の `ColorPalette`
（設定画のカラーチップ実測）＋ `--apply-colorpalette` による**機械導出**で達成されている。

### 2-3. EarShapeType 追従は実データへ反映済み

`2026-07-08_progress_addon-ai-tag-earshapetype-aihints.md` の「ビルド範囲を User に確認中」は解消済み。
実データで**誤タグ `"nekomata ears"` の残存 0 件**、Num:11 の耳情報は `AppearanceDetail` 由来の
`"Cat (hidden under the hood)"`（尻尾形状からの推測なし）であることを確認した。
該当ビルドは `852ae6a` / `b211f5b` / `8ebb1a3` / `b8c989b` で着地済み。

### 2-4. 実データの現況（NumberTales / Primary、2026-07-14 実測）

- レコード総数 105 / `AIHints` あり **92**
- `palette_priority` 確定 **91** / `null` **1**（`10-alt` = `ColorPalette` を持たないレコード）
- `_meta.structuralEntries` / `structuralSourceHash` あり **92/92**
- `AIHints` 内の `TODO:` 文字列 **4 件**（Num 29 / 58 / 85 / 92、いずれも `marking placement`）
- 誤タグ `"nekomata ears"` **0 件**

## 3. 見つかった不備と対処: `docs/ai-hints-usage.md` の記載欠落

実装済みの主要モード 2 つが**未文書化**だった（提案ログ自身が `docs/ai-hints-usage.md` を実装対象に挙げていたが、
コードだけ入って docs が追従していなかった）。

**対処**: `docs/ai-hints-usage.md` に以下を追記した。

- **§9.10 `--resync-structural` モード**（provenance による構造的再同期）
  基本方針（provenance の記録 / find-exact-and-replace / `structuralSourceHash` による no-op 判定 /
  `regenerateFormExports()` による導出値の再生成）、コマンド、集計ラベル（`resync-applied` / `resync-unchanged`）、
  CI 連携と `workflow_dispatch` が使えない制約。
- **§9.11 `--apply-colorpalette` モード**（`ColorPalette` から `palette_priority` を機械導出）
  基本方針（`Role` × `Hex` からの導出 / `#ColorRole_Sub` は未使用 / 確定値の保護と `--force-palette`）、
  コマンド、集計ラベル（`palette-applied` / `palette-unchanged` / `palette-no-colorpalette`）、注意事項。
- あわせて §9.9 の注意事項に、`--force` が人の手仕上げをブロックする挙動（`--force-destructive` で解除）を追記。

記述はすべて**実装済みの挙動のみ**であり、創作内容は含まない。

## 4. 退避（4 件 → `.completed/`）

**`_work_in_progress/` 直下: 17 件 → 13 件（+README）**

| ログ | 退避理由 |
| --- | --- |
| `2026-07-08_progress_aihints-structural-resync-proposal.md` | 第1階の実装・適用・テスト・CI まで完了を裏取り（記載が陳腐化していた） |
| `2026-07-13_progress_aihints-palette-deadlock.md` | 第0〜2階すべて完了。自己矛盾していた「残る課題」節を最終状態として整理し退避 |
| `2026-07-08_progress_addon-ai-tag-earshapetype-aihints.md` | 実データで誤タグ 0 件を確認。ビルドも着地済み |
| `2026-07-11_progress_addon-ai-tag-identitymotif-removal.md` | 「未完了タスク: なし」。マージ後も全テスト成功を確認 |

4 件とも、移動前に確認結果を追記した。

## AIHints 残課題台帳（退避ログから引き継ぎ）

> 共有の母艦（`2026-07-08_remaining-task.md`）は `develop` と共通のファイルであり、AIHints 固有の項目を
> 書き込むと取り込みマージのたびに衝突しやすい。そのため **AIHints の残課題は本ログに集約**する。

### A1. `common.natural_language_description` が 92/92 件 `null`（優先度: 中）

`buildAihintsFromAppearanceDetail()` が毎回 `null` へ潰しており、実データでも全件 `null`。
`VisionResult` typedef に対応フィールドが無いため視覚解析ワークフローの対象外でもある。
`forms.*.natural_language_description` も 91/92 件で `null` を含む。
**別タスクとして扱う**（palette と同様に「据え置き + 別経路で埋める」設計が要る）。

### A2. `TODO: marking placement` が 4 件（優先度: 中）

Num **29 / 58 / 85 / 92**。`common.immutable_traits` の number marking 行が抽出できず TODO が残っている。
`AppearanceDetail` の `#Element_NumberMark` エントリの有無・記述を確認して埋める必要がある。

### A3. `AIHints` を持たない 13 件 / `ColorPalette` を持たない 1 件の扱い（優先度: 低）

- `AIHints` なし: 13 件（対象外とするか、scaffold するかの方針判断が要る）
- `palette_priority` が `null`: 1 件（`10-alt`。`ColorPalette` を持たないため導出不可）

### A4. CI の自動 PR 作成が未実証（優先度: 低・監視のみ）

`.github/workflows/aihints-structural-resync.yml` は push で起動・成功するが、構造ソース無変更のため
**no-op で停止した状態しか確認できていない**。PR 作成そのものは、構造ソースが変わる次回 push で初めて実証される。
`workflow_dispatch`（手動実行）はワークフローがデフォルトブランチに無いため利用できない。

### A5. `--suggest --force` の運用（優先度: 低・運用ルール）

`--force` は人の手仕上げが残るレコードをブロックするようになったが、`--force-destructive` を付ければ
依然として全面上書きできる。**構造だけ最新化したい場合は必ず `--resync-structural` を使う**運用とする
（`docs/ai-hints-usage.md` §9.9 / §9.10 に明記済み）。

### A6. `migrate-aihints.mjs` の per-record `_Secondaries` opt-out 判定（優先度: 中）

2026-07-17 の基盤整備で **DB レベル**の `AI_Optout: true` 遮断は入れたが、`_Secondaries` のカテゴリ単位
`AI_Optout` はレコード単位の 3 軸解決が必要なため未対応。カテゴリ単位 opt-out を持つのは `#DB_Secondary`
（公認二次創作・第三者デザインを含む）のみで、同 DB に AIHints の実データが無いため現状 latent。
**`#DB_Secondary` へ AIHints を入れる前には必須**。
実装する場合、`tools/patch-aihints.mjs` の `findSecondaryDef()` と同じ 3 軸マッチャが要る（下記 A7 と関連）。
→ 詳細: [`2026-07-17_progress_aihints-scope-semiprimary-selfsecondary.md`](./2026-07-17_progress_aihints-scope-semiprimary-selfsecondary.md)

### A7. `_Secondaries` マッチャの三重化（優先度: 低・保守負債）

2026-07-17 時点で同一ロジックが 3 箇所に存在する。**正は `lib/sw-common.js`。仕様変更時は手動同期すること。**

| 実装 | 返り値 | 備考 |
| --- | --- | --- |
| `lib/sw-common.js`（**正**） | 定義そのもの | Service Worker classic script |
| `pkg/nodejs/index.mjs:335` | `_Commons` のみ | `applyCommonsToRecords` 内のクロージャ・未 export |
| `tools/patch-aihints.mjs` `findSecondaryDef()` | 定義そのもの | 2026-07-17 追加。`AI_Optout` と `_Commons` を 1 回の解決から取るため |

`pkg/nodejs` 版が `_Commons` だけを返して `AI_Optout` を捨てている点が既に乖離している。
`pkg/nodejs/index.mjs` は `develop` 所有ファイルのため、統合するなら `develop` 側で行う必要がある
（`addon-ai-tag` で触ると逆マージ禁止により永久分岐する）。

### A8. `CLASS_NAMES_EN` と Class 辞書のレジスタ乖離（優先度: 低）

2026-07-17 に Class 辞書への fallback を入れたが、ハードコード（AI プロンプト用タグ `'uni-digits class'`）と
辞書（固有名詞の表示名 `"Uni-Digits"`）はレジスタが異なり、29 件中 28 件で値が違う。
fallback で入る辞書値は AI タグとしては行儀が悪い。中期的には**辞書側へ AI タグ用フィールド
（例 `Class_AITag`）を足してハードコードを退役**させるのが筋だが、スキーマ変更 + User の創作判断が要るため別議論。

### A9. `tools/extract-enum-lists-to-dictionaries.mjs` のシェバン残存（優先度: 低・`develop` 側課題）

2026-07-22 のマージ棚卸しで、`.completed/2026-07-18_progress_roleplay-shebang-fix.md` から引き継いだ項目。

`tools/build-roleplay-prompts.mjs` のシェバンは vitest 4.1.0 で suite ごと `SyntaxError` にする実害があり
除去済みだが、**`tools/extract-enum-lists-to-dictionaries.mjs` にはシェバンが残っている**（2026-07-22 実測）。
現状テストから import されていないため無害だが、将来テストが import すると同じ事故が起きる。

`tools/` は `develop` 所有のため、**本ブランチで触ると逆マージ禁止により永久分岐する**（A7 と同じ理由）。
`develop` 側で対応すること。

## 影響範囲（編集ファイル）

- `_work_in_progress/README.md`（コンフリクト解消 + 索引・退避一覧・整理履歴の更新）
- `docs/ai-hints-usage.md`（§9.10 / §9.11 を追記、§9.9 の注意事項に追記）
- `_work_in_progress/2026-07-14_progress_addon-ai-tag-log-inventory.md`（本ファイル・新規）
- 退避した 4 件（`.completed/` へ移動、Git 管轄外。移動前に確認結果を追記）

## 検証

- `npm test`: 36 ファイル / 427 件 全成功
- コンフリクトマーカー残存: リポジトリ全体で 0 件
- 実データの確認結果は上記「2-4」のとおり

## 未完了タスク

- **なし**（棚卸し作業自体は完了）。AIHints の残課題は上記「AIHints 残課題台帳」を参照。

## 参考

- [`2026-07-14_progress_wip-tidy.md`](./2026-07-14_progress_wip-tidy.md)（`develop` 側の同日棚卸し）
- `.completed/2026-07-03_progress_addon-ai-tag-log-inventory.md`（前回の addon-ai-tag ログ棚卸し）
- `docs/ai-hints-usage.md` §9.10 / §9.11（本棚卸しで追記）
- `CLAUDE.md` / `AGENTS.md`（ブランチ運用方針: `develop` → `addon-ai-tag` の一方向マージのみ）
