/**
 * Service Worker 共通ライブラリ
 *
 * GitHub Pages上で動作する疑似API機能の共通実装を提供します。
 * 複数のService Workerファイル間で重複していた機能を統合し、
 * 参照解決、データフェッチ、検索機能などを共通化しています。
 *
 * @fileoverview Service Worker共通機能ライブラリ
 * @author 100BeautiesLab Creations Database Team
 * @version 1.0.0
 */

// グローバル設定
const CACHE_NAME = '100bl-api-v1';
const WORK_CTX_TTL_MS = 15 * 1000; // インメモリキャッシュのTTL
const WORK_CTX_CACHE = new Map(); // workId -> { t, mergedVars, defTypeMerged, indices }

function resolveWorkDirName(workId) {
	return String(workId || '').replace('#Works_', 'Works_');
}

function isPublicRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return true;
  return !(record.isPrivate === true || String(record.isPrivate || '').trim().toLowerCase() === 'true');
}

function filterPublicRecords(records) {
  if (!Array.isArray(records)) return [];
  return records.filter(isPublicRecord);
}

/**
 * Service Worker基本設定クラス
 * スコープパスやAPIプレフィックスの計算を担当
 */
class SWConfig {
  /**
   * @param {string} scopePath - Service Workerのスコープパス
   */
  constructor(scopePath) {
    this.SCOPE_PATH = scopePath;
    this.REPO_BASE = this.computeRepoBase(scopePath);
    this.API_PREFIX = `${scopePath}/v1`;
    this.ORIGIN = self.location.origin;
  }

  /**
   * スコープの親ディレクトリを計算
   * @param {string} scopePath - スコープパス
   * @returns {string} リポジトリベースパス
   */
  computeRepoBase(scopePath) {
    const idx = scopePath.lastIndexOf('/');
    if (idx <= 0) return '/';
    return scopePath.substring(0, idx) + '/';
  }

  /**
   * パスにリポジトリベースを付加
   * @param {string} path - 変換するパス
   * @returns {string} リポジトリベース付きのパス
   */
  withRepoBase(path) {
    if (!path) return path;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (path.startsWith('/')) return `${this.REPO_BASE}${path.slice(1)}`;
    return `${this.REPO_BASE}${path}`;
  }
}

/**
 * HTTPレスポンス生成ユーティリティ
 */
class ResponseUtils {
  /**
   * JSON レスポンスを生成
   * @param {Object} obj - レスポンスオブジェクト
   * @param {number} status - HTTPステータスコード
   * @param {Object} headers - 追加ヘッダー
   * @returns {Response} JSONレスポンス
   */
  static jsonResponse(obj, status = 200, headers = {}) {
    return new Response(JSON.stringify(obj, null, 2), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
    });
  }

  /**
   * 404エラーレスポンスを生成
   * @param {string} message - エラーメッセージ
   * @returns {Response} 404レスポンス
   */
  static notFound(message = 'Not Found') {
    return ResponseUtils.jsonResponse({ error: message }, 404);
  }

  /**
   * 400エラーレスポンスを生成
   * @param {string} message - エラーメッセージ
   * @returns {Response} 400レスポンス
   */
  static badRequest(message = 'Bad Request') {
    return ResponseUtils.jsonResponse({ error: message }, 400);
  }
}

/**
 * データフェッチクラス
 * JSONファイルの読み込みとファイル存在確認を担当
 */
class DataFetcher {
  /**
   * @param {SWConfig} config - Service Worker設定オブジェクト
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * JSON ファイルをフェッチして解析
   * @param {string} path - フェッチするパス
   * @returns {Promise<Object>} 解析されたJSONオブジェクト
   * @throws {Error} フェッチに失敗した場合
   */
  async fetchJSON(path) {
    const url = new URL(this.config.withRepoBase(path), this.config.ORIGIN).toString();
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Fetch failed ${res.status} ${url}`);
    return res.json();
  }

  /**
   * ファイルの存在を確認
   * @param {string} path - 確認するファイルパス
   * @returns {Promise<boolean>} ファイルが存在する場合はtrue
   */
  async fileExists(path) {
    try {
      const url = new URL(this.config.withRepoBase(path), this.config.ORIGIN).toString();
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * グローバルメタデータを読み込み
   * @returns {Promise<Object>} グローバルメタデータ
   */
  async readGlobalMeta() {
    const meta = await this.fetchJSON('/data/db_meta.json');
    const dictBundle = await this.readDictionaryBundle('/data/Dictionaries');
    return this.mergeMetaWithDictionaryBundle(meta, dictBundle.vars, dictBundle.meta);
  }

  /**
   * グローバル型定義を読み込み
   * @returns {Promise<Object>} グローバル型定義
   */
  async readGlobalType() {
    try {
      return await this.fetchJSON('/data/db_type.json');
    } catch (_) {
      return {};
    }
  }

  /**
   * 作品メタデータを読み込み
   * @param {string} workId - 作品識別子
   * @returns {Promise<Object>} 作品メタデータ
   */
  async readWorkMeta(workId) {
    if (!workId) throw new Error('Invalid workId');
    const workDir = resolveWorkDirName(workId);
    const metaPath = `/data/${workDir}/DataBases/db_meta.json`;
    const meta = await this.fetchJSON(metaPath);
    const dictBundle = await this.readDictionaryBundle(`/data/${workDir}/Dictionaries`);
    return this.mergeMetaWithDictionaryBundle(meta, dictBundle.vars, dictBundle.meta);
  }

  /**
   * 作品型定義を読み込み
   * @param {string} workId - 作品識別子
   * @returns {Promise<Object>} 作品型定義
   */
  async readWorkType(workId) {
    if (!workId) throw new Error('Invalid workId');
    try {
      return await this.fetchJSON(`/data/${resolveWorkDirName(workId)}/DataBases/db_type.json`);
    } catch (_) {
      return {};
    }
  }

  /**
   * Dictionary 用メタデータを読み込み
   * @param {string} basePath - Dictionaries ディレクトリのベースパス
   * @returns {Promise<Object>} 辞書メタデータ
   */
  async readDictionaryMeta(basePath) {
    try {
      return await this.fetchJSON(`${basePath}/db_meta.json`);
    } catch (_) {
      return {};
    }
  }

  /**
   * Dictionary 用型定義を読み込み
   * @param {string} basePath - Dictionaries ディレクトリのベースパス
   * @returns {Promise<Object>} 辞書型定義
   */
  async readDictionaryType(basePath) {
    try {
      return await this.fetchJSON(`${basePath}/db_type.json`);
    } catch (_) {
      return {};
    }
  }

  /**
   * 辞書DB群を `$VarsDef` 互換の形へ展開
   * @param {string} basePath - Dictionaries ディレクトリのベースパス
   * @returns {Promise<{ meta: Object, vars: Object }>} 辞書メタと辞書VarsDef
   */
  async readDictionaryBundle(basePath) {
    const [meta, type] = await Promise.all([
      this.readDictionaryMeta(basePath),
      this.readDictionaryType(basePath)
    ]);

    const typeVars = (type?.$VarsDef && typeof type.$VarsDef === 'object' && !Array.isArray(type.$VarsDef))
      ? type.$VarsDef
      : {};
    const catalogs = (meta?.Dictionaries && typeof meta.Dictionaries === 'object' && !Array.isArray(meta.Dictionaries))
      ? meta.Dictionaries
      : {};
    const vars = { ...typeVars };

    for (const [rawDictKey, info] of Object.entries(catalogs)) {
      if (!info || typeof info !== 'object' || Array.isArray(info)) continue;

      const dictName = String(rawDictKey || '').replace(/^#Dict_/, '').trim();
      const keyField = typeof info.keyField === 'string' ? info.keyField.trim() : '';
      const derivedName = dictName || keyField;
      if (!derivedName) continue;

      const dictKey = String(rawDictKey || '').startsWith('#Dict_')
        ? String(rawDictKey).trim()
        : `#Dict_${derivedName}`;
      const compatListKey = typeof info.compatListKey === 'string' && info.compatListKey.trim()
        ? info.compatListKey.trim()
        : `#List_${derivedName}`;
      const fileName = `dict_${derivedName}.json`;

      try {
        const rows = await this.fetchJSON(`${basePath}/${fileName}`);
        if (!Array.isArray(rows)) continue;
        const clonedRows = rows.map((row) => (row && typeof row === 'object' ? { ...row } : row));
        vars[dictKey] = clonedRows;
        if (compatListKey && !vars[compatListKey]) {
          vars[compatListKey] = clonedRows.map((row) => (row && typeof row === 'object' ? { ...row } : row));
        }
      } catch (_) {
        // 辞書ファイルが未作成でも他の辞書・メタ処理は継続する
      }
    }

