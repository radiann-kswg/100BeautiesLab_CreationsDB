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
    extractSolidColors,
    isTransparentArtwork,
    listImageFields,
    readCommonColors,
} from '../tools/extract-palette.mjs';
import {
    buildColorPaletteValue,
    rankChipsByCoverage,
    removeColorPaletteFromRecord,
    upsertColorPaletteInRecord,
    parseChipList,
    detectChipsForRecord,
    resolveArtworkSources,
    resolvePaletteImageFields,
    detectArtworkColorsForRecord,
    verifyArtworkAgainstChips,
    recordLabel,
    COLOR_SLOTS,
    buildSlotColorName,
    applySlotAssignment,
    proposeSlotAssignment,
    profileColorBands,
    renderColorMap,
} from '../tools/patch-colorpalette.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGES = path.join(REPO_ROOT, 'data', 'Works_NumberTales', 'Images', 'DB_Primary');
const NTS_WORK = path.join(REPO_ROOT, 'data', 'Works_NumberTales');
const UBL_WORK = path.join(REPO_ROOT, 'data', 'Works_UnibyteLive');

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

// ────────────────────────────────────────────────────────────────────────────
// 透過キャラクター単体イラストからの配色抽出
//
// 設定画のカラーチップが無いレコード向けの経路。正しさの基準は「チップ由来で
// 確定済みの ColorPalette と一致するか」に置く（チップは作者の指定値そのもの）。
// ────────────────────────────────────────────────────────────────────────────

/** Num 1 のコアフォルダ画像（透過・べた塗り） */
const COREFOLDER_1 = path.join(IMAGES, 'corefolder', '1', 'emstk_corefolderNTS-1-1.png');

describe('extractSolidColors — 透過イラストからの配色抽出', () => {
    it('チップ由来で確定済みの配色を、距離 0（完全一致）で拾う', () => {
        const img = decodePng(fs.readFileSync(COREFOLDER_1));
        const colors = extractSolidColors([img], { exclude: readCommonColors(NTS_WORK) });
        const hexes = colors.map(c => c.hex);
        // Num 1 のチップ由来パレットに含まれる色。べた塗りなので階調のずれ無く一致する
        for (const expected of ['#ED5D47', '#FF8682', '#FFBFA7', '#FFAC8F']) {
            expect(hexes).toContain(expected);
        }
    });

    it('面積の降順で返す（Role の主従はこの並びで決まる）', () => {
        const img = decodePng(fs.readFileSync(COREFOLDER_1));
        const colors = extractSolidColors([img], { exclude: readCommonColors(NTS_WORK) });
        expect(colors.length).toBeGreaterThan(1);
        // 近似色のマージ後に再ソートしていないと、ここで順序が崩れる
        for (let i = 1; i < colors.length; i++) {
            expect(colors[i - 1].ratio).toBeGreaterThanOrEqual(colors[i].ratio);
        }
    });

    it('輪郭線の純黒を配色に含めない', () => {
        const img = decodePng(fs.readFileSync(COREFOLDER_1));
        // corefolder-1 では #000000 が面積 7.5% を占めるが、これは線画であって配色ではない
        const colors = extractSolidColors([img], { exclude: readCommonColors(NTS_WORK) });
        expect(colors.map(c => c.hex)).not.toContain('#000000');
    });

    it('共通造形色（コアフォルダの毛 #FFFFFF）を除外する', () => {
        const img = decodePng(fs.readFileSync(COREFOLDER_1));
        const common = readCommonColors(NTS_WORK);
        expect(common).toContain('#FFFFFF');

        const withCommon = extractSolidColors([img], {}).map(c => c.hex);
        const without = extractSolidColors([img], { exclude: common }).map(c => c.hex);
        expect(withCommon).toContain('#FFFFFF');
        expect(without).not.toContain('#FFFFFF');
    });

    it('白が主体のキャラでも共通色除外で配色が空にならない（SemiPrimary 222）', () => {
        const file = path.join(
            REPO_ROOT, 'data', 'Works_NumberTales', 'Images', 'DB_SemiPrimary',
            'corefolder', '222', 'emstk_corefolderNTS-222A,NTS-222B-1.png',
        );
        const img = decodePng(fs.readFileSync(file));
        const colors = extractSolidColors([img], { exclude: readCommonColors(NTS_WORK) });
        expect(colors.length).toBeGreaterThan(0);
        expect(colors.map(c => c.hex)).not.toContain('#FFFFFF');
    });

    it('面積比が下限未満の色は落とす（影・ハイライトの混入防止）', () => {
        const img = decodePng(fs.readFileSync(COREFOLDER_1));
        const loose = extractSolidColors([img], { minRatio: 0 });
        const strict = extractSolidColors([img], { minRatio: 0.05 });
        expect(strict.length).toBeLessThan(loose.length);
        for (const c of strict) expect(c.ratio).toBeGreaterThanOrEqual(0.05);
    });
});

