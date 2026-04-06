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
- `lib/data-common.js` で `#ListLink_*` を varsdef から再帰的に index 化し、enrich 時に `EffectText` / `SafetyLevelText` などの wrapper object へ `Rank` と補助ラベルを補完するよう修正。
- 回帰防止として `tests/enrich.dblink.jump.merge.test.js` に `#ListLink` 補完テストを追加。
- `pages/characters.js` の API fetch を `cache: 'no-store'` に変更し、古い疑似 API 応答がブラウザキャッシュで残って表示差分が見えない経路を抑止。
- `pages/characters.html` の `asset-version` を `2026.04.06.5` へ更新。
- `pages/characters.js` の単一葉オブジェクト判定を補強し、SW enrich によって `Rank` / `*_EN` などの補助キーが追加された `#ListLink` wrapper でも `EffectStats` / `SafetyLevel` の描画候補から外れないよう修正。
- `pages/characters.js` で `SpecLevel` のような rank 系 spec 項目を `SafetyLevel` と同じタグ群へ寄せ、`Works_FLInvestigator78` の「安全レベル」と「能力レベル」で表示レイアウトが分かれていた点を統一。

## 影響範囲

- `lib/sw-common.js`
- `lib/data-common.js`
- `pages/characters.js`
- `pages/characters.html`
- `tests/sw.deftype.merge.test.js`
- `tests/enrich.dblink.jump.merge.test.js`
- `CHANGELOG.md`
- `_work_in_progress/README.md`

## 未完了タスク

- ブラウザ上で `Works_PastDivers` の `ChronoizedPurity` / `ChronoizedAbout` が期待通りに見えることを最終確認する。
- SW 側の `#ListLink` 補完で、実際の `Works_PastDivers` / `Works_FLInvestigator78` の「スペック/能力」表示差分が十分に解消されるかをブラウザで確認する。

## 参考リンク

- `data/db_type.json` の `$EnumDef_Decave`
- `data/Works_PastDivers/DataBases/db_type.json` の `ChronospecStats.ChronoizedDecave`
- `data/Works_FLInvestigator78/DataBases/db_type.json` の `ArcanumspecStats.SpecType` / `EffectStats`
- `data/Works_UnauthedLogica/DataBases/db_type.json` の `ExistingRarity`
