/**
 * @fileoverview 創作キャラ・相関図ページ（pages/relations.html）
 *
 * 全創作タイトルのキャラクター間のつながりを 1 枚のグラフとして俯瞰する。
 * キャラシート（`pages/characters.html`）が「1 キャラの詳細」を担うのに対し、
 * こちらは「キャラ同士の関係」を担う。ノードをクリックするとキャラシートの直リンクへ飛ぶ。
 *
 * ## 構成
 * - データ取得: `lib/page-api-bridge.js`（SW 登録 → `/pages/v1/bootstrap` ほか）
 * - グラフ構築: `lib/graph/graph-model.js`（DOM 非依存の純関数。テスト済み）
 * - 描画:       Cytoscape.js（`pages/vendor/` に同梱。初期化時に動的 import）
 * - 直リンク:   `lib/viewer-locator.js`（キャラシートと同じ URL 文法を共有）
 *
 * ## 尺度は「スコープ × グルーピング」の直交 2 軸
 * - スコープ（何を出すか）: 全作品 / 作品 / 作品+DB。二次創作DBのトグルを併設
 * - グルーピング（どう束ねるか）: なし / 作品 / DB
 *   （所属・クラス等の軸は Phase 2 で `lib/graph/graph-facets.js` として追加する）
 *
 * ## LOD ドリルダウン
 * 478 ノードを一度に出すと毛玉になるため、既定は「作品の集約ノード」から始め、
 * クリックで 1 段ずつ（全作品 → 作品 → DB → キャラ）展開する。
 * 同時表示ノードを実質 120 以下に保つのが狙い。
 *
 * @author 100BeautiesLab.
 * @version 1.0.0
 */

import { buildViewerQueryString } from '../lib/viewer-locator.js';
import { api, fetchJSON, ensureApiSW, replayRememberedSwInitError } from '../lib/page-api-bridge.js';
import {
	EDGE_KINDS,
	EDGE_KIND_LABELS,
	buildGraph,
	computeWorkDensity,
	normalizeWorkId
} from '../lib/graph/graph-model.js';

/* ========================================================================
   定数
   ======================================================================== */

/** 相関図の URL クエリキー（キャラシート側の `c` / `q` / `lang` と衝突しない） */
const QS = Object.freeze({
	SCOPE: 's',      // 'NumberTales' / 'NumberTales/Primary'
	GROUPING: 'g',   // 'none' | 'work' | 'db'
	FOCUS: 'f',      // フォーカス中のノードキー（インデックス部分）
	EDGE_OFF: 'e',   // 非表示のエッジ種別（カンマ区切り）
	QUERY: 'q',
	LANG: 'lang',
	SECONDARY: 'sec' // '1' で二次創作DBを含める
});

/** 表示言語の localStorage キー（キャラシートと共有する） */
const PAGE_LANG_STORAGE_KEY = '100bl.characters.pageLang';
const PAGE_LANG_DEFAULT = 'mix';

/** 二次創作とみなす DB 名（`isSecondaryDbName()` 相当。SemiPrimary は一次創作扱い） */
const SECONDARY_DB_RE = /^(secondary|selfsecondary|unprocessedsecondary)$/;

/**
 * キャラクターDBとみなす `DB_Layer`
 *
 * @description `listWorkDBs()` は資料系（`References`）や翻訳（`Localization`）レイヤーのDBも返す。
 * これらは種族・陣営・地域・用語といった**資料**であってキャラクターではないため、相関図のノードにしない。
 * DB 名を列挙して除外するのではなく `DB_Layer` で判定することで、
 * 新しい資料系DBが増えてもコードを触らずに済む
 * （実測: これを入れないと `CommonReferences` の Race / Faction / Society / Region8 / Vocabulary
 * 計 46 件がキャラクターノードとして混ざる）。
 */
const CHARACTER_DB_LAYER = 'DataBases';

/** エッジ種別ごとの表示スタイル（色は characters.css の変数から取る） */
const EDGE_STYLE = Object.freeze({
	[EDGE_KINDS.RELATED]: { color: 'var(--accent)', line: 'solid', width: 2.2 },
	[EDGE_KINDS.COMMENTED]: { color: 'var(--muted)', line: 'dotted', width: 1.4 },
	[EDGE_KINDS.SAME_BEING]: { color: 'var(--success)', line: 'solid', width: 3 },
	[EDGE_KINDS.VARIANT]: { color: 'var(--accent-2)', line: 'dashed', width: 1.8 },
	[EDGE_KINDS.MASTER]: { color: 'var(--warning)', line: 'dashed', width: 2 }
});

/** グルーピング軸の選択肢（Phase 2 で辞書由来の軸を追加する） */
const GROUPING_OPTIONS = [
	{ value: 'none', label_JP: 'なし', label_EN: 'None' },
	{ value: 'work', label_JP: '作品', label_EN: 'Work' },
	{ value: 'db', label_JP: 'DB', label_EN: 'Database' }
];

/** 尺度プリセット（スコープ + グルーピングの組み合わせに名前を付けたもの） */
const PRESETS = [
	{ id: 'all', label_JP: '創作タイトル全体', scope: '', grouping: 'work' },
	{ id: 'work', label_JP: '創作タイトル別', scope: null, grouping: 'db' },
	{ id: 'db', label_JP: 'DB・二次創作別', scope: null, grouping: 'db', secondary: true }
];

/* ========================================================================
   ページ状態
   ======================================================================== */

/**
 * @typedef {Object} RelationsState
 * @property {Object|null} graph - buildGraph() の結果
 * @property {Array} works - bootstrap の works 配列
 * @property {string} scopeWork - '' なら全作品
 * @property {string} scopeDb - '' なら作品配下すべて
 * @property {string} grouping - 'none' | 'work' | 'db'
 * @property {string} focusKey - フォーカス中のノードキー
 * @property {Set<string>} hiddenKinds - 非表示のエッジ種別
 * @property {boolean} includeSecondary
 * @property {boolean} mergeSameBeing
 * @property {string} query
 * @property {string} lang
 */
const state = {
	graph: null,
	works: [],
	scopeWork: '',
	scopeDb: '',
	grouping: 'work',
	focusKey: '',
	hiddenKinds: new Set(),
	includeSecondary: false,
	mergeSameBeing: true,
	query: '',
	lang: PAGE_LANG_DEFAULT
};

