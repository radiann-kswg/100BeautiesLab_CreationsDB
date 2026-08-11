/**
 * patch-colorpalette.mjs
 *
 * 設定画に描き込まれた **カラーチップ**（配色見本）を読み取り、各レコードへ
 * `ColorPalette` フィールドを追記・更新する自動パッチツール。
 *
 * 目的:
 * - 作者が設定画に描いた配色（5〜6 色）を、DB の構造化フィールドとして取り込む。
 * - `AIHints.palette_priority` を「画像を目視しないと決まらない値」から
 *   「DB から機械導出できる構造由来の値」へ格上げするための土台にする。
 *
 * 設計原則（CLAUDE.md 準拠）:
 * - **創作内容の自動生成はしない。** 書き込むのは機械的に決まる項目だけ:
 *     Role      … キャラ画像での実測被覆率の降順で Primary / Secondary / Accent / Sub
 *     Hex       … 設定画のカラーチップから読み取った作者指定の色（計測値であり創作ではない）
 *     AppliesTo … 色語が一致した AppearanceDetail の BodyPart を **転記**
 *   `ColorName_JP` / `ColorName_EN` / `Formation` / `Note_*` は **null のまま**残す
 *   （色に名前を付ける行為は創作にあたるため、User が記入する）。
 * - **既存フォーマットを壊さない。** `JSON.parse`/`stringify` の往復は prettier が 1 行に
 *   畳んでいる短い配列をすべて展開してしまうため、テキスト挿入で追記する
 *   （`tools/patch-aihints.mjs` と同じ方針）。
 * - **既定は dry-run。** 書き込みには `--apply` が必須。
 *
 * 作品非依存:
 *   `--work` / `--db` を変えれば他作品・他 DB にも同じ手順で適用できる。
 *   画像は `data/Works_<work>/Images/DB_<db>/concept|catalog/` の規約に従う。
 *
 * CLI 使い方:
 *   node tools/patch-colorpalette.mjs --work NumberTales --db Primary --all
 *   node tools/patch-colorpalette.mjs --work NumberTales --db Primary --all --apply
 *   node tools/patch-colorpalette.mjs --work NumberTales --db Primary --records 1,4,48 -v
 *   node tools/patch-colorpalette.mjs --work NumberTales --db Primary --all --apply --force
 *
 * @author 100BeautiesLab.
 * @version 0.1.0
 * @dependencies tools/extract-palette.mjs（PNG デコード / チップ検出 / 被覆率実測）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    decodePng,
    hexToRgb,
    buildForegroundMask,
    detectSwatchChips,
    measurePaletteCoverage,
    collectColorHints,
    resolveImageSources,
    scanTopLevelRecords,
    findValueEnd,
    colorDistance,
    colorWordMatchesHex,
    extractSolidColors,
    isTransparentArtwork,
    listImageFields,
    readCommonColors,
} from './extract-palette.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

/** 被覆率の降順で割り当てる配色役割。4 色目以降はすべて Sub。 */
const ROLE_ORDER = ['#ColorRole_Primary', '#ColorRole_Secondary', '#ColorRole_Accent'];
const ROLE_REST = '#ColorRole_Sub';

/**
 * チップ検出に使う設定画の優先順（concept を正とし、無ければ catalog）。
 *
 * 作品別 `db_type.json` の `Images` に `$palette: { "source": "swatch" }` が
 * 宣言されていればそちらが優先され、この表は宣言が無い作品のフォールバックとして残る。
 */
const SWATCH_SOURCES = [
    { role: 'concept', dir: 'concept', key: 'concept_PNGName' },
    { role: 'catalog', dir: 'catalog', key: 'catalog_PNGName' },
];

/**
 * 配色検出に使う画像フィールドを、typedef の `$palette.source` 宣言から解決する。
 *
 * 宣言が無い作品では `fallback` をそのまま返すので、既存の作品は挙動が変わらない。
 * 順序は `db_type.json` の宣言順＝作者が意図した優先順とみなす。
 *
 * @param {string|null} workDir  `data/Works_<work>` の絶対パス（null ならフォールバック）
 * @param {'swatch'|'artwork'} source
 * @param {Array<{role: string, dir: string, key: string}>} [fallback]
 * @returns {Array<{role: string, dir: string, key: string}>}
 */
export function resolvePaletteImageFields(workDir, source, fallback = []) {
    if (!workDir) return fallback;
    const declared = listImageFields(workDir).filter(f => f.paletteSource === source);
    if (!declared.length) return fallback;
    return declared.map(f => ({ role: f.folder, dir: f.folder, key: f.field }));
}

// ────────────────────────────────────────────────────────────────────────────
// レコード単位の処理
// ────────────────────────────────────────────────────────────────────────────

/**
 * レコードの設定画からカラーチップを検出する。
 *
 * @param {any} record
 * @param {string} imagesRoot  `data/Works_<work>/Images/DB_<db>` の絶対パス
 * @returns {{ chips: Array<{hex: string, count: number}>, source: string|null }}
 */
export function detectChipsForRecord(record, imagesRoot, manualChips = null, workDir = null) {
    // 手入力されたカラーコードがあれば、検出より優先する。
    // 設定画のチップが小さく・淡く・密に重なっているなどの理由で自動検出できない
    // レコード（例: NumberTales Num 40）で、User が読み取った値を渡すための経路。
    // 検出結果と同じ扱いで被覆率ランキング・AppliesTo 転記に載る。
    if (Array.isArray(manualChips) && manualChips.length) {
        return {
            chips: manualChips.map(hex => ({ hex, count: 0 })),
            source: 'manual',
        };
    }

    for (const src of resolvePaletteImageFields(workDir, 'swatch', SWATCH_SOURCES)) {
        const name = record?.Images?.[src.key];
        if (typeof name !== 'string' || !name) continue;
        const file = path.join(imagesRoot, src.dir, `${name}.png`);
        if (!fs.existsSync(file)) continue;
        let chips = [];
        try {
            chips = detectSwatchChips(decodePng(fs.readFileSync(file)));
        } catch {
            continue;
        }
        if (chips.length) {
            return { chips, source: `${src.role}/${name}.png` };
        }
    }
    return { chips: [], source: null };
}

/**
 * レコードの `Images` から、透過キャラクター単体イラストを解決する。
 *
 * 対象フィールドは作品別 `db_type.json` の `$palette: { "source": "artwork" }` 宣言から取る。
 * `corefolder_PNGPath`（ナンバーテールズ）/ `keycapper_PNGPath`（ハンカクライブ）といった
 * 名前をここへ書かないためで、衣装差分のように「透過だが配色の基準にしたくない」画像を
 * 宣言で外せるのが利点。宣言が無い作品では全フィールドを候補にし、**透過率で判定**して
 * 背景付きの設定画・清書イラストを自動的に落とす。
 *
 * @param {any} record
 * @param {string} workDir     `data/Works_<work>` の絶対パス
 * @param {string} imagesRoot  `data/Works_<work>/Images/DB_<db>` の絶対パス
 * @returns {Array<{ folder: string, path: string }>} 実在するファイルのみ
 */
export function resolveArtworkSources(record, workDir, imagesRoot) {
    const images = record?.Images ?? {};
    const anyField = listImageFields(workDir).map(f => ({ role: f.folder, dir: f.folder, key: f.field }));
    /** @type {Array<{folder: string, path: string}>} */
    const out = [];
    for (const { dir: folder, key: field } of resolvePaletteImageFields(workDir, 'artwork', anyField)) {
        const value = images[field];
        const rels = Array.isArray(value) ? value : (typeof value === 'string' && value ? [value] : []);
        for (const rel of rels) {
            if (typeof rel !== 'string' || !rel) continue;
            // `keycapper_PNGPath` は拡張子込み、`corefolder_PNGPath` は拡張子なしで記録されている
            const name = rel.toLowerCase().endsWith('.png') ? rel : `${rel}.png`;
            const p = path.join(imagesRoot, folder, ...name.split('/'));
            if (fs.existsSync(p)) out.push({ folder, path: p });
        }
    }
    return out;
}

/**
 * 透過キャラクター単体イラストからレコードの配色を抽出する。
 *
 * 設定画のカラーチップが取れなかったレコード向けの経路（`--from-artwork`）。
 * 同一レコードに複数枚あれば合算する（コアフォルダが 2 枚ある Num 1 など）。
 *
 * @param {any} record
 * @param {string} workDir
 * @param {string} imagesRoot
 * @param {{ exclude?: string[], minRatio?: number }} [opt]
 * @returns {{ colors: Array<{hex: string, ratio: number}>, source: string|null }}
 */
