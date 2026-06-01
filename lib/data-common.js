/**
 * データ処理共通ライブラリ
 *
 * データベースの参照解決、画像パス生成、エンリッチメント処理など
 * データ操作に関する共通機能を提供します。
 * Service WorkerとフロントエンドJavaScriptの両方で利用可能です。
 *
 * @fileoverview データ処理共通機能ライブラリ
 * @author 100BeautiesLab Creations Database Team
 * @version 1.0.0
 */

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

function getCharacterValueWrapperRegistry() {
  return globalThis?.CharacterValueWrapperRegistry || null;
}

/**
 * 参照解決エンジンクラス
 * データベース間の参照を解決し、関連データを統合
 */
class ReferenceResolver {
  /**
   * @param {Object} dataFetcher - データ取得インスタンス (fetchJSON メソッドを持つ)
   * @param {Object} config - 設定オブジェクト (withRepoBase メソッドを持つ)
   */
  constructor(dataFetcher, config) {
    this.dataFetcher = dataFetcher;
    this.config = config;
  }

  /**
   * 任意のオブジェクト内の全ての参照を解決
   * @param {any} obj - 処理対象オブジェクト
   * @param {Map} resolveCache - 解決キャッシュ
   * @returns {Promise<any>} 参照解決後のオブジェクト
   */
  async resolveAllInAny(obj, resolveCache = new Map()) {
    if (!obj) return obj;

    if (Array.isArray(obj)) {
      const promises = obj.map(item => this.resolveAllInAny(item, resolveCache));
      return Promise.all(promises);
    }

    if (typeof obj === 'object') {
      const result = {};
      const entries = Object.entries(obj);

      for (const [key, value] of entries) {
        if (key.startsWith('#') && typeof value === 'string') {
          // 参照フィールドの解決
          try {
            const resolved = await this.resolveReference(key, value, resolveCache);
            result[key] = resolved;
          } catch (error) {
            console.warn(`参照解決失敗 ${key}=${value}:`, error.message);
            result[key] = value; // 失敗時は元の値を保持
          }
        } else {
          // 通常フィールドの再帰処理
          result[key] = await this.resolveAllInAny(value, resolveCache);
        }
      }
      return result;
    }

    return obj; // プリミティブ値はそのまま返す
  }

  /**
   * 単一の参照を解決
   * @param {string} key - 参照キー
   * @param {string} value - 参照値
   * @param {Map} resolveCache - 解決キャッシュ
   * @returns {Promise<any>} 解決された値
   */
  async resolveReference(key, value, resolveCache = new Map()) {
    const cacheKey = `${key}:${value}`;
    if (resolveCache.has(cacheKey)) {
      return resolveCache.get(cacheKey);
    }

    let resolved = value;

    try {
      if (key === '#Works') {
        resolved = await this.resolveWorksReference(value);
      } else if (key === '#DB') {
        resolved = await this.resolveDBReference(value);
      } else if (key.startsWith('#$image')) {
        resolved = await this.resolveImageReference(key, value);
      } else if (key.startsWith('#')) {
        // その他の参照タイプ（将来の拡張用）
        resolved = await this.resolveGenericReference(key, value);
      }
    } catch (error) {
      console.warn(`参照解決エラー ${cacheKey}:`, error);
      resolved = value; // エラー時は元の値を返す
    }

    resolveCache.set(cacheKey, resolved);
    return resolved;
  }

  /**
   * Works参照の解決
   * @param {string} workId - 作品ID
   * @returns {Promise<Object>} 作品メタデータ
   */
  async resolveWorksReference(workId) {
    const normalizedId = this.normalizeWorkId(workId);
    const metaPath = `/data/${resolveWorkDirName(normalizedId)}/DataBases/db_meta.json`;
    return this.dataFetcher.fetchJSON(metaPath);
  }

  /**
   * DB参照の解決
   * @param {string} dbRef - データベース参照 (format: "WorkId.DBName" or "WorkId.DBName.FieldName=Value")
   * @returns {Promise<Array|Object>} データベース結果
   */
  async resolveDBReference(dbRef) {
    const parts = dbRef.split('.');
    if (parts.length < 2) throw new Error(`Invalid DB reference format: ${dbRef}`);

    const workId = this.normalizeWorkId(parts[0]);
    const dbName = parts[1];

    // データベースファイルを読み込み
    const dbPath = `/data/${resolveWorkDirName(workId)}/DataBases/db_${dbName}.json`;
    const records = await this.dataFetcher.fetchJSON(dbPath);

    if (parts.length === 2) {
      // 全レコードを返す
      return records;
    }

    // フィールド条件がある場合はフィルタリング
    const filterPart = parts.slice(2).join('.');
    const [fieldName, fieldValue] = filterPart.split('=');

    if (fieldValue) {
      return records.filter(record => {
        const value = this.getNestedValue(record, fieldName);
        return String(value) === fieldValue;
      });
    }

    return records;
  }

  /**
   * 画像参照の解決
   * @param {string} key - 画像参照キー
   * @param {string} value - 画像パス
   * @returns {Promise<string>} 解決された画像URL
   */
  async resolveImageReference(key, value) {
    // 既に完全なURLの場合はそのまま返す
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }

    // 相対パスを絶対パスに変換
    const fullPath = this.config.withRepoBase(value);
    return new URL(fullPath, this.config.ORIGIN || location.origin).toString();
  }

  /**
   * 汎用参照の解決（将来の拡張用）
   * @param {string} key - 参照キー
   * @param {string} value - 参照値
   * @returns {Promise<any>} 解決された値
   */
  async resolveGenericReference(key, value) {
    // 現在は未実装、将来的に特殊な参照タイプを追加予定
    return value;
  }

  /**
   * 作品IDを正規化
   * @param {string} workId - 作品ID
   * @returns {string} 正規化された作品ID
   */
  normalizeWorkId(workId) {
    if (!workId) return '';
    if (workId.startsWith('#Works_')) return workId;
    if (workId.startsWith('Works_')) return '#' + workId;
    return `#Works_${workId}`;
  }

  /**
   * ネストされたオブジェクトから値を取得
   * @param {Object} obj - 取得元オブジェクト
   * @param {string} path - パス（ドット区切り）
   * @returns {any} 取得された値
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }
}

/**
 * エンリッチメント処理クラス
 * データベースの構造化とインデックス生成を担当
 */
class EnrichmentProcessor {
  /**
   * @param {Object} dataFetcher - データ取得インスタンス
   * @param {Object} config - 設定オブジェクト
   */
  constructor(dataFetcher, config) {
    this.dataFetcher = dataFetcher;
    this.config = config;
    this.resolver = new ReferenceResolver(dataFetcher, config);

    // SW側で work ごとの typedef/varsdef をキャッシュし、enrich/search の挙動をスキーマ追従にする
    this._workCtxCache = new Map();
  }

  /**
   * typedef / varsdef を work ごとにマージし、enrichment/search 用のコンテキストを構築
   * @param {string} workId - 作品ID
   * @returns {Promise<{ mergedVars: Object, defTypeMerged: Array, indices: Object }>} work context
   */
  async getWorkContext(workId) {
    const now = Date.now();
    const cache = (typeof WORK_CTX_CACHE !== 'undefined' && WORK_CTX_CACHE && typeof WORK_CTX_CACHE.get === 'function')
      ? WORK_CTX_CACHE
      : this._workCtxCache;

    const hit = cache.get(workId);
    if (hit && (now - hit.t) < (typeof WORK_CTX_TTL_MS === 'number' ? WORK_CTX_TTL_MS : 15 * 1000)) {
      return hit;
    }

    // VarsDef は db_meta.json だけでは完結せず、db_type.json($VarsDef) にも分散し得る。
    // そのため enrich/search では両方を合成した辞書を「現在の work context」として扱う。
    const [globalVarsMeta, workVarsMeta, globalType, workType, globalMeta] = await Promise.all([
      this.dataFetcher?.readGeneralVarsDefGlobal?.() ?? {},
      this.dataFetcher?.readGeneralVarsDefWork?.(workId) ?? {},
      this.dataFetcher?.readGlobalType?.() ?? {},
      this.dataFetcher?.readWorkType?.(workId) ?? {},
      this.dataFetcher?.readGlobalMeta?.() ?? {},
    ]);

    let mergedVars = globalVarsMeta || {};
    mergedVars = (typeof DataUtils !== 'undefined' && DataUtils.deepMerge) ? DataUtils.deepMerge(mergedVars, workVarsMeta || {}) : { ...(mergedVars || {}), ...(workVarsMeta || {}) };
    mergedVars = (typeof DataUtils !== 'undefined' && DataUtils.deepMerge) ? DataUtils.deepMerge(mergedVars, globalType?.$VarsDef || {}) : { ...(mergedVars || {}), ...(globalType?.$VarsDef || {}) };
    mergedVars = (typeof DataUtils !== 'undefined' && DataUtils.deepMerge) ? DataUtils.deepMerge(mergedVars, workType?.$VarsDef || {}) : { ...(mergedVars || {}), ...(workType?.$VarsDef || {}) };

    const defTypeMerged = TypeDefUtils.mergeDefTypes(globalType, workType);
    const indices = this.buildEnrichmentIndices(mergedVars, defTypeMerged);

    // work の index 定義
    // - 既定: workType.$IndexDef（typedef 側へ集約）
    // - 後方互換: globalMeta.CreationWorks.<work>.$DefType_Index / $Def_Index（旧）
    const indexDef = (() => {
      if (workType && typeof workType === 'object' && workType.$IndexDef && typeof workType.$IndexDef === 'object') {
        return workType.$IndexDef;
      }
      const workMeta = globalMeta?.CreationWorks?.[workId] ?? null;
      return workMeta?.$DefType_Index ?? workMeta?.$Def_Index ?? null;
    })();

    const ctx = { t: now, mergedVars, defTypeMerged, indices, indexDef, globalType, workType };
    cache.set(workId, ctx);
    return ctx;
  }

