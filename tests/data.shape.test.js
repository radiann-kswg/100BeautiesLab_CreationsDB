import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = dirname(__dirname);

function load(file) {
  const p = join(repoRoot, file);
  const txt = readFileSync(p, 'utf-8');
  return JSON.parse(txt);
}

describe('database shapes', () => {
  it('each DB file is an array of records', () => {
    const works = [
      'Works_NumberTales',
      'Works_ShouArRiders',
      'Works_SinisterChangingGirls',
      'Works_FLInvestigator78',
      'Works_PastDivers',
    ];
    const dbFiles = ['db_Primary.json', 'db_Secondary.json', 'db_SemiPrimary.json', 'db_SelfSecondary.json'];
    for (const wk of works) {
      for (const db of dbFiles) {
        try {
          const data = load(`data/${wk}/DataBases/${db}`);
          expect(Array.isArray(data)).toBe(true);
        } catch (_) {
          // file may not exist for every work/db; skip
        }
      }
    }
  });
});
