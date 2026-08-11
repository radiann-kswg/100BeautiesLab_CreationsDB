/**
 * patch-appearance-bodypart.mjs
 *
 * `AppearanceDetail[].BodyPart` が `null` のエントリへ、部位を書き込むパッチツール。
 *
 * 目的:
 * - 配色ツール（`patch-colorpalette.mjs`）は `AppearanceDetail` の色語から
 *   `ColorPalette.AppliesTo` へ部位を**転記**する。`BodyPart` が `null` だと、
 *   色が読み取れていても部位へ紐づけられない。その穴を埋める。
 * - 部位の判定材料は `100BeautiesLab_GeneratorsAI` の
 *   `verify_appearance_detail` が出す充足性レビュー（GitHub Issue）。
 *
 * 設計原則（AGENTS.md 準拠）:
 * - **創作内容の自動生成はしない。** 書き込むのは既存の記述から読み取れる部位だけ
 *   （"blue eyes" → `#BodyPart_Eye` のような転記）。場所が書かれていない記述
 *   （"pattern inspired by '40'" 等）は対象外で、割当ファイルへ入れないこと。
 * - **既存フォーマットを壊さない。** `JSON.parse`/`stringify` の往復は prettier が
 *   1 行に畳んでいる配列をすべて展開してしまうため、テキスト置換で書き込む
 *   （`patch-colorpalette.mjs` と同じ方針）。
 * - **既定は dry-run。** 書き込みには `--apply` が必須。
 * - **既に部位があるエントリは上書きしない**（`--force` で明示したときのみ）。
 *
 * CLI 使い方:
 *   node tools/patch-appearance-bodypart.mjs --work NumberTales --fills <file.json>
 *   node tools/patch-appearance-bodypart.mjs --work NumberTales --fills <file.json> --apply
 *
 * 割当ファイルの形式:
 *   [
 *     { "db": "db_Primary.json", "num": "14", "index": 9,
 *       "bodyParts": ["#BodyPart_Chest", "#BodyPart_Arm"] }
 *   ]
 *
 * @author 100BeautiesLab.
 * @version 0.1.0
 * @dependencies tools/extract-palette.mjs（レコード走査 / 値の終端検出）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanTopLevelRecords, findValueEnd } from './extract-palette.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

/** `data/db_meta.json` の `$EnumDef_DesignBodyPart` にある部位キー（入力検証用） */
export function readBodyPartEnum(repoRoot = REPO_ROOT) {
    const meta = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data', 'db_meta.json'), 'utf8'));
    return new Set(Object.keys(meta?.General?.$VarsDef?.$EnumDef_DesignBodyPart ?? {}));
}

/**
 * JSON 配列テキストの要素を、文字列リテラルを踏まないように走査して切り出す。
 *
 * `findValueEnd()` は「キーのコロンから値の終端まで」を返すが、配列の**何番目の要素か**は
 * 教えてくれない。`AppearanceDetail[9]` のような添字指定で書き込むために必要。
 *
 * @param {string} text
 * @param {number} openBracket  `[` の位置
 * @returns {Array<[number, number]>} 各要素の [start, end)
 * @throws {Error} 配列が閉じていない場合
 */
export function scanArrayElements(text, openBracket) {
    if (text[openBracket] !== '[') throw new Error(`配列の開始 [ ではありません: ${openBracket}`);
    /** @type {Array<[number, number]>} */
    const spans = [];
    let depth = 0, inString = false, escaped = false, start = -1;

    for (let i = openBracket; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') { inString = true; continue; }

        if (ch === '[' || ch === '{') {
            depth++;
            if (depth === 2 && start < 0) start = i;
            continue;
        }
        if (ch === ']' || ch === '}') {
            depth--;
            if (depth === 1 && start >= 0) { spans.push([start, i + 1]); start = -1; }
            if (depth === 0) return spans; // 対象の配列が閉じた
            continue;
        }
        // プリミティブ要素（数値・true/null 等）はこのツールの対象外なので拾わない
    }
    throw new Error('配列が閉じていません');
}

/**
 * レコードテキスト内の `AppearanceDetail[index].BodyPart` を書き換える。
 *
 * @param {string} text  ファイル全体のテキスト
 * @param {[number, number]} span  対象レコードの範囲
 * @param {number} index  `AppearanceDetail` の添字
 * @param {string[]} bodyParts
 * @param {{force?: boolean}} [opt]
 * @returns {{ text: string, delta: number, previous: string }}
 * @throws {Error} 対象が見つからない / 既に値がある（force なし）場合
 */
