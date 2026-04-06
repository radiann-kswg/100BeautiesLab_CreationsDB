# Decave Enum API/UI 対応ログ

## 目的

- `$EnumDef_*` で定義した `Decave` を、API 側とキャラシート生成機能の両方で辞書解決できるようにする。
- `db_meta.json` と `db_type.json` に辞書が分散していても、同じ経路で扱えるようにする。

## 変更点の要約

- `lib/sw-common.js` の `v1/deftype/global` を、`db_meta.json` と `db_type.json($VarsDef)` の合成レスポンスへ変更。
- `lib/sw-common.js` の `v1/works/{work}/meta` でも、作品別 `db_type.json($VarsDef)` を `meta.General.$VarsDef` に合流するよう変更。
- `pages/characters.js` の `fetchGlobalDefType()` で、API 応答が古い場合でも `db_type.json` の `$VarsDef` を補完するよう変更。
- 回帰防止として `tests/sw.deftype.merge.test.js` を追加。
- `pages/characters.js` で wrapper object の表示優先順位を調整し、`ExistingRarity` などが内部キー付き文字列へ崩れないよう修正。
- `pages/characters.js` で `specStats` 内の `SpecType` 推定を補強し、`Works_FLInvestigator78` の `能力種別` / `効果詳細` の誤表示を抑制するよう修正。
- `pages/characters.html` の `asset-version` を更新し、ブラウザが最新の `characters.js` を再取得できるようにした。
- `pages/characters.js` で `specStats` コンテナ自体を能力値候補から除外し、`ArcanumspecStats` が能力タグとして先に描画されないよう修正。
- `pages/characters.js` で `specStats` 配下の未処理フィールドを `$display.section` に従って各セクションへ合流し、`Works_PastDivers` の `ChronoizedPurity` / `ChronoizedAbout` を表示するよう修正。

## 影響範囲

- `lib/sw-common.js`
- `pages/characters.js`
- `pages/characters.html`
- `tests/sw.deftype.merge.test.js`
- `CHANGELOG.md`
- `_work_in_progress/README.md`

## 未完了タスク

- ブラウザ上で `Works_PastDivers` の `ChronoizedPurity` / `ChronoizedAbout` が期待通りに見えることを最終確認する。

## 参考リンク

- `data/db_type.json` の `$EnumDef_Decave`
- `data/Works_PastDivers/DataBases/db_type.json` の `ChronospecStats.ChronoizedDecave`
- `data/Works_FLInvestigator78/DataBases/db_type.json` の `ArcanumspecStats.SpecType` / `EffectStats`
- `data/Works_UnauthedLogica/DataBases/db_type.json` の `ExistingRarity`