    return { meta, vars };
  }

  /**
   * 読み込んだ追加辞書を meta.General.$VarsDef と top-level Dictionaries へ合流
   * @param {Object} metaSource - 元メタデータ
   * @param {Object} extraVars - 追加する VarsDef
   * @param {Object} extraMeta - 追加する辞書メタ
   * @returns {Object} 合流後メタデータ
   */
  mergeMetaWithDictionaryBundle(metaSource, extraVars = {}, extraMeta = {}) {
    const meta = (metaSource && typeof metaSource === 'object' && !Array.isArray(metaSource)) ? metaSource : {};
    const vars = (extraVars && typeof extraVars === 'object' && !Array.isArray(extraVars)) ? extraVars : {};
    const dictMeta = (extraMeta && typeof extraMeta === 'object' && !Array.isArray(extraMeta)) ? extraMeta : {};

    const metaGeneral = (meta.General && typeof meta.General === 'object' && !Array.isArray(meta.General)) ? meta.General : {};
    const metaVars = (metaGeneral.$VarsDef && typeof metaGeneral.$VarsDef === 'object' && !Array.isArray(metaGeneral.$VarsDef))
      ? metaGeneral.$VarsDef
      : {};
    const mergedVars = Object.keys(vars).length > 0 ? DataUtils.deepMerge(metaVars, vars) : metaVars;

    const baseDictionaries = (meta.Dictionaries && typeof meta.Dictionaries === 'object' && !Array.isArray(meta.Dictionaries))
      ? meta.Dictionaries
      : {};
    const extraDictionaries = (dictMeta.Dictionaries && typeof dictMeta.Dictionaries === 'object' && !Array.isArray(dictMeta.Dictionaries))
      ? dictMeta.Dictionaries
      : {};
    const mergedDictionaries = Object.keys(extraDictionaries).length > 0
      ? DataUtils.deepMerge(baseDictionaries, extraDictionaries)
      : baseDictionaries;

    return {
      ...meta,
      ...(Object.keys(mergedDictionaries).length > 0 ? { Dictionaries: mergedDictionaries } : {}),
      General: {
        ...metaGeneral,
        $VarsDef: mergedVars
      }
    };
  }

  /**
   * General.$VarsDefをグローバルレベルで読み込み
   * @returns {Promise<Object>} グローバル変数定義
   */
  async readGeneralVarsDefGlobal() {
    try {
      const g = await this.readGlobalMeta();
      return g?.General?.$VarsDef ?? {};
    } catch (_) {
      return {};
    }
  }

  /**
   * General.$VarsDefを作品レベルで読み込み
   * @param {string} workId - 作品識別子
   * @returns {Promise<Object>} 作品変数定義
   */
  async readGeneralVarsDefWork(workId) {
    try {
      const meta = await this.readWorkMeta(workId);
      return meta?.General?.$VarsDef ?? {};
    } catch (_) {
      return {};
    }
  }

  /**
   * データベースを読み込み
   * @param {string} workId - 作品識別子
   * @param {string} dbName - データベース名
   * @returns {Promise<Array>} データベースレコード配列
   * @throws {Error} 不明なデータベース名の場合
   */
  async readDB(workId, dbName) {
    if (!workId) throw new Error('Invalid workId');
    const norm = (dbName || '').replace(/^#?DB_/i, '').replace(/^[#]/, '');
    if (!DataUtils.isSafeToken(norm)) throw new Error('Invalid dbName');
    const key = DataUtils.capitalize(norm);
    const base = `/data/${resolveWorkDirName(workId)}/DataBases`;

    // 従来のファイル名マッピング
    const conventional = {
      Primary: 'db_Primary.json',
      Secondary: 'db_Secondary.json',
      SemiPrimary: 'db_SemiPrimary.json',
      SelfSecondary: 'db_SelfSecondary.json',
      Proxy: 'db_Proxy.json',
      Mobs: 'db_Mobs.json'
    };

    const candidates = [];
    if (conventional[key]) candidates.push(conventional[key]);
    if (conventional[norm]) candidates.push(conventional[norm]);

    // 柔軟なフォールバック: db_<Key>.json / db_<norm>.json
    candidates.push(`db_${key}.json`);
    if (key.toLowerCase() !== norm.toLowerCase()) candidates.push(`db_${norm}.json`);

    // 最初に存在するファイルを選択
    for (const fname of candidates) {
      if (await this.fileExists(`${base}/${fname}`)) {
        return this.fetchJSON(`${base}/${fname}`);
      }
    }
    throw new Error(`Unknown dbName or missing file for ${dbName}`);
  }

  /**
   * 作品の利用可能なデータベースをリストアップ
   * @param {string} workId - 作品識別子
   * @returns {Promise<Array>} データベース情報の配列
   */
  async listWorkDBs(workId) {
    if (!workId) throw new Error('Invalid workId');
    const base = `/data/${resolveWorkDirName(workId)}/DataBases`;
    const exist = [];

    // メタデータからデータベースキーを取得
    try {
      const meta = await this.readWorkMeta(workId);
      const dbs = Object.keys(meta?.Databases || {});
      for (const dbKey of dbs) {
        const norm = (dbKey || '').replace(/^#?DB_/i, '').replace(/^[#]/, '');
        const name = DataUtils.capitalize(norm);
        const candidates = [
          `db_${name}.json`,
          ...(name.toLowerCase() !== norm.toLowerCase() ? [`db_${norm}.json`] : [])
        ];
        for (const fname of candidates) {
          if (await this.fileExists(`${base}/${fname}`)) {
            exist.push({ key: name, file: fname });
            break;
          }
        }
      }
    } catch {}

    // メタデータから何も得られない場合は従来の探査を実行
    if (exist.length === 0) {
      const conventional = [
        { name: 'Primary', file: 'db_Primary.json' },
        { name: 'Secondary', file: 'db_Secondary.json' },
        { name: 'SemiPrimary', file: 'db_SemiPrimary.json' },
        { name: 'SelfSecondary', file: 'db_SelfSecondary.json' },
        // 追加のDB種別（メタが欠損/不完全でも列挙できるようにする）
        { name: 'UnprocessedSecondary', file: 'db_UnprocessedSecondary.json' },
        { name: 'PrimaryDealer', file: 'db_PrimaryDealer.json' },
        { name: 'PrimaryMobs', file: 'db_PrimaryMobs.json' },
        { name: 'Proxy', file: 'db_Proxy.json' },
        { name: 'Mobs', file: 'db_Mobs.json' }
      ];
      for (const c of conventional) {
        if (await this.fileExists(`${base}/${c.file}`)) exist.push({ key: c.name, file: c.file });
      }
    }
    return exist;
  }
}

/**
 * データ処理ユーティリティクラス
 * 文字列操作、正規化、検証などを担当
 */
class DataUtils {
  /**
   * URL パラメータ等の外部入力を、パスセグメントとして安全に扱えるか判定
   * - 作品IDやDB名は "Works_NumberTales" / "PrimaryDealer" のような英数字+アンダースコアのみ許可する
   * @param {any} s
   * @returns {boolean}
   */
  static isSafeToken(s) {
    if (typeof s !== 'string') return false;
    if (s.length === 0) return false;
    return /^[A-Za-z0-9_]+$/.test(s);
  }

  /**
   * 文字列の最初の文字を大文字にする
   * @param {string} s - 処理する文字列
   * @returns {string} 最初の文字が大文字の文字列
   */
  static capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  /**
   * 作品IDを正規化して#Works_プレフィックス付きの形式に変換
   * @param {string} id - 入力ID（様々な形式をサポート）
   * @returns {string|null} 正規化された作品キー
   */
  static toWorkKey(id) {
    if (!id) return null;
    const raw = String(id).trim();
    if (!raw) return null;

    let normalized;
    if (raw.startsWith('#Works_')) normalized = raw;
    else if (raw.startsWith('Works_')) normalized = '#' + raw;
    else normalized = `#Works_${raw}`;

    const m = normalized.match(/^#Works_([A-Za-z0-9_]+)$/);
    if (!m) return null;
    return `#Works_${m[1]}`;
  }

  /**
   * DB名（Primary / Secondary / PrimaryDealer など）が安全なトークンかを判定
   * @param {any} dbName
   * @returns {boolean}
   */
  static isValidDbName(dbName) {
    if (!dbName) return false;
    const norm = String(dbName).trim().replace(/^#?DB_/i, '').replace(/^[#]/, '');
    return DataUtils.isSafeToken(norm);
  }

  /**
   * DB名をmeta内のキー形式に正規化
   * @param {string} dbName - データベース名
   * @returns {string} 正規化されたDBキー（例: '#DB_Primary'）
   */
  static normalizeDBKeyForMeta(dbName) {
    const norm = (dbName || '').replace(/^#?DB_/i, '');
    return `#DB_${DataUtils.capitalize(norm)}`;
  }

  /**
   * 真偽値文字列をboolean値に変換
   * @param {any} v - 変換する値
   * @returns {boolean} 変換されたboolean値
   */
  static truthy(v) {
    if (!v) return false;
    const s = String(v).toLowerCase();
    return s === '1' || s === 'true' || s === 'yes' || s === 'on';
  }

  /**
   * オブジェクトかどうかを判定（配列は除く）
   * @param {any} x - 判定する値
   * @returns {boolean} オブジェクトの場合はtrue
   */
  static isObject(x) {
    return x && typeof x === 'object' && !Array.isArray(x);
  }

  /**
   * ランク値を正規化（空白を除去、記号は保持）
   * @param {any} v - 正規化するランク値
   * @returns {string|null} 正規化されたランク値
   */
  static normRank(v) {
    if (v == null) return null;
    return String(v).trim();
  }

  /**
   * 値を配列に変換（既に配列の場合はそのまま）
   * @param {any} v - 変換する値
   * @returns {Array} 配列形式の値
   */
  static toArray(v) {
    return Array.isArray(v) ? v : (v == null ? [] : [v]);
  }

  /**
   * オブジェクトのパスから値を取得
   * @param {Object} obj - 取得元オブジェクト
   * @param {string} path - パス（ドット区切り）
   * @returns {any} 取得された値
   */
  static getByPath(obj, path) {
    if (!path) return undefined;
    const parts = String(path).split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p];
      else return undefined;
    }
    return cur;
  }

  /**
   * 深いマージ処理（再帰的にオブジェクトをマージ）
   * @param {any} a - マージ対象A
   * @param {any} b - マージ対象B
   * @returns {any} マージ結果
   */
  static deepMerge(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
    if (DataUtils.isObject(a) && DataUtils.isObject(b)) {
      const out = { ...a };
      for (const [k, v] of Object.entries(b)) {
        if (k in out) out[k] = DataUtils.deepMerge(out[k], v);
        else out[k] = v;
      }
      return out;
    }
    return b ?? a;
  }
}

/**
 * 検索・フィルタリングクラス
 * レコード検索とクエリ処理を担当
 */
class SearchEngine {
  /**
   * 単純なクエリ（フィールド=値）のAND条件でレコードを抽出
   * @param {Array} records - 検索対象レコード配列
   * @param {Array} queries - クエリ配列 [{ hashTag, key }]
   * @returns {Array} 条件に一致するレコード配列
   */
  static searchRecords(records, queries) {
    return records.filter(rec => {
      return queries.every(q => {
        const val = DataUtils.getByPath(rec, q.hashTag);
        if (val == null) return false;

        // 配列の場合はany match
        if (Array.isArray(val)) {
          return val.some(it => {
            if (it == null) return false;
            if (typeof it === 'string' || typeof it === 'number' || typeof it === 'boolean') {
              return String(it) === String(q.key);
            }
            if (typeof it === 'object') {
              const inner = it[q.hashTag];
              if (inner != null) return String(inner) === String(q.key);
              return String(it) === String(q.key);
            }
            return false;
          });
        }

        // オブジェクトの場合は同名フィールドを優先
        if (typeof val === 'object') {
          const inner = val[q.hashTag];
          if (inner != null) return String(inner) === String(q.key);
        }
        return String(val) === String(q.key);
      });
    });
  }
}

/**
 * Commons適用処理クラス
 * DB-levelとSecondaries-levelの_Commonsをレコードに適用
 */
class CommonsProcessor {
  /**
   * DBレベルおよびSecondariesレベルの_Commonsをレコードへ非破壊適用
   * @param {Array} records - 処理対象レコード配列
   * @param {Object} workMeta - 作品メタデータ
   * @param {string} dbName - データベース名
   * @returns {Array} Commons適用後のレコード配列
   */
  static applyCommonsToRecords(records, workMeta, dbName) {
    try {
      const dbKey = DataUtils.normalizeDBKeyForMeta(dbName);
      const commons = workMeta?.Databases?.[dbKey]?._Commons;
      // 作品別メタの「二次創作定義」配列
      // - 現行: `_Secondaries`
      // - 旧/別名: `Secondaries`
      const secDefs =
        workMeta?.Databases?.[dbKey]?._Secondaries ??
        workMeta?.Databases?.[dbKey]?.Secondaries;

      if ((!commons && !Array.isArray(secDefs)) || !Array.isArray(records)) return records;

      const CONDITIONAL_PREFIX = '_ListLinkIf_';
      const isConditionalKey = (k) => k.startsWith(CONDITIONAL_PREFIX);
      const getFieldNameFromConditional = (k) => k.substring(CONDITIONAL_PREFIX.length);

      const deepFindFirstByKey = (obj, key) => {
        if (!DataUtils.isObject(obj)) return undefined;
        if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
        for (const v of Object.values(obj)) {
          if (DataUtils.isObject(v)) {
            const found = deepFindFirstByKey(v, key);
            if (typeof found !== 'undefined') return found;
          }
        }
        return undefined;
      };

      const buildDefaultsFromCommons = (cmn, rec) => {
        if (!cmn || !DataUtils.isObject(cmn)) return {};
        const out = {};

        // 1) 単純なcommons
        for (const [k, v] of Object.entries(cmn)) {
          if (k.startsWith('_') || k.startsWith('#')) continue;
          out[k] = v;
        }

        // 2) 条件付きcommons
        for (const [k, arr] of Object.entries(cmn)) {
          if (!isConditionalKey(k) || !Array.isArray(arr)) continue;
          const field = getFieldNameFromConditional(k);
          let curVal = typeof rec[field] !== 'undefined' ? rec[field] : undefined;
          if (typeof curVal === 'undefined' && DataUtils.isObject(rec.Card) && typeof rec.Card[field] !== 'undefined') curVal = rec.Card[field];
          if (typeof curVal === 'undefined' && DataUtils.isObject(rec.SpecType) && typeof rec.SpecType[field] !== 'undefined') curVal = rec.SpecType[field];
          if (typeof curVal === 'undefined') curVal = deepFindFirstByKey(rec, field);
          if (typeof curVal === 'undefined' || curVal === null) continue;
          const match = arr.find(it => DataUtils.isObject(it) && Object.prototype.hasOwnProperty.call(it, field) && String(it[field]) === String(curVal));
          if (!match) continue;
          for (const [ik, iv] of Object.entries(match)) {
            if (ik === field || ik.startsWith('_') || ik.startsWith('#')) continue;
            out[ik] = iv;
          }
        }
        return out;
      };

      // _Commons の既定値を適用する際の「空値」判定
      // - undefined だけでなく null/空文字/空配列/空オブジェクトも未設定扱いにする
      // - { hideText: '...' } は意図的マスクなので空扱いしない
      const isEmptyForCommons = (v) => {
        if (v === null || typeof v === 'undefined') return true;
        if (v === '') return true;
        if (Array.isArray(v)) return v.length === 0;
        if (DataUtils.isObject(v)) {
          if (typeof v.hideText === 'string' && v.hideText) return false;
          return Object.keys(v).length === 0;
        }
        return false;
      };

      const findSecondaryCommons = (rec) => {
        if (!Array.isArray(secDefs)) return null;

        const normStr = (v) => (v === null || typeof v === 'undefined') ? '' : String(v);
        const getFirst = (obj, keys) => {
          for (const k of keys) {
            if (!k) continue;
            if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
          }
          return undefined;
        };
        const getRec = (paths) => {
          for (const p of paths) {
            const v = DataUtils.getByPath(rec, p);
            if (v !== null && typeof v !== 'undefined') return v;
          }
          return undefined;
        };

        // sec_SeriesTitle を主キーとして扱い、追加条件（Category/DesignedBy）があれば優先
        const criteriaDefs = [
          {
            primary: true,
            defKeys: ['sec_SeriesTitle', 'SecondarySeriesTitle', 'SecondarySeriesTitle_EN'],
            recPaths: ['sec_SeriesTitle', 'SecondarySeriesTitle']
          },
          {
            primary: false,
            defKeys: ['sec_Category', 'SecondaryCategory'],
            recPaths: ['sec_Category', 'SecondaryCategory']
          },
          {
            primary: false,
            defKeys: ['sec_DesignedBy', 'SecondaryDesignedBy'],
            recPaths: ['sec_DesignedBy', 'SecondaryDesignedBy']
          }
        ];

        const hasSpecifiedSecondaryCondition = (def) => criteriaDefs.some((c) => {
          const defVal = getFirst(def, c.defKeys);
          return !(defVal === null || typeof defVal === 'undefined' || normStr(defVal).trim() === '');
        });

        let defaultSecondaryDef = null;
        let bestSecondaryDef = null;
        let bestScore = -1;

        for (const def of secDefs) {
          if (!DataUtils.isObject(def) || !DataUtils.isObject(def._Commons)) continue;

          if (!hasSpecifiedSecondaryCondition(def)) {
            if (defaultSecondaryDef === null) defaultSecondaryDef = def;
            continue;
          }

          // primary（sec_SeriesTitle）を指定していない定義は、
          // sec_Category/sec_DesignedBy 等の指定がある場合に「必須条件」として扱う。
          // これにより、レコード側に sec_Category が無いのに
          // `sec_Category:'リクエストナンバー'` のような定義が誤適用されるのを防ぐ。
          const hasPrimaryCondition = (() => {
            const c = criteriaDefs.find(x => x.primary);
            if (!c) return false;
            const defVal = getFirst(def, c.defKeys);
            if (defVal === null || typeof defVal === 'undefined') return false;
            return normStr(defVal).trim() !== '';
          })();

          let score = 0;
          let ok = true;

          for (const c of criteriaDefs) {
            const defVal = getFirst(def, c.defKeys);
            // null/undefined/空文字は「条件なし」とみなす（ワイルドカード）
            if (defVal === null || typeof defVal === 'undefined' || normStr(defVal).trim() === '') continue;

            const recVal = getRec(c.recPaths);

            // 主キー（sec_SeriesTitle）は必須一致。
            // 追加条件（Category/DesignedBy）は「レコード側に値がある場合のみ」一致判定を行い、
            // 値がない場合は絞り込みに使わない（=シリーズだけで適用できる）。
            if (c.primary) {
              if (normStr(recVal) !== normStr(defVal)) {
                ok = false;
                break;
              }
              score += 10;
              continue;
            }

            // primary がある場合は「レコード側に値がある場合のみ」追加条件として絞り込む。
            // primary が無い場合は、追加条件が実質 primary になるため必須一致。
            const recEmpty = recVal === null || typeof recVal === 'undefined' || normStr(recVal).trim() === '';
            if (hasPrimaryCondition) {
              if (recEmpty) continue;
              if (normStr(recVal) !== normStr(defVal)) {
                ok = false;
                break;
              }
              score += 1;
              continue;
            }

            if (recEmpty) {
              ok = false;
              break;
            }
            if (normStr(recVal) !== normStr(defVal)) {
              ok = false;
              break;
            }
            score += 1;
          }

          if (!ok) continue;
          if (score > bestScore) {
            bestScore = score;
            bestSecondaryDef = def;
          }
        }

        return bestSecondaryDef || defaultSecondaryDef;
      };

      return records.map(rec => {
        if (!DataUtils.isObject(rec)) return rec;
        const dbDefaults = buildDefaultsFromCommons(commons, rec);
        const matchedSecondaryDef = findSecondaryCommons(rec);
        const secDefaults = buildDefaultsFromCommons(matchedSecondaryDef?._Commons || null, rec);
        const defaults = { ...dbDefaults, ...secDefaults }; // sec > db
        for (const [k, v] of Object.entries(defaults)) {
          if (k.startsWith('#')) continue;
          if (typeof rec[k] === 'undefined' || isEmptyForCommons(rec[k])) rec[k] = v; // レコード入力が最優先
        }

        // sec_SeriesTitle で選ばれた meta 定義から、二次創作補助メタを空欄時のみ補完する。
        // これにより Secondary DB 側で sec_SeriesTitle だけを持つレコードでも、
        // sec_Category / sec_DesignedBy を UI/API で一貫して扱える。
        ['sec_Category', 'sec_DesignedBy'].forEach((key) => {
          const metaValue = matchedSecondaryDef?.[key];
          if (typeof metaValue === 'undefined' || metaValue === null || String(metaValue).trim() === '') return;
          if (typeof rec[key] === 'undefined' || isEmptyForCommons(rec[key])) {
            rec[key] = metaValue;
          }
        });
        return rec;
      });
    } catch (_) {
      return records;
    }
  }
}

/**
 * Service Worker基本クラス
 * 基本的なService Worker機能とイベントハンドリングを提供
 */
class ServiceWorkerBase {
  /**
   * @param {Array<string>} apiPrefixes - インターセプトするAPIプレフィックス配列
   */
  constructor(apiPrefixes) {
    this.apiPrefixes = apiPrefixes;
    this.setupEventListeners();
  }

  /**
   * Service Workerイベントリスナーを設定
   */
  setupEventListeners() {
    self.addEventListener('install', (e) => {
      e.waitUntil(Promise.all([
        self.skipWaiting(),
        this.precache()
      ]));
    });

    self.addEventListener('activate', (e) => {
      e.waitUntil(self.clients.claim());
    });

    // ページ側で controller が付かない場合の救済
    // - ready は解決している（SWはactive）ものの controller が null のまま、というケースが稀に起きる
    // - ページ側からメッセージを送り、clients.claim() を再実行して制御を試みる
    self.addEventListener('message', (event) => {
      try {
        const data = event?.data;
        const type = data && typeof data === 'object' ? data.type : null;
        if (type !== '100bl.claimClients') return;
        event.waitUntil((async () => {
          await self.clients.claim();
        })());
      } catch {
        // no-op
      }
    });

    self.addEventListener('fetch', (event) => {
      const url = new URL(event.request.url);
      // 同一オリジンのみ処理
      if (url.origin !== self.location.origin) return;

      const matchedPrefix = this.apiPrefixes.find(p => url.pathname.startsWith(p));
      if (matchedPrefix) {
        console.log('🔄 SW がリクエストをインターセプト:', url.pathname, 'プレフィックス:', matchedPrefix);
        event.respondWith(this.handleApiRequest(url, matchedPrefix).catch(err => {
          console.error('❌ SW API リクエストが失敗:', url.pathname, err);
          return this.createErrorResponse(err, url.pathname, event.request.method);
        }));
        return;
      }

      // API以外でも、画像リソースはケースセンシティブ問題の救済を試みる
      if (this.shouldHandleImageFallback(event.request, url)) {
        event.respondWith(this.handleImageRequestWithFallback(event.request, url));
      }
    });
  }

  /**
   * 画像フォールバック処理の対象かどうかを判定
   * @param {Request} request - Fetch リクエスト
   * @param {URL} url - リクエストURL
   * @returns {boolean} 対象の場合は true
   */
  shouldHandleImageFallback(request, url) {
    try {
      if (!request || request.method !== 'GET') return false;
      // data 配下の Images 参照に限定
      if (!url.pathname.includes('/data/') || !url.pathname.includes('/Images/')) return false;
      // 画像リクエストらしさ（destination が取れない環境もあるため拡張子でも判定）
      if (request.destination === 'image') return true;
      return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  /**
   * 画像リクエストを通常取得し、失敗時に代替パスでリトライ
   * @param {Request} request - 元のリクエスト
   * @param {URL} url - 元のURL
   * @returns {Promise<Response>} 画像レスポンス
   */
  async handleImageRequestWithFallback(request, url) {
    // まずは通常通り
    let res;
    try {
      res = await fetch(request);
      if (res && res.ok) return res;
    } catch {
      // 続けてフォールバック候補を試す
    }

    const candidates = this.buildImageFallbackUrls(url);
    for (const candidateUrl of candidates) {
      try {
        const nextReq = new Request(candidateUrl.toString(), request);
        const nextRes = await fetch(nextReq);
        if (nextRes && nextRes.ok) return nextRes;
      } catch {
        // 次の候補へ
      }
    }

    // すべて失敗したら、最初のレスポンス（404等）を返す
    return res || fetch(request);
  }

  /**
   * 画像の代替URL候補を生成
   * - 既知ディレクトリの大小文字揺れ補正
   * - 拡張子の大小文字(.png/.PNG など)補正
   * @param {URL} url - 元のURL
   * @returns {URL[]} 代替URL配列（重複除去済み）
   */
  buildImageFallbackUrls(url) {
    const out = [];
    const seen = new Set();
    const push = (u) => {
      const s = u.toString();
      if (seen.has(s)) return;
      seen.add(s);
      out.push(u);
    };

    const pathname = url.pathname;

    // 1) 拡張子の大小文字リトライ
    const extMatch = pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i);
    if (extMatch) {
      const ext = extMatch[0];
      const base = pathname.slice(0, -ext.length);
      const variants = [ext.toLowerCase(), ext.toUpperCase()];
      for (const v of variants) {
        if (v !== ext) {
          const u = new URL(url.toString());
          u.pathname = `${base}${v}`;
          push(u);
        }
      }
    }

    // 2) 既知ディレクトリのケース正規化（ファイル名は変更しない）
    const CANON_DIR_SEGMENTS = [
      'arts', 'concept', 'conceptAlt', 'design', 'designAlt', 'cardDesign', 'catalog', 'corefolder',
      'General',
      // よく使うサブディレクトリ
      'autumnMoon', 'corefolders', 'humanoids', 'newYear', 'chattingArt',
      // 作品によってはここが存在
      'cardDesign', 'conceptAlt', 'concept-figure', 'conceptAlt', 'designAlt', 'concept', 'design'
    ];

    const parts = pathname.split('/').filter(Boolean);
    const imagesIdx = parts.findIndex(p => p === 'Images');
    if (imagesIdx >= 0) {
      const outParts = parts.map((seg, idx) => {
        // Images 以降の「ディレクトリ部分」だけを正規化する（末尾はファイル名扱い）
        if (idx <= imagesIdx) return seg;
        if (idx === parts.length - 1) return seg;

        const segLower = seg.toLowerCase();
        const canon = CANON_DIR_SEGMENTS.find(c => c.toLowerCase() === segLower);
        return canon || seg;
      });

      const normalizedPath = '/' + outParts.join('/');
      if (normalizedPath !== pathname) {
        const u = new URL(url.toString());
        u.pathname = normalizedPath;
        push(u);

        // 併せて拡張子大小文字も試す
        const m2 = normalizedPath.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i);
        if (m2) {
          const ext = m2[0];
          const base = normalizedPath.slice(0, -ext.length);
          const variants = [ext.toLowerCase(), ext.toUpperCase()];
          for (const v of variants) {
            if (v !== ext) {
              const u2 = new URL(url.toString());
              u2.pathname = `${base}${v}`;
              push(u2);
            }
          }
        }
      }
    }

    return out;
  }

  /**
   * エラーレスポンスを生成
   * @param {Error} err - エラーオブジェクト
   * @param {string} pathname - リクエストパス
   * @param {string} method - HTTPメソッド
   * @returns {Response} エラーレスポンス
   */
  createErrorResponse(err, pathname, method) {
    const errorResponse = {
      error: String(err),
      message: err.message || 'Unknown error',
      timestamp: new Date().toISOString(),
      path: pathname,
      method: method,
      requestId: Math.random().toString(36).substring(7)
    };

    // 特定のエラータイプに対するガイダンス
    if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
      errorResponse.type = 'NETWORK_ERROR';
      errorResponse.suggestion = 'Check if the requested file exists in the repository';
    } else if (err.message.includes('404')) {
      errorResponse.type = 'NOT_FOUND';
      errorResponse.suggestion = 'Verify the file path and database structure';
    } else if (err.message.includes('JSON')) {
      errorResponse.type = 'PARSE_ERROR';
      errorResponse.suggestion = 'Check JSON syntax in the requested file';
    } else {
      errorResponse.type = 'UNKNOWN_ERROR';
    }

    return ResponseUtils.jsonResponse(errorResponse, 500);
  }

  /**
   * 事前キャッシュ処理（サブクラスでオーバーライド）
   * @returns {Promise<void>}
   */
  async precache() {
    // 基本実装は空
  }

  /**
   * APIリクエスト処理（サブクラスで実装）
   * @param {URL} url - リクエストURL
   * @param {string} apiPrefix - マッチしたAPIプレフィックス
   * @returns {Promise<Response>} APIレスポンス
   */
  async handleApiRequest(url, apiPrefix) {
    throw new Error('handleApiRequest must be implemented by subclass');
  }
}

/**
 * APIエンドポイントハンドラークラス
 * 共通のAPIエンドポイント実装を提供
 */
class ApiEndpointHandlers {
  constructor(dataFetcher) {
    this.dataFetcher = dataFetcher;
  }

  /**
   * db_meta.json と db_type.json の `$VarsDef` を、表示辞書として扱いやすい形にマージ
   * - 既存の meta 構造は維持しつつ、type 側の `$EnumDef_*` / `#List_*` を General.$VarsDef へ合流する
   * - Decave のように db_type.json にだけ存在する enum 辞書も API から参照可能にする
   * @param {Object|null} metaSource
   * @param {Object|null} typeSource
   * @returns {Object}
   */
  mergeMetaAndTypeVars(metaSource, typeSource) {
    const meta = (metaSource && typeof metaSource === 'object' && !Array.isArray(metaSource)) ? metaSource : {};
    const type = (typeSource && typeof typeSource === 'object' && !Array.isArray(typeSource)) ? typeSource : {};

    const metaGeneral = (meta.General && typeof meta.General === 'object' && !Array.isArray(meta.General)) ? meta.General : {};
    const metaVars = (metaGeneral.$VarsDef && typeof metaGeneral.$VarsDef === 'object' && !Array.isArray(metaGeneral.$VarsDef))
      ? metaGeneral.$VarsDef
      : {};
    const typeVars = (type.$VarsDef && typeof type.$VarsDef === 'object' && !Array.isArray(type.$VarsDef))
      ? type.$VarsDef
      : {};

    if (Object.keys(typeVars).length === 0) return meta;

    return {
      ...meta,
      General: {
        ...metaGeneral,
        $VarsDef: DataUtils.deepMerge(metaVars, typeVars)
      }
    };
  }

  /**
   * v1/meta エンドポイント - グローバルメタデータ
   * @returns {Promise<Response>}
   */
  async handleMetaEndpoint() {
    const globalMeta = await this.dataFetcher.readGlobalMeta();
    return ResponseUtils.jsonResponse({
      name: 'meta',
      time: new Date().toISOString(),
      meta: globalMeta
    });
  }

  /**
   * v1/typedef/global エンドポイント - グローバルタイプ定義
   * @returns {Promise<Response>}
   */
  async handleTypedefGlobalEndpoint() {
    const globalType = await this.dataFetcher.readGlobalType();
    return ResponseUtils.jsonResponse(globalType || {});
  }

  /**
   * v1/deftype/global エンドポイント - グローバル定義タイプ
   * @returns {Promise<Response>}
   */
  async handleDeftypeGlobalEndpoint() {
    // NOTE: 「deftype」は db_meta.json 単体ではなく、
    // db_type.json 側の `$VarsDef` も併合した「表示辞書」として返す。
    // これにより、Decave のように type 側だけへ追加された enum 定義も
    // UI/API の両方で同じ経路から解決できる。
    const [globalMeta, globalType] = await Promise.all([
      this.dataFetcher.readGlobalMeta(),
      this.dataFetcher.readGlobalType()
    ]);
    const merged = this.mergeMetaAndTypeVars(globalMeta, globalType);
    return ResponseUtils.jsonResponse(merged || {});
  }

  /**
   * v1/works/{work}/meta エンドポイント - 作品メタデータ
   * @param {string} workIdParam - 作品ID
   * @returns {Promise<Response>}
   */
  async handleWorkMetaEndpoint(workIdParam) {
    const workId = DataUtils.toWorkKey(workIdParam);
    if (!workId) return ResponseUtils.badRequest('Invalid works parameter');
    const [workMeta, workType] = await Promise.all([
      this.dataFetcher.readWorkMeta(workId),
      this.dataFetcher.readWorkType(workId)
    ]);
    const mergedMeta = this.mergeMetaAndTypeVars(workMeta, workType);
    return ResponseUtils.jsonResponse({
      work: workId,
      meta: mergedMeta
    });
  }

  /**
   * v1/works/{work}/typedef エンドポイント - 作品タイプ定義
   * @param {string} workIdParam - 作品ID
   * @returns {Promise<Response>}
   */
  async handleWorkTypedefEndpoint(workIdParam) {
    const workId = DataUtils.toWorkKey(workIdParam);
    if (!workId) return ResponseUtils.badRequest('Invalid works parameter');
    const workType = await this.dataFetcher.readWorkType(workId);
    return ResponseUtils.jsonResponse({
      work: workId,
      typedef: workType
    });
  }

  /**
   * 共通エンドポイントルーティング
   * @param {Array<string>} seg - パスセグメント
   * @param {URL} url - リクエストURL
   * @returns {Promise<Response|null>} レスポンスまたはnull（未処理の場合）
   */
  async routeCommonEndpoints(seg, url) {
    // v1/meta - グローバルメタデータ
    if (seg.length === 1 && seg[0] === 'meta') {
      return this.handleMetaEndpoint();
    }

    // v1/typedef/global - グローバルタイプ定義
    if (seg.length === 2 && seg[0] === 'typedef' && seg[1] === 'global') {
      return this.handleTypedefGlobalEndpoint();
    }

    // v1/deftype/global - グローバル定義タイプ
    if (seg.length === 2 && seg[0] === 'deftype' && seg[1] === 'global') {
      return this.handleDeftypeGlobalEndpoint();
    }

    // v1/works/{work}/meta - 作品メタデータ
    if (seg.length === 3 && seg[0] === 'works' && seg[2] === 'meta') {
      return this.handleWorkMetaEndpoint(seg[1]);
    }

    // v1/works/{work}/typedef - 作品タイプ定義
    if (seg.length === 3 && seg[0] === 'works' && seg[2] === 'typedef') {
      return this.handleWorkTypedefEndpoint(seg[1]);
    }

    return null; // 未処理
  }
}

/**
 * 標準エンドポイントハンドラークラス
 * 各Service Worker間で重複している標準的なエンドポイント処理を提供
 */
class StandardEndpointHandlers {
  constructor(dataFetcher, enrichmentProcessor, referenceResolver, scope = '') {
    this.dataFetcher = dataFetcher;
    this.enrichmentProcessor = enrichmentProcessor;
    this.referenceResolver = referenceResolver;
    this.scope = scope;
  }

  /**
   * DB キーから既定の表示名を生成
   * - db_meta.json に DB_Label が無い旧データでも UI が破綻しないようにする
   * @param {string} dbKey
   * @returns {{ DB_Label: string, DB_Label_EN: string }}
   */
  buildDefaultDatabaseCatalogLabels(dbKey) {
    const normalized = String(dbKey || '').trim();
    const preset = {
      Primary: { DB_Label: '一次創作', DB_Label_EN: 'Primary' },
      SemiPrimary: { DB_Label: '準一次創作', DB_Label_EN: 'Semi-Primary' },
      Secondary: { DB_Label: '二次創作', DB_Label_EN: 'Secondary' },
      SelfSecondary: { DB_Label: 'セルフ二次創作', DB_Label_EN: 'Self-Secondary' },
      UnprocessedSecondary: { DB_Label: '未着工の二次創作', DB_Label_EN: 'Unprocessed Secondary' },
      PrimaryDealer: { DB_Label: '一次創作(アルカナ保有者)', DB_Label_EN: 'Primary(Arcana Holders)' },
      PrimaryMobs: { DB_Label: '一次創作(モブ種族)', DB_Label_EN: 'Primary(Mobs)' },
      Proxies: { DB_Label: '代理', DB_Label_EN: 'Proxies' }
    };

    if (preset[normalized]) return preset[normalized];

    const spaced = normalized.replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
    return {
      DB_Label: spaced || normalized,
      DB_Label_EN: spaced || normalized
    };
  }

  /**
   * global db_meta.json の CreationWorks から、作品カタログ向け情報を抽出
   * @param {string} workId
   * @param {Object} globalMeta
   * @returns {Object}
   */
  buildWorkCatalogEntry(workId, globalMeta) {
    const info = globalMeta?.CreationWorks?.[workId] ?? {};
    return {
      key: workId,
      Title: typeof info?.Title === 'string' ? info.Title : '',
      Title_EN: typeof info?.Title_EN === 'string' ? info.Title_EN : '',
      Works_Summary: typeof info?.Works_Summary === 'string' ? info.Works_Summary : '',
      OldTitles: Array.isArray(info?.OldTitles) ? info.OldTitles : []
    };
  }

  /**
   * 作品別 db_meta.json の Databases から、DB カタログ向け情報を付与
   * @param {Array} databases
   * @param {Object|null} workMeta
   * @returns {Array}
   */
  decorateDatabaseCatalogEntries(databases, workMeta) {
    const items = Array.isArray(databases) ? databases : [];
    return items.map((db) => {
      const dbKey = DataUtils.normalizeDBKeyForMeta(db?.key);
      const dbMeta = workMeta?.Databases?.[dbKey] ?? null;
      const fallbackLabels = this.buildDefaultDatabaseCatalogLabels(db?.key);
      return {
        ...db,
        metaKey: dbKey,
        DB_Label: typeof dbMeta?.DB_Label === 'string' && dbMeta.DB_Label.trim()
          ? dbMeta.DB_Label
          : fallbackLabels.DB_Label,
        DB_Label_EN: typeof dbMeta?.DB_Label_EN === 'string' && dbMeta.DB_Label_EN.trim()
          ? dbMeta.DB_Label_EN
          : fallbackLabels.DB_Label_EN,
        DB_Summary: typeof dbMeta?.DB_Summary === 'string' ? dbMeta.DB_Summary : '',
        StoryEra: dbMeta?.StoryEra ?? null,
        SecondarySummary: typeof dbMeta?.SecondarySummary === 'string' ? dbMeta.SecondarySummary : ''
      };
    });
  }

  /**
   * index エンドポイント - API インデックス情報
   * @returns {Promise<Response>}
   */
  async handleIndexEndpoint() {
    const globalMeta = await this.dataFetcher.readGlobalMeta();
    const response = {
      name: `100BeautiesLab Creations DB ${this.scope ? this.scope + ' ' : ''}API`,
      version: 1,
      time: new Date().toISOString(),
      works: Object.keys(globalMeta.CreationWorks || {}).map((workId) => this.buildWorkCatalogEntry(workId, globalMeta))
    };

    if (this.scope) {
      response.scope = this.scope.toLowerCase();
    }

    return ResponseUtils.jsonResponse(response);
  }

  /**
   * works エンドポイント - 作品一覧
   * @returns {Promise<Response>}
   */
  async handleWorksListEndpoint() {
    const globalMeta = await this.dataFetcher.readGlobalMeta();
    const works = Object.keys(globalMeta.CreationWorks || {}).map((workId) => this.buildWorkCatalogEntry(workId, globalMeta));
    return ResponseUtils.jsonResponse(works);
  }

  /**
   * bootstrap エンドポイント - ブートストラップ情報
   * @param {URL} url - リクエストURL
   * @param {boolean} defaultIncludeRecords - デフォルトでレコードを含めるか
   * @param {boolean} defaultEnrich - デフォルトで充実化を行うか
   * @returns {Promise<Response>}
   */
  async handleBootstrapEndpoint(url, defaultIncludeRecords = false, defaultEnrich = false) {
    const includeRecordsParam = url.searchParams.get('includeRecords');
    const includeRecords = includeRecordsParam == null ? defaultIncludeRecords : DataUtils.truthy(includeRecordsParam);
    const enrichParam = url.searchParams.get('enrich');
    const enrich = enrichParam == null ? defaultEnrich : DataUtils.truthy(enrichParam);

    const globalMeta = await this.dataFetcher.readGlobalMeta();
    const works = Object.keys(globalMeta.CreationWorks || {});
    const out = [];

    for (const workId of works) {
      let databases = await this.dataFetcher.listWorkDBs(workId);
      const item = {
        work: workId,
        workInfo: this.buildWorkCatalogEntry(workId, globalMeta),
        databases
      };

      // 作品別 db_meta.json は未整備の作品もあるため、bootstrap では
      // 「メタが無くても DB 一覧とレコード収集は継続する」方針を取る。
      // ここで workMeta を null 許容にしておくことで、_Commons 適用だけを安全にスキップできる。
      let workMeta = null;
      try {
        workMeta = await this.dataFetcher.readWorkMeta(workId);
      } catch {
        workMeta = null;
      }

      if (workMeta) {
        databases = this.decorateDatabaseCatalogEntries(databases, workMeta);
        item.databases = databases;
      }

      if (includeRecords) {
        item.data = {};
        for (const db of databases) {
          try {
            let records = await this.dataFetcher.readDB(workId, db.key);
            if (workMeta) {
              records = CommonsProcessor.applyCommonsToRecords(records, workMeta, db.key);
            }

            if (enrich && this.enrichmentProcessor && this.referenceResolver) {
              const resolveCache = new Map();
              records = await this.referenceResolver.resolveAllInAny(records, resolveCache);
              records = await this.enrichmentProcessor.enrichRecords(records, workId, db.key);
            }

            item.data[db.key] = records;
          } catch (e) {
            item.data[db.key] = { error: String(e) };
          }
        }
      }
      out.push(item);
    }

    const response = {
      name: 'bootstrap',
      time: new Date().toISOString(),
      works: out
    };

    if (this.scope) {
      response.scope = this.scope.toLowerCase();
    }

    if (enrich) {
      response.enriched = enrich;
    }

    return ResponseUtils.jsonResponse(response);
  }

  /**
   * works/{work} エンドポイント - 作品情報
   * @param {string} workIdParam - 作品ID
   * @returns {Promise<Response>}
   */
  async handleWorkEndpoint(workIdParam) {
    const workId = DataUtils.toWorkKey(workIdParam);
    if (!workId) return ResponseUtils.badRequest('Invalid works parameter');
    try {
      const [globalMeta, workMeta] = await Promise.all([
        this.dataFetcher.readGlobalMeta(),
        this.dataFetcher.readWorkMeta(workId)
      ]);
      return ResponseUtils.jsonResponse({
        work: workId,
        workInfo: this.buildWorkCatalogEntry(workId, globalMeta),
        meta: workMeta
      });
    } catch {
      // 作品メタが欠損していても、DB自体は存在しうる（フェーズ2: DB種別多様化への耐性）
      return ResponseUtils.notFound('Work metadata not found');
    }
  }

  /**
   * works/{work}/db エンドポイント - 作品のデータベース一覧
   * @param {string} workIdParam - 作品ID
   * @returns {Promise<Response>}
   */
  async handleWorkDbListEndpoint(workIdParam) {
    const workId = DataUtils.toWorkKey(workIdParam);
    if (!workId) return ResponseUtils.badRequest('Invalid works parameter');
    let databases = await this.dataFetcher.listWorkDBs(workId);
    try {
      const workMeta = await this.dataFetcher.readWorkMeta(workId);
      databases = this.decorateDatabaseCatalogEntries(databases, workMeta);
    } catch {
      // 作品別 meta が無い場合は bare な DB 一覧だけ返す
    }
    return ResponseUtils.jsonResponse({ work: workId, databases });
  }

  /**
   * works/{work}/db/{dbName} エンドポイント - データベース取得
   * @param {string} workIdParam - 作品ID
   * @param {string} dbName - データベース名
   * @param {boolean} resolve - 参照解決フラグ
   * @param {boolean} debug - デバッグフラグ
   * @param {boolean} enrich - 充実化フラグ
   * @returns {Promise<Response>}
   */
  async handleDbEndpoint(workIdParam, dbName, resolve, debug, enrich = false) {
    const workId = DataUtils.toWorkKey(workIdParam);
    if (!workId) return ResponseUtils.badRequest('Invalid works parameter');
    if (!DataUtils.isValidDbName(dbName)) return ResponseUtils.badRequest('Invalid db parameter');

    let records;
    try {
      records = await this.dataFetcher.readDB(workId, dbName);
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      if (msg.includes('Invalid')) return ResponseUtils.badRequest('Invalid works/db parameter');
      return ResponseUtils.notFound('Database not found');
    }

    records = filterPublicRecords(records);

    // 作品別 db_meta.json は追加価値レイヤーとして扱い、欠損しても 500 にしない。
    // その場合は _Commons / _Secondaries だけをスキップして、DB 本体の取得は継続する。
    try {
      const workMeta = await this.dataFetcher.readWorkMeta(workId);
      records = CommonsProcessor.applyCommonsToRecords(records, workMeta, dbName);
    } catch {
      // メタ欠損時は _Commons 適用をスキップ
    }

    // 参照解決
    let resolveCache = new Map();
    if (resolve && this.referenceResolver) {
      records = await this.referenceResolver.resolveAllInAny(records, resolveCache);
    }

    // 充実化処理
    if (enrich && this.enrichmentProcessor) {
      records = await this.enrichmentProcessor.enrichRecords(records, workId, dbName);
    }

    const response = {
      work: workId,
      db: dbName,
      records: records,
      resolved: resolve
    };

    if (enrich) {
      response.enriched = true;
    }

    if (debug) {
      response.debug = {
        recordCount: records.length,
        commonsApplied: true,
        resolveCache: resolve ? resolveCache.size : 0
      };
    }

    return ResponseUtils.jsonResponse(response);
  }

  /**
   * search エンドポイント - 検索
   * @param {URL} url - リクエストURL
   * @param {boolean} resolve - 参照解決フラグ
   * @param {boolean} debug - デバッグフラグ
   * @param {boolean} enrich - 充実化フラグ
   * @returns {Promise<Response>}
   */
  async handleSearchEndpoint(url, resolve, debug, enrich = false) {
    const params = url.searchParams;
    const workId = DataUtils.toWorkKey(params.get('works'));
    const dbName = params.get('db');
    const hashTag = params.getAll('hashTag');
    const key = params.getAll('key');

    if (!workId || !dbName || hashTag.length === 0 || key.length === 0 || hashTag.length !== key.length) {
      return ResponseUtils.badRequest('Query must include works, db, and pairs of hashTag & key');
    }

    let records = await this.dataFetcher.readDB(workId, dbName);
    records = filterPublicRecords(records);
    try {
      const workMeta = await this.dataFetcher.readWorkMeta(workId);
      records = CommonsProcessor.applyCommonsToRecords(records, workMeta, dbName);
    } catch {
      // メタ欠損時は _Commons 適用をスキップ
    }

    // 検索は hashTag/key の AND 条件を基本とし、比較ロジック自体は
    // EnrichmentProcessor.searchRecords() 側へ寄せて typedef 駆動にしている。
    const queries = hashTag.map((h, i) => ({ hashTag: h, key: key[i] }));
    let matched;
    if (this.enrichmentProcessor && typeof this.enrichmentProcessor.searchRecords === 'function') {
      matched = await this.enrichmentProcessor.searchRecords(records, workId, dbName, queries);
    } else {
      matched = SearchEngine.searchRecords(records, queries);
    }

    let resolveCache = new Map();
    if (resolve && this.referenceResolver) {
      matched = await this.referenceResolver.resolveAllInAny(matched, resolveCache);
    }

    // 充実化処理
    if (enrich && this.enrichmentProcessor) {
      matched = await this.enrichmentProcessor.enrichRecords(matched, workId, dbName);
    }

    const response = {
      work: workId,
      db: dbName,
      queries: queries,
      count: matched.length,
      records: matched,
      resolved: resolve
    };

    if (enrich) {
      response.enriched = true;
    }

    if (debug) {
      response.debug = {
        originalRecordCount: records.length,
        matchedCount: matched.length
      };
    }

    return ResponseUtils.jsonResponse(response);
  }

  /**
   * works/{work}/varsdef エンドポイント - 作品変数定義取得
   * @param {string} workIdParam - 作品ID
   * @returns {Promise<Response>}
   */
  async handleWorkVarsdefEndpoint(workIdParam) {
    const workId = DataUtils.toWorkKey(workIdParam);
    const workVars = await this.dataFetcher.readGeneralVarsDefWork(workId);
    const globalVars = await this.dataFetcher.readGeneralVarsDefGlobal();

    const response = {
      work: workId,
      varsdef: {
        global: globalVars,
        work: workVars
      },
      time: new Date().toISOString()
    };

    if (this.scope) {
      response.scope = this.scope.toLowerCase();
    }

    return ResponseUtils.jsonResponse(response);
  }

  /**
   * 高度なエンドポイント（グローバルvarsdef など）のハンドリング
   * @param {Array<string>} seg - パスセグメント
   * @param {URL} url - リクエストURL
   * @returns {Promise<Response|null>} レスポンスまたはnull（未処理の場合）
   */
  async handleAdvancedEndpoints(seg, url) {
    // グローバルvarsdef エンドポイント
    if (seg.length === 1 && seg[0] === 'varsdef') {
      // varsdef は辞書の俯瞰用エンドポイント。
      // typedef 全体ではなく General.$VarsDef 中心の軽量な参照面を返す。
      const globalVars = await this.dataFetcher.readGeneralVarsDefGlobal();
      const response = {
        name: 'varsdef-overview',
        time: new Date().toISOString(),
        global: globalVars
      };

      if (this.scope) {
        response.scope = this.scope.toLowerCase();
      }

      return ResponseUtils.jsonResponse(response);
    }

    return null; // 未処理
  }
}

// エクスポート（Service Worker環境ではグローバルに公開）
if (typeof self !== 'undefined') {
  // Service Worker環境
  self.SWConfig = SWConfig;
  self.ResponseUtils = ResponseUtils;
  self.DataFetcher = DataFetcher;
  self.DataUtils = DataUtils;
  self.SearchEngine = SearchEngine;
  self.CommonsProcessor = CommonsProcessor;
  self.ServiceWorkerBase = ServiceWorkerBase;
  self.ApiEndpointHandlers = ApiEndpointHandlers;
  self.StandardEndpointHandlers = StandardEndpointHandlers;
  self.CACHE_NAME = CACHE_NAME;
  self.WORK_CTX_TTL_MS = WORK_CTX_TTL_MS;
  self.WORK_CTX_CACHE = WORK_CTX_CACHE;
}

console.log('📚 Service Worker 共通ライブラリがロードされました');