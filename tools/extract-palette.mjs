/**
 * extract-palette.mjs - キャラクター画像からの配色候補抽出ツール
 *
 * @description
 *   `data/Works_<work>/Images/` 配下の既存 PNG から、キャラクターの主要色を
 *   決定論的に抽出し、`ColorPalette` フィールドの **入力候補** を生成する。
 *
 *   目的は「User が `ColorPalette` を手入力する際の候補提示」であり、
 *   **確定値を自動生成することではない**。抽出結果は `.cache/` へ書き出すのみで、
 *   `data/` 配下の実データは一切変更しない。
 *
 * 設計原則（CLAUDE.md 準拠）:
 * - **創作内容の自動生成はしない。** 本ツールが行うのは (1) 既存画像アセットの
 *   機械的計測（ピクセルの色分布）と、(2) 既存 `AppearanceDetail` フィールドに
 *   書かれた色語との照合だけ。新しいキャラクター設定は生成しない。
 *   色名・部位名・最終的な HEX の採否は User が決める。
 * - **依存追加ゼロ。** PNG デコードは Node 標準 `zlib` のみで自前実装する
 *   （`sharp` 等のネイティブ依存を持ち込まない）。
 * - **`data/` へ書かない。** 出力先は `.cache/`（Git 管轄外）。
 *
 * CLI 使い方:
 *   node tools/extract-palette.mjs --work NumberTales --db Primary --records 1
 *   node tools/extract-palette.mjs --work NumberTales --db Primary --all
 *   node tools/extract-palette.mjs --work NumberTales --db Primary --all --top 6
 *
 * 出力:
 *   .cache/palette-candidates.json   全対象レコードの抽出結果
 *
 * @author 100BeautiesLab.
 * @version 0.1.0
 * @dependencies node:zlib, node:fs, node:path（すべて標準モジュール）
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// ────────────────────────────────────────────────────────────────────────────
// PNG デコーダ（Node 標準 zlib のみ / 依存追加ゼロ）
// ────────────────────────────────────────────────────────────────────────────

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * @typedef {Object} DecodedImage
 * @property {number} width
 * @property {number} height
 * @property {Uint8Array} data  RGBA 8bit × width × height
 */

/**
 * Paeth 予測子（PNG フィルタタイプ 4）。
 * @param {number} a 左
 * @param {number} b 上
 * @param {number} c 左上
 * @returns {number}
 */
function paethPredictor(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
}

/**
 * PNG のスキャンライン・フィルタを解除する（in-place ではなく新規バッファを返す）。
 *
 * @param {Buffer} raw          inflate 済みの生データ（各行の先頭にフィルタ種別バイト）
 * @param {number} width
 * @param {number} height
 * @param {number} bytesPerPixel  フィルタ計算に使う「1ピクセルあたりのバイト数」（切り上げ、最小 1）
 * @param {number} bytesPerRow    フィルタバイトを除いた 1 行のバイト数
 * @returns {Buffer} フィルタ解除済みのピクセルデータ（フィルタバイトなし）
 */
function unfilter(raw, width, height, bytesPerPixel, bytesPerRow) {
    const out = Buffer.alloc(height * bytesPerRow);
    let rawPos = 0;
    for (let y = 0; y < height; y++) {
        const filterType = raw[rawPos++];
        const rowStart = y * bytesPerRow;
        const prevStart = (y - 1) * bytesPerRow;
        for (let x = 0; x < bytesPerRow; x++) {
            const rawByte = raw[rawPos++];
            const left = x >= bytesPerPixel ? out[rowStart + x - bytesPerPixel] : 0;
            const up = y > 0 ? out[prevStart + x] : 0;
            const upLeft = (y > 0 && x >= bytesPerPixel) ? out[prevStart + x - bytesPerPixel] : 0;
            let value;
            switch (filterType) {
                case 0: value = rawByte; break;                                   // None
                case 1: value = rawByte + left; break;                            // Sub
                case 2: value = rawByte + up; break;                              // Up
                case 3: value = rawByte + ((left + up) >> 1); break;              // Average
                case 4: value = rawByte + paethPredictor(left, up, upLeft); break; // Paeth
                default: throw new Error(`未知の PNG フィルタ種別: ${filterType}（行 ${y}）`);
            }
            out[rowStart + x] = value & 0xff;
        }
    }
    return out;
}

/**
 * PNG バッファをデコードして RGBA ピクセル配列を返す。
 *
 * 対応: bitDepth 8 / 16（16 は 8bit へ丸め）、colorType 0(gray) / 2(RGB) / 3(palette) / 4(gray+A) / 6(RGBA)。
 * パレット画像は bitDepth 1/2/4/8 に対応。インターレース（Adam7）は非対応。
 *
 * @param {Buffer} buf  PNG ファイルの中身
 * @returns {DecodedImage}
 * @throws {Error} 署名不一致・インターレース・未対応の色形式
 */
