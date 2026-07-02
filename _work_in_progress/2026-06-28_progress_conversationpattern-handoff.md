# 2026-06-28 進捗: ConversationPattern補完のメイン→sub2引き継ぎ

## 目的

本体ローカル(develop)で進行中だった ConversationPattern 補完作業が長引いたため、
サブローカル2(`-sub2`)へ引き継ぎ、以降は sub2 / `develop` で継続する。

## 実施環境

- 本体ローカル: `develop`（DeepLローカライズ等の未コミットWIPを保持。ConversationPattern分のみ取り下げ予定）
- sub2: `develop`（origin/develop = 423738a と同期。本引き継ぎの作業場）
- sub1: `refactor-appearance-detail`（無関係・未介入）

## 判明した問題と対応

1. **sub2 の git HEAD 破損 → 修復済み**
   - `.git/HEAD` 末尾に NUL バイト混入で symbolic-ref 解決不能、全ファイルが新規追加扱いに見えていた。
   - `ref: refs/heads/develop\n` に書き直して復旧。バックアップ `.git/HEAD.corrupt.bak` あり。
   - 残課題: `.git/index.lock`（0バイトの stale ロック）がサンドボックスから削除不可。**ユーザ端末で削除要**。

2. **メインの db_Primary.json が末尾切断(truncate)していた**
   - 現象: ファイルが Num 92 の `NumerospecAbout_E...` で途切れ、JSON 不正。
   - 既知事象「大ファイルの Write/Edit で末尾切断」に一致。
   - 欠落: トップレベル Num 93/94/95/96/97/98/99 と末尾特殊キャラ 2/10/000/0/00（計12体）＋Num92末尾。
   - 失われた範囲は全てコミット版(84348d2)に無傷で存在。

## 復元方法（創作内容の自動生成は一切なし）

- 接合: `[WIPのNum 1〜91（生存した新規ConversationPattern入り）]` + `[コミット版84348d2のNum 92〜末尾（土台復元）]`
- 結果: **有効なJSON**。全レコード復帰。コミット版比 +1008 / -3。
- ConversationPattern: 97件（WIP生存 1〜91分 + コミット済み末尾5件）。
- バックアップ: `.cache/2026-06-28_conversationpattern-handoff.patch`（メインのWIP差分そのもの）、
  `.cache/db_Primary.reconstructed.json`（復元版）。

## ユーザ確認事項（要レビュー）

- 復元差分の「-3削除」はrecord 1〜91側で、切断とは無関係（WIP中の手動編集の可能性）。意図確認を:
  - Num27周辺の `value`（27先生へのセリフ）
  - `Backgrounds_EN`（"One of the rare cases among the 99 NumberTales..."）
  - `Relation`（`{ "Commented": [{ "Num": 7, "RelationLabel": ["pioneer"] }] }`）

## 未完了タスク（ユーザ端末で実施）

1. sub2: `del .git\index.lock`（stale ロック解消）
2. sub2: `npm test`（特に data.sanity / data.shape / conversation-pattern）で健全性確認
3. sub2: db_Primary.json をコミット（引き継ぎ確定）
4. メイン: `git checkout -- data/Works_NumberTales/DataBases/db_Primary.json` で切断WIPを取り下げ
   （DeepL系のWIPはメインに温存される）
5. ConversationPattern 再追加（創作内容＝ユーザ入力）: Num 92/94/95/97/98/99/2/10
   （93/96/000/0/00 はコミット済みCPあり）

## 参考

- 復元元コミット: 84348d2「DeepLによるローカライズ機能実装 続き」
- 関連: `tools/inject-conversation-patterns.mjs`, `tests/conversation-pattern.test.js`
