/**
 * tools/patch-aihints.mjs の構造的再同期（provenance / --resync-structural）テスト
 *
 * @description
 *   AIHints の再ビルドには長らく「全部消す（`--suggest --force` / `--apply-appearancedetail` の
 *   全面上書き）」か「TODO 文字列だけ拾う（`--fill-todos`）」かの二択しかなく、その隙間に
 *   **「構造は最新化したいが、人の手仕上げは残したい」** という運用が落ちていた。
 *
 *   `--resync-structural` は AIHints に `_meta` を持たせ、**ツールが実際に挿入した文字列そのもの**
 *   を記録することでこれを解く。再同期は find-exact-and-replace で「記録に一致する文字列だけ」を
 *   差し替え、記録に無い文字列（= 人が書いた／人が編集した）には一切触れない。
 *
 *   本テストはその不変条件を固定する:
 *     - 人が書いたタグは再同期で消えない（最重要）
 *     - 構造ソースが変われば構造由来のタグは最新化される
 *     - 構造ソースが変わっていなければ no-op（ハッシュ一致でスキップ）
 *     - 人が編集したツール由来の文字列は上書きせず、警告として報告する
 *
 * @see _work_in_progress/2026-07-08_progress_aihints-structural-resync-proposal.md
 */

import { describe, it, expect } from 'vitest';

import {
    computeStructuralSourceHash,
    buildStructuralSnapshot,
    resyncStructuralAihints,
    loadMergedVarsDef,
} from '../tools/patch-aihints.mjs';

const varsDef = loadMergedVarsDef('NumberTales');

/** AppearanceDetail / TailsUnit を持つ最小レコード */
function makeRecord(overrides = {}) {
    return {
        Num: 1,
        GenderType: '#Gender_FemaleNeutral',
        ConceptAge: 14,
        Height_cm: 146,
        TailsUnit: [{ TailShapeType: '#TailShapeType_Fox', Count: 1 }],
        AppearanceDetail: [
            {
                Formation: null,
                BodyPart: ['#BodyPart_Hair'],
                DesignElement: '#Element_Motif',
                Attrs: [{ AttrLabel: '#DesignAttr_Overview', value_JP: '赤橙色の髪', value_EN: 'red orange hair' }],
            },
        ],
        ColorPalette: [
            { Role: '#ColorRole_Primary', Hex: '#FF8682' },
            { Role: '#ColorRole_Secondary', Hex: '#ED5D47' },
            { Role: '#ColorRole_Accent', Hex: '#FFAC8F' },
        ],
        ...overrides,
    };
}

/** AIHints の最小構造 */
function makeAihints(commonOverrides = {}, formOverrides = {}) {
    return {
        common: {
            identity_tags: [],
            silhouette_features: [],
            immutable_traits: null,
            expression_tendency: null,
            age_appearance: null,
            palette_priority: null,
            natural_language_description: 'HUMAN: 手で書いた説明文',
            reference_images: null,
            ...commonOverrides,
        },
        forms: {
            corefolder: {
                form_tags: [],
                ai_tags: [],
                outfit_features: ['HUMAN: 手で書いた衣装'],
                immutable_constraints: [],
                negative_keywords: [],
                ...formOverrides,
            },
        },
    };
}

describe('computeStructuralSourceHash — 構造ソースの変化検知', () => {
    it('同じレコードからは同じハッシュが出る（決定論的）', () => {
        expect(computeStructuralSourceHash(makeRecord())).toBe(computeStructuralSourceHash(makeRecord()));
    });

    it('構造ソース（Height_cm）が変わればハッシュも変わる', () => {
        expect(computeStructuralSourceHash(makeRecord({ Height_cm: 152 })))
            .not.toBe(computeStructuralSourceHash(makeRecord()));
    });

    it('構造ソースでないフィールドが変わってもハッシュは変わらない', () => {
        // Summary_JP は AIHints の構造由来部分に影響しない
        expect(computeStructuralSourceHash(makeRecord({ Summary_JP: '書き換えた' })))
            .toBe(computeStructuralSourceHash(makeRecord()));
    });

    it('キーの並び順に依存しない', () => {
        const a = { Num: 1, Height_cm: 146 };
        const b = { Height_cm: 146, Num: 1 };
        expect(computeStructuralSourceHash(a)).toBe(computeStructuralSourceHash(b));
    });
});

describe('buildStructuralSnapshot — 構造由来であるべき値の一覧', () => {
    it('ColorPalette から palette_priority を導出する', () => {
        const { scalars } = buildStructuralSnapshot(makeRecord(), varsDef);
        expect(scalars['common.palette_priority']).toEqual({
            primary: '#FF8682', secondary: '#ED5D47', accent: '#FFAC8F',
        });
    });

    it('人手・視覚由来のフィールドは構造スナップショットに含めない', () => {
        const { arrays } = buildStructuralSnapshot(makeRecord(), varsDef);
        const paths = Object.keys(arrays);
        expect(paths.some(p => p.includes('outfit_features'))).toBe(false);
        expect(paths.some(p => p.includes('silhouette_notes'))).toBe(false);
        expect(paths.some(p => p.includes('natural_language_description'))).toBe(false);
    });
});

