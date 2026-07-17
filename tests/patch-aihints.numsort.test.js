/**
 * tools/patch-aihints.mjs の Num 比較子（compareNums）のテスト
 *
 * @description
 *   Num は number / string が混在しうる。
 *     - Primary       : 0, 1, … / "0", "00", "000", "2-alt", "10-alt", "67-old"
 *     - SemiPrimary   : 111, 222, … / "3x11", "%", "∞", "222-alt", "777.Jackpot"
 *     - SelfSecondary : 148, 223, … / "101-mp", "777.Jackpot-mp"
 *   旧実装の `(a, b) => a.num - b.num` は string を含むと NaN を返し、ソートが成立しない
 *   （比較結果が常に偽となり、実質ファイル順のまま出力されていた）。
 *
 *   ★ number 同士では `a - b` と符号が一致することを固定する。
 *     これが「既存 DB の出力順を壊さない」ことの根拠になる。
 */

import { describe, it, expect } from 'vitest';
import { compareNums } from '../tools/patch-aihints.mjs';

describe('compareNums', () => {
    it('number 同士では従来の (a - b) と同じ順序になる', () => {
        const nums = [57, 2, 10, 1, 99, 0];
        expect([...nums].sort(compareNums)).toEqual([...nums].sort((a, b) => a - b));
    });

    it('数値文字列は数値として扱う（"000" / "0" 等）', () => {
        expect(compareNums('2', '10')).toBeLessThan(0);
        expect(compareNums(2, '10')).toBeLessThan(0);
        expect(compareNums('10', 2)).toBeGreaterThan(0);
    });

    it('数値と非数値では数値を先に置く', () => {
        expect(compareNums(57, '101-mp')).toBeLessThan(0);
        expect(compareNums('101-mp', 57)).toBeGreaterThan(0);
    });

    it('非数値同士は文字列順で安定する', () => {
        expect(compareNums('101-mp', '223-jw')).toBeLessThan(0);
        expect(compareNums('∞', '∞')).toBe(0);
    });

    it('混在配列をソートしても NaN 比較にならず、全要素が保持される', () => {
        const mixed = ['101-mp', 57, '777.Jackpot-mp', '%', 2, '∞', '3x11', '67-old'];
        const sorted = [...mixed].sort(compareNums);
        expect(sorted).toHaveLength(mixed.length);
        expect(new Set(sorted)).toEqual(new Set(mixed));
        // 数値が先頭へ寄る
        expect(sorted.slice(0, 2)).toEqual([2, 57]);
    });

    it('ソートが決定的（入力順が違っても同じ結果）', () => {
        const a = ['∞', 2, '101-mp', 57, '%'];
        const b = ['%', 57, 2, '∞', '101-mp'];
        expect([...a].sort(compareNums)).toEqual([...b].sort(compareNums));
    });
});