  /**
   * エンリッチメントインデックスを構築
   * @param {Object} mergedVars - マージされた変数定義
   * @param {Object} defTypeMerged - マージされた型定義
   * @returns {Object} インデックスオブジェクト
   */
  buildEnrichmentIndices(mergedVars, defTypeMerged) {
    const indices = {
      imageFields: new Set(),
      enumFields: new Map(),
      refFields: new Set(),
      searchableFields: new Set(),
      displayFields: new Map(),
      listLinkLookups: new Map(),

      // $alt: primary が無い場合に代替キーを参照する宣言
      // - key -> [altKey...]
      altFallbackMap: new Map(),

      // typedef 駆動の表示分類（最優先）
      displaySections: new Map(), // fieldKey -> sectionId

      // typedef 駆動の画像抽出（優先度3）
      imagePathHints: [] // [{ path, key, type, folderHint }]
    };

    // 型定義から情報を抽出（$DefType 配列 / 互換オブジェクトの両対応）
    if (defTypeMerged) {
      this.extractFromTypeDefinition(defTypeMerged, indices);
    }

    // 変数定義から情報を抽出
    if (mergedVars) {
      this.extractFromVarDefinition(mergedVars, indices);
    }

    return indices;
  }

  /**
   * `_DBLink` 定義（単体/配列）を正規化
   * @param {any} v
   * @returns {Array<Object>}
   */
  normalizeDbLinkDefs(v) {
    const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
    if (!v) return [];
    if (Array.isArray(v)) return v.filter(isObj);
    return isObj(v) ? [v] : [];
  }

  /**
   * worksTitle（例: 'NumberTales'）を workKey（例: '#Works_NumberTales'）に正規化
   * @param {string} worksTitle
   * @returns {string}
   */
  toWorkKeyFromWorksTitle(worksTitle) {
    if (!worksTitle) return '';
    const s = String(worksTitle).trim();
    if (!s) return '';
    if (s.startsWith('#Works_')) return s;
    if (s.startsWith('Works_')) return `#${s}`;
    return `#Works_${s}`;
  }

  /**
   * 参照先DBを読み込み、`_Search` に一致するレコードを返す（キャッシュ付き）
   * - `_Search` が空の場合は null（意図しない大量マージ防止）
   * - 複数一致の場合も null（曖昧さ回避）
   * @param {Object} dbLinkDef - `{worksTitle, dbName, _Search:[{hashTag,key}]}`
   * @param {Map<string, Promise<Object|null>>} cache
   * @returns {Promise<Object|null>} 一致した参照先レコード、または null
   */
  async resolveDbLinkPrimaryRecord(dbLinkDef, cache) {
    if (!dbLinkDef || typeof dbLinkDef !== 'object') return null;
    const worksTitle = typeof dbLinkDef.worksTitle === 'string' ? dbLinkDef.worksTitle.trim() : '';
    const dbName = typeof dbLinkDef.dbName === 'string' ? dbLinkDef.dbName.trim() : '';
    const queries = Array.isArray(dbLinkDef._Search) ? dbLinkDef._Search : [];
    if (!worksTitle || !dbName) return null;
    if (!Array.isArray(queries) || queries.length === 0) return null;

    const key = `${worksTitle}|${dbName}|${JSON.stringify(queries)}`;
    if (cache && cache.has(key)) {
      return cache.get(key);
    }

    const p = (async () => {
      try {
        const workKey = this.toWorkKeyFromWorksTitle(worksTitle);

        // DataFetcher の readDB を優先（SW側）
        const readDB = this.dataFetcher?.readDB;
        const allRecords = typeof readDB === 'function'
          ? await readDB.call(this.dataFetcher, workKey, dbName)
          : await this.dataFetcher?.fetchJSON?.(`/data/${resolveWorkDirName(workKey)}/DataBases/db_${dbName}.json`);

        const publicRecords = filterPublicRecords(allRecords);

        if (!Array.isArray(publicRecords) || publicRecords.length === 0) return null;

        // typedef駆動の検索比較（既存の比較器/正規化を再利用）
        const matched = await this.searchRecords(publicRecords, workKey, dbName, queries);
        if (!Array.isArray(matched) || matched.length !== 1) return null;
        const rec = matched[0];
        return (rec && typeof rec === 'object') ? rec : null;
      } catch (e) {
        console.warn('⚠️ _DBLink 解決に失敗:', e);
        return null;
      }
    })();

    if (cache) cache.set(key, p);
    return p;
  }

  /**
   * `_DBLink` の参照先レコードから、同名フィールドをレコードへマージ（空値のみ埋める）
   * @param {Object} base - ベースレコード
   * @param {Object} linked - 参照先レコード
   * @returns {Object} マージ後レコード
   */
  mergeFromLinkedRecord(base, linked) {
    if (!base || typeof base !== 'object') return base;
    if (!linked || typeof linked !== 'object') return base;

    const opt = arguments.length >= 3 && arguments[2] && typeof arguments[2] === 'object' ? arguments[2] : {};
    const allowImages = opt.allowImages !== false;
    const indices = opt.indices && typeof opt.indices === 'object' ? opt.indices : null;
    const declaredKeys = opt.declaredKeys instanceof Set ? opt.declaredKeys : null;

    const isImageLikeKey = (k) => {
      const key = String(k || '');
      if (indices?.imageFields && typeof indices.imageFields.has === 'function' && indices.imageFields.has(key)) return true;
      // typedef が不足していても安全側に倒す（既存の Image 判定ロジックと同系統）
      if (/PNG/i.test(key) || key.includes('Image')) return true;
      return false;
    };

    const out = { ...base };

    const isEmpty = (v) => {
      if (v === null || v === undefined || v === '') return true;
      if (Array.isArray(v) && v.length === 0) return true;
      return false;
    };

    const isJumpWrapper = (v) => {
      return !!v && typeof v === 'object' && !Array.isArray(v) && !!v._Jump;
    };

    for (const [k, v] of Object.entries(linked)) {
      // プライベート系はマージしない（循環/ノイズ防止）
      if (String(k).startsWith('_')) continue;
      if (k === '_enrichment') continue;

      // 別作品からの参照では、対象作品の schema に無いトップレベル項目を持ち込まない。
      // これにより、参照元作品で未宣言のフィールドが cross-work merge で増殖するのを防ぐ。
      if (declaredKeys && !declaredKeys.has(k)) continue;

      // 画像は別DB（別JSON）からは参照しない
      if (!allowImages && isImageLikeKey(k)) continue;

      const cur = out[k];
      if (typeof cur === 'undefined' || isEmpty(cur) || isJumpWrapper(cur)) {
        // hideText は意図的なマスクとして尊重（上書きしない）
        if (cur && typeof cur === 'object' && !Array.isArray(cur) && typeof cur.hideText === 'string') {
          continue;
        }
        out[k] = v;
      }
    }

    return out;
  }

  /**
   * `{ _Jump: { hashTag, _Search } }` を参照先レコードから解決して値に置換
   * - hashTag は参照先レコードのフィールド名（ドットパスも可）
   * - _Search がある場合、値（配列/オブジェクト）に対して AND 条件でフィルタする
   * @param {any} node - 走査対象
   * @param {Object} linked - 参照先レコード
   * @returns {any} 置換後ノード
   */
  resolveJumpsInAny(node, linked) {
    const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

    const getByPath = (obj, path) => {
      if (!obj || !path) return undefined;
      const getter = (typeof DataUtils !== 'undefined' && DataUtils.getByPath) ? DataUtils.getByPath : null;
      if (typeof getter === 'function') return getter(obj, path);
      return String(path).split('.').reduce((cur, part) => (cur && typeof cur === 'object' ? cur[part] : undefined), obj);
    };

    const matchQueries = (obj, queries) => {
      if (!isObj(obj)) return false;
      if (!Array.isArray(queries) || queries.length === 0) return true;
      return queries.every(q => {
        const hashTag = q?.hashTag;
        const key = q?.key;
        if (typeof hashTag !== 'string') return false;
        const val = getByPath(obj, hashTag);
        if (val == null) return false;
        // 既存 searchRecords と同等の柔軟性は不要なので、ここは最低限にする
        if (typeof val === 'object' && !Array.isArray(val) && Object.prototype.hasOwnProperty.call(val, 'value')) {
          return String(val.value) === String(key);
        }
        if (Array.isArray(val)) {
          return val.some(it => String(it) === String(key));
        }
        return String(val) === String(key);
      });
    };

    const resolveJumpWrapper = (wrapper) => {
      if (!isObj(wrapper) || !isObj(wrapper._Jump) || !linked) return wrapper;
      const jump = wrapper._Jump;
      const hashTag = typeof jump.hashTag === 'string' ? jump.hashTag.trim() : '';
      if (!hashTag) return wrapper;

      const raw = getByPath(linked, hashTag);
      if (typeof raw === 'undefined') return wrapper;

      const q = Array.isArray(jump._Search) ? jump._Search : [];
      if (Array.isArray(raw)) {
        if (!q.length) return raw;
        const filtered = raw.filter(it => matchQueries(it, q));
        // 複数一致/曖昧一致はスキップ（置換しない）
        if (filtered.length === 1) return filtered[0];
        return wrapper;
      }

      if (isObj(raw)) {
        if (!q.length) return raw;
        return matchQueries(raw, q) ? raw : wrapper;
      }

      // プリミティブ
      return raw;
    };

    const walk = (v) => {
      if (v == null) return v;
      if (Array.isArray(v)) return v.map(walk);
      if (!isObj(v)) return v;

      // _Jump ラッパーはここで置換
      if (Object.prototype.hasOwnProperty.call(v, '_Jump')) {
        const resolved = resolveJumpWrapper(v);
        // 解決できた場合はその値に置換（解決失敗は元を返す）
        if (resolved !== v) return walk(resolved);
      }

      const out = {};
      for (const [k, vv] of Object.entries(v)) {
        out[k] = walk(vv);
      }
      return out;
    };

    return walk(node);
  }

