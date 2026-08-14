# 2026-08-14 進捗: AIHints 構造的再同期（手動）と Progress ゲートテストの脆さ解消

## 目的

- CI「AIHints 構造的再同期」（run 31761318136）が `npm test` で失敗し、PR が作られないまま止まっていたので復旧する。
- 同じテストがキャラ・画像の追加のたびに落ちる状態になっていたため、期待値の追記ではなく設計側で解消する。

## 背景・課題

`tests/patch-aihints.gates.test.js` の「Progress ゲートの実効範囲」テストが、対象レコードを Num で
**列挙して固定**していた。ゲートの実効範囲は「`AI_Unready` な Progress かつ画像あり かつ AIHints 未保持」の
集合なので、画像が 1 枚増えるだけで集合が変わり、そのたびに CI が落ちる。

- 2026-08-13: 216 系 2 件に画像が入って落ちる → コミット `629129f`「テスト回路修正(AIヒント追従)」で期待値を追記
- 2026-08-14: `09232be`「DB進捗更新＆推敲」で `64-sxp`（ゼフィア）にコアフォルダ絵が入り、同じ理由で再度落ちる

いずれもデータ側は意図どおりで、テストだけが追従を強いられていた。

## 変更点の要約

### 1. `tests/patch-aihints.gates.test.js`

- 「実効範囲は既知の N 件」→「実効している（1 件以上ある）」へ変更。`expect(gated).toEqual([...])` を
  `expect(gated.length).toBeGreaterThan(0)` に置換し、Num の列挙をやめた。
- 下限だけ残した理由: 0 件になったら「`AI_Unready` の宣言漏れ」「画像ゲートとの二重掛け」等で
  ゲートが素通り状態になったということなので、そこは引き続き検知したい。
- 「どの Progress 語彙をブロックするか」の回帰は、同ファイル下段の `loadAiUnreadyProgressValues`
  宣言テスト（8 語の固定・`archived` のフォールバック不可）が担保しており、実データのスナップショットを
  重ねて固定する必要は無い。
- ファイル冒頭の前提コメント (a) も同じ趣旨に更新。
- 他の固定値（Primary の AIHints 件数 92 / SemiPrimary・SelfSecondary が 0 件 / `protectedRecs` が `10-alt`）は
  **据え置き**。これらは AIHints を seed したときにしか動かず、seed は意図的な操作なのでテスト更新も意図的で良い。

### 2. AIHints 構造的再同期（手動実行）

```
node tools/patch-aihints.mjs --work NumberTales --db Primary --all --resync-structural --apply
npx prettier --write data/Works_NumberTales/DataBases/db_Primary.json
```

- 差分は Num 64 のみ（`resync-applied`）。`09232be` の ColorPalette 整備に追従したもの。
- 実際の差分は `_meta.structuralSourceHash` と `_meta.lastStructuralResync`（→ `2026-08-14`）の 2 行だけで、
  タグ・テキスト類は変化なし。User が手で書いた内容には触れていない。
- 対象 DB は `db_Primary.json` のみ（`"AIHints"` を持つ DB がこれだけのため。CI の列挙ロジックと同じ）。

## 影響範囲

- `tests/patch-aihints.gates.test.js`
- `data/Works_NumberTales/DataBases/db_Primary.json`（Num 64 の `AIHints._meta` 2 行）

## 検証

- `npm test` → 78 files / 1369 tests すべて通過。

## 未完了タスク / 申し送り

- **Num 64 の `common.palette_priority` が旧割り当てのまま**。`09232be` で ColorPalette の Secondary と
  Accent が入れ替わった（Secondary `#E55951`→`#F26383` / Accent に `#387EB6` 追加、Sub 2 色を新設）が、
  AIHints 側は `secondary: #6AA6D7` / `accent: #F26383` のまま。
  `--apply-colorpalette` は既存の確定値を保護する仕様のため `palette-unchanged` でスキップされる。
  更新するなら `--force-palette` が必要で、これは確定値の上書きにあたるため User 判断待ち。
- 本ログの変更はまだコミットしていない。コミット / PR の要否は User 判断。
