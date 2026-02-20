/**
 * 2言語対応フィールド（*_JP / *_EN）の同義解釈テスト
 *
 * - SW 側検索（EnrichmentProcessor.searchRecords）が、hashTag の言語サフィックス違いを
 *   同義として扱い、どちらのクエリでも一致できることを検証します。
 */
import { describe, it, expect } from 'vitest';

// data-common.js は Node/Vitest 環境で globalThis にクラスを公開する
import '../lib/data-common.js';

/** @type {typeof globalThis.EnrichmentProcessor} */
const EnrichmentProcessor = globalThis.EnrichmentProcessor;

describe('bilingual field interpretation', () => {
  it('treats base / *_JP / *_EN as aliases in searchRecords()', async () => {
    const dataFetcher = {
      readGeneralVarsDefGlobal: async () => ({}),
      readGeneralVarsDefWork: async () => ({}),
      readGlobalType: async () => ({
        $DefType: [
          { hashTag: 'Name_JP', $type: '#String_JP', hashTag_JP: '名前' },
          { hashTag: 'Name_EN', $type: '#String_EN', hashTag_JP: 'Name' },
        ]
      }),
      readWorkType: async () => ({ $DefType: [] }),
    };

    const proc = new EnrichmentProcessor(dataFetcher, {});

    const records = [
      { Num: 1, Name_JP: '太郎' },
      { Num: 2, Name_EN: 'Alice' },
    ];

    // base 名（Name）でクエリしても Name_JP にマッチできる
    {
      const matched = await proc.searchRecords(records, '#Works_Test', 'Primary', [
        { hashTag: 'Name', key: '太郎' }
      ]);
      expect(matched.map(r => r.Num)).toEqual([1]);
    }

    // Name_EN でクエリしても、Name_JP が存在するレコードにマッチできる
    {
      const matched = await proc.searchRecords(records, '#Works_Test', 'Primary', [
        { hashTag: 'Name_EN', key: '太郎' }
      ]);
      expect(matched.map(r => r.Num)).toEqual([1]);
    }

    // Name_JP でクエリしても、Name_EN が存在するレコードにマッチできる
    {
      const matched = await proc.searchRecords(records, '#Works_Test', 'Primary', [
        { hashTag: 'Name_JP', key: 'Alice' }
      ]);
      expect(matched.map(r => r.Num)).toEqual([2]);
    }
  });
});
