/**
 * tools/patch-aihints.mjs の TailsUnit 解析ロジックのテスト
 *
 * @description
 *   `TailsUnit` が旧来の自由記述文字列（`TailsUnit_JP`/`TailsUnit_EN`）から
 *   構造化型 `$Def_TailsUnit[]`（`TailShapeType`/`Count`/`Segment`/`Branches`/`LayoutDirection`）
 *   へ移行したことに追従する `parseTailsUnit(tailsUnit, varsDef)` / `buildTailDescription(tu)` /
 *   `buildTailBundleDescription(tu)` の変換結果を検証する。
 *   実データ（`db_Primary.json` Num:1 / `db_SelfSecondary.json` Num:148）を模した
 *   最小フィクスチャを使い、ディスク読み込みには依存しない。
 */

import { describe, it, expect } from 'vitest';
import { parseTailsUnit, buildTailDescription, buildTailBundleDescription } from '../tools/patch-aihints.mjs';

/** テスト用の最小 $VarsDef フィクスチャ（実データの部分集合） */
const varsDef = {
    $EnumDef_TailShapeType: {
        '#TailShapeType_Fox': { TailShapeType: '#TailShapeType_Fox', TailShapeType_JP: 'キツネ型', TailShapeType_EN: 'Fox-type' },
        '#TailShapeType_FoxBranched': { TailShapeType: '#TailShapeType_FoxBranched', TailShapeType_JP: 'キツネ(枝分かれ)型', TailShapeType_EN: 'Fox (branched)' },
    },
    $EnumDef_Laterality: {
        '#Lat_Upper': { Laterality: '#Lat_Upper', Laterality_JP: '上', Laterality_EN: 'Upper' },
        '#Lat_Lower': { Laterality: '#Lat_Lower', Laterality_JP: '下', Laterality_EN: 'Lower' },
    },
};

describe('parseTailsUnit / buildTailDescription / buildTailBundleDescription', () => {
    it('simple non-branching entry (db_Primary.json Num:1 相当): Branches/LayoutDirection 無し', () => {
        const tailsUnit = [{ TailShapeType: '#TailShapeType_Fox', Count: 1, Segment: null, Branches: null, LayoutDirection: null, Note_JP: null, Note_EN: null }];
        const tu = parseTailsUnit(tailsUnit, varsDef);

        expect(tu).not.toBeNull();
        expect(tu.shapeLabel).toBe('Fox-type');
        expect(tu.count).toBe(1);
        expect(tu.branches).toBeNull();
        expect(tu.direction).toBeNull();
        expect(tu.branching).toBe(false);

        const desc = buildTailDescription(tu);
        expect(desc).not.toMatch(/^TODO:/);
        expect(desc).toContain('single tail');

        expect(buildTailBundleDescription(tu)).toBe('exactly 1 tail total, no more no less');
    });

    it('branching entry with LayoutDirection (db_SelfSecondary.json Num:148 相当): 3 Branches + 方向', () => {
        const tailsUnit = [{
            TailShapeType: '#TailShapeType_FoxBranched',
            Count: 8,
            Segment: null,
            Branches: [
                { Laterality: '#Lat_Upper', TailCount: 1, ClusterCount: 3 },
                { Laterality: null, TailCount: 3, ClusterCount: 2 },
                { Laterality: '#Lat_Lower', TailCount: 4, ClusterCount: 1 },
            ],
            LayoutDirection: { LayoutFrom: '#Lat_Upper', LayoutTo: '#Lat_Lower' },
            Note_JP: null,
            Note_EN: null,
        }];
        const tu = parseTailsUnit(tailsUnit, varsDef);

        expect(tu.shapeLabel).toBe('Fox (branched)');
        expect(tu.count).toBe(8);
        expect(tu.branching).toBe(true);
        expect(tu.branches).toHaveLength(3);
        expect(tu.branches[0].lateralityLabel).toBe('Upper');
        expect(tu.branches[1].lateralityLabel).toBeNull();
        expect(tu.direction.fromLabel).toBe('Upper');
        expect(tu.direction.toLabel).toBe('Lower');

        const desc = buildTailDescription(tu);
        expect(desc).not.toMatch(/^TODO:/);
        expect(desc).toContain('branching');
        expect(desc).toContain('8 tails');

        const bundle = buildTailBundleDescription(tu);
        expect(bundle).not.toContain('TODO');
        expect(bundle).toContain('8 tails total');
        expect(bundle).toContain('1 tails x3 clusters');
        expect(bundle).toContain('3 tails x2 clusters');
        expect(bundle).toContain('4 tails x1 clusters');
        expect(bundle).toContain('Upper');
        expect(bundle).toContain('Lower');
    });

    it('buildTailDescription の出力は buildAihintsFromIdentityMotif の isStructuralOverride 正規表現と整合する', () => {
        const tailsUnit = [{ TailShapeType: '#TailShapeType_FoxBranched', Count: 8, Branches: [{ Laterality: '#Lat_Upper', TailCount: 1, ClusterCount: 3 }, { Laterality: '#Lat_Lower', TailCount: 4, ClusterCount: 1 }] }];
        const tu = parseTailsUnit(tailsUnit, varsDef);
        const desc = buildTailDescription(tu);
        // tools/patch-aihints.mjs の isStructuralOverride が使う正規表現と同一（将来の破壊的変更に対するガード）
        const structuralOverrideRe = /\b(?:single|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+\S*\s*tails?\b/i;
        expect(structuralOverrideRe.test(desc)).toBe(true);
    });

    it('null / 旧フラット文字列 / 空配列は null を返す（旧形式防御）', () => {
        expect(parseTailsUnit(null, varsDef)).toBeNull();
        expect(parseTailsUnit(undefined, varsDef)).toBeNull();
        expect(parseTailsUnit('キツネ(枝分かれ)型4本', varsDef)).toBeNull();
        expect(parseTailsUnit([], varsDef)).toBeNull();
    });

    it('未知の TailShapeType キーは例外を投げず穏当に劣化する（raw 値へフォールバック）', () => {
        const tailsUnit = [{ TailShapeType: '#TailShapeType_UnknownXYZ', Count: 2 }];
        expect(() => parseTailsUnit(tailsUnit, varsDef)).not.toThrow();
        const tu = parseTailsUnit(tailsUnit, varsDef);
        expect(tu).not.toBeNull();
        expect(tu.shapeLabel).toBe('#TailShapeType_UnknownXYZ');
    });

    it('buildTailDescription(null) / buildTailBundleDescription(null) は TODO / null を返す', () => {
        expect(buildTailDescription(null)).toMatch(/^TODO:/);
        expect(buildTailBundleDescription(null)).toBeNull();
    });
});
