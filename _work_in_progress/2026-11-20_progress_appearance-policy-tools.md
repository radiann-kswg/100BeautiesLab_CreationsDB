# AppearanceDetail 補完・画像 AI オプトアウト・入力補助

## 現在の実装と引継ぎ

- **公開結果**: addonのD追従を7849c017でpush。CreationsAIは自動同期fa26d38を取り込んだ上に、生成スクリプト・正式pin7849c017・再生成物をf0379688でcommit/nonforce pushした。通常コマンドで40テスト、build、validatorが成功。許可187/732、61の衣装/画像/代表画像の漏れ0、D9人の旧語0を確認。
- **CIで検出した修正**: developマージでmigrate.mjsのinvalidateAIImagePolicy importと呼び出しが二重になっていた。重複を除去し、同期CLI3本の構文テストを追加。修正前に構文エラーを再現し、修正後は関連57テストとfull/AIHints両CLIのdry-run成功。本番同期は修正push後のCIで追跡する。

- #60 D の追加監修: 登録設定画・人型完成絵を9人分照合し、12/15/20/23/24/25/27/37/39に別の恒常的な私服を追加する根拠は見つからなかった。同じ衣装の総称を具体的な要約へ校正。20の灰色インナー、24の青紫スカート＋モーブ裾、25の青緑の上衣（全身ボディスーツと断定しない）も原画に合わせた。
- D の正典変更は develop の11ac4911へコミット・pushされ、sub1へf2a22c25でマージした。AIHintsは9人だけ既存resyncと旧AD由来の完全一致23要素の限定校正で追従し、派生exportsを再計算。対象外レコード・原本文・画像・権利指定・手書き保護項目は維持。再resyncは9件すべてno-op、関連69テスト成功。
- #60 E は作者の明示依頼により [Issue #63](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/63) へ分離・起票済み。形態/衣装/参考用区分と既存デザイン出典の対応、AI権利との独立性を受け入れ条件に含めた。

- User が main / develop の変更を `a1490f14` としてテスト・push。指示を受け、sub1 / addon-ai-tag へ `0b1e6eff` で一方向マージした。競合した CHANGELOG と第三者運用文書は両方の記述を残して統合した。
- その後 sub1 で「AIオプトアウト周り機能調整」の追加コミットを確認（当時98633e91、amend後の公開SHAは211bff56）。現在の公開状態は冒頭の記録を優先する。
- sub1 で進行中だった API 作業は Git stash へ退避してから復元した。develop から取り込んだ外見・権利 JSON と、addon の既存 AIHints / AI_TextRP_Allowed を維持した。保護用 stash は残している。
- 権利軸の `AI_Optout`（16メタファイル44指定、true27/false17）と画像別・衣装別指定は develop が正典。移管対象の他のJSON値は不変。AIHints 本文・API・AI_Unready・AI_TextRP_Allowed は addon 管理を維持する。
- マージで同一オブジェクトに重複した AI_Optout 44キーを sub1 で除去。除去前後の JSON.parse 結果が同じことを全16ファイルで確認し、重複キーを検出する回帰テストを追加した。
- NTS-61 の idol は辞書単位で除外し、外見4項目・AIHintsの該当衣装説明・画像3ファイルをAI向け出力から除く。D-Vines の分数番号4人だけをレコード単位で除外する。266/314にはデザイン思想が適用されないという作者判断に従い、権利除外を追加しない。
- #60 の B（水着・作業着・レオタード）と C（夏服・仮装・寝間着）は作者確認によりすべて参考画像のみ。AppearanceDetail の新たな衣装にはしない。D は画像に即した同じ衣装の要約へ校正済み。E の別メタ方式はIssue #63へ分離。今回の衣装画像除外は Images_AIOptout で対応済み。

## 作者確認に基づく外見補完

