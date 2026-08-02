/**
 * tools/patch-colorpalette.mjs / カラーチップ検出のテスト
 *
 * @description
 *   ナンバーテールズの設定画（concept / catalog）には、作者が指定した配色が
 *   **カラーチップ**（べた塗りの丸）として描き込まれている。これを読み取って
 *   `ColorPalette` フィールドへ取り込む一連の処理を検証する。
 *
 *   - `detectSwatchChips()`: チップ検出。実際の設定画を読み、カタログ画像に
 *     **文字として印字された HEX コード**と一致することを回帰として固定する
 *     （Num 4 のカタログには `0x00b6d9` 等が併記されており、正解が判っている）。
 *   - `measurePaletteCoverage()`: 各色がキャラ画像をどれだけ占めるかの実測。
 *     Role（主従）はこの被覆率の降順で決まる。
 *   - `buildColorPaletteValue()`: 4 色目以降が `#ColorRole_Sub` になること、
 *     創作内容（色名 / Formation / Note）を埋めないこと。
 *   - `removeColorPaletteFromRecord()`: 配色を確定できなかったレコードから
 *     過去の推測値を取り除けること（正確な値と推測値の混在防止）。
 *
 * @see _work_in_progress/2026-07-13_progress_colorpalette-schema.md
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    decodePng,
    detectSwatchChips,
    measurePaletteCoverage,
    hexToRgb,
    scanTopLevelRecords,
} from '../tools/extract-palette.mjs';
import {
    buildColorPaletteValue,
    rankChipsByCoverage,
    removeColorPaletteFromRecord,
    upsertColorPaletteInRecord,
    parseChipList,
    detectChipsForRecord,
} from '../tools/patch-colorpalette.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGES = path.join(REPO_ROOT, 'data', 'Works_NumberTales', 'Images', 'DB_Primary');

/** Num 4 のカタログ画像に **文字として印字されている** 配色（＝作者が定めた正解） */
const NUM4_PRINTED_CODES = ['#00B6D9', '#8DE8ED', '#7CD8EF', '#67BDBD', '#0097C9'];

