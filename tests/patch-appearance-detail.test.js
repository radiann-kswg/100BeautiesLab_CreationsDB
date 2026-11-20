/** 外見候補の誤適用・部分書込み・画像権利の迂回を防ぐ回帰テスト。 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchAppearanceDetails, patchAppearanceText, prepareAppearancePatch } from '../tools/patch-appearance-detail.mjs';
import { scanTopLevelRecords } from '../tools/extract-palette.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = { Formation: null, Costume: null, BodyPart: ['#BodyPart_Eye'], Laterality: '#Lat_Both', DesignElement: '#Element_Expression', Attrs: [{ AttrLabel: '#DesignAttr_Overview', value_JP: '作者入力', value_EN: 'Author input' }], Note_JP: null };
let root, dbFile, records, patches;
const save = (relative, value) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
};
const run = (options = {}) => patchAppearanceDetails({ work: 'Demo', patches, repoRoot: root, ...options });

beforeEach(() => {
    fs.mkdirSync(path.join(ROOT, '.cache'), { recursive: true });
    root = fs.mkdtempSync(path.join(ROOT, '.cache', 'appearance-detail-test-'));
    const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/db_meta.json'), 'utf8'));
    meta.CreationWorks = { '#Works_Demo': {} };
    save('data/db_meta.json', meta);
    save('data/db_type.json', fs.readFileSync(path.join(ROOT, 'data/db_type.json'), 'utf8'));
    save('data/Works_Demo/DataBases/db_meta.json', { Databases: { '#DB_Primary': {}, '#DB_Other': {} }, General: { $VarsDef: {} } });
    save('data/Works_Demo/DataBases/db_type.json', { $DefType: [{ hashTag: 'Images', $type: [{ hashTag: 'concept_PNGName', $type: '#PNGFileName' }, { hashTag: 'blocked_PNGName', $type: '#PNGFileName', AI_Optout: true }] }] });
    save('data/Works_Demo/Dictionaries/db_meta.json', { Dictionaries: { '#Dict_Formation': { keyField: 'Formation', dictFile: 'forms/dict_forms.json' }, '#Dict_Costume': { keyField: 'Costume' } } });
    save('data/Works_Demo/Dictionaries/forms/dict_forms.json', [{ Formation: 'normal' }]);
    save('data/Works_Demo/Dictionaries/dict_Costume.json', [{ Costume: 'usual' }]);
    records = [{ Card: { Suit: 'A', Num: 1 }, Images: { concept_PNGName: 'drawing', blocked_PNGName: 'drawing' }, AppearanceDetail: [structuredClone(entry)], ColorPalette: null }, { Card: { Suit: 'A', Num: 2 }, AppearanceDetail: null }];
    save('data/Works_Demo/DataBases/db_Primary.json', records);
    save('data/Works_Demo/Images/DB_Primary/concept/drawing.png', 'original artwork fixture');
    dbFile = path.join(root, 'data/Works_Demo/DataBases/db_Primary.json');
    patches = [{ db: 'Primary', match: { Card: { Suit: 'A', Num: 1 } }, before: structuredClone(records[0].AppearanceDetail), after: [{ ...structuredClone(entry), Formation: 'normal', Costume: 'usual', Detachable: true }], sources: [{ kind: 'manual', note: '作者の監修済み入力' }] }];
});
afterEach(() => {
    vi.restoreAllMocks();
    if (!root.startsWith(path.join(ROOT, '.cache', 'appearance-detail-test-'))) throw new Error('テスト作業場のパスが不正です');
    fs.rmSync(root, { recursive: true, force: true });
});

describe('AppearanceDetail 候補の反映', () => {
    it('準備は現在の外見を複写し、監修前の適用と候補ファイルの上書きを拒否する', () => {
        const options = { work: 'Demo', db: 'Primary', match: { Card: { Num: 1 } }, out: '.cache/prepared.json', repoRoot: root };
        const { prepared } = prepareAppearancePatch(options);
        const candidate = JSON.parse(fs.readFileSync(prepared, 'utf8'));
        expect(candidate[0].before).toEqual(records[0].AppearanceDetail);
        expect(candidate[0].after).toEqual(candidate[0].before);
        expect(candidate[0].sources).toEqual([{ kind: 'manual', note: '' }]);
        expect(() => run({ patches: candidate })).toThrow(/根拠/);
        expect(() => prepareAppearancePatch(options)).toThrow(/exist/i);
        expect(() => prepareAppearancePatch({ ...options, match: { Card: { Suit: 'A' } }, out: '.cache/another.json' })).toThrow(/一意/);
        const empty = prepareAppearancePatch({ ...options, match: { Card: { Num: 2 } }, out: '.cache/empty.json' });
        expect(JSON.parse(fs.readFileSync(empty.prepared, 'utf8'))[0]).toMatchObject({ before: null, after: [] });
    });

    it('複合 match で1件を選び、dry-run は差分だけ返す', () => {
        const original = fs.readFileSync(dbFile, 'utf8');
        const result = run();
        expect(result.applied).toBe(false);
        expect(result.results[0].changes[0]).toMatchObject({ index: 0, before: { Formation: null }, after: { Formation: 'normal' } });
        expect(fs.readFileSync(dbFile, 'utf8')).toBe(original);
    });

    it('明示 apply は対象の要素だけ変え、無関係なレコードを保持する', () => {
        run({ apply: true });
        const after = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
        expect(after[0].AppearanceDetail).toEqual(patches[0].after);
        expect(after[1]).toEqual(records[1]);
        expect(() => run({ apply: true })).toThrow(/before/);
    });

    it('変更しない要素と周辺書式を保持し、末尾へ追加できる', () => {
        const text = '[\r\n  { "Num": 1, "AppearanceDetail": [ { "Note_JP": "a } [ \\" b" } ], "Other": [1,2] }\r\n]\r\n';
        const before = JSON.parse(text)[0].AppearanceDetail;
        const after = [...before, { Note_JP: '追加' }];
        const result = patchAppearanceText(text, scanTopLevelRecords(text)[0], before, after);
        expect(JSON.parse(result)[0].AppearanceDetail).toEqual(after);
        expect(result).toContain('{ "Note_JP": "a } [ \\" b" }');
        expect(result).toContain('"Other": [1,2]');
        expect(result.replace(/\r\n/g, '')).not.toContain('\n');
    });

    it.each([null, 'missing'])('%s の AppearanceDetail に新規入力できる', value => {
        const record = { Num: 1, ...(value === null ? { AppearanceDetail: null } : {}), ColorPalette: null };
        const text = JSON.stringify([record], null, 2);
        const result = patchAppearanceText(text, scanTopLevelRecords(text)[0], null, [entry], ['AppearanceDetail', 'ColorPalette']);
        expect(JSON.parse(result)[0].AppearanceDetail).toEqual([entry]);
        expect(Object.keys(JSON.parse(result)[0]).indexOf('AppearanceDetail')).toBeLessThan(Object.keys(JSON.parse(result)[0]).indexOf('ColorPalette'));
    });

    it('全候補が検証を通るまで書き込まない', () => {
        const original = fs.readFileSync(dbFile, 'utf8');
        patches.push({ ...patches[0], match: { Card: { Num: 2 } }, before: null, after: [{ ...entry, Laterality: '#Lat_Missing' }] });
        expect(() => run({ apply: true })).toThrow(/Laterality/);
        expect(fs.readFileSync(dbFile, 'utf8')).toBe(original);
    });

    it.each([
        patch => { patch.match = { Card: { Suit: 'A' } }; },
        patch => { patch.before = []; },
        patch => { patch.db = '../Primary'; },
        patch => { patch.after = []; },
        patch => { patch.sources = []; },
        patch => { patch.after[0].Unknown = true; },
        patch => { patch.after[0].BodyPart = ['#BodyPart_Unknown']; },
        patch => { patch.after[0].Formation = 'missing'; },
        patch => { patch.after[0].Costume = 'missing'; },
        patch => { patch.after[0].Detachable = 'true'; },
        patch => { patch.after[0].Attrs[0].value_Num = '3'; },
        patch => { patch.after[0].Attrs[0].AttrLabel = '#DesignAttr_Unknown'; },
    ])('不正な候補は拒否する', mutate => {
        mutate(patches[0]);
        expect(() => run({ apply: true })).toThrow();
    });

    it('後続ファイルの rename 失敗時は先に書いたDBを戻す', () => {
        save('data/Works_Demo/DataBases/db_Other.json', records);
        patches.push({ ...structuredClone(patches[0]), db: 'Other' });
        const original = fs.readFileSync(dbFile, 'utf8');
        const rename = fs.renameSync;
        vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
            if (String(from).endsWith('Other.json')) throw new Error('write failed');
            return rename(from, to);
        });
        expect(() => run({ apply: true })).toThrow('write failed');
        expect(fs.readFileSync(dbFile, 'utf8')).toBe(original);
    });

    it('復元も失敗した場合は元データを消さず復旧先を報告する', () => {
        save('data/Works_Demo/DataBases/db_Other.json', records);
        patches.push({ ...structuredClone(patches[0]), db: 'Other' });
        const original = fs.readFileSync(dbFile, 'utf8');
        const rename = fs.renameSync;
        vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
            if (String(from).endsWith('Other.json') || String(from).endsWith('.before.json')) throw new Error('write failed');
            return rename(from, to);
        });
        expect(() => run({ apply: true })).toThrow(/元データを保存/);
        const cache = path.join(root, '.cache/appearance-detail');
        expect(fs.readFileSync(path.join(cache, fs.readdirSync(cache)[0], 'Primary.before.json'), 'utf8')).toBe(original);
    });
});

describe('根拠画像のポリシー', () => {
    beforeEach(() => { patches[0].sources = [{ field: 'concept_PNGName', value: 'drawing', note: '原画で確認した形状', permissionNote: '作者がこの入力補助への利用を許諾' }]; });
    it('原画の実在と作者許諾メモがそろえば候補を検証する', () => expect(run().results).toHaveLength(1));
    it('DBカタログに載っていない作業用JSONをレコードとして走査しない', () => {
        save('data/Works_Demo/DataBases/db_temp.json', { temporary: true });
        expect(run().results).toHaveLength(1);
    });
    it('DBCrossLinkPathを原画像の参照として検証できる', () => {
        const link = { _DBCrossLinkPath: { _DB: 'Primary', _Field: 'concept_PNGName', _IsoPath: 'drawing' } };
        records[0].Images.concept_PNGName = link;
        save('data/Works_Demo/DataBases/db_Primary.json', records);
        patches[0].sources[0].value = structuredClone(link);
        expect(run().results).toHaveLength(1);
    });
    it.each([
        () => { delete patches[0].sources[0].permissionNote; },
        () => { patches[0].sources[0].kind = 'manual'; },
        () => { patches[0].sources[0].value = 'missing'; },
        () => { patches[0].sources[0].field = 'blocked_PNGName'; },
        () => { records[0].Images_AIOptout = { concept_PNGName: ['drawing'] }; save('data/Works_Demo/DataBases/db_Primary.json', records); },
        () => { records.push({ Card: { Num: 3 }, Images: { concept_PNGName: 'drawing' }, Images_AIOptout: { concept_PNGName: ['drawing'] } }); save('data/Works_Demo/DataBases/db_Primary.json', records); },
        () => { save('data/Works_Demo/DataBases/db_meta.json', { Databases: { '#DB_Primary': { AI_Optout: true } } }); },
        () => { records[0].AI_Optout = 'false'; save('data/Works_Demo/DataBases/db_Primary.json', records); },
        () => { save('data/Works_Demo/DataBases/db_meta.json', { Databases: { '#DB_Primary': { _Commons: { isPrivate: true } } } }); },
        () => { save('data/Works_Demo/DataBases/db_meta.json', { Databases: { '#DB_Primary': { _Commons: { Images_AIOptout: { concept_PNGName: ['drawing'] } } } } }); },
        () => {
            const type = JSON.parse(fs.readFileSync(path.join(root, 'data/db_type.json'), 'utf8'));
            type.$DefType.push({ hashTag: 'Images', $type: [{ hashTag: 'concept_PNGName', $type: '#PNGFileName', AI_Optout: true }] });
            save('data/db_type.json', type);
        },
        () => {
            records.push({ Card: { Num: 3 }, Images: { blocked_PNGName: { _DBCrossLinkPath: { _DB: 'Primary', _Field: 'concept_PNGName', _IsoPath: 'drawing' } } } });
            save('data/Works_Demo/DataBases/db_Primary.json', records);
        },
        () => {
            records.push({ Card: { Num: 3 }, Images: { blocked_PNGName: '../../DB_Primary/concept/drawing' } });
            save('data/Works_Demo/DataBases/db_Primary.json', records);
        },
        () => {
            const link = { _DBCrossLinkPath: { _DB: 'Primary', _Field: 'unknown_PNGName', _IsoPath: '../concept/drawing' } };
            records[0].Images.concept_PNGName = link;
            save('data/Works_Demo/DataBases/db_Primary.json', records);
            patches[0].sources[0].value = link;
        },
    ])('許諾メモでも不許可指定・不明画像・共有画像の拒否を解除できない', mutate => {
        mutate();
        expect(() => run()).toThrow();
    });
});
