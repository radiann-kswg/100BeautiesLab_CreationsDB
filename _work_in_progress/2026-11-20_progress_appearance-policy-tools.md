# AppearanceDetail 補完・画像 AI オプトアウト・入力補助

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

## 未完了

- 500 行超の変更について User の事前確認待ち（AGENTS.md 基本ルール）。
- 原画の状態と正式なコードの対応、追加衣装の恒常設定化に関する作者判断。
- 実装、データ適用、テスト、必要なローカル表示・性能検証。

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
