/**
 * [faction.render.test.js] - `$Def_Faction`（所属）の描画・参照解決テスト
 *
 * - `lib/basic-renders/faction.js` の basicFields 用整形（所属先（活動地域））
 * - `lib/basic-renders/type-common.js` の `resolveDictRow()` と scopeField 照合
 * - `lib/data-common.js` の `_enrichment.dictRefs`（`$dictRef` 駆動の参照解決）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import '../lib/wrapper-common.js';
import '../lib/basic-renders/type-common.js';
import '../lib/basic-renders/def-object-common.js';
import '../lib/basic-renders/faction.js';
import '../lib/basic-renders/baseArea.js';
import '../lib/data-common.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (relPath) => JSON.parse(readFileSync(join(repoRoot, relPath), 'utf8'));

const globalMeta = load('data/db_meta.json');
const globalType = load('data/db_type.json');
const factionDict = load('data/Dictionaries/dict_Faction.json');
const areaDict = load('data/Dictionaries/dict_Area.json');

/** SW の readGlobalMeta() 相当（辞書 DB を General.$VarsDef へ合流した形） */
const metaForLookup = {
	...globalMeta,
	General: {
		...globalMeta.General,
		$VarsDef: {
			...globalMeta.General.$VarsDef,
			'#Dict_Faction': factionDict,
			'#Dict_Area': areaDict
		}
	}
};

const belongingType = globalType.$DefType.find((entry) => entry?.hashTag === 'Belonging')?.$type;
const registry = globalThis.CharacterValueWrapperRegistry;

/**
 * basicFields 相当の整形を行う（UI の formatValueForDisplay から wrapper へ渡す context を再現）
 * @param {any} value
 * @param {string} pageLang
 * @returns {string}
 */
const formatBelonging = (value, pageLang = 'jp') => registry.formatWithRegisteredWrapper(value, {
	schemaType: belongingType,
	fieldKey: 'Belonging',
	workMeta: metaForLookup,
	globalDefType: globalType,
	pageLang,
	typeSources: [globalType]
});

describe('belonging renderer ($Def_Faction)', () => {
	it('renders faction label with the FactionsBaseArea resolved from the faction dictionary', () => {
		expect(formatBelonging({ Faction: '百花繚乱研究所' })).toBe('百花繚乱研究所（九蓮国）');
	});

	// 補足を持つ辞書行を対象にする。'管理主' は 9938762「DB推敲(辞書解説周り)」で
	// BaseAreaAbout_JP/_EN が削除されたため、補足が残っている 'デウスマキナ' へ差し替えた。
	it('appends the area supplement declared on the dictionary row', () => {
		expect(formatBelonging({ Faction: 'デウスマキナ' }))
			.toBe('デウスマキナ（紅雪連邦／名義上の所在地）');
	});

	it('renders english labels when the page language is en', () => {
		expect(formatBelonging({ Faction: '百花繚乱研究所' }, 'en'))
			.toBe('HundredBeauties Laboratory (LotusNinea)');
	});

	it('renders one line per element for array values ($display.arrayLayout: multiline)', () => {
		const text = formatBelonging([{ Faction: '百花繚乱研究所' }, { Faction: '界座' }]);
		expect(text.split('\n')).toEqual(['百花繚乱研究所（九蓮国）', '界座（龍天国）']);
	});

	it('accepts the legacy string shorthand declared by $shorthand', () => {
		expect(formatBelonging('百花繚乱研究所')).toBe('百花繚乱研究所（九蓮国）');
	});

	it('prefers a record-side FactionsBaseArea over the dictionary row', () => {
		const text = formatBelonging({
			Faction: '百花繚乱研究所',
			FactionsBaseArea: { Area: '英皇国', BaseAreaAbout_JP: '出張所' }
		});
		expect(text).toBe('百花繚乱研究所（英皇国／出張所）');
	});

	it('falls back to the raw code when the faction is not in the dictionary', () => {
		expect(formatBelonging({ Faction: '未登録の陣営' })).toBe('未登録の陣営');
	});

	it('leaves masked values ({ hideText }) to the caller', () => {
		expect(formatBelonging({ hideText: '削除済み' })).toBe('');
	});
});