describe('resyncStructuralAihints — 人の手仕上げを残したまま構造だけ最新化する', () => {
    it('人が書いたタグは再同期で消えない（本モードの存在理由）', () => {
        const record = makeRecord();
        const aihints = makeAihints({ identity_tags: ['HUMAN: 手編みのマフラー'] });

        const { aihints: out, changed } = resyncStructuralAihints(aihints, record, varsDef);
        expect(changed).toBe(true);
        expect(out.common.identity_tags).toContain('HUMAN: 手編みのマフラー');
        // 構造由来のタグも入っている
        expect(out.common.identity_tags.length).toBeGreaterThan(1);
    });

    it('人手・視覚由来のフィールドには一切触れない', () => {
        const record = makeRecord();
        const aihints = makeAihints();
        const { aihints: out } = resyncStructuralAihints(aihints, record, varsDef);
        expect(out.common.natural_language_description).toBe('HUMAN: 手で書いた説明文');
        expect(out.forms.corefolder.outfit_features).toEqual(['HUMAN: 手で書いた衣装']);
    });

    it('構造ソースが変われば構造由来のタグが最新化される', () => {
        const first = resyncStructuralAihints(makeAihints(), makeRecord(), varsDef).aihints;
        const before = first.common.silhouette_features.find(s => s.includes('146cm'));
        expect(before).toBeTruthy();

        // 身長を変える = 構造ソースの変化
        const second = resyncStructuralAihints(first, makeRecord({ Height_cm: 152 }), varsDef).aihints;
        expect(second.common.silhouette_features.some(s => s.includes('152cm'))).toBe(true);
        expect(second.common.silhouette_features.some(s => s.includes('146cm'))).toBe(false);
    });

    it('構造ソースが変わっていなければ no-op（ハッシュ一致でスキップ）', () => {
        const record = makeRecord();
        const first = resyncStructuralAihints(makeAihints(), record, varsDef).aihints;

        const second = resyncStructuralAihints(first, record, varsDef);
        expect(second.skipped).toBe(true);
        expect(second.changed).toBe(false);
    });

    it('_meta にツールが挿入した文字列そのものを記録する', () => {
        const { aihints: out } = resyncStructuralAihints(makeAihints(), makeRecord(), varsDef);
        expect(out._meta.structuralSourceHash).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(out._meta.lastStructuralResync).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // 記録された文字列は、実際に配列へ入っている文字列と一致する
        const recorded = out._meta.structuralEntries['common.identity_tags'];
        expect(Array.isArray(recorded)).toBe(true);
        for (const s of recorded) expect(out.common.identity_tags).toContain(s);
    });

    it('人が編集したツール由来の文字列は上書きせず、警告として報告する', () => {
        const record = makeRecord();
        const first = resyncStructuralAihints(makeAihints(), record, varsDef).aihints;

        // ツールが入れたタグを人が書き換える
        const edited = JSON.parse(JSON.stringify(first));
        const idx = edited.common.identity_tags.findIndex(s => s.includes('red orange hair'));
        edited.common.identity_tags[idx] = 'red orange hair (人が調整した版)';

        // 構造ソースを変えて再同期を発火させる
        const res = resyncStructuralAihints(edited, makeRecord({ Height_cm: 152 }), varsDef);
        expect(res.warnings.some(w => w.includes('編集/削除'))).toBe(true);
        // 人が編集した文字列は残る
        expect(res.aihints.common.identity_tags).toContain('red orange hair (人が調整した版)');
    });

    it('palette_priority の確定値は保護する（ColorPalette 由来の値で潰さない）', () => {
        const record = makeRecord();
        const aihints = makeAihints({ palette_priority: { primary: '#111111', secondary: '#222222', accent: '#333333' } });
        const { aihints: out } = resyncStructuralAihints(aihints, record, varsDef);
        expect(out.common.palette_priority.primary).toBe('#111111');
    });

    it('palette_priority が未入力なら ColorPalette から埋める', () => {
        const { aihints: out } = resyncStructuralAihints(makeAihints(), makeRecord(), varsDef);
        expect(out.common.palette_priority).toEqual({
            primary: '#FF8682', secondary: '#ED5D47', accent: '#FFAC8F',
        });
    });

    it('入力の AIHints を破壊しない（deep copy して返す）', () => {
        const aihints = makeAihints({ identity_tags: ['HUMAN: x'] });
        resyncStructuralAihints(aihints, makeRecord(), varsDef);
        expect(aihints._meta).toBeUndefined();
        expect(aihints.common.identity_tags).toEqual(['HUMAN: x']);
    });
});