/** Cytoscape インスタンス（初期化後に入る） */
let cy = null;
/** Cytoscape モジュールの動的 import 結果（1 回だけ読む） */
let cytoscapePromise = null;
/** レイアウト後の座標キャッシュ（ドリルダウンで戻ったときに図が跳ねないようにする） */
const positionCache = new Map();

/* ========================================================================
   小さなユーティリティ
   ======================================================================== */

/** @param {string} id @returns {HTMLElement|null} */
const $ = (id) => document.getElementById(id);

/**
 * DOM 要素を組み立てる
 * - **`innerHTML` は使わない**（データ由来の文字列を流し込むため XSS を避ける）
 * @param {string} tag
 * @param {Object} [props] - `class` / `text` / `on*` / その他は属性として設定
 * @param {Array} [children]
 * @returns {HTMLElement}
 */
function el(tag, props = {}, children = []) {
	const node = document.createElement(tag);
	for (const [k, v] of Object.entries(props || {})) {
		if (v === null || v === undefined || v === false) continue;
		if (k === 'text') { node.textContent = String(v); continue; }
		if (k === 'class') { node.className = String(v); continue; }
		if (k.startsWith('on') && typeof v === 'function') { node.addEventListener(k.slice(2), v); continue; }
		if (v === true) { node.setAttribute(k, ''); continue; }
		node.setAttribute(k, String(v));
	}
	for (const c of (Array.isArray(children) ? children : [children])) {
		if (c === null || c === undefined || c === false) continue;
		node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
	}
	return node;
}

/** 子要素をすべて入れ替える @param {HTMLElement|null} parent @param {Array} children */
function replaceChildren(parent, children) {
	if (!parent) return;
	parent.textContent = '';
	for (const c of (Array.isArray(children) ? children : [children])) {
		if (c === null || c === undefined || c === false) continue;
		parent.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
	}
}

/** 現在の言語で JP/EN を選ぶ @param {string} jp @param {string} en @returns {string} */
function pickLang(jp, en) {
	const l = String(state.lang || '').toLowerCase();
	if (l === 'en') return String(en || jp || '').trim();
	return String(jp || en || '').trim();
}

/**
 * DB 名が二次創作系か
 * @description `pages/characters.js` の `isSecondaryDbName()` と同じ判定
 *   （`SemiPrimary` は一次創作扱いなので含めない）
 * @param {string} dbName @returns {boolean}
 */
function isSecondaryDbName(dbName) {
	return SECONDARY_DB_RE.test(String(dbName || '').toLowerCase());
}

/** ノードの表示名（インデックスへフォールバック） @param {Object} n @returns {string} */
function nodeLabel(n) {
	return pickLang(n.name_JP, n.name_EN) || n.indexText || '(名称未設定)';
}

