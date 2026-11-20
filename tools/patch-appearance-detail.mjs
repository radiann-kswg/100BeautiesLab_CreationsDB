/**
 * AppearanceDetail の監修済み候補を検証し、変更した要素だけ反映する CLI。
 * 原画の観察または作者の手動入力を使い、創作設定を自動生成しない。
 * @author 100BeautiesLab.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseArgs } from 'node:util';
import { openRecordsFile, findValueEnd, scanArrayElements } from './extract-palette.mjs';
import { validateImageOptouts, isImageOptedOut } from '../pkg/ai-image-policy.mjs';
import { applyCommons } from '../pkg/cloudflare/worker.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const token = value => typeof value === 'string' && /^[A-Za-z0-9_]+$/.test(value);

/** match は複合インデックスを含む部分一致。配列とプリミティブは完全一致にする。 */
function matches(value, match) {
    return object(match) ? object(value) && Object.entries(match).every(([key, item]) =>
        Object.hasOwn(value, key) && matches(value[key], item)) : isDeepStrictEqual(value, match);
}

/** トップレベルの値を飛ばし、文字列内・入れ子の同名キーを拾わない。 */
function fieldRange(text, key) {
    let cursor = text.indexOf('{') + 1;
    for (const name of Object.keys(JSON.parse(text))) {
        const keyStart = text.indexOf(JSON.stringify(name), cursor);
        if (keyStart < cursor) throw new Error('JSON キーの位置を特定できません');
        const colon = text.indexOf(':', keyStart + JSON.stringify(name).length);
        const end = findValueEnd(text, colon);
        let start = colon + 1;
        while (/\s/.test(text[start])) start++;
        if (name === key) return { keyStart, start, end };
        cursor = end;
    }
    return null;
}

