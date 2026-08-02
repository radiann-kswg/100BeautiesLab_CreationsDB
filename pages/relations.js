/**
 * @fileoverview 創作キャラ・相関図ページ（pages/relations.html）
 *
 * 全創作タイトルのキャラクター間のつながりを 1 枚のグラフとして俯瞰する。
 * キャラシート（`pages/characters.html`）が「1 キャラの詳細」を担うのに対し、
 * こちらは「キャラ同士の関係」を担う。
 *
 * ## 構成
 * - データ取得: `lib/page-api-bridge.js`（SW 登録 → `/pages/v1/bootstrap` ほか）
 * - グラフ構築: `lib/graph/graph-model.js`（エッジ抽出・ノード同一性。DOM 非依存）
 * - 軸・階層:   `lib/graph/graph-facets.js`（`$display.facet` 宣言の解決）
 * - バッジ:     `lib/graph/graph-badge.js`（`Works_Code` + `$IndexDef.$badge`）
 * - 配置:       `lib/graph/graph-layout.js`（六角格子へのスナップ）
 * - 描画:       Cytoscape.js（`pages/vendor/` に同梱。初期化時に動的 import）
 * - 直リンク:   `lib/viewer-locator.js`（キャラシートと同じ URL 文法を共有）
 * - 辞書:       `lib/basic-renders/type-common.js`（`globalThis.TypeResolver`）
 *
 * ## 階層は typedef 駆動
 *
 * ドリルダウンの段は `$display.facet.hierarchy` を宣言した軸だけで決まる。
 * 「作品 → 所属 → カード種別 → クラス名 → キャラクター」のように**作品ごとに段が変わる**。
 * DB 別のように「ノードが少なく視覚的な違いが乏しい」段は宣言していないので階層に出ない
 * （グルーピング軸としては引き続き使える）。
 *
 * ## マップの分割
 *
 * `$display.mapPartition` 宣言（`sec_DesignedBy` + 辞書行の `isOwner`）により、
 * **本人以外が関わった共同二次創作は別マップ**へ分ける。誰が本人かはコードに埋め込まず辞書で持つ。
 *
 * ## 画面に収めることを優先しない
 *
 * ノードが潰れる倍率になるなら全体表示せず、等倍付近で出してパン/ズームに委ねる。
 *
 * @author 100BeautiesLab.
 * @version 2.0.0
 */

import '../lib/basic-renders/type-common.js';
import { buildViewerQueryString } from '../lib/viewer-locator.js';
import { api, fetchJSON, ensureApiSW, replayRememberedSwInitError } from '../lib/page-api-bridge.js';
import {
	EDGE_KINDS,
	EDGE_KIND_LABELS,
	buildGraph,
	normalizeWorkId
} from '../lib/graph/graph-model.js';
import {
	collectFacets,
	buildHierarchy,
	collectMapPartition,
	classifyMapPartition,
	extractFacetValues,
	groupNodesByFacet,
	selectUsableFacets,
	UNSET_GROUP_KEY,
	OTHER_GROUP_KEY
} from '../lib/graph/graph-facets.js';
import { buildBadge, createDictCellLookup, getWorksCode } from '../lib/graph/graph-badge.js';
import { snapToHexLattice, resolveSpacing, boundsOf, shouldFitToViewport } from '../lib/graph/graph-layout.js';
import { buildPalette, createTokenReader } from '../lib/graph/graph-palette.js';

/* ========================================================================
   定数
   ======================================================================== */

/** 相関図の URL クエリキー（キャラシート側の `c` / `q` / `lang` と衝突しない） */
const QS = Object.freeze({
	MAP: 'm',        // 'own' | 'shared'
	DRILL: 'd',      // ドリルダウンの選択値をスラッシュ区切りで（'NumberTales/百花繚乱研究所'）
	GROUPING: 'g',   // 色分け・囲いの軸キー（階層とは独立）
	FOCUS: 'f',      // エゴネットワークで見ているノードキー
	EDGE_OFF: 'e',   // 手動で非表示にしたエッジ種別（カンマ区切り）
	QUERY: 'q',
	LANG: 'lang',
	SECONDARY: 'sec',// '1' で二次創作DBを含める
	THUMBS: 't'      // '1' でサムネイル表示
});

/** 表示言語の localStorage キー（キャラシートと共有する） */
const PAGE_LANG_STORAGE_KEY = '100bl.characters.pageLang';
const PAGE_LANG_DEFAULT = 'mix';

/** 二次創作とみなす DB 名（`isSecondaryDbName()` 相当。SemiPrimary は一次創作扱い） */
const SECONDARY_DB_RE = /^(secondary|selfsecondary|unprocessedsecondary)$/;

/**
 * キャラクターDBとみなす `DB_Layer`
 * @description 資料系（`References`）や翻訳（`Localization`）はキャラではないので相関図に出さない。
 * これを入れないと `CommonReferences` の Race / Faction / Society / Region8 / Vocabulary 計 46 件が混ざる。
 */
const CHARACTER_DB_LAYER = 'DataBases';

/**
 * エッジ種別ごとの見た目と「関係の濃さ」
 *
 * @description `weight` は密度連動の自動非表示で使う優先度。
 * 数値が小さいほど薄い関係とみなし、混み合ったときに先に隠す。
 * `hideAt` は「表示エッジ数がこれを超えたら自動で隠す」しきい値（`null` は常に表示）。
 * `layout` はレイアウトへの寄与度（0 ならノード配置を引っ張らない）。
 * `tone` は `graph-palette.js` の `palette.edge` を引くキー。
 *
 * 色は水色〜紺の単一系統へ寄せてある。以前は同一存在に `--success`（緑）、
 * 主従に `--warning`（橙）を使っていたが、これは状態を表す意味論色の目的外流用だった。
 * 線種（solid / dashed / dotted）との二重符号化が既にあるので、色を寄せても識別性は落ちない。
 */
const EDGE_STYLE = Object.freeze({
	[EDGE_KINDS.RELATED]: { tone: 'related', line: 'solid', weight: 100, hideAt: null, layout: 1 },
	[EDGE_KINDS.SAME_BEING]: { tone: 'sameBeing', line: 'solid', weight: 90, hideAt: null, layout: 1 },
	[EDGE_KINDS.MASTER]: { tone: 'master', line: 'dashed', weight: 70, hideAt: null, layout: 0.6 },
	[EDGE_KINDS.VARIANT]: { tone: 'variant', line: 'dashed', weight: 50, hideAt: 400, layout: 0.4 },
	[EDGE_KINDS.COMMENTED]: { tone: 'commented', line: 'dotted', weight: 10, hideAt: 250, layout: 0 }
});

/** ノードの基本サイズ（六角格子の間隔を決める基準） */
const NODE_BASE_SIZE = 46;

/** サムネイルの同時ロード上限 */
const THUMB_CONCURRENCY = 6;

/* ========================================================================
   ページ状態
   ======================================================================== */