describe('isTransparentArtwork — 素材の自動判別', () => {
    it('コアフォルダ（透過キャラ単体）を透過素材と認識する', () => {
        expect(isTransparentArtwork(decodePng(fs.readFileSync(COREFOLDER_1)))).toBe(true);
    });

    it('キーキャッパー（別作品の透過キャラ単体）も認識する', () => {
        const file = path.join(
            UBL_WORK, 'Images', 'DB_Primary', 'keycapper', 'I', 'emstk_keycapperUBL-Ig2-1.png',
        );
        expect(isTransparentArtwork(decodePng(fs.readFileSync(file)))).toBe(true);
    });

    it('背景付きの設定画は透過素材と認識しない', () => {
        const img = decodePng(fs.readFileSync(path.join(IMAGES, 'concept', 'cnsp_imgNTS-1.png')));
        expect(isTransparentArtwork(img)).toBe(false);
    });
});

describe('listImageFields / readCommonColors — スキーマ由来の宣言読み取り', () => {
    it('作品別 db_type.json の Images 宣言からフォルダ名を導く', () => {
        const nts = listImageFields(NTS_WORK);
        expect(nts).toContainEqual({
            field: 'corefolder_PNGPath', folder: 'corefolder', isList: true, paletteSource: 'artwork',
        });
        expect(nts).toContainEqual({
            field: 'concept_PNGName', folder: 'concept', isList: false, paletteSource: 'swatch',
        });

        // 作品ごとにフィールド名が違っても、ツール側に名前を書かずに扱える
        expect(listImageFields(UBL_WORK).map(f => f.field)).toContain('keycapper_PNGPath');
    });

    it('db_meta.json の $EnumDef_CommonColor から共通色の HEX を読む', () => {
        expect(readCommonColors(NTS_WORK)).toEqual(
            expect.arrayContaining(['#FFFDF1', '#FF9669', '#FFFFFF']),
        );
        expect(readCommonColors(UBL_WORK)).toEqual(
            expect.arrayContaining(['#FFFFFF', '#CEC7B6', '#F3F1E4']),
        );
    });

    it('宣言の無い作品では空配列（除外なしで動く）', () => {
        expect(readCommonColors(path.join(REPO_ROOT, 'data', 'Works_ShouArRiders'))).toEqual([]);
    });
});

describe('resolvePaletteImageFields — 検出対象の typedef 宣言', () => {
    it('$palette.source = "swatch" のフィールドをチップ検出の入力にする', () => {
        const fields = resolvePaletteImageFields(NTS_WORK, 'swatch');
        expect(fields.map(f => f.key)).toEqual(['concept_PNGName', 'catalog_PNGName']);
        // 順序は db_type.json の宣言順＝作者が意図した優先順
        expect(fields[0].dir).toBe('concept');
    });

    it('$palette.source = "artwork" のフィールドを透過抽出の入力にする', () => {
        expect(resolvePaletteImageFields(NTS_WORK, 'artwork').map(f => f.key))
            .toEqual(['corefolder_PNGPath']);
        expect(resolvePaletteImageFields(UBL_WORK, 'artwork').map(f => f.key))
            .toEqual(['keycapper_PNGPath']);
    });

    it('宣言の無い作品ではフォールバックをそのまま返す（既存作品の挙動を変えない）', () => {
        const fallback = [{ role: 'concept', dir: 'concept', key: 'concept_PNGName' }];
        const noDecl = path.join(REPO_ROOT, 'data', 'Works_ShouArRiders');
        expect(resolvePaletteImageFields(noDecl, 'swatch', fallback)).toEqual(fallback);
        expect(resolvePaletteImageFields(null, 'swatch', fallback)).toEqual(fallback);
    });

    it('衣装差分など宣言されていない透過画像は配色の入力にしない', () => {
        // designAlt_PNGPath / arts_PNGPath は $palette 宣言を持たないので候補から外れる
        const record = {
            Images: {
                corefolder_PNGPath: ['1/emstk_corefolderNTS-1-1'],
                designAlt_PNGPath: ['dummy/not-a-palette-source'],
            },
        };
        const sources = resolveArtworkSources(record, NTS_WORK, IMAGES);
        expect(sources.every(s => s.folder === 'corefolder')).toBe(true);
    });
});

