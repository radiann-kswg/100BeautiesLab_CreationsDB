/**
 * lib/section-renders/relation.js の回帰テスト
 *
 * オブジェクト型 Index（`Letter: { Alphabet, AlphaGen }` のような複合インデックス）を持つ作品で、
 * Relation の参照先が**サブフィールド 1 つだけ**で照合されていた不具合の回帰テスト。
 *
 * 旧挙動では `pickPrimaryIndexSubDef()` が `#Number` 型を最優先で選ぶため `AlphaGen` だけが
 * 識別子になり、「A の第2世代」を指したつもりが「最初に見つかった第2世代の誰か」へ飛んでいた。
 * 現在は `collectIndexEntries()` + `buildIndexIdentifier()` を通して複合条件
 * （`__conditions__` + JSON）へ正規化し、`recordMatchesIndexQuery()` の subset match で解決する。
 *
 * スカラー Index（NumberTales の `Num`）は従来どおり単一キーのままであることも併せて確認する。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = dirname(dirname(__filename));

function loadJson(relPath) {
	return JSON.parse(readFileSync(join(repoRoot, relPath), 'utf-8'));
}

let charactersModule;
let dom;

/** 実データの `$IndexDef` をそのまま使う（typedef 追従を壊したら落ちるようにする） */
const UNIBYTE_INDEX_DEF = loadJson('data/Works_UnibyteLive/DataBases/db_type.json').$IndexDef;
const NUMBERTALES_INDEX_DEF = loadJson('data/Works_NumberTales/DataBases/db_type.json').$IndexDef;

beforeAll(async () => {
	dom = new JSDOM('<!DOCTYPE html><html lang="ja"><body></body></html>', {
		url: 'http://127.0.0.1:5500/pages/characters.html'
	});
	globalThis.window = dom.window;
	globalThis.document = dom.window.document;
	globalThis.location = dom.window.location;
	globalThis.history = dom.window.history;
	globalThis.Node = dom.window.Node;
	globalThis.HTMLElement = dom.window.HTMLElement;
	globalThis.Event = dom.window.Event;
	globalThis.CustomEvent = dom.window.CustomEvent;
	globalThis.DOMParser = dom.window.DOMParser;
	globalThis.sessionStorage = dom.window.sessionStorage;
	globalThis.localStorage = dom.window.localStorage;
	globalThis.URL = dom.window.URL;
	globalThis.URLSearchParams = dom.window.URLSearchParams;
	Object.defineProperty(globalThis, 'navigator', {
		value: dom.window.navigator,
		configurable: true,
		writable: true
	});
	globalThis.fetch = async () => {
		throw new Error('Unexpected fetch in section-renders.relation.test.js');
	};

	const ts = Date.now();
	await import(`${pathToFileURL(join(repoRoot, 'lib/section-wrapper-common.js')).href}?relation-section-test=${ts}`);
	await import(`${pathToFileURL(join(repoRoot, 'lib/section-renders/relation.js')).href}?relation-section-test=${ts}`);
	charactersModule = await import(pathToFileURL(join(repoRoot, 'pages', 'characters.js')).href);
});

afterAll(() => {
	dom?.window?.close();
});

/** 仮想 DOM ノード（section renderer は helpers.createElement 経由でしか DOM に触らない） */
function el(tag, props = {}, children = []) {
	return { tag, props: props || {}, children: Array.isArray(children) ? children : [children] };
}

/** ノードツリーから最初の `<a>` を取り出す */
function findAnchors(node, out = []) {
	if (!node || typeof node !== 'object') return out;
	if (Array.isArray(node)) {
		node.forEach((child) => findAnchors(child, out));
		return out;
	}
	if (node.tag === 'a') out.push(node);
	findAnchors(node.children, out);
	return out;
}

/** ノードツリーの文字列子要素を連結する */
function textOf(node) {
	if (node === null || node === undefined) return '';
	if (typeof node === 'string') return node;
	if (Array.isArray(node)) return node.map(textOf).join('');
	if (typeof node === 'object') return textOf(node.children);
	return String(node);
}

