/**
 * wrapper summary の enrich 出力テスト
 *
 * - `$display.wrapper` を持つ top-level field が `_enrichment.wrapperSummaries` へ集約されること
 * - Day / StoryEra が shared wrapper registry 経由で summary を返せること
 */
import { describe, it, expect } from 'vitest';

import '../lib/wrapper-common.js';
import '../lib/data-common.js';

/** @type {typeof globalThis.EnrichmentProcessor} */
const EnrichmentProcessor = globalThis.EnrichmentProcessor;

const testConfig = {
  ORIGIN: 'http://localhost',
  withRepoBase: (path) => String(path || '')
};

function createDataFetcher() {
  return {
    readGeneralVarsDefGlobal: async () => ({}),
    readGeneralVarsDefWork: async () => ({}),
    readGlobalMeta: async () => ({ CreationWorks: {} }),
    readGlobalType: async () => ({
      $DefType: [
        { hashTag: 'BirthDay', $type: '$Def_Day', hashTag_JP: '誕生日' },
        { hashTag: 'StoryEra', $type: '$Def_StoryEraCatalog|#Null', hashTag_JP: '年代' }
      ],
      $VarsDef: {
        $Def_Day: {
          $display: { wrapper: 'daySummary' },
          $DefType: [
            { hashTag: 'Month', $display: { role: 'month' } },
            { hashTag: 'DayOfMonth', $display: { role: 'dayOfMonth' } },
            { hashTag: 'DayAbout', $display: { role: 'annotation' } }
          ]
        }
      },
      $MetaType: {
        $Def_StoryEra: {
          $display: { wrapper: 'eraSummary' },
          $DefType: [
            { hashTag: 'EraGen', $display: { role: 'eraGeneration' } },
            { hashTag: 'YearInEra', $display: { role: 'eraYear' } },
            { hashTag: 'byRealYear', $display: { role: 'realYear' } },
            { hashTag: 'about_JP', $display: { role: 'pointLabel' } },
            { hashTag: 'about_EN', $display: { role: 'pointLabelAlt' } }
          ]
        },
        $Def_StoryEraCatalog: {
          $display: { wrapper: 'storyEraSummary' },
          $DefType: [
            { hashTag: 'FromEra', $display: { role: 'rangeStart' } },
            { hashTag: 'ToEra', $display: { role: 'rangeEnd' } },
            { hashTag: 'InEra', $display: { role: 'representativePoint' } },
            { hashTag: 'about_JP', $display: { role: 'preferredLabel' } },
            { hashTag: 'about_EN', $display: { role: 'preferredLabelAlt' } }
          ]
        }
      }
    }),
    readWorkType: async () => ({ $DefType: [] })
  };
}

describe('enrichment wrapper summaries', () => {
  it('stores day and story era summaries under _enrichment.wrapperSummaries', async () => {
    const proc = new EnrichmentProcessor(createDataFetcher(), testConfig);
    const [enriched] = await proc.enrichRecords([
      {
        BirthDay: {
          Day: { Month: 8, DayOfMonth: 15 },
          DayAbout: '誕生日'
        },
        StoryEra: {
          InEra: [{ EraGen: 9, YearInEra: 3 }, { byRealYear: 2050 }]
        }
      }
    ], '#Works_Test', 'Primary');

    expect(enriched._enrichment?.wrapperSummaries).toEqual({
      BirthDay: '8/15（誕生日）',
      StoryEra: '第9創世紀3年 / 西暦2050年'
    });
  });
});