describe('TypeResolver.resolveDictRow', () => {
	const TR = globalThis.TypeResolver;

	it('returns the whole dictionary row for a faction code', () => {
		const row = TR.resolveDictRow('Faction', '界座', null, metaForLookup);
		expect(row?.Faction).toBe('界座');
		expect(row?.FactionsBaseArea).toEqual({ Area: '龍天国' });
	});

	it('matches against the _EN column as well', () => {
		const row = TR.resolveDictRow('Faction', 'HundredBeauties Laboratory', null, metaForLookup);
		expect(row?.Faction).toBe('百花繚乱研究所');
	});

	it('returns null for unknown codes', () => {
		expect(TR.resolveDictRow('Faction', '未登録の陣営', null, metaForLookup)).toBeNull();
	});

	it('matches scopeField conditions against structured Belonging values', () => {
		// #Dict_SymphonyXVI は scopeField { Belonging: 'シンフォニー.XVI(ゼクズィン)' } を持つ Class 辞書。
		// レコード側が `$Def_Faction[]`（object 配列）でも scope 一致すること。
		const scopedMeta = {
			Dictionaries: {
				'#Dict_ScopedClass': {
					keyField: 'Class',
					compatListKey: '#List_Class',
					scopeField: { Belonging: 'シンフォニー.XVI(ゼクズィン)' }
				}
			},
			General: {
				$VarsDef: {
					'#List_Class': [
						{ Class: 'スコープ限定クラス', Class_EN: 'Scoped Class', Belonging: 'シンフォニー.XVI(ゼクズィン)' }
					]
				}
			}
		};

		const pack = TR.resolveVarsDefLabelPack(
			'Class',
			'スコープ限定クラス',
			null,
			scopedMeta,
			'Class',
			{ Belonging: [{ Faction: 'シンフォニー.XVI(ゼクズィン)' }] }
		);
		expect(pack?.en).toBe('Scoped Class');
	});
});

describe('enrichment $dictRef resolution', () => {
	const testConfig = {
		ORIGIN: 'http://localhost',
		withRepoBase: (path) => String(path || '')
	};

	const createProcessor = () => new globalThis.EnrichmentProcessor({
		readGeneralVarsDefGlobal: async () => ({
			$Def_Faction: globalMeta.General.$VarsDef.$Def_Faction,
			$Def_BaseArea: globalMeta.General.$VarsDef.$Def_BaseArea,
			'#Dict_Faction': factionDict,
			'#Dict_Area': areaDict
		}),
		readGeneralVarsDefWork: async () => ({}),
		readGlobalMeta: async () => ({ CreationWorks: {} }),
		readGlobalType: async () => ({
			$DefType: [{ hashTag: 'Belonging', $type: '$Def_Faction[]', $dict: 'Faction' }]
		}),
		readWorkType: async () => ({ $DefType: [] })
	}, testConfig);

	it('exposes the resolved FactionsBaseArea under _enrichment.dictRefs', async () => {
		const [enriched] = await createProcessor().enrichRecords(
			[{ Belonging: [{ Faction: '百花繚乱研究所' }, { Faction: '界座' }] }],
			'#Works_Test',
			'Primary'
		);

		expect(enriched._enrichment?.dictRefs?.Belonging).toEqual([
			{ Faction: '百花繚乱研究所', FactionsBaseArea: { Area: '九蓮国' } },
			{ Faction: '界座', FactionsBaseArea: { Area: '龍天国' } }
		]);
		// レコード本体の形は変えない（参照解決結果は _enrichment 側にだけ載せる）
		expect(enriched.Belonging).toEqual([{ Faction: '百花繚乱研究所' }, { Faction: '界座' }]);
	});

	it('keeps a record-side value instead of the dictionary row', async () => {
		const [enriched] = await createProcessor().enrichRecords(
			[{ Belonging: [{ Faction: '百花繚乱研究所', FactionsBaseArea: { Area: '英皇国' } }] }],
			'#Works_Test',
			'Primary'
		);

		expect(enriched._enrichment?.dictRefs).toBeUndefined();
	});

	it('resolves legacy string shorthand values through $shorthand', async () => {
		const [enriched] = await createProcessor().enrichRecords(
			[{ Belonging: ['百花繚乱研究所'] }],
			'#Works_Test',
			'Primary'
		);

		expect(enriched._enrichment?.dictRefs?.Belonging).toEqual([
			{ Faction: '百花繚乱研究所', FactionsBaseArea: { Area: '九蓮国' } }
		]);
	});

	it('includes $Def_Faction fields in searchableText', async () => {
		const [enriched] = await createProcessor().enrichRecords(
			[{ Belonging: [{ Faction: '百花繚乱研究所' }] }],
			'#Works_Test',
			'Primary'
		);

		expect(String(enriched._enrichment?.searchableText || '')).toContain('百花繚乱研究所');
	});
});
