# 2026-11-21　直近20コミットのレビューと次の実装候補

## 対象と判断

GitHub の既定ブランチとローカルの `develop` は調査時点で `467e54f9`。対象は `git log -20` の20件（マージ5件を含む）だよ。最古は PR #58 のマージ `fa36060d`。その第1親 `364fd044` から HEAD までの正味の差分は104ファイル。用途は作者のローカル入力、Pages 公開前の CI、閲覧者のキャラシート・API、本番 R2/D1 と連動する AI 向け API を想定したよ。

今回導入された主な変更は、外見・配色データ、形態・衣装・着脱の区別、画像単位の AI 除外、外見の入力 CLI、Pages ビルド前のテストだよ。二春と合意した次回の範囲は下記 1・2。外見入力を広げる前の候補は 3・4・5、新機能の第一候補は #63 だよ。

## 合意した今回の範囲

1. 全 DB で、非公開指定 `DB_Hidden` と明示の `AI_Optout` のどちらかが `true` なら DB 全体を AI 利用から除外する。下位の `false` はこの判断を解除しない。両フラグが立っていない場合は残りの許諾判定へ進む。外見入力 CLI と addon の許可表生成は既にこの規則で判定する。実装修正は未整理二次創作 DB の宣言を正しい階層に戻し、非公開だけの場合、明示除外だけの場合、カタログの入れ子を検査して完了とする。[入力 CLI](../tools/patch-appearance-detail.mjs#L205)・[許可表生成](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/blob/09b475e4f956aada57cc22017b7df85a39bac32d/pkg/cloudflare/scripts/build-ai-image-policy.mjs#L162)
2. Q2 で本番と検証の混在は両方向とも拒否すると合意したよ。検証 D1 の同期では対応する R2 バケットを明示する。通常の本番同期は許可表を先に無効化する。R2 単独同期は指定したバケットを使う。

## ponytail-review の指摘

| 番号 | 優先度 | 起きること・影響 | 最小の修正と確認 |
| --- | --- | --- | --- |
| 1 | 必須 | NumberTales の未整理二次創作 DB は、従来からカタログ宣言が Secondary の内側にある。今回そこへ加えた `AI_Optout` と既存の `DB_Hidden` は、SW・Node クライアントが読む `Databases` 直下では見つからない。実ファイルは779件。今回強化した形状テストも直下のキーしか列挙しない。 | 既存の DB 宣言一式を直下へ移す。実メタで両フラグを確認し、DB エントリの内側に別の DB 宣言が入ると失敗する検査を置く。公開対象からの除外を既存のクライアントテストで確認する。[メタ](../data/Works_NumberTales/DataBases/db_meta.json#L209)・[SW のメタ検索](../lib/sw-common.js#L968)・[形状テスト](../tests/data.shape.test.js#L33) |
| 2 | 必須 | 検証用 D1 を `--db-id` で選んで `--d1-only` を使っても、`--bucket` を省略すると本番 R2 の画像許可表を無効にする。AI 向け本文 API は同じ許可表の再公開まで 503 になり得る。これはコード上の影響で、本番障害を観測した結果ではないよ。 | 既定と異なる D1 を選んだ場合は対応するバケットを指定させ、未指定なら書き込み前に止める。通常の本番同期は従来どおり先に失効する。引数の組み合わせをローカルテストで固定する。[同期処理](../pkg/cloudflare/scripts/migrate.mjs#L97)・[運用例](../docs/deploy-howto.md#L97)・[本番同期の合意](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/62#issuecomment-7032422551) |
| 3 | 必須 | CLI が未入力レコードに外見を初めて挿入するとき、グローバルのフィールド名だけで位置を決める。元のキー順が正常な、外見キー未宣言の460件にメモリ内で初回追加したところ、93件が正規順から外れた。例は UnibyteLive／Primary の初代 A。入力後の公開前テストが失敗する。 | 作品別 typedef とレイアウトを合流する既存の順位計算で挿入先を選ぶ。作品固有の隣接フィールドを持つ1件で、CLI の出力を既存のキー順検査に通す。[CLI](../tools/patch-appearance-detail.mjs#L311)・[キー順の検査](../tests/data.field-order.test.js#L58) |
| 4 | 要修正 | 非空の外見を持つ136件のうち6件は、既存値をそのまま含む候補の dry-run が失敗する。NT 準一次333は画像名の空文字、888は辞書コードの先頭記号欠落。UnibyteLive の4件は表示側が受理する旧形式の `Value_JP/EN`。別の有効な外見を追記しても同じ理由で止まる。 | 既存6件のキー・参照値・空欄を宣言に沿って正規化し、本文は保持する。現行データで作った候補が dry-run を通り、新規の誤入力は引き続き検出されることを確認する。[検証箇所](../tools/patch-appearance-detail.mjs#L283)・[旧形式の描画](../lib/section-renders/appearanceDetail.js#L236) |
| 5 | 要修正 | 未入力から作った空候補は、根拠だけ記入すると dry-run の変更件数がゼロのまま、書き込み用データでは `null` が空配列に変わる。NT Primary 82 の元値と CLI のテキスト生成処理で照合したよ。 | 未入力で追加要素もなければ書き込み対象から外し、元ファイルのバイト列が変わらないことをテストする。[候補の準備](../tools/patch-appearance-detail.mjs#L259)・[差分の集計](../tools/patch-appearance-detail.mjs#L306) |
| 6 | 要修正 | 画像の AI 除外指定の全件テストは `DataBases/db_*.json` 固定。実際に画像がある NumberTales の資料 DB 2本が漏れる一方、ローカルの `db_Primary_temp.json` のような下書きまで検査対象に入る。 | 作品・レイヤーのカタログから対象を選び、各レイヤーの画像 typedef を使う。資料 DB の誤指定を検出し、未登録の下書きは検査対象にならないことを確認する。[テスト](../tests/ai-image-policy.test.js#L98)・[資料の画像定義](../data/Works_NumberTales/References/db_type.json) |
| 7 | 要修正 | NT 準一次266の正式名・型番・設計資料は `8/3`、日英の `SPCodeName` だけが `2.66≈3/8`。3/8 は 0.375 なので同じレコードを読んでも意味が食い違う。 | 日英2か所の分数を一次資料の `8/3` にそろえる。[レコード](../data/Works_NumberTales/DataBases/db_SemiPrimary.json#L2241)・[設計資料](../data/Works_NumberTales/References/_DesignNotes/266etc.md#L141) |

互換性の判断も1件あるよ。SelfSecondary の `314-am`／`314AM` が `314-rm`／`314RM` へ変わった。短縮リンクはバッジの完全一致なので、改名前にコピーしたリンクは同じレコードを選択できない。旧リンクの利用数は不明。維持したい場合は旧バッジからの解決をテストし、意図的な切替なら移行先の案内で足りるよ。[該当レコード](../data/Works_NumberTales/DataBases/db_SelfSecondary.json#L1700)・[リンク照合](../pages/characters.js#L8589)

## 進捗ログと GitHub Issue の照合

調査開始時の進捗ディレクトリ直下29本（README 込み）、退避済み Markdown 19本、ローカルメモ1本を確認し、退避 ZIP 5本のテキスト201件も履歴として参照したよ。GitHub は PR を除外し、全10件の本文とコメント24件を確認。Open と Closed の検索結果も別々に突き合わせたよ。

| Issue | 11月21日時点の判断 |
| --- | --- |
| [#28](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/28) Open・wontfix ラベル | 8月の「73/112」を現状の制作優先リストには使えない。89番の PNG 名ファイルが実際は JPEG、26番の画像は実在し NT の JSON 参照が0件という11月20日の残件は現在も確認できた。画像の紐付け意図は作者判断。連名・形態の表現は #63 と共有できる。 |
| [#51](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/51) Open | 複数キャラクターの対話記録。関係データへの追加、独立ページ、参考資料 DB の3案が提示されている。閲覧者向けの新機能を優先する場合の独立した選択肢。 |
| [#61](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/61) Open | 表情・仕草は既存の `#Element_Expression` に収録できる。CLI には候補の準備・検証・適用がある。次に決めるのは、作者が利用を認めた原画から候補を作る工程と、作者による採否の確認方法。 |
| [#63](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/63) Open | 画像ごとの形態・衣装・参考用区分・デザイン出典。#60 で決まった「参考画像だけ」の判断をデータに残せ、#28・#61 でも使える。設計案は addon 側の文書にあり、develop の schema・CLI は未実装。最初の仕様例は Issue に明記された68番の作業着で十分だよ。 |
| [#11](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/11)・[#13](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/13) Closed | #11 は型番修正済み。#13 は Bot のアーカイブにより not planned。 |
| [#20](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/20)・[#21](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/21) Closed | #20 は部位補完後に #21 へ統合。#21 は登録色と適用部位の対応を入力した段階で完了。色名など作者が続ける編集は進捗台帳で追える。 |
| [#60](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/60)・[#62](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/62) Closed | #60 の状態・着脱の対応は完了し、画像との対応は #63 へ分離。#62 の最終コメントには本番の除外確認まで記録済み。11月20日の作業前ログより後の確定情報だよ。 |

Issue 外では、進捗台帳にある画像子キーの整列 T-04、英語版ロールプレイプロンプトの出力 T-06、継続的な作者入力 T-21／T-24 も別の候補。T-04 は今回の指摘3とは対象が異なるよ。指摘3は既に決まっているトップレベルのキー順に CLI を従わせれば直せる。[残留タスク台帳](./2026-07-25_remaining-task.md)

## 検証・影響範囲・未決事項

- `npm.cmd test -- --reporter=dot` は84ファイル・1,519件成功。ログは `.cache/2026-11-21-review-vitest.log`。現データの `data:order:check` は27ファイル・1,465件中、要整列0件。`agents:check` は生成物8件すべて一致。
- Q1 の DB 単位の AI 除外規則は [AGENTS.md](../AGENTS.md) と[第三者運用方針](../docs/third-party-policy.md)に記録。`grill-with-dics` はインストール済みの `grill-with-docs` と解釈して、Q1・Q2 の合意を得たよ。

## 合意後の実装と検証

- NumberTales のカタログ直下へ既存の未整理二次創作 DB 宣言を移したよ。移動後の JSON を移動前と構造比較し、階層以外は全値一致。実データで一覧と通常取得の非公開制御、テスト用データで `AI_Optout` が未指定・false の非公開 DB と明示除外された公開 DB を検査したよ。[カタログ](../data/Works_NumberTales/DataBases/db_meta.json)・[形状テスト](../tests/data.shape.test.js)・[取得テスト](../tests/pkg.nodejs.test.js)・[AI 判定テスト](../tests/patch-appearance-detail.test.js)
- 共通の引数解析で同期先を確定し、D1 と R2 の本番・検証の混在を I/O の前に拒否するようにしたよ。Wrangler が DB 名とバインディング名の両方を受け付けるため、本番の名前・binding・設定上の UUID とバケットの対応も検査する。[同期 CLI](../pkg/cloudflare/scripts/migrate.mjs)・[共通処理](../pkg/cloudflare/scripts/migrate-common.mjs)・[回帰テスト](../tests/migrate-common.test.js)・[Cloudflare の D1 コマンド](https://developers.cloudflare.com/d1/wrangler-commands/#d1-execute)
- 運用上の適用範囲を [同期手順](../docs/deploy-howto.md)・[API 仕様](../docs/api-sw-spec.md)・[変更履歴](../CHANGELOG.md)・正典とその Copilot 生成物に反映したよ。権利の扱いはリポジトリの運用規則に従う。API の非公開フラグと、Git 追跡済みの JSON 原本のアクセス権は別々に管理される。
- 同期 CLI の dry-run 6通りで、通常・検証・R2 単独の正常終了と、検証バケット省略・本番 R2 混在・本番 D1 混在の開始前終了を確認。関連5ファイル145テスト成功。本番 R2/D1 への書き込み、デプロイ、addon ブランチへの取り込みは未実施。
- 全体テストは両環境とも84ファイル成功。作業ツリーは1,528件、Git 追跡ファイルと lockfile 指定の Vitest 5.1.0 を使った独立コピーは1,520件。差分はローカルの4作品の `temp` を対象にしたグラフ検査各2件。両環境を同時に再実行すると既存の `_Jump` 検査が一度5秒でタイムアウトし、独立コピーを単独で再実行して全件成功したよ。`agents:check` は8件一致、`data:order:check` は1,465件すべて整列済み。
- 同期先の確認には `wrangler` スキルと Cloudflare 公式仕様を使用。利用可能なスキル・プラグインには今回の権利指定を判断する専用品が見つからず、DB の AI 除外は[既存の第三者運用方針](../docs/third-party-policy.md)に沿って検証したよ。
