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
    detectSwatchChips,
    measurePaletteCoverage,
    collectColorHints,
    resolveImageSources,
    scanTopLevelRecords,
    findValueEnd,
    hexToRgb,
    rgbToHsv,
} from './extract-palette.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

/** 被覆率の降順で割り当てる配色役割。4 色目以降はすべて Sub。 */
const ROLE_ORDER = ['#ColorRole_Primary', '#ColorRole_Secondary', '#ColorRole_Accent'];
const ROLE_REST = '#ColorRole_Sub';

/** チップ検出に使う設定画の優先順（concept を正とし、無ければ catalog） */
const SWATCH_SOURCES = [
    { role: 'concept', dir: 'concept', key: 'concept_PNGName' },
    { role: 'catalog', dir: 'catalog', key: 'catalog_PNGName' },
];

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
export function detectChipsForRecord(record, imagesRoot, manualChips = null) {
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

    for (const src of SWATCH_SOURCES) {
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

/**
 * 色語（`AppearanceDetail` 由来）と HEX が対応しそうかを判定する。
 * `extract-palette.mjs` の照合表と同じ考え方だが、こちらは HEX 単体を対象にする。
 *
 * @param {string} word  色語（例: 'red orange'）
 * @param {string} hex
 * @returns {boolean}
 */
function colorWordMatchesHex(word, hex) {
    const [r, g, b] = hexToRgb(hex);
    const { h, s, v } = rgbToHsv(r, g, b);
    /** @type {Record<string, (hsv: {h: number, s: number, v: number}) => boolean>} */
    const table = {
        'red': (c) => (c.h >= 345 || c.h <= 12) && c.s >= 0.35 && c.v >= 0.25,
        'red orange': (c) => c.h >= 8 && c.h <= 25 && c.s >= 0.35 && c.v >= 0.3,
        'orange': (c) => c.h >= 20 && c.h <= 42 && c.s >= 0.35 && c.v >= 0.35,
        'yellow': (c) => c.h >= 43 && c.h <= 68 && c.s >= 0.3 && c.v >= 0.4,
        'green': (c) => c.h >= 69 && c.h <= 165 && c.s >= 0.2 && c.v >= 0.2,
        'cyan': (c) => c.h >= 166 && c.h <= 200 && c.s >= 0.2 && c.v >= 0.3,
        'blue': (c) => c.h >= 201 && c.h <= 255 && c.s >= 0.2 && c.v >= 0.15,
        'purple': (c) => c.h >= 256 && c.h <= 300 && c.s >= 0.15 && c.v >= 0.2,
        'pink': (c) => c.h >= 301 && c.h <= 344 && c.s >= 0.12 && c.v >= 0.45,
        'brown': (c) => c.h >= 10 && c.h <= 45 && c.s >= 0.2 && c.v >= 0.15 && c.v <= 0.6,
        'white': (c) => c.s <= 0.14 && c.v >= 0.82,
        'black': (c) => c.s <= 0.3 && c.v <= 0.22,
        'gray': (c) => c.s <= 0.14 && c.v >= 0.22 && c.v <= 0.82,
    };
    const fn = table[word];
    return fn ? fn({ h, s, v }) : false;
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
    if (anchorKey < 0) throw new Error('AppearanceDetail が見つかりません（挿入位置を決められません）');

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
 * @property {boolean} verbose
 */

/**
 * 対象 DB の各レコードへ `ColorPalette` を追記・更新する。
 *
 * @param {PatchOptions} opts
 * @returns {{ results: Array<any>, applied: number, dbPath: string }}
 */
export function patchColorPalette(opts) {
    const dbPath = path.join(REPO_ROOT, 'data', `Works_${opts.work}`, 'DataBases', `db_${opts.db}.json`);
    const imagesRoot = path.join(REPO_ROOT, 'data', `Works_${opts.work}`, 'Images', `DB_${opts.db}`);
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
        const num = record.Num;
        if (opts.records && !opts.records.has(num)) continue;

        const hasExisting = 'ColorPalette' in record;
        if (hasExisting && !opts.force) {
            results.push({ num, status: 'skipped-existing' });
            continue;
        }

        const { chips, source } = detectChipsForRecord(record, imagesRoot, opts.manualChips);
        if (chips.length < opts.minChips) {
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

        const { ordered, measuredOn } = rankChipsByCoverage(chips, record, imagesRoot);
        const palette = buildColorPaletteValue(ordered, collectColorHints(record));

        try {
            const res = upsertColorPaletteInRecord(text, spans[i], palette);
            text = res.text;
            results.push({
                num,
                status: res.mode,
                chips: chips.length,
                source,
                measuredOn,
                palette: ordered,
            });
        } catch (err) {
            results.push({ num, status: 'error', message: err.message });
        }
    }

    results.reverse();
    const applied = results.filter(r =>
        r.status === 'inserted' || r.status === 'replaced' || r.status === 'dropped-unresolved').length;

    if (opts.apply && applied) {
        JSON.parse(text); // 壊れた JSON を書かないための最終ガード
        fs.writeFileSync(dbPath, text, 'utf8');
    }

    return { results, applied, dbPath };
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
  -v, --verbose     レコードごとの検出内容を表示
  -h, --help        このヘルプ

書き込む項目（機械的に決まるもの）:
  Role       キャラ画像での実測被覆率の降順に Primary / Secondary / Accent / Sub
  Hex        設定画のカラーチップから読み取った作者指定の色
  AppliesTo  色語が一致した AppearanceDetail の BodyPart を転記

書き込まない項目（創作内容のため User が記入する）:
  ColorName_JP / ColorName_EN / Formation / Note_JP / Note_EN は null のまま

注意:
  既存フォーマットを壊さないようテキスト挿入で追記します。
  書き込み後は \`npx prettier --write <db>\` を実行してください。
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

/** CLI エントリポイント。 */
function main() {
    const argv = process.argv.slice(2);
    if (argv.includes('-h') || argv.includes('--help')) printHelpAndExit();

    /** @type {PatchOptions} */
    const opts = {
        work: 'NumberTales', db: 'Primary', records: null,
        apply: false, force: false, dropUnresolved: false, minChips: 3,
        manualChips: null, verbose: false,
    };
    let all = false;

    for (let i = 0; i < argv.length; i++) {
        switch (argv[i]) {
            case '--work': opts.work = argv[++i]; break;
            case '--db': opts.db = argv[++i]; break;
            case '--records': opts.records = parseRecordSpec(argv[++i]); break;
            case '--all': all = true; break;
            case '--apply': opts.apply = true; break;
            case '--force': opts.force = true; break;
            case '--drop-unresolved': opts.dropUnresolved = true; break;
            case '--min-chips': opts.minChips = Number(argv[++i]); break;
            case '--chips': opts.manualChips = parseChipList(argv[++i]); break;
            case '-v': case '--verbose': opts.verbose = true; break;
            default:
                if (argv[i].startsWith('-')) { console.error(`未知のオプション: ${argv[i]}`); process.exit(1); }
        }
    }
    if (!all && !opts.records) {
        console.error('--records か --all を指定してください（--help でヘルプ）');
        process.exit(1);
    }
    // 入力検証（pkg/ と同じ安全トークン規約に合わせる）
    if (!/^[A-Za-z0-9_]+$/.test(opts.work) || !/^[A-Za-z0-9_]+$/.test(opts.db)) {
        console.error('work / db は英数字とアンダースコアのみ許可されます');
        process.exit(1);
    }

    const { results, applied, dbPath } = patchColorPalette(opts);

    if (opts.verbose) {
        for (const r of results) {
            if (r.status === 'inserted' || r.status === 'replaced') {
                const cols = r.palette
                    .map(p => `${p.hex}${p.coverage !== null ? `(${Math.round(p.coverage * 100)}%)` : ''}`)
                    .join(' ');
                console.log(`  #${String(r.num).padEnd(7)} ${r.status.padEnd(8)} ${r.chips}chips [${r.source}] ${cols}`);
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
    } else if (!opts.apply) {
        console.log('\n  （--apply を付けると実際に書き込みます）');
    }
    console.log('\n※ Hex は設定画のカラーチップ（作者指定色）、Role は実測被覆率の降順です。');
    console.log('※ 色名（ColorName_*）・Formation・Note は創作内容のため null のままです。');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    main();
}
