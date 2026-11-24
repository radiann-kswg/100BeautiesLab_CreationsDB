# AppearanceDetail の入力・校正補助

`tools/patch-appearance-detail.mjs` は、作者の手動入力や利用可能な原画の観察を、既存 schema に沿った候補へ整理して反映する CLI です。外部 AI API は使用しません。表情・動作は既存の `#Element_Expression` を使います。描かれていない性格・台詞・状況別の仕草を推測する機能はありません。

## 候補を準備する

```powershell
node tools/patch-appearance-detail.mjs --prepare --work NumberTales --db Primary --match '{"Num":61}' --out .cache/appearance-61.json
```

現在の `AppearanceDetail` を `before` と `after` へ複写します。未入力なら `before: null` / `after: []` になります。`after` を編集し、`sources` に監修・観察の根拠を記入してください。`before` は編集しません。既存の候補ファイルを上書きしません。

候補ファイルは次のオブジェクトの配列です。

| キー | 内容 |
| --- | --- |
| `db` | `Primary` などの DB 名 |
| `match` | 一意に一致する条件。`{"Num":61}`、`{"Drc":"NE"}`、`{"Card":{"Suit":"Major","SuitNum":17}}` など |
| `before` | 作成時の外見配列。未入力なら null |
| `after` | 監修済みの外見配列 |
| `sources` | 下記の手動入力または画像観察の根拠 |

作者の手動入力は `{ "kind": "manual", "note": "作者が確認した変更内容と根拠" }` です。画像観察は `{ "field": "concept_PNGName", "value": "cnsp_imgNTS-61", "note": "確認した部位と特徴", "permissionNote": "原著作者による利用許諾の根拠" }` です。画像は元の Images 値と完全一致し、実在と利用可否も検査します。許諾メモはオプトアウトや不正な指定を解除しません。

## 確認して適用する

```powershell
node tools/patch-appearance-detail.mjs --work NumberTales --patch .cache/appearance-61.json
node tools/patch-appearance-detail.mjs --work NumberTales --patch .cache/appearance-61.json --apply
```

既定は dry-run です。対象と変更箇所の before / after・根拠を出力し、`--apply` で書き込みます。全候補の検証を終えてから変更するため、古い before、曖昧な対象、重複候補、未定義コード、不正な型、画像利用の拒否があれば適用しません。

既存項目の変更と末尾追加に対応します。削除・並べ替えはこのツールの対象外です。対象外レコード・項目の書式は保持します。適用後は `npm run data:order:check` と対象データのテストを実行してください。

形態・衣装・着脱を判断するときは [schema/meta 詳解](schema-meta-processing.md) の外見の節を参照してください。原画にない姿や未確定の状態対応は、候補へ断定して追加せず作者へ確認します。

## 完成絵の登場人物と形態（addon-ai-tag）

`Images_Appearance.arts_PNGPath[]` は各レコード本人についての生成結果です。`value` は元の `Images.arts_PNGPath` と同じ文字列または参照オブジェクト、`Formation` は作品辞書のコードです。形態未指定は未確認を表します（`null` は「共通」。下記の衣装・参考用区分の節を参照）。

```powershell
node tools/sync-numbertales-art.mjs          # 差分を表示
node tools/sync-numbertales-art.mjs --write  # 再生成
node tools/sync-numbertales-art.mjs --check  # 差分があれば終了コード1
```

NumberTales では、ギャラリーへの登録と画像名の `NTS-<バッジ>` が一致するときに登場を記録します。たとえば `chart_imgNTS-47,NTS-74-humanoid` は両者が humanoid。各人に形態が明記されていれば個別に読みます。形態や登場人物を画像名から読めない記念絵は、原画で確認した内容を [確認済み原画の一覧](../tools/numbertales-reviewed-arts.json) に記録します。この一覧は許可済みの実パスと SHA-256 が一致したときに優先します。原画の差し替え時は確認をやり直します。フォルダ名だけで形態を確定しません。

上位の非公開・AI除外、共有画像の拒否、進捗除外を反映し、元画像の削除・改名・許諾変更後は再生成で古い行が消えます。権利指定は develop、生成は addon の構造的再同期ワークフローが担当します。CreationsAI は実画像の許可を再判定し、同じ実パスに登場する同一作品のレコード ID を `characters`、本人の形態を `form` に出します。1枚に同じ人物の複数形態が登場する場合は画像ごとに形態の数だけ行を生成し、manifest は `form: null` と確認済みの `forms` 配列を返します。作業用の入力表は配布用 `data` から取り除きます。

## 衣装・参考用区分（Issue #63）

[Issue #63](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/63) の対応表も、同じ `Images_Appearance` に置きます（2026-11-24、`addon-ai-tag` に集約）。既存の `Images` はそのまま残し、画像フィールド名ごとに行の配列を持ちます。各行は元の画像と完全一致する `value` と、任意の `Formation` / `Costume` / `ReferenceOnly` を持ちます。

```json
"Images_Appearance": {
  "designAlt_PNGPath": [{"value":"arts/art_imgNTS-68-humanoidOnWorkSuit","ReferenceOnly":true}]
}
```

| `Formation` / `Costume` の書き方 | 意味 | 代表画像 |
| -------------------------------- | ---- | -------- |
| 作品辞書のコード | その形態・衣装に対応すると確認済み | そのコードの代表に選べる |
| `null` | 作者が「共通」と明示 | すべての形態・衣装の代表に選べる |
| キーが無い | 未確認。画像名やフォルダ名から推定しない | 選ばない |

- `ReferenceOnly: true` は「外見設定として収録せず、画像参考だけにする」作者判断です。AI 利用の可否とは独立で、`AI_Optout` / `Images_AIOptout` / 衣装辞書の拒否を解除も追加もしません。参考用の画像は代表画像に選びません。
- `arts_PNGPath` の行は再同期ツールが生成します。`Costume` か `ReferenceOnly` を持つ行と、`Formation: null`（共通）を明示した行は作者の手入力行として扱い、画像が許可済みで実在する限りすべて残ります。生成行と同じ `value`・`Formation` の手入力行があれば、生成行の代わりにそちらを使います（同じ画像・形態に複数の衣装行があっても全部残る）。画像の許可や参照が消えたときは、手入力行も一緒に消えます。
- `arts_PNGPath` 以外のフィールド（`designAlt_PNGPath` など）の行は作者の手入力で、再同期しても消えません。
- 検証は `tests/data.images-appearance.test.js` です。`Images` に無いフィールド、元の画像に無い `value`、未定義の辞書コード、不明な項目、真偽値でない `ReferenceOnly` をエラーにします。
- デザインの作者表記は既存の `AdditionalDesigned_JP/EN` を使い、この表には作者名や許諾を書きません。
- 衣装を指定して代表画像を選ぶ仕組みはまだありません。現在は「未確認・参考用の画像を代表に選ばない」までを CreationsAI が担います。
