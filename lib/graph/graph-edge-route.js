/**
 * graph-edge-route.js - 接続線を六角格子の辺に沿わせる
 *
 * @description
 * ノードを格子へ等間隔に並べても、線が最短距離の直線で結ばれているとあらゆる角度が混ざり、
 * 図としてのまとまりが出ない。線の向きを**格子の 6 方向（0° / 60° / 120° / 180° / 240° / 300°）**へ
 * 制約すると、配置の規則性が線にも伝わって落ち着いた見た目になる。
 *
 * ```
 *   直線（従来）            格子沿い（本モジュール）
 *      ●                        ●
 *       ＼                       ＼
 *        ＼  ← 中途半端な角度      ＼   ← 必ず 60° の倍数
 *         ●                    ●──●
 * ```
 *
 * ## なぜ折れ点 1 個で足りるのか
 *
 * 六角格子の 2 点を結ぶベクトル **v** は、隣り合う 2 本の軸ベクトル **a**, **b** の
 * **非負結合 v = αa + βb に一意分解できる**（hex の軸座標）。
 * つまり「a 方向へ進んでから b 方向へ進む」2 脚で必ず到達でき、その折れ点も格子点になる。
 * 格子上の A* 探索のように折れ点を何十個も作る必要は無い（実測で 4000 組すべて誤差 1e-9 未満）。
 *
 * 折れ点は「a を先に進む」「b を先に進む」の 2 通りあるので、
 * **他のノードを貫通しない方**を選ぶ。多重辺は交互に選んで重なりを避ける。
 *
 * ## Cytoscape へ渡すときの注意（実測で確定）
 *
 * `curve-style: 'segments'` は折れ点を
 * **`P = lerp(p1, p2, weight) + n · distance`**（`weight` は正規化位置、`distance` は **px 単位**）
 * で復元する。ここで
 *
 * 1. **基準線 p1→p2 は既定でノード境界の交点**（`edge-distances: 'intersection'`）であって中心線ではない。
 *    格子幾何と一致させるには **`'edge-distances': 'node-position'` の併記が必須**
 *    （未指定だと x=200 が 207.5 になる実測あり。ノードサイズが次数で可変なので誤差は辺ごとにばらつく）。
 * 2. `distance` の符号は `n = (−u.y, u.x)`（`u` は source→target の単位ベクトル）。
 *    y 下向きのスクリーン座標では**正が進行方向の右手側**。
 *
 * 性能は `segments ×1` が 34.70ms/frame で `bezier` の 35.76ms よりむしろ速い（478 ノード / 850 辺の実測）。
 *
 * DOM 非依存の純関数のみ。**Service Worker の `importScripts()` へは追加しないこと**（ES モジュール）。
 *
 * @author 100BeautiesLab.
 * @version 1.0.0
 */

/** 浮動小数の比較誤差 */
const EPS = 1e-9;

/** √3/2。六角格子の行間係数 */
const H = Math.sqrt(3) / 2;

/**
 * 六角格子の 6 軸（単位ベクトル）
 *
 * @description `graph-layout.js` の `hexPoint()` が張る格子の隣接方向と一致する。
 * 添字は角度の昇順（0° / 60° / 120° / 180° / 240° / 300°）で、
 * 隣り合う添字どうしが「分解に使える 2 軸」になる。
 */
export const HEX_AXES = Object.freeze([
	Object.freeze({ x: 1, y: 0 }),      // 0°
	Object.freeze({ x: 0.5, y: H }),    // 60°
	Object.freeze({ x: -0.5, y: H }),   // 120°
	Object.freeze({ x: -1, y: 0 }),     // 180°
	Object.freeze({ x: -0.5, y: -H }),  // 240°
	Object.freeze({ x: 0.5, y: -H })    // 300°
]);

/** 2π */
const TAU = Math.PI * 2;

/**
 * ベクトルを隣り合う 2 軸の非負結合へ分解する
 *
 * @description **v = α·HEX_AXES[i] + β·HEX_AXES[(i+1)%6]** となる (i, α, β) を返す。
 * α, β は長さ（px）であって格子の歩数ではないことに注意。
 * 分解は一意なので、同じ入力からは必ず同じ結果になる。
 *
 * @param {number} dx @param {number} dy
 * @returns {{axis: number, a: number, b: number}} `axis` は先に進む軸の添字
 */
