/**
 * tools/patch-aihints.mjs の palette_priority デッドロック回帰テスト
 *
 * @description
 *   `common.palette_priority` は画像を見ないと決まらない視覚由来フィールドであり、
 *   Agent 連動の視覚解析ワークフロー（`--gen-vision-tasks` → Agent の view_image →
 *   `--apply-vision-results`）で埋める設計になっている。
 *
 *   しかし 2026-07-13 の調査で、以下の三重のガードによって palette が永久に埋まらない
 *   デッドロックが成立していたことが判明した（NumberTales/Primary の実データで
 *   AIHints を持つ 92 件すべてが `palette_priority: null` に固定されていた）。
 *
 *     1. `buildAihintsFromAppearanceDetail()`（--apply-appearancedetail）が
 *        palette_priority を毎回 `null` へ潰す
 *     2. `detectVisualTodos()`（--gen-vision-tasks）が `TODO:` 文字列しか未入力とみなさず、
 *        `null` 化されたレコードを視覚タスクに載せない
 *     3. `applyVisionResultsToAihints()`（--apply-vision-results）が `null` を falsy として
 *        弾き、Agent が解析結果を返しても書き戻さない
 *
 *   本テストはこの 3 点の修正を回帰として固定する。あわせて「確定済みの HEX を
 *   上書きしない」ことも検証し、再ビルドで手入力値が失われないことを保証する。
 *
 * @see _work_in_progress/2026-07-13_progress_aihints-palette-deadlock.md
 */

import { describe, it, expect } from 'vitest';
import {
    isUnfilledPaletteSlot,
    detectVisualTodos,
    applyVisionResultsToAihints,
    clearAihintsTagsForNoSource,
    buildAihintsFromAppearanceDetail,
} from '../tools/patch-aihints.mjs';

/** 確定済みパレット（手入力・視覚解析済みを想定） */
const FILLED_PALETTE = { primary: '#E85A3C', secondary: '#F08080', accent: '#FBF3E4' };

/** scaffold 直後の TODO パレット */
const TODO_PALETTE = {
    primary: 'TODO: #RRGGBB (primary color)',
    secondary: 'TODO: #RRGGBB (secondary color)',
    accent: 'TODO: #RRGGBB (accent color)',
};

/**
 * テスト用の最小 AIHints を組み立てる。
 * @param {any} palette  common.palette_priority に入れる値
 * @returns {any}
 */
function makeAihints(palette) {
    return {
        common: {
            identity_tags: ['fox-type android unit'],
            silhouette_features: ['red orange hair, short hair'],
            immutable_traits: null,
            expression_tendency: ['energetic open smile'],
            age_appearance: 'early teenager',
            palette_priority: palette,
            natural_language_description: null,
            reference_images: { main: 'https://example.invalid/main.png' },
        },
        forms: {},
    };
}

describe('isUnfilledPaletteSlot', () => {
    it('null / undefined / 空文字 / TODO 文字列を未入力とみなす', () => {
        expect(isUnfilledPaletteSlot(null)).toBe(true);
        expect(isUnfilledPaletteSlot(undefined)).toBe(true);
        expect(isUnfilledPaletteSlot('')).toBe(true);
        expect(isUnfilledPaletteSlot('TODO: #RRGGBB (primary color)')).toBe(true);
    });

    it('確定済みの HEX は未入力とみなさない', () => {
        expect(isUnfilledPaletteSlot('#E85A3C')).toBe(false);
    });
});

describe('detectVisualTodos — palette_priority の検出', () => {
    it('palette_priority が null でも 3 スロットすべてを視覚タスクとして検出する（デッドロックの核心）', () => {
        const fields = detectVisualTodos(makeAihints(null));
        expect(fields).toContain('common.palette_priority.primary');
        expect(fields).toContain('common.palette_priority.secondary');
        expect(fields).toContain('common.palette_priority.accent');
    });

    it('palette_priority キー自体が欠落していても 3 スロットを検出する', () => {
        const aihints = makeAihints(null);
        delete aihints.common.palette_priority;
        const fields = detectVisualTodos(aihints);
        expect(fields).toContain('common.palette_priority.primary');
        expect(fields).toContain('common.palette_priority.secondary');
        expect(fields).toContain('common.palette_priority.accent');
    });

    it('TODO 文字列のスロットを検出する（従来動作の維持）', () => {
        const fields = detectVisualTodos(makeAihints({ ...TODO_PALETTE }));
        expect(fields).toContain('common.palette_priority.primary');
        expect(fields).toContain('common.palette_priority.secondary');
        expect(fields).toContain('common.palette_priority.accent');
    });

    it('確定済みの palette は検出しない（埋め直しを要求しない）', () => {
        const fields = detectVisualTodos(makeAihints({ ...FILLED_PALETTE }));
        expect(fields.filter(f => f.startsWith('common.palette_priority'))).toEqual([]);
    });

    it('一部だけ未入力なら、そのスロットだけを検出する', () => {
        const fields = detectVisualTodos(makeAihints({
            primary: '#E85A3C',
            secondary: null,
            accent: 'TODO: #RRGGBB (accent color)',
        }));
        const paletteFields = fields.filter(f => f.startsWith('common.palette_priority'));
        expect(paletteFields).toEqual([
            'common.palette_priority.secondary',
            'common.palette_priority.accent',
        ]);
    });
});

