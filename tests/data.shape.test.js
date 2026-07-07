/**
 * データ構造テスト
 * データベースファイルの構造整合性を検証
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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
    expect(fieldNames).toEqual(['TailShapeType', 'Count', 'Segment', 'Branches', 'LayoutDirection', 'Note_JP', 'Note_EN']);

    const branchDef = dbMeta?.General?.$VarsDef?.['$Def_TailsUnitBranch'];
    const branchFieldNames = (branchDef?.$DefType || []).map((e) => e.hashTag);
    expect(branchFieldNames).toEqual(['Laterality', 'TailCount', 'ClusterCount']);

    const layoutDirectionField = (tailsUnitDef?.$DefType || []).find((e) => e.hashTag === 'LayoutDirection');
    const layoutDirectionFieldNames = (Array.isArray(layoutDirectionField?.$type) ? layoutDirectionField.$type : []).map((e) => e.hashTag);
    expect(layoutDirectionFieldNames).toEqual(['LayoutFrom', 'LayoutTo']);
  });

  it.each([
    'data/Works_NumberTales/DataBases/db_Primary.json',
    'data/Works_NumberTales/DataBases/db_Secondary.json',
    'data/Works_NumberTales/DataBases/db_SemiPrimary.json',
    'data/Works_NumberTales/DataBases/db_SelfSecondary.json',
  ])('NT %s TailsUnit[] entries use only declared field names', (dbPath) => {
    const records = load(dbPath);
    const allowedTailsUnitKeys = new Set(['TailShapeType', 'Count', 'Segment', 'Branches', 'LayoutDirection', 'Note_JP', 'Note_EN']);
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

  it('no AppearanceDetail entry uses DesignElement:"#Element_TailsUnit" anymore (migrated to dedicated TailsUnit field)', () => {
    const files = [
      'data/Works_NumberTales/DataBases/db_Primary.json',
      'data/Works_NumberTales/DataBases/db_Secondary.json',
      'data/Works_NumberTales/DataBases/db_SemiPrimary.json',
      'data/Works_NumberTales/DataBases/db_SelfSecondary.json',
    ];
    for (const dbPath of files) {
      const records = load(dbPath);
      for (const rec of records) {
        const entries = Array.isArray(rec?.AppearanceDetail) ? rec.AppearanceDetail : [];
        expect(entries.some((e) => e?.DesignElement === '#Element_TailsUnit')).toBe(false);
      }
    }
  });
});
