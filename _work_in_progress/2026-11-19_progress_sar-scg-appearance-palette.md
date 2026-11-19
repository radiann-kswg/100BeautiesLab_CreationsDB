# SAR / SCG の画像由来の外見・配色入力

## 推敲・参照整理後の最終状態

User の追記に従い、NTS の記法、`Summary_JP/EN` 冒頭、enrich の参照関係、User が追加した共通配色メタを照合して整理したよ。**以下の最終状態が現在のデータ**で、後半の初回反映記録は推敲前の経緯として残しているよ。

- SAR 7人と SCG 10人は外見を自分のDBへ記録。計128項目を、形状・色・位置・本数などの短い属性へ整理したよ。
- SCG-N / USE の今回追加した外見本文は削除。`AnotherRegions_DBLink` によって NTS-0 / 00 の既存外見7項目ずつを継承する形にしたよ。画像の `concept` / `conceptAlt` の相互参照は維持したよ。
- `db_Regioministrators.json` は今回の入力前とバイト単位で同じ状態へ戻し、外見・配色の複製を取り下げたよ。
- 形状enumは SAR 側に収録。SCG は User の判断に従い、`$EnumDef_EarShapeType` / `$EnumDef_TailShapeType` / `$EnumDef_DesignElement.#Element_NumberMark` を持たせず、耳・尾の属性は自由記述へ戻したよ。NTS から継承する外見の属性本文は維持し、未解決の分類タグは生コードで表示しないようにしたよ。
- NTS 固有の `TailsUnit` は他作品へ移植していないよ。未定義の形状は既存の `#DesignAttr_Shape` の自由記述を使っているよ。
- SAR / SCG の `$DetailLayout.subFields` に `AppearanceDetail`、SAR に `ColorPalette` を登録。従来の未登録による外見表示・別作品からの外見継承の抑止を解消したよ。
- 外見の主特徴は概要文冒頭に合わせたよ。ハッカは丸い耳と糸状の尾、リウロンは龍の角・翼・尾、カミツは大きな尾と鱗肌、ハヤテは褐色肌・立ち耳・長くしなやかな尾、ユメウツゝは巻き角と垂れ耳・滑らかで柔らかい髪、ハネゝカとネゝコはそれぞれ兎／猫の耳と尾。
- カミツの年賀絵Aの濃灰色・青色の部分は四肢の種類を確定できないため、脚・足と断定した外見項目と部位付与を取り下げたよ。
- 配色の採色方法などの作業用説明はこのログと `.cache/` に集約し、`ColorPalette.Note_*` には衣装の適用条件や画像間の色差が必要な場合だけ記載したよ。

### 共通配色メタへの一本化

最初に User が SAR の `$EnumDef_CommonColor` に制服共通4色を追加したよ。赤の `Hex` の `##EE5E4E` だけを `#EE5E4E` に修正し、他の入力内容は保持したよ。その後の依頼で黄土色・白・薄灰色を追加し、現在は標準 `readCommonColors()` が7色を読める状態だよ。
最初の4色と完全一致する15行に加え、黄土色4行・白と薄灰色2行、計21行を個別パレットから除いたよ。設定画で異なる色は共通色の上書きとして保持。除いた元の使用部位は `.cache/appearance-sar-scg-revision/summary-common-removed.json`、`.cache/appearance-sar-scg-ochre/removed.json`、`.cache/appearance-sar-scg-neutral/removed.json` に記録しているよ。

| 現在の共通色 | HEX |
| --- | --- |
| 主色 | `#EE5E4E` |
| 副色 | `#FEE26E` |
| アクセント色 | `#4262F6` |
| 補助色①（灰色） | `#76766E` |
| 補助色②（黄土色） | `#CABE82` |
| 補助色③（白） | `#FFFFFF` |
| 補助色④（薄灰色） | `#E2E6F2` |

黄土色は卯・辰・巳・午・未の年賀絵で `#CABE82` と完全一致。ハネゝカの設定画は `#CDBD90` で、同じ通常制服の画像間の色差として上書きに残したよ。白は設定画の `#FFFFFF` を共通値とし、5人の年賀絵で実測した `#FEFEFE` はRGB各1階調の差として記録。薄灰色 `#E2E6F2` は5人の袖・紋章・刃等で一致したよ。カミツの小紋章は3×3を確保できず、2か所の2×2同色と33／38画素の一致で確認したよ。根拠座標は `.cache/appearance-sar-scg-ochre/evidence.json` と `.cache/appearance-sar-scg-neutral/evidence.json` に保存。