export function decodePng(buf) {
    if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('PNG 署名が一致しません');

    let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
    /** @type {Buffer|null} */ let palette = null;
    /** @type {Buffer|null} */ let transparency = null;
    /** @type {Buffer[]} */ const idatParts = [];

    let pos = 8;
    while (pos < buf.length) {
        const length = buf.readUInt32BE(pos);
        const type = buf.toString('ascii', pos + 4, pos + 8);
        const dataStart = pos + 8;
        if (type === 'IHDR') {
            width = buf.readUInt32BE(dataStart);
            height = buf.readUInt32BE(dataStart + 4);
            bitDepth = buf[dataStart + 8];
            colorType = buf[dataStart + 9];
            interlace = buf[dataStart + 12];
        } else if (type === 'PLTE') {
            palette = buf.subarray(dataStart, dataStart + length);
        } else if (type === 'tRNS') {
            transparency = buf.subarray(dataStart, dataStart + length);
        } else if (type === 'IDAT') {
            idatParts.push(buf.subarray(dataStart, dataStart + length));
        } else if (type === 'IEND') {
            break;
        }
        pos = dataStart + length + 4; // + CRC
    }

    if (interlace !== 0) throw new Error('インターレース PNG (Adam7) は非対応です');
    if (!idatParts.length) throw new Error('IDAT チャンクが見つかりません');

    const raw = zlib.inflateSync(Buffer.concat(idatParts));

    // colorType → 1 ピクセルあたりのサンプル数
    const samplesPerPixel = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
    if (samplesPerPixel === undefined) throw new Error(`未対応の colorType: ${colorType}`);

    const bitsPerPixel = samplesPerPixel * bitDepth;
    const bytesPerPixel = Math.max(1, Math.ceil(bitsPerPixel / 8));
    const bytesPerRow = Math.ceil((width * bitsPerPixel) / 8);
    const pixels = unfilter(raw, width, height, bytesPerPixel, bytesPerRow);

    const out = new Uint8Array(width * height * 4);

    /** bitDepth に応じて y 行 x 列の i 番目のサンプルを 8bit 値として読む */
    const readSample = (y, x, sampleIdx) => {
        if (bitDepth === 8) {
            return pixels[y * bytesPerRow + x * samplesPerPixel + sampleIdx];
        }
        if (bitDepth === 16) {
            // 上位バイトのみ採用（8bit へ丸め）
            return pixels[y * bytesPerRow + (x * samplesPerPixel + sampleIdx) * 2];
        }
        // bitDepth 1 / 2 / 4（パレット・グレースケール）
        const bitIndex = (x * samplesPerPixel + sampleIdx) * bitDepth;
        const byte = pixels[y * bytesPerRow + (bitIndex >> 3)];
        const shift = 8 - bitDepth - (bitIndex & 7);
        return (byte >> shift) & ((1 << bitDepth) - 1);
    };

    /** グレースケール値を 8bit へ正規化 */
    const grayScale = (v) => (bitDepth >= 8 ? v : Math.round((v * 255) / ((1 << bitDepth) - 1)));

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const o = (y * width + x) * 4;
            if (colorType === 3) {
                if (!palette) throw new Error('パレット画像に PLTE チャンクがありません');
                const idx = readSample(y, x, 0);
                out[o] = palette[idx * 3];
                out[o + 1] = palette[idx * 3 + 1];
                out[o + 2] = palette[idx * 3 + 2];
                out[o + 3] = transparency && idx < transparency.length ? transparency[idx] : 255;
            } else if (colorType === 0) {
                const g = grayScale(readSample(y, x, 0));
                out[o] = out[o + 1] = out[o + 2] = g;
                out[o + 3] = 255;
            } else if (colorType === 4) {
                const g = grayScale(readSample(y, x, 0));
                out[o] = out[o + 1] = out[o + 2] = g;
                out[o + 3] = grayScale(readSample(y, x, 1));
            } else if (colorType === 2) {
                out[o] = readSample(y, x, 0);
                out[o + 1] = readSample(y, x, 1);
                out[o + 2] = readSample(y, x, 2);
                out[o + 3] = 255;
            } else { // colorType 6 (RGBA)
                out[o] = readSample(y, x, 0);
                out[o + 1] = readSample(y, x, 1);
                out[o + 2] = readSample(y, x, 2);
                out[o + 3] = readSample(y, x, 3);
            }
        }
    }

    return { width, height, data: out };
}

// ────────────────────────────────────────────────────────────────────────────
// 色空間ユーティリティ
// ────────────────────────────────────────────────────────────────────────────

/**
 * RGB → HSV 変換。
 * @param {number} r 0-255
 * @param {number} g 0-255
 * @param {number} b 0-255
 * @returns {{ h: number, s: number, v: number }} h: 0-360, s/v: 0-1
 */
export function rgbToHsv(r, g, b) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === rn) h = ((gn - bn) / d) % 6;
        else if (max === gn) h = (bn - rn) / d + 2;
        else h = (rn - gn) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
}

/**
 * RGB → `#RRGGBB` 形式の HEX 文字列（`#Hexcode_Color` 型に適合）。
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
export function toHex(r, g, b) {
    const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0').toUpperCase();
    return `#${h(r)}${h(g)}${h(b)}`;
}

// ────────────────────────────────────────────────────────────────────────────
// 前景マスク（背景・線画・紙面の除去）
// ────────────────────────────────────────────────────────────────────────────

/**
 * 前景（キャラクター本体）と思われるピクセルのマスクを構築する。
 *
 * 処理は 4 段:
 *   1. 透過ピクセル（alpha < 128）を背景とする
 *   2. 画像の外周を種として **フラッドフィル** し、隣接ピクセルとの色差が小さい間だけ
 *      伸長して背景連結成分を塗り潰す。線画（急峻な色差）で停止するのでキャラクター
 *      内部へは侵入しない。
 *   3. **外周の色分布から背景色を推定**し、それに近いピクセルを背景とする。
 *      arts 画像は「白い外枠 → グラデーション背景」という二層構造を持つため、
 *      枠と背景の境界でフラッドフィルが停止してしまい 2. だけでは背景が残る。
 *      画像ごとに最適なフラッドフィルのしきい値が異なる問題も、この段で吸収する。
 *   4. 残ったピクセルから、線画の黒（明度が極端に低い）と紙・白飛び（低彩度かつ高明度）を除く
 *
 * @param {DecodedImage} img
 * @param {{ floodTolerance?: number, bgTolerance?: number, darkV?: number, paleS?: number, paleV?: number }} [opts]
 * @returns {Uint8Array} 1 = 前景, 0 = 背景（長さ width*height）
 */