describe('applyVisionResultsToAihints — palette_priority の適用', () => {
    it('palette_priority が null でも Agent の解析結果を書き戻せる（デッドロックの核心）', () => {
        const { aihints, changed } = applyVisionResultsToAihints(makeAihints(null), {
            num: 1,
            palette: { ...FILLED_PALETTE },
        });
        expect(changed).toBe(true);
        expect(aihints.common.palette_priority).toEqual(FILLED_PALETTE);
    });

    it('TODO 文字列のスロットを HEX で置換する（従来動作の維持）', () => {
        const { aihints, changed } = applyVisionResultsToAihints(makeAihints({ ...TODO_PALETTE }), {
            num: 1,
            palette: { ...FILLED_PALETTE },
        });
        expect(changed).toBe(true);
        expect(aihints.common.palette_priority).toEqual(FILLED_PALETTE);
    });

    it('確定済みの HEX は上書きしない（手入力値を保護する）', () => {
        const { aihints } = applyVisionResultsToAihints(makeAihints({ ...FILLED_PALETTE }), {
            num: 1,
            palette: { primary: '#000000', secondary: '#111111', accent: '#222222' },
        });
        expect(aihints.common.palette_priority).toEqual(FILLED_PALETTE);
    });

    it('未入力スロットだけを埋め、確定済みスロットは残す', () => {
        const { aihints, changed } = applyVisionResultsToAihints(makeAihints({
            primary: '#E85A3C',
            secondary: null,
            accent: 'TODO: #RRGGBB (accent color)',
        }), {
            num: 1,
            palette: { primary: '#000000', secondary: '#F08080', accent: '#FBF3E4' },
        });
        expect(changed).toBe(true);
        expect(aihints.common.palette_priority).toEqual(FILLED_PALETTE);
    });

    it('VisionResult に palette が無ければ palette を変更しない', () => {
        const { aihints } = applyVisionResultsToAihints(makeAihints(null), { num: 1 });
        expect(aihints.common.palette_priority).toBeNull();
    });

    it('入力の AIHints を破壊しない（deep copy して返す）', () => {
        const input = makeAihints(null);
        applyVisionResultsToAihints(input, { num: 1, palette: { ...FILLED_PALETTE } });
        expect(input.common.palette_priority).toBeNull();
    });
});

describe('clearAihintsTagsForNoSource — palette_priority の据え置き', () => {
    it('正源が無いレコードでも palette_priority を消さない', () => {
        const out = clearAihintsTagsForNoSource(makeAihints({ ...FILLED_PALETTE }));
        expect(out.common.palette_priority).toEqual(FILLED_PALETTE);
    });

    it('AI タグ系はこれまでどおりクリアする（本モードの本来の責務）', () => {
        const out = clearAihintsTagsForNoSource(makeAihints({ ...FILLED_PALETTE }));
        expect(out.common.identity_tags).toEqual([]);
        expect(out.common.silhouette_features).toEqual([]);
        expect(out.common.expression_tendency).toBeNull();
        // age_appearance / reference_images は従来どおり据え置き
        expect(out.common.age_appearance).toBe('early teenager');
        expect(out.common.reference_images).toEqual({ main: 'https://example.invalid/main.png' });
    });
});

describe('buildAihintsFromAppearanceDetail — palette_priority の据え置き', () => {
    /** AppearanceDetail を持つ最小レコード（髪の色記述のみ） */
    const record = {
        Num: 1,
        AppearanceDetail: [
            {
                Formation: null,
                BodyPart: ['#BodyPart_Hair'],
                Laterality: null,
                DesignElement: '#Element_Motif',
                Attrs: [
                    { AttrLabel: '#DesignAttr_Overview', value_JP: '赤橙色の髪', value_EN: 'red orange hair' },
                ],
                img_PNGName: null,
                Note_JP: null,
                Note_EN: null,
            },
        ],
        AIHints: makeAihints({ ...FILLED_PALETTE }),
    };

    it('再構築しても確定済みの palette_priority を潰さない（--force 以外での巻き戻り防止）', () => {
        const { aihints } = buildAihintsFromAppearanceDetail(
            JSON.parse(JSON.stringify(record)),
            {},
        );
        expect(aihints.common.palette_priority).toEqual(FILLED_PALETTE);
    });

    it('palette_priority が元から null なら null のまま（勝手に scaffold しない）', () => {
        const rec = JSON.parse(JSON.stringify(record));
        rec.AIHints.common.palette_priority = null;
        const { aihints } = buildAihintsFromAppearanceDetail(rec, {});
        expect(aihints.common.palette_priority).toBeNull();
    });
});
