# 進捗（引き継ぎ）: ロールプレイプロンプト EN 版生成（フェーズ4・着手前調査＋実装計画） (2026-07-18)

> フェーズ0〜3（JP 版の生成 → 見出しアンカー方式マージ更新 → `.private/` の reconcile/adopt）は**完了済み**（別ログ [`2026-07-18_progress_roleplay-prompt-generator.md`](./2026-07-18_progress_roleplay-prompt-generator.md)）。本ログはフェーズ4（英語版プロンプト生成）を後日再開するための引き継ぎ。着手前に**実データ・実コードで裏取り**したスキャン結果と、それに基づく実装タスクをまとめる（推測ではなく workflow `roleplay-en-phase4-scan` の実測に基づく）。

## 目的

`_EN` フィールド＋固定運用文の英訳から、英語版ロールプレイプロンプトを生成する。出力先は JP と分離（プラン既定 `RoleplayPrompts_EN/`）。

- **LLM で創作本文を訳出・生成しない**。既存 `_EN` を機械的に差し込むだけ。`_EN` 欠落は空のまま（＝創作補完禁止）。
- 固定運用文（命令文・役割・禁止事項・案内文）は**創作本文ではない運用指示テキスト**なので、EN テンプレに英語で直書きしてよい。
- `_EN` フィールドの値追加は `data/CLAUDE.md`（英訳入力補助）に従い **User 主導**。本ツールは消費のみ。

## スキャン結果（2026-07-18・裏取り済み）

### A. lib デコーダの EN 対応状況

| デコーダ | EN 対応 | 要点（file:line） |
|---|---|---|
| **TailsUnit** | ✅ end-to-end 完済 | `formatTailsUnitSummary` が `pageLang` 駆動（`lib/section-renders/tailsUnit.js:121`）、EN 分岐 `${n} tails` / `(${n} segments)` / `${t} tails x${c} clusters` / `From X to Y`（:93,110,127,130）。build は `pageLang:lang` を渡す（`build-roleplay-prompts.mjs:208`）。※複数要素の連結区切りだけ build 側で JP 読点 `、` 固定（:209）。 |
| **type（Gender/Race/Belonging）** | △ 解決口はある・build 未接続 | EN ラベルは `resolveVarsDefLabelPack(...).en`（`type-common.js:375,541-556`）が `_EN`/`Text_EN` 接尾辞から解決。`$EnumDef_*` キー直引きも対応（:586-597）。build は lang 非対応の `resolveVarsDefLabel`（JP 優先、:108,223-238）を使用（`build:190-192`）。 |
| **呼称（calling）** | △ 受理するが翻訳しない | `parseCalling({lang:'en'})` は `isJP=false` に切替（`calling-common.js:200-204`）が**翻訳はしない**。EN の `[*xxx]` 参照のみ展開（:128-130,53-64）、JP 原文を渡すと英語化されず劣化。build の `decodeCalling` が `${baseKey}_JP` 固定読み（`build:176`）。区切りも lang 非依存で JP 固定（`・` `／` `（※...）`、:242-243,252）。 |

→ **TailsUnit だけが完成**。type と calling は「EN の解決口はあるが、build が JP ソース／JP 関数を渡している」状態。呼称の EN 代名詞（ze/zir 等）は呼称 DSL／辞書の EN 面が埋まっているかに依存（メモリ `feedback_pronouns_en` の対訳規則を参照）。

### B. build の lang 配線状況（`tools/build-roleplay-prompts.mjs`）

- **配線済み**: `--lang`（:66）→ `lang`（:283）→ ctx（:341）→ `buildVars`（:150）。**EN 動作済み**＝DeepLink `&lang=en`（:216-217）／TailsUnit `pageLang`（:208）／DialogueExamples の `value_EN/about_EN`（`render.mjs:89-98`、`__lang` 経由）。
- **JP ハードコード（EN 化で lang 分岐が要る箇所）**:
  - 呼称 `decodeCalling` が `${baseKey}_JP` 固定（:176）
  - Gender/Race/Belonging が `resolveVarsDefLabel`（JP 固定・lang 不可、:190-192）
  - FormalName/FormalNameReading/FormalNameCompact が `FormalName_JP`/`FormalName_JPReading` 固定（:155-158）
  - WorkTitle が `Title_JP` 固定（:152,341）
  - BirthDay が `M月D日` 書式（:201）
  - 連結語 ` または `（:155,158,167）／TailsUnit 連結 `、`（:209）
  - テンプレ・出力先が単一（`roleplay-prompt.tpl.md`＝:46,305-308／`RoleplayPrompts`＝:47／`computeOutputPath` が lang 無視＝:247-255）→ 現状のままだと EN が JP を**同一パスへ上書き**する

