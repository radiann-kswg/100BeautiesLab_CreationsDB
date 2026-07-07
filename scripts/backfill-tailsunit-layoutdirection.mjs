/**
 * backfill-tailsunit-layoutdirection.mjs
 *
 * `TailsUnit[].LayoutDirection`（`{LayoutFrom, LayoutTo}`）を、既に移行済みの
 * `Branches[]` データから逆算して書き戻す一回限りのバックフィルスクリプト。
 *
 * 対象: data/Works_NumberTales/DataBases/db_Secondary.json / db_SelfSecondary.json
 * （db_Primary.json / db_SemiPrimary.json は narrative 形式の TailsUnit が存在しないため対象外）
 *
 * 対象外（元テキストに方向句が無かったレコード。SKIP_NUMS で明示除外）:
 *   401 / 510 / 605 / 670（各 -numberize 系含む）— 括弧書き2段形式「(上X束Y本+下Z束W本)」で、
 *   ヘッダの「〜から〜に向かって」句自体が元々存在しない。
 *
 * 大半（Category A）は Branches[0].Laterality / Branches[末尾].Laterality を
 * そのまま LayoutFrom/LayoutTo として採用できる（先頭・末尾に位置語が無い場合のみヘッダ方向を
 * 先頭・末尾へ割り当てていた、という前回移行時のロジックに一致するため）。
 *
 * 一部（Category B、MANUAL_OVERRIDES）は個別の段に位置語があり、かつヘッダの方向語が
 * その個別語と一致しない（例: ヘッダは「中央から周辺」なのに各段は上/下でタグ付けされている）。
 * これらは Branches からの自動導出ができないため、本セッション内で TailsUnit_JP を精査した
 * 記録に基づき Num 単位で直接指定する。
 *
 * 書き込み方式は scripts/migrate-appearancedetail-to-tailsunit.mjs と同じ
 * 「レコード単位で再構築 → JSON.stringify（コンパクト） → npx prettier --stdin-filepath 標準入力
 * 整形 → インデント補正 → 文字列レベルで元テキストへ差し込み」方式（対象外レコードのバイト列を
 * 一切変更しない）。
 *
 * 使い方:
 *   node scripts/backfill-tailsunit-layoutdirection.mjs            # dry-run
 *   node scripts/backfill-tailsunit-layoutdirection.mjs --write    # 実書き込み
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');

// ---------- レコード境界検出（migrate-appearancedetail-to-tailsunit.mjs と同一ロジック） ----------

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

// ---------- 対象外（括弧書き2段、ヘッダ方向句が元々無い） ----------

const SKIP_NUMS = new Set([
  '401-numberize', '401',
  '510-numberize', '510',
  '605-numberize', '605',
  '670-numberize', '670',
]);

// ---------- Category B: ヘッダ方向とBranchesの個別タグが一致しないため直接指定 ----------

const MANUAL_OVERRIDES = new Map([
  ['241-numberize', { LayoutFrom: '#Lat_Center', LayoutTo: '#Lat_Periphery' }],
  ['241', { LayoutFrom: '#Lat_Center', LayoutTo: '#Lat_Periphery' }],
  ['376-numberize', { LayoutFrom: '#Lat_Center', LayoutTo: '#Lat_Periphery' }],
  ['376', { LayoutFrom: '#Lat_Center', LayoutTo: '#Lat_Periphery' }],
  ['387-numberize', { LayoutFrom: '#Lat_Center', LayoutTo: '#Lat_Periphery' }],
  ['387', { LayoutFrom: '#Lat_Center', LayoutTo: '#Lat_Periphery' }],
  ['421-numberize', { LayoutFrom: '#Lat_Center', LayoutTo: '#Lat_Periphery' }],
  ['421', { LayoutFrom: '#Lat_Center', LayoutTo: '#Lat_Periphery' }],
  ['476-numberize', { LayoutFrom: '#Lat_Periphery', LayoutTo: '#Lat_Center' }],
  ['476', { LayoutFrom: '#Lat_Periphery', LayoutTo: '#Lat_Center' }],
  ['625-numberize', { LayoutFrom: '#Lat_Center', LayoutTo: '#Lat_Periphery' }],
  ['625', { LayoutFrom: '#Lat_Center', LayoutTo: '#Lat_Periphery' }],
  ['638-numberize', { LayoutFrom: '#Lat_Center', LayoutTo: '#Lat_Periphery' }],
  ['638', { LayoutFrom: '#Lat_Center', LayoutTo: '#Lat_Periphery' }],
  ['736-numberize', { LayoutFrom: '#Lat_Center', LayoutTo: '#Lat_Periphery' }],
  ['736', { LayoutFrom: '#Lat_Center', LayoutTo: '#Lat_Periphery' }],
]);

// ---------- 1レコード分の TailsUnit[] へ LayoutDirection を付与 ----------

/**
 * @returns {{tailsUnit: object[], changed: boolean, warnings: string[]}}
 */