- SCG NE の膨体は afterChanged。SE のクッションは Detachable:true。W の人型は afterChanged・球体は既存辞書の beforeChange、共通の髪・耳・目は null。NW は衣装 usual/jacketless と豹変後の左目（黒い白目・小さな赤い瞳）を分離した。
- SAR カミツは共通の頭部・胸元、通常の尾・帯・袖、獣化後の長い蛇体と頭後方の袖状部分を分離。ハネゝカの制服 usual と私服 private を追加した。原画にない靴や他の騎兵の獣化形態は補完していない。
- NTS14・41のブレザー、61のフードと番号、66の頭のフード、777系の装備は独立した着脱項目。28は腰巻きブレザーの usual と羽織る onBusiness を分け、腰のリボンボウを袖として整理した。61のidolヘアピンは維持した。
- CLI は候補準備→dry-run→明示apply。before一致、複合インデックス、schema/辞書、根拠画像の実体・上位権利・共有画像拒否、旧相対参照と横断参照を検証。全候補検証後に原子置換し、書込み失敗時の復元も検証した。

## 検証とレビュー

- main のD校正後: **84ファイル / 1,519テスト成功**（maxWorkers=2）。並行負荷時に既存graph.routeの40ms閾値を41.9msで一度超過したため、対象単独26テスト成功後、負荷を抑えた全体再検証も実施。sub1 のD/AIHints追従後: **98ファイル / 1,837テスト成功（18.08秒）**。CLI構文修正後の関連57テストも成功。agents:check、data:order:check（0/1465）、構文・diff検査も成功。
- ローカル headless Edge、SW制御再訪各3回: キャラ一覧392.3 / 600.4 / 601.4ms、相関図575.7 / 592.4 / 553.0ms。6回とも1000ms未満、pageerrorなし、成功したJSONの重複ネットワーク取得なし。先行診断で相関図1075.3msを一度観測したことも記録に保持。
- SCG-SE の詳細で「着脱可能」タグ1件を表示確認。main の `.cache/appearance-policy/browser-results.json` / `browser-observations.json` / `se-detachable.png` に証跡を保存した。
- Ponytail Review で非公開DBのCommons補完停止、同名.private DBによる公開画像の誤除外、APIの不正型許可、旧相対参照の共有拒否漏れ、衣装dictFile未解決を検出・修正し、具体的な再現ケースで再検証した。
- CreationsAI 最終は **40テスト成功・実データ再生成/validator成功**。732件、AI利用可191→187（差分は指定D-Vines4人だけ）。61の除外衣装4項目、AIHints衣装文、画像3ファイルの漏れとdesignAltの共通代表採用は0件。References/Localizationの明示許可と通常素体の参考画像を保持し、image-indexは481項目/480固有画像。生成元コミットは98633e91。
- API許可表のdry-runは479画像/488参照。資料カタログ・typedef・Ref_/Loc_・Works_ImagesDirを含むpositive/negative fixtureで検証した。
- 既存の未解決画像参照2件は SCG Regioministrators の「扇 三春」「扇 残冬」のconcept_PNGName。元の_DBCrossLinkPath値と同じで、新たな退行ではないことを確認した。
- 証跡は sub1 `.cache/issue62-final/tests.log`、main `.cache/issue62-creationsai/{final-tests.log,final-build.log,final-validate.log,final-audit.json}`。

## API の運用

新しい許可表は全レコードから共有画像の拒否を合成する。full同期→AIHints同期→許可表公開の3段が、同じソース指紋・R2バケット・D1で成功した場合だけ有効になる。途中失敗・ソース変更・単独同期では有効化しない。許可表が不明な間、本文を返すAIエンドポイントは503、除外レコードの単件は404。通常サイトと develop の /api/v1 はこのフィルタの対象外。

詳細: [AIHints仕様](../docs/aihints-spec.md)、[CLI使用法](../docs/appearance-detail-tools.md)。

## 残作業

- CreationsAIの生成スクリプト・pin・再生成物はf0379688で公開済み。以後の自動同期も新しい生成コードを使用する。sourceと生成物の公開後CIを追跡する。
- addonのWorkerデプロイは成功。R2/D1同期は先行runの待機とmigration構文エラーがあったため、CLI修正push後のCI完了を確認する。
- #60 Dは画像照合とデータ校正を完了、EはIssue #63へ分離済み。Issue本文/コメントを作業中に定期確認し、B/C・Dと権利対象の決定を反映した。

---

以下は初期調査時の記録。

## 目的

Issue #60・#62 の必須対応と、#61 の表情・動作も扱える AppearanceDetail 入力補助を進める。
作業場所は main / develop。AI 向け API は sub1 / addon-ai-tag、データセット側は CreationsAI を対象とする。
着手時の main と sub1 は未コミット変更なし。CreationsAI は master、`--ignore-submodules` で変更なし。

