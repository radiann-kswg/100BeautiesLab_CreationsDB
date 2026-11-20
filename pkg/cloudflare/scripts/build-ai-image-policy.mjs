/** 全作品の画像許諾を同期時に確定し、AI API の request 内で全DB走査しないための許可表。 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve, posix } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { applyCommons, isPublicRecord } from '../worker.js';
import { findSecondaryDef } from '../../../tools/patch-aihints.mjs';
import { canonicalAIImagePath, createImagePermissionIndex, filterAIImageReferences, filterCostumeOptouts, isImageOptedOut, validateImageOptouts } from '../../ai-image-policy.mjs';
import { AI_IMAGE_POLICY_KEY, imageReferenceKey } from '../ai-image-policy.js';
import { findJsonFiles, resolveIdxKey, resolveDbBasePath, CONVENTIONAL_FILES, getByPath, parseCommonArgs, WRANGLER_CMD, WRANGLER_BASE_ARGS, SPAWN_OPTS_BASE } from './migrate-common.mjs';

const markerPath = (repoRoot) => join(repoRoot, '.cache/migrate/ai-image-policy-sync.json');

/** localのprivate/scratch JSONは許可表にも同期指紋にも混ぜない。 */
const policyFiles = (repoRoot) => findJsonFiles(join(repoRoot, 'data')).filter((file) =>
  !relative(join(repoRoot, 'data'), file).split(/[\\/]/).some((segment) => segment.startsWith('.')));

/** JSON の内容を含む指紋。同じlocalのfull同期・AIHints同期が成功した場合だけ公開する。 */
export function aiPolicySourceHash(repoRoot) {
  const hash = createHash('sha256');
  for (const file of policyFiles(repoRoot).sort()) {
    hash.update(relative(repoRoot, file).replace(/\\/g, '/'));
    hash.update(readFileSync(file));
  }
  return hash.digest('hex');
}

/** 完了前のマーカーを消す。失敗した前回同期の許可表を後から有効化しない。 */
export function markAIImagePolicySync(repoRoot, phase, complete = false, { bucket = 'creationsdb-data', dbId = 'creationsdb-d1' } = {}) {
  const file = markerPath(repoRoot);
  const sourceHash = aiPolicySourceHash(repoRoot);
  let marker = { sourceHash, bucket, dbId, full: false, hints: false };
  let matched = false;
  if (existsSync(file)) {
    const previous = JSON.parse(readFileSync(file, 'utf8'));
    matched = previous.sourceHash === sourceHash && previous.bucket === bucket && previous.dbId === dbId;
    if (matched) marker = previous;
  }
  if (complete && !matched) throw new Error('同期中にソースまたは投入先が変わったため、AI画像許可表を有効化できません');
  if (phase === 'full' && !complete) marker.hints = false;
  marker[phase] = complete;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(marker));
}

