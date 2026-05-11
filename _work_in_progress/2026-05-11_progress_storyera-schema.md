# 2026-05-11 progress: storyera schema alignment

## 目的

- `Day` / `Era` / `StoryEra` 周辺の hardcode 棚卸しのうち、まず `StoryEra` の global schema が実データ構造に追従していない問題を最小差分で解消する。

## 変更点の要約

- `data/db_type.json` の `$MetaType` に `$Def_StoryEra` を追加した。
- `$Def_StoryEraCatalog` を `FromEra[]` / `ToEra[]` / `InEra[]` を含む構造へ拡張した。
- `docs/schema-meta-processing.md` と `docs/api-sw-spec.md` を新 schema に合わせて更新した。
- `tests/meta.catalog.schema.test.js` に schema 宣言と `Works_NumberTales` の StoryEra 実データ shape を検証するケースを追加した。
- `pages/characters.js` の `StoryEra` 表示は `about_JP` / `about_EN` を優先しつつ、未指定時は `InEra` または `FromEra` / `ToEra` から自動整形する fallback を追加した。
- `tests/pages.characters.ui-output.test.js` に、構造化 `StoryEra` から summary を自動生成できることを確認するケースを追加した。
- `data/db_type.json` の `$Def_StoryEraCatalog` / `$Def_StoryEra` / `$Def_Day` に `$display.role` を追加し、`pages/characters.js` 側も role 優先で summary を組み立てるようにした。
- `tests/pages.characters.ui-output.test.js` に Day 表示の互換確認ケースを追加し、role 導入後も `8/15（誕生日）` が維持されることを確認した。
- `lib/wrapper-common.js` を追加し、Day / StoryEra の特殊 summary formatter を UI / Service Worker 共通で登録できる最小 registry を導入した。
- `pages/characters.js` は registry を先に試し、未一致時のみ既存 fallback を通す構成へ変更した。
- `api/sw.js` / `pages/sw.js` / `svc/sw.js` も `lib/wrapper-common.js` を読み込むように揃えた。
- `StoryEra` は `$MetaType.$Def_StoryEraCatalog.$display.wrapper = storyEraSummary` を宣言し、characters 側の local StoryEra formatter 実装を削除して shared registry 経由へ移行した。
- wrapper handler の基本シグネチャを `format(value, context)` に固定し、`context.schemaType` / `context.defName` / `context.typeSources` / `context.helpers` を最小入力として扱う方針を明文化した。
- `Day` は characters 側の直書き date formatter を廃止し、wrapper registry を強制指定して summary を得る経路へ寄せた。
- `Era` も `$MetaType.$Def_StoryEra.$display.wrapper = eraSummary` を宣言し、単点年代も shared wrapper で整形できるようにした。
- SW / enrich 側でも wrapper を利用し、DB カタログの `StoryEraSummary` と `_enrichment.wrapperSummaries` を追加した。
- 追加で、DB カタログの `StoryEraSummary` 生成は `lib/sw-common.js` 内の `StoryEra` 個別分岐ではなく、`$MetaType.$Def_DatabaseCatalog` に宣言された wrapper 対象 field から自動導出する方式へ寄せた。

## 影響範囲

- `data/db_type.json`
- `lib/wrapper-common.js`
- `api/sw.js`
- `pages/sw.js`
- `svc/sw.js`
- `pages/characters.js`
- `lib/data-common.js`
- `lib/sw-common.js`
- `pages/characters.html`
- `tests/meta.catalog.schema.test.js`
- `tests/wrapper-common.test.js`
- `tests/enrich.wrapper-summaries.test.js`
- `tests/sw.work-meta-info.test.js`
- `docs/schema-meta-processing.md`
- `docs/api-sw-spec.md`
- `CHANGELOG.md`

## 検証

- `tests/meta.catalog.schema.test.js`: 成功
- `tests/wrapper-common.test.js`: 未実施
- `tests/wrapper-common.test.js`: 成功
- `tests/enrich.wrapper-summaries.test.js`: 成功
- `tests/sw.work-meta-info.test.js`: 成功
- `tests/pages.characters.ui-output.test.js`: 成功
- `tests/pages.characters.syntax.test.js`: 成功

## 未完了タスク

- `Day` は実データが `Day: { Month, DayOfMonth }` のラッパーを持つため、完全な key 非依存化には追加 schema の整理または wrapper 自体の role 化がまだ必要。
- SW / enrich 側では `StoryEra` / `Day` の role 自体はまだ積極利用しておらず、主に UI summary の整理が先行している。
- wrapper registry は最小導入のみで、schema から `wrapper` 名を宣言的に解決する段階まではまだ進めていない。
- `Era` は現時点でも standalone な top-level live data は少ないが、schema / wrapper 側は独立して整えたため、将来 top-level field 化しても追加シグネチャなしで扱える。

## 現在の role 導入内容

`$Def_StoryEraCatalog` 側:

- `FromEra`: `rangeStart`
- `ToEra`: `rangeEnd`
- `InEra`: `representativePoint`
- `about_JP`: `preferredLabel`
- `about_EN`: `preferredLabelAlt`

`$Def_StoryEra` 側:

- `EraGen`: `eraGeneration`
- `YearInEra`: `eraYear`
- `byRealYear`: `realYear`
- `about_JP`: `pointLabel`
- `about_EN`: `pointLabelAlt`

`$Def_Day` 側:

- `Month`: `month`
- `DayOfMonth`: `dayOfMonth`
- `DayAbout`: `annotation`

この role により、UI は `StoryEra` では `preferredLabel` → `representativePoint` → `rangeStart/rangeEnd` の優先順で summary を組み立てられるようになった。`Day` は `month` / `dayOfMonth` / `annotation` を読めるようにしたが、wrapper 互換はまだ残している。

## 参考リンク

- `docs/schema-meta-processing.md`
- `docs/api-sw-spec.md`