export function decomposeHexVector(dx, dy) {
	if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) return { axis: 0, a: 0, b: 0 };

	// ベクトルの角度がどの 60° 扇形にあるかで、使う 2 軸が決まる
	let theta = Math.atan2(dy, dx);
	if (theta < 0) theta += TAU;
	const axis = Math.floor(theta / (Math.PI / 3)) % 6;

	const e0 = HEX_AXES[axis];
	const e1 = HEX_AXES[(axis + 1) % 6];

	// [e0.x e1.x][a]   [dx]
	// [e0.y e1.y][b] = [dy]
	const det = e0.x * e1.y - e0.y * e1.x;
	const a = (dx * e1.y - dy * e1.x) / det;
	const b = (e0.x * dy - e0.y * dx) / det;

	// 扇形の内側なので理屈上は非負。丸め誤差で微小な負値になることがあるのでクランプする
	return { axis, a: a < 0 ? 0 : a, b: b < 0 ? 0 : b };
}

/**
 * 2 点を結ぶ格子沿いの折れ点（2 通り）を返す
 *
 * @description 「先に軸 a を進む」「先に軸 b を進む」の 2 通り。どちらも格子点に乗る。
 * ベクトルが軸と平行なとき（α または β が 0）は折れ点が不要なので空配列を返す。
 *
 * @param {{x: number, y: number}} from @param {{x: number, y: number}} to
 * @returns {Array<{x: number, y: number}>} 0 個（直線）または 2 個
 */
export function hexBendPoints(from, to) {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const { axis, a, b } = decomposeHexVector(dx, dy);
	if (a < EPS || b < EPS) return []; // 軸と平行 = 折れる必要が無い

	const e0 = HEX_AXES[axis];
	const e1 = HEX_AXES[(axis + 1) % 6];
	return [
		{ x: from.x + e0.x * a, y: from.y + e0.y * a }, // 先に e0
		{ x: from.x + e1.x * b, y: from.y + e1.y * b }  // 先に e1
	];
}

/**
 * 折れ線を「脚の角度を保ったまま」平行移動した 3 点へ展開する
 *
 * @description **折れ点 1 個のままレーンをずらすと、端点が固定されているぶん脚が傾く。**
 * 実測では 60° からのずれが中央値 9.8°・最大 27.7° に達し、
 * 「格子の辺に沿う」という性質がほぼ失われていた（1° 以内はわずか 4%）。
 *
 * そこで**両端に短い「渡り」を挟んで 4 本の線分にする**。
 *
 * ```
 *   折れ点 1 個（脚が傾く）        折れ点 3 個（脚は 60° のまま）
 *      ●                              ●
 *       ＼  ← 角度が変わる              │ ← 渡り（δ px だけ横へ）
 *        ×                            ＼
 *       ／                              ＼  ← 厳密に 60°
 *      ●                                 │ ← 渡り
 *                                        ●
 * ```
 *
 * 元の脚を法線方向へ δ ずらした 2 直線の交点が中央の折れ点になるので、
 * **中央の 2 本は元の格子方向と厳密に平行**を保つ。
 * 端の渡りは δ（数 px）しかないので、節点から少しずれて線が出ていくように見えるだけ。
 *
 * @param {{x: number, y: number}} from @param {{x: number, y: number}} bend @param {{x: number, y: number}} to
 * @param {number} shift - ずらす量（px）。正負で左右
 * @returns {Array<{x: number, y: number}>} 3 点（`shift` が 0 なら元の折れ点 1 点）
 */
export function offsetPolyline(from, bend, to, shift) {
	if (Math.abs(shift) < EPS) return [bend];

	const perp = (a, b) => {
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const d = Math.hypot(dx, dy);
		return d < EPS ? null : { x: -dy / d, y: dx / d }; // 進行方向の右手側
	};
	const n0 = perp(from, bend);
	const n1 = perp(bend, to);
	if (!n0 || !n1) return [bend];

	// 両方の脚から等距離 `shift` にある点（マイターオフセット）。
	// この点は「ずらした脚 1 の直線」と「ずらした脚 2 の直線」の交点になる
	const denom = 1 + (n0.x * n1.x + n0.y * n1.y);
	if (Math.abs(denom) < 1e-6) return [bend];

	return [
		{ x: from.x + shift * n0.x, y: from.y + shift * n0.y },
		{ x: bend.x + shift * (n0.x + n1.x) / denom, y: bend.y + shift * (n0.y + n1.y) / denom },
		{ x: to.x + shift * n1.x, y: to.y + shift * n1.y }
	];
}

