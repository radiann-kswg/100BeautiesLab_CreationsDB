/**
 * backfill-tailsunit-image.mjs
 *
 * `TailsUnit[].TailsUnit_PNGName`（$Def_TailsUnit の参考画像フィールド、$subfolder: "attr/tailsUnit"）へ、
 * User が用意した尻尾ユニット参考画像11枚のファイル名を書き戻す一回限りのバックフィルスクリプト。
 *
 * 対象: data/Works_NumberTales/DataBases/db_Primary.json のみ
 * （画像は Images/DB_Primary/attr/tailsUnit/ にしか存在しないため）
 *
 * 対象Num（IMG_MAP参照、11件）はいずれも現状 TailsUnit[0] が
 * Note_JP: null, Note_EN: null のみを持ち LayoutDirection を持たないことを確認済み。
 * 挿入時は Object.entries(entry) をループし Note_JP キーに到達する直前へ差し込むことで、
 * 将来 LayoutDirection を持つレコードに適用しても $DefType 宣言順
 * （TailShapeType, Count, Segment, Branches, LayoutDirection, TailsUnit_PNGName, Note_JP, Note_EN）
 * を自動的に守れる。
 *
 * 書き込み方式は scripts/backfill-tailsunit-layoutdirection.mjs と同じ
 * 「レコード単位で再構築 → JSON.stringify（コンパクト） → npx prettier --stdin-filepath 標準入力
 * 整形 → インデント補正 → 文字列レベルで元テキストへ差し込み」方式（対象外レコードのバイト列を
 * 一切変更しない）。
 *
 * 使い方:
 *   node scripts/backfill-tailsunit-image.mjs            # dry-run
 *   node scripts/backfill-tailsunit-image.mjs --write    # 実書き込み
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');

// ---------- レコード境界検出（他の backfill-*.mjs と同一ロジック） ----------

function findTopLevelObjectRanges(text) {
  const ranges = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) ranges.push([objStart, i + 1]);
    }
  }
  return ranges;
}

function prettierFormat(jsonText) {
  return execSync('npx prettier --stdin-filepath tmp.json', {
    input: jsonText,
    encoding: 'utf-8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function shiftToRecordDepth(formattedText) {
  const lines = formattedText.replace(/\n$/, '').split('\n');
  return lines.map((line, idx) => (idx === 0 ? line : `  ${line}`)).join('\n');
}

// ---------- Num -> 参考画像ファイル名（User準備済み、11件） ----------

const IMG_MAP = new Map([
  [4, 'attr_tailsUnit4.png'],
  [6, 'attr_tailsUnit6.png'],
  [16, 'attr_tailsUnit16.png'],
  [23, 'attr_tailsUnit23.png'],
  [39, 'attr_tailsUnit39.png'],
  [49, 'attr_tailsUnit49.png'],
  [57, 'attr_tailsUnit57.png'],
  [61, 'attr_tailsUnit61.png'],
  [73, 'attr_tailsUnit73.png'],
  [85, 'attr_tailsUnit85.png'],
  [93, 'attr_tailsUnit93.png'],
]);

// ---------- 1レコード分の TailsUnit[] へ TailsUnit_PNGName を付与 ----------

/**
 * @returns {{tailsUnit: object[], changed: boolean, warnings: string[]}}
 */
function backfillTailsUnitImage(tailsUnitArr, num, relPath) {
  const warnings = [];
  let changed = false;
  const fileName = IMG_MAP.get(num);
  if (!fileName) return { tailsUnit: tailsUnitArr, changed, warnings };

  if (tailsUnitArr.length !== 1) {
    warnings.push(`[${relPath} Num:${num}] TailsUnit[] の要素数が1件ではありません（${tailsUnitArr.length}件）。先頭要素にのみ適用します。`);
  }

  const result = tailsUnitArr.map((entry, idx) => {
    if (idx !== 0) return entry;
    if (entry.TailsUnit_PNGName) return entry; // 既に付与済みなら触らない

    changed = true;
    let inserted = false;
    const newEntry = {};
    for (const [k, v] of Object.entries(entry)) {
      if (k === 'Note_JP' && !inserted) {
        newEntry.TailsUnit_PNGName = fileName;
        inserted = true;
      }
      newEntry[k] = v;
    }
    if (!inserted) newEntry.TailsUnit_PNGName = fileName;
    return newEntry;
  });

  return { tailsUnit: result, changed, warnings };
}

// ---------- 1ファイル分の処理 ----------

function processFile(relPath) {
  const fullPath = resolve(repoRoot, relPath);
  const text = readFileSync(fullPath, 'utf-8');
  const ranges = findTopLevelObjectRanges(text);
  const db = JSON.parse(text);

  if (ranges.length !== db.length) {
    throw new Error(`[${relPath}] レコード境界検出数(${ranges.length})とJSON配列長(${db.length})が不一致。中断します。`);
  }

  const allWarnings = [];
  const replacements = [];
  let changedCount = 0;
  const matchedNums = new Set();

  for (let i = 0; i < db.length; i++) {
    const rec = db[i];
    if (!Array.isArray(rec.TailsUnit)) continue;
    if (!IMG_MAP.has(rec.Num)) continue;

    matchedNums.add(rec.Num);
    const { tailsUnit, changed, warnings } = backfillTailsUnitImage(rec.TailsUnit, rec.Num, relPath);
    allWarnings.push(...warnings);
    if (!changed) continue;

    changedCount++;
    const newRecord = { ...rec, TailsUnit: tailsUnit };
    const minified = JSON.stringify(newRecord);
    const formatted = prettierFormat(minified);
    const shifted = shiftToRecordDepth(formatted);
    replacements.push({ range: ranges[i], newText: shifted });
  }

  for (const num of IMG_MAP.keys()) {
    if (!matchedNums.has(num)) {
      allWarnings.push(`[${relPath}] Num:${num} のレコードが見つかりませんでした（IMG_MAPに定義済みだが未適用）。`);
    }
  }

  return { relPath, text, total: db.length, changedCount, allWarnings, replacements };
}

function applyReplacements(text, replacements) {
  const sorted = [...replacements].sort((a, b) => b.range[0] - a.range[0]);
  let result = text;
  for (const r of sorted) {
    const [start, end] = r.range;
    result = result.slice(0, start) + r.newText + result.slice(end);
  }
  return result;
}

// ---------- main ----------

const targets = ['data/Works_NumberTales/DataBases/db_Primary.json'];

let totalWarnings = 0;
for (const t of targets) {
  const { relPath, text, total, changedCount, allWarnings, replacements } = processFile(t);
  totalWarnings += allWarnings.length;

  console.log(`\n=== ${relPath} ===`);
  console.log(`総レコード数: ${total}件 / TailsUnit_PNGName付与: ${changedCount}件 / 警告: ${allWarnings.length}件`);
  for (const w of allWarnings) console.log(`  [WARN] ${w}`);

  if (WRITE) {
    const newText = applyReplacements(text, replacements);
    writeFileSync(resolve(repoRoot, relPath), newText, 'utf-8');
    JSON.parse(readFileSync(resolve(repoRoot, relPath), 'utf-8'));
    console.log(`  --write により保存しました（JSON構文検証OK）。`);
  }
}

console.log(`\n合計警告件数: ${totalWarnings}`);
if (!WRITE) {
  console.log('(dry-run: ファイルへは書き込んでいません。--write を付けて再実行すると反映されます)');
}