/** 作品の短縮ID（`#Works_X` → `X`） @param {string} workId @returns {string} */
function shortWork(workId) {
	return String(workId || '').replace(/^#?Works_/, '');
}

/* ========================================================================
   URL 状態
   ======================================================================== */

/** URL から状態を復元する（旧 `c=` 形式も後方互換で受理する） */
function readStateFromUrl() {
	const p = new URLSearchParams(location.search);

	// キャラシートの直リンク（`c=Work/Db/Idx`）で開かれた場合はスコープ＋フォーカスへ翻訳する
	const legacy = p.get('c');
	if (legacy && !p.get(QS.SCOPE)) {
		const [work = '', db = '', ...rest] = legacy.split('/');
		state.scopeWork = work;
		state.scopeDb = db;
		if (rest.length) state.focusKey = rest.join('/');
	}

	const scope = p.get(QS.SCOPE);
	if (scope !== null) {
		const [work = '', db = ''] = scope.split('/');
		state.scopeWork = work;
		state.scopeDb = db;
	}

	const grouping = p.get(QS.GROUPING);
	if (grouping && GROUPING_OPTIONS.some(o => o.value === grouping)) state.grouping = grouping;

	const focus = p.get(QS.FOCUS);
	if (focus) state.focusKey = focus;

	const edgeOff = p.get(QS.EDGE_OFF);
	state.hiddenKinds = new Set(
		(edgeOff || '').split(',').map(s => s.trim()).filter(k => Object.values(EDGE_KINDS).includes(k))
	);

	state.query = p.get(QS.QUERY) || '';
	state.includeSecondary = p.get(QS.SECONDARY) === '1';

	const lang = p.get(QS.LANG);
	state.lang = normalizeLang(lang || readStoredLang());
}

/**
 * 現在の状態から URL を組み立てる（空値は載せない）
 * @returns {string}
 */
function buildStateQuery() {
	const qs = new URLSearchParams();
	const scope = [state.scopeWork, state.scopeDb].filter(Boolean).join('/');
	if (scope) qs.set(QS.SCOPE, scope);
	if (state.grouping && state.grouping !== 'work') qs.set(QS.GROUPING, state.grouping);
	if (state.focusKey) qs.set(QS.FOCUS, state.focusKey);
	if (state.hiddenKinds.size) qs.set(QS.EDGE_OFF, [...state.hiddenKinds].join(','));
	if (state.query) qs.set(QS.QUERY, state.query);
	if (state.includeSecondary) qs.set(QS.SECONDARY, '1');
	if (state.lang && state.lang !== PAGE_LANG_DEFAULT) qs.set(QS.LANG, state.lang);
	const s = qs.toString();
	// `/` `:` `,` はクエリ内では正当な文字なので戻して可読性を優先する（viewer-locator と同じ方針）
	return s ? `?${s.replace(/%2F/g, '/').replace(/%3A/g, ':').replace(/%2C/g, ',')}` : '';
}

/**
 * URL を更新する
 * @param {boolean} [push=false] - true なら履歴へ積む（ドリルダウン時）
 */
function syncUrl(push = false) {
	const url = `${location.pathname}${buildStateQuery()}`;
	if (push) history.pushState({ relmap: true }, '', url);
	else history.replaceState({ relmap: true }, '', url);
}

/** @param {string} raw @returns {string} 'jp' | 'en' | 'mix' */
function normalizeLang(raw) {
	const v = String(raw || '').trim().toLowerCase();
	return (v === 'jp' || v === 'en' || v === 'mix') ? v : PAGE_LANG_DEFAULT;
}

/** @returns {string} */
function readStoredLang() {
	try { return localStorage.getItem(PAGE_LANG_STORAGE_KEY) || PAGE_LANG_DEFAULT; } catch { return PAGE_LANG_DEFAULT; }
}

/** @param {string} lang */
function storeLang(lang) {
	try { localStorage.setItem(PAGE_LANG_STORAGE_KEY, lang); } catch { /* no-op */ }
}

/* ========================================================================
   データ取得
   ======================================================================== */

/**
 * 相関図に必要なデータを一括で取る
 *
 * @description `/pages/v1/bootstrap` は既定で `includeRecords=1&enrich=1`。
 * `DataFetcher` のリクエストスコープ・メモ化により、この 1 リクエストで
 * 全作品 × 全公開DB のレコードが `_Commons` 適用済み・`isPrivate` 除外済みで返る。
 * @returns {Promise<{works: Array, globalTypeDef: Object, workTypeDefs: Object}>}
 */
async function loadAll() {
	setOverlay('データを読み込み中…');
	const bootstrap = await fetchJSON(api('v1/bootstrap'), 120000);
	const works = Array.isArray(bootstrap?.works) ? bootstrap.works : [];

	setOverlay('スキーマを読み込み中…');
	const globalTypeDefRes = await fetchJSON(api('v1/typedef/global')).catch(() => ({}));
	const globalTypeDef = globalTypeDefRes?.typedef || globalTypeDefRes || {};

	// 作品別 typedef はエッジ抽出（`$display.sectionWrapper` / `$enrich`）と
	// `$IndexDef` の解決に要る。作品数は 10 程度なので並列で取り切る
	const workTypeDefs = {};
	await Promise.all(works.map(async (w) => {
		const workId = normalizeWorkId(w?.work);
		if (!workId) return;
		try {
			const res = await fetchJSON(api(`v1/works/${encodeURIComponent(workId.replace('#', ''))}/typedef`));
			workTypeDefs[workId] = res?.typedef || res || {};
		} catch {
			workTypeDefs[workId] = {};
		}
	}));

	return { works, globalTypeDef, workTypeDefs };
}

/* ========================================================================
   グラフの絞り込みと LOD
   ======================================================================== */

/**
 * 現在のスコープに合致するノードだけを返す
 * @returns {Array<Object>}
 */
function scopedNodes() {
	const all = state.graph?.nodes || [];
	const work = state.scopeWork ? normalizeWorkId(state.scopeWork) : '';
	return all.filter(n => {
		if (work && n.workId !== work) return false;
		if (state.scopeDb && n.dbName !== state.scopeDb) return false;
		if (!state.includeSecondary && isSecondaryDbName(n.dbName)) return false;
		return true;
	});
}

/**
 * 現在の LOD レベルを決める
 * - スコープ未指定 → 'works'（作品の集約ノード）
 * - 作品のみ指定   → 'dbs'（DBの集約ノード）
 * - 作品+DB 指定   → 'nodes'（キャラ個体）
 * @returns {'works'|'dbs'|'nodes'}
 */
function currentLod() {
	if (!state.scopeWork) return 'works';
	if (!state.scopeDb) return 'dbs';
	return 'nodes';
}

/**
 * 同一存在のグループ代表キーを引く（`mergeSameBeing` が有効なときだけ束ねる）
 * @param {string} nodeKey @returns {string}
 */
function representativeKey(nodeKey) {
	if (!state.mergeSameBeing) return nodeKey;
	const groups = state.graph?.sameBeingGroups;
	if (!groups) return nodeKey;
	for (const members of groups.values()) {
		if (members.includes(nodeKey)) {
			// グループ内で辞書順の最小を代表にする（決定的にするため）
			return [...members].sort()[0];
		}
	}
	return nodeKey;
}

/**
 * Cytoscape へ渡す elements を組み立てる
 *
 * @description LOD に応じて「作品」「DB」「キャラ」のどの粒度でノードを作るかを切り替え、
 * エッジは粒度に合わせて集約する（集約ノード間のエッジは本数を太さで表す）。
 * @returns {{elements: Array, counts: Object}}
 */
function buildElements() {
	const lod = currentLod();
	const nodes = scopedNodes();
	const nodeSet = new Set(nodes.map(n => n.key));
	const byKey = new Map(nodes.map(n => [n.key, n]));

	/** ノードキー → 表示上の所属クラスタID（グルーピング用） */
	const clusterOf = (n) => {
		if (state.grouping === 'work') return `cluster:${n.workId}`;
		if (state.grouping === 'db') return `cluster:${n.workId}/${n.dbName}`;
		return null;
	};

	/** ノードキー → 現在の LOD における表示ノードID */
	const displayIdOf = (n) => {
		if (lod === 'works') return `work:${n.workId}`;
		if (lod === 'dbs') return `db:${n.workId}/${n.dbName}`;
		return `node:${representativeKey(n.key)}`;
	};

	// ---- ノード ----
	/** @type {Map<string,Object>} */
	const displayNodes = new Map();
	/** @type {Map<string,Set<string>>} 表示ノードID -> 含まれる実ノードキー */
	const members = new Map();

	for (const n of nodes) {
		const id = displayIdOf(n);
		if (!members.has(id)) members.set(id, new Set());
		members.get(id).add(n.key);

		if (displayNodes.has(id)) continue;
		if (lod === 'works') {
			const info = state.works.find(w => normalizeWorkId(w.work) === n.workId);
			displayNodes.set(id, {
				data: {
					id, kind: 'work', workId: n.workId, count: 0,
					label: pickLang(info?.workInfo?.Title, info?.workInfo?.Title_EN) || shortWork(n.workId)
				}
			});
		} else if (lod === 'dbs') {
			displayNodes.set(id, {
				data: {
					id, kind: 'db', workId: n.workId, dbName: n.dbName, count: 0,
					label: pickLang(n.dbLabel_JP, n.dbLabel_EN) || n.dbName
				}
			});
		} else {
			const parent = state.grouping !== 'none' ? clusterOf(n) : undefined;
			displayNodes.set(id, {
				data: {
					id, kind: 'node', nodeKey: n.key, workId: n.workId, dbName: n.dbName,
					label: nodeLabel(n), indexText: n.indexText, degree: n.degree,
					...(parent ? { parent } : {})
				}
			});
		}
	}

	// 件数を数える（集約ノードのサイズに使う）
	for (const [id, set] of members) {
		const dn = displayNodes.get(id);
		if (dn) dn.data.count = set.size;
	}

	// ---- クラスタ（compound node の親）----
	if (lod === 'nodes' && state.grouping !== 'none') {
		const clusters = new Map();
		for (const n of nodes) {
			const cid = clusterOf(n);
			if (!cid || clusters.has(cid)) continue;
			const info = state.works.find(w => normalizeWorkId(w.work) === n.workId);
			const label = state.grouping === 'work'
				? (pickLang(info?.workInfo?.Title, info?.workInfo?.Title_EN) || shortWork(n.workId))
				: `${shortWork(n.workId)} / ${pickLang(n.dbLabel_JP, n.dbLabel_EN) || n.dbName}`;
			clusters.set(cid, { data: { id: cid, kind: 'cluster', label } });
		}
		for (const c of clusters.values()) displayNodes.set(c.data.id, c);
	}

	// ---- エッジ（表示ノード単位へ集約）----
	/** @type {Map<string,Object>} */
	const displayEdges = new Map();
	for (const e of (state.graph?.edges || [])) {
		if (state.hiddenKinds.has(e.kind)) continue;
		if (!nodeSet.has(e.source) || !nodeSet.has(e.target)) continue;
		const a = displayIdOf(byKey.get(e.source));
		const b = displayIdOf(byKey.get(e.target));
		if (a === b) continue; // 集約で自己ループになったものは描かない
		const [s, t] = a < b ? [a, b] : [b, a];
		const id = `${e.kind}::${s}::${t}`;
		if (!displayEdges.has(id)) {
			displayEdges.set(id, {
				data: {
					id, source: s, target: t, kind: e.kind, weight: 0,
					direction: e.direction
				}
			});
		}
		displayEdges.get(id).data.weight += 1;
	}

	return {
		elements: [...displayNodes.values(), ...displayEdges.values()],
		counts: { nodes: displayNodes.size, edges: displayEdges.size, characters: nodes.length }
	};
}

/* ========================================================================
   Cytoscape 描画
   ======================================================================== */

/**
 * Cytoscape 本体を動的 import する（1 回だけ）
 * @returns {Promise<Function>}
 */
function loadCytoscape() {
	if (!cytoscapePromise) {
		cytoscapePromise = import('cytoscape').then(m => m.default || m);
	}
	return cytoscapePromise;
}

/**
 * CSS 変数を実値へ解決する
 * @description Cytoscape は canvas 描画なので `var(--x)` をそのままでは解釈できない。
 * @param {string} value @returns {string}
 */
function resolveCssVar(value) {
	const m = /^var\((--[^)]+)\)$/.exec(String(value || '').trim());
	if (!m) return value;
	const v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
	return v || '#888';
}

