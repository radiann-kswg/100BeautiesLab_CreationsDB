/**
 * NumberTales 以外の作品（獣爾騎兵 / 豹変系女子）向け AIHints 生成経路のテスト
 *
 * @description
 *   2026-11-19 に `AI_Optout: false` となった 2 作品へ AIHints を広げた際の追加分を固定する。
 *     1. 索引キー / 形態キーを作品の typedef から解決すること（`record.Num` / corefolder 決め打ちの解消）
 *     2. `buildSeedAihints` … TODO 雛形を経由せず構造ソースから直接組み立てること
 *     3. `resolveLinkFills` … `$enrich: true` の `*_DBLink` から構造ソースを補うが、
 *        AI 不可の参照先（AI_Optout / 非公開）からは持ち込まないこと（権利ガード）
 *     4. 実データが各作品の `$VersDef` 型定義どおりであること
 *
 *   ★ 実データ側は件数やレコード名を固定しない（`patch-aihints.gates.test.js` と同じ方針）。
 *     キャラ・画像の追加で落ちない「規則」だけを書く。
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    buildAihintsFromAppearanceDetail,
    buildSeedAihints,
    loadAiFormKeys,
    loadAiUnreadyProgressValues,
    resolveLinkFills,
    resolveRecordKeyPath,
    resyncStructuralAihints,
} from '../tools/patch-aihints.mjs';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUBLIC_ORIGIN = 'https://database.numbertales-radiann.net';

/** AIHints を付与済みの「corefolder を持たない作品」と対象 DB */
const SEEDED = [
    ['ShauErRiders', 'Primary'],
    ['SinisterChangingGirls', 'Primary'],
    ['SinisterChangingGirls', 'PrimaryStabilities'],
];

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf-8'));

/** AppearanceDetail エントリの最小形（英語フレーズ 1 つ） */
const entry = (Formation, DesignElement, en) => ({
    Formation,
    BodyPart: null,
    Laterality: null,
    DesignElement,
    Attrs: [{ AttrLabel: '#DesignAttr_Overview', value_JP: '（テスト）', value_EN: en }],
});

/** 値の中の全文字列を集める */
function collectStrings(node, out = []) {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach((v) => collectStrings(v, out));
    else if (node && typeof node === 'object') Object.values(node).forEach((v) => collectStrings(v, out));
    return out;
}

describe('作品別スキーマからの解決', () => {
    it('索引キーは $IndexDef から引く（Num 決め打ちで他作品を素通りさせない）', () => {
        expect(resolveRecordKeyPath('NumberTales', 'Primary')).toBe('Num');
        expect(resolveRecordKeyPath('ShauErRiders', 'Primary')).toBe('BeastType.Beast');
        expect(resolveRecordKeyPath('SinisterChangingGirls', 'Primary')).toBe('Drc');
    });

    it('形態キーは $VersDef.$Def_AIHintsForms の宣言順で返る（先頭が既定形態）', () => {
        expect(loadAiFormKeys('NumberTales')).toEqual(['corefolder', 'humanoid']);
        expect(loadAiFormKeys('ShauErRiders')).toEqual(['normal', 'beasted']);
        expect(loadAiFormKeys('SinisterChangingGirls')).toEqual(['beforeChange', 'afterChanged']);
    });
});