const state = {
	/** buildGraph() の結果 */
	graph: null,
	/** bootstrap の works 配列 */
	works: [],
	/** 作品ID -> 辞書束（`#List_*`） */
	varsDefByWork: {},
	/** 作品ID -> 作品別 typedef */
	workTypeDefs: {},
	/** グローバル typedef */
	globalTypeDef: {},
	/** グローバルメタ（Works_Code を持つ） */
	globalMeta: {},
	/** 宣言から集めた軸 */
	facets: [],
	/** マップ分割の宣言 */
	partition: null,

	/** 'own' | 'shared' */
	map: 'own',
	/** ドリルダウンの選択値（段ごと） */
	drill: [],
	/** エゴネットワークで見ているノードキー */
	focusKey: '',
	/** 色分け・囲いの軸キー（'' なら無し） */
	grouping: '',
	/** 手動で非表示にしたエッジ種別 */
	hiddenKinds: new Set(),
	/** 密度により自動で隠したエッジ種別 */
	autoHiddenKinds: new Set(),
	includeSecondary: false,
	mergeSameBeing: true,
	showThumbs: false,
	query: '',
	lang: PAGE_LANG_DEFAULT
};

/** Cytoscape インスタンス */
let cy = null;
/** Cytoscape モジュールの動的 import 結果 */
let cytoscapePromise = null;

/* ========================================================================
   小さなユーティリティ
   ======================================================================== */

/** @param {string} id @returns {HTMLElement|null} */
const $ = (id) => document.getElementById(id);

/**
 * DOM 要素を組み立てる（`innerHTML` は使わない＝データ由来文字列の XSS を避ける）
 * @param {string} tag @param {Object} [props] @param {Array} [children] @returns {HTMLElement}
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
	return String(state.lang).toLowerCase() === 'en'
		? String(en || jp || '').trim()
		: String(jp || en || '').trim();
}

/** @param {string} dbName @returns {boolean} */
function isSecondaryDbName(dbName) {
	return SECONDARY_DB_RE.test(String(dbName || '').toLowerCase());
}

/** ノードの表示名 @param {Object} n @returns {string} */
function nodeLabel(n) {
	return pickLang(n?.name_JP, n?.name_EN) || n?.badge || n?.indexText || '(名称未設定)';
}

