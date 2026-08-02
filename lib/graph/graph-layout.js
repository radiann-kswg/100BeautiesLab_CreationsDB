/**
 * graph-layout.js - 相関図のノード配置（ヘキサグラム格子へのスナップ）
 *
 * @description
 * 力学レイアウト（Cytoscape の `cose`）は密なグラフだとノードが偏って団子になる。
 * 収束後の座標を**六角格子（ハニカム）の格子点へスナップ**して均等感を出す。
 *
 * ## なぜ六角格子か
 *
 * 正方格子より充填が均等で、隣接 6 方向の距離が等しいためエッジの長さが揃いやすい。
 * 「見た目の密度が一定」になるので、ノードが多い作品でも粗密の差が出にくい。
 *
 * ## スナップの方針
 *
 * 1. 力学レイアウトの相対位置（どのノードがどのノードの近くか）は**壊さない**
 * 2. 格子点は 1 ノードにつき 1 つ。奪い合いは「元座標が格子点に近い順」で解決する
 * 3. 空いた格子点が無ければ、螺旋状に外側へ探索する
 *
 * ## 画面に収めることを優先しない
 *
 * 格子の間隔は**ノードが潰れない最小サイズ**から決める。
 * 収まらない場合は縮小せず、そのままはみ出させてパン/ズームで見る
 * （User の指示: 「画面の大きさ上ノードがつぶれてしまう場合、無理して全体表示しなくても大丈夫」）。
 *
 * DOM 非依存の純関数のみ。**Service Worker の `importScripts()` へは追加しないこと**（ES モジュール）。
 *
 * @author 100BeautiesLab.
 * @version 1.0.0
 */

/** 六角格子の行間係数（正六角形の充填では √3/2） */
const ROW_RATIO = Math.sqrt(3) / 2;

/**
 * 六角格子の格子点座標を返す
 *
 * @description 奇数行を半セル分ずらすことでハニカム配置になる。
 * @param {number} col - 列インデックス（0 起点、負値可）
 * @param {number} row - 行インデックス（0 起点、負値可）
 * @param {number} spacing - 隣接格子点の距離
 * @returns {{x: number, y: number}}
 */
export function hexPoint(col, row, spacing) {
	const offset = (Math.abs(row % 2) === 1) ? spacing / 2 : 0;
	return { x: col * spacing + offset, y: row * spacing * ROW_RATIO };
}

/**
 * 座標から最寄りの格子セル（列・行）を求める
 * @param {number} x @param {number} y @param {number} spacing
 * @returns {{col: number, row: number}}
 */
export function nearestCell(x, y, spacing) {
	if (!(spacing > 0)) return { col: 0, row: 0 };
	const row = Math.round(y / (spacing * ROW_RATIO));
	const offset = (Math.abs(row % 2) === 1) ? spacing / 2 : 0;
	const col = Math.round((x - offset) / spacing);
	return { col, row };
}

/**
 * セルの周囲を螺旋状に探索する（空き格子点を探すため）
 *
 * @description 距離 1, 2, 3… のリングを順に返す。近い順に舐めるので、
 * スナップ結果が元の相対位置から大きく離れにくい。
 * @param {number} col @param {number} row @param {number} maxRing
 * @yields {{col: number, row: number}}
 */
function* spiralCells(col, row, maxRing = 40) {
	yield { col, row };
	for (let ring = 1; ring <= maxRing; ring += 1) {
		for (let dc = -ring; dc <= ring; dc += 1) {
			for (let dr = -ring; dr <= ring; dr += 1) {
				// リングの外周だけ（内側は前のリングで走査済み）
				if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
				yield { col: col + dc, row: row + dr };
			}
		}
	}
}

/**
 * ノード座標を六角格子へスナップする
 *
 * @param {Array<{id: string, x: number, y: number}>} positions - 力学レイアウト後の座標
 * @param {Object} [options]
 * @param {number} [options.spacing=110] - 格子間隔。ノードが潰れない最小サイズから決める
 * @param {number} [options.maxRing=40] - 空き探索の最大リング
 * @returns {Array<{id: string, x: number, y: number, col: number, row: number}>}
 */
