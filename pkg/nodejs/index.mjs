/**
 * CreationsDB Node.js ライブラリ
 *
 * 100BeautiesLab_CreationsDB をサブモジュールとして導入した環境から
 * ファイルシステム経由で DB レコードを取得・検索するためのクライアントライブラリ。
 * Service Worker / ブラウザ API に依存せず、Node.js (ESM) で単独動作します。
 *
 * @fileoverview Node.js 向け CreationsDB クライアント
 * @author 100BeautiesLab Creations Database Team
 * @version 1.0.0
 * @example
 * import { CreationsDBClient } from './pkg/nodejs/index.mjs';
 * const client = new CreationsDBClient('/path/to/100BeautiesLab_CreationsDB');
 * const works = await client.listWorks();
 * const records = await client.getRecords('NumberTales', 'Primary');
 */

import { readFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// デフォルトのリポジトリルート
// ─────────────────────────────────────────────────────────────────────────────

/**
 * デフォルトのリポジトリルート。
 * このファイル (pkg/nodejs/index.mjs) の 2 階層上がリポジトリルートになる。
 * サブモジュールとして配置すれば `new CreationsDBClient()` だけで動作する。
 * @type {string}
 */
const _DEFAULT_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// ─────────────────────────────────────────────────────────────────────────────
// 内部ユーティリティ（sw-common.js の DataUtils / SearchEngine を fs 向けに移植）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 安全なトークン（作品ID・DB名）かどうかを判定（英数字とアンダースコアのみ許可）
 * @param {any} s
 * @returns {boolean}
 */
function isSafeToken(s) {
  if (typeof s !== 'string' || s.length === 0) return false;
  return /^[A-Za-z0-9_]+$/.test(s);
}

/**
 * 先頭文字を大文字化
 * @param {string} s
 * @returns {string}
 */
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * 作品IDを `#Works_<Name>` 形式に正規化
 * @param {string} id - 入力ID（"NumberTales" / "Works_NumberTales" / "#Works_NumberTales" いずれも可）
 * @returns {string|null}
 */
function toWorkKey(id) {
  if (!id) return null;
  const raw = String(id).trim();
  let normalized = raw.startsWith('#Works_') ? raw
    : raw.startsWith('Works_') ? `#${raw}`
    : `#Works_${raw}`;
  const m = normalized.match(/^#Works_([A-Za-z0-9_]+)$/);
  return m ? `#Works_${m[1]}` : null;
}

/**
 * Works_XXX ディレクトリ名を解決（`#Works_XXX` → `Works_XXX`）
 * @param {string} workId
 * @returns {string}
 */
function resolveWorkDirName(workId) {
  return String(workId || '').replace('#Works_', 'Works_');
}

/**
 * DB メタキーから prefix を除いた DB 名を返す
 * @param {string} dbName
 * @returns {string}
 */
function stripMetaDbPrefix(dbName) {
  return String(dbName || '').trim().replace(/^#?(DB|Ref)_/i, '').replace(/^[#]/, '');
}

/**
 * DB 名を `#DB_Primary` 形式のメタキーへ変換
 * @param {string} dbName
 * @returns {string}
 */
function normalizeDBKeyForMeta(dbName) {
  return `#DB_${capitalize(stripMetaDbPrefix(dbName))}`;
}

/**
 * `databases` オブジェクトから DB エントリを検索
 * @param {Object} databases
 * @param {string} dbName
 * @returns {{ metaKey: string|null, entry: Object|null }}
 */
function findMetaDbEntry(databases, dbName) {
  if (!databases || typeof databases !== 'object' || Array.isArray(databases)) {
    return { metaKey: null, entry: null };
  }
  const norm = capitalize(stripMetaDbPrefix(dbName));
  const candidates = [`#DB_${norm}`, `#Ref_${norm}`];
  for (const metaKey of candidates) {
    const entry = databases[metaKey];
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return { metaKey, entry };
    }
  }
  return { metaKey: candidates[0], entry: null };
}

/**
 * isPrivate フラグによる非公開レコードを除外
 * @param {Object} record
 * @returns {boolean} 公開対象なら true
 */
function isPublicRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return true;
  return !(record.isPrivate === true || String(record.isPrivate || '').trim().toLowerCase() === 'true');
}

/**
 * `_Commons` 適用時の空値判定
 * @param {any} v
 * @returns {boolean}
 */
function isEmptyForCommons(v) {
  if (v === null || typeof v === 'undefined') return true;
  if (v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (v && typeof v === 'object') {
    if (typeof v.hideText === 'string' && v.hideText) return false; // 意図的マスクは空扱いしない
    return Object.keys(v).length === 0;
  }
  return false;
}

/**
 * `db_meta.json` の `_Commons` をレコード配列に非破壊適用
 * sw-common.js CommonsProcessor.applyCommonsToRecords の移植版（基本部分のみ）
 * @param {Array} records
 * @param {Object} workMeta
 * @param {string} dbName
 * @returns {Array}
 */
function applyCommonsToRecords(records, workMeta, dbName) {
  try {
    const dbKey = normalizeDBKeyForMeta(dbName);
    const commons = workMeta?.Databases?.[dbKey]?._Commons;
    const secDefs =
      workMeta?.Databases?.[dbKey]?._Secondaries ??
      workMeta?.Databases?.[dbKey]?.Secondaries;

    if ((!commons && !Array.isArray(secDefs)) || !Array.isArray(records)) return records;

    const buildDefaults = (cmn) => {
      if (!cmn || typeof cmn !== 'object' || Array.isArray(cmn)) return {};
      const out = {};
      for (const [k, v] of Object.entries(cmn)) {
        if (k.startsWith('_') || k.startsWith('#')) continue;
        out[k] = v;
      }
      return out;
    };

    const findSecDefaults = (rec) => {
      if (!Array.isArray(secDefs)) return {};
      const normStr = (v) => v == null ? '' : String(v);
      let best = null;
      let bestScore = -1;
      for (const def of secDefs) {
        if (!def || typeof def !== 'object' || Array.isArray(def) || !def._Commons) continue;
        const defTitle = def.sec_SeriesTitle ?? def.SecondarySeriesTitle;
        if (defTitle == null || normStr(defTitle).trim() === '') {
          if (best === null) best = buildDefaults(def._Commons);
          continue;
        }
        const recTitle = rec.sec_SeriesTitle ?? rec.SecondarySeriesTitle;
        if (normStr(recTitle) !== normStr(defTitle)) continue;
        const score = 10;
        if (score > bestScore) { bestScore = score; best = buildDefaults(def._Commons); }
      }
      return best || {};
    };

    return records.map((rec) => {
      if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return rec;
      const dbDefaults = buildDefaults(commons);
      const secDefaults = findSecDefaults(rec);
      const defaults = { ...dbDefaults, ...secDefaults };
      for (const [k, v] of Object.entries(defaults)) {
        if (k.startsWith('#')) continue;
        if (typeof rec[k] === 'undefined' || isEmptyForCommons(rec[k])) rec[k] = v;
      }
      return rec;
    });
  } catch {
    return records;
  }
}

/**
 * テキスト全文検索（searchableText または全フィールドを対象）
 * @param {Array} records
 * @param {string} query
 * @returns {Array}
 */
function searchText(records, query) {
  if (!query || !Array.isArray(records)) return records;
  const q = query.toLowerCase();
  return records.filter((rec) => {
    const text = (rec?._enrichment?.searchableText ?? JSON.stringify(rec)).toLowerCase();
    return text.includes(q);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ファイルシステム I/O
// ─────────────────────────────────────────────────────────────────────────────

/**
 * リポジトリルートを基準に絶対パスを解決（`/data/...` → `<repoRoot>/data/...`）
 * @param {string} repoRoot - リポジトリの絶対パス
 * @param {string} path - ルート相対パス（先頭 `/` は除去）
 * @returns {string}
 */
function resolvePath(repoRoot, path) {
  return join(repoRoot, path.replace(/^\//, ''));
}

/**
 * JSON ファイルを読み込んでパース
 * @param {string} repoRoot
 * @param {string} path - ルート相対パス
 * @returns {Promise<any>}
 * @throws ファイルが見つからない・パース失敗の場合
 */
async function fetchJSON(repoRoot, path) {
  const filePath = resolvePath(repoRoot, path);
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * ファイル存在確認
 * @param {string} repoRoot
 * @param {string} path
 * @returns {Promise<boolean>}
 */
async function fileExists(repoRoot, path) {
  try {
    await access(resolvePath(repoRoot, path));
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// メタ / 型定義 読み込みヘルパー
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 辞書バンドル（`data/Dictionaries/` または作品別 Dictionaries/）を読み込み
 * @param {string} repoRoot
 * @param {string} basePath - ルート相対ディレクトリパス
 * @returns {Promise<{ meta: Object, vars: Object }>}
 */
async function readDictionaryBundle(repoRoot, basePath) {
  let meta = {};
  let typeVars = {};
  try { meta = await fetchJSON(repoRoot, `${basePath}/db_meta.json`); } catch { /* 無くても続行 */ }
  try {
    const t = await fetchJSON(repoRoot, `${basePath}/db_type.json`);
    if (t?.$VarsDef && typeof t.$VarsDef === 'object' && !Array.isArray(t.$VarsDef)) {
      typeVars = t.$VarsDef;
    }
  } catch { /* 無くても続行 */ }

  const catalogs = meta?.Dictionaries && typeof meta.Dictionaries === 'object' ? meta.Dictionaries : {};
  const vars = { ...typeVars };

  for (const [rawKey, info] of Object.entries(catalogs)) {
    if (!info || typeof info !== 'object' || Array.isArray(info)) continue;
    const dictName = String(rawKey).replace(/^#Dict_/, '').trim();
    if (!dictName) continue;
    const dictKey = rawKey.startsWith('#Dict_') ? rawKey.trim() : `#Dict_${dictName}`;
    const compatKey = typeof info.compatListKey === 'string' && info.compatListKey.trim()
      ? info.compatListKey.trim() : `#List_${dictName}`;
    try {
      const rows = await fetchJSON(repoRoot, `${basePath}/dict_${dictName}.json`);
      if (!Array.isArray(rows)) continue;
      vars[dictKey] = rows.map((r) => r && typeof r === 'object' ? { ...r } : r);
      if (compatKey && !vars[compatKey]) {
        vars[compatKey] = vars[dictKey].map((r) => r && typeof r === 'object' ? { ...r } : r);
      }
    } catch { /* 辞書ファイルが未作成でも続行 */ }
  }
  return { meta, vars };
}

/**
 * グローバルメタ（`data/db_meta.json` + Dictionaries 合流）を読み込み
 * @param {string} repoRoot
 * @returns {Promise<Object>}
 */
async function readGlobalMeta(repoRoot) {
  const meta = await fetchJSON(repoRoot, '/data/db_meta.json');
  const { vars, meta: dictMeta } = await readDictionaryBundle(repoRoot, '/data/Dictionaries');
  return mergeMetaWithVars(meta, vars, dictMeta);
}

/**
 * 作品別メタ（`data/Works_XXX/DataBases/db_meta.json` + Dictionaries）を読み込み
 * @param {string} repoRoot
 * @param {string} workId
 * @returns {Promise<Object>}
 */
async function readWorkMeta(repoRoot, workId) {
  const workDir = resolveWorkDirName(workId);
  const meta = await fetchJSON(repoRoot, `/data/${workDir}/DataBases/db_meta.json`);
  const { vars, meta: dictMeta } = await readDictionaryBundle(repoRoot, `/data/${workDir}/Dictionaries`);
  return mergeMetaWithVars(meta, vars, dictMeta);
}

/**
 * vars / dictMeta をメタオブジェクトへ合流
 * @param {Object} meta
 * @param {Object} vars
 * @param {Object} dictMeta
 * @returns {Object}
 */
function mergeMetaWithVars(meta, vars = {}, dictMeta = {}) {
  const m = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
  const v = vars && typeof vars === 'object' && !Array.isArray(vars) ? vars : {};
  const dm = dictMeta && typeof dictMeta === 'object' && !Array.isArray(dictMeta) ? dictMeta : {};

  const metaGeneral = m.General && typeof m.General === 'object' && !Array.isArray(m.General) ? m.General : {};
  const metaVars = metaGeneral.$VarsDef && typeof metaGeneral.$VarsDef === 'object' ? metaGeneral.$VarsDef : {};
  const mergedVars = { ...metaVars, ...v };

  const baseDicts = m.Dictionaries && typeof m.Dictionaries === 'object' ? m.Dictionaries : {};
  const extraDicts = dm.Dictionaries && typeof dm.Dictionaries === 'object' ? dm.Dictionaries : {};

  return {
    ...m,
    ...(Object.keys(extraDicts).length > 0 ? { Dictionaries: { ...baseDicts, ...extraDicts } } : {}),
    General: { ...metaGeneral, $VarsDef: mergedVars }
  };
}

/**
 * DBファイル候補から存在するものを選択してレコード配列を返す
 * @param {string} repoRoot
 * @param {string} workId
 * @param {string} dbName
 * @param {Object} workMeta
 * @returns {Promise<Array>}
 */
async function readDBRecords(repoRoot, workId, dbName) {
  const norm = dbName.replace(/^#?DB_/i, '').replace(/^[#]/, '');
  if (!isSafeToken(norm)) throw new Error(`Invalid dbName: ${dbName}`);
  const key = capitalize(norm);

  // 作品メタから DB_Layer / DB_File を解決
  let workMeta = null;
  try { workMeta = await readWorkMeta(repoRoot, workId); } catch { /* メタ欠損でも続行 */ }

  const dbMetaInfo = findMetaDbEntry(workMeta?.Databases, key);
  const dbEntry = dbMetaInfo?.entry ?? null;
  const layer = typeof dbEntry?.DB_Layer === 'string' && isSafeToken(dbEntry.DB_Layer.trim())
    ? dbEntry.DB_Layer.trim() : 'DataBases';
  const configuredFile = (() => {
    const raw = typeof dbEntry?.DB_File === 'string' ? dbEntry.DB_File.trim() : '';
    return /^[A-Za-z0-9_.-]+\.json$/.test(raw) ? raw : '';
  })();
  const defaultPrefix = String(dbMetaInfo?.metaKey || '').startsWith('#Ref_') ? 'ref_' : 'db_';
  const base = `/data/${resolveWorkDirName(workId)}/${layer}`;

  const conventional = {
    Primary: 'db_Primary.json', Secondary: 'db_Secondary.json',
    SemiPrimary: 'db_SemiPrimary.json', SelfSecondary: 'db_SelfSecondary.json',
    Proxy: 'db_Proxy.json', Mobs: 'db_Mobs.json'
  };

  const candidates = [
    ...(configuredFile ? [configuredFile] : []),
    ...(conventional[key] ? [conventional[key]] : []),
    `${defaultPrefix}${key}.json`,
    ...(key.toLowerCase() !== norm.toLowerCase() ? [`${defaultPrefix}${norm}.json`] : []),
    ...(defaultPrefix !== 'db_' ? [`db_${key}.json`] : [])
  ];

  for (const fname of candidates) {
    if (await fileExists(repoRoot, `${base}/${fname}`)) {
      return { records: await fetchJSON(repoRoot, `${base}/${fname}`), workMeta };
    }
  }
  throw new Error(`DB file not found for workId=${workId} dbName=${dbName}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 公開 API クラス
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CreationsDB Node.js クライアント
 *
 * サブモジュールとして導入した 100BeautiesLab_CreationsDB リポジトリの
 * データを Node.js 環境から直接取得します。
 *
 * @example
 * // サブモジュール構成ではパス指定なし（index.mjs から自動解決）
 * import { CreationsDBClient } from './submodules/100BeautiesLab_CreationsDB/pkg/nodejs/index.mjs';
 * const db = new CreationsDBClient();
 *
 * // 任意のパスを明示する場合
 * const db = new CreationsDBClient('/path/to/100BeautiesLab_CreationsDB');
 */
export class CreationsDBClient {
  /**
   * @param {string} [repoRoot] - サブモジュールのルートディレクトリ絶対パス。
   *   省略時は index.mjs の 2 階層上を自動的にリポジトリルートとして使用する。
   * @param {Object} [options]
   * @param {boolean} [options.includePrivate=false] - isPrivate レコードを含めるか
   */
  constructor(repoRoot = _DEFAULT_REPO_ROOT, options = {}) {
    this.repoRoot = resolve(repoRoot);
    this.includePrivate = Boolean(options.includePrivate ?? false);
  }

  // ── メタデータ系 ─────────────────────────────────────────────────────────

  /**
   * グローバルメタデータを取得（`data/db_meta.json` + Dictionaries 合流済み）
   * @returns {Promise<Object>}
   */
  async getMeta() {
    return readGlobalMeta(this.repoRoot);
  }

  /**
   * 作品一覧を取得
   * @returns {Promise<Array<{ key: string, Title_JP: string, Title_EN: string, Works_Summary_JP: string, OldTitles: Array }>>}
   */
  async listWorks() {
    const globalMeta = await readGlobalMeta(this.repoRoot);
    return Object.entries(globalMeta.CreationWorks ?? {})
      .filter(([, info]) => info?.Works_Hidden !== true)
      .map(([key, info]) => ({
        key,
        Title_JP: typeof info?.Title_JP === 'string' ? info.Title_JP : '',
        Title_EN: typeof info?.Title_EN === 'string' ? info.Title_EN : '',
        Works_Summary_JP: typeof info?.Works_Summary_JP === 'string' ? info.Works_Summary_JP : '',
        OldTitles: Array.isArray(info?.OldTitles) ? info.OldTitles : []
      }));
  }

  /**
   * 作品別メタデータを取得
   * @param {string} workId - 作品ID（例: "NumberTales" / "Works_NumberTales" / "#Works_NumberTales"）
   * @returns {Promise<Object>}
   */
  async getWorkMeta(workId) {
    const key = toWorkKey(workId);
    if (!key) throw new TypeError(`Invalid workId: ${workId}`);
    return readWorkMeta(this.repoRoot, key);
  }

  /**
   * 指定作品で利用可能な DB 一覧を取得
   * @param {string} workId
   * @returns {Promise<Array<{ key: string, file: string, layer: string }>>}
   */
  async listDBs(workId) {
    const key = toWorkKey(workId);
    if (!key) throw new TypeError(`Invalid workId: ${workId}`);

    const exist = [];
    let workMeta = null;
    try { workMeta = await readWorkMeta(this.repoRoot, key); } catch { /* メタ欠損でも続行 */ }

    if (workMeta?.Databases) {
      for (const [dbKey, dbEntry] of Object.entries(workMeta.Databases)) {
        if (dbEntry?.DB_Hidden === true) continue;
        const norm = stripMetaDbPrefix(dbKey);
        const name = capitalize(norm);
        const layer = typeof dbEntry?.DB_Layer === 'string' && isSafeToken(dbEntry.DB_Layer.trim())
          ? dbEntry.DB_Layer.trim() : 'DataBases';
        const configuredFile = (() => {
          const raw = typeof dbEntry?.DB_File === 'string' ? dbEntry.DB_File.trim() : '';
          return /^[A-Za-z0-9_.-]+\.json$/.test(raw) ? raw : '';
        })();
        const defaultPrefix = dbKey.startsWith('#Ref_') ? 'ref_' : 'db_';
        const base = `/data/${resolveWorkDirName(key)}/${layer}`;
        const candidates = [
          ...(configuredFile ? [configuredFile] : []),
          `${defaultPrefix}${name}.json`,
          `db_${name}.json`
        ];
        for (const fname of candidates) {
          if (await fileExists(this.repoRoot, `${base}/${fname}`)) {
            const label = typeof dbEntry?.DB_Label === 'string' ? dbEntry.DB_Label : name;
            const labelEN = typeof dbEntry?.DB_Label_EN === 'string' ? dbEntry.DB_Label_EN : name;
            exist.push({ key: name, file: fname, layer, DB_Label: label, DB_Label_EN: labelEN });
            break;
          }
        }
      }
      if (exist.length > 0) return exist;
    }

    // メタ未整備の作品はデフォルトファイル名を探索
    const base = `/data/${resolveWorkDirName(key)}/DataBases`;
    const defaults = [
      'Primary', 'Secondary', 'SemiPrimary', 'SelfSecondary', 'Proxy', 'Mobs',
      'PrimaryDealer', 'PrimaryMobs', 'UnprocessedSecondary'
    ];
    for (const name of defaults) {
      if (await fileExists(this.repoRoot, `${base}/db_${name}.json`)) {
        exist.push({ key: name, file: `db_${name}.json`, layer: 'DataBases', DB_Label: name, DB_Label_EN: name });
      }
    }
    return exist;
  }

  // ── レコード取得系 ──────────────────────────────────────────────────────

  /**
   * DB のレコード一覧を取得
   * @param {string} workId
   * @param {string} dbName - DB 名（例: "Primary" / "Secondary"）
   * @param {Object} [options]
   * @param {boolean} [options.applyCommons=true] - `_Commons` 補完を適用するか
   * @returns {Promise<Array<Object>>}
   */
  async getRecords(workId, dbName, options = {}) {
    const key = toWorkKey(workId);
    if (!key) throw new TypeError(`Invalid workId: ${workId}`);
    const applyCommons = options.applyCommons !== false;

    const { records: raw, workMeta } = await readDBRecords(this.repoRoot, key, dbName);
    if (!Array.isArray(raw)) return [];

    let records = this.includePrivate ? raw : raw.filter(isPublicRecord);
    if (applyCommons && workMeta) {
      records = applyCommonsToRecords(records, workMeta, dbName);
    }
    return records;
  }

  /**
   * インデックス値でレコードを 1 件取得
   * @param {string} workId
   * @param {string} dbName
   * @param {string|number} idxValue - インデックス値（例: "1", "I", "Wrath"）
   * @param {string} [idxKey='Num'] - インデックスフィールド名（例: "Num", "Card.Num"）
   * @returns {Promise<Object|null>}
   */
  async getRecord(workId, dbName, idxValue, idxKey = 'Num') {
    const records = await this.getRecords(workId, dbName);
    const target = String(idxValue);

    const getByPath = (obj, path) => {
      const parts = String(path).split('.');
      let cur = obj;
      for (const p of parts) {
        if (cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p];
        else return undefined;
      }
      return cur;
    };

    return records.find((rec) => {
      const v = getByPath(rec, idxKey);
      return v != null && String(v) === target;
    }) ?? null;
  }

  /**
   * 全文検索（`searchableText` または JSON 全体を対象）
   * @param {string} workId
   * @param {string} dbName
   * @param {string} query - 検索キーワード（部分一致、大小文字無視）
   * @returns {Promise<Array<Object>>}
   */
  async search(workId, dbName, query) {
    const records = await this.getRecords(workId, dbName);
    return searchText(records, query);
  }

  /**
   * 作品内の全 DB にわたる全文検索
   * @param {string} workId
   * @param {string} query
   * @returns {Promise<Array<{ db: string, record: Object }>>}
   */
  async searchAll(workId, query) {
    const dbs = await this.listDBs(workId);
    const results = [];
    for (const dbInfo of dbs) {
      const hits = await this.search(workId, dbInfo.key, query);
      for (const record of hits) {
        results.push({ db: dbInfo.key, record });
      }
    }
    return results;
  }
}

// デフォルトエクスポート（import creationsdb from '...' 形式にも対応）
export default CreationsDBClient;