/** 作品の短縮ID @param {string} workId @returns {string} */
function shortWork(workId) {
	return String(workId || '').replace(/^#?Works_/, '');
}

/** 作品の表示名 @param {string} workId @returns {string} */
function workTitle(workId) {
	const info = state.works.find(w => normalizeWorkId(w.work) === workId);
	return pickLang(info?.workInfo?.Title_JP || info?.workInfo?.Title, info?.workInfo?.Title_EN)
		|| shortWork(workId);
}

/** @param {string} kind @returns {string} */
function kindLabel(kind) {
	const l = EDGE_KIND_LABELS[kind];
	return l ? pickLang(l.jp, l.en) : kind;
}

/**
 * 作品の辞書束から辞書引き関数を作る
 * @param {string} workId @param {Object|null} indexDef
 * @returns {Function}
 */
function dictLookupFor(workId, indexDef = null) {
	return createDictCellLookup(state.varsDefByWork[workId] || {}, indexDef);
}

/**
 * 軸の値を表示ラベルへ解決する（`globalThis.TypeResolver` の辞書機構を使う）
 * @param {Object} facet @param {string} value @param {Object} [record]
 * @returns {{jp: string, en: string}|null}
 */
function resolveFacetLabelPack(facet, value, record = null) {
	const TR = globalThis.TypeResolver;
	if (!TR?.resolveVarsDefLabelPack || !facet?.dict) return null;
	try {
		const workId = record?._relmapWorkId || '';
		const meta = { General: { $VarsDef: state.varsDefByWork[workId] || {} } };
		const pack = TR.resolveVarsDefLabelPack(facet.dict, value, state.globalTypeDef, meta, facet.dict, record);
		return pack ? { jp: pack.jp, en: pack.en } : null;
	} catch {
		return null;
	}
}

/* ========================================================================
   URL 状態
   ======================================================================== */

/** URL から状態を復元する（キャラシートの `c=` 形式も後方互換で受理する） */
function readStateFromUrl() {
	const p = new URLSearchParams(location.search);

	const map = p.get(QS.MAP);
	if (map === 'shared' || map === 'own') state.map = map;

	const drill = p.get(QS.DRILL);
	if (drill !== null) state.drill = drill.split('/').filter(Boolean);

	// キャラシートの直リンク（`c=Work/Db/Idx`）で開かれたら作品段まで降りる
	const legacy = p.get('c');
	if (legacy && drill === null) {
		const [work = ''] = legacy.split('/');
		if (work) state.drill = [normalizeWorkId(work)];
	}
	// 旧 `s=Work/Db` 形式も受理
	const legacyScope = p.get('s');
	if (legacyScope && drill === null) {
		const [work = ''] = legacyScope.split('/');
		if (work) state.drill = [normalizeWorkId(work)];
	}

	state.grouping = p.get(QS.GROUPING) || '';
	state.focusKey = p.get(QS.FOCUS) || '';
	state.query = p.get(QS.QUERY) || '';
	state.includeSecondary = p.get(QS.SECONDARY) === '1';
	state.showThumbs = p.get(QS.THUMBS) === '1';

	const edgeOff = p.get(QS.EDGE_OFF);
	state.hiddenKinds = new Set(
		(edgeOff || '').split(',').map(s => s.trim()).filter(k => Object.values(EDGE_KINDS).includes(k))
	);

	state.lang = normalizeLang(p.get(QS.LANG) || readStoredLang());
}

/** 現在の状態から URL を組み立てる（空値は載せない） @returns {string} */
function buildStateQuery() {
	const qs = new URLSearchParams();
	if (state.map !== 'own') qs.set(QS.MAP, state.map);
	if (state.drill.length) qs.set(QS.DRILL, state.drill.join('/'));
	if (state.grouping) qs.set(QS.GROUPING, state.grouping);
	if (state.focusKey) qs.set(QS.FOCUS, state.focusKey);
	if (state.hiddenKinds.size) qs.set(QS.EDGE_OFF, [...state.hiddenKinds].join(','));
	if (state.query) qs.set(QS.QUERY, state.query);
	if (state.includeSecondary) qs.set(QS.SECONDARY, '1');
	if (state.showThumbs) qs.set(QS.THUMBS, '1');
	if (state.lang && state.lang !== PAGE_LANG_DEFAULT) qs.set(QS.LANG, state.lang);
	const s = qs.toString();
	// `/` `:` `,` はクエリ内では正当な文字なので戻して可読性を優先する
	return s ? `?${s.replace(/%2F/g, '/').replace(/%3A/g, ':').replace(/%2C/g, ',')}` : '';
}

/** @param {boolean} [push=false] 履歴へ積むか */
function syncUrl(push = false) {
	const url = `${location.pathname}${buildStateQuery()}`;
	if (push) history.pushState({ relmap: true }, '', url);
	else history.replaceState({ relmap: true }, '', url);
}

/** @param {string} raw @returns {string} */
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
 * @returns {Promise<Object>}
 */
async function loadAll() {
	setOverlay('データを読み込み中…');
	const bootstrap = await fetchJSON(api('v1/bootstrap'), 180000);
	const works = Array.isArray(bootstrap?.works) ? bootstrap.works : [];

	setOverlay('スキーマと辞書を読み込み中…');
	const globalTypeDefRes = await fetchJSON(api('v1/typedef/global')).catch(() => ({}));
	const globalTypeDef = globalTypeDefRes?.typedef || globalTypeDefRes || {};
	const globalMetaRes = await fetchJSON(api('v1/meta')).catch(() => ({}));
	const globalMeta = globalMetaRes?.meta || globalMetaRes || {};

	const workTypeDefs = {};
	const varsDefByWork = {};
	await Promise.all(works.map(async (w) => {
		const workId = normalizeWorkId(w?.work);
		if (!workId) return;
		const slug = encodeURIComponent(workId.replace('#', ''));
		const [typeRes, metaRes] = await Promise.all([
			fetchJSON(api(`v1/works/${slug}/typedef`)).catch(() => ({})),
			fetchJSON(api(`v1/works/${slug}/meta`)).catch(() => ({}))
		]);
		workTypeDefs[workId] = typeRes?.typedef || typeRes || {};

		// 辞書束: 作品メタ + 作品 typedef + グローバルメタ の $VarsDef を合流する。
		// VirtuesUs の `#List_Virtues`（Virtues_Num を持つ）は作品メタ側にしか無い
		const vars = {};
		const sources = [
			globalMeta?.General?.$VarsDef,
			metaRes?.meta?.General?.$VarsDef, metaRes?.General?.$VarsDef,
			workTypeDefs[workId]?.$VarsDef, workTypeDefs[workId]?.$VersDef,
			metaRes?.meta?.Dictionaries, metaRes?.Dictionaries
		];
		for (const src of sources) {
			if (!src || typeof src !== 'object') continue;
			for (const [k, v] of Object.entries(src)) if (Array.isArray(v)) vars[k] = v;
		}
		varsDefByWork[workId] = vars;
	}));

	return { works, globalTypeDef, globalMeta, workTypeDefs, varsDefByWork };
}

/* ========================================================================
   階層とマップ
   ======================================================================== */

/** 現在のスコープ作品（ドリルの 1 段目） @returns {string} */
function scopeWorkId() {
	return state.drill[0] || '';
}

/** 現在のスコープに応じた階層の段を返す @returns {Array<Object>} */
function currentLevels() {
	return buildHierarchy(state.facets, { scope: scopeWorkId() });
}

/**
 * マップ（自作 / 共同二次創作）とレイヤー・二次創作トグルで絞ったノード
 * @returns {Array<Object>}
 */
function baseNodes() {
	const all = state.graph?.nodes || [];
	return all.filter(n => {
		if (n.mapKind !== state.map) return false;
		if (!state.includeSecondary && isSecondaryDbName(n.dbName)) return false;
		return true;
	});
}

/**
 * ドリルダウンの選択を反映したノード集合
 * @returns {Array<Object>}
 */
function drilledNodes() {
	const levels = currentLevels();
	let list = baseNodes();

	for (let depth = 0; depth < state.drill.length && depth < levels.length; depth += 1) {
		const level = levels[depth];
		const picked = state.drill[depth];
		if (level.kind === 'work') {
			list = list.filter(n => n.workId === picked);
			continue;
		}
		list = list.filter(n => {
			const values = facetValuesOf(n, level);
			if (picked === UNSET_GROUP_KEY) return values.length === 0;
			return values.includes(picked);
		});
	}
	return list;
}

/**
 * ノードの軸の値（辞書参照つき）
 * @param {Object} node @param {Object} facet @returns {string[]}
 */
function facetValuesOf(node, facet) {
	if (!facet || facet.kind === 'work') return [node.workId];
	return extractFacetValues(node.record, facet, { lookupDictCell: node._relmapLookup });
}

/* ========================================================================
   Cytoscape の要素組み立て
   ======================================================================== */

/**
 * 現在の状態から Cytoscape の elements を組み立てる
 * @returns {{elements: Array, counts: Object, mode: string}}
 */
function buildElements() {
	const levels = currentLevels();
	const depth = state.drill.length;
	const nodes = drilledNodes();

	// --- エゴネットワーク（選択キャラ＋その隣接だけ） ---
	if (state.focusKey) {
		return buildEgoElements(nodes);
	}

	// --- まだ段が残っていれば集約ノードを出す ---
	if (depth < levels.length) {
		return buildAggregateElements(nodes, levels[depth]);
	}

	// --- 最下段: キャラクター個体 ---
	return buildCharacterElements(nodes);
}

/**
 * 集約ノード（作品 / 軸の値ごと）を組み立てる
 * @param {Array<Object>} nodes @param {Object} level
 * @returns {{elements: Array, counts: Object, mode: string}}
 */
function buildAggregateElements(nodes, level) {
	/** グループキー -> {label, members} */
	const groups = new Map();

	if (level.kind === 'work') {
		for (const n of nodes) {
			if (!groups.has(n.workId)) groups.set(n.workId, { label: workTitle(n.workId), members: [] });
			groups.get(n.workId).members.push(n);
		}
	} else {
		const grouped = groupNodesByFacet(nodes, level, {
			lookupDictCell: nodes[0]?._relmapLookup,
			resolveLabel: (facet, value) => resolveFacetLabelPack(facet, value, nodes.find(n => true)?.record)
		});
		const byKey = new Map(nodes.map(n => [n.key, n]));
		for (const g of grouped.groups) {
			groups.set(g.value, {
				label: pickLang(g.label_JP, g.label_EN),
				members: g.members.map(k => byKey.get(k)).filter(Boolean)
			});
		}
	}

	const memberOf = new Map();
	const elements = [];
	let i = 0;
	for (const [value, g] of groups) {
		const id = `grp:${value}`;
		for (const n of g.members) {
			if (!memberOf.has(n.key)) memberOf.set(n.key, []);
			memberOf.get(n.key).push(id);
		}
		// グループの識別は「位置 + ラベル + 濃度段 + 枠」の多重符号化で行う。
		// 色相を変える循環パレットは使わない（キャラシートに無い色が増えるため）
		const shade = shadeFor(i);
		elements.push({
			data: {
				id, kind: 'group', value, level: level.key,
				label: g.label, count: g.members.length,
				color: shade.fill, borderColor: shade.border
			}
		});
		i += 1;
	}

	// 集約ノード間のエッジ（本数を太さで表す）
	const edges = new Map();
	for (const e of visibleEdges()) {
		const a = memberOf.get(e.source);
		const b = memberOf.get(e.target);
		if (!a || !b) continue;
		for (const ga of a) for (const gb of b) {
			if (ga === gb) continue;
			const [s, t] = ga < gb ? [ga, gb] : [gb, ga];
			const id = `${e.kind}::${s}::${t}`;
			if (!edges.has(id)) edges.set(id, { data: { id, source: s, target: t, kind: e.kind, weight: 0 } });
			edges.get(id).data.weight += 1;
		}
	}

	return {
		elements: [...elements, ...edges.values()],
		counts: { nodes: elements.length, edges: edges.size, characters: nodes.length },
		mode: 'aggregate'
	};
}

/**
 * キャラクター個体のノードを組み立てる（グルーピング軸に応じて囲い or 中間ノード）
 * @param {Array<Object>} nodes
 * @returns {{elements: Array, counts: Object, mode: string}}
 */
function buildCharacterElements(nodes) {
	const facet = state.facets.find(f => f.key === state.grouping) || null;
	const elements = [];
	let mode = 'plain';

	/** ノードキー -> 割り当てた色 */
	const colorOf = new Map();
	/** compound 用の親ID */
	const parentOf = new Map();
	/** 中間ノードのエッジ */
	const bridgeEdges = [];

	if (facet) {
		const grouped = groupNodesByFacet(nodes, facet, {
			lookupDictCell: nodes[0]?._relmapLookup,
			resolveLabel: (f, value) => resolveFacetLabelPack(f, value, nodes[0]?.record)
		});
		mode = grouped.multiValued ? 'bridge' : 'compound';

		grouped.groups.forEach((g, idx) => {
			const shade = shadeFor(idx);
			const id = `grp:${g.value}`;
			const label = pickLang(g.label_JP, g.label_EN);

			if (mode === 'compound') {
				// 単値軸: Cytoscape の compound node（囲い）で表す
				elements.push({ data: { id, kind: 'cluster', label, color: shade.fill, borderColor: shade.border } });
				for (const k of g.members) { parentOf.set(k, id); colorOf.set(k, shade.border); }
			} else {
				// 多値軸: 1 ノード 1 親の制約を避けるため、軸の値を実ノードにして 2 部グラフにする
				elements.push({ data: { id, kind: 'facet', label, color: shade.fill, borderColor: shade.border, count: g.members.length } });
				for (const k of g.members) {
					if (!colorOf.has(k)) colorOf.set(k, shade.border);
					bridgeEdges.push({ data: { id: `bridge::${id}::${k}`, source: id, target: `node:${k}`, kind: 'facet' } });
				}
			}
		});
	}

	for (const n of nodes) {
		const parent = parentOf.get(n.key);
		elements.push({
			data: {
				id: `node:${n.key}`, kind: 'node', nodeKey: n.key,
				workId: n.workId, dbName: n.dbName,
				label: nodeLabel(n), badge: n.badge || n.indexText,
				degree: n.degree || 0,
				// `border-color: data(color)` が空文字だとスタイル適用に失敗するので既定色を入れる
				color: colorOf.get(n.key) || palette().nodeBorder,
				// `background-image: data(thumb)` は値が空だと無効になるため、
				// サムネイルが無いノードにはキー自体を持たせない（`[thumb]` セレクタで弾く）
				...(state.showThumbs && n.thumb ? { thumb: n.thumb } : {}),
				...(parent ? { parent } : {})
			}
		});
	}

	const ids = new Set(nodes.map(n => `node:${n.key}`));
	const edges = [];
	for (const e of visibleEdges()) {
		const s = `node:${e.source}`;
		const t = `node:${e.target}`;
		if (!ids.has(s) || !ids.has(t)) continue;
		edges.push({ data: { id: e.id, source: s, target: t, kind: e.kind, weight: 1, direction: e.direction } });
	}

	return {
		elements: [...elements, ...bridgeEdges, ...edges],
		counts: { nodes: nodes.length, edges: edges.length, characters: nodes.length },
		mode
	};
}

/**
 * エゴネットワーク（選択キャラ＋直接つながる相手だけ）を組み立てる
 *
 * @description キャラシートへ飛ぶ前に「このキャラが誰と繋がっているか」だけを見る段。
 * @param {Array<Object>} scopeNodes
 * @returns {{elements: Array, counts: Object, mode: string}}
 */
function buildEgoElements(scopeNodes) {
	const byKey = new Map((state.graph?.nodes || []).map(n => [n.key, n]));
	const center = byKey.get(state.focusKey);
	if (!center) return { elements: [], counts: { nodes: 0, edges: 0, characters: 0 }, mode: 'ego' };

	const neighbours = new Map();
	const edges = [];
	for (const e of visibleEdges()) {
		const other = e.source === center.key ? e.target : (e.target === center.key ? e.source : null);
		if (!other) continue;
		const n = byKey.get(other);
		if (!n) continue;
		neighbours.set(n.key, n);
		edges.push({ data: { id: e.id, source: `node:${e.source}`, target: `node:${e.target}`, kind: e.kind, weight: 1, direction: e.direction } });
	}

	const mkNode = (n, isCenter) => ({
		data: {
			id: `node:${n.key}`, kind: 'node', nodeKey: n.key,
			workId: n.workId, dbName: n.dbName,
			label: nodeLabel(n), badge: n.badge || n.indexText,
			degree: n.degree || 0,
			color: isCenter ? palette().nodeBorderActive : palette().nodeBorder,
			...(state.showThumbs && n.thumb ? { thumb: n.thumb } : {}),
			center: isCenter ? 1 : 0
		}
	});

	const elements = [mkNode(center, true), ...[...neighbours.values()].map(n => mkNode(n, false)), ...edges];
	return {
		elements,
		counts: { nodes: neighbours.size + 1, edges: edges.length, characters: neighbours.size + 1 },
		mode: 'ego'
	};
}

/**
 * 表示対象のエッジ（手動＋密度による自動非表示を適用）
 * @returns {Array<Object>}
 */
function visibleEdges() {
	const all = state.graph?.edges || [];
	const hidden = new Set([...state.hiddenKinds, ...state.autoHiddenKinds]);
	return all.filter(e => !hidden.has(e.kind));
}

/**
 * 密度に応じて薄いエッジ種別を自動で隠す
 *
 * @description 「なぜ消えたのか分からない」を避けるため、隠したことは凡例に明示する。
 * 手動トグルは自動判定より優先する（手動で ON にした種別は自動で隠さない）。
 */
function applyEdgeDensityPolicy() {
	state.autoHiddenKinds = new Set();
	if (state.focusKey) return; // エゴネットワークは元々少ないので隠さない

	const scope = new Set(drilledNodes().map(n => n.key));
	const inScope = (state.graph?.edges || []).filter(e => scope.has(e.source) && scope.has(e.target));

	// 薄い順（weight 昇順）に、しきい値を超えている種別を隠していく
	const kinds = Object.entries(EDGE_STYLE)
		.filter(([, s]) => Number.isFinite(s.hideAt))
		.sort((a, b) => a[1].weight - b[1].weight);

	for (const [kind, style] of kinds) {
		if (state.hiddenKinds.has(kind)) continue; // 既に手動で非表示
		const total = inScope.filter(e => !state.autoHiddenKinds.has(e.kind)).length;
		if (total > style.hideAt) state.autoHiddenKinds.add(kind);
	}
}

/* ========================================================================
   Cytoscape 描画
   ======================================================================== */

/** @returns {Promise<Function>} */
function loadCytoscape() {
	if (!cytoscapePromise) cytoscapePromise = import('cytoscape').then(m => m.default || m);
	return cytoscapePromise;
}

/** 解決済みパレット。`getComputedStyle` は同期レイアウトを誘発するので起動時 1 回だけ解決する */
let paletteCache = null;

/**
 * 相関図のパレットを取得する
 *
 * @description **Cytoscape へ `color-mix()` / `var()` を渡してはいけない。**
 * 実測で、Cytoscape は `color-mix()` / `color(srgb …)` / `oklab()` を拒否し、
 * 例外を投げずに警告だけ出して `#999` へフォールバックする。目視では「なんとなく灰色」に
 * 見えるだけで気づけないため、色はすべて `graph-palette.js` 側で実値へ解決してから渡す。
 * @returns {Object} `buildPalette()` の戻り値
 */
function palette() {
	if (!paletteCache) paletteCache = buildPalette(createTokenReader(document));
	return paletteCache;
}

/**
 * グループ番号から濃度段（面の色と枠の色）を引く
 *
 * @description **色相でカテゴリを塗り分けない。** グループの識別は
 * 「格子上の位置 + ラベル + 濃度段 + 枠 + 左レール凡例」の多重符号化で行う。
 * 濃度段は accent を card へ混ぜたラダーで、段数を超えたら循環する。
 * @param {number} index - グループの通し番号
 * @returns {{fill: string, border: string}}
 */
function shadeFor(index) {
	const p = palette();
	const shades = p.shades;
	const i = ((Number.isFinite(index) ? index : 0) % shades.length + shades.length) % shades.length;
	return { fill: shades[i], border: i >= shades.length - 2 ? p.cellBorder : p.cellBorderInner };
}

/** Cytoscape のスタイル定義 @returns {Array} */
function buildCyStyle() {
	const p = palette();
	const { fg, accent, card, border, muted } = p;

	const styles = [
		{
			// キャラクター: 角丸タイル。中にバッジ、下に名前
			selector: 'node[kind = "node"]',
			style: {
				'shape': 'round-rectangle',
				'background-color': card,
				// 色は data() マッパーで引く。関数値を渡すとこの minified ビルドの
				// スタイルパーサが落ちるため、必ず空でない色文字列を data へ入れておく
				'border-color': 'data(color)',
				'border-width': 2,
				'width': `mapData(degree, 0, 20, ${NODE_BASE_SIZE * 0.7}, ${NODE_BASE_SIZE * 1.6})`,
				'height': `mapData(degree, 0, 20, ${NODE_BASE_SIZE * 0.55}, ${NODE_BASE_SIZE * 1.15})`,
				'label': 'data(badge)',
				'color': fg,
				'font-size': 12,
				'font-weight': 'bold',
				'text-valign': 'center',
				'text-halign': 'center',
				'text-wrap': 'ellipsis',
				'text-max-width': 60
			}
		},
		{
			// サムネイルがあれば背景に敷く
			selector: 'node[kind = "node"][thumb]',
			style: {
				'background-image': 'data(thumb)',
				'background-fit': 'cover',
				'background-opacity': 0.35
			}
		},
		{
			selector: 'node[kind = "node"][center = 1]',
			style: { 'border-color': accent, 'border-width': 4 }
		},
		{
			// 集約ノード（作品 / 軸の値）。
			// 面をベタ塗りせず、地に近い濃度段＋枠で「盤面に置かれた区画」に見せる
			// （accent 系で 150×92px を 85% 不透明で塗ると、キャラシートの語彙から浮く。
			//  あちらで accent が塗る面は最大でも .chip の 80×24px までしかない）
			selector: 'node[kind = "group"], node[kind = "facet"]',
			style: {
				'shape': 'round-rectangle',
				'background-color': 'data(color)',
				'border-color': 'data(borderColor)',
				'border-width': 1.5,
				'background-opacity': 1,
				'width': 'mapData(count, 1, 200, 56, 150)',
				'height': 'mapData(count, 1, 200, 40, 92)',
				'label': 'data(label)',
				'color': fg,
				'font-size': 13,
				'font-weight': 'bold',
				'text-valign': 'center',
				'text-wrap': 'ellipsis',
				'text-max-width': 130
			}
		},
		{
			// compound（囲い）
			selector: 'node[kind = "cluster"]',
			style: {
				'shape': 'round-rectangle',
				'background-color': 'data(color)',
				'background-opacity': 1,
				'border-color': 'data(borderColor)',
				'border-width': 1,
				'border-opacity': 0.8,
				'label': 'data(label)',
				'text-valign': 'top',
				'text-halign': 'center',
				'font-size': 12,
				'color': muted,
				'padding': 18
			}
		},
		// 選択・強調は色相を変えず accent で縁取る（characters.sass:1478-1487 の作法）
		{ selector: 'node:selected', style: { 'border-color': accent, 'border-width': 4 } },
		{ selector: 'node.dimmed', style: { 'opacity': p.dimAlpha } },
		{ selector: 'node.highlighted', style: { 'border-color': accent, 'border-width': 4 } },
		{
			selector: 'edge',
			style: {
				'curve-style': 'bezier',
				'width': 'mapData(weight, 1, 12, 1.4, 6)',
				'opacity': 0.7,
				'target-arrow-shape': 'triangle',
				'arrow-scale': 0.7
			}
		},
		{ selector: 'edge[direction = "mutual"]', style: { 'source-arrow-shape': 'triangle' } },
		{
			// 中間ノードへの橋渡し（軸との所属関係。関係性のエッジではない）
			selector: 'edge[kind = "facet"]',
			style: {
				'line-color': muted, 'line-style': 'dotted', 'opacity': 0.35,
				'width': 1, 'target-arrow-shape': 'none'
			}
		},
		{ selector: 'edge.dimmed', style: { 'opacity': 0.06 } },
		{
			// 検索の減光・選択の切り替えを滑らかにする。
			// Cytoscape 組み込みの style transition なので JS 側の補間コードは不要
			selector: 'node, edge',
			style: {
				'transition-property': 'opacity, border-color, border-width, line-color',
				'transition-duration': '160ms',
				'transition-timing-function': 'ease-out'
			}
		}
	];

	for (const [kind, s] of Object.entries(EDGE_STYLE)) {
		const color = p.edge[s.tone];
		styles.push({
			selector: `edge[kind = "${kind}"]`,
			style: {
				'line-color': color,
				'target-arrow-color': color,
				'source-arrow-color': color,
				'line-style': s.line,
				// 薄い関係は細く・淡く（描画は残すが図の骨格を作らせない）
				'width': s.weight <= 10 ? 0.8 : `mapData(weight, 1, 12, 1.4, 6)`,
				'opacity': s.weight <= 10 ? 0.28 : 0.7,
				...(s.weight <= 10 ? { 'target-arrow-shape': 'none' } : {})
			}
		});
	}
	return styles;
}

/** @returns {boolean} */
function prefersReducedMotion() {
	return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

/** グラフを描き直す */
async function renderGraph() {
	const cytoscape = await loadCytoscape();
	applyEdgeDensityPolicy();
	const { elements, counts, mode } = buildElements();
	const container = $('canvas');
	if (!container) return;

	if (!cy) {
		cy = cytoscape({ container, elements, style: buildCyStyle(), minZoom: 0.12, maxZoom: 3 });
		wireGraphEvents();
	} else {
		cy.elements().remove();
		cy.add(elements);
		cy.style(buildCyStyle());
	}

	// 力学レイアウトで相対位置を決めてから、六角格子へスナップして均等感を出す。
	// `cose` は 1 反復が O(n^2) なので、反復回数をノード数に反比例させないと
	// ノードが増えたときに数十秒固まる（実測: 288 ノード × 800 反復で 30 秒超）。
	// 最終的に格子へスナップするため、力学レイアウトには「大まかな相対位置」だけを求める。
	const nodeCount = cy.nodes().length;
	const numIter = Math.max(80, Math.min(600, Math.round(240000 / Math.max(1, nodeCount * nodeCount) * 100)));
	const layout = cy.layout({
		name: nodeCount > 400 ? 'grid' : 'cose',
		animate: false,
		randomize: false,
		nodeRepulsion: 9000,
		idealEdgeLength: 90,
		nestingFactor: 0.8,
		gravity: 0.35,
		numIter,
		fit: false
	});
	layout.run();

	if (mode !== 'compound') {
		// compound（囲い）は親子の入れ子を壊さないようスナップしない
		const spacing = resolveSpacing({ nodeSize: NODE_BASE_SIZE, labelWidth: 96, gap: 26 });
		const positions = cy.nodes().filter(n => !n.isParent()).map(n => ({ id: n.id(), ...n.position() }));
		for (const p of snapToHexLattice(positions, { spacing })) {
			cy.getElementById(p.id).position({ x: p.x, y: p.y });
		}
	}

	// 画面に収めることを優先しない。潰れる倍率になるなら fit せず等倍付近で出す
	const positions = cy.nodes().map(n => n.position());
	const bounds = boundsOf(positions, 60);
	const viewport = { width: container.clientWidth, height: container.clientHeight };
	const { fits } = shouldFitToViewport(bounds, viewport, 0.45);
	if (fits) {
		cy.fit(undefined, 32);
	} else {
		cy.zoom(0.75);
		cy.center();
	}

	applyFocusAndQuery();
	renderStats(counts, mode);
	renderBreadcrumb();
	renderEdgeKinds();
	renderAdjacency();
	renderIsolated();
	setOverlay('');
}

/** グラフのイベントを配線する */
function wireGraphEvents() {
	if (!cy) return;

	cy.on('tap', 'node', (evt) => {
		const d = evt.target.data();

		// 集約ノード → 1 段掘る
		if (d.kind === 'group') {
			state.drill = [...state.drill, d.value];
			state.focusKey = '';
			onViewChanged(true);
			return;
		}

		// 軸の中間ノード → その値で絞り込む
		if (d.kind === 'facet') {
			showGroupInspector(d.label, d.id);
			return;
		}

		// キャラクター → まずエゴネットワークを見せる（キャラシートへはその先）
		if (d.kind === 'node') {
			if (state.focusKey === d.nodeKey) return;
			state.focusKey = d.nodeKey;
			onViewChanged(true);
			showInspector(d.nodeKey);
		}
	});

	cy.on('tap', (evt) => {
		if (evt.target !== cy) return;
		if (state.focusKey) {
			state.focusKey = '';
			onViewChanged(true);
			hideInspector();
			return;
		}
		hideInspector();
		applyFocusAndQuery();
	});
}

/** フォーカスと検索の強調を反映する（非マッチは減光。消さない） */
function applyFocusAndQuery() {
	if (!cy) return;
	cy.elements().removeClass('dimmed highlighted');
	const q = state.query.trim().toLowerCase();
	if (!q) return;

	const hit = cy.nodes().filter(n =>
		String(n.data('label') || '').toLowerCase().includes(q)
		|| String(n.data('badge') || '').toLowerCase().includes(q));
	if (hit.length === 0) return;

	cy.elements().addClass('dimmed');
	hit.removeClass('dimmed').addClass('highlighted');
	hit.connectedEdges().removeClass('dimmed');
	hit.neighborhood().removeClass('dimmed');
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

/** @param {Object} counts @param {string} mode */
function renderStats(counts, mode) {
	const s = state.graph?.stats;
	if (!s) return;
	const modeLabel = {
		aggregate: '集約', compound: '囲い', bridge: '軸ノード', plain: '個体', ego: '関係先'
	}[mode] || '';
	const autoHidden = [...state.autoHiddenKinds].map(kindLabel).join('・');
	replaceChildren($('stats'), [
		`表示: ${counts.nodes} ノード / ${counts.edges} 本（${modeLabel}）`,
		` ・ 対象 ${counts.characters} キャラ`,
		autoHidden ? ` ・ 密度により自動で非表示: ${autoHidden}` : '',
		` ・ 全体 ${s.nodeCount} キャラ / ${s.edgeCount} 本`
	]);
}

/** パンくずを描く（作品 → 宣言された軸 → キャラ → 関係先） */
function renderBreadcrumb() {
	const levels = currentLevels();
	const items = [];

	items.push(el('button', {
		class: 'relmap__crumb ghost', type: 'button', text: 'すべての作品',
		onclick: () => { state.drill = []; state.focusKey = ''; onViewChanged(true); }
	}));

	state.drill.forEach((value, i) => {
		const level = levels[i];
		let label = value;
		if (level?.kind === 'work') label = workTitle(value);
		else if (value === UNSET_GROUP_KEY) label = '(未設定)';
		else if (value === OTHER_GROUP_KEY) label = 'その他';
		else if (level) {
			const pack = resolveFacetLabelPack(level, value);
			label = pickLang(pack?.jp, pack?.en) || value;
		}
		items.push(el('span', { class: 'relmap__crumb-sep', text: '›' }));
		items.push(el('button', {
			class: 'relmap__crumb ghost', type: 'button', text: label,
			onclick: () => { state.drill = state.drill.slice(0, i + 1); state.focusKey = ''; onViewChanged(true); }
		}));
	});

	// 次に掘れる段の名前をヒントとして出す
	const nextLevel = levels[state.drill.length];
	if (!state.focusKey && nextLevel) {
		items.push(el('span', { class: 'relmap__crumb-hint muted', text: `（次: ${pickLang(nextLevel.label_JP, nextLevel.label_EN)}）` }));
	}

	if (state.focusKey) {
		const n = (state.graph?.nodes || []).find(x => x.key === state.focusKey);
		items.push(el('span', { class: 'relmap__crumb-sep', text: '›' }));
		items.push(el('span', { class: 'relmap__crumb relmap__crumb--current', text: `${nodeLabel(n)} の関係先` }));
	}

	replaceChildren($('breadcrumb'), items);
}

/** @param {string} nodeKey */
function showInspector(nodeKey) {
	const node = (state.graph?.nodes || []).find(n => n.key === nodeKey);
	const body = $('inspector-body');
	const empty = $('inspector-empty');
	if (!node || !body) return;

	const rows = [
		el('h2', { class: 'relmap__inspector-title', text: nodeLabel(node) }),
		el('p', { class: 'relmap__inspector-sub muted' }, [
			el('span', { class: 'relmap__badge', text: node.badgeFull || node.badge || node.indexText }),
			` ${workTitle(node.workId)} / ${pickLang(node.dbLabel_JP, node.dbLabel_EN) || node.dbName}`
		]),
		el('a', {
			class: 'btn btn-primary relmap__inspector-open',
			href: `./characters.html${characterHref(node)}`,
			text: 'キャラシートを開く'
		})
	];

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
					if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
					ev.preventDefault();
					state.focusKey = r.node.key;
					onViewChanged(true);
					showInspector(r.node.key);
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

/** 軸の中間ノードを選んだときの説明 @param {string} label @param {string} id */
function showGroupInspector(label, id) {
	const body = $('inspector-body');
	const empty = $('inspector-empty');
	if (!body) return;
	replaceChildren(body, [
		el('h2', { class: 'relmap__inspector-title', text: label }),
		el('p', { class: 'muted', text: 'この軸につながっているキャラクターが線で結ばれています。' })
	]);
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
	const pairs = String(node.indexText || '').split(',').map(p => {
		const [k, ...rest] = p.split('=');
		return (k && rest.length) ? [k, rest.join('=')] : null;
	}).filter(Boolean);
	if (pairs.length === 0) return '';

	const single = pairs.length === 1;
	return buildViewerQueryString({
		work: node.workId,
		db: node.dbName,
		idx: single ? pairs[0][1] : JSON.stringify(Object.fromEntries(pairs)),
		idxKey: single ? pairs[0][0] : '__conditions__',
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
	for (const e of visibleEdges()) {
		const other = e.source === nodeKey ? e.target : (e.target === nodeKey ? e.source : null);
		if (!other) continue;
		const node = byKey.get(other);
		if (!node) continue;
		const meta = (e.source === nodeKey ? e.metaAToB : e.metaBToA) || e.metaAToB || e.metaBToA || {};
		out.push({
			node, kind: e.kind,
			labels: Array.isArray(meta.labels) ? meta.labels : [],
			comment: pickLang(meta.comment_JP, meta.comment_EN)
		});
	}
	return out;
}

/** テキスト版の隣接リスト（canvas を見られない場合の代替経路） */
function renderAdjacency() {
	const nodes = drilledNodes().filter(n => (n.degree || 0) > 0);
	const body = $('adjacency-body');
	if (!body) return;
	const summary = $('adjacency')?.querySelector('summary');
	if (summary) summary.textContent = `関係の一覧（テキスト・${nodes.length}）`;

	if (nodes.length === 0) {
		replaceChildren(body, [el('p', { class: 'muted', text: '現在の表示範囲に関係の登録されたキャラクターはいません。' })]);
		return;
	}

	replaceChildren(body, nodes.map(n => el('section', { class: 'relmap__adjacency-item' }, [
		el('h3', {}, [
			el('span', { class: 'relmap__badge', text: n.badgeFull || n.badge || '' }),
			' ',
			el('a', { href: `./characters.html${characterHref(n)}`, text: nodeLabel(n) })
		]),
		el('ul', {}, relatedOf(n.key).map(r => el('li', {}, [
			`${kindLabel(r.kind)}: `,
			el('a', { href: `./characters.html${characterHref(r.node)}`, text: nodeLabel(r.node) }),
			r.labels.length ? `（${r.labels.join(', ')}）` : ''
		])))
	])));
}

/** 関係が登録されていないキャラクターの一覧 */
function renderIsolated() {
	const nodes = drilledNodes().filter(n => (n.degree || 0) === 0);
	const body = $('isolated-body');
	if (!body) return;
	const summary = $('isolated')?.querySelector('summary');
	if (summary) summary.textContent = `関係が登録されていないキャラクター（${nodes.length}）`;

	if (nodes.length === 0) {
		replaceChildren(body, [el('p', { class: 'muted', text: '現在の表示範囲には該当がありません。' })]);
		return;
	}
	replaceChildren(body, [el('ul', { class: 'relmap__isolated-list' }, nodes.map(n => el('li', {}, [
		el('a', { href: `./characters.html${characterHref(n)}`, text: nodeLabel(n) }),
		el('span', { class: 'muted', text: ` — ${n.badgeFull || n.badge || ''}` })
	])))]);
}

/** データ診断パネル */
function renderDiagnostics() {
	const d = state.graph?.diagnostics;
	const body = $('diagnostics-body');
	if (!d || !body) return;

	const sections = [];
	const addList = (title, items, format) => {
		sections.push(el('h3', { class: 'relmap__diag-h3', text: `${title}（${items.length}）` }));
		if (items.length === 0) { sections.push(el('p', { class: 'muted', text: '該当なし' })); return; }
		sections.push(el('ul', {}, items.slice(0, 50).map(i => el('li', { text: format(i) }))));
		if (items.length > 50) sections.push(el('p', { class: 'muted', text: `…ほか ${items.length - 50} 件` }));
	};

	addList('参照先が見つからないリンク', d.unresolvedLinks,
		(i) => `${String(i.from || '').replace('#Works_', '')} の ${i.field} → ${shortWork(i.targetWork || '')}/${i.targetDb || ''} ${JSON.stringify(i.pairs || i.entry || {})}`);
	addList('参照先が一意に定まらないリンク', d.ambiguousLinks,
		(i) => `${String(i.from || '').replace('#Works_', '')} の ${i.field} → ${i.targetDb} ${JSON.stringify(i.pairs)}`);
	addList('キャラクターDBとして扱わなかったDB', d.skippedDbs,
		(i) => `${shortWork(i.workId)}/${i.dbName}（${i.recordCount} 件・layer=${i.layer || '-'}）`);
	addList('ノードキーが衝突したレコード', d.duplicatedNodes,
		(i) => `${shortWork(i.workId)}/${i.dbName} ${i.name || ''} → ${i.key}`);

	const ex = d.excluded || {};
	sections.push(el('h3', { class: 'relmap__diag-h3', text: '非公開として除外した件数' }));
	sections.push(el('p', { class: 'muted', text: `レコード ${ex.privateRecords || 0} / DB ${ex.hiddenDbs || 0} / 作品 ${ex.hiddenWorks || 0}` }));

	replaceChildren(body, sections);
}

/* ========================================================================
   コントロール
   ======================================================================== */

/** マップ選択（自作 / 共同二次創作）を描く */
function renderMapSelector() {
	const box = $('map-select');
	if (!box || !state.partition) return;

	const counts = { own: 0, shared: 0 };
	for (const n of (state.graph?.nodes || [])) counts[n.mapKind] = (counts[n.mapKind] || 0) + 1;

	const opts = [
		{ value: 'own', label: pickLang(state.partition.ownLabel_JP, state.partition.ownLabel_EN) },
		{ value: 'shared', label: pickLang(state.partition.sharedLabel_JP, state.partition.sharedLabel_EN) }
	];
	replaceChildren(box, opts.map(o => el('button', {
		class: `ghost relmap__preset${state.map === o.value ? ' is-active' : ''}`,
		type: 'button',
		text: `${o.label}（${counts[o.value] || 0}）`,
		onclick: () => {
			if (state.map === o.value) return;
			state.map = o.value;
			state.drill = [];
			state.focusKey = '';
			onViewChanged(true);
		}
	})));
}

/** グルーピング軸セレクタ（宣言から自動列挙） */
function renderGroupingSelector() {
	const box = $('select-grouping');
	if (!box) return;
	const usable = selectUsableFacets(state.facets, drilledNodes());

	// 選択中の軸が今のスコープで使えないなら「なし」へ戻す
	if (state.grouping && !usable.some(f => f.key === state.grouping)) state.grouping = '';

	/** @param {string} key @param {string} label @returns {HTMLElement} */
	const chip = (key, label) => {
		const active = state.grouping === key;
		const b = el('button', {
			type: 'button',
			class: `relmap__preset ghost${active ? ' is-active' : ''}`,
			'aria-pressed': active ? 'true' : 'false',
			text: label,
			onclick: () => {
				state.grouping = key;
				syncUrl(false);
				renderGroupingSelector();
				renderGraph();
			}
		});
		return b;
	};

	// 軸セレクタは `<select>` ではなく横並びのチップ行にする。
	// すぐ上のマップ選択（`relmap__presets`）と同じ語彙になり、
	// 「いま何の軸で束ねているか」が開かずに一覧できる（アークナイツのフィルタ行から取り込んだ形）。
	replaceChildren(box, [
		chip('', 'なし'),
		...usable.map(f => chip(f.key, `${pickLang(f.label_JP, f.label_EN)}（${f.stats.valueCount}）`))
	]);
}

/** エッジ種別の凡例＋トグル */
function renderEdgeKinds() {
	const box = $('edge-kinds');
	if (!box) return;
	const counts = state.graph?.stats?.edgesByKind || {};

	replaceChildren(box, Object.values(EDGE_KINDS).map(kind => {
		const auto = state.autoHiddenKinds.has(kind);
		const manual = state.hiddenKinds.has(kind);
		const id = `edge-kind-${kind}`;
		const input = el('input', {
			type: 'checkbox', id,
			onchange: (ev) => {
				if (ev.target.checked) state.hiddenKinds.delete(kind);
				else state.hiddenKinds.add(kind);
				syncUrl(false);
				renderGraph();
			}
		});
		input.checked = !manual;
		return el('label', { class: `relmap__legend-item${auto ? ' is-auto-hidden' : ''}`, for: id }, [
			input,
			el('span', {
				class: 'relmap__legend-swatch',
				style: `--swatch-color: ${palette().edge[EDGE_STYLE[kind].tone]}; --swatch-line: ${EDGE_STYLE[kind].line}`
			}),
			el('span', { text: kindLabel(kind) }),
			el('span', { class: 'muted', text: ` (${counts[kind] ?? 0})` }),
			auto ? el('span', { class: 'relmap__legend-auto', text: '自動で非表示中（密度）' }) : null
		]);
	}));
}

/** ビュー変更時の共通処理 @param {boolean} push */
function onViewChanged(push) {
	syncUrl(push);
	renderGroupingSelector();
	renderGraph();
}

/** コントロールのイベントを配線する */
function wireControls() {
	// グルーピング軸はチップ行なので、各ボタンの onclick を renderGroupingSelector() が配線する

	$('chk-secondary')?.addEventListener('change', (ev) => {
		state.includeSecondary = ev.target.checked;
		state.focusKey = '';
		onViewChanged(false);
	});

	$('chk-merge-same')?.addEventListener('change', (ev) => {
		state.mergeSameBeing = ev.target.checked;
		renderGraph();
	});

	$('chk-thumbs')?.addEventListener('change', (ev) => {
		state.showThumbs = ev.target.checked;
		syncUrl(false);
		renderGraph();
	});

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

	$('btn-refit')?.addEventListener('click', () => cy?.fit(undefined, 32));
	$('btn-relayout')?.addEventListener('click', () => renderGraph());
	$('btn-back')?.addEventListener('click', () => {
		if (state.focusKey) state.focusKey = '';
		else if (state.drill.length) state.drill = state.drill.slice(0, -1);
		onViewChanged(true);
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

	window.addEventListener('popstate', () => {
		readStateFromUrl();
		applyLangToUi();
		renderGraph();
	});
}

/** 言語トグルの見た目と静的文言 */
function applyLangToUi() {
	const btn = $('btn-lang-toggle');
	if (btn) {
		btn.dataset.lang = state.lang;
		btn.title = state.lang === 'en' ? '表示言語を日本語へ切り替え' : '表示言語を英語へ切り替え';
	}
	renderMapSelector();
	renderGroupingSelector();
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
	Object.assign(state, {
		works: payload.works,
		globalTypeDef: payload.globalTypeDef,
		globalMeta: payload.globalMeta,
		workTypeDefs: payload.workTypeDefs,
		varsDefByWork: payload.varsDefByWork
	});

	state.facets = collectFacets(payload.globalTypeDef, payload.workTypeDefs);
	state.partition = collectMapPartition(payload.globalTypeDef, payload.workTypeDefs);

	state.graph = buildGraph({
		works: payload.works,
		globalTypeDef: payload.globalTypeDef,
		workTypeDefs: payload.workTypeDefs,
		options: {
			lang: state.lang,
			// 資料系（References）・翻訳（Localization）レイヤーはキャラクターではないので除外する
			dbFilter: (_workId, _dbName, dbEntry) => {
				const layer = String(dbEntry?.layer || '').trim();
				return !layer || layer === CHARACTER_DB_LAYER;
			}
		}
	});

	decorateNodes();

	renderMapSelector();
	renderGroupingSelector();
	renderEdgeKinds();
	renderDiagnostics();
	applyLangToUi();
	wireControls();

	const chkSec = $('chk-secondary');
	if (chkSec) chkSec.checked = state.includeSecondary;
	const chkThumb = $('chk-thumbs');
	if (chkThumb) chkThumb.checked = state.showThumbs;
	const searchInput = $('search-input');
	if (searchInput) searchInput.value = state.query;

	await renderGraph();
	if (state.focusKey) showInspector(state.focusKey);
}

/**
 * ノードへバッジ・マップ種別・サムネイル・辞書引き関数を付ける
 *
 * @description `graph-model.js` は宣言の解決を知らないので、ここで宣言由来の情報を足す。
 */
function decorateNodes() {
	const partitionLookupCache = new Map();

	for (const n of (state.graph?.nodes || [])) {
		const typeDef = state.workTypeDefs[n.workId] || {};
		// DB スコープ済みの `$IndexDef` を引き当てる（`$IndexDef_<Db>` の上書きに対応）
		const suffix = String(n.dbName || '').replace(/^#(DB|Ref|Loc)_/, '');
		const cap = suffix ? suffix.charAt(0).toUpperCase() + suffix.slice(1) : '';
		const indexDef = (cap && typeDef[`$IndexDef_${cap}`]) || typeDef.$IndexDef || null;

		const lookup = dictLookupFor(n.workId, indexDef);
		const { badge, full } = buildBadge({
			pairs: n.pairs, indexDef,
			worksCode: getWorksCode(state.globalMeta, n.workId),
			lookupDictCell: lookup,
			// `$badge` がインデックス以外のフィールド（NumberTales の `Num_Badge` 等）を
			// 参照できるようレコードも渡す
			record: n.record
		});
		n.badge = badge;
		n.badgeFull = full;
		n._relmapLookup = lookup;
		if (n.record) n.record._relmapWorkId = n.workId;

		// マップ分割（自作 / 共同二次創作）。辞書は作品をまたいで共通なのでキャッシュする
		if (state.partition) {
			if (!partitionLookupCache.has(n.workId)) {
				partitionLookupCache.set(n.workId, createDictCellLookup(
					state.varsDefByWork[n.workId] || {},
					{ $type: [{ hashTag: state.partition.field, $dict: state.partition.dict }] }
				));
			}
			n.mapKind = classifyMapPartition(n.record, state.partition, partitionLookupCache.get(n.workId));
		} else {
			n.mapKind = 'own';
		}

		// サムネイル（enrich が絶対パスで返す）
		n.thumb = n.record?._enrichment?.primaryImage || '';
	}
}

/**
 * 復帰不能なエラーを画面に出す
 * @param {string} title @param {any} err
 */
function showFatal(title, err) {
	// 画面へ出す前にスタックをコンソールへ残す。
	// `main().catch()` で握ると pageerror が飛ばず、原因の追跡先が無くなるため
	console.error('❌ 相関図の致命的エラー:', title, err);
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
if (!globalThis.__RELATIONS_TEST_MODE__) {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => { main().catch(err => showFatal('初期化エラー', err)); });
	} else {
		main().catch(err => showFatal('初期化エラー', err));
	}
}

// テスト用フック
export {
	state as __relationsStateForTest,
	buildStateQuery as __buildStateQueryForTest,
	readStateFromUrl as __readStateFromUrlForTest,
	characterHref as __characterHrefForTest,
	isSecondaryDbName as __isSecondaryDbNameForTest
};
