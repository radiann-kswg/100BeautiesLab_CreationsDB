# 2026-11-19 進捗: AIHints を獣爾騎兵・豹変系女子へ拡張

> ブランチ: `addon-ai-tag`（AIHints は `develop` に含めない運用）
> 作業環境: `sub1`（`README.LOCAL.md` の作業分担どおり。`main` の `develop` には触れていない）

## 目的

User が獣爾騎兵（`Works_ShauErRiders`）と豹変系女子（`Works_SinisterChangingGirls`）を `AI_Optout: false` にしたことを受け、
GeneratorsAI / ShapeChangerAI 向けに、ナンバーテールズと同様の `AIHints` 補完と DB 構造（型定義）の更新を行う。

## 背景・課題

- `tools/patch-aihints.mjs` は `record.Num` と `corefolder` / `humanoid` 決め打ちで、両作品を
  **「対象なし」のまま正常終了**していた（索引は獣爾騎兵が `BeastType.Beast`、豹変系女子が `Drc`）。
- `$Def_AIHints` 一式は NumberTales の `$VersDef` にしか無かった。
- scaffold（TODO 雛形）は「球体コアフォルダ」「NumberTales unit」等の作品固有文言を含み、他作品へは流せない。

## 合意事項（grilling 2 ラウンド + 追加確認の結論）

| 論点 | 結論（User 判断） |
| --- | --- |
| 作業場所・変更量 | `sub1` / `addon-ai-tag`。500 行超を承認 |
| 形態キー | 獣爾騎兵: `normal`（通常時 / In normal form）・`beasted`（獣化時 / In beast form）。豹変系女子: `beforeChange`・`afterChanged`（`AppearanceDetail.Formation` と同じ値で統一運用） |
| 2 つ目の形態を作る条件 | 固有の `AppearanceDetail` エントリを持つレコードだけ（既定形態の複製を置かない） |
| 巳刻カミツの束縛形態 | `beasted` に相当。年賀絵 B がその姿。固有エントリは未入力だが、**カミツだけ `forms.beasted` を作り参照画像を B にする** |
| 年賀絵しか無い 3 人 | `newYear_PNGPath` の先頭を代表参照として認める |
| 中身の作り方 | `AppearanceDetail` / `ColorPalette` / 参照画像からの機械導出のみ。創作判断が要る枠は `null` |
| `AppearanceDetail` が無い `N` | enrich（`AnotherRegions_DBLink` → ナンバーテールズ `0`）の内容をそのまま使う。参照先が AI 不可なら補完しない |
| 型定義 | 作品別 `$VersDef`。実際に出力するスロットだけ宣言 |
| 範囲 | 上流（本リポジトリ）のみ。下流は申し送り |
| `NE` / `NW`（権利ガードで未付与だった） | `#DB_Regioministrators` を `AI_Optout: false` に変更して付与する |
| ナンバーテールズ `666` / `666-mp` の翼 | 新しい分類（体の部位）へ揃える |

`Formation` の辞書値・ラベルは創作内容のため、本ブランチのエージェントは追加・改名していない。
獣爾騎兵の Formation 辞書（`normal` / `beasted`）は、同日 `develop` 側（`1c70567d`）で User 指定のラベルのまま追加され、
マージ（`3e3e52f0`）で本ブランチへ入った。

## 変更点の要約

### 1. 型定義（DB 構造）

`data/Works_ShauErRiders/DataBases/db_type.json` と `data/Works_SinisterChangingGirls/DataBases/db_type.json` に
`$VersDef` を追加（`$Def_AIColorPalette` / `$Def_AIReferenceImages` / `$Def_AIHintsCommon` / `$Def_AISilhouetteNotes` /
`$Def_AIFormVariant` / `$Def_AIHintsForms` / `$Def_AIHints`）。`work_common` / `alt_modes` は未使用枠（`#Null`）。

### 2. ツール（`tools/patch-aihints.mjs`）

