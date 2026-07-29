/**
 * [baseArea.render.test.js] - `$Def_BaseArea`（活動地域 / 出身地）の描画テスト
 *
 * - `lib/basic-renders/baseArea.js` の basicFields 用整形（地域（補足））
 * - `lib/basic-renders/def-object-common.js` の汎用 `$Def_*` 整形（辞書ラベル＋補足）
 * - `_enrichment.wrapperSummaries` へ `FromArea` の summary が載ること
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import '../lib/wrapper-common.js';
import '../lib/basic-renders/type-common.js';
import '../lib/basic-renders/def-object-common.js';
import '../lib/basic-renders/baseArea.js';
import '../lib/data-common.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (relPath) => JSON.parse(readFileSync(join(repoRoot, relPath), 'utf8'));

const globalMeta = load('data/db_meta.json');
const globalType = load('data/db_type.json');
const areaDict = load('data/Dictionaries/dict_Area.json');

/** SW の readGlobalMeta() 相当（辞書 DB を General.$VarsDef へ合流した形） */
const metaForLookup = {
	...globalMeta,
	General: {
		...globalMeta.General,
		$VarsDef: { ...globalMeta.General.$VarsDef, '#Dict_Area': areaDict }
	}
};

const fromAreaType = globalType.$DefType.find((entry) => entry?.hashTag === 'FromArea')?.$type;
const registry = globalThis.CharacterValueWrapperRegistry;

/**
 * basicFields 相当の整形（UI の formatValueForDisplay から wrapper へ渡す context を再現）
 * @param {any} value
 * @param {string} pageLang
 * @returns {string}
 */
const formatFromArea = (value, pageLang = 'jp') => registry.formatWithRegisteredWrapper(value, {
	schemaType: fromAreaType,
	fieldKey: 'FromArea',
	workMeta: metaForLookup,
	globalDefType: globalType,
	pageLang,
	typeSources: [globalType]
});

describe('base area renderer ($Def_BaseArea)', () => {
	it('is declared as a wrapper on the $Def_BaseArea container', () => {
		expect(fromAreaType).toBe('$Def_BaseArea');
		expect(globalMeta.General.$VarsDef.$Def_BaseArea.$display?.wrapper).toBe('baseAreaSummary');
	});

	it('resolves the area label through the area dictionary', () => {
		expect(formatFromArea({ Area: '九蓮国' })).toBe('九蓮国');
		expect(formatFromArea({ Area: '九蓮国' }, 'en')).toBe('LotusNinea');
	});

	it('appends BaseAreaAbout as a parenthesised supplement', () => {
		const value = {
			Area: '紅雪連邦',
			BaseAreaAbout_JP: '名義上の所在地',
			BaseAreaAbout_EN: 'Nominal Location'
		};
		expect(formatFromArea(value)).toBe('紅雪連邦（名義上の所在地）');
		expect(formatFromArea(value, 'en')).toBe('United.SnowRed.Republic (Nominal Location)');
	});

	it('renders the supplement alone when no area is set', () => {
		expect(formatFromArea({ BaseAreaAbout_JP: '別次元の世界' })).toBe('別次元の世界');
	});

	it('leaves masked values ({ hideText }) to the caller', () => {
		expect(formatFromArea({ hideText: '非公開' })).toBe('');
	});

	it('renders one line per element for array values', () => {
		const text = formatFromArea([{ Area: '九蓮国' }, { Area: '龍天国' }]);
		expect(text.split('\n')).toEqual(['九蓮国', '龍天国']);
	});
});

describe('base area summary in enrichment', () => {
	const testConfig = {
		ORIGIN: 'http://localhost',
		withRepoBase: (path) => String(path || '')
	};

	it('stores the FromArea summary under _enrichment.wrapperSummaries', async () => {
		const proc = new globalThis.EnrichmentProcessor({
			readGeneralVarsDefGlobal: async () => ({
				$Def_BaseArea: globalMeta.General.$VarsDef.$Def_BaseArea,
				'#Dict_Area': areaDict
			}),
			readGeneralVarsDefWork: async () => ({}),
			readGlobalMeta: async () => ({ CreationWorks: {} }),
			readGlobalType: async () => ({
				$DefType: [{ hashTag: 'FromArea', $type: '$Def_BaseArea', hashTag_JP: '出身地' }]
			}),
			readWorkType: async () => ({ $DefType: [] })
		}, testConfig);

		const [enriched] = await proc.enrichRecords(
			[{ FromArea: { Area: '英皇国', BaseAreaAbout_JP: '幼少期のみ' } }],
			'#Works_Test',
			'Primary'
		);

		expect(enriched._enrichment?.wrapperSummaries?.FromArea).toBe('英皇国（幼少期のみ）');
	});
});