/**
 * 折れ点を Cytoscape の `segment-weights` / `segment-distances` へ変換する
 *
 * @description Cytoscape は `P = lerp(p1, p2, weight) + n · distance`（`n = (−u.y, u.x)`）で
 * 折れ点を復元する。その逆変換。
 * **`edge-distances: 'node-position'` を併記しないと基準線がノード境界の交点になり、ここでの前提が崩れる。**
 *
 * @param {{x: number, y: number}} from @param {{x: number, y: number}} to
 * @param {{x: number, y: number}} bend
 * @returns {{weight: number, distance: number}|null} 始点と終点が同じなら null
 */
export function toSegmentSpec(from, to, bend) {
	const vx = to.x - from.x;
	const vy = to.y - from.y;
	const len = Math.hypot(vx, vy);
	if (len < EPS) return null;

	const ux = vx / len;
	const uy = vy / len;
	// 法線。y 下向きのスクリーン座標では「進行方向の右手側」が正
	const nx = -uy;
	const ny = ux;

	const px = bend.x - from.x;
	const py = bend.y - from.y;

	return {
		weight: (px * ux + py * uy) / len,
		distance: px * nx + py * ny
	};
}

/**
 * 線分が円（ノードの当たり範囲）と交わるか
 * @param {{x: number, y: number}} a @param {{x: number, y: number}} b
 * @param {{x: number, y: number}} c - 円の中心
 * @param {number} r - 半径
 * @returns {boolean}
 */
function segmentHitsCircle(a, b, c, r) {
	const vx = b.x - a.x;
	const vy = b.y - a.y;
	const wx = c.x - a.x;
	const wy = c.y - a.y;
	const vv = vx * vx + vy * vy;
	// 線分上で中心に最も近い点のパラメータ（端点を外れないようクランプ）
	const t = vv < EPS ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv));
	const dx = a.x + vx * t - c.x;
	const dy = a.y + vy * t - c.y;
	return dx * dx + dy * dy <= r * r;
}

/**
 * 折れ線が他のノードを何個貫通するか
 * @param {{x: number, y: number}} from @param {{x: number, y: number}} bend @param {{x: number, y: number}} to
 * @param {Array<{x: number, y: number}>} obstacles - 端点を除いたノード座標
 * @param {number} radius
 * @returns {number}
 */
function countPierced(from, bend, to, obstacles, radius) {
	let n = 0;
	for (const o of obstacles) {
		if (segmentHitsCircle(from, bend, o, radius) || segmentHitsCircle(bend, to, o, radius)) n += 1;
	}
	return n;
}

/**
 * 2 本の線分が交差するか（端点の共有は交差とみなさない）
 * @returns {boolean}
 */
function segmentsIntersect(p1, p2, q1, q2) {
	const same = (a, b) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
	if (same(p1, q1) || same(p1, q2) || same(p2, q1) || same(p2, q2)) return false;

	const o = (a, b, c) => {
		const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
		return Math.abs(v) < 1e-9 ? 0 : Math.sign(v);
	};
	const d1 = o(q1, q2, p1);
	const d2 = o(q1, q2, p2);
	const d3 = o(p1, p2, q1);
	const d4 = o(p1, p2, q2);
	return d1 !== d2 && d3 !== d4 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0;
}

/**
 * 折れ線が「既に決めた辺」と何回交差するか
 *
 * @description 配線の順に貪欲へ数えるので、後の辺ほど前の辺を避ける形になる。
 * ノードを共有する辺どうしは節点で必ず会うが、それは交差ではないので数えない。
 * @param {{x: number, y: number}} from @param {{x: number, y: number}} bend @param {{x: number, y: number}} to
 * @param {Array<{from: Object, bend: Object|null, to: Object}>} decided
 * @returns {number}
 */
