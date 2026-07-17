# JSON DB のフィールドキー順を typedef（`$DefType` + `$slot`）へ整列

- 日付: 2026-07-17
- ブランチ: `develop`（1st パスはサブローカル `100BeautiesLab_CreationsDB-sub1`、2nd パスは本体ローカル）
- 状態: トップレベルの整列は完了（**2nd パス `$slotAnchor` 追加まで反映済み**）。ネスト整列（Phase 4）と UI マージ実装の統一（Phase 6）は未着手

## 目的

同一 DB 内でもレコードのキー順がバラついており（`NumberTales/db_Primary` は 105 件 76 通り）、レビュー・diff・手書き追記のいずれも辛い状態だった。「表示順の完全な正は `$DefType`」という既存の明文規定（`docs/schema-meta-processing.md`）に実データを追従させる。

User の要望は「冒頭を `Index` → `Progress` → 各種 `_DBLinkRef` → `Name` → `Image` → `FormalName` の順に」＋「キャラ／DB ごとのばらつきを無くす」の 2 点。

## 前提の実測（着手時）

- 対象は **19 DB / 1,283 レコード**（`db_type.json` / `db_meta.json` / `db_temp.json` は除外）
- **トップレベルのキー順は UI に到達しない**。`pages/characters.js:7484` が typedef 順でループし、`:7796` でスキーマ外キーを捨てる。基本情報テーブルは `$DetailLayout.basicFields` 駆動
- 順序が表示に効くのは**ネストの子キー**のみ（`buildObjectChildBlocks()` が `Object.entries()` を回す）。ただし呼び出し元は `$DetailLayout.subFields` 駆動の 1 箇所
- 既存コードは `$DefType` を回す全 9 箇所で `hashTag` falsy を `continue` している → `hashTag` を持たないマーカーは下流から不可視

## 合意事項（User 決定）

1. **Images は `Name` の後**（現行は 183 件が「Images が先」で、反転させる）。表示影響なし
2. **スコープは typedef 全順**（冒頭 5 要素で止めない）
3. **順序の宣言先はグローバル `db_type.json` の `$slot` マーカー**（ツール内定数ではなくスキーマ駆動）
4. **`basicFields` は `$DefType` 順へ揃える**。ただし作品別 typedef で宣言されたフィールドは `basicFields` 側の位置に寄せる
5. **`subFields` を catch-all スロット内の並びに使う**
6. **`Unit_FullEN` は `Unit` の派生として宣言**。`isTriple` / `Regioministration` / `isPrivate` は**フラグ用にあえて宣言しない**運用なので、宣言せず元の位置（Progress 直後 / 末尾）に留める

## 変更点の要約

### 機構（コミット `76e5038`）

- `TypeDefUtils.mergeDefTypes()` に `$slot` マーカー対応を追加
  - `$slotMatch` の語彙は `$type` / `$typeIncludes` / `$display` / `"*"` の 4 種のみ（JS 側に field 名のハードコードはゼロ）
  - `$slotExpand`: `$MetaType.$Def_SecondaryMeta` を参照展開（`sec_*` の二重管理を回避）
  - `$slotOrder`: catch-all 内を `$DetailLayout.subFields` 順へ（要 `{ detailLayout }`）
  - 解決順は 作品側 `$slot` 明示 > `$slotMatch` 述語 > catch-all
  - **マーカー 0 個なら従来仕様へフォールバック**（`mergeDefTypesLegacy()`）
- `data/db_type.json` にマーカー 5 件（`#Index` / `#SecondaryMeta` / `#WorkDBLinkRef` / `#Images` / `#WorkRest`）
- `$Def_DBLinkRef` を `_Work > _DB` へ修正
- `data/db_meta.json` の `basicFields` を 9 作品分整列
- `Works_DestinyFoxRecords` の `Unit_FullEN` を `#Index` スロットへ明示配置
- `tools/normalize-field-order.mjs` 新規 + `package.json` に `data:order:{plan,write,check}`

### データ（コミット `4dc1e5a` / `34a3a4d` / `a6def80` / `60cdcd2`）

DB 単位で分割コミット。**1,198 / 1,283 レコード**を整列。全ファイルで insertions と deletions が同数。

