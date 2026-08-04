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
5. ✅ `pages/relations.js` の盤面描画（`drawBoard()`）を三角形パスへ変更 → その後「マス塗りの鋭角」指摘を受け六角格子へ差し戻し（詳細は追記4）
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

### 完了（追記 4・方針転換：マス塗りは六角格子へ差し戻し）

- User からブラウザ実地確認で「輪郭がギザギザして見栄えが悪い」と指摘。三角セルは頂点が 60° の鋭角になるため、
  境界セルの尖った頂点がそのまま輪郭に出て刺々しく見えるのが原因（幾何的に確認済み）。
- 最初に「輪郭線分をループへ繋ぎ直し Chaikin の角切りで丸める」描画側の平滑化（`lib/graph/graph-board-outline.js`、`traceBoundaryLoops`/`smoothLoop`）を実装したが、
  User から「角丸にしてほしいわけではなく、鋭角を作らないマスの取り方をしてほしい」と明確に訂正が入った。
  → **描画トリックではなく、セル形状そのものを変える対応が必要**と判断し、平滑化コードは撤回（ファイル削除）。
- 対応: **集約表示（マス塗り／`drawBoard()`）だけ六角格子へ差し戻した**。六角形は内角が常に 120°（鈍角）で鋭角が原理的に出ない。
  - `pages/relations.js`: `buildHexFill(...)` 呼び出しの `lattice: TRI_LATTICE` を除去（既定の `HEX_LATTICE` に戻す）。
  - `drawBoard()`: `triCorners(spacing, up)` / `SIDE_OF_NEIGHBOR=[0,2,1]` / `triNeighborsOf` を、`hexCorners(spacing)`（6頂点）/ `SIDE_OF_NEIGHBOR=[4,1,5,0,3,2]` / `hexNeighborsOf` に差し替え。塗り分け（濃度段ごとの `Path2D` + ホバー別経路）と国境描画（内側の仕切り／外周／ホバー縁取りの3種）は、追記3以前の三角版と同じ構造のまま六角形の頂点・近傍に合わせただけ。
  - `groupAtModelPos()`: 当たり判定を `nearestTriCell` → `nearestCell`（六角格子）に差し替え。
  - **ノード位置のスナップ（`snapToTriLattice`）とエッジ経路（`TRI_AXES`）は三角格子のまま維持**。今回の指摘は「マス塗りの見た目」に閉じた話で、ノード配置や線の折れ方は対象外と判断。
  - `pages/relations.html` の `asset-version` を `2026.08.04.1` に更新（ブラウザ側の古い `relations.js` キャッシュ対策）。
- 確認: `tests/pages.relations.syntax.test.js`（26件）・`tests/graph.hexfill.test.js`・`tests/graph.hexfill-tri-lattice.test.js`（既存互換の確認）全通過。ブラウザで「所属」「進捗」グルーピングを実地確認し、輪郭が六角形の鈍角のみで構成される滑らかな塊になったことをスクリーンショットで確認済み。
- 全体テスト（`npm test`）は本件と無関係な既存の失敗（`tests/data.field-order.test.js` の `Works_UnibyteLive` データ順、`tests/graph.edge-route.test.js` の処理時間フレーキーテスト、`tests/pages.characters.ui-output.test.js` の複合インデックス解決）が残っているが、いずれも今回の変更対象外・未着手（別件として扱う）。

### 完了（追記 5・作戦変更：三角格子はノード位置ではなくエッジ経路に採用／キャラ単体マップの交差低減）

- User から作戦変更の指示: 「三角格子をグループノードではなくエッジに採用する」「ノード位置は元の六角格子スナップへ戻す」「キャラ単体フォーカスマップでもエッジを三角格子に沿わせて交差を減らす」。
- 対応（コード）:
  - `pages/relations.js`: import を `snapToTriLattice` → `snapToHexLattice` に戻し、`renderGraph()` のノード位置スナップ呼び出しも六角格子側に戻した（`TRI_AXES` はエッジ経路用として引き続き import・使用）。
  - `applyEdgeRouting()` に残っていた「キャラ単体フォーカス時は三角格子ルーティングを使わず素通しする」早期 return を撤去し、単体マップでも `routeEdges(..., { axes: TRI_AXES })` を通すようにした。