/** Cytoscape のスタイル定義を組み立てる @returns {Array} */
function buildCyStyle() {
	const css = (name, fallback) => {
		const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
		return v || fallback;
	};
	const fg = css('--fg', '#e9f3ff');
	const accent = css('--accent', '#5fd6ff');
	const card = css('--card', '#0f1830');
	const border = css('--border', '#1d2a4a');
	const muted = css('--muted', '#9fb6d6');

	const styles = [
		{
			selector: 'node',
			style: {
				'background-color': card,
				'border-color': border,
				'border-width': 1.5,
				'label': 'data(label)',
				'color': fg,
				'font-size': 11,
				'text-valign': 'bottom',
				'text-margin-y': 4,
				'text-wrap': 'ellipsis',
				'text-max-width': 120,
				'width': 26,
				'height': 26
			}
		},
		{
			// 集約ノード（作品 / DB）は件数に応じて大きくする
			selector: 'node[kind = "work"], node[kind = "db"]',
			style: {
				'background-color': accent,
				'border-color': accent,
				'shape': 'round-rectangle',
				'width': 'mapData(count, 1, 300, 40, 120)',
				'height': 'mapData(count, 1, 300, 34, 80)',
				'font-size': 13,
				'text-valign': 'center',
				'text-margin-y': 0,
				'color': '#05080f',
				'font-weight': 'bold'
			}
		},
		{
			selector: 'node[kind = "cluster"]',
			style: {
				'background-opacity': 0.08,
				'background-color': accent,
				'border-color': border,
				'border-width': 1,
				'shape': 'round-rectangle',
				'label': 'data(label)',
				'text-valign': 'top',
				'text-halign': 'center',
				'font-size': 12,
				'color': muted,
				'padding': 16
			}
		},
		{
			selector: 'node:selected',
			style: { 'border-color': accent, 'border-width': 3 }
		},
		{
			// ノードが多いときはラベルを畳む。105 ノードを一度に出すと文字が重なって読めなくなるため、
			// 「次数が高い（＝ハブ）」ノードと、選択・強調中のノードだけラベルを残す。
			// 本格的な密度対策（エッジ種別フィルタ・近傍 N ホップ）は Phase 3 で追加する
			selector: 'node.label-off',
			style: { 'label': '' }
		},
		{
			selector: 'node.label-off:selected, node.label-off.highlighted',
			style: { 'label': 'data(label)', 'z-index': 99 }
		},
		{
			selector: 'node.dimmed',
			style: { 'opacity': 0.22 }
		},
		{
			selector: 'node.highlighted',
			style: { 'border-color': accent, 'border-width': 3 }
		},
		{
			selector: 'edge',
			style: {
				'curve-style': 'bezier',
				'width': 'mapData(weight, 1, 12, 1.2, 6)',
				'opacity': 0.75,
				'target-arrow-shape': 'triangle',
				'arrow-scale': 0.7
			}
		},
		{
			// 相互参照は両端に矢印を出す（1 本のエッジで双方向を表す）
			selector: 'edge[direction = "mutual"]',
			style: { 'source-arrow-shape': 'triangle' }
		},
		{
			selector: 'edge.dimmed',
			style: { 'opacity': 0.08 }
		}
	];

	for (const [kind, s] of Object.entries(EDGE_STYLE)) {
		const color = resolveCssVar(s.color);
		styles.push({
			selector: `edge[kind = "${kind}"]`,
			style: {
				'line-color': color,
				'target-arrow-color': color,
				'source-arrow-color': color,
				'line-style': s.line
			}
		});
	}
	return styles;
}

/** レイアウト設定を返す（`prefers-reduced-motion` を尊重する） @returns {Object} */
function buildLayout() {
	const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
	return {
		name: 'cose',
		animate: reduce ? false : 'end',
		animationDuration: reduce ? 0 : 400,
		randomize: false,
		nodeRepulsion: 9000,
		idealEdgeLength: 90,
		nestingFactor: 0.8,
		gravity: 0.4,
		numIter: 900,
		fit: true,
		padding: 28
	};
}

