/**
 * tools/patch-aihints.mjs の `_Secondaries` 定義解決 / `_Commons` 継承のテスト
 *
 * @description
 *   `findSecondaryDef(rec, secDefs)` は「このレコードにどの `_Secondaries` 定義が当たるか」を
 *   1 回だけ解決し、そこから `AI_Optout`（カテゴリ別 opt-out）と `_Commons`（継承）の
 *   両方を取り出すための関数。`lib/sw-common.js` の CommonsProcessor（正）/
 *   `pkg/nodejs/index.mjs:335` findSecondaryCommons() の移植版で、
 *   `_Commons` ではなく定義そのものを返す点だけが異なる。
 *
 *   ★ 回帰固定の主眼:
 *     旧実装は opt-out を `sec_SeriesTitle` のみをキーにした Map で持っていたため、
 *     `sec_SeriesTitle: null` の定義が複数ある DB（`#DB_SelfSecondary` は
 *     「リクエストナンバー(AI_Optout:false)」と catch-all(AI_Optout:true) の 2 つが null）で、
 *     opt-in の定義まで既定 opt-out に巻き込んで弾いていた（実測で 96/106 件が誤スキップ）。
 *
 *   フィクスチャは実データ（`data/Works_NumberTales/DataBases/db_meta.json` の
 *   `#DB_SelfSecondary._Secondaries`）の形を模した最小構成で、ディスク読み込みには依存しない。
 */

import { describe, it, expect } from 'vitest';
import { findSecondaryDef, applyCommonsToRecord } from '../tools/patch-aihints.mjs';

/**
 * 実データ `#DB_SelfSecondary._Secondaries` を模した 3 定義。
 * 2 つが `sec_SeriesTitle: null` である点が本テストの要。
 */
const SELF_SECONDARY_DEFS = [
    {
        sec_Category: 'リクエストナンバー',
        sec_DesignedBy: ['RadianN'],
        sec_SeriesTitle: null,
        _Commons: { Progress: 'nowCreating', GenderType: 'Neutral', isTriple: true },
        AI_Optout: false,
    },
    {
        sec_Category: null,
        sec_DesignedBy: ['RadianN'],
        sec_SeriesTitle: '量産型マスタートリプル',
        _Commons: { Progress: 'nowCreating', GenderType: 'Neutral', isTriple: false },
        AI_Optout: false,
    },
    {
        sec_Category: null,
        sec_DesignedBy: null,
        sec_SeriesTitle: null,
        _Commons: { Progress: 'notProceeded', GenderType: 'Neutral', isTriple: true },
        AI_Optout: false, // 2026-07-17: 権利軸へ純化し true → false（未着手除外は Progress/画像ゲートが担う）
    },
];

