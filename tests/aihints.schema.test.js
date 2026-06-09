/**
 * AIHints スキーマ拡張テスト（corefolder enhancements / 2026-06-08 追加分）
 *
 * @description
 *   - `Works_NumberTales/DataBases/db_type.json` の `$Def_AIFormVariant` に
 *     `silhouette_notes` / `immutable_constraints` / `negative_keywords` が
 *     追加されていること
 *   - `$Def_AIHints` トップレベルに `work_common` と `alt_modes` が追加されて
 *     いること（順序は common → work_common → forms → alt_modes）
 *   - `--upgrade-schema` 適用後、各 AIHints レコードの corefolder form に
 *     上記 3 フィールドが必ず存在すること（structural defaults もしくは TODO）
 *   - 既存の Num/Name/forms 等の主要構造を破壊していないこと
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = dirname(__dirname);

/**
 * リポジトリルート相対パスから JSON を読み込んで返す。
 * @param {string} relPath
 * @returns {any}
 */
function loadJson(relPath) {
    const txt = readFileSync(join(repoRoot, relPath), 'utf-8');
    return JSON.parse(txt);
}

describe('AIHints schema: corefolder enhancements (NumberTales)', () => {
    const typeDef = loadJson('data/Works_NumberTales/DataBases/db_type.json');

    /**
     * $VersDef.<defName>.$DefType の hashTag 一覧を取得。
     * @param {string} defName
     * @returns {string[]}
     */
    function defKeys(defName) {
        const arr = typeDef?.$VersDef?.[defName]?.$DefType;
        if (!Array.isArray(arr)) return [];
        return arr.map(entry => entry?.hashTag).filter(k => typeof k === 'string');
    }

    it('$Def_AIFormVariant に silhouette_notes / immutable_constraints / negative_keywords が追加されている', () => {
        const variant = typeDef?.$VersDef?.$Def_AIFormVariant;
        expect(variant, '$Def_AIFormVariant が存在する').toBeDefined();
        const keys = defKeys('$Def_AIFormVariant');
        for (const field of ['silhouette_notes', 'immutable_constraints', 'negative_keywords']) {
            expect(keys, `${field} が宣言されている`).toContain(field);
        }
    });

    it('$Def_AIFormVariant の outfit_features → silhouette_notes → immutable_constraints → negative_keywords → ai_tags の順で並んでいる', () => {
        const keys = defKeys('$Def_AIFormVariant');
        const idxOutfit = keys.indexOf('outfit_features');
        const idxSilNotes = keys.indexOf('silhouette_notes');
        const idxImmut = keys.indexOf('immutable_constraints');
        const idxNeg = keys.indexOf('negative_keywords');
        const idxAiTags = keys.indexOf('ai_tags');
        expect(idxOutfit, 'outfit_features 存在').toBeGreaterThanOrEqual(0);
        expect(idxSilNotes - idxOutfit, 'silhouette_notes は outfit_features の直後').toBe(1);
        expect(idxImmut - idxSilNotes, 'immutable_constraints は silhouette_notes の直後').toBe(1);
        expect(idxNeg - idxImmut, 'negative_keywords は immutable_constraints の直後').toBe(1);
        expect(idxAiTags - idxNeg, 'ai_tags は negative_keywords の直後').toBe(1);
    });

    it('$Def_AIHints に work_common と alt_modes が追加されている（順序: common → work_common → forms → alt_modes）', () => {
        const aih = typeDef?.$VersDef?.$Def_AIHints;
        expect(aih, '$Def_AIHints が存在する').toBeDefined();
        const keys = defKeys('$Def_AIHints');
        expect(keys, 'work_common が宣言されている').toContain('work_common');
        expect(keys, 'alt_modes が宣言されている').toContain('alt_modes');
        const idxCommon = keys.indexOf('common');
        const idxWorkCommon = keys.indexOf('work_common');
        const idxForms = keys.indexOf('forms');
        const idxAltModes = keys.indexOf('alt_modes');
        expect(idxCommon).toBeGreaterThanOrEqual(0);
        expect(idxWorkCommon - idxCommon, 'work_common は common の直後').toBe(1);
        expect(idxForms - idxWorkCommon, 'forms は work_common の直後').toBe(1);
        expect(idxAltModes - idxForms, 'alt_modes は forms の直後').toBe(1);
    });

    it('補助型 $Def_AIHintsWorkCommon / $Def_AIAltModes / $Def_AIAltCorefolderDressed が宣言されている', () => {
        const versDef = typeDef?.$VersDef ?? {};
        expect(versDef.$Def_AIHintsWorkCommon, '$Def_AIHintsWorkCommon').toBeDefined();
        expect(versDef.$Def_AIHintsWorkCommonReferenceImages, '$Def_AIHintsWorkCommonReferenceImages').toBeDefined();
        expect(versDef.$Def_AIAltModes, '$Def_AIAltModes').toBeDefined();
        expect(versDef.$Def_AIAltCorefolderDressed, '$Def_AIAltCorefolderDressed').toBeDefined();
    });
});

