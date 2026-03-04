/**
 * _DBLink / _Jump マージの基本テスト
 *
 * 目的:
 * - `_DBLink` で参照している他DBの値が、エンリッチ時にレコードへマージされること
 * - `{ _Jump: { hashTag, _Search } }` が参照先の実値に置換されること
 *
 * NOTE:
 * - Service Worker 自体は起動せず、`EnrichmentProcessor` を直接呼びます。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// data-common.js はブラウザ/SW向けにグローバル公開する設計だが、Node でも評価可能
import '../lib/data-common.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = dirname(__dirname);

function loadJson(relPath) {
  return JSON.parse(readFileSync(join(repoRoot, relPath), 'utf-8'));
}

/**
 * Node 用の最小 DataFetcher スタブ
 * - EnrichmentProcessor が必要とする readDB / read*Type を提供
 */
class TestDataFetcher {
  async readDB(workId, dbName) {
    const wdir = String(workId).replace('#Works_', 'Works_');
    const p = `data/${wdir}/DataBases/db_${dbName}.json`;
    return loadJson(p);
  }
  async readGlobalMeta() {
    return loadJson('data/db_meta.json');
  }
  async readGeneralVarsDefGlobal() { return {}; }
  async readGeneralVarsDefWork() { return {}; }
  async readGlobalType() { return {}; }
  async readWorkType() { return {}; }
}

/**
 * Node 用の最小 config スタブ（画像系の withRepoBase を満たす）
 */
const testConfig = {
  ORIGIN: 'http://localhost',
  withRepoBase: (p) => String(p || '')
};

describe('_DBLink / _Jump merge (in-process)', () => {
  it('SinisterChangingGirls -> NumberTales の _DBLink を解決し、BirthDay._Jump を実値に置換できる', async () => {
    const dataFetcher = new TestDataFetcher();
    // data-common.js 側で global に公開される
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const sinister = loadJson('data/Works_SinisterChangingGirls/DataBases/db_Primary.json');
    const rec = sinister.find(r => r && r.Drc === 'N');
    expect(rec).toBeTruthy();
    expect(rec._DBLink).toBeTypeOf('object');
    expect(rec.BirthDay && rec.BirthDay._Jump).toBeTruthy();

    const out = await proc.enrichRecords([rec], '#Works_SinisterChangingGirls', 'Primary');
    expect(Array.isArray(out)).toBe(true);
    const e = out[0];

    // _Jump ラッパーが消えて、参照先の AnivDay 要素が入る想定
    expect(e.BirthDay).toBeTypeOf('object');
    expect(e.BirthDay._Jump).toBeUndefined();
    expect(e.BirthDay.Day).toBeTypeOf('object');
    expect(e.BirthDay.Day.Month).toBe(8);
    expect(e.BirthDay.Day.DayOfMonth).toBe(15);
    expect(e.BirthDay.DayAbout).toBe('誕生日');
  });

  it('_DBLink 参照先の同名フィールドは空値のみ穴埋めされる（既存値は維持）', async () => {
    const dataFetcher = new TestDataFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const sinister = loadJson('data/Works_SinisterChangingGirls/DataBases/db_Primary.json');
    const rec = sinister.find(r => r && r.Drc === 'N');
    expect(rec).toBeTruthy();

    // 既存値を保持することの確認用に、Name を意図的に差し替える
    const input = { ...rec, Name: 'TEST_NAME_OVERRIDE' };
    const out = await proc.enrichRecords([input], '#Works_SinisterChangingGirls', 'Primary');
    const e = out[0];

    expect(e.Name).toBe('TEST_NAME_OVERRIDE');
  });

  it('別DB参照の場合、画像系フィールドは参照先で穴埋めされない', async () => {
    class MemoryDataFetcher extends TestDataFetcher {
      async readDB(workId, dbName) {
        // 参照先DB（別JSON）
        if (workId === '#Works_OtherWork' && dbName === 'OtherDB') {
          return [{ Id: 'X', Test_PNGName: 'linked_image.png' }];
        }
        // 呼び出し元DB（このテストではファイル読込不要）
        return [];
      }
      async readGlobalType() {
        // Test_PNGName を画像フィールドとして認識させる
        return { $DefType: [{ hashTag: 'Test_PNGName', $type: 'PNGFileName' }] };
      }
    }

    const dataFetcher = new MemoryDataFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const rec = {
      Id: 'BASE',
      Test_PNGName: '',
      _DBLink: {
        worksTitle: 'OtherWork',
        dbName: 'OtherDB',
        _Search: [{ hashTag: 'Id', key: 'X' }]
      }
    };

    const out = await proc.enrichRecords([rec], '#Works_MainWork', 'Primary');
    const e = out[0];

    // 別DBからの画像はマージしない
    expect(e.Test_PNGName).toBe('');
  });

  it('_DBLink._Search で hashTag="#Index" を使うと、作品の $DefType_Index に基づいて参照先を特定できる（スカラーIndex）', async () => {
    const dataFetcher = new TestDataFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const rec = {
      Id: 'BASE',
      _DBLink: {
        worksTitle: 'NumberTales',
        dbName: 'Primary',
        _Search: [{ hashTag: '#Index', key: 1 }]
      }
    };

    const out = await proc.enrichRecords([rec], '#Works_MainWork', 'Primary');
    const e = out[0];

    // NumberTales の Num=1 は Name が「ハジメ」
    expect(e.Name).toBe('ハジメ');
  });

  it('_DBLink._Search で hashTag="#Index" + key=object を使うと、ネストIndex（例: Card.Stoat + Card.Num）をAND条件で特定できる', async () => {
    const dataFetcher = new TestDataFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const rec = {
      Id: 'BASE',
      _DBLink: {
        worksTitle: 'FLInvestigator78',
        dbName: 'Primary',
        _Search: [{ hashTag: '#Index', key: { Stoat: 'Major', Num: 0 } }]
      }
    };

    const out = await proc.enrichRecords([rec], '#Works_MainWork', 'Primary');
    const e = out[0];

    // FLInvestigator78 の Card:{Stoat:'Major',Num:0} は Name が「フェニクス」
    expect(e.Name).toBe('フェニクス');
  });

  it('旧メタ（$Def_Index）しか無い作品でも、hashTag="#Index" を $Def_Index にフォールバックして参照先を特定できる（UnauthedLogica）', async () => {
    const dataFetcher = new TestDataFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const rec = {
      Id: 'BASE',
      _DBLink: {
        worksTitle: 'UnauthedLogica',
        dbName: 'Primary',
        _Search: [{ hashTag: '#Index', key: { LogicSeries: null, Num: 62 } }]
      }
    };

    const out = await proc.enrichRecords([rec], '#Works_MainWork', 'Primary');
    const e = out[0];

    // UnauthedLogica の Model:{LogicSeries:null,Num:62} は FormalName が「人形兵ゼロイド62番機」
    expect(e.FormalName).toBe('人形兵ゼロイド62番機');
  });
});
