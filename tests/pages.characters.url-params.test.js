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

	it('_DBLink の複合条件（JSON ペイロード）は従来の個別キー形式へフォールバックする', () => {
		const payload = '{"Suit":"Cups","Num":"3"}';
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

describe('主要インデックスが null のレコードの直リンク識別（錦野姉妹 / Dealer カード）', () => {
	// FLInvestigator78 の $IndexDef は Card.SuitNum を主要要素とするが、Dealer カード（79/80）は
	// SuitNum が null。Num に $display.index.link:true を付与したことで、SuitNum が使えない
	// レコードは複合条件（__conditions__）ではなく Card.Num で一意識別できる。
	const indexDef = loadJson('data/Works_FLInvestigator78/DataBases/db_type.json').$IndexDef;
	const records = loadJson('data/Works_FLInvestigator78/DataBases/db_Primary.json');
	const byNum = (n) => records.find((r) => r?.Card?.Num === n);
	const identify = (rec) => charactersModule.__getIndexIdentifierFromRecordForTest(rec, indexDef, records);

	beforeAll(() => { setLocation(''); });

	it('Dealer 80 は Card.Num:80 で識別される（__conditions__ にフォールバックしない）', () => {
		const id = identify(byNum(80));
		expect(id).toMatchObject({ keyPath: 'Card.Num', value: '80' });
		expect(id.keyPath).not.toBe('__conditions__');
	});

	it('Dealer 79 は Card.Num:79 で識別される', () => {
		expect(identify(byNum(79))).toMatchObject({ keyPath: 'Card.Num', value: '79' });
	});

	it('Major アルカナ（SuitNum 生存）は従来どおり Card.SuitNum で識別される', () => {
		// Num:22 のレコードは Suit:Major / SuitNum:0 → 主要要素 SuitNum が優先される
		const major = byNum(22);
		expect(major?.Card?.Suit).toBe('Major');
		expect(identify(major)).toMatchObject({ keyPath: 'Card.SuitNum', value: '0' });
	});
});