export function detectArtworkColorsForRecord(record, workDir, imagesRoot, opt = {}) {
    /** @type {import('./extract-palette.mjs').DecodedImage[]} */
    const decoded = [];
    /** @type {string[]} */
    const used = [];

    for (const src of resolveArtworkSources(record, workDir, imagesRoot)) {
        let img;
        try {
            img = decodePng(fs.readFileSync(src.path));
        } catch {
            continue;
        }
        if (!isTransparentArtwork(img)) continue; // 背景付きの画像は配色抽出に使わない
        decoded.push(img);
        used.push(`${src.folder}/${path.basename(src.path)}`);
    }
    if (!decoded.length) return { colors: [], source: null };

    const colors = extractSolidColors(decoded, opt);
    return { colors, source: colors.length ? `artwork:${used.join('+')}` : null };
}

/**
 * チップの並びを、キャラクター画像での実測被覆率の降順に並べ替える。
 *
 * カラーチップは「どの色を使うか」しか示さないため、主従（Primary / Secondary / …）は
 * 実際の作画を測って決める。測定対象は `resolveImageSources()` の優先順
 * （arts → corefolder → concept）で最初に見つかった画像。
 *
 * 測定できる画像が無い場合は、チップの面積（設定画上での大きさ）順にフォールバックする。
 *
 * @param {Array<{hex: string, count: number}>} chips
 * @param {any} record
 * @param {string} imagesRoot
 * @returns {{ ordered: Array<{hex: string, coverage: number|null}>, measuredOn: string|null }}
 */
export function rankChipsByCoverage(chips, record, imagesRoot) {
    const hexes = chips.map(c => c.hex);
    const sources = resolveImageSources(record, imagesRoot)
        .filter(s => s.role !== 'concept'); // 設定画は注釈だらけなので被覆率の測定には使わない

    for (const src of sources) {
        let coverage;
        try {
            coverage = measurePaletteCoverage(decodePng(fs.readFileSync(src.path)), hexes);
        } catch {
            continue;
        }
        if (!coverage.some(c => c > 0)) continue;
        const ordered = hexes
            .map((hex, i) => ({ hex, coverage: coverage[i] }))
            .sort((a, b) => b.coverage - a.coverage);
        return { ordered, measuredOn: path.relative(REPO_ROOT, src.path).split(path.sep).join('/') };
    }

    // フォールバック: 設定画上でのチップの大きさ順
    const ordered = chips
        .slice()
        .sort((a, b) => b.count - a.count)
        .map(c => ({ hex: c.hex, coverage: null }));
    return { ordered, measuredOn: null };
}

/**
 * 抽出した配色から `ColorPalette` フィールドの値を組み立てる。
 *
 * @param {Array<{hex: string, coverage: number|null}>} ordered  被覆率の降順に並んだ配色
 * @param {ReturnType<typeof collectColorHints>} hints  AppearanceDetail の色語ヒント
 * @returns {any[]}
 */
export function buildColorPaletteValue(ordered, hints) {
    return ordered.map((entry, i) => {
        const bodyParts = [...new Set(
            hints
                .filter(h => colorWordMatchesHex(h.word, entry.hex))
                .map(h => h.bodyPart)
                .filter(Boolean),
        )];
        return {
            Role: ROLE_ORDER[i] ?? ROLE_REST,
            Hex: entry.hex,
            ColorName_JP: null,
            ColorName_EN: null,
            AppliesTo: bodyParts.length ? bodyParts : null,
            Formation: null,
            Note_JP: null,
            Note_EN: null,
        };
    });
}

// ────────────────────────────────────────────────────────────────────────────
// 配色スロット（並び順・Role・色名の確定）
// ────────────────────────────────────────────────────────────────────────────

/**
 * 配色スロット表。**この並びがそのまま `ColorPalette` の出力順**になる。
 *
 * `Hex`（作者指定色）は既に確定しているが、「その色がキャラクターの何を担っているか」は
 * 画像を見ないと決まらない。スロットはその担当を 7 枠に固定したもので、枠が決まれば
 * `Role` と `ColorName_JP/EN` は機械的に定まる（＝創作内容の生成にあたらない）。
 *
 * 基準は NumberTales の Num 1（`NTS-1`）。User の確定により:
 * - 「主色(衣装)」の Role は `#ColorRole_Primary`（スロット名と Role が 1:1 対応する）
 * - 「副色(衣装) @Secondary」の枠は**運用しない**。衣装のセカンダリは常に
 *   `secondaryCostume`（`#ColorRole_Sub`）へ入れる
 *
 * @type {ReadonlyArray<{key: string, nameJP: string, nameEN: string, role: string, group: string, annotate?: boolean}>}
 */
export const COLOR_SLOTS = [
    { key: 'primary', nameJP: '主色', nameEN: 'Primary Color', role: '#ColorRole_Primary', group: 'base' },
    { key: 'primaryCostume', nameJP: '主色(衣装)', nameEN: 'Primary Color (Costume)', role: '#ColorRole_Primary', group: 'costume' },
    { key: 'secondary', nameJP: '副色', nameEN: 'Secondary Color', role: '#ColorRole_Secondary', group: 'base' },
    { key: 'accentMain', nameJP: 'メインアクセントカラー', nameEN: 'Main Accent Color', role: '#ColorRole_Accent', group: 'accent', annotate: true },
    { key: 'accentSub', nameJP: 'サブアクセントカラー', nameEN: 'Sub Accent Color', role: '#ColorRole_Accent', group: 'accent', annotate: true },
    { key: 'secondaryCostume', nameJP: '副色（衣装）', nameEN: 'Secondary Color (Costume)', role: '#ColorRole_Sub', group: 'costume' },
    { key: 'auxiliary', nameJP: '補助色', nameEN: 'Auxiliary Color', role: '#ColorRole_Sub', group: 'aux' },
];

/** 地毛（髪・耳・尻尾）とみなす部位。共通造形色以外の体毛はここに含める。 */
const BASE_PARTS = new Set(['#BodyPart_Hair', '#BodyPart_Ear', '#BodyPart_Tail']);
/** アクセント（瞳）とみなす部位。 */
const ACCENT_PARTS = new Set(['#BodyPart_Eye']);
/** 衣装とみなす DesignElement。 */
const COSTUME_ELEMENTS = new Set(['#Element_CostumeItem']);

/**
 * スロットの色名を組み立てる。
 *
 * アクセント枠だけは NTS-1 に倣って部位注記を付ける
 * （`メインアクセントカラー（瞳, アクセサリー）` / `Main Accent Color (Eye Color, Accessory Color)`）。
 * 注記の中身は `AppliesTo` から機械的に決まる: 瞳が含まれれば「瞳」、
 * 瞳以外の部位が含まれれば「アクセサリー」。
 *
 * @param {{nameJP: string, nameEN: string, annotate?: boolean}} slot
 * @param {string[]|null|undefined} appliesTo
 * @returns {{ jp: string, en: string }}
 */
export function buildSlotColorName(slot, appliesTo) {
    const parts = Array.isArray(appliesTo) ? appliesTo : [];
    if (!slot.annotate || !parts.length) return { jp: slot.nameJP, en: slot.nameEN };

    const hasEye = parts.some(p => ACCENT_PARTS.has(p));
    const hasOther = parts.some(p => !ACCENT_PARTS.has(p));
    const jp = [hasEye ? '瞳' : null, hasOther ? 'アクセサリー' : null].filter(Boolean);
    const en = [hasEye ? 'Eye Color' : null, hasOther ? 'Accessory Color' : null].filter(Boolean);
    return {
        jp: `${slot.nameJP}（${jp.join(', ')}）`,
        en: `${slot.nameEN} (${en.join(', ')})`,
    };
}

/**
 * スロット割当に従って `ColorPalette` を並べ替え、`Role` と `ColorName_JP/EN` を確定する。
 *
 * **`Hex` / `Formation` / `Note_JP` / `Note_EN` は既存値をそのまま持ち越す**
 * （作者指定色と創作内容には触らない）。`AppliesTo` は割当側が指定したときだけ差し替える。
 *
 * 割当に載っていない色は **黙って補助色へ流さず** `unassigned` として返す。
 * 「7 枠のどれに当てはまるか判らない色は User に聞く」という運用のための返り値で、
 * 呼び出し側はこれが空でないレコードをスキップする。
 *
 * @param {any[]} palette  既存の `ColorPalette`（`Hex` が同一性の鍵）
 * @param {Array<{slot: string, hex: string, appliesTo?: string[]|null}>} assignment
 * @returns {{ value: any[], unassigned: string[] }}
 * @throws {Error} 割当に未知のスロット名、または既存パレットに無い Hex が含まれる場合
 */
