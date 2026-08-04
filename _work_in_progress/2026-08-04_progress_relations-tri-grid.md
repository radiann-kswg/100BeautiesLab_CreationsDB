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

### 完了（追記 6・鉄道路線図スタイルへの大幅刷新／3フェーズ一括対応）

User から「エッジは前の方（六角格子）が良かった、鉄道の路線図くらい分かりやすい配線にしてほしい」「グルーピングはベン図のように共通範囲が分かる構造にして、『その他』は撤去、マス数は対数比例にしてほしい」という指示を受け、以下 3 フェーズを一括で実施した（作業量・時間は問わない前提で着手）。

#### フェーズ1: エッジ経路を六角格子オンリーへ戻す

- `pages/relations.js`: `applyEdgeRouting()` の `routeEdges()` 呼び出しから `axes: TRI_AXES` を撤去（既定値の `HEX_AXES` を使う）。`TRI_AXES` の import も不要になったため削除。
- `TRI_AXES` 自体は `lib/graph/graph-edge-route.js` に引き続き残す（三角格子軸の実装・テストは資産として保持。単に相関図側で使わなくなっただけ）。
- 検証: `tests/graph.edge-route.test.js` ほか対象5ファイル 99件、`npm test` フル実行とも回帰なし。

#### フェーズ2: 交差最小化の強化（路線図らしさの追求）

- `lib/graph/graph-crossing.js` の `reduceCrossings()` に**曲がり（bend）を測る tie-break** を追加。
  - 新規エクスポート `totalBendPenalty(posById, edges)`: 次数 2（乗り換えの無い駅）のノードについて、その 2 本の辺がなす角度を `1 + cosθ`（0=一直線、2=完全な折り返し）で測り合計する。
  - `reduceCrossings()` の入れ替え採否判定に **交差数 → 曲がり → エッジ長** の優先順位を追加（交差数が同点のときだけ曲がりを見る。曲がりも同点なら従来通りエッジ長）。既存の「交差は増えない」「決定的」「占有セル不変」の不変条件はすべて維持（曲がりは交差と違い、交差数が悪化する側に転ぶケースがあるため「絶対に増えない」という一般不変条件は成立しない＝あくまで tie-break である点に注意）。
  - テスト追加: `totalBendPenalty()` の単体テスト（一直線=0・直角=1・折り返し≈2・次数2以外は対象外・複数ノードの合算）、および「交差数・エッジ長が同点でも曲がりが小さい方を選ぶ」統合テスト（X-Z を焦点とする楕円上の2点を使い、エッジ長の合計を完全に一致させつつ曲がりだけ異なる状況を作って検証）。
  - ブラウザ実地確認: 「1桁番(ユニデジッツ)」個体マップ（9ノード/21本）で、交差削減後の配置が路線図らしい直線的な形になることをスクリーンショットで確認。

#### フェーズ3: グルーピングのベン図的重複表現＋対数比例セル数＋「その他」撤去

最も規模の大きい変更。`lib/graph/graph-facets.js` の `groupNodesByFacet()` を全面刷新した。

