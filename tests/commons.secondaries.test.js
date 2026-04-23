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

  it('backfills sec_Category and sec_DesignedBy from matched series meta when only sec_SeriesTitle exists', () => {
    const ctx = loadSwCommonIntoContext();
    expect(ctx?.self?.CommonsProcessor).toBeTypeOf('function');

    const meta = loadJSON('data/Works_NumberTales/DataBases/db_meta.json');
    const records = loadJSON('data/Works_NumberTales/DataBases/db_Secondary.json');
    const target = records.find((record) => record.Num === '0xA');

    expect(target).toBeTruthy();
    expect(target.sec_SeriesTitle).toBe('ヘキサデミカル・テールズ');
    expect(target.sec_Category).toBeUndefined();
    expect(target.sec_DesignedBy).toBeUndefined();

    const out0Json = vm.runInNewContext(
      `(() => {
        const meta = ${JSON.stringify(meta)};
        const rec = ${JSON.stringify(target)};
        const out = self.CommonsProcessor.applyCommonsToRecords([rec], meta, 'Secondary');
        return JSON.stringify(out[0]);
      })()`
      ,
      ctx,
      { filename: 'tests/commons.secondaries.test.js#series_backfill_secondary_meta' }
    );
    const out0 = JSON.parse(out0Json);

    expect(out0.sec_Category).toBe('共同二次創作');
    expect(out0.sec_DesignedBy).toBe('散狐アタスト(https://misskey.io/@atast)');
    expect(out0.Belonging).toEqual(['百花繚乱研究所', 'エイゼルベットの観測世界']);
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

  it('applies _Secondaries _Commons by sec_Category (and requires match when no sec_SeriesTitle)', () => {
    const ctx = loadSwCommonIntoContext();
    expect(ctx?.self?.CommonsProcessor).toBeTypeOf('function');

    const meta = {
      Databases: {
        '#DB_SelfSecondary': {
          _Commons: { Belonging: ['DB'] },
          _Secondaries: [
            { sec_Category: 'A', _Commons: { Belonging: ['A'] } },
            { sec_Category: null, _Commons: { Belonging: ['DEFAULT'] } }
          ]
        }
      }
    };

    // 1) sec_Category がある場合は、その一致定義を適用
    const outAJson = vm.runInNewContext(
      `(() => {
        const meta = ${JSON.stringify(meta)};
        const rec = { sec_Category: 'A' };
        const out = self.CommonsProcessor.applyCommonsToRecords([rec], meta, 'SelfSecondary');
        return JSON.stringify(out[0]);
      })()`
      ,
      ctx,
      { filename: 'tests/commons.secondaries.test.js#sec_category_A' }
    );
    const outA = JSON.parse(outAJson);
    expect(outA.Belonging).toEqual(['A']);

    // 2) sec_Category が無い場合は、sec_Category 指定の定義を誤適用せず、デフォルト定義を適用
    const outNoCatJson = vm.runInNewContext(
      `(() => {
        const meta = ${JSON.stringify(meta)};
        const rec = { Name: 'no-cat' };
        const out = self.CommonsProcessor.applyCommonsToRecords([rec], meta, 'SelfSecondary');
        return JSON.stringify(out[0]);
      })()`
      ,
      ctx,
      { filename: 'tests/commons.secondaries.test.js#sec_category_none' }
    );
    const outNoCat = JSON.parse(outNoCatJson);
    expect(outNoCat.Belonging).toEqual(['DEFAULT']);
  });

  it('treats all-null sec_** definition as fallback default and prefers specified definitions', () => {
    const ctx = loadSwCommonIntoContext();
    expect(ctx?.self?.CommonsProcessor).toBeTypeOf('function');

    const meta = {
      Databases: {
        '#DB_SelfSecondary': {
          _Secondaries: [
            {
              sec_Category: null,
              sec_DesignedBy: null,
              sec_SeriesTitle: null,
              _Commons: { Belonging: ['DEFAULT'], RaceType: 'DefaultRace' }
            },
            {
              sec_Category: '企画A',
              sec_DesignedBy: null,
              sec_SeriesTitle: null,
              _Commons: { Belonging: ['A'], RaceType: 'SpecificRace' }
            }
          ]
        }
      }
    };

    const outSpecifiedJson = vm.runInNewContext(
      `(() => {
        const meta = ${JSON.stringify(meta)};
        const rec = { sec_Category: '企画A' };
        const out = self.CommonsProcessor.applyCommonsToRecords([rec], meta, 'SelfSecondary');
        return JSON.stringify(out[0]);
      })()`
      ,
      ctx,
      { filename: 'tests/commons.secondaries.test.js#default_fallback_specific' }
    );
    const outSpecified = JSON.parse(outSpecifiedJson);
    expect(outSpecified.Belonging).toEqual(['A']);
    expect(outSpecified.RaceType).toBe('SpecificRace');

    const outDefaultJson = vm.runInNewContext(
      `(() => {
        const meta = ${JSON.stringify(meta)};
        const rec = { Name: 'fallback' };
        const out = self.CommonsProcessor.applyCommonsToRecords([rec], meta, 'SelfSecondary');
        return JSON.stringify(out[0]);
      })()`
      ,
      ctx,
      { filename: 'tests/commons.secondaries.test.js#default_fallback_default' }
    );
    const outDefault = JSON.parse(outDefaultJson);
    expect(outDefault.Belonging).toEqual(['DEFAULT']);
    expect(outDefault.RaceType).toBe('DefaultRace');
  });

  it('applies NumberTales SelfSecondary commons to numberize records with sec_DesignedBy', () => {
    const ctx = loadSwCommonIntoContext();
    expect(ctx?.self?.CommonsProcessor).toBeTypeOf('function');

    const meta = loadJSON('data/Works_NumberTales/DataBases/db_meta.json');
    const records = loadJSON('data/Works_NumberTales/DataBases/db_SelfSecondary.json');
    const target = records.find((record) => record.Num === '115-numberize');

    expect(target).toBeTruthy();
    expect(target.sec_Category).toBe('ナンバーテールズ化企画');
    expect(target.sec_DesignedBy).toBe('ラジアン(柏木主税)');

    const out0Json = vm.runInNewContext(
      `(() => {
        const meta = ${JSON.stringify(meta)};
        const rec = ${JSON.stringify(target)};
        const out = self.CommonsProcessor.applyCommonsToRecords([rec], meta, 'SelfSecondary');
        return JSON.stringify(out[0]);
      })()`
      ,
      ctx,
      { filename: 'tests/commons.secondaries.test.js#numberize_selfsecondary' }
    );
    const out0 = JSON.parse(out0Json);

    expect(out0.Belonging).toEqual([]);
    expect(out0.RaceType).toEqual([
      {
        value: 'PortableHumanoid(TaleBeastType)',
        about_JP: '自創作キャラ化の便宜上',
        about_EN: 'For the convenience of being adapted into our creations'
      },
      {
        about_JP: '実際の種族はわずかに異なる部分あり',
        about_EN: 'The actual species may differ slightly'
      }
    ]);
  });
});
