# cross-work `$Def_DBLinkRef` enrich の meta ガード追加 (2026-09-24)

## 目的

`$enrich: true` の `*_DBLink`（`$Def_DBLinkRef`）経路で、参照元作品の `db_meta.json`
（`$DetailLayout`）に宣言していない項目まで参照先作品から流れ込み、キャラシートへ
表示されてしまうバグを解消する。

## 背景・課題

`lib/data-common.js` の `EnrichmentProcessor.enrichRecords()` には cross-work マージ経路が 2 つある。

| 経路 | typedef ガード | meta ガード |
| ---- | -------------- | ----------- |
| §2 ルート `_DBLink`（旧形式） | `declaredKeys` あり | `subFieldKeys`（`$DetailLayout.subFields`）あり |
| §2.1 `$enrich: true` の `*_DBLink` | `declaredKeys` あり | **無し** ← バグ |

`declaredKeys` はグローバル `data/db_type.json($DefType)` を含む merged typedef から作るため、
実質「グローバル宣言の全項目が通る」状態だった。

実測（アンオースドロジカ `AttackerZeroid/61` → ナンバーテールズ `Num:61`）:

- 混入していた項目: `Summary_JP/EN` `Character_JP/EN` `Hobby_JP/EN` `SpecialSkill_JP/EN`
  `Favor_JP/EN` `Unlike_JP/EN` `ColorPalette` `RelationNotes_JP/EN` `Backgrounds_JP/EN`
  `AdditionalDesigned_JP/EN` `AppearanceDetail` `AbilityStats` `CodeName_JP/EN` `BustSize`
- これらはいずれも `#Works_UnauthedLogica.$DetailLayout` の `basicFields` / `subFields` に未宣言

## 変更点

### `lib/data-common.js`

- `mergeFromLinkedRecord()` の meta 許可リストを `allowKeys` オプションに一本化
  （ルート `_DBLink` は `$DetailLayout.subFields`、`$enrich` 経路は `$DetailLayout` 全体を渡す）
- `mergeFromLinkedRecord()` で `fieldEntry.$enrich === false` のフィールドをマージ対象外に
  （**enrich 禁止宣言**の一般化。従来は `*_DBLink` フィールドの解決可否にしか効かなかった）。
  typedef エントリの引き当ては `stripLangSuffix()` でベース名へフォールバックする
- `enrichRecords()` で `detailLayoutFieldSet` を構築
  - `headerPills` + `basicFields` + `subFields` を合成
  - ベース名 ↔ `_JP` / `_EN` の三方向展開（共通ヘルパ `addKeysWithLangAliases()`）
  - `$alt` の代替キーは、primary が列挙されていれば同じ枠で許可（例: `Age` → `ConceptAge`）
- `declaredTopLevelKeys`（typedef ガード）にも同じ言語別名展開を適用。
  グローバル typedef が `FirstPersonCalling`（suffix 無し）で宣言しているのに対し、
  実データは `FirstPersonCalling_JP` / `_EN` を使うため、従来は meta が宣言していても
  呼称フィールドが cross-work マージから落ちていた（UAL の一人称・二人称・三人称）。
- §2.1 の cross-work マージへ `layoutKeys` を、§2 のマージへ `fieldEntriesByKey` を渡す

### テスト

`tests/enrich.dblink.jump.merge.test.js` に 2 件追加。

- UnauthedLogica `AttackerZeroid/61` の実データで、`Height_cm` / `ConversationPattern` は
  穴埋めされ、`Summary_JP` / `ColorPalette` / `RelationNotes_JP` / `AdditionalDesigned_JP` は
  持ち込まれないこと
- `$enrich: false` 宣言フィールドが `_DBLink` 参照先から埋まらないこと

### ドキュメント

- `docs/api-sw-spec.md` §8 / §8.2 に cross-work の 2 段ガード（typedef + meta）と
  `$enrich: false` の enrich 禁止宣言を追記
- `AGENTS.md` の「cross-work `_DBLink` 制約」「別作品からの持ち込み制限」を更新し、
  `$enrich: false` の項を追加 → `npm run agents:build` で生成物を再生成
- `CHANGELOG.md` に追記

## 影響範囲

cross-work な `AnotherRegions_DBLink` を持つ全作品（26 エントリ）。

`UnauthedLogica` / `SinisterChangingGirls` / `PastDivers` / `VirtuesUs` /
`NumberTales` / `FLInvestigator78` / `UnibyteLive`

同一 Work 内リンク（例: `DestinyFoxRecords` の Primary ↔ Proxy）と、レコード自身が
持つ値の表示は変わらない。

## 検証

- `npm test`: 1377 passed / 2 failed
  - 残る 2 件は `tests/data.field-order.test.js` の
    `data/Works_UnauthedLogica/DataBases/db_Primary.json`（レコード #1 の
    `AnotherRegions_DBLink` の位置）で、**本変更以前から存在するデータ側の未整列**。
    `npm run data:order:write` で解消できるが、フレームワーク変更と創作データ変更を
    同一コミットに混ぜない方針のため未実施。
- ローカル HTTP サーバー + ブラウザ（`?c=UnauthedLogica/Primary/ModelSeries:AttackerZeroid,Num:61`）で
  enrich 結果と詳細表示から該当項目が消えることを確認

## 未完了タスク

- `tools/build-roleplay-prompts.mjs` の `enrichRecordFromLinks()` は同じマージ規則を
  独立実装しており、**今回は未追従**。揃えるとロールプレイプロンプト生成物に差分が出るため、
  User の判断待ち。