export function buildForegroundMask(img, opts = {}) {
    const { width, height, data } = img;
    const floodTolerance = opts.floodTolerance ?? 40;
    const bgTolerance = opts.bgTolerance ?? 38;
    const darkV = opts.darkV ?? 0.16;
    const paleS = opts.paleS ?? 0.10;
    const paleV = opts.paleV ?? 0.90;

    const n = width * height;
    const mask = new Uint8Array(n).fill(1);

    // 1. 透過を背景に
    for (let i = 0; i < n; i++) {
        if (data[i * 4 + 3] < 128) mask[i] = 0;
    }

    // 2. 外周からのフラッドフィル（色差が floodTolerance 未満の間だけ伸長）
    const visited = new Uint8Array(n);
    /** @type {number[]} */ const queue = [];
    const pushSeed = (x, y) => {
        const i = y * width + x;
        if (!visited[i]) { visited[i] = 1; queue.push(i); mask[i] = 0; }
    };
    for (let x = 0; x < width; x++) { pushSeed(x, 0); pushSeed(x, height - 1); }
    for (let y = 0; y < height; y++) { pushSeed(0, y); pushSeed(width - 1, y); }

    const colorDist = (i, j) => {
        const dr = data[i * 4] - data[j * 4];
        const dg = data[i * 4 + 1] - data[j * 4 + 1];
        const db = data[i * 4 + 2] - data[j * 4 + 2];
        return Math.sqrt(dr * dr + dg * dg + db * db);
    };

    while (queue.length) {
        const i = queue.pop();
        const x = i % width;
        const y = (i / width) | 0;
        const neighbors = [
            x > 0 ? i - 1 : -1,
            x < width - 1 ? i + 1 : -1,
            y > 0 ? i - width : -1,
            y < height - 1 ? i + width : -1,
        ];
        for (const j of neighbors) {
            if (j < 0 || visited[j]) continue;
            // 透過は無条件で背景扱い、それ以外は色差がしきい値未満のときだけ伸長
            if (data[j * 4 + 3] < 128 || colorDist(i, j) < floodTolerance) {
                visited[j] = 1;
                mask[j] = 0;
                queue.push(j);
            }
        }
    }

    // 3. 外周の色分布から背景色を推定し、それに近いピクセルを背景とする。
    //    arts の「白枠 → グラデ背景」のように、フラッドフィルが枠と背景の境界で
    //    止まってしまうケースを吸収する（枠も背景も外周に現れるため両方拾える）。
    const borderWidth = Math.max(2, Math.round(Math.min(width, height) * 0.02));
    /** @type {Array<[number,number,number]>} */
    const borderPixels = [];
    for (let y = 0; y < height; y++) {
        const nearTopBottom = y < borderWidth || y >= height - borderWidth;
        for (let x = 0; x < width; x++) {
            if (!nearTopBottom && x >= borderWidth && x < width - borderWidth) continue;
            const i = y * width + x;
            if (data[i * 4 + 3] < 128) continue; // 透過は既に背景
            borderPixels.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
        }
    }
    if (borderPixels.length) {
        const bgColors = medianCut(borderPixels, 4);
        for (let i = 0; i < n; i++) {
            if (!mask[i]) continue;
            for (const bg of bgColors) {
                const dr = data[i * 4] - bg.r;
                const dg = data[i * 4 + 1] - bg.g;
                const db = data[i * 4 + 2] - bg.b;
                if (Math.sqrt(dr * dr + dg * dg + db * db) < bgTolerance) { mask[i] = 0; break; }
            }
        }
    }

    // 4. 線画の黒 / 紙・白飛びを除去
    for (let i = 0; i < n; i++) {
        if (!mask[i]) continue;
        const { s, v } = rgbToHsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
        if (v < darkV) mask[i] = 0;              // 線画・影の黒
        else if (s < paleS && v > paleV) mask[i] = 0; // 紙面・ハイライトの白
    }

    return mask;
}

// ────────────────────────────────────────────────────────────────────────────
// median-cut による色量子化
// ────────────────────────────────────────────────────────────────────────────

/**
 * median-cut 法で代表色を抽出する。
 *
 * @param {Array<[number, number, number]>} pixels  前景ピクセルの RGB 配列
 * @param {number} maxColors  抽出する代表色の最大数
 * @returns {Array<{ r: number, g: number, b: number, count: number }>} 占有ピクセル数の降順
 */
export function medianCut(pixels, maxColors) {
    if (!pixels.length) return [];

    /** @type {Array<Array<[number,number,number]>>} */
    let buckets = [pixels];

    while (buckets.length < maxColors) {
        // 最も色レンジの広いバケットを選んで分割する
        let targetIdx = -1;
        let targetRange = -1;
        let targetAxis = 0;
        buckets.forEach((bucket, idx) => {
            if (bucket.length < 2) return;
            for (let axis = 0; axis < 3; axis++) {
                let min = 255, max = 0;
                for (const p of bucket) {
                    if (p[axis] < min) min = p[axis];
                    if (p[axis] > max) max = p[axis];
                }
                const range = max - min;
                if (range > targetRange) {
                    targetRange = range;
                    targetIdx = idx;
                    targetAxis = axis;
                }
            }
        });
        if (targetIdx < 0 || targetRange <= 0) break; // これ以上分割できない

        const bucket = buckets[targetIdx];
        bucket.sort((a, b) => a[targetAxis] - b[targetAxis]);
        const mid = bucket.length >> 1;
        buckets.splice(targetIdx, 1, bucket.slice(0, mid), bucket.slice(mid));
    }

    return buckets
        .filter(b => b.length)
        .map(bucket => {
            let r = 0, g = 0, b = 0;
            for (const p of bucket) { r += p[0]; g += p[1]; b += p[2]; }
            const c = bucket.length;
            return { r: r / c, g: g / c, b: b / c, count: c };
        })
        .sort((a, b) => b.count - a.count);
}

// ────────────────────────────────────────────────────────────────────────────
// AppearanceDetail の色語との照合
// ────────────────────────────────────────────────────────────────────────────

/**
 * 色語 → HSV 範囲の対応表。`AppearanceDetail` に書かれた色語（JP/EN）と
 * 抽出クラスタを突き合わせ、「この HEX はどの色語に対応しそうか」の根拠を付けるために使う。
 *
 * 範囲はあくまで**照合のヒント**であり、これで色を確定するものではない。
 * hueRange が null の色（白 / 黒 / 灰）は彩度・明度のみで判定する。
 */
