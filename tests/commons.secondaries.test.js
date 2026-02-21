/**
 * Commons（_Commons）適用: Secondary系のシリーズ別初期値参照テスト
 *
 * Service Worker 共通ライブラリ（lib/sw-common.js）の CommonsProcessor が、
 * 作品別 db_meta.json の `#DB_Secondary._Secondaries[]` を参照し、
 * `sec_SeriesTitle` に応じた `_Commons` を適用できることを検証します。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = dirname(__dirname);

function loadJSON(relPath) {
  return JSON.parse(readFileSync(join(repoRoot, relPath), 'utf-8'));
}

function loadText(relPath) {
  return readFileSync(join(repoRoot, relPath), 'utf-8');
}

function loadSwCommonIntoContext() {
  const code = loadText('lib/sw-common.js');

  // sw-common.js は Service Worker 環境向けの「classic script」なので、
  // vm 上で self を用意してロードし、self.CommonsProcessor を取り出す。
  const context = {
    console,
    self: {
      location: { origin: 'https://example.invalid', pathname: '/' },
    }
  };

  vm.runInNewContext(code, context, { filename: 'lib/sw-common.js' });
  return context;
}

describe('CommonsProcessor secondary series commons', () => {
  it('applies _Secondaries[]. _Commons by sec_SeriesTitle', () => {
    const ctx = loadSwCommonIntoContext();
    expect(ctx?.self?.CommonsProcessor).toBeTypeOf('function');

    const metaText = loadText('data/Works_NumberTales/DataBases/db_meta.json');
    const seriesTitle = 'ヘキサデミカル・テールズ';

    const resultJson = vm.runInNewContext(
      `(() => {
        const meta = JSON.parse(${JSON.stringify(metaText)});
        const rec = { sec_SeriesTitle: ${JSON.stringify(seriesTitle)} };

        const dbKey = self.DataUtils.normalizeDBKeyForMeta('Secondary');
        const dbMeta = meta?.Databases?.[dbKey] ?? null;
        const secDefs = dbMeta?._Secondaries ?? dbMeta?.Secondaries ?? null;
        const titles = Array.isArray(secDefs) ? secDefs.map(d => d && typeof d === 'object' ? d.sec_SeriesTitle : null) : null;

        const out = self.CommonsProcessor.applyCommonsToRecords([rec], meta, 'Secondary');
        return JSON.stringify({ dbKey, hasDbMeta: !!dbMeta, secDefsLen: Array.isArray(secDefs) ? secDefs.length : null, titles, out0: out[0] });
      })()`,
      ctx,
      { filename: 'tests/commons.secondaries.test.js#case1' }
    );
    const result = JSON.parse(resultJson);
    const out0 = result.out0;

    expect(result.dbKey).toBe('#DB_Secondary');
    expect(result.hasDbMeta).toBe(true);
    expect(result.secDefsLen).toBeGreaterThan(0);
    expect(result.titles).toContain(seriesTitle);

    if (!out0?.Belonging || !out0?.RaceType) {
      console.log('DEBUG case1', result);
    }

    expect(out0.Belonging).toEqual(['百花繚乱研究所', 'エイゼルベットの観測世界']);
    expect(out0.RaceType).toBe('PortableHumanoid(TaleBeastType,SoftwareBody)');
  });

  it('does not override non-empty record values', () => {
    const ctx = loadSwCommonIntoContext();
    expect(ctx?.self?.CommonsProcessor).toBeTypeOf('function');

    const metaText = loadText('data/Works_NumberTales/DataBases/db_meta.json');
    const seriesTitle = 'D-Vines(ディ-ヴァインズ)';

    const out0Json = vm.runInNewContext(
      `(() => {
        const meta = JSON.parse(${JSON.stringify(metaText)});
        const rec = {
          sec_SeriesTitle: ${JSON.stringify(seriesTitle)},
          Belonging: ['既存値']
        };
        const out = self.CommonsProcessor.applyCommonsToRecords([rec], meta, 'Secondary');
        return JSON.stringify(out[0]);
      })()`,
      ctx,
      { filename: 'tests/commons.secondaries.test.js#case2' }
    );
    const out0 = JSON.parse(out0Json);

    expect(out0.Belonging).toEqual(['既存値']);
    // 他のフィールド（未設定）は補完される
    expect(out0.RaceType).toBe('DeviatableHumanoid(TaleBeastType)');
  });
});
