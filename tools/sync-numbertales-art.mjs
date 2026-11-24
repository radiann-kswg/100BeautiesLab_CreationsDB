/** NumberTales の明示的な画像名と登録先から、addon 専用の登場形態を再生成する。 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { applyCommons } from '../pkg/cloudflare/worker.js';
import { imageReferenceKey } from '../pkg/cloudflare/ai-image-policy.js';
import { buildAIImagePolicy } from '../pkg/cloudflare/scripts/build-ai-image-policy.mjs';
import { openRecordsFile, writeRecordsFile } from './extract-palette.mjs';
import { scanRecordMembers } from './normalize-field-order.mjs';
import { loadAiUnreadyProgressValues } from './patch-aihints.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const work = '#Works_NumberTales';
const field = 'arts_PNGPath';
const key = 'Images_Appearance';

/**
 * 本人のバッジが完全一致する画像だけを採用する。連名末尾の形態は共有できるが、
 * 各人が形態を持つ名前は人物別に読む。作品・形態を特定できない名前は推測しない。
 */
export function artAppearance(raw, badge, forms) {
  const cross = raw?._DBCrossLinkPath;
  if (cross?._Work && cross._Work !== 'NumberTales') return null;
  const relative = cross ? cross._IsoPath : raw;
  if (typeof relative !== 'string') return null;
  const parts = path.posix.parse(relative);
  const name = parts.base.replace(/\.(png|jpe?g|webp)$/i, '');
  const start = name.indexOf('NTS-');
  if (start < 0) return null;
  const credits = name.slice(start).split(',').map(part => /^NTS-([A-Za-z0-9]+)(?:-(.*))?$/.exec(part));
  if (credits.some(credit => !credit)) return null;
  const own = credits.find(credit => credit[1] === String(badge));
  if (!own) return null;
  const commonSuffix = credits.slice(0, -1).every(credit => !credit[2]) ? credits.at(-1)[2] : null;
  const suffix = own[2] ?? commonSuffix ?? '';
  const named = /^(corefolder|humanoid)(?:$|[A-Z0-9_-])/.exec(suffix)?.[1];
  return { value: raw, ...(forms.has(named) ? { Formation: named } : {}) };
}

/** 同じ実パス・原画・本人を確認済みの記録だけを利用する。1枚に複数形態が現れる場合もある。 */
export function reviewedEntries(review, badge, raw, digest, forms) {
  if (!review || review.sha256 !== digest) return null;
  const matches = Object.entries(review.formations).filter(([, badges]) => badges.includes(String(badge)));
  for (const [code] of matches) if (!forms.has(code)) throw new Error(`未定義の形態: ${code}`);
  return matches.length ? matches.map(([Formation]) => ({ value: raw, Formation })) : null;
}

/**
 * 作者の手入力行か。衣装・参考用区分を持つ行と、共通（Formation: null）を明示した行は
 * 生成器が作らないので、再同期で置き換えずに残す。
 */
const isManualRow = row => Object.hasOwn(row, 'Costume') || Object.hasOwn(row, 'ReferenceOnly') || row.Formation === null;
const sameForm = (a, b) => Object.hasOwn(a, 'Formation') === Object.hasOwn(b, 'Formation') && a.Formation === b.Formation;

/**
 * 生成した arts 行と、既存の対応表を合わせる。生成対象は arts_PNGPath だけで、
 * ほかの画像フィールドの行（参考用区分など作者の手入力）はそのまま残す。
 * arts の手入力行は、利用中の画像（permitted。省略時は生成行の value）に限りすべて残し、
 * 同じ value・Formation の手入力行がある生成行はその手入力行で置き換える。
 */
export function nextAppearance(current, entries, permitted = entries.map(entry => entry.value)) {
  const { [field]: oldRows = [], ...rest } = current ?? {};
  const manual = oldRows.filter(row => isManualRow(row) && permitted.some(value => isDeepStrictEqual(value, row.value)));
  const used = new Set();
  const merged = entries.flatMap(entry => {
    const matches = manual.filter(row => isDeepStrictEqual(row.value, entry.value) && sameForm(row, entry));
    matches.forEach(row => used.add(row));
    return matches.length ? matches : [entry];
  });
  merged.push(...manual.filter(row => !used.has(row)));
  if (merged.length) return { [field]: merged, ...rest };
  return Object.keys(rest).length ? rest : undefined;
}

/** 既存メンバーの書式を保持し、権利・参照が消えたら生成項目も取り除く。 */
export function updateArtRecord(text, row, entries, permitted) {
  return writeAppearance(text, row, nextAppearance(row[key], entries, permitted));
}