function backfillTailsUnit(tailsUnitArr, num, relPath) {
  const warnings = [];
  let changed = false;
  const numKey = String(num);

  const result = tailsUnitArr.map((entry) => {
    if (!Array.isArray(entry.Branches) || entry.Branches.length < 2) return entry;
    if (SKIP_NUMS.has(numKey)) return entry;
    if (entry.LayoutDirection) return entry; // 既に付与済みなら触らない

    let layoutFrom;
    let layoutTo;
    const override = MANUAL_OVERRIDES.get(numKey);
    if (override) {
      layoutFrom = override.LayoutFrom;
      layoutTo = override.LayoutTo;
    } else {
      layoutFrom = entry.Branches[0]?.Laterality ?? null;
      layoutTo = entry.Branches[entry.Branches.length - 1]?.Laterality ?? null;
      if (!layoutFrom || !layoutTo) {
        warnings.push(`[${relPath} Num:${numKey}] Branches先頭/末尾のLaterality導出に失敗（要手動確認）: first=${JSON.stringify(layoutFrom)} last=${JSON.stringify(layoutTo)}`);
        return entry;
      }
    }

    changed = true;
    // $DefType 宣言順（TailShapeType, Count, Segment, Branches, LayoutDirection, Note_JP, Note_EN）に合わせて
    // Branches の直後・Note_JP の直前へ挿入する
    const newEntry = {};
    for (const [k, v] of Object.entries(entry)) {
      newEntry[k] = v;
      if (k === 'Branches') {
        newEntry.LayoutDirection = { LayoutFrom: layoutFrom, LayoutTo: layoutTo };
      }
    }
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

  for (let i = 0; i < db.length; i++) {
    const rec = db[i];
    if (!Array.isArray(rec.TailsUnit)) continue;

    const { tailsUnit, changed, warnings } = backfillTailsUnit(rec.TailsUnit, rec.Num, relPath);
    allWarnings.push(...warnings);
    if (!changed) continue;

    changedCount++;
    const newRecord = { ...rec, TailsUnit: tailsUnit };
    const minified = JSON.stringify(newRecord);
    const formatted = prettierFormat(minified);
    const shifted = shiftToRecordDepth(formatted);
    replacements.push({ range: ranges[i], newText: shifted });
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

const targets = [
  'data/Works_NumberTales/DataBases/db_Secondary.json',
  'data/Works_NumberTales/DataBases/db_SelfSecondary.json',
];

let totalWarnings = 0;
for (const t of targets) {
  const { relPath, text, total, changedCount, allWarnings, replacements } = processFile(t);
  totalWarnings += allWarnings.length;

  console.log(`\n=== ${relPath} ===`);
  console.log(`総レコード数: ${total}件 / LayoutDirection付与: ${changedCount}件 / 警告: ${allWarnings.length}件`);
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
