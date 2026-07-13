/**
 * Index 機能拡張（正規化・辞書解決・エイリアスIndex）の回帰テスト
 *
 * 目的:
 * - #Index 正規化がネストIndexを二重ネスト（{Logic:{Logic:{...}}}）させないこと
 *   （二重ネストは UI の collectIndexEntries / 辞書補完の Index 解決を破綻させる実バグだった）
 * - supplementIndexFieldFromVarsDef() がルート合流済みの #List_* / #Dict_* 辞書にも
 *   フォールバックし、null キー行（例: ModelSeries: null）も解決できること
 * - collectIndexAliasDefs() が $DefType 上の #Index 型 field（例: LogicAlt）を
 *   エイリアスIndexとして汎用収集できること
 *
 * NOTE:
 * - Service Worker 自体は起動せず、`EnrichmentProcessor` / `TypeDefUtils` を直接呼びます。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import '../lib/data-common.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = dirname(__dirname);

function loadJson(relPath) {
	return JSON.parse(readFileSync(join(repoRoot, relPath), 'utf-8'));
}

/** Node 用の最小 DataFetcher スタブ */
class TestDataFetcher {
	async readDB() { return []; }
	async readGlobalMeta() { return {}; }
	async readGeneralVarsDefGlobal() { return {}; }
	async readGeneralVarsDefWork() { return {}; }
	async readGlobalType() { return {}; }
	async readWorkType() { return {}; }
}

const testConfig = {
	ORIGIN: 'http://localhost',
	withRepoBase: (p) => String(p || '')
};

const NESTED_INDEX_DEF = {
	hashTag: 'Logic',
	$type: [
		{ hashTag: 'LogicSeries', $type: '#IndexListKey|#Null', hashTag_JP: 'ロジック系統' },
		{ hashTag: 'Num', $type: '#Number|#String|#Null', hashTag_JP: 'ロジック番号' }
	]
};

describe('TypeDefUtils.normalizeValueByTypeSpec (#Index)', () => {
	const T = globalThis.TypeDefUtils;

	it('サブフィールドを直接持つオブジェクトはそのまま維持する（二重ネストさせない）', () => {
		const v = { LogicSeries: 'K1', Num: '55ID1' };
		const out = T.normalizeValueByTypeSpec(v, '#Index', { indexDef: NESTED_INDEX_DEF });
		expect(out).toEqual({ LogicSeries: 'K1', Num: '55ID1' });
		expect(out.Logic).toBeUndefined();
	});

	it('プリミティブは primary サブフィールドへ寄せる（rootKey では包まない）', () => {
		const out = T.normalizeValueByTypeSpec(14, '#Index', { indexDef: NESTED_INDEX_DEF });
		expect(out).toEqual({ Num: 14 });
	});

	it('rootKey で二重に包まれた旧形（{Logic:{...}}）は unwrap する', () => {
		const v = { Logic: { LogicSeries: '74x', Num: 141 } };
		const out = T.normalizeValueByTypeSpec(v, '#Index', { indexDef: NESTED_INDEX_DEF });
		expect(out).toEqual({ LogicSeries: '74x', Num: 141 });
	});
});

describe('TypeDefUtils.collectIndexAliasDefs', () => {
	const T = globalThis.TypeDefUtils;

	const workType = {
		$IndexDef: { hashTag: 'Model', $type: [{ hashTag: 'ModelSeries', $type: '#IndexListKey|#Null' }, { hashTag: 'Num', $type: '#Number|#String|#Null' }], hashTag_JP: '型式' },
		$IndexDef_PrimaryMobs: NESTED_INDEX_DEF
	};
	const defTypeEntries = [
		{ hashTag: 'Model', $type: '#Index', hashTag_JP: '型式' },
		{ hashTag: 'Logic', $type: '#Index', hashTag_JP: '論理/ロジック' },
		{ hashTag: 'LogicAlt', $type: '#Index', hashTag_JP: '互換論理/互換ロジック' },
		{ hashTag: 'Name_JP', $type: '#String' }
	];

	it('現在の rootKey 以外の #Index 型 field をエイリアスとして収集する', () => {
		const aliases = T.collectIndexAliasDefs(defTypeEntries, NESTED_INDEX_DEF, workType);
		const keys = aliases.map(a => a.hashTag);
		expect(keys).toContain('Model');
		expect(keys).toContain('LogicAlt');
		expect(keys).not.toContain('Logic'); // 現在の rootKey は除外
		expect(keys).not.toContain('Name_JP'); // #Index 型以外は除外
	});

	it('hashTag が一致する $IndexDef* があればその形状を使い、無ければ現行 IndexDef の形状を流用する', () => {
		const aliases = T.collectIndexAliasDefs(defTypeEntries, NESTED_INDEX_DEF, workType);
		const model = aliases.find(a => a.hashTag === 'Model');
		const logicAlt = aliases.find(a => a.hashTag === 'LogicAlt');

		// Model は $IndexDef（rootKey: Model）の形状（ModelSeries サブフィールド）を継承
		expect(model.$type.some(s => s.hashTag === 'ModelSeries')).toBe(true);
		// LogicAlt は現行（Logic）の形状を流用しつつ、hashTag とラベルはエイリアス側を採用
		expect(logicAlt.$type.some(s => s.hashTag === 'LogicSeries')).toBe(true);
		expect(logicAlt.hashTag_JP).toBe('互換論理/互換ロジック');
		expect(logicAlt.$indexAlias).toBe(true);
	});

	it('$display.index による opt-out（false / none）を尊重する', () => {
		const entries = [
			{ hashTag: 'LogicAlt', $type: '#Index', $display: { index: 'none' } },
			{ hashTag: 'Model', $type: '#Index', $display: { index: false } }
		];
		const aliases = T.collectIndexAliasDefs(entries, NESTED_INDEX_DEF, workType);
		expect(aliases).toHaveLength(0);
	});
});

