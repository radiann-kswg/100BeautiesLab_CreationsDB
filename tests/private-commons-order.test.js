/**
 * isPrivate フィルタと _Commons 適用の順序に関する回帰テスト
 *
 * 背景（実バグ）:
 * - `isPrivate` は `_Secondaries[]._Commons.isPrivate: true` のように、レコード自身ではなく
 *   所属シリーズ側から注入されることがある（例: NumberTales / Secondary の「ヘキサデミカル・テールズ」）。
 * - にもかかわらず SW / Workers / pkg のいずれも、非公開フィルタを `_Commons` 適用「前」に
 *   実行していたため、注入された isPrivate が誰にも読まれず、非公開指定のレコードが公開されていた。
 * - さらに SW の `handleBootstrapEndpoint()` は非公開フィルタ自体を一度も呼んでおらず、
 *   レコード自身が `isPrivate: true` を宣言していても素通りしていた。
 *
 * 本ファイルは「フィルタは必ず _Commons 適用の後」という不変条件を、
 * SW（3 経路）と Cloudflare Workers / migrate.mjs（共有ロジック）の双方で検証する。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { applyCommons, isPublicRecord } from '../pkg/cloudflare/worker.js';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** `lib/sw-common.js`（classic script）を vm 上へロードする */
function loadSwCommonIntoContext() {
  const code = readFileSync(join(repoRoot, 'lib/sw-common.js'), 'utf-8');
  const context = {
    console,
    Response: globalThis.Response,
    Headers: globalThis.Headers,
    URL: globalThis.URL,
    self: { location: { origin: 'https://example.invalid', pathname: '/' } }
  };
  vm.runInNewContext(code, context, { filename: 'lib/sw-common.js' });
  return context;
}

/**
 * シリーズ単位で isPrivate を注入する `_Secondaries` を持つ作品メタ。
 * 実データ（NumberTales / Secondary）と同じ構造。
 */
const WORK_META_WITH_PRIVATE_SERIES = {
  Databases: {
    '#DB_Secondary': {
      _Secondaries: [
        {
          sec_SeriesTitle: '公開シリーズ',
          _Commons: { sec_Note: '公開' }
        },
        {
          sec_SeriesTitle: '非公開シリーズ',
          _Commons: { isPrivate: true, sec_Note: '非公開' }
        }
      ]
    }
  }
};

/** レコード自身は isPrivate を宣言しない（＝ _Commons 経由でのみ非公開になる） */
const RECORDS = [
  { Num: 1, Name_JP: '公開キャラ', sec_SeriesTitle: '公開シリーズ' },
  { Num: 2, Name_JP: '非公開キャラ', sec_SeriesTitle: '非公開シリーズ' }
];

// ─────────────────────────────────────────────────────────────────────────────
// Service Worker（lib/sw-common.js）
// ─────────────────────────────────────────────────────────────────────────────

