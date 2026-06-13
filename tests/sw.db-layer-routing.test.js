/**
 * DB_Layer による DB レイヤー切り替えの基本テスト
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

function loadSwCommonIntoContext(extra = {}) {
  const code = loadText('lib/sw-common.js');
  const context = {
    console,
    fetch: extra.fetch || globalThis.fetch,
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

describe('DB layer aware routing', () => {
  it('DataFetcher.readDB uses #Ref_ catalog keys to resolve ref_*.json by default', async () => {
    const jsonByPath = {
      '/data/Works_Test/DataBases/db_meta.json': {
        Databases: {
          '#Ref_Glossary': {
            DB_Label: '創作用語',
            DB_Layer: 'References'
          }
        }
      },
      '/data/Works_Test/References/ref_Glossary.json': [
        { Term: '百花繚乱研究所' }
      ]
    };

    const fetchStub = async (url, opt = {}) => {
      const pathname = new URL(url).pathname;
      const body = jsonByPath[pathname];
      if ((opt?.method || 'GET').toUpperCase() === 'HEAD') {
        return new Response('', { status: body ? 200 : 404 });
      }
      if (!body) {
        return new Response('not found', { status: 404 });
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    };

    const ctx = loadSwCommonIntoContext({ fetch: fetchStub });
    const SWConfig = ctx?.self?.SWConfig;
    const DataFetcher = ctx?.self?.DataFetcher;
    expect(SWConfig).toBeTypeOf('function');
    expect(DataFetcher).toBeTypeOf('function');

    const fetcher = new DataFetcher(new SWConfig('/pages'));
    const records = await fetcher.readDB('#Works_Test', 'Glossary');

    expect(records).toEqual([{ Term: '百花繚乱研究所' }]);
  });

  it('DataFetcher.readWorkMeta merges References/db_meta.json Databases into the result', async () => {
    const jsonByPath = {
      '/data/Works_Test/DataBases/db_meta.json': {
        Databases: {
          '#DB_Primary': { DB_Label: '一次創作' }
        }
      },
      '/data/Works_Test/References/db_meta.json': {
        Databases: {
          '#Ref_Vocabulary': { DB_Label: '語彙辞書', DB_Label_EN: 'Vocabulary' }
        }
      }
    };

    const fetchStub = async (url, opt = {}) => {
      const pathname = new URL(url).pathname;
      const body = jsonByPath[pathname];
      if ((opt?.method || 'GET').toUpperCase() === 'HEAD') {
        return new Response('', { status: body ? 200 : 404 });
      }
      if (!body) return new Response('not found', { status: 404 });
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    };

    const ctx = loadSwCommonIntoContext({ fetch: fetchStub });
    const fetcher = new ctx.self.DataFetcher(new ctx.self.SWConfig('/pages'));
    const meta = await fetcher.readWorkMeta('#Works_Test');

    expect(meta.Databases?.['#DB_Primary']?.DB_Label).toBe('一次創作');
    expect(meta.Databases?.['#Ref_Vocabulary']?.DB_Label).toBe('語彙辞書');
    expect(meta.Databases?.['#Ref_Vocabulary']?.DB_Layer).toBe('References');
  });

  it('DataFetcher.readWorkMeta keeps DB_Layer from References/db_meta.json when explicitly set', async () => {
    const jsonByPath = {
      '/data/Works_Test/DataBases/db_meta.json': { Databases: {} },
      '/data/Works_Test/References/db_meta.json': {
        Databases: {
          '#Ref_Reference': { DB_Label: '創作基本資料', DB_Layer: 'References' }
        }
      }
    };

    const fetchStub = async (url, opt = {}) => {
      const pathname = new URL(url).pathname;
      const body = jsonByPath[pathname];
      if ((opt?.method || 'GET').toUpperCase() === 'HEAD') {
        return new Response('', { status: body ? 200 : 404 });
      }
      if (!body) return new Response('not found', { status: 404 });
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    };

    const ctx = loadSwCommonIntoContext({ fetch: fetchStub });
    const fetcher = new ctx.self.DataFetcher(new ctx.self.SWConfig('/pages'));
    const meta = await fetcher.readWorkMeta('#Works_Test');

    expect(meta.Databases?.['#Ref_Reference']?.DB_Layer).toBe('References');
  });

  it('DataFetcher.readWorkMeta gracefully handles missing References/db_meta.json', async () => {
    const jsonByPath = {
      '/data/Works_Test/DataBases/db_meta.json': {
        Databases: { '#DB_Primary': { DB_Label: '一次創作' } }
      }
    };

    const fetchStub = async (url, opt = {}) => {
      const pathname = new URL(url).pathname;
      const body = jsonByPath[pathname];
      if ((opt?.method || 'GET').toUpperCase() === 'HEAD') {
        return new Response('', { status: body ? 200 : 404 });
      }
      if (!body) return new Response('not found', { status: 404 });
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
    };

    const ctx = loadSwCommonIntoContext({ fetch: fetchStub });
    const fetcher = new ctx.self.DataFetcher(new ctx.self.SWConfig('/pages'));
    const meta = await fetcher.readWorkMeta('#Works_Test');

    expect(meta.Databases?.['#DB_Primary']?.DB_Label).toBe('一次創作');
  });

  it('handleWorkDbListEndpoint keeps custom file and layer information for non-DataBases entries', async () => {
    const ctx = loadSwCommonIntoContext();
    const StandardEndpointHandlers = ctx?.self?.StandardEndpointHandlers;
    expect(StandardEndpointHandlers).toBeTypeOf('function');

    const stubFetcher = {
      listWorkDBs: async () => [{ key: 'Glossary', file: 'ref_Glossary.json', layer: 'References' }],
      readWorkMeta: async () => ({
        Databases: {
          '#Ref_Glossary': {
            DB_Label: '創作用語',
            DB_Label_EN: 'Glossary',
            DB_Layer: 'References',
            DB_Summary: '作品用語の一覧。'
          }
        }
      })
    };

    const handlers = new StandardEndpointHandlers(stubFetcher, null, null, 'Test');
    const res = await handlers.handleWorkDbListEndpoint('Works_Test');
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.databases[0].key).toBe('Glossary');
    expect(json.databases[0].DB_Layer).toBe('References');
    expect(json.databases[0].file).toBe('ref_Glossary.json');
    expect(json.databases[0].DB_Label).toBe('創作用語');
  });
});