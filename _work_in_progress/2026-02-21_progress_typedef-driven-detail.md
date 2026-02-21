# 2026-02-21 進捗: characters 詳細ビューの宣言駆動化（object子展開 / Relation / VarsDef整理）

## 目的

- `pages/characters.js` の詳細ビュー表示を、固定キー列挙・ハードコードから脱却し、`db_type.json($DefType)` / `db_meta.json($VarsDef)` の宣言を優先して柔軟に追従させる。
- object 値が UI で `[object Object]` になって可読性が落ちるケース（SpecType など）を、typedef に基づき分解表示して解消する。
- Relation 表示を `db_meta.json` の `#List_*` による表示名解決に寄せ、作品ごとの差分をデータ側で吸収できるようにする。

## 変更点の要約

- UI: typedef 上で子フィールドが定義されている object 値を「子ラベル: 値」形式に展開して表示する処理を追加（SpecType 表示と汎用表示の双方）。
- UI: `RelationLabel` を `db_meta.json($VarsDef.#List_RelationLabel)` から解決して JP 表示。
- UI: `resolveVarsDefLabel()` が `Databases.*._Commons`（例: ShouArRiders の `#List_Beast`）も探索できるようにし、`#ListIndex` の表示名解決に利用。
- UI: `#ListIndex_withAbout[]`（例: `RaceType`）の `{ <Field>: code, about(_JP|EN) }` を「表示名（about）」として整形できるようにした。
- Data（NumberTales）: `$Def_Relations.$TypeDef` を `db_type.json` から `db_meta.json` に移動し、型=スキーマ / メタ=VarsDef の役割分離を改善。
- Data（ShouArRiders）: `BeastspecName` / `BeastspecName_EN` を `profile` セクションへ分類。

### 追補（\_Commons 優先 / JP/EN 併記 / 表示ノイズ抑止）

- SW: 作品別 `db_meta.json` の `_Commons` を「空値も未設定扱い」で適用するよう拡張し、後段の `_DBLink` 参照より初期値が優先されるようにした（例: NumberTales の `Belonging`）。
- UI: スキーマが base キーのみでも、実データに `*_JP` / `*_EN` があれば 1 行に統合して表示するよう拡張。
- UI: base が表示済みなら `*_JP` / `*_EN` は二重表示しない。
- UI: 空配列/空オブジェクト等の自動表示を抑止し、空の能力種別が余分に出るケースを抑制。
- UI: `_DBLink` 解決結果のチップ（`RaceType`/`GenderType`）を typedef/meta 駆動の整形へ統一。

## 影響範囲（編集したファイル）

- pages/characters.js
- lib/sw-common.js
- data/Works_NumberTales/DataBases/db_meta.json
- data/Works_NumberTales/DataBases/db_type.json
- data/Works_ShouArRiders/DataBases/db_type.json
- CHANGELOG.md

## 設計メモ

- object を常に JSON 文字列化するのではなく、「typedef に子フィールドがある object」に限定して子要素へ分解表示することで、構造を活かしつつ表示ノイズを減らす。
- Relation は作品差が出やすいため、値→表示名（JP）変換を `#List_RelationLabel` に寄せ、JS 側の条件分岐を増やさない。

## 検証

- Vitest: 8/8 passed（回帰なし）

## 未完了タスク

- ブラウザ上での表示最終確認（特に Works_FLInvestigator78 の SpecType 表示と、NumberTales の Relation 表示）。

## 参考リンク

- CHANGELOG: 2026-02-21 の該当項目
- 関連方針: .github/copilot-instructions.md（スキーマ駆動・typedef優先順位）