- **組み合わせグループ方式へ変更**: 複数値を持つノード（`Class` 等）を、従来の「該当する全グループへ重複配置（延べ人数）」から、**その組み合わせ専用の 1 グループへ 1 回だけ配置**する方式へ変更。新規エクスポート `comboKeyForValues(values)` が値を重複除去・ソートしてから `,` で結合したキー（例: `"A,B"`）を返し、`groupNodesByFacet()` はこのキーでグループを作る。ラベルは各値のラベルを `×` で結合（例: `"A×B"`）。これにより「1 キャラ = 1 マス」の原則を保ったまま、ベン図の重複領域のような専用区画として複数所属を表現できる。
- **「その他」（`OTHER_GROUP_KEY`）を完全撤去**: `maxGroups` を超えた値を上位N＋その他へ丸める処理を削除。全ての組み合わせグループをそのまま表示する（実際に出現した組み合わせしか生成されないため、組み合わせ爆発の心配はない）。`collectFacets()` 側の `maxGroups` 宣言パース自体は後方互換のため残しているが、`groupNodesByFacet()` はもう参照しない（2026-08-04 時点で dead な互換フィールドである旨をコメントで明記）。
- **セル数を対数比例に**: `lib/graph/graph-hexfill.js` に `logProportionalCellCount(memberCount, scale=8)` を追加（`cells = round(scale × log(1 + 人数))`）。呼び出し側の `pages/relations.js` で `buildHexFill()` に渡す `size` をこの関数の戻り値にし、実人数は別途 `count` として渡す（`buildHexFill()` は入力オブジェクトをスプレッドして出力にそのまま含めるため、`groups[i].count` として取り出せる）。マス塗りのホバー表示（`setHoverLabel()`）も `cellCount`（対数圧縮後の見た目のマス数）ではなく `count`（実人数）を表示するよう修正。
  - 運命線探偵78 などで「1人のグループと数十人のグループが同居し、最大のグループが図の大半を占める」問題が対数比例により緩和される（係数 `scale=8` は見た目に応じて今後調整可能）。
- **`pages/relations.js` の追従**:
  - `currentLevels()`: 「その他を掘ったら同じ軸をもう一段挿す」特別処理を撤去し、`buildHierarchy()` の結果をそのまま返すだけに簡略化（組み合わせも 1 グループとして扱うため、掘るたびに必ず 1 段ずつ進む）。
  - `drilledNodes()`: 「その他」専用の再照合ロジックを撤去し、`comboKeyForValues(facetValuesOf(n, level)) === picked` という 1 本の照合式に統一（単一値・複数値・未設定のすべてを同じ式で扱える）。
  - `isBucket()`: `OTHER_GROUP_KEY` の判定を削除（`UNSET_GROUP_KEY` のみ）。
  - パンくず（`renderBreadcrumb()`）: 組み合わせキー（`"A,B"`）を `,` で分解し、それぞれラベル解決してから `×` で結合する表示に変更（「その他」の特別表記も削除）。
  - 統計行の「『その他』『(未設定)』の線は非表示」という文言から「その他」を削除。
- **テスト更新**: `tests/graph.facets.test.js` を全面改修（「その他」丸めのテスト2件を削除し、組み合わせグループの構造・`comboKeyForValues()` 単体・重複配置なし不変条件などのテストを追加。計50件）。`tests/pages.relations.syntax.test.js` の「センチネル比較」テストを `comboKeyForValues()` ベースの照合チェックへ更新。
- ブラウザ実地確認: 「クラス名」グルーピング（54グループ）で「デュアルキャリーズ×マスマ...」等の組み合わせ区画が独立した領域として描画され、「その他」バケットが完全に消えたことをスクリーンショットで確認。単一値グループ（「1桁番(ユニデジッツ)」）のドリルダウンも従来通り機能することを確認（ただし組み合わせを持つキャラは単一値グループのメンバーから外れるため、対象人数は変わる＝設計通り）。

#### 検証（全フェーズ共通）

- `npm test`: 1106 passed / 4 failed（63 ファイル中2ファイル）。失敗は全て今回変更対象外のファイル（`data/Works_UnibyteLive/DataBases/db_PrimaryPerformer.json` のフィールド順2件、`tests/pages.characters.ui-output.test.js` の演者セクション解決・英語表示2件）で、`git status --short` で確認した変更ファイル一覧に含まれないことを確認済み。
- 変更ファイル: `lib/graph/graph-crossing.js` / `lib/graph/graph-facets.js` / `lib/graph/graph-hexfill.js` / `pages/relations.js` / `pages/relations.html`（`asset-version` → `2026.08.04.7`） / `tests/graph.crossing.test.js` / `tests/graph.facets.test.js` / `tests/pages.relations.syntax.test.js`

### 完了（追記 7・レーンずらし後の最終形にだけ現れる交差の修復）