const COLOR_WORD_RANGES = [
    { key: 'red', jp: ['赤', '紅'], en: ['red', 'crimson'], hue: [[345, 360], [0, 12]], sMin: 0.35, vMin: 0.25 },
    { key: 'red orange', jp: ['赤橙', '朱'], en: ['red orange', 'vermilion'], hue: [[8, 25]], sMin: 0.35, vMin: 0.3 },
    { key: 'orange', jp: ['橙', 'オレンジ'], en: ['orange'], hue: [[20, 42]], sMin: 0.35, vMin: 0.35 },
    { key: 'yellow', jp: ['黄'], en: ['yellow', 'gold'], hue: [[43, 68]], sMin: 0.3, vMin: 0.4 },
    { key: 'green', jp: ['緑', '碧'], en: ['green'], hue: [[69, 165]], sMin: 0.2, vMin: 0.2 },
    { key: 'cyan', jp: ['水色', '青緑'], en: ['cyan', 'turquoise', 'teal'], hue: [[166, 200]], sMin: 0.2, vMin: 0.3 },
    { key: 'blue', jp: ['青', '藍'], en: ['blue', 'navy'], hue: [[201, 255]], sMin: 0.2, vMin: 0.15 },
    { key: 'purple', jp: ['紫', '菫'], en: ['purple', 'violet', 'lavender'], hue: [[256, 300]], sMin: 0.15, vMin: 0.2 },
    { key: 'pink', jp: ['桃', 'ピンク'], en: ['pink', 'magenta', 'rose'], hue: [[301, 344]], sMin: 0.12, vMin: 0.45 },
    { key: 'brown', jp: ['茶', '褐'], en: ['brown', 'tan'], hue: [[10, 45]], sMin: 0.2, vMin: 0.15, vMax: 0.6 },
    { key: 'white', jp: ['白'], en: ['white', 'cream', 'ivory'], hue: null, sMax: 0.14, vMin: 0.82 },
    { key: 'black', jp: ['黒'], en: ['black'], hue: null, sMax: 0.3, vMax: 0.22 },
    { key: 'gray', jp: ['灰', 'グレー'], en: ['gray', 'grey', 'silver'], hue: null, sMax: 0.14, vMin: 0.22, vMax: 0.82 },
];

/**
 * 抽出クラスタが色語の HSV 範囲に収まるかを判定する。
 * @param {{ h: number, s: number, v: number }} hsv
 * @param {typeof COLOR_WORD_RANGES[number]} def
 * @returns {boolean}
 */
function matchesColorWord(hsv, def) {
    if (def.sMin !== undefined && hsv.s < def.sMin) return false;
    if (def.sMax !== undefined && hsv.s > def.sMax) return false;
    if (def.vMin !== undefined && hsv.v < def.vMin) return false;
    if (def.vMax !== undefined && hsv.v > def.vMax) return false;
    if (!def.hue) return true;
    return def.hue.some(([lo, hi]) => hsv.h >= lo && hsv.h <= hi);
}

/**
 * レコードの `AppearanceDetail` から色語のヒントを収集する。
 * `#DesignAttr_Color` の `value_JP` / `value_EN` と、`#DesignAttr_Overview`
 * （例: "red orange hair"）に含まれる色語を拾う。
 *
 * @param {any} record
 * @returns {Array<{ word: string, bodyPart: string|null, element: string|null, source: string }>}
 */
export function collectColorHints(record) {
    /** @type {Array<{word: string, bodyPart: string|null, element: string|null, source: string}>} */
    const hints = [];
    const details = Array.isArray(record?.AppearanceDetail) ? record.AppearanceDetail : [];

    for (const entry of details) {
        const bodyPart = Array.isArray(entry?.BodyPart) && entry.BodyPart.length ? entry.BodyPart[0] : null;
        const element = entry?.DesignElement ?? null;
        for (const attr of (Array.isArray(entry?.Attrs) ? entry.Attrs : [])) {
            const text = `${attr?.value_JP ?? ''} ${attr?.value_EN ?? ''}`.toLowerCase();
            if (!text.trim()) continue;
            for (const def of COLOR_WORD_RANGES) {
                const hit = def.en.some(w => text.includes(w)) || def.jp.some(w => text.includes(w));
                if (!hit) continue;
                hints.push({
                    word: def.key,
                    bodyPart,
                    element,
                    source: `${attr.AttrLabel ?? '?'}: ${attr.value_EN ?? attr.value_JP ?? ''}`.trim(),
                });
            }
        }
    }
    return hints;
}

/**
 * 抽出クラスタに、`AppearanceDetail` 由来の色語ヒントを紐付ける。
 * 「この HEX は hair の 'red orange' に対応しそう」という根拠を候補へ付与する。
 *
 * @param {Array<{ hex: string, ratio: number, hsv: {h:number,s:number,v:number} }>} candidates
 * @param {ReturnType<typeof collectColorHints>} hints
 * @returns {Array<any>} matchedHints を付与した候補
 */
export function annotateCandidates(candidates, hints) {
    return candidates.map(c => {
        const matched = hints.filter(hint => {
            const def = COLOR_WORD_RANGES.find(d => d.key === hint.word);
            return def ? matchesColorWord(c.hsv, def) : false;
        });
        return { ...c, matchedHints: matched };
    });
}

// ────────────────────────────────────────────────────────────────────────────
// 1 画像からの候補抽出
// ────────────────────────────────────────────────────────────────────────────

/**
 * 画像ファイル 1 枚から配色候補を抽出する。
 *
 * @param {string} imagePath  PNG の絶対パス
 * @param {{ top?: number, sampleStep?: number }} [opts]
 *        top: 返す候補色の最大数 / sampleStep: ピクセルの間引き幅（1 = 全ピクセル）
 * @returns {{ candidates: Array<{hex: string, ratio: number, hsv: any}>, foregroundRatio: number, width: number, height: number }}
 */