| 適用順 | DB                                       | 結果     | 検証の狙い                               |
| ------ | ---------------------------------------- | -------- | ---------------------------------------- |
| 1      | `FLInvestigator78/UnprocessedDealer`     | 0/55     | no-op 検証（`git diff --exit-code`）     |
| 2      | `NumberTales/UnprocessedSecondary`       | 795/795  | 大量 × 単一パターンで書式保持を実証      |
| 3      | `VirtuesUs/SemiPrimary`                  | 6/8      | 末尾スカラー `isPrivate` の span 処理    |
| 4      | `ShouArRiders/Primary`                   | 7/7      | Index が `BeastType`                     |
| 5      | `UnauthedLogica/Primary`+`PrimaryMobs`   | 11/11    | 別名 Index（`Model`/`Logic`/`LogicAlt`） |
| 6      | `DestinyFoxRecords/Primary`+`Proxy`      | 15/15    | `$IndexDef_Proxy` / `Unit_FullEN`        |
| 7      | `PastDivers/Primary`+`SemiPrimary`       | 14/14    | —                                        |
| 8      | `SinisterChangingGirls/Primary`          | 6/8      | 未宣言フラグ `Regioministration`         |
| 9      | `UnibyteLive/Primary`+`PrimaryPerformer` | 42/46    | `Name_*` 無しレコード                    |
| 10     | `NumberTales/*`（Primary 105 他）        | 281/1096 | 最難関（76 パターン / 1.5MB）            |

### CI ガード（コミット `0cffac4`）

`tests/data.field-order.test.js` 新規（リポジトリ初のキー順テスト）。

## 実装上の判断（記録）

- **`JSON.parse` → `JSON.stringify` の往復は採らない**。インラインオブジェクトを含む行が 2,716 行あり、往復すると全展開される。prettier の `objectWrap: "preserve"` は畳み直さない（同一ファイル内で `{ "hideText": "非公開希望" }` がインライン・`isPrivate: true` が展開と共存している事実が、折り返しが「幅」ではなく「著者の記述」で決まることを示す）。加えて prettier は devDependencies に無くバージョン非固定
- **未宣言キーは末尾送りにしない**。当初計画は「末尾へ」だったが、`isTriple` / `Regioministration` が Progress 直後にある意図を壊すため、**直前の宣言済みキーへアンカー**する規則へ変更した
- **`Regioministration` は宣言しない**。参照先 `#Dict_Regioministration` が `DB_Hidden: true` で、意図的に伏せている設定に見えたため、ラベル付けを含む宣言追加は User 判断に委ねた
- **VRMs の `$slot: "#Images"` は取り下げ**。`subFields` では `ConversationPattern` の後であり、`$slotOrder` で自動的にその位置へ収まるため不要になった

## 着手時の想定と違った点

- 計画の除外正規表現 `/^db_(?!type$|meta$|temp$)[A-Za-z]+\.json$/` は **`db_type.json` を除外できない**（`type$` は "type.json" に一致しないため否定先読みが素通りする）。`/^db_(?!type\.json$|meta\.json$|temp\.json$)[A-Za-z]+\.json$/` へ修正
- `Works_UnauthedLogica` には `Images` の宣言がない（データにも 0 件）。`$display.section: "images"` は 9 作品中 8 作品
- `ShouArRiders` の Index は `BeastType`。`DestinyFoxRecords` は `Unit`+`Generation`、`UnauthedLogica` は `Model`+`Logic`+`LogicAlt` と複数
- ネストされた `$DefType` 内にも `$type: "#Index"` がある（`PastDivers` の `Lunar` 等）。述語はトップレベル `$DefType` にのみ適用する必要がある
- `sec_*` の現在位置は Progress 直後だけではない。`db_Secondary` の 30 件は `sec_SeriesTitle > Num > ...` と Index より前だった

## 検証

- `npm test` — 36 ファイル / 468 件すべて成功
- `npm run data:order:check` → 0/1283（全 DB が正準順）
- CI ガードが実際に乱れを検知することを、`VirtuesUs` のキー順を意図的に崩して確認（2 件が失敗 → 復元して差分ゼロ）
- 各パイロットで `git diff` の実物を目視（値・インデント・インライン形式が不変であること）

---

## 2nd パス: `$slotAnchor` で `basicFields` をキー順の宣言面へ昇格（同日・本体ローカル）

### きっかけ

User が `data/db_meta.json` の `basicFields` / `subFields` をより良い並びへ再整備し（人称呼称群を `basicFields` へ、`Numerospec*` / `Arcanamspec*` / `Beastspec*` / `Chronospec*` / `Logicspec*` を `subFields` 先頭側へ 等）、その並びでキー順を取り直したいという依頼。作業中に「`basicFields` もキー順に効くようにしたい」と追加要望。