function countRouteCrossings(from, bend, to, decided) {
	const mine = [[from, bend], [bend, to]];
	let n = 0;
	for (const r of decided) {
		const theirs = r.bend ? [[r.from, r.bend], [r.bend, r.to]] : [[r.from, r.to]];
		for (const [a, b] of mine) {
			for (const [c, d] of theirs) {
				if (segmentsIntersect(a, b, c, d)) n += 1;
			}
		}
	}
	return n;
}

/**
 * 辺の集合を格子沿いの経路へ変換する
 *
 * @description 各辺について、
 * 1. 軸と平行なら `straight`（折れ点なし）
 * 2. そうでなければ 2 通りの折れ点のうち**他のノードを貫通しない方**を選ぶ
 * 3. 同じ 2 点を結ぶ辺が複数あるときは交互に別の折れ方を選んで重なりを避ける
 *
 * @param {Array<{id: string, source: string, target: string}>} edges
 * @param {Map<string, {x: number, y: number}>|Object} positions - ノードID -> 座標
 * ## 重なりを避ける（レーン分離）
 *
 * 向きを 6 方向へ制約すると、**別々の辺が同じ経路へ集まって 1 本に見えてしまう**。
 * 実測（13 ノード / 35 辺の集約段相当）では
 * **53 本の線分のうち 83% が完全な重なりに巻き込まれ、最大 5 本が 1 本に潰れていた**。
 * 交差は減っても、重なった線は追えないので図としてはむしろ悪化する。
 *
 * そこで同じ「廊下」（同一直線上）を通る辺どうしを、進行方向と直角に少しずつずらす。
 * ずらす量は格子間隔に対して十分小さいので 60° の見た目は保たれる。
 *
 * @param {Object} [options]
 * @param {number} [options.nodeRadius=26] - 貫通判定に使うノードの半径
 * @param {number} [options.laneGap=7] - 同じ廊下を通る辺どうしをずらす間隔（px）
 * @returns {Array<{id: string, curveStyle: string, weight: number, distance: number}>}
 */