export function snapToHexLattice(positions, options = {}) {
	const spacing = Number.isFinite(options.spacing) && options.spacing > 0 ? options.spacing : 110;
	const maxRing = Number.isFinite(options.maxRing) ? options.maxRing : 40;
	const list = Array.isArray(positions) ? positions.filter(p => p && typeof p.id === 'string') : [];
	if (list.length === 0) return [];

	// 元座標が「理想の格子点」に近いノードから先に確定させる。
	// 後から来たノードほど押し出されるが、螺旋探索で近傍に収まる
	const ranked = list.map(p => {
		const cell = nearestCell(p.x, p.y, spacing);
		const ideal = hexPoint(cell.col, cell.row, spacing);
		const dist = Math.hypot(p.x - ideal.x, p.y - ideal.y);
		return { ...p, cell, dist };
	}).sort((a, b) => a.dist - b.dist);

	/** @type {Set<string>} 使用済み格子点 */
	const taken = new Set();
	const out = [];

	for (const p of ranked) {
		let placed = null;
		for (const c of spiralCells(p.cell.col, p.cell.row, maxRing)) {
			const key = `${c.col},${c.row}`;
			if (taken.has(key)) continue;
			taken.add(key);
			placed = c;
			break;
		}
		// 探索し尽くした場合は元座標のまま置く（実用上ここには来ない）
		if (!placed) { out.push({ id: p.id, x: p.x, y: p.y, col: p.cell.col, row: p.cell.row }); continue; }
		const pt = hexPoint(placed.col, placed.row, spacing);
		out.push({ id: p.id, x: pt.x, y: pt.y, col: placed.col, row: placed.row });
	}

	return out;
}

/**
 * ノード数と最小ノードサイズから、潰れない格子間隔を決める
 *
 * @description **画面サイズに合わせて縮めない。** 収まらなければはみ出させ、パン/ズームで見る。
 * @param {Object} [options]
 * @param {number} [options.nodeSize=46] - ノードの一辺（角丸タイルの大きさ）
 * @param {number} [options.labelWidth=0] - ラベルの想定幅（0 ならノードサイズのみで決める）
 * @param {number} [options.gap=28] - ノード間に最低限空ける余白
 * @returns {number} 格子間隔
 */
export function resolveSpacing(options = {}) {
	const nodeSize = Number.isFinite(options.nodeSize) ? options.nodeSize : 46;
	const labelWidth = Number.isFinite(options.labelWidth) ? options.labelWidth : 0;
	const gap = Number.isFinite(options.gap) ? options.gap : 28;
	return Math.max(nodeSize, labelWidth) + gap;
}

/**
 * スナップ結果の外接矩形を返す（fit するかの判断材料）
 * @param {Array<{x: number, y: number}>} positions
 * @param {number} [padding=40]
 * @returns {{minX: number, minY: number, maxX: number, maxY: number, width: number, height: number}}
 */
export function boundsOf(positions, padding = 40) {
	const list = Array.isArray(positions) ? positions : [];
	if (list.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const p of list) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	return {
		minX: minX - padding, minY: minY - padding,
		maxX: maxX + padding, maxY: maxY + padding,
		width: (maxX - minX) + padding * 2,
		height: (maxY - minY) + padding * 2
	};
}

/**
 * 全体表示したときの倍率が実用下限を下回るか判定する
 *
 * @description 下回る場合は fit せず、等倍付近で表示してパン/ズームに委ねる。
 * @param {{width: number, height: number}} bounds
 * @param {{width: number, height: number}} viewport
 * @param {number} [minZoom=0.45] - これ未満に縮むならノードが潰れて読めない
 * @returns {{fits: boolean, zoom: number}}
 */
export function shouldFitToViewport(bounds, viewport, minZoom = 0.45) {
	if (!bounds?.width || !bounds?.height || !viewport?.width || !viewport?.height) {
		return { fits: true, zoom: 1 };
	}
	const zoom = Math.min(viewport.width / bounds.width, viewport.height / bounds.height);
	return { fits: zoom >= minZoom, zoom };
}