/**
 * main code（pages/characters.js）が section renderer へ渡している relationApi を再現する
 * Index 系ヘルパーは characters.js の実装をそのまま bridge し、DOM/遷移まわりだけスタブする。
 */
function makeRelationApi({ indexDef, records, workId, db, fetchDbRecords = null }) {
	return {
		createElement: el,
		createDetailTagGrid: (children) => el('div', { class: 'detail-tag-grid' }, children.filter(Boolean)),
		formatValueForDisplay: (value) => (value === null || value === undefined ? '' : String(value)),
		dialogueBodyText: (text) => el('div', { class: 'dialogue' }, [text]),
		getFieldLabel: (_key, _labelMap, _workMeta, _globalDefType, fallback) => fallback,
		resolveVarsDefLabelPack: () => null,
		formatBilingualLabel: (_pack, raw) => raw,
		getWorkIndexField: () => indexDef,
		getIndexSubDefs: (def) => (Array.isArray(def?.$type) ? def.$type : null),
		pickPrimaryIndexSubDef: (subDefs) => {
			const score = (d) => {
				const t = typeof d?.$type === 'string' ? d.$type : JSON.stringify(d?.$type ?? '');
				if (t.includes('#Number')) return 30;
				if (t.includes('#IndexListKey')) return 20;
				return 0;
			};
			return subDefs.slice().sort((a, b) => score(b) - score(a))[0] || null;
		},
		collectIndexEntries: charactersModule.__collectIndexEntriesForTest,
		buildIndexIdentifier: charactersModule.__buildIndexIdentifierForTest,
		recordMatchesIndexQuery: charactersModule.__recordMatchesIndexQueryForTest,
		buildViewerNavigationHref: (wId, dbName, options = {}) => `/pages/characters.html${charactersModule.__buildViewerQueryStringForTest({
			work: wId,
			db: dbName,
			idx: String(options.idx || ''),
			idxKey: String(options.idxKey || ''),
			q: '',
			num: ''
		})}`,
		openDetail: async () => { },
		openViewerNavigation: async () => { },
		getCharState: () => ({ workId, db, records, pageLang: 'jp' }),
		getWorkTitle: () => '',
		...(fetchDbRecords ? { fetchDbRecords } : {})
	};
}

/** relationSection を呼び出して描画結果（仮想ノード）を得る */
function renderRelation({ containerKey, value, relationApi }) {
	return globalThis.CharacterSectionRendererRegistry.renderNamedSectionRenderer(
		'relationSection',
		{ key: containerKey, value },
		{
			containerKey,
			wrapInSection: false,
			fieldLabelMap: {},
			workMeta: null,
			globalDefType: null,
			fieldDisplayMap: {},
			fieldTypeMap: {},
			helpers: { relationApi }
		}
	);
}