  /**
   * 型定義から情報を抽出
   * @param {Object} typeDef - 型定義
   * @param {Object} indices - インデックスオブジェクト
   */
  extractFromTypeDefinition(typeDef, indices) {
    const entries = TypeDefUtils.extractDefTypeEntries(typeDef);
    const imageHints = TypeDefUtils.buildImagePathHints(entries);
    if (Array.isArray(imageHints) && imageHints.length > 0) {
      indices.imagePathHints = imageHints;
      for (const h of imageHints) {
        indices.imageFields.add(h.path);
      }
    }

    for (const entry of entries) {
      const key = entry?.hashTag;
      if (!key) continue;

      // $alt（フィールドが無い場合の代替参照キー）
      if (indices?.altFallbackMap && typeof indices.altFallbackMap.set === 'function') {
        const altRaw = entry?.$alt;
        const alts = (typeof altRaw === 'string')
          ? [altRaw]
          : (Array.isArray(altRaw) ? altRaw.filter(x => typeof x === 'string') : []);
        if (alts.length && !indices.altFallbackMap.has(key)) {
          indices.altFallbackMap.set(key, alts);
        }
      }

      const typeSpec = entry?.$type;
      const label = TypeDefUtils.pickLabel(entry);

      // 表示名
      if (label) {
        indices.displayFields.set(key, label);
      }

      // 表示分類（typedef 駆動）
      const sectionId = TypeDefUtils.pickDisplaySection(entry);
      indices.displaySections.set(key, sectionId);

      // 参照フィールドの検出（typedef だけでは分かりにくいが、キー規則と型で最低限拾う）
      if (String(key).startsWith('#')) {
        indices.refFields.add(key);
      }

      // 検索可能フィールド（typedef 駆動）
      // NOTE: 本リポジトリの search は hashTag/key の構造検索が主なので、全文検索用 searchableText は控えめに
      const searchable = entry?.searchable;
      if (searchable === false) {
        // 明示的に除外
      } else {
        // 既定: #String / #Summary / #Enum 系を対象にする
        if (TypeDefUtils.looksSearchableType(typeSpec)) {
          indices.searchableFields.add(key);
        }
      }
    }
  }

  /**
   * 変数定義から情報を抽出
   * @param {Object} varDef - 変数定義
   * @param {Object} indices - インデックスオブジェクト
   */
  extractFromVarDefinition(varDef, indices) {
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;

      Object.entries(node).forEach(([key, value]) => {
        if (key.includes('image') || key.includes('Image')) {
          indices.imageFields.add(key);
        }

        if (typeof key === 'string' && key.startsWith('#ListLink_') && Array.isArray(value)) {
          const fieldName = key.replace(/^#ListLink_/, '').trim();
          if (fieldName) {
            let byValue = indices.listLinkLookups.get(fieldName);
            if (!(byValue instanceof Map)) {
              byValue = new Map();
              indices.listLinkLookups.set(fieldName, byValue);
            }

            for (const item of value) {
              if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
              const raw = item[fieldName];
              if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') continue;
              const lookupKey = String(raw).trim();
              if (!lookupKey) continue;
              byValue.set(lookupKey, { ...item });
            }
          }
        }

        if (value && typeof value === 'object') {
          visit(value);
        }
      });
    };

    visit(varDef);
  }

  /**
   * #ListLink_* 定義から取得できる補助情報（Rank など）を wrapper object へ補完
   * @param {Object} value
   * @param {Object|null} indices
   * @returns {Object}
   */
  supplementListLinkData(value, indices = null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const lookups = indices?.listLinkLookups instanceof Map ? indices.listLinkLookups : null;
    if (!lookups || lookups.size === 0) return value;

    const isEmpty = (v) => {
      if (v === null || typeof v === 'undefined') return true;
      if (v === '') return true;
      if (Array.isArray(v)) return v.length === 0;
      if (typeof v === 'object') return Object.keys(v).length === 0;
      return false;
    };

    let out = value;

    for (const [fieldName, byValue] of lookups.entries()) {
      if (!Object.prototype.hasOwnProperty.call(value, fieldName)) continue;
      const raw = value[fieldName];
      if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') continue;

      const lookupKey = String(raw).trim();
      if (!lookupKey) continue;

      const matched = byValue.get(lookupKey);
      if (!matched || typeof matched !== 'object') continue;

      if (out === value) out = { ...value };
      for (const [k, v] of Object.entries(matched)) {
        if (String(k).startsWith('_')) continue;
        if (!Object.prototype.hasOwnProperty.call(out, k) || isEmpty(out[k])) {
          out[k] = v;
        }
      }
    }

    return out;
  }

