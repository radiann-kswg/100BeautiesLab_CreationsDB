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
 *   `Formation` / `Note_*` は **null のまま**残す（創作内容のため User が記入する）。
 *   `ColorName_JP` / `ColorName_EN` は `--assign-slots` のときだけ `COLOR_SLOTS` から
 *   機械的に確定する（自由な命名はしない。枠が決まれば名前も決まる、という関係）。
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
    openRecordsFile,
    writeRecordsFile,
    detectSwatchChips,
    measurePaletteCoverage,
    collectColorHints,
    resolveImageSources,
    findValueEnd,
    colorDistance,
    colorWordMatchesHex,
    extractSolidColors,
    isTransparentArtwork,
    listImageFields,
    readCommonColors,
} from './extract-palette.mjs';
import { readBodyPartEnum } from './patch-appearance-bodypart.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * 作品名 / DB 名から、この作品のパス一式を組み立てる。
 *
 * `--work` / `--db` を差し替えるだけで他作品へ使えるという前提が、この 3 行に集約されている。
 * 呼び出し側でパスを組み立て直さないこと。
 *
 * @param {string} work  作品名（`Works_` 接頭辞なし）
 * @param {string} db    DB 名（`db_` 接頭辞なし）
 * @returns {{ workDir: string, dbPath: string, imagesRoot: string }}
 */
function resolveDbPaths(work, db) {
    const workDir = path.join(REPO_ROOT, 'data', `Works_${work}`);
    return {
        workDir,
        dbPath: path.join(workDir, 'DataBases', `db_${db}.json`),
        imagesRoot: path.join(workDir, 'Images', `DB_${db}`),
    };
}

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
 * @param {string[]|null} [manualChips]  手入力のカラーコード。指定時は自動検出より優先する
 * @param {string|null} [workDir]  `$palette.source` 宣言の解決用。null なら既定の表へフォールバック
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
 * （illustration → artwork）で最初に見つかった画像。設定画（`swatch`）は手書き注釈だらけなので
 * 除外する。判定はフィールド名ではなく `$palette.source` の宣言で行う。
 *
 * 測定できる画像が無い場合は、チップの面積（設定画上での大きさ）順にフォールバックする。
 *
 * @param {Array<{hex: string, count: number}>} chips
 * @param {any} record
 * @param {string} workDir
 * @param {string} imagesRoot
 * @returns {{ ordered: Array<{hex: string, coverage: number|null}>, measuredOn: string|null }}
 */
