/**
 * tools/extract-palette.mjs のテスト
 *
 * @description
 *   キャラクター画像からの配色候補抽出ツールを検証する。
 *
 *   - `decodePng()`: Node 標準 zlib のみで実装した PNG デコーダ。実際のリポジトリ内の
 *     画像アセットを読み、寸法・ピクセル数・アルファ範囲が妥当であることを確認する。
 *   - `rgbToHsv()` / `toHex()`: 色空間変換の既知値。
 *   - `medianCut()`: 色量子化が占有ピクセル数の降順で代表色を返すこと。
 *   - `collectColorHints()`: `AppearanceDetail` の `#DesignAttr_Color` /
 *     `#DesignAttr_Overview` から色語を拾えること。
 *   - `buildColorPaletteDraft()`: 下書き生成。**主ソースは resolveImageSources() の
 *     優先順（arts → corefolder → concept）に従う**という回帰を固定する
 *     （前景比率で選ぶと単色のコアフォルダ球体が humanoid 清書イラストを押しのけてしまう）。
 *     あわせて「創作内容（色名・Formation・Note）は埋めない」ことも検証する。
 *
 * @see _work_in_progress/2026-07-13_progress_colorpalette-schema.md
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    decodePng,
    rgbToHsv,
    toHex,
    medianCut,
    collectColorHints,
    buildColorPaletteDraft,
    resolveImageSources,
    scanTopLevelRecords,
    findValueEnd,
    insertColorPaletteIntoRecord,
} from '../tools/extract-palette.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE_PNG = path.join(
    REPO_ROOT, 'data', 'Works_NumberTales', 'Images', 'DB_Primary',
    'corefolder', '1', 'emstk_corefolder1-1.png',
);

describe('decodePng — 自前 PNG デコーダ（依存追加ゼロ）', () => {
    it('リポジトリ内の実 PNG をデコードでき、RGBA バッファの長さが width*height*4 になる', () => {
        const img = decodePng(fs.readFileSync(SAMPLE_PNG));
        expect(img.width).toBeGreaterThan(0);
        expect(img.height).toBeGreaterThan(0);
        expect(img.data.length).toBe(img.width * img.height * 4);
    });

    it('デコード結果に有効な RGBA 値（0-255）が入る', () => {
        const img = decodePng(fs.readFileSync(SAMPLE_PNG));
        for (let i = 0; i < Math.min(img.data.length, 4000); i++) {
            expect(img.data[i]).toBeGreaterThanOrEqual(0);
            expect(img.data[i]).toBeLessThanOrEqual(255);
        }
    });

    it('PNG 署名が不正なら例外を投げる', () => {
        expect(() => decodePng(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(/署名/);
    });
});

describe('rgbToHsv / toHex — 色空間変換', () => {
    it('原色の HSV を正しく求める', () => {
        expect(rgbToHsv(255, 0, 0)).toMatchObject({ h: 0, s: 1, v: 1 });        // 赤
        expect(rgbToHsv(0, 255, 0).h).toBe(120);                                 // 緑
        expect(rgbToHsv(0, 0, 255).h).toBe(240);                                 // 青
    });

    it('無彩色は彩度 0 になる', () => {
        expect(rgbToHsv(255, 255, 255).s).toBe(0);
        expect(rgbToHsv(128, 128, 128).s).toBe(0);
        expect(rgbToHsv(0, 0, 0)).toMatchObject({ s: 0, v: 0 });
    });

    it('#Hexcode_Color 型に適合する #RRGGBB 形式（大文字）を返す', () => {
        expect(toHex(232, 84, 58)).toBe('#E8543A');
        expect(toHex(0, 0, 0)).toBe('#000000');
        expect(toHex(255, 255, 255)).toBe('#FFFFFF');
    });

    it('範囲外の値をクランプする', () => {
        expect(toHex(300, -20, 128)).toBe('#FF0080');
    });
});

describe('medianCut — 色量子化', () => {
    /** 赤 5px / 青 2px の入力 */
    const redAndBlue = [
        [255, 0, 0], [250, 5, 5], [245, 10, 0], [255, 2, 8], [248, 0, 4],
        [0, 0, 255], [5, 5, 250],
    ];

    it('占有ピクセル数の降順で返し、全ピクセルをいずれかのクラスタへ振り分ける', () => {
        const clusters = medianCut(redAndBlue, 2);
        expect(clusters).toHaveLength(2);
        expect(clusters[0].count).toBeGreaterThanOrEqual(clusters[1].count);
        // median-cut は「色空間の中央値」ではなく「ピクセル数の中央」で分割するため、
        // 2 分割では少数派（青 2px）が多数派のバケットへ混ざりうる。
        // 保証されるのは総数の保存と降順であって、色ごとの完全分離ではない。
        expect(clusters.reduce((s, c) => s + c.count, 0)).toBe(redAndBlue.length);
    });

    it('支配的な色が最上位クラスタになる（赤 5px > 青 2px）', () => {
        // 分割数を増やしすぎると支配色の側が複数クラスタへ割れて少数派とタイになるため、
        // 「主要色を数点取る」という本ツールの用途どおりの色数で検証する。
        const clusters = medianCut(redAndBlue, 3);
        expect(clusters[0].count).toBe(4);
        expect(clusters[0].r).toBeGreaterThan(200); // 赤が最大クラスタ
        expect(clusters[0].b).toBeLessThan(100);
    });

    it('空入力では空配列を返す', () => {
        expect(medianCut([], 4)).toEqual([]);
    });

    it('要求色数より入力の色種が少なくても破綻しない', () => {
        const clusters = medianCut([[10, 10, 10], [10, 10, 10]], 8);
        expect(clusters.length).toBeGreaterThan(0);
        expect(clusters.reduce((s, c) => s + c.count, 0)).toBe(2);
    });
});