/** グラフを描き直す */
async function renderGraph() {
	const cytoscape = await loadCytoscape();
	const { elements, counts } = buildElements();
	const container = $('canvas');
	if (!container) return;

	const cacheKey = `${state.scopeWork}|${state.scopeDb}|${state.grouping}|${state.includeSecondary}|${state.mergeSameBeing}`;

	if (!cy) {
		cy = cytoscape({
			container,
			elements,
			style: buildCyStyle(),
			// wheelSensitivity は既定のままにする（変更すると Cytoscape が
			// 「マウス環境によって不自然なズームになる」と警告し、実際に体感差が大きい）
			minZoom: 0.15,
			maxZoom: 3
		});
		wireGraphEvents();
	} else {
		// 現在の座標をキャッシュしてから差し替える（戻ったときに図が跳ねないように）
		const prev = {};
		cy.nodes().forEach(n => { prev[n.id()] = { ...n.position() }; });
		positionCache.set(cy.scratch('_relmapKey') || '', prev);
		cy.elements().remove();
		cy.add(elements);
		cy.style(buildCyStyle());
	}
	cy.scratch('_relmapKey', cacheKey);

	const cached = positionCache.get(cacheKey);
	if (cached && cy.nodes().every(n => cached[n.id()])) {
		cy.nodes().forEach(n => n.position(cached[n.id()]));
		cy.fit(undefined, 28);
	} else {
		cy.layout(buildLayout()).run();
	}

	applyLabelDensity();
	applyFocusAndQuery();
	renderStats(counts);
	renderAdjacency();
	renderIsolated();
	setOverlay('');
}

/** グラフのイベントを配線する */
function wireGraphEvents() {
	if (!cy) return;

	cy.on('tap', 'node', (evt) => {
		const d = evt.target.data();
		if (d.kind === 'work') {
			state.scopeWork = shortWork(d.workId);
			state.scopeDb = '';
			state.focusKey = '';
			onScopeChanged(true);
			return;
		}
		if (d.kind === 'db') {
			state.scopeWork = shortWork(d.workId);
			state.scopeDb = d.dbName;
			state.focusKey = '';
			onScopeChanged(true);
			return;
		}
		if (d.kind === 'node') {
			state.focusKey = d.nodeKey;
			syncUrl(false);
			showInspector(d.nodeKey);
			applyFocusAndQuery();
		}
	});

	// 背景タップでフォーカス解除
	cy.on('tap', (evt) => {
		if (evt.target !== cy) return;
		state.focusKey = '';
		syncUrl(false);
		hideInspector();
		applyFocusAndQuery();
	});
}

/**
 * ラベルの表示密度を調整する
 *
 * @description ノードが多いと名前が重なって読めなくなるため、一定数を超えたら
 * 「次数上位（＝ハブ）」だけラベルを残す。集約ノード（作品 / DB）は常に出す。
 * 選択・強調中のノードは `label-off` でもラベルが復活するようスタイル側で上書きしている。
 */
function applyLabelDensity() {
	if (!cy) return;
	const chars = cy.nodes('[kind = "node"]');
	cy.nodes().removeClass('label-off');
	// 60 は「1440px 幅で名前が重ならずに並ぶ上限」の目安
	if (chars.length <= 60) return;

	// 次数上位 40 件だけラベルを残す
	const sorted = chars.toArray().sort((a, b) => (b.data('degree') || 0) - (a.data('degree') || 0));
	for (const n of sorted.slice(40)) n.addClass('label-off');
}

/** フォーカスと検索の強調を反映する（非マッチは減光。消さない） */
function applyFocusAndQuery() {
	if (!cy) return;
	cy.elements().removeClass('dimmed highlighted');

	const q = state.query.trim().toLowerCase();
	if (q) {
		const hit = cy.nodes().filter(n => String(n.data('label') || '').toLowerCase().includes(q)
			|| String(n.data('indexText') || '').toLowerCase().includes(q));
		if (hit.length > 0) {
			cy.elements().addClass('dimmed');
			hit.removeClass('dimmed').addClass('highlighted');
			hit.connectedEdges().removeClass('dimmed');
		}
	}

	if (state.focusKey) {
		const target = cy.nodes(`[nodeKey = "${cssEscape(state.focusKey)}"]`);
		if (target.length > 0) {
			cy.elements().addClass('dimmed');
			const nbr = target.closedNeighborhood();
			nbr.removeClass('dimmed');
			target.addClass('highlighted');
		}
	}
}

/**
 * Cytoscape セレクタ内で使う文字列をエスケープする
 * @param {string} v @returns {string}
 */