describe('EnrichmentProcessor.supplementIndexFieldFromVarsDef', () => {
	const proc = new globalThis.EnrichmentProcessor(new TestDataFetcher(), testConfig);

	it('ルート合流済みの #List_<keyField> にフォールバックして言語バリアントを補完する', () => {
		const mergedVars = {
			'#List_LogicSeries': [
				{ LogicSeries: '74x', LogicSeries_JP: '7400シリーズ', LogicSeries_EN: '7400 Series' }
			]
		};
		const rec = { Logic: { LogicSeries: '74x', Num: 14 } };
		const out = proc.supplementIndexFieldFromVarsDef(rec, NESTED_INDEX_DEF, mergedVars);
		expect(out.Logic.LogicSeries_JP).toBe('7400シリーズ');
		expect(out.Logic.LogicSeries_EN).toBe('7400 Series');
	});

	it('従来の $Def_<rootKey>.#List_<keyField> 宣言も引き続き優先解決する', () => {
		const mergedVars = {
			$Def_Logic: {
				'#List_LogicSeries': [
					{ LogicSeries: 'K1', LogicSeries_JP: 'キリルシリーズ' }
				]
			}
		};
		const rec = { Logic: { LogicSeries: 'K1', Num: '55ID1' } };
		const out = proc.supplementIndexFieldFromVarsDef(rec, NESTED_INDEX_DEF, mergedVars);
		expect(out.Logic.LogicSeries_JP).toBe('キリルシリーズ');
	});

	it('null キー行（例: ModelSeries: null）も辞書解決できる', () => {
		const modelIndexDef = {
			hashTag: 'Model',
			$type: [
				{ hashTag: 'ModelSeries', $type: '#IndexListKey|#Null' },
				{ hashTag: 'Num', $type: '#Number|#String|#Null' }
			]
		};
		const mergedVars = {
			'#List_ModelSeries': [
				{ ModelSeries: 'AttackerZeroid', ModelSeries_JP: '人形兵ゼロイド' },
				{ ModelSeries: null, ModelSeries_JP: 'TEST_NULL_LABEL_JP', ModelSeries_EN: 'TEST_NULL_LABEL_EN' }
			]
		};
		const rec = { Model: { ModelSeries: null, Num: '0' } };
		const out = proc.supplementIndexFieldFromVarsDef(rec, modelIndexDef, mergedVars);
		expect(out.Model.ModelSeries).toBeNull(); // 主キー値そのものは維持
		expect(out.Model.ModelSeries_JP).toBe('TEST_NULL_LABEL_JP');
		expect(out.Model.ModelSeries_EN).toBe('TEST_NULL_LABEL_EN');
	});

	it('辞書に null キー行が無い場合、null キーは何も補完しない', () => {
		const mergedVars = {
			'#List_LogicSeries': [
				{ LogicSeries: '74x', LogicSeries_JP: '7400シリーズ' }
			]
		};
		const rec = { Logic: { LogicSeries: null, Num: 1 } };
		const out = proc.supplementIndexFieldFromVarsDef(rec, NESTED_INDEX_DEF, mergedVars);
		expect(out.Logic.LogicSeries_JP).toBeUndefined();
	});
});