- **発見したバグ（重大）**: 上記変更後、ブラウザ実地確認（Playwright スクリーンショット）でキャラ単体マップのエッジが 12 本中 3 本しか見えない不具合が発覚。
  - 原因: Cytoscape の `curve-style: round-segments`/`segments` は、`segment-weights` が **ちょうど 0 / 1（＝ノード中心そのもの）付近**になると「ソース/ターゲットノードが重なっている無効な形状」と誤認し、辺を**一切描画しない**（コンソールに `Edge ... has invalid endpoints... expected when source/target overlap` の警告が出る）。`curve-style: straight` に戻すと同じ座標でも正しく描けるため、ジオメトリ計算自体のミスではなく **Cytoscape 側のスタイル解釈のバグ／制約**と特定した。
  - `lib/graph/graph-edge-route.js` の `routeEdges()` 第3巡目で、レーンずらし（`shift`）のための渡り点を「ノード中心（`from`/`to`）そのもの」を基準に作っていたのが原因。折れ点なし（軸平行・`!r.bend`）のケースだけでなく、**折れ点あり（`r.bend`）で `offsetPolyline()` が作る渡り点も同じ罠にはまる**ことをブラウザでの実測（実際の座標データを使った再現）で確認した。
  - 修正: 両方の渡り点を、ノードから**脚の向きに沿って**（`nodeRadius + laneGap` ぶん）内側へ逃がしてから法線方向のシフトを掛けるように変更。
    - 折れ点なしのケース: `from`→`to` の直線上をノード側から内側へスライドさせてから渡りを作る（渡り〜渡り間の区間は元の直線と平行のまま＝格子方向を維持）。
    - 折れ点ありのケース: `offsetPolyline(from, bend, to, shift, inset)` に `inset` 引数を追加し、`from`→`bend` および `bend`→`to` の**各脚の向きに沿って**内側へスライドさせてから法線シフトを適用（脚の直線＝法線が同じ直線上を移動するだけなので、渡り〜折れ点間の傾き＝格子の6方向は厳密に保たれる）。
    - 最初は `segment-weights` を事後的に `[margin, 1-margin]` にクランプする案を試したが、`weight`+`distance` の組は「弦（from-to）上の位置＋法線オフセット」で点を再構成する方式のため、`distance` を据え置いたまま `weight` だけ動かすと**別の点**になってしまい、`tests/graph.edge-route.test.js` の「主要な脚は厳密に格子の6方向へ乗る」「重なった線分がない」の2件が回帰（脚の角度が最大2°ずれる／重なりが発生）。このため上記の「脚の向きに沿ってスライド」方式へやり直した。
  - 検証: `tests/graph.edge-route.test.js` + `tests/graph.edge-route-tri-axes.test.js` + `tests/graph.layout.test.js` + `tests/graph.crossing.test.js` + `tests/pages.relations.syntax.test.js`（計99件）全通過。
  - ブラウザ実地確認: キャラ単体マップ（`Num=78` フォーカス）で `segment-weights` が全て `[0.11〜0.88]` 程度の安全域に収まったことをデータで確認し、スクリーンショットで **12本全ての関係線が表示される**ことを確認済み。集約表示（六角マス塗り、グルーピング「所属」）も回帰なしを確認済み。
- `pages/relations.js` の一時デバッグ用フック（`window.__debugCy = cy;`）は調査後に削除済み。`pages/relations.html` の `asset-version` を `2026.08.04.5` に更新。

## 影響範囲（想定）

- `lib/graph/graph-layout.js`（追加のみ、既存の六角格子関数は変更なし）
- `lib/graph/graph-hexfill.js`（格子アダプタ化済み、既存呼び出しは互換）
- `lib/graph/graph-edge-route.js`（軸配列引数化済み、既存呼び出しは互換）
- `lib/graph/graph-crossing.js`（コード変更なしで三角格子対応を確認済み、ドキュメントのみ更新）
- `pages/relations.js`（レイアウト・スナップ・エッジ経路は三角格子へ切り替え済み。マス塗り（`drawBoard()`／`buildHexFill()` 呼び出し／当たり判定）は追記4で六角格子へ差し戻し）
- `tests/graph.tri-layout.test.js`（新規）
- 既存 `tests/graph.*.test.js`（今後、三角格子移行に合わせて更新が必要になる見込み）

## 参考（設計メモ）

- 三角格子は「6近傍が等距離」の六角格子と違い、隣接3方向・非対称（縦移動が上向き/下向きで片方にしか進めない）。
- 重心間距離を `spacing` に揃えるため、三角形の一辺 `s = spacing × √3` として逆算している（`triPoint()` のコメント参照）。
- 図解: `col+row` が偶数のセルは上向き三角形（頂点が上）、奇数は下向き。左右の隣は `col±1`（向き問わず共通）、縦の隣は上向きなら `row+1`、下向きなら `row-1`。