describe('buildSeedAihints — 構造ソースから直接組み立てる', () => {
    const FORMS = ['beforeChange', 'afterChanged'];
    const record = () => ({
        Drc: 'E',
        Height_cm: 160,
        AppearanceDetail: [
            entry(null, '#Element_Motif', 'white hair'),
            entry(null, '#Element_CostumeItem', 'pink jacket'),
            // 宣言順と逆（afterChanged が先）に並べ、出力が宣言順へ揃うことを見る
            entry('afterChanged', '#Element_Ear', 'fox ears'),
            entry('beforeChange', '#Element_Motif', 'orange eyes'),
        ],
        ColorPalette: [{ Role: '#ColorRole_Primary', Hex: '#112233' }],
    });

    it('既定形態と、固有エントリを持つ形態だけを宣言順で作る', () => {
        const { aihints } = buildSeedAihints(record(), { main: 'u' }, {}, FORMS);
        expect(Object.keys(aihints.forms)).toEqual(FORMS);
        expect(aihints.forms.beforeChange.ai_tags).toEqual(
            expect.arrayContaining(['beforeChange form', 'white hair', 'pink jacket', 'orange eyes']),
        );
        expect(aihints.forms.beforeChange.ai_tags).not.toContain('fox ears');
        expect(aihints.forms.afterChanged.ai_tags).toContain('fox ears');
        expect(aihints.forms.afterChanged.ai_tags).not.toContain('orange eyes');
    });

    it('固有エントリが無い形態は作らない（既定形態と同じ中身の複製を置かない）', () => {
        const rec = { AppearanceDetail: [entry(null, '#Element_Motif', 'gray hair')] };
        const { aihints } = buildSeedAihints(rec, null, {}, ['normal', 'beasted']);
        expect(Object.keys(aihints.forms)).toEqual(['normal']);
    });

    it('TODO 雛形を経由しない（創作判断が要る枠は null のまま）', () => {
        const { aihints } = buildSeedAihints(record(), { main: 'u' }, {}, FORMS);
        expect(collectStrings(aihints).filter((s) => s.startsWith('TODO:'))).toEqual([]);
        expect(aihints.common.natural_language_description).toBeNull();
        expect(aihints.forms.beforeChange.natural_language_description).toBeNull();
        expect(aihints.forms.beforeChange.immutable_constraints).toBeNull();
    });

    it('参照画像と ColorPalette 由来の配色を最初から持つ', () => {
        const { aihints } = buildSeedAihints(record(), { main: 'u' }, {}, FORMS);
        expect(aihints.common.reference_images).toEqual({ main: 'u' });
        expect(aihints.common.palette_priority.primary).toBe('#112233');
    });

    it('provenance を記録済みで、直後の再同期は no-op になる', () => {
        const { aihints } = buildSeedAihints(record(), { main: 'u' }, {}, FORMS);
        expect(aihints._meta.structuralEntries['forms.beforeChange.ai_tags']).toContain('orange eyes');
        const again = resyncStructuralAihints(aihints, { ...record(), AIHints: aihints }, {});
        expect(again.skipped).toBe(true);
    });

    it('AppearanceDetail が無ければ組み立てない', () => {
        expect(buildSeedAihints({ Drc: 'N' }, { main: 'u' }, {}, FORMS).aihints).toBeNull();
    });

    it('参照画像だけ手で据えた形態は、再生成しても形態ごと保持する', () => {
        // 巳刻カミツの beasted（束縛形態）: 固有の AppearanceDetail は無いが参照画像がある
        const rec = {
            AppearanceDetail: [entry(null, '#Element_Motif', 'yellow-green hair')],
            AIHints: { forms: { beasted: { reference_images: { main: 'B' } } } },
        };
        const { aihints } = buildSeedAihints(rec, { main: 'A' }, {}, ['normal', 'beasted']);
        expect(Object.keys(aihints.forms)).toEqual(['normal', 'beasted']);
        expect(aihints.forms.beasted.reference_images).toEqual({ main: 'B' });
        expect(aihints.forms.beasted.ai_tags).toEqual(['beasted form', 'yellow-green hair']);
        expect(aihints.forms.normal.reference_images).toBeNull();
    });

    it('翼（#Element_Wing）は体の部位として扱い、衣装側へ落とさない', () => {
        const rec = { AppearanceDetail: [entry(null, '#Element_Wing', 'large membranous wings')] };
        const { aihints, warnings } = buildSeedAihints(rec, null, {}, ['normal']);
        expect(aihints.forms.normal.silhouette_notes.body_description).toContain('large membranous wings');
        expect(aihints.forms.normal.outfit_features).toEqual([]);
        expect(warnings).toEqual([]);
    });
});

