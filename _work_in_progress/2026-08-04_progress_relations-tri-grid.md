# 相関図：正三角形格子への移行 ＆ 交差ゼロ描画（進捗ログ）

- 作業ブランチ: `feature/relations-tri-grid`（`develop` から分岐）
- 関連: `_work_in_progress/2026-08-03_github-triage.md` は今回**保留**（Claude側の並行作業のため触れない）

## 目的

1. 相関図（`pages/relations.js`）の格子を、正六角形タイルから**正三角形タイル**へ変更する。
2. マウスオーバーで強調される接続線が、格子に平行かつ交差しないようにする。
   - 全体では数学的に「交差ゼロ」を保証できない（非平面グラフの場合がある）ため、
     - 原則: 既存の交差削減パス（`graph-crossing.js`）を維持・改善して「できるだけ減らす」
     - 最低保証: **キャラ単体に焦点が当たっているマップ**（`snapToTriLattice` 側の個別ノード表示）では交差ゼロを実装する

## 段階計画

1. ✅ `graph-layout.js` に三角格子のコア数学を追加（六角格子版と並行実装、既存コードは温存）
2. ⬜ `graph-hexfill.js` のマス塗り割当ロジックを三角格子へ移植
3. ⬜ `graph-edge-route.js` を三角格子の3方向スナップへ変更
4. ⬜ `graph-crossing.js` の三角格子対応確認・調整
5. ⬜ `pages/relations.js` の盤面描画（`drawBoard()`）を三角形パスへ変更
6. ⬜ キャラ単体フォーカスマップでの交差ゼロ描画を実装
7. ⬜ 全体テスト・ブラウザ実地確認
8. ⬜ 六角格子版の扱い（残す/削除）を最終決定

## 現在の状態（2026-08-04 時点）

### 完了

- `lib/graph/graph-layout.js` に三角格子版を追加:
  - `isTriUp(col, row)` — 上向き/下向き判定
  - `triNeighbors(col, row)` — 3近傍（六角格子は6近傍）
  - `triPoint(col, row, spacing)` — タイル重心座標（3近傍が全て `spacing` で等距離になることをテストで確認済み）
  - `nearestTriCell(x, y, spacing)` — 3×3候補の実距離比較で最寄りセルを求める
  - `triDistance(a, b, maxRing=60)` — `triNeighbors()` を辿るBFSで正確な格子距離を求める（六角格子のcube座標のような閉じた式が三角格子では作りにくいため）
  - `spiralTriCells(col, row, maxRing=40)` — BFSベースの螺旋探索（空き格子点探し用）
  - `snapToTriLattice(positions, options)` — `snapToHexLattice()` の三角格子版
  - 六角格子版の関数（`hexPoint` 等）はそのまま残してあり、移行完了までは両方が共存する
- テスト: `tests/graph.tri-layout.test.js`（18件、全通過）
- 既存テスト（`graph.layout` / `graph.hexfill` / `graph.edge-route` / `graph.crossing`）に回帰なし（135件全通過）

### 未着手（次回続き）

- `graph-hexfill.js` のマス塗り割当（貪欲彩色・境界セル判定・アンカーセル選定）を三角格子向けに移植
- `graph-edge-route.js` の `HEX_AXES`（6方向）を三角格子の3方向へ置き換え
- `graph-crossing.js` の座標入れ替えロジックが三角格子でも成立するかの確認
- `pages/relations.js` の `drawBoard()`（六角形パス描画・ホバー当たり判定）を三角形パスへ
- キャラ単体フォーカスマップでの交差ゼロアルゴリズム（角度ソート＋重なり回避のファン状ルーティング）
- ブラウザでの実地確認・スクリーンショット比較

## 影響範囲（想定）

- `lib/graph/graph-layout.js`（追加のみ、既存の六角格子関数は変更なし）
- `lib/graph/graph-hexfill.js`（今後、三角格子向けに大きく手を入れる予定）
- `lib/graph/graph-edge-route.js`（今後）
- `lib/graph/graph-crossing.js`（今後、確認・微調整の可能性）
- `pages/relations.js`（今後、描画・当たり判定）
- `tests/graph.tri-layout.test.js`（新規）
- 既存 `tests/graph.*.test.js`（今後、三角格子移行に合わせて更新が必要になる見込み）

## 参考（設計メモ）

- 三角格子は「6近傍が等距離」の六角格子と違い、隣接3方向・非対称（縦移動が上向き/下向きで片方にしか進めない）。
- 重心間距離を `spacing` に揃えるため、三角形の一辺 `s = spacing × √3` として逆算している（`triPoint()` のコメント参照）。
- 図解: `col+row` が偶数のセルは上向き三角形（頂点が上）、奇数は下向き。左右の隣は `col±1`（向き問わず共通）、縦の隣は上向きなら `row+1`、下向きなら `row-1`。