describe('AIHints data: upgraded NumberTales/DB_Primary records', () => {
    const dbPath = 'data/Works_NumberTales/DataBases/db_Primary.json';
    const records = loadJson(dbPath);

    it('AIHints を持つ全レコードに work_common と alt_modes トップレベルが存在する', () => {
        const aihRecords = records.filter(r => r && r.AIHints);
        expect(aihRecords.length, 'AIHints を持つレコードが 1 件以上').toBeGreaterThan(0);

        for (const rec of aihRecords) {
            expect(
                Object.prototype.hasOwnProperty.call(rec.AIHints, 'work_common'),
                `#${rec.Num} に work_common 必須`,
            ).toBe(true);
            expect(
                Object.prototype.hasOwnProperty.call(rec.AIHints, 'alt_modes'),
                `#${rec.Num} に alt_modes 必須`,
            ).toBe(true);
        }
    });

    it('AIHints を持つ全レコードの corefolder form に silhouette_notes (object) / immutable_constraints / negative_keywords が存在する', () => {
        const aihRecords = records.filter(r => r && r.AIHints?.forms?.corefolder);
        expect(aihRecords.length).toBeGreaterThan(0);

        for (const rec of aihRecords) {
            const cf = rec.AIHints.forms.corefolder;
            // 2026-06-09 以降: silhouette_notes は { body_description, attached_items } object 形式
            expect(
                cf.silhouette_notes && typeof cf.silhouette_notes === 'object' && !Array.isArray(cf.silhouette_notes),
                `#${rec.Num} corefolder.silhouette_notes は object 形式`,
            ).toBe(true);
            expect(
                Array.isArray(cf.silhouette_notes.body_description),
                `#${rec.Num} corefolder.silhouette_notes.body_description は配列`,
            ).toBe(true);
            expect(
                Array.isArray(cf.silhouette_notes.attached_items),
                `#${rec.Num} corefolder.silhouette_notes.attached_items は配列`,
            ).toBe(true);
            // body_description はスフィア本体記述のため必ず 1 件以上ある
            expect(
                cf.silhouette_notes.body_description.length,
                `#${rec.Num} corefolder.silhouette_notes.body_description は空でない`,
            ).toBeGreaterThan(0);

            for (const field of ['immutable_constraints', 'negative_keywords']) {
                expect(
                    Array.isArray(cf[field]),
                    `#${rec.Num} corefolder.${field} は配列`,
                ).toBe(true);
                expect(
                    cf[field].length,
                    `#${rec.Num} corefolder.${field} は空でない`,
                ).toBeGreaterThan(0);
            }
        }
    });

    it('AIHints を持つ全レコードの humanoid form にも silhouette_notes (object) / immutable_constraints / negative_keywords が存在する', () => {
        const aihRecords = records.filter(r => r && r.AIHints?.forms?.humanoid);
        expect(aihRecords.length).toBeGreaterThan(0);

        for (const rec of aihRecords) {
            const hu = rec.AIHints.forms.humanoid;
            expect(
                hu.silhouette_notes && typeof hu.silhouette_notes === 'object' && !Array.isArray(hu.silhouette_notes),
                `#${rec.Num} humanoid.silhouette_notes は object 形式`,
            ).toBe(true);
            expect(
                Array.isArray(hu.silhouette_notes.body_description),
                `#${rec.Num} humanoid.silhouette_notes.body_description は配列`,
            ).toBe(true);
            expect(
                Array.isArray(hu.silhouette_notes.attached_items),
                `#${rec.Num} humanoid.silhouette_notes.attached_items は配列`,
            ).toBe(true);

            for (const field of ['immutable_constraints', 'negative_keywords']) {
                // IdentityMotif 駆動再構築では humanoid は structural default が無く null になり得る。
                // schema 上も `#String[]|#Null` のため、array または null を許容する。
                const val = hu[field];
                expect(
                    val === null || Array.isArray(val),
                    `#${rec.Num} humanoid.${field} は array または null`,
                ).toBe(true);
                if (Array.isArray(val)) {
                    expect(
                        val.length,
                        `#${rec.Num} humanoid.${field} は空でない（array の場合）`,
                    ).toBeGreaterThan(0);
                }
            }
        }
    });

    it('corefolder.immutable_constraints に「腕/脚を描かない」「humanoid 私服にしない」相当の structural default が含まれる', () => {
        const aihRecords = records.filter(r => r && r.AIHints?.forms?.corefolder?.immutable_constraints);
        for (const rec of aihRecords) {
            const constraints = rec.AIHints.forms.corefolder.immutable_constraints;
            const joined = constraints.join(' | ').toLowerCase();
            expect(joined, `#${rec.Num} structural default を含む`).toMatch(/arm|hand/);
            expect(joined, `#${rec.Num} structural default を含む`).toMatch(/leg|feet|foot/);
            expect(joined, `#${rec.Num} structural default を含む`).toMatch(/humanoid/);
        }
    });

    it('corefolder.negative_keywords に脚・靴・腕・humanoid 衣装系の語が含まれる', () => {
        const aihRecords = records.filter(r => r && r.AIHints?.forms?.corefolder?.negative_keywords);
        for (const rec of aihRecords) {
            const negs = rec.AIHints.forms.corefolder.negative_keywords.map(s => String(s).toLowerCase());
            // 最低限の代表語が入っていることをサンプルチェック
            expect(negs, `#${rec.Num} negative_keywords に 'legs' を含む`).toContain('legs');
            expect(negs, `#${rec.Num} negative_keywords に 'arms' を含む`).toContain('arms');
        }
    });

    it('既存の Num / Name / forms 構造を破壊していない', () => {
        const aihRecords = records.filter(r => r && r.AIHints);
        for (const rec of aihRecords) {
            expect(rec.Num, 'Num 残存').toBeDefined();
            expect(rec.AIHints.common, 'common 残存').toBeDefined();
            expect(rec.AIHints.forms, 'forms 残存').toBeDefined();
            // forms.corefolder の主要既存フィールドが残っているか
            const cf = rec.AIHints.forms.corefolder;
            if (cf) {
                expect(Array.isArray(cf.ai_tags), `#${rec.Num} corefolder.ai_tags 残存`).toBe(true);
                expect(Array.isArray(cf.form_tags), `#${rec.Num} corefolder.form_tags 残存`).toBe(true);
            }
        }
    });

    it('corefolder.natural_language_description は球体本体テンプレートに準拠し humanoid 衣装語を含まない', () => {
        const aihRecords = records.filter(r => r && r.AIHints?.forms?.corefolder);
        const garmentRe = /\b(hoodie|blazer|coat|jacket|dress|bodysuit|pants|shorts|skirt|trousers|shoes|boots|socks|sneakers|loafers|stockings|leggings)\b/i;
        for (const rec of aihRecords) {
            const cf = rec.AIHints.forms.corefolder;
            const nld = cf.natural_language_description;
            if (typeof nld !== 'string' || !nld.trim()) continue;
            // テンプレ準拠（"Corefolder form: a spherical cushion-like body in ..."）
            // または明示的な "no number identifier ..." 系も許容
            expect(
                /^Corefolder form:\s*a spherical cushion-like body in\b/i.test(nld),
                `#${rec.Num} corefolder NLD は球体本体テンプレート形`,
            ).toBe(true);
            // humanoid 衣装語が混入していない
            expect(
                garmentRe.test(nld),
                `#${rec.Num} corefolder NLD に humanoid 衣装語を含まない`,
            ).toBe(false);
        }
    });
});