export function routeEdges(edges, positions, options = {}) {
	const nodeRadius = Number.isFinite(options.nodeRadius) ? options.nodeRadius : 26;
	const laneGap = Number.isFinite(options.laneGap) ? options.laneGap : 7;
	const get = typeof positions?.get === 'function'
		? (id) => positions.get(id)
		: (id) => positions?.[id];

	const list = Array.isArray(edges) ? edges : [];

	// 同じ 2 点を結ぶ辺に通し番号を振る（多重辺を別の折れ方へ散らすため）
	const laneOf = new Map();
	const lanes = new Map();
	for (const e of list) {
		if (!e || e.source === e.target) continue;
		const key = e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`;
		const n = lanes.get(key) || 0;
		lanes.set(key, n + 1);
		laneOf.set(e.id, n);
	}

	// 貫通判定に使うノード座標（毎回作り直さないよう一度だけ集める）。
	// **辺の端点だけでなく `positions` に載っているノードすべて**を対象にする。
	// 辺を 1 本も持たないノードでも、線が上を通れば図としては貫通しているため
	const allNodes = [];
	const pushNode = (id, p) => {
		if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) allNodes.push({ id, x: p.x, y: p.y });
	};
	if (typeof positions?.forEach === 'function' && typeof positions?.get === 'function') {
		positions.forEach((p, id) => pushNode(id, p)); // Map
	} else if (positions && typeof positions === 'object') {
		for (const [id, p] of Object.entries(positions)) pushNode(id, p);
	}

	// 交差を見る選び方は O(E²) なので、辺が多い場面では諦める。
	// 実測: 145 辺で 12ms（採用）/ 850 辺で 70ms（重い）。
	// 相関図はドリル階層で絞るため実際の最大は 145 辺前後で、850 辺が一度に描かれることは無い。
	// 辺数だけで決まるので**機械の速さに依存せず決定的**。
	const countCrossAware = list.length <= (Number.isFinite(options.crossAwareMaxEdges)
		? options.crossAwareMaxEdges
		: 300);

	// --- 1 巡目: 折れ方を決める ---
	const routed = [];
	for (const e of list) {
		if (!e || e.source === e.target) continue;
		const from = get(e.source);
		const to = get(e.target);
		if (!from || !to) continue;

		const bends = hexBendPoints(from, to);
		if (bends.length === 0) {
			// 軸と平行。折れる必要が無いので直線で引く
			routed.push({ id: e.id, from, to, bend: null });
			continue;
		}

		const obstacles = allNodes.filter(n => n.id !== e.source && n.id !== e.target);
		const pierced = bends.map(b => countPierced(from, b, to, obstacles, nodeRadius));

		// **既に決めた辺との交差が少ない方の折れ方を選ぶ。**
		// 貪欲なので最適ではないが、決定的で安く、実測でも目に見えて効く
		// （キャラ個体段 145 本で交差 2305 → 1902 本 = −17%、中規模 120 本で −8%）。
		// 優先順は「ノードを貫通しない > 交差が少ない > 多重辺は交互」。
		// ノード貫通のほうを重く見るのは、線がノードの上を走ると
		// 「そのノードに繋がっているのか通過しているだけなのか」が読めなくなるため。
		const crossed = countCrossAware
			? bends.map(b => countRouteCrossings(from, b, to, routed))
			: [0, 0];

		const lane = laneOf.get(e.id) || 0;
		let pick;
		if (pierced[0] !== pierced[1]) pick = pierced[0] < pierced[1] ? 0 : 1;
		else if (crossed[0] !== crossed[1]) pick = crossed[0] < crossed[1] ? 0 : 1;
		else pick = lane % 2;

		routed.push({ id: e.id, from, to, bend: bends[pick] });
	}

	// --- 2 巡目: 同じ廊下を通る辺へレーン番号を振る ---
	//
	// 線分が乗っている「無限直線」を (向き, 原点からの符号つき距離) で正規化して束ねる。
	// 向きは 6 軸のいずれかなので、丸めれば同一直線が確実に同じキーになる。
	const corridor = new Map();
	const segmentsOf = (r) => (r.bend ? [[r.from, r.bend], [r.bend, r.to]] : [[r.from, r.to]]);
	const lineKey = (a, b) => {
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.hypot(dx, dy);
		if (len < EPS) return null;
		// 向きは 180° 周期（往復で同じ廊下）
		let deg = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 180;
		const axis = Math.round(deg / 60) % 3;
		// 原点からの符号つき距離（法線への射影）
		const ux = dx / len;
		const uy = dy / len;
		const off = Math.round((-uy * a.x + ux * a.y) / 2) * 2; // 2px 単位で丸める
		return `${axis}|${off}`;
	};

	for (const r of routed) {
		for (const [a, b] of segmentsOf(r)) {
			const key = lineKey(a, b);
			if (!key) continue;
			if (!corridor.has(key)) corridor.set(key, []);
			const bucket = corridor.get(key);
			if (!bucket.includes(r.id)) bucket.push(r.id);
		}
	}

	// 廊下を共有する辺どうしを「衝突」とみなし、貪欲彩色でレーン番号を割り当てる。
	//
	// **1 本の辺は複数の廊下に属しうる**（脚が 2 本あるうえ、長い辺は他の辺の廊下も通る）。
	// 最も混んでいる廊下だけを見てレーンを決めると、別の廊下でまた衝突して重なりが残る
	// （実測でその方式だと 234 本中 10 本が重なったままだった）。
	const conflict = new Map();
	for (const ids of corridor.values()) {
		if (ids.length < 2) continue;
		for (const a of ids) {
			if (!conflict.has(a)) conflict.set(a, new Set());
			for (const b of ids) if (a !== b) conflict.get(a).add(b);
		}
	}

	/** 辺ID -> レーン番号（衝突する辺どうしは必ず別番号） */
	const laneNo = new Map();
	// 衝突の多い辺から決める（後になるほど選択肢が狭まるため）。同数は ID 順で決定的に
	const order = [...conflict.keys()].sort((a, b) => (conflict.get(b).size - conflict.get(a).size) || (a < b ? -1 : 1));
	let maxLane = 0;
	for (const id of order) {
		const taken = new Set();
		for (const nb of conflict.get(id)) {
			if (laneNo.has(nb)) taken.add(laneNo.get(nb));
		}
		let lane = 0;
		while (taken.has(lane)) lane += 1;
		laneNo.set(id, lane);
		if (lane > maxLane) maxLane = lane;
	}

	/** 辺ID -> {lane, total} */
	const laneInfo = new Map();
	for (const [id, lane] of laneNo) laneInfo.set(id, { lane, total: maxLane + 1 });

	// --- 3 巡目: レーンぶんだけずらして書き出す ---
	const out = [];
	for (const r of routed) {
		const info = laneInfo.get(r.id);
		// 廊下の中央を 0 として左右へ振り分ける
		const shift = info ? (info.lane - (info.total - 1) / 2) * laneGap : 0;

		if (!r.bend) {
			// 軸と平行な辺。ずらす必要が無ければ直線、必要なら両端に渡りを付けて平行移動する
			if (Math.abs(shift) < EPS) {
				out.push({ id: r.id, curveStyle: 'straight', weights: [], distances: [] });
				continue;
			}
			const specs = [
				toSegmentSpec(r.from, r.to, offsetAlong(r.from, r.to, r.from, shift)),
				toSegmentSpec(r.from, r.to, offsetAlong(r.from, r.to, r.to, shift))
			].filter(Boolean);
			out.push({
				id: r.id, curveStyle: 'round-segments',
				weights: specs.map(s => s.weight), distances: specs.map(s => s.distance)
			});
			continue;
		}

		const points = offsetPolyline(r.from, r.bend, r.to, shift);
		const specs = points.map(p => toSegmentSpec(r.from, r.to, p)).filter(Boolean);
		if (specs.length === 0) continue;
		out.push({
			id: r.id,
			curveStyle: 'round-segments',
			weights: specs.map(s => s.weight),
			distances: specs.map(s => s.distance)
		});
	}

	return out;
}

/**
 * 直線の辺を法線方向へずらした点を返す（軸平行な辺のレーン分離用）
 * @param {{x: number, y: number}} from @param {{x: number, y: number}} to
 * @param {{x: number, y: number}} at - ずらす基準点
 * @param {number} shift
 * @returns {{x: number, y: number}}
 */
function offsetAlong(from, to, at, shift) {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const d = Math.hypot(dx, dy);
	if (d < EPS) return at;
	return { x: at.x + shift * (-dy / d), y: at.y + shift * (dx / d) };
}

/**
 * 折れ点を「両方の脚が同じ量だけ平行移動する」位置へずらす
 *
 * @description 重なった線をずらすとき、**弦（始点↔終点を結ぶ直線）に対して直角にずらすと
 * 2 本の脚が非対称に傾いて「への字」に崩れる**（実際にそう見えて不格好だった）。
 *
 * ```
 *   弦に直角（崩れる）        脚ごとに平行（本関数）
 *      ●                        ●
 *       ＼                       ＼＼      ← 2 本が平行のまま
 *        ×  ← 角度が変わる         ＼＼
 *       ／                        ＼＼
 *      ●                            ●
 * ```
 *
 * 各脚をその脚自身の法線方向へ `shift` だけ動かしたときの、2 直線の交点を求める
 * （いわゆるマイターオフセット）。これで脚の向きが元の格子方向と平行に保たれる。
 * 端点はノードに固定されているので、節点付近だけは扇状に開く（それは自然な見え方）。
 *
 * @param {{x: number, y: number}} from @param {{x: number, y: number}} bend @param {{x: number, y: number}} to
 * @param {number} shift - ずらす量（px）。正負で左右
 * @returns {{x: number, y: number}} ずらしたあとの折れ点
 */
function __unusedOffsetBendParallel(from, bend, to, shift) {
	const norm = (ax, ay, bx, by) => {
		const dx = bx - ax;
		const dy = by - ay;
		const d = Math.hypot(dx, dy);
		return d < EPS ? null : { x: -dy / d, y: dx / d }; // 進行方向の右手側
	};
	const n1 = norm(from.x, from.y, bend.x, bend.y);
	const n2 = norm(bend.x, bend.y, to.x, to.y);
	if (!n1 || !n2) return bend;

	// 両方の脚から等距離 `shift` にある点。分母が 0 に近いのは脚が真逆を向くとき（折り返し）
	const denom = 1 + (n1.x * n2.x + n1.y * n2.y);
	if (Math.abs(denom) < 1e-6) return bend;

	return {
		x: bend.x + shift * (n1.x + n2.x) / denom,
		y: bend.y + shift * (n1.y + n2.y) / denom
	};
}