User が青をアクセント色、灰を補助色①、黄土色を補助色②へ整理した名称に合わせ、個別 `CommonOverride` の色名も現在のメタへ追従したよ。

| DB | 自分のDBに外見を持つレコード | 外見項目 | 初回作業前からの配色追加 |
| --- | ---: | ---: | ---: |
| SAR Primary | 7 | 60 | 50 |
| SCG Primary | 7 | 50 | 1 |
| SCG PrimaryStabilities | 3 | 18 | 8 |
| SCG SemiPrimary | 0（USE は NTS-00 から継承） | 0 | 0 |
| SCG Regioministrators | 0（今回の入力は取り下げ） | 0 | 0 |

### enum 拡充・共通色の上書き（追加依頼）

- SAR の耳に Mouse / Rabbit / Horse / Sheep、尾に Mouse / Rabbit / Horse の7項目を追加し、既存の形状文・本数・色・左右を保ったままコード参照へ変更したよ。
- User が追加した鱗耳 `#EarShapeType_Reptile` はリウロンとカミツへ適用。英語ラベルの空欄は分類名の `Reptile` で補完し、リウロンの「龍の角」の説明も残したよ。
- ハッカの `#F6F7EF` / `#85929C` / `#D7F3E3`、ネゝコの `#E8AFD8` / `#B7DEEC` / `#C77FAF` / `#49768F` を `#ColorRole_CommonOverride` にしたよ。色名は対応する共通制服色のJP/ENラベルを使用し、HEX・適用部位・形態は変更していないよ。
- ハッカの `#B1AA6B` は瞳と靴で兼用しているため、制服色の上書きへ一律には変更していないよ。
- 黄土色の共通化に伴い、ハッカの短パン `#408784`、ネゝコのエプロン `#E6EBAD` / `#FBFAC6`、ハネゝカの設定画 `#CDBD90` も上書きに整理。現在の上書きはハッカ4行・ネゝコ6行・ハネゝカ1行だよ。
- ハネゝカの私服差分は紫系で、通常制服のデータとは分離されていることを原画で確認。衣装の外見5項目と衣装・装備の配色5行の `Note_JP/EN` に通常制服であることを明記したよ。新しい私服の外見・配色は生成せず、既存の `designAlt_PNGPath` は維持したよ。今回の限定は補足文によるもので、SARへの衣装辞書追加や自動切替機能は含めていないよ。
- SCG-N の継承本文を表示しつつ、生の `#Element_NumberMark` を表示しない描画回帰テストを追加したよ。

### 再検証・残事項

- 対象外フィールドとレコード数の維持、Regioministrators の復元、共通色の読取を確認済み。
- 耳・尾vdict参照の整合1件、N/USEの実enrich2件、SAR/SCGの詳細画面描画2件の回帰テストを追加。
- 共通7色への整理と衣装の補足を含む最終変更後の `npm.cmd test`: 79ファイル・1,439テスト成功。`npm.cmd run data:order:check` と `git diff --check` も成功。
- ローカルHTTP＋headless Edgeでハッカの鼠耳・ハネゝカの兎耳・SCG-NのNTS由来本文を検証し、未解決コードが表示されないことを確認。SW制御下の再読込はキャラ一覧421.7ms、相関図517.8msで1000ms未満だったよ。キャラ一覧は既存の初期化完了ログ、相関図は初期化完了ログが無いため統計表示と読み込みoverlay解除時点を測定。測定結果は `.cache/appearance-sar-scg-enums/browser-results.json` に保存したよ。
- 既存の NTS-0 の目の記述に JP「赤い目」／EN「green-brown eyes」の差がある。既存英訳の上書きは行わず、継承元の監修事項として記録したよ。
- 本番同期は未実施。enrich の処理は変更せず、外見rendererの未解決分類タグだけを表示しないようにしたよ。
- 追加の編集ファイル: `data/db_meta.json`、SAR の `DataBases/db_meta.json`、`lib/section-renders/appearanceDetail.js`、`tests/data.shape.test.js`、`tests/enrich.dblink.jump.merge.test.js`、`tests/pages.characters.ui-output.test.js`、`tests/patch-colorpalette.test.js`、`docs/schema-meta-processing.md`、`CHANGELOG.md`。SCG の `DataBases/db_meta.json` は今回の入力前と同じ状態へ戻したよ。

## 初回反映（推敲前の記録）

