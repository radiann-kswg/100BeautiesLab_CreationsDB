// NumberTales の実データに入っている AI 除外指定の回帰テスト。
// pkg/ai-image-policy.mjs の純粋関数テスト（tests/ai-image-policy.test.js）から分離してあるのは、
// Works_NumberTales を持たない下流リポジトリがこのファイルだけを同期対象から外せるようにするため。
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { filterCostumeOptouts } from '../pkg/ai-image-policy.mjs';

describe('NumberTales の AI 除外指定', () => {
  it('61のアイドル4項目と分数D-Vines4人の指定を維持する', () => {
    const primary = JSON.parse(fs.readFileSync('data/Works_NumberTales/DataBases/db_Primary.json', 'utf8'));
    const costumes = JSON.parse(fs.readFileSync('data/Works_NumberTales/Dictionaries/dict_Costume.json', 'utf8'));
    const source = primary.find(record => record.Num === 61);
    const filtered = filterCostumeOptouts(source, costumes);
    expect(source.AppearanceDetail.filter(entry => entry.Costume === 'idol')).toHaveLength(4);
    expect(filtered.AppearanceDetail.some(entry => entry.Costume === 'idol')).toBe(false);
    const semi = JSON.parse(fs.readFileSync('data/Works_NumberTales/DataBases/db_SemiPrimary.json', 'utf8'));
    for (const id of ['3/3', '7/7', '8/8', '22/22']) expect(semi.find(record => String(record.Num) === id).AI_Optout).toBe(true);
    for (const id of ['266', '314']) expect(semi.find(record => String(record.Num) === id).AI_Optout).not.toBe(true);
  });
});