  /**
   * レコード内の #ListLink wrapper を再帰的に正規化し、表示補助情報を補完
   * @param {any} value
   * @param {Object|null} indices
   * @returns {any}
   */
  normalizeListLinkWrappers(value, indices = null) {
    if (Array.isArray(value)) {
      return value.map(item => this.normalizeListLinkWrappers(item, indices));
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    const out = { ...this.supplementListLinkData(value, indices) };
    for (const [k, v] of Object.entries(out)) {
      out[k] = this.normalizeListLinkWrappers(v, indices);
    }
    return out;
  }

  /**
   * レコードの充実化処理（エンリッチメント）
   * @param {Array} records - レコード配列
   * @param {string} workId - 作品ID
   * @param {string} dbName - データベース名
   * @returns {Promise<Array>} 充実化されたレコード配列
   */
  async enrichRecords(records, workId, dbName = '') {
    if (!Array.isArray(records) || records.length === 0) {
      return records;
    }

    try {
      // typedef/varsdef を読み込み、enrich 全体の判断を schema 駆動へ寄せる。
      // ここで作った ctx が、検索対象・画像候補・表示セクション・$alt の解釈元になる。
      const ctx = await this.getWorkContext(workId);

      const typeEntries = TypeDefUtils.extractDefTypeEntries(ctx?.defTypeMerged);
      const typeByKey = new Map(typeEntries.map(e => [e?.hashTag, e?.$type]));
      const declaredTopLevelKeys = new Set(
        typeEntries
          .map(e => (typeof e?.hashTag === 'string' ? e.hashTag.trim() : ''))
          .filter(Boolean)
      );
      const altFallbackMap = (ctx?.indices?.altFallbackMap instanceof Map) ? ctx.indices.altFallbackMap : null;

      // _DBLink 解決キャッシュ（同一リンクを繰り返し読まない）
      const dbLinkPrimaryCache = new Map();

      // 画像プロセッサーを初期化
      const imageProcessor = new ImageProcessor(this.config);

      // 各レコードに対してエンリッチメント処理を実行
      const enrichedRecords = await Promise.all(records.map(async (record) => {
        if (!record || typeof record !== 'object') return record;

        // 1) typedef に基づく軽い正規化
        const normalizedRecord = this.normalizeRecordByTypeDef(record, ctx?.defTypeMerged);
        let enrichedRecord = { ...normalizedRecord };

        // 2) _DBLink を解決し、参照先の値をマージ（空値のみ）
        //    さらに _Jump ラッパーを参照先の実値へ置換
        const dbLinks = this.normalizeDbLinkDefs(enrichedRecord._DBLink);
        if (dbLinks.length > 0) {
          // 互換: 先頭のみをマージ対象にする（複数リンクの合成は仕様未確定なため）
          const primaryDef = dbLinks[0];
          const primaryLinked = await this.resolveDbLinkPrimaryRecord(primaryDef, dbLinkPrimaryCache);
          if (primaryLinked) {
            const linkWorkKey = this.toWorkKeyFromWorksTitle(primaryDef?.worksTitle);
            const linkDbName = typeof primaryDef?.dbName === 'string' ? primaryDef.dbName.trim() : '';
            const allowImages = (linkWorkKey === workId) && (linkDbName === dbName);
            const declaredKeys = (linkWorkKey && linkWorkKey !== workId && declaredTopLevelKeys.size > 0)
              ? declaredTopLevelKeys
              : null;

            // _Jump 置換 → 同名フィールドの穴埋めマージ
            enrichedRecord = this.resolveJumpsInAny(enrichedRecord, primaryLinked);
            enrichedRecord = this.mergeFromLinkedRecord(enrichedRecord, primaryLinked, {
              allowImages,
              indices: ctx?.indices || null,
              declaredKeys
            });
          }
        }

        // 2.5) $alt によるフォールバック穴埋め（primary が空値のときのみ）
        // - 互換目的。型が不一致（例: 単体 vs 配列）の場合は安全のためスキップ。
        if (altFallbackMap) {
          enrichedRecord = this.applyAltFallbacks(enrichedRecord, altFallbackMap, typeByKey);
        }

        // 2.75) #ListLink_* の wrapper object を varsdef から補完し、表示経路を統一
        enrichedRecord = this.normalizeListLinkWrappers(enrichedRecord, ctx?.indices || null);

        // 3) 画像情報を処理
        const imageInfo = imageProcessor.imageFromRecord(enrichedRecord, workId, dbName, ctx?.indices?.imagePathHints);
        if (imageInfo.images.length > 0) {
          enrichedRecord._enrichment = enrichedRecord._enrichment || {};
          enrichedRecord._enrichment.images = imageInfo.images;
          enrichedRecord._enrichment.primaryImage = imageInfo.primaryImage;
          enrichedRecord._enrichment.imageCount = imageInfo.count;
        }

        // 4) 検索可能フィールドのインデックス化
        // searchableText は API/UI の補助メタであり、公開表示そのものの source of truth ではない。
        enrichedRecord._enrichment = enrichedRecord._enrichment || {};
        enrichedRecord._enrichment.searchableText = this.buildSearchableText(enrichedRecord, ctx?.indices);

        // 5) 表示分類（typedef 駆動）
        // UI はこの displaySections を使って basic/profile/spec/images/other の土台を組める。
        const displaySections = this.buildDisplaySections(enrichedRecord, ctx?.defTypeMerged, ctx?.indices);
        if (displaySections) {
          enrichedRecord._enrichment.displaySections = displaySections;
        }
        const wrapperSummaries = this.buildWrapperSummaries(enrichedRecord, ctx);
        if (wrapperSummaries && Object.keys(wrapperSummaries).length > 0) {
          enrichedRecord._enrichment.wrapperSummaries = wrapperSummaries;
        }

        // 6) bilingual wrapper フィールドのメタ情報（UI の表示制御用）
        // - $type が _JP/_EN ペア配列のフィールドについて、有効ベース型・langMode・主従キーを出力する
        // - ネスト済みフィールドも含む（例: StreamingActivity.StreamingGreeting）
        const defEntries = TypeDefUtils.extractDefTypeEntries(ctx?.defTypeMerged);
        const bwPaths = TypeDefUtils.collectBilingualWrapperPaths(defEntries);
        if (bwPaths.length > 0) {
          enrichedRecord._enrichment.bilingualWrapperFields = bwPaths.map(
            ({ path, langMode, primaryChildKey, altChildKey, effectiveBaseType }) =>
              ({ path, langMode, primaryChildKey, altChildKey, effectiveBaseType })
          );
        }

        enrichedRecord._enrichment.schemaDriven = true;
        enrichedRecord._enrichment.normalized = true;

        return enrichedRecord;
      }));

      return enrichedRecords;

    } catch (error) {
      console.error('❌ エンリッチメント処理中にエラーが発生:', error);
      return records; // エラー時は元のレコードをそのまま返す
    }
  }

  /**
   * typedef の `$alt` 宣言に基づき、primary フィールドが空値の場合に alt フィールドから穴埋めする
   * @param {Object} record
   * @param {Map<string,string[]>} altFallbackMap
   * @param {Map<string,any>} typeByKey
   * @returns {Object}
   */
  applyAltFallbacks(record, altFallbackMap, typeByKey) {
    if (!record || typeof record !== 'object') return record;
    if (!(altFallbackMap instanceof Map)) return record;

    const isEmpty = (v) => {
      if (v === null || typeof v === 'undefined') return true;
      if (v === '') return true;
      if (Array.isArray(v)) return v.length === 0;
      if (typeof v === 'object') {
        // { hideText } は意図的マスクなので空扱いしない
        if (typeof v.hideText === 'string' && v.hideText) return false;
        return Object.keys(v).length === 0;
      }
      return false;
    };

    const isArrayish = (typeSpec) => TypeDefUtils.isArrayType(typeSpec);

    for (const [primaryKey, alts] of altFallbackMap.entries()) {
      if (!primaryKey || !Array.isArray(alts) || alts.length === 0) continue;
      if (!Object.prototype.hasOwnProperty.call(record, primaryKey) || isEmpty(record[primaryKey])) {
        const primaryType = typeByKey?.get(primaryKey);
        for (const altKey of alts) {
          if (!altKey) continue;
          if (!Object.prototype.hasOwnProperty.call(record, altKey)) continue;
          const altVal = record[altKey];
          if (isEmpty(altVal)) continue;

          // 型が両方分かる場合、配列/非配列の互換が取れないならスキップ
          const altType = typeByKey?.get(altKey);
          if (typeof primaryType !== 'undefined' && typeof altType !== 'undefined') {
            if (isArrayish(primaryType) !== isArrayish(altType)) {
              continue;
            }
          }

          record[primaryKey] = altVal;

          // UI 側で「代替元キーのラベルを優先表示」できるように provenance を残す
          record._enrichment = record._enrichment || {};
          record._enrichment.altFallbacks = record._enrichment.altFallbacks || {};
          if (!record._enrichment.altFallbacks[primaryKey]) {
            record._enrichment.altFallbacks[primaryKey] = altKey;
          }
          break;
        }
      }
    }

    return record;
  }

  /**
   * レコードから検索可能なテキストを構築
   * @param {Object} record - レコードオブジェクト
   * @param {Object|null} indices - enrichment indices（typedef 駆動の対象フィールド制御に使用）
   * @returns {string} 検索可能テキスト
   */
  buildSearchableText(record, indices = null) {
    const searchableValues = [];
    const allowedTopLevel = indices?.searchableFields instanceof Set ? indices.searchableFields : null;

    const extractText = (obj, path = '') => {
      if (!obj || typeof obj !== 'object') return;

      Object.entries(obj).forEach(([key, value]) => {
        // プライベートフィールドはスキップ
        if (key.startsWith('_')) return;

        // typedef 駆動: トップレベルで対象外なら走査しない
        if (!path && allowedTopLevel && !allowedTopLevel.has(key)) return;

        if (typeof value === 'string' && value.trim()) {
          searchableValues.push(value.trim());
        } else if (typeof value === 'number') {
          searchableValues.push(value.toString());
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          extractText(value, path ? `${path}.${key}` : key);
        } else if (Array.isArray(value)) {
          value.forEach(item => {
            if (typeof item === 'string' && item.trim()) {
              searchableValues.push(item.trim());
            } else if (typeof item === 'object') {
              extractText(item, path ? `${path}.${key}` : key);
            }
          });
        }
      });
    };

    extractText(record);
    return searchableValues.join(' ').toLowerCase();
  }

  /**
   * typedef($DefType) を元に、レコードのトップレベル値を軽く正規化
   * - 既存のデータ構造を壊さない（オブジェクト/配列は原則そのまま）
   * - 文字列/数値/配列の最低限の揺れを吸収
   * @param {Object} record - 元レコード
   * @param {Array|Object} defTypeMerged - マージ済み $DefType
   * @returns {Object} 正規化済みレコード
   */
  normalizeRecordByTypeDef(record, defTypeMerged) {
    if (!record || typeof record !== 'object') return record;
    const opt = arguments.length >= 3 && arguments[2] && typeof arguments[2] === 'object' ? arguments[2] : {};
    const indexDef = opt?.indexDef && typeof opt.indexDef === 'object' ? opt.indexDef : null;
    const out = { ...record };
    const entries = TypeDefUtils.extractDefTypeEntries(defTypeMerged);
    if (!Array.isArray(entries) || entries.length === 0) return out;

    const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

    const normalizeNested = (value, typeSpec) => {
      const normalized = TypeDefUtils.normalizeValueByTypeSpec(value, typeSpec, { indexDef });
      if (normalized == null) return normalized;

      if (Array.isArray(typeSpec)) {
        if (Array.isArray(normalized)) {
          return normalized.map((item) => {
            if (!isPlainObject(item)) return item;
            const obj = { ...item };
            for (const child of typeSpec) {
              const childKey = child?.hashTag;
              if (!childKey || typeof childKey !== 'string') continue;
              if (typeof obj[childKey] === 'undefined') continue;
              obj[childKey] = normalizeNested(obj[childKey], child?.$type);
            }
            return obj;
          });
        }

        if (isPlainObject(normalized)) {
          const obj = { ...normalized };
          for (const child of typeSpec) {
            const childKey = child?.hashTag;
            if (!childKey || typeof childKey !== 'string') continue;
            if (typeof obj[childKey] === 'undefined') continue;
            obj[childKey] = normalizeNested(obj[childKey], child?.$type);
          }
          return obj;
        }
      }

      if (isPlainObject(typeSpec) && Object.prototype.hasOwnProperty.call(typeSpec, '$type')) {
        return normalizeNested(normalized, typeSpec.$type);
      }

      return normalized;
    };

    for (const entry of entries) {
      const key = entry?.hashTag;
      if (!key || typeof out[key] === 'undefined') continue;

      const typeSpec = entry?.$type;
      out[key] = normalizeNested(out[key], typeSpec);
    }
    return out;
  }

  /**
   * 表示分類（typedef 駆動）を、レコードに対してセクション配列として生成
   * @param {Object} record - レコード
   * @param {Array|Object} defTypeMerged - $DefType
   * @param {Object|null} indices - enrichment indices
   * @returns {Object|null} { basic:[], profile:[], spec:[], images:[], other:[] }
   */
  buildDisplaySections(record, defTypeMerged, indices = null) {
    if (!record || typeof record !== 'object') return null;
    const entries = TypeDefUtils.extractDefTypeEntries(defTypeMerged);
    if (!Array.isArray(entries) || entries.length === 0) return null;

    const sectionOrder = ['basic', 'profile', 'spec', 'images', 'other'];
    const sections = Object.fromEntries(sectionOrder.map(k => [k, []]));
    const byKey = indices?.displaySections instanceof Map ? indices.displaySections : null;

    // typedef 順で、レコードに存在するキーを分類
    for (const entry of entries) {
      const key = entry?.hashTag;
      if (!key) continue;
      if (key.startsWith('_')) continue;
      if (typeof record[key] === 'undefined') continue;

      const sectionId = byKey ? (byKey.get(key) || 'other') : TypeDefUtils.pickDisplaySection(entry);
      if (!sections[sectionId]) sections.other.push(key);
      else sections[sectionId].push(key);
    }

    // typedef 外のキーは other へ送る。
    // ただし UI 側では「typedef / meta で公開対象と判断した項目だけを見せる」運用を優先する。
    for (const k of Object.keys(record)) {
      if (k.startsWith('_')) continue;
      if (k === '_enrichment') continue;
      const isInSchema = entries.some(e => e?.hashTag === k);
      if (!isInSchema) sections.other.push(k);
    }

    return sections;
  }

  /**
   * wrapper registry で整形できる top-level field の summary を集約
   * @param {Object} record - レコード
   * @param {Object|null} ctx - work context
   * @returns {Object|null} { fieldKey: summary }
   */
  buildWrapperSummaries(record, ctx = null) {
    if (!record || typeof record !== 'object') return null;
    const registry = getCharacterValueWrapperRegistry();
    if (!registry || typeof registry.formatWithRegisteredWrapper !== 'function') return null;

    const entries = TypeDefUtils.extractDefTypeEntries(ctx?.defTypeMerged);
    if (!Array.isArray(entries) || entries.length === 0) return null;

    const typeSources = [ctx?.globalType, ctx?.workType].filter((source, index, list) => source && list.indexOf(source) === index);
    const summaries = {};

    for (const entry of entries) {
      const key = entry?.hashTag;
      if (!key || key.startsWith('_')) continue;
      if (typeof record[key] === 'undefined') continue;

      const summary = registry.formatWithRegisteredWrapper(record[key], {
        schemaType: entry?.$type,
        defName: TypeDefUtils.firstDefToken(entry?.$type),
        fieldKey: key,
        typeSources
      });
      if (typeof summary === 'string' && summary.trim()) {
        summaries[key] = summary.trim();
      }
    }

    return summaries;
  }

  /**
   * typedef 駆動の検索（優先度4: 既存の構造検索を壊さず、型に応じた比較を行う）
   * @param {Array} records - レコード配列
   * @param {string} workId - 作品ID
   * @param {string} dbName - DB名
   * @param {Array<{hashTag: string, key: string}>} queries - クエリ配列
   * @returns {Promise<Array>} マッチしたレコード配列
   */
  async searchRecords(records, workId, dbName, queries) {
    const publicRecords = filterPublicRecords(records);
    if (!Array.isArray(publicRecords) || publicRecords.length === 0) return [];
    if (!Array.isArray(queries) || queries.length === 0) return [];

    const ctx = await this.getWorkContext(workId);
    const entries = TypeDefUtils.extractDefTypeEntries(ctx?.defTypeMerged);
    const typeByKey = new Map(entries.map(e => [e?.hashTag, e?.$type]));

    // work の $IndexDef（typedef）を、#Index の解釈に利用
    const indexDef = ctx?.indexDef && typeof ctx.indexDef === 'object' ? ctx.indexDef : null;
    const indexInfo = TypeDefUtils.getIndexDefInfo(indexDef);

    // dot-path も含めて「型が分かるキー」を拡張（Index の子要素も型推定に利用）
    const typeByPath = new Map(typeByKey);
    if (indexInfo?.rootKey) {
      if (indexInfo.nested && Array.isArray(indexInfo.subDefs)) {
        for (const sub of indexInfo.subDefs) {
          if (!sub?.key) continue;
          typeByPath.set(`${indexInfo.rootKey}.${sub.key}`, sub.typeSpec ?? null);
        }
      }
      // root 自体にも type を付与（比較時のヒント）
      if (!typeByPath.has(indexInfo.rootKey)) {
        typeByPath.set(indexInfo.rootKey, indexDef?.$type ?? indexDef?.$valType ?? null);
      }
    }

    const expandIndexSearchQueries = (q) => {
      const h = typeof q?.hashTag === 'string' ? q.hashTag.trim() : '';
      if (h !== '#Index') return [q];
      if (!indexInfo?.rootKey) return [q];

      // スカラーIndex
      if (!indexInfo.nested) {
        return [{ hashTag: indexInfo.rootKey, key: q?.key }];
      }

      // ネストIndex: key が object の場合は AND 条件へ展開（例: {Stoat:'Major',Num:0}）
      const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
      if (isObj(q?.key)) {
        const rootObj = isObj(q.key?.[indexInfo.rootKey]) ? q.key[indexInfo.rootKey] : q.key;
        const out = [];
        for (const sub of (indexInfo.subDefs || [])) {
          const sk = sub?.key;
          if (!sk) continue;
          if (!Object.prototype.hasOwnProperty.call(rootObj, sk)) continue;
          out.push({ hashTag: `${indexInfo.rootKey}.${sk}`, key: rootObj[sk] });
        }
        if (out.length > 0) return out;
      }

      // フォールバック: 主要サブフィールド（Num等）へ単発検索
      const primarySub = TypeDefUtils.pickPrimaryIndexSubDef(indexInfo.subDefs || []);
      const path = primarySub?.key ? `${indexInfo.rootKey}.${primarySub.key}` : indexInfo.rootKey;
      return [{ hashTag: path, key: q?.key }];
    };

    const expandedQueries = queries.flatMap(expandIndexSearchQueries);

    const normalizeQueryKey = (hashTag, rawKey) => {
      const typeSpec = typeByPath.get(hashTag);
      return TypeDefUtils.normalizeQueryValueByTypeSpec(rawKey, typeSpec);
    };

    /**
     * *_JP / *_EN の言語サフィックスを解析
     * @param {string} k
     * @returns {{ base: string, lang: 'JP'|'EN' }|null}
     */
    const parseLangSuffix = (k) => {
      const s = String(k || '');
      const m = s.match(/^(.*)_(JP|EN)$/);
      if (!m || !m[1] || !m[2]) return null;
      return { base: m[1], lang: m[2] === 'JP' ? 'JP' : 'EN' };
    };

    /**
     * hashTag（dot-path を含む）を *_JP/_EN 同義として候補展開
     * - 例: 'FormalName' -> ['FormalName','FormalName_JP','FormalName_EN']
     * - 例: 'FormalName_EN' -> ['FormalName_EN','FormalName','FormalName_JP']
     * @param {string} hashTag
     * @returns {string[]}
     */
    const expandLangAliasCandidates = (hashTag) => {
      const raw = String(hashTag || '').trim();
      if (!raw) return [];

      const parts = raw.split('.');
      const tail = parts.pop() || '';
      const info = parseLangSuffix(tail);

      const baseTail = info ? info.base : tail;
      const prefix = parts.length ? parts.join('.') + '.' : '';

      const base = prefix + baseTail;
      const jp = prefix + baseTail + '_JP';
      const en = prefix + baseTail + '_EN';

      // raw を最優先にしつつ、同義候補を重複排除
      const ordered = info
        ? [raw, base, jp, en]
        : [raw, jp, en];

      const out = [];
      const seen = new Set();
      for (const k of ordered) {
        if (!k || typeof k !== 'string') continue;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(k);
      }
      return out;
    };

    const normalizedQueries = expandedQueries.map(q => ({
      hashTag: q.hashTag,
      key: normalizeQueryKey(q.hashTag, q.key)
    }));

    const getByPath = (typeof DataUtils !== 'undefined' && DataUtils.getByPath) ? DataUtils.getByPath : (obj, path) => {
      if (!path) return undefined;
      return String(path).split('.').reduce((cur, part) => (cur && typeof cur === 'object' ? cur[part] : undefined), obj);
    };

    const valueEquals = (val, qKey, typeSpec) => {
      // 明示的に null を検索する場合は、null 同士を一致扱いにする
      // - 例: index サブキーが '#String|#Null' の作品で { LogicSeries: null, Num: 62 } のように検索したい
      if (qKey === null) return val === null;
      if (val == null) return false;

      const equalsPrimitive = (a, b) => {
        if (a == null) return false;
        // 数値比較（型が number を含む場合は数値優先）
        if (TypeDefUtils.looksNumberType(typeSpec)) {
          const na = TypeDefUtils.parseStrictNumber(a);
          const nb = TypeDefUtils.parseStrictNumber(b);
          if (na != null && nb != null) return na === nb;
        }
        return String(a) === String(b);
      };

      /**
       * ネスト構造からプリミティブ（string/number/boolean）を抽出
       * @param {any} v
       * @param {string[]} out
       * @param {number} depth
       */
      const collectLeafPrimitives = (v, out, depth, includePrivateKeys = false) => {
        if (out.length >= 60) return;
        if (depth > 4) return;
        if (v == null) return;
        if (typeof v === 'string') {
          const t = v.trim();
          if (t) out.push(t);
          return;
        }
        if (typeof v === 'number' || typeof v === 'boolean') {
          out.push(String(v));
          return;
        }
        if (Array.isArray(v)) {
          for (const it of v) {
            collectLeafPrimitives(it, out, depth + 1, includePrivateKeys);
            if (out.length >= 60) return;
          }
          return;
        }
        if (typeof v !== 'object') return;

        const keys = Object.keys(v);
        const onlyPrivate = keys.length > 0 && keys.every(k => String(k).startsWith('_'));
        const nextIncludePrivate = includePrivateKeys || onlyPrivate;
        for (const [k, vv] of Object.entries(v)) {
          if (!nextIncludePrivate && String(k).startsWith('_')) continue;
          collectLeafPrimitives(vv, out, depth + 1, nextIncludePrivate);
          if (out.length >= 60) return;
        }
      };

      // {value, about_*} 系は value を優先
      if (val && typeof val === 'object' && !Array.isArray(val) && Object.prototype.hasOwnProperty.call(val, 'value')) {
        return valueEquals(val.value, qKey, typeSpec);
      }

      // {hideText} 系（非公開など）は hideText を比較対象に含める
      if (val && typeof val === 'object' && !Array.isArray(val) && typeof val.hideText === 'string') {
        if (equalsPrimitive(val.hideText, qKey)) return true;
      }

      // {about_JP/about_EN/about} 系（value が無い場合）
      if (val && typeof val === 'object' && !Array.isArray(val) && !Object.prototype.hasOwnProperty.call(val, 'value')) {
        const about = val.about_JP || val.about_EN || val.about;
        if (typeof about === 'string' && equalsPrimitive(about, qKey)) return true;
      }

      // 配列は any-match
      if (Array.isArray(val)) {
        return val.some(it => valueEquals(it, qKey, typeSpec));
      }

      // Object は葉のプリミティブを抽出して比較（[object Object] 回避）
      if (val && typeof val === 'object') {
        const leaf = [];
        // Object 値の比較では private キー（_Jump/_Search 等）も含めて柔軟に探索
        collectLeafPrimitives(val, leaf, 0, true);
        if (leaf.some(x => equalsPrimitive(x, qKey))) return true;
      }

      return equalsPrimitive(val, qKey);
    };

    return publicRecords.filter(rec => {
      return normalizedQueries.every(q => {
        const typeSpec = typeByPath.get(q.hashTag);

        // *_JP/_EN 同義として候補キーを展開し、いずれかに一致すればOK
        const candidates = expandLangAliasCandidates(q.hashTag);
        if (candidates.length === 0) return false;

        for (const c of candidates) {
          const val = getByPath(rec, c);
          if (typeof val === 'undefined') continue;
          if (valueEquals(val, q.key, typeSpec)) return true;
        }
        return false;
      });
    });
  }
}

/**
 * db_type.json の $DefType を扱うユーティリティ
 * - SW側で「表示分類 / 正規化 / 画像 / 検索」を typedef 駆動にするための最小実装
 */
class TypeDefUtils {
  /**
   * $DefType の配列を抽出
   * @param {any} typeDef - type json / $DefType 配列 / 互換マップ
   * @returns {Array<Object>} $DefType entries
   */
  static extractDefTypeEntries(typeDef) {
    if (!typeDef) return [];
    if (Array.isArray(typeDef)) return typeDef.filter(it => it && typeof it === 'object');
    if (Array.isArray(typeDef?.$DefType)) return typeDef.$DefType.filter(it => it && typeof it === 'object');

    // 互換: { Field: {..} } 形式
    if (typeDef && typeof typeDef === 'object') {
      return Object.entries(typeDef)
        .map(([k, v]) => {
          if (!v || typeof v !== 'object') return null;
          return { hashTag: k, ...v };
        })
        .filter(Boolean);
    }
    return [];
  }