describe('findSecondaryDef: _Secondaries 定義の解決', () => {
    it('sec_SeriesTitle 一致でシリーズ定義を選ぶ', () => {
        const rec = { Num: '223-mp', sec_SeriesTitle: '量産型マスタートリプル', sec_DesignedBy: ['RadianN'] };
        const def = findSecondaryDef(rec, SELF_SECONDARY_DEFS);
        expect(def).toBe(SELF_SECONDARY_DEFS[1]);
    });

    it('sec_Category 一致で「リクエストナンバー」定義を選ぶ（sec_SeriesTitle が null でも catch-all に巻き込まれない）', () => {
        // ★ BUG 1 回帰固定: 旧実装はここで catch-all の既定 opt-out に巻き込んでいた
        const rec = { Num: '753', sec_Category: 'リクエストナンバー', sec_DesignedBy: ['RadianN'] };
        const def = findSecondaryDef(rec, SELF_SECONDARY_DEFS);
        expect(def).toBe(SELF_SECONDARY_DEFS[0]);
    });

    it('sec_DesignedBy しか持たない曖昧レコード（実データ Num:223 相当）は catch-all へ落ちる', () => {
        // sec_Category / sec_SeriesTitle いずれも持たないため、
        // 「リクエストナンバー」定義（sec_Category が必須一致に昇格）にも
        // 「量産型マスタートリプル」定義（sec_SeriesTitle が必須一致）にも当たらない。
        // 分類しきれないものは最も保守的な既定へ落ちるのが期待挙動。
        const rec = { Num: 223, sec_Category: null, sec_DesignedBy: ['RadianN'] };
        const def = findSecondaryDef(rec, SELF_SECONDARY_DEFS);
        expect(def).toBe(SELF_SECONDARY_DEFS[2]);
    });

    it('条件を何も持たないレコードは catch-all へ落ちる', () => {
        const def = findSecondaryDef({ Num: 365 }, SELF_SECONDARY_DEFS);
        expect(def).toBe(SELF_SECONDARY_DEFS[2]);
    });

    it('sec_SeriesTitle を持たない定義では、他の sec_** はすべて必須一致に昇格する', () => {
        // 定義 0 は sec_Category と sec_DesignedBy の両方を条件に持つ。
        // 主キー（sec_SeriesTitle）が無いため、どちらか一方でもレコード側に欠けると当たらない。
        const withBoth = { sec_Category: 'リクエストナンバー', sec_DesignedBy: ['RadianN'] };
        const missingDesignedBy = { sec_Category: 'リクエストナンバー' };
        expect(findSecondaryDef(withBoth, SELF_SECONDARY_DEFS)).toBe(SELF_SECONDARY_DEFS[0]);
        expect(findSecondaryDef(missingDesignedBy, SELF_SECONDARY_DEFS)).toBe(SELF_SECONDARY_DEFS[2]);
    });

    it('選ばれた定義から AI_Optout を読める（catch-all が opt-out の場合）', () => {
        const defs = [
            SELF_SECONDARY_DEFS[0],
            { sec_Category: null, sec_DesignedBy: null, sec_SeriesTitle: null, _Commons: { Progress: 'notProceeded' }, AI_Optout: true },
        ];
        // opt-in カテゴリのレコードは opt-out に巻き込まれない（★ BUG 1 の本質）
        expect(findSecondaryDef({ sec_Category: 'リクエストナンバー', sec_DesignedBy: ['RadianN'] }, defs)?.AI_Optout).toBe(false);
        // catch-all のレコードは opt-out
        expect(findSecondaryDef({ Num: 1 }, defs)?.AI_Optout).toBe(true);
    });

    it('_Secondaries が欠損・空・非配列でも例外を投げず null を返す（SemiPrimary 相当）', () => {
        expect(findSecondaryDef({ Num: 1 }, null)).toBeNull();
        expect(findSecondaryDef({ Num: 1 }, undefined)).toBeNull();
        expect(findSecondaryDef({ Num: 1 }, [])).toBeNull();
        expect(findSecondaryDef({ Num: 1 }, 'not-an-array')).toBeNull();
    });

    it('_Commons を持たない定義は候補から除外する', () => {
        const defs = [{ sec_SeriesTitle: '量産型マスタートリプル', AI_Optout: true }];
        expect(findSecondaryDef({ sec_SeriesTitle: '量産型マスタートリプル' }, defs)).toBeNull();
    });
});

describe('applyCommonsToRecord: _Commons 継承', () => {
    it('空値のフィールドを _Secondaries._Commons で埋める', () => {
        const rec = { Num: 365, GenderType: null };
        const out = applyCommonsToRecord(rec, null, SELF_SECONDARY_DEFS[2]._Commons);
        expect(out.GenderType).toBe('Neutral');
    });

    it('既存の非空値は上書きしない', () => {
        const rec = { Num: 1, GenderType: 'FemaleNeutral', Progress: 'released' };
        const out = applyCommonsToRecord(rec, null, SELF_SECONDARY_DEFS[2]._Commons);
        expect(out.GenderType).toBe('FemaleNeutral');
        expect(out.Progress).toBe('released');
    });

    it('hideText は意図的マスクなので空扱いせず上書きしない', () => {
        const rec = { Num: 1, GenderType: { hideText: '???' } };
        const out = applyCommonsToRecord(rec, null, SELF_SECONDARY_DEFS[2]._Commons);
        expect(out.GenderType).toEqual({ hideText: '???' });
    });

    it('DB レベル _Commons よりカテゴリ別 _Commons を優先する', () => {
        const rec = { Num: 1 };
        const out = applyCommonsToRecord(rec, { isTriple: false }, { isTriple: true });
        expect(out.isTriple).toBe(true);
    });

    it('元レコードを破壊しない（非破壊）', () => {
        const rec = { Num: 365, GenderType: null };
        const out = applyCommonsToRecord(rec, null, SELF_SECONDARY_DEFS[2]._Commons);
        expect(rec.GenderType).toBeNull();
        expect(out).not.toBe(rec);
    });

    it('_Commons が両方とも無い場合はレコードをそのまま返す', () => {
        const rec = { Num: 1 };
        expect(applyCommonsToRecord(rec, null, null)).toBe(rec);
    });

    it('`_` / `#` 始まりのキーは継承しない', () => {
        const rec = { Num: 1 };
        const out = applyCommonsToRecord(rec, { _Internal: 'x', '#Hash': 'y', Normal: 'z' }, null);
        expect(out._Internal).toBeUndefined();
        expect(out['#Hash']).toBeUndefined();
        expect(out.Normal).toBe('z');
    });
});
