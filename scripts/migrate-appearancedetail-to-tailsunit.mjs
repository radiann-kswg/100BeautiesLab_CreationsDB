/**
 * migrate-appearancedetail-to-tailsunit.mjs
 *
 * `AppearanceDetail[].DesignElement:"#Element_TailsUnit"` を新設の専用構造化フィールド
 * `TailsUnit`（`$Def_TailsUnit[]`）へ変換し、旧フィールド（`TailsUnit_JP`/`TailsUnit_EN`、
 * および AppearanceDetail 側の #Element_TailsUnit エントリ）を削除する。
 *
 * 対象:
 *   - data/Works_NumberTales/DataBases/db_Primary.json
 *   - data/Works_NumberTales/DataBases/db_Secondary.json
 *   - data/Works_NumberTales/DataBases/db_SemiPrimary.json
 *   - data/Works_NumberTales/DataBases/db_SelfSecondary.json
 *
 * 既存のAppearanceDetail Attrs（Shape/Count/Segment/Branch）は前セッションで検証済みの
 * 構造化データなので、生JPテキストの再パースは行わず、フィールド単位の機械的変換のみ行う。
 *
 * 書き込み方式（重要・過去の反省を踏まえた設計）:
 *   ファイル全体を JSON.parse → JSON.stringify で書き直すと、対象外レコードまで
 *   改行展開されて壊れる（Prettier は「展開済みを1行に戻す」動作をしないため矯正不可）。
 *   このスクリプトは「変更が必要なレコードのみ」を対象に、
 *   1) そのレコードを新オブジェクトとして再構築
 *   2) JSON.stringify（コンパクト・整形なし）
 *   3) `npx prettier --stdin-filepath tmp.json` に標準入力で渡して整形
 *   4) 先頭行以外の各行に2スペース加算（トップレベルオブジェクト→配列要素の深さに補正）
 *   5) 元の生テキストの、そのレコードの範囲だけを文字列レベルで置換
 *   という手順を踏み、対象外レコードのバイト列を一切変更しない。
 *   （この手順の正当性は、実データの1レコードを使った手動ラウンドトリップ検証で
 *   バイト完全一致することを確認済み。）
 *
 * 使い方:
 *   node scripts/migrate-appearancedetail-to-tailsunit.mjs            # dry-run
 *   node scripts/migrate-appearancedetail-to-tailsunit.mjs --write    # 実書き込み
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');

// ---------- レコード境界検出（文字列/エスケープを考慮したブラケット深度カウント） ----------

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

// ---------- Prettier 整形（標準入力経由。ファイル引数版は整形されないため使わない） ----------

function prettierFormat(jsonText) {
  return execSync('npx prettier --stdin-filepath tmp.json', {
    input: jsonText,
    encoding: 'utf-8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

/**
 * 再整形済みテキスト（トップレベルオブジェクトとして整形された文字列）を、
 * 配列要素としての深さ（2スペース）へシフトする。
 * 先頭行（"{"）はレコード境界の開始位置に既に合っているためシフトしない。
 */
function shiftToRecordDepth(formattedText) {
  const lines = formattedText.replace(/\n$/, '').split('\n');
  return lines.map((line, idx) => (idx === 0 ? line : `  ${line}`)).join('\n');
}

// ---------- 唯一の異常データ特例（db_Primary.json Num:10, つぼみ型の自由テキストBranch） ----------

const MANUAL_TAILSUNIT_OVERRIDE = {
  'data/Works_NumberTales/DataBases/db_Primary.json': {
    10: () => [{
      TailShapeType: '#TailShapeType_Bud',
      Count: 1,
      Note_JP: '大1束+小9束（大小の束構成）',
      Note_EN: '1 large cluster + 9 small clusters (large/small cluster composition)',
    }],
  },
};

// ---------- AppearanceDetail 1エントリ分の Attrs[] → $Def_TailsUnit 変換 ----------

function transformEntryToTailsUnit(entry, ctx) {
  const attrs = Array.isArray(entry.Attrs) ? entry.Attrs : [];
  let tailShapeType;
  let count;
  let segment;
  const branches = [];

  for (const attr of attrs) {
    if (!attr || typeof attr !== 'object') continue;
    switch (attr.AttrLabel) {
      case '#DesignAttr_Shape':
        if (typeof attr.vdict_TailShapeType !== 'string') {
          throw new Error(`[${ctx.file} Num:${JSON.stringify(ctx.num)}] Shape属性がvdict_TailShapeTypeを持たない（想定外パターン）: ${JSON.stringify(attr)}`);
        }
        tailShapeType = attr.vdict_TailShapeType;
        break;
      case '#DesignAttr_Count':
        count = attr.value_Num;
        break;
      case '#DesignAttr_Segment':
        segment = attr.value_Num;
        break;
      case '#DesignAttr_Branch':
        if (attr.value_Num_1 !== undefined && attr.value_Num_2 !== undefined) {
          branches.push({
            Laterality: attr.vdict_Laterality ?? null,
            TailCount: attr.value_Num_1,
            ClusterCount: attr.value_Num_2,
          });
          break;
        }
        // 自由テキスト形式（例: value_JP:"2束"）は「段分けなしの均一クラスター数」を表す
        // Segment 相当として扱う（前セッションの「N本x各M束」パターンと同じ意味）。
        {
          const uniformMatch = typeof attr.value_JP === 'string' && attr.value_JP.match(/^(\d+)束$/);
          if (uniformMatch) {
            segment = Number(uniformMatch[1]);
            break;
          }
        }
        throw new Error(`[${ctx.file} Num:${JSON.stringify(ctx.num)}] Branch属性が構造化形式でも既知の自由テキスト形式でもない（想定外パターン。MANUAL_TAILSUNIT_OVERRIDEでの個別対応を検討）: ${JSON.stringify(attr)}`);
      default:
        throw new Error(`[${ctx.file} Num:${JSON.stringify(ctx.num)}] 未知のAttrLabel: ${attr.AttrLabel}`);
    }
  }

  if (tailShapeType === undefined) {
    throw new Error(`[${ctx.file} Num:${JSON.stringify(ctx.num)}] Shape属性(#DesignAttr_Shape)が見つからない`);
  }
  if (count === undefined) {
    throw new Error(`[${ctx.file} Num:${JSON.stringify(ctx.num)}] Count属性(#DesignAttr_Count)が見つからない`);
  }

  const result = { TailShapeType: tailShapeType, Count: count };
  if (segment !== undefined) result.Segment = segment;
  if (branches.length) result.Branches = branches;
  result.Note_JP = entry.Note_JP ?? null;
  result.Note_EN = entry.Note_EN ?? null;
  return result;
}