/** 対応表のメンバーを next に置き換える。next が無ければメンバーごと取り除く。 */
export function writeAppearance(text, row, next) {
  if (isDeepStrictEqual(row[key], next)) return text;
  const members = scanRecordMembers(text, 0, text.length);
  const i = members.findIndex(member => member.key === key);
  const old = members[i];
  if (!next) {
    if (i > 0) return text.slice(0, members[i - 1].end) + text.slice(old.end);
    return text.slice(0, old.start) + text.slice(members[1]?.start ?? old.end);
  }
  const images = members.find(member => member.key === 'Images');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const indent = text.slice(text.lastIndexOf('\n', images.start) + 1, images.start).match(/^\s*/)[0];
  const member = '"' + key + '": ' + JSON.stringify(next, null, 2).replaceAll('\n', eol + indent);
  return old ? text.slice(0, old.start) + member + text.slice(old.end)
    : text.slice(0, images.end) + ',' + eol + indent + member + text.slice(images.end);
}

/** システムの許可表と同じ実パス判定を共有し、全 DB の差分を検証してから書き込む。 */
function main() {
  const { values } = parseArgs({ options: { write: { type: 'boolean' }, check: { type: 'boolean' } } });
  if (values.write && values.check) throw new Error('--write と --check は併用できません');
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const workDir = path.join(root, 'data/Works_NumberTales');
  const dbDir = path.join(workDir, 'DataBases');
  const meta = read(path.join(dbDir, 'db_meta.json'));
  const top = read(path.join(root, 'data/db_meta.json')).CreationWorks[work];
  const dictionary = read(path.join(workDir, 'Dictionaries/db_meta.json')).Dictionaries['#Dict_Formation'];
  const forms = new Set(read(path.join(workDir, 'Dictionaries', dictionary.dictFile ?? 'dict_Formation.json')).map(row => row.Formation));
  const references = new Map();
  const policy = buildAIImagePolicy(root, { permittedReferencePaths: references });
  const reviewed = read(path.join(root, 'tools/numbertales-reviewed-arts.json'));
  const digests = new Map();
  const unready = loadAiUnreadyProgressValues('NumberTales');
  const changes = [];
  // カタログから外れた DB にも過去の生成値が残り得るため、既存ファイルを列挙する。
  for (const filename of fs.readdirSync(dbDir).filter(file => /^db_[A-Z]\w*\.json$/.test(file))) {
    const db = filename.slice(3, -5);
    const file = path.join(dbDir, filename);
    const { original, records, spans } = openRecordsFile(file);
    const effective = applyCommons(structuredClone(records), meta, db);
    const allowed = new Set(policy.records[`${work}/${db}`]?.allowed);
    let output = original;
    let count = 0;
    for (let i = records.length - 1; i >= 0; i--) {
      const row = records[i];
      const entries = [];
      // 許可済みで実在する画像。手入力行はこの範囲でだけ残す（権利・参照が消えたら一緒に消える）。
      const permitted = [];
      if (top.AI_Optout !== true && meta.Databases['#DB_' + db] && allowed.has(String(row.Num)) && !unready.has(effective[i].Progress)) {
        for (const raw of [row.Images?.[field]].flat()) {
          const image = references.get(imageReferenceKey(work, db, field, raw));
          if (!image) continue;
          permitted.push(raw);
          const badge = row.Num_Badge ?? row.Num;
          const review = reviewed[image];
          if (review && !digests.has(image)) {
            const digest = createHash('sha256').update(fs.readFileSync(path.join(root, image))).digest('hex');
            digests.set(image, digest);
            if (digest !== review.sha256) console.warn(`原画の再確認が必要: ${image}`);
          }
          const confirmed = reviewedEntries(review, badge, raw, digests.get(image), forms);
          if (confirmed) entries.push(...confirmed);
          else {
            const entry = artAppearance(raw, badge, forms);
            if (entry) entries.push(entry);
          }
        }
      }
      const [start, end] = spans[i];
      const old = original.slice(start, end);
      const next = nextAppearance(row[key], entries, permitted);
      const updated = writeAppearance(old, row, next);
      if (updated === old) continue;
      if (next) row[key] = next; else delete row[key];
      output = output.slice(0, start) + updated + output.slice(end);
      count++;
    }
    if (!count) continue;
    if (!isDeepStrictEqual(JSON.parse(output), records)) throw new Error(`生成項目以外に差分があります: ${file}`);
    changes.push({ file, output });
    console.log(`${filename}: ${count} レコード`);
  }
  if (values.write) for (const { file, output } of changes) writeRecordsFile(file, output);
  if (values.check && changes.length) process.exitCode = 1;
  console.log(`更新対象 ${changes.length} ファイル`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
