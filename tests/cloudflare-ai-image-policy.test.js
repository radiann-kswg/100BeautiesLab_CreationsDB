/** AI API の画像許諾境界と、同期途中の fail-closed をR2/D1モックで検証する。 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../pkg/cloudflare/worker.js';
import { filterAIResponse, AI_IMAGE_POLICY_KEY } from '../pkg/cloudflare/ai-image-policy.js';
import { buildAIImagePolicy, aiPolicySourceHash, markAIImagePolicySync, finalizeAIImagePolicy } from '../pkg/cloudflare/scripts/build-ai-image-policy.mjs';

const cache = fileURLToPath(new URL('../.cache/', import.meta.url));
mkdirSync(cache, { recursive: true });
const root = mkdtempSync(join(cache, 'ai-policy-test-'));
const json = (file, value) => {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
};
const image = (work, folder, value) => {
  const path = `data/Works_${work}/Images/DB_Primary/${folder}/${value}.png`;
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), 'fixture');
  return path;
};
const ok = image('Alpha', 'concept', 'ok');
const shared = image('Alpha', 'arts', 'shared');
const blockedFile = image('Alpha', 'arts', 'blocked-file');
const blockedField = image('Alpha', 'cardDesign', 'card');
image('Alpha', 'unknown', 'mystery');
const hintOnly = image('Alpha', 'arts', 'hint-only');
const globalMeta = { CreationWorks: { '#Works_Alpha': {}, '#Works_Beta': {} } };
const meta = { Databases: { '#DB_Primary': { AI_Optout: false } } };
const definition = { $IndexDef: { hashTag: 'Num' }, $DefType: [{ hashTag: 'Images', $type: [
  { hashTag: 'concept_PNGName', $type: '#PNGFileName' },
  { hashTag: 'arts_PNGPath', $type: '#PNGFilePath[]' },
  { hashTag: 'cardDesign_PNGName', $type: '#PNGFileName', AI_Optout: false },
] }] };
const hints = {
  common: { tags: ['keep'], identity_tags: ['ordinary clothing', 'red uniform (idol outfit)'], reference_images: { main: ok, extra: [shared, blockedFile, blockedField, hintOnly] } },
  forms: { normal: { prompt_export: 'ordinary traits, red uniform (idol outfit)' } },
};
const record = { Num: 1, Images: { concept_PNGName: 'ok', arts_PNGPath: ['shared', 'blocked-file', 'hint-only'], cardDesign_PNGName: 'card', unknown_PNGName: 'mystery' }, Images_AIOptout: { arts_PNGPath: ['blocked-file'] }, AIHints: hints,
  AppearanceDetail: [{ Costume: 'usual', Attrs: [{ value_JP: '通常服' }] }, { Costume: 'idol', Attrs: [{ value_EN: 'red uniform (idol outfit)' }] }],
};
json('data/db_meta.json', globalMeta);
json('data/db_type.json', { $DefType: [{ hashTag: 'Images', $type: [{ hashTag: 'cardDesign_PNGName', AI_Optout: true }] }] });
json('data/Works_Alpha/DataBases/db_meta.json', meta);
json('data/Works_Alpha/DataBases/db_type.json', definition);
json('data/Works_Alpha/Dictionaries/dict_Costume.json', [{ Costume: 'usual' }, { Costume: 'idol', Costume_JP: 'アイドル衣装', Costume_EN: 'Idol Costume', AI_Optout: true }]);
json('data/Works_Alpha/DataBases/db_Primary.json', [record, { Num: 2, isPrivate: true, AIHints: { reference_images: { main: hintOnly } } }]);
json('data/Works_Beta/DataBases/db_meta.json', { Databases: { '#DB_Primary': { AI_Optout: true } } });
json('data/Works_Beta/DataBases/db_type.json', definition);
json('data/Works_Beta/DataBases/db_Primary.json', [{ Num: 3, AI_Optout: false, Images: { arts_PNGPath: [{ _DBCrossLinkPath: { _Work: 'Alpha', _DB: 'Primary', _Field: 'arts_PNGPath', _IsoPath: 'shared' } }] } }]);
const policy = buildAIImagePolicy(root);
afterAll(() => rmSync(root, { recursive: true, force: true }));

function env(currentPolicy = policy, row = record) {
  return {
    DB: { prepare: (sql) => ({ bind: () => ({
      first: async () => sql.includes('FROM records') ? { data_json: JSON.stringify(row) }
        : sql.includes('FROM aihints') ? { idx_value: '1', forms: '', data_json: JSON.stringify(hints) } : { is_hidden: 0 },
      all: async () => ({ results: sql.includes('FROM aihints') ? [{ idx_value: '1', forms: '', data_json: JSON.stringify(hints) }]
        : [{ db_name: 'Primary', data_json: JSON.stringify(row) }] }),
    }) }) },
    BUCKET: { get: vi.fn(async (key) => {
      const value = key === AI_IMAGE_POLICY_KEY ? currentPolicy : key === 'data/db_meta.json' ? globalMeta : meta;
      return value ? { json: async () => value } : null;
    }) },
  };
}

describe('AI API image policy', () => {
  it('フィールド・ファイル・上位DB・連名画像・非公開の参照をすべて拒否する', () => {
    expect(policy.paths).toEqual([ok]);
    const filtered = filterAIResponse(record, policy, { workKey: '#Works_Alpha', dbName: 'Primary' });
    expect(filtered.Images).toEqual({ concept_PNGName: 'ok', arts_PNGPath: [] });
    expect(filtered.Images_AIOptout).toBeUndefined();
    expect(filtered.AIHints.common.reference_images).toEqual({ main: ok, extra: [] });
    expect(filtered.AIHints.common.tags).toEqual(['keep']);
    expect(filtered.AppearanceDetail).toHaveLength(1);
    expect(filtered.AppearanceDetail[0].Costume).toBe('usual');
    expect(filtered.AIHints.common.identity_tags).toEqual(['ordinary clothing']);
    expect(filtered.AIHints.forms.normal.prompt_export).toBeNull();
    expect(record.Images.arts_PNGPath).toHaveLength(3);
  });

  it.each([null, { ...policy, version: 0 }, { ...policy, complete: false }])('不明/古い/更新途中の表では画像だけを除く', (unknown) => {
    const filtered = filterAIResponse(record, unknown, { workKey: '#Works_Alpha', dbName: 'Primary' });
    expect(filtered.Images).toEqual({});
    expect(filtered.AIHints.common.reference_images).toEqual({ extra: [] });
    expect(filtered.AIHints.common.tags).toEqual(['keep']);
  });

  it('メタ内の除外宣言・画像型の例・除外画像の生値も返さない', () => {
    const example = { Images_AIOptout: record.Images_AIOptout, example: 'blocked-file', $DefType: [{ hashTag: 'Images', example: record.Images }] };
    const filtered = filterAIResponse(example, policy, { metadata: true });
    expect(JSON.stringify(filtered)).not.toContain('blocked-file');
    expect(JSON.stringify(filtered)).not.toContain('cardDesign_PNGName');
    expect(filtered.$DefType[0].hashTag).toBe('Images');
  });

  it.each(['records', 'records/1', 'search?q=ok', 'aihints', 'aihints/1', 'aihints/1?form=normal'])('%s で同じ許可表を通す', async (route) => {
    const bindings = env();
    const response = await worker.fetch(new Request(`https://example.invalid/api/ai/Alpha/Primary/${route}`), bindings, {});
    expect(response.status).toBe(200);
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain('blocked-file');
    expect(body).not.toContain('cardDesign_PNGName');
    expect(body).not.toContain(shared);
    expect(body).not.toContain('idol outfit');
    expect(body).toContain('keep');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(bindings.BUCKET.get.mock.calls.filter(([key]) => key === AI_IMAGE_POLICY_KEY)).toHaveLength(1);
  });

  it('R2許可表欠損では本文を含むAI APIを503で閉じる', async () => {
    const response = await worker.fetch(new Request('https://example.invalid/api/ai/Alpha/search?q=ok'), env(null), {});
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'AI policy unavailable', status: 503 });
  });

  it('公開のAI除外レコードはAI一覧/検索から除き、AI単件取得を404にする', async () => {
    const excluded = { ...record, AI_Optout: true };
    for (const route of ['Primary/records', 'Primary/search?q=ok', 'search?q=ok']) {
      const response = await worker.fetch(new Request(`https://example.invalid/api/ai/Alpha/${route}`), env(policy, excluded), {});
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    }
    const response = await worker.fetch(new Request('https://example.invalid/api/ai/Alpha/Primary/records/1'), env(policy, excluded), {});
    expect(response.status).toBe(404);
  });

  it('壊れたファイル除外指定をmigrationで拒否する', () => {
    json('data/Works_Alpha/DataBases/db_Unregistered.json', [{ Images: { concept_PNGName: 'ok' }, Images_AIOptout: { concept_PNGName: ['typo'] } }]);
    expect(() => buildAIImagePolicy(root)).toThrow('元画像にありません');
    rmSync(join(root, 'data/Works_Alpha/DataBases/db_Unregistered.json'));
  });

  it('旧相対参照のdenyを同じ物理画像へ合流する', () => {
    const initial = [record, { Num: 2, isPrivate: true, AIHints: { reference_images: { main: hintOnly } } }];
    json('data/Works_Alpha/DataBases/db_Primary.json', [...initial, { Num: 4, Images: { cardDesign_PNGName: '../../DB_Primary/concept/ok' } }]);
    expect(buildAIImagePolicy(root).paths).not.toContain(ok);
    json('data/Works_Alpha/DataBases/db_Primary.json', initial);
    json('data/Works_Beta/DataBases/db_Primary.json', [{ Num: 3, Images: { arts_PNGPath: [{ _DBCrossLinkPath: { _Work: 'Alpha', _DB: 'Primary', _Field: 'arts_PNGPath', _IsoPath: '../../DB_Primary/concept/ok' } }] } }]);
    expect(buildAIImagePolicy(root).paths).not.toContain(ok);
    json('data/Works_Beta/DataBases/db_Primary.json', [{ Num: 3, AI_Optout: false, Images: { arts_PNGPath: [{ _DBCrossLinkPath: { _Work: 'Alpha', _DB: 'Primary', _Field: 'arts_PNGPath', _IsoPath: 'shared' } }] } }]);
  });

  it('dictFileで宣言したサブフォルダの衣装辞書も読む', () => {
    json('data/Works_Alpha/Dictionaries/db_meta.json', { Dictionaries: { '#Dict_Outfits': { keyField: 'Costume', dictFile: 'Costume/dict_Outfits.json' } } });
    json('data/Works_Alpha/Dictionaries/Costume/dict_Outfits.json', [{ Costume: 'private', AI_Optout: true }]);
    expect(buildAIImagePolicy(root).costumes['#Works_Alpha']).toEqual([{ Costume: 'private', AI_Optout: true }]);
    rmSync(join(root, 'data/Works_Alpha/Dictionaries/db_meta.json'));
    rmSync(join(root, 'data/Works_Alpha/Dictionaries/Costume/dict_Outfits.json'));
  });

  it('private/scratchの同名DBを許可表と指紋へ混ぜない', () => {
    const before = aiPolicySourceHash(root);
    json('data/Works_Alpha/.private/db_Primary.json', [{ Num: 1, AI_Optout: true, Images: { concept_PNGName: 'ok' } }]);
    expect(aiPolicySourceHash(root)).toBe(before);
    expect(buildAIImagePolicy(root).paths).toContain(ok);
  });

  it('DB_Fileで別名ファイルを宣言したDBも共有画像denyへ含める', () => {
    json('data/Works_Alpha/DataBases/db_meta.json', { Databases: { '#DB_Primary': { AI_Optout: false, DB_File: 'custom.json' } } });
    json('data/Works_Alpha/DataBases/custom.json', [record, { Num: 4, Images: { cardDesign_PNGName: '../../DB_Primary/concept/ok' } }]);
    expect(buildAIImagePolicy(root).paths).not.toContain(ok);
    json('data/Works_Alpha/DataBases/db_meta.json', meta);
    rmSync(join(root, 'data/Works_Alpha/DataBases/custom.json'));
  });

  it('明示許可の資料カタログとlayer typedefだけを許可し、画像ルートのoverrideを守る', () => {
    const declared = 'data/Works_Alpha/Images/Ref_Basics/concept-figure/body.png';
    const unknown = 'data/Works_Alpha/Images/Ref_Unregistered/concept-figure/unknown.png';
    for (const path of [declared, unknown, 'data/SharedImages/Ref_Basics/concept-figure/body.png']) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), 'fixture');
    }
    json('data/Works_Alpha/References/db_meta.json', { Databases: { '#Ref_Basics': { AI_Optout: false, DB_Layer: 'References' } } });
    json('data/Works_Alpha/References/db_type.json', { $IndexDef: { hashTag: 'Ref' }, $DefType: [{ hashTag: 'Images', $type: [{ hashTag: 'concept-figure_PNGName', $type: '#PNGFileName[]' }] }] });
    json('data/Works_Alpha/References/ref_Basics.json', [{ Ref: 'body', Images: { 'concept-figure_PNGName': ['body'] } }]);
    json('data/Works_Alpha/References/ref_Unregistered.json', [{ Ref: 'unknown', Images: { 'concept-figure_PNGName': ['unknown'] } }]);
    const explicit = buildAIImagePolicy(root);
    expect(explicit.paths).toContain(declared);
    expect(explicit.paths).not.toContain(unknown);
    expect(explicit.records['#Works_Alpha/Basics'].allowed).toEqual(['body']);
    expect(explicit.records['#Works_Alpha/Unregistered'].allowed).toEqual([]);
    json('data/db_meta.json', { CreationWorks: { ...globalMeta.CreationWorks, '#Works_Alpha': { Works_ImagesDir: 'SharedImages' } } });
    const overridden = buildAIImagePolicy(root);
    expect(overridden.paths).toContain('data/SharedImages/Ref_Basics/concept-figure/body.png');
    expect(overridden.paths).not.toContain(declared);
    json('data/db_meta.json', globalMeta);
    for (const file of ['db_meta.json', 'db_type.json', 'ref_Basics.json', 'ref_Unregistered.json']) {
      rmSync(join(root, 'data/Works_Alpha/References', file));
    }
  });

  it.each([null, 'false', 0])('DBの不正なAI_Optout宣言を許可しない: %j', (value) => {
    json('data/Works_Alpha/DataBases/db_meta.json', { Databases: { '#DB_Primary': { AI_Optout: value } } });
    const invalid = buildAIImagePolicy(root);
    expect(invalid.records['#Works_Alpha/Primary'].allowed).toEqual([]);
    expect(invalid.paths).not.toContain(ok);
    json('data/Works_Alpha/DataBases/db_meta.json', meta);
  });

  it('同じデータ・同じ投入先のfull/AIHints同期の成功後だけ公開する', () => {
    markAIImagePolicySync(root, 'hints');
    markAIImagePolicySync(root, 'hints', true);
    expect(() => finalizeAIImagePolicy(root)).toThrow('full同期');
    markAIImagePolicySync(root, 'full');
    markAIImagePolicySync(root, 'full', true);
    expect(() => finalizeAIImagePolicy(root)).toThrow('AIHints同期');
    markAIImagePolicySync(root, 'hints', true);
    expect(finalizeAIImagePolicy(root).paths).toEqual([ok]);
    expect(() => finalizeAIImagePolicy(root, { bucket: 'other-bucket' })).toThrow('同一ソース');
    json('data/change.json', {});
    expect(() => finalizeAIImagePolicy(root)).toThrow('同一ソース');
  });

  it('同期の開始後にJSONが変わると成功マーカーを書かない', () => {
    markAIImagePolicySync(root, 'full');
    json('data/race.json', {});
    expect(() => markAIImagePolicySync(root, 'full', true)).toThrow('同期中にソース');
    expect(() => finalizeAIImagePolicy(root)).toThrow('同一ソース');
  });

  it('実データの61アイドル衣装とD-Vines対象4人をAI出力から除外する', () => {
    const repoRoot = fileURLToPath(new URL('../', import.meta.url));
    const actual = buildAIImagePolicy(repoRoot);
    const primary = JSON.parse(readFileSync(join(repoRoot, 'data/Works_NumberTales/DataBases/db_Primary.json'), 'utf8'));
    const rokuichi = primary.find((value) => String(value.Num) === '61');
    expect(rokuichi.AIHints).toBeTruthy();
    const filtered = filterAIResponse(rokuichi, actual, { workKey: '#Works_NumberTales', dbName: 'Primary' });
    expect(filtered.AppearanceDetail.some((entry) => entry.Costume === 'idol')).toBe(false);
    const output = JSON.stringify(filtered);
    for (const excluded of ['idol outfit', 'chr-dsgn-alt_wipNTS-61-idol', 'emstk_corefolderNTS-61-idol1', 'emstk_corefolderNTS-61-idol2']) {
      expect(output).not.toContain(excluded);
    }
    const allowed = actual.records['#Works_NumberTales/SemiPrimary'].allowed;
    for (const index of ['3/3', '7/7', '8/8', '22/22']) expect(allowed).not.toContain(index);
    expect(allowed).toContain('266');
    expect(allowed).toContain('314');
  });
});
