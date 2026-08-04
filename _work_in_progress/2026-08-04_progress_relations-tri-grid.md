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
2. ✅ `graph-hexfill.js` を**格子アダプタ化**して三角格子も同じロジックで動くようにした（ファイル複製ではなく DI で対応）
3. ✅ `graph-edge-route.js` の `HEX_AXES`（6方向）を軸集合として差し替え可能にし、三角格子用 `TRI_AXES` を追加
4. ✅ `graph-crossing.js` の三角格子対応を確認（コード変更なしで動作することを検証済み）
5. ✅ `pages/relations.js` の盤面描画（`drawBoard()`）を三角形パスへ変更
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

### 完了（追記）

- `lib/graph/graph-hexfill.js` の成長アルゴリズム（`relaxSeeds` / `assignHexCellsAt` / `markBoundaryCells` / `pickAnchorCells` / `buildGroupAdjacency` / `buildHexFill`）をすべて `LatticeAdapter`（`point/nearestCell/neighbors/distance/spiralCells/cellPadding`）経由に変更。
  - 既定は `HEX_LATTICE`（従来通り、既存テストは一切変更なしで全通過）。
  - 新規 `TRI_LATTICE` を渡せば同じロジックが三角格子でも動く（ファイルを二重化させず DI で対応）。
  - `cellPadding(spacing)` をアダプタに追加し、bounds の外接余白も格子種別にできるように（三角は重心→頂点の概算値、描画段階で詰める予定）。
- テスト: `tests/graph.hexfill-tri-lattice.test.js`（新規5件）で `TRI_LATTICE` 経由の `assignHexCells`/`buildHexFill` の不変条件（セル数=人数・連結・座標一致）を確認。既存 `graph.hexfill.test.js` 含め回帰なし（140件全通過）。

### 完了（追記 2）

- `lib/graph/graph-edge-route.js` の `HEX_AXES`（6方向）0°始まり）を前提としていた関数群を、**軸配列を引数化**して一本化：
  - `decomposeHexVector(dx, dy, axes = HEX_AXES)` / `hexBendPoints(from, to, axes = HEX_AXES)` が `axes[0]` の角度を基準に扇形を決めるよう一般化（既存呼び出しは引数省略で `HEX_AXES` のまま互換）。
  - 新規 `TRI_AXES`（30°/90°/150°/210°/270°/330°の6本）を追加。三角タイル1個の隣接方向は上向き/下向きでそれぞれ3方向だが、両方を合わせると `HEX_AXES` を30°回転させたものと一致する（`triPoint`/`triNeighbors` で実際に数値検証済み）。
  - `routeEdges(edges, positions, options)` に `options.axes`（既定 `HEX_AXES`）を追加し、`hexBendPoints` へ伝搬。廊下（同一直線）判定の `lineKey()` も `axes[0]` の角度を基準に相対角で量子化するよう一般化（HEX/TRI どちらも未割線3方向へ正しく畳み込める）。
  - `graph-hexfill.js` と違い、軸分解の角度計算は浮動小数点誤差に敏感（軸そのものを渡す境界テストが実際に1回落ちた）なので、`%` を重ねる実装は避け、元の実装と同じ「加算1回だけで [0, TAU) に収める」方式に戻して修正済み。
- テスト: `tests/graph.edge-route-tri-axes.test.js`（新規5件）で `TRI_AXES` の形状（60°間隔・HEX_AXESから30°回転）と、実際の三角格子近傍（`triPoint`/`triNeighbors`）で `decomposeHexVector`/`hexBendPoints`/`routeEdges` が正しく動くことを確認。既存 `graph.edge-route.test.js` 含め回帰なし（145件全通過）。

### 完了（追記 3）

- `pages/relations.js` を三角格子へ完全に切り替え（トグルなし、常に `TRI_*`/`triXxx` を使用）：
  - import を `snapToHexLattice/nearestCell/hexNeighbors` → `snapToTriLattice/nearestTriCell/triNeighbors/isTriUp`、`buildHexFill` の新規 `TRI_LATTICE`、`routeEdges` の新規 `TRI_AXES` に差し替え。
  - 集約表示の `buildHexFill(...)` 呼び出しに `{ lattice: TRI_LATTICE }` を追加。
  - `hexCorners(spacing)`（6頂点）を `triCorners(spacing, up)`（3頂点）に置換。`triPoint()` の重心オフセット（上向き=2h/3、下向き=h/3）から逆算し、頂点順をどちらの向きも「尖り→左→右」に揃えた。
  - `SIDE_OF_NEIGHBOR`（隣接マッピング）を `[4,1,5,0,3,2]`（6方向）から `[0,2,1]`（3方向: 左→辺0、右→辺2、縦→辺1）へ。頂点順を尖り基準で揃えたのでこのマッピングは上向き/下向きで共通になる（`triNeighbors()` の戻り順 [左,右,縦] と対応）。
  - `drawBoard()` 内の `addCell()` と国境描画ループを 3頂点/3辺に変更し、セルごとに `isTriUp(c.col, c.row)` で上向き/下向きの頂点配列を切り替え。
  - `groupAtModelPos()` の `nearestCell` を `nearestTriCell` に、`applyEdgeRouting()` の `routeEdges(...)` に `axes: TRI_AXES` を追加、キャラ個体段のレイアウトで `snapToHexLattice` を `snapToTriLattice` に差し替え。
  - コメント中の「六角格子」表記も対応箇所を三角格子へ更新。
- 確認: `tests/pages.relations.syntax.test.js`（構文/id参照/禁止パターンのスモーク）26件）全通過。`pages/relations.js` 自体はロジックテストを持たないため、ブラウザ実地確認は次回のステップ（7）で行う。
- ・キャラ個体段の交差ゼロアルゴリズム（ステップ 6）は未着手。

### 未着手（次回続き）

- キャラ単体フォーカスマップでの交差ゼロアルゴリズム（角度ソート＋重なり回避のファン状ルーティング）
- ブラウザでの実地確認・スクリーンショット比較

## 影響範囲（想定）

- `lib/graph/graph-layout.js`（追加のみ、既存の六角格子関数は変更なし）
- `lib/graph/graph-hexfill.js`（格子アダプタ化済み、既存呼び出しは互換）
- `lib/graph/graph-edge-route.js`（軸配列引数化済み、既存呼び出しは互換）
- `lib/graph/graph-crossing.js`（コード変更なしで三角格子対応を確認済み、ドキュメントのみ更新）
- `pages/relations.js`（描画・ホバー当たり判定・レイアウト・スナップを三角格子側へ完全切り替え済み。六角格子側の関数は呼ばなくなった）
- `tests/graph.tri-layout.test.js`（新規）
- 既存 `tests/graph.*.test.js`（今後、三角格子移行に合わせて更新が必要になる見込み）

## 参考（設計メモ）

- 三角格子は「6近傍が等距離」の六角格子と違い、隣接3方向・非対称（縦移動が上向き/下向きで片方にしか進めない）。
- 重心間距離を `spacing` に揃えるため、三角形の一辺 `s = spacing × √3` として逆算している（`triPoint()` のコメント参照）。
- 図解: `col+row` が偶数のセルは上向き三角形（頂点が上）、奇数は下向き。左右の隣は `col±1`（向き問わず共通）、縦の隣は上向きなら `row+1`、下向きなら `row-1`。
