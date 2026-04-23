/**
 * 作品/DB カタログ向けメタ schema 宣言の存在確認。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = dirname(__dirname);

function load(file) {
  return JSON.parse(readFileSync(join(repoRoot, file), 'utf-8'));
}

describe('catalog meta schema declarations', () => {
  it('global db_type declares work and database catalog meta definitions', () => {
    const dbType = load('data/db_type.json');

    expect(dbType?.$MetaType?.$Def_CreationWorkCatalog?.$DefType).toBeInstanceOf(Array);
    expect(dbType?.$MetaType?.$Def_DatabaseCatalog?.$DefType).toBeInstanceOf(Array);
    expect(dbType?.$MetaType?.$Def_OldTitleCatalog?.$DefType).toBeInstanceOf(Array);
    expect(dbType?.$MetaType?.$Def_StoryEraCatalog?.$DefType).toBeInstanceOf(Array);
    expect(dbType?.$MetaType?.$Def_SecondaryMeta?.$DefType).toBeInstanceOf(Array);
  });

  it('work-local db_meta databases can expose DB labels', () => {
    const workMeta = load('data/Works_NumberTales/DataBases/db_meta.json');
    const primary = workMeta?.Databases?.['#DB_Primary'];
    const glossary = workMeta?.Databases?.['#Ref_Glossary'];

    expect(primary?.DB_Label).toBe('一次創作');
    expect(primary?.DB_Label_EN).toBe('Primary');
    expect(glossary?.DB_Label).toBe('創作用語');
    expect(glossary?.DB_Label_EN).toBe('Glossary');
  });
});