User から「フェーズ2でキャラ個体段のエッジ繋ぎ方は良くなったが、平行なエッジが曲がる手前で交わっている箇所がまだある」との指摘。ブラウザ実地確認（Playwright スクリーンショット＋実座標データの直接検証）で再現・特定した。

- **原因**: `routeEdges()` の 1 巡目（折れ方の選択）は「既に決めた辺（レーンずらし前の生の折れ線）」としか交差を比較していない。ところが 3 巡目（レーンずらし）で実際にレンダリングされる最終形は、法線方向へシフトした後の線であり、**1 巡目が想定していない別の辺と新たに交差することがある**（実測: `1桁番(ユニデジッツ)` の 6 ノード個体マップで、直線（軸平行・no-bend）の辺 `related::Num3::Num5` と、折れ点ありの辺 `related::Num5::Num6` の「レーンずらし後の脚」が交差していた）。
- **修正**: `routeEdges()` に 4 巡目を追加。
  - 1 巡目で各辺の**両方の折れ方**（`bends` 配列と現在の `pick`）を保持しておく。
  - 3 巡目の点計算ロジックを `buildRouteOutput(r, shift, inset)` として関数化（1 本の辺の最終出力を組み立てるだけの純関数。3 巡目本体と 4 巡目の両方から呼べるようにするため）。
  - 4 巡目では、最終形（レーンずらし後）の線分どうしを実際に調べ、交差に絡んでいる辺のうち「折れ方を選べる辺（`bends` を持つ辺）」だけを候補に、もう一方の折れ方へ入れ替えて**全体の「悪さ」が実際に減るときだけ採用**する。「悪さ」は**重なり（端点が一致する線分＝別の辺と 1 本に重なって見える）を交差より遥かに重く**数える（`overlaps * 1000 + crossings`）。これは「交差を直そうとして、代わりに別の辺と完全に重なる経路へ逃げてしまう」退行が実測（40 ノード/120 辺のベンチ）で起きたための安全策。
  - 性能: 候補ごとの評価を「その辺 対 他の全辺」の O(n) に抑える（線分はキャッシュし、折れ方を変えた辺だけキャッシュを作り直す）。全辺どうしの O(n²) 再計算を候補ごとに行う素朴な実装は、120 辺規模で実測 5 秒超のタイムアウトを起こしたため、この設計へやり直した。また `options.repairMaxEdges`（既定 80）で辺数が多いときはこの巡目自体をスキップする（相関図で実際に一度に描かれる規模は最大 17〜40 本前後なので実用上は問題にならない）。
  - `maxRepairPasses = 3` で反復（1 回の入れ替えが別の交差を解消/発生させることがあるため）。決定的（乱数なし、候補は ID 順）。
- **既知の限界**: 折れ方の選択肢は 2 通りしか無いため、**両方とも「交差する」か「別の辺と重なる」かの二択**になってしまうケースがある（実測: 上記の 6 ノード例で `related::Num5::Num6` のもう一方の折れ方は `related::Num4::Num6` 等と完全に重なってしまい、採用を見送った＝交差が 1 本残る）。この場合は重なりを増やすより交差を残すほうを選ぶ（読みやすさの観点で重なりの方が悪いため）。より根本的な解決（レーン再割当を含めた組み合わせ探索）は将来の課題として残す。
- **テスト追加**（`tests/graph.edge-route.test.js`）:
  - 「レーンずらし後の最終形で残る交差を、折れ方の入れ替えで修復する」: 2 辺だけの最小構成（もう一方の折れ方が確実に交差を解消できる状況）で、実際に交差が解消されることを確認。
  - 「折れ方を入れ替えると別の辺と重なってしまう場合は、交差が残っても入れ替えない」: 実機で見つかった 6 ノード/9 辺の実例をそのまま再現し、**重なりが 0 のまま**（交差が 1 本残るのは許容）であることを確認。
  - 既存の「レーン分離で線分の完全な重なりが消える」「主要な脚は厳密に格子の6方向へ乗る」（40 ノード/120 辺規模）は、新しい 4 巡目が `repairMaxEdges`（既定 80）を超えるこの規模ではスキップされるため、従来通りパスすることを確認済み。