describe('番号印字の接頭辞', () => {
    const marks = [entry(null, '#Element_NumberMark', 'on the left chest')];

    it('Num を持たない作品では索引値を番号扱いしない', () => {
        const { aihints } = buildSeedAihints({ Drc: 'N', AppearanceDetail: marks }, null, {}, ['beforeChange']);
        expect(aihints.common.immutable_traits).toEqual(['marking: on the left chest']);
    });

    it('Num を持つ作品は従来どおり番号つき（NumberTales の出力を変えない）', () => {
        const rec = { Num: 7, AppearanceDetail: marks, AIHints: { forms: { humanoid: {} } } };
        const { aihints } = buildAihintsFromAppearanceDetail(rec, {});
        expect(aihints.common.immutable_traits).toEqual(["number '7' marking: on the left chest"]);
    });
});

describe('resolveLinkFills — *_DBLink（同一存在）からの構造ソース穴埋め', () => {
    /** 作品 A の Main が、作品 B の Open（AI 可）/ Closed（AI 不可）を参照する最小データ */
    function makeDataRoot() {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aihints-linkfill-'));
        const write = (rel, obj) => {
            const p = path.join(root, rel);
            fs.mkdirSync(path.dirname(p), { recursive: true });
            fs.writeFileSync(p, JSON.stringify(obj));
        };
        write('db_type.json', {
            $DefType: [
                { hashTag: 'AppearanceDetail' }, { hashTag: 'ColorPalette' },
                { hashTag: 'GenderType' }, { hashTag: 'Height_cm' },
                { hashTag: 'Same_DBLink', $enrich: true },
            ],
        });
        write('db_meta.json', {
            CreationWorks: {
                // ColorPalette は $DetailLayout に載せない（= 別作品から持ち込まない項目）
                '#Works_A': { $DetailLayout: { headerPills: [], basicFields: ['Height_cm'], subFields: ['AppearanceDetail'] } },
            },
        });
        write('Works_A/DataBases/db_type.json', {});
        write('Works_B/DataBases/db_meta.json', {
            Databases: { '#DB_Open': { AI_Optout: false }, '#DB_Closed': { AI_Optout: true } },
        });
        write('Works_B/DataBases/db_Open.json', [
            { Num: 1, AppearanceDetail: [{ from: 'open' }], ColorPalette: [{ Hex: '#000000' }], Height_cm: 150 },
            { Num: 2, isPrivate: true, AppearanceDetail: [{ from: 'private' }] },
        ]);
        write('Works_B/DataBases/db_Closed.json', [{ Num: 9, AppearanceDetail: [{ from: 'closed' }] }]);
        return root;
    }
    const open = { _Work: 'B', _DB: 'Open', Num: 1 };
    const closed = { _Work: 'B', _DB: 'Closed', Num: 9 };
    const records = [
        { Key: 'open', Same_DBLink: [open] },
        { Key: 'closed-first', Same_DBLink: [closed, open] },
        { Key: 'has-own', AppearanceDetail: [{ from: 'own' }], Same_DBLink: [open] },
        { Key: 'private', Same_DBLink: [{ _Work: 'B', _DB: 'Open', Num: 2 }] },
        { Key: 'no-link' },
    ];
    const fills = resolveLinkFills(records, 'A', 'Main', makeDataRoot());

    it('AI 可の参照先から、空の構造ソースだけを補う', async () => {
        expect((await fills)[0]).toEqual({ AppearanceDetail: [{ from: 'open' }], Height_cm: 150 });
    });

    it('$DetailLayout に載らない項目は持ち込まない', async () => {
        expect((await fills)[0]).not.toHaveProperty('ColorPalette');
    });

    it('先頭の参照先が AI_Optout なら補わず、2 番目の参照へも進まない', async () => {
        expect((await fills)[1]).toEqual({});
    });

    it('レコードが自前で持つ値は上書きしない', async () => {
        expect((await fills)[2]).toEqual({ Height_cm: 150 });
    });

    it('非公開レコードからは補わない', async () => {
        expect((await fills)[3]).toEqual({});
    });

    it('参照を持たないレコードは空', async () => {
        expect((await fills)[4]).toEqual({});
    });
});

