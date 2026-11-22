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

`Images_Appearance.arts_PNGPath[]` は各レコード本人についての生成結果です。`value` は元の `Images.arts_PNGPath` と同じ文字列または参照オブジェクト、`Formation` は作品辞書のコードです。形態未指定は未確認を表します。

```powershell
node tools/sync-numbertales-art.mjs          # 差分を表示
node tools/sync-numbertales-art.mjs --write  # 再生成
node tools/sync-numbertales-art.mjs --check  # 差分があれば終了コード1
```

NumberTales では、ギャラリーへの登録と画像名の `NTS-<バッジ>` が一致するときに登場を記録します。たとえば `chart_imgNTS-47,NTS-74-humanoid` は両者が humanoid。各人に形態が明記されていれば個別に読みます。形態や登場人物を画像名から読めない記念絵は、原画で確認した内容を [確認済み原画の一覧](../tools/numbertales-reviewed-arts.json) に記録します。この一覧は許可済みの実パスと SHA-256 が一致したときに優先します。原画の差し替え時は確認をやり直します。フォルダ名だけで形態を確定しません。

上位の非公開・AI除外、共有画像の拒否、進捗除外を反映し、元画像の削除・改名・許諾変更後は再生成で古い行が消えます。権利指定は develop、生成は addon の構造的再同期ワークフローが担当します。CreationsAI は実画像の許可を再判定し、同じ実パスに登場する同一作品のレコード ID を `characters`、本人の形態を `form` に出します。1枚に同じ人物の複数形態が登場する場合は画像ごとに形態の数だけ行を生成し、manifest は `form: null` と確認済みの `forms` 配列を返します。作業用の入力表は配布用 `data` から取り除きます。

## 衣装・参考用区分の拡張案（Issue #63）

実装課題は [Issue #63](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/63) で追跡します。

既存の Images を維持し、レコードの別メタ `Images_Appearance` をフィールド名ごとの配列にする案です。各要素は元の文字列と完全一致する `value` と、任意の `Formation` / `Costume` / `ReferenceOnly` を持ちます。

```json
"Images_Appearance": {
  "designAlt_PNGPath": [{"value":"arts/art_imgNTS-68-humanoidOnWorkSuit","ReferenceOnly":true}]
}
```

`ReferenceOnly: true` は「外見設定として収録せず画像参考だけにする」作者判断で、AI利用可否とは独立です。衣装・参考用区分・デザイン出典と代表画像選択は #63 の対象です。上の `designAlt_PNGPath` はその設計例です。
