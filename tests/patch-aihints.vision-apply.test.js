/**
 * tools/patch-aihints.mjs の `--apply-vision-results` 適用規則テスト
 *
 * @description
 *   `applyVisionResultsToAihints()` は Agent の画像解析結果を AIHints の視覚 TODO へ
 *   流し込む。同じ「TODO プレースホルダを解析結果へ差し替える」規則が 8 箇所に
 *   手書きされていたため 1 本のヘルパーへ寄せたが、その際に corefolder と humanoid の
 *   **意図的な差**（immutable_constraints / negative_keywords の扱い）を潰さないことを
 *   保証する必要がある。
 *
 *     - corefolder … `COREFOLDER_DEFAULT_*` という構造的デフォルトを持つため「末尾に追記」
 *     - humanoid   … TODO 1 行しか持たないため「TODO を置換」
 *
 *   `palette_priority` の適用規則は tests/patch-aihints.palette.test.js が担当する。
 *   本テストは silhouette_features / silhouette_notes / ai_tags / 上記 2 形態の差を固定する。
 */

import { describe, it, expect } from 'vitest';
import { applyVisionResultsToAihints } from '../tools/patch-aihints.mjs';

/** object 形式 silhouette_notes を持つ scaffold 直後の AIHints */
function makeAihints() {
    return {
        common: {
            silhouette_features: [
                'fox ears',
                'TODO: hair color and length',
                'TODO: eye color',
            ],
            immutable_traits: [
                'digital construct (NumberTales unit)',
                "TODO: number '57' marking placement (single fixed slot, e.g., back center)",
            ],
            palette_priority: null,
        },
        forms: {
            corefolder: {
                outfit_features: ['TODO: outfit items (hoodie, harness, marking, etc.)'],
                silhouette_notes: {
                    body_description: ['TODO: describe body silhouette'],
                    attached_items: ['TODO: describe attached items'],
                },
                immutable_constraints: ['do not render human ears'],
                negative_keywords: ['photorealistic'],
                ai_tags: ['corefolder form', '1girl', 'TODO: hair color and style', 'TODO: eye color', 'TODO: corefolder outfit key terms'],
                prompt_export: '',
            },
            humanoid: {
                outfit_features: ['TODO: humanoid outfit items'],
                silhouette_notes: {
                    body_description: ['TODO: describe body silhouette'],
                    attached_items: ['TODO: describe attached items'],
                },
                immutable_constraints: ['TODO: per-character immutable constraints for humanoid form of #57'],
                negative_keywords: ['TODO: per-character negative keywords for humanoid form of #57'],
                ai_tags: ['humanoid form', '1girl', 'TODO: hair color and style', 'TODO: eye color', 'TODO: humanoid outfit key terms'],
                prompt_export: '',
            },
        },
    };
}

/** Agent の解析結果（全スロットを埋める） */
const VR = {
    num: 57,
    silhouetteHair: 'long silver hair',
    silhouetteEye: 'amber eyes',
    numberMarkingPlacement: "number '57' on the back center of the hoodie",
    corefolderOutfit: ['oversized hoodie', 'safety harness'],
    corefolderBodyDescription: ['slim digital frame'],
    corefolderAttachedItems: ['shoulder tag'],
    corefolderImmutableExtras: ['nine tails'],
    corefolderNegativeKeywords: ['cat ears'],
    humanoidOutfit: ['casual jacket'],
    humanoidBodyDescription: ['human proportions'],
    humanoidAttachedItems: ['wrist band'],
    humanoidImmutableExtras: ['fox ears retained'],
    humanoidNegativeKeywords: ['corefolder hoodie'],
};

describe('applyVisionResultsToAihints — common の TODO 置換', () => {
    it('silhouette_features の hair / eye スロットだけを置換し、確定行は残す', () => {
        const { aihints, changed } = applyVisionResultsToAihints(makeAihints(), VR);
        expect(changed).toBe(true);
        expect(aihints.common.silhouette_features).toEqual([
            'fox ears',
            'long silver hair',
            'amber eyes',
        ]);
    });

    it('immutable_traits の marking placement TODO を 1 件だけ置換する', () => {
        const { aihints } = applyVisionResultsToAihints(makeAihints(), VR);
        expect(aihints.common.immutable_traits).toEqual([
            'digital construct (NumberTales unit)',
            "number '57' on the back center of the hoodie",
        ]);
    });

    it('入力オブジェクトを破壊しない（deep copy して返す）', () => {
        const input = makeAihints();
        applyVisionResultsToAihints(input, VR);
        expect(input.common.silhouette_features).toContain('TODO: hair color and length');
    });

    it('解析結果が空なら changed=false のまま TODO を残す', () => {
        const { aihints, changed } = applyVisionResultsToAihints(makeAihints(), { num: 57 });
        expect(changed).toBe(false);
        expect(aihints.forms.corefolder.outfit_features[0]).toMatch(/^TODO:/);
    });
});

