# 2026-07-14 進捗: グローバル辞書解決の破損修正（`npm test` 6 件失敗の是正）

## 目的

DB 大幅整備（`c99ab37`）以降、`tests/pages.characters.ui-output.test.js` で 6 件のテストが失敗していた。原因を切り分け、テスト期待値の書き換えで隠さず、実装側の追従漏れ（実バグ）として修正する。

## 背景・症状

`npm test` の失敗 6 件は、いずれも**辞書解決が外れて素値（コード）のまま表示される**症状だった。

| 失敗テスト                                 | 期待                                            | 実際                     |
| ------------------------------------------ | ----------------------------------------------- | ------------------------ |
| dictionary-backed basic fields（所属）     | `夜月機関 / Yadzuki Organization`               | `夜月機関`               |
| enum and hideText values（性別）           | `女性 / Female`                                 | `Female`                 |
| secondary metadata（作者名）               | `ラジアン（柏木主税）`                          | `RadianN`                |
| series-backed secondary metadata（作者名） | `散狐アタスト`                                  | `Atast`                  |
| Belonging-scoped dictionary（クラス名）    | `ベヴストザイン課 … / Bewusstsein Division, …`  | 素値のみ                 |
| other-work spec stats（物理的作用）        | `B（標準 / Normal）`                            | `標準 / Normal`（B 欠落）|

いずれも **`data/Dictionaries`（グローバル辞書）由来**の解決。作品別辞書（`Works_*/Dictionaries`）由来の値は正しく解決できていた。この非対称性が切り分けの決め手になった。

## 根本原因

`pages/characters.js` の `fetchGlobalDefType()` にある妥当性判定 `isValid()` が、

> `General.$VarsDef` に **`$EnumDef_GenderType`** が存在すること

を必須条件として**特定フィールド名でハードコード**していた。

`c99ab37` で `GenderType` の辞書が `db_meta.json($EnumDef_GenderType)` から `data/Dictionaries/dict_GenderType.json`（`#Dict_GenderType` / `$type: #DictIndex`）へ移設されたため、この条件が成立しなくなった。結果:

1. SW（`lib/sw-common.js`）は Dictionaries を正しく合流して `/v1/deftype/global` を返している。
2. しかし UI 側の `isValid()` がそれを **invalid** と判定 → キャッシュを破棄。
3. 直 fetch による救済経路（`fetchDirectDbMeta()`）も同じ `isValid()` で弾かれる。
4. 最終的に `globalDefType` が **空 `{}`** になり、グローバル辞書が全滅する。

作品別辞書は `workMeta` 経由で `metaForLookup` に合流するため影響を受けず、「グローバル辞書だけが落ちる」症状になっていた。ブラウザ実環境でも同じ経路を通るため、**テスト固有の問題ではなく実バグ**。

### 併発していた 2 つ目の欠陥

直 fetch 救済の `fetchDirectDictionaryBundle()` が、辞書カタログの **`dictFile` 宣言を無視**して既定名（`dict_<辞書名>.json`）を決め打ちしていた。`#Dict_DesignedBy`（→ `sec_DesignedBy.json`）で 404 となり、しかも例外が bundle 全体の `try` で捕まるため、**辞書バンドルが丸ごと空になる**作りだった。救済経路が実際に使われるようになった今回、同時に是正した。

## 変更点

- **`pages/characters.js` — `fetchGlobalDefType().isValid()`**: 判定をフィールド名非依存の**スキーマ形状ベース**へ変更。
  1. `CreationWorks` を持つ = グローバルメタである（作品別 meta は `Databases` を持つ）。「別のメタを誤って掴む」ことを防ぐ従来の意図は維持。
  2. `$VarsDef` に `#Dict_*` が 1 つ以上合流している。旧 SW / 古いキャッシュが返す「辞書未合流の `db_meta.json` 単体」は引き続き invalid とし、直 fetch 救済へ回す。
- **`pages/characters.js` — `fetchDirectDictionaryBundle()`**: `dictFile` 宣言を尊重し、辞書ファイル単位の `try/catch` で 1 本の欠損が他を巻き添えにしないようにした（`lib/sw-common.js` の `readDictionaryBundle()` と同じ耐性）。
- **`pages/characters.js` — デバッグログ**: `hasGenderEnum`（旧 `$EnumDef_GenderType` 前提）→ `hasGenderDict`（`#Dict_GenderType`）へ。
- **`pages/characters.html`**: `asset-version` を `2026.07.14.1` → `2026.07.14.2`。
- **`tests/pages.characters.ui-output.test.js`**: `renders shared RaceType dictionary values in English …` の期待値を `Warfox(Acquired)` → `Warfox (Acquired)` へ更新（テスト名・注釈も追従）。

### テスト期待値を書き換えた 1 件について

`langMode: 'shared'` の英語表示は「辞書に `RaceType_EN` があればそれを使い、無い場合のみベースコードへフォールバック」する仕様。改修前の `dict_RaceType.json` には `Warfox(Acquired)` の `RaceType_EN` が**存在しなかった**ため、旧テストは**フォールバック結果**（＝ベースコード）を固定していた。今回の整備で `RaceType_EN: "Warfox (Acquired)"` が追加されたので、辞書ラベルを返す現在の挙動が正しい。実装バグの隠蔽ではなく、データ仕様への追従。

## 検証

- `npm test`（`develop`）: **33 ファイル / 370 件すべて成功**。報告のあった 6 件の失敗も解消。
- ブラウザ実地確認: 未実施（要 User 確認。性別・所属・種族・クラス・作者名の和英併記が戻っているか）。

## 影響範囲

- `pages/characters.js`
- `pages/characters.html`（`asset-version`）
- `tests/pages.characters.ui-output.test.js`
- `CHANGELOG.md`

JSON データベース（`data/**`）はこの変更では未変更。

## 未完了 / 申し送り

- **ブラウザ実地確認**（ローカル HTTP サーバーでキャラシートを開き、辞書解決の和英併記を目視）。
- **ブランチ**: 本修正は `develop`（コアコードのため）。`addon-ai-tag` にも同じ失敗が出ているが、`develop` → `addon-ai-tag` の一方向マージで取り込む。逆マージはしない。
- 参考: 本件の 6 件失敗は `_work_in_progress/2026-07-14_progress_url-params.md` に「URL 変更とは無関係の既存失敗」として記録されていたもの。
