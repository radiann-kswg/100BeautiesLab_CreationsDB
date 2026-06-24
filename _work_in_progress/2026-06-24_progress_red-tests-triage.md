# 2026-06-24 進捗ログ — 赤テスト2系統の原因調査と修正方針（提案）

> 作成: 扇一春（調査代理）
> 種別: **調査・提案のみ**。本ログの作成以外に、コード・データ・スキーマ・テストの変更、および git 書き込み系操作（add/commit/push/stash/reset 等）は一切行っていない。
> 参照は読み取り専用（`git log`/`git show`/`git cat-file`、ファイル読み取り、grep）にとどめた。

## 目的

実機の `npm test`（Vitest）で失敗している 2 系統の赤テストについて、リポジトリの実コード・実データ・テストを突き合わせて根本原因を切り分け、安全な修正方針（データ側 / テスト側 / 実装側のどれを正とするか）を提案する。

実機での失敗（参考値）:

- 全体 102 件中 3 失敗、テストファイル 20 中 2 失敗
- 失敗1: `tests/pages.characters.ui-output.test.js` がスイート丸ごと読み込み失敗（0 件実行）。`ENOENT ... data/Works_NumberTales/References/ref_Glossary.json`
- 失敗2: `tests/enrich.dblink.jump.merge.test.js` で 3 件失敗（`_DBLink`/`_Jump` 解決で期待値に対し undefined）

## 検証メモ（マウント切り詰め現象について）

調査中、`data/Works_SinisterChangingGirls/DataBases/db_Primary.json` 等がサンドボックス上で末尾切り詰め（例: 18857 bytes / 末尾の文字列が未閉じ）に見える現象を確認した。これは既知のマウント書き込み遅延によるアーティファクトであり、`git cat-file -s HEAD:<path>`（18870 bytes）および `git show HEAD:<path>` で取得した実体は完全な正常 JSON だった。**本ログのデータ判定はすべて git blob（HEAD 実体）を正として行っている。**

---

## 失敗1: `ref_Glossary.json` 欠落（スイート読み込み失敗）

### (a) 根本原因

**データ側で Glossary → Vocabulary への改名が完了済みなのに、テストが旧名・旧構造のまま取り残されている（テストの追従漏れ）。**

確認した事実:

- `data/Works_NumberTales/References/` の実ファイルは `db_meta.json` / `db_type.json` / `ref_Reference.json` / **`ref_Vocabulary.json`**。`ref_Glossary.json` は存在しない（`git log --diff-filter=D` でも `ref_Glossary.json` は過去に削除済みと確認: 削除コミット `a93ee16`）。
- `References/db_meta.json` の DB キーは **`#Ref_Vocabulary`**（`DB_Label_JP: "語彙辞書"` / `DB_Label_EN: "Vocabulary"`）と `#Ref_Reference`。`Glossary` という DB は現存しない。
- 画像ディレクトリも `data/Works_NumberTales/Images/` 直下は **`Ref_Vocabulary`**（`Ref_Glossary` は無し）。実体 `cnsp-fg_NTsHumanoid.png` は `Images/Ref_Vocabulary/concept-figure/` 配下。
- レコードのフィールドも JP/EN 標準化済み。旧 `Term` → 現 **`Term_JP` / `Term_EN`**（例: `Term_JP: "数秘的加護"`, `Term_EN: "Numerospec"`）。画像フィールド `concept-figure_PNGName` は配列値（`["cnsp-fg_NTsHumanoid"]`）。

この改名は意図的なデータ整備であり、`_work_in_progress/2026-06-13_progress_vocabulary-db.md`（語彙DB実装完了）および `_work_in_progress/2026-06-22_progress_jp-en-naming-standardization.md`（JP/EN 命名標準化 Phase 2〜5 完了）に対応する。

一方テスト側 `tests/pages.characters.ui-output.test.js` は旧仕様を直参照したまま:

- L244 `loadJson('data/Works_NumberTales/References/ref_Glossary.json')` … **モジュール評価時（トップレベル）に実行されるため、ENOENT が throw され、スイート全体が 0 件実行で落ちる**（報告どおり）。
- 併せて L246/248（`record?.Term === 'ヒューマノイド形態'`）, L711/715/750/805 の `db: 'Glossary'`, L744/839 の `/Images/Ref_Glossary/...`, L760 の期待値 `'数秘加護'`（現データは `'数秘的加護'`）も旧仕様で、ファイル欠落を解消しても後続が連鎖的に失敗する見込み。

`git show 03a78e0`（テストを最後に触れたコミット）でも、この大改修コミット内でデータは `ref_Vocabulary.json` 側を更新しているのに、テストの glossary 参照行は更新されていない。**＝改名にテストが追従できていない取り残し。**

### (b) 推奨修正方針 → **テスト側を更新（データ側は現状が正）**

データ（Vocabulary 名称・`Term_JP`/`Term_EN`・`Ref_Vocabulary` 画像ディレクトリ）は意図的かつ完了済みの整備であり、**source of truth は新データ**。`ref_Glossary.json` を復旧するのは退行になるため不可。テスト側を新仕様へ追従させる:

1. L244 のロード先を `ref_Vocabulary.json` に変更（変数名 `numberTalesGlossaryRecords` 等も `Vocabulary` 系へリネーム推奨）。
2. レコード探索キー `Term` → `Term_JP`（L248 の `'ヒューマノイド形態'` は現データの `Term_JP` に一致）。
3. `db: 'Glossary'` → `db: 'Vocabulary'`（L711/715/750/805 ほか）。
4. 画像パス期待値 `/Images/Ref_Glossary/...` → `/Images/Ref_Vocabulary/...`（L744/839）。
5. リストカード期待値 `'数秘加護'` → `'数秘的加護'`（L760）。`concept-figure_PNGName` を配列で扱う点も併せて確認。

> 注: 上記はあくまで提案。実反映は CLAUDE.md の規約（変更計画提示・必要に応じ進捗ログ・`npm test` での確認）に沿って User 監修のもとで行うこと。「会話パターン/創作本文の自動生成はしない」原則には抵触しない（構造・テスト整備のみ）。

---

## 失敗2: `tests/enrich.dblink.jump.merge.test.js` の 3 件（`_DBLink`/`_Jump` 解決が undefined）

### 結論（共通の根本原因）

**実装の回帰ではない。** `lib/data-common.js` の `EnrichmentProcessor.resolveDbLinkPrimaryRecord()`（実体 L375〜）は今も**レコードルートの旧形式 `_DBLink`（`{ worksTitle, dbName, _Search }`）を解決する設計のまま**で、CLAUDE.md の「マージ用のレコードルート `_DBLink` は旧形式を維持」という方針と一致している。`#Index` 解釈も `$IndexDef`（typedef）駆動で機能する（L1315/1336 ほか）。

3 件はいずれも、**JP/EN 命名標準化・インデックス意味変更というデータ移行の下流で、テストの期待値（旧フィールド名・旧値・旧リンク形状）が取り残されたもの**。テスト自体は一部すでに新命名へ移行済み（同ファイル L369 `FormalName_JP`、L376/401 `StoatNum`、L553 `Name_JP`）であり、**3 件は移行漏れの“取り残し”**と判断する。

以下、失敗テストごとに切り分ける。

#### 失敗2-A: 「`#Index`（スカラー）→ Name="ハジメ"」（テスト L216〜234）

- テストは旧形式 `_DBLink: { worksTitle:'NumberTales', dbName:'Primary', _Search:[{ hashTag:'#Index', key:1 }] }` をインライン生成し、`expect(e.Name).toBe('ハジメ')`。
- NumberTales の `$IndexDef` はスカラー `Num`。`#Index` key=1 → `Num=1` レコードは正しく特定できる（実装は機能）。
- だが当該レコードの名称は **`Name_JP: "1(ハジメ)"` / `Name_EN: "1(Unitta)"`** で、**`Name` フィールドは存在しない**。さらに値も `"ハジメ"` ではなく `"1(ハジメ)"`。
- → `e.Name` は undefined。**落ちる箇所は解決分岐ではなく、マージ後の `Name` 参照（フィールド名の不一致）**。
- 原因仮説: **テストの期待値が旧仕様**（`Name` / `'ハジメ'`）。