  /**
   * グローバル/作品の $DefType をマージ（作品側が上書き、順序は global を優先）
   * @param {Object} globalType
   * @param {Object} workType
   * @returns {Array<Object>} merged $DefType
   */
  static mergeDefTypes(globalType, workType) {
    const g = this.extractDefTypeEntries(globalType);
    const w = this.extractDefTypeEntries(workType);
    const wByKey = new Map(w.map(e => [e?.hashTag, e]));
    const used = new Set();
    const out = [];

    for (const ge of g) {
      const key = ge?.hashTag;
      if (!key) continue;
      if (wByKey.has(key)) {
        out.push(wByKey.get(key));
        used.add(key);
      } else {
        out.push(ge);
        used.add(key);
      }
    }
    for (const we of w) {
      const key = we?.hashTag;
      if (!key || used.has(key)) continue;
      out.push(we);
    }
    return out;
  }

  /**
   * ラベル（日本語）を抽出
   * @param {Object} entry
   * @returns {string|null}
   */
  static pickLabel(entry) {
    if (!entry || typeof entry !== 'object') return null;
    return entry.hashTag_JP || entry.hashtag_JP || entry.label || entry.displayName || null;
  }

  /**
   * 表示セクションを typedef から決定
   * - db_type.json 側に displaySection / $display.section を追加すれば明示指定可能
   * - 未指定時は $type と hashTag から推定
   * @param {Object} entry
   * @returns {'basic'|'profile'|'spec'|'images'|'other'}
   */
  static pickDisplaySection(entry) {
    if (!entry || typeof entry !== 'object') return 'other';
    const explicit = entry.displaySection || entry.$display?.section || entry._display?.section;
    if (explicit && typeof explicit === 'string') {
      const s = explicit.toLowerCase();
      if (s === 'basic' || s === 'profile' || s === 'spec' || s === 'images' || s === 'other') return s;
    }

    const key = String(entry.hashTag || '');
    const typeSpec = entry.$type;
    let typeStr = typeof typeSpec === 'string' ? typeSpec : '';

    // bilingual wrapper（$type が _JP/_EN ペアの配列）の場合、有効ベース型を typeStr として使用
    if (!typeStr && Array.isArray(typeSpec)) {
      const bwInfo = this.detectBilingualWrapper(typeSpec, entry.$display ?? null);
      if (bwInfo?.effectiveBaseType) {
        typeStr = bwInfo.effectiveBaseType;
      }
    }

    if (key === 'Images' || this.looksImageType(typeSpec) || key.includes('Image') || key.includes('PNG')) return 'images';
    if (typeStr.includes('#Summary') || typeStr.includes('#Dialogue') || /(Calling|Character|Hobby|SpecialSkill|Favor|Unlike|About|Comment|Summary|Dialogue)/i.test(key)) return 'profile';
    if (/(Spec|Stats|Arcanum|Numero|Beast|Safety|Rank|Level|Effect|Material|ActionType|Dualize)/i.test(key)) return 'spec';
    return 'basic';
  }