### 着手時の実測

- **9 作品すべてで `basicFields` の「グローバル宣言フィールド分」は既に `$DefType` 順と完全一致**していた（1st パスの整列済み）。よって `basicFields` を順序の正へ昇格しても、グローバル項目の並びは 1 つも動かない
- 実際に動くのは **`basicFields` に載る作品宣言フィールド 7 個だけ**。1st パスでは catch-all（`#WorkRest`）で末尾（51〜57 / 全 53〜59）へ流れていた

| 作品             | フィールド                                    | `basicFields` 上の位置        |
| ---------------- | --------------------------------------------- | ----------------------------- |
| NumberTales      | `TailsUnit` / `ForMasterCalling`              | `BustSize` / `ThirdPersonCalling` の直後 |
| FLInvestigator78 | `For79thDealerCalling` / `For80thDealerCalling` | `ThirdPersonCalling` の直後 |
| UnibyteLive      | `Generation`                                  | （先頭へ移動）                |
| UnauthedLogica   | `ForMasterCalling`                            | `ThirdPersonCalling` の直後   |
| PastDivers       | `ChronoholderName`                            | （`subFields` 先頭へ移動）    |

### 設計判断

- **`$slotOrder` では表現できない**。`basicFields` は「グローバル項目の間へ作品固有フィールドが挟まる」宣言で、行き先が `BustSize` の直後・`ThirdPersonCalling` の直後…と点在する。マーカー 1 個を 1 箇所に置く `$slotOrder` では 1 箇所へまとまってしまう
- → **`$slotAnchor`（宣言配列上の直前の隣人の直後へ散らす）** を新設。`$slotOrder` と対の概念。ツールがレコード側の未宣言キーへ適用している「直前の宣言済みキーへアンカー」規則を typedef 側へ持ち込んだもので、新規の発想ではない
- `$slotMatch` の語彙へ `$inLayout` を追加（4 種 → 5 種）。**JS 側の field 名ハードコードはゼロを維持**
- 実装は「マーカー位置に**番兵**を置き、`out` の組み立て後にメンバーを splice」。アンカー先のグローバル項目が揃うまで位置が確定しないため後段処理にした。番兵は戻り値から除去する

### User 決定（この回）

1. **`TailsUnit` は `basicFields` 優先**（`basicFields` / `subFields` 両載せキーの precedence）。後述の「表示との不一致」を提示したうえで再確認し、現状維持で確定
2. **`Generation`（UnibyteLive）は `Images` の真下**。→ `basicFields` の**先頭**へ置くだけで、アンカー未解決時のフォールバック（＝マーカー位置＝基本項目ブロックの先頭）に落ちて狙いどおりになった。作品側 `$slot: "#Images"` の明示は**不要**だった
3. **`ChronoholderName`（PastDivers）は `subFields` の直前**。→ `basicFields` から外し `subFields` 先頭へ（基本情報テーブルからは消える）

### 判明した重要事項: 両載せキーは「表示」と「キー順」で正が分かれる

`docs/wrapper-summary-registry.md` の記述を追って確認した。UI には**「1項目1箇所の原則」**があり、`pages/characters.js:6957` の `isPromotedSubFieldKey` が「`subFields` へ昇格したキー」を基本情報テーブルから除外する。

- `TailsUnit` は `basicFields` にも載るが、**表示は `tailsUnitSection`（`subFields` 側）のみ**
- 一方キー順は `basicFields` 優先で `BustSize` の直後

→ **表示位置とキー順がずれる**。「詳細画面のセクション順とデータのキー順を揃える」原則の例外にあたるため、User へ再提示して意思確認したうえで現状維持を選択（尺味・体型系の基本属性としてデータ上はまとめたい）。理由ごと `docs/schema-meta-processing.md` §4.2 へ明記した。

### 変更点

- `lib/data-common.js`: `baseHashTag()` 新設 / `matchesSlot()` に `$inLayout` + `options` 引数 / `applySlotAnchor()` 新設 / `mergeDefTypes()` の `$slotAnchor` 対応
- `data/db_type.json`: マーカー `#WorkBasic` を追加（5 → 6 マーカー）
- `data/db_meta.json`: User の再整備 + `ChronoholderName` の移動 + `Generation` の重複宣言を解消
- データ: 19 DB / 1,283 レコードのうち **259 件**を整列（11 ファイル）