| 追加・変更 | 内容 |
| --- | --- |
| `resolveRecordKeyPath()` | 索引キーを `$IndexDef` から解決（D1 投入と同じ `resolveIdxKey()` を import） |
| `loadAiFormKeys()` | 形態キーを `$VersDef.$Def_AIHintsForms` から解決。先頭が既定形態 |
| `buildSeedAihints()` | corefolder を宣言しない作品の生成。雛形を経由せず、provenance も同時に記録 |
| `resolveLinkFills()` | `$enrich: true` の `*_DBLink` から空の構造ソースを補う。AI 不可の参照先からは持ち込まない |
| 付与ゲート | `skipped-private`（非公開）/ `skipped-no-source`（`AppearanceDetail` 無し）/ `skipped-no-typedef`（型定義無し）を追加 |
| 画像 | 設定原画が無ければ年賀絵原画の先頭を `common.reference_images.main` にする |
| ビルダー | `Num` を持たない作品の番号印字は `marking: …`。`#Element_Wing` を「体の部位」へ分類 |

enrich の解決規則は新規に書かず、`tools/build-roleplay-prompts.mjs` の `enrichRecordFromLinks()` /
`collectEnrichLinkFields()` / `collectDeclaredTopLevelKeys()` を import して再利用している。

### 3. データ（17 件）

| DB | 付与 | 内訳 |
| --- | ---: | --- |
| 獣爾騎兵 Primary | 6 | Mouse / Rabbit / Cat（設定原画）、Dragon / Snake / Horse（年賀絵の先頭）。Snake は `normal` + `beasted` |
| 豹変系女子 Primary | 8 | `E` / `S` / `SW` は `beforeChange` + `afterChanged`、`N` / `NE` / `SE` / `W` / `NW` は `beforeChange` のみ。`N` はナンバーテールズ `0` から継承 |
| 豹変系女子 PrimaryStabilities | 3 | `NNE` / `ENE` / `SSW` |

対象 3 DB は prettier を適用済み（AIHints ブロックの整形に必須。既存の長い配列 7 か所の折り返しを含む）。

#### `#DB_Regioministrators` を `AI_Optout: false` へ（`NE` / `NW` の付与）

最初の生成では `NE` / `NW` が `skipped-no-image` になった。`AI_Optout: true` だった `#DB_Regioministrators` の X / Y が
2 件の設定原画を `_DBCrossLinkPath` で参照しており、既存の権利ガード（`collectOptoutImageKeys()`）が参照画像から外すため。
ガードは意図して作られたものなのでエージェントの判断では外さず、選択肢を提示したうえで **User が同 DB を `false` にすると判断**した。

- 変更は `data/Works_SinisterChangingGirls/DataBases/db_meta.json` の 1 行のみ。
- 『管理主』4 件自身は自前の画像と `AppearanceDetail` を持たないため AIHints 未付与のまま（`skipped-no-image` 4）。
- **同 DB の 4 件は AI 利用可の表明になる**（CreationsAI の `ai_training` 判定にも波及する）。

#### ナンバーテールズ `666` / `666-mp`（リリス）の翼

`#Element_Wing` を「体の部位」へ分類し直した影響で、翼を持つこの 2 件の既存 AIHints は旧分類（衣装側）のままだった。
User 判断で新分類へ揃えた。手順は 2026-09-06 の seed と同じ段を 2 件だけに適用している。

1. `--records <666|666-mp> --apply-appearancedetail --apply`（外見から再構築）
2. `--records <…> --fill-todos --apply`（再構築で落ちる尾の本数行 `exactly 6 tails total, no more no less` を補完）
3. `_meta.structuralSourceHash` を一時的に無効化して `--resync-structural --apply`（provenance を新しい配列へ合わせる。
   ハッシュ一致だと再同期がスキップされるため。適用後のハッシュは元と同じ値に戻る）
4. `npx prettier --write`（2 ファイルとも元から prettier 準拠）

変わったのは 2 件の `common.silhouette_features`（翼を追加）/ `forms.*.outfit_features`（翼を削除）/
`forms.*.silhouette_notes.body_description`（翼を追加）/ corefolder の `natural_language_description` / `_meta` の該当 1 配列のみ。
他のレコードと、2 件の AIHints 以外のフィールドは不変であることを前後比較で確認した。

