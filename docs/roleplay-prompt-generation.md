# ロールプレイプロンプト自動生成（roleplay-prompt）

`tools/build-roleplay-prompts.mjs` は、JSON データベースの `ConversationPattern` を中心とした
キャラ設定フィールドと、作品別テンプレート `roleplay-prompt.tpl.md` から、配布用ロールプレイ
プロンプト（Markdown）を生成する CLI です。

## 方針・制約（重要）

- **LLM を呼ばない**。既存の充填済み値を固定テンプレへ機械的に差し込むだけです（`CLAUDE.md`「会話
  パターン情報追加時の運用制約」準拠）。空欄を創作本文で埋めません。
- **複数キャラの描写が絡む記述（他キャラとの関係・言及）は User の手動入力判断**とします。生成ツールは
  「そのキャラ単体で確実な情報」だけを組み立て、関係性・他キャラ言及は自動生成しません。
  - 例: `Summary_JP` に他キャラ言及が混在するケースがあるため、概要は `Summary_JP` をそのまま使わず、
    アイデンティティ文（所属・種族・正式名称）＋性格（`Character_JP`）＋強み弱みで構成しています。
  - 例: 錦野姉妹のように双子の片割れ（歌嫁）が設定上どうしても入るケースも、その記述は User が手動で
    足す前提です。
- **生成物は叩き台、手書きが正**。既存の実運用プロンプトは生成場所（`RoleplayPrompts/`）で保護され、
  `--force` 指定（またはフェーズ2 のマージ更新）以外では上書きされません。

## CLI

```
node tools/build-roleplay-prompts.mjs        # 既定 = plan（dry-run。書き込まない）
npm run roleplay:plan     # 同上
npm run roleplay:write    # 生成/上書き（既存ファイルは既定で保護＝スキップ）
npm run roleplay:check    # CI: 新規生成予定があれば exit 1
```

主なフラグ: `--write` / `--check` / `--force`（既存上書き）/ `--work=<Name>` / `--db=<Name>` /
`--id=<Value>` / `--lang=jp|en`（en はフェーズ4）/ `--report=<path>`（既定 `.cache/roleplay-report.json`）。

## テンプレート仕様（`roleplay-prompt.tpl.md`）

- 先頭に設定ブロック `<!-- 100bl:tpl ... -->`。`displayName` 等の合成変数を式で宣言し、build が評価して
  本体から除去します（生成物には出ません）。
- プレースホルダ:
  - `{{Path.To.Field}}` … record → 合成変数の順で解決。`@Name` は合成変数。
  - `{{Field | filter}}` … フィルタ:
    - `nospace`（空白除去）/ `oneline`（先頭行）/ `trim`
    - `commas`（改行→「、」）/ `bullets`（改行→「- 」箇条書き）
    - `orjoin`（改行→「 または 」）/ `altnames`（空白除去＋「 または 」。表示名向け）
    - `sentences`（「。」と改行で文単位に分割し「- …。」の箇条書き化）
  - `{{#Field}}…{{/Field}}` / `{{^Field}}…{{/Field}}` … 条件（空なら行/ブロック除去）。
  - `{{#each Path}}…{{/each}}` … 配列反復（`DialogueExamples` 用に整形済み `@dialogue` を提供）。
- 合成変数（build が計算）:
  - `@DisplayName` / `@FormalName` / `@FormalNameReading` / `@FormalNameCompact` … `*Name` 系の複数名
    （改行区切り）は「または」で連結。`DisplayName` は改行が残っても build 側で必ず「または」化（防御）。
  - `@WorkTitle_JP` … 作品名（複数行は先頭行のみ）。
  - `@FirstPerson` / `@SecondPerson` / `@ThirdPerson` / `@ForMaster` … 呼称 DSL を `calling-common` で展開。
  - `@Gender` / `@Race` / `@Belonging` … enum/辞書ラベル解決（`type-common`）。object 値は `value` を取り出す。
  - `@Age`（`Age`→無ければ `ConceptAge`。object は value）/ `@BirthDay`（`{Day:{Month,DayOfMonth}}`→「M月D日」）。
  - `@TailsUnit`（`tailsUnit.js` のサマリー）/ `@DeepLink`（`?c=<Work>/<Db>/<Index>:<値>`）。
- `hideText`（非公開マスク）は `resolvePath` で省略され、プロンプトには出ません。
- 型番（`ModelNumber` 等の英数字コード）は Markdown インラインコード（`` `…` ``）で表示します。
- 生成物は**マーカー無しのクリーンな Markdown**（フェーズ2 のセクション単位マージ更新は、`## 「…」の概要`
  などの見出しをアンカーにする方式で行う）。

## 出力パス規約

`CreationsDBClient.resolveIndexPathRoles(work, db)` の宣言的判定に従います（`$IndexDef` の
`$display.index.link` フラグベース）:

- 単一 or 先頭で完結（NumberTales `Num` / DestinyFoxRecords `Generation` / 獣爾騎兵 `Beast` / パストダイヴァー
  `Lunar`）: `DB_<Db>/roleplay-prompt-<値>.md`
- 先頭≠link要素（FLInvestigator78 `Card.Suit`≠`Card.Num`）: `DB_<Db>/<先頭値>/roleplay-prompt-<link値>.md`

出力パスが衝突した場合（「先頭で完結」判定なのに非一意）はエラーで停止します。

## 対象レコード

`ConversationPattern` が充填済み（6 テキスト項目のいずれかが非空、または `DialogueExamples` に非空要素）の
レコードのみ生成します。非充填レコードはスキップします。

## 符号化フィールドのデコード

呼称 DSL・GenderType/RaceType・TailsUnit は `lib/basic-renders/`（`calling-common` / `type-common`）と
`lib/section-renders/tailsUnit.js` の純関数を side-effect import し、キャラシート UI と同一ロジックで
解決します（詳細は `docs/schema-meta-processing.md` / `docs/wrapper-summary-registry.md`）。

## テスト

- `tests/roleplay-render.test.js` … テンプレエンジン・フィルタの純関数テスト。
- `tests/data.roleplay-prompts.test.js` … 実データ統合（レンダ成功・未解決なし・冪等性・マーカー非混入・
  出力パス規約・非充填除外）。