describe('relationSection: オブジェクト型 Index の参照解決', () => {
	// 「A の第1世代」より先に「I の第2世代」を置く。AlphaGen だけで照合する旧挙動なら
	// 先頭の I:第2世代へ誤爆し、複合条件で照合できていれば A:第2世代へ解決される。
	const records = [
		{ Letter: { Alphabet: 'I', AlphaGen: 2 }, Name_JP: 'I:第2世代' },
		{ Letter: { Alphabet: 'A', AlphaGen: 1 }, Name_JP: 'A:初代' },
		{ Letter: { Alphabet: 'A', AlphaGen: 2 }, Name_JP: 'A:第2世代' }
	];

	const relationApi = () => makeRelationApi({
		indexDef: UNIBYTE_INDEX_DEF,
		records,
		workId: '#Works_UnibyteLive',
		db: 'Primary'
	});

	it('Alphabet と AlphaGen の両方を条件にして参照先を一意に解決する', () => {
		const result = renderRelation({
			containerKey: 'Relation',
			value: { Related: [{ Letter: { Alphabet: 'A', AlphaGen: 2 }, RelationLabel: ['successor'] }] },
			relationApi: relationApi()
		});

		const anchors = findAnchors(result);
		expect(anchors).toHaveLength(1);
		expect(textOf(anchors[0])).toBe('A:第2世代');
		expect(anchors[0].props.title).toBe('開く: A:第2世代');
	});

	it('直リンクを複合条件（カテゴリキー + 世代）の圧縮ロケータで生成する', () => {
		const result = renderRelation({
			containerKey: 'Relation',
			value: { Related: [{ Letter: { Alphabet: 'A', AlphaGen: 2 } }] },
			relationApi: relationApi()
		});

		const anchors = findAnchors(result);
		expect(anchors[0].props.href).toBe('/pages/characters.html?c=UnibyteLive/Primary/Alphabet:A,AlphaGen:2');
	});

	it('同じ Alphabet の別世代はそれぞれ別レコードへ解決される', () => {
		const result = renderRelation({
			containerKey: 'Relation',
			value: {
				Related: [{ Letter: { Alphabet: 'A', AlphaGen: 1 } }],
				Commented: [{ Letter: { Alphabet: 'A', AlphaGen: 2 } }]
			},
			relationApi: relationApi()
		});

		const anchors = findAnchors(result);
		expect(anchors.map(textOf)).toEqual(['A:初代', 'A:第2世代']);
	});

	it('カテゴリキーだけのエントリは単一キーの直リンクになる', () => {
		const result = renderRelation({
			containerKey: 'Relation',
			value: { Related: [{ Letter: { Alphabet: 'I' } }] },
			relationApi: relationApi()
		});

		const anchors = findAnchors(result);
		expect(anchors[0].props.href).toBe('/pages/characters.html?c=UnibyteLive/Primary/Letter.Alphabet:I');
	});

	it('参照先が見つからないときも JSON ペイロードを画面へ出さない', () => {
		const result = renderRelation({
			containerKey: 'Relation',
			value: { Related: [{ Letter: { Alphabet: 'Z', AlphaGen: 9 } }] },
			relationApi: relationApi()
		});

		expect(findAnchors(result)).toHaveLength(0);
		const rendered = textOf(result);
		expect(rendered).not.toContain('{');
		expect(rendered).toContain('Z9');
	});
});

describe('relationSection: クロスDB 参照（RelationTo_*）', () => {
	it('ハイドレーション前のプレースホルダにも JSON ペイロードを出さない', () => {
		const relationApi = makeRelationApi({
			indexDef: UNIBYTE_INDEX_DEF,
			records: [],
			workId: '#Works_UnibyteLive',
			db: 'Primary',
			fetchDbRecords: async () => ({ records: [] })
		});

		const result = renderRelation({
			containerKey: 'RelationTo_PrimaryPerformer',
			value: { Related: [{ Letter: { Alphabet: 'T', AlphaGen: 2 } }] },
			relationApi
		});

		const anchors = findAnchors(result);
		expect(anchors).toHaveLength(1);
		expect(textOf(anchors[0])).toBe('T2');
		expect(anchors[0].props.href).toBe('/pages/characters.html?c=UnibyteLive/PrimaryPerformer/Alphabet:T,AlphaGen:2');
	});
});

describe('relationSection: スカラー Index（回帰確認）', () => {
	it('NumberTales の Num は従来どおり単一キーで解決される', () => {
		const records = [
			{ Num: 1, Name_JP: 'ワン' },
			{ Num: 57, Name_JP: 'コハル' }
		];
		const relationApi = makeRelationApi({
			indexDef: NUMBERTALES_INDEX_DEF,
			records,
			workId: '#Works_NumberTales',
			db: 'Primary'
		});

		const result = renderRelation({
			containerKey: 'Relation',
			value: { Related: [{ Num: 57 }] },
			relationApi
		});

		const anchors = findAnchors(result);
		expect(textOf(anchors[0])).toBe('コハル');
		expect(anchors[0].props.href).toBe('/pages/characters.html?c=NumberTales/Primary/Num:57');
	});
});