export function applySlotAssignment(palette, assignment) {
    const rows = new Map();
    for (const row of Array.isArray(palette) ? palette : []) {
        if (typeof row?.Hex === 'string') rows.set(row.Hex.toUpperCase(), row);
    }

    const slotIndex = new Map(COLOR_SLOTS.map((s, i) => [s.key, i]));
    /** @type {Array<{order: number, seq: number, row: any}>} */
    const out = [];
    const used = new Set();

    assignment.forEach((entry, seq) => {
        const order = slotIndex.get(entry.slot);
        if (order === undefined) throw new Error(`未知のスロット名です: ${entry.slot}`);
        const hex = String(entry.hex ?? '').toUpperCase();
        const base = rows.get(hex);
        if (!base) throw new Error(`既存の ColorPalette に無い Hex です: ${entry.hex}`);

        const slot = COLOR_SLOTS[order];
        const appliesTo = entry.appliesTo === undefined ? base.AppliesTo : entry.appliesTo;
        const name = buildSlotColorName(slot, appliesTo);

        used.add(hex);
        out.push({
            order,
            seq,
            row: {
                Role: slot.role,
                Hex: base.Hex,
                ColorName_JP: name.jp,
                ColorName_EN: name.en,
                AppliesTo: Array.isArray(appliesTo) && appliesTo.length ? appliesTo : null,
                Formation: base.Formation ?? null,
                Note_JP: base.Note_JP ?? null,
                Note_EN: base.Note_EN ?? null,
            },
        });
    });

    out.sort((a, b) => a.order - b.order || a.seq - b.seq);
    const unassigned = [...rows.keys()].filter(h => !used.has(h)).map(h => rows.get(h).Hex);
    return { value: out.map(o => o.row), unassigned };
}

/**
 * 1 レコード分の判定材料を集める。
 *
 * スロットは画像を見ないと決まらないため、ここでは**根拠だけ**を揃えて返す:
 * - `covBall` … 球体型姿（`$palette.source: artwork`。コアフォルダ / キーキャッパー等）での被覆率
 * - `covArt`  … 人姿イラスト（`arts`）での被覆率
 * - `hints`   … `AppearanceDetail` の色語が一致した部位・DesignElement
 *
 * 球体型姿は原則として衣装を含まないため、`covBall` と `covArt` の差が
 * 「地毛か衣装か」の一次判定になる（ただし近似色が競合すると外れるので確定材料にはしない）。
 *
 * @param {any} record
 * @param {string} workDir
 * @param {string} imagesRoot
 * @returns {Array<{hex: string, covBall: number, covArt: number, hints: Array<{word: string, bodyPart: string|null, element: string|null, source: string}>}>}
 */
export function collectSlotEvidence(record, workDir, imagesRoot) {
    const hexes = (Array.isArray(record?.ColorPalette) ? record.ColorPalette : [])
        .map(c => c?.Hex).filter(h => typeof h === 'string');
    if (!hexes.length) return [];

    /** 複数枚ある場合は最大値を採る（衣装差分等で片方にしか出ない色を落とさないため） */
    const maxCoverage = (files) => {
        const best = new Array(hexes.length).fill(0);
        for (const file of files) {
            let cov;
            try {
                cov = measurePaletteCoverage(decodePng(fs.readFileSync(file)), hexes);
            } catch {
                continue;
            }
            cov.forEach((c, i) => { if (c > best[i]) best[i] = c; });
        }
        return best;
    };

    const ballFiles = resolveArtworkSources(record, workDir, imagesRoot).map(s => s.path);
    const artFiles = resolveImageSources(record, imagesRoot)
        .filter(s => s.role === 'arts').map(s => s.path);

    const covBall = maxCoverage(ballFiles);
    const covArt = maxCoverage(artFiles);
    const allHints = collectColorHints(record);

    return hexes.map((hex, i) => ({
        hex,
        covBall: covBall[i],
        covArt: covArt[i],
        hints: allHints.filter(h => colorWordMatchesHex(h.word, hex)),
    }));
}

/** 帯ラベル（前景の外接矩形を縦 5 等分した目盛り。部位そのものではない） */
export const BAND_LABELS = ['頭', '上', '中', '下', '足'];

/**
 * 各配色が前景の**どの高さ帯**に分布しているかを測る。
 *
 * `renderColorMap()` の図を数値へ畳んだもの。図は 1 件あたり 40 行あって読む側の負担が
 * 大きいが、帯ごとの割合だけなら 1 色 1 行で足りる。髪は `頭` に偏り、尻尾の先端は
 * `下`〜`足`、衣装は `上`〜`中`、靴は `足` に出る、という読み方をする。
 *
 * 被覆率（`measurePaletteCoverage()`）が「どれだけ使われているか」なのに対し、
 * こちらは「どこに使われているか」。近似色は前者では潰れるが後者では分かれる。
 *
 * @param {import('./extract-palette.mjs').DecodedImage} img
 * @param {string[]} hexes
 * @param {{maxDist?: number}} [opt]
 * @returns {Array<{ share: number, bands: number[] }>} hexes と同じ並び。bands の合計は 1
 */
export function profileColorBands(img, hexes, opt = {}) {
    const maxDist = opt.maxDist ?? 45;
    const rgbs = hexes.map(hexToRgb);
    const fg = isTransparentArtwork(img) ? null : buildForegroundMask(img);

    /** @type {Array<{y: number, k: number}>} */
    const hits = [];
    let minY = Infinity, maxY = -Infinity;
    for (let y = 0; y < img.height; y += 2) {
        for (let x = 0; x < img.width; x += 2) {
            const i = y * img.width + x;
            if (img.data[i * 4 + 3] < 128) continue;
            if (fg && !fg[i]) continue;
            const r = img.data[i * 4], g = img.data[i * 4 + 1], b = img.data[i * 4 + 2];
            if (r > 245 && g > 245 && b > 245) continue; // 紙面
            if (r < 60 && g < 60 && b < 60) continue;    // 線画
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            let best = -1, bestD = Infinity;
            for (let k = 0; k < rgbs.length; k++) {
                const d = (r - rgbs[k][0]) ** 2 + (g - rgbs[k][1]) ** 2 + (b - rgbs[k][2]) ** 2;
                if (d < bestD) { bestD = d; best = k; }
            }
            if (best >= 0 && bestD <= maxDist * maxDist) hits.push({ y, k: best });
        }
    }

    const out = hexes.map(() => ({ share: 0, bands: [0, 0, 0, 0, 0] }));
    if (!hits.length || maxY <= minY) return out;

    const span = (maxY - minY) + 1;
    for (const h of hits) {
        out[h.k].bands[Math.min(4, Math.floor(((h.y - minY) / span) * 5))]++;
        out[h.k].share++;
    }
    return out.map(o => ({
        share: Number((o.share / hits.length).toFixed(3)),
        bands: o.share ? o.bands.map(b => Number((b / o.share).toFixed(2))) : [0, 0, 0, 0, 0],
    }));
}

/**
 * 判定材料からスロット割当の**下書き**を作る。
 *
 * 確定ではなく、User / エージェントが画像を見て直すための叩き台。
 * 判定できなかった色は `auxiliary` へ流さず `unassigned` に残す
 * （「どれに当てはまるか判らない色は聞く」運用のため）。
 *
 * 判定順（上ほど強い根拠）:
 *   1. 色語が瞳（`#BodyPart_Eye`）に一致 → accent
 *   2. 色語が衣装（`#Element_CostumeItem`）に一致 → costume
 *   3. 色語が地毛（髪・耳・尻尾）に一致 → base
 *   4. どれでもない → unassigned
 * 各グループ内は被覆率の降順（base は球体型姿、costume は人姿を優先して見る）。
 *
 * **信頼度について**: 根拠に使う `AppearanceDetail` の `BodyPart` / `DesignElement` 自体が
 * 画像を見て手動修正された経緯を持つため、この下書きを検証なしで適用しないこと。
 * 近似色が競合すると被覆率も入れ替わる（NTS-1 の `#FFAC8F` / `#FFBFA7` が実例）。
 *
 * @param {ReturnType<typeof collectSlotEvidence>} evidence
 * @returns {{ assignment: Array<{slot: string, hex: string, appliesTo: string[]|null}>, unassigned: string[] }}
 */
