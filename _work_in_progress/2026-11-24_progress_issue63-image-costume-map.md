# 2026-11-24 進捗ログ: Issue #63 画像ごとの形態・衣装・参考用区分

- 環境: `main`（`addon-ai-tag`、作業開始時 `6491824e`）と CreationsAI（worktree `claude/angry-vaughan-986d03`、`d6c7070` 起点）
- 関連 Issue: [#63](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/63)（分離元 #60、権利指定 #62）
- 担当: 扇一春（Claude Code）

## 合意事項（2026-11-24 User 判断）

- 置き場所は **`addon-ai-tag` に集約**する。作者の手入力（衣装・参考用区分・共通指定）も、自動生成される `Images_Appearance` と同じ表に置く。
- `Formation` / `Costume` の値の意味:
  - **`null` を明示** = 「共通」（全形態・全衣装の代表に使ってよいと作者が明示した画像）
  - **キーが無い（未指定）** = 「未確認」（形態・衣装を推定しない。代表画像に選ばない）
  - **辞書コード** = その形態・衣装に対応すると確認済み
- `ReferenceOnly: true` は「外見設定として収録せず、画像参考だけにする」作者判断。AI 利用の許諾とは独立で、AI 除外（`AI_Optout` / `Images_AIOptout` / 衣装辞書の拒否）を解除も追加もしない。

## 実装方針

### CreationsDB（`addon-ai-tag`）

1. `tools/sync-numbertales-art.mjs` … 生成対象の `arts_PNGPath` だけを書き換え、ほかの画像フィールドの手入力行を残す。`arts_PNGPath` の手入力属性（`Costume` / `ReferenceOnly`）も、同じ `value`・`Formation` の行へ引き継ぐ。
2. `tests/data.images-appearance.test.js` … 全作品の対応表を検証する（不明なフィールド / 元の `Images` に無い `value` / 未定義の辞書コード / 型違い をエラーにする）。
3. #60 B/C の作者判断を対応表へ反映（`designAlt_PNGPath` に `ReferenceOnly: true`。形態・衣装コードは付けない＝未確認のまま。外見項目は追加しない）。
4. docs（`appearance-detail-tools.md` / `schema-meta-processing.md`）・`AGENTS.md`・`CHANGELOG.md` を更新。

### CreationsAI

1. `collectArtAppearance` … `arts_PNGPath` 以外の画像フィールドも受け付け、`Costume` / `ReferenceOnly` と「`null`＝共通／未指定＝未確認」を区別して検証・集計する。
2. `projectArtAppearances` … `images.arts` に加えて `images.design_alt` にも投影し、`form_common` / `costume` / `costumes` / `costume_common` / `reference_only` を出す。
3. `buildPreferredReferenceImages` … 形態別の代表に、確認済み（コード一致または共通）の画像だけを選ぶ。`reference_only` の画像と、未確認の arts（形態の手がかりが無い画像）は代表に選ばない。
4. テスト・`AGENTS.md`・`CHANGELOG.md` を更新。

## #60 B/C の反映対象

| キャラ | フィールド | 画像 |
| ------ | ---------- | ---- |
| 5, 25 | `designAlt_PNGPath` | `chattingArt/chart_imgNTS-25,NTS-5-humanoidCoolerSeason`（夏の軽装） |
| 35 | `designAlt_PNGPath` | `chattingArt/chart_imgNTS-35-humanoidswimwear`（水着） |
| 44, 66, 85 | `designAlt_PNGPath` | `eventArt/art_sphericateDay-halloween2023A` / `B`（仮装） |
| 66 | `designAlt_PNGPath` | `chattingArt/chart_imgNTS-66-corefolderHalloween`（仮装） |
| 68 | `designAlt_PNGPath` | `arts/art_imgNTS-68-humanoidOnWorkSuit`（作業着） |
| 69 | `designAlt_PNGPath` | `chattingArt/chart_imgNTS-69-humanoidLeotard`（レオタード） |
| 222A, 222B | `designAlt_PNGPath` | `chattingArt/chart_imgNTS-222A,NTS-222B-humanoidWBed`（寝間着） |

> 44・66・85 の「仮装」は、各レコードの `designAlt_PNGPath` にあるハロウィン画像を対象にした。画像名からの対応付けなので、User の目視確認を待つ（下記の未完了タスク）。

## 未完了タスク

- [ ] 44・66・85 のハロウィン画像が #60 の「仮装」と一致するか User 確認
- [ ] 衣装を選んで代表画像を選ぶ仕組み（衣装セレクタ）は未実装。今回は「参考用を代表に選ばない」「未確認を代表に選ばない」まで
- [ ] PR 作成（CreationsDB: `addon-ai-tag` 向け、CreationsAI: `master` 向け）と、CreationsAI のサブモジュール更新

## 検証（2026-11-24）

- CreationsDB: `vitest run` 全 102 ファイル・1869 テスト成功（ログは `.cache/test_issue63.log`）。`node tools/sync-numbertales-art.mjs --check` は差分 0（手入力の `designAlt_PNGPath` 行が再生成で消えないこと）、`npm run data:order:check` も整列 0 件。
- CreationsAI: `cd scripts && npm test` 42 テスト成功（追加: 共通・参考用・未確認の代表画像選択、`Costume` 未定義コード・真偽値でない `ReferenceOnly`・不明な項目の停止、`form_common` / `costume_common` / `reference_only` の投影）。
- 実データ結合: この変更込みの main を `CREATIONS_DB_ROOT` にして `build-dataset.js` → `validate-dataset.js` が成功（11 作品 / 1512 キャラ / 許可 187）。68・35・66・222A の `design_alt` に `reference_only: true` が付き、humanoid の代表は concept または確認済みの arts のまま。

## マージ順（重要）

旧 CreationsAI は `arts_PNGPath` 以外のキーを不正として生成を止める。**CreationsAI 側を先にマージ**し、そのあとで本変更を `addon-ai-tag` に入れる（新 CreationsAI は旧データも読める）。
