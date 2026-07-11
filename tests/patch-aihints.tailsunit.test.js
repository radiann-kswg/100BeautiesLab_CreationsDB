/**
 * tools/patch-aihints.mjs の TailsUnit / 耳形状（EarShapeType）解析ロジックのテスト
 *
 * @description
 *   `TailsUnit` が旧来の自由記述文字列（`TailsUnit_JP`/`TailsUnit_EN`）から
 *   構造化型 `$Def_TailsUnit[]`（`TailShapeType`/`Count`/`Segment`/`Branches`/`LayoutDirection`）
 *   へ移行したことに追従する `parseTailsUnit(tailsUnit, varsDef)` / `buildTailDescription(tu)` /
 *   `buildTailBundleDescription(tu)` の変換結果を検証する。
 *   実データ（`db_Primary.json` Num:1 / `db_SelfSecondary.json` Num:148）を模した
 *   最小フィクスチャを使い、ディスク読み込みには依存しない。
 *
 *   あわせて、耳の形状（`AppearanceDetail[].DesignElement:"#Element_Ear"` の
 *   `vdict_EarShapeType`、develop ブランチで `TailShapeType` とは独立した軸として
 *   work-local 化・改名済み）を実データから読み取る `resolveEarShapeLabel(record, varsDef)`
 *   も検証する。尻尾形状からの推測（旧 `isEarBearingAnimalWord` allow-list）は行わない。
 */

import { describe, it, expect } from 'vitest';
import { parseTailsUnit, buildTailDescription, buildTailBundleDescription, resolveEarShapeLabel } from '../tools/patch-aihints.mjs';

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
    $EnumDef_EarShapeType: {
        '#EarShapeType_Fox': { EarShapeType: 'Fox', EarShapeType_JP: '狐の耳', EarShapeType_EN: 'Fox' },
        '#EarShapeType_Cat': { EarShapeType: 'Cat', EarShapeType_JP: '猫の耳', EarShapeType_EN: 'Cat' },
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

    it('buildTailDescription の出力は「N tails」形式の tail-count 検出パターンと整合する', () => {
        const tailsUnit = [{ TailShapeType: '#TailShapeType_FoxBranched', Count: 8, Branches: [{ Laterality: '#Lat_Upper', TailCount: 1, ClusterCount: 3 }, { Laterality: '#Lat_Lower', TailCount: 4, ClusterCount: 1 }] }];
        const tu = parseTailsUnit(tailsUnit, varsDef);
        const desc = buildTailDescription(tu);
        // buildTailDescription の出力フォーマット（"N tails" 等）が将来変わらないことのガード。
        // 尻尾本数を構造的正源として扱う際に、AI タグ側の同種文言と重複検出できる形式であることを保証する。
        const tailCountRe = /\b(?:single|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+\S*\s*tails?\b/i;
        expect(tailCountRe.test(desc)).toBe(true);
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

describe('resolveEarShapeLabel', () => {
    it('#Element_Ear エントリの vdict_EarShapeType を解決する（db_Primary.json Num:1 相当、狐耳）', () => {
        const record = {
            AppearanceDetail: [
                {
                    Formation: null,
                    BodyPart: ['#BodyPart_Ear'],
                    Laterality: '#Lat_Left',
                    DesignElement: '#Element_Ear',
                    Attrs: [{ AttrLabel: '#DesignAttr_Ear', vdict_EarShapeType: '#EarShapeType_Fox', about_JP: '左耳が垂れている', about_EN: 'left ear droops' }],
                },
            ],
        };
        expect(resolveEarShapeLabel(record, varsDef)).toBe('Fox');
    });

    it('猫耳（db_Primary.json Num:11 相当、Nekomata 尻尾だが耳は独立して Cat）を解決する', () => {
        const record = {
            AppearanceDetail: [
                { Formation: null, BodyPart: ['#BodyPart_Ear'], Laterality: '#Lat_Both', DesignElement: '#Element_Ear',
                  Attrs: [{ AttrLabel: '#DesignAttr_Ear', vdict_EarShapeType: '#EarShapeType_Cat', about_JP: 'フードに隠れている', about_EN: 'hidden under the hood' }] },
            ],
        };
        expect(resolveEarShapeLabel(record, varsDef)).toBe('Cat');
    });

    it('#Element_Ear エントリが無ければ null を返す（尻尾形状からの推測はしない）', () => {
        const record = { AppearanceDetail: [{ DesignElement: '#Element_CostumeItem', Attrs: [] }] };
        expect(resolveEarShapeLabel(record, varsDef)).toBeNull();
        expect(resolveEarShapeLabel({ AppearanceDetail: [] }, varsDef)).toBeNull();
        expect(resolveEarShapeLabel({}, varsDef)).toBeNull();
        expect(resolveEarShapeLabel(null, varsDef)).toBeNull();
    });

    it('複数 #Element_Ear エントリがある場合は先頭の解決成功分を採用する（Num:55 相当、左右耳）', () => {
        const record = {
            AppearanceDetail: [
                { DesignElement: '#Element_Ear', Laterality: '#Lat_Left', Attrs: [{ AttrLabel: '#DesignAttr_Ear', vdict_EarShapeType: '#EarShapeType_Fox', about_JP: '先が濃い緑色' }] },
                { DesignElement: '#Element_Ear', Laterality: '#Lat_Right', Attrs: [{ AttrLabel: '#DesignAttr_Ear', vdict_EarShapeType: '#EarShapeType_Fox' }] },
            ],
        };
        expect(resolveEarShapeLabel(record, varsDef)).toBe('Fox');
    });
});