> **気づき**: `--apply-appearancedetail` は構造由来の配列を作り直すが `_meta.structuralEntries` は更新しない。
> ハッシュが変わらない再構築（今回のような分類規則の変更）では provenance が古いまま残るため、手順 3 が要る。

### 4. テスト・ドキュメント

- `tests/patch-aihints.other-works.test.js`（新規。当初 46 件、再同期の改修で 55 件）: スキーマ解決 / `buildSeedAihints` / `resolveLinkFills` の権利ガード /
  実データの型定義適合・付与ゲート・参照画像の実在。件数やレコード名は固定していない。
- `docs/ai-hints-usage.md` §2.1・§7・§9.12、`docs/aihints-spec.md` §1、`docs/api-sw-spec.md` §5.5、`AGENTS.md`（＋生成物）、`CHANGELOG.md`。

## 影響範囲（編集ファイル）

- `data/Works_ShauErRiders/DataBases/{db_type.json,db_Primary.json}`
- `data/Works_SinisterChangingGirls/DataBases/{db_type.json,db_meta.json,db_Primary.json,db_PrimaryStabilities.json}`
- `data/Works_NumberTales/DataBases/{db_SemiPrimary.json,db_SelfSecondary.json}`（`666` / `666-mp` の AIHints のみ）
- `tools/patch-aihints.mjs` / `tests/patch-aihints.other-works.test.js`
- `docs/{ai-hints-usage,aihints-spec,api-sw-spec}.md` / `AGENTS.md` / `.github/copilot-instructions.md` / `CHANGELOG.md`

NumberTales は上記 2 件以外を変更していない（`db_Primary.json` は 1 バイトも変更なし）。

## 検証

| 項目 | 結果 |
| --- | --- |
| `npm test` | 91 ファイル / 1731 件 成功 |
| `npm run data:order:check` | 0/1465（AIHints が最終キーであることを含む） |
| `npm run agents:check` | 生成物は正典と一致 |
| `--resync-structural` dry-run | AIHints を持つ 6 DB とも no-op（獣爾騎兵 6 / 豹変系女子 8・3 / NumberTales 92・11・7）。`#DB_Regioministrators` は AIHints 0 件 |
| `--force` 全件再生成 → prettier | バイト一致（カミツの `beasted` と参照画像 B も保持） |
| `--fix-refs` → prettier | バイト一致 |
| NT 専用モード（`--upgrade-schema` 等）を 2 作品へ dry-run | すべて unchanged（球体の既定値などは流れ込まない） |
| 索引解決を壊した状態でテスト | 新規テスト 3 件が失敗することを確認（「対象なし」の再発を検出できる） |

ponytail-review で 5 件を指摘し、実装側の 4 件（不要形態の残留 / 索引つなぎ込みのテスト不足 /
年賀絵フォールバックのテスト不足 / 不要なキャッシュ）は対応済み。残る 1 件（翼の分類変更がナンバーテールズ 2 件に
後から効く件）は User 判断で対応した（前掲「ナンバーテールズ `666` / `666-mp` の翼」）。

未実施: 下流 2 リポジトリでの実行確認、D1 / Worker への反映、Linux 上の CI 実行。

## 未完了タスク

### User 判断待ち

- [x] ~~豹変系女子 `NE` / `NW` が未付与~~ → `#DB_Regioministrators` を `AI_Optout: false` にして付与済み。
- [x] ~~NumberTales `666` / `666-mp` の翼~~ → 新分類へ揃えた。
- [x] ~~`develop` 側でも対象 DB へ prettier をかけるか~~ → `develop`（`1c70567d`）で 5 DB を整形済み。
- [x] ~~再同期だけでは古い文言が残る~~ → corefolder を宣言しない作品は再同期時に丸ごと作り直すよう改修した
      （後述「追記: 再同期で丸ごと作り直す」）。ナンバーテールズの保守挙動は変えていない。

### データ入力待ち（User）

- [ ] 巳刻カミツの束縛形態の固有特徴。`Formation: "beasted"` の `AppearanceDetail` を入力すれば、
      push 後の再同期 CI が `forms.beasted` へ反映する（現状は全形態共通の 7 件のみ。辞書は `develop` 側で追加済み）。
