# 2026-11-28 NumberTales 人間キャラクターの DB 分離

作業環境: `main`（本体ローカル）/ ブランチ `develop`。コミットは未実施。

## 目的

種族が人間（コアフォルダが存在しない）のキャラクターを、妖獣型の DB から `PrimaryHuman` / `SemiPrimaryHuman` へ退避する。

## 変更点の要約

| 移動元 | Num | 移動先 |
| --- | --- | --- |
| `Primary` | `0`, `00` | `PrimaryHuman` |
| `SemiPrimary` | `%`, `∞` | `SemiPrimaryHuman` |

- `000` は RaceType の「実際」が `PortableHumanoid(TaleBeastType)` でコアフォルダ画像もあるため、`Primary` に残した（User 確認済み）。
- カタログは親 DB の定義を複製し、`_Commons` から `RaceType` だけ外した。enrich 後の表示値は移動前と同じ。
- `0`・`00` 宛ての関係を `RelationTo_PrimaryHuman`（typedef 新設）へ付け替えた。`Primary` の 7 レコード 9 件、`SemiPrimaryHuman` の 2 レコード 4 件。
- `_DBLink` 13 箇所、`_DBCrossLinkPath` 2 箇所の `_DB` を更新。
- 画像 5 枚、配布用ロールプレイプロンプト 4 件を新 DB のフォルダへ移動。プロンプトは `tools/build-roleplay-prompts.mjs --write --db=<新DB>` で再生成（差分は直リンク URL のみ）。
- `tools/build-roleplay-prompts.mjs` の `@RelationComments` を `RelationTo_*` にも対応させた（付け替えた 85 の一言が落ちるのを防ぐ。85 のプロンプトは並び順のみ変化）。
- コード変更は上記 1 箇所のみ。レコードの移動は書式を保つためテキスト処理で行い、移動前後でレコード・関係エントリが 1 件も欠けないことを検証した。

## 追記: `any`（乃木 希）の補完（同日）

User が `PrimaryHuman` へ追加した `Num: "any"` を、記載済みの情報と設定原画から補完した。

- `AppearanceDetail` 7 項目: GPT（`codex exec`）の画像観察とエージェントの目視が一致した部位だけを `tools/patch-appearance-detail.mjs` の dry-run 経由で適用。
- `ColorPalette` 8 色: Hex は `tools/patch-colorpalette.mjs` によるカラーチップ実測値。`AppliesTo` は色語の自動転記が誤っていたため、GPT の所見と `--figure-bands` の実測で差し替えた。`ColorName_*` は未記入。
- `db_Primary.json` の 39・93 の `ThisMasters` に `_DBLink`（`PrimaryHuman` / `any`）を追加。
- GPT のコードレビューを受け、`@RelationComments` の対象に `RelationOriginalTo_*` も加え、回帰テストを 1 本追加。
- User の確認（同日）を反映: 表情差分の線は線画と下書きのみ（記載なし）。袖口は細い白の縁取り、下衣は半ズボンとして外見本文を更新。`#FDE8C2` は `#ColorRole_CommonOverride`（肌色。同ファイルの `0` / `00` と同じ書式）へ変更。瞳は上衣と同色のため `#C8785B` の `AppliesTo` に `#BodyPart_Eye` を追加。
- 残り（User 判断待ち）: `#D89C82` の用途（`AppliesTo` 未指定のまま）、`ColorName_*`、`Class`。
- GPT レビューの指摘で未対応: `$Def_ThisMastersEntry` に `_DBLink` が宣言されていない（既存の `%`・`∞`・`0`・`00` 宛てリンクと同じ既存仕様のため今回は変更せず）。
- 検証: `npm test` 86 ファイル 1540 件成功。

## 影響範囲（編集したファイル）

- `data/Works_NumberTales/DataBases/`: `db_Primary.json` / `db_SemiPrimary.json` / `db_PrimaryHuman.json`（新規）/ `db_SemiPrimaryHuman.json`（新規）/ `db_meta.json` / `db_type.json`
- `data/Works_NumberTales/Images/DB_PrimaryHuman/`、`DB_SemiPrimaryHuman/`（移動）
- `data/Works_NumberTales/RoleplayPrompts/DB_PrimaryHuman/`、`DB_SemiPrimaryHuman/`（移動 + 再生成）
- `data/Works_FLInvestigator78/DataBases/db_PrimaryDealer.json`
- `data/Works_SinisterChangingGirls/DataBases/db_Primary.json` / `db_PrimaryStabilities.json` / `db_SemiPrimary.json`
- `data/Works_UnauthedLogica/DataBases/db_Primary.json`
- `tests/enrich.dblink.jump.merge.test.js` / `tests/pages.characters.ui-output.test.js`（移動したレコードの読み込み先を変更）
- `CHANGELOG.md`

## 検証

- `npm test`: 86 ファイル 1539 件成功。
- `npm run data:order:write`: 関係を付け替えた 9 レコードのキー順を整列済み。
- ブラウザでの表示確認（キャラシート・相関図）は未実施。

## 未完了タスク

- [ ] `#DB_PrimaryHuman` / `#DB_SemiPrimaryHuman` の `DB_Label_JP` / `DB_Label_EN`（仮置き）と `DB_Summary` / `DB_Summary_EN`（空）を User が記入する。
- [ ] `RelationTo_PrimaryHuman` の `hashTag_JP` / `hashTag_EN`（仮置き「基本個体(人間)との関係」）を User が確認する。
- [ ] ローカル HTTP サーバーで `?c=NumberTales/PrimaryHuman`、`?b=NTS-0`、相関図 `?r=NTS` の表示とロード時間を確認する。
- [ ] `addon-ai-tag` へマージする際、4 レコードの AIHints が新 DB 名で引けるか確認する。
- [ ] デプロイ後に `pkg/cloudflare/scripts/migrate.mjs` で R2 / D1 を再同期する。
- [ ] 旧直リンク（`?c=NumberTales/Primary/Num:0` 等）を外部に貼っていれば差し替える。
