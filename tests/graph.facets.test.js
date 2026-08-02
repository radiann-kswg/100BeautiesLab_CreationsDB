/**
 * lib/graph/graph-facets.js（相関図のグルーピング軸）の単体テスト
 *
 * 守りたい性質:
 * 1. **宣言駆動** — 軸は `$display.facet` 宣言からのみ集める。field 名で分岐しない
 * 2. **形の違いを吸収** — `Belonging[]`（object 配列）/ `Class[]`（文字列配列）/
 *    `FromArea`（単一 object）/ `Progress`（スカラー）を同じ経路で扱う
 * 3. **多値を落とさない** — 1 キャラが複数グループに属せること（`Belonging` 最大 3 / `Class` 最大 5）
 * 4. **`maxGroups` の丸め** — `Class` の 148 種を上位 N ＋「その他」へ畳む
 * 5. **`hideText` を値にしない** — 意図的マスクはグループを作らない
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import {
	collectFacets,
	extractFacetValues,
	resolveFacetLabel,
	groupNodesByFacet,
	selectUsableFacets,
	UNSET_GROUP_KEY,
	OTHER_GROUP_KEY
} from '../lib/graph/graph-facets.js';

const repoRoot = process.cwd();
const readJson = (p) => JSON.parse(readFileSync(path.resolve(repoRoot, p), 'utf-8'));

const FACET_BELONGING = { key: 'Belonging', path: 'Faction', maxGroups: 12 };
const FACET_CLASS = { key: 'Class', path: '', maxGroups: 12 };
const FACET_AREA = { key: 'FromArea', path: 'Area', maxGroups: 12 };

describe('collectFacets', () => {
	const globalTypeDef = {
		$DefType: [
			{ hashTag: 'Belonging', $dict: 'Faction', hashTag_JP: '所属', $display: { facet: { path: 'Faction', order: 10 } } },
			{ hashTag: 'Class', $dict: 'Class', hashTag_JP: 'クラス名', $display: { facet: { order: 30, maxGroups: 5 } } },
			{ hashTag: 'Name_JP', $display: { section: 'basic' } },
			{ $slot: '#Index', $slotMatch: { $type: '#Index' } }
		],
		$MetaType: {
			$Def_SecondaryMeta: [{ hashTag: 'sec_Category', hashTag_JP: '二次創作分類', $display: { facet: { order: 90 } } }]
		}
	};

	it('`$display.facet` を持つフィールドだけを集める', () => {
		const facets = collectFacets(globalTypeDef);
		expect(facets.map(f => f.key)).toEqual(['Belonging', 'Class', 'sec_Category']);
	});

	it('`order` の昇順に並ぶ', () => {
		expect(collectFacets(globalTypeDef).map(f => f.order)).toEqual([10, 30, 90]);
	});

	it('`path` / `maxGroups` / ラベルを宣言から取る', () => {
		const [belonging, cls] = collectFacets(globalTypeDef);
		expect(belonging.path).toBe('Faction');
		expect(belonging.label_JP).toBe('所属');
		expect(belonging.maxGroups).toBe(12);
		expect(cls.path).toBe('');
		expect(cls.maxGroups).toBe(5);
	});

	it('`$MetaType` 配下（`$slotExpand` で展開されるもの）も拾う', () => {
		expect(collectFacets(globalTypeDef).some(f => f.key === 'sec_Category')).toBe(true);
	});

	it('作品別 typedef の宣言も拾い、グローバル宣言を上書きしない', () => {
		const workTypeDefs = {
			'#Works_X': {
				$DefType: [
					{ hashTag: 'Belonging', $display: { facet: { order: 999 } } },
					{ hashTag: 'Branch', hashTag_JP: '岐路(ブランチ)', $display: { facet: { order: 5 } } }
				]
			}
		};
		const facets = collectFacets(globalTypeDef, workTypeDefs);
		expect(facets.find(f => f.key === 'Belonging').order).toBe(10); // グローバル優先
		expect(facets[0].key).toBe('Branch');                            // 宣言だけで軸が増える
	});

	it('宣言が無ければ空配列', () => {
		expect(collectFacets({ $DefType: [{ hashTag: 'X' }] })).toEqual([]);
		expect(collectFacets(null)).toEqual([]);
	});
});

describe('extractFacetValues', () => {
	it('object 配列から `path` の子要素を取る（Belonging）', () => {
		const rec = { Belonging: [{ Faction: '百花繚乱研究所' }, { Faction: '夜月機関' }] };
		expect(extractFacetValues(rec, FACET_BELONGING)).toEqual(['百花繚乱研究所', '夜月機関']);
	});

	it('文字列配列はそのまま（Class）', () => {
		expect(extractFacetValues({ Class: ['1桁番(ユニデジッツ)', '試験用個体'] }, FACET_CLASS))
			.toEqual(['1桁番(ユニデジッツ)', '試験用個体']);
	});

	it('単一 object から `path` を取る（FromArea）', () => {
		expect(extractFacetValues({ FromArea: { Area: '九蓮国', BaseAreaAbout_JP: '自称' } }, FACET_AREA))
			.toEqual(['九蓮国']);
	});

	it('スカラーはそのまま（Progress）', () => {
		expect(extractFacetValues({ Progress: 'released' }, { key: 'Progress', path: '' })).toEqual(['released']);
	});

	it('`#DictIndex_withAbout` 形式は value を取る', () => {
		expect(extractFacetValues({ RaceType: { value: 'Human', about_JP: '補足' } }, { key: 'RaceType', path: '' }))
			.toEqual(['Human']);
	});

	it('`hideText` は値にしない（意図的マスクを尊重する）', () => {
		expect(extractFacetValues({ Belonging: { hideText: '削除済み' } }, FACET_BELONGING)).toEqual([]);
		expect(extractFacetValues({ Class: [{ hideText: '？？？' }] }, FACET_CLASS)).toEqual([]);
	});

	it('重複を除く', () => {
		expect(extractFacetValues({ Class: ['A', 'A', 'B'] }, FACET_CLASS)).toEqual(['A', 'B']);
	});

	it('値が無ければ空配列', () => {
		expect(extractFacetValues({}, FACET_BELONGING)).toEqual([]);
		expect(extractFacetValues({ Belonging: [] }, FACET_BELONGING)).toEqual([]);
		expect(extractFacetValues({ Belonging: null }, FACET_BELONGING)).toEqual([]);
		expect(extractFacetValues(null, FACET_BELONGING)).toEqual([]);
	});
});

describe('resolveFacetLabel', () => {
	it('辞書引き関数があればそれを使う', () => {
		const resolveLabel = () => ({ jp: '百花繚乱研究所', en: 'HundredBeauties Laboratory' });
		expect(resolveFacetLabel(FACET_BELONGING, 'x', { resolveLabel }))
			.toEqual({ jp: '百花繚乱研究所', en: 'HundredBeauties Laboratory' });
	});

	it('辞書引きが空なら生値へフォールバック', () => {
		expect(resolveFacetLabel(FACET_BELONGING, '夜月機関', { resolveLabel: () => null }))
			.toEqual({ jp: '夜月機関', en: '夜月機関' });
	});

	it('EN が無ければ JP で埋める', () => {
		expect(resolveFacetLabel(FACET_BELONGING, 'x', { resolveLabel: () => ({ jp: '和名' }) }).en).toBe('和名');
	});

	it('空値は (未設定)', () => {
		expect(resolveFacetLabel(FACET_BELONGING, '').jp).toBe('(未設定)');
	});
});

describe('groupNodesByFacet', () => {
	const nodes = [
		{ key: 'a', record: { Belonging: [{ Faction: 'X' }] } },
		{ key: 'b', record: { Belonging: [{ Faction: 'X' }, { Faction: 'Y' }] } },
		{ key: 'c', record: { Belonging: [{ Faction: 'Y' }] } },
		{ key: 'd', record: {} }
	];

	it('値ごとにノードを束ね、件数の多い順に並べる', () => {
		const { groups } = groupNodesByFacet(nodes, FACET_BELONGING, { includeUnset: false });
		expect(groups.map(g => g.value)).toEqual(['X', 'Y']);
		expect(groups[0].members).toEqual(['a', 'b']);
	});

	it('多値ノードは複数グループへ属する（情報を落とさない）', () => {
		const { groups, byNode, multiValued } = groupNodesByFacet(nodes, FACET_BELONGING, { includeUnset: false });
		expect(multiValued).toBe(true);
		expect(byNode.get('b')).toEqual(['X', 'Y']);
		expect(groups.find(g => g.value === 'X').members).toContain('b');
		expect(groups.find(g => g.value === 'Y').members).toContain('b');
	});

	it('値が無いノードは (未設定) グループへ入り、末尾に置かれる', () => {
		const { groups } = groupNodesByFacet(nodes, FACET_BELONGING);
		expect(groups[groups.length - 1].value).toBe(UNSET_GROUP_KEY);
		expect(groups[groups.length - 1].members).toEqual(['d']);
	});

	it('`includeUnset: false` なら (未設定) を作らない', () => {
		const { groups } = groupNodesByFacet(nodes, FACET_BELONGING, { includeUnset: false });
		expect(groups.some(g => g.value === UNSET_GROUP_KEY)).toBe(false);
	});

	it('`maxGroups` を超えたら「その他」へ丸める', () => {
		const many = Array.from({ length: 20 }, (_, i) => ({ key: `n${i}`, record: { Class: [`C${i}`] } }));
		const { groups } = groupNodesByFacet(many, { ...FACET_CLASS, maxGroups: 5 }, { includeUnset: false });
		expect(groups).toHaveLength(6); // 上位 5 + その他
		const other = groups[groups.length - 1];
		expect(other.value).toBe(OTHER_GROUP_KEY);
		expect(other.rolledUp).toBe(true);
		expect(other.members).toHaveLength(15);
	});

	it('丸めた「その他」でノードが重複しない', () => {
		const many = [
			{ key: 'p', record: { Class: ['A', 'B'] } },
			{ key: 'q', record: { Class: ['A'] } },
			{ key: 'r', record: { Class: ['B'] } }
		];
		const { groups } = groupNodesByFacet(many, { ...FACET_CLASS, maxGroups: 1 }, { includeUnset: false });
		const other = groups.find(g => g.value === OTHER_GROUP_KEY);
		expect(new Set(other.members).size).toBe(other.members.length);
	});

	it('統計を返す（多値判定と被覆率）', () => {
		const { stats } = groupNodesByFacet(nodes, FACET_BELONGING);
		expect(stats.nodeCount).toBe(4);
		expect(stats.valueCount).toBe(2);
		expect(stats.multiValuedNodes).toBe(1);
		expect(stats.unsetNodes).toBe(1);
		expect(stats.coverage).toBeCloseTo(0.75);
	});

	it('空入力でも落ちない', () => {
		const { groups, stats } = groupNodesByFacet([], FACET_BELONGING);
		expect(groups).toEqual([]);
		expect(stats.coverage).toBe(0);
	});
});

describe('selectUsableFacets', () => {
	const facets = [
		{ key: 'Good', path: '', maxGroups: 12 },
		{ key: 'OneValue', path: '', maxGroups: 12 },
		{ key: 'Rare', path: '', maxGroups: 12 }
	];
	const nodes = Array.from({ length: 100 }, (_, i) => ({
		key: `n${i}`,
		record: {
			Good: i % 2 === 0 ? 'A' : 'B',
			OneValue: 'same',                 // 値が 1 種しかない → 図が変わらない
			...(i < 2 ? { Rare: `R${i}` } : {}) // 被覆率 2% → 低すぎる
		}
	}));

	it('値が 1 種しかない軸を落とす', () => {
		expect(selectUsableFacets(facets, nodes).some(f => f.key === 'OneValue')).toBe(false);
	});

	it('被覆率が低すぎる軸を落とす', () => {
		expect(selectUsableFacets(facets, nodes).some(f => f.key === 'Rare')).toBe(false);
	});

	it('使える軸には stats が付く', () => {
		const good = selectUsableFacets(facets, nodes).find(f => f.key === 'Good');
		expect(good.stats.valueCount).toBe(2);
		expect(good.stats.coverage).toBe(1);
	});

	it('しきい値を上書きできる', () => {
		expect(selectUsableFacets(facets, nodes, { minCoverage: 0.01 }).some(f => f.key === 'Rare')).toBe(true);
	});
});

describe('実データ不変条件', () => {
	const globalTypeDef = readJson('data/db_type.json');
	const workTypeDefs = {};
	for (const p of globSync('data/Works_*/DataBases/db_type.json', { cwd: repoRoot })) {
		const workDir = p.split(/[/\\]/)[1];
		workTypeDefs[`#Works_${workDir.replace('Works_', '')}`] = readJson(p);
	}
	const facets = collectFacets(globalTypeDef, workTypeDefs);

	it('6 つの軸が宣言されている', () => {
		expect(facets.map(f => f.key)).toEqual([
			'Belonging', 'FromArea', 'Class', 'Progress', 'RaceType', 'GenderType'
		]);
	});

	it('構造型の軸には `path` が宣言されている（コード側で子要素名を決め打ちしないため）', () => {
		expect(facets.find(f => f.key === 'Belonging').path).toBe('Faction');
		expect(facets.find(f => f.key === 'FromArea').path).toBe('Area');
	});

	it('`Class` は値の種類が多いので `maxGroups` が宣言されている', () => {
		expect(facets.find(f => f.key === 'Class').maxGroups).toBeLessThanOrEqual(12);
	});

	it('生レコードでも各軸が値を取り出せる（宣言と実データの形が合っている）', () => {
		const nodes = [];
		for (const p of globSync('data/Works_*/DataBases/db_*.json', { cwd: repoRoot })) {
			const base = path.basename(p);
			if (/^db_(meta|type)\.json$/.test(base)) continue;
			let recs;
			try { recs = readJson(p); } catch { continue; }
			if (!Array.isArray(recs)) continue;
			recs.forEach((r, i) => nodes.push({ key: `${p}|${i}`, record: r }));
		}
		expect(nodes.length).toBeGreaterThan(1000);

		const dead = [];
		for (const f of facets) {
			const { stats } = groupNodesByFacet(nodes, f, { includeUnset: false });
			// 生レコード（_Commons 未適用）でも 1 件以上は値が取れるはず。
			// 0 なら宣言の `path` が実データの形と食い違っている
			if (stats.valueCount === 0) dead.push(f.key);
		}
		expect(dead, `実データから値を 1 件も取り出せない軸: ${dead.join(', ')}`).toEqual([]);
	});
});