describe('SW: isPrivate フィルタは _Commons 適用の「後」に走る', () => {
  it('handleDbEndpoint: _Secondaries 経由で注入された isPrivate のレコードを除外する', async () => {
    const ctx = loadSwCommonIntoContext();
    const handlers = new ctx.self.StandardEndpointHandlers(
      {
        readDB: async () => structuredClone(RECORDS),
        readWorkMeta: async () => WORK_META_WITH_PRIVATE_SERIES
      },
      null, null, 'Test'
    );

    const res = await handlers.handleDbEndpoint('Works_NumberTales', 'Secondary', false, false, false);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.records.map((r) => r.Num)).toEqual([1]);
    expect(json.records.every((r) => r.isPrivate !== true)).toBe(true);
  });

  it('handleDbEndpoint: メタ欠損で _Commons をスキップしても、レコード自身の isPrivate は尊重する', async () => {
    const ctx = loadSwCommonIntoContext();
    const handlers = new ctx.self.StandardEndpointHandlers(
      {
        readDB: async () => [
          { Num: 1, Name_JP: '公開' },
          { Num: 2, Name_JP: '非公開', isPrivate: true }
        ],
        readWorkMeta: async () => { throw new Error('missing work meta'); }
      },
      null, null, 'Test'
    );

    const res = await handlers.handleDbEndpoint('Works_NumberTales', 'Secondary', false, false, false);
    const json = await res.json();
    expect(json.records.map((r) => r.Num)).toEqual([1]);
  });

  it('handleSearchEndpoint: 注入された isPrivate のレコードは検索結果に現れない', async () => {
    const ctx = loadSwCommonIntoContext();
    const handlers = new ctx.self.StandardEndpointHandlers(
      {
        readDB: async () => structuredClone(RECORDS),
        readWorkMeta: async () => WORK_META_WITH_PRIVATE_SERIES
      },
      null, null, 'Test'
    );

    const url = new URL('https://example.invalid/v1/search');
    url.searchParams.set('works', 'Works_NumberTales');
    url.searchParams.set('db', 'Secondary');
    url.searchParams.append('hashTag', 'Num');
    url.searchParams.append('key', '2'); // 非公開レコードを名指しで検索

    const res = await handlers.handleSearchEndpoint(url, false, false, false);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.count).toBe(0);
    expect(json.records).toEqual([]);
  });

  it('handleBootstrapEndpoint: 非公開レコードを除外する（従来はフィルタ自体が欠落していた）', async () => {
    const ctx = loadSwCommonIntoContext();
    const handlers = new ctx.self.StandardEndpointHandlers(
      {
        readGlobalMeta: async () => ({
          CreationWorks: { '#Works_NumberTales': { Title_JP: 'テスト作品' } }
        }),
        readGlobalType: async () => ({}),
        listWorkDBs: async () => [{ key: 'Secondary', file: 'db_Secondary.json', layer: 'DataBases' }],
        readWorkMeta: async () => WORK_META_WITH_PRIVATE_SERIES,
        readDB: async () => structuredClone(RECORDS)
      },
      null, null, 'Test'
    );

    const url = new URL('https://example.invalid/v1/bootstrap?includeRecords=true');
    const res = await handlers.handleBootstrapEndpoint(url, true, false);
    expect(res.status).toBe(200);

    const json = await res.json();
    const records = json.works[0].data.Secondary;
    expect(Array.isArray(records)).toBe(true);
    expect(records.map((r) => r.Num)).toEqual([1]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Workers / migrate.mjs（共有ロジック）
// ─────────────────────────────────────────────────────────────────────────────

describe('Workers: applyCommons + isPublicRecord（D1 の is_private 算出にも使う共有ロジック）', () => {
  it('_Secondaries 経由で注入された isPrivate を検出する', () => {
    const resolved = applyCommons(structuredClone(RECORDS), WORK_META_WITH_PRIVATE_SERIES, 'Secondary');
    const visible = resolved.filter(isPublicRecord);

    expect(visible.map((r) => r.Num)).toEqual([1]);
  });

  it('生レコードのままでは非公開指定を取りこぼす（修正前の migrate.mjs の挙動）', () => {
    // is_private を _Commons 適用前に算出していたため、注入値が読まれず 0 件だった。
    // このテストは「なぜ applyCommons を先に通す必要があるか」を固定する。
    const naive = RECORDS.filter((r) => r?.isPrivate).length;
    expect(naive).toBe(0);

    const correct = applyCommons(structuredClone(RECORDS), WORK_META_WITH_PRIVATE_SERIES, 'Secondary')
      .filter((r) => !isPublicRecord(r)).length;
    expect(correct).toBe(1);
  });

  it('レコード自身が宣言する isPrivate も従来どおり検出する', () => {
    const records = [{ Num: 1 }, { Num: 2, isPrivate: true }];
    const resolved = applyCommons(records, { Databases: {} }, 'Primary');
    expect(resolved.filter(isPublicRecord).map((r) => r.Num)).toEqual([1]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 実データ回帰
// ─────────────────────────────────────────────────────────────────────────────

describe('実データ: _Commons 経由で非公開指定されたレコードが公開されない', () => {
  const workMeta = JSON.parse(
    readFileSync(join(repoRoot, 'data/Works_NumberTales/DataBases/db_meta.json'), 'utf-8')
  );
  const records = JSON.parse(
    readFileSync(join(repoRoot, 'data/Works_NumberTales/DataBases/db_Secondary.json'), 'utf-8')
  );

  it('前提: _Secondaries に isPrivate: true を持つシリーズが存在する', () => {
    const secDefs = workMeta?.Databases?.['#DB_Secondary']?._Secondaries ?? [];
    const privateSeries = secDefs.filter((d) => d?._Commons?.isPrivate === true);
    expect(privateSeries.length).toBeGreaterThan(0);
  });

  it('SW: 該当シリーズのレコードが DB 応答に含まれない', async () => {
    const ctx = loadSwCommonIntoContext();
    const handlers = new ctx.self.StandardEndpointHandlers(
      {
        readDB: async () => structuredClone(records),
        readWorkMeta: async () => workMeta
      },
      null, null, 'Test'
    );

    const res = await handlers.handleDbEndpoint('Works_NumberTales', 'Secondary', false, false, false);
    const json = await res.json();

    const privateSeries = (workMeta.Databases['#DB_Secondary']._Secondaries ?? [])
      .filter((d) => d?._Commons?.isPrivate === true)
      .map((d) => d.sec_SeriesTitle);

    for (const rec of json.records) {
      expect(privateSeries).not.toContain(rec.sec_SeriesTitle);
      expect(rec.isPrivate).not.toBe(true);
    }
  });

  it('Workers/migrate: 該当レコードの is_private が 1 になる', () => {
    const resolved = applyCommons(structuredClone(records), workMeta, 'Secondary');
    const privateCount = resolved.filter((r) => !isPublicRecord(r)).length;

    // 生レコードは isPrivate を宣言していない = _Commons 経由でのみ非公開になる
    expect(records.filter((r) => r?.isPrivate === true).length).toBe(0);
    expect(privateCount).toBeGreaterThan(0);
  });
});