export function proposeSlotAssignment(evidence) {
    /** @type {Record<string, Array<{hex: string, rank: number, parts: string[]}>>} */
    const groups = { base: [], costume: [], accent: [] };
    /** @type {string[]} */
    const unassigned = [];

    for (const ev of evidence) {
        const parts = [...new Set(ev.hints.map(h => h.bodyPart).filter(Boolean))];
        const group =
            parts.some(p => ACCENT_PARTS.has(p)) ? 'accent'
                : ev.hints.some(h => COSTUME_ELEMENTS.has(h.element)) ? 'costume'
                    : parts.some(p => BASE_PARTS.has(p)) ? 'base'
                        : null;
        if (!group) { unassigned.push(ev.hex); continue; }

        // base は球体型姿、costume/accent は人姿での見え方を主にランク付けする
        const rank = group === 'base' ? Math.max(ev.covBall, ev.covArt) : Math.max(ev.covArt, ev.covBall);
        const scoped = group === 'base' ? parts.filter(p => BASE_PARTS.has(p))
            : group === 'costume' ? parts.filter(p => !ACCENT_PARTS.has(p))
                : parts;
        groups[group].push({ hex: ev.hex, rank, parts: scoped });
    }

    /** @type {Array<{slot: string, hex: string, appliesTo: string[]|null}>} */
    const assignment = [];
    /** グループごとの割当先スロット。溢れた分は判断が要るので unassigned へ回す。 */
    const slotsFor = { base: ['primary', 'secondary'], costume: ['primaryCostume', 'secondaryCostume'], accent: ['accentMain', 'accentSub'] };

    for (const [group, slots] of Object.entries(slotsFor)) {
        groups[group].sort((a, b) => b.rank - a.rank).forEach((item, i) => {
            if (i >= slots.length) { unassigned.push(item.hex); return; }
            assignment.push({ slot: slots[i], hex: item.hex, appliesTo: item.parts.length ? item.parts : null });
        });
    }
    return { assignment, unassigned };
}

// ────────────────────────────────────────────────────────────────────────────
// テキスト挿入 / 置換（書式非破壊）
// ────────────────────────────────────────────────────────────────────────────

/**
 * レコードへ `ColorPalette` を挿入、または既存の値を置換する。
 *
 * - 既存が無い場合: `AppearanceDetail` の直後へ挿入（`$DefType` のフィールド順に一致）
 * - 既存がある場合: その値のテキストだけを差し替える（キーの位置は動かさない）
 *
 * @param {string} text  ファイル全体のテキスト
 * @param {[number, number]} span  対象レコードの範囲
 * @param {any[]} colorPalette
 * @returns {{ text: string, delta: number, mode: 'inserted'|'replaced' }}
 * @throws {Error} 挿入位置（AppearanceDetail）が見つからない場合
 */
export function upsertColorPaletteInRecord(text, span, colorPalette) {
    const [start, end] = span;
    const record = text.slice(start, end);

    const json = JSON.stringify(colorPalette, null, 2)
        .split('\n')
        .map((line, i) => (i === 0 ? line : `    ${line}`))
        .join('\n');

    // ── 既存の ColorPalette があれば値だけ差し替える
    const existingKey = record.indexOf('"ColorPalette"');
    if (existingKey >= 0) {
        const colon = record.indexOf(':', existingKey + '"ColorPalette"'.length);
        const valueStartRel = (() => {
            let i = colon + 1;
            while (i < record.length && /\s/.test(record[i])) i++;
            return i;
        })();
        const valueEndRel = findValueEnd(record, colon);
        const before = text.slice(0, start + valueStartRel);
        const after = text.slice(start + valueEndRel);
        const delta = json.length - (valueEndRel - valueStartRel);
        return { text: before + json + after, delta, mode: 'replaced' };
    }

    // ── 無ければ AppearanceDetail の直後へ挿入
    const anchorKey = record.indexOf('"AppearanceDetail"');
    if (anchorKey < 0) {
        // `AppearanceDetail` を持たないレコード（例: NumberTales SemiPrimary の Num 222）。
        // ここで挿入位置を推測せず末尾へ足し、正準順への整列は
        // `npm run data:order:write`（$DefType が正）へ委ねる。
        const closing = record.lastIndexOf('}');
        if (closing < 0) throw new Error('レコードの終端 } が見つかりません');
        let cursor = closing - 1;
        while (cursor > 0 && /\s/.test(record[cursor])) cursor--;
        const insertion = `,\n    "ColorPalette": ${json}`;
        const insertAt = start + cursor + 1;
        return {
            text: text.slice(0, insertAt) + insertion + text.slice(insertAt),
            delta: insertion.length,
            mode: 'appended',
        };
    }

    const colon = record.indexOf(':', anchorKey + '"AppearanceDetail"'.length);
    if (colon < 0) throw new Error('AppearanceDetail の : が見つかりません');
    const valueEnd = findValueEnd(record, colon);

    let cursor = valueEnd;
    while (cursor < record.length && /\s/.test(record[cursor])) cursor++;
    const hasTrailingComma = record[cursor] === ',';

    const insertion = hasTrailingComma
        ? `\n    "ColorPalette": ${json},`
        : `,\n    "ColorPalette": ${json}`;
    const insertAt = start + (hasTrailingComma ? cursor + 1 : valueEnd);

    return {
        text: text.slice(0, insertAt) + insertion + text.slice(insertAt),
        delta: insertion.length,
        mode: 'inserted',
    };
}

/**
 * レコードから `ColorPalette` フィールドを丸ごと削除する。
 *
 * カラーチップから配色を確定できなかったレコードに、過去の推測値（画像全体からの
 * median-cut 等）が残っていると「作者指定の正確な値」と「機械の当てずっぽう」が
 * 混在してしまい、後から区別できなくなる。`--drop-unresolved` はそれを防ぐ。
 *
 * @param {string} text
 * @param {[number, number]} span
 * @returns {{ text: string, delta: number } | null} 既存が無ければ null
 */
export function removeColorPaletteFromRecord(text, span) {
    const [start, end] = span;
    const record = text.slice(start, end);

    const keyIdx = record.indexOf('"ColorPalette"');
    if (keyIdx < 0) return null;

    const colon = record.indexOf(':', keyIdx + '"ColorPalette"'.length);
    const valueEnd = findValueEnd(record, colon);

    // キーの直前（改行・インデント）から、値の直後のカンマまでを削除する
    let from = keyIdx;
    while (from > 0 && /[ \t]/.test(record[from - 1])) from--;
    if (from > 0 && record[from - 1] === '\n') from--;

    let to = valueEnd;
    while (to < record.length && /\s/.test(record[to])) to++;
    if (record[to] === ',') to++;
    else {
        // 末尾キーだった場合は直前のカンマを取り除く
        let back = from;
        while (back > 0 && /\s/.test(record[back - 1])) back--;
        if (record[back - 1] === ',') from = back - 1;
        to = valueEnd;
    }

    const delta = -(to - from);
    return { text: text.slice(0, start + from) + text.slice(start + to), delta };
}

// ────────────────────────────────────────────────────────────────────────────
// メイン処理
// ────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} PatchOptions
 * @property {string} work
 * @property {string} db
 * @property {Set<any>|null} records  対象 Num（null なら全件）
 * @property {boolean} apply    true で書き込む（既定 false = dry-run）
 * @property {boolean} force    true なら既存 ColorPalette も再生成する
 * @property {boolean} dropUnresolved  配色を確定できないレコードの既存 ColorPalette を削除する
 * @property {number} minChips  この数未満のチップしか取れなければスキップ
 * @property {string[]|null} manualChips  自動検出の代わりに使うカラーコード（--records で 1 件に絞ること）
 * @property {boolean} fromArtwork  チップが取れないとき透過キャラ単体イラストから抽出する
 * @property {number} minRatio      透過イラスト抽出で採用する面積比の下限
 * @property {boolean} verbose
 */

/**
 * 対象 DB の各レコードへ `ColorPalette` を追記・更新する。
 *
 * @param {PatchOptions} opts
 * @returns {{ results: Array<any>, applied: number, dbPath: string }}
 */
