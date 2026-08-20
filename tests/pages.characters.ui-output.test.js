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

/**
 * ビューアの直リンク URL を分解する
 * 現行の圧縮ロケータ（`?c=Work/Db/Key:Value`）と旧形式（work/db/idx/idxKey の個別キー）の双方を読む
 * @param {string} href - 直リンク URL
 * @returns {{work: string, db: string, idx: string, idxKey: string, q: string}}
 */
function parseViewerHref(href) {
	const params = new URL(href, 'http://127.0.0.1:5500/pages/characters.html').searchParams;
	const locator = String(params.get('c') || '');
	const [work = '', db = '', ...rest] = locator ? locator.split('/') : [];
	const token = rest.join('/');
	const sep = token.startsWith('{') ? -1 : token.indexOf(':');

	return {
		work: params.get('work') || work,
		db: params.get('db') || db,
		idx: params.get('idx') || (sep > 0 ? token.slice(sep + 1) : token),
		idxKey: params.get('idxKey') || (sep > 0 ? token.slice(0, sep) : ''),
		q: params.get('q') || ''
	};
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
		...(type.$MetaType && typeof type.$MetaType === 'object' && !Array.isArray(type.$MetaType) ? { $MetaType: type.$MetaType } : {}),
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
		const fileName = (typeof info.dictFile === 'string' && info.dictFile.trim())
			? info.dictFile.trim()
			: `dict_${derivedName}.json`;
		// scopeField（例: { Belonging: 'シンフォニー.XVI(ゼクズィン)' }）は辞書ファイル1本まるごとの条件のため、
		// 読み込み時に全行へ合成する（lib/sw-common.js / pages/characters.js のローダーと同じ挙動を再現）
		const scopeCondition = (info.scopeField && typeof info.scopeField === 'object' && !Array.isArray(info.scopeField))
			? info.scopeField
			: null;
		const rawRows = loadJson(`${relDir}/${fileName}`);
		const rows = scopeCondition
			? rawRows.map((row) => (row && typeof row === 'object' ? { ...scopeCondition, ...row } : row))
			: rawRows;
		vars[dictKey] = rows;
		// 同じ compatListKey（例: #List_Class）を持つ辞書が複数ある場合は上書きせず連結する
		if (!vars[compatListKey]) vars[compatListKey] = [];
		if (Array.isArray(vars[compatListKey])) vars[compatListKey].push(...rows);
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

/**
 * 基本情報テーブルの JP/EN 2列表示（bilingual-lines-grid）を列ごとの行配列で取り出す
 *
 * @description 和英いずれかに改行を含む値は 1 セル内で左右 2 列へ分かれるため、
 * textContent を連結した `getBasicFieldValue()` では行の境界が潰れてしまう。
 * 2 列表示の検証にはこちらを使う。
 * @param {string} label - 行見出し（th）のラベル
 * @returns {{jp: string[], en: string[]}|null} 2列表示でない場合は null
 */
function getBasicFieldBilingualLines(label) {
	const rows = Array.from(document.querySelectorAll('.kv-table tr'));
	const row = rows.find((tr) => tr.querySelector('th')?.textContent?.trim() === label);
	const grid = row?.querySelector('.bilingual-lines-grid');
	if (!grid) return null;
	const readColumn = (langClass) => Array.from(
		grid.querySelectorAll(`.bilingual-lines--${langClass} .bilingual-lines__line`)
	).map((node) => node.textContent?.trim() || '');

	return { jp: readColumn('jp'), en: readColumn('en') };
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

function getDetailText() {
	return document.querySelector('#detail')?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function countOccurrences(haystack, needle) {
	if (!needle) return 0;
	return haystack.split(needle).length - 1;
}

/**
 * 空白を除去して突き合わせる。
 * カンマ区切りの値（例: "partner, buddy"）はレンダラーが要素を分けて描画するため、
 * textContent 上では区切りの空白が失われる。値の一致判定はこの正規化を通す。
 * @param {string} s
 * @returns {string} 空白を除去した文字列
 */
function squashSpaces(s) {
	return String(s ?? '').replace(/\s+/g, '');
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
// Works_Proxies は Works_DestinyFoxRecords へ統合済み（Proxy DB として編入）
const proxiesWorkTypeDef = loadJson('data/Works_DestinyFoxRecords/DataBases/db_type.json');
const proxiesWorkMeta = buildWorkMetaFixture('Works_DestinyFoxRecords');
const proxyRecords = loadJson('data/Works_DestinyFoxRecords/DataBases/db_Proxy.json');
const secondGenProxyRecord = proxyRecords.find((record) => Number(record?.Generation) === 2);
const numberTalesWorkTypeDef = loadJson('data/Works_NumberTales/DataBases/db_type.json');
const numberTalesWorkMeta = buildWorkMetaFixture('Works_NumberTales');
// References レイヤーの DB カタログ（#Ref_Vocabulary / #Ref_Reference）を workMeta に合流する。
// 実データでは References/db_meta.json に分離されているため、findDbCatalogEntry が
// DB_Layer='References' を解決できるよう全エントリを取り込む。これにより画像ディレクトリが
// 汎用の Ref_<DB名> 経路（mapDbNameToImageDir の References 分岐）で正しく解決される。
const numberTalesReferencesMeta = loadJson('data/Works_NumberTales/References/db_meta.json');
const numberTalesRefDbs = numberTalesReferencesMeta?.Databases || {};
if (Object.keys(numberTalesRefDbs).length) {
	numberTalesWorkMeta.Databases = { ...(numberTalesWorkMeta.Databases || {}), ...numberTalesRefDbs };
}
const numberTalesPrimaryRecords = loadJson('data/Works_NumberTales/DataBases/db_Primary.json');
const numberTalesSecondaryRecords = loadJson('data/Works_NumberTales/DataBases/db_Secondary.json');
const numberTalesSemiPrimaryRecords = loadJson('data/Works_NumberTales/DataBases/db_SemiPrimary.json');
const numberTalesSelfSecondaryRecords = loadJson('data/Works_NumberTales/DataBases/db_SelfSecondary.json');
const unibyteLiveWorkTypeDef = loadJson('data/Works_UnibyteLive/DataBases/db_type.json');
const unibyteLiveWorkMeta = mergeMetaAndTypeVars(
	loadJson('data/Works_UnibyteLive/DataBases/db_meta.json'),
	unibyteLiveWorkTypeDef
);
const unibyteLivePrimaryRecords = loadJson('data/Works_UnibyteLive/DataBases/db_Primary.json');
const unibyteLiveArrowRecord = unibyteLivePrimaryRecords.find((record) => record?.Name_JP === 'A:アロー');
// `Relation`（同DB）と `RelationTo_PrimaryPerformer`（別DB）を同時に持ち、
// どちらも複合インデックス（Letter{Alphabet, AlphaGen}）で参照先を指しているレコード。
// Z:ジグ は `Relation.Related[0]` が S/2（S:ナーミィ）、`RelationTo_PrimaryPerformer.Commented[0]` が S/1 を指すため、
// 「Alphabet を落とすと A/2（A:エイリ）へ誤爆する」という本テストの検証条件をそのまま満たす。
// （旧フィクスチャの N:ギザン は DB 更新で `RelationTo_PrimaryPerformer` を持たなくなったため差し替えた）
const unibyteLiveZigRecord = unibyteLivePrimaryRecords.find((record) => record?.Name_JP === 'Z:ジグ');
// StreamingActivity の中身（和英共有フィールド + bilingual wrapper）が一通り埋まっているレコード
const unibyteLiveNarmyRecord = unibyteLivePrimaryRecords.find((record) => record?.Name_JP === 'S:ナーミィ');
const unauthedLogicaWorkTypeDef = loadJson('data/Works_UnauthedLogica/DataBases/db_type.json');
const unauthedLogicaWorkMeta = buildWorkMetaFixture('Works_UnauthedLogica');
const unauthedLogicaMobRecords = loadJson('data/Works_UnauthedLogica/DataBases/db_PrimaryMobs.json');
const nixeeRecord = unauthedLogicaMobRecords.find((record) => String(record?.Logic?.Num) === '55ID1');
const sharedReferencesTypeDef = loadJson('data/References/db_type.json');
const sharedReferencesMeta = loadJson('data/References/db_meta.json');
const numberTalesReferencesTypeDef = loadJson('data/Works_NumberTales/References/db_type.json');
const numberTalesVocabularyRecords = loadJson('data/Works_NumberTales/References/ref_Vocabulary.json');
const numberTalesReferenceRecords = loadJson('data/Works_NumberTales/References/ref_Reference.json');
const hexademicalRecord = numberTalesSecondaryRecords.find((record) => record?.Num === '0xA');
// 「二次創作情報」セクションの検証には sec_Category を実際に持つレコードが要る。
// 旧フィクスチャの `223-jw` は sec_Category が null 化され、行が出ないのが正しい状態になった。
const requestNumberRecord = numberTalesSelfSecondaryRecords.find((record) => String(record?.Num) === '223');
const numberTalesVocabularyImageRecord = numberTalesVocabularyRecords.find((record) => record?.Term_JP === 'ヒューマノイド形態');
const numberTalesReferenceRecord = numberTalesReferenceRecords.find((record) => record?.Title_JP === 'ナンバーテールズ');
const firstNumberTalesPrimaryRecord = numberTalesPrimaryRecords.find((record) => String(record?.Num) === '1');
// ForMasterCalling_JP/_EN の値が互いに重複せずレコード内で一意なため、二重表示の検出に使える
const thirdNumberTalesPrimaryRecord = numberTalesPrimaryRecords.find((record) => String(record?.Num) === '3');
const fourthNumberTalesPrimaryRecord = numberTalesPrimaryRecords.find((record) => String(record?.Num) === '4');
const ninthNumberTalesPrimaryRecord = numberTalesPrimaryRecords.find((record) => String(record?.Num) === '9');
const sixtyFirstNumberTalesPrimaryRecord = numberTalesPrimaryRecords.find((record) => String(record?.Num) === '61');
const branchedTailsUnitRecord = numberTalesSecondaryRecords.find((record) => String(record?.Num) === '148-numberize');

const yayoiRecord = {
	...yayoiRecordBase,
	Belonging: ['夜月機関'],
	FromArea: { Area: '九蓮国', BaseAreaAbout_JP: '幼少期のみ' },
	Class: ['幹部', '弥生研究所(破滅対策本部2課)']
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

		// FormalName_EN が別名義併記（複数行）になったため、正式名称は
		// 「JP / EN」連結ではなく JP/EN 左右 2 列の bilingual 表示へ切り替わる
		expect(getBasicFieldBilingualLines('正式名称')).toEqual({
			jp: ['桜花 訫'],
			en: ['Trustia Cherrybroom', 'Sakura Shinrie']
		});
		// 単一行の和英ペアは従来どおり「JP / EN」連結のまま
		// Belonging は `$Def_Faction[]`。辞書行の FactionsBaseArea まで参照解決して併記される
		expect(getBasicFieldValue('所属')).toBe('夜月機関 / Yadzuki Organization（九蓮国 / LotusNinea）');
		// FromArea（`$Def_BaseArea`）は baseAreaSummary wrapper が「地域（補足）」へ整形する
		expect(getBasicFieldValue('出身地')).toBe('九蓮国 / LotusNinea（幼少期のみ）');

		const classText = getBasicFieldValue('クラス名');
		expect(classText).toContain('幹部 / Executive Director');
		expect(classText).toContain('弥生研究所(破滅対策本部2課) / Laboratory.3(Pandemic Affairs Countermeasures Headquarter.2)');
	});

	it('renders enum and hideText values in basic info table', async () => {
		await charactersModule.renderDetail('#Works_PastDivers', yayoiRecord);

		expect(getBasicFieldValue('性別')).toBe('女性 / Female');
		expect(getBasicFieldValue('体重_kg')).toBe('非公開希望');
	});

	// ChronoholderName は $DetailLayout の basicFields から subFields の先頭へ移した項目。
	// 和英併記の値が基本情報テーブルではなく standalone subField セクションへ出ることを守る
	it('renders a bilingual name subField as the leading standalone section once moved out of basicFields', async () => {
		await charactersModule.renderDetail('#Works_PastDivers', yayoiRecord);

		expect(getBasicFieldValue('時空象器能力名')).toBe('');
		expect(getSubFieldSectionNode('ChronoholderName')?.textContent || '').toContain('時空開花 / ChronoBloom');
		expect(getSubFieldSectionKeys()[0]).toBe('ChronoholderName');
		// 元の typedef が text-like なら折りたたみ対象にしない
		expect(isCollapsibleSubFieldSection('ChronoholderName')).toBe(false);
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

	// langMode: 'shared' の RaceType は、辞書に RaceType_EN があればそれを表示する
	// （未定義の場合のみベースコード（例: 'Warfox(Acquired)'）へフォールバックする）
	it('renders shared RaceType dictionary values in English from the dictionary label', async () => {
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

		await charactersModule.renderDetail('#Works_DestinyFoxRecords', secondGenProxyRecord);

		expect(getBasicFieldValue('Race')).toBe('Warfox (Acquired)');
	});

	// `unit_JP` / `unit_EN`（+ `unit_EN_ordinal` による英語の序数化）は数値フィールドの単位表示。
	// かつてハンカクライブの `Generation` が唯一の宣言だったが `Class` へ統合されて実データから消え、
	// 現在リポジトリ内に `unit_JP` 宣言を持つフィールドは 1 つも無い。描画実装（`pages/characters.js`）は
	// 生きているため、合成 typedef ＋ 合成 `$DetailLayout` で回帰検出だけを残す。
	// 実データに `unit_JP` 宣言が復活したら、そのフィールドを使う形へ戻してよい。
	it('renders unit_JP for numeric fields in Japanese and ordinal unit_EN in English', async () => {
		const unitWorkTypeDef = structuredClone(unibyteLiveWorkTypeDef);
		unitWorkTypeDef.$DefType.push({
			hashTag: 'DebutGen',
			$type: '#Number|#Null',
			hashTag_JP: 'デビュー世代',
			hashTag_EN: 'Debut Generation',
			$display: { unit_JP: '期生', unit_EN: 'Gen.', unit_EN_ordinal: true }
		});
		const unitGlobalMeta = structuredClone(globalMeta);
		unitGlobalMeta.CreationWorks['#Works_UnibyteLive'].$DetailLayout.basicFields.unshift('DebutGen');
		const unitRecord = { ...unibyteLiveArrowRecord, DebutGen: 0 };

		charactersModule.__setCharactersTestState({
			globalMeta: unitGlobalMeta,
			charState: {
				db: 'Primary',
				pageLang: 'jp',
				workTypeDef: unitWorkTypeDef,
				globalTypeDef,
				workMeta: unibyteLiveWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_UnibyteLive', unitRecord);
		expect(getBasicFieldValue('デビュー世代')).toBe('0期生');

		charactersModule.__setCharactersTestState({
			globalMeta: unitGlobalMeta,
			charState: {
				db: 'Primary',
				pageLang: 'en',
				workTypeDef: unitWorkTypeDef,
				globalTypeDef,
				workMeta: unibyteLiveWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_UnibyteLive', unitRecord);
		expect(getBasicFieldValue('Debut Generation')).toBe('0th Gen.');
	});

	it('builds a composite index identifier when single index keys are ambiguous', () => {
		const rec = unibyteLivePrimaryRecords.find((record) => record?.Name_JP === 'S:ツェット');
		const indexDef = unibyteLiveWorkTypeDef?.$IndexDef || null;
		const id = charactersModule.__getIndexIdentifierFromRecordForTest(rec, indexDef, unibyteLivePrimaryRecords);

		expect(id).toBeTruthy();
		expect(id.keyPath).toBe('__conditions__');
		expect(typeof id.value).toBe('string');

		// 複合条件では主Index の root（Letter）を落とす（1レコード1オブジェクトのため情報量が無い）
		const parsed = JSON.parse(id.value);
		expect(parsed?.Alphabet).toBe('S');
		expect(parsed?.AlphaGen).toBe('1');
	});

	it('groups multi-field index pills per index root in the detail hero', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'PrimaryMobs',
				workId: '#Works_UnauthedLogica',
				records: unauthedLogicaMobRecords,
				workTypeDef: unauthedLogicaWorkTypeDef,
				globalTypeDef,
				workMeta: unauthedLogicaWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_UnauthedLogica', nixeeRecord);

		// Logic / LogicAlt の 2 ルートがそれぞれ 1 ピルに集約される
		const groupPills = Array.from(document.querySelectorAll('.pill--index-group'));
		expect(groupPills.length).toBe(2);

		const [logicPill, logicAltPill] = groupPills;
		expect(logicPill.querySelector('.pill__group-label')?.textContent?.trim()).toBe('論理/ロジック');
		// フィールド情報は .pill__group-items の 1 ユニットにまとまり、
		// 表示順は $IndexDef の typedef 宣言順（LogicSeries → Num）に従う
		// （辞書ラベルは環境により和英併記になるため、前方一致で検証する）
		expect(logicPill.querySelector('.pill__group-items')).not.toBeNull();
		const logicItems = Array.from(logicPill.querySelectorAll('.pill__group-item')).map((node) => node.textContent?.trim() || '');
		expect(logicItems.length).toBe(2);
		expect(logicItems[0].startsWith('ロジック系統: キリルシリーズ')).toBe(true);
		expect(logicItems[1]).toBe('ロジック番号: 55ID1');

		expect(logicAltPill.querySelector('.pill__group-label')?.textContent?.trim()).toBe('互換論理/互換ロジック');
		const logicAltItems = Array.from(logicAltPill.querySelectorAll('.pill__group-item')).map((node) => node.textContent?.trim() || '');
		expect(logicAltItems.length).toBe(2);
		expect(logicAltItems[0].startsWith('ロジック系統: 7400シリーズ')).toBe(true);
		expect(logicAltItems[1]).toBe('ロジック番号: 141');

		// グループピル全体が直リンクになる。
		// 主Index（Logic）はカテゴリキー（LogicSeries）起点のレコード識別子、
		// エイリアスIndex（LogicAlt）は従来どおり主要サブフィールドの keyPath を使う。
		// この DB では LogicSeries:K1 が単独で一意なので、Num は付かない。
		expect(logicPill.tagName).toBe('A');
		expect(new URL(logicPill.href).searchParams.get('c'))
			.toBe('UnauthedLogica/PrimaryMobs/Logic.LogicSeries:K1');
		expect(logicAltPill.tagName).toBe('A');
		expect(parseViewerHref(logicAltPill.href).idxKey).toBe('LogicAlt.Num');
	});

	it('keeps scalar index pills as plain single pills without grouping', async () => {
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

		await charactersModule.renderDetail('#Works_NumberTales', firstNumberTalesPrimaryRecord);

		expect(document.querySelector('.pill--index-group')).toBeNull();
		const pillTexts = Array.from(document.querySelectorAll('.pill')).map((node) => node.textContent?.trim() || '');
		expect(pillTexts.some((text) => text === '番号: 1')).toBe(true);
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
		expect(secondarySectionText).toContain('ラジアン（柏木主税）');
	});

	it('does not render secondary metadata section outside secondary db context', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Primary',
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		const syntheticRecord = {
			...firstNumberTalesPrimaryRecord,
			sec_Category: '共同二次創作',
			sec_DesignedBy: ['Atast']
		};

		await charactersModule.renderDetail('#Works_NumberTales', syntheticRecord);

		expect(getSectionNode('二次創作情報')).toBeNull();
		expect(getSectionNode('Secondary Info')).toBeNull();
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
		expect(secondarySectionText).toContain('二次創作シリーズ名');
		expect(secondarySectionText).toContain('ヘキサデミカル・テールズ');
		expect(secondarySectionText).toContain('二次創作分類');
		expect(secondarySectionText).toContain('共同二次創作');
		expect(secondarySectionText).toContain('キャラクターデザイン・考案');
		expect(secondarySectionText).toContain('散狐アタスト');

		const relationSection = getSectionNode('関係キャラクター');
		expect(relationSection?.tagName).toBe('DETAILS');
		expect(relationSection?.open).toBe(true);
		expect(getSectionNode('原作との関係')).not.toBeNull();
		expect(getSectionNode('基本個体との関係')).toBeNull();
	});

	it('resolves Class values via a Belonging-scoped dictionary (scopeField)', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'SemiPrimary',
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		// 錦野 舞 は db_SemiPrimary.json に移動済み（Belonging は直接レコードに入っている）。
		// Class の1要素（グローバルの汎用クラス辞書には存在しない値）が
		// scopeField 付きの #Dict_SymphonyXVI（Belonging一致行）から解決できることを確認する。
		const dancyActresssilkRaw = structuredClone(numberTalesSemiPrimaryRecords.find((record) => record?.Name_JP === '錦野 舞'));
		// Belonging は `$Def_Faction[]`（`{ Faction }` 子要素）なので、scopeField 照合対象の値を取り出して確認する
		const dancyBelongingFactions = (Array.isArray(dancyActresssilkRaw?.Belonging) ? dancyActresssilkRaw.Belonging : [])
			.map((item) => (item && typeof item === 'object') ? item.Faction : item);
		expect(dancyBelongingFactions).toContain('シンフォニー.XVI(ゼクズィン)');
		// isPrivate チェックを通すためここだけ上書き
		const dancyActresssilkRecord = { ...dancyActresssilkRaw, isPrivate: false };

		await charactersModule.renderDetail('#Works_NumberTales', dancyActresssilkRecord);

		const classText = getBasicFieldValue('クラス名');
		expect(classText).toContain('ベヴストザイン課 ヒューマノイド開発部 / Bewußtsein Division, Humanoid Development Department');

		// object 形式（`{ Faction }`）でも、辞書行の FactionsBaseArea が併記される（1 所属 1 行）
		const belongingText = getBasicFieldValue('所属');
		expect(belongingText).toContain('シンフォニー.XVI(ゼクズィン) / Symphony.XVI(Sechzehn)（黒薔薇国 / SchwarzeRoseland）');
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
		expect(section?.open).toBe(true);

		const links = Array.from(section.querySelectorAll('a'));
		const primaryLink = links.find((link) => link.textContent?.trim() === '1');
		expect(primaryLink).toBeTruthy();

		// 直リンクは圧縮ロケータ（?c=Work/Db/Key:Value）で生成される
		expect(new URL(primaryLink.href).searchParams.get('c')).toBe('NumberTales/Primary/Num:1');

		const link = parseViewerHref(primaryLink.href);
		expect(link.db).toBe('Primary');
		expect(link.idx).toBe('1');
		expect(link.idxKey).toBe('Num');

		// 旧 ?num= は読み取り互換のみで、生成側では出力しない
		expect(new URL(primaryLink.href).searchParams.get('num')).toBeNull();
	});

	// ハンカクライブは複合インデックス（`Letter{Alphabet, AlphaGen}`）を採用している。
	// かつて Relation の参照は `pickPrimaryIndexSubDef()` が選ぶサブフィールド 1 つ（= `AlphaGen`）
	// だけで照合していたため、「S の第2世代」を指したつもりが「最初に見つかった第2世代」
	// （A:エイリ）へ誤爆していた。同DB参照・別DB参照の双方が複合条件で解決されることを守る。
	it('resolves Relation and RelationTo_* entries of composite index works to the right records', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Primary',
				workId: '#Works_UnibyteLive',
				records: unibyteLivePrimaryRecords,
				workTypeDef: unibyteLiveWorkTypeDef,
				globalTypeDef,
				workMeta: unibyteLiveWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_UnibyteLive', unibyteLiveZigRecord);

		// 2 つの Relation 系フィールドはどちらもセクションとして描画される
		const relationSection = getSubFieldSectionNode('Relation') || getSectionNode('関係キャラクター');
		const performerSection = getSubFieldSectionNode('RelationTo_PrimaryPerformer')
			|| getSectionNode('アルベッツ演者との関係');
		expect(relationSection).not.toBeNull();
		expect(performerSection).not.toBeNull();

		// 同DB参照: S/2 は S:ナーミィ。Alphabet を落とすと A:エイリ（A/2）へ誤爆する
		// （Related は複数件あり得るので、先頭ではなく S/2 を指すリンクを拾う）
		const relationLinks = Array.from(relationSection.querySelectorAll('a')).map((anchor) => ({
			text: anchor.textContent?.trim(),
			c: new URL(anchor.href).searchParams.get('c')
		}));
		expect(relationLinks).toContainEqual({
			text: 'S:ナーミィ',
			c: 'UnibyteLive/Primary/Alphabet:S,AlphaGen:2'
		});

		// 別DB参照: レコード取得前のプレースホルダに JSON ペイロードを出さず、直リンクは複合条件で組む
		const performerLink = performerSection.querySelector('a');
		expect(performerLink?.textContent?.trim()).toBe('S1');
		expect(new URL(performerLink.href).searchParams.get('c'))
			.toBe('UnibyteLive/PrimaryPerformer/Alphabet:S,AlphaGen:1');
	});

	// StreamingActivity の配列系（StreamingCategory / StreamingGreeting / StreamingAwards）は
	// JP/EN を別フィールドへ分けず、1 要素に `value_JP` / `value_EN`（＋ `about_JP` / `about_EN`）を
	// 持つ和英共有フィールドとして宣言している。ページ言語に応じて片方が選ばれることを守る。
	// `ListenerNickname` だけは bilingual wrapper のままなので JP/EN 併記で残る。
	const renderNarmyStreamingActivity = async (pageLang) => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Primary',
				pageLang,
				workId: '#Works_UnibyteLive',
				records: unibyteLivePrimaryRecords,
				workTypeDef: unibyteLiveWorkTypeDef,
				globalTypeDef,
				workMeta: unibyteLiveWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_UnibyteLive', unibyteLiveNarmyRecord);

		const section = getSubFieldSectionNode('StreamingActivity');
		expect(section).not.toBeNull();
		return section.textContent?.replace(/\s+/g, ' ').trim() || '';
	};

	it('renders StreamingActivity shared bilingual fields in Japanese for the jp page language', async () => {
		const text = await renderNarmyStreamingActivity('jp');

		// value_JP + about_JP が選ばれる（value_EN / about_EN は出さない）
		expect(text).toContain('リスナーとの交流');
		expect(text).toContain('メイン活動,「ユニバイト・ユニバース」内での活動');
		expect(text).not.toContain('Interaction with listeners');
		// wrapper から共有フィールドへ移した挨拶・実績も JP 側が出る
		expect(text).toContain('こんな～み！');
		expect(text).toContain('ゲームエンジン特許あり');
		expect(text).not.toContain('Holds a game engine patent');
		// bilingual wrapper のまま残した ListenerNickname も JP 側が出る
		// （JP/EN 2 列表示は `_enrichment.bilingualWrapperFields` 駆動のため、
		//   enrich を通していない素レコードを渡すこのテストでは単独表示になる）
		expect(text).toContain('なみのりー');
	});

	it('renders StreamingActivity shared bilingual fields in English for the en page language', async () => {
		const text = await renderNarmyStreamingActivity('en');

		expect(text).toContain('Interaction with listeners');
		expect(text).toContain("Main activity within 'Unibyte Universe'");
		expect(text).not.toContain('リスナーとの交流');
		expect(text).toContain('Hi, Surger!');
		expect(text).toContain('Holds a game engine patent');
		expect(text).not.toContain('ゲームエンジン特許あり');
	});

	// StreamingActivity は専用 renderer（streamingActivitySection）を持つが、DOM 構成は
	// 汎用 structuredObjectSection（ConversationPattern 等）と同じ
	// 「親ラベルタグ → 子ラベルタグ + 本文ブロックの縦積み」へ揃える。
	// 旧実装は子フィールドを `ラベル: 値` の 1 タグへ詰めた detail-tag-grid だったため、
	// 他の subField セクションから浮いて見えていた。
	it('renders StreamingActivity with the same block composition as generic subField sections', async () => {
		await renderNarmyStreamingActivity('jp');

		const section = getSubFieldSectionNode('StreamingActivity');
		const outerBlock = section?.querySelector('.section__body > div');
		expect(outerBlock).not.toBeNull();

		// 先頭は親フィールドのラベルタグ
		expect(outerBlock.firstElementChild?.classList.contains('tag')).toBe(true);
		expect(outerBlock.firstElementChild?.textContent?.trim()).toBe('配信活動について');

		// 子フィールドは 1 件 1 ブロックで、先頭要素がラベルタグ・後続が本文
		const childBlocks = Array.from(outerBlock.lastElementChild?.children || []);
		expect(childBlocks.map((node) => node.firstElementChild?.textContent?.trim())).toEqual([
			'配信ジャンルについて',
			'配信挨拶',
			'リスナーのニックネーム',
			'配信実績',
			'配信概要'
		]);
		expect(childBlocks[0]?.lastElementChild?.textContent || '').toContain('リスナーとの交流');

		// 「ラベル: 値」を 1 タグへ詰める旧構成へ戻っていないこと
		const tagTexts = Array.from(section.querySelectorAll('.tag')).map((node) => node.textContent?.trim() || '');
		expect(tagTexts.some((text) => text.startsWith('配信ジャンルについて:'))).toBe(false);
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

	// keyedDialogue（`lib/basic-renders/keyedDialogue.js`）の配線確認。
	// `ConversationPattern` と `NumerospecStats` はどちらも buildObjectChildBlocks を通るため、
	// 台詞リストの判定と辞書ラベル解決が両方の親で効くことを 1 件でまとめて見る。
	it('renders keyed dialogue lists with dictionary-resolved key labels', async () => {
		const record = structuredClone(ninthNumberTalesPrimaryRecord);
		record.ConversationPattern = {
			...(record.ConversationPattern || {}),
			TouchReactions: [{ Action: 'pat', value_JP: 'ふや…、くすぐったいな。', about_JP: '照れている時' }]
		};
		record.NumerospecStats = {
			...(record.NumerospecStats || {}),
			MotifCommentaries: [{ Topic: 'LifePath', TopicValue: 3, value_JP: '3は表現と喜びの数だよ。' }]
		};

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

		await charactersModule.renderDetail('#Works_NumberTales', record);

		// グローバル辞書 #List_TouchAction 由来のラベル（pat → なでる）
		const conversationText = getSubFieldSectionNode('ConversationPattern')?.textContent || '';
		expect(conversationText).toContain('接触への反応');
		expect(conversationText).toContain('なでる：ふや…、くすぐったいな。（照れている時）');

		// 作品別辞書 #List_MotifTopic 由来のラベル ＋ TopicValue の連結（LifePath + 3 → ライフパス3）
		const numSpecText = getSubFieldSectionNode('NumerospecStats')?.textContent || '';
		expect(numSpecText).toContain('数秘についての語り');
		expect(numSpecText).toContain('ライフパス3：3は表現と喜びの数だよ。');
	});

	it('prioritizes declared subFields order over basic/profile/relation fallback routes', async () => {
		const customGlobalMeta = structuredClone(globalMeta);
		customGlobalMeta.CreationWorks['#Works_NumberTales'].$DetailLayout.subFields = [
			'AbilityStats',
			'NumerospecStats',
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
			'NumerospecStats',
			'Relation',
			'ConversationPattern'
		].includes(key));

		expect(orderedSubFieldKeys).toEqual([
			'AbilityStats',
			'NumerospecStats',
			'Relation',
			'ConversationPattern'
		]);
		expect(getBasicFieldValue('“カバラの加護”(数秘的加護)について')).toBe('');
		expect(isCollapsibleSubFieldSection('NumerospecStats')).toBe(true);
		expect(isCollapsibleSubFieldSection('Relation')).toBe(true);
	});

	it('keeps string-like subFields non-collapsible when hideText wraps the stored value', async () => {
		const customGlobalMeta = structuredClone(globalMeta);
		customGlobalMeta.CreationWorks['#Works_NumberTales'].$DetailLayout.subFields = ['Backgrounds'];

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
			Backgrounds_JP: { hideText: '極秘事項' }
		});

		const hiddenSummarySection = getSubFieldSectionNode('Backgrounds');
		expect(hiddenSummarySection).not.toBeNull();
		expect(isCollapsibleSubFieldSection('Backgrounds')).toBe(false);
		expect(hiddenSummarySection?.textContent || '').toContain('極秘事項');
		expect(hiddenSummarySection?.textContent || '').not.toContain('hideText');
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

		// Phase 4: `NumerospecAbout` はトップレベルから `NumerospecStats` 配下へ移した。
		// 単独セクションは消え、中身は特性セクション内に残る
		expect(getSubFieldSectionNode('NumerospecAbout')).toBeNull();
		expect(numerospecSection?.textContent || '').toContain('(数秘的加護)について');
		expect(numerospecSection?.textContent || '').toContain('哀しみから救済する');
		expect(getSectionNode('スペック/能力')).toBeNull();
	});

	it('renders other-work spec stats as standalone subField sections and keeps nested profile rows inside them', async () => {
		await charactersModule.renderDetail('#Works_PastDivers', yayoiRecord);

		const chronoSection = getSectionNode('時空遷移(クロノシフト)能力の特性');
		const chronoTags = getSectionTagTexts('時空遷移(クロノシフト)能力の特性');
		expect(chronoSection).not.toBeNull();
		expect(chronoSection?.textContent || '').toContain('時空遷移(クロノイド)状態に関する概要');
		expect(chronoTags).toContain('物理的作用: B（標準 / Normal）');
		expect(chronoTags).toContain('治癒効果: 公開不能 / Openly Not');
		expect(chronoTags).toContain('安全レベル: 公開不能 / Openly Not');
		expect(chronoTags).not.toContain('安全レベル');

		// Phase 4: `ChronospecName` / `ChronospecAbout` を `ChronospecStats` 配下へ移した
		expect(getSectionNode('時空遷移(クロノシフト)能力名')).toBeNull();
		expect(chronoSection?.textContent || '').toContain('焦燥の花');
		expect(chronoSection?.textContent || '').toContain('時間が進行するエネルギーを吸収する');

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

		// Phase 4: `ArcanumspecAbout`（旧 `Arcanam` 表記）を `ArcanumspecStats` 配下へ移した
		expect(getSectionNode('アルカナムスペック(アルカナ能力)の特性')?.textContent || '')
			.toContain('アルカナムスペック(アルカナ能力)について');
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
			if (url.includes('/data/Works_NumberTales/References/db_type.json')) {
				return new Response(JSON.stringify(numberTalesReferencesTypeDef), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			if (url.includes('/data/References/db_type.json')) {
				return new Response(JSON.stringify(sharedReferencesTypeDef), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			if (url.includes('/data/References/db_meta.json')) {
				return new Response(JSON.stringify(sharedReferencesMeta), {
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

		expect(document.querySelector('#detail-title')?.textContent?.trim()).toBe('ナンバーテールズ');
		expect(getBasicFieldValue('資料名')).toBe('ナンバーテールズ / NumberTales');
		expect(getBasicFieldValue('分類')).toBe('基本情報 / Basic Reference');
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
			BirthDay: [{
				Day: { Month: 8, DayOfMonth: 15 },
				DayAbout_JP: '誕生日'
			}]
		});

		expect(getBasicFieldValue('誕生日')).toBe('8月15日（誕生日）');
	});

	it('renders references poster images using work-local image typedef folder hints', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Vocabulary',
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
			if (url.includes('/data/References/db_meta.json')) {
				return new Response(JSON.stringify(sharedReferencesMeta), {
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
			await charactersModule.renderDetail('#Works_NumberTales', numberTalesVocabularyImageRecord);
		} finally {
			globalThis.fetch = originalFetch;
		}

		const poster = document.querySelector('img.poster');
		expect(poster).not.toBeNull();
		expect(poster.getAttribute('src')).toBe('/data/Works_NumberTales/Images/Ref_Vocabulary/concept-figure/cnsp-fg_NTsHumanoid.png');
	});

	it('renders glossary and reference list cards using Term and Title fallbacks', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Vocabulary',
				workId: '#Works_NumberTales',
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.__renderListForTest(numberTalesVocabularyRecords, '#Works_NumberTales', { imageFields: [] });
		expect(getListTitles()).toContain('数秘的加護');
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
		expect(getListTitles()).toContain('ナンバーテールズ');
		expect(getListSubtitles()).toContain('NumberTales');
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
				db: 'Vocabulary',
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
				Term_JP: '画像付き用語',
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
		expect(img.getAttribute('src')).toBe('/data/Works_NumberTales/Images/Ref_Vocabulary/concept-figure/glossary-sample.png');
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
			if (url.includes('/data/References/db_meta.json')) {
				return new Response(JSON.stringify(sharedReferencesMeta), {
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
		// RelatedTerms は「共通資料」疑似作品の Vocabulary DB へリンクする（旧: 実在しない Glossary への壊れたリンク）
		// 作品IDは URL 上では `Works_` 接頭辞なしの短縮形になる
		const termHref = parseViewerHref(termLink.href);
		expect(termHref.work).toBe('CommonReferences');
		expect(termHref.db).toBe('Vocabulary');
		expect(termHref.q).toBe('数秘加護');

		const creationLinks = links.filter((link) => link.textContent?.includes('ナンバーテールズ / '));
		expect(creationLinks.length).toBeGreaterThanOrEqual(2);
		const glossaryLink = creationLinks.find((link) => parseViewerHref(link.href).db === 'Glossary');
		const primaryLink = creationLinks.find((link) => parseViewerHref(link.href).db === 'Primary');
		expect(glossaryLink).toBeTruthy();
		expect(primaryLink).toBeTruthy();
	});

	it('renders AppearanceDetail section with vdict and value_Num attrs for NT character', async () => {
		// globalDefType（グローバル辞書合流済み）を上位に渡すことで $EnumDef_DesignBodyPart 等を解決可能にする
		charactersModule.__setCharactersTestState({
			globalDefType,
			charState: {
				db: 'Primary',
				workId: '#Works_NumberTales',
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_NumberTales', ninthNumberTalesPrimaryRecord);

		// AppearanceDetail は non-text subField として折りたたみセクション（details）で描画される
		expect(isCollapsibleSubFieldSection('AppearanceDetail')).toBe(true);
		expect(isSubFieldSectionOpen('AppearanceDetail')).toBe(false);

		const sectionText = getSectionText('外見デザイン詳細');
		// DesignElement タグ（グローバル辞書 $EnumDef_DesignElement から解決。#Element_Ear）
		expect(sectionText).toContain('耳');
		// vdict_EarShapeType からの形状ラベル（NT ローカル辞書 $EnumDef_EarShapeType から解決）
		expect(sectionText).toContain('狐');
		// about_JP からの補足テキスト
		expect(sectionText).toContain('先がアクセントカラー');
	});

	it('resolves AppearanceDetail Costume tags via #Dict_Costume (no raw idol/usual codes)', async () => {
		// Costume は NT ローカルの Dictionaries/dict_Costume.json（#Dict_Costume カタログ登録）から
		// JP/EN ラベル解決される。カタログ未登録だと生コード（idol/usual）のまま表示される回帰を検知する
		charactersModule.__setCharactersTestState({
			globalDefType,
			charState: {
				db: 'Primary',
				workId: '#Works_NumberTales',
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_NumberTales', sixtyFirstNumberTalesPrimaryRecord);

		const section = getSectionNode('外見デザイン詳細');
		expect(section).not.toBeNull();
		const tagTexts = Array.from(section.querySelectorAll('.appearance-detail__entry-header .tag'))
			.map((t) => t.textContent?.trim());
		// 辞書解決済みラベルが表示される（テスト環境は言語未設定のため JP/EN 併記になり得る。
		// 実ブラウザでは pageLang に応じて JP or EN の単独表示）
		expect(tagTexts.some((t) => t.includes('通常衣装'))).toBe(true);
		expect(tagTexts.some((t) => t.includes('アイドル衣装'))).toBe(true);
		// 生コードのままのタグは残らない
		expect(tagTexts).not.toContain('usual');
		expect(tagTexts).not.toContain('idol');
	});

	it('renders TailsUnit as a dedicated standalone section (subFields) from the $Def_TailsUnit field for NT character', async () => {
		charactersModule.__setCharactersTestState({
			globalDefType,
			charState: {
				db: 'Primary',
				workId: '#Works_NumberTales',
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_NumberTales', ninthNumberTalesPrimaryRecord);

		// TailsUnit は db_meta.json の $DetailLayout.subFields 経由で専用の折りたたみセクションへ表示される
		// （tailsUnitSection built-in renderer。basicFields からは 1項目1箇所の原則で除外される）
		expect(isCollapsibleSubFieldSection('TailsUnit')).toBe(true);
		expect(isSubFieldSectionOpen('TailsUnit')).toBe(false);

		const sectionText = getSectionText('尻尾ユニット');
		// vdict_TailShapeType からの形状ラベル（NT ローカル辞書 $EnumDef_TailShapeType から解決）
		expect(sectionText).toContain('キツネ型');
		// Count からの個数表示
		expect(sectionText).toContain('9');

		// 基本情報テーブルには重複表示しない
		expect(getSectionText('基本情報')).not.toContain('キツネ型');
	});

	it('renders TailsUnit LayoutDirection (branch direction phrase) for a narrative multi-tier record', async () => {
		charactersModule.__setCharactersTestState({
			globalDefType,
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

		await charactersModule.renderDetail('#Works_NumberTales', branchedTailsUnitRecord);

		const sectionText = getSectionText('尻尾ユニット');
		// LayoutDirection（LayoutFrom:#Lat_Upper, LayoutTo:#Lat_Lower）からの方向句
		expect(sectionText).toContain('上から下に向かって');
		// Branches[] の内訳（上:1本×3束 等）も引き続き表示される
		expect(sectionText).toContain('上');
		expect(sectionText).toContain('下');
	});

	it('renders TailsUnit reference image when TailsUnit_PNGName is present', async () => {
		charactersModule.__setCharactersTestState({
			globalDefType,
			charState: {
				db: 'Primary',
				workId: '#Works_NumberTales',
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_NumberTales', fourthNumberTalesPrimaryRecord);

		const section = getSubFieldSectionNode('TailsUnit');
		const img = section?.querySelector('.tailsunit__reference-image .image-item img');
		expect(img?.getAttribute('src')).toContain('/Images/DB_Primary/attr/tailsUnit/attr_tailsUnitNTS-4.png');
		expect(img?.getAttribute('alt')).toBeTruthy();

		// クリックでライトボックス拡大表示につながる既存のzoomトリガーを再利用している
		expect(section?.querySelector('.tailsunit__reference-image .image-zoom-trigger')).toBeTruthy();
	});

	it('does not render a TailsUnit reference image block when TailsUnit_PNGName is absent', async () => {
		charactersModule.__setCharactersTestState({
			globalDefType,
			charState: {
				db: 'Primary',
				workId: '#Works_NumberTales',
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_NumberTales', ninthNumberTalesPrimaryRecord);

		const section = getSubFieldSectionNode('TailsUnit');
		expect(section?.querySelector('.tailsunit__reference-image')).toBeFalsy();
	});

	it('resolveWorkDirName/resolveImagesRootOverride honor Works_Dir/Works_ImagesDir overrides from CreationWorks', () => {
		charactersModule.__setCharactersTestState({
			globalMeta: {
				CreationWorks: {
					'#Works_CommonReferences': { Works_Dir: 'References', Works_ImagesDir: 'GeneralImages' }
				}
			}
		});

		expect(charactersModule.__resolveWorkDirNameForTest('#Works_CommonReferences')).toBe('References');
		expect(charactersModule.__resolveImagesRootOverrideForTest('#Works_CommonReferences')).toBe('GeneralImages');
		// オーバーライドが無い作品は従来通りの導出のまま（回帰確認）
		expect(charactersModule.__resolveWorkDirNameForTest('#Works_NumberTales')).toBe('Works_NumberTales');
		expect(charactersModule.__resolveImagesRootOverrideForTest('#Works_NumberTales')).toBe('');
	});

	it('populateWorks() groups Works_Shared:true entries into a separate optgroup', async () => {
		charactersModule.__setCharactersTestState({
			worksCatalog: [
				{ key: '#Works_NumberTales', Title_JP: 'ナンバーテールズ', Title_EN: 'NumberTales', Works_Shared: false },
				{ key: '#Works_CommonReferences', Title_JP: '共通資料', Title_EN: 'Common References', Works_Shared: true }
			]
		});

		await charactersModule.__populateWorksForTest('#Works_NumberTales');

		const sel = document.querySelector('#select-work');
		const optgroups = Array.from(sel.querySelectorAll('optgroup'));
		expect(optgroups.length).toBe(1);
		expect(optgroups[0].getAttribute('label')).toBe('共通資料');

		const sharedOption = optgroups[0].querySelector('option');
		expect(sharedOption?.value).toBe('#Works_CommonReferences');

		const topLevelOptions = Array.from(sel.children).filter((node) => node.tagName === 'OPTION');
		expect(topLevelOptions.map((o) => o.value)).toEqual(['#Works_NumberTales']);
	});

	// Calling 系の行重複回帰（2026-07-04 の重複修正 → 2026-07-14 の棚卸しで裏取り）
	//
	// グローバル $DefType は FirstPerson/SecondPerson/ThirdPersonCalling を base キーのみで宣言するが、
	// 作品別 $DefType（NumberTales / UnauthedLogica）の ForMasterCalling は *_JP / *_EN の
	// 別エントリとして宣言されたままである。旧実装ではこの suffix 付き宣言が sub バケットへ
	// 2 行別々に積まれて重複表示になっていた。現在は parseLangSuffix() が base へ統合するため 1 行になる。
	//
	// なお JP モードで「JP / EN」を併記するのは他フィールド（正式名称・趣味など）と同じ既定仕様であり、
	// 重複行ではない。ここで固定したいのは「行が 1 本であること」と「EN モードは EN のみになること」。
	// スキーマ側を base キーへ寄せる場合も、この期待値は変わらない。
	it('merges suffix-declared Calling schema entries into one bilingual row (JP)', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Primary',
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_NumberTales', thirdNumberTalesPrimaryRecord);

		const text = getDetailText();
		const jp = thirdNumberTalesPrimaryRecord.ForMasterCalling_JP;
		const en = thirdNumberTalesPrimaryRecord.ForMasterCalling_EN;

		// 行は 1 本だけ（旧バグでは *_JP / *_EN が別行として 2 本積まれていた）
		expect(countOccurrences(text, '主人の呼び方')).toBe(1);
		// その 1 行の中で JP / EN が併記される（他フィールドと同じ bilingual 表示）
		expect(squashSpaces(text)).toContain(squashSpaces(`${jp} / ${en}`));
	});

	it('merges suffix-declared Calling schema entries into one row and drops JP in English mode (EN)', async () => {
		charactersModule.__setCharactersTestState({
			charState: {
				db: 'Primary',
				pageLang: 'en',
				workTypeDef: numberTalesWorkTypeDef,
				globalTypeDef,
				workMeta: numberTalesWorkMeta,
				imageFields: []
			}
		});

		await charactersModule.renderDetail('#Works_NumberTales', thirdNumberTalesPrimaryRecord);

		const text = getDetailText();
		expect(countOccurrences(text, 'For Master Calling')).toBe(1);
		expect(squashSpaces(text)).toContain(squashSpaces(thirdNumberTalesPrimaryRecord.ForMasterCalling_EN));
		expect(squashSpaces(text)).not.toContain(squashSpaces(thirdNumberTalesPrimaryRecord.ForMasterCalling_JP));
	});
});
