/**
 * pages/characters.js の URL 直リンク文法（圧縮ロケータ）の回帰テスト
 *
 * 現行仕様:
 *   characters.html?c=NumberTales/Primary/57
 *   characters.html?c=FLInvestigator78/Primary/Card.Num:7
 *   c = <Work>[/<Db>[/<IdxToken>]]   IdxToken = <値> または <キーパス>:<値>
 *
 * 旧形式（work / db / idx / idxKey / num の個別キー、`Works_` 接頭辞）は
 * 読み取りのみ互換維持し、生成側は出力しない。
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

/** 指定 URL の jsdom を立て、location を差し替える（getQS() は location.search を読む） */
function setLocation(search) {
	dom = new JSDOM('<!DOCTYPE html><html lang="ja"><body></body></html>', {
		url: `http://127.0.0.1:5500/pages/characters.html${search}`
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
}

beforeAll(async () => {
	setLocation('');
	globalThis.fetch = async () => {
		throw new Error('Unexpected fetch in pages.characters.url-params.test.js');
	};
	charactersModule = await import(pathToFileURL(join(repoRoot, 'pages', 'characters.js')).href);
});

afterAll(() => {
	dom?.window?.close();
});

describe('圧縮ロケータの生成（buildViewerQueryString）', () => {
	const build = (params) => charactersModule.__buildViewerQueryStringForTest(params);

	it('work / db / idx を 1 本の c パラメータへまとめる', () => {
		expect(build({ work: '#Works_NumberTales', db: 'Primary', idx: '57', idxKey: 'Num' }))
			.toBe('?c=NumberTales/Primary/Num:57');
	});

	it('ネストしたキーパスもコロン記法で表現する', () => {
		expect(build({ work: 'Works_FLInvestigator78', db: 'Primary', idx: '7', idxKey: 'Card.Num' }))
			.toBe('?c=FLInvestigator78/Primary/Card.Num:7');
	});

	it('空のパラメータは出力しない', () => {
		expect(build({ work: 'NumberTales', db: 'Primary', idx: '', idxKey: '', q: '', lang: '', num: '' }))
			.toBe('?c=NumberTales/Primary');
		expect(build({})).toBe('');
	});

	it('旧 num は受理しても URL には出力しない', () => {
		expect(build({ work: 'NumberTales', db: 'Primary', idx: '57', idxKey: 'Num', num: '57' }))
			.toBe('?c=NumberTales/Primary/Num:57');
	});

	it('q / lang は独立キーのまま残す', () => {
		const search = build({ work: 'NumberTales', db: 'Primary', q: '狐', lang: 'en' });
		const params = new URLSearchParams(search.slice(1));
		expect(params.get('c')).toBe('NumberTales/Primary');
		expect(params.get('q')).toBe('狐');
		expect(params.get('lang')).toBe('en');
	});

	it('複合条件（__conditions__ + JSON）を キーパス:値 のカンマ区切りへ展開する', () => {
		const payload = '{"Card":{"Suit":"Major","SuitNum":"16"}}';
		expect(build({ work: 'FLInvestigator78', db: 'Primary', idx: payload, idxKey: '__conditions__' }))
			.toBe('?c=FLInvestigator78/Primary/Card.Suit:Major,Card.SuitNum:16');
	});

	it('_DBLink のネスト条件（idxKey がフィールド名）はキーパスを補って展開する', () => {
		const payload = '{"Alphabet":"S","AlphaGen":"2"}';
		expect(build({ work: 'UnibyteLive', db: 'Primary', idx: payload, idxKey: 'Letter' }))
			.toBe('?c=UnibyteLive/Primary/Letter.Alphabet:S,Letter.AlphaGen:2');
	});

	it('圧縮ロケータで往復できない条件（値に区切り文字を含む）は旧形式へ退避する', () => {
		// 値の `,` は条件の区切りと区別できないため、圧縮ロケータでは表現しない
		const payload = '{"Card":{"Suit":"Cups,Wands"}}';
		const params = new URLSearchParams(
			build({ work: 'FLInvestigator78', db: 'Primary', idx: payload, idxKey: '__conditions__' }).slice(1)
		);
		expect(params.get('c')).toBeNull();
		expect(params.get('idx')).toBe(payload);
		expect(params.get('idxKey')).toBe('__conditions__');
	});
});

describe('圧縮ロケータの解釈（parseViewerLocator）', () => {
	const parse = (raw) => charactersModule.__parseViewerLocatorForTest(raw);

	it('Work / Db / IdxToken の 3 セグメントを分解する', () => {
		expect(parse('NumberTales/Primary/Num:57'))
			.toEqual({ work: 'NumberTales', db: 'Primary', idx: '57', idxKey: 'Num' });
	});

	it('キー省略時はインデックス値のみとして扱う', () => {
		expect(parse('NumberTales/Primary/57'))
			.toEqual({ work: 'NumberTales', db: 'Primary', idx: '57', idxKey: '' });
	});

	it('work のみ / work+db のみでも解釈できる', () => {
		expect(parse('NumberTales')).toEqual({ work: 'NumberTales', db: '', idx: '', idxKey: '' });
		expect(parse('NumberTales/Primary')).toEqual({ work: 'NumberTales', db: 'Primary', idx: '', idxKey: '' });
	});

	it('3 セグメント目以降の / はインデックス値の一部として保持する', () => {
		expect(parse('NumberTales/Primary/Name:9/10')).toEqual({
			work: 'NumberTales', db: 'Primary', idx: '9/10', idxKey: 'Name'
		});
	});

	it('カンマ区切りの複合インデックスを __conditions__ の JSON 条件へ正規化する', () => {
		expect(parse('FLInvestigator78/Primary/Card.Suit:Major,Card.SuitNum:16')).toEqual({
			work: 'FLInvestigator78',
			db: 'Primary',
			idx: '{"Card":{"Suit":"Major","SuitNum":"16"}}',
			idxKey: '__conditions__'
		});
	});

	it('生成 → 解釈 の往復で複合インデックスが保たれる', () => {
		const search = charactersModule.__buildViewerQueryStringForTest({
			work: 'UnibyteLive', db: 'Primary',
			idx: '{"Letter":{"Alphabet":"S","AlphaGen":"2"}}', idxKey: '__conditions__'
		});
		const token = new URLSearchParams(search.slice(1)).get('c');
		expect(token).toBe('UnibyteLive/Primary/Letter.Alphabet:S,Letter.AlphaGen:2');
		expect(parse(token)).toEqual({
			work: 'UnibyteLive',
			db: 'Primary',
			idx: '{"Letter":{"Alphabet":"S","AlphaGen":"2"}}',
			idxKey: '__conditions__'
		});
	});

	it('カンマを含む単一インデックス値は複合として扱わない', () => {
		// 全パートが `キーパス:値` でない限り複合と見なさない（値の `,` を壊さない）
		expect(parse('NumberTales/Primary/Name:9,10')).toEqual({
			work: 'NumberTales', db: 'Primary', idx: '9,10', idxKey: 'Name'
		});
		expect(parse('NumberTales/Primary/9,10')).toEqual({
			work: 'NumberTales', db: 'Primary', idx: '9,10', idxKey: ''
		});
	});
});

describe('クエリ解釈（getQS）の後方互換', () => {
	const getQS = () => charactersModule.__getQSForTest();

	it('圧縮ロケータを work / db / idx / idxKey に展開する', () => {
		setLocation('?c=FLInvestigator78/Primary/Card.Num:7');
		expect(getQS()).toMatchObject({
			work: 'FLInvestigator78', db: 'Primary', idx: '7', idxKey: 'Card.Num'
		});
	});

	it('旧形式（work=Works_* / idx / idxKey の個別キー）を読める', () => {
		setLocation('?work=Works_PastDivers&db=Primary&idx=Yayoi&idxKey=Chronos.Lunar&q=');
		expect(getQS()).toMatchObject({
			work: 'Works_PastDivers', db: 'Primary', idx: 'Yayoi', idxKey: 'Chronos.Lunar'
		});
	});

	it('旧 ?num= は Num インデックスとして解釈する（setQS による書き換えで直リンクが失われない）', () => {
		setLocation('?work=NumberTales&db=Primary&num=57');
		expect(getQS()).toMatchObject({ idx: '57', idxKey: 'Num', num: '57' });
	});

	it('個別キーは圧縮ロケータより優先される', () => {
		setLocation('?c=NumberTales/Primary/Num:57&db=Mobs');
		expect(getQS()).toMatchObject({ work: 'NumberTales', db: 'Mobs' });
	});
});

describe('複合インデックス（オブジェクト型 $IndexDef）の直リンク識別', () => {
	// カテゴリキー（#IndexListKey: Card.Suit / Letter.Alphabet）は常に URL へ載せ、
	// 一意にならない場合だけ他のサブフィールドを足す。
	// スート情報の無い `Card.SuitNum:16` は「どのスートの16番か」を示せないため採用しない。
	const flIndexDef = loadJson('data/Works_FLInvestigator78/DataBases/db_type.json').$IndexDef;
	const flRecords = loadJson('data/Works_FLInvestigator78/DataBases/db_Primary.json');
	const flMinorRecords = loadJson('data/Works_FLInvestigator78/DataBases/db_UnprocessedDealer.json');
	const ubIndexDef = loadJson('data/Works_UnibyteLive/DataBases/db_type.json').$IndexDef;
	const ubRecords = loadJson('data/Works_UnibyteLive/DataBases/db_Primary.json');

	const byNum = (n) => flRecords.find((r) => r?.Card?.Num === n);
	const identify = (rec, indexDef, records) =>
		charactersModule.__getIndexIdentifierFromRecordForTest(rec, indexDef, records);
	/** 識別子が「そのレコードだけ」に一致するか（URL を開いた時に別人へ飛ばないか） */
	const resolvesOnlyTo = (rec, indexDef, records) => {
		const id = identify(rec, indexDef, records);
		const hits = records.filter((r) => charactersModule.__recordMatchesIndexQueryForTest(
			r, indexDef, id.value, id.keyPath, ''
		));
		return hits.length === 1 && hits[0] === rec;
	};

	beforeAll(() => { setLocation(''); });

	it('Major アルカナは Suit + SuitNum の複合で識別される（Suit を落とさない）', () => {
		const major = byNum(16);
		expect(major?.Card?.Suit).toBe('Major');
		const id = identify(major, flIndexDef, flRecords);
		expect(id.keyPath).toBe('__conditions__');
		// 複合条件では主Index の root（Card）を落とす（1レコード1オブジェクトのため情報量が無い）
		expect(JSON.parse(id.value)).toEqual({ Suit: 'Major', SuitNum: '16' });
		expect(resolvesOnlyTo(major, flIndexDef, flRecords)).toBe(true);
	});

	it('SuitNum が null の Dealer カードは Suit + Num の複合で識別される', () => {
		const dealer = byNum(79);
		expect(dealer?.Card?.Suit).toBe('Dealer');
		expect(dealer?.Card?.SuitNum).toBeNull();
		const id = identify(dealer, flIndexDef, flRecords);
		expect(JSON.parse(id.value)).toEqual({ Suit: 'Dealer', Num: '79' });
		expect(resolvesOnlyTo(dealer, flIndexDef, flRecords)).toBe(true);
	});

	it('小アルカナ（スート間で SuitNum が重複）でもスート込みで一意に識別される', () => {
		const cups7 = flMinorRecords.find((r) => r?.Card?.Suit === 'WaterCups' && r?.Card?.SuitNum === 7);
		expect(cups7).toBeTruthy();
		// 同じ SuitNum:7 が 4 スートぶん存在する（スート抜きでは特定できない）
		expect(flMinorRecords.filter((r) => r?.Card?.SuitNum === 7).length).toBeGreaterThan(1);
		const id = identify(cups7, flIndexDef, flMinorRecords);
		expect(JSON.parse(id.value)).toEqual({ Suit: 'WaterCups', SuitNum: '7' });
		expect(resolvesOnlyTo(cups7, flIndexDef, flMinorRecords)).toBe(true);
	});

	it('UnibyteLive は Alphabet + AlphaGen の複合で識別される（単独では原理的に一意にならない）', () => {
		const sGen2 = ubRecords.find((r) => r?.Letter?.Alphabet === 'S' && r?.Letter?.AlphaGen === 2);
		expect(sGen2).toBeTruthy();
		const id = identify(sGen2, ubIndexDef, ubRecords);
		expect(JSON.parse(id.value)).toEqual({ Alphabet: 'S', AlphaGen: '2' });
		expect(resolvesOnlyTo(sGen2, ubIndexDef, ubRecords)).toBe(true);
	});

	it('複合インデックスの URL は root 抜きの圧縮ロケータへ載る（旧 __conditions__ 形式へ落ちない）', () => {
		const sGen2 = ubRecords.find((r) => r?.Letter?.Alphabet === 'S' && r?.Letter?.AlphaGen === 2);
		const id = identify(sGen2, ubIndexDef, ubRecords);
		const search = charactersModule.__buildViewerQueryStringForTest({
			work: 'UnibyteLive', db: 'Primary', idx: id.value, idxKey: id.keyPath, lang: 'jp'
		});
		const params = new URLSearchParams(search.slice(1));
		expect(params.get('c')).toBe('UnibyteLive/Primary/Alphabet:S,AlphaGen:2');
		expect(params.get('idxKey')).toBeNull();
	});

	it('単一キーで識別できる場合は root 付きのキーパスを維持する', () => {
		// root 省略は複合のときだけ。単一キーは従来どおり `<root>.<child>` 形式。
		const pdIndexDef = loadJson('data/Works_PastDivers/DataBases/db_type.json').$IndexDef;
		const pdRecords = loadJson('data/Works_PastDivers/DataBases/db_Primary.json');
		const id = identify(pdRecords[0], pdIndexDef, pdRecords);
		expect(id.keyPath).toBe('Chronos.Lunar');
		expect(id.keyPath).not.toBe('__conditions__');
	});

	it('カテゴリキーを持たないスカラー Index（NumberTales）は単一キーのまま', () => {
		const ntIndexDef = loadJson('data/Works_NumberTales/DataBases/db_type.json').$IndexDef;
		const ntRecords = loadJson('data/Works_NumberTales/DataBases/db_Primary.json');
		const rec = ntRecords.find((r) => String(r?.Num) === '57');
		expect(identify(rec, ntIndexDef, ntRecords)).toMatchObject({ keyPath: 'Num', value: '57' });
	});
});

describe('旧形式 URL の後方互換（読み取り）', () => {
	const flIndexDef = loadJson('data/Works_FLInvestigator78/DataBases/db_type.json').$IndexDef;
	const flRecords = loadJson('data/Works_FLInvestigator78/DataBases/db_Primary.json');
	const ubIndexDef = loadJson('data/Works_UnibyteLive/DataBases/db_type.json').$IndexDef;
	const ubRecords = loadJson('data/Works_UnibyteLive/DataBases/db_Primary.json');
	const matches = (records, indexDef, idx, idxKey) => records.filter(
		(r) => charactersModule.__recordMatchesIndexQueryForTest(r, indexDef, idx, idxKey, '')
	);

	it('root 付きの複合 URL（Card.Suit:Major,Card.SuitNum:16）も引き続き解決できる', () => {
		setLocation('?c=FLInvestigator78/Primary/Card.Suit:Major,Card.SuitNum:16&lang=jp');
		const qs = charactersModule.__getQSForTest();
		const hits = matches(flRecords, flIndexDef, qs.idx, qs.idxKey);
		expect(hits.length).toBe(1);
		expect(hits[0].Card.Num).toBe(16);
	});

	it('root 抜きの複合 URL（Suit:Major,SuitNum:16）が $IndexDef の root 配下で解決される', () => {
		setLocation('?c=FLInvestigator78/Primary/Suit:Major,SuitNum:16&lang=jp');
		const qs = charactersModule.__getQSForTest();
		expect(qs.idxKey).toBe('__conditions__');
		const hits = matches(flRecords, flIndexDef, qs.idx, qs.idxKey);
		expect(hits.length).toBe(1);
		expect(hits[0].Card.Num).toBe(16);
	});

	it('スート抜きの旧 URL（Card.SuitNum:16）も引き続き解決できる', () => {
		setLocation('?c=FLInvestigator78/Primary/Card.SuitNum:16&lang=jp');
		const qs = charactersModule.__getQSForTest();
		const hits = matches(flRecords, flIndexDef, qs.idx, qs.idxKey);
		expect(hits.length).toBe(1);
		expect(hits[0].Card.Num).toBe(16);
	});

	it('旧 __conditions__ 形式（JSON ペイロード）も引き続き解決できる', () => {
		setLocation('?work=UnibyteLive&db=Primary&idx=%7B%22Letter%22:%7B%22AlphaGen%22:%222%22%2C%22Alphabet%22:%22S%22%7D%7D&idxKey=__conditions__&lang=jp');
		const qs = charactersModule.__getQSForTest();
		expect(qs.idxKey).toBe('__conditions__');
		const hits = matches(ubRecords, ubIndexDef, qs.idx, qs.idxKey);
		expect(hits.length).toBe(1);
		expect(hits[0].Letter).toMatchObject({ Alphabet: 'S', AlphaGen: 2 });
	});

	it('旧 __conditions__ 形式で開いた URL は圧縮ロケータへ書き換わる', () => {
		setLocation('?work=UnibyteLive&db=Primary&idx=%7B%22Letter%22:%7B%22AlphaGen%22:%222%22%2C%22Alphabet%22:%22S%22%7D%7D&idxKey=__conditions__&lang=jp');
		const qs = charactersModule.__getQSForTest();
		const params = new URLSearchParams(charactersModule.__buildViewerQueryStringForTest(qs).slice(1));
		expect(params.get('c')).toBe('UnibyteLive/Primary/Letter.AlphaGen:2,Letter.Alphabet:S');
		expect(params.get('idx')).toBeNull();
		expect(params.get('idxKey')).toBeNull();
	});
});

describe('root を省いたキー指定の解決（主Index / サブIndex）', () => {
	// UnauthedLogica の PrimaryMobs は $IndexDef_PrimaryMobs（主Index = Logic）を使い、
	// 同構造のサブIndex（エイリアス）として LogicAlt を持つ。
	// 複合ロケータは root を省くため、サブIndex も同じように root 抜きで引けることを保証する。
	const workTypeDef = loadJson('data/Works_UnauthedLogica/DataBases/db_type.json');
	const records = loadJson('data/Works_UnauthedLogica/DataBases/db_PrimaryMobs.json');
	const indexDef = workTypeDef.$IndexDef_PrimaryMobs;
	const nixee = records.find((r) => r?.Logic?.LogicSeries === 'K1');

	beforeAll(() => {
		setLocation('');
		// エイリアスIndex の収集は __CHAR_STATE__.workTypeDef を参照する
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'PrimaryMobs',
				workId: '#Works_UnauthedLogica',
				records,
				workTypeDef,
				globalTypeDef: loadJson('data/db_type.json'),
				imageFields: []
			}
		});
	});

	afterAll(() => {
		charactersModule.__resetCharactersTestState();
	});

	/** 圧縮ロケータのインデックストークンで一致するレコードを引く */
	const hitsFor = (token) => {
		const parsed = charactersModule.__parseViewerLocatorForTest(`UnauthedLogica/PrimaryMobs/${token}`);
		return records.filter((r) => charactersModule.__recordMatchesIndexQueryForTest(
			r, indexDef, parsed.idx, parsed.idxKey, ''
		));
	};

	it('主Index は root 抜きでも引ける（単一キー / 複合の両方）', () => {
		expect(hitsFor('LogicSeries:K1')).toEqual([nixee]);
		expect(hitsFor('LogicSeries:K1,Num:55ID1')).toEqual([nixee]);
	});

	it('サブIndex（LogicAlt）も root 抜きで引ける', () => {
		expect(nixee?.LogicAlt).toMatchObject({ LogicSeries: '74x', Num: 141 });
		expect(hitsFor('Num:141')).toEqual([nixee]);
		expect(hitsFor('LogicSeries:74x,Num:141')).toEqual([nixee]);
	});

	it('root 付きの指定は主Index / サブIndex とも従来どおり引ける', () => {
		expect(hitsFor('Logic.LogicSeries:K1')).toEqual([nixee]);
		expect(hitsFor('LogicAlt.Num:141')).toEqual([nixee]);
		expect(hitsFor('LogicAlt.LogicSeries:74x,LogicAlt.Num:141')).toEqual([nixee]);
	});

	it('主Index とサブIndex にまたがって値が重複する指定は一意にならない', () => {
		// LogicSeries:74x は他レコードの Logic 側にも存在する。
		// 生成側は一意性を検証してから出すため、この形の URL は作られない。
		expect(hitsFor('LogicSeries:74x').length).toBeGreaterThan(1);
	});
});
