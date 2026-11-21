# 2026-11-20 Issue #28 状況確認

## 目的と範囲

- 対象: https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/28
- 環境: main / develop、HEAD `b94760db0342fb51a302029d17545bcfe709afc0`。調査開始時は作業ツリーに変更なし。GitHub develop と一致。
- `ponytail-review` の観点で画像実体・参照・schema・履歴・下流生成物を確認したよ。コード・創作データ・画像・許諾は編集しない調査。
- 変更ファイル: 本レポートのみ。一時テストログは `.cache/issue-28-review/tests.log`。

## 結果

- Issue は open、ラベル enhancement / wontfix。既存2コメントの数値訂正を前提とし、当初の73/112を現在の未収録率として再利用しない。
- 9/7 `e95b7202` の原寸差し替えと `b64f8184` の参照修正により進展あり。8/30 `cc0aa877` では絵チャット成果物を追加。
- 現在のNT `Images/**/corefolder/**/*.png` は201枚、長辺 min/median/max=1306/1557/3481px、1024px未満0枚（AI許諾で絞る前）。9/7ログの202枚とは別断面。
- Primaryの105レコード・Images 428参照を、大小文字を区別して実ファイルに照合。cross-link 8件を含め欠損0。合同絵の複数キャラ紐付けも確認。
- Primary catalog 11枚はすべて9000×6000px、`chr-dsgn_catalogNTS-<badge>.png` と配置を維持。DBからの11参照も存在。
- CreationsAI #1、GeneratorsAI #20 はともに9/7にcompletedでクローズ済み。ただし状態だけでは再学習の実施・品質を保証しない。
- 最新CreationsAI build-info / image-index の生成日時は2026-11-20 17:49:43 JST、source `02cfe1e43d30816e1c68f977054c28df12f0cd23`。参照 resolved=530 / unresolved=0。
- 同image-indexのNT許可corefolderは181枚、長辺 min/median=1306/1557px、1024px未満0。許諾前の201枚や8月の112許可レコードとは母集団が異なる。

## 残課題・判断

1. `Images/DB_Primary/arts/chattingArt/chart_imgNTS-26-humanoid.png` は8/30追加後、現在のJSONに参照がない。登録意図・許諾を確認したうえで棚卸し対象とする。存在だけからAI利用を許可しない。
   - Primary arts実体101枚に対し同DBから参照される実ファイルは98枚。未参照3枚は26の1枚と既知の `_lang_EN/` 2枚。
2. `chart_imgNTS-89-corefolder.png` は今もJPEGバイト（JFIF）。JPEGとして1061×878pxでデコード成功。破損ではなく拡張子との形式不一致。最新下流でもPNG寸法解析がnullとなるため、PNG再保存と再ビルドが最小対応。
3. `arts_metadata` は現行developのデータ・typedefと最新addonのNT typedefで追加を確認できない。下流 `resolveCharacterImages` はメタ未登録時にform/charactersをnullとして出力する。
4. 制作優先リスト・新規イラストのDB収録運用を正式化した記録も確認できない。

全依頼完了を理由とするクローズは非推奨だよ。残課題を別Issueへ移す、または対応しないと作者が判断するなら、当初前提の訂正と原寸対応を根拠に整理してクローズすることは可能。wontfixラベルだけでは作者の最終判断を推定しない。

## 検証

- 実行: `node_modules/.bin/vitest.cmd run tests/data.image-links.test.js tests/ai-image-policy.test.js tests/image-dir-mapping.test.js`
- 結果: 3ファイル・24テストPASS、522ms。参照テスト単独では未紐付け画像や画像の実形式を保証しない。
- 独立に画像のPNGヘッダー寸法・参照実在・catalog命名・JPEGデコードを確認。
- 未実施: 全テスト、ブラウザ実表示、生成画・再学習の品質検証、26の未登録意図の作者確認。
- Issueへ進展・残課題・クローズ条件の[コメントを投稿済み](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/28#issuecomment-7035197297)。投稿本文の一致とopen状態・既存ラベル維持を再取得して確認したよ。

## 参考

- [原寸差し替え](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/commit/e95b72022af62e4a9e77ca49b78e2d8822da7377)
- [参照修正と記録](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/commit/b64f8184788bf96a84abb098b684ef34291d9f9d)
- [絵チャット成果物追加](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/commit/cc0aa8770155b27c70097c27032b291b9d374eb2)
- [CreationsAI #1 完了報告](https://github.com/radiann-kswg/100BeautiesLab_CreationsAI/issues/1#issuecomment-5563444862)
- [GeneratorsAI #20](https://github.com/radiann-kswg/100BeautiesLab_GeneratorsAI/issues/20)
- [最新build-info](https://github.com/radiann-kswg/100BeautiesLab_CreationsAI/blob/master/ai-dataset/build-info.json)
- [最新image-index](https://github.com/radiann-kswg/100BeautiesLab_CreationsAI/blob/master/ai-dataset/image-index.json)
- [下流の画像メタ解決](https://github.com/radiann-kswg/100BeautiesLab_CreationsAI/blob/master/scripts/build-dataset.js#L1229-L1266)
- ローカル既存根拠: `CHANGELOG.md` / `_work_in_progress/2026-09-06_progress_corefolder-image-resolution.md`