export function rankChipsByCoverage(chips, record, workDir, imagesRoot) {
    const hexes = chips.map(c => c.hex);
    const sources = resolveImageSources(record, workDir, imagesRoot)
        .filter(s => s.source !== 'swatch'); // 設定画は注釈だらけなので被覆率の測定には使わない

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
 * `ColorPalette` の 1 行を組み立てる。
 *
 * キーの並びは `db_meta.json` の `$Def_ColorPalette` に合わせる。抽出直後（`buildColorPaletteValue`）
 * とスロット確定後（`applySlotAssignment`）の両方から呼ぶので、**行の形はここが唯一の出所**。
 * スキーマにフィールドが増えたらここだけ直せばよい。
 *
 * `base` は既存行。`Formation` / `Note_*` は創作内容なので既存値を必ず持ち越す。
 *
 * @param {{role: string, hex: string, nameJP?: string|null, nameEN?: string|null, appliesTo?: string[]|null, base?: any}} src
 * @returns {any}
 */
function makePaletteRow({ role, hex, nameJP = null, nameEN = null, appliesTo = null, base = {} }) {
    return {
        Role: role,
        Hex: hex,
        ColorName_JP: nameJP,
        ColorName_EN: nameEN,
        AppliesTo: Array.isArray(appliesTo) && appliesTo.length ? appliesTo : null,
        Formation: base.Formation ?? null,
        Note_JP: base.Note_JP ?? null,
        Note_EN: base.Note_EN ?? null,
    };
}

/**
 * 抽出した配色から `ColorPalette` フィールドの値を組み立てる。
 *
 * `Role` はここでは**被覆率順の仮値**（`ROLE_ORDER`）。デザイン上の主従は
 * `--assign-slots` で `COLOR_SLOTS` から確定させる。色名は創作内容なので `null` のまま。
 *
 * @param {Array<{hex: string, coverage: number|null}>} ordered  被覆率の降順に並んだ配色
 * @param {ReturnType<typeof collectColorHints>} hints  AppearanceDetail の色語ヒント
 * @returns {any[]}
 */
export function buildColorPaletteValue(ordered, hints) {
    return ordered.map((entry, i) => makePaletteRow({
        role: ROLE_ORDER[i] ?? ROLE_REST,
        hex: entry.hex,
        appliesTo: [...new Set(
            hints
                .filter(h => colorWordMatchesHex(h.word, entry.hex))
                .map(h => h.bodyPart)
                .filter(Boolean),
        )],
    }));
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
 * @type {ReadonlyArray<{key: string, nameJP: string, nameEN: string, role: string, annotate?: boolean}>}
 */
export const COLOR_SLOTS = [
    { key: 'primary', nameJP: '主色', nameEN: 'Primary Color', role: '#ColorRole_Primary' },
    { key: 'primaryCostume', nameJP: '主色(衣装)', nameEN: 'Primary Color (Costume)', role: '#ColorRole_Primary' },
    { key: 'secondary', nameJP: '副色', nameEN: 'Secondary Color', role: '#ColorRole_Secondary' },
    { key: 'accentMain', nameJP: 'メインアクセントカラー', nameEN: 'Main Accent Color', role: '#ColorRole_Accent', annotate: true },
    { key: 'accentSub', nameJP: 'サブアクセントカラー', nameEN: 'Sub Accent Color', role: '#ColorRole_Accent', annotate: true },
    { key: 'secondaryCostume', nameJP: '副色（衣装）', nameEN: 'Secondary Color (Costume)', role: '#ColorRole_Sub' },
    { key: 'auxiliary', nameJP: '補助色', nameEN: 'Auxiliary Color', role: '#ColorRole_Sub' },
];

/** 地毛（髪・耳・尻尾）とみなす部位。共通配色以外の体毛はここに含める。 */
const BASE_PARTS = new Set(['#BodyPart_Hair', '#BodyPart_Ear', '#BodyPart_Tail']);
/** アクセント（瞳）とみなす部位。色名の注記（「瞳」か「アクセサリー」か）の分岐に使う。 */
const ACCENT_PARTS = new Set(['#BodyPart_Eye']);
/**
 * 衣装が覆う部位。`#BodyPart_Neck` / `Hand` / `Foot` / `Head` は襟・手袋・靴・帽子といった
 * **小物**にもなるため、ここには入れない（それらはアクセサリー扱い）。
 */
const COSTUME_PARTS = new Set([
    '#BodyPart_Chest', '#BodyPart_Waist', '#BodyPart_Leg',
    '#BodyPart_Shoulder', '#BodyPart_Arm', '#BodyPart_Back',
]);

/**
 * 部位の一覧を「地毛 / 衣装 / アクセサリー」の 3 クラスへ写す。
 *
 * どのクラスにも排他性は無い（1 つの色が地毛と衣装の両方に出ることは普通にある。
 * 例: Num 6 の `#FF76A2` は髪・耳・尻尾とワンピースの両方）。判定側は
 * 「地毛を含むか」のように**含有**で見ること。
 *
 * @param {string[]|null|undefined} parts  `AppliesTo` 相当の部位配列
 * @returns {{ base: boolean, costume: boolean, accessory: boolean, empty: boolean }}
 */
export function classifyParts(parts) {
    const list = Array.isArray(parts) ? parts : [];
    return {
        base: list.some(p => BASE_PARTS.has(p)),
        costume: list.some(p => COSTUME_PARTS.has(p)),
        accessory: list.some(p => !BASE_PARTS.has(p) && !COSTUME_PARTS.has(p)),
        empty: list.length === 0,
    };
}

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
 * このツールが生成しうる色名かどうかを判定する。
 *
 * User が注記を手で書き換えることがある（実例: Num 5 の
 * `メインアクセントカラー（瞳, 衣装補足色）`。ツールは「アクセサリー」しか作れない）。
 * 再実行のたびに機械の言い回しへ戻してしまうと、手入力が黙って消える。
 * 生成形のどれとも一致しない名前は**人が書いたもの**とみなして残す。
 *
 * @param {{nameJP: string, nameEN: string, annotate?: boolean}} slot
 * @param {string|null|undefined} nameJP  既存の `ColorName_JP`
 * @returns {boolean} 生成形なら true（＝上書きしてよい）
 */
function isGeneratedColorName(slot, nameJP) {
    if (!nameJP) return true; // 未記入は埋めてよい
    if (!slot.annotate) return nameJP === slot.nameJP;
    return [
        slot.nameJP,
        `${slot.nameJP}（瞳）`,
        `${slot.nameJP}（アクセサリー）`,
        `${slot.nameJP}（瞳, アクセサリー）`,
    ].includes(nameJP);
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
        // 手で書き換えられた注記は残す（生成形と違う名前＝人が書いたもの）
        const keepName = !isGeneratedColorName(slot, base.ColorName_JP);
        const name = keepName
            ? { jp: base.ColorName_JP, en: base.ColorName_EN ?? null }
            : buildSlotColorName(slot, appliesTo);

        used.add(hex);
        out.push({
            order,
            seq,
            row: makePaletteRow({
                role: slot.role,
                hex: base.Hex,
                nameJP: name.jp,
                nameEN: name.en,
                appliesTo,
                base,
            }),
        });
    });

    out.sort((a, b) => a.order - b.order || a.seq - b.seq);
    const unassigned = [...rows.keys()].filter(h => !used.has(h)).map(h => rows.get(h).Hex);
    return { value: out.map(o => o.row), unassigned };
}

/**
 * レコードのインデックスバッジ（`NTS-57` のような識別子）を、そのレコード自身の
 * 画像名から取り出す。
 *
 * バッジ文字列を作品ごとにツールへ書かないための入口。設定画・球体型姿の画像名は
 * `cnsp_imgNTS-57` / `57/emstk_corefolderNTS-57-1` のようにバッジを含むので、
 * `<英字>-<Num>` の形で拾えば作品名を知らなくても取り出せる。
 *
 * @param {any} record
 * @returns {string|null} 見つからなければ null
 */
export function indexBadgeFromImages(record) {
    const num = String(record?.Num ?? '');
    if (!num) return null;
    const images = record?.Images ?? {};
    const names = Object.values(images)
        .flatMap(v => (Array.isArray(v) ? v : [v]))
        .filter(v => typeof v === 'string' && v);
    const escaped = num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 作品コードは大文字（`NTS`）で書かれる規約。`cnsp_imgNTS-57` から `imgNTS-57` ではなく
    // `NTS-57` を取ること。前者だと `art_pmNTS-57game.png` のような別記法を取り逃がす。
    for (const name of names) {
        const m = name.match(new RegExp(`([A-Z]+-${escaped})(?![0-9])`));
        if (m) return m[1];
    }
    return null;
}

