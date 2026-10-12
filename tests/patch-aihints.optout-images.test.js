/**
 * 合同絵の AI_Optout OR 判定テスト
 *
 * @description 登場キャラのうち 1 人でも `AI_Optout: true`（DB 単位 / `_Secondaries` カテゴリ単位）なら、
 *   その絵は opt-in 側キャラの AIHints からも外れる（`collectOptoutImageKeys()`）。
 *   構成は SelfSecondary #148（プレゼントナンバー / opt-in）の合同絵を、
 *   Secondary のナンバーテールズ化（opt-out）が `_DBCrossLinkPath` で参照するケースに合わせている。
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectOptoutImageKeys, imageRefKey } from '../tools/patch-aihints.mjs';

const GIFT = 'gift/gift_imgNTS-148-corefolder,NTS-148ZE-humanoid';

function makeDataRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aihints-optout-'));
    const dbDir = path.join(root, 'Works_NT', 'DataBases');
    fs.mkdirSync(dbDir, { recursive: true });
    const write = (name, obj) => fs.writeFileSync(path.join(dbDir, name), JSON.stringify(obj));
    write('db_meta.json', {
        Databases: {
            '#DB_SelfSecondary': {
                _Secondaries: [{ sec_Category: 'プレゼントナンバー', sec_SeriesTitle: null, _Commons: {}, AI_Optout: false }],
            },
            '#DB_Secondary': {
                _Secondaries: [{ sec_Category: '自創作キャラ化企画', sec_SeriesTitle: 'ナンバーテールズ化', _Commons: {}, AI_Optout: true }],
                '#DB_UnprocessedSecondary': { AI_Optout: true },
            },
        },
    });
    write('db_SelfSecondary.json', [
        { Num: 148, sec_Category: 'プレゼントナンバー', Images: { arts_PNGPath: [GIFT, 'solo/art_imgNTS-148'] } },
    ]);
    write('db_Secondary.json', [
        {
            Num: '148-numberize',
            sec_Category: '自創作キャラ化企画',
            sec_SeriesTitle: 'ナンバーテールズ化',
            Images: { arts_PNGPath: [{ _DBCrossLinkPath: { _DB: 'SelfSecondary', _IsoPath: GIFT } }] },
        },
    ]);
    // ネスト DB の DB 単位 opt-out
    write('db_UnprocessedSecondary.json', [{ Num: 1, Images: { corefolder_PNGPath: ['1/x'] } }]);
    return root;
}

describe('collectOptoutImageKeys', () => {
    const keys = collectOptoutImageKeys(makeDataRoot());

    it('opt-out キャラが 1 人でも参照する合同絵は、opt-in 側から見ても opt-out', () => {
        expect(keys.has(imageRefKey('NT', 'SelfSecondary', 'arts', GIFT))).toBe(true);
    });

    it('opt-in キャラだけの絵は opt-out にならない', () => {
        expect(keys.has(imageRefKey('NT', 'SelfSecondary', 'arts', 'solo/art_imgNTS-148'))).toBe(false);
    });

    it('ネスト DB の DB 単位 opt-out も拾う', () => {
        expect(keys.has(imageRefKey('NT', 'UnprocessedSecondary', 'corefolder', '1/x'))).toBe(true);
    });
});