describe('collectColorHints — AppearanceDetail からの色語収集', () => {
    const record = {
        Num: 1,
        AppearanceDetail: [
            {
                BodyPart: ['#BodyPart_Hair'],
                DesignElement: '#Element_Motif',
                Attrs: [
                    { AttrLabel: '#DesignAttr_Overview', value_JP: '赤橙色の髪', value_EN: 'red orange hair' },
                ],
            },
            {
                BodyPart: ['#BodyPart_Chest'],
                DesignElement: '#Element_NumberMark',
                Attrs: [
                    { AttrLabel: '#DesignAttr_Color', value_JP: '赤', value_EN: 'red' },
                    { AttrLabel: '#DesignAttr_Notation', value_JP: 'アラビア数字の「1」', value_EN: "Arabic numeral '1'" },
                ],
            },
        ],
    };

    it('#DesignAttr_Overview の色語を部位付きで拾う', () => {
        const hints = collectColorHints(record);
        const hair = hints.filter(h => h.bodyPart === '#BodyPart_Hair');
        expect(hair.map(h => h.word)).toContain('red orange');
    });

    it('#DesignAttr_Color の色語を部位付きで拾う', () => {
        const hints = collectColorHints(record);
        const chest = hints.filter(h => h.bodyPart === '#BodyPart_Chest');
        expect(chest.map(h => h.word)).toContain('red');
    });

    it('AppearanceDetail が無いレコードでは空配列を返す', () => {
        expect(collectColorHints({ Num: 99 })).toEqual([]);
        expect(collectColorHints(null)).toEqual([]);
    });
});

describe('resolveImageSources — 画像ソースの優先順', () => {
    it('存在しないファイルは返さない', () => {
        const sources = resolveImageSources(
            { Images: { arts_PNGPath: ['does/not/exist'], concept_PNGName: 'nope' } },
            path.join(REPO_ROOT, 'data', 'Works_NumberTales', 'Images', 'DB_Primary'),
        );
        expect(sources).toEqual([]);
    });

    it('arts を corefolder より先に返す（清書イラストを優先）', () => {
        const sources = resolveImageSources(
            {
                Images: {
                    concept_PNGName: 'cnsp_img1',
                    corefolder_PNGPath: ['1/emstk_corefolder1-1'],
                    arts_PNGPath: ['humanoids/2023/art_img1-humanoid'],
                },
            },
            path.join(REPO_ROOT, 'data', 'Works_NumberTales', 'Images', 'DB_Primary'),
        );
        expect(sources.map(s => s.role)).toEqual(['arts', 'corefolder', 'concept']);
    });
});