/**
 * 配色の判定に使える**単独絵**だけを返す。
 *
 * `arts_PNGPath` には合同絵（`art_sphericateDay202302r1.png` のように複数キャラが写る絵）も
 * 入っている。合同絵で被覆率を測ると他キャラの色を自分の色として数えてしまい、
 * 「衣装色か地毛色か」の判定が崩れる。パレット被覆率の合計では判別できない
 * （実測: 合同絵 87.3% > 単独絵 76.5% の例がある）ため、**ファイル名のバッジ**で絞る。
 *
 * バッジが取れないレコードでは合同絵を使わず空を返す。誤った材料で埋めるより、
 * 未割当として残して人が判断するほうが安全（`AGENTS.md` の「推測値と実測値を混ぜない」）。
 *
 * 対象は `$palette.source: "illustration"` を宣言したフィールド。作品ごとに名前が違い、
 * 今後も別名で増える前提なのでフィールド名では絞らない。
 *
 * @param {any} record
 * @param {string} workDir
 * @param {string} imagesRoot
 * @returns {Array<{ role: string, source: string|null, path: string }>}
 */
export function resolveSoloArtSources(record, workDir, imagesRoot) {
    const badge = indexBadgeFromImages(record);
    if (!badge) return [];
    return resolveImageSources(record, workDir, imagesRoot)
        .filter(s => s.source === 'illustration' && path.basename(s.path).includes(badge));
}

/**
 * 1 レコード分の判定材料を集める。
 *
 * スロットは画像を見ないと決まらないため、ここでは**根拠だけ**を揃えて返す:
 * - `covBall` … 球体型姿（`$palette.source: artwork`。コアフォルダ / キーキャッパー等）でのシェア
 * - `covArt`  … 人姿の単独絵でのシェア
 * - `bands`   … 球体型姿での高さ帯分布（頭/上/中/下/足）。球体型姿が取れない場合は人姿の分布
 * - `appliesTo` … レコードの `ColorPalette[].AppliesTo`（その色が現れる部位。判定の主材料）
 * - `hints`   … `AppearanceDetail` の色語が一致した部位・DesignElement（`AppliesTo` の穴埋め用）
 *
 * **`appliesTo` と `hints` は別物**。前者は「この HEX が塗られている部位」を
 * [issue #21](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/21) の
 * エントリ別 HEX 対応から確定させた値で、後者は色語（`red` / `blue` 等 13 語）の照合結果。
 * 色語は 1 語がその色相域の**全色**へ一致してしまうため精度が 3 割前後で頭打ちになる
 * （CHANGELOG 2026-08-11「色語 275 件の補完案は見送り」）。判定では `appliesTo` を優先し、
 * それが空のときだけ `hints` を見ること。
 *
 * 球体型姿は原則として衣装を含まないため、そこでのシェア順が「地毛で何番目に多い色か」に
 * ほぼ対応する。確定済みレコードでの実測は主色 5/5・副色 4/5。
 *
 * **シェアの測り方**: `measurePaletteCoverage()` ではなく `profileColorBands()` を使う。
 * 前者は透過画像にも `buildForegroundMask()` をかけるため、**淡い色を紙面と誤判定して
 * 落として**しまう（耳・尻尾の先端は主色の淡い版であることが多く、まさにここで消える）。
 * 実測でも Num 24 の `#FCE8EC` が 2.9% → 29% と大きく変わり、副色の判定が 0/5 → 4/5 になった。
 * 同じ理由は `extractSolidColors()` の注釈にも書かれている。
 *
 * @param {any} record
 * @param {string} workDir
 * @param {string} imagesRoot
 * @returns {Array<{hex: string, covBall: number, covArt: number, bands: number[], appliesTo: string[], hints: Array<{word: string, bodyPart: string|null, element: string|null, source: string}>}>}
 */
export function collectSlotEvidence(record, workDir, imagesRoot) {
    const palette = Array.isArray(record?.ColorPalette) ? record.ColorPalette : [];
    const hexes = palette.map(c => c?.Hex).filter(h => typeof h === 'string');
    if (!hexes.length) return [];
    // Hex → AppliesTo。同じ Hex が 2 行ある壊れたデータでも落ちないよう先勝ちで引く
    const partsByHex = new Map();
    for (const row of palette) {
        const key = String(row?.Hex ?? '').toUpperCase();
        if (!key || partsByHex.has(key)) continue;
        partsByHex.set(key, Array.isArray(row.AppliesTo) ? row.AppliesTo : []);
    }

    /**
     * 複数枚ある場合は**宣言順の先頭**（＝基本形態）だけを使う。
     *
     * 色ごとに別画像の最大値を拾うとシェアが別々の画像由来になって順位が壊れる。
     * かといって平均も正しくない: 球体型姿には**衣装付きの差分**があり
     * （Num 1 の 2 枚目はパーカーが 58% を占める）、混ぜると衣装色が主色を追い越す。
     * `Images` の配列順は作者が並べたものなので、先頭を基本形態とみなす。
     */
    const firstShare = (files) => {
        for (const file of files) {
            try {
                return profileColorBands(decodePng(fs.readFileSync(file)), hexes);
            } catch {
                continue;
            }
        }
        return hexes.map(() => ({ share: 0, bands: [0, 0, 0, 0, 0] }));
    };

    const ballFiles = resolveArtworkSources(record, workDir, imagesRoot).map(s => s.path);
    const artFiles = resolveSoloArtSources(record, workDir, imagesRoot).map(s => s.path);

    const ball = firstShare(ballFiles);
    const art = firstShare(artFiles);
    const allHints = collectColorHints(record);

    return hexes.map((hex, i) => ({
        hex,
        covBall: ball[i].share,
        covArt: art[i].share,
        bands: ball[i].share ? ball[i].bands : art[i].bands,
        appliesTo: partsByHex.get(hex.toUpperCase()) ?? [],
        hints: allHints.filter(h => colorWordMatchesHex(h.word, hex)),
    }));
}

