# 2026-08-03 進捗: `$Def_Relations` のオブジェクト型インデックス解決

**環境**: main（本体ローカル） / ブランチ `develop`

## 目的

ハンカクライブ（`Works_UnibyteLive`）で関係性データを入力していたところ、`Relation` 系フィールドの参照解決が
正しい相手を指さない問題が報告された。原因を特定し、オブジェクト型インデックス（複合インデックス）でも
参照先が一意に解決されるようにする。

## 背景・原因

- ハンカクライブの `$IndexDef` は `Letter{ Alphabet: #IndexListKey, AlphaGen: #Number|#Null }` のオブジェクト型。
- `lib/section-renders/relation.js` の `getIndexIdentifierFromRelation()` は、参照先の識別子を
  `pickPrimaryIndexSubDef()` が選ぶ**サブフィールド 1 つ**からしか組み立てていなかった。
- 同関数は `#Number`（30点）を `#IndexListKey`（20点）より優先するため、`Alphabet` が完全に落ちて
  `Letter.AlphaGen: 2` だけが条件になっていた。結果、「S の第2世代（S:ナーミィ）」を指したつもりのリンクが
  「レコード順で最初に見つかった第2世代（A:エイリ）」へ飛んでいた。
- リポジトリには複合条件（`__conditions__` + subset match）の経路が既に整備されており、
  `getIndexIdentifierFromRecord()` / `lib/section-renders/dblink.js` / 相関図の `extractIndexPairs()` は対応済み。
  **`Relation` だけがこの経路に乗り遅れていた**という状態だった。
- ナンバーテールズ（スカラー Index `Num`）では単一サブフィールドで一意に決まるため表面化しなかった。
  「ハンカクライブのときだけ壊れる」という症状はこれで説明がつく。

## 変更点の要約

1. **複合条件への正規化**（`lib/section-renders/relation.js`）
   - `collectIndexEntries()` + `buildIndexIdentifier()` を `relationApi` 経由で bridge し、Relation エントリに
     書かれたサブフィールドを**すべて**含む複合条件へ正規化。以降は既存の subset match 経路へ合流する。
   - オブジェクト型 Index は `context: 'value'`（root 付き・root 省略の両方に耐える）、
     スカラー Index は `context: 'record'`（`record.Num` フォールバック込み）で従来どおり。
   - 直リンクのキー順は typedef 宣言順（カテゴリキー先頭）へ揃え、`getIndexIdentifierFromRecord()` の出力と一致させた。
2. **表示テキストの分離**（同上）
   - 複合条件の `value` は JSON ペイロードのため画面に出せない。識別子へ `text`（`S2` 形式）を持たせ、
     クロスDB のハイドレーション待ちプレースホルダと解決失敗時のフォールバックに使う。
   - `hydrateCharacterName()` の `Num` 直接比較フォールバックは、JSON ペイロードのときは走らせない。
3. **main code 側の bridge 追加**（`pages/characters.js`）
   - `relationApi`（2 箇所）へ `collectIndexEntries` / `buildIndexIdentifier` を追加。
   - テスト用フック `__collectIndexEntriesForTest` / `__buildIndexIdentifierForTest` を追加。
   - `relationApi` がヘルパーを提供しない場合（キャッシュ差分）は従来の単一サブフィールド経路へフォールバックする。
4. **`unit_JP` テストの追従**（`tests/pages.characters.ui-output.test.js`）
   - `Generation` が `Class` へ統合されて実データから消え、リポジトリ内の `$display.unit_JP` 宣言が 0 件になった。
     描画実装は現役のため、合成 typedef で回帰検出のみを維持する形へ組み替えた。

## 影響範囲

- `lib/section-renders/relation.js`
- `pages/characters.js`
- `tests/section-renders.relation.test.js`（新規）
- `tests/pages.characters.ui-output.test.js`
- `CHANGELOG.md`

## 検証

- `npm test`: 59 ファイル / 1071 件中 **1069 件成功**。
- 残る 2 件（`tests/data.field-order.test.js`）は本変更と無関係。クリーンな作業ツリーでも同じく落ちることを
  `git stash` で切り分け済み。
- ローカル HTTP サーバーでの目視確認は未実施（User 側で `?c=UnibyteLive/Primary/Letter.Alphabet:N` を確認予定）。

## 未完了タスク（User 判断・データ入力作業の範囲）

- [ ] `data/Works_UnibyteLive/DataBases/db_PrimaryPerformer.json` のキー順整列（`npm run data:order:write`）。
      `tests/data.field-order.test.js` の 2 件はこれで解消する。
- [ ] `data/db_meta.json` の `CreationWorks.#Works_UnibyteLive.$DetailLayout.basicFields` に残る `Generation` の削除。
      `db_type.json` からは削除済みで、`Class` へ統合したときの掃除漏れと思われる。表示上は無視されるだけ。
- [ ] `data/Works_UnibyteLive/DataBases/db_Primary.json` の `S:ツェット` が持つ
      `Letter: { Alphabet: "S", Generation: 2, AlphaGen: 1 }` の `Generation` サブフィールド。
      `$IndexDef` に宣言が無く Index として解釈されない。意図的な残置か入力途中かは User の確認待ち。

## 参考

- `docs/schema-meta-processing.md`（`$IndexDef` / 複合インデックス）
- `AGENTS.md`「直リンク（URL クエリ）」節（圧縮ロケータと `__conditions__` の仕様）
- `lib/viewer-locator.js`（`buildIdxToken()` / `parseIdxToken()`）