#### 失敗2-B: 「ネスト `#Index`（Card.Stoat+Card.Num）→ Name="フェニクス"」（テスト L332〜350）

- テストは `_Search:[{ hashTag:'#Index', key:{ Stoat:'Major', Num:0 } }]` で `expect(e.Name).toBe('フェニクス')`。
- FLInvestigator78 の `$IndexDef.Card` は `Stoat`(#IndexListKey) / `StoatNum`(#Number\|#Null) / `Num`(#Number) の 3 サブフィールド。
- 現データの フェニクス は **`Card: { Stoat:'Major', StoatNum:0, Num:22 }`**（`Name_JP:'フェニクス'`、`Name` は無し）。
- テスト key の `Num:0` は **現在の「通し番号」`Num`（=22）に一致しない**。種別内番号は `StoatNum:0` の方。すなわち **インデックスの意味づけ（StoatNum と Num の分離）が移行で変わった**ため、key が別レコード（または不一致）を指す。
- 加えて名称は `Name_JP`。
- → `e.Name` は undefined。**二重の取り残し: (1) インデックス key の意味変更、(2) フィールド名 `Name`→`Name_JP`**。
- 参考: 同ファイルのインメモリ版（L372〜410）は `key:{ Stoat:'Major', StoatNum:0 }` と `Name`（自前 fetcher の値）で正しく書けており、**実データ版だけが旧 key・旧フィールドのまま**。
- 原因仮説: **テストの期待値・index key が旧仕様**。

#### 失敗2-C: 「SinisterChangingGirls → NumberTales の `_DBLink` 解決 + `BirthDay._Jump` 置換」（テスト L140〜162）

- テストは実データ `Works_SinisterChangingGirls/db_Primary.json` の `Drc==='N'` レコードを読み、`expect(rec._DBLink).toBeTypeOf('object')`、続いて `BirthDay._Jump` が参照先 `AnivDay`（`Day.Month=8, DayOfMonth=15, DayAbout='誕生日'`）へ置換されることを期待。
- 現データの当該レコード（git blob 実体）:
  - ルート **`_DBLink` は `null`**。クロスワークリンクは新フィールド **`AnotherRegions_DBLink: [{ "_Work":"NumberTales", "_DB":"Primary", "Num":"0" }]`**（`$Def_DBLinkRef` 新形式）へ移設済み。
  - `BirthDay` は `{ "_Jump": { "hashTag":"AnivDay", "_Search":[{ "hashTag":"DayAbout", "key":"誕生日" }] } }` のまま。
- これにより:
  1. `expect(rec._DBLink).toBeTypeOf('object')` … 実機で undefined を観測との報告。git 実体は `null`（`typeof null==='object'`）。いずれにせよ「ルート旧形式 `_DBLink` が存在する」という**前提が崩れている**。
  2. `_Jump` はルート `_DBLink` を足場に参照先 primary を解決して置換する設計だが、ルート `_DBLink=null` のため**足場が無く解決不能** → `BirthDay._Jump` が残る／`BirthDay.Day` 未定義で L157/159 が落ちる。
  3. 仮に新 `AnotherRegions_DBLink`（Num="0"）経由で NumberTales を引けても、**NumberTales `Num=0` の `AnivDay` は `null`**。さらに `AnivDay` 要素は `DayAbout` → **`DayAbout_JP`/`DayAbout_EN`** に改名済みで、`_Jump._Search` の `hashTag:'DayAbout'` / `key:'誕生日'` は**フィールド名・値ともに現データに一致しない**。
- → 落ちる箇所: ルート `_DBLink` 前提のアサート（L148）と `_Jump` 置換後の `BirthDay.Day.*` 参照（L157〜161）。
- 原因仮説: **データ移行（リンクのルート `_DBLink`→`*_DBLink` suffix への移設＋`DayAbout`→`DayAbout_JP` 改名＋対象 `AnivDay` データ実体の変化）にテストが未追従**。

### (b) 推奨修正方針

source of truth は**新データ**（JP/EN 命名標準化・インデックス意味分離・`$Def_DBLinkRef` 新形式は意図的・完了済み整備）。基本は**テスト側を新仕様へ追従**させる。実装は原則変更不要。

- **失敗2-A**: 期待値を `expect(e.Name_JP).toBe('1(ハジメ)')`（必要に応じ `Name_EN` も）へ更新。`#Index` 解決自体は維持。
- **失敗2-B**: index key を現データに合わせる（フェニクス特定なら `key:{ Stoat:'Major', Num:22 }` か `key:{ Stoat:'Major', StoatNum:0 }`）。期待値は `e.Name_JP === 'フェニクス'`。コメント（`Card:{Stoat:'Major',Num:0} は…`）も更新。
- **失敗2-C**: 次のいずれか。User の意図確認を推奨。
  1. **（推奨・テスト側）** ルート `_DBLink` の `_Jump` マージを**単体検証**する意図なら、実データ依存をやめ、テスト2-A/2-B と同様に**合成レコード**（ルートに旧形式 `_DBLink` を持ち、`BirthDay._Jump` の `_Search` が現フィールド名 `DayAbout_JP` 等で実在値に一致する形）で固定化する。
  2. **（データ確認）** 実データの SinisterChangingGirls 'N' で `BirthDay._Jump` を活かす意図なら、参照足場が `null` の旧ルート `_DBLink` ではなく新 `AnotherRegions_DBLink` 側であること、参照先 NumberTales レコードに `AnivDay`（`DayAbout_JP:'誕生日'` 相当）が実在することを**データ側で**揃える必要がある。
  3. **（実装・要 User 判断／別ブランチ規約に注意）** 「ルート `_DBLink` が無くても `*_DBLink` suffix を `_Jump` の足場として使えるようにする」のは**仕様拡張**であり、`EnrichmentProcessor` の `_Jump` 解決契約（CLAUDE.md: 「`_Jump` は参照先レコードから値を取り出し置換」）に関わる。実装変更は User の意図確認と計画提示を経てから。

> いずれもテスト/データ/実装の変更は本調査の対象外（未実施）。最小・安全なのは 2-A/2-B のテスト追従と、2-C のテスト合成化（方針1）。

---

## まとめ

| 系統 | 根本原因 | 推奨修正先 |
| --- | --- | --- |
| 失敗1 (`ref_Glossary.json`) | Glossary→Vocabulary 改名（DB名/ファイル名/画像dir/`Term`→`Term_JP`）が完了済みなのにテストが旧名を直参照。トップレベルロードで ENOENT → スイート 0 件 | **テスト側を更新**（データは現状が正） |
| 失敗2-A (`#Index`→ハジメ) | 名称が `Name`→`Name_JP`（値 `"1(ハジメ)"`）。解決は機能、アサートが旧フィールド | **テスト側を更新** |
| 失敗2-B (ネスト`#Index`→フェニクス) | index key の意味変更（`Num` 通し番号化／`StoatNum` 分離）＋`Name`→`Name_JP` | **テスト側を更新** |
| 失敗2-C (`_DBLink`+`BirthDay._Jump`) | ルート `_DBLink`(旧形式)→`AnotherRegions_DBLink`(`$Def_DBLinkRef` 新形式)へ移設、`DayAbout`→`DayAbout_JP`、対象 `AnivDay` 実体変化。テストが旧前提 | **テスト側を更新（合成化推奨）**／実装拡張は要 User 判断 |

- 実装（`lib/data-common.js`）は旧形式ルート `_DBLink` 解決・`#Index`/`$IndexDef` 解釈とも健在で、**今回の 3 失敗は実装回帰ではない**。
- 2 系統とも本質は同じ：**意図的なデータ移行（JP/EN 命名標準化・語彙DB整備・インデックス意味分離）にテストの一部が追従しきれていない取り残し**。
- 本ログの作成以外、コード・データ・スキーマ・テスト・git への変更は行っていない。