2026-11-19、sub3 / `develop` で作業したよ。User の依頼に基づいて、メイン画像を持つキャラクターの外見と配色を補完したよ。
実キーは `ColorPalette`。約3,400行になる入力案・全差分を `.cache/appearance-sar-scg/review.md` に準備し、500行超の変更について User の「この案をDBへ反映する」という承認を受けて反映したよ。

## 目的・変更点

- SAR は画像が指定されている7人、SCG は実画像のある12人と画像参照レコード X/Y を対象にしたよ。
- `AppearanceDetail` は画像の髪・目・耳・尾・衣装などを日英で134項目追加。左右は本人の身体を基準にしたよ。
- `ColorPalette` は96行追加し、既存の `AppliesTo` 空欄61行を補完したよ。
- 既存の非空の配色・部位・英訳と、対象外のレコードは維持したよ。

| 編集ファイル | レコード | 外見追加 | 配色追加 |
| --- | ---: | ---: | ---: |
| `data/Works_ShauErRiders/DataBases/db_Primary.json` | 7 | 44 | 71 |
| `data/Works_SinisterChangingGirls/DataBases/db_Primary.json` | 8 | 55 | 1 |
| `data/Works_SinisterChangingGirls/DataBases/db_PrimaryStabilities.json` | 3 | 18 | 8 |
| `data/Works_SinisterChangingGirls/DataBases/db_SemiPrimary.json` | 1 | 7 | 0 |
| `data/Works_SinisterChangingGirls/DataBases/db_Regioministrators.json` | 2 | 10 | 16 |

## 採色の根拠・SAR の共通配色

ハッカ・ハネゝカ・ネゝコ・SCG ENE は `tools/patch-colorpalette.mjs` の `detectChipsForRecord` で設定画の配色チップを抽出したよ。
抽出で漏れた主描画の色と、色見本のない辰・巳・午・未は `tools/extract-palette.mjs` の `decodePng` で平坦な塗りを採色したよ。SAR50か所の3×3同色パッチと、SCG108か所の対象HEXとの完全一致を再検証したよ。

| 共通制服色 | HEX | 確認した主な用途 |
| --- | --- | --- |
| 赤 | `#EE5E4E` | 上着・制服の模様 |
| 黄 | `#FEE26E` | 前立て・縁・留め具・模様 |
| 青 | `#4262F6` | 脚衣・靴・襟飾り |
| 灰 | `#76766E` | 脚衣・手袋・靴 |

辰・午・未で4色、巳で黄を除く3色を確認。卯の設定画は同系統の制服配色でも採色値が異なるため、原画の値を維持したよ。
子・猫の別配色の衣装には一律適用していないよ。`$EnumDef_CommonColor` は現行ツールでは抽出除外用のため、新しい共通色宣言は追加していないよ。
配色の役割と色名は既存の `COLOR_SLOTS` / `applySlotAssignment` に合わせたよ。色見本と主描画に色味の違いがあるものは、配色チップ由来／塗りの実測由来の補足を付けて保持したよ。

## 外見・参照の判断

- E の通常／憤怒、S の眼鏡着脱、SW の安定／嫉妬は、原画注記と既存本文の根拠を確認して形態を分けたよ。
- SE の黒い球状部分は原画の「着用クッション」という説明を採用。W の扇状パーツの器官種別は断定していないよ。
- Regioministrators X は NE の画像を参照。Y は NW の参照画像の複数の姿に共通する髪・衣装3項目だけを記述し、各状態と Y の対応は決めていないよ。
- 画像がないキャラクターの外見や、描かれていない部位・材質・設定は補完していないよ。

## 検証・未実施

- 入力案のJSON構文・enum値・JP/ENの存在・文字化けなし・既存非空値の維持・対象外レコード不変をassertで確認。
- `npm.cmd run data:order:check`: 成功。
- `npm.cmd test`: 79ファイル・1,433テスト成功。
- 一時出力と採色座標は `.cache/appearance-sar-scg/` に保存。
- 本番 R2/D1 同期・ブラウザでの描画確認は未実施。
- 追加の入力作業は完了。Y と原画内の各状態の厳密な対応は、今後の作者監修で必要になった場合に確認する事項として残したよ。

## 参考

- [スキーマ・メタ処理](../docs/schema-meta-processing.md)
- [日本語の左右表記](../docs/jp-notation-rules.md)
- [英訳入力ルール](../docs/localization-en-rules.md)
- [標準パレット入力ツール](../tools/patch-colorpalette.mjs)
- [標準画像デコーダ・採色処理](../tools/extract-palette.mjs)