- [ ] 創作判断が要る枠（`natural_language_description` / `immutable_constraints` / `negative_keywords` / `expression_tendency`）。

### 下流への申し送り

- [ ] GeneratorsAI / ShapeChangerAI: `forms` のキーが `humanoid` / `corefolder` 固定。
      `normal` / `beasted` / `beforeChange` / `afterChanged` を読めるようにする（対応までは `common` と `AppearanceDetail` のみ有効）。
- [ ] GeneratorsAI: `tests/test_other_works.py` が「AIHints を持たない作品」前提。
      あわせて、NumberTales 以外で `immutable_constraints` が捨てられている箇所（調査で判明）。
- [ ] CreationsAI: データセット再生成とサブモジュール更新。獣爾騎兵の制服共通色（`#ColorRole_CommonOverride`）と、
      `N` / `USE` のナンバーテールズ継承は manifest に未展開。
- [ ] `tools/patch-aihints.mjs` は下流の除外対象。`tests/patch-aihints.other-works.test.js` も対で除外が必要。

### 既知の気づき（今回は対象外）

- ナンバーテールズ Primary の `0` / `00` は設定原画と `AppearanceDetail` を持つが AIHints 未付与。
- `migrate-aihints.mjs` の per-record `_Secondaries` opt-out 判定は未対応のまま（台帳 A6）。

---

## 追記: `develop` マージ後の確認（同日）

`develop` 側の整備（`1c70567d`。ログは `2026-11-19_progress_aihints-develop-db-prep.md`）と、
そのマージ（`3e3e52f0`）を `sub1` で確認した。

| 確認項目 | 結果 |
| --- | --- |
| `develop` に AIHints 系が漏れていないか | `AIHints` / `AI_Optout` / `$Def_AIHints` / `tools/patch-aihints.mjs` / 専用テスト・ドキュメントはいずれも `develop` に無い |
| 整形 | AIHints を持つ 6 DB すべてで、`develop` と本ブランチの差は AIHints ブロックだけ（`JSON.parse` 後に AIHints を除いて比較） |
| 衝突の痕跡 | 衝突マーカーなし。`CHANGELOG.md` は両ブランチのエントリを両方保持 |
| 獣爾騎兵の形態辞書 | `normal`（通常時 / In normal form）・`beasted`（獣化時 / In beast form）。`$Def_AIHintsForms` のキー・ラベルと一致 |
| AIHints の件数 | 獣爾騎兵 6 / 豹変系女子 8・3・0 / ナンバーテールズ 92・11・7（マージ前と同じ） |

### 豹変系女子 `N` の再生成

`develop` でナンバーテールズ `0` の外見英訳 2 値が修正された（`green-brown eyes` → `red eyes`、
`long light teal scarf …` → `long light red scarf …`）。`N` はこの外見を `AnotherRegions_DBLink` 経由で継承しているため、
マージ後の `--resync-structural` dry-run で **`N` だけが `resync-applied`** になった（参照先の変更を、穴埋め後の
レコードから計算したハッシュで検出できている）。

`--records N --force --apply` で再生成し、旧い 2 値が `db_Primary.json` から消えたことを確認した。
変わったのは `N` の AIHints（`identity_tags` / `silhouette_features` / `outfit_features` / `body_description` /
`ai_tags` / `prompt_export` / `_meta`）だけで、他のレコードと `N` の AIHints 以外のフィールドは不変。

### 気づき: 再同期だけでは古い文言が残る

`--resync-structural` を `N` に当てた場合を試算すると、`forms.beforeChange.outfit_features` と
`forms.beforeChange.silhouette_notes.body_description` に旧い 2 値が残った。再同期が差し替えるのは
構造由来として記録している配列だけで、`outfit_features` / `silhouette_notes` / `negative_visuals` は対象外のため。

corefolder を宣言しない作品ではこれらも `AppearanceDetail` 由来なので、このままでは外見データを直すたびに
`--force` の手作業が要り、忘れると古い文言がデータに残る。User 判断でツールを改修した（次節）。