### C. テンプレの EN 差し替え要否（3作品・全プレースホルダ棚卸し済み）

- **言語中立（EN ソース不要・そのまま）**: `ModelNumber` / `Height_cm` / `Weight_kg` / `@Age` / `@DeepLink`（build が `&lang=en` 自動付与）。
- **EN テンプレで省略推奨**: `FormalName_JPReading` / `@FormalNameReading`（日本語振り仮名。英語で無意味 → 行ごと省略）。
- **要 EN 化（`_EN` ソース or 辞書 EN or build 分岐）**: 上記以外のテキスト系（Character/Strength/Weakness/Hobby/SpecialSkill/Favor/Unlike/Class/ConversationPattern.* の各 `_EN`）＋名称（Name_EN or FormalName_EN）＋辞書ラベル（Gender/Race/Belonging の VarsDef `_EN` 面）＋呼称（EN 原文／辞書）。
- **作品差**:
  - **NumberTales**: DisplayName は `Name_JP` 由来 → `Name_EN` が要る。型番/CodeName 行あり。
  - **FLInvestigator78**: DisplayName は `FormalName_JP` 由来。`@BirthDay`（`M月D日` 書式）あり → 英語日付化に build 分岐が要る。型番/CodeName 行なし。役割/禁止事項に固有の追加文（技術タスク優先・創作自動生成禁止・「ロールプレイをやめて」で通常モード復帰）あり。
  - **DestinyFoxRecords**: DisplayName は `FormalName_JP` 由来。**`## キャラクター設定の閲覧` 節が無い**（EN でも他2作の DB 案内節を機械的に足さない）。禁止事項の見出しが「禁止事項・注意事項」で本文も別文言。
- **固定運用文（英語で直書きする非創作テキスト）**: 命令文／役割について／禁止事項（作品ごとに文言差）／不明な点があったときは／キャラクター設定の閲覧（NumberTales=URL 3件・FL78=URL 1件・DFR=節なし）／「〈名〉のキャラクター設定について」／構造見出し群（`# あなたが演じる〈名〉というキャラクターについて` / `## 〜の概要・基本情報・口調・趣味趣向` / `### 〜の口調の例` / `# userとの会話を行うにあたって`）。URL は不変、説明文のみ英訳。

### D. EN データ充填率（実測・CP 充填済みレコード）＋テンプレ実使用とのクロス

| 作品/DB | CP件数 | テンプレ実使用フィールドの EN 充填 | 実質ギャップ |
|---|---|---|---|
| NumberTales/Primary | 46 | Name/FormalName/CodeName/TalkingTone/PreferredTopics = 46/46。Character 43・Hobby 43・DialogueExamples.value 45 | **性格3件・趣味3件・台詞例1件が未充填** → その節が空（補完しない） |
| NumberTales/SemiPrimary | 3 | 全て 3/3 | なし |
| FLInvestigator78/PrimaryDealer | 2 | FormalName/Character/Hobby/TalkingTone/PreferredTopics/DialogueExamples = 2/2 | **なし**（Name_EN/Summary_EN/CodeName_EN の 0/2 はテンプレ未使用のため無関係） |
| DestinyFoxRecords/Proxy | 2 | Name/FormalName/Character/Hobby/TalkingTone/DialogueExamples = 2/2。PreferredTopics 1/2 | **PreferredTopics が1件 未充填** |

**重要な読み替え（生の充填率だけ見ると誤読する）**:

- **`RaceType_EN` は全作品 0/件だが欠落ではない**。RaceType の EN ラベルは**辞書側**（`dict_RaceType.json` / VarsDef `_EN` 面）にあり、`@Race` は build が `resolveVarsDefLabelPack().en` へ切替えれば英語化される（record の `_EN` フィールドは不要）。Gender/Belonging も同じ。
- **`Summary_EN` / `CodeName_EN` の 0 件は無関係**。フェーズ1でテンプレは Summary を使わない構成にし、FL78/DFR は CodeName 行を持たない（＝実使用フィールドでない）。