export function patchColorPalette(opts) {
    const workDir = path.join(REPO_ROOT, 'data', `Works_${opts.work}`);
    const dbPath = path.join(workDir, 'DataBases', `db_${opts.db}.json`);
    const imagesRoot = path.join(workDir, 'Images', `DB_${opts.db}`);
    if (!fs.existsSync(dbPath)) throw new Error(`DB が見つかりません: ${dbPath}`);

    // 共通造形色（肌・舌・コアフォルダの毛など）は透過イラスト抽出でだけ除外する。
    // 宣言が無い作品では空配列になり、除外は行われない。
    const commonColors = opts.fromArtwork ? readCommonColors(workDir) : [];

    const original = fs.readFileSync(dbPath, 'utf8');
    const db = JSON.parse(original);
    const spans = scanTopLevelRecords(original);
    if (spans.length !== db.length) {
        throw new Error(`レコード走査に失敗しました（テキスト ${spans.length} 件 / パース ${db.length} 件）`);
    }

    /** @type {Array<any>} */
    const results = [];
    let text = original;

    // 末尾から処理する（先頭側のオフセットが変わらないようにするため）
    for (let i = db.length - 1; i >= 0; i--) {
        const record = db[i];
        // 絞り込みは Num で行い、表示は Num を持たない作品でも読めるラベルにする
        const num = record.Num ?? recordLabel(record);
        if (opts.records && !opts.records.has(record.Num)) continue;

        const hasExisting = 'ColorPalette' in record;
        if (hasExisting && !opts.force) {
            results.push({ num, status: 'skipped-existing' });
            continue;
        }

        const { chips, source } = detectChipsForRecord(record, imagesRoot, opts.manualChips, workDir);

        /** @type {Array<{hex: string, coverage: number|null}>|null} */
        let ordered = null;
        let measuredOn = null;
        let usedSource = source;
        let origin = 'chips';

        if (chips.length >= opts.minChips) {
            ({ ordered, measuredOn } = rankChipsByCoverage(chips, record, imagesRoot));
        } else if (opts.fromArtwork) {
            // チップが取れないレコードの受け皿。透過キャラ単体イラストの面積比が
            // そのまま被覆率なので、rankChipsByCoverage() は通さない。
            const art = detectArtworkColorsForRecord(record, workDir, imagesRoot, {
                exclude: commonColors,
                minRatio: opts.minRatio,
            });
            if (art.colors.length) {
                ordered = art.colors.map(c => ({ hex: c.hex, coverage: c.ratio }));
                measuredOn = art.source;
                usedSource = art.source;
                origin = 'artwork';
            }
        }

        if (!ordered) {
            // 配色を確定できなかったレコードに過去の推測値が残っていると、
            // 「作者指定の正確な値」と混在してしまう。--drop-unresolved で取り除く。
            if (opts.dropUnresolved && hasExisting) {
                const removed = removeColorPaletteFromRecord(text, spans[i]);
                if (removed) {
                    text = removed.text;
                    results.push({ num, status: 'dropped-unresolved', chips: chips.length, source });
                    continue;
                }
            }
            results.push({
                num,
                status: chips.length ? 'skipped-too-few-chips' : 'skipped-no-chips',
                chips: chips.length,
                source,
            });
            continue;
        }

        const palette = buildColorPaletteValue(ordered, collectColorHints(record));

        try {
            const res = upsertColorPaletteInRecord(text, spans[i], palette);
            text = res.text;
            results.push({
                num,
                status: res.mode,
                origin,
                chips: chips.length,
                source: usedSource,
                measuredOn,
                palette: ordered,
            });
        } catch (err) {
            results.push({ num, status: 'error', message: err.message });
        }
    }

    results.reverse();
    const applied = results.filter(r =>
        r.status === 'inserted' || r.status === 'replaced'
        || r.status === 'appended' || r.status === 'dropped-unresolved').length;

    if (opts.apply && applied) {
        JSON.parse(text); // 壊れた JSON を書かないための最終ガード
        fs.writeFileSync(dbPath, text, 'utf8');
    }

    return { results, applied, dbPath };
}

// ────────────────────────────────────────────────────────────────────────────
// スロット確定モード（--assign-slots）
// ────────────────────────────────────────────────────────────────────────────

/**
 * 既存の `ColorPalette` を**スロット順へ並べ替え**、`Role` / `ColorName_JP/EN` を確定する。
 *
 * `Hex` は作者指定色なので触らない。既に抽出済みのレコードに対して「どの色が何を担うか」
 * だけを後から確定させるための経路で、`--slots` に確定済みの割当ファイルを渡す運用が本筋。
 * ファイルが無い場合は下書き（`proposeSlotAssignment()`）で埋めるが、**下書きは要検証**。
 *
 * 7 枠のどれとも判定できない色が 1 つでも残るレコードは**書き込まずスキップ**し、
 * `unassigned` として報告する（User に確認するため）。
 *
 * @param {{work: string, db: string, records: Set<any>|null, apply: boolean, slots: Record<string, any[]>|null, verbose: boolean}} opts
 * @returns {{ results: Array<any>, applied: number, dbPath: string }}
 */
export function patchColorPaletteSlots(opts) {
    const workDir = path.join(REPO_ROOT, 'data', `Works_${opts.work}`);
    const dbPath = path.join(workDir, 'DataBases', `db_${opts.db}.json`);
    const imagesRoot = path.join(workDir, 'Images', `DB_${opts.db}`);
    if (!fs.existsSync(dbPath)) throw new Error(`DB が見つかりません: ${dbPath}`);

    const original = fs.readFileSync(dbPath, 'utf8');
    const db = JSON.parse(original);
    const spans = scanTopLevelRecords(original);
    if (spans.length !== db.length) {
        throw new Error(`レコード走査に失敗しました（テキスト ${spans.length} 件 / パース ${db.length} 件）`);
    }

    /** @type {Array<any>} */
    const results = [];
    let text = original;

    // 末尾から処理する（先頭側のオフセットが変わらないようにするため）
    for (let i = db.length - 1; i >= 0; i--) {
        const record = db[i];
        const num = record.Num ?? recordLabel(record);
        if (opts.records && !opts.records.has(record.Num) && !opts.records.has(String(num))) continue;
        if (!Array.isArray(record.ColorPalette) || !record.ColorPalette.length) continue;

        const given = opts.slots?.[String(num)];
        let assignment, unassigned;
        if (Array.isArray(given)) {
            ({ unassigned } = applySlotAssignment(record.ColorPalette, given));
            assignment = given;
        } else {
            ({ assignment, unassigned } = proposeSlotAssignment(
                collectSlotEvidence(record, workDir, imagesRoot),
            ));
        }

        if (unassigned.length) {
            results.push({ num, status: 'skipped-unassigned', unassigned, source: given ? 'slots' : 'draft' });
            continue;
        }

        try {
            const { value } = applySlotAssignment(record.ColorPalette, assignment);
            const res = upsertColorPaletteInRecord(text, spans[i], value);
            text = res.text;
            results.push({ num, status: 'slotted', source: given ? 'slots' : 'draft', value });
        } catch (err) {
            results.push({ num, status: 'error', message: err.message });
        }
    }

    results.reverse();
    const applied = results.filter(r => r.status === 'slotted').length;
    if (opts.apply && applied) {
        JSON.parse(text); // 壊れた JSON を書かないための最終ガード
        fs.writeFileSync(dbPath, text, 'utf8');
    }
    return { results, applied, dbPath };
}

/**
 * 配色の分布を粗いテキストマップで描く。
 *
 * 近似色（NTS-1 の `#FFAC8F` / `#FFBFA7` のように RGB 距離が 30 程度しかない組）は
 * 設定画を目で見ても分離できない。「どの色がどの領域に割り当てられたか」を図にすれば、
 * その色が髪なのか尻尾なのか衣装なのかが読み取れる。
 *
 * 各セルは、そこに最も多く割り当てられた配色の番号（1 始まり）。`.` は地。
 * 割当は `measurePaletteCoverage()` と同じ最近傍で、陰影・アンチエイリアスを吸収する。
 * 背景付きの画像（清書イラスト・設定画）は `buildForegroundMask()` で地を落とすが、
 * 淡いグレーが紙面として一緒に落ちることがあるため、**足元や小物は欠けることがある**。
 *
 * @param {import('./extract-palette.mjs').DecodedImage} img
 * @param {string[]} hexes
 * @param {{cols?: number, rows?: number, maxDist?: number}} [opt]
 * @returns {string[]} 行ごとの文字列
 */
