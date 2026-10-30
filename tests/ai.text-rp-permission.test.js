/**
 * テキストRP推論許諾の継承・読出し・参照マージ禁止を検証する。
 * 旧学習ゲートと実キャラの許可値には変更を加えない。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import worker, { applyCommons } from '../pkg/cloudflare/worker.js';
import { CreationsDBClient } from '../pkg/nodejs/index.mjs';
import '../lib/data-common.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const field = 'AI_TextRP_Allowed';
const globalType = JSON.parse(readFileSync(join(root, 'data', 'db_type.json'), 'utf8'));
const declaration = globalType.$DefType.find((entry) => entry.hashTag === field);
const context = {
  console, Response, Headers, URL,
  self: { location: { origin: 'https://example.invalid', pathname: '/' } },
};
vm.runInNewContext(readFileSync(join(root, 'lib', 'sw-common.js'), 'utf8'), context);

const metaFor = (dbValue, definitions = []) => ({
  Databases: {
    '#DB_Primary': {
      _Commons: dbValue === undefined ? {} : { [field]: dbValue },
      _Secondaries: definitions,
    },
  },
});
const rule = (conditions, value) => ({ ...conditions, _Commons: { [field]: value } });

const readers = [
  ['SW', async (record, meta) =>
    context.self.CommonsProcessor.applyCommonsToRecords([record], meta, 'Primary')[0]],
  ['Workers', async (record, meta) => applyCommons([record], meta, 'Primary')[0]],
  ['Node.js / MCP', async (record, meta) => {
    const client = new CreationsDBClient(root);
    client._requireVisibleWork = async () => '#Works_Test';
    client._readDBRecords = async () => ({ records: [record], workMeta: meta });
    return (await client.getRecords('Test', 'Primary'))[0];
  }],
];

const cases = [
  ['未指定はunknown', {}, metaFor(), undefined],
  ['nullの解決結果はunknown', {}, metaFor(null), null],
  ['メタ欠損はunknown', {}, null, undefined],
  ['DBの明示許可を継承', {}, metaFor(true), true],
  ['レコードnullは既存規則で継承', { [field]: null }, metaFor(true), true],
  ['レコードfalseは継承trueに勝つ', { [field]: false }, metaFor(true), false],
  ['確認後の個別trueはDB既定falseに勝つ', { [field]: true }, metaFor(false), true],
  ['一致カテゴリの拒否がDB許可に勝つ', { sec_Category: 'A' },
    metaFor(true, [rule({ sec_Category: 'A' }, false)]), false],
  ['カテゴリnullはDB許可をunknownへ覆う', { sec_Category: 'A' },
    metaFor(true, [rule({ sec_Category: 'A' }, null)]), null],
  ['カテゴリnullはDB拒否もunknownへ覆う', { sec_Category: 'A' },
    metaFor(false, [rule({ sec_Category: 'A' }, null)]), null],
  ['カテゴリなしへ条件付き許可を流さない', {},
    metaFor(false, [rule({ sec_Category: 'A' }, true)]), false],
  ['別カテゴリへ条件付き許可を流さない', { sec_Category: 'B' },
    metaFor(false, [rule({ sec_Category: 'A' }, true)]), false],
  ['無条件定義だけがfallback', {},
    metaFor(true, [rule({ sec_Category: 'A' }, true), rule({}, false)]), false],
  ['より具体的なシリーズ条件を優先', { sec_SeriesTitle: 'S', sec_Category: 'A' },
    metaFor(false, [
      rule({ sec_Category: 'A' }, true),
      rule({ sec_SeriesTitle: 'S', sec_Category: 'A' }, false),
    ]), false],
  ['シリーズありの欠損追加条件は絞り込まない', { sec_SeriesTitle: 'S' },
    metaFor(false, [rule({ sec_SeriesTitle: 'S', sec_Category: 'A' }, true)]), true],
  ['シリーズありの追加条件の不一致は拒否', { sec_SeriesTitle: 'S', sec_Category: 'B' },
    metaFor(false, [rule({ sec_SeriesTitle: 'S', sec_Category: 'A' }, true)]), false],
  ['考案者条件の配列包含を照合', { sec_DesignedBy: ['A', 'B'] },
    metaFor(false, [rule({ sec_DesignedBy: ['A', 'B'] }, true)]), true],
  ['考案者が欠損なら条件を誤適用しない', {},
    metaFor(false, [rule({ sec_DesignedBy: ['A'] }, true)]), false],
  ['同点は先の定義を採る', { sec_Category: 'A' },
    metaFor(false, [rule({ sec_Category: 'A' }, false), rule({ sec_Category: 'A' }, true)]), false],
  ['旧falseは新推論許可ではない', { AI_Optout: false }, metaFor(), undefined],
  ['新許可は旧trueを解除しない', { AI_Optout: true, [field]: true }, metaFor(), true],
  ['DB直下の同名キーは継承しない', {},
    { Databases: { '#DB_Primary': { [field]: true } } }, undefined],
];

for (const [name, read] of readers) {
  describe(`${name}: AI_TextRP_Allowed`, () => {
    it.each(cases)('%s', async (_title, record, meta, expected) => {
      const input = structuredClone(record);
      const result = await read(input, structuredClone(meta));
      expect(result[field]).toBe(expected);
      expect(result.AI_Optout).toBe(record.AI_Optout);
      expect(result[field] === true).toBe(expected === true);
    });

    it.each(['true', 1, [], {}, ''].map((value) => [value]))('不正型を許可へ変換しない: %j', async (value) => {
      const result = await read({ [field]: value }, metaFor());
      expect(result[field] === true).toBe(false);
    });
  });
}

describe('テキストRP推論のschemaと公開read契約', () => {
  it('optional boolean/nullで表示・検索・参照からの穴埋めを抑止する', () => {
    expect(declaration).toMatchObject({
      $type: '#Boolean|#Null', $enrich: false, searchable: false,
      $display: { auto: false, role: 'internal' },
    });
  });

  it('SWの公開record応答でも値を保持し非公開レコードは除外する', async () => {
    const fetcher = {
      readDB: async () => [{ Num: 1 }, { Num: 2, [field]: false }, { Num: 3, isPrivate: true }],
      readWorkMeta: async () => metaFor(true),
    };
    const handlers = new context.self.StandardEndpointHandlers(fetcher, null, null, 'Test');
    const response = await handlers.handleDbEndpoint('Works_Test', 'Primary', false, false, false);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.work).toBe('#Works_Test');
    expect(body.db).toBe('Primary');
    expect(body.records.map((record) => record[field])).toEqual([true, false]);
  });

  it('Workersの公開HTTP readでもカテゴリと複合インデックスを保持する', async () => {
    const records = [
      { Card: { Suit: 'A', Num: 1 }, sec_Category: 'A' },
      { Card: { Suit: 'B', Num: 1 }, sec_Category: 'B' },
    ];
    const meta = metaFor(false, [rule({ sec_Category: 'A' }, true)]);
    const env = {
      DB: {
        prepare: () => ({
          bind: () => ({
            first: async () => ({ is_hidden: 0 }),
            all: async () => ({ results: records.map((record) => ({ data_json: JSON.stringify(record) })) }),
          }),
        }),
      },
      BUCKET: {
        get: async (key) => ({
          json: async () => key === 'data/db_meta.json' ? { CreationWorks: {} } : meta,
        }),
      },
    };
    const response = await worker.fetch(new Request('https://example.invalid/api/v1/Test/Primary/records'), env, {});
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.map((record) => record[field])).toEqual([true, false]);
    expect(body.map((record) => record.Card)).toEqual(records.map((record) => record.Card));
  });

  it.each([undefined, null, false])('_DBLink先の許可を穴埋めしない: %j', (value) => {
    const processor = new globalThis.EnrichmentProcessor({}, {});
    const base = value === undefined ? {} : { [field]: value };
    const result = processor.mergeFromLinkedRecord(base, { [field]: true }, {
      fieldEntriesByKey: new Map([[field, declaration]]),
    });
    expect(result[field]).toBe(value);
  });

  it('enrichの型正規化でも不正な文字列をtrueへ変換しない', () => {
    const processor = new globalThis.EnrichmentProcessor({}, {});
    const result = processor.normalizeRecordByTypeDef({ [field]: 'true' }, globalType);
    expect(result[field]).toBe('true');
  });

  it('データ内の宣言値はboolean/nullのみ', () => {
    const dataRoot = join(root, 'data');
    const inspect = (node, path) => {
      if (!node || typeof node !== 'object') return;
      if (Object.hasOwn(node, field)) {
        expect([true, false, null], path).toContain(node[field]);
      }
      for (const [key, value] of Object.entries(node)) inspect(value, `${path}.${key}`);
    };
    for (const file of readdirSync(dataRoot, { recursive: true }).filter((name) => name.endsWith('.json'))) {
      inspect(JSON.parse(readFileSync(join(dataRoot, file), 'utf8')), file);
    }
  });
});