// ---------- レコード1件分の変換 ----------

/**
 * @returns {object|null} 変更後のレコード（新規オブジェクト）。変更不要なら null。
 */
function processRecord(rec, relPath, meta) {
  const apDetail = Array.isArray(rec.AppearanceDetail) ? rec.AppearanceDetail : null;
  const tailsEntries = (apDetail || []).filter((e) => e && e.DesignElement === '#Element_TailsUnit');
  const hasTailsEntries = tailsEntries.length > 0;
  const hasLegacyJP = rec.TailsUnit_JP !== undefined;

  if (!hasTailsEntries && !hasLegacyJP) return null;

  if (hasTailsEntries !== hasLegacyJP) {
    throw new Error(`[${relPath} Num:${JSON.stringify(rec.Num)}] AppearanceDetail(#Element_TailsUnit)の有無(${hasTailsEntries})とTailsUnit_JPの有無(${hasLegacyJP})が一致しない`);
  }

  const override = MANUAL_TAILSUNIT_OVERRIDE[relPath]?.[rec.Num];
  const tailsUnitValue = override
    ? override()
    : tailsEntries.map((e) => transformEntryToTailsUnit(e, { file: relPath, num: rec.Num }));

  const filtered = apDetail ? apDetail.filter((e) => e.DesignElement !== '#Element_TailsUnit') : null;
  const newAppearanceDetail = (filtered && filtered.length > 0) ? filtered : null;

  meta.changed++;
  if (newAppearanceDetail === null) meta.nulledAppearanceDetail++;
  if (tailsUnitValue.length > 1) meta.multiEntry++;
  if (override) meta.overridesHit.push(rec.Num);

  const newRecord = {};
  let insertedTailsUnit = false;
  for (const [k, v] of Object.entries(rec)) {
    if (k === 'TailsUnit_JP' || k === 'TailsUnit_EN') {
      if (!insertedTailsUnit) {
        newRecord.TailsUnit = tailsUnitValue;
        insertedTailsUnit = true;
      }
      continue;
    }
    if (k === 'AppearanceDetail') {
      newRecord.AppearanceDetail = newAppearanceDetail;
      continue;
    }
    newRecord[k] = v;
  }
  if (!insertedTailsUnit) newRecord.TailsUnit = tailsUnitValue;

  return newRecord;
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

  const meta = { changed: 0, nulledAppearanceDetail: 0, multiEntry: 0, overridesHit: [] };
  const errors = [];
  const replacements = [];

  for (let i = 0; i < db.length; i++) {
    const rec = db[i];
    let newRecord;
    try {
      newRecord = processRecord(rec, relPath, meta);
    } catch (e) {
      errors.push({ num: rec.Num, message: e.message });
      continue;
    }
    if (!newRecord) continue;

    const minified = JSON.stringify(newRecord);
    const formatted = prettierFormat(minified);
    const shifted = shiftToRecordDepth(formatted);
    replacements.push({ index: i, range: ranges[i], newText: shifted, num: rec.Num });
  }

  return { relPath, text, total: db.length, meta, errors, replacements };
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
  'data/Works_NumberTales/DataBases/db_Primary.json',
  'data/Works_NumberTales/DataBases/db_Secondary.json',
  'data/Works_NumberTales/DataBases/db_SemiPrimary.json',
  'data/Works_NumberTales/DataBases/db_SelfSecondary.json',
];

let totalErrors = 0;
for (const t of targets) {
  const { relPath, text, total, meta, errors, replacements } = processFile(t);
  totalErrors += errors.length;

  console.log(`\n=== ${relPath} ===`);
  console.log(`総レコード数: ${total}件 / 変更対象: ${meta.changed}件 / AppearanceDetailがnull化: ${meta.nulledAppearanceDetail}件 / 複合形状(TailsUnit複数要素): ${meta.multiEntry}件 / 特例適用: ${meta.overridesHit.length}件 (${JSON.stringify(meta.overridesHit)})`);
  if (errors.length) {
    console.log(`失敗: ${errors.length}件`);
    for (const e of errors) console.log(`  [FAIL] Num:${JSON.stringify(e.num)} → ${e.message}`);
  }

  if (WRITE) {
    const newText = applyReplacements(text, replacements);
    writeFileSync(resolve(repoRoot, relPath), newText, 'utf-8');
    // 書き込み直後にJSONとして妥当か検証する
    JSON.parse(readFileSync(resolve(repoRoot, relPath), 'utf-8'));
    console.log(`  --write により保存しました（JSON構文検証OK）。`);
  }
}

console.log(`\n合計失敗件数: ${totalErrors}`);
if (!WRITE) {
  console.log('(dry-run: ファイルへは書き込んでいません。--write を付けて再実行すると反映されます)');
}
if (totalErrors > 0) process.exitCode = 1;