function cssEscape(v) {
	return String(v || '').replace(/["\\]/g, '\\$&');
}

/* ========================================================================
   サイドパネル / テキスト版
   ======================================================================== */

/** @param {string} message 空文字で非表示 */
function setOverlay(message) {
	const overlay = $('overlay');
	const text = $('overlay-text');
	if (!overlay || !text) return;
	if (!message) { overlay.hidden = true; return; }
	text.textContent = message;
	overlay.hidden = false;
}

/** @param {Object} counts */
function renderStats(counts) {
	const s = state.graph?.stats;
	if (!s) return;
	const lodLabel = { works: '作品', dbs: 'DB', nodes: 'キャラクター' }[currentLod()];
	replaceChildren($('stats'), [
		`表示: ${counts.nodes} ${lodLabel}ノード / ${counts.edges} 本`,
		` ・ 対象キャラクター ${counts.characters} 件`,
		` ・ 全体 ${s.nodeCount} キャラ / ${s.edgeCount} 本（相互 ${s.mutualCount} 組を1本に集約）`
	]);
}

/** パンくずを描く */
function renderBreadcrumb() {
	const items = [];
	items.push(el('button', {
		class: 'relmap__crumb ghost',
		type: 'button',
		text: 'すべての作品',
		onclick: () => { state.scopeWork = ''; state.scopeDb = ''; state.focusKey = ''; onScopeChanged(true); }
	}));

	if (state.scopeWork) {
		const info = state.works.find(w => normalizeWorkId(w.work) === normalizeWorkId(state.scopeWork));
		items.push(el('span', { class: 'relmap__crumb-sep', text: '›' }));
		items.push(el('button', {
			class: 'relmap__crumb ghost',
			type: 'button',
			text: pickLang(info?.workInfo?.Title, info?.workInfo?.Title_EN) || state.scopeWork,
			onclick: () => { state.scopeDb = ''; state.focusKey = ''; onScopeChanged(true); }
		}));
	}

	if (state.scopeDb) {
		const n = (state.graph?.nodes || []).find(x => x.dbName === state.scopeDb
			&& x.workId === normalizeWorkId(state.scopeWork));
		items.push(el('span', { class: 'relmap__crumb-sep', text: '›' }));
		items.push(el('span', {
			class: 'relmap__crumb relmap__crumb--current',
			text: pickLang(n?.dbLabel_JP, n?.dbLabel_EN) || state.scopeDb
		}));
	}

	replaceChildren($('breadcrumb'), items);
}

/**
 * インスペクタに 1 ノードの詳細を出す
 * @param {string} nodeKey
 */
function showInspector(nodeKey) {
	const node = (state.graph?.nodes || []).find(n => n.key === nodeKey);
	const body = $('inspector-body');
	const empty = $('inspector-empty');
	if (!node || !body) return;

	const rows = [];
	rows.push(el('h2', { class: 'relmap__inspector-title', text: nodeLabel(node) }));
	rows.push(el('p', { class: 'relmap__inspector-sub muted' }, [
		`${shortWork(node.workId)} / ${pickLang(node.dbLabel_JP, node.dbLabel_EN) || node.dbName}`
	]));
	rows.push(el('p', { class: 'relmap__inspector-index muted', text: node.indexText }));

	// キャラシートへの直リンク（URL 文法は lib/viewer-locator.js と共有）
	rows.push(el('a', {
		class: 'btn btn-primary relmap__inspector-open',
		href: `./characters.html${characterHref(node)}`,
		text: 'キャラシートを開く'
	}));

	// 関係先
	const related = relatedOf(nodeKey);
	rows.push(el('h3', { class: 'relmap__inspector-h3', text: `関係先（${related.length}）` }));
	if (related.length === 0) {
		rows.push(el('p', { class: 'muted', text: 'このキャラクターにはまだ関係が登録されていません。' }));
	} else {
		rows.push(el('ul', { class: 'relmap__rel-list' }, related.map(r => el('li', {}, [
			el('span', { class: `relmap__kind relmap__kind--${r.kind}`, text: kindLabel(r.kind) }),
			' ',
			el('a', {
				href: `./characters.html${characterHref(r.node)}`,
				text: nodeLabel(r.node),
				onclick: (ev) => {
					// 同一ページ内でフォーカスを移す（Ctrl/⌘ クリックは通常遷移に任せる）
					if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
					ev.preventDefault();
					state.focusKey = r.node.key;
					syncUrl(false);
					showInspector(r.node.key);
					applyFocusAndQuery();
				}
			}),
			r.labels.length ? el('span', { class: 'relmap__rel-labels', text: `：${r.labels.join(', ')}` }) : null,
			r.comment ? el('p', { class: 'relmap__rel-comment', text: r.comment }) : null
		]))));
	}

	replaceChildren(body, rows);
	body.hidden = false;
	if (empty) empty.hidden = true;
}

/** インスペクタを閉じる */
function hideInspector() {
	const body = $('inspector-body');
	const empty = $('inspector-empty');
	if (body) { body.hidden = true; body.textContent = ''; }
	if (empty) empty.hidden = false;
}

/**
 * ノードのキャラシート直リンク用クエリを作る
 * @param {Object} node @returns {string}
 */
function characterHref(node) {
	// ノードキーの 3 セグメント目（`Suit=Major,SuitNum=16`）を `キーパス:値` 形式へ移す
	const idxToken = String(node.indexText || '')
		.split(',')
		.map(p => {
			const [k, ...rest] = p.split('=');
			return k && rest.length ? `${k}:${rest.join('=')}` : '';
		})
		.filter(Boolean)
		.join(',');
	const [firstKey, firstVal] = (idxToken.split(',')[0] || '').split(':');
	const single = idxToken.split(',').length === 1;
	return buildViewerQueryString({
		work: node.workId,
		db: node.dbName,
		idx: single ? firstVal : JSON.stringify(Object.fromEntries(
			idxToken.split(',').map(p => { const [k, ...r] = p.split(':'); return [k, r.join(':')]; })
		)),
		idxKey: single ? firstKey : '__conditions__',
		lang: state.lang === PAGE_LANG_DEFAULT ? '' : state.lang
	});
}

/**
 * 指定ノードの関係先を集める
 * @param {string} nodeKey
 * @returns {Array<{node: Object, kind: string, labels: string[], comment: string}>}
 */
function relatedOf(nodeKey) {
	const byKey = new Map((state.graph?.nodes || []).map(n => [n.key, n]));
	const out = [];
	for (const e of (state.graph?.edges || [])) {
		if (state.hiddenKinds.has(e.kind)) continue;
		const other = e.source === nodeKey ? e.target : (e.target === nodeKey ? e.source : null);
		if (!other) continue;
		const node = byKey.get(other);
		if (!node) continue;
		const meta = (e.source === nodeKey ? e.metaAToB : e.metaBToA) || e.metaAToB || e.metaBToA || {};
		out.push({
			node,
			kind: e.kind,
			labels: Array.isArray(meta.labels) ? meta.labels : [],
			comment: pickLang(meta.comment_JP, meta.comment_EN)
		});
	}
	return out;
}

/** @param {string} kind @returns {string} */
function kindLabel(kind) {
	const l = EDGE_KIND_LABELS[kind];
	return l ? pickLang(l.jp, l.en) : kind;
}

/**
 * テキスト版の隣接リストを描く（canvas を見られない場合の代替経路）
 * 表示件数は現在のスコープに限定する
 */
function renderAdjacency() {
	const nodes = scopedNodes();
	const withEdges = nodes.filter(n => n.degree > 0);
	const body = $('adjacency-body');
	if (!body) return;

	if (withEdges.length === 0) {
		replaceChildren(body, [el('p', { class: 'muted', text: '現在のスコープに関係の登録されたキャラクターはいません。' })]);
		return;
	}

	replaceChildren(body, withEdges.map(n => el('section', { class: 'relmap__adjacency-item' }, [
		el('h3', {}, [
			el('a', { href: `./characters.html${characterHref(n)}`, text: nodeLabel(n) }),
			el('span', { class: 'muted', text: ` — ${shortWork(n.workId)} / ${n.dbName}` })
		]),
		el('ul', {}, relatedOf(n.key).map(r => el('li', {}, [
			`${kindLabel(r.kind)}: `,
			el('a', { href: `./characters.html${characterHref(r.node)}`, text: nodeLabel(r.node) }),
			r.labels.length ? `（${r.labels.join(', ')}）` : ''
		])))
	])));
}

/** 関係が登録されていないキャラクターの一覧を描く */
function renderIsolated() {
	const nodes = scopedNodes().filter(n => n.degree === 0);
	const body = $('isolated-body');
	if (!body) return;
	const summary = $('isolated')?.querySelector('summary');
	if (summary) summary.textContent = `関係が登録されていないキャラクター（${nodes.length}）`;

	if (nodes.length === 0) {
		replaceChildren(body, [el('p', { class: 'muted', text: '現在のスコープには該当がありません。' })]);
		return;
	}
	replaceChildren(body, [el('ul', { class: 'relmap__isolated-list' }, nodes.map(n => el('li', {}, [
		el('a', { href: `./characters.html${characterHref(n)}`, text: nodeLabel(n) }),
		el('span', { class: 'muted', text: ` — ${shortWork(n.workId)} / ${n.dbName}` })
	])))]);
}

/** データ診断パネルを描く */
function renderDiagnostics() {
	const d = state.graph?.diagnostics;
	const body = $('diagnostics-body');
	if (!d || !body) return;

	const sections = [];
	const addList = (title, items, format) => {
		sections.push(el('h3', { class: 'relmap__diag-h3', text: `${title}（${items.length}）` }));
		if (items.length === 0) {
			sections.push(el('p', { class: 'muted', text: '該当なし' }));
			return;
		}
		sections.push(el('ul', {}, items.slice(0, 50).map(i => el('li', { text: format(i) }))));
		if (items.length > 50) sections.push(el('p', { class: 'muted', text: `…ほか ${items.length - 50} 件` }));
	};

	addList('参照先が見つからないリンク', d.unresolvedLinks,
		(i) => `${String(i.from || '').replace('#Works_', '')} の ${i.field} → ${shortWork(i.targetWork || '')}/${i.targetDb || ''} ${JSON.stringify(i.pairs || i.entry || {})}`);
	addList('参照先が一意に定まらないリンク', d.ambiguousLinks,
		(i) => `${String(i.from || '').replace('#Works_', '')} の ${i.field} → ${i.targetDb} ${JSON.stringify(i.pairs)}`);
	addList('キャラクターDBとして扱わなかったDB', d.skippedDbs,
		(i) => `${shortWork(i.workId)}/${i.dbName}（${i.recordCount} 件・layer=${i.layer || '-'}）`);
	addList('インデックスを取り出せなかったレコード', d.unindexedRecords,
		(i) => `${shortWork(i.workId)}/${i.dbName} ${i.name || '(名称不明)'}`);
	addList('ノードキーが衝突したレコード', d.duplicatedNodes,
		(i) => `${shortWork(i.workId)}/${i.dbName} ${i.name || ''} → ${i.key}`);

	replaceChildren(body, sections);
}

/* ========================================================================
   コントロール
   ======================================================================== */

/** 作品セレクトとDBセレクトを埋める */
function populateSelectors() {
	const workSel = $('select-work');
	const dbSel = $('select-db');
	if (!workSel || !dbSel) return;

	const workIds = [...new Set((state.graph?.nodes || []).map(n => n.workId))];
	replaceChildren(workSel, [
		el('option', { value: '', text: 'すべての作品' }),
		...workIds.map(id => {
			const info = state.works.find(w => normalizeWorkId(w.work) === id);
			return el('option', {
				value: shortWork(id),
				text: pickLang(info?.workInfo?.Title, info?.workInfo?.Title_EN) || shortWork(id)
			});
		})
	]);
	workSel.value = state.scopeWork;

	const dbNames = state.scopeWork
		? [...new Set((state.graph?.nodes || [])
			.filter(n => n.workId === normalizeWorkId(state.scopeWork))
			.filter(n => state.includeSecondary || !isSecondaryDbName(n.dbName))
			.map(n => n.dbName))]
		: [];
	replaceChildren(dbSel, [
		el('option', { value: '', text: state.scopeWork ? 'すべてのDB' : '（作品を選択）' }),
		...dbNames.map(db => {
			const n = (state.graph?.nodes || []).find(x => x.dbName === db && x.workId === normalizeWorkId(state.scopeWork));
			return el('option', { value: db, text: pickLang(n?.dbLabel_JP, n?.dbLabel_EN) || db });
		})
	]);
	dbSel.disabled = !state.scopeWork;
	dbSel.value = state.scopeDb;
}

/** グルーピングセレクトを埋める */
function populateGrouping() {
	const sel = $('select-grouping');
	if (!sel) return;
	replaceChildren(sel, GROUPING_OPTIONS.map(o =>
		el('option', { value: o.value, text: pickLang(o.label_JP, o.label_EN) })));
	sel.value = state.grouping;
}

/** エッジ種別の凡例＋トグルを描く */
function renderEdgeKinds() {
	const box = $('edge-kinds');
	if (!box) return;
	const counts = state.graph?.stats?.edgesByKind || {};
	replaceChildren(box, Object.values(EDGE_KINDS).map(kind => {
		const id = `edge-kind-${kind}`;
		const input = el('input', {
			type: 'checkbox', id,
			checked: !state.hiddenKinds.has(kind),
			onchange: (ev) => {
				if (ev.target.checked) state.hiddenKinds.delete(kind);
				else state.hiddenKinds.add(kind);
				syncUrl(false);
				renderGraph();
			}
		});
		if (!state.hiddenKinds.has(kind)) input.checked = true;
		return el('label', { class: 'relmap__legend-item', for: id }, [
			input,
			el('span', {
				class: 'relmap__legend-swatch',
				style: `--swatch-color: ${EDGE_STYLE[kind].color}; --swatch-line: ${EDGE_STYLE[kind].line}`
			}),
			el('span', { text: kindLabel(kind) }),
			el('span', { class: 'muted', text: ` (${counts[kind] ?? 0})` })
		]);
	}));
}

/** プリセットボタンを描く */
function renderPresets() {
	const box = $('presets');
	if (!box) return;
	replaceChildren(box, PRESETS.map(p => el('button', {
		class: 'ghost relmap__preset',
		type: 'button',
		text: p.label_JP,
		onclick: () => {
			if (p.scope !== null) { state.scopeWork = p.scope; state.scopeDb = ''; }
			state.grouping = p.grouping;
			if (typeof p.secondary === 'boolean') state.includeSecondary = p.secondary;
			state.focusKey = '';
			populateSelectors();
			populateGrouping();
			const chk = $('chk-secondary');
			if (chk) chk.checked = state.includeSecondary;
			onScopeChanged(true);
		}
	})));
}

/** スコープ変更時の共通処理 @param {boolean} push 履歴へ積むか */
function onScopeChanged(push) {
	populateSelectors();
	renderBreadcrumb();
	syncUrl(push);
	hideInspector();
	renderGraph();
}

/** コントロールのイベントを配線する */
function wireControls() {
	$('select-work')?.addEventListener('change', (ev) => {
		state.scopeWork = ev.target.value;
		state.scopeDb = '';
		state.focusKey = '';
		onScopeChanged(true);
	});

	$('select-db')?.addEventListener('change', (ev) => {
		state.scopeDb = ev.target.value;
		state.focusKey = '';
		onScopeChanged(true);
	});

	$('select-grouping')?.addEventListener('change', (ev) => {
		state.grouping = ev.target.value;
		syncUrl(false);
		renderGraph();
	});

	$('chk-secondary')?.addEventListener('change', (ev) => {
		state.includeSecondary = ev.target.checked;
		state.scopeDb = '';
		onScopeChanged(false);
	});

	$('chk-merge-same')?.addEventListener('change', (ev) => {
		state.mergeSameBeing = ev.target.checked;
		renderGraph();
	});

	// 検索はデバウンスして再描画コストを抑える
	let searchTimer = null;
	$('search-input')?.addEventListener('input', (ev) => {
		const v = ev.target.value;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			state.query = v;
			syncUrl(false);
			applyFocusAndQuery();
		}, 220);
	});

	$('btn-refit')?.addEventListener('click', () => cy?.fit(undefined, 28));
	$('btn-relayout')?.addEventListener('click', () => {
		positionCache.delete(cy?.scratch('_relmapKey') || '');
		cy?.layout(buildLayout()).run();
	});

	$('btn-lang-toggle')?.addEventListener('click', () => {
		state.lang = state.lang === 'en' ? 'jp' : 'en';
		storeLang(state.lang);
		applyLangToUi();
		syncUrl(false);
		renderGraph();
	});

	$('btn-rail-toggle')?.addEventListener('click', (ev) => {
		const railBody = $('rail-body');
		if (!railBody) return;
		const open = railBody.hasAttribute('hidden');
		if (open) railBody.removeAttribute('hidden');
		else railBody.setAttribute('hidden', '');
		ev.currentTarget.setAttribute('aria-expanded', String(open));
	});

	// 戻る／進むで状態を復元する
	window.addEventListener('popstate', () => {
		readStateFromUrl();
		populateSelectors();
		populateGrouping();
		renderEdgeKinds();
		renderBreadcrumb();
		applyLangToUi();
		renderGraph();
	});
}