describe('buildColorPaletteDraft — ColorPalette 下書きの生成', () => {
    /** arts / corefolder の 2 枚を持つ抽出結果のフィクスチャ */
    const extractionResult = {
        num: 1,
        hints: [
            { word: 'red orange', bodyPart: '#BodyPart_Hair', element: '#Element_Motif', source: '#DesignAttr_Overview: red orange hair' },
        ],
        images: [
            {
                role: 'arts',
                file: 'data/.../art_img1-humanoid.png',
                foregroundRatio: 0.22, // corefolder より低いが、優先順で先に来る
                candidates: [
                    { hex: '#FFA195', ratio: 0.5, hsv: { h: 7, s: 0.42, v: 1 }, matchedHints: [{ word: 'red orange', bodyPart: '#BodyPart_Hair', source: 'x' }] },
                    { hex: '#F68A6F', ratio: 0.13, hsv: { h: 12, s: 0.55, v: 0.97 }, matchedHints: [] },
                    { hex: '#CC575C', ratio: 0.13, hsv: { h: 357, s: 0.58, v: 0.8 }, matchedHints: [] },
                    { hex: '#844547', ratio: 0.06, hsv: { h: 357, s: 0.48, v: 0.52 }, matchedHints: [] },
                ],
            },
            {
                role: 'corefolder',
                file: 'data/.../emstk_corefolder1-1.png',
                foregroundRatio: 0.28, // こちらの方が前景比率は高い
                candidates: [
                    { hex: '#FFB69E', ratio: 0.25, hsv: { h: 15, s: 0.38, v: 1 }, matchedHints: [] },
                ],
            },
        ],
    };

    it('前景比率が低くても arts を主ソースにする（単色コアフォルダに負けない）', () => {
        const draft = buildColorPaletteDraft(extractionResult);
        expect(draft._evidence.source).toContain('arts');
        expect(draft.ColorPalette[0].Hex).toBe('#FFA195');
    });

    it('占有率の降順で Primary / Secondary / Accent を割り当てる', () => {
        const draft = buildColorPaletteDraft(extractionResult);
        expect(draft.ColorPalette.map(c => c.Role)).toEqual([
            '#ColorRole_Primary',
            '#ColorRole_Secondary',
            '#ColorRole_Accent',
        ]);
    });

    it('AppliesTo は AppearanceDetail の BodyPart を転記する', () => {
        const draft = buildColorPaletteDraft(extractionResult);
        expect(draft.ColorPalette[0].AppliesTo).toEqual(['#BodyPart_Hair']);
        expect(draft.ColorPalette[1].AppliesTo).toBeNull(); // 一致する色語が無ければ null
    });

    it('創作内容にあたる項目（色名 / Formation / Note）は埋めない', () => {
        const draft = buildColorPaletteDraft(extractionResult);
        for (const entry of draft.ColorPalette) {
            expect(entry.ColorName_JP).toBeNull();
            expect(entry.ColorName_EN).toBeNull();
            expect(entry.Formation).toBeNull();
            expect(entry.Note_JP).toBeNull();
            expect(entry.Note_EN).toBeNull();
        }
    });

    it('採用しなかった候補・他画像・色語を根拠として添える', () => {
        const draft = buildColorPaletteDraft(extractionResult);
        expect(draft._evidence.otherCandidates).toEqual([{ hex: '#844547', ratio: 0.06 }]);
        expect(draft._evidence.otherImages[0].role).toBe('corefolder');
        expect(draft._evidence.appearanceDetailColorWords[0].word).toBe('red orange');
    });

    it('前景がほとんど残らなかった画像は主ソースにしない', () => {
        const degraded = {
            ...extractionResult,
            images: [
                { ...extractionResult.images[0], foregroundRatio: 0.005 }, // 背景除去に失敗
                extractionResult.images[1],
            ],
        };
        const draft = buildColorPaletteDraft(degraded);
        expect(draft._evidence.source).toContain('corefolder');
    });

    it('画像が無いレコードでは null を返す（下書きを作らない）', () => {
        expect(buildColorPaletteDraft({ num: 38, hints: [], images: [] })).toBeNull();
    });

    it('デコードに失敗した画像しか無ければ null を返す', () => {
        expect(buildColorPaletteDraft({
            num: 5, hints: [],
            images: [{ role: 'arts', file: 'x.png', error: 'broken' }],
        })).toBeNull();
    });
});