  /**
   * 画像型っぽいか
   * @param {any} typeSpec
   * @returns {boolean}
   */
  static looksImageType(typeSpec) {
    if (!typeSpec) return false;
    if (typeof typeSpec === 'string') {
      return /(PNGFileName|PNGFilePath|JPG|JPEG|WEBP|SVG|BMP)/i.test(typeSpec);
    }
    if (Array.isArray(typeSpec)) {
      return typeSpec.some(e => this.looksImageType(e?.$type));
    }
    return false;
  }

  /**
   * searchableText の対象にしやすい型か
   * @param {any} typeSpec
   * @returns {boolean}
   */
  static looksSearchableType(typeSpec) {
    if (!typeSpec) return false;
    if (typeof typeSpec === 'string') {
      return /(#String|#Summary|#Dialogue|#Enum|\$EnumDef)/i.test(typeSpec);
    }
    if (Array.isArray(typeSpec)) return true;
    return false;
  }

  /**
   * number 型っぽいか
   * @param {any} typeSpec
   * @returns {boolean}
   */
  static looksNumberType(typeSpec) {
    if (!typeSpec) return false;
    if (typeof typeSpec === 'string') {
      // '#Number|#String' のような union は「文字列ID（000 等）」の可能性があるため
      // 数値化/数値比較を避けて厳密一致（文字列比較）に倒す
      if (!/#Number/i.test(typeSpec)) return false;
      if (/#String/i.test(typeSpec)) return false;
      return true;
    }
    return false;
  }

  /**
   * 文字列を「完全な数値」として解釈できる場合のみ number を返す
   * - parseFloat のように '0-alt' を 0 扱いしない（曖昧一致の原因になる）
   * @param {any} v
   * @returns {number|null}
   */
  static parseStrictNumber(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    const s = v.trim();
    if (!s) return null;
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Index 型っぽいか（#Index）
   * @param {any} typeSpec
   * @returns {boolean}
   */
  static looksIndexType(typeSpec) {
    if (!typeSpec) return false;
    if (typeof typeSpec !== 'string') return false;
    return /(^|\||,)\s*#Index\s*($|\||,)/i.test(typeSpec) || /\b#Index\b/i.test(typeSpec);
  }

  /**
  * work typedef の $IndexDef（または旧メタ互換）を解析して扱いやすい形にする
   * @param {any} indexDef
   * @returns {{rootKey:string,nested:boolean,subDefs:Array<{key:string,typeSpec:any}>}|null}
   */
  static getIndexDefInfo(indexDef) {
    if (!indexDef || typeof indexDef !== 'object') return null;
    const rootKey = typeof indexDef.hashTag === 'string' ? indexDef.hashTag.trim() : '';
    if (!rootKey) return null;

    const rawType = indexDef.$type ?? indexDef.$valType ?? null;
    if (Array.isArray(rawType)) {
      const subDefs = rawType
        .filter(it => it && typeof it === 'object')
        .map(it => ({
          key: typeof it.hashTag === 'string' ? it.hashTag.trim() : '',
          typeSpec: it.$type ?? it.$valType ?? null
        }))
        .filter(it => it.key);
      return { rootKey, nested: true, subDefs };
    }

    return { rootKey, nested: false, subDefs: [] };
  }

  /**
   * ネストIndex の主要サブフィールドを推定（#Number/#ListIndex を優先）
   * @param {Array<{key:string,typeSpec:any}>} subDefs
   * @returns {{key:string,typeSpec:any}|null}
   */
  static pickPrimaryIndexSubDef(subDefs) {
    if (!Array.isArray(subDefs) || subDefs.length === 0) return null;
    const score = (t) => {
      if (!t || typeof t !== 'string') return 99;
      if (/#Number/i.test(t)) return 0;
      if (/#ListIndex/i.test(t)) return 1;
      return 50;
    };
    const sorted = [...subDefs].sort((a, b) => score(a?.typeSpec) - score(b?.typeSpec));
    return sorted[0] || null;
  }

  /**
   * 画像パス（dot path）ヒントを $DefType から抽出
   * @param {Array<Object>} defTypeEntries
   * @returns {Array<{path: string, key: string, type: string|null, folderHint: string|null}>}
   */
  static buildImagePathHints(defTypeEntries) {
    const out = [];
    const walk = (entries, prefix = '') => {
      if (!Array.isArray(entries)) return;
      for (const e of entries) {
        const k = e?.hashTag;
        if (!k) continue;
        const path = prefix ? `${prefix}.${k}` : k;
        const t = e?.$type;
        if (this.looksImageType(t) || /PNG/i.test(k)) {
          const folderHint = this.inferFolderHintFromKey(k);
          out.push({ path, key: k, type: typeof t === 'string' ? t : null, folderHint });
        }
        if (Array.isArray(t)) {
          walk(t, path);
        }
      }
    };
    walk(defTypeEntries);
    return out;
  }

  /**
   * キーから画像フォルダ名を推定（concept_PNGName -> concept など）
   * @param {string} key
   * @returns {string|null}
   */
  static inferFolderHintFromKey(key) {
    const s = String(key || '');
    const m = s.match(/^([A-Za-z0-9-]+)_PNG/i);
    if (m) return m[1];
    return null;
  }

  /**
   * 型文字列から配列型かを判定
   * @param {any} typeSpec
   * @returns {boolean}
   */
  static isArrayType(typeSpec) {
    return typeof typeSpec === 'string' && /\[\]/.test(typeSpec);
  }

  /**
   * type 文字列から _JP / _EN の言語サフィックスを除去してベース型に変換
   * - '#String_JP_withAbout[]' → '#String_withAbout[]'
   * - '#String_JP'           → '#String'
   * - '#String_withAbout[]'  → '#String_withAbout[]' （変化なし）
   * - union 型（'|'区切り）の各トークンに対して個別に適用する
   * @param {string} typeStr
   * @returns {string}
   */
  static stripLangSuffixFromTypeStr(typeStr) {
    if (typeof typeStr !== 'string') return typeStr;
    return typeStr
      .split('|')
      .map(token => token.trim().replace(
        /^(#[A-Za-z]+)_(JP|EN)((?:_[A-Za-z]+)*)(\[\])?$/,
        (_, base, _lang, rest, arr) => `${base}${rest}${arr || ''}`
      ))
      .join('|');
  }

  /**
   * $type 配列が和英ペア（bilingual wrapper）かどうかを検出し、有効なベース型情報を返す
   *
   * 「bilingual wrapper」の条件:
   * - $type が配列で、全子要素の hashTag が _JP または _EN で終わる
   * - _JP / _EN の base 名が一致するペアが最低1組存在する
   * - 言語サフィックス以外の要素が混在していない
   *
   * @param {Array} typeArray - $type 配列
   * @param {Object|null} display - $display オブジェクト（langMode を参照）
   * @returns {{
   *   detected: true,
   *   langMode: string,
   *   primaryChildKey: string,
   *   altChildKey: string,
   *   effectiveBaseType: string
   * }|null}
   */
  static detectBilingualWrapper(typeArray, display) {
    if (!Array.isArray(typeArray) || typeArray.length < 2) return null;

    const jpItems = [];
    const enItems = [];
    for (const entry of typeArray) {
      const ht = typeof entry?.hashTag === 'string' ? entry.hashTag : '';
      if (!ht) return null;
      if (ht.endsWith('_JP')) jpItems.push(entry);
      else if (ht.endsWith('_EN')) enItems.push(entry);
      else return null; // 言語サフィックス以外の子要素が存在 → bilingual wrapper ではない
    }
    if (jpItems.length === 0 || enItems.length === 0) return null;

    // _JP / _EN で base 名が一致するペアを収集
    const pairs = [];
    for (const jp of jpItems) {
      const base = jp.hashTag.slice(0, -3); // '_JP' (3文字) を除去
      const en = enItems.find(e => e.hashTag === base + '_EN');
      if (en) pairs.push({ base, jpEntry: jp, enEntry: en });
    }
    if (pairs.length === 0) return null;

    // $display.langMode から表示言語優先度を取得（省略時は 'jp' を既定）
    const langMode = (display && typeof display === 'object' && typeof display.langMode === 'string')
      ? display.langMode.trim().toLowerCase()
      : 'jp';

    // 代表ペアの JP 型から言語サフィックスを除去して有効ベース型を導出
    const repr = pairs[0];
    const jpTypeStr = typeof repr.jpEntry.$type === 'string' ? repr.jpEntry.$type : '#String';
    const effectiveBaseType = this.stripLangSuffixFromTypeStr(jpTypeStr);

    return {
      detected: true,
      langMode,
      primaryChildKey: langMode === 'en' ? repr.enEntry.hashTag : repr.jpEntry.hashTag,
      altChildKey:     langMode === 'en' ? repr.jpEntry.hashTag : repr.enEntry.hashTag,
      effectiveBaseType
    };
  }

  /**
   * $DefType エントリを再帰的に走査して bilingual wrapper field のパス情報を収集
   * - トップレベル・ネスト済みの両方を対象にする（例: StreamingActivity.StreamingGreeting）
   * - bilingual wrapper でないが子を持つ配列型の場合は再帰して内部を探索する
   * @param {Array} entries - $DefType entries（抽出済み）
   * @param {string} [prefix] - 親フィールドの dot-path プレフィックス
   * @returns {Array<{
   *   path: string,
   *   langMode: string,
   *   primaryChildKey: string,
   *   altChildKey: string,
   *   effectiveBaseType: string
   * }>}
   */
  static collectBilingualWrapperPaths(entries, prefix = '') {
    if (!Array.isArray(entries)) return [];
    const result = [];
    for (const entry of entries) {
      const key = typeof entry?.hashTag === 'string' ? entry.hashTag : '';
      if (!key) continue;
      const path = prefix ? `${prefix}.${key}` : key;
      const typeSpec = entry?.$type;
      const display = entry?.$display ?? null;

      if (Array.isArray(typeSpec)) {
        const info = this.detectBilingualWrapper(typeSpec, display);
        if (info?.detected) {
          result.push({ path, ...info });
        } else {
          // bilingual wrapper ではないが子を持つ配列型 → 再帰探索
          result.push(...this.collectBilingualWrapperPaths(typeSpec, path));
        }
      }
    }
    return result;
  }

  /**
   * typeSpec から最初の `$Def_*` トークンを取得
   * @param {any} typeSpec
   * @returns {string}
   */
  static firstDefToken(typeSpec) {
    if (Array.isArray(typeSpec)) return '';
    return String(typeSpec || '')
      .split('|')
      .map((token) => token.trim())
      .find((token) => token.startsWith('$Def_')) || '';
  }

  /**
   * 型指定に基づき値を正規化
   * @param {any} value
   * @param {any} typeSpec
   * @returns {any}
   */
  static normalizeValueByTypeSpec(value, typeSpec) {
    const opt = arguments.length >= 3 && arguments[2] && typeof arguments[2] === 'object' ? arguments[2] : {};
    const indexDef = opt?.indexDef && typeof opt.indexDef === 'object' ? opt.indexDef : null;
    if (value == null) return value;

    // array 型は単発 -> 配列に寄せる
    if (this.isArrayType(typeSpec) && !Array.isArray(value)) {
      return [value];
    }

    // #String/#Summary/#Dialogue 系はプリミティブを string に寄せる
    if (typeof typeSpec === 'string' && /(#String|#Summary|#Dialogue)/i.test(typeSpec)) {
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      return value;
    }

    // #Number 系は string 数値だけ number に寄せる（オブジェクト構造は維持）
    if (this.looksNumberType(typeSpec)) {
      if (typeof value === 'string') {
        const n = this.parseStrictNumber(value);
        return n == null ? value : n;
      }
      return value;
    }

    // #Index は、作品の $IndexDef がネスト型の場合のみ、最低限の形を補正
    // - 例: FLInvestigator78 の #Index に 0 が入っていたら {Card:{Num:0}} に寄せる
    if (this.looksIndexType(typeSpec) && indexDef) {
      const info = this.getIndexDefInfo(indexDef);
      if (info?.nested && info.rootKey && Array.isArray(info.subDefs) && info.subDefs.length > 0) {
        const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
        const primarySub = this.pickPrimaryIndexSubDef(info.subDefs) || info.subDefs[0];
        const subKey = primarySub?.key;
        if (!subKey) return value;

        // プリミティブは primary sub へ寄せる
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          return { [info.rootKey]: { [subKey]: value } };
        }

        // { Stoat, Num } のような形は { Card:{...} } に寄せる
        if (isObj(value)) {
          if (isObj(value[info.rootKey])) return value;
          const hasAnySub = info.subDefs.some(d => d?.key && Object.prototype.hasOwnProperty.call(value, d.key));
          if (hasAnySub) return { [info.rootKey]: value };
        }
      }
    }

    return value;
  }

  /**
   * 検索クエリ側の key を型に寄せる
   * @param {any} rawKey
   * @param {any} typeSpec
   * @returns {any}
   */
  static normalizeQueryValueByTypeSpec(rawKey, typeSpec) {
    if (rawKey == null) return rawKey;
    const s = typeof rawKey === 'string' ? rawKey.trim() : rawKey;
    if (this.looksNumberType(typeSpec)) {
      const n = this.parseStrictNumber(s);
      return n == null ? s : n;
    }
    return s;
  }
}

/**
 * 画像処理ユーティリティクラス
 * 画像パスの解決と画像ギャラリーの生成を担当
 */
class ImageProcessor {
  /**
   * @param {Object} config - 設定オブジェクト
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * レコードから画像情報を抽出して処理
   * @param {Object} record - レコードオブジェクト
   * @param {string} workId - 作品ID
   * @param {string} dbName - データベース名
   * @returns {Object} 画像処理結果
   */
  imageFromRecord(record, workId, dbName, imagePathHints = null) {
    if (!record || typeof record !== 'object') {
      return { images: [], primaryImage: null };
    }

    const images = [];
    const imageFields = this.findImageFields(record, imagePathHints);

    // 各画像フィールドを処理
    imageFields.forEach(field => {
      const value = this.getNestedValue(record, field.path);
      if (value) {
        const processedImages = this.processImageValue(value, field, workId, dbName);
        images.push(...processedImages);
      }
    });

    // 重複を除去
    const uniqueImages = this.deduplicateImages(images);

    // プライマリ画像を決定
    const primaryImage = this.selectPrimaryImage(uniqueImages, record);

    return {
      images: uniqueImages,
      primaryImage: primaryImage,
      count: uniqueImages.length
    };
  }

  /**
   * レコード内の画像フィールドを発見
   * @param {Object} record - レコードオブジェクト
   * @returns {Array} 画像フィールド情報の配列
   */
  findImageFields(record, imagePathHints = null) {
    const imageFields = [];

    const findInObject = (obj, path = '') => {
      if (!obj || typeof obj !== 'object') return;

      Object.entries(obj).forEach(([key, value]) => {
        const currentPath = path ? `${path}.${key}` : key;

        // 画像フィールドの判定
        if (this.isImageField(key, value)) {
          imageFields.push({
            path: currentPath,
            key: key,
            type: this.getImageFieldType(key)
          });
        }

        // 再帰的に探索
        if (typeof value === 'object' && !Array.isArray(value)) {
          findInObject(value, currentPath);
        }
      });
    };

    findInObject(record);

    // typedef 駆動のパス指定があれば追加（重複は dedupe 側で落ちる）
    if (Array.isArray(imagePathHints)) {
      for (const h of imagePathHints) {
        if (!h?.path) continue;
        imageFields.push({
          path: h.path,
          key: h.key || String(h.path).split('.').slice(-1)[0],
          type: this.getImageFieldType(h.key || ''),
          folderHint: h.folderHint || null,
        });
      }
    }

    return imageFields;
  }

  /**
   * 画像フィールドかどうかを判定
   * @param {string} key - フィールドキー
   * @param {any} value - フィールド値
   * @returns {boolean} 画像フィールドの場合はtrue
   */
  isImageField(key, value) {
    const imageKeywords = [
      'image', 'Image', 'img', 'Img',
      'picture', 'Picture', 'pic', 'Pic',
      'photo', 'Photo', 'avatar', 'Avatar',
      'icon', 'Icon', 'thumbnail', 'Thumbnail'
    ];

    const hasImageKeyword = imageKeywords.some(keyword => key.includes(keyword));
    const hasImageValue = typeof value === 'string' && this.looksLikeImagePath(value);

    return hasImageKeyword || hasImageValue;
  }

  /**
   * 文字列が画像パスに見えるかチェック
   * @param {string} value - チェック対象の値
   * @returns {boolean} 画像パスらしい場合はtrue
   */
  looksLikeImagePath(value) {
    if (typeof value !== 'string') return false;

    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
    const lowerValue = value.toLowerCase();

    return imageExtensions.some(ext => lowerValue.endsWith(ext)) ||
           lowerValue.includes('/images/') ||
           lowerValue.includes('\\images\\');
  }

  /**
   * 画像フィールドのタイプを取得
   * @param {string} key - フィールドキー
   * @returns {string} 画像タイプ
   */
  getImageFieldType(key) {
    const lowerKey = key.toLowerCase();

    if (lowerKey.includes('avatar') || lowerKey.includes('profile')) return 'avatar';
    if (lowerKey.includes('icon')) return 'icon';
    if (lowerKey.includes('thumbnail') || lowerKey.includes('thumb')) return 'thumbnail';
    if (lowerKey.includes('concept')) return 'concept';
    if (lowerKey.includes('design')) return 'design';
    if (lowerKey.includes('art')) return 'artwork';

    return 'general';
  }

  /**
   * 画像値を処理してURL配列に変換
   * @param {any} value - 画像値
   * @param {Object} field - フィールド情報
   * @param {string} workId - 作品ID
   * @param {string} dbName - データベース名
   * @returns {Array} 処理された画像情報の配列
   */
  processImageValue(value, field, workId, dbName) {
    const images = [];

    if (typeof value === 'string') {
      const url = this.resolveImagePath(value, workId, dbName, field);
      if (url) {
        images.push({
          url: url,
          type: field.type,
          field: field.key,
          path: field.path,
          original: value
        });
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'string') {
          const url = this.resolveImagePath(item, workId, dbName, field);
          if (url) {
            images.push({
              url: url,
              type: field.type,
              field: field.key,
              path: `${field.path}[${index}]`,
              original: item
            });
          }
        }
      });
    }

    return images;
  }

  /**
   * 画像パスを絶対URLに解決
   * @param {string} imagePath - 画像パス
   * @param {string} workId - 作品ID
   * @param {string} dbName - データベース名
   * @returns {string|null} 解決されたURL
   */
  resolveImagePath(imagePath, workId, dbName, field = null) {
    if (!imagePath || typeof imagePath !== 'string') return null;

    // 既に完全なURLの場合
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return imagePath;
    }

    // 絶対パスの場合
    if (imagePath.startsWith('/')) {
      return this.config.withRepoBase(imagePath);
    }

    // 相対パスの場合、作品とDBに基づいて解決
    const workPath = resolveWorkDirName(workId);
    const dbPath = this.mapDbNameToImageDir(dbName);

    // typedef 駆動: concept_PNGName 等は Images/<DB>/<subdir>/ に寄せる
    const hasSlash = /[\\/]/.test(imagePath);
    const folderHint = field?.folderHint || null;
    const subdir = (!hasSlash && folderHint) ? `${folderHint}/` : '';
    const basePath = `/data/${workPath}/Images/${dbPath}/${subdir}${imagePath}`;

    return this.config.withRepoBase(basePath);
  }

  /**
   * データベース名を画像ディレクトリにマップ
   * @param {string} dbName - データベース名
   * @returns {string} 画像ディレクトリ名
   */
  mapDbNameToImageDir(dbName) {
    const rawName = String(dbName || '').trim();
    if (!rawName) return 'General';
    if (rawName === 'General') return 'General';
    if (rawName.startsWith('DB_') || rawName.startsWith('Ref_')) return rawName;

    const refMapping = {
      Glossary: 'Ref_Glossary',
      Reference: 'Ref_Reference'
    };
    if (refMapping[rawName]) return refMapping[rawName];

    const dbMapping = {
      Primary: 'DB_Primary',
      Secondary: 'DB_Secondary',
      SemiPrimary: 'DB_SemiPrimary',
      SelfSecondary: 'DB_SelfSecondary',
      UnprocessedSecondary: 'DB_UnprocessedSecondary',
      PrimaryDealer: 'DB_PrimaryDealer',
      PrimaryMobs: 'DB_PrimaryMobs',
      Proxy: 'DB_Proxy',
      Mobs: 'DB_Mobs'
    };
    if (dbMapping[rawName]) return dbMapping[rawName];

    return `DB_${rawName}`;
  }

  /**
   * 重複する画像を除去
   * @param {Array} images - 画像配列
   * @returns {Array} 重複除去後の画像配列
   */
  deduplicateImages(images) {
    const seen = new Set();
    return images.filter(image => {
      if (seen.has(image.url)) return false;
      seen.add(image.url);
      return true;
    });
  }

  /**
   * プライマリ画像を選択
   * @param {Array} images - 画像配列
   * @param {Object} record - レコードオブジェクト
   * @returns {Object|null} プライマリ画像
   */
  selectPrimaryImage(images, record) {
    if (images.length === 0) return null;

    // 優先順位: avatar > icon > concept > design > artwork > thumbnail > general
    const typePriority = ['avatar', 'icon', 'concept', 'design', 'artwork', 'thumbnail', 'general'];

    for (const type of typePriority) {
      const found = images.find(img => img.type === type);
      if (found) return found;
    }

    return images[0]; // フォールバック
  }

  /**
   * ネストされたオブジェクトから値を取得
   * @param {Object} obj - 取得元オブジェクト
   * @param {string} path - パス（ドット区切り）
   * @returns {any} 取得された値
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }
}

/**
 * データ正規化ユーティリティクラス
 * データの型変換、検証、正規化を担当
 */
class DataNormalizer {
  /**
   * レコードデータを正規化
   * @param {Array} records - 正規化対象レコード配列
   * @param {Object} typeDefinition - 型定義
   * @returns {Array} 正規化後のレコード配列
   */
  static normalizeRecords(records, typeDefinition) {
    if (!Array.isArray(records)) return [];

    return records.map(record => this.normalizeRecord(record, typeDefinition));
  }

  /**
   * 単一レコードを正規化
   * @param {Object} record - 正規化対象レコード
   * @param {Object} typeDefinition - 型定義
   * @returns {Object} 正規化後のレコード
   */
  static normalizeRecord(record, typeDefinition) {
    if (!record || typeof record !== 'object') return record;

    const normalized = { ...record };

    if (typeDefinition) {
      Object.entries(typeDefinition).forEach(([field, fieldDef]) => {
        if (normalized[field] !== undefined) {
          normalized[field] = this.normalizeField(normalized[field], fieldDef);
        }
      });
    }

    return normalized;
  }

  /**
   * フィールド値を正規化
   * @param {any} value - 正規化対象値
   * @param {Object} fieldDef - フィールド定義
   * @returns {any} 正規化後の値
   */
  static normalizeField(value, fieldDef) {
    if (value == null) return value;

    const type = fieldDef?.type || 'string';

    switch (type) {
      case 'number':
        return this.toNumber(value);
      case 'boolean':
        return this.toBoolean(value);
      case 'array':
        return this.toArray(value);
      case 'string':
        return this.toString(value);
      case 'date':
        return this.toDate(value);
      default:
        return value;
    }
  }

  /**
   * 数値に変換
   * @param {any} value - 変換対象値
   * @returns {number|null} 数値またはnull
   */
  static toNumber(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? null : num;
    }
    return null;
  }

  /**
   * 真偽値に変換
   * @param {any} value - 変換対象値
   * @returns {boolean} 真偽値
   */
  static toBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on';
    }
    if (typeof value === 'number') return value !== 0;
    return Boolean(value);
  }

  /**
   * 配列に変換
   * @param {any} value - 変換対象値
   * @returns {Array} 配列
   */
  static toArray(value) {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
  }

  /**
   * 文字列に変換
   * @param {any} value - 変換対象値
   * @returns {string} 文字列
   */
  static toString(value) {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    return String(value);
  }

  /**
   * 日付に変換
   * @param {any} value - 変換対象値
   * @returns {Date|null} 日付オブジェクトまたはnull
   */
  static toDate(value) {
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  }
}

// 環境に応じたエクスポート
if (typeof self !== 'undefined') {
  // Service Worker環境
  self.ReferenceResolver = ReferenceResolver;
  self.EnrichmentProcessor = EnrichmentProcessor;
  self.ImageProcessor = ImageProcessor;
  self.DataNormalizer = DataNormalizer;
  self.TypeDefUtils = TypeDefUtils;
} else if (typeof window !== 'undefined') {
  // ブラウザ環境
  window.ReferenceResolver = ReferenceResolver;
  window.EnrichmentProcessor = EnrichmentProcessor;
  window.ImageProcessor = ImageProcessor;
  window.DataNormalizer = DataNormalizer;
  window.TypeDefUtils = TypeDefUtils;
} else if (typeof globalThis !== 'undefined') {
  // Node/Vitest 等（テスト用）
  globalThis.ReferenceResolver = ReferenceResolver;
  globalThis.EnrichmentProcessor = EnrichmentProcessor;
  globalThis.ImageProcessor = ImageProcessor;
  globalThis.DataNormalizer = DataNormalizer;
  globalThis.TypeDefUtils = TypeDefUtils;
}

console.log('💾 データ処理共通ライブラリがロードされました');