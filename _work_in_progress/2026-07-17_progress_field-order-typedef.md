# JSON DB のフィールドキー順を typedef（`$DefType` + `$slot`）へ整列

- 日付: 2026-07-17
- ブランチ: `develop`（サブローカル `100BeautiesLab_CreationsDB-sub1` で作業）
- 状態: トップレベルの整列は完了。ネスト整列（Phase 4）と UI マージ実装の統一（Phase 6）は未着手

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

## 未完了タスク

- [ ] **実機確認**: `basicFields` の整列で基本情報テーブルの表示順が変わるため、ローカル HTTP サーバで目視が必要（`Age`/`AnivDay`/`BirthDay` が後方へ、`UnibyteLive` は `AnotherRegions_DBLink` が先頭）
- [ ] **Phase 4: ネスト整列**（`--nested`）。`$DetailLayout.subFields` の 21 フィールドと `RelationTo_*` は表示順が変わるため除外し、`Images` の子（26 通り → 1 通り / 189 出現）が主目的。**表示に効かない範囲に限定できる**
- [ ] **Phase 6: `extractTopLevelSchemaFields()` の統一**（別 PR）。現状 UI（work 先）と SW（global 先）でマージ順が逆。`lib/wrapper-common.js` へ `mergeDefTypes` 相当を移設して単一実装へ収束させる。**唯一の UI 変更点**なので単独 PR
- [ ] `isPrivate` の扱い（User 確認待ち）。現状は宣言せず末尾に留めている
- [ ] `$VersDef`（4 作品）と `$VarsDef`（UnauthedLogica）の表記ゆれ。`lib/data-common.js` は `$VarsDef` のみ辞書へ合成しており、`$VersDef` は読まれない（中身は名前付き型定義なので実害は「置き場の名前が不統一」）

## 参考

- 計画ファイル: `C:\Users\s-chi\.claude\plans\json-typedef-index-progress-dblinkref-n-witty-pearl.md`
- 仕様: `docs/schema-meta-processing.md` §3.1 / §4.2 / §5.4
- 運用: `docs/db-update-guidelines.md` §3.1 / §8.1
