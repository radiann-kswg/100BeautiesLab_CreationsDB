/**
 * migrate-eartype-to-earshapetype.mjs
 *
 * `AppearanceDetail[].DesignElement:"#Element_Ear"` の `Attrs[]` 内 `#DesignAttr_Ear` エントリが
 * 参照する enum キーを `vdict_EarType`（値: `#EarType_Fox`/`#EarType_Cat`）から
 * `vdict_EarShapeType`（値: `#EarShapeType_Fox`/`#EarShapeType_Cat`）へ改名する。
 *
 * 背景: `$EnumDef_EarType`（旧グローバル宣言）は `$EnumDef_EarShapeType` として
 * NumberTales work-local `db_meta.json` へ移設・改名済み（`TailShapeType` との命名統一）。
 * 本スクリプトは、その改名に対応する既存データ側の追従。単純な1:1キー・値置換であり、
 * 情報量の変化（自由記述→構造化 のような）は無いため、旧キーの並走維持は行わない
 * （「既存フィールドは削除せず並走追加」の通常方針に対する明示的な例外）。
 *
 * 対象: data/Works_NumberTales/DataBases/db_Primary.json のみ
 *   （#Element_Ear は他3ファイル（Secondary/SemiPrimary/SelfSecondary）に存在しないため対象外）。
 *
 * 書き込み方式（migrate-appearancedetail-to-tailsunit.mjs と同一の安全な手法）:
 *   ファイル全体を JSON.parse → JSON.stringify で書き直すと対象外レコードまで
 *   改行展開されて壊れるため、変更が必要なレコードのみを
 *   1) 新オブジェクトとして再構築 → 2) JSON.stringify（コンパクト） →
 *   3) `npx prettier --stdin-filepath tmp.json` で標準入力整形 →
 *   4) 先頭行以外を2スペース加算（配列要素の深さへ補正） →
 *   5) 元の生テキストの、そのレコード範囲だけを文字列レベルで置換
 *   という手順で、対象外レコードのバイト列を一切変更しない。
 *
 * 使い方:
 *   node scripts/migrate-eartype-to-earshapetype.mjs            # dry-run
 *   node scripts/migrate-eartype-to-earshapetype.mjs --write    # 実書き込み
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

// ---------- vdict_EarType -> vdict_EarShapeType 値マッピング ----------

const VALUE_MAP = new Map([
  ['#EarType_Fox', '#EarShapeType_Fox'],
  ['#EarType_Cat', '#EarShapeType_Cat'],
]);

/**
 * 1レコード分の AppearanceDetail[] を走査し、#Element_Ear エントリの Attrs[] にある
 * #DesignAttr_Ear の vdict_EarType キー/値を vdict_EarShapeType へ改名する。
 * @returns {{ appearanceDetail: object[], changed: boolean }}
 */
function migrateRecordAppearanceDetail(appearanceDetail, num) {
  let changed = false;
  const result = appearanceDetail.map((entry) => {
    if (!entry || entry.DesignElement !== '#Element_Ear' || !Array.isArray(entry.Attrs)) {
      return entry;
    }
    const newAttrs = entry.Attrs.map((attr) => {
      if (!attr || attr.AttrLabel !== '#DesignAttr_Ear' || !('vdict_EarType' in attr)) {
        return attr;
      }
      const oldValue = attr.vdict_EarType;
      const newValue = VALUE_MAP.get(oldValue);
      if (!newValue) {
        throw new Error(`[Num:${num}] 未知の vdict_EarType 値: ${JSON.stringify(oldValue)}（マッピング表に無い）`);
      }
      changed = true;
      const newAttr = {};
      for (const [k, v] of Object.entries(attr)) {
        if (k === 'vdict_EarType') {
          newAttr.vdict_EarShapeType = newValue;
        } else {
          newAttr[k] = v;
        }
      }
      return newAttr;
    });
    return { ...entry, Attrs: newAttrs };
  });
  return { appearanceDetail: result, changed };
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

  const replacements = [];
  let changedCount = 0;
  let attrCount = 0;

  for (let i = 0; i < db.length; i++) {
    const rec = db[i];
    if (!Array.isArray(rec.AppearanceDetail)) continue;
    if (!rec.AppearanceDetail.some((e) => e?.DesignElement === '#Element_Ear')) continue;

    const { appearanceDetail, changed } = migrateRecordAppearanceDetail(rec.AppearanceDetail, rec.Num);
    if (!changed) continue;

    changedCount++;
    attrCount += appearanceDetail
      .filter((e) => e?.DesignElement === '#Element_Ear')
      .reduce((sum, e) => sum + (Array.isArray(e.Attrs) ? e.Attrs.filter((a) => a?.vdict_EarShapeType).length : 0), 0);

    const newRecord = { ...rec, AppearanceDetail: appearanceDetail };
    const minified = JSON.stringify(newRecord);
    const formatted = prettierFormat(minified);
    const shifted = shiftToRecordDepth(formatted);
    replacements.push({ range: ranges[i], newText: shifted });
  }

  return { relPath, text, total: db.length, changedCount, attrCount, replacements };
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

for (const t of targets) {
  const { relPath, text, total, changedCount, attrCount, replacements } = processFile(t);

  console.log(`\n=== ${relPath} ===`);
  console.log(`総レコード数: ${total}件 / 改名対象レコード: ${changedCount}件 / 改名した Attrs 行: ${attrCount}件`);

  if (WRITE) {
    const newText = applyReplacements(text, replacements);
    writeFileSync(resolve(repoRoot, relPath), newText, 'utf-8');
    JSON.parse(readFileSync(resolve(repoRoot, relPath), 'utf-8'));
    console.log('  --write により保存しました（JSON構文検証OK）。');
  }
}

if (!WRITE) {
  console.log('\n(dry-run: ファイルへは書き込んでいません。--write を付けて再実行すると反映されます)');
}