/** 帯ラベル（前景の外接矩形を縦 5 等分した目盛り。部位そのものではない） */
export const BAND_LABELS = ['頭', '上', '中', '下', '足'];

/**
 * 前景の各画素を最近傍の配色へ割り当てて走査する。
 *
 * `profileColorBands()`（帯分布）と `renderColorMap()`（テキスト図）は、集計の仕方だけが
 * 違う同じ走査を持っていたため、判定をここへ 1 本化した。閾値を触るときはここだけ見ればよい。
 *
 * 除外するもの: 透過画素 / 背景（背景付き画像のみ `buildForegroundMask()`）/ 紙面の白 /
 * 線画の黒 / どの配色からも `maxDist` より遠い画素。
 *
 * 透過画像にマスクをかけないのは、淡い色（耳・尻尾の先端は主色の淡い版であることが多い）を
 * 紙面と誤判定して落としてしまうため。同じ理由は `extractSolidColors()` の注釈にもある。
 *
 * @param {import('./extract-palette.mjs').DecodedImage} img
 * @param {string[]} hexes
 * @param {{maxDist?: number, step?: number}} opt
 * @param {(x: number, y: number, k: number) => void} onPixel  k は hexes の添字
 */
function scanAssignedPixels(img, hexes, opt, onPixel) {
    const maxDist = opt.maxDist ?? 45;
    const step = opt.step ?? 2;
    const limit = maxDist * maxDist;
    const rgbs = hexes.map(hexToRgb);
    const fg = isTransparentArtwork(img) ? null : buildForegroundMask(img);

    for (let y = 0; y < img.height; y += step) {
        for (let x = 0; x < img.width; x += step) {
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
            if (best >= 0 && bestD <= limit) onPixel(x, y, best);
        }
    }
}

/**
 * 各配色が前景の**どの高さ帯**に分布しているかを測る。
 *
 * `share` は「どれだけ使われているか」、`bands` は「どこに使われているか」。
 * 髪は `頭` に偏り、尻尾の先端は `下`〜`足`、衣装は `上`〜`中`、靴は `足` に出る、と読む。
 * 近似色はシェアだけ見ると潰れるが、帯で分かれる。
 *
 * @param {import('./extract-palette.mjs').DecodedImage} img
 * @param {string[]} hexes
 * @param {{maxDist?: number, step?: number}} [opt]
 * @returns {Array<{ share: number, bands: number[] }>} hexes と同じ並び。bands の合計は 1
 */
