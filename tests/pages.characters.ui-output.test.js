/**
 * pages/characters.js の UI 出力回帰テスト
 *
 * jsdom 上で renderDetail() を直接実行し、
 * キャラシートの基本情報テーブルが期待どおりの文言を出力するかを検証する。
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = dirname(__dirname);

function loadJson(relPath) {
	return JSON.parse(readFileSync(join(repoRoot, relPath), 'utf-8'));
}

function mergeMetaAndTypeVars(metaLike, typeLike) {
	const meta = (metaLike && typeof metaLike === 'object' && !Array.isArray(metaLike)) ? metaLike : {};
	const type = (typeLike && typeof typeLike === 'object' && !Array.isArray(typeLike)) ? typeLike : {};
	const metaGeneral = (meta.General && typeof meta.General === 'object' && !Array.isArray(meta.General)) ? meta.General : {};
	const metaVars = (metaGeneral.$VarsDef && typeof metaGeneral.$VarsDef === 'object' && !Array.isArray(metaGeneral.$VarsDef))
		? metaGeneral.$VarsDef
		: {};
	const typeVars = (type.$VarsDef && typeof type.$VarsDef === 'object' && !Array.isArray(type.$VarsDef))
		? type.$VarsDef
		: {};

	return {
		...meta,
		...(Array.isArray(type.$DefType) ? { $DefType: type.$DefType } : {}),
		...(Array.isArray(type.global) ? { global: type.global } : {}),
		...(type.typedef && typeof type.typedef === 'object' ? { typedef: type.typedef } : {}),
		General: {
			...metaGeneral,
			$VarsDef: { ...metaVars, ...typeVars }
		}
	};
}

function mergeMetaWithDictionaryBundle(metaSource, extraVars = {}, extraMeta = {}) {
	const meta = (metaSource && typeof metaSource === 'object' && !Array.isArray(metaSource)) ? metaSource : {};
	const vars = (extraVars && typeof extraVars === 'object' && !Array.isArray(extraVars)) ? extraVars : {};
	const dictMeta = (extraMeta && typeof extraMeta === 'object' && !Array.isArray(extraMeta)) ? extraMeta : {};
	const metaGeneral = (meta.General && typeof meta.General === 'object' && !Array.isArray(meta.General)) ? meta.General : {};
	const metaVars = (metaGeneral.$VarsDef && typeof metaGeneral.$VarsDef === 'object' && !Array.isArray(metaGeneral.$VarsDef))
		? metaGeneral.$VarsDef
		: {};
	const mergedDictionaries = {
		...((meta.Dictionaries && typeof meta.Dictionaries === 'object' && !Array.isArray(meta.Dictionaries)) ? meta.Dictionaries : {}),
		...((dictMeta.Dictionaries && typeof dictMeta.Dictionaries === 'object' && !Array.isArray(dictMeta.Dictionaries)) ? dictMeta.Dictionaries : {})
	};

	return {
		...meta,
		...(Object.keys(mergedDictionaries).length ? { Dictionaries: mergedDictionaries } : {}),
		General: {
			...metaGeneral,
			$VarsDef: { ...metaVars, ...vars }
		}
	};
}

function loadDictionaryBundle(relDir) {
	const meta = loadJson(`${relDir}/db_meta.json`);
	const type = loadJson(`${relDir}/db_type.json`);
	const vars = {
		...((type.$VarsDef && typeof type.$VarsDef === 'object' && !Array.isArray(type.$VarsDef)) ? type.$VarsDef : {})
	};
	const dictionaries = (meta.Dictionaries && typeof meta.Dictionaries === 'object' && !Array.isArray(meta.Dictionaries))
		? meta.Dictionaries
		: {};

	for (const [rawDictKey, info] of Object.entries(dictionaries)) {
		if (!info || typeof info !== 'object' || Array.isArray(info)) continue;
		const dictName = String(rawDictKey || '').replace(/^#Dict_/, '').trim();
		const keyField = typeof info.keyField === 'string' ? info.keyField.trim() : '';
		const derivedName = dictName || keyField;
		if (!derivedName) continue;
		const dictKey = String(rawDictKey || '').startsWith('#Dict_')
			? String(rawDictKey).trim()
			: `#Dict_${derivedName}`;
		const compatListKey = (typeof info.compatListKey === 'string' && info.compatListKey.trim())
			? info.compatListKey.trim()
			: `#List_${derivedName}`;
		const rows = loadJson(`${relDir}/dict_${derivedName}.json`);
		vars[dictKey] = rows;
		if (!vars[compatListKey]) vars[compatListKey] = rows;
	}

	return { meta, vars };
}

function buildGlobalDefTypeFixture() {
	const globalMeta = loadJson('data/db_meta.json');
	const globalTypeDef = loadJson('data/db_type.json');
	const dictBundle = loadDictionaryBundle('data/Dictionaries');
	return mergeMetaAndTypeVars(
		mergeMetaWithDictionaryBundle(globalMeta, dictBundle.vars, dictBundle.meta),
		globalTypeDef
	);
}

function buildWorkMetaFixture(workDir) {
	const workMeta = loadJson(`data/${workDir}/DataBases/db_meta.json`);
	const workTypeDef = loadJson(`data/${workDir}/DataBases/db_type.json`);
	const dictBundle = loadDictionaryBundle(`data/${workDir}/Dictionaries`);
	return mergeMetaAndTypeVars(
		mergeMetaWithDictionaryBundle(workMeta, dictBundle.vars, dictBundle.meta),
		workTypeDef
	);
}

function installDomGlobals(dom) {
	globalThis.window = dom.window;
	globalThis.document = dom.window.document;
	globalThis.location = dom.window.location;
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
		throw new Error('Unexpected fetch in pages.characters.ui-output.test.js');
	};
}

function createDetailDom() {
	return new JSDOM(`<!DOCTYPE html><html lang="ja"><body>
    <input id="chk-debug" type="checkbox" />
    <select id="select-work"></select>
    <select id="select-db"></select>
    <input id="search-input" type="text" />
    <section id="list-view" class="card">
      <div id="list"></div>
      <div id="list-empty" hidden>empty</div>
    </section>
    <section id="detail-view" class="card">
      <div class="detail-header"><h2 id="detail-title">-</h2></div>
      <div id="detail"></div>
    </section>
  </body></html>`, {
		url: 'http://127.0.0.1:5500/pages/characters.html?work=Works_PastDivers&idx=Yayoi&idxKey=Chronos.Lunar&q='
	});
}

function getBasicFieldValue(label) {
	const rows = Array.from(document.querySelectorAll('.kv-table tr'));
	const row = rows.find((tr) => tr.querySelector('th')?.textContent?.trim() === label);
	return row?.querySelector('td')?.textContent?.trim() || '';
}

function getSectionText(title) {
	const section = Array.from(document.querySelectorAll('.section'))
		.find((node) => node.querySelector('h3')?.textContent?.trim() === title);
	return section?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function getSectionNode(title) {
	return Array.from(document.querySelectorAll('.section'))
		.find((node) => node.querySelector('h3')?.textContent?.trim() === title) || null;
}

function getSubFieldSectionNode(key) {
	return document.querySelector(`.section[data-subfield-key="${key}"]`);
}

function isCollapsibleSection(title) {
	const section = getSectionNode(title);
	return section?.tagName === 'DETAILS';
}

function isCollapsibleSubFieldSection(key) {
	const section = getSubFieldSectionNode(key);
	return section?.tagName === 'DETAILS';
}

function isSubFieldSectionOpen(key) {
	return Boolean(getSubFieldSectionNode(key)?.open);
}

function getSectionTagTexts(title) {
	const section = getSectionNode(title);
	if (!section) return [];
	return Array.from(section.querySelectorAll('.tag')).map((node) => node.textContent?.trim() || '');
}

function getSectionTitles() {
	return Array.from(document.querySelectorAll('.section h3')).map((node) => node.textContent?.trim() || '');
}

function getSubFieldSectionKeys() {
	return Array.from(document.querySelectorAll('.section[data-subfield-key]'))
		.map((node) => node.getAttribute('data-subfield-key') || '')
		.filter(Boolean);
}

function getListTitles() {
	return Array.from(document.querySelectorAll('#list h3')).map((node) => node.textContent?.trim() || '');
}

function getListSubtitles() {
	return Array.from(document.querySelectorAll('#list .sub')).map((node) => node.textContent?.trim() || '');
}

const globalMeta = loadJson('data/db_meta.json');
const globalTypeDef = loadJson('data/db_type.json');
const globalDefType = buildGlobalDefTypeFixture();
const workTypeDef = loadJson('data/Works_PastDivers/DataBases/db_type.json');
const workMeta = buildWorkMetaFixture('Works_PastDivers');
const records = loadJson('data/Works_PastDivers/DataBases/db_Primary.json');
const yayoiRecordBase = records.find((record) => record?.Chronos?.Lunar === 'Yayoi');
const leapRecordBase = records.find((record) => record?.Chronos?.Lunar === 'Leap');
const flInvestigatorWorkTypeDef = loadJson('data/Works_FLInvestigator78/DataBases/db_type.json');
const flInvestigatorWorkMeta = buildWorkMetaFixture('Works_FLInvestigator78');
const flInvestigatorPrimaryRecords = loadJson('data/Works_FLInvestigator78/DataBases/db_Primary.json');
const phoenixRecord = flInvestigatorPrimaryRecords.find((record) => Number(record?.Card?.Num) === 0);
const proxiesWorkTypeDef = loadJson('data/Works_Proxies/DataBases/db_type.json');
const proxiesWorkMeta = buildWorkMetaFixture('Works_Proxies');
const proxyRecords = loadJson('data/Works_Proxies/DataBases/db_Proxy.json');
const secondGenProxyRecord = proxyRecords.find((record) => Number(record?.Generation) === 2);
const numberTalesWorkTypeDef = loadJson('data/Works_NumberTales/DataBases/db_type.json');
const numberTalesWorkMeta = buildWorkMetaFixture('Works_NumberTales');
const numberTalesPrimaryRecords = loadJson('data/Works_NumberTales/DataBases/db_Primary.json');
const numberTalesSecondaryRecords = loadJson('data/Works_NumberTales/DataBases/db_Secondary.json');
const numberTalesSelfSecondaryRecords = loadJson('data/Works_NumberTales/DataBases/db_SelfSecondary.json');
const sharedReferencesTypeDef = loadJson('data/References/db_type.json');
const numberTalesReferencesTypeDef = loadJson('data/Works_NumberTales/References/db_type.json');
const numberTalesGlossaryRecords = loadJson('data/Works_NumberTales/References/ref_Glossary.json');
const numberTalesReferenceRecords = loadJson('data/Works_NumberTales/References/ref_Reference.json');
const hexademicalRecord = numberTalesSecondaryRecords.find((record) => record?.Num === '0xA');
const requestNumberRecord = numberTalesSelfSecondaryRecords.find((record) => record?.Num === 223);
const numberTalesGlossaryImageRecord = numberTalesGlossaryRecords.find((record) => record?.Term === 'ヒューマノイド形態');
const numberTalesReferenceRecord = numberTalesReferenceRecords.find((record) => record?.Title === 'ナンバーテールズについて');
const firstNumberTalesPrimaryRecord = numberTalesPrimaryRecords.find((record) => String(record?.Num) === '1');
const fourthNumberTalesPrimaryRecord = numberTalesPrimaryRecords.find((record) => String(record?.Num) === '4');
const ninthNumberTalesPrimaryRecord = numberTalesPrimaryRecords.find((record) => String(record?.Num) === '9');

const yayoiRecord = {
	...yayoiRecordBase,
	Belonging: ['夜月機関'],
	Class: ['第3幹部', '弥生研究所(破滅対策本部2課)']
};

let charactersModule;
let dom;

beforeAll(async () => {
	globalThis.__CHARACTERS_TEST_MODE__ = true;
	dom = createDetailDom();
	installDomGlobals(dom);
	const moduleUrl = `${pathToFileURL(join(repoRoot, 'pages/characters.js')).href}?ui-output-test=${Date.now()}`;
	charactersModule = await import(moduleUrl);
});

beforeEach(() => {
	dom = createDetailDom();
	installDomGlobals(dom);
	charactersModule.__resetCharactersTestState();
	charactersModule.__setCharactersTestState({
		globalMeta,
		globalTypeDef,
		globalDefType,
		charState: {
			db: 'Primary',
			workTypeDef,
			globalTypeDef,
			workMeta,
			imageFields: []
		}
	});
});

afterEach(() => {
	charactersModule.__resetCharactersTestState();
	dom.window.close();
});

afterAll(() => {
	delete globalThis.__CHARACTERS_TEST_MODE__;
	if (dom) dom.window.close();
});

describe('pages/characters.js UI output', () => {
	it('renders dictionary-backed basic fields in detail view', async () => {
		await charactersModule.renderDetail('#Works_PastDivers', yayoiRecord);

		expect(getBasicFieldValue('正式名称')).toBe('桜花 訫(とき) / Trustia Cherrybroom');
		expect(getBasicFieldValue('所属')).toBe('夜月機関 / Yadzuki Organization');

		const classText = getBasicFieldValue('クラス名');
		expect(classText).toContain('第3幹部 / Executive Director.3');
		expect(classText).toContain('弥生研究所(破滅対策本部2課) / Laboratory.3(Pandemic Affairs Countermeasures Headquarter.2)');
	});

	it('renders enum and hideText values in basic info table', async () => {
		await charactersModule.renderDetail('#Works_PastDivers', yayoiRecord);

		expect(getBasicFieldValue('性別')).toBe('女性 / Female');
		expect(getBasicFieldValue('体重_kg')).toBe('非公開希望');
		expect(getBasicFieldValue('時空象器能力名')).toBe('時空開花 / ChronoBloom');
	});

	it('renders varsdef-backed hideText values in English without requiring a field-specific _EN sibling', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Primary',
				pageLang: 'en',
				workTypeDef,
				globalTypeDef,
				workMeta,
				imageFields: []
			}
		});

		const record = {
			...yayoiRecord,
			Unlike_EN: undefined
		};

		await charactersModule.renderDetail('#Works_PastDivers', record);

		expect(getBasicFieldValue('Weight_kg')).toBe('Non-Public at Pleasure');
	});

	it('renders shared-language fields in English from the base value even when the _EN sibling is blank', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Primary',
				pageLang: 'en',
				workTypeDef,
				globalTypeDef,
				workMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_PastDivers', {
			...leapRecordBase,
			ModelNumber_EN: ''
		});

		expect(getBasicFieldValue('Model Number')).toBe('ACCHR-YL[Mk.30]');
	});

	it('renders shared RaceType dictionary values in English from the base code', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Proxy',
				pageLang: 'en',
				workTypeDef: proxiesWorkTypeDef,
				globalTypeDef,
				workMeta: proxiesWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_Proxies', secondGenProxyRecord);

		expect(getBasicFieldValue('Race')).toBe('Warfox(Acquired)');
	});

	it('renders secondary metadata fields in a dedicated detail section', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'SelfSecondary',
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_NumberTales', requestNumberRecord);

		const secondarySectionText = getSectionText('二次創作情報');
		expect(secondarySectionText).toContain('二次創作分類');
		expect(secondarySectionText).toContain('リクエストナンバー');
		expect(secondarySectionText).toContain('キャラクターデザイン・考案');
		expect(secondarySectionText).toContain('ラジアン(柏木主税)');
	});

	it('renders NumberTales detail headers using only the character name', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Primary',
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_NumberTales', firstNumberTalesPrimaryRecord);

		expect(document.querySelector('#detail-title')?.textContent?.trim()).toBe('1(ハジメ)');
		expect(document.querySelector('.name-en')?.textContent?.trim()).toBe('1(Unitta)');
	});

	it('renders series-backed secondary metadata when only sec_SeriesTitle exists on the record', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Secondary',
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		const [enrichedSecondaryRecord] = charactersModule.__applyCharactersCommonsForTest(
			[structuredClone(hexademicalRecord)],
			numberTalesWorkMeta,
			'Secondary'
		);

		await charactersModule.renderDetail('#Works_NumberTales', enrichedSecondaryRecord);

		const secondarySectionText = getSectionText('二次創作情報');
		expect(secondarySectionText).toContain('二次創作分類');
		expect(secondarySectionText).toContain('共同二次創作');
		expect(secondarySectionText).toContain('キャラクターデザイン・考案');
		expect(secondarySectionText).toContain('散狐アタスト(https://misskey.io/@atast)(https://misskey.io/@atast)');
	});

	it('renders RelationToPrimary entries as links to the primary db detail view', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Secondary',
				workId: '#Works_NumberTales',
				records: numberTalesSecondaryRecords,
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_NumberTales', hexademicalRecord);

		const section = getSectionNode('原作との関係');
		expect(section).not.toBeNull();

		const links = Array.from(section.querySelectorAll('a'));
		const primaryLink = links.find((link) => link.textContent?.trim() === '1');
		expect(primaryLink).toBeTruthy();

		const params = new URL(primaryLink.href).searchParams;
		expect(params.get('db')).toBe('Primary');
		expect(params.get('idx')).toBe('1');
		expect(params.get('idxKey')).toBe('Num');
		expect(params.get('num')).toBe('1');
	});

	it('renders ConversationPattern as a standalone subField section driven by detail layout', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Primary',
				workId: '#Works_NumberTales',
				records: numberTalesPrimaryRecords,
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_NumberTales', ninthNumberTalesPrimaryRecord);

		const conversationSection = getSubFieldSectionNode('ConversationPattern');
		expect(conversationSection).not.toBeNull();
		expect(isCollapsibleSubFieldSection('ConversationPattern')).toBe(true);
		expect(isSubFieldSectionOpen('ConversationPattern')).toBe(false);
		expect(conversationSection?.querySelector('h3')?.textContent?.trim()).toBe('会話パターンについて');
		expect(conversationSection?.textContent || '').toContain('口調');
		expect(conversationSection?.textContent || '').toContain('台詞の例');

		const profileSectionText = getSectionText('プロフィール/テキスト');
		expect(profileSectionText).not.toContain('会話パターンについて');
	});

	it('prioritizes declared subFields order over basic/profile/relation fallback routes', async () => {
		const customGlobalMeta = structuredClone(globalMeta);
		customGlobalMeta.CreationWorks['#Works_NumberTales'].$DetailLayout.subFields = [
			'AbilityStats',
			'NumerospecAbout',
			'Relation',
			'ConversationPattern'
		];

		charactersModule.__setCharactersTestState({
			globalMeta: customGlobalMeta,
			charState: {
				db: 'Primary',
				workId: '#Works_NumberTales',
				records: numberTalesPrimaryRecords,
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_NumberTales', fourthNumberTalesPrimaryRecord);

		const orderedSubFieldKeys = getSubFieldSectionKeys().filter((key) => [
			'AbilityStats',
			'NumerospecAbout',
			'Relation',
			'ConversationPattern'
		].includes(key));

		expect(orderedSubFieldKeys).toEqual([
			'AbilityStats',
			'NumerospecAbout',
			'Relation',
			'ConversationPattern'
		]);
		expect(getBasicFieldValue('“カバラの加護”(数秘的加護)について')).toBe('');
		expect(isCollapsibleSubFieldSection('NumerospecAbout')).toBe(false);
		expect(isCollapsibleSubFieldSection('Relation')).toBe(true);
	});

	it('keeps string-like subFields non-collapsible when hideText wraps the stored value', async () => {
		const customGlobalMeta = structuredClone(globalMeta);
		customGlobalMeta.CreationWorks['#Works_NumberTales'].$DetailLayout.subFields = ['NumerospecAbout'];

		charactersModule.__setCharactersTestState({
			globalMeta: customGlobalMeta,
			charState: {
				db: 'Secondary',
				workId: '#Works_NumberTales',
				records: numberTalesSecondaryRecords,
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_NumberTales', {
			...hexademicalRecord,
			NumerospecAbout: { hideText: '極秘事項' }
		});

		const numerospecAboutSection = getSubFieldSectionNode('NumerospecAbout');
		expect(numerospecAboutSection).not.toBeNull();
		expect(isCollapsibleSubFieldSection('NumerospecAbout')).toBe(false);
		expect(numerospecAboutSection?.textContent || '').toContain('極秘事項');
		expect(numerospecAboutSection?.textContent || '').not.toContain('hideText');
	});

	it('renders NumberTales stats as standalone subField sections driven by detail layout', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Primary',
				workId: '#Works_NumberTales',
				records: numberTalesPrimaryRecords,
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_NumberTales', ninthNumberTalesPrimaryRecord);

		const abilitySection = getSubFieldSectionNode('AbilityStats');
		const numerospecSection = getSubFieldSectionNode('NumerospecStats');
		expect(abilitySection).not.toBeNull();
		expect(numerospecSection).not.toBeNull();
		expect(isCollapsibleSubFieldSection('AbilityStats')).toBe(true);
		expect(isCollapsibleSubFieldSection('NumerospecStats')).toBe(true);
		expect(isSubFieldSectionOpen('AbilityStats')).toBe(false);
		expect(isSubFieldSectionOpen('NumerospecStats')).toBe(false);
		expect(abilitySection?.textContent || '').toContain('俊敏性');
		expect(numerospecSection?.textContent || '').toContain('特殊パターン');
		expect(getSectionNode('スペック/能力')).toBeNull();
	});

	it('renders other-work spec stats as standalone subField sections and keeps nested profile rows inside them', async () => {
		await charactersModule.renderDetail('#Works_PastDivers', yayoiRecord);

		const chronoSection = getSectionNode('時空遷移能力の特性');
		const chronoTags = getSectionTagTexts('時空遷移能力の特性');
		expect(chronoSection).not.toBeNull();
		expect(chronoSection?.textContent || '').toContain('時空遷移(クロノイド)状態に関する概要');
		expect(chronoTags).toContain('物理的作用: B（標準 / Normal）');
		expect(chronoTags).toContain('治癒効果: 公開不能 / Openly Not');
		expect(chronoTags).toContain('安全レベル: 公開不能 / Openly Not');
		expect(chronoTags).not.toContain('安全レベル');

		const profileSectionText = getSectionText('プロフィール/テキスト');
		expect(profileSectionText).not.toContain('時空遷移(クロノイド)状態に関する概要');
		expect(getSectionNode('スペック/能力')).toBeNull();
	});

	it('renders enum-link alphaLabel values as bilingual code labels', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Primary',
				workId: '#Works_FLInvestigator78',
				records: flInvestigatorPrimaryRecords,
				workTypeDef: flInvestigatorWorkTypeDef,
				globalTypeDef,
				workMeta: flInvestigatorWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_FLInvestigator78', phoenixRecord);

		const specTags = getSectionTagTexts('アルカナムスペック(アルカナ能力)の特性');
		expect(specTags).toContain('能力レベル: S+（かなり強力 / Quite Powerful）');
	});

	it('does not render private records in detail view', async () => {
		await charactersModule.renderDetail('#Works_PastDivers', {
			...yayoiRecord,
			isPrivate: true
		});

		expect(document.querySelector('#detail-title')?.textContent?.trim()).toBe('非公開');
		expect(document.querySelector('#detail')?.textContent?.trim()).toContain('このキャラクターは非公開です。');
		expect(document.querySelector('#detail')?.textContent?.includes('桜花 訫')).toBe(false);
	});

	it('renders references layer records with shared references typedef labels', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Reference',
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		const originalFetch = globalThis.fetch;
		globalThis.fetch = async (input) => {
			const url = String(input);
			if (url.includes('/data/References/db_type.json')) {
				return new Response(JSON.stringify(sharedReferencesTypeDef), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			throw new Error(`Unexpected fetch in references typedef test: ${url}`);
		};

		try {
			await charactersModule.renderDetail('#Works_NumberTales', numberTalesReferenceRecord);
		} finally {
			globalThis.fetch = originalFetch;
		}

		expect(document.querySelector('#detail-title')?.textContent?.trim()).toBe('ナンバーテールズについて');
		expect(getBasicFieldValue('資料名')).toBe('ナンバーテールズについて / About NumberTales');
		expect(getBasicFieldValue('分類')).toBe('キャラクターの基本情報');
		const profileSectionText = getSectionText('プロフィール/テキスト');
		expect(profileSectionText).toContain('概要');
		expect(profileSectionText).toContain('本文ブロック');
		expect(profileSectionText).toContain('普段人類がなんの違和感もなく数える数字だが');
	});

	it('formats story era summaries from structured era points when about_JP is absent', () => {
		expect(charactersModule.__getStoryEraSummaryForTest({
			InEra: [
				{ EraGen: 9, YearInEra: 3 },
				{ byRealYear: 2050 }
			]
		})).toBe('第9創世紀3年 / 西暦2050年');

		expect(charactersModule.__getStoryEraSummaryForTest({
			FromEra: [{ EraGen: 9, YearInEra: 3 }],
			ToEra: [{ EraGen: 9, YearInEra: 4 }]
		})).toBe('開始: 第9創世紀3年 / 終了: 第9創世紀4年');
	});

	it('keeps day summary formatting after role-based schema lookup is introduced', async () => {
		await charactersModule.renderDetail('#Works_PastDivers', {
			...yayoiRecord,
			BirthDay: {
				Day: { Month: 8, DayOfMonth: 15 },
				DayAbout: '誕生日'
			}
		});

		expect(getBasicFieldValue('誕生日')).toBe('8/15（誕生日）');
	});

	it('renders references poster images using work-local image typedef folder hints', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Glossary',
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		const originalFetch = globalThis.fetch;
		globalThis.fetch = async (input) => {
			const url = String(input);
			if (url.includes('/data/References/db_type.json')) {
				return new Response(JSON.stringify(sharedReferencesTypeDef), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			if (url.includes('/data/Works_NumberTales/References/db_type.json')) {
				return new Response(JSON.stringify(numberTalesReferencesTypeDef), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			throw new Error(`Unexpected fetch in references image typedef test: ${url}`);
		};

		try {
			await charactersModule.renderDetail('#Works_NumberTales', numberTalesGlossaryImageRecord);
		} finally {
			globalThis.fetch = originalFetch;
		}

		const poster = document.querySelector('img.poster');
		expect(poster).not.toBeNull();
		expect(poster.getAttribute('src')).toBe('/data/Works_NumberTales/Images/Ref_Glossary/concept-figure/cnsp-fg_NTsHumanoid.png');
	});

	it('renders glossary and reference list cards using Term and Title fallbacks', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Glossary',
				workId: '#Works_NumberTales',
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.__renderListForTest(numberTalesGlossaryRecords, '#Works_NumberTales', { imageFields: [] });
		expect(getListTitles()).toContain('数秘加護');
		expect(getListSubtitles()).toContain('Numerospec');

		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Reference',
				workId: '#Works_NumberTales',
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.__renderListForTest(numberTalesReferenceRecords, '#Works_NumberTales', { imageFields: [] });
		expect(getListTitles()).toContain('ナンバーテールズについて');
		expect(getListSubtitles()).toContain('About NumberTales');
	});

	it('renders NumberTales list headings using only the character name', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Primary',
				workId: '#Works_NumberTales',
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.__renderListForTest([firstNumberTalesPrimaryRecord], '#Works_NumberTales', { imageFields: [] });

		expect(getListTitles()).toContain('1(ハジメ)');
		expect(getListTitles()).not.toContain('1(ハジメ)（1）');
		expect(getListSubtitles()).toContain('1(Unitta)');
	});

	it('builds list thumbnail paths under Ref image directories for references dbs', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Glossary',
				workId: '#Works_NumberTales',
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: [
					{
						field: 'concept-figure_PNGName',
						folderHint: 'concept-figure',
						category: 'concept',
						type: '#Image|#PNG',
						priority: 1
					}
				]
			}
		});

		await charactersModule.__renderListForTest([
			{
				Term: '画像付き用語',
				Images: {
					'concept-figure_PNGName': 'glossary-sample'
				}
			}
		], '#Works_NumberTales', {
			imageFields: [
				{
					field: 'concept-figure_PNGName',
					folderHint: 'concept-figure',
					category: 'concept',
					type: '#Image|#PNG',
					priority: 1
				}
			]
		});

		const img = document.querySelector('#list img.thumb');
		expect(img).not.toBeNull();
		expect(img.getAttribute('src')).toBe('/data/Works_NumberTales/Images/Ref_Glossary/concept-figure/glossary-sample.png');
	});

	it('renders related terms and related creations as navigable links for references records', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Reference',
				workId: '#Works_NumberTales',
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		const originalFetch = globalThis.fetch;
		globalThis.fetch = async (input) => {
			const url = String(input);
			if (url.includes('/data/References/db_type.json')) {
				return new Response(JSON.stringify(sharedReferencesTypeDef), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			throw new Error(`Unexpected fetch in references link test: ${url}`);
		};

		const linkedRecord = {
			...numberTalesReferenceRecord,
			RelatedTerms: ['数秘加護'],
			RelatedCreations: [
				{ RelatedWorks: '#Works_NumberTales', RelatedDB: 'Glossary' },
				{ RelatedWorks: '#Works_NumberTales', RelatedDB: 'Primary' }
			]
		};

		try {
			await charactersModule.renderDetail('#Works_NumberTales', linkedRecord);
		} finally {
			globalThis.fetch = originalFetch;
		}

		const section = getSectionNode('関連情報');
		expect(section).not.toBeNull();

		const links = Array.from(section.querySelectorAll('a'));
		const termLink = links.find((link) => link.textContent?.trim() === '数秘加護');
		expect(termLink).toBeTruthy();
		expect(new URL(termLink.href).searchParams.get('db')).toBe('Glossary');
		expect(new URL(termLink.href).searchParams.get('q')).toBe('数秘加護');

		const creationLinks = links.filter((link) => link.textContent?.includes('ナンバーテールズ / '));
		expect(creationLinks.length).toBeGreaterThanOrEqual(2);
		const glossaryLink = creationLinks.find((link) => new URL(link.href).searchParams.get('db') === 'Glossary');
		const primaryLink = creationLinks.find((link) => new URL(link.href).searchParams.get('db') === 'Primary');
		expect(glossaryLink).toBeTruthy();
		expect(primaryLink).toBeTruthy();
	});
});
