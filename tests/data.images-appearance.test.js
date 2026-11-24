/**
 * data.images-appearance.test.js - 画像別の形態・衣装・参考用区分（Images_Appearance）の検証
 *
 * @description 対応表の値の意味（Issue #63）:
 *   - 辞書コード … その形態・衣装に対応すると確認済み
 *   - null      … 作者が「共通」と明示（全形態・全衣装の代表に使える）
 *   - キー無し  … 未確認（推定しない）
 *   ReferenceOnly は「外見設定として収録せず画像参考だけにする」作者判断で、AI 利用の許諾とは独立。
 */
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const rowKeys = new Set(['value', 'Formation', 'Costume', 'ReferenceOnly']);

/**
 * 1 レコードの対応表を検証し、問題点を文字列配列で返す。
 *
 * @param {object} record - DB レコード
 * @param {{ Formation: Set<string>, Costume: Set<string> }} codes - 作品辞書のコード
 * @returns {string[]} 問題点（空なら妥当）
 */
function checkImagesAppearance(record, codes) {
  const table = record.Images_Appearance;
  if (table == null) return [];
  if (typeof table !== 'object' || Array.isArray(table)) return ['オブジェクトではありません'];
  const problems = [];
  for (const [field, rows] of Object.entries(table)) {
    if (!Object.hasOwn(record.Images ?? {}, field)) { problems.push(`${field}: Images に無いフィールド`); continue; }
    if (!Array.isArray(rows)) { problems.push(`${field}: 配列ではありません`); continue; }
    const originals = [record.Images[field]].flat();
    for (const row of rows) {
      const where = `${field}: ${JSON.stringify(row?.value)}`;
      if (!row || typeof row !== 'object') { problems.push(`${where}: 行がオブジェクトではありません`); continue; }
      for (const name of Object.keys(row)) if (!rowKeys.has(name)) problems.push(`${where}: 不明な項目 ${name}`);
      if (!originals.some(value => isDeepStrictEqual(value, row.value))) problems.push(`${where}: 元の画像にない value`);
      for (const dict of ['Formation', 'Costume']) {
        if (!Object.hasOwn(row, dict) || row[dict] === null) continue;
        if (!codes[dict].has(row[dict])) problems.push(`${where}: 未定義の ${dict} コード ${row[dict]}`);
      }
      if (Object.hasOwn(row, 'ReferenceOnly') && typeof row.ReferenceOnly !== 'boolean') problems.push(`${where}: ReferenceOnly が真偽値ではありません`);
    }
  }
  return problems;
}

/** 作品辞書（dictFile のサブフォルダ分けを含む）からコード集合を読む。 */
function loadCodes(workDir, field) {
  const dir = path.join(workDir, 'Dictionaries');
  const metaFile = path.join(dir, 'db_meta.json');
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
  const file = path.join(dir, meta.Dictionaries?.[`#Dict_${field}`]?.dictFile ?? `dict_${field}.json`);
  if (!fs.existsSync(file)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(file, 'utf8')).map(row => row[field]));
}

describe('Images_Appearance の検証', () => {
  const codes = { Formation: new Set(['humanoid']), Costume: new Set(['usual']) };
  const base = { Images: { arts_PNGPath: ['a'], designAlt_PNGPath: ['b'] } };

  it('確認済み・共通(null)・未確認(キー無し)と参考用区分を受け付ける', () => {
    expect(checkImagesAppearance({ ...base, Images_Appearance: {
      arts_PNGPath: [{ value: 'a', Formation: 'humanoid', Costume: null }],
      designAlt_PNGPath: [{ value: 'b', ReferenceOnly: true }],
    } }, codes)).toEqual([]);
  });

  it.each([
    ['不明なフィールド', { typo_PNGPath: [] }],
    ['元の画像にない value', { arts_PNGPath: [{ value: 'missing' }] }],
    ['未定義の Formation', { arts_PNGPath: [{ value: 'a', Formation: 'typo' }] }],
    ['未定義の Costume', { arts_PNGPath: [{ value: 'a', Costume: 'typo' }] }],
    ['不明な項目', { arts_PNGPath: [{ value: 'a', AI_Optout: true }] }],
    ['真偽値でない ReferenceOnly', { arts_PNGPath: [{ value: 'a', ReferenceOnly: 'true' }] }],
  ])('%s をエラーにする', (_, table) => {
    expect(checkImagesAppearance({ ...base, Images_Appearance: table }, codes)).not.toEqual([]);
  });

  it('全作品のデータが妥当である', () => {
    const problems = [];
    for (const work of fs.readdirSync(path.join(root, 'data')).filter(name => name.startsWith('Works_'))) {
      const workDir = path.join(root, 'data', work);
      const dbDir = path.join(workDir, 'DataBases');
      if (!fs.existsSync(dbDir)) continue;
      const workCodes = { Formation: loadCodes(workDir, 'Formation'), Costume: loadCodes(workDir, 'Costume') };
      for (const file of fs.readdirSync(dbDir).filter(name => /^db_(?!meta|type).+\.json$/.test(name))) {
        const records = JSON.parse(fs.readFileSync(path.join(dbDir, file), 'utf8'));
        if (!Array.isArray(records)) continue;
        for (const record of records) {
          for (const problem of checkImagesAppearance(record, workCodes)) problems.push(`${work}/${file}#${record.Num ?? '?'} ${problem}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