/** 言語トグルの見た目と静的文言を更新する */
function applyLangToUi() {
	const btn = $('btn-lang-toggle');
	if (btn) {
		btn.dataset.lang = state.lang;
		btn.title = state.lang === 'en' ? '表示言語を日本語へ切り替え' : '表示言語を英語へ切り替え';
	}
	renderEdgeKinds();
	populateGrouping();
	populateSelectors();
	renderBreadcrumb();
}

/* ========================================================================
   起動
   ======================================================================== */

/** エントリポイント */
async function main() {
	replayRememberedSwInitError();
	readStateFromUrl();

	try {
		setOverlay('Service Worker を準備中…');
		await ensureApiSW();
	} catch (err) {
		setOverlay('');
		showFatal('Service Worker を準備できませんでした', err);
		return;
	}

	let payload;
	try {
		payload = await loadAll();
	} catch (err) {
		setOverlay('');
		showFatal('データの取得に失敗しました', err);
		return;
	}

	setOverlay('関係を解析中…');
	state.works = payload.works;
	state.graph = buildGraph({
		works: payload.works,
		globalTypeDef: payload.globalTypeDef,
		workTypeDefs: payload.workTypeDefs,
		options: {
			lang: state.lang,
			// 資料系（References）・翻訳（Localization）レイヤーはキャラクターではないので除外する。
			// `layer` 未設定のDBは従来どおりキャラDB扱い（後方互換）
			dbFilter: (_workId, _dbName, dbEntry) => {
				const layer = String(dbEntry?.layer || '').trim();
				return !layer || layer === CHARACTER_DB_LAYER;
			}
		}
	});

	// 作品内エッジが薄い作品は Phase 2 の中間ノードモードが要る。
	// 現時点では診断としてコンソールへ出しておく
	const density = computeWorkDensity(state.graph.nodes, state.graph.edges);
	console.info('📊 作品別のエッジ密度:', Object.fromEntries([...density].map(([k, v]) => [shortWork(k), v])));

	renderPresets();
	populateSelectors();
	populateGrouping();
	renderEdgeKinds();
	renderBreadcrumb();
	renderDiagnostics();
	applyLangToUi();
	wireControls();

	const chkSec = $('chk-secondary');
	if (chkSec) chkSec.checked = state.includeSecondary;
	const searchInput = $('search-input');
	if (searchInput) searchInput.value = state.query;

	await renderGraph();

	if (state.focusKey) {
		showInspector(state.focusKey);
		applyFocusAndQuery();
	}
}

/**
 * 復帰不能なエラーを画面に出す
 * @param {string} title @param {any} err
 */
function showFatal(title, err) {
	const container = $('canvas');
	if (!container) return;
	replaceChildren(container, [
		el('div', { class: 'relmap__fatal' }, [
			el('h2', { text: title }),
			el('p', { text: String(err?.message || err || '') }),
			el('p', { class: 'muted', text: 'ローカルで開いている場合は http:// 経由（例: python -m http.server）でアクセスしてください。file:// では Service Worker が動きません。' })
		])
	]);
}

// テスト環境（jsdom）では自動起動しない
const isTestMode = Boolean(globalThis.__RELATIONS_TEST_MODE__);
if (!isTestMode) {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => { main().catch(err => showFatal('初期化エラー', err)); });
	} else {
		main().catch(err => showFatal('初期化エラー', err));
	}
}

// テスト用フック（`pages/characters.js` の `__*ForTest` と同じ流儀）
export {
	state as __relationsStateForTest,
	buildStateQuery as __buildStateQueryForTest,
	readStateFromUrl as __readStateFromUrlForTest,
	characterHref as __characterHrefForTest,
	isSecondaryDbName as __isSecondaryDbNameForTest
};
