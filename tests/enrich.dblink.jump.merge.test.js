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
});