export function setBodyPartInRecord(text, span, index, bodyParts, opt = {}) {
    const [start, end] = span;
    const record = text.slice(start, end);

    const keyIdx = record.indexOf('"AppearanceDetail"');
    if (keyIdx < 0) throw new Error('AppearanceDetail が見つかりません');
    const colon = record.indexOf(':', keyIdx + '"AppearanceDetail"'.length);
    let open = colon + 1;
    while (open < record.length && /\s/.test(record[open])) open++;
    if (record[open] !== '[') throw new Error('AppearanceDetail が配列ではありません');

    const elements = scanArrayElements(record, open);
    if (index < 0 || index >= elements.length) {
        throw new Error(`AppearanceDetail[${index}] がありません（要素数 ${elements.length}）`);
    }
    const [eStart, eEnd] = elements[index];
    const element = record.slice(eStart, eEnd);

    const bpKey = element.indexOf('"BodyPart"');
    if (bpKey < 0) throw new Error(`AppearanceDetail[${index}] に BodyPart キーがありません`);
    const bpColon = element.indexOf(':', bpKey + '"BodyPart"'.length);
    let vStart = bpColon + 1;
    while (vStart < element.length && /\s/.test(element[vStart])) vStart++;
    const vEnd = findValueEnd(element, bpColon);
    const previous = element.slice(vStart, vEnd);

    if (previous.trim() !== 'null' && !opt.force) {
        throw new Error(`AppearanceDetail[${index}].BodyPart は既に ${previous.trim()} です`);
    }

    // prettier が短い配列を 1 行に畳む書式に合わせる（`["#BodyPart_Chest", "#BodyPart_Arm"]`）
    const json = `[${bodyParts.map(p => JSON.stringify(p)).join(', ')}]`;
    const abs = start + eStart;
    return {
        text: text.slice(0, abs + vStart) + json + text.slice(abs + vEnd),
        delta: json.length - (vEnd - vStart),
        previous,
    };
}

/**
 * 割当ファイルに従って `BodyPart` を書き込む。
 *
 * @param {{work: string, fills: Array<{db: string, num: string, index: number, bodyParts: string[]}>, apply: boolean, force: boolean}} opts
 * @returns {{ results: Array<any>, applied: number }}
 */
export function patchBodyParts(opts) {
    const dbDir = path.join(REPO_ROOT, 'data', `Works_${opts.work}`, 'DataBases');
    const enumKeys = readBodyPartEnum();

    /** DB ファイルごとにまとめる（1 ファイルにつき 1 回だけ読み書きする） */
    const byDb = new Map();
    for (const fill of opts.fills) {
        if (!byDb.has(fill.db)) byDb.set(fill.db, []);
        byDb.get(fill.db).push(fill);
    }

    /** @type {Array<any>} */
    const results = [];
    let applied = 0;

    for (const [dbFile, fills] of byDb) {
        const dbPath = path.join(dbDir, dbFile);
        if (!fs.existsSync(dbPath)) {
            for (const f of fills) results.push({ ...f, status: 'error', message: `DB が見つかりません: ${dbFile}` });
            continue;
        }
        const original = fs.readFileSync(dbPath, 'utf8');
        const db = JSON.parse(original);
        const spans = scanTopLevelRecords(original);
        if (spans.length !== db.length) {
            throw new Error(`レコード走査に失敗しました（テキスト ${spans.length} 件 / パース ${db.length} 件）: ${dbFile}`);
        }
        const indexOfNum = new Map(db.map((r, i) => [String(r.Num), i]));

        // 末尾のレコードから処理する（先頭側のオフセットが変わらないようにするため）。
        // 同一レコード内は添字の降順（同じ理由）。
        const ordered = fills
            .map(f => ({ ...f, recordIndex: indexOfNum.get(String(f.num)) }))
            .sort((a, b) => (b.recordIndex - a.recordIndex) || (b.index - a.index));

        let text = original;
        for (const f of ordered) {
            if (f.recordIndex === undefined) {
                results.push({ ...f, status: 'error', message: `Num ${f.num} が ${dbFile} にありません` });
                continue;
            }
            const bad = (f.bodyParts ?? []).filter(p => !enumKeys.has(p));
            if (!f.bodyParts?.length || bad.length) {
                results.push({ ...f, status: 'error', message: bad.length ? `未知の部位: ${bad.join(', ')}` : '部位が空です' });
                continue;
            }
            try {
                const res = setBodyPartInRecord(text, spans[f.recordIndex], f.index, f.bodyParts, { force: opts.force });
                text = res.text;
                results.push({ ...f, status: 'set', previous: res.previous });
                applied++;
            } catch (err) {
                results.push({ ...f, status: 'skipped', message: err.message });
            }
        }

        if (opts.apply && text !== original) {
            JSON.parse(text); // 壊れた JSON を書かないための最終ガード
            fs.writeFileSync(dbPath, text, 'utf8');
        }
    }

    return { results, applied };
}