/**
 * 2 色の RGB 距離。
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function colorDistance(a, b) {
    const [r1, g1, b1] = hexToRgb(a);
    const [r2, g2, b2] = hexToRgb(b);
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

describe('detectSwatchChips — 設定画のカラーチップ検出', () => {
    it('Num 4 の設定画から、カタログに印字された 5 色すべてを検出する', () => {
        const img = decodePng(fs.readFileSync(path.join(IMAGES, 'concept', 'cnsp_imgNTS-4.png')));
        const chips = detectSwatchChips(img);
        expect(chips.length).toBeGreaterThanOrEqual(5);

        // 印字された各コードに対し、十分近い色が検出されている（PNG の再圧縮等で ±数階調ずれる）
        for (const printed of NUM4_PRINTED_CODES) {
            const nearest = Math.min(...chips.map(c => colorDistance(c.hex, printed)));
            expect(nearest).toBeLessThan(10);
        }
    });

    it('チップが重なって描かれていても個別に検出する（Num 48）', () => {
        // Num 48 のチップは大小の円が重畳しており、単純な「有色の連結成分」では
        // 全部が 1 つの塊に融合してしまう。色が変わる境界で成分を切ることで分離できる。
        const img = decodePng(fs.readFileSync(path.join(IMAGES, 'concept', 'cnsp_imgNTS-48.png')));
        const chips = detectSwatchChips(img);
        expect(chips.length).toBeGreaterThanOrEqual(5);
    });

    it('大小が不揃いでも小さなチップを取りこぼさない（Num 75 の青は半径 3.7px しかない）', () => {
        const img = decodePng(fs.readFileSync(path.join(IMAGES, 'concept', 'cnsp_imgNTS-75.png')));
        const chips = detectSwatchChips(img);
        // パレット領域を特定してから、その周辺だけを緩い条件で再捜査することで拾える
        const hasSmallBlue = chips.some(c => colorDistance(c.hex, '#6F94C8') < 20);
        expect(hasSmallBlue).toBe(true);
    });

    it('キャラクター本体の塗りをチップと誤検出しない（線画に接する成分は除外）', () => {
        const img = decodePng(fs.readFileSync(path.join(IMAGES, 'concept', 'cnsp_imgNTS-4.png')));
        const chips = detectSwatchChips(img);
        // 配色見本は 1 箇所にまとまって描かれるため、検出数は高々 8 程度に収まる
        expect(chips.length).toBeLessThanOrEqual(8);
    });

    it('チップが無い画像では空配列を返す', () => {
        const img = decodePng(fs.readFileSync(path.join(IMAGES, 'corefolder', '1', 'emstk_corefolderNTS-1-1.png')));
        const chips = detectSwatchChips(img);
        expect(Array.isArray(chips)).toBe(true);
    });
});

describe('measurePaletteCoverage — 配色の被覆率実測（Role の根拠）', () => {
    it('指定した配色ごとの被覆率を返し、合計が 1 を超えない', () => {
        const img = decodePng(fs.readFileSync(path.join(IMAGES, 'corefolder', '1', 'emstk_corefolderNTS-1-1.png')));
        const coverage = measurePaletteCoverage(img, ['#ED5D47', '#FF8682', '#FFAC8F']);
        expect(coverage).toHaveLength(3);
        for (const c of coverage) expect(c).toBeGreaterThanOrEqual(0);
        expect(coverage.reduce((s, c) => s + c, 0)).toBeLessThanOrEqual(1);
    });

    it('画像に存在する色の被覆率が 0 より大きくなる', () => {
        const img = decodePng(fs.readFileSync(path.join(IMAGES, 'corefolder', '1', 'emstk_corefolderNTS-1-1.png')));
        const coverage = measurePaletteCoverage(img, ['#ED5D47']);
        expect(coverage[0]).toBeGreaterThan(0);
    });
});

describe('buildColorPaletteValue — ColorPalette の値の組み立て', () => {
    const ordered = [
        { hex: '#ED5D47', coverage: 0.41 },
        { hex: '#FF8682', coverage: 0.27 },
        { hex: '#E55951', coverage: 0.15 },
        { hex: '#FFBFA7', coverage: 0.09 },
        { hex: '#FFAC8F', coverage: 0.08 },
    ];
    const hints = [
        { word: 'red orange', bodyPart: '#BodyPart_Hair', element: null, source: 'x' },
    ];

    it('被覆率の降順に Primary / Secondary / Accent を割り当て、4 色目以降を Sub にする', () => {
        const palette = buildColorPaletteValue(ordered, hints);
        expect(palette.map(p => p.Role)).toEqual([
            '#ColorRole_Primary',
            '#ColorRole_Secondary',
            '#ColorRole_Accent',
            '#ColorRole_Sub',
            '#ColorRole_Sub',
        ]);
    });

    it('Hex はチップの値をそのまま使う（推定し直さない）', () => {
        const palette = buildColorPaletteValue(ordered, hints);
        expect(palette.map(p => p.Hex)).toEqual(ordered.map(o => o.hex));
    });

    it('創作内容にあたる項目（色名 / Formation / Note）は埋めない', () => {
        for (const entry of buildColorPaletteValue(ordered, hints)) {
            expect(entry.ColorName_JP).toBeNull();
            expect(entry.ColorName_EN).toBeNull();
            expect(entry.Formation).toBeNull();
            expect(entry.Note_JP).toBeNull();
            expect(entry.Note_EN).toBeNull();
        }
    });

    it('色語（red orange）の色相域に入る色にだけ BodyPart を転記する', () => {
        const palette = buildColorPaletteValue(ordered, hints);
        // #FFAC8F は色相 15.5 で red orange 域（8〜25）に入る
        expect(palette[4].AppliesTo).toEqual(['#BodyPart_Hair']);
        // #ED5D47 は色相 8.0 未満でわずかに域外。近い色でも機械的に線を引く
        expect(palette[0].AppliesTo).toBeNull();
    });
});

describe('rankChipsByCoverage — 測定できない場合のフォールバック', () => {
    it('キャラ画像が無ければ、設定画上のチップの大きさ順にする（coverage は null）', () => {
        const chips = [
            { hex: '#111111', count: 10 },
            { hex: '#222222', count: 90 },
        ];
        const { ordered, measuredOn } = rankChipsByCoverage(chips, { Images: {} }, IMAGES);
        expect(measuredOn).toBeNull();
        expect(ordered.map(o => o.hex)).toEqual(['#222222', '#111111']);
        expect(ordered[0].coverage).toBeNull();
    });
});

describe('upsertColorPaletteInRecord / removeColorPaletteFromRecord', () => {
    const palette = [{
        Role: '#ColorRole_Primary', Hex: '#E8543A', ColorName_JP: null, ColorName_EN: null,
        AppliesTo: null, Formation: null, Note_JP: null, Note_EN: null,
    }];

    it('既存の ColorPalette があれば値だけを差し替える（キーの位置は動かさない）', () => {
        const text = '[\n  {\n    "Num": 1,\n    "AppearanceDetail": [],\n    "ColorPalette": [{ "Hex": "#OLD" }],\n    "Summary_JP": "x"\n  }\n]\n';
        const spans = scanTopLevelRecords(text);
        const { text: out, mode } = upsertColorPaletteInRecord(text, spans[0], palette);
        expect(mode).toBe('replaced');

        const record = JSON.parse(out)[0];
        expect(record.ColorPalette[0].Hex).toBe('#E8543A');
        const keys = Object.keys(record);
        expect(keys.indexOf('ColorPalette')).toBe(keys.indexOf('AppearanceDetail') + 1);
        expect(record.Summary_JP).toBe('x');
    });

    it('既存が無ければ AppearanceDetail の直後へ挿入する', () => {
        const text = '[\n  {\n    "Num": 1,\n    "AppearanceDetail": [],\n    "Summary_JP": "x"\n  }\n]\n';
        const spans = scanTopLevelRecords(text);
        const { text: out, mode } = upsertColorPaletteInRecord(text, spans[0], palette);
        expect(mode).toBe('inserted');
        expect(JSON.parse(out)[0].ColorPalette).toHaveLength(1);
    });

    it('確定できなかったレコードから既存の推測値を削除できる（正確な値との混在防止）', () => {
        const text = '[\n  {\n    "Num": 1,\n    "AppearanceDetail": [],\n    "ColorPalette": [{ "Hex": "#GUESS" }],\n    "Summary_JP": "x"\n  }\n]\n';
        const spans = scanTopLevelRecords(text);
        const res = removeColorPaletteFromRecord(text, spans[0]);
        expect(res).not.toBeNull();

        const record = JSON.parse(res.text)[0];
        expect('ColorPalette' in record).toBe(false);
        // 他のフィールドは残る
        expect(record.Num).toBe(1);
        expect(record.Summary_JP).toBe('x');
        expect(record.AppearanceDetail).toEqual([]);
    });

    it('ColorPalette を持たないレコードでは削除は null を返す', () => {
        const text = '[\n  { "Num": 1, "AppearanceDetail": [] }\n]\n';
        const spans = scanTopLevelRecords(text);
        expect(removeColorPaletteFromRecord(text, spans[0])).toBeNull();
    });
});

describe('parseChipList / 手入力チップ — 自動検出できないレコードの受け口', () => {
    it('カラーコードを大文字・# 付きへ正規化する（既存データの表記に合わせる）', () => {
        expect(parseChipList('#67bdbd,#a4daef,#387eb6')).toEqual(['#67BDBD', '#A4DAEF', '#387EB6']);
    });

    it('# の有無・前後の空白を吸収する', () => {
        expect(parseChipList(' 67bdbd , #A4DAEF ')).toEqual(['#67BDBD', '#A4DAEF']);
    });

    it('#RRGGBB 形式でない値は例外を投げる（不正な色を DB へ入れない）', () => {
        expect(() => parseChipList('#67bdbd,zzz')).toThrow(/形式/);
        expect(() => parseChipList('#12345')).toThrow(/形式/);
    });

    it('手入力チップは自動検出より優先され、source が manual になる', () => {
        const { chips, source } = detectChipsForRecord(
            { Images: { concept_PNGName: 'cnsp_imgNTS-4' } },
            IMAGES,
            ['#67BDBD', '#A4DAEF'],
        );
        expect(source).toBe('manual');
        expect(chips.map(c => c.hex)).toEqual(['#67BDBD', '#A4DAEF']);
    });

    it('手入力チップも被覆率の降順で Role が決まる（自動検出と同じ扱い）', () => {
        const chips = [{ hex: '#67BDBD', count: 0 }, { hex: '#387EB6', count: 0 }];
        const record = { Images: { corefolder_PNGPath: ['40/emstk_corefolderNTS-40-1'] } };
        const { ordered, measuredOn } = rankChipsByCoverage(chips, record, IMAGES);
        expect(measuredOn).toContain('corefolderNTS-40-1');
        // corefolder 画像では #67BDBD の方が広く使われている
        expect(ordered[0].hex).toBe('#67BDBD');
        expect(ordered[0].coverage).toBeGreaterThan(ordered[1].coverage);
    });
});
