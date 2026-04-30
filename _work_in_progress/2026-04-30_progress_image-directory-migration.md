# 2026-04-30 progress: image directory migration

## 目的

- 作品別画像ディレクトリの命名規則を、裸の DB 名ではなく catalog key に対応する `DB_*` / `Ref_*` 形式へ統一する。
- References 系 DB でも画像参照を可能にするため、`Images/Ref_Glossary/` や `Images/Ref_Reference/` の受け皿を追加する。

## 変更点の要約

- `pages/characters.js` と `lib/data-common.js` に `dbName -> Images/DB_* or Ref_*` の正規化を実装した。
- References 画像では shared layer だけでなく work-local `References/db_type.json` も UI 側で合流し、`Images.*` の field 名から folder hint を導出してサブフォルダを解決するようにした。
- `data/Works_*/Images/` 直下の既存ディレクトリを `DB_Primary` などへ rename した。
- `data/Works_NumberTales/Images/` に `Ref_Glossary` / `Ref_Reference` を追加した。
- docs / 指示書 / README 群を新しい画像ディレクトリ規則へ更新した。
- 回帰テストとして、References 画像 URL と `Images` 直下命名規則の検証を追加した。

## 影響範囲

- `pages/characters.js`
- `lib/data-common.js`
- `tests/pages.characters.ui-output.test.js`
- `tests/data.sanity.test.js`
- `README.md`
- `pages/README.md`
- `docs/db-update-guidelines.md`
- `docs/api-sw-spec.md`
- `docs/schema-meta-processing.md`
- `docs/readme.en.md`
- `docs/viewer-guide.md`
- `.github/copilot-instructions.md`
- `CHANGELOG.md`
- `data/Works_*/Images/*`

## 未完了タスク

- Ref 系 DB に実画像を投入する場合のファイル命名ルール詳細は、必要になった時点で `db_type.json` の `$image` 宣言と合わせて補足する。

## 検証

- `tests/pages.characters.syntax.test.js`
- `tests/pages.characters.ui-output.test.js`
- `tests/data.sanity.test.js`

## 参考リンク

- `docs/api-sw-spec.md`
- `docs/schema-meta-processing.md`
- `.github/copilot-instructions.md`