/** 既存要素の書式を残すため、変更要素の置換と末尾追加だけを行う。 */
export function patchAppearanceText(text, span, before, after, fieldOrder = []) {
    const record = text.slice(...span);
    const range = fieldRange(record, 'AppearanceDetail');
    const newline = text.includes('\r\n') ? '\r\n' : '\n';
    const indent = record.match(/\n([ \t]+)"/)?.[1] ?? '    ';
    const format = (value, prefix) => JSON.stringify(value, null, 2).replace(/\n/g, newline + prefix);
    let updated;
    if (!range) {
        const rank = fieldOrder.indexOf('AppearanceDetail');
        const next = Object.keys(JSON.parse(record)).find(key => rank >= 0 && fieldOrder.indexOf(key) > rank);
        if (next) {
            const at = fieldRange(record, next).keyStart;
            updated = record.slice(0, at) + `"AppearanceDetail": ${format(after, indent)},${newline}${indent}` + record.slice(at);
        } else {
            const at = record.lastIndexOf('}');
            const head = record.slice(0, at).trimEnd();
            updated = head + (Object.keys(JSON.parse(record)).length ? ',' : '') +
                `${newline}${indent}"AppearanceDetail": ${format(after, indent)}${newline}` + record.slice(at);
        }
    } else if (before === null) {
        updated = record.slice(0, range.start) + format(after, indent) + record.slice(range.end);
    } else {
        const elements = scanArrayElements(record, range.start);
        updated = record;
        if (after.length > before.length) {
            const at = elements.length ? elements.at(-1)[1] : range.start + 1;
            const added = after.slice(before.length).map(entry => format(entry, indent + '  '));
            const insertion = (elements.length ? ',' : '') + newline + indent + '  ' + added.join(',' + newline + indent + '  ');
            updated = updated.slice(0, at) + insertion + updated.slice(at);
        }
        for (let i = before.length - 1; i >= 0; i--) {
            if (isDeepStrictEqual(before[i], after[i])) continue;
            const [start, end] = elements[i];
            updated = updated.slice(0, start) + format(after[i], indent + '  ') + updated.slice(end);
        }
    }
    const result = text.slice(0, span[0]) + updated + text.slice(span[1]);
    JSON.parse(result);
    return result;
}

/** schema/meta 両方の変数定義を合流し、作品辞書も入力検証へ使う。 */
function loadSchema(repoRoot, work) {
    const workDir = path.join(repoRoot, 'data', `Works_${work}`);
    const globalMeta = read(path.join(repoRoot, 'data/db_meta.json'));
    const globalType = read(path.join(repoRoot, 'data/db_type.json'));
    const meta = read(path.join(workDir, 'DataBases/db_meta.json'));
    const type = read(path.join(workDir, 'DataBases/db_type.json'));
    const vars = {};
    for (const source of [globalMeta.General?.$VarsDef, globalType.$VarsDef, meta.General?.$VarsDef, type.$VarsDef]) {
        for (const [key, value] of Object.entries(source ?? {})) vars[key] = { ...vars[key], ...value };
    }
    const dictionaries = new Map();
    const dictionary = field => {
        if (dictionaries.has(field)) return dictionaries.get(field);
        const values = new Set();
        const dir = path.join(workDir, 'Dictionaries');
        const catalogPath = path.join(dir, 'db_meta.json');
        if (fs.existsSync(catalogPath)) {
            for (const [key, entry] of Object.entries(read(catalogPath).Dictionaries ?? {})) {
                if (entry.keyField !== field) continue;
                const file = path.resolve(dir, entry.dictFile ?? `dict_${key.replace(/^#Dict_/, '')}.json`);
                if (!file.startsWith(dir + path.sep)) throw new Error('辞書のパスが不正です');
                for (const row of read(file)) if (row[field] !== undefined) values.add(row[field]);
            }
        }
        for (const row of Object.values(vars[`#List_${field}`] ?? {})) if (row?.[field] !== undefined) values.add(row[field]);
        dictionaries.set(field, values);
        return values;
    };
    const enumRow = (field, value) => Object.values(vars).map(def => def?.[value]).find(row => object(row) && Object.hasOwn(row, field));
    // 同名宣言も残し、作品側の false でグローバルの true を解除させない。
    const imageFields = [globalType, type].flatMap(source => source.$DefType.find(field => field.hashTag === 'Images')?.$type ?? []);
    return { workDir, globalMeta, globalType, meta, type, vars, dictionary, enumRow, imageFields };
}

/** AppearanceDetail の宣言済みフィールド・型・辞書・属性の組合せを検証する。 */
export function validateAppearance(entries, schema) {
    if (!Array.isArray(entries)) throw new Error('after は AppearanceDetail 配列にしてください');
    const fields = schema.vars.$Def_AppearanceDetail?.$DefType;
    if (!Array.isArray(fields)) throw new Error('$Def_AppearanceDetail がありません');
    const byKey = new Map(fields.map(field => [field.hashTag, field]));
    const check = (value, field) => {
        const types = String(field.$type).split('|');
        if (value === null && types.includes('#Null')) return;
        const base = types.find(type => type !== '#Null');
        if (base.endsWith('[]')) {
            if (!Array.isArray(value)) throw new Error(`${field.hashTag} は配列です`);
            value.forEach(item => check(item, { ...field, $type: base.slice(0, -2) }));
        } else if (base === '$Def_AppearanceAttr') {
            if (!object(value) || !schema.enumRow('AttrLabel', value.AttrLabel)) throw new Error('未知の AttrLabel です');
            const allowed = schema.enumRow('AttrLabel', value.AttrLabel).$fields ?? [];
            for (const [key, item] of Object.entries(value)) {
                if (key === 'AttrLabel') continue;
                if (!allowed.includes(key)) throw new Error(`${value.AttrLabel} に ${key} は宣言されていません`);
                if (item === null) continue;
                const valid = key.startsWith('vdict_') ? !!schema.enumRow(key.slice(6), item)
                    : /^value_Num(?:_\d+)?$/.test(key) ? typeof item === 'number' && Number.isFinite(item)
                        : key === 'value_Color' ? typeof item === 'string' && /^#[0-9a-f]{6}$/i.test(item)
                            : /_(JP|EN)$/.test(key) && typeof item === 'string';
                if (!valid) throw new Error(`${key} の型または参照値が不正です`);
            }
        } else if (base === '#ListIndex') {
            if (!schema.enumRow(field.hashTag, value)) throw new Error(`未知の ${field.hashTag}: ${value}`);
        } else if (base === '#DictIndex') {
            if (!schema.dictionary(field.$dict ?? field.hashTag).has(value)) throw new Error(`未知の ${field.hashTag}: ${value}`);
        } else if (base === '#Boolean') {
            if (typeof value !== 'boolean') throw new Error(`${field.hashTag} は boolean です`);
        } else if (base === '#PNGFileName') {
            if (typeof value !== 'string' || !value || /[\\/]/.test(value) || /\.png$/i.test(value)) throw new Error('img_PNGName は拡張子なしのファイル名です');
        } else if (/^##?String(?:_EN|_JP)?$/.test(base)) {
            if (typeof value !== 'string') throw new Error(`${field.hashTag} は文字列です`);
        } else throw new Error(`未対応の型: ${field.hashTag} ${base}`);
    };
    entries.forEach(entry => {
        if (!object(entry)) throw new Error('AppearanceDetail の各要素は object です');
        for (const [key, value] of Object.entries(entry)) {
            if (!byKey.has(key)) throw new Error(`未知の AppearanceDetail フィールド: ${key}`);
            check(value, byKey.get(key));
        }
    });
}

/** 原 Images と一致した旧相対参照も、作品別 Images 領域内で正規化する。 */
function imagePath(workDir, db, field, value) {
    if (typeof value !== 'string' || !value || path.isAbsolute(value) || value.includes('\\')) throw new Error('画像パスが不正です');
    const folder = /^(.+)_PNG(?:Name|Path)$/.exec(field)?.[1];
    if (!folder) throw new Error(`画像フィールドが不正です: ${field}`);
    const root = path.resolve(workDir, 'Images', `DB_${db}`);
    const file = path.resolve(root, folder, /\.png$/i.test(value) ? value : `${value}.png`);
    const dataDir = path.dirname(workDir);
    const withinImages = (base, target) => /^Works_[A-Za-z0-9_]+\/Images\/(?:DB|Ref)_[A-Za-z0-9_]+\/.+\.png$/i.test(path.relative(base, target).split(path.sep).join('/'));
    if (!withinImages(dataDir, file)) throw new Error('画像が作品の画像領域外です');
    if (!fs.existsSync(file)) return file;
    const real = fs.realpathSync(file);
    if (!withinImages(fs.realpathSync(dataDir), real)) throw new Error('画像の実体が作品の画像領域外です');
    return real;
}

/** 同じ画像へ向く文字列・旧相対参照・DBCrossLinkPath を同じ実体へ解決する。 */
function resolveImageReference(repoRoot, schema, db, field, raw, schemaFor) {
    const link = object(raw) ? raw._DBCrossLinkPath : null;
    let target = schema, targetDb = db, targetField = field, value = raw, targetDenied = false;
    if (object(link)) {
        const work = link._Work == null ? path.basename(schema.workDir).slice(6) : String(link._Work).replace(/^#?Works_/, '');
        if (!token(work) || !token(link._DB) || (link._Field != null && typeof link._Field !== 'string')) throw new Error('画像の横断参照が不正です');
        target = schemaFor(work);
        targetDb = link._DB;
        targetField = link._Field || field;
        value = link._IsoPath;
        targetDenied = isImageOptedOut({}, target.imageFields, targetField, value);
    } else if (typeof raw !== 'string') return null;
    const file = imagePath(target.workDir, targetDb, targetField, value);
    const relative = path.relative(path.join(repoRoot, 'data'), file).split(path.sep);
    const actualWork = relative[0].slice(6);
    target = schemaFor(actualWork);
    targetDb = relative[2].replace(/^(?:DB|Ref)_/, '');
    targetField = target.imageFields.find(def => def.hashTag?.replace(/_PNG(?:Name|Path)$/, '') === relative[3])?.hashTag ?? targetField;
    return { file, denied: targetDenied || deniedByParent(target, targetDb, applyCommons([{}], target.meta, targetDb)[0]) || isImageOptedOut({}, target.imageFields, targetField, value) };
}

/** 上位の不許可を画像単位の許可で解除しない。未確定の指定も不許可とする。 */
function deniedByParent(schema, db, record) {
    const work = schema.globalMeta.CreationWorks?.[`#Works_${path.basename(schema.workDir).slice(6)}`];
    const entry = schema.meta.Databases?.[`#DB_${db}`];
    if (!work || !entry) return true;
    const denied = value => value !== undefined && value !== false;
    if (denied(work.Works_Hidden) || denied(work.AI_Optout) || denied(entry.DB_Hidden) || denied(entry.AI_Optout) || denied(record.isPrivate) || denied(record.AI_Optout)) return true;
    const effective = { ...entry._Commons, ...record };
    const categories = entry._Secondaries ?? [];
    const selected = categories.filter(category => {
        const constraints = Object.entries(category).filter(([key, value]) => key.startsWith('sec_') && value != null);
        return constraints.length && constraints.every(([key, value]) => isDeepStrictEqual(effective[key], value));
    });
    return (selected.length ? selected : categories.filter(category => Object.entries(category).every(([key, value]) => !key.startsWith('sec_') || value == null)))
        .some(category => denied(category.AI_Optout));
}

/** 連名画像は、どの参照レコードからの不許可でも拒否する。 */
function collectDeniedImages(repoRoot) {
    const denied = new Set();
    const schemas = new Map();
    const schemaFor = work => {
        if (!schemas.has(work)) schemas.set(work, loadSchema(repoRoot, work));
        return schemas.get(work);
    };
    for (const dir of fs.readdirSync(path.join(repoRoot, 'data')).filter(name => /^Works_/.test(name))) {
        const workDir = path.join(repoRoot, 'data', dir);
        if (!fs.existsSync(path.join(workDir, 'DataBases/db_type.json'))) continue;
        const schema = schemaFor(dir.slice(6));
        const fields = schema.imageFields;
        for (const key of Object.keys(schema.meta.Databases ?? {}).filter(key => /^#DB_[A-Za-z0-9_]+$/.test(key))) {
            const db = key.slice(4);
            const file = path.join(workDir, 'DataBases', `db_${db}.json`);
            if (!fs.existsSync(file)) continue;
            const records = read(file);
            if (!Array.isArray(records)) throw new Error(`カタログ掲載 DB が配列ではありません: ${file}`);
            for (const record of applyCommons(records, schema.meta, db)) {
                validateImageOptouts(record, fields);
                for (const [field, raw] of Object.entries(record.Images ?? {})) for (const value of Array.isArray(raw) ? raw : [raw]) {
                    if (value == null || value === '') continue;
                    const resolved = resolveImageReference(repoRoot, schema, db, field, value, schemaFor);
                    if (resolved && (resolved.denied || deniedByParent(schema, db, record) || isImageOptedOut(record, fields, field, value))) denied.add(resolved.file);
                }
            }
        }
    }
    return denied;
}

/** 現在の外見を候補へ複写する。根拠は監修者が記入し、既存の候補は上書きしない。 */
export function prepareAppearancePatch({ work, db, match, out, repoRoot = REPO_ROOT }) {
    if (!token(work) || !token(db) || !object(match) || !Object.keys(match).length || typeof out !== 'string' || !out.trim()) throw new Error('work / db / match / out が必要です');
    const { records } = openRecordsFile(path.join(repoRoot, 'data', `Works_${work}`, 'DataBases', `db_${db}.json`));
    const hits = records.filter(record => matches(record, match));
    if (hits.length !== 1) throw new Error(`match が一意ではありません (${hits.length} 件)`);
    const before = hits[0].AppearanceDetail ?? null;
    const patches = [{ db, match, before, after: structuredClone(before ?? []), sources: [{ kind: 'manual', note: '' }] }];
    const file = path.resolve(repoRoot, out);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(patches, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    return { prepared: file };
}

/** 候補をすべて検証し終えてから、同じドライブの一時ファイルを rename する。 */
export function patchAppearanceDetails({ work, patches, apply = false, repoRoot = REPO_ROOT }) {
    if (!token(work) || !Array.isArray(patches) || !patches.length) throw new Error('work と空でない候補配列が必要です');
    const schema = loadSchema(repoRoot, work);
    const fields = schema.imageFields;
    const databases = new Map(), results = [];
    let deniedImages;
    for (const patch of patches) {
        if (!object(patch) || !token(patch.db) || !object(patch.match) || !Object.keys(patch.match).length || !Object.hasOwn(patch, 'before')) throw new Error('db / match / before が不正です');
        if (!databases.has(patch.db)) databases.set(patch.db, { ...openRecordsFile(path.join(schema.workDir, 'DataBases', `db_${patch.db}.json`)), edits: new Map() });
        const database = databases.get(patch.db);
        const hits = database.records.map((record, index) => matches(record, patch.match) ? index : -1).filter(index => index >= 0);
        if (hits.length !== 1) throw new Error(`${patch.db}: match が一意ではありません (${hits.length} 件)`);
        const index = hits[0], record = database.records[index], before = record.AppearanceDetail ?? null;
        if (database.edits.has(index)) throw new Error('同じレコードへの候補が重複しています');
        if (!isDeepStrictEqual(before, patch.before)) throw new Error('before が現在の AppearanceDetail と一致しません');
        validateAppearance(patch.after, schema);
        if (patch.after.length < (before?.length ?? 0)) throw new Error('このツールは要素の削除に対応していません');
        if (before?.some((entry, i) => !isDeepStrictEqual(entry, patch.after[i]) && patch.after.some((item, j) => j !== i && isDeepStrictEqual(entry, item)))) throw new Error('要素の並替には対応していません');
        if (!Array.isArray(patch.sources) || !patch.sources.length) throw new Error('sources に観察または手動入力の根拠が必要です');
        for (const source of patch.sources) {
            if (!object(source) || typeof source.note !== 'string' || !source.note.trim()) throw new Error('source.note に根拠を書いてください');
            if (source.kind === 'manual') {
                if ('field' in source || 'value' in source) throw new Error('manual と画像参照は同じ source に混在させないでください');
                continue;
            }
            if (typeof source.permissionNote !== 'string' || !source.permissionNote.trim()) throw new Error('source.permissionNote に作者の許諾根拠を書いてください');
            const effective = applyCommons([record], schema.meta, patch.db)[0];
            validateImageOptouts(effective, fields);
            const images = effective.Images?.[source.field];
            if (!(Array.isArray(images) ? images : [images]).some(raw => isDeepStrictEqual(raw, source.value))) throw new Error('根拠画像がレコードの Images にありません');
            const resolved = resolveImageReference(repoRoot, schema, patch.db, source.field, source.value, work => loadSchema(repoRoot, work));
            if (!resolved) throw new Error('根拠画像の参照を解決できません');
            const { file } = resolved;
            deniedImages ??= collectDeniedImages(repoRoot);
            if (resolved.denied || deniedByParent(schema, patch.db, effective) || isImageOptedOut(effective, fields, source.field, source.value) || deniedImages.has(file)) throw new Error('根拠画像は AI オプトアウトされています');
            if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error('根拠画像ファイルがありません');
        }
        database.edits.set(index, patch);
        const changes = patch.after.flatMap((entry, i) => isDeepStrictEqual(before?.[i], entry) ? [] : [{ index: i, before: before?.[i] ?? null, after: entry }]);
        results.push({ db: patch.db, match: patch.match, changes, sources: patch.sources });
    }
    for (const database of databases.values()) {
        database.text = database.original;
        for (const [index, patch] of [...database.edits].sort(([a], [b]) => b - a)) database.text = patchAppearanceText(database.text, database.spans[index], patch.before, patch.after, schema.globalType.$DefType.map(field => field.hashTag));
    }
    if (apply) {
        const cache = path.join(repoRoot, '.cache', 'appearance-detail');
        fs.mkdirSync(cache, { recursive: true });
        const stage = fs.mkdtempSync(path.join(cache, 'apply-'));
        const written = [];
        let preserveStage = false;
        try {
            for (const [db, database] of databases) {
                fs.writeFileSync(path.join(stage, `${db}.json`), database.text, { encoding: 'utf8', flag: 'wx' });
                fs.writeFileSync(path.join(stage, `${db}.before.json`), database.original, { encoding: 'utf8', flag: 'wx' });
            }
            for (const [db, database] of databases) if (fs.readFileSync(path.join(schema.workDir, 'DataBases', `db_${db}.json`), 'utf8') !== database.original) throw new Error('DB が検証後に変更されました');
            for (const [db, database] of databases) {
                fs.renameSync(path.join(stage, `${db}.json`), path.join(schema.workDir, 'DataBases', `db_${db}.json`));
                written.push([db, database]);
            }
        } catch (error) {
            const failures = [];
            for (const [db] of written.reverse()) {
                try { fs.renameSync(path.join(stage, `${db}.before.json`), path.join(schema.workDir, 'DataBases', `db_${db}.json`)); }
                catch (rollbackError) { failures.push(rollbackError); }
            }
            if (failures.length) {
                preserveStage = true;
                throw new AggregateError([error, ...failures], `復元に失敗しました。元データを保存しています: ${stage}`);
            }
            throw error;
        } finally {
            if (!preserveStage) fs.rmSync(stage, { recursive: true, force: true });
        }
    }
    return { applied: apply, results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const { values } = parseArgs({ options: { work: { type: 'string' }, patch: { type: 'string' }, apply: { type: 'boolean', default: false }, prepare: { type: 'boolean' }, db: { type: 'string' }, match: { type: 'string' }, out: { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
        if (values.help) console.log('node tools/patch-appearance-detail.mjs --prepare --work <Work> --db <DB> --match <JSON> --out .cache/候補.json\nnode tools/patch-appearance-detail.mjs --work <Work> --patch <候補.json> [--apply]\n候補: [{db, match, before, after, sources:[{field, value, note, permissionNote} または {kind:"manual", note}]}]\n準備後は after と根拠を監修者が入力。既定は dry-run。要素の削除・並替は対象外。');
        else if (values.prepare) {
            if (values.patch || values.apply) throw new Error('--prepare は --patch / --apply と併用できません');
            console.log(JSON.stringify(prepareAppearancePatch({ work: values.work, db: values.db, match: JSON.parse(values.match), out: values.out }), null, 2));
        } else {
            if (values.db || values.match || values.out) throw new Error('--db / --match / --out は --prepare で使用してください');
            console.log(JSON.stringify(patchAppearanceDetails({ work: values.work, patches: read(values.patch), apply: values.apply }), null, 2));
        }
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
