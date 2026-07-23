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
- **生成物は叩き台、手書きが正**。既存ファイルの再生成は見出しアンカー方式のマージ更新で、テンプレ
  由来見出しのセクションのみ DB 最新へ差し替え、手書き独自見出しのセクションは元の位置のまま保全します
  （下記「既存ファイルのマージ更新」）。手書き実運用プロンプトは `.private/roleplay-prompt-<id>.md` に
  分離しており、生成ループは `.private/` に書き込みません（`--reconcile` / `--adopt` で扱う）。

## CLI

```
node tools/build-roleplay-prompts.mjs        # 既定 = plan（dry-run。新規列挙＋既存はマージ差分）
npm run roleplay:plan     # 同上
npm run roleplay:write    # 生成/マージ書き込み（新規フル生成・既存は見出しアンカーでマージ）
npm run roleplay:check    # CI: 差分（新規/マージ更新）があれば exit 1
```

主なフラグ: `--write` / `--check` / `--force`（既存を構造非依存で丸ごと再生成）/ `--reconcile`（`.private/<id>`
と DB 生成のドリフト差分のみ・書き込み無し）/ `--adopt`（`.private/<id>` を管理版として生成場所へ取り込み）/
`--work=<Name>` / `--db=<Name>` / `--id=<Value>` / `--lang=jp|en`（en はフェーズ4）/ `--report=<path>`
（既定 `.cache/roleplay-report.json`）。

> CLI はシバン非依存で動きます（`node tools/build-roleplay-prompts.mjs` で起動）。vitest 4.1.0 はテスト
> 対象モジュールを関数ラップして評価するため、テストから import される本ファイルの先頭にシバン行は置きません
> （置くと suite 読み込み時に `SyntaxError` になる）。

## テンプレート仕様（`roleplay-prompt.tpl.md`）

- 先頭に設定ブロック `<!-- 100bl:tpl ... -->`。`displayName` 等の合成変数を式で宣言し、build が評価して
  本体から除去します（生成物には出ません）。
- プレースホルダ:
  - `{{Path.To.Field}}` … record → 合成変数の順で解決。`@Name` は合成変数。
  - `{{Field | filter}}` … フィルタ:
    - `nospace`（空白除去）/ `oneline`（先頭行）/ `trim`
    - `commas`（改行→「、」）/ `bullets`（改行→「- 」箇条書き）
    - `orjoin`（改行→「 または 」）/ `altnames`（空白除去＋「 または 」）
    - `orquote` / `altquote`（改行→「」または「。**名前系はこちらを使う**）
    - `sentences`（文単位に分割し「- …。」の箇条書き化）
  - `{{#Field}}…{{/Field}}` / `{{^Field}}…{{/Field}}` … 条件（空なら行/ブロック除去）。
  - `{{#each Path}}…{{/each}}` … 配列反復（`DialogueExamples` 用に整形済み `@dialogue` を提供）。
- 合成変数（build が計算）:
  - `@DisplayName` / `@FormalName` / `@FormalNameCompact` … `*Name` 系の複数名（改行区切り）は
    **1 名ずつ鉤括弧で括る形**（`「87(ヤシナ)」または「87(ハナ)」`）で連結。`DisplayName` は改行が
    残っても build 側で必ずこの形へ寄せる（防御）。
  - `@FormalNameReading` … 読みは `（読み：…）` の中に置かれ鉤括弧で括られないため「 または 」連結。
  - `@WorkTitle_JP` … 作品名（複数行は先頭行のみ）。
  - `@FirstPerson` / `@SecondPerson` / `@ThirdPerson` / `@ForMaster` … 呼称 DSL を `calling-common` で展開。
  - `@Gender` / `@Race` / `@Belonging` … enum/辞書ラベル解決（`type-common`）。object 値は `value` を取り出す。
  - `@Age`（`Age`→無ければ `ConceptAge`。object は value）/ `@BirthDay`（`{Day:{Month,DayOfMonth}}`→「M月D日」）。
  - `@TailsUnit`（`tailsUnit.js` のサマリー）/ `@DeepLink`（`?c=<Work>/<Db>/<Index>:<値>`）。
- `hideText`（非公開マスク）は `resolvePath` で省略され、プロンプトには出ません。
- 型番（`ModelNumber` 等の英数字コード）は Markdown インラインコード（`` `…` ``）で表示します。

### 名前の並列表記（`「A」または「B」`）

`Name_JP` / `FormalName_JP` が改行区切りの複数名を持つ場合、**1 名ずつ鉤括弧で括って**並べます
（`「87(ヤシナ)」または「87(ハナ)」`）。外側の `「` `」` は**テンプレ側が持つ**約束で、フィルタ
（`orquote` / `altquote`）は名の**間**だけを `」または「` で繋ぎます。単一名ならフィルタは素通しで、
テンプレの `「` `」` がそのまま付くだけです。