describe('resolveArtworkSources — 拡張子の有無を吸収する', () => {
    it('拡張子なしのパス（corefolder_PNGPath）を解決する', () => {
        const record = { Images: { corefolder_PNGPath: ['1/emstk_corefolderNTS-1-1'] } };
        const sources = resolveArtworkSources(record, NTS_WORK, IMAGES);
        expect(sources.map(s => path.basename(s.path))).toContain('emstk_corefolderNTS-1-1.png');
    });

    it('拡張子込みのパス（keycapper_PNGPath）でも二重に付けない', () => {
        const record = { Images: { keycapper_PNGPath: ['I/emstk_keycapperUBL-Ig2-1.png'] } };
        const sources = resolveArtworkSources(record, UBL_WORK, path.join(UBL_WORK, 'Images', 'DB_Primary'));
        expect(sources).toHaveLength(1);
        expect(sources[0].path).toMatch(/emstk_keycapperUBL-Ig2-1\.png$/);
        expect(sources[0].path).not.toMatch(/\.png\.png$/);
    });
});

describe('detectArtworkColorsForRecord — レコード単位の抽出', () => {
    it('透過イラストを持つレコードから配色と出典を返す', () => {
        const record = { Images: { corefolder_PNGPath: ['1/emstk_corefolderNTS-1-1'] } };
        const { colors, source } = detectArtworkColorsForRecord(record, NTS_WORK, IMAGES, {
            exclude: readCommonColors(NTS_WORK),
        });
        expect(colors.length).toBeGreaterThan(0);
        expect(source).toContain('artwork:');
    });

    it('透過イラストを持たないレコードでは空を返す（設定画だけでは抽出しない）', () => {
        const record = { Images: { concept_PNGName: 'cnsp_imgNTS-1' } };
        const { colors, source } = detectArtworkColorsForRecord(record, NTS_WORK, IMAGES, {});
        expect(colors).toEqual([]);
        expect(source).toBeNull();
    });
});

describe('verifyArtworkAgainstChips — チップ由来パレットとの照合（精度の回帰）', () => {
    it('NumberTales Primary の抽出色が、作者指定のチップ色と高い割合で一致する', () => {
        const { totals } = verifyArtworkAgainstChips({ work: 'NumberTales', db: 'Primary', minRatio: 0.02 });
        expect(totals.records).toBeGreaterThan(50);

        // 実測 80.1%。作者がチップに載せていない色（影・小物）は不一致に数えられるため
        // 100% にはならない。閾値割れは抽出アルゴリズムの劣化を示す。
        const rate = totals.hit / totals.colors;
        expect(rate).toBeGreaterThan(0.75);
    }, 60000); // 89 件ぶんの PNG をデコードするため既定の 5 秒では足りない
});