describe('enrichRecords() 統合（実データ: Works_UnauthedLogica）', () => {
	class UnauthedLogicaDataFetcher extends TestDataFetcher {
		async readDB(workId, dbName) {
			return loadJson(`data/Works_UnauthedLogica/DataBases/db_${dbName}.json`);
		}
		async readWorkType() {
			return loadJson('data/Works_UnauthedLogica/DataBases/db_type.json');
		}
		async readGeneralVarsDefWork() {
			// Dictionaries/ の実行時合流（compatListKey → ルート #List_*）を模擬
			return {
				'#List_ModelSeries': loadJson('data/Works_UnauthedLogica/Dictionaries/dict_ModelSeries.json'),
				'#List_LogicSeries': loadJson('data/Works_UnauthedLogica/Dictionaries/dict_LogicSeries.json')
			};
		}
	}

	it('PrimaryMobs: ネストIndexが二重ネストせず、辞書補完とエイリアス(LogicAlt)補完が効く', async () => {
		const dataFetcher = new UnauthedLogicaDataFetcher();
		const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);
		const records = await dataFetcher.readDB('#Works_UnauthedLogica', 'PrimaryMobs');
		const out = await proc.enrichRecords(records, '#Works_UnauthedLogica', 'PrimaryMobs');

		const nixee = out.find(r => r?.Name_EN === 'Nixee');
		expect(nixee).toBeTruthy();

		// 二重ネストしない（rec.Logic.Logic が存在しない）
		expect(nixee.Logic.Logic).toBeUndefined();
		expect(nixee.Logic.LogicSeries).toBe('K1');
		expect(String(nixee.Logic.Num)).toBe('55ID1');

		// 主Index の辞書補完（#List_LogicSeries 由来）
		expect(nixee.Logic.LogicSeries_JP).toBe('キリルシリーズ');

		// エイリアスIndex（LogicAlt）も同構造として正規化・辞書補完される
		expect(nixee.LogicAlt.Logic).toBeUndefined();
		expect(nixee.LogicAlt.LogicSeries).toBe('74x');
		expect(nixee.LogicAlt.LogicSeries_JP).toBe('7400シリーズ');
	});

	it('Primary: Model Index も二重ネストせず、辞書補完される', async () => {
		const dataFetcher = new UnauthedLogicaDataFetcher();
		const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);
		const records = await dataFetcher.readDB('#Works_UnauthedLogica', 'Primary');
		const out = await proc.enrichRecords(records, '#Works_UnauthedLogica', 'Primary');

		const zeroid10 = out.find(r => r?.Model?.Num === 10);
		expect(zeroid10).toBeTruthy();
		expect(zeroid10.Model.Model).toBeUndefined();
		expect(zeroid10.Model.ModelSeries).toBe('AttackerZeroid');
		expect(zeroid10.Model.ModelSeries_JP).toBe('人形兵ゼロイド');

		// ModelSeries: null のレコードは、辞書に null キー行が無い間は素通しされる（例外を投げない）
		const nullSeries = out.find(r => r?.Model?.ModelSeries === null);
		expect(nullSeries).toBeTruthy();
		expect(nullSeries.Model.Model).toBeUndefined();
	});
});

describe('enrichRecords() 統合（実データ: Works_FLInvestigator78 の回帰確認）', () => {
	class FLI78DataFetcher extends TestDataFetcher {
		async readDB(workId, dbName) {
			return loadJson(`data/Works_FLInvestigator78/DataBases/db_${dbName}.json`);
		}
		async readWorkType() {
			return loadJson('data/Works_FLInvestigator78/DataBases/db_type.json');
		}
		async readGeneralVarsDefWork() {
			return {
				'#List_Suit': loadJson('data/Works_FLInvestigator78/Dictionaries/dict_Suit.json')
			};
		}
	}

	it('Primary: Card Index が二重ネストせず、Suit の辞書補完が効く', async () => {
		const dataFetcher = new FLI78DataFetcher();
		const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);
		const records = await dataFetcher.readDB('#Works_FLInvestigator78', 'Primary');
		const out = await proc.enrichRecords(records, '#Works_FLInvestigator78', 'Primary');

		const first = out.find(r => r?.Card && typeof r.Card === 'object');
		expect(first).toBeTruthy();
		expect(first.Card.Card).toBeUndefined();
		expect(typeof first.Card.Suit).toBe('string');

		// #List_Suit 由来の言語バリアント補完（辞書にキーが存在するレコードで確認）
		const dealer = out.find(r => r?.Card?.Suit === 'Dealer');
		expect(dealer).toBeTruthy();
		expect(dealer.Card.Card).toBeUndefined();
		expect(dealer.Card.Suit_JP).toBe('采配者(ディーラー)');
	});
});