export function renderColorMap(img, hexes, opt = {}) {
    const cols = opt.cols ?? 56;
    const rows = opt.rows ?? 40;
    const maxDist = opt.maxDist ?? 45;
    const rgbs = hexes.map(hexToRgb);
    const fg = isTransparentArtwork(img) ? null : buildForegroundMask(img);
    const cellW = img.width / cols, cellH = img.height / rows;

    /** @type {string[]} */
    const out = [];
    for (let ry = 0; ry < rows; ry++) {
        let line = '';
        for (let rx = 0; rx < cols; rx++) {
            const votes = new Array(hexes.length).fill(0);
            let seen = 0;
            for (let y = Math.floor(ry * cellH); y < Math.floor((ry + 1) * cellH); y += 2) {
                for (let x = Math.floor(rx * cellW); x < Math.floor((rx + 1) * cellW); x += 2) {
                    const i = y * img.width + x;
                    if (img.data[i * 4 + 3] < 128) continue;
                    if (fg && !fg[i]) continue;
                    const r = img.data[i * 4], g = img.data[i * 4 + 1], b = img.data[i * 4 + 2];
                    if (r > 245 && g > 245 && b > 245) continue; // 紙面
                    if (r < 60 && g < 60 && b < 60) continue;    // 線画
                    let best = -1, bestD = Infinity;
                    for (let k = 0; k < rgbs.length; k++) {
                        const d = (r - rgbs[k][0]) ** 2 + (g - rgbs[k][1]) ** 2 + (b - rgbs[k][2]) ** 2;
                        if (d < bestD) { bestD = d; best = k; }
                    }
                    if (best >= 0 && bestD <= maxDist * maxDist) { votes[best]++; seen++; }
                }
            }
            if (!seen) { line += '.'; continue; }
            let top = 0;
            for (let k = 1; k < votes.length; k++) if (votes[k] > votes[top]) top = k;
            line += String.fromCharCode(top < 9 ? 49 + top : 88); // 1-9 のあと X
        }
        out.push(line);
    }
    return out;
}

/**
 * スロット判定の根拠を、レコードごとに標準出力へ出す（データは変更しない）。
 *
 * 画像を見て割当を決めるときの手掛かり一覧。`--slots` へ渡す割当ファイルの下書きも
 * 同時に返すので、これを直してから `--slots` で適用する運用になる。
 *
 * @param {{work: string, db: string, records: Set<any>|null}} opts
 * @returns {{ draft: Record<string, any[]>, rows: Array<any> }}
 */
export function reportSlotEvidence(opts) {
    const workDir = path.join(REPO_ROOT, 'data', `Works_${opts.work}`);
    const dbPath = path.join(workDir, 'DataBases', `db_${opts.db}.json`);
    const imagesRoot = path.join(workDir, 'Images', `DB_${opts.db}`);
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

    /** @type {Record<string, any[]>} */
    const draft = {};
    /** @type {Array<any>} */
    const rows = [];

    for (const record of db) {
        const num = record.Num ?? recordLabel(record);
        if (opts.records && !opts.records.has(record.Num) && !opts.records.has(String(num))) continue;
        if (!Array.isArray(record.ColorPalette) || !record.ColorPalette.length) continue;

        const evidence = collectSlotEvidence(record, workDir, imagesRoot);
        const { assignment, unassigned } = proposeSlotAssignment(evidence);
        draft[String(num)] = assignment;
        rows.push({ num, evidence, assignment, unassigned });
    }
    return { draft, rows };
}

// ────────────────────────────────────────────────────────────────────────────
// 照合レポート（透過イラスト抽出 vs 設定画チップ）
// ────────────────────────────────────────────────────────────────────────────

/**
 * 透過イラストからの抽出結果を、**設定画のカラーチップ由来で確定済みの `ColorPalette`**
 * と突き合わせて精度を報告する。データは一切変更しない。
 *
 * チップ由来の値は作者が指定した正解なので、これを基準にすれば透過イラスト経路の
 * 妥当性を数字で確認できる。一致の判定は RGB 距離 10 未満（べた塗りなので本来は 0 で一致する）。
 *
 * @param {{ work: string, db: string, minRatio: number }} opts
 * @returns {{ records: Array<any>, totals: { records: number, colors: number, hit: number } }}
 */
export function verifyArtworkAgainstChips(opts) {
    const workDir = path.join(REPO_ROOT, 'data', `Works_${opts.work}`);
    const dbPath = path.join(workDir, 'DataBases', `db_${opts.db}.json`);
    const imagesRoot = path.join(workDir, 'Images', `DB_${opts.db}`);
    if (!fs.existsSync(dbPath)) throw new Error(`DB が見つかりません: ${dbPath}`);

    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const commonColors = readCommonColors(workDir);

    /** @type {Array<any>} */
    const records = [];
    let colors = 0, hit = 0;

    for (const record of db) {
        if (!Array.isArray(record?.ColorPalette) || !record.ColorPalette.length) continue;
        const art = detectArtworkColorsForRecord(record, workDir, imagesRoot, {
            exclude: commonColors,
            minRatio: opts.minRatio,
        });
        if (!art.colors.length) continue;

        const chipHexes = record.ColorPalette.map(c => c.Hex).filter(Boolean);
        const matched = art.colors.map(c => ({
            hex: c.hex,
            ratio: c.ratio,
            nearest: Math.min(...chipHexes.map(h => colorDistance(c.hex, h))),
        }));
        colors += matched.length;
        hit += matched.filter(m => m.nearest < 10).length;
        records.push({ num: recordLabel(record), source: art.source, matched, chipHexes });
    }

    return { records, totals: { records: records.length, colors, hit } };
}

/**
 * 進捗表示に使うレコード識別子。
 *
 * `Num` を持たない作品（ハンカクライブは `Letter`）でも読める表示にするため、
 * `Num` が無ければ**先頭キー**（＝ `$DefType` 上のインデックス項目）の値を使う。
 * 絞り込み（`--records`）の判定には使わない。あくまで表示用。
 *
 * @param {any} record
 * @returns {string}
 */
export function recordLabel(record) {
    if (record?.Num !== undefined) return String(record.Num);
    const firstKey = Object.keys(record ?? {})[0];
    const value = record?.[firstKey];
    if (value && typeof value === 'object') return `${firstKey}:${Object.values(value).join('/')}`;
    return String(value ?? '?');
}

// ────────────────────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────────────────────

/** ヘルプを表示して終了する。 */
function printHelpAndExit() {
    console.log(`
patch-colorpalette.mjs — 設定画のカラーチップから ColorPalette を追記する

使い方:
  node tools/patch-colorpalette.mjs --work <Work> --db <Db> [--records 1,2 | --all] [オプション]

オプション:
  --work <name>     作品名（既定: NumberTales）
  --db <name>       DB 名（既定: Primary）
  --records <list>  対象 Num（カンマ区切り / 範囲 "1-20" 可）
  --all             全レコードを対象にする
  --apply           実データへ書き込む（未指定時は dry-run）
  --force           既存の ColorPalette も再生成して置き換える
  --drop-unresolved 配色を確定できなかったレコードの既存 ColorPalette を削除する
                    （過去の推測値が作者指定の値と混在するのを防ぐ）
  --min-chips <n>   この数未満のチップしか取れなければスキップ（既定: 3）
  --chips <list>    自動検出の代わりに使うカラーコード（カンマ区切り。--records で 1 件に絞る）
                    例: --records 40 --chips "#67bdbd,#a4daef,#387eb6,#00bacb,#d4f6f2"
                    設定画のチップが小さい・淡い・重なっている等で検出できない場合に、
                    User が読み取った値を渡す経路。Role は他と同じく実測被覆率の降順
  --from-artwork    チップが取れないレコードを、透過キャラクター単体イラスト
                    （コアフォルダ / キーキャッパー等）の色分布から補完する
  --min-ratio <n>   透過イラスト抽出で採用する面積比の下限（既定: 0.02）
  --verify-artwork  透過イラスト抽出を、チップ由来で確定済みの ColorPalette と
                    突き合わせて精度だけ報告する（データは変更しない）
  --assign-slots    既存 ColorPalette をスロット順へ並べ替え、Role と ColorName を確定する
                    （Hex は触らない。--slots を併用しなければ下書き判定になる）
  --slots <file>    スロット割当ファイル（JSON）を読み込んで確定値として使う
  --slot-report     スロット判定の根拠を表示し、割当ファイルの下書きを .cache/ へ出す
  --color-map       各配色が画像のどこに出ているかを粗いテキストマップで描く
                    （近似色を目視で分離できないときの判断材料。データは変更しない）
  -v, --verbose     レコードごとの検出内容を表示
  -h, --help        このヘルプ

配色スロット（--assign-slots / --slots の枠。並びがそのまま出力順）:
  primary           主色 / Primary Color                  #ColorRole_Primary   地毛で最も多い色
  primaryCostume    主色(衣装) / Primary Color (Costume)   #ColorRole_Primary   衣装で最も多い色
  secondary         副色 / Secondary Color                 #ColorRole_Secondary 地毛で二番目の色
  accentMain        メインアクセントカラー / Main Accent    #ColorRole_Accent    瞳の主色・強い差し色
  accentSub         サブアクセントカラー / Sub Accent       #ColorRole_Accent    瞳の副色・靴/手袋
  secondaryCostume  副色（衣装） / Secondary (Costume)      #ColorRole_Sub       衣装の二番目・本体との調停色
  auxiliary         補助色 / Auxiliary Color               #ColorRole_Sub       全体のバランス色

  ※ 7 枠のどれとも判定できない色が残るレコードは書き込まずスキップします
     （黙って補助色へ流さない）。--slot-report で根拠を見て割当ファイルを作ってください。

--slots ファイルの形式（キーは Num、値は割当の配列）:
  {
    "1": [
      { "slot": "primary", "hex": "#ED5D47",
        "appliesTo": ["#BodyPart_Hair", "#BodyPart_Ear", "#BodyPart_Tail"] },
      { "slot": "primaryCostume", "hex": "#FF8682",
        "appliesTo": ["#BodyPart_Chest", "#BodyPart_Shoulder"] }
    ]
  }

書き込む項目（機械的に決まるもの）:
  Role       キャラ画像での実測被覆率の降順に Primary / Secondary / Accent / Sub
  Hex        設定画のカラーチップから読み取った作者指定の色
             （--from-artwork 経由なら透過イラストの色分布から読み取った色）
  AppliesTo  色語が一致した AppearanceDetail の BodyPart を転記

書き込まない項目（創作内容のため User が記入する）:
  ColorName_JP / ColorName_EN / Formation / Note_JP / Note_EN は null のまま

透過イラスト抽出（--from-artwork）について:
  対象フィールドは作品別 db_type.json の Images 宣言から取り、透過率で素材を判定します
  （背景付きの concept / arts は自動的に外れます）。輪郭線の純黒と、作品別 db_meta.json の
  \$EnumDef_CommonColor に宣言された共通造形色（肌・舌・コアフォルダの毛など）は除外します。

注意:
  既存フォーマットを壊さないようテキスト挿入で追記します。
  書き込み後は \`npx prettier --write <db>\` を実行してください。
  AppearanceDetail を持たないレコードは末尾へ追記されるため、
  \`npm run data:order:write\` でキー順を整えてください。
`);
    process.exit(0);
}

