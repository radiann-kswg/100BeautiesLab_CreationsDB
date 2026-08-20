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

  it('Belonging の辞書項目に FactionsBaseArea があっても、top-level へは補助展開しない', async () => {
    class FactionsBaseAreaDataFetcher extends TestDataFetcher {
      async readGeneralVarsDefGlobal() {
        return {
          '#List_Belonging': [
            {
              Belonging: '百花繚乱研究所',
              Belonging_EN: 'HundredBeauties Laboratory',
              FactionsBaseArea: { Area: '九蓮国' }
            }
          ]
        };
      }
    }

    const dataFetcher = new FactionsBaseAreaDataFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const rec = {
      Id: 'BASE',
      Belonging: ['百花繚乱研究所']
    };

    const out = await proc.enrichRecords([rec], '#Works_Test', 'Primary');
    const e = out[0];

    expect(e.FactionsBaseArea).toBeUndefined();
    expect(e._enrichment?.derivedFactionsBaseAreas).toBeUndefined();
  });

  it('ルート（旧形式）_DBLink を足場に BirthDay._Jump を参照先の実値へ置換できる', async () => {
    // NOTE: 実データは JP/EN 命名標準化・$Def_DBLinkRef 新形式への移行で、
    //   SinisterChangingGirls 'N' のクロスワークリンクが ルート _DBLink → AnotherRegions_DBLink へ移設され、
    //   ルート _DBLink は null 化、参照先の DayAbout も DayAbout_JP へ改名済み。
    //   本テストは「ルート（マージ用）旧形式 _DBLink を足場に _Jump を解決・置換する」契約の単体検証なので、
    //   実データ依存をやめ、合成レコード + インメモリ参照先で固定化する（実装・データは変更しない）。
    class JumpDataFetcher extends TestDataFetcher {
      async readDB(workId, dbName) {
        // 参照先（NumberTales 相当）の primary レコード。AnivDay 配列を持つ
        if (workId === '#Works_NumberTales' && dbName === 'Primary') {
          return [{
            Id: 'NT0',
            Name_JP: 'ゼロ',
            AnivDay: [
              { Day: { Month: 8, DayOfMonth: 15 }, DayAbout: '誕生日' },
              { Day: { Month: 1, DayOfMonth: 1 }, DayAbout: '記念日' }
            ]
          }];
        }
        return [];
      }
    }

    const dataFetcher = new JumpDataFetcher();
    // data-common.js 側で global に公開される
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    // ルート旧形式 _DBLink（マージ用）を足場に、BirthDay._Jump を参照先 AnivDay の該当要素へ置換する
    const rec = {
      Id: 'BASE',
      Drc: 'N',
      BirthDay: {
        _Jump: { hashTag: 'AnivDay', _Search: [{ hashTag: 'DayAbout', key: '誕生日' }] }
      },
      _DBLink: {
        worksTitle: 'NumberTales',
        dbName: 'Primary',
        _Search: [{ hashTag: 'Id', key: 'NT0' }]
      }
    };
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

  it('_Jump 内の $Def_DBLinkRef 形式 _DBLink から、ルート _DBLink 無しでも値を取得できる', async () => {
    // 実データ相当: PastDivers/SemiPrimary の BirthDay が
    // SinisterChangingGirls/Primary（Drc: 'E'）の BirthDay を参照するケース
    const dataFetcher = new TestDataFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const rec = {
      Chronos: { Lunar: 'Junius.II' },
      BirthDay: {
        _Jump: {
          hashTag: 'BirthDay',
          _DBLink: { _Work: 'SinisterChangingGirls', _DB: 'Primary', Drc: 'E' }
        }
      }
    };

    const out = await proc.enrichRecords([rec], '#Works_PastDivers', 'SemiPrimary');
    const e = out[0];

    // _Jump ラッパーが消えて、参照先の BirthDay 実値（Day wrapper）が入る想定
    expect(e.BirthDay).toBeTypeOf('object');
    expect(e.BirthDay._Jump).toBeUndefined();
    expect(e.BirthDay.Day).toBeTypeOf('object');
    expect(e.BirthDay.Day.Month).toBe(4);
    expect(e.BirthDay.Day.DayOfMonth).toBe(7);
  });

  it('_Jump 内 _DBLink の解決に失敗した場合は元のラッパーを維持する（誤置換しない）', async () => {
    const dataFetcher = new TestDataFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const rec = {
      Id: 'BASE',
      BirthDay: {
        _Jump: {
          hashTag: 'BirthDay',
          _DBLink: { _Work: 'SinisterChangingGirls', _DB: 'Primary', Drc: 'ZZZ_NOT_EXIST' }
        }
      }
    };

    const out = await proc.enrichRecords([rec], '#Works_PastDivers', 'SemiPrimary');
    const e = out[0];

    // 参照先が特定できないため、_Jump ラッパーはそのまま残す
    expect(e.BirthDay?._Jump).toBeTypeOf('object');
    expect(e.BirthDay._Jump.hashTag).toBe('BirthDay');
  });

  it('$enrich: null 入りネストインデックス（例: Model.LogicSeries/Num が null）でも 1 件一致なら参照先をマージできる', async () => {
    // 実データ相当: SinisterChangingGirls/Primary（Drc: 'S' 六花 雙葉）の AnotherRegions_DBLink が
    // UnauthedLogica/Primary の Model: { LogicSeries: null, Num: null }（型番未確定）を参照するケース
    // NOTE: AnotherRegions_DBLink の $enrich: true はグローバル data/db_type.json 側の宣言のため、
    //   readGlobalType を実データで返すフェッチャーを使う
    class GlobalTypeDataFetcher extends TestDataFetcher {
      async readGlobalType() { return loadJson('data/db_type.json'); }
    }
    const dataFetcher = new GlobalTypeDataFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const scg = loadJson('data/Works_SinisterChangingGirls/DataBases/db_Primary.json');
    const base = scg.find(r => r?.Drc === 'S');
    expect(base).toBeTruthy();
    expect(base.Height_cm).toBeUndefined();

    const out = await proc.enrichRecords([base], '#Works_SinisterChangingGirls', 'Primary');
    const e = out[0];

    // UnauthedLogica 側（雙葉レコード）の値が空値フィールドへマージされる想定
    expect(e.Height_cm).toBe(155);
    // 既存値は上書きされない（SCG 側の Age: 27 を維持。UnauthedLogica 側は 26）
    expect(e.Age).toBe(27);
  });

  it('$enrich: null 入りインデックスが複数レコードに一致する場合は曖昧一致としてスキップする', async () => {
    class AmbiguousDataFetcher extends TestDataFetcher {
      async readGlobalType() { return loadJson('data/db_type.json'); }
      async readDB(workId, dbName) {
        if (workId === '#Works_UnauthedLogica' && dbName === 'Primary') {
          // Model が全 null のレコードが 2 件 → 曖昧一致
          return [
            { Model: { LogicSeries: null, Num: null }, Name_JP: 'A', Height_cm: 100 },
            { Model: { LogicSeries: null, Num: null }, Name_JP: 'B', Height_cm: 200 }
          ];
        }
        return super.readDB(workId, dbName);
      }
    }

    const dataFetcher = new AmbiguousDataFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const scg = loadJson('data/Works_SinisterChangingGirls/DataBases/db_Primary.json');
    const base = scg.find(r => r?.Drc === 'S');

    const out = await proc.enrichRecords([base], '#Works_SinisterChangingGirls', 'Primary');
    const e = out[0];

    // 2 件一致のため解決せず、Height_cm は埋まらない
    expect(e.Height_cm).toBeUndefined();
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

    // NumberTales の Num=1 は JP/EN 命名標準化により Name_JP が「1(ハジメ)」（旧 Name は null）
    expect(e.Name_JP).toBe('1(ハジメ)');
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

  it('_DBLink._Search で hashTag="#Index" + key=object を使うと、ネストIndex（例: Card.Suit + Card.Num）をAND条件で特定できる', async () => {
    const dataFetcher = new TestDataFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const rec = {
      Id: 'BASE',
      _DBLink: {
        worksTitle: 'FLInvestigator78',
        dbName: 'Primary',
        _Search: [{ hashTag: '#Index', key: { Suit: 'Major', SuitNum: 0 } }]
      }
    };

    const out = await proc.enrichRecords([rec], '#Works_MainWork', 'Primary');
    const e = out[0];

    // インデックス意味分離（Num=通し番号 / SuitNum=種別内番号）に追従。
    // FLInvestigator78 の Card:{Suit:'Major',SuitNum:0}（通し番号 Num:22）は Name_JP が「フェニクス」
    expect(e.Name_JP).toBe('フェニクス');
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

    // UnauthedLogica の Model:{LogicSeries:null,Num:62} は FormalName_JP が「人形兵ゼロイド62番機」
    expect(e.FormalName_JP).toBe('人形兵ゼロイド62番機');
  });

  it('_Search の key がオブジェクト型の場合、AND 条件でサブフィールドを比較できる（インメモリ）', async () => {
    class ObjKeyDataFetcher extends TestDataFetcher {
      async readDB(_workId, _dbName) {
        return [
          { Id: 'A', Card: { Suit: 'Major', SuitNum: 0, Num: 22 }, Name: 'フェニクス' },
          { Id: 'B', Card: { Suit: 'Major', SuitNum: 1, Num: 1  }, Name: 'オリジン'   },
          { Id: 'C', Card: { Suit: 'Minor', SuitNum: 0, Num: 1  }, Name: 'ミナーA'    },
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
        _Search: [{ hashTag: 'Card', key: { Suit: 'Major', SuitNum: 0 } }]
      }
    };

    const out = await proc.enrichRecords([rec], '#Works_MainWork', 'Primary');
    const e = out[0];

    // Card:{Suit:'Major',SuitNum:0} に一致するのは 'フェニクス' のみ
    expect(e.Name).toBe('フェニクス');
  });

  it('_Search の key がオブジェクト型の場合、AND 条件のいずれかが不一致なら採用しない', async () => {
    class ObjKeyMismatchFetcher extends TestDataFetcher {
      async readDB(_workId, _dbName) {
        return [
          { Id: 'A', Card: { Suit: 'Major', SuitNum: 0 }, Name: 'フェニクス' },
          { Id: 'B', Card: { Suit: 'Major', SuitNum: 1 }, Name: 'オリジン'   },
        ];
      }
      async readGlobalType() {
        return { $DefType: [{ hashTag: 'Id', $type: '#String' }, { hashTag: 'Name', $type: '#String' }] };
      }
    }

    const dataFetcher = new ObjKeyMismatchFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    // Suit='Major' には 2 件一致するが、SuitNum=99 で絞ると 0 件 → マージしない
    const rec = {
      Id: 'BASE',
      Name: 'ベース',
      _DBLink: {
        worksTitle: 'TestWork',
        dbName: 'Primary',
        _Search: [{ hashTag: 'Card', key: { Suit: 'Major', SuitNum: 99 } }]
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
      Character_JP: '',
      _DBLink: {
        worksTitle: 'FLInvestigator78',
        dbName: 'PrimaryDealer',
        _Search: [{ hashTag: 'Card', key: { Suit: 'Major', SuitNum: 0 } }]
      }
    };

    const out = await proc.enrichRecords([rec], '#Works_MainWork', 'Primary');
    const e = out[0];

    // PrimaryDealer の Card:{Suit:'Major',SuitNum:0} は Character_JP が「能天気でどこか浮いている」
    expect(e.Character_JP).toBe('能天気でどこか浮いている');
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
    const phoenix = primary.find(r => r?.Name_JP === 'フェニクス');
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

  it('FLInvestigator78/PrimaryDealer の cross-work AnotherRegions_DBLink は現DBキーと文脈を優先する', async () => {
    class RealGlobalTypeFetcher extends TestDataFetcher {
      async readGlobalType() { return loadJson('data/db_type.json'); }
    }

    const dataFetcher = new RealGlobalTypeFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const primaryDealer = loadJson('data/Works_FLInvestigator78/DataBases/db_PrimaryDealer.json');
    const mai = primaryDealer.find(r => r?.Card?.Suit === 'Dealer' && Number(r?.Card?.Num) === 79);
    expect(mai).toBeTruthy();

    // 参照元（FLInvestigator78/PrimaryDealer の錦野舞）が持つ自DBの Class。
    // 以前は空配列だったが、2026-08-02 の DB 更新で実値が入力された。
    // 「ベースが空値のときだけ穴埋めする」という enrich の仕様上、実値が入った時点で
    // cross-work マージは発生しない。テストの主眼は下の「持ち込まれないこと」のガードにある
    expect(Array.isArray(mai.Class)).toBe(true);
    expect(mai.Class).toEqual(['采配幹部(ディーラーズ)']);
    expect(mai.RelationTo_Primary).toBeUndefined();

    // 参照先（NumberTales/SemiPrimary の Num: "%"）は Class と RelationTo_Primary の双方を持つ。
    // cross-work の `_DBLink` 制約により、これらが参照元へ流れ込んではいけない
    const ntSemiPrimary = loadJson('data/Works_NumberTales/DataBases/db_SemiPrimary.json');
    const linked = ntSemiPrimary.find(r => String(r?.Num) === '%');
    expect(linked).toBeTruthy();
    expect(linked.Class).toEqual(['開発者', 'ヒューマノイド開発部(シンフォニー.XVI)']);
    expect(linked.RelationTo_Primary).toBeTruthy();

    const out = await proc.enrichRecords([mai], '#Works_FLInvestigator78', 'PrimaryDealer');
    const e = out[0];

    // 自DBの値が維持され、参照先の Class は 1 件も混入しない
    expect(e.Class).toEqual(['采配幹部(ディーラーズ)']);
    for (const leaked of linked.Class) {
      expect(e.Class).not.toContain(leaked);
    }
    // 参照先が持つ RelationTo_Primary も持ち込まれない（現DBの文脈が優先される）
    expect(e.RelationTo_Primary).toBeUndefined();
    expect(e.RelationNotes_JP).toContain('アルカナホルダー');
  });

  it('UnauthedLogica/Primary の cross-work AnotherRegions_DBLink は明示 null の CodeName を $alt 経由でも埋めない', async () => {
    class RealGlobalTypeFetcher extends TestDataFetcher {
      async readGlobalType() { return loadJson('data/db_type.json'); }
    }

    const dataFetcher = new RealGlobalTypeFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const primary = loadJson('data/Works_UnauthedLogica/DataBases/db_Primary.json');
    const rei = primary.find(r => r?.FormalName_JP === '千歳 玲');
    expect(rei).toBeTruthy();
    expect(rei.CodeName_JP).toBeNull();
    expect(rei.CodeName_EN).toBeNull();

    const out = await proc.enrichRecords([rei], '#Works_UnauthedLogica', 'Primary');
    const e = out[0];

    expect(e.CodeName_JP).toBeNull();
    expect(e.CodeName_EN).toBeNull();
    expect(e.SPCodeName_JP).toBeUndefined();
    expect(e.SPCodeName_EN).toBeUndefined();
  });
});

describe('AnotherRegions_DBLink same-work merge (Works_DestinyFoxRecords / Proxy DB integration)', () => {
  // AnotherRegions_DBLink の $enrich:true 宣言はグローバル db_type.json 側にあるため、
  // グローバル typedef も実データから読む DataFetcher を使う
  class GlobalTypeAwareDataFetcher extends TestDataFetcher {
    async readGlobalType() {
      return loadJson('data/db_type.json');
    }
  }

  it('rad (Primary) merges Generation:2 (Proxy) fields via same-work AnotherRegions_DBLink (_Work omitted)', async () => {
    const dataFetcher = new GlobalTypeAwareDataFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const primary = loadJson('data/Works_DestinyFoxRecords/DataBases/db_Primary.json');
    const rad = primary.find(r => r?.Unit === 'rad');
    expect(rad).toBeTruthy();
    expect(rad.AnotherRegions_DBLink).toEqual([{ _DB: 'Proxy', Generation: 2 }]);
    expect(rad.Character_JP).toBeUndefined();

    const out = await proc.enrichRecords([rad], '#Works_DestinyFoxRecords', 'Primary');
    const e = out[0];

    // 同一Work内リンクになったため、cross-work専用ガードレール（declaredKeys等）が外れ、
    // Proxy側にしかない空欄フィールドが穴埋めされる
    expect(e.Character_JP).toBe('理工学系で知能的かつ技術的だが、やや思慮的で残念な一面がある');
    expect(e.InStory_JP).toBeTypeOf('string');
    expect(e.Backgrounds_JP).toBeTypeOf('string');

    // 既存値がある同名フィールドは上書きされない（空値のみ穴埋めの原則）
    expect(e.FirstPersonCalling_JP).toBe('ワテ,僕');
  });

  it('Generation:2 (Proxy) merges rad (Primary) fields via same-work AnotherRegions_DBLink (_Work omitted)', async () => {
    const dataFetcher = new GlobalTypeAwareDataFetcher();
    const proc = new globalThis.EnrichmentProcessor(dataFetcher, testConfig);

    const proxyRecords = loadJson('data/Works_DestinyFoxRecords/DataBases/db_Proxy.json');
    const gen2 = proxyRecords.find(r => r?.Generation === 2);
    expect(gen2).toBeTruthy();
    expect(gen2.AnotherRegions_DBLink).toEqual([{ _DB: 'Primary', Unit: 'rad' }]);
    expect(gen2.Unit_JP).toBeUndefined();

    const out = await proc.enrichRecords([gen2], '#Works_DestinyFoxRecords', 'Proxy');
    const e = out[0];

    expect(e.Unit_JP).toBe('角度(弧度法)');
  });
});

describe('_Jump の言語別名解決（*_JP / *_EN 分離フィールドを suffix 無しで指す）', () => {
  // 参照先: NumberTales/Primary Num=1 の NumerospecStats.NumerospecAbout_JP / _EN
  // 期待値はデータから取る（本文が変わってもテストが陳腐化しないようにする）
  const NT_LINK = { _Work: 'NumberTales', _DB: 'Primary', Num: 1 };
  const NT1 = loadJson('data/Works_NumberTales/DataBases/db_Primary.json')
    .find((r) => String(r.Num) === '1');
  const JP_TEXT = NT1?.NumerospecStats?.NumerospecAbout_JP;
  const EN_TEXT = NT1?.NumerospecStats?.NumerospecAbout_EN;

  /** UnauthedLogica の実際の形（LogicspecStats 配下の _JP / _EN）で 1 件 enrich する */
  async function enrichLogicspec(childKey, hashTag) {
    const proc = new globalThis.EnrichmentProcessor(new TestDataFetcher(), testConfig);
    const rec = {
      Model: { ModelSeries: 'AttackerZeroid', Num: 61 },
      LogicspecStats: {
        [childKey]: { _Jump: { hashTag, _DBLink: NT_LINK } }
      }
    };
    const out = await proc.enrichRecords([rec], '#Works_UnauthedLogica', 'Primary');
    return out[0]?.LogicspecStats?.[childKey];
  }

  it('前提: 参照先が _JP / _EN に分離した非空の値を持つ', () => {
    expect(typeof JP_TEXT).toBe('string');
    expect(typeof EN_TEXT).toBe('string');
    expect(JP_TEXT).not.toBe(EN_TEXT);
  });

  it('suffix 無し ＋ ドットパスで、参照元が _JP なら参照先の _JP を引く', async () => {
    expect(await enrichLogicspec('LogicspecAbout_JP', 'NumerospecStats.NumerospecAbout')).toBe(JP_TEXT);
  });

  it('同じ hashTag でも、参照元が _EN なら参照先の _EN を引く', async () => {
    expect(await enrichLogicspec('LogicspecAbout_EN', 'NumerospecStats.NumerospecAbout')).toBe(EN_TEXT);
  });

  it('suffix を明示した完全一致は従来どおり（参照元の言語に引きずられない）', async () => {
    expect(await enrichLogicspec('LogicspecAbout_JP', 'NumerospecStats.NumerospecAbout_EN')).toBe(EN_TEXT);
    expect(await enrichLogicspec('LogicspecAbout_EN', 'NumerospecStats.NumerospecAbout_JP')).toBe(JP_TEXT);
  });

  it('どの候補にも当たらなければラッパーを維持する（誤置換しない）', async () => {
    const v = await enrichLogicspec('LogicspecAbout_JP', 'NumerospecStats.NoSuchField');
    expect(v?._Jump).toBeTypeOf('object');
    expect(v._Jump.hashTag).toBe('NumerospecStats.NoSuchField');
  });

  it('コンテナのパスを省くと当たらない（明示パス方式。レコード全体は走査しない）', async () => {
    const v = await enrichLogicspec('LogicspecAbout_JP', 'NumerospecAbout');
    expect(v?._Jump).toBeTypeOf('object');
  });

  it('TypeDefUtils.expandLangAliasCandidates は prefix を保って末尾だけ展開する', () => {
    const T = globalThis.TypeDefUtils;

    // _Search が使う既定の並び（挙動不変の回帰）
    expect(T.expandLangAliasCandidates('FormalName_JP'))
      .toEqual(['FormalName_JP', 'FormalName', 'FormalName_EN']);
    expect(T.expandLangAliasCandidates('FormalName_EN'))
      .toEqual(['FormalName_EN', 'FormalName', 'FormalName_JP']);

    // ドットパスは prefix を保ち、末尾だけを展開する
    expect(T.expandLangAliasCandidates('NumerospecStats.NumerospecAbout')).toEqual([
      'NumerospecStats.NumerospecAbout',
      'NumerospecStats.NumerospecAbout_JP',
      'NumerospecStats.NumerospecAbout_EN'
    ]);

    // preferLang: 'EN' なら _EN を先に試す
    expect(T.expandLangAliasCandidates('NumerospecStats.NumerospecAbout', 'EN')).toEqual([
      'NumerospecStats.NumerospecAbout',
      'NumerospecStats.NumerospecAbout_EN',
      'NumerospecStats.NumerospecAbout_JP'
    ]);

    expect(T.expandLangAliasCandidates('')).toEqual([]);
  });
});

describe('_Jump が $enrich: true の *_DBLink の参照先へ連動する', () => {
  // 共有スタブの readGlobalType() は {} を返すため、グローバル db_type.json で宣言された
  // `AnotherRegions_DBLink` の `$enrich: true` が見えない。ここだけ実物を読ませる
  class GlobalTypeDataFetcher extends TestDataFetcher {
    async readGlobalType() { return loadJson('data/db_type.json'); }
  }

  const NT_PRIMARY = loadJson('data/Works_NumberTales/DataBases/db_Primary.json');
  const ntAbout = (num) => NT_PRIMARY
    .find((r) => String(r.Num) === String(num))?.NumerospecStats?.NumerospecAbout_JP;

  /** UnauthedLogica の実際の形（AnotherRegions_DBLink ＋ _DBLink 無しの _Jump）で 1 件 enrich する */
  async function enrichWith(dbLinkField, refs) {
    const proc = new globalThis.EnrichmentProcessor(new GlobalTypeDataFetcher(), testConfig);
    const rec = {
      Model: { ModelSeries: 'AttackerZeroid', Num: 61 },
      [dbLinkField]: refs,
      LogicspecStats: {
        LogicspecAbout_JP: { _Jump: { hashTag: 'NumerospecStats.NumerospecAbout' } }
      }
    };
    const out = await proc.enrichRecords([rec], '#Works_UnauthedLogica', 'Primary');
    return out[0]?.LogicspecStats?.LogicspecAbout_JP;
  }

  it('_Jump 側に _DBLink が無くても、AnotherRegions_DBLink の参照先から値を引く', async () => {
    const v = await enrichWith('AnotherRegions_DBLink', [{ _Work: 'NumberTales', _DB: 'Primary', Num: 61 }]);
    expect(v).toBe(ntAbout(61));
    expect(typeof v).toBe('string');
  });

  it('複数参照先がある場合は先頭の解決済みエントリに従う（既存の _DBLink 運用と同じ）', async () => {
    const v = await enrichWith('AnotherRegions_DBLink', [
      { _Work: 'NumberTales', _DB: 'Primary', Num: 62 },
      { _Work: 'NumberTales', _DB: 'Primary', Num: 61 }
    ]);
    expect(v).toBe(ntAbout(62));
  });

  it('$enrich: false の *_DBLink には連動しない（ラッパーを維持する）', async () => {
    // AnotherVersions_DBLink は $enrich: false
    const v = await enrichWith('AnotherVersions_DBLink', [{ _Work: 'NumberTales', _DB: 'Primary', Num: 61 }]);
    expect(v?._Jump).toBeTypeOf('object');
  });

  it('実データ: UnauthedLogica/Primary に未解決の _Jump が残らない', async () => {
    const proc = new globalThis.EnrichmentProcessor(new GlobalTypeDataFetcher(), testConfig);
    const records = loadJson('data/Works_UnauthedLogica/DataBases/db_Primary.json');
    const out = await proc.enrichRecords(records, '#Works_UnauthedLogica', 'Primary');

    const unresolved = [];
    const scan = (v, path) => {
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v)) { v.forEach((x, i) => scan(x, `${path}[${i}]`)); return; }
      if (v._Jump) { unresolved.push(path); return; }
      for (const [k, vv] of Object.entries(v)) scan(vv, path ? `${path}.${k}` : k);
    };
    out.forEach((rec, i) => scan(rec, `#${i}`));

    expect(unresolved).toEqual([]);
  });
});
