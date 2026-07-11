/**
 * migrate-remove-nummark-identitymotif.mjs
 * NumberMarkLocation / IdentityMotif 廃止マイグレーションスクリプト
 *
 * 対象DB:
 *   - data/Works_NumberTales/DataBases/db_Primary.json
 *
 * 背景: 両フィールドは migrate-appearance-detail.mjs により AppearanceDetail へ
 *   並走追加済み（全該当レコードで移行済みを確認済み）。AppearanceDetail への
 *   一本化に伴い、旧フィールドを DB 要素から削除する。
 *
 * 実装方針: JSON.parse→JSON.stringify による再シリアライズはファイル全体の
 *   独自インデント記法（短い配列/オブジェクトのインライン化）を破壊するため、
 *   行ベースで対象フィールドのブロック（角括弧の深さを追跡して開始〜終了行を
 *   特定）だけを取り除く外科的な削除を行う。それ以外の行は一切変更しない。
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const dbPath = resolve(repoRoot, 'data/Works_NumberTales/DataBases/db_Primary.json');

const targetKeyPattern = /^(\s*)"(NumberMarkLocation|IdentityMotif)":\s*\[\s*$/;

const text = readFileSync(dbPath, 'utf-8');
const lines = text.split('\n');

const removeRanges = [];
for (let i = 0; i < lines.length; i++) {
  if (!targetKeyPattern.test(lines[i])) continue;
  const startIdx = i;
  let depth = 0;
  for (const ch of lines[i]) {
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
  }
  let endIdx = i;
  while (depth > 0) {
    endIdx++;
    for (const ch of lines[endIdx]) {
      if (ch === '[') depth++;
      else if (ch === ']') depth--;
    }
  }
  removeRanges.push([startIdx, endIdx]);
  i = endIdx;
}

console.log(`blocks found: ${removeRanges.length}`);

const removeSet = new Set();
for (const [s, e] of removeRanges) {
  for (let k = s; k <= e; k++) removeSet.add(k);
}
const outLines = lines.filter((_, idx) => !removeSet.has(idx));

writeFileSync(dbPath, outLines.join('\n'), 'utf-8');
console.log(`[NT db_Primary] ${removeRanges.length} blocks removed, ${lines.length} -> ${outLines.length} lines`);