export function extractPaletteFromImage(imagePath, opts = {}) {
    const top = opts.top ?? 6;
    const sampleStep = opts.sampleStep ?? 2;

    const img = decodePng(fs.readFileSync(imagePath));
    const mask = buildForegroundMask(img);

    /** @type {Array<[number,number,number]>} */
    const fg = [];
    for (let y = 0; y < img.height; y += sampleStep) {
        for (let x = 0; x < img.width; x += sampleStep) {
            const i = y * img.width + x;
            if (!mask[i]) continue;
            fg.push([img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]]);
        }
    }

    const sampled = Math.ceil(img.width / sampleStep) * Math.ceil(img.height / sampleStep);
    if (!fg.length) {
        return { candidates: [], foregroundRatio: 0, width: img.width, height: img.height };
    }

    const clusters = medianCut(fg, top);
    const total = fg.length;
    const candidates = clusters.map(c => {
        const hsv = rgbToHsv(c.r, c.g, c.b);
        return {
            hex: toHex(c.r, c.g, c.b),
            ratio: Number((c.count / total).toFixed(4)),
            hsv: { h: Math.round(hsv.h), s: Number(hsv.s.toFixed(3)), v: Number(hsv.v.toFixed(3)) },
        };
    });

    return {
        candidates,
        foregroundRatio: Number((total / sampled).toFixed(4)),
        width: img.width,
        height: img.height,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// 画像ソースの解決
// ────────────────────────────────────────────────────────────────────────────

/**
 * レコードの `Images` から、配色抽出に使う画像を優先順に解決する。
 *
 * 優先順: `arts_PNGPath`（清書イラスト。最も色が確定している）
 *       → `corefolder_PNGPath`（コアフォルダ形態。カバレッジ最大）
 *       → `concept_PNGName`（設定画。手書き注釈・白紙面のノイズが多く最後の手段）
 *
 * @param {any} record
 * @param {string} imagesRoot  `data/Works_<work>/Images/DB_<db>` の絶対パス
 * @returns {Array<{ role: string, path: string }>} 実在するファイルのみ
 */
export function resolveImageSources(record, imagesRoot) {
    /** @type {Array<{role: string, path: string}>} */
    const out = [];
    const images = record?.Images ?? {};
    const push = (role, rel) => {
        const p = path.join(imagesRoot, ...`${rel}.png`.split('/'));
        if (fs.existsSync(p)) out.push({ role, path: p });
    };

    for (const rel of (Array.isArray(images.arts_PNGPath) ? images.arts_PNGPath : [])) {
        push('arts', `arts/${rel}`);
    }
    for (const rel of (Array.isArray(images.corefolder_PNGPath) ? images.corefolder_PNGPath : [])) {
        push('corefolder', `corefolder/${rel}`);
    }
    if (typeof images.concept_PNGName === 'string' && images.concept_PNGName) {
        push('concept', `concept/${images.concept_PNGName}`);
    }
    return out;
}

// ────────────────────────────────────────────────────────────────────────────
// ColorPalette 下書きの生成
// ────────────────────────────────────────────────────────────────────────────

/** 占有率の高い順に割り当てる配色役割 */
const COLOR_ROLES = ['#ColorRole_Primary', '#ColorRole_Secondary', '#ColorRole_Accent'];

/**
 * 抽出結果 1 レコード分から `ColorPalette` フィールドの下書きを組み立てる。
 *
 * **埋めるのは機械的に決まる項目だけ**:
 *   - `Role`  : 占有率の降順で Primary / Secondary / Accent を仮割当（要 User 確認）
 *   - `Hex`   : 画像から抽出した代表色
 *   - `AppliesTo`: 抽出色と色語が一致した `AppearanceDetail` の `BodyPart` を**転記**
 *
 * **埋めない項目**（創作内容のため User が入力する）:
 *   - `ColorName_JP` / `ColorName_EN` / `Formation` / `Note_JP` / `Note_EN` は `null` のまま。
 *     判断材料は同レコードの `_evidence` に添える。
 *
 * @param {any} result  `.cache/palette-candidates.json` の results[] の 1 要素
 * @param {number} [maxColors]  下書きに載せる色数（既定 3 = Primary/Secondary/Accent）
 * @returns {{ ColorPalette: any[], _evidence: any } | null}
 */
export function buildColorPaletteDraft(result, maxColors = COLOR_ROLES.length) {
    const images = Array.isArray(result?.images) ? result.images.filter(im => !im.error && im.candidates?.length) : [];
    if (!images.length) return null;

    // 主ソースは resolveImageSources() の優先順（arts → corefolder → concept）に従う。
    // 前景比率の大小で選ぶと、単色のコアフォルダ形態（球体）が humanoid の清書イラストを
    // 押しのけてしまい、髪・衣装・小物を含む配色が取れなくなる。
    // ただし背景除去に失敗して前景がほとんど残らなかった画像は避ける。
    const MIN_FOREGROUND = 0.03;
    const primarySource =
        images.find(im => (im.foregroundRatio ?? 0) >= MIN_FOREGROUND)
        ?? images.slice().sort((a, b) => (b.foregroundRatio ?? 0) - (a.foregroundRatio ?? 0))[0];
    const picks = primarySource.candidates.slice(0, maxColors);

    const palette = picks.map((c, i) => {
        // 色語が一致した BodyPart を転記（重複除去）。既存 AppearanceDetail からの転記であり、
        // 新しい設定を作っているわけではない。
        const bodyParts = [...new Set(
            (c.matchedHints ?? []).map(h => h.bodyPart).filter(Boolean),
        )];
        return {
            Role: COLOR_ROLES[i] ?? null,
            Hex: c.hex,
            ColorName_JP: null,
            ColorName_EN: null,
            AppliesTo: bodyParts.length ? bodyParts : null,
            Formation: null,
            Note_JP: null,
            Note_EN: null,
        };
    });

    return {
        ColorPalette: palette,
        _evidence: {
            source: `${primarySource.role} (${primarySource.file})`,
            foregroundRatio: primarySource.foregroundRatio,
            picks: picks.map((c, i) => ({
                role: COLOR_ROLES[i] ?? null,
                hex: c.hex,
                ratio: c.ratio,
                hsv: c.hsv,
                matchedColorWords: [...new Set((c.matchedHints ?? []).map(h => h.word))],
                matchedSources: [...new Set((c.matchedHints ?? []).map(h => h.source))],
            })),
            otherCandidates: primarySource.candidates.slice(maxColors).map(c => ({ hex: c.hex, ratio: c.ratio })),
            otherImages: images.filter(im => im !== primarySource).map(im => ({
                role: im.role,
                file: im.file,
                top: im.candidates.slice(0, 3).map(c => ({ hex: c.hex, ratio: c.ratio })),
            })),
            appearanceDetailColorWords: (result.hints ?? []).map(h => ({
                word: h.word,
                bodyPart: h.bodyPart,
                source: h.source,
            })),
        },
    };
}

/**
 * 全レコード分の下書きをまとめて `.private/` 向けの JSON 構造へ組み立てる。
 *
 * @param {any} extraction  `.cache/palette-candidates.json` の中身
 * @returns {any}
 */
export function buildDraftDocument(extraction) {
    /** @type {Record<string, any>} */
    const records = {};
    /** @type {Array<string|number>} */
    const skipped = [];

    for (const result of extraction.results ?? []) {
        const draft = buildColorPaletteDraft(result);
        if (!draft) { skipped.push(result.num); continue; }
        records[String(result.num)] = draft;
    }

    return {
        _README: [
            'これは data/Works_' + extraction.work + '/DataBases/db_' + extraction.db + '.json へ',
            '`ColorPalette` フィールドを追記するための「下書きメモ」です（Git 管轄外 / .private）。',
            'tools/extract-palette.mjs が既存画像から機械的に抽出した候補であり、確定値ではありません。',
        ].join('\n'),
        _howToUse: [
            '1. 各レコードの `_evidence` を見て、Hex / Role の妥当性を確認する。',
            '2. `ColorName_JP` / `ColorName_EN` / `Formation` / `Note_*` は空のままなので、User が記入する。',
            '   （これらは創作内容にあたるため、ツールは埋めません）',
            '3. `AppliesTo` は AppearanceDetail の BodyPart からの転記。誤りがあれば修正する。',
            '4. 確定したら `ColorPalette` オブジェクトだけを本体 DB の該当レコードへ貼り付ける',
            '   （`_evidence` は貼り付けない）。',
        ].join('\n'),
        _schema: {
            typedef: 'data/db_meta.json → General.$VarsDef.$Def_ColorPalette',
            field: 'data/db_type.json → $DefType[hashTag=ColorPalette]',
            roleEnum: 'data/db_meta.json → General.$VarsDef.$EnumDef_ColorRole',
            hexType: '#Hexcode_Color（#RRGGBB / #RRGGBBAA）',
        },
        _generatedBy: 'tools/extract-palette.mjs',
        _work: extraction.work,
        _db: extraction.db,
        _skippedRecords: skipped,
        records,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// 実データへの ColorPalette 追記（テキスト挿入 / 書式非破壊）
// ────────────────────────────────────────────────────────────────────────────

/**
 * JSON テキストを走査し、トップレベル配列の各要素（レコード）の範囲を返す。
 *
 * `JSON.parse` → `JSON.stringify` の往復は、prettier が 1 行に畳んでいる短い配列
 * （例: `"corefolder_PNGPath": ["a", "b"]`）をすべて展開してしまい、ファイル全体が
 * 差分になる。そのため `tools/patch-aihints.mjs` と同様、**既存フォーマットを壊さない
 * テキスト挿入**で追記する。本関数はそのための位置特定に使う。
 *
 * @param {string} text  db_*.json の中身（トップレベルは配列）
 * @returns {Array<[number, number]>} 各レコードの [開始, 終了) オフセット（配列順）
 */
export function scanTopLevelRecords(text) {
    /** @type {Array<[number, number]>} */
    const spans = [];
    let depth = 0, inString = false, escaped = false, start = -1;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === '{' || ch === '[') {
            depth++;
            if (depth === 2 && ch === '{') start = i;
        } else if (ch === '}' || ch === ']') {
            if (depth === 2 && ch === '}' && start >= 0) {
                spans.push([start, i + 1]);
                start = -1;
            }
            depth--;
        }
    }
    return spans;
}

/**
 * `"Key":` の値の終端オフセット（値の最後の文字の次）を返す。
 * 文字列・エスケープを尊重して括弧の対応を取る。
 *
 * @param {string} text
 * @param {number} colonIdx  `:` のオフセット
 * @returns {number} 値の終端（次の文字のオフセット）
 * @throws {Error} 値の終端を特定できない場合
 */
export function findValueEnd(text, colonIdx) {
    let i = colonIdx + 1;
    while (i < text.length && /\s/.test(text[i])) i++;
    const ch = text[i];

    if (ch === '[' || ch === '{') {
        const open = ch;
        const close = ch === '[' ? ']' : '}';
        let depth = 0, inString = false, escaped = false;
        for (; i < text.length; i++) {
            const c = text[i];
            if (inString) {
                if (escaped) escaped = false;
                else if (c === '\\') escaped = true;
                else if (c === '"') inString = false;
                continue;
            }
            if (c === '"') { inString = true; continue; }
            if (c === open) depth++;
            else if (c === close) {
                depth--;
                if (depth === 0) return i + 1;
            }
        }
        throw new Error('値の括弧が閉じていません');
    }

    if (ch === '"') {
        let escaped = false;
        for (i++; i < text.length; i++) {
            const c = text[i];
            if (escaped) { escaped = false; continue; }
            if (c === '\\') { escaped = true; continue; }
            if (c === '"') return i + 1;
        }
        throw new Error('文字列が閉じていません');
    }

    // スカラー（number / true / false / null）
    for (; i < text.length; i++) {
        if (text[i] === ',' || text[i] === '}' || text[i] === ']') return i;
    }
    throw new Error('スカラー値の終端を特定できません');
}

/**
 * レコードの `AppearanceDetail` の直後へ `ColorPalette` を挿入したテキストを返す。
 *
 * `$DefType` 上のフィールド順（`AppearanceDetail` → `ColorPalette`）に合わせるため、
 * `AppearanceDetail` の値の直後をアンカーとする。
 *
 * @param {string} text        ファイル全体のテキスト
 * @param {[number, number]} span  対象レコードの範囲
 * @param {any[]} colorPalette 挿入する ColorPalette の値
 * @returns {{ text: string, delta: number }} 挿入後のテキストと、増えた文字数
 * @throws {Error} アンカー（AppearanceDetail）が見つからない場合
 */
export function insertColorPaletteIntoRecord(text, span, colorPalette) {
    const [start, end] = span;
    const record = text.slice(start, end);

    const keyIdx = record.indexOf('"AppearanceDetail"');
    if (keyIdx < 0) throw new Error('AppearanceDetail が見つかりません（挿入位置を決められません）');

    const colonIdx = record.indexOf(':', keyIdx + '"AppearanceDetail"'.length);
    if (colonIdx < 0) throw new Error('AppearanceDetail の : が見つかりません');

    const valueEnd = findValueEnd(record, colonIdx); // レコード内の相対オフセット

    // 値の直後に `,` があるか（後続キーがあるか）で挿入形を変える
    let cursor = valueEnd;
    while (cursor < record.length && /\s/.test(record[cursor])) cursor++;
    const hasTrailingComma = record[cursor] === ',';

    const json = JSON.stringify(colorPalette, null, 2)
        .split('\n')
        .map((line, i) => (i === 0 ? line : `    ${line}`))
        .join('\n');

    // 最終的な整形は prettier に任せる（このファイルは prettier クリーン）
    const insertion = hasTrailingComma
        ? `\n    "ColorPalette": ${json},`
        : `,\n    "ColorPalette": ${json}`;

    const insertAt = start + (hasTrailingComma ? cursor + 1 : valueEnd);
    return {
        text: text.slice(0, insertAt) + insertion + text.slice(insertAt),
        delta: insertion.length,
    };
}

/**
 * 抽出結果を実データ（`db_<db>.json`）へ `ColorPalette` として追記する。
 *
 * **書き込むのは機械的に決まる項目だけ**（`Role` / `Hex` / `AppliesTo`）。
 * `ColorName_JP` / `ColorName_EN` / `Formation` / `Note_*` は創作内容にあたるため
 * `null` のまま残し、User が記入する。
 *
 * @param {string} dbPath       db_*.json の絶対パス
 * @param {any} extraction      抽出結果（`{ results: [...] }`）
 * @param {{ apply?: boolean, force?: boolean }} [opts]
 *        apply: true で書き込む（既定 false = dry-run）/ force: 既存 ColorPalette も上書き
 * @returns {{ applied: Array<any>, skippedExisting: Array<any>, skippedNoImage: Array<any>, errors: Array<{num: any, message: string}> }}
 */
export function applyColorPaletteToDb(dbPath, extraction, opts = {}) {
    const original = fs.readFileSync(dbPath, 'utf8');
    const db = JSON.parse(original);
    const spans = scanTopLevelRecords(original);
    if (spans.length !== db.length) {
        throw new Error(`レコード走査に失敗しました（テキスト ${spans.length} 件 / パース ${db.length} 件）`);
    }

    const draftByNum = new Map();
    for (const result of extraction.results ?? []) {
        const draft = buildColorPaletteDraft(result);
        if (draft) draftByNum.set(String(result.num), draft.ColorPalette);
    }

    const applied = [], skippedExisting = [], skippedNoImage = [], errors = [];

    // 末尾のレコードから挿入する（前方のオフセットが変わらないようにするため）
    let text = original;
    for (let i = db.length - 1; i >= 0; i--) {
        const record = db[i];
        const num = String(record.Num);
        const palette = draftByNum.get(num);

        if (!palette) { skippedNoImage.push(record.Num); continue; }
        if ('ColorPalette' in record && !opts.force) { skippedExisting.push(record.Num); continue; }
        if ('ColorPalette' in record && opts.force) {
            errors.push({ num: record.Num, message: '既存 ColorPalette の上書きは未対応です（手動で削除してください）' });
            continue;
        }

        try {
            const res = insertColorPaletteIntoRecord(text, spans[i], palette);
            text = res.text;
            applied.push(record.Num);
        } catch (err) {
            errors.push({ num: record.Num, message: err.message });
        }
    }

    applied.reverse(); // 走査は逆順だったので表示順を戻す

    if (opts.apply && applied.length) {
        JSON.parse(text); // 壊れた JSON を書かないための最終ガード
        fs.writeFileSync(dbPath, text, 'utf8');
    }

    return { applied, skippedExisting, skippedNoImage, errors };
}

// ────────────────────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────────────────────

/** ヘルプを表示して終了する。 */
function printHelpAndExit() {
    console.log(`
extract-palette.mjs — キャラクター画像からの配色候補抽出（入力補助）

使い方:
  node tools/extract-palette.mjs --work <Work> --db <Db> [--records 1,2 | --all] [オプション]

オプション:
  --work <name>     作品名（既定: NumberTales）
  --db <name>       DB 名（既定: Primary）
  --records <list>  対象 Num（カンマ区切り / 範囲 "1-20" 可）
  --all             全レコードを対象にする
  --top <n>         1 画像あたりの候補色数（既定: 6）
  --out <path>      抽出結果の出力先 JSON（既定: .cache/palette-candidates.json）
  --draft <path>    ColorPalette 追記用の下書きメモを出力する
                    （例: --draft data/Works_NumberTales/DataBases/.private/ColorPalette-draft_db_Primary.json）
  --apply           抽出結果を実データ（db_<db>.json）へ ColorPalette として追記する
                    未指定時は dry-run（何件追記されるかを表示するだけ）
  -v, --verbose     各候補色を標準出力にも表示
  -h, --help        このヘルプ

--apply が書き込む項目（機械的に決まるもの）:
  Role       占有率の降順で Primary / Secondary / Accent を仮割当（要 User 確認）
  Hex        画像から抽出した代表色（#Hexcode_Color）
  AppliesTo  色語が一致した AppearanceDetail の BodyPart を転記

--apply が書き込まない項目（創作内容のため User が記入する）:
  ColorName_JP / ColorName_EN / Formation / Note_JP / Note_EN は null のまま

注意:
  既存フォーマットを壊さないようテキスト挿入で追記します（AppearanceDetail の直後）。
  既に ColorPalette を持つレコードはスキップします。
`);
    process.exit(0);
}

/**
 * `--records 1,3,5-8` 形式を Set<number|string> へ展開する。
 * @param {string} spec
 * @returns {Set<any>}
 */
function parseRecordSpec(spec) {
    const set = new Set();
    for (const part of spec.split(',')) {
        const t = part.trim();
        if (!t) continue;
        const m = t.match(/^(\d+)-(\d+)$/);
        if (m) {
            for (let i = Number(m[1]); i <= Number(m[2]); i++) set.add(i);
        } else if (/^\d+$/.test(t)) {
            set.add(Number(t));
        } else {
            set.add(t); // "2-alt" / "000" 等の特殊 Num
        }
    }
    return set;
}

/** CLI エントリポイント。 */
function main() {
    const argv = process.argv.slice(2);
    if (argv.includes('-h') || argv.includes('--help')) printHelpAndExit();

    let work = 'NumberTales';
    let db = 'Primary';
    let records = null;
    let all = false;
    let top = 6;
    let outPath = path.join(REPO_ROOT, '.cache', 'palette-candidates.json');
    let draftPath = null;
    let verbose = false;
    let apply = false;

    for (let i = 0; i < argv.length; i++) {
        switch (argv[i]) {
            case '--work': work = argv[++i]; break;
            case '--db': db = argv[++i]; break;
            case '--records': records = parseRecordSpec(argv[++i]); break;
            case '--all': all = true; break;
            case '--top': top = Number(argv[++i]); break;
            case '--out': outPath = path.resolve(REPO_ROOT, argv[++i]); break;
            case '--draft': draftPath = path.resolve(REPO_ROOT, argv[++i]); break;
            case '--apply': apply = true; break;
            case '-v': case '--verbose': verbose = true; break;
            default:
                if (argv[i].startsWith('-')) { console.error(`未知のオプション: ${argv[i]}`); process.exit(1); }
        }
    }
    if (!all && !records) {
        console.error('--records か --all を指定してください（--help でヘルプ）');
        process.exit(1);
    }

    // 入力検証（pkg/ と同じ安全トークン規約に合わせる）
    if (!/^[A-Za-z0-9_]+$/.test(work) || !/^[A-Za-z0-9_]+$/.test(db)) {
        console.error('work / db は英数字とアンダースコアのみ許可されます');
        process.exit(1);
    }

    const dbPath = path.join(REPO_ROOT, 'data', `Works_${work}`, 'DataBases', `db_${db}.json`);
    const imagesRoot = path.join(REPO_ROOT, 'data', `Works_${work}`, 'Images', `DB_${db}`);
    if (!fs.existsSync(dbPath)) { console.error(`DB が見つかりません: ${dbPath}`); process.exit(1); }

    const raw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const allRecords = Object.values(raw).filter(r => r && typeof r === 'object' && r.Num !== undefined);

    const results = [];
    let noImage = 0;

    for (const record of allRecords) {
        const num = record.Num;
        if (!all && !records.has(num)) continue;

        const sources = resolveImageSources(record, imagesRoot);
        if (!sources.length) {
            noImage++;
            results.push({ num, sources: [], hints: collectColorHints(record), images: [], note: 'no image asset' });
            continue;
        }

        const hints = collectColorHints(record);
        const images = [];
        for (const src of sources.slice(0, 3)) { // 1 レコードあたり最大 3 枚まで
            try {
                const ext = extractPaletteFromImage(src.path, { top });
                images.push({
                    role: src.role,
                    file: path.relative(REPO_ROOT, src.path).split(path.sep).join('/'),
                    foregroundRatio: ext.foregroundRatio,
                    candidates: annotateCandidates(ext.candidates, hints),
                });
            } catch (err) {
                images.push({
                    role: src.role,
                    file: path.relative(REPO_ROOT, src.path).split(path.sep).join('/'),
                    error: err.message,
                });
            }
        }
        results.push({ num, hints, images });

        if (verbose) {
            console.log(`#${num}`);
            for (const im of images) {
                if (im.error) { console.log(`  [${im.role}] ERROR: ${im.error}`); continue; }
                const top3 = im.candidates.slice(0, 3)
                    .map(c => `${c.hex}(${Math.round(c.ratio * 100)}%)`).join(' ');
                console.log(`  [${im.role}] fg=${Math.round(im.foregroundRatio * 100)}% ${top3}`);
            }
        }
    }

    const extraction = { work, db, generatedFrom: 'tools/extract-palette.mjs', results };

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(extraction, null, 2), 'utf8');

    const withImages = results.filter(r => r.images?.length).length;
    console.log(`\n対象 ${results.length} 件 / 画像あり ${withImages} 件 / 画像なし ${noImage} 件`);
    console.log(`出力: ${path.relative(REPO_ROOT, outPath).split(path.sep).join('/')}`);

    if (draftPath) {
        const draft = buildDraftDocument(extraction);
        fs.mkdirSync(path.dirname(draftPath), { recursive: true });
        fs.writeFileSync(draftPath, JSON.stringify(draft, null, 2), 'utf8');
        const drafted = Object.keys(draft.records).length;
        console.log(`下書き: ${path.relative(REPO_ROOT, draftPath).split(path.sep).join('/')}（${drafted} 件 / 画像なしでスキップ ${draft._skippedRecords.length} 件）`);
    }

    // 実データへの追記（既定は dry-run）
    const res = applyColorPaletteToDb(dbPath, extraction, { apply });
    console.log(`\n[ColorPalette 追記${apply ? '' : ' / dry-run'}]`);
    console.log(`  追記: ${res.applied.length} 件`);
    console.log(`  スキップ（画像なし）: ${res.skippedNoImage.length} 件${res.skippedNoImage.length ? ` → ${res.skippedNoImage.join(', ')}` : ''}`);
    if (res.skippedExisting.length) {
        console.log(`  スキップ（既に ColorPalette あり）: ${res.skippedExisting.length} 件`);
    }
    if (res.errors.length) {
        console.log(`  エラー: ${res.errors.length} 件`);
        for (const e of res.errors) console.log(`    #${e.num}: ${e.message}`);
    }
    if (apply && res.applied.length) {
        console.log(`  → ${path.relative(REPO_ROOT, dbPath).split(path.sep).join('/')} を更新しました`);
        console.log('  ※ 仕上げに `npx prettier --write` を実行してください。');
    } else if (!apply) {
        console.log('  （--apply を付けると実際に書き込みます）');
    }

    console.log('\n※ Hex は画像からの機械計測値、Role は占有率順の仮割当です。');
    console.log('※ 色名（ColorName_*）・Formation・Note は創作内容のため null のままです。User が記入してください。');
}

// 直接実行されたときだけ CLI を動かす（テストからの import では実行しない）
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    main();
}