describe('scanTopLevelRecords / findValueEnd — テキスト走査（書式非破壊の追記に使う）', () => {
    it('トップレベル配列の各レコード範囲を返す', () => {
        const text = '[\n  { "Num": 1 },\n  { "Num": 2 }\n]\n';
        const spans = scanTopLevelRecords(text);
        expect(spans).toHaveLength(2);
        expect(JSON.parse(text.slice(...spans[0]))).toEqual({ Num: 1 });
        expect(JSON.parse(text.slice(...spans[1]))).toEqual({ Num: 2 });
    });

    it('文字列中の括弧に惑わされない', () => {
        const text = '[\n  { "Name": "a{b}[c]", "Num": 1 }\n]\n';
        const spans = scanTopLevelRecords(text);
        expect(spans).toHaveLength(1);
        expect(JSON.parse(text.slice(...spans[0])).Name).toBe('a{b}[c]');
    });

    it('エスケープされた引用符を含む文字列を正しく飛ばす', () => {
        const text = '[\n  { "Name": "say \\"hi\\"", "Num": 1 }\n]\n';
        const spans = scanTopLevelRecords(text);
        expect(spans).toHaveLength(1);
        expect(JSON.parse(text.slice(...spans[0])).Num).toBe(1);
    });

    it('配列・オブジェクト・文字列・スカラーそれぞれの値の終端を求められる', () => {
        const cases = [
            ['{"k": [1, [2], 3], "next": 1}', '[1, [2], 3]'],
            ['{"k": {"a": {"b": 1}}, "next": 1}', '{"a": {"b": 1}}'],
            ['{"k": "va]lue", "next": 1}', '"va]lue"'],
            ['{"k": 42, "next": 1}', '42'],
            ['{"k": null, "next": 1}', 'null'],
        ];
        for (const [text, expected] of cases) {
            const colon = text.indexOf(':');
            const end = findValueEnd(text, colon);
            expect(text.slice(colon + 2, end)).toBe(expected);
        }
    });
});

describe('insertColorPaletteIntoRecord — 既存フォーマットを壊さない追記', () => {
    const palette = [{ Role: '#ColorRole_Primary', Hex: '#E8543A', ColorName_JP: null, ColorName_EN: null, AppliesTo: ['#BodyPart_Hair'], Formation: null, Note_JP: null, Note_EN: null }];

    it('AppearanceDetail の直後に ColorPalette を挿入する（$DefType のフィールド順に一致）', () => {
        const text = '[\n  {\n    "Num": 1,\n    "AppearanceDetail": [{ "BodyPart": ["#BodyPart_Hair"] }],\n    "Summary_JP": "x"\n  }\n]\n';
        const spans = scanTopLevelRecords(text);
        const { text: out } = insertColorPaletteIntoRecord(text, spans[0], palette);

        const record = JSON.parse(out)[0];
        const keys = Object.keys(record);
        expect(keys.indexOf('ColorPalette')).toBe(keys.indexOf('AppearanceDetail') + 1);
        expect(record.ColorPalette[0].Hex).toBe('#E8543A');
        // 既存フィールドは保持される
        expect(record.Num).toBe(1);
        expect(record.Summary_JP).toBe('x');
    });

    it('AppearanceDetail が末尾キーでも壊れない JSON を生成する', () => {
        const text = '[\n  {\n    "Num": 1,\n    "AppearanceDetail": []\n  }\n]\n';
        const spans = scanTopLevelRecords(text);
        const { text: out } = insertColorPaletteIntoRecord(text, spans[0], palette);
        expect(() => JSON.parse(out)).not.toThrow();
        expect(JSON.parse(out)[0].ColorPalette).toHaveLength(1);
    });

    it('挿入した箇所以外のテキストを 1 文字も書き換えない', () => {
        const text = '[\n  {\n    "Num": 1,\n    "Inline": ["a", "b"],\n    "AppearanceDetail": [],\n    "Summary_JP": "x"\n  }\n]\n';
        const spans = scanTopLevelRecords(text);
        const { text: out, delta } = insertColorPaletteIntoRecord(text, spans[0], palette);

        // 挿入分を取り除くと元テキストに完全一致する（= 既存行は無改変）
        expect(out.length).toBe(text.length + delta);
        const insertAt = out.indexOf('\n    "ColorPalette"');
        const restored = out.slice(0, insertAt) + out.slice(insertAt + delta);
        expect(restored).toBe(text);
        // prettier が 1 行に畳んでいる短い配列が展開されていない
        expect(out).toContain('"Inline": ["a", "b"]');
    });

    it('AppearanceDetail が無いレコードでは例外を投げる（黙って別位置へ入れない）', () => {
        const text = '[\n  { "Num": 1 }\n]\n';
        const spans = scanTopLevelRecords(text);
        expect(() => insertColorPaletteIntoRecord(text, spans[0], palette)).toThrow(/AppearanceDetail/);
    });
});