// ────────────────────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────────────────────

/** ヘルプを表示して終了する。 */
function printHelpAndExit() {
    console.log(`
patch-appearance-bodypart.mjs — AppearanceDetail[].BodyPart の欠落を埋める

使い方:
  node tools/patch-appearance-bodypart.mjs --work <Work> --fills <file.json> [--apply]

オプション:
  --work <name>    作品名（既定: NumberTales）
  --fills <file>   割当ファイル（JSON 配列）
  --apply          実データへ書き込む（未指定時は dry-run）
  --force          既に値がある BodyPart も上書きする
  -v, --verbose    1 件ずつ表示
  -h, --help       このヘルプ

割当ファイルの形式:
  [
    { "db": "db_Primary.json", "num": "14", "index": 9,
      "bodyParts": ["#BodyPart_Chest", "#BodyPart_Arm"] }
  ]

注意:
  書き込むのは既存の記述から読み取れる部位だけです（創作内容を新たに作らない）。
  場所が書かれていない記述は割当ファイルへ入れないでください。
  書き込み後は \`npx prettier --write <db>\` を実行してください。
`);
    process.exit(0);
}

/** CLI エントリポイント。 */
function main() {
    const argv = process.argv.slice(2);
    if (argv.includes('-h') || argv.includes('--help') || !argv.length) printHelpAndExit();

    const opts = { work: 'NumberTales', fills: [], apply: false, force: false, verbose: false };
    let fillsPath = null;

    for (let i = 0; i < argv.length; i++) {
        switch (argv[i]) {
            case '--work': opts.work = argv[++i]; break;
            case '--fills': fillsPath = argv[++i]; break;
            case '--apply': opts.apply = true; break;
            case '--force': opts.force = true; break;
            case '-v': case '--verbose': opts.verbose = true; break;
            default:
                if (argv[i].startsWith('-')) { console.error(`未知のオプション: ${argv[i]}`); process.exit(1); }
        }
    }
    // 入力検証（pkg/ と同じ安全トークン規約に合わせる）
    if (!/^[A-Za-z0-9_]+$/.test(opts.work)) {
        console.error('work は英数字とアンダースコアのみ許可されます');
        process.exit(1);
    }
    if (!fillsPath) { console.error('--fills を指定してください'); process.exit(1); }
    opts.fills = JSON.parse(fs.readFileSync(fillsPath, 'utf8'));
    if (!Array.isArray(opts.fills)) { console.error('割当ファイルは配列である必要があります'); process.exit(1); }

    const { results, applied } = patchBodyParts(opts);

    if (opts.verbose) {
        for (const r of results) {
            const parts = (r.bodyParts ?? []).map(p => p.replace('#BodyPart_', '')).join(',');
            console.log(`  #${String(r.num).padEnd(8)} [${String(r.index).padStart(2)}] ${r.status.padEnd(8)} ${parts}${r.message ? ` — ${r.message}` : ''}`);
        }
        console.log('');
    }

    const tally = {};
    for (const r of results) tally[r.status] = (tally[r.status] ?? 0) + 1;
    console.log(`[BodyPart 補完${opts.apply ? '' : ' / dry-run'}] Works_${opts.work}`);
    for (const [status, count] of Object.entries(tally)) console.log(`  ${status}: ${count} 件`);

    if (opts.apply && applied) {
        console.log(`\n  ${applied} 件を書き込みました。`);
        console.log('  ※ 仕上げに `npx prettier --write` を実行してください。');
    } else if (!opts.apply) {
        console.log('\n  （--apply を付けると実際に書き込みます）');
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    main();
}