/** 元データ全体から直接宣言された画像だけを allow に加え、共有画像の deny を合成する。 */
export function buildAIImagePolicy(repoRoot) {
  const dataDir = join(repoRoot, 'data');
  const files = new Map(policyFiles(repoRoot).map((file) => [relative(dataDir, file).replace(/\\/g, '/'), JSON.parse(readFileSync(file, 'utf8'))]));
  const globalMeta = files.get('db_meta.json');
  if (!globalMeta?.CreationWorks || !files.has('db_type.json')) throw new Error('AI画像ポリシー: グローバルメタ/typedefがありません');
  const byDir = new Map(Object.entries(globalMeta.CreationWorks).map(([key, info]) => [info.Works_Dir || key.slice(1), { key, info }]));
  const workFile = (dir, file) => files.get(`${dir}/DataBases/${file}`) ?? files.get(`${dir}/${file}`);
  const imageRoots = [...byDir].map(([dir, work]) => `${posix.normalize(`data/${work.info.Works_ImagesDir || `${dir}/Images`}`)}/`);
  /** 資料/翻訳の明示カタログも合流する。権利の拒否を下位のfalseで解除しない。 */
  function workMetaFor(dir) {
    const base = workFile(dir, 'db_meta.json');
    const databases = { ...base?.Databases };
    for (const layer of ['References', 'Localization']) {
      for (const [key, entry] of Object.entries(files.get(`${dir}/${layer}/db_meta.json`)?.Databases ?? {})) {
        const previous = databases[key];
        databases[key] = { DB_Layer: layer, ...previous, ...entry };
        for (const flag of ['AI_Optout', 'DB_Hidden']) {
          if (previous?.[flag] !== undefined && previous[flag] !== false) databases[key][flag] = previous[flag];
        }
      }
    }
    return { ...base, Databases: databases };
  }
  const fieldsOf = (type) => type?.$DefType?.filter((entry) => entry?.hashTag === 'Images').flatMap((entry) => Array.isArray(entry.$type) ? entry.$type : []) ?? [];
  const registeredFiles = new Map();
  for (const dir of byDir.keys()) {
    for (const [metaKey, dbEntry] of Object.entries(workMetaFor(dir).Databases)) {
      const db = metaKey.replace(/^#(?:DB|Ref|Loc)_/, '');
      const prefix = metaKey.startsWith('#Ref_') ? 'ref_' : metaKey.startsWith('#Loc_') ? 'trans_' : 'db_';
      const base = relative(dataDir, resolveDbBasePath(dataDir, dir, dbEntry.DB_Layer || 'DataBases')).replace(/\\/g, '/');
      const name = [dbEntry.DB_File, CONVENTIONAL_FILES[db], `${prefix}${db}.json`, `db_${db}.json`]
        .filter(Boolean).find((candidate) => Array.isArray(files.get(`${base}/${candidate}`)));
      if (name) registeredFiles.set(`${base}/${name}`, { db, dbEntry, metaKey });
    }
  }
  const contexts = new Map();
  const sources = [];
  const costumes = {};
  /** 辞書カタログのdictFileを正とし、サブフォルダへ分割した衣装辞書も読む。 */
  function costumeRowsFor(dir) {
    const dictionaryDir = `${dir}/Dictionaries/`;
    const definitions = Object.entries(files.get(`${dictionaryDir}db_meta.json`)?.Dictionaries ?? {})
      .filter(([key, entry]) => key === '#Dict_Costume' || entry?.keyField === 'Costume');
    if (!definitions.length) return files.get(`${dictionaryDir}dict_Costume.json`) ?? [];
    return definitions.flatMap(([key, entry]) => {
      const file = `${dictionaryDir}${entry.dictFile || `dict_${key.replace(/^#Dict_/, '')}.json`}`;
      if (posix.normalize(file) !== file || !Array.isArray(files.get(file))) throw new Error(`Costume辞書がありません: ${file}`);
      return files.get(file);
    });
  }
  for (const [file, rows] of files) {
    if (!Array.isArray(rows)) continue;
    const registered = registeredFiles.get(file);
    const db = registered?.db ?? file.match(/(?:^|\/)(?:db|ref|trans)_(.+)\.json$/)?.[1];
    if (!db) {
      if (rows.some((row) => row?.Images)) throw new Error(`画像DBのカタログ宣言がありません: ${file}`);
      continue;
    }
    const dir = file.split('/')[0];
    const work = byDir.get(dir);
    const workMeta = workMetaFor(dir);
    const workType = workFile(dir, 'db_type.json');
    const layerType = files.get(`${dirname(file).replace(/\\/g, '/')}/db_type.json`);
    const prefix = file.match(/(?:^|\/)(db|ref|trans)_/)?.[1];
    const metaKey = registered?.metaKey ?? `#${prefix === 'ref' ? 'Ref' : prefix === 'trans' ? 'Loc' : 'DB'}_${db}`;
    const source = {
      key: work?.key ?? '#' + dir, dir, db, work, metaKey, dbEntry: registered?.dbEntry ?? workMeta.Databases[metaKey], workMeta, rows,
      indexKey: resolveIdxKey(layerType?.[`$IndexDef_${db}`] ?? layerType?.$IndexDef ?? workType?.[`$IndexDef_${db}`] ?? workType?.$IndexDef),
      fields: [...fieldsOf(files.get('db_type.json')), ...fieldsOf(workType), ...fieldsOf(layerType)],
    };
    const costumeRows = costumeRowsFor(dir);
    if (!Array.isArray(costumeRows)) throw new Error(`Costume辞書が配列ではありません: ${dir}`);
    filterCostumeOptouts({}, costumeRows);
    costumes[source.key] = costumeRows.filter((row) => row.AI_Optout === true);
    sources.push(source);
    contexts.set(`${source.key}/${db}`, source);
  }
  const permission = createImagePermissionIndex();
  const candidates = [];
  const blockedValues = new Set();
  const records = {};

  /** 型とカタログに従って物理画像パスを作る。未知origin・親参照は共有関数で拒否する。 */
  function imagePath(raw, context, field) {
    const cross = raw?._DBCrossLinkPath;
    if (cross) {
      const work = cross._Work ? `#Works_${String(cross._Work).replace(/^#?Works_/, '')}` : context.key;
      const target = contexts.get(`${work}/${cross._DB}`);
      return target ? imagePath(cross._IsoPath, target, cross._Field || field) : null;
    }
    if (typeof raw !== 'string' || !raw) return null;
    const absolute = canonicalAIImagePath(raw.replace(/^\//, ''));
    if (absolute) return imageRoots.some((root) => absolute.startsWith(root)) ? absolute : null;
    if (/^(?:https?:|\/)/i.test(raw)) return null;
    const definition = context.fields.findLast((entry) => entry.hashTag === field);
    const folder = definition?.$subfolder || field.match(/^(.+?)_(?:PNG|JPG|JPEG|WEBP|SVG|GIF)(?:Name|Path)$/i)?.[1];
    if (!folder) return null;
    const rel = raw.toLowerCase().startsWith(`${folder.toLowerCase()}/`) ? raw.slice(folder.length + 1) : raw;
    const extension = /\.(?:png|jpe?g|webp|svg|gif)$/i.test(rel) ? '' : '.png';
    const prefix = context.metaKey.startsWith('#Ref_') || context.dbEntry?.DB_Layer === 'References' ? 'Ref_'
      : context.metaKey.startsWith('#Loc_') || context.dbEntry?.DB_Layer === 'Localization' ? 'Loc_' : 'DB_';
    // 既存JSONには別DBの画像へ戻る旧相対参照があるため、denyも物理パスへ揃える。
    const imageRoot = context.work?.info.Works_ImagesDir || `${context.dir}/Images`;
    const resolved = posix.normalize(`data/${imageRoot}/${prefix}${context.db}/${folder}/${rel}${extension}`);
    return imageRoots.some((root) => resolved.startsWith(root)) ? canonicalAIImagePath(resolved) : null;
  }

  for (const context of sources) {
    const { key, db, dbEntry, work, workMeta, indexKey, fields } = context;
    const entry = records[`${key}/${db}`] ??= { indexKey, allowed: [], denied: [] };
    const rows = applyCommons(context.rows, { ...workMeta, Databases: { ...workMeta.Databases, [`#DB_${db}`]: dbEntry } }, db);
    for (const record of rows) {
      validateImageOptouts(record, fields);
      const secondary = findSecondaryDef(record, dbEntry?._Secondaries ?? dbEntry?.Secondaries);
      const flags = [work?.info.Works_Hidden, dbEntry?.DB_Hidden, dbEntry?.AI_Optout, secondary?.AI_Optout, record.AI_Optout];
      const allowed = Boolean(work && dbEntry) && isPublicRecord(record) && flags.every((flag) => flag === undefined || flag === false);
      const index = getByPath(record, indexKey);
      if (index != null) entry[allowed ? 'allowed' : 'denied'].push(String(index));
      if (!allowed) filterAIImageReferences(record.AIHints, (ref) => { permission.add(ref, false); return false; });
      for (const [field, value] of Object.entries(record.Images ?? {})) {
        for (const raw of Array.isArray(value) ? value : [value]) {
          const path = imagePath(raw, context, field);
          const permitted = allowed && !isImageOptedOut(record, fields, field, raw);
          if (path) {
            // cross-link単独ではtarget側の許可を立証しない。拒否はどちらからでも効かせる。
            if (!raw?._DBCrossLinkPath || !permitted) permission.add(path, permitted && existsSync(join(repoRoot, path)));
            candidates.push({ path, key: imageReferenceKey(key, db, field, raw), raw });
          } else if (typeof raw === 'string') blockedValues.add(raw);
        }
      }
    }
  }
  for (const entry of Object.values(records)) {
    entry.allowed = [...new Set(entry.allowed)].filter((index) => !entry.denied.includes(index));
    delete entry.denied;
  }
  const references = [];
  for (const candidate of candidates) {
    if (permission.has(candidate.path)) references.push(candidate.key);
    else if (typeof candidate.raw === 'string') blockedValues.add(candidate.raw);
  }
  return { version: 1, complete: true, paths: permission.paths().sort(), references: [...new Set(references)], records, costumes, blockedValues: [...blockedValues] };
}

/** full同期とAIHints同期が同一ソースで完了したことを確認して公開用の表を返す。 */
export function finalizeAIImagePolicy(repoRoot, { bucket = 'creationsdb-data', dbId = 'creationsdb-d1' } = {}) {
  const marker = JSON.parse(readFileSync(markerPath(repoRoot), 'utf8'));
  if (marker.full !== true || marker.hints !== true || marker.sourceHash !== aiPolicySourceHash(repoRoot)
    || marker.bucket !== bucket || marker.dbId !== dbId) {
    throw new Error('AI画像許可表の公開には同一ソースでのfull同期とAIHints同期の完了が必要です');
  }
  const policy = buildAIImagePolicy(repoRoot);
  if (marker.sourceHash !== aiPolicySourceHash(repoRoot)) throw new Error('許可表の構築中にソースが変わりました');
  return policy;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { repoRoot, dryRun, getArg, dbId } = parseCommonArgs(process.argv.slice(2));
  const bucket = getArg('--bucket') ?? 'creationsdb-data';
  if (!/^[a-z0-9-]+$/.test(bucket)) throw new Error('Invalid R2 bucket name');
  const policy = dryRun ? buildAIImagePolicy(repoRoot) : finalizeAIImagePolicy(repoRoot, { bucket, dbId });
  const file = join(repoRoot, '.cache/migrate/ai-image-policy.json');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(policy));
  console.log(`[AI image policy] ${policy.paths.length} images / ${policy.references.length} references`);
  if (!dryRun) {
    execFileSync(WRANGLER_CMD, [...WRANGLER_BASE_ARGS, 'r2', 'object', 'put',
      `${bucket}/${AI_IMAGE_POLICY_KEY}`, '--file', relative(repoRoot, file).replace(/\\/g, '/'),
      '--content-type', 'application/json', '--remote'], { cwd: repoRoot, stdio: 'inherit', ...SPAWN_OPTS_BASE });
    // 公開済みマーカーを再利用して、後日の単独AIHints同期から古い表を有効化しない。
    markAIImagePolicySync(repoRoot, 'full');
  }
}
