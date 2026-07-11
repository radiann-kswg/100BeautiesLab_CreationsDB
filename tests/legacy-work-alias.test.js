/**
 * 旧作品「Works_Proxies」直リンク・API直叩き互換シムのテスト
 *
 * 目的:
 * - Works_Proxies は Works_DestinyFoxRecords へ統合済み。
 * - `lib/data-common.js` の `resolveWorkDirName()`（モジュール内プライベート関数）が
 *   `Proxies` → `Works_DestinyFoxRecords` へ読み替えることを、公開APIである
 *   `ReferenceResolver.resolveWorksReference()` 経由の `fetchJSON` 呼び出しパスで検証する。
 * - 既存作品（Works_NumberTales 等）は無変換のまま素通りすることも確認する。
 *
 * NOTE:
 * - `lib/sw-common.js` にも同名の `resolveWorkDirName` があるが、SW実行時は
 *   importScripts の読み込み順（sw-common.js → data-common.js）により
 *   data-common.js 側の定義が最終的に有効になる。このテストは data-common.js 側を検証する。
 */
import { describe, it, expect } from 'vitest';

// data-common.js はブラウザ/SW向けにグローバル公開する設計だが、Node でも評価可能
import '../lib/data-common.js';

/**
 * fetchJSON 呼び出しを記録するだけの最小 DataFetcher スタブ
 */
class RecordingDataFetcher {
  constructor() {
    this.calls = [];
  }
  async fetchJSON(path) {
    this.calls.push(path);
    return {};
  }
}

const testConfig = {
  ORIGIN: 'http://localhost',
  withRepoBase: (p) => String(p || '')
};

describe('legacy Works_Proxies -> Works_DestinyFoxRecords directory alias', () => {
  it('resolveWorksReference("Proxies") fetches from Works_DestinyFoxRecords, not Works_Proxies', async () => {
    const dataFetcher = new RecordingDataFetcher();
    const resolver = new globalThis.ReferenceResolver(dataFetcher, testConfig);

    await resolver.resolveWorksReference('Proxies');

    expect(dataFetcher.calls).toEqual(['/data/Works_DestinyFoxRecords/DataBases/db_meta.json']);
  });

  it('resolveWorksReference("#Works_Proxies") also resolves via the alias', async () => {
    const dataFetcher = new RecordingDataFetcher();
    const resolver = new globalThis.ReferenceResolver(dataFetcher, testConfig);

    await resolver.resolveWorksReference('#Works_Proxies');

    expect(dataFetcher.calls).toEqual(['/data/Works_DestinyFoxRecords/DataBases/db_meta.json']);
  });

  it('resolveWorksReference("DestinyFoxRecords") is unaffected by the alias (already the merged work)', async () => {
    const dataFetcher = new RecordingDataFetcher();
    const resolver = new globalThis.ReferenceResolver(dataFetcher, testConfig);

    await resolver.resolveWorksReference('DestinyFoxRecords');

    expect(dataFetcher.calls).toEqual(['/data/Works_DestinyFoxRecords/DataBases/db_meta.json']);
  });

  it('resolveWorksReference("NumberTales") stays unaffected (other works are not aliased)', async () => {
    const dataFetcher = new RecordingDataFetcher();
    const resolver = new globalThis.ReferenceResolver(dataFetcher, testConfig);

    await resolver.resolveWorksReference('NumberTales');

    expect(dataFetcher.calls).toEqual(['/data/Works_NumberTales/DataBases/db_meta.json']);
  });
});
