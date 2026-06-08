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

function resolveWorkDirName(workId) {
  return String(workId || '').replace('#Works_', 'Works_');
}

/**
 * Node 用の最小 DataFetcher スタブ
 * - EnrichmentProcessor が必要とする readDB / read*Type を提供
 */
class TestDataFetcher {
  async readDB(workId, dbName) {
    const wdir = resolveWorkDirName(workId);
    const p = `data/${wdir}/DataBases/db_${dbName}.json`;
    return loadJson(p);
  }
  async readGlobalMeta() {
    return loadJson('data/db_meta.json');
  }
  async readGeneralVarsDefGlobal() { return {}; }
  async readGeneralVarsDefWork() { return {}; }
  async readGlobalType() { return {}; }
  async readWorkType(workId) {
    const wdir = resolveWorkDirName(workId);
    try {
      return loadJson(`data/${wdir}/DataBases/db_type.json`);
    } catch {
      return {};
    }
  }
}

/**
 * Node 用の最小 config スタブ（画像系の withRepoBase を満たす）
 */
const testConfig = {
  ORIGIN: 'http://localhost',
  withRepoBase: (p) => String(p || '')
};

describe('_DBLink / _Jump merge (in-process)', () => {
  it('#ListLink wrapper は varsdef から Rank などの補助情報を補完できる', async () => {
    class ListLinkDataFetcher extends TestDataFetcher {
      async readGeneralVarsDefWork() {
        return {
          '#ListLink_EffectText': [
            { EffectText: '脆弱', EffectText_EN: 'Fragile', Rank: 'E' }
          ],
          '$Def_SafetyLevel': {
            '#ListLink_SafetyLevelText': [
              { SafetyLevelText: '訓練中', SafetyLevelText_EN: 'Training', Rank: 'B+' }
            ]
          }
        };
      }
    }

    const dataFetcher = new ListLinkDataFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const rec = {
      Id: 'BASE',
      EffectStats: {
        EffectText: '脆弱'
      },
      SafetyLevel: {
        SafetyLevelText: '訓練中'
      }
    };

    const out = await proc.enrichRecords([rec], '#Works_Test', 'Primary');
    const e = out[0];

    expect(e.EffectStats).toEqual({
      EffectText: '脆弱',
      EffectText_EN: 'Fragile',
      Rank: 'E'
    });
    expect(e.SafetyLevel).toEqual({
      SafetyLevelText: '訓練中',
      SafetyLevelText_EN: 'Training',
      Rank: 'B+'
    });
  });

  it('Belonging の辞書項目に BelongingArea があっても、top-level へは補助展開しない', async () => {
    class BelongingAreaDataFetcher extends TestDataFetcher {
      async readGeneralVarsDefGlobal() {
        return {
          '#List_Belonging': [
            {
              Belonging: '百花繚乱研究所',
              Belonging_EN: 'HundredBeauties Laboratory',
              BelongingArea: { Area: '九蓮国' }
            }
          ]
        };
      }
    }

    const dataFetcher = new BelongingAreaDataFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const rec = {
      Id: 'BASE',
      Belonging: ['百花繚乱研究所']
    };

    const out = await proc.enrichRecords([rec], '#Works_Test', 'Primary');
    const e = out[0];

    expect(e.BelongingArea).toBeUndefined();
    expect(e._enrichment?.derivedBelongingAreas).toBeUndefined();
  });

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

  it('_DBLink._Search で hashTag="#Index" を使うと、作品の $IndexDef（typedef）に基づいて参照先を特定できる（スカラーIndex）', async () => {
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

  it('別作品からの _DBLink マージでは、対象作品の schema に無いトップレベル項目を持ち込まない', async () => {
    class CrossWorkSchemaGuardFetcher extends TestDataFetcher {
      async readDB(workId, dbName) {
        if (workId === '#Works_OtherWork' && dbName === 'Primary') {
          return [{
            Id: 'X',
            Name: '参照先の名前',
            Relations: [{ About: '別作品の関係情報' }]
          }];
        }
        return [];
      }

      async readGlobalType() {
        return {
          $DefType: [
            { hashTag: 'Id', $type: '#String' },
            { hashTag: 'Name', $type: '#String' }
          ]
        };
      }

      async readWorkType(workId) {
        if (workId === '#Works_MainWork') {
          return {
            $DefType: [
              { hashTag: 'FormalName', $type: '#String' }
            ]
          };
        }
        return {};
      }
    }

    const dataFetcher = new CrossWorkSchemaGuardFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const rec = {
      Id: 'BASE',
      Name: '',
      _DBLink: {
        worksTitle: 'OtherWork',
        dbName: 'Primary',
        _Search: [{ hashTag: 'Id', key: 'X' }]
      }
    };

    const out = await proc.enrichRecords([rec], '#Works_MainWork', 'Primary');
    const e = out[0];

    expect(e.Name).toBe('参照先の名前');
    expect(e.Relations).toBeUndefined();
  });

  it('_DBLink 参照先探索では isPrivate=true の候補を採用しない', async () => {
    class PrivateLinkedRecordFetcher extends TestDataFetcher {
      async readDB(workId, dbName) {
        if (workId === '#Works_OtherWork' && dbName === 'Primary') {
          return [
            { Id: 'X', Name: 'private name', isPrivate: true },
            { Id: 'X', Name: 'public name' }
          ];
        }
        return [];
      }

      async readGlobalType() {
        return {
          $DefType: [
            { hashTag: 'Id', $type: '#String' },
            { hashTag: 'Name', $type: '#String' },
            { hashTag: 'isPrivate', $type: '#Boolean' }
          ]
        };
      }
    }

    const dataFetcher = new PrivateLinkedRecordFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const rec = {
      Id: 'BASE',
      Name: '',
      _DBLink: {
        worksTitle: 'OtherWork',
        dbName: 'Primary',
        _Search: [{ hashTag: 'Id', key: 'X' }]
      }
    };

    const out = await proc.enrichRecords([rec], '#Works_MainWork', 'Primary');
    const e = out[0];

    expect(e.Name).toBe('public name');
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

  it('hashTag="#Index" は UnauthedLogica の $IndexDef（ネスト型・null許容）でも参照先を特定できる', async () => {
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

  it('_Search の key がオブジェクト型の場合、AND 条件でサブフィールドを比較できる（インメモリ）', async () => {
    class ObjKeyDataFetcher extends TestDataFetcher {
      async readDB(_workId, _dbName) {
        return [
          { Id: 'A', Card: { Stoat: 'Major', StoatNum: 0, Num: 22 }, Name: 'フェニクス' },
          { Id: 'B', Card: { Stoat: 'Major', StoatNum: 1, Num: 1  }, Name: 'オリジン'   },
          { Id: 'C', Card: { Stoat: 'Minor', StoatNum: 0, Num: 1  }, Name: 'ミナーA'    },
        ];
      }
      async readGlobalType() {
        return {
          $DefType: [
            { hashTag: 'Id',   $type: '#String' },
            { hashTag: 'Card', $type: '#Object' },
            { hashTag: 'Name', $type: '#String' },
          ]
        };
      }
    }

    const dataFetcher = new ObjKeyDataFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const rec = {
      Id: 'BASE',
      Name: '',
      _DBLink: {
        worksTitle: 'TestWork',
        dbName: 'Primary',
        _Search: [{ hashTag: 'Card', key: { Stoat: 'Major', StoatNum: 0 } }]
      }
    };

    const out = await proc.enrichRecords([rec], '#Works_MainWork', 'Primary');
    const e = out[0];

    // Card:{Stoat:'Major',StoatNum:0} に一致するのは 'フェニクス' のみ
    expect(e.Name).toBe('フェニクス');
  });

  it('_Search の key がオブジェクト型の場合、AND 条件のいずれかが不一致なら採用しない', async () => {
    class ObjKeyMismatchFetcher extends TestDataFetcher {
      async readDB(_workId, _dbName) {
        return [
          { Id: 'A', Card: { Stoat: 'Major', StoatNum: 0 }, Name: 'フェニクス' },
          { Id: 'B', Card: { Stoat: 'Major', StoatNum: 1 }, Name: 'オリジン'   },
        ];
      }
      async readGlobalType() {
        return { $DefType: [{ hashTag: 'Id', $type: '#String' }, { hashTag: 'Name', $type: '#String' }] };
      }
    }

    const dataFetcher = new ObjKeyMismatchFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    // Stoat='Major' には 2 件一致するが、StoatNum=99 で絞ると 0 件 → マージしない
    const rec = {
      Id: 'BASE',
      Name: 'ベース',
      _DBLink: {
        worksTitle: 'TestWork',
        dbName: 'Primary',
        _Search: [{ hashTag: 'Card', key: { Stoat: 'Major', StoatNum: 99 } }]
      }
    };

    const out = await proc.enrichRecords([rec], '#Works_MainWork', 'Primary');
    const e = out[0];

    // 一致なし → Name は変化しない
    expect(e.Name).toBe('ベース');
  });

  it('hashTag が実フィールド名でオブジェクト型 key を使った AND 条件マッチングが FLInvestigator78/PrimaryDealer で動作する', async () => {
    const dataFetcher = new TestDataFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const rec = {
      Id: 'BASE',
      Character: '',
      _DBLink: {
        worksTitle: 'FLInvestigator78',
        dbName: 'PrimaryDealer',
        _Search: [{ hashTag: 'Card', key: { Stoat: 'Major', StoatNum: 0 } }]
      }
    };

    const out = await proc.enrichRecords([rec], '#Works_MainWork', 'Primary');
    const e = out[0];

    // PrimaryDealer の Card:{Stoat:'Major',StoatNum:0} は Character が「能天気でどこか浮いている」
    expect(e.Character).toBe('能天気でどこか浮いている');
  });

  it('base に $alt フィールドの値がある場合、_DBLink からの primary フィールドマージをスキップする（インメモリ）', async () => {
    class AltSkipFetcher extends TestDataFetcher {
      async readDB(_workId, _dbName) {
        return [{ Id: 'X', Age: 21 }];
      }
      async readGlobalType() {
        return {
          $DefType: [
            { hashTag: 'Id',         $type: '#String' },
            { hashTag: 'Age',        $type: '#Number', $alt: 'ConceptAge' },
            { hashTag: 'ConceptAge', $type: '#Number|#Number_withAbout' }
          ]
        };
      }
    }

    const dataFetcher = new AltSkipFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    // base には ConceptAge（$alt）が入っており、Age は未定義
    const rec = {
      Id: 'BASE',
      ConceptAge: { hideText: '不定' },
      _DBLink: {
        worksTitle: 'TestWork',
        dbName: 'Primary',
        _Search: [{ hashTag: 'Id', key: 'X' }]
      }
    };

    const out = await proc.enrichRecords([rec], '#Works_MainWork', 'Primary');
    const e = out[0];

    // linked の Age: 21 はマージされない（ConceptAge に既値があるため）
    // applyAltFallbacks により ConceptAge の値が Age にコピーされるので 21 にはならない
    expect(e.Age).not.toBe(21);
    expect(e.Age).toEqual({ hideText: '不定' });
    // ConceptAge はそのまま維持される
    expect(e.ConceptAge).toEqual({ hideText: '不定' });
  });

  it('base に $alt フィールドの値がない場合、_DBLink からの primary フィールドは通常どおりマージされる', async () => {
    class AltNoSkipFetcher extends TestDataFetcher {
      async readDB(_workId, _dbName) {
        return [{ Id: 'X', Age: 29 }];
      }
      async readGlobalType() {
        return {
          $DefType: [
            { hashTag: 'Id',         $type: '#String' },
            { hashTag: 'Age',        $type: '#Number', $alt: 'ConceptAge' },
            { hashTag: 'ConceptAge', $type: '#Number|#Number_withAbout' }
          ]
        };
      }
    }

    const dataFetcher = new AltNoSkipFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    // base に ConceptAge も Age もない → linked の Age をマージすべき
    const rec = {
      Id: 'BASE',
      _DBLink: {
        worksTitle: 'TestWork',
        dbName: 'Primary',
        _Search: [{ hashTag: 'Id', key: 'X' }]
      }
    };

    const out = await proc.enrichRecords([rec], '#Works_MainWork', 'Primary');
    const e = out[0];

    expect(e.Age).toBe(29);
  });

  it('FLInvestigator78/Primary フェニクスの ConceptAge が _DBLink（PrimaryDealer）の Age より優先される', async () => {
    // readGlobalType を実際の data/db_type.json に差し替えて $alt 宣言を読み込む
    class RealGlobalTypeFetcher extends TestDataFetcher {
      async readGlobalType() { return loadJson('data/db_type.json'); }
    }

    const dataFetcher = new RealGlobalTypeFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const primary = loadJson('data/Works_FLInvestigator78/DataBases/db_Primary.json');
    const phoenix = primary.find(r => r?.Name === 'フェニクス');
    expect(phoenix).toBeTruthy();
    expect(phoenix.ConceptAge).toEqual({ hideText: '不定' });

    const out = await proc.enrichRecords([phoenix], '#Works_FLInvestigator78', 'Primary');
    const e = out[0];

    // linked の Age: 21 はマージされない（ConceptAge に既値があるため）
    // applyAltFallbacks により ConceptAge の値が Age にコピーされるので 21 にはならない
    expect(e.Age).not.toBe(21);
    expect(e.Age).toEqual({ hideText: '不定' });
    expect(e.ConceptAge).toEqual({ hideText: '不定' });
  });
});