### 検証（マージ + `N` 再生成後）

`npm test` 91 ファイル / 1731 件、`data:order:check` 0/1465、`agents:check` 一致、
`--resync-structural` は AIHints を持つ 6 DB とも no-op、対象 JSON は prettier 準拠。

---

## 追記: 再同期で丸ごと作り直す（同日・User 判断）

### 変更

`tools/patch-aihints.mjs` の `--resync-structural` に、corefolder を宣言しない作品だけの分岐を足した。

- 条件: 構造ソースのハッシュが記録と違い、かつ `detectHumanAuthoredContent()` が 0 件。
- 動作: `buildSeedAihints()` でレコードの AIHints を丸ごと作り直す（集計ラベル `resync-rebuilt`）。
- 人が書いた内容があるレコードは、従来どおり構造由来の配列だけを更新して警告を出す（`resync-applied`）。
- ナンバーテールズ（corefolder を宣言する作品）は分岐に入らない。`outfit_features` 等に視覚解析・手入力由来の
  値がありうるため、差し替えは記録済みの配列に限る従来の方針のまま。

### 作り直しで残すもの

| 残すもの | 実装 |
| --- | --- |
| `common.reference_images` | 既存値を `buildSeedAihints()` へ渡す（再同期は参照画像に触れない） |
| 参照画像を手で据えた形態 | `reference_images` を持つ既存形態だけを持ち越す |
| `ColorPalette` に対応しない配色スロット | 既存の配色を渡したうえで、`ColorPalette` が与えるスロットだけ導出値で上書きする |
| `ConceptAge` が無いレコードの `age_appearance` | 既存値を渡す（ビルダーは `ConceptAge` があればそちらを優先する） |
| `work_common` / `alt_modes` / スキーマ外のトップレベルキー | そのまま持ち越す |

> **実装中の気づき**: `detectHumanAuthoredContent()` は、ビルダーが既存値を流用する項目（配色・`ConceptAge` が無いときの
> `age_appearance`・ツールが組み立てないトップレベルキー）を「人が書いた内容」として検出しない（ビルダー出力に
> 既存値がそのまま現れ、ツール由来と見なされるため）。作り直しで黙って消えないよう、`buildSeedAihints()` 側で持ち越している。

### テスト（`tests/patch-aihints.other-works.test.js` に 9 件追加、計 55 件）

外見の文言を直すと対象外だった配列も更新される / 参照画像と手で据えた形態を残す / `ColorPalette` の変更を反映する /
対応する Role が無い配色スロットを残す / 手で入れた見た目年齢を残す / トップレベル項目を持ち越す /
人が書いた内容があれば作り直さない / 構造ソースが同じなら何も書き換えない / ナンバーテールズは従来どおり。

作り直しの分岐を無効にすると該当テストが落ちることを確認した。実データでも、獣爾騎兵 Mouse の外見文言をメモリ上で
書き換えて再同期を通し、Mouse だけが `resync-rebuilt` になり、旧い文言がどの配列にも残らないことを確かめた
（ファイルは変更していない）。

### 検証

`npm test` 91 ファイル / 1740 件、`data:order:check` 0/1465、`agents:check` 一致。
`--force` の全件再生成は整形後にバイト一致、`--resync-structural` は 6 DB とも no-op（この改修で実データは変えていない）。

`ConceptAge` を直した場合も作り直しになり、`age_appearance` と `ai_tags` の年齢帯が更新されることを確かめた
（古い年齢帯は `ai_tags` の記録に含まれるためツール由来と判定される）。

未確認: push 後の再同期 CI（Linux）での実行。

## 参考リンク

- 運用ガイド: `docs/ai-hints-usage.md` §2.1 / §7 / §9.12
- 仕様: `docs/aihints-spec.md` §1 / `docs/api-sw-spec.md` §5.5
- 前回の seed: `_work_in_progress/2026-09-06_progress_aihints-seed-semiprimary-selfsecondary.md`
- 同日の `develop` 側ログ（外見・配色の整備）: `_work_in_progress/2026-11-19_progress_sar-scg-appearance-palette.md`