### 検証

- `npm test` — 36 ファイル / **479 件**すべて成功（1st パス 468 + 今回 11）
- `npm run data:order:check` → 0/1283（冪等）
- データ 11 ファイルすべてで insertions == deletions（`git diff --numstat` で機械確認）
- 実物のキー順を目視: UnibyteLive は `Name_EN → Generation → FormalName_JP`、PastDivers は `Summary_EN → ChronoholderName → ChronospecName`、NumberTales は `BustSize → TailsUnit → ConceptAge` / `ThirdPersonCalling_EN → ForMasterCalling_JP`

### テスト追従の判断（記録）

`tests/pages.characters.ui-output.test.js` の「基本情報テーブルに `時空象器能力名` が出る」期待値が落ちた。**テスト期待値の書き換えで隠す前に、描画漏れ（実バグ）でないことを確認**した:

- jsdom で `renderDetail()` を実行して DOM をダンプ → `時空開花 / ChronoBloom` もラベルも描画されており、`subFieldKeys[0] === 'ChronoholderName'`（＝ `subFields` 先頭）で意図どおり。UI はレイアウト変更に追従済み
- `git stash` で自分の変更を退避して、失敗が User の `db_meta.json` 編集由来であり自分のコード変更とは無関係であることも確認
- → 実バグではないと判断し、和英併記の検証価値を残す形で standalone セクション側へ付け替えた（削除ではなく移設）

なお `時空象器能力名` は `ChronospecName` ではなく **`ChronoholderName`** のラベル（`ChronospecName` は「時空遷移(クロノシフト)能力名」）。取り違えやすいので注意。

### 調査したが問題なかった点

- `tests/pages.characters.ui-output.test.js:739` の「subFields 宣言順が優先される」テストは、`basicFields` 再整備後も通っていた。UI が `subFields` 順に追従していないのかと疑ったが、このテストは `structuredClone(globalMeta)` で `$DetailLayout.subFields` を合成値へ差し替えており実データと無関係だった（UI は正しく追従している）

---

## 未完了タスク

- [ ] **実機確認**: `basicFields` の整列で基本情報テーブルの表示順が変わるため、ローカル HTTP サーバで目視が必要。1st パス分（`Age`/`AnivDay`/`BirthDay` が後方へ）に加え、2nd パスで次も変わった。jsdom の UI テスト（479 件）は通っているが、実ブラウザでの見た目は未確認
  - 人称呼称群（`FirstPersonCalling` 〜 / `ForMasterCalling` / `For*DealerCalling`）が基本情報テーブルへ新規表示
  - `UnibyteLive`: `Generation` が先頭（`AnotherRegions_DBLink` より前）
  - `PastDivers`: `ChronoholderName` が基本情報テーブルから消え、`subFields` 先頭のセクションへ
  - `ShouArRiders`: `BeastspecName` が基本情報テーブルから `subFields` 先頭へ
- [ ] **Phase 4: ネスト整列**（`--nested`）。`$DetailLayout.subFields` の 21 フィールドと `RelationTo_*` は表示順が変わるため除外し、`Images` の子（26 通り → 1 通り / 189 出現）が主目的。**表示に効かない範囲に限定できる**
- [ ] **Phase 6: `extractTopLevelSchemaFields()` の統一**（別 PR）。現状 UI（work 先）と SW（global 先）でマージ順が逆。`lib/wrapper-common.js` へ `mergeDefTypes` 相当を移設して単一実装へ収束させる。**唯一の UI 変更点**なので単独 PR
- [ ] `isPrivate` の扱い（User 確認待ち）。現状は宣言せず末尾に留めている
- [ ] `$VersDef`（4 作品）と `$VarsDef`（UnauthedLogica）の表記ゆれ。`lib/data-common.js` は `$VarsDef` のみ辞書へ合成しており、`$VersDef` は読まれない（中身は名前付き型定義なので実害は「置き場の名前が不統一」）

## 参考

- 計画ファイル: `C:\Users\s-chi\.claude\plans\json-typedef-index-progress-dblinkref-n-witty-pearl.md`
- 仕様: `docs/schema-meta-processing.md` §3.1 / §4.2 / §5.4
- 運用: `docs/db-update-guidelines.md` §3.1 / §8.1
