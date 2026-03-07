/**
 * 会話パターン情報（ConversationPattern）の取り回しテスト
 *
 * - 欠損時に enrich が失敗しないこと
 * - 表示分類は profile に入ること
 * - searchable:false により searchableText へ混入しないこと
 */
import { describe, it, expect } from 'vitest';

import '../lib/data-common.js';

/** @type {typeof globalThis.EnrichmentProcessor} */
const EnrichmentProcessor = globalThis.EnrichmentProcessor;

const testConfig = {
  ORIGIN: 'http://localhost',
  withRepoBase: (p) => String(p || '')
};

function createDataFetcher() {
  return {
    readGeneralVarsDefGlobal: async () => ({}),
    readGeneralVarsDefWork: async () => ({}),
    readGlobalMeta: async () => ({ CreationWorks: {} }),
    readGlobalType: async () => ({
      $DefType: [
        { hashTag: 'Name', $type: '#String', hashTag_JP: '愛称' },
        {
          hashTag: 'ConversationPattern',
          hashTag_JP: '会話パターンについて',
          searchable: false,
          $display: { section: 'profile' },
          $type: [
            { hashTag: 'TalkingTone', $type: '#Summary|#Null', hashTag_JP: '口調' },
            { hashTag: 'TopicPreference', $type: '#Summary|#Null', hashTag_JP: '話題嗜好' },
            { hashTag: 'TalkFrequency', $type: '#Summary|#Null', hashTag_JP: '会話頻度' },
            { hashTag: 'PreferredTopics', $type: '#Summary|#Null', hashTag_JP: 'やりがちな話題' },
            { hashTag: 'AvoidedTopics', $type: '#Summary|#Null', hashTag_JP: '避けがちな話題' },
            { hashTag: 'ConversationNotes', $type: '#Summary|#Null', hashTag_JP: '会話における補足' },
            { hashTag: 'DialogueExamples', $type: '#String[]|#String_withAbout[]|#Null', hashTag_JP: '台詞の例' },
          ]
        }
      ]
    }),
    readWorkType: async () => ({ $DefType: [] }),
  };
}

describe('conversation pattern enrichment behavior', () => {
  it('skips missing ConversationPattern safely', async () => {
    const proc = new EnrichmentProcessor(createDataFetcher(), testConfig);
    const records = [{ Name: 'Alice' }];

    const enriched = await proc.enrichRecords(records, '#Works_Test', 'Primary');

    expect(enriched).toHaveLength(1);
    expect(enriched[0].ConversationPattern).toBeUndefined();
    expect(enriched[0]._enrichment?.displaySections?.profile || []).not.toContain('ConversationPattern');
  });

  it('keeps ConversationPattern visible but excludes it from searchableText', async () => {
    const proc = new EnrichmentProcessor(createDataFetcher(), testConfig);
    const records = [{
      Name: 'Alice',
      ConversationPattern: {
        TalkingTone: '落ち着いた口調',
        TopicPreference: '魔法理論',
        PreferredTopics: '研究の話',
        AvoidedTopics: '過去の失敗',
        DialogueExamples: ['なるほど、その仮説は興味深いですね。'],
      }
    }];

    const enriched = await proc.enrichRecords(records, '#Works_Test', 'Primary');
    const profile = enriched[0]._enrichment?.displaySections?.profile || [];
    const searchableText = String(enriched[0]._enrichment?.searchableText || '');

    expect(profile).toContain('ConversationPattern');
    expect(searchableText).toContain('alice');
    expect(searchableText).not.toContain('落ち着いた口調');
    expect(searchableText).not.toContain('魔法理論');
    expect(searchableText).not.toContain('研究の話');
    expect(searchableText).not.toContain('過去の失敗');
    expect(searchableText).not.toContain('なるほど、その仮説は興味深いですね。');
  });

  it('normalizes nested DialogueExamples into an array for union array types', async () => {
    const proc = new EnrichmentProcessor(createDataFetcher(), testConfig);
    const records = [{
      Name: 'Alice',
      ConversationPattern: {
        DialogueExamples: {
          value: '落ち着いて、順番に確認しましょう。',
          about: '平常時の口調例'
        }
      }
    }];

    const enriched = await proc.enrichRecords(records, '#Works_Test', 'Primary');
    const examples = enriched[0]?.ConversationPattern?.DialogueExamples;

    expect(Array.isArray(examples)).toBe(true);
    expect(examples).toHaveLength(1);
    expect(examples[0]).toEqual({
      value: '落ち着いて、順番に確認しましょう。',
      about: '平常時の口調例'
    });
  });
});