describe('applyVisionResultsToAihints — forms 共通の TODO 置換', () => {
    it('outfit_features の TODO 1 行を配列要素へ展開する', () => {
        const { aihints } = applyVisionResultsToAihints(makeAihints(), VR);
        expect(aihints.forms.corefolder.outfit_features).toEqual(['oversized hoodie', 'safety harness']);
        expect(aihints.forms.humanoid.outfit_features).toEqual(['casual jacket']);
    });

    it('object 形式 silhouette_notes の body_description / attached_items を両方置換する', () => {
        const { aihints } = applyVisionResultsToAihints(makeAihints(), VR);
        expect(aihints.forms.corefolder.silhouette_notes).toEqual({
            body_description: ['slim digital frame'],
            attached_items: ['shoulder tag'],
        });
        expect(aihints.forms.humanoid.silhouette_notes).toEqual({
            body_description: ['human proportions'],
            attached_items: ['wrist band'],
        });
    });

    it('legacy な flat array 形式の silhouette_notes も置換できる', () => {
        const a = makeAihints();
        a.forms.corefolder.silhouette_notes = ['TODO: describe silhouette'];
        const { aihints } = applyVisionResultsToAihints(a, {
            num: 57,
            corefolderSilhouetteNotes: ['slim digital frame'],
        });
        expect(aihints.forms.corefolder.silhouette_notes).toEqual(['slim digital frame']);
    });

    it('body_description が無ければ corefolderSilhouetteNotes へフォールバックする', () => {
        const { aihints } = applyVisionResultsToAihints(makeAihints(), {
            num: 57,
            corefolderSilhouetteNotes: ['fallback body'],
        });
        expect(aihints.forms.corefolder.silhouette_notes.body_description).toEqual(['fallback body']);
    });

    it('ai_tags の hair / eye / outfit スロットを置換し prompt_export を再生成する', () => {
        const { aihints } = applyVisionResultsToAihints(makeAihints(), VR);
        const cf = aihints.forms.corefolder;
        expect(cf.ai_tags).toEqual([
            'corefolder form', '1girl', 'long silver hair', 'amber eyes', 'oversized hoodie', 'safety harness',
        ]);
        // prompt_export は TODO を除いた確定タグだけを結合する
        expect(cf.prompt_export).toBe('corefolder form, 1girl, long silver hair, amber eyes, oversized hoodie, safety harness');
    });

    it('置換されなかった TODO は prompt_export へ載せない', () => {
        const { aihints } = applyVisionResultsToAihints(makeAihints(), {
            num: 57,
            silhouetteHair: 'long silver hair',
        });
        expect(aihints.forms.corefolder.prompt_export).toBe('corefolder form, 1girl, long silver hair');
    });
});

describe('applyVisionResultsToAihints — corefolder と humanoid の意図的な差', () => {
    it('corefolder の immutable_constraints は既存を残して末尾へ追記する', () => {
        const { aihints } = applyVisionResultsToAihints(makeAihints(), VR);
        expect(aihints.forms.corefolder.immutable_constraints).toEqual([
            'do not render human ears',
            'nine tails',
        ]);
    });

    it('corefolder の追記は重複を作らない', () => {
        const a = makeAihints();
        a.forms.corefolder.immutable_constraints = ['nine tails'];
        const { aihints, changed } = applyVisionResultsToAihints(a, {
            num: 57,
            corefolderImmutableExtras: ['nine tails'],
        });
        expect(aihints.forms.corefolder.immutable_constraints).toEqual(['nine tails']);
        expect(changed).toBe(false);
    });

    it('corefolder の negative_keywords も既存を残して末尾へ追記する', () => {
        const { aihints } = applyVisionResultsToAihints(makeAihints(), VR);
        expect(aihints.forms.corefolder.negative_keywords).toEqual(['photorealistic', 'cat ears']);
    });

    it('humanoid の immutable_constraints / negative_keywords は TODO を置換する（追記ではない）', () => {
        const { aihints } = applyVisionResultsToAihints(makeAihints(), VR);
        expect(aihints.forms.humanoid.immutable_constraints).toEqual(['fox ears retained']);
        expect(aihints.forms.humanoid.negative_keywords).toEqual(['corefolder hoodie']);
    });
});