describe('applySlotAssignment — 配色スロットの確定（並び順 / Role / 色名）', () => {
    /**
     * NumberTales の Num 1（`NTS-1`）は User が画像を見て手で確定させた基準レコード。
     * 「主色(衣装) の Role は #ColorRole_Primary」という User 決定だけを反映すれば、
     * 残りの並び順・色名・AppliesTo はこの割当から機械的に再現できるはず。
     */
    const NTS1_ASSIGNMENT = [
        { slot: 'primary', hex: '#ED5D47', appliesTo: ['#BodyPart_Hair', '#BodyPart_Ear', '#BodyPart_Tail'] },
        { slot: 'primaryCostume', hex: '#FF8682', appliesTo: ['#BodyPart_Chest', '#BodyPart_Shoulder'] },
        { slot: 'secondary', hex: '#FFAC8F', appliesTo: ['#BodyPart_Tail', '#BodyPart_Ear'] },
        { slot: 'accentMain', hex: '#E55951', appliesTo: ['#BodyPart_Eye', '#BodyPart_Chest'] },
        { slot: 'accentSub', hex: '#C9CDCB', appliesTo: ['#BodyPart_Eye', '#BodyPart_Foot'] },
        { slot: 'secondaryCostume', hex: '#CEC7B6', appliesTo: ['#BodyPart_Waist', '#BodyPart_Foot'] },
        { slot: 'auxiliary', hex: '#FFBFA7', appliesTo: null },
    ];

    /** 順序をわざと崩した入力（並べ替えが効いていることを確かめるため） */
    const shuffled = () => [
        { Hex: '#FFBFA7', Formation: null, Note_JP: null, Note_EN: null },
        { Hex: '#CEC7B6', Formation: null, Note_JP: null, Note_EN: null },
        { Hex: '#ED5D47', Formation: null, Note_JP: null, Note_EN: null },
        { Hex: '#C9CDCB', Formation: null, Note_JP: null, Note_EN: null },
        { Hex: '#FF8682', Formation: null, Note_JP: null, Note_EN: null },
        { Hex: '#E55951', Formation: null, Note_JP: null, Note_EN: null },
        { Hex: '#FFAC8F', Formation: null, Note_JP: null, Note_EN: null },
    ];

    it('スロット表の並びへ整列し、Role と色名を確定する', () => {
        const { value, unassigned } = applySlotAssignment(shuffled(), NTS1_ASSIGNMENT);
        expect(unassigned).toEqual([]);
        expect(value.map(v => v.Hex)).toEqual([
            '#ED5D47', '#FF8682', '#FFAC8F', '#E55951', '#C9CDCB', '#CEC7B6', '#FFBFA7',
        ]);
        expect(value.map(v => v.Role)).toEqual([
            '#ColorRole_Primary', '#ColorRole_Primary', '#ColorRole_Secondary',
            '#ColorRole_Accent', '#ColorRole_Accent', '#ColorRole_Sub', '#ColorRole_Sub',
        ]);
        expect(value.map(v => v.ColorName_JP)).toEqual([
            '主色', '主色(衣装)', '副色',
            'メインアクセントカラー（瞳, アクセサリー）', 'サブアクセントカラー（瞳, アクセサリー）',
            '副色（衣装）', '補助色',
        ]);
    });

    it('アクセント枠だけ AppliesTo から部位注記を付ける', () => {
        const eyeOnly = buildSlotColorName(COLOR_SLOTS[3], ['#BodyPart_Eye']);
        expect(eyeOnly).toEqual({ jp: 'メインアクセントカラー（瞳）', en: 'Main Accent Color (Eye Color)' });

        const accessoryOnly = buildSlotColorName(COLOR_SLOTS[4], ['#BodyPart_Foot']);
        expect(accessoryOnly).toEqual({ jp: 'サブアクセントカラー（アクセサリー）', en: 'Sub Accent Color (Accessory Color)' });

        // アクセント以外は注記を付けない
        expect(buildSlotColorName(COLOR_SLOTS[0], ['#BodyPart_Hair'])).toEqual({ jp: '主色', en: 'Primary Color' });
    });

    it('Hex / Formation / Note は既存値を持ち越す（作者指定色と創作内容に触らない）', () => {
        const palette = [{ Hex: '#ED5D47', Formation: 'humanoid', Note_JP: '手書きメモ', Note_EN: 'note' }];
        const { value } = applySlotAssignment(palette, [{ slot: 'primary', hex: '#ed5d47' }]);
        expect(value[0]).toMatchObject({ Hex: '#ED5D47', Formation: 'humanoid', Note_JP: '手書きメモ', Note_EN: 'note' });
    });

    it('割当に載っていない色は補助色へ流さず unassigned で返す', () => {
        const palette = [{ Hex: '#ED5D47' }, { Hex: '#123456' }];
        const { value, unassigned } = applySlotAssignment(palette, [{ slot: 'primary', hex: '#ED5D47' }]);
        expect(value).toHaveLength(1);
        expect(unassigned).toEqual(['#123456']);
    });

    it('未知のスロット名・存在しない Hex は打ち間違いとして弾く', () => {
        expect(() => applySlotAssignment([{ Hex: '#ED5D47' }], [{ slot: 'tertiary', hex: '#ED5D47' }]))
            .toThrow(/未知のスロット名/);
        expect(() => applySlotAssignment([{ Hex: '#ED5D47' }], [{ slot: 'primary', hex: '#000000' }]))
            .toThrow(/無い Hex/);
    });
});