- **検証**: `tests/graph.edge-route.test.js` + `tests/graph.edge-route-tri-axes.test.js` 計31件通過。`npm test` フル実行でも新規失敗なし（既存の対象外4件のみ）。ブラウザ実地確認で `1桁番(ユニデジッツ)` の個体マップの交差が解消されたことをスクリーンショットで確認済み。
- `pages/relations.html` の `asset-version` を `2026.08.04.8` に更新。

### 完了（追記 8・進捗ログ更新と別ローカル由来マージの確認）

User 指示「今日対応した内容の記録更新」「別ローカル環境からマージ済みの創作DB更新確認」に対応。

- **取り込み履歴の確認**:
  - 現在ブランチ: `feature/relations-tri-grid`
  - `git log --oneline --graph -n 30` で `678fc57`（`origin/develop` を取り込むマージ）を確認。
  - 取り込み元の主要コミットは `1e29cb3`（`DB・Ui構造整備(ハンカクライブ)`）。
- **マージで入った対象（データ系）**:
  - `git show --name-status 1e29cb3` より、今回確認対象の創作DB更新は以下。
    - `data/Works_UnibyteLive/DataBases/db_Primary.json`
    - `data/Works_UnibyteLive/DataBases/db_PrimaryPerformer.json`
  - `CHANGELOG.md` の更新も同時に取り込まれていることを確認。
- **整合チェック（事実確認）**:
  - `npm run data:order:check` 実行結果: **0/1310 レコード整列**（差分なし）。
  - `npm test -- tests/data.field-order.test.js tests/pages.characters.ui-output.test.js` 実行結果: **2 files / 102 tests すべて成功**。
  - 上記より、別ローカル由来で取り込まれた UnibyteLive の DB 更新は、少なくともキー順・主要 UI 出力テストの観点では破綻なしと判断。

※ 補足: 作業ツリーには未追跡 `'_work_in_progress/2026-08-03_github-triage.md'` が残っているが、今回の確認対象外（このログ更新では未変更）。

## 影響範囲（想定）

- `lib/graph/graph-layout.js`（追加のみ、既存の六角格子関数は変更なし）
- `lib/graph/graph-hexfill.js`（格子アダプタ化済み、既存呼び出しは互換／追記6で `logProportionalCellCount()` を追加）
- `lib/graph/graph-edge-route.js`（軸配列引数化済み、既存呼び出しは互換。相関図からは追記6で `HEX_AXES`（既定）へ戻したが、関数自体は `TRI_AXES` を引き続きサポート。追記7でレーンずらし後の最終形における交差修復（4巡目）を追加）
- `lib/graph/graph-crossing.js`（三角格子対応は既存のまま。追記6で曲がり tie-break を追加）
- `lib/graph/graph-facets.js`（追記6で `groupNodesByFacet()` を組み合わせグループ方式へ全面刷新。`OTHER_GROUP_KEY` 撤去）
- `pages/relations.js`（レイアウト・スナップ・エッジ経路は六角格子（追記6で最終決定）。マス塗りは六角格子＋対数比例セル数＋組み合わせグループ）
- `tests/graph.tri-layout.test.js`（新規）
- 既存 `tests/graph.*.test.js`（今後、三角格子移行に合わせて更新が必要になる見込み）

## 参考（設計メモ）

- 三角格子は「6近傍が等距離」の六角格子と違い、隣接3方向・非対称（縦移動が上向き/下向きで片方にしか進めない）。
- 重心間距離を `spacing` に揃えるため、三角形の一辺 `s = spacing × √3` として逆算している（`triPoint()` のコメント参照）。
- 図解: `col+row` が偶数のセルは上向き三角形（頂点が上）、奇数は下向き。左右の隣は `col±1`（向き問わず共通）、縦の隣は上向きなら `row+1`、下向きなら `row-1`。