> このため `{{@DisplayName}}` / `{{@FormalName}}` / `{{CodeName_JP | orquote}}` は、テンプレ上で必ず
> `「` `」` の内側に置いてください。鉤括弧の外で使うと `」または「` がむき出しになります。読み
> （`@FormalNameReading`）は鉤括弧で括らないため従来どおり `orjoin`（「 または 」）です。

### 文分割（`sentences`）の境界

`sentences` は「。」で文を切り「- …。」の箇条書きにしますが、**括弧内の「。」では切りません**
（`splitSentences()` が括弧の深度を数える）。`(姉の『78(ナナハ)』を慕い、…と明るく返す。)` のように
括弧内で完結する補足文が、閉じ括弧だけ次の行へ落ちて `- )。` になるのを防ぐためです。

- 閉じ括弧そのものは文末とみなしません（`（補足）続き。` を割らないため）。
- 分割後の文が既に句点・閉じ括弧・終止記号で閉じている場合、「。」を重ねて付けません。

### 改行コード（CRLF）の扱い

テンプレ・既存生成物・DB 値は、入口で必ず LF へ正規化してから処理します（`normalizeEol()`）。
Windows のワークツリーは `.gitattributes` の `* text=auto` ＋ `core.autocrlf=true` で `.md` が CRLF に
なるため、正規化しないと次の 2 つが壊れます。

- `finalizeText()` の空行畳み込み（`\n{3,}` 等）が一致せず、**セクション間に空行が余分に残る**。
- `diffSections()` / マージの比較が改行コード差だけで全節 `updated` になり、**毎回「更新あり」**になる。

書き出しは常に LF です。既存が CRLF でも内容が同じなら `unchanged` と判定し、書き込みません。
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

## 既存ファイルのマージ更新（見出しアンカー方式）

`--write` で既存の生成物を再生成するとき、`tools/roleplay/sections.mjs` が **見出し文字列をアンカー**に
セクション単位でマージします（マーカーは使いません）。

- **テンプレ由来見出し**（`## 「X」の概要` / `## 「X」の基本情報` / `## 「X」の口調` など、現行 DB の
  完全生成物に現れる見出し）… 常に DB 最新で上書き。
- **手書き独自見出し**（テンプレに無い見出し。例 `## セッション開始時の強制ルーティン`）… 直前隣接の
  管理見出しをアンカーに、元の位置のまま保全。
- 手書き独自見出しが無い既存ファイルは、生成物と byte 一致なら no-change（冪等）。
- `--force` は構造を認識できない既存を丸ごと再生成する脱出口です（通常は不要）。
- 書き込みは一時ファイル → rename でアトミックに行い、上書き前の内容は `.cache/roleplay-backups/` へ
  退避します（`.cache` は Git 管轄外）。

> **約束事**: テンプレ由来見出しのセクション本文へ手書きした内容は、再生成で DB 最新へ戻ります。恒久的に
> 残したい手書きは「テンプレに無い独自見出し」の下に置いてください。

## 手書きプロンプトの差分・取り込み（`--reconcile` / `--adopt`）

`.private/roleplay-prompt-<id>.md`（手書き実運用プロンプト）と DB 生成物の関係を扱います。原本 `.private/`
は**いずれのモードでも書き換えません**。

- `--reconcile` … `.private/<id>` と現行 DB 生成のドリフトをセクション単位で一覧表示するだけ（読み取り
  専用・書き込み無し）。型番・尻尾ユニット・正式名称などの DB 事実が手書きとズレている箇所を把握できます。
- `--adopt` … `.private/<id>` を見出しアンカーでマージし、「DB 由来見出し＝最新化／手書き独自見出し＝保全」
  した**管理版**を生成場所（`DB_<Db>/roleplay-prompt-<id>.md`）へ書き出します。既定は dry-run（差分表示）、
  `--adopt --write` で実書き込み。`--id` で対象を1件に絞る運用が基本です。
- **既知の非対称**: テンプレは性格を「概要」へ畳み込むため、手書きが `## 性格` を独立節に持つ場合、adopt 後は
  「概要（畳込）」＋「性格（保全）」で内容が重複しえます。ツールは創作本文を書き換えないため、重複解消は
  dry-run 差分を見て User が手動整理してください。

## テスト

- `tests/roleplay-render.test.js` … テンプレエンジン・フィルタの純関数テスト。
- `tests/roleplay-sections.test.js` … 見出しアンカー分解／マージ／差分（`splitSections` / `mergeByHeadings` /
  `diffSections`）の純関数テスト（テンプレ由来節の上書き・手書き独自節の位置保全・冪等）。
- `tests/data.roleplay-prompts.test.js` … 実データ統合（レンダ成功・未解決なし・冪等性・マーカー非混入・
  出力パス規約・非充填除外・マージの実データ回帰）。
