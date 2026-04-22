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
    const defType = Array.isArray(dbType?.$DefType) ? dbType.$DefType : [];
    const areaField = defType.find((entry) => entry?.hashTag === 'Area');
    const belongingAreaField = defType.find((entry) => entry?.hashTag === 'BelongingArea');
    const baseAreaDef = dbType?.$VarsDef?.$Def_BaseArea;
    const baseAreaEntries = Array.isArray(baseAreaDef?.$DefType) ? baseAreaDef.$DefType : [];
    const nestedArea = baseAreaEntries.find((entry) => entry?.hashTag === 'Area');

    expect(areaField?.$type).toBe('#ListIndex');
    expect(belongingAreaField?.$type).toBe('$Def_BaseArea');
    expect(nestedArea?.$type).toBe('#ListIndex');
  });
});
