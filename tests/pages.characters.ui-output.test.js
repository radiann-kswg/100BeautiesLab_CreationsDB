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

const globalMeta = loadJson('data/db_meta.json');
const globalTypeDef = loadJson('data/db_type.json');
const globalDefType = buildGlobalDefTypeFixture();
const workTypeDef = loadJson('data/Works_PastDivers/DataBases/db_type.json');
const workMeta = buildWorkMetaFixture('Works_PastDivers');
const records = loadJson('data/Works_PastDivers/DataBases/db_Primary.json');
const yayoiRecordBase = records.find((record) => record?.Chronos?.Lunar === 'Yayoi');
const numberTalesWorkTypeDef = loadJson('data/Works_NumberTales/DataBases/db_type.json');
const numberTalesWorkMeta = buildWorkMetaFixture('Works_NumberTales');
const numberTalesSecondaryRecords = loadJson('data/Works_NumberTales/DataBases/db_Secondary.json');
const numberTalesSelfSecondaryRecords = loadJson('data/Works_NumberTales/DataBases/db_SelfSecondary.json');
const hexademicalRecord = numberTalesSecondaryRecords.find((record) => record?.Num === '0xA');
const requestNumberRecord = numberTalesSelfSecondaryRecords.find((record) => record?.Num === 223);

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
    expect(secondarySectionText).toContain('制作・考案');
    expect(secondarySectionText).toContain('ラジアン(柏木主税)');
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
    expect(secondarySectionText).toContain('制作・考案');
    expect(secondarySectionText).toContain('散狐アタスト(https://misskey.io/@atast)');
  });
});