describe.each(SEEDED)('実データ: %s / %s の AIHints', (work, db) => {
    const versDef = readJson(`data/Works_${work}/DataBases/db_type.json`).$VersDef;
    const records = readJson(`data/Works_${work}/DataBases/db_${db}.json`);
    const withHints = records.filter((r) => r?.AIHints);
    const formKeys = loadAiFormKeys(work);
    const label = (r) => JSON.stringify(r.BeastType ?? r.Drc);

    it('AIHints を持つレコードがある（seed 済み）', () => {
        expect(withHints.length).toBeGreaterThan(0);
    });

    it('キー構成が作品の $VersDef 型定義どおり（_meta を除く）', () => {
        const violations = [];
        const check = (value, defName, at) => {
            const declared = new Map((versDef[defName]?.$DefType ?? []).map((d) => [d.hashTag, d.$type]));
            for (const [key, child] of Object.entries(value)) {
                if (at === 'AIHints' && key === '_meta') continue;
                if (!declared.has(key)) { violations.push(`${at}.${key}`); continue; }
                const ref = String(declared.get(key)).match(/\$Def_\w+/)?.[0];
                if (ref && child && typeof child === 'object' && !Array.isArray(child)) check(child, ref, `${at}.${key}`);
            }
        };
        for (const rec of withHints) check(rec.AIHints, '$Def_AIHints', 'AIHints');
        expect(violations).toEqual([]);
    });

    it('既定形態を必ず持ち、形態キーは宣言済みのものだけ', () => {
        for (const rec of withHints) {
            const keys = Object.keys(rec.AIHints.forms);
            expect(keys, label(rec)).toContain(formKeys[0]);
            expect(keys.filter((k) => !formKeys.includes(k)), label(rec)).toEqual([]);
        }
    });

    it('既定形態以外は、固有の AppearanceDetail エントリか参照画像のどちらかを持つ', () => {
        // 根拠の無い形態（既定形態と同じ中身の複製）を置かないための規則。
        // 参照画像だけの形態（巳刻カミツの beasted）は User 判断で許容している。
        for (const rec of withHints) {
            for (const [key, form] of Object.entries(rec.AIHints.forms)) {
                if (key === formKeys[0]) continue;
                const hasEntries = (rec.AppearanceDetail ?? []).some((e) => e?.Formation === key);
                expect(hasEntries || Boolean(form.reference_images), `${label(rec)} forms.${key}`).toBe(true);
            }
        }
    });

    it('TODO プレースホルダを含まない', () => {
        const todos = withHints.flatMap((r) => collectStrings(r.AIHints).filter((s) => s.startsWith('TODO:')));
        expect(todos).toEqual([]);
    });

    it('付与ゲートを通ったレコードだけに付いている（画像あり・公開・AI_Unready でない）', () => {
        const unready = loadAiUnreadyProgressValues(work);
        for (const rec of withHints) {
            expect(Boolean(rec.Images), label(rec)).toBe(true);
            expect(rec.isPrivate === true, label(rec)).toBe(false);
            expect(unready.has(rec.Progress), label(rec)).toBe(false);
        }
    });

    it('参照画像の URL はすべて実ファイルへ解決する', () => {
        const missing = withHints
            .flatMap((r) => collectStrings(r.AIHints))
            .filter((s) => s.startsWith(`${PUBLIC_ORIGIN}/`))
            .filter((url) => !fs.existsSync(path.join(repoRoot, url.slice(PUBLIC_ORIGIN.length + 1))));
        expect(missing).toEqual([]);
    });
});
