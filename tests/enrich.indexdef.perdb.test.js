/**
 * $IndexDef の DB単位対応（サイドカーキー方式）テスト
 *
 * 目的:
 * - `$IndexDef_<DbNorm>` が宣言されている場合、そのDBのレコードには当該Indexが優先されること
 * - 未宣言のDB/作品では、従来通り work既定の `$IndexDef` にフォールバックすること（既存作品の後方互換）
 *
 * 背景:
 * - Works_DestinyFoxRecords（Index: Unit, #String）と Works_Proxies（Index: Generation, #Number）の
 *   統合に向けて、`EnrichmentProcessor.resolveIndexDefForDb()` を新設した。
 * - 命名規則は `pkg/cloudflare/scripts/migrate.mjs` の `$IndexDef_${dbNorm}` に合わせている。
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
  async readDB() { return []; }
  async readGlobalMeta() { return {}; }
  async readGeneralVarsDefGlobal() { return {}; }
  async readGeneralVarsDefWork() { return {}; }
  async readGlobalType() { return {}; }
  async readWorkType() { return {}; }
}

const testConfig = {
  ORIGIN: 'http://localhost',
  withRepoBase: (p) => String(p || '')
};

describe('$IndexDef per-DB resolution (sidecar key $IndexDef_<DbNorm>)', () => {
  it('DB固有の $IndexDef_<DbNorm> が宣言されていればそちらを優先する', async () => {
    class SidecarDataFetcher extends TestDataFetcher {
      async readWorkType() {
        return {
          $IndexDef: { hashTag: 'Unit', $type: '#String', hashTag_JP: '理学単位次元' },
          $IndexDef_Proxy: { hashTag: 'Generation', $type: '#Number', hashTag_JP: '代理の世代' },
          $DefType: []
        };
      }
    }

    const proc = new globalThis.EnrichmentProcessor(new SidecarDataFetcher(), testConfig);
    const ctx = await proc.getWorkContext('#Works_TestSidecar');

    // DB固有キーが無い（work既定の Primary 相当）場合は work既定の $IndexDef にフォールバック
    expect(proc.resolveIndexDefForDb(ctx, 'Primary')?.hashTag).toBe('Unit');
    // DB固有キー ($IndexDef_Proxy) があればそちらを優先
    expect(proc.resolveIndexDefForDb(ctx, 'Proxy')?.hashTag).toBe('Generation');
    // メタキー prefix (#DB_Proxy) が付いていても同じ結果になる（正規化を経由するため）
    expect(proc.resolveIndexDefForDb(ctx, '#DB_Proxy')?.hashTag).toBe('Generation');
    // dbName 未指定時は work既定にフォールバック
    expect(proc.resolveIndexDefForDb(ctx, '')?.hashTag).toBe('Unit');
  });

  it('DB固有の $IndexDef が無い作品では常に既定の $IndexDef を使う(既存作品の後方互換)', async () => {
    class LegacyDataFetcher extends TestDataFetcher {
      async readWorkType() {
        return {
          $IndexDef: { hashTag: 'Num', $type: '#Number|#String', hashTag_JP: '番号' },
          $DefType: []
        };
      }
    }

    const proc = new globalThis.EnrichmentProcessor(new LegacyDataFetcher(), testConfig);
    const ctx = await proc.getWorkContext('#Works_TestLegacy');

    expect(proc.resolveIndexDefForDb(ctx, 'Primary')?.hashTag).toBe('Num');
    expect(proc.resolveIndexDefForDb(ctx, 'Secondary')?.hashTag).toBe('Num');
    expect(proc.resolveIndexDefForDb(ctx, 'AnyOtherDb')?.hashTag).toBe('Num');
  });

  it('$IndexDef 自体が未宣言の作品では null を返す（例外を投げない）', async () => {
    const proc = new globalThis.EnrichmentProcessor(new TestDataFetcher(), testConfig);
    const ctx = await proc.getWorkContext('#Works_NoIndex');

    expect(proc.resolveIndexDefForDb(ctx, 'Primary')).toBeNull();
    expect(proc.resolveIndexDefForDb(ctx, '')).toBeNull();
  });

  it('実データ: Works_NumberTales は $IndexDef_* 未宣言のため常に既定 Num を使う（既存9作品の回帰確認）', async () => {
    class RealTypeDataFetcher extends TestDataFetcher {
      async readWorkType(workId) {
        const wdir = String(workId || '').replace('#Works_', 'Works_');
        return loadJson(`data/${wdir}/DataBases/db_type.json`);
      }
    }

    const proc = new globalThis.EnrichmentProcessor(new RealTypeDataFetcher(), testConfig);
    const ctx = await proc.getWorkContext('#Works_NumberTales');

    expect(ctx.indexDef?.hashTag).toBe('Num');
    expect(proc.resolveIndexDefForDb(ctx, 'Primary')?.hashTag).toBe('Num');
    expect(proc.resolveIndexDefForDb(ctx, 'Secondary')?.hashTag).toBe('Num');
    expect(proc.resolveIndexDefForDb(ctx, 'SemiPrimary')?.hashTag).toBe('Num');
  });

  it('enrichRecords() 経由でも DB固有 $IndexDef が normalizeRecordByTypeDef に伝播する', async () => {
    class SidecarDataFetcher extends TestDataFetcher {
      async readDB() {
        return [{ Id: 'BASE', Generation: 2 }];
      }
      async readWorkType() {
        return {
          $IndexDef: { hashTag: 'Unit', $type: '#String' },
          $IndexDef_Proxy: { hashTag: 'Generation', $type: '#Number' },
          $DefType: [
            { hashTag: 'Generation', $type: '#Index' }
          ]
        };
      }
    }

    const dataFetcher = new SidecarDataFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);
    const records = await dataFetcher.readDB();
    const out = await proc.enrichRecords(records, '#Works_TestEnrich', 'Proxy');

    // 例外なく処理が完了し、Index フィールドの値が保持されていることを確認
    expect(out[0].Generation).toBe(2);
  });
});
