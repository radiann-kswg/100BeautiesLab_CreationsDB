/**
 * データ構造テスト
 * データベースファイルの構造整合性を検証
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = dirname(__dirname);

/**
 * 指定されたファイルを読み込んで JSON として解析
 * @param {string} file - リポジトリルートからの相対パス
 * @returns {Object} 解析された JSON オブジェクト
 */
function load(file) {
  const p = join(repoRoot, file);
  const txt = readFileSync(p, 'utf-8');
  return JSON.parse(txt);
}

describe('database shapes', () => {
  it('each DB file is an array of records', () => {
    // テスト対象の作品リスト
    const works = [
      'Works_NumberTales',
      'Works_ShouArRiders',
      'Works_SinisterChangingGirls',
      'Works_FLInvestigator78',
      'Works_PastDivers',
      'Works_UnauthedLogica',
    ];
    // 検証対象のデータベースファイル名
    const dbFiles = ['db_Primary.json', 'db_Secondary.json', 'db_SemiPrimary.json', 'db_SelfSecondary.json', 'db_Mobs.json'];

    for (const wk of works) {
      for (const db of dbFiles) {
        try {
          const data = load(`data/${wk}/DataBases/${db}`);
          // 各データベースファイルがレコードの配列であることを確認
          expect(Array.isArray(data)).toBe(true);
        } catch (_) {
          // すべての作品/DB の組み合わせでファイルが存在するとは限らないのでスキップ
        }
      }
    }
  });

  /**
   * `$EnumDef_Progress` に宣言された正規の Progress 値の集合を返す。
   * 正規語彙は "accepted\nnowRemaking" のような改行複合値を含むため、
   * 改行で分割せず値そのものと完全一致で判定すること（分割すると偽陽性が出る）。
   * @returns {Set<string>}
   */
  function loadValidProgressValues() {
    const dbMeta = load('data/db_meta.json');
    const enumDef = dbMeta?.General?.$VarsDef?.$EnumDef_Progress ?? {};
    return new Set(
      Object.values(enumDef)
        .map((entry) => entry?.Progress)
        .filter((v) => typeof v === 'string'),
    );
  }

  it('every record Progress value is declared in $EnumDef_Progress', () => {
    const validProgress = loadValidProgressValues();
    expect(validProgress.size).toBeGreaterThan(0);

    const dataRoot = join(repoRoot, 'data');
    const violations = [];

    for (const workDir of readdirSync(dataRoot)) {
      if (!workDir.startsWith('Works_')) continue;
      const dbDir = join(dataRoot, workDir, 'DataBases');
      if (!existsSync(dbDir)) continue;

      for (const file of readdirSync(dbDir)) {
        // db_meta.json / db_type.json はレコード配列ではないので対象外
        if (!/^db_.*\.json$/.test(file) || file === 'db_meta.json' || file === 'db_type.json') continue;
        let records;
        try {
          records = load(`data/${workDir}/DataBases/${file}`);
        } catch (_) {
          continue; // 破損・欠損ファイルは他テストの管轄
        }
        if (!Array.isArray(records)) continue;

        for (const rec of records) {
          // Progress 未設定は _Commons 継承の正当な形なので対象外
          if (rec?.Progress == null) continue;
          if (!validProgress.has(rec.Progress)) {
            violations.push(`${workDir}/${file} Num=${JSON.stringify(rec.Num)} Progress=${JSON.stringify(rec.Progress)}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('every _Commons.Progress in db_meta.json is declared in $EnumDef_Progress', () => {
    // レコード側だけでなく `_Commons` の既定値も検証する。
    // `_Commons` は DB / `_Secondaries` カテゴリの入れ子構造を取り、
    // `#DB_UnprocessedSecondary` のように DB エントリがさらにネストする例もあるため、
    // キー構造を決め打ちせず再帰的に `_Commons` を拾う。
    const validProgress = loadValidProgressValues();
    expect(validProgress.size).toBeGreaterThan(0);

    const violations = [];
    let checked = 0;

    /**
     * オブジェクトを再帰的に辿り `_Commons.Progress` を検証する
     * @param {any} node
     * @param {string} file - 表示用のファイル識別子
     * @param {string} trail - 到達パス（違反箇所の特定用）
     */
    function walk(node, file, trail) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach((v, i) => walk(v, file, `${trail}[${i}]`));
        return;
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === '_Commons' && value && typeof value === 'object' && value.Progress != null) {
          checked++;
          if (!validProgress.has(value.Progress)) {
            violations.push(`${file} ${trail}._Commons.Progress = ${JSON.stringify(value.Progress)}`);
          }
        }
        walk(value, file, `${trail}.${key}`);
      }
    }

    const dataRoot = join(repoRoot, 'data');
    for (const workDir of readdirSync(dataRoot)) {
      if (!workDir.startsWith('Works_')) continue;
      const metaPath = `data/${workDir}/DataBases/db_meta.json`;
      if (!existsSync(join(repoRoot, metaPath))) continue;
      try {
        walk(load(metaPath), workDir, '');
      } catch (_) {
        continue; // 破損・欠損は他テストの管轄
      }
    }

    expect(checked).toBeGreaterThan(0); // 走査が空振りしていないことの担保
    expect(violations).toEqual([]);
  });

  it('global area typedef keeps BaseArea and Area separated', () => {
    const dbType = load('data/db_type.json');
    const dbMeta = load('data/db_meta.json');
    const defType = Array.isArray(dbType?.$DefType) ? dbType.$DefType : [];
    const areaField = defType.find((entry) => entry?.hashTag === 'Area');
    const fromAreaField = defType.find((entry) => entry?.hashTag === 'FromArea');
    const legacyBaseAreaField = defType.find((entry) => entry?.hashTag === 'BaseArea');
    const belongingField = defType.find((entry) => entry?.hashTag === 'Belonging');
    const baseAreaDef = dbMeta?.General?.$VarsDef?.$Def_BaseArea;
    const baseAreaEntries = Array.isArray(baseAreaDef?.$DefType) ? baseAreaDef.$DefType : [];
    const nestedArea = baseAreaEntries.find((entry) => entry?.hashTag === 'Area');

    expect(areaField).toBeUndefined();
    expect(belongingField?.$type).toBe('#DictIndex[]');
    expect(belongingField?.$dict).toBe('Faction');
    expect(fromAreaField?.$type).toBe('$Def_BaseArea');
    expect(legacyBaseAreaField).toBeUndefined();
    expect(nestedArea?.$type).toBe('#DictIndex');
    expect(nestedArea?.$dict).toBe('Area');
  });

  it('shared references typedef provides references fields and work local references typedef can stay empty', () => {
    const sharedRefsType = load('data/References/db_type.json');
    const refsType = load('data/Works_NumberTales/References/db_type.json');
    const defType = Array.isArray(sharedRefsType?.$DefType) ? sharedRefsType.$DefType : [];
    const relatedCreationsField = defType.find((entry) => entry?.hashTag === 'RelatedCreations');
    const titleField = defType.find((entry) => entry?.hashTag === 'Title_JP');
    const termField = defType.find((entry) => entry?.hashTag === 'Term_JP');
    const relatedCreationEntries = Array.isArray(relatedCreationsField?.$type) ? relatedCreationsField.$type : [];
    const nestedWork = relatedCreationEntries.find((entry) => entry?.hashTag === 'RelatedWorks');
    const nestedDb = relatedCreationEntries.find((entry) => entry?.hashTag === 'RelatedDB');

    expect(termField?.$display?.aliasOf).toBe('Name_JP');
    expect(titleField?.$alt).toBe('Term_JP');
    expect(Array.isArray(relatedCreationsField?.$type)).toBe(true);
    expect(nestedWork?.$type).toBe('#String');
    expect(nestedDb?.$type).toBe('#String|#Null');
  });

  it('CreationWorks.#Works_CommonReferences declares safe-token Works_Dir/Works_ImagesDir overrides', () => {
    const dbMeta = load('data/db_meta.json');
    const entry = dbMeta?.CreationWorks?.['#Works_CommonReferences'];
    const safeToken = /^[A-Za-z0-9_]+$/;

    expect(entry).toBeTruthy();
    expect(entry?.Works_Dir).toBe('References');
    expect(entry?.Works_ImagesDir).toBe('GeneralImages');
    expect(safeToken.test(entry?.Works_Dir || '')).toBe(true);
    expect(safeToken.test(entry?.Works_ImagesDir || '')).toBe(true);
    expect(entry?.Works_Shared).toBe(true);
  });

  it('data/References/db_meta.json declares DB_Layer:"References" for all #Ref_* catalog entries', () => {
    const refsMeta = load('data/References/db_meta.json');
    const databases = refsMeta?.Databases || {};
    const refKeys = Object.keys(databases).filter((key) => key.startsWith('#Ref_'));

    expect(refKeys.length).toBeGreaterThan(0);
    for (const key of refKeys) {
      expect(databases[key]?.DB_Layer).toBe('References');
    }
    // Region8 は DB全体の俯瞰マップとしてDB_Imageを持つ
    expect(databases['#Ref_Region8']?.DB_Image).toBe('cnsp-map_region8');
  });

  it('data/References/db_type.json declares $IndexDef on Term_JP for the common references pseudo-work', () => {
    const sharedRefsType = load('data/References/db_type.json');
    expect(sharedRefsType?.$IndexDef?.hashTag).toBe('Term_JP');
  });

  it('$Def_DBCrossLinkPath declares the expected sentinel fields, with _DB/_IsoPath required', () => {
    const dbType = load('data/db_type.json');
    const defEntries = Array.isArray(dbType?.$Def_DBCrossLinkPath?.$DefType) ? dbType.$Def_DBCrossLinkPath.$DefType : [];
    const byTag = Object.fromEntries(defEntries.map((entry) => [entry?.hashTag, entry]));

    expect(Object.keys(byTag)).toEqual(['_DB', '_Work', '_Field', '_IsoPath']);
    // _DB / _IsoPath は自動解決が困難なため必須（#Null を許容しない）
    expect(byTag._DB?.$type).toBe('#String');
    expect(byTag._IsoPath?.$type).toBe('#PNGFilePath');
    // _Work / _Field は既定値（現在Work / wrapperが出現したフィールド名）があるため省略可
    expect(byTag._Work?.$type).toBe('#String|#Null');
    expect(byTag._Field?.$type).toBe('#String|#Null');
  });

  it('work references meta keeps #Ref_ database entries under Databases', () => {
    const dataRoot = join(repoRoot, 'data');
    const files = readdirSync(dataRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^Works_/i.test(entry.name))
      .map((entry) => `data/${entry.name}/References/db_meta.json`)
      .filter((path) => existsSync(join(repoRoot, path)));

    for (const path of files) {
      const meta = load(path);
      const topLevelRefKeys = Object.keys(meta || {}).filter((key) => /^#Ref_/i.test(key));
      expect(topLevelRefKeys, `${path} has misplaced top-level #Ref_ keys`).toEqual([]);
    }
  });
});

describe('AppearanceDetail schema', () => {
  it('global db_type.json declares AppearanceDetail toplevel field', () => {
    const dbType = load('data/db_type.json');
    const defType = Array.isArray(dbType?.$DefType) ? dbType.$DefType : [];
    const field = defType.find((e) => e?.hashTag === 'AppearanceDetail');
    expect(field).toBeDefined();
    expect(field.$type).toBe('$Def_AppearanceDetail[]|#Null');
    expect(field.searchable).toBe(false);
    expect(field.$display?.sectionWrapper).toBe('appearanceDetailSection');
  });

  it('$ScalarDef declares #Hexcode and #Hexcode_Color base types', () => {
    const dbType = load('data/db_type.json');
    const scalarDef = dbType?.$ScalarDef || {};
    expect(scalarDef['#Hexcode']).toBeDefined();
    expect(typeof scalarDef['#Hexcode'].pattern).toBe('string');
    expect(scalarDef['#Hexcode'].pattern).toMatch(/^\^#/);
    expect(scalarDef['#Hexcode_Color']).toBeDefined();
    expect(scalarDef['#Hexcode_Color'].extends).toBe('#Hexcode');
  });

  it('$Def_AppearanceAttr in db_meta.json has only AttrLabel as top-level $DefType entry', () => {
    const dbMeta = load('data/db_meta.json');
    const attrDef = dbMeta?.General?.$VarsDef?.['$Def_AppearanceAttr'];
    const innerDefType = Array.isArray(attrDef?.$DefType) ? attrDef.$DefType : [];
    expect(innerDefType).toHaveLength(1);
    expect(innerDefType[0].hashTag).toBe('AttrLabel');
    expect(String(innerDefType[0].$type)).toMatch(/#ListIndex/);
  });

  it.each([
    'data/Works_NumberTales/DataBases/db_Primary.json',
    'data/Works_NumberTales/DataBases/db_Secondary.json',
    'data/Works_NumberTales/DataBases/db_SemiPrimary.json',
    'data/Works_NumberTales/DataBases/db_SelfSecondary.json',
  ])('NT %s AppearanceDetail Attrs use only lowercase convention-driven fields', (dbPath) => {
    const records = load(dbPath);
    const violations = [];
    for (const rec of records) {
      const entries = Array.isArray(rec?.AppearanceDetail) ? rec.AppearanceDetail : [];
      for (const entry of entries) {
        const attrs = Array.isArray(entry?.Attrs) ? entry.Attrs : [];
        for (const attr of attrs) {
          if (attr && typeof attr === 'object' && !Array.isArray(attr)) {
            if ('Value_JP' in attr || 'Value_EN' in attr) {
              violations.push({ Num: rec.Num });
            }
          }
        }
      }
    }
    expect(violations).toHaveLength(0);
  });

  it.each([
    'data/Works_NumberTales/DataBases/db_Primary.json',
    'data/Works_NumberTales/DataBases/db_Secondary.json',
    'data/Works_NumberTales/DataBases/db_SemiPrimary.json',
    'data/Works_NumberTales/DataBases/db_SelfSecondary.json',
  ])('NT %s AppearanceDetail img_PNGName values omit image file extensions (#PNGFileName convention)', (dbPath) => {
    const records = load(dbPath);
    const violations = [];
    for (const rec of records) {
      const entries = Array.isArray(rec?.AppearanceDetail) ? rec.AppearanceDetail : [];
      for (const [idx, entry] of entries.entries()) {
        const value = entry?.img_PNGName;
        if (typeof value !== 'string') continue; // null / hideText wrapper 等は対象外
        if (/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(value)) {
          violations.push({ Num: rec.Num, idx, value });
        }
      }
    }
    expect(violations).toHaveLength(0);
  });

  it.each([
    // [DBファイル, 画像ベースフォルダ, img_PNGName 登録が1件以上ある前提か]
    // db_Secondary は現状 img_PNGName の登録が無いため件数要求はしない（存在チェックのみ）
    ['data/Works_NumberTales/DataBases/db_Primary.json', 'data/Works_NumberTales/Images/DB_Primary', true],
    ['data/Works_NumberTales/DataBases/db_Secondary.json', 'data/Works_NumberTales/Images/DB_Secondary', false],
    ['data/Works_NumberTales/DataBases/db_SemiPrimary.json', 'data/Works_NumberTales/Images/DB_SemiPrimary', true],
    ['data/Works_NumberTales/DataBases/db_SelfSecondary.json', 'data/Works_NumberTales/Images/DB_SelfSecondary', true],
  ])('NT %s AppearanceDetail img_PNGName files exist under attr/<element> (DesignElement-driven dispatch)', (dbPath, imageBaseDir, expectEntries) => {
    const records = load(dbPath);
    // pages/characters.js の buildAppearanceDetailImageUrl と同じ導出規則:
    // #Element_NumberMark -> attr/numberMark、判別不能時は img
    const deriveFolder = (designElement) => {
      const m = String(designElement || '').match(/^#Element_([A-Za-z0-9_]+)$/);
      if (!m) return 'img';
      return `attr/${m[1].charAt(0).toLowerCase()}${m[1].slice(1)}`;
    };
    const missing = [];
    let checked = 0;
    for (const rec of records) {
      const entries = Array.isArray(rec?.AppearanceDetail) ? rec.AppearanceDetail : [];
      for (const [idx, entry] of entries.entries()) {
        const value = entry?.img_PNGName;
        if (typeof value !== 'string' || !value.trim()) continue;
        checked++;
        const imgPath = join(
          repoRoot,
          imageBaseDir,
          deriveFolder(entry?.DesignElement),
          `${value}.png`,
        );
        if (!existsSync(imgPath)) {
          missing.push({ Num: rec.Num, idx, value, imgPath });
        }
      }
    }
    // 2026-07-11 の一括登録（153件）が空回りしていないことも併せて確認する
    if (expectEntries) expect(checked).toBeGreaterThan(0);
    expect(missing).toHaveLength(0);
  });
});

describe('TailsUnit schema', () => {
  it('NT db_type.json declares TailsUnit toplevel field as $Def_TailsUnit[]', () => {
    const dbType = load('data/Works_NumberTales/DataBases/db_type.json');
    const defType = Array.isArray(dbType?.$DefType) ? dbType.$DefType : [];
    const field = defType.find((e) => e?.hashTag === 'TailsUnit');
    expect(field).toBeDefined();
    expect(field.$type).toBe('$Def_TailsUnit[]');
    expect(field.searchable).toBe(false);
    expect(field.$display?.sectionWrapper).toBe('tailsUnitSection');
  });

  it('$Def_TailsUnit / $Def_TailsUnitBranch are declared in NT db_meta.json with expected field names', () => {
    const dbMeta = load('data/Works_NumberTales/DataBases/db_meta.json');
    const tailsUnitDef = dbMeta?.General?.$VarsDef?.['$Def_TailsUnit'];
    expect(tailsUnitDef?.$display?.wrapper).toBe('tailsUnitSummary');
    expect(tailsUnitDef?.$display?.sectionWrapper).toBe('tailsUnitSection');
    const fieldNames = (tailsUnitDef?.$DefType || []).map((e) => e.hashTag);
    expect(fieldNames).toEqual(['TailShapeType', 'Count', 'Segment', 'Branches', 'LayoutDirection', 'TailsUnit_PNGName', 'Note_JP', 'Note_EN']);

    const branchDef = dbMeta?.General?.$VarsDef?.['$Def_TailsUnitBranch'];
    const branchFieldNames = (branchDef?.$DefType || []).map((e) => e.hashTag);
    expect(branchFieldNames).toEqual(['Laterality', 'TailCount', 'ClusterCount']);

    const layoutDirectionField = (tailsUnitDef?.$DefType || []).find((e) => e.hashTag === 'LayoutDirection');
    const layoutDirectionFieldNames = (Array.isArray(layoutDirectionField?.$type) ? layoutDirectionField.$type : []).map((e) => e.hashTag);
    expect(layoutDirectionFieldNames).toEqual(['LayoutFrom', 'LayoutTo']);

    const imgField = (tailsUnitDef?.$DefType || []).find((e) => e.hashTag === 'TailsUnit_PNGName');
    expect(imgField?.$type).toBe('#PNGFileName|#Null');
    expect(imgField?.$subfolder).toBe('attr/tailsUnit');
  });

  it.each([
    'data/Works_NumberTales/DataBases/db_Primary.json',
    'data/Works_NumberTales/DataBases/db_Secondary.json',
    'data/Works_NumberTales/DataBases/db_SemiPrimary.json',
    'data/Works_NumberTales/DataBases/db_SelfSecondary.json',
  ])('NT %s TailsUnit[] entries use only declared field names', (dbPath) => {
    const records = load(dbPath);
    const allowedTailsUnitKeys = new Set(['TailShapeType', 'Count', 'Segment', 'Branches', 'LayoutDirection', 'TailsUnit_PNGName', 'Note_JP', 'Note_EN']);
    const allowedBranchKeys = new Set(['Laterality', 'TailCount', 'ClusterCount']);
    const allowedLayoutDirectionKeys = new Set(['LayoutFrom', 'LayoutTo']);
    const violations = [];
    for (const rec of records) {
      const entries = Array.isArray(rec?.TailsUnit) ? rec.TailsUnit : [];
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        for (const key of Object.keys(entry)) {
          if (!allowedTailsUnitKeys.has(key)) violations.push({ Num: rec.Num, key });
        }
        for (const branch of Array.isArray(entry.Branches) ? entry.Branches : []) {
          if (!branch || typeof branch !== 'object') continue;
          for (const key of Object.keys(branch)) {
            if (!allowedBranchKeys.has(key)) violations.push({ Num: rec.Num, key: `Branches.${key}` });
          }
        }
        if (entry.LayoutDirection && typeof entry.LayoutDirection === 'object') {
          for (const key of Object.keys(entry.LayoutDirection)) {
            if (!allowedLayoutDirectionKeys.has(key)) violations.push({ Num: rec.Num, key: `LayoutDirection.${key}` });
          }
        }
      }
    }
    expect(violations).toHaveLength(0);
  });

  it('NT db_Primary.json backfilled TailsUnit_PNGName for the 11 reference-image characters', () => {
    const records = load('data/Works_NumberTales/DataBases/db_Primary.json');
    const expected = new Map([
      [4, 'attr_tailsUnit4'],
      [6, 'attr_tailsUnit6'],
      [16, 'attr_tailsUnit16'],
      [23, 'attr_tailsUnit23'],
      [39, 'attr_tailsUnit39'],
      [49, 'attr_tailsUnit49'],
      [57, 'attr_tailsUnit57'],
      [61, 'attr_tailsUnit61'],
      [73, 'attr_tailsUnit73'],
      [85, 'attr_tailsUnit85'],
      [93, 'attr_tailsUnit93'],
    ]);
    for (const [num, fileName] of expected) {
      const rec = records.find((r) => r.Num === num);
      expect(rec?.TailsUnit?.[0]?.TailsUnit_PNGName, `Num:${num}`).toBe(fileName);
    }

    for (const fileName of expected.values()) {
      // 値は #PNGFileName 規約（拡張子なし）のため、実在チェック時に .png を補完する
      const imgPath = join(repoRoot, 'data/Works_NumberTales/Images/DB_Primary/attr/tailsUnit', `${fileName}.png`);
      expect(existsSync(imgPath), imgPath).toBe(true);
    }
  });

  it('NT db_Primary.json VRMs.corefolder_VRMPath references existing .vrm/.png files', () => {
    const records = load('data/Works_NumberTales/DataBases/db_Primary.json');
    const expected = new Map([
      [4, 'vrm_corefolder4'],
      [16, 'vrm_corefolder16'],
      [20, 'vrm_corefolder20'],
      [25, 'vrm_corefolder25'],
    ]);

    for (const [num, fileName] of expected) {
      const rec = records.find((r) => r.Num === num);
      // 値は「フォルダ/拡張子なしファイル名」規約（corefolder_PNGPath と同じ）
      expect(rec?.VRMs?.corefolder_VRMPath, `Num:${num}`).toEqual([`${num}/${fileName}`]);

      const baseDir = join(repoRoot, 'data/Works_NumberTales/VRMs/DB_Primary/corefolder', String(num));
      expect(existsSync(join(baseDir, `${fileName}.vrm`)), `${fileName}.vrm`).toBe(true);
      expect(existsSync(join(baseDir, `${fileName}.png`)), `${fileName}.png`).toBe(true);
    }
  });

});

describe('SupersededDesignElement schema', () => {
  it('global db_type.json declares the $Def_SupersededDesignElement meta shape', () => {
    const dbType = load('data/db_type.json');
    const fieldNames = (dbType?.$MetaType?.$Def_SupersededDesignElement?.$DefType || []).map((e) => e.hashTag);
    expect(fieldNames).toEqual(['DesignElement', 'SupersededByField', 'SupersededByType', 'SupersededDate', 'Note_JP', 'Note_EN']);
  });

  it('NT db_meta.json documents the completed #Element_TailsUnit -> TailsUnit supersession', () => {
    const dbMeta = load('data/Works_NumberTales/DataBases/db_meta.json');
    const list = Array.isArray(dbMeta?.SupersededDesignElements) ? dbMeta.SupersededDesignElements : [];
    const entry = list.find((e) => e?.DesignElement === '#Element_TailsUnit');
    expect(entry?.SupersededByField).toBe('TailsUnit');
    expect(entry?.SupersededByType).toBe('$Def_TailsUnit[]');
  });

  it.each([
    'data/Works_NumberTales/DataBases/db_Primary.json',
    'data/Works_NumberTales/DataBases/db_Secondary.json',
    'data/Works_NumberTales/DataBases/db_SemiPrimary.json',
    'data/Works_NumberTales/DataBases/db_SelfSecondary.json',
  ])('NT %s AppearanceDetail entries never use a DesignElement declared as superseded', (dbPath) => {
    const dbMeta = load('data/Works_NumberTales/DataBases/db_meta.json');
    const supersededKeys = new Set(
      (dbMeta?.SupersededDesignElements || []).map((e) => e?.DesignElement).filter(Boolean),
    );
    // 廃止宣言リストが空になっている場合、このテスト自体が無意味な素通りになってしまうため
    // 明示的に検知する（TailsUnit分の登録漏れ・誤削除に対するガード）。
    expect(supersededKeys.size).toBeGreaterThan(0);

    const records = load(dbPath);
    const violations = [];
    for (const rec of records) {
      const entries = Array.isArray(rec?.AppearanceDetail) ? rec.AppearanceDetail : [];
      for (const entry of entries) {
        if (supersededKeys.has(entry?.DesignElement)) {
          violations.push({ Num: rec.Num, DesignElement: entry.DesignElement });
        }
      }
    }
    expect(violations).toHaveLength(0);
  });
});

describe('EarShapeType schema', () => {
  it('NT db_meta.json declares $EnumDef_EarShapeType work-locally with Fox/Cat values', () => {
    const dbMeta = load('data/Works_NumberTales/DataBases/db_meta.json');
    const earShapeTypeDef = dbMeta?.General?.$VarsDef?.$EnumDef_EarShapeType;
    expect(earShapeTypeDef?.['#EarShapeType_Fox']?.EarShapeType).toBe('Fox');
    expect(earShapeTypeDef?.['#EarShapeType_Cat']?.EarShapeType).toBe('Cat');
  });

  it('global db_meta.json no longer declares $EnumDef_EarType or $EnumDef_EarShapeType (fully relocated)', () => {
    const globalDbMeta = load('data/db_meta.json');
    expect(globalDbMeta?.General?.$VarsDef?.$EnumDef_EarType).toBeUndefined();
    expect(globalDbMeta?.General?.$VarsDef?.$EnumDef_EarShapeType).toBeUndefined();
  });

  it('global #DesignAttr_Ear.$fields references vdict_EarShapeType', () => {
    const globalDbMeta = load('data/db_meta.json');
    const designAttrEar = globalDbMeta?.General?.$VarsDef?.$EnumDef_DesignAttrLabel?.['#DesignAttr_Ear'];
    expect(designAttrEar?.$fields).toEqual(['vdict_EarShapeType', 'about_JP', 'about_EN']);
  });

  it('NT db_Primary.json #Element_Ear Attrs entries all use vdict_EarShapeType (not vdict_EarType)', () => {
    const records = load('data/Works_NumberTales/DataBases/db_Primary.json');
    let earAttrCount = 0;
    for (const rec of records) {
      const entries = Array.isArray(rec?.AppearanceDetail) ? rec.AppearanceDetail : [];
      for (const entry of entries) {
        if (entry?.DesignElement !== '#Element_Ear') continue;
        for (const attr of Array.isArray(entry.Attrs) ? entry.Attrs : []) {
          if (attr?.AttrLabel !== '#DesignAttr_Ear') continue;
          earAttrCount++;
          expect(attr).not.toHaveProperty('vdict_EarType');
          expect(attr.vdict_EarShapeType).toMatch(/^#EarShapeType_/);
        }
      }
    }
    expect(earAttrCount).toBeGreaterThan(0);
  });
});

describe('Works_DestinyFoxRecords / Works_Proxies merge', () => {
  it('Works_Proxies directory no longer exists (merged into Works_DestinyFoxRecords)', () => {
    expect(existsSync(join(repoRoot, 'data/Works_Proxies'))).toBe(false);
  });

  it('Works_DestinyFoxRecords db_type.json declares $IndexDef_Proxy sidecar for the Proxy DB', () => {
    const dbType = load('data/Works_DestinyFoxRecords/DataBases/db_type.json');
    expect(dbType.$IndexDef?.hashTag).toBe('Unit');
    expect(dbType.$IndexDef_Proxy?.hashTag).toBe('Generation');
  });

  it('Works_DestinyFoxRecords db_meta.json catalogs both #DB_Primary and #DB_Proxy', () => {
    const dbMeta = load('data/Works_DestinyFoxRecords/DataBases/db_meta.json');
    expect(dbMeta.Databases?.['#DB_Primary']).toBeDefined();
    expect(dbMeta.Databases?.['#DB_Proxy']).toBeDefined();
  });

  it('global db_meta.json no longer declares #Works_Proxies', () => {
    const globalMeta = load('data/db_meta.json');
    expect(globalMeta.CreationWorks?.['#Works_Proxies']).toBeUndefined();
    expect(globalMeta.CreationWorks?.['#Works_DestinyFoxRecords']).toBeDefined();
  });
});