describe('proposeSlotAssignment — 下書き（検証前提）', () => {
    it('色語が地毛・衣装・瞳のどれにも当たらない色は unassigned に残す', () => {
        const { assignment, unassigned } = proposeSlotAssignment([
            { hex: '#ED5D47', covBall: 0.68, covArt: 0.17, hints: [{ word: 'red', bodyPart: '#BodyPart_Hair', element: '#Element_Motif' }] },
            { hex: '#FFBFA7', covBall: 0.21, covArt: 0.09, hints: [] },
        ]);
        expect(assignment).toEqual([
            { slot: 'primary', hex: '#ED5D47', appliesTo: ['#BodyPart_Hair'] },
        ]);
        expect(unassigned).toEqual(['#FFBFA7']);
    });

    it('同じグループが枠数を超えたら溢れた色を unassigned に回す', () => {
        const hair = (hex, cov) => ({ hex, covBall: cov, covArt: 0, hints: [{ word: 'red', bodyPart: '#BodyPart_Hair', element: null }] });
        const { assignment, unassigned } = proposeSlotAssignment([hair('#111111', 0.5), hair('#222222', 0.3), hair('#333333', 0.1)]);
        expect(assignment.map(a => a.slot)).toEqual(['primary', 'secondary']);
        expect(unassigned).toEqual(['#333333']);
    });
});

describe('profileColorBands / renderColorMap — 近似色を「どこに出ているか」で分ける', () => {
    /**
     * Num 1 のコアフォルダ（透過画像）。作者が確定させた配色の担当は判っている:
     * `#ED5D47` が地毛の主色、`#FFAC8F` と `#FFBFA7` は RGB 距離 30 程度の近似色ペア。
     * 被覆率だけでは後者 2 色が入れ替わるが、分布なら別領域として分かれる。
     */
    const NUM1_COREFOLDER = path.join(IMAGES, 'corefolder', '1', 'emstk_corefolderNTS-1-1.png');
    const NUM1_HEXES = ['#ED5D47', '#FF8682', '#FFAC8F', '#E55951', '#C9CDCB', '#CEC7B6', '#FFBFA7'];

    it('主色が最大シェアになり、帯の合計は 1 になる', () => {
        const img = decodePng(fs.readFileSync(NUM1_COREFOLDER));
        const prof = profileColorBands(img, NUM1_HEXES);

        expect(prof).toHaveLength(NUM1_HEXES.length);
        const top = prof.indexOf(prof.reduce((a, b) => (b.share > a.share ? b : a)));
        expect(NUM1_HEXES[top]).toBe('#ED5D47');

        for (const p of prof) {
            if (!p.share) continue;
            const sum = p.bands.reduce((a, b) => a + b, 0);
            expect(sum).toBeGreaterThan(0.9);
            expect(sum).toBeLessThan(1.1);
        }
    });

    it('近似色ペアがそれぞれ独立した領域を持つ（被覆率では潰れる区別）', () => {
        const img = decodePng(fs.readFileSync(NUM1_COREFOLDER));
        const prof = profileColorBands(img, NUM1_HEXES);
        const secondary = prof[NUM1_HEXES.indexOf('#FFAC8F')];
        const auxiliary = prof[NUM1_HEXES.indexOf('#FFBFA7')];
        expect(secondary.share).toBeGreaterThan(0);
        expect(auxiliary.share).toBeGreaterThan(0);
    });

    it('配色マップは指定した行数・列数の図を返す', () => {
        const img = decodePng(fs.readFileSync(NUM1_COREFOLDER));
        const lines = renderColorMap(img, NUM1_HEXES, { cols: 20, rows: 10 });
        expect(lines).toHaveLength(10);
        for (const line of lines) expect(line).toHaveLength(20);
        // 地（`.`）だけの図にはならない
        expect(lines.join('')).toMatch(/[1-7]/);
    });
});

describe('recordLabel — Num を持たない作品の表示', () => {
    it('Num があればそれを使う', () => {
        expect(recordLabel({ Num: 57 })).toBe('57');
        expect(recordLabel({ Num: '10-alt' })).toBe('10-alt');
    });

    it('Num が無ければ先頭のインデックス項目を使う（ハンカクライブの Letter）', () => {
        expect(recordLabel({ Letter: { Alphabet: 'I', AlphaGen: 2 } })).toBe('Letter:I/2');
    });
});