→ 総括: **EN データはおおむね揃っている**。出力に効く実質ギャップは NumberTales/Primary の性格・趣味 各3件＋台詞例1件、DFR の PreferredTopics 1件のみ。空欄は空のまま出す。

## 実装タスク（推奨順・各 file:line）

1. **build の lang 分岐（コア）** — `tools/build-roleplay-prompts.mjs buildVars`:
   - 名称: `lang==='en'` で `FormalName_EN`/`Name_EN` を読む（:145-147 の DisplayName 合成含む、:155-158）。`FormalNameReading` は EN 未使用（テンプレ側で省略）。
   - 辞書ラベル: Gender/Race/Belonging を `TypeResolver.resolveVarsDefLabelPack(...).en` へ切替（:190-192）。
   - 呼称: `decodeCalling` を `lang==='en'` 時 `${baseKey}_EN`→bare 優先読みに（:175-178）。区切りは `decodeCallingToText` に EN 用 `catSep`/`ctxSep`（例 `, ` / ` / `）を明示指定（options 透過、`calling-common.js:265`）。
   - WorkTitle: `w.Title_EN`（無ければ `Title_JP` フォールバック）を EN 用変数へ（:152,341）。
   - 連結・書式の lang 分岐: ` または `→` or `（:155,158,167）／TailsUnit 連結 `、`→`, `（:209）／BirthDay `M月D日`→英語日付（:201）。
2. **テンプレ選択＆出力先の lang 分離**:
   - `TEMPLATE_NAME` を lang 別に（`roleplay-prompt.tpl.md` / `roleplay-prompt.tpl.en.md`、:46,305-308）。
   - 出力先: プラン既定は `RoleplayPrompts_EN/`（`PROMPTS_DIR`=:47／`outputRoot`=:304／`computeOutputPath`=:247-255 を lang 対応）。※`.en.md` suffix 案もあるが plan は別ディレクトリ採用 → **着手時に User 最終確認**。
3. **EN テンプレ3本を新設**（固定運用文を英訳・neutral はそのまま・reading 行は省略・**DFR は閲覧節を足さない**）。config ブロックの `displayName` 式も EN 変数へ。
4. **（任意）EN 専用の充填判定**: `hasFilledConversationPattern`（:105-117）は `_JP/_EN` 双方許容のため、EN run で `_EN` 未充填レコードを JP 混在で拾いうる。EN 時は `_EN` 側のみ見るゲートを検討。
5. **テスト**: `tests/roleplay-render.test.js`（formatDialogueItem en は既存）に加え、EN buildVars（名称/辞書/呼称/連結が EN）と EN 実データ回帰（上表の充填率どおり・空は空）を追加。
6. **docs/CHANGELOG**: `docs/roleplay-prompt-generation.md` の「フェーズ4」節を実装済みへ更新、CHANGELOG 追記。ローカライズ規約は `data/CLAUDE.md` / `docs/localization-en-rules.md` に従う。

## 制約（再掲・厳守）

- **LLM で創作本文を訳出・生成しない**。`_EN` 欠落は空のまま（性格/趣味 各3件・DFR PreferredTopics 1件 等はその節が空になる）。
- 固定運用文（命令文・役割・禁止事項・案内文）は非創作テキストなので EN テンプレに英語で直書き可。
- 複数キャラの描写が絡む記述は User 手動（フェーズ2/3 と同方針）。

## 要 User 確認（着手時）

- **出力先の形式**: `RoleplayPrompts_EN/`（plan 既定）か `roleplay-prompt-<id>.en.md` suffix か。
- **呼称の EN 表記**: EN 原文フィールド（`${baseKey}_EN`）を使うか、辞書対訳で解決するか（代名詞は `feedback_pronouns_en` 規則）。

## 参考

- 完了分ログ: [`2026-07-18_progress_roleplay-prompt-generator.md`](./2026-07-18_progress_roleplay-prompt-generator.md)
- 実装プラン（フェーズ4節）: `~/.claude/plans/roleplayprompt-roleplay-prompt-temp-md-parallel-hinton.md`
- 仕様: `docs/roleplay-prompt-generation.md` ／ ローカライズ: `data/CLAUDE.md` / `docs/localization-en-rules.md` / `tools/deepl/`
- 本調査のスキャン: workflow `roleplay-en-phase4-scan`（transcript: `subagents/workflows/wf_b02472b6-f8f/journal.jsonl`）
