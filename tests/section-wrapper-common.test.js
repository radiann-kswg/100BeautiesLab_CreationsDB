/**
 * section-wrapper-common.js の最小レジストリ回帰テスト
 *
 * subFields standalone section renderer の built-in registry が登録され、
 * `sectionWrapper` 宣言から適切な helper へディスパッチできることを確認する。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = dirname(__dirname);

beforeAll(async () => {
  const moduleUrl = `${pathToFileURL(join(repoRoot, 'lib/section-wrapper-common.js')).href}?section-wrapper-common-test=${Date.now()}`;
  await import(moduleUrl);
});

describe('section-wrapper-common registry', () => {
  it('registers built-in section renderers', () => {
    const registry = globalThis.CharacterSectionRendererRegistry;
    expect(registry).toBeTruthy();

    const rendererNames = registry.getRegisteredSectionRenderers().map((renderer) => renderer.name).sort();
    expect(rendererNames).toEqual(['relationSection', 'statsSection', 'structuredObjectSection']);
  });

  it('resolves section renderer names from display metadata', () => {
    const registry = globalThis.CharacterSectionRendererRegistry;

    expect(registry.resolveSectionRendererName({
      display: { sectionWrapper: 'statsSection' }
    })).toBe('statsSection');
  });

  it('dispatches relation and stats helpers via named section wrappers', () => {
    const registry = globalThis.CharacterSectionRendererRegistry;

    const relationResult = registry.renderWithRegisteredSectionRenderer(
      { key: 'Relation', value: { Related: [] } },
      {
        display: { sectionWrapper: 'relationSection' },
        helpers: {
          renderRelationSection: (item) => `relation:${item.key}`
        }
      }
    );

    const statsResult = registry.renderWithRegisteredSectionRenderer(
      { key: 'AbilityStats', value: { Speed: { Rank: 'A' } } },
      {
        display: { sectionWrapper: 'statsSection' },
        helpers: {
          renderStatsSection: (item) => `stats:${item.key}`
        }
      }
    );

    expect(relationResult).toBe('relation:Relation');
    expect(statsResult).toBe('stats:AbilityStats');
  });

  it('falls back to the structured object renderer matcher for plain objects', () => {
    const registry = globalThis.CharacterSectionRendererRegistry;

    const structuredResult = registry.renderWithRegisteredSectionRenderer(
      {
        key: 'ConversationPattern',
        value: { TalkingTone: '落ち着いた口調' }
      },
      {
        helpers: {
          renderStructuredObjectSection: (item) => `structured:${item.key}`
        }
      }
    );

    expect(structuredResult).toBe('structured:ConversationPattern');
  });
});