## 調査で確認した事項

- #60 の最終コメントにより、NTS-61 のヘアピンは `Costume: idol` を維持する。
- フード・ブレザー・777 系の装備着脱は、別 Costume を割り当てると既存 `usual` の選択と衝突する。未確定の着脱表現を勝手に実装しない。
- SCG の NE・SE・W・NW は原画に豹変前後の明記がない。既存の `beforeChange` / `afterChanged` を推測で割り当てない。
- SAR 巳刻カミツの A/B 原画には通常時と蛇体の描写がある。既存の衣装項目には共通胸元と通常時の袖が混在するため、単なる Formation 一括付与では不十分。
- CreationsAI は画像単位の除外未対応。`images` だけでなく `preferred_reference_images`・`ai_hints`・`data.Images`・画像ディレクトリ走査による `image-index` への反映が必要。
- `Images` の文字列・配列形式は維持し、`Images_AIOptout` の完全一致指定を採用する方針。
- #61 の `#Element_Expression` は既に「表情・動作」。追加スキーマより既存形式の入力・校正補助を優先できる。

## 実装案（適用前）

1. 原画と既存公開設定を根拠に、確定できる Formation / Costume を補完する。作者判断が必要な項目は候補を提示する。
2. 画像フィールドの `AI_Optout` とレコードの `Images_AIOptout` を宣言し、未知のフィールド・存在しない値・不正な指定を検証エラーにする。
3. 画像の deny を上位ポリシーと合成し、共有画像では最も厳しい指定を全出力へ適用する。サイト表示と `$palette` には適用しない。
4. CLI は候補 JSON の before / after / sources を読み、dry-run を既定、明示 `--apply` で入力する。古い before、曖昧なレコード、未定義コード、利用不許可画像は拒否する。
5. 必要なテスト・文書・CHANGELOG を更新する。本番デプロイとサブモジュール pin 更新は実装検証後の別操作とする。

## 影響範囲（予定）

- main: `data/db_type.json`、対象作品の DB / schema / Dictionaries、共通画像ポリシー処理、AppearanceDetail CLI、対応テスト、`docs/schema-meta-processing.md`、`docs/third-party-policy.md`、使用説明、`CHANGELOG.md`。
- sub1: AI 向け Worker / migration / 対応テスト。develop に AIHints エンドポイントを持ち込まない。
- CreationsAI: `scripts/lib/policy.js`、データセット・画像索引生成、検証器と対応テスト。

## 初期調査後に解決した確認事項

- 500行超の計画は User 承認済み。
- SCGの形態、D-Vinesの除外範囲、B/Cの参考画像扱いは作者確認済み。
- 実装と検証の現状は冒頭を参照。

## 調査時点の検証

- 変更前の `npm.cmd test -- --reporter=dot`: 79 ファイル / 1,448 テスト成功（17.80 秒）。
- `git diff --check`: 成功。実データ・プログラム・生成物は未変更。この調査ログだけを追加。
- 原画確認: SCG `concept/cnsp_imgSCG-{NE,SE,W,NW}.png`、SAR `newYear/art_imgSAR-EZ6-{A,B}.png`、ハネゝカの設定画と `designAlt/chattingArt/chart_imgSAR-EZ4-private.png`。
- 共通画像検証 helper は `pkg/ai-image-policy.mjs` を候補とする（`pkg/` から `lib/` へ依存させない）。画像値の解決・全作品横断 deny 集計は各 caller に残す。
- 補助 CLI の入力案は `{db, match, before, after, sources}`。`match` は一意な部分一致条件、`before` は現 AppearanceDetail 全体と完全一致、`sources` は原画像の field/value と観察根拠、または手動入力の根拠文。
- CreationsAI の既存サブモジュール pin に新 helper は存在しないため、現 DB root を指定した `.cache/` 出力での検証が必要。通常運用への切替には上流反映後の pin 追従が必要。

## 参考

- [Issue #60](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/60)
- [Issue #60 訂正](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/60#issuecomment-7031644206)
- [Issue #62](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/62)
- [Issue #61](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/61)
- [schema/meta 詳解](../docs/schema-meta-processing.md)
- [第三者運用方針](../docs/third-party-policy.md)
- [前回の SAR / SCG 入力記録](./2026-11-19_progress_sar-scg-appearance-palette.md)