/**
 * `--records 1,3,5-8` 形式を Set へ展開する。
 * @param {string} spec
 * @returns {Set<any>}
 */
function parseRecordSpec(spec) {
    const set = new Set();
    for (const part of spec.split(',')) {
        const t = part.trim();
        if (!t) continue;
        const m = t.match(/^(\d+)-(\d+)$/);
        if (m) for (let i = Number(m[1]); i <= Number(m[2]); i++) set.add(i);
        else if (/^\d+$/.test(t)) set.add(Number(t));
        else set.add(t); // "2-alt" / "000" 等の特殊 Num
    }
    return set;
}

/**
 * `--chips "#67bdbd,#a4daef"` 形式を正規化した HEX 配列へ展開する。
 * 大文字・`#` 付きに揃える（`#Hexcode_Color` 型と既存データの表記に合わせる）。
 *
 * @param {string} spec
 * @returns {string[]}
 * @throws {Error} `#RRGGBB` 形式でない値が含まれる場合
 */
export function parseChipList(spec) {
    return spec.split(',').map(part => {
        const t = part.trim().replace(/^#/, '');
        if (!/^[0-9A-Fa-f]{6}$/.test(t)) throw new Error(`カラーコードの形式が不正です: ${part.trim()}`);
        return `#${t.toUpperCase()}`;
    });
}

/**
 * 照合レポートを標準出力へ整形して表示する。
 * @param {{ work: string, db: string, minRatio: number, verbose: boolean }} opts
 */
function printArtworkVerification(opts) {
    const { records, totals } = verifyArtworkAgainstChips(opts);

    console.log(`[透過イラスト抽出の照合] ${opts.work} / ${opts.db}（min-ratio ${opts.minRatio}）`);
    if (!totals.records) {
        console.log('  チップ由来 ColorPalette と透過イラストの両方を持つレコードがありません。');
        return;
    }

    if (opts.verbose) {
        for (const r of records) {
            const cols = r.matched
                .map(m => `${m.hex}(${Math.round(m.ratio * 100)}%,d=${m.nearest.toFixed(0)})`)
                .join(' ');
            console.log(`  #${String(r.num).padEnd(7)} ${cols}`);
        }
        console.log('');
    }

    const rate = (totals.hit / totals.colors) * 100;
    console.log(`  照合レコード: ${totals.records} 件 / 抽出色: ${totals.colors} 色`);
    console.log(`  チップ由来の色と一致（RGB 距離 < 10）: ${totals.hit} 色（${rate.toFixed(1)}%）`);
    console.log('\n※ このモードはデータを変更しません。作者がチップに載せていない色（影・小物など）は');
    console.log('  不一致として数えられるため、100% にはなりません。');
}

/**
 * レコードの各画像について配色マップを描画して表示する（データは変更しない）。
 *
 * 行頭に前景の高さ帯（`頭`/`上`/`中`/`下`/`足`）を添える。これは外接矩形を 5 等分した
 * **単なる目盛り**であって部位の判定ではない。姿（人姿 / 球体型姿）とポーズで
 * 実際の部位はずれる（特に尻尾・耳は帯をまたぐ）ため、最終判断は設定画を見て行うこと。
 *
 * @param {{work: string, db: string, records: Set<any>|null}} opts
 */
function printColorMap(opts) {
    const workDir = path.join(REPO_ROOT, 'data', `Works_${opts.work}`);
    const imagesRoot = path.join(workDir, 'Images', `DB_${opts.db}`);
    const db = JSON.parse(fs.readFileSync(path.join(workDir, 'DataBases', `db_${opts.db}.json`), 'utf8'));
    const BANDS = ['頭', '上', '中', '下', '足'];

    for (const record of db) {
        const num = record.Num ?? recordLabel(record);
        if (opts.records && !opts.records.has(record.Num) && !opts.records.has(String(num))) continue;
        const hexes = (Array.isArray(record.ColorPalette) ? record.ColorPalette : [])
            .map(c => c?.Hex).filter(Boolean);
        if (!hexes.length) continue;

        console.log(`\n=== #${num} ===`);
        hexes.forEach((h, i) => console.log(`  ${i + 1} = ${h}`));

        const files = [
            ...resolveArtworkSources(record, workDir, imagesRoot).map(s => ({ role: s.folder, path: s.path })),
            ...resolveImageSources(record, imagesRoot).filter(s => s.role === 'arts'),
        ];
        if (!files.length) { console.log('  （画像なし）'); continue; }

        for (const f of files) {
            let lines;
            try {
                lines = renderColorMap(decodePng(fs.readFileSync(f.path)), hexes);
            } catch (err) {
                console.log(`  ${f.role}: 読み込み失敗 (${err.message})`);
                continue;
            }
            console.log(`  -- ${f.role}/${path.basename(f.path)}`);
            // 図が描かれている範囲だけを帯の対象にする（上下の空行は数えない）
            const filled = lines.map((l, i) => (/[^.]/.test(l) ? i : -1)).filter(i => i >= 0);
            const top = filled[0] ?? 0;
            const span = ((filled[filled.length - 1] ?? 0) - top) + 1;
            lines.forEach((line, i) => {
                const rel = (i - top) / span;
                const band = rel >= 0 && rel < 1 ? BANDS[Math.min(4, Math.floor(rel * 5))] : '　';
                console.log(`  ${band} ${line}`);
            });
        }
    }
    console.log('\n※ 高さ帯は外接矩形の 5 等分目盛りで、部位の判定ではありません。');
    console.log('  尻尾・耳は姿によって帯をまたぐため、設定画と併せて判断してください。');
}

/**
 * スロット判定の根拠を表示し、割当ファイルの下書きを `.cache/` へ書き出す。
 * @param {{work: string, db: string, records: Set<any>|null, verbose: boolean}} opts
 */
function printSlotReport(opts) {
    const { draft, rows } = reportSlotEvidence(opts);

    console.log(`[スロット判定の根拠] ${opts.work} / ${opts.db}`);
    for (const r of rows) {
        const slotOf = new Map(r.assignment.map(a => [a.hex.toUpperCase(), a.slot]));
        console.log(`\n  #${r.num}`);
        for (const ev of r.evidence) {
            const slot = slotOf.get(ev.hex.toUpperCase()) ?? '（未割当）';
            const parts = [...new Set(ev.hints.map(h => h.bodyPart).filter(Boolean))].join(',') || '-';
            const elems = [...new Set(ev.hints.map(h => h.element).filter(Boolean))].join(',') || '-';
            console.log(`    ${ev.hex}  球体${(ev.covBall * 100).toFixed(1).padStart(5)}%  人姿${(ev.covArt * 100).toFixed(1).padStart(5)}%  ${slot.padEnd(17)} ${parts} / ${elems}`);
        }
        if (r.unassigned.length) console.log(`    → 未割当: ${r.unassigned.join(', ')}`);
    }

    const outDir = path.join(REPO_ROOT, '.cache');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `colorpalette-slots-${opts.work}-${opts.db}.json`);
    fs.writeFileSync(outPath, `${JSON.stringify(draft, null, 2)}\n`, 'utf8');

    const done = rows.filter(r => !r.unassigned.length).length;
    console.log(`\n  下書き: ${done} / ${rows.length} 件が全色割当済み`);
    console.log(`  ${path.relative(REPO_ROOT, outPath).split(path.sep).join('/')} へ下書きを書き出しました。`);
    console.log('\n※ この下書きは検証前です。根拠に使う AppearanceDetail の BodyPart / DesignElement は');
    console.log('  画像を見て手動修正された経緯があり、近似色が競合すると被覆率も入れ替わります。');
    console.log('  画像で確認して直してから --slots で適用してください。');
}