export function profileColorBands(img, hexes, opt = {}) {
    /** @type {Array<{y: number, k: number}>} */
    const hits = [];
    let minY = Infinity, maxY = -Infinity;
    scanAssignedPixels(img, hexes, opt, (_x, y, k) => {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        hits.push({ y, k });
    });

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
 * 埋めるのは **主色と副色だけ**。主色は球体型姿（コアフォルダ等）でのシェア最大の色、
 * 副色は `AppliesTo` が地毛（髪・耳・尻尾）を含む色のうち 2 番目。
 * 残りは `unassigned` に残して、`--slot-report` の帯分布と設定画を見た人が決める。
 *
 * **主色を地毛で絞らない理由**: `AppliesTo` には抜けがある。Num 9 の `#A1A9BF` は
 * 球体型姿の 71.8% を占める銀灰の髪だが `AppliesTo` は空で、絞ると候補から消える。
 * シェア最大は絞らなくても外さない（確定 5 件で 5/5）。
 *
 * **なぜ衣装色・アクセント色を出さないか**: 「人姿では出るが球体型姿では出ない色＝衣装」
 * 「面積が小さく瞳に紐づく色＝アクセント」という規則を実装し、User が画像を見て確定させた
 * レコードを正解として測ったところ、正解率は 35〜40% にとどまった（近似色の競合、
 * 前景マスクが淡いグレーを落とすこと、合同絵の混入が主因）。半分外す下書きは、
 * レビューする側を誤った答えへ引きずるぶん無いより悪い。
 *
 * 特に**衣装枠の順序（主色(衣装) と 副色（衣装））はシェアでは決まらない**。確定 5 件で 3/5。
 * Num 24 は青灰 `#AEB8DB`（カーディガンとスカート）が主色(衣装)だが、人姿イラストの計測では
 * 藤色 `#C680AF`（19.9%）が青灰（5.8%）を上回る。設定画を見ないと分けられない。
 *
 * 確定 5 件（Num 1/5/6/8/24）を正解とした主色・副色の正解率:
 * | 版 | 正解率 |
 * | --- | --- |
 * | 全色をシェア順（旧） | 90%（主色 5/5・副色 4/5） |
 * | **地毛の色だけをシェア順（現行）** | **100%（主色 5/5・副色 5/5）** |
 *
 * 旧版は Num 1 で副色を外していた。パーカーの `#FF8682`（衣装 33.2%）が
 * 耳・尻尾の `#FFAC8F`（11.4%）を上回るためで、地毛で絞ると消える誤り
 * （球体型姿は必ずしも衣装を着ていない、という前提が Num 1 では崩れている）。
 *
 * `AppliesTo` がどの色にも無いレコード（NumberTales/Secondary 等）は絞り込みようが無いので、
 * 旧版と同じ「全色をシェア順」へ落ちる。規則を触るときは確定 5 件で測り直し、
 * 下がるなら戻すこと。
 *
 * **`appliesTo` は出力しない。** 色語照合から組み立てた部位を書くと、User が
 * 「侵食されている」として差し戻した経路（CHANGELOG 2026-08-11）が下書き経由で復活する。
 * キーを省けば `applySlotAssignment()` が既存の `AppliesTo` をそのまま持ち越す。
 *
 * @param {ReturnType<typeof collectSlotEvidence>} evidence
 * @returns {{ assignment: Array<{slot: string, hex: string}>, unassigned: string[] }}
 */
export function proposeSlotAssignment(evidence) {
    /** @type {Array<{slot: string, hex: string}>} */
    const assignment = [];
    /** @type {string[]} */
    const unassigned = [];
    if (!evidence.length) return { assignment, unassigned };

    // 球体型姿が無いレコードでは人姿のシェアで代用する。両方無ければ全色が未割当。
    const hasBall = evidence.some(ev => ev.covBall > 0);
    const share = (ev) => (hasBall ? ev.covBall : ev.covArt);

    const ranked = [...evidence].sort((a, b) => share(b) - share(a));

    // 主色はシェア最大の色。地毛で絞ると `AppliesTo` の抜けに巻き込まれる
    // （Num 9 の `#A1A9BF` は球体型姿の 71.8% を占める髪だが `AppliesTo` が空）。
    const primary = share(ranked[0] ?? {}) > 0 ? ranked[0] : null;
    if (primary) assignment.push({ slot: 'primary', hex: primary.hex });

    // 副色は**地毛の色のうち 2 番目**。ここは絞りが要る: Num 1 のパーカー `#FF8682`（衣装 33.2%）は
    // 耳・尻尾の `#FFAC8F`（11.4%）よりシェアが大きいが副色ではない。
    // 部位が 1 つも判っていないレコードでは絞りようが無いので全色を候補にする。
    const known = evidence.some(ev => ev.appliesTo?.length);
    const secondary = ranked.find(ev => ev !== primary
        && (!known || classifyParts(ev.appliesTo).base)
        // シェアが小さすぎる色は別物（小物の差し色など）なので副色にしない
        && share(ev) >= 0.03);
    if (secondary) assignment.push({ slot: 'secondary', hex: secondary.hex });

    const used = new Set(assignment.map(a => a.hex));
    for (const ev of evidence) if (!used.has(ev.hex)) unassigned.push(ev.hex);

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
    const { workDir, dbPath, imagesRoot } = resolveDbPaths(opts.work, opts.db);

    // 共通造形色（肌・舌・コアフォルダの毛など）は透過イラスト抽出でだけ除外する。
    // 宣言が無い作品では空配列になり、除外は行われない。
    const commonColors = opts.fromArtwork ? readCommonColors(workDir) : [];

    const { original, records: db, spans } = openRecordsFile(dbPath);

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
            ({ ordered, measuredOn } = rankChipsByCoverage(chips, record, workDir, imagesRoot));
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

    if (opts.apply && applied) writeRecordsFile(dbPath, text);

    return { results, applied, dbPath };
}

// ────────────────────────────────────────────────────────────────────────────
// 色の追加モード（--add-colors）
// ────────────────────────────────────────────────────────────────────────────

/**
 * 既存の `ColorPalette` へ**色を足す**（既存の行は 1 つも触らない）。
 *
 * 配色検出が取りこぼした色を、外部の実測結果から補うための経路。
 * `100BeautiesLab_GeneratorsAI` の充足性レビューが出す「創作 DB に無い配色（実測 HEX）」を
 * 受け取る想定で、`Hex` と `AppliesTo` だけを書く。`Role` は指定が無ければ
 * `#ColorRole_Sub`（補助色）— 主従はスロット確定（`--assign-slots`）の仕事なので、
 * ここでは仮値に留める。色名・`Formation`・`Note_*` は創作内容なので `null` のまま。
 *
 * **重複は入れない**: 既存の色と RGB 距離 `minDistance` 未満なら同じ色とみなして飛ばす。
 * 共通造形色（`$EnumDef_CommonColor`）に一致する色も、設計上 `ColorPalette` へ載せない。
 *
 * @param {{work: string, db: string, colors: Array<{num: string, hex: string, appliesTo?: string[]|null, role?: string}>, apply: boolean, minDistance?: number, verbose: boolean}} opts
 * @returns {{ results: Array<any>, applied: number, dbPath: string }}
 */
export function addColorsToPalette(opts) {
    const { workDir, dbPath } = resolveDbPaths(opts.work, opts.db);
    const { original, records: db, spans } = openRecordsFile(dbPath);
    const minDistance = opts.minDistance ?? 10;
    const commonColors = readCommonColors(workDir);

    /** レコードごとにまとめる（1 レコード 1 回の書き換えで済ませる） */
    const byNum = new Map();
    for (const c of opts.colors) {
        const key = String(c.num);
        if (!byNum.has(key)) byNum.set(key, []);
        byNum.get(key).push(c);
    }

    /** @type {Array<any>} */
    const results = [];
    let text = original;

    // 末尾から処理する（先頭側のオフセットが変わらないようにするため）
    for (let i = db.length - 1; i >= 0; i--) {
        const record = db[i];
        const num = String(record.Num ?? recordLabel(record));
        const wanted = byNum.get(num);
        if (!wanted) continue;

        const existing = Array.isArray(record.ColorPalette) ? record.ColorPalette : [];
        const value = existing.slice();
        const added = [];

        for (const c of wanted) {
            const hex = String(c.hex ?? '').toUpperCase();
            if (!/^#[0-9A-F]{6}$/.test(hex)) {
                results.push({ num, hex: c.hex, status: 'error', message: 'カラーコードの形式が不正です' });
                continue;
            }
            const near = value.map(v => v.Hex).filter(Boolean)
                .reduce((min, h) => Math.min(min, colorDistance(h, hex)), Infinity);
            if (near < minDistance) {
                results.push({ num, hex, status: 'skipped-duplicate', message: `既存の色に近い（距離 ${near.toFixed(1)}）` });
                continue;
            }
            const nearCommon = commonColors
                .reduce((min, h) => Math.min(min, colorDistance(h, hex)), Infinity);
            if (nearCommon < minDistance) {
                results.push({ num, hex, status: 'skipped-common', message: `共通造形色に一致（距離 ${nearCommon.toFixed(1)}）` });
                continue;
            }
            const row = makePaletteRow({ role: c.role ?? ROLE_REST, hex, appliesTo: c.appliesTo ?? null });
            value.push(row);
            added.push(row);
        }

        if (!added.length) continue;
        try {
            text = upsertColorPaletteInRecord(text, spans[i], value).text;
            results.push({ num, status: 'added', added });
        } catch (err) {
            results.push({ num, status: 'error', message: err.message });
        }
    }

    results.reverse();
    const applied = results.filter(r => r.status === 'added').reduce((n, r) => n + r.added.length, 0);
    if (opts.apply && applied) writeRecordsFile(dbPath, text);
    return { results, applied, dbPath };
}

/**
 * 既存の `ColorPalette` の `AppliesTo` を差し替える（`Hex` で行を特定する）。
 *
 * `AppliesTo` は **その色が現れる部位を網羅する**という意味（User 確認済み）。
 * 「どのエントリにどの HEX が塗られているか」を外部で解決した結果を受け取る経路で、
 * `100BeautiesLab_GeneratorsAI` の
 * [エントリ別 HEX 対応](https://github.com/radiann-kswg/100BeautiesLab_CreationsDB/issues/21)
 * が入力になる。`Hex` / `Role` / 色名 / `Formation` / `Note_*` は触らない。
 *
 * 網羅の意味では既存値も正しい部位なので、**呼び出し側で和集合にしてから渡すこと**
 * （ここでは指定された値をそのまま書く。何を残すかの方針をツールに埋めない）。
 *
 * @param {{work: string, db: string, appliesTo: Array<{num: string, hex: string, appliesTo: string[]}>, apply: boolean, verbose: boolean}} opts
 * @returns {{ results: Array<any>, applied: number, dbPath: string }}
 */
export function setAppliesTo(opts) {
    const { dbPath } = resolveDbPaths(opts.work, opts.db);
    const { original, records: db, spans } = openRecordsFile(dbPath);
    const enumKeys = readBodyPartEnum();

    const byNum = new Map();
    for (const r of opts.appliesTo) {
        const key = String(r.num);
        if (!byNum.has(key)) byNum.set(key, []);
        byNum.get(key).push(r);
    }

    /** @type {Array<any>} */
    const results = [];
    let text = original;

    // 末尾から処理する（先頭側のオフセットが変わらないようにするため）
    for (let i = db.length - 1; i >= 0; i--) {
        const record = db[i];
        const num = String(record.Num ?? recordLabel(record));
        const wanted = byNum.get(num);
        if (!wanted || !Array.isArray(record.ColorPalette)) continue;

        const wantByHex = new Map(wanted.map(r => [String(r.hex).toUpperCase(), r.appliesTo]));
        let changed = 0;
        const value = record.ColorPalette.map(row => {
            const parts = wantByHex.get(String(row.Hex ?? '').toUpperCase());
            if (!parts) return row;
            const bad = parts.filter(p => !enumKeys.has(p));
            if (bad.length) {
                results.push({ num, hex: row.Hex, status: 'error', message: `未知の部位: ${bad.join(', ')}` });
                return row;
            }
            const before = JSON.stringify(row.AppliesTo ?? null);
            const after = parts.length ? parts : null;
            if (JSON.stringify(after) === before) return row;
            changed++;
            return { ...row, AppliesTo: after };
        });

        if (!changed) continue;
        try {
            text = upsertColorPaletteInRecord(text, spans[i], value).text;
            results.push({ num, status: 'updated', changed });
        } catch (err) {
            results.push({ num, status: 'error', message: err.message });
        }
    }

    results.reverse();
    const applied = results.filter(r => r.status === 'updated').reduce((n, r) => n + r.changed, 0);
    if (opts.apply && applied) writeRecordsFile(dbPath, text);
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
    const { workDir, dbPath, imagesRoot } = resolveDbPaths(opts.work, opts.db);
    const { original, records: db, spans } = openRecordsFile(dbPath);

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
        const source = given ? 'slots' : 'draft';
        try {
            const assignment = Array.isArray(given)
                ? given
                : proposeSlotAssignment(collectSlotEvidence(record, workDir, imagesRoot)).assignment;
            const { value, unassigned } = applySlotAssignment(record.ColorPalette, assignment);

            // 7 枠のどれとも判定できない色が残るレコードは書き込まない（User へ確認するため）
            if (unassigned.length) {
                results.push({ num, status: 'skipped-unassigned', unassigned, source });
                continue;
            }
            text = upsertColorPaletteInRecord(text, spans[i], value).text;
            results.push({ num, status: 'slotted', source, value });
        } catch (err) {
            results.push({ num, status: 'error', message: err.message });
        }
    }

    results.reverse();
    const applied = results.filter(r => r.status === 'slotted').length;
    if (opts.apply && applied) writeRecordsFile(dbPath, text);
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
 * 割当は `profileColorBands()` と同じ `scanAssignedPixels()` を通るので、
 * 図と帯分布は必ず同じ判定を見ている。
 *
 * 背景付きの画像（清書イラスト・設定画）は `buildForegroundMask()` で地を落とすため、
 * 淡いグレーが紙面として一緒に落ちて**足元や小物が欠けることがある**。
 *
 * @param {import('./extract-palette.mjs').DecodedImage} img
 * @param {string[]} hexes
 * @param {{cols?: number, rows?: number, maxDist?: number, step?: number}} [opt]
 * @returns {string[]} 行ごとの文字列
 */
export function renderColorMap(img, hexes, opt = {}) {
    const cols = opt.cols ?? 56;
    const rows = opt.rows ?? 40;
    const cellW = img.width / cols, cellH = img.height / rows;

    // セルごとの多数決。セル数 × 色数の票箱を先に作って 1 回の走査で埋める
    const votes = Array.from({ length: rows * cols }, () => new Array(hexes.length).fill(0));
    scanAssignedPixels(img, hexes, opt, (x, y, k) => {
        const cell = Math.min(rows - 1, Math.floor(y / cellH)) * cols + Math.min(cols - 1, Math.floor(x / cellW));
        votes[cell][k]++;
    });

    /** @type {string[]} */
    const out = [];
    for (let ry = 0; ry < rows; ry++) {
        let line = '';
        for (let rx = 0; rx < cols; rx++) {
            const v = votes[ry * cols + rx];
            let top = -1;
            for (let k = 0; k < v.length; k++) if (v[k] > 0 && (top < 0 || v[k] > v[top])) top = k;
            line += top < 0 ? '.' : String.fromCharCode(top < 9 ? 49 + top : 88); // 1-9 のあと X
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
    const { workDir, dbPath, imagesRoot } = resolveDbPaths(opts.work, opts.db);
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
    const { workDir, dbPath, imagesRoot } = resolveDbPaths(opts.work, opts.db);
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
  --applies-to <file>  既存 ColorPalette の AppliesTo を差し替える
                    形式: [{ "num": "1", "hex": "#ED5D47", "appliesTo": ["#BodyPart_Hair"] }]
                    AppliesTo は「その色が現れる部位を網羅する」意味。既存値を残したい場合は
                    呼び出し側で和集合にしてから渡すこと
  --add-colors <file>  既存 ColorPalette へ色を足す（既存行は触らない）
                    形式: [{ "num": "8", "hex": "#FF6574", "appliesTo": ["#BodyPart_Tail"] }]
                    既存の色や共通造形色と RGB 距離 10 未満なら重複として飛ばす
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
  Formation / Note_JP / Note_EN は null のまま
  ColorName_JP / ColorName_EN も抽出時は null。--assign-slots のときだけスロット表から確定する

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
 *
 * 数字だけの指定は**数値と文字列の両方**を入れる。`Num` が数値のレコード（`1`）と
 * 文字列のレコード（`"000"` / `"00"`）が混在しており、`Number()` だけに寄せると
 * `"000"` / `"00"` / `"0"` が全部 `0` へ潰れて 1 件も選べなくなる。
 *
 * @param {string} spec
 * @returns {Set<any>}
 */
function parseRecordSpec(spec) {
    const set = new Set();
    const addNum = (t) => { set.add(Number(t)); set.add(t); };
    for (const part of spec.split(',')) {
        const t = part.trim();
        if (!t) continue;
        const m = t.match(/^(\d+)-(\d+)$/);
        if (m) for (let i = Number(m[1]); i <= Number(m[2]); i++) addNum(String(i));
        else if (/^\d+$/.test(t)) addNum(t);
        else set.add(t); // "2-alt" / "444-mp" 等の特殊 Num
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
    const { workDir, dbPath, imagesRoot } = resolveDbPaths(opts.work, opts.db);
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

    for (const record of db) {
        const num = record.Num ?? recordLabel(record);
        if (opts.records && !opts.records.has(record.Num) && !opts.records.has(String(num))) continue;
        const hexes = (Array.isArray(record.ColorPalette) ? record.ColorPalette : [])
            .map(c => c?.Hex).filter(Boolean);
        if (!hexes.length) continue;

        console.log(`\n=== #${num} ===`);
        hexes.forEach((h, i) => console.log(`  ${i + 1} = ${h}`));

        // 清書イラストは `resolveSoloArtSources()` で絞る。素通しだと合同絵が混ざり、
        // 他キャラの色が図に描かれてしまう（判定材料の `collectSlotEvidence()` と同じ理由）。
        const files = [
            ...resolveArtworkSources(record, workDir, imagesRoot).map(s => ({ role: s.folder, path: s.path })),
            ...resolveSoloArtSources(record, workDir, imagesRoot).map(s => ({ role: 'solo', path: s.path })),
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
                const band = rel >= 0 && rel < 1 ? BAND_LABELS[Math.min(4, Math.floor(rel * 5))] : '　';
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
        console.log(`    ${'HEX'.padEnd(9)}${'球体%'.padStart(6)}${'人姿%'.padStart(7)}  ${BAND_LABELS.join('')}  クラス  スロット      部位`);
        for (const ev of r.evidence) {
            const slot = slotOf.get(ev.hex.toUpperCase()) ?? '-';
            // `AppliesTo`（issue #21 由来の確定値）が正。無いときだけ色語照合を `~` 付きで見せる
            const fallback = [...new Set(ev.hints.map(h => h.bodyPart).filter(Boolean))];
            const parts = ev.appliesTo?.length ? ev.appliesTo : fallback;
            const label = (ev.appliesTo?.length ? '' : parts.length ? '~' : '')
                + (parts.map(p => p.replace('#BodyPart_', '')).join(',') || '-');
            // 全角 1 文字＝2 桁で数えるため、無いクラスは全角スペースで埋めて桁を揃える
            const c = classifyParts(ev.appliesTo);
            const cls = `${c.base ? '地' : '　'}${c.costume ? '衣' : '　'}${c.accessory ? '飾' : '　'}`;
            // 帯は「その色がどこに出ているか」。近似色は被覆率では潰れるがここで分かれる
            const bands = (ev.bands ?? []).map(v => (v >= 0.4 ? '#' : v >= 0.15 ? '+' : v > 0.02 ? '.' : ' ')).join('');
            console.log(`    ${ev.hex}${(ev.covBall * 100).toFixed(1).padStart(6)}%${(ev.covArt * 100).toFixed(1).padStart(6)}%  ${bands}  ${cls}  ${slot.padEnd(12)} ${label}`);
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
    console.log('\n※ クラスは AppliesTo の部位から: 地=髪/耳/尻尾 衣=胸/腰/脚/肩/腕/背中 飾=それ以外（瞳・首・手・足など）');
    console.log('  部位の `~` 印は AppliesTo が空で色語照合にフォールバックしたもの（精度 3 割前後）。');
    console.log('\n※ この下書きが埋めるのは主色・副色だけです。衣装枠の順序はシェアでは決まらないため');
    console.log('  （確定 5 件で 3/5）、設定画を見て割当ファイルを作ってから --slots で適用してください。');
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

/**
 * AppliesTo の差し替え結果を表示する。
 * @param {{work: string, db: string, appliesTo: any[], apply: boolean, verbose: boolean}} opts
 */
function printAppliesTo(opts) {
    const { results, applied, dbPath } = setAppliesTo(opts);

    if (opts.verbose) {
        for (const r of results) {
            console.log(`  #${String(r.num).padEnd(8)} ${r.status}${r.changed ? ` ${r.changed} 色` : ''}${r.message ? ` — ${r.message}` : ''}`);
        }
        console.log('');
    }

    const tally = {};
    for (const r of results) tally[r.status] = (tally[r.status] ?? 0) + 1;
    console.log(`[AppliesTo の差し替え${opts.apply ? '' : ' / dry-run'}] ${opts.work} / ${opts.db}`);
    for (const [status, count] of Object.entries(tally)) console.log(`  ${status}: ${count} 件`);
    console.log(`  更新した色: ${applied} 色`);

    if (opts.apply && applied) {
        console.log(`\n  ${path.relative(REPO_ROOT, dbPath).split(path.sep).join('/')} を更新しました。`);
        console.log('  ※ 仕上げに `npx prettier --write` を実行してください。');
    } else if (!opts.apply) {
        console.log('\n  （--apply を付けると実際に書き込みます）');
    }
}

/**
 * 色の追加結果を表示する。
 * @param {{work: string, db: string, colors: any[], apply: boolean, verbose: boolean}} opts
 */
function printAddColors(opts) {
    const { results, applied, dbPath } = addColorsToPalette(opts);

    if (opts.verbose) {
        for (const r of results) {
            if (r.status === 'added') {
                console.log(`  #${String(r.num).padEnd(8)} +${r.added.length} 色  ${r.added.map(a => `${a.Hex}[${(a.AppliesTo ?? []).map(p => p.replace('#BodyPart_', '')).join(',') || '-'}]`).join(' ')}`);
            } else {
                console.log(`  #${String(r.num).padEnd(8)} ${r.hex ?? ''} ${r.status}${r.message ? ` — ${r.message}` : ''}`);
            }
        }
        console.log('');
    }

    const tally = {};
    for (const r of results) tally[r.status] = (tally[r.status] ?? 0) + 1;
    console.log(`[色の追加${opts.apply ? '' : ' / dry-run'}] ${opts.work} / ${opts.db}`);
    for (const [status, count] of Object.entries(tally)) console.log(`  ${status}: ${count} 件`);
    console.log(`  追加した色: ${applied} 色`);

    if (opts.apply && applied) {
        console.log(`\n  ${path.relative(REPO_ROOT, dbPath).split(path.sep).join('/')} を更新しました。`);
        console.log('  ※ 仕上げに `npx prettier --write` を実行してください。');
        console.log('  ※ Role は仮値（補助色）です。主従は --assign-slots で確定してください。');
    } else if (!opts.apply) {
        console.log('\n  （--apply を付けると実際に書き込みます）');
    }
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
    let addColorsFile = null;
    let appliesToFile = null;

    for (let i = 0; i < argv.length; i++) {
        switch (argv[i]) {
            case '--assign-slots': assignSlots = true; break;
            case '--add-colors': addColorsFile = argv[++i]; break;
            case '--applies-to': appliesToFile = argv[++i]; break;
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

    // ── AppliesTo の差し替え
    if (appliesToFile) {
        printAppliesTo({ ...opts, appliesTo: JSON.parse(fs.readFileSync(appliesToFile, 'utf8')) });
        return;
    }

    // ── 色の追加（既存行は触らない）
    if (addColorsFile) {
        printAddColors({ ...opts, colors: JSON.parse(fs.readFileSync(addColorsFile, 'utf8')) });
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
