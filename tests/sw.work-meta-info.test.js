/**
 * works / db 一覧系エンドポイントが、db_meta.json の創作タイトル情報を返すことを確認する。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = dirname(__dirname);

function loadText(relPath) {
  return readFileSync(join(repoRoot, relPath), 'utf-8');
}

function loadSwCommonIntoContext() {
  const code = loadText('lib/sw-common.js');
  const context = {
    console,
    Response: globalThis.Response,
    Headers: globalThis.Headers,
    URL: globalThis.URL,
    self: {
      location: { origin: 'https://example.invalid', pathname: '/' }
    }
  };

  vm.runInNewContext(code, context, { filename: 'lib/sw-common.js' });
  return context;
}

describe('StandardEndpointHandlers exposes work/db catalog meta info', () => {
  it('handleWorksListEndpoint includes creation title summary fields', async () => {
    const ctx = loadSwCommonIntoContext();
    const StandardEndpointHandlers = ctx?.self?.StandardEndpointHandlers;
    expect(StandardEndpointHandlers).toBeTypeOf('function');

    const stubFetcher = {
      readGlobalMeta: async () => ({
        CreationWorks: {
          '#Works_NumberTales': {
            Title: 'ナンバーテールズ',
            Title_EN: 'NumberTales',
            Works_Summary: '作品概要です。',
            OldTitles: [{ Title: '旧題', ArchivedYear: 2024 }]
          }
        }
      })
    };

    const handlers = new StandardEndpointHandlers(stubFetcher, null, null, 'Test');
    const res = await handlers.handleWorksListEndpoint();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json[0].Title).toBe('ナンバーテールズ');
    expect(json[0].Works_Summary).toBe('作品概要です。');
    expect(Array.isArray(json[0].OldTitles)).toBe(true);
  });

  it('handleWorkDbListEndpoint includes DB labels, summary and story era from work meta', async () => {
    const ctx = loadSwCommonIntoContext();
    const StandardEndpointHandlers = ctx?.self?.StandardEndpointHandlers;
    expect(StandardEndpointHandlers).toBeTypeOf('function');

    const stubFetcher = {
      listWorkDBs: async () => [{ key: 'Primary', file: 'db_Primary.json' }],
      readWorkMeta: async () => ({
        Databases: {
          '#DB_Primary': {
            DB_Label: '一次創作',
            DB_Label_EN: 'Primary',
            DB_Summary: 'DB概要です。',
            StoryEra: { about_JP: '第9創世紀3年ごろ' }
          }
        }
      })
    };

    const handlers = new StandardEndpointHandlers(stubFetcher, null, null, 'Test');
    const res = await handlers.handleWorkDbListEndpoint('Works_NumberTales');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.databases[0].DB_Label).toBe('一次創作');
    expect(json.databases[0].DB_Label_EN).toBe('Primary');
    expect(json.databases[0].DB_Summary).toBe('DB概要です。');
    expect(json.databases[0].StoryEra.about_JP).toBe('第9創世紀3年ごろ');
    expect(json.databases[0].metaKey).toBe('#DB_Primary');
  });

  it('handleWorkEndpoint includes global work info alongside work meta', async () => {
    const ctx = loadSwCommonIntoContext();
    const StandardEndpointHandlers = ctx?.self?.StandardEndpointHandlers;
    expect(StandardEndpointHandlers).toBeTypeOf('function');

    const stubFetcher = {
      readGlobalMeta: async () => ({
        CreationWorks: {
          '#Works_PastDivers': {
            Title: 'パストダイヴァー',
            Title_EN: 'PastDivers',
            Works_Summary: '作品側の概要'
          }
        }
      }),
      readWorkMeta: async () => ({ Databases: { '#DB_Primary': { DB_Summary: 'db summary' } } })
    };

    const handlers = new StandardEndpointHandlers(stubFetcher, null, null, 'Test');
    const res = await handlers.handleWorkEndpoint('Works_PastDivers');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.work).toBe('#Works_PastDivers');
    expect(json.workInfo.Title_EN).toBe('PastDivers');
    expect(json.meta.Databases['#DB_Primary'].DB_Summary).toBe('db summary');
  });
});