/**
 * スロット確定の実行結果を表示する。
 * @param {{work: string, db: string, records: Set<any>|null, apply: boolean, slots: any, verbose: boolean}} opts
 */
function printSlotPatch(opts) {
    const { results, applied, dbPath } = patchColorPaletteSlots(opts);

    if (opts.verbose) {
        for (const r of results) {
            if (r.status === 'slotted') {
                console.log(`  #${String(r.num).padEnd(7)} slotted (${r.source})  ${r.value.map(v => `${v.ColorName_JP}:${v.Hex}`).join(' ')}`);
            } else if (r.status === 'skipped-unassigned') {
                console.log(`  #${String(r.num).padEnd(7)} 未割当あり → スキップ: ${r.unassigned.join(', ')}`);
            } else {
                console.log(`  #${String(r.num).padEnd(7)} ${r.status}${r.message ? `: ${r.message}` : ''}`);
            }
        }
        console.log('');
    }

    const tally = {};
    for (const r of results) tally[r.status] = (tally[r.status] ?? 0) + 1;
    console.log(`[スロット確定${opts.apply ? '' : ' / dry-run'}] ${opts.work} / ${opts.db}`);
    for (const [status, count] of Object.entries(tally)) console.log(`  ${status}: ${count} 件`);

    const pending = results.filter(r => r.status === 'skipped-unassigned').map(r => r.num);
    if (pending.length) console.log(`  → 要確認（未割当の色が残る）: ${pending.join(', ')}`);

    if (opts.apply && applied) {
        console.log(`\n  ${path.relative(REPO_ROOT, dbPath).split(path.sep).join('/')} を更新しました（${applied} 件）`);
        console.log('  ※ 仕上げに `npx prettier --write` を実行してください。');
    } else if (!opts.apply) {
        console.log('\n  （--apply を付けると実際に書き込みます）');
    }
    console.log('\n※ Hex / Formation / Note は既存値のまま。Role と ColorName はスロット表から確定します。');
}

/** CLI エントリポイント。 */
function main() {
    const argv = process.argv.slice(2);
    if (argv.includes('-h') || argv.includes('--help')) printHelpAndExit();

    /** @type {PatchOptions} */
    const opts = {
        work: 'NumberTales', db: 'Primary', records: null,
        apply: false, force: false, dropUnresolved: false, minChips: 3,
        manualChips: null, fromArtwork: false, minRatio: 0.02, verbose: false,
    };
    let all = false;
    let verifyArtwork = false;
    let assignSlots = false;
    let slotReport = false;
    let colorMap = false;
    let slotsFile = null;

    for (let i = 0; i < argv.length; i++) {
        switch (argv[i]) {
            case '--assign-slots': assignSlots = true; break;
            case '--slot-report': slotReport = true; break;
            case '--color-map': colorMap = true; break;
            case '--slots': slotsFile = argv[++i]; break;
            case '--work': opts.work = argv[++i]; break;
            case '--db': opts.db = argv[++i]; break;
            case '--records': opts.records = parseRecordSpec(argv[++i]); break;
            case '--all': all = true; break;
            case '--apply': opts.apply = true; break;
            case '--force': opts.force = true; break;
            case '--drop-unresolved': opts.dropUnresolved = true; break;
            case '--min-chips': opts.minChips = Number(argv[++i]); break;
            case '--chips': opts.manualChips = parseChipList(argv[++i]); break;
            case '--from-artwork': opts.fromArtwork = true; break;
            case '--min-ratio': opts.minRatio = Number(argv[++i]); break;
            case '--verify-artwork': verifyArtwork = true; break;
            case '-v': case '--verbose': opts.verbose = true; break;
            default:
                if (argv[i].startsWith('-')) { console.error(`未知のオプション: ${argv[i]}`); process.exit(1); }
        }
    }
    // 入力検証（pkg/ と同じ安全トークン規約に合わせる）
    if (!/^[A-Za-z0-9_]+$/.test(opts.work) || !/^[A-Za-z0-9_]+$/.test(opts.db)) {
        console.error('work / db は英数字とアンダースコアのみ許可されます');
        process.exit(1);
    }
    if (!(opts.minRatio >= 0 && opts.minRatio < 1)) {
        console.error('--min-ratio は 0 以上 1 未満で指定してください');
        process.exit(1);
    }

    // ── 照合レポート（データは変更しない）
    if (verifyArtwork) {
        printArtworkVerification(opts);
        return;
    }

    // ── 配色マップ（データは変更しない）
    if (colorMap) {
        printColorMap(opts);
        return;
    }

    // ── スロット判定の根拠レポート（データは変更しない）
    if (slotReport) {
        printSlotReport(opts);
        return;
    }

    // ── スロット確定（並べ替え + Role / ColorName）
    if (assignSlots) {
        const slots = slotsFile ? JSON.parse(fs.readFileSync(slotsFile, 'utf8')) : null;
        printSlotPatch({ ...opts, slots });
        return;
    }

    if (!all && !opts.records) {
        console.error('--records か --all を指定してください（--help でヘルプ）');
        process.exit(1);
    }

    const { results, applied, dbPath } = patchColorPalette(opts);

    if (opts.verbose) {
        for (const r of results) {
            if (r.status === 'inserted' || r.status === 'replaced' || r.status === 'appended') {
                const cols = r.palette
                    .map(p => `${p.hex}${p.coverage !== null ? `(${Math.round(p.coverage * 100)}%)` : ''}`)
                    .join(' ');
                const from = r.origin === 'artwork' ? `${r.palette.length}colors` : `${r.chips}chips`;
                console.log(`  #${String(r.num).padEnd(7)} ${r.status.padEnd(8)} ${from} [${r.source}] ${cols}`);
            } else {
                console.log(`  #${String(r.num).padEnd(7)} ${r.status}${r.chips !== undefined ? ` (${r.chips} chips)` : ''}`);
            }
        }
        console.log('');
    }

    /** ステータス別の件数を数える */
    const tally = {};
    for (const r of results) tally[r.status] = (tally[r.status] ?? 0) + 1;

    console.log(`[ColorPalette パッチ${opts.apply ? '' : ' / dry-run'}] ${opts.work} / ${opts.db}`);
    for (const [status, count] of Object.entries(tally)) {
        console.log(`  ${status}: ${count} 件`);
    }
    const tooFew = results.filter(r => r.status === 'skipped-too-few-chips' || r.status === 'skipped-no-chips');
    if (tooFew.length) {
        console.log(`  → チップ不足/未検出: ${tooFew.map(r => r.num).join(', ')}`);
    }

    if (opts.apply && applied) {
        console.log(`\n  ${path.relative(REPO_ROOT, dbPath).split(path.sep).join('/')} を更新しました（${applied} 件）`);
        console.log('  ※ 仕上げに `npx prettier --write` を実行してください。');
        if (results.some(r => r.status === 'appended')) {
            console.log('  ※ AppearanceDetail を持たないレコードへ末尾追記しました。');
            console.log('     `npm run data:order:write` でキー順を整えてください。');
        }
    } else if (!opts.apply) {
        console.log('\n  （--apply を付けると実際に書き込みます）');
    }
    const artworkCount = results.filter(r => r.origin === 'artwork').length;
    console.log('\n※ Hex は設定画のカラーチップ（作者指定色）、Role は実測被覆率の降順です。');
    if (artworkCount) {
        console.log(`※ うち ${artworkCount} 件は透過キャラクター単体イラストの色分布から抽出しました`);
        console.log('  （輪郭線の純黒と db_meta.json の $EnumDef_CommonColor を除外済み）。');
    }
    console.log('※ 色名（ColorName_*）・Formation・Note は創作内容のため null のままです。');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    main();
}
