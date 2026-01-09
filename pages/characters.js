/**
 * @fileoverview Characters page for 100BeautiesLab Creations Database
 *
 * This module provides a responsive character browser that works with GitHub Pages
 * by using Service Worker-based API routing to avoid ad-blocker interference.
 *
 * Key Features:
 * - Multi-prefix Service Worker registration (/pages/v1, /svc/v1, /api/v1)
 * - Dynamic work and database selection
 * - Real-time search filtering with debouncing
 * - Responsive character list and detail views
 * - Image gallery based on db_type.json definitions
 * - Reference resolution and Commons data inheritance
 * - Cache/Service Worker reset functionality for debugging
 *
 * Architecture:
 * - Vanilla HTML/CSS/JS with CSS Grid responsive layouts
 * - Service Worker pseudo-API for GitHub Pages compatibility
 * - Static JSON data consumption with client-side processing
 * - Type-driven image field extraction and gallery rendering
 *
 * @author 100BeautiesLab Creations Database Team
 * @version 1.0.0
 */

// Characters page: fetch from /api/v1 and render list/detail

// Global initialization tracking to prevent duplicate setup
let isInitialized = false;

// Global metadata cache to reduce API calls
let globalMetaCache = null;
let globalTypeDefCache = null;
let globalDefTypeCache = null;
let workTypeDefCache = new Map();

/**
 * Utility Functions
 */

/** @type {function(string): HTMLElement} Query selector shorthand */
const $ = (sel) => document.querySelector(sel);
/** @type {function(string): HTMLElement[]} Query selector all shorthand */
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/**
 * Service Worker 管理
 * GitHub Pages 上で API ルートが動作するように、ページスコープの Service Worker を登録
 * 広告ブロッカーによる干渉を避けるためのフォールバック戦略を実装
 */

// GitHub Pages で API ルートが動作するように SW をインストール
// 広告ブロッカーを避けるために /pages を優先し、ページが独自の SW で制御されることを保証
let API_BASE_REL = '../pages/';

/**
 * Service Worker の登録（複数のフォールバック戦略付き）
 * 広告ブロッカーの制限を回避するため、/pages/, /svc/, /api/ の順で試行
 * @returns {Promise<void>} SW が準備完了してページを制御した時点で解決
 */
async function ensureApiSW() {
  if (!('serviceWorker' in navigator)) {
    console.warn('🚫 Service Worker はサポートされていません');
    return;
  }

  console.log('🔧 Service Worker の登録を試行中...');

  try {
    // 1) /pages/v1, /svc/v1, /api/v1 をインターセプトするページスコープ SW を登録
    const pageSwUrl = new URL('./sw.js', location.href).toString();
    const pageScope = new URL('./', location.href).pathname; // '/pages/'
    console.log(`🌐 プライマリ SW を登録: ${pageSwUrl} (スコープ: ${pageScope})`);
    const reg = await navigator.serviceWorker.register(pageSwUrl, { scope: pageScope });
    console.log('✅ プライマリ SW の登録に成功');
    API_BASE_REL = '../pages/';
    await navigator.serviceWorker.ready; // アクティベーションを待機
    console.log('✅ プライマリ SW の準備完了');
    await waitForController(); // フェッチを開始する前にこのページが制御されることを保証
    console.log('✅ プライマリ SW がページを制御中');
  } catch (err) {
    console.warn('❌ プライマリ SW の登録に失敗:', err);
    try {
      // 2) /svc へのフォールバック（エイリアスパス）
      const svcSwUrl = new URL('../svc/sw.js', location.href).toString();
      const svcScope = new URL('../svc/', location.href).pathname;
      console.log(`🌐 フォールバック SW を登録: ${svcSwUrl} (スコープ: ${svcScope})`);
      const reg2 = await navigator.serviceWorker.register(svcSwUrl, { scope: svcScope });
      console.log('✅ フォールバック SW の登録に成功');
      API_BASE_REL = '../svc/';
      await navigator.serviceWorker.ready;
      console.log('✅ フォールバック SW の準備完了');
      await waitForController();
      console.log('✅ フォールバック SW がページを制御中');
    } catch (err2) {
      console.warn('❌ フォールバック SW の登録に失敗:', err2);
      try {
        // 3) /api への最終フォールバック
        const apiSwUrl = new URL('../api/sw.js', location.href).toString();
        const apiScope = new URL('../api/', location.href).pathname;
        console.log(`🌐 最終フォールバック SW を登録: ${apiSwUrl} (スコープ: ${apiScope})`);
        const reg3 = await navigator.serviceWorker.register(apiSwUrl, { scope: apiScope });
        console.log('✅ 最終フォールバック SW の登録に成功');
        API_BASE_REL = '../api/';
        await navigator.serviceWorker.ready;
        console.log('✅ 最終フォールバック SW の準備完了');
        await waitForController();
        console.log('✅ 最終フォールバック SW がページを制御中');
      } catch (err3) {
        console.error('❌ すべての SW 登録試行が失敗:', err3);
        // no-op; SW が利用できない場合、GH Pages でフェッチは 404 になる
      }
    }
  }
}

/**
 * URL パラメータ管理
 */

/**
 * 現在のクエリ文字列パラメータをオブジェクトとして取得
 * @returns {Object} work, db, num, q プロパティを持つオブジェクト
 */
function getQS() {
  const p = new URLSearchParams(location.search);
  return {
    work: p.get('work') || '',
    db: p.get('db') || '',
    num: p.get('num') || '',
    q: p.get('q') || ''
  };
}

/**
 * ページリロードなしでクエリ文字列パラメータを更新
 * @param {Object} next - 更新するパラメータのオブジェクト
 */
function setQS(next) {
  const cur = getQS();
  const qs = new URLSearchParams({ ...cur, ...next });
  history.replaceState(null, '', `${location.pathname}?${qs.toString()}`);
}

/**
 * API URL 構築
 */

/**
 * 現在の API_BASE_REL を基準とした API URL を構築
 * @param {string} path - API パス (例: 'v1/works' または '/v1/works')
 * @returns {string} 完全な API URL
 */
function api(path) {
  const base = new URL(API_BASE_REL, location.href);
  // 'v1/...' または '/v1/...' のようなパスをサポート
  const p = String(path || '').replace(/^\/?/, '');
  return new URL(p, base).toString();
}

/**
 * Service Worker 制御管理
 */

/**
 * このページが Service Worker によって制御されるまで待機
 * @param {number} timeoutMs - タイムアウト時間（ミリ秒、デフォルト: 3000）
 * @returns {Promise<void>} ページが制御されるかタイムアウト時に解決
 */
function waitForController(timeoutMs = 3000) {
  if (navigator.serviceWorker.controller) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const to = setTimeout(() => { if (!done) { done = true; resolve(); } }, timeoutMs);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!done) {
        done = true;
        clearTimeout(to);
        resolve();
      }
    });
  });
}

/**
 * HTTP リクエストユーティリティ
 */

/**
 * URL から JSON をフェッチして解析（タイムアウトと拡張エラーハンドリング付き）
 * @param {string} url - フェッチする URL
 * @param {number} timeout - タイムアウト時間（ミリ秒、デフォルト: 10秒）
 * @returns {Promise<Object>} 解析された JSON レスポンス
 * @throws {Error} リクエストが失敗するかレスポンスが OK でない場合
 */
async function fetchJSON(url, timeout = 10000) {
  console.log('🌐 フェッチ中:', url);
  const startTime = performance.now();

  try {
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Request timeout after ${timeout}ms`)), timeout)
    );

    // Race between fetch and timeout
    const fetchPromise = fetch(url, {
      headers: { 'Accept': 'application/json' },
      cache: 'default' // Use browser cache to improve performance
    });

    const res = await Promise.race([fetchPromise, timeoutPromise]);
    const fetchTime = performance.now() - startTime;

    if (!res.ok) {
      console.error('❌ Fetch failed:', {
        status: res.status,
        statusText: res.statusText,
        url: url,
        time: `${fetchTime.toFixed(2)}ms`,
        headers: Object.fromEntries(res.headers.entries())
      });
      throw new Error(`${res.status} ${res.statusText} ${url}`);
    }

    const parseStart = performance.now();
    const data = await res.json();
    const parseTime = performance.now() - parseStart;
    const totalTime = performance.now() - startTime;

    console.log('✅ Fetch success:', url, {
      fetchTime: `${fetchTime.toFixed(2)}ms`,
      parseTime: `${parseTime.toFixed(2)}ms`,
      totalTime: `${totalTime.toFixed(2)}ms`,
      responseSize: `${JSON.stringify(data).length} chars`
    });

    return data;
  } catch (error) {
    const totalTime = performance.now() - startTime;
    console.error('❌ Fetch error:', {
      message: error.message,
      url: url,
      time: `${totalTime.toFixed(2)}ms`,
      type: error.constructor.name
    });
    throw error;
  }
}

/**
 * データフェッチ関数群
 */

/**
 * 利用可能な作品のリストを取得
 * @returns {Promise<Array>} 作品オブジェクトの配列
 */
async function listWorks() {
  return fetchJSON(api('v1/works'));
}

/**
 * 特定の作品のデータベースリストを取得
 * @param {string} workKey - 作品識別子
 * @returns {Promise<Array>} データベース名の配列
 */
async function listWorkDBs(workKey) {
  const w = workKeyForAPI(workKey);
  const r = await fetchJSON(api(`v1/works/${encodeURIComponent(w)}/db`));
  return r.databases || [];
}

/**
 * 参照解決とデバッグ情報を含むキャラクターデータベースをフェッチ
 * @param {string} workKey - 作品識別子
 * @param {string} dbName - データベース名 (例: 'Primary', 'Secondary')
 * @param {Object} options - フェッチオプション
 * @param {boolean} options.resolve - 参照を解決するかどうか（デフォルト: true）
 * @param {boolean} options.debug - デバッグ情報を含めるかどうか（デフォルト: false）
 * @returns {Promise<Array>} キャラクターレコードの配列
 */
async function fetchDB(workKey, dbName, { resolve = true, debug = false } = {}) {
  const w = workKeyForAPI(workKey);
  const u = new URL(api(`v1/works/${encodeURIComponent(w)}/db/${encodeURIComponent(dbName)}`));
  if (resolve) u.searchParams.set('resolve', '1');
  if (debug) u.searchParams.set('debug', '1');
  return fetchJSON(u.toString());
}

/**
 * データ正規化ユーティリティ
 */

/**
 * 作品識別子を正規化して適切な #Works_ プレフィックスを確保
 * @param {string} id - 様々な形式の作品識別子
 * @returns {string} #Works_ プレフィックス付きの正規化された作品ID
 */
function normalizeWorkKey(id) {
  if (!id) return id;
  if (id.startsWith('#Works_')) return id;
  if (id.startsWith('Works_')) return `#${id}`;
  return `#Works_${id}`;
}

/**
 * Convert work key to API-safe format for URL encoding
 * Removes # prefix to avoid encoding issues in URLs
 * @param {string} workKey - Work key like '#Works_NumberTales'
 * @returns {string} API-safe work key like 'Works_NumberTales'
 */
function workKeyForAPI(workKey) {
  const normalized = normalizeWorkKey(workKey);
  return normalized.startsWith('#') ? normalized.substring(1) : normalized;
}

/**
 * DOM Helper Functions
 */

/**
 * Create DOM element with properties and children (type-safe, array-flattening)
 * Enhanced version that handles arrays and type conversion gracefully
 * @param {string} tag - HTML tag name
 * @param {Object} props - Element properties and attributes
 * @param {Array|*} children - Child elements (supports nested arrays and mixed types)
 * @returns {HTMLElement} Created DOM element
 */
function el(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.substring(2), v);
    else e.setAttribute(k, v);
  }
  const appendAny = (child) => {
    if (child == null) return;
    if (Array.isArray(child)) { child.forEach(appendAny); return; }
    if (child instanceof Node) { e.appendChild(child); return; }
    const t = typeof child;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      e.appendChild(document.createTextNode(String(child)));
      return;
    }
    // otherwise ignore unsupported types
  };
  [].concat(children).forEach(appendAny);
  return e;
}

/**
 * Fetch work metadata including Commons and database info
 * @param {string} workKey - Work key like '#Works_NumberTales'
 * @returns {Promise<Object>} Work metadata object
 */
async function fetchWorkMeta(workKey) {
  const w = workKeyForAPI(workKey);
  const u = new URL(api(`v1/works/${encodeURIComponent(w)}/meta`));
  try {
    const res = await fetchJSON(u.toString());
    return res.meta || {};
  } catch (error) {
    console.warn('⚠️ Failed to fetch work meta:', workKey, error.message);
    return {};
  }
}

/**
 * Fetch global metadata including work definitions and index info
 * @returns {Promise<Object>} Global metadata object
 */
async function fetchGlobalMeta() {
  if (globalMetaCache) return globalMetaCache;

  const u = new URL(api('v1/meta'));
  try {
    const res = await fetchJSON(u.toString());
    globalMetaCache = res.meta || {};
    return globalMetaCache;
  } catch (error) {
    console.warn('⚠️ Failed to fetch global meta:', error.message);
    globalMetaCache = {};
    return {};
  }
}

/**
 * Fetch global type definitions from ./data/db_type.json
 * @returns {Promise<Object>} Global type definitions
 */
async function fetchGlobalTypeDef() {
  if (globalTypeDefCache) return globalTypeDefCache;

  const u = new URL(api('v1/typedef/global'));
  try {
    const res = await fetchJSON(u.toString());
    console.log('🌐 Global TypeDef response:', res);
    globalTypeDefCache = res || {};
    return globalTypeDefCache;
  } catch (error) {
    console.warn('⚠️ Failed to fetch global type def:', error.message);
    globalTypeDefCache = {};
    return {};
  }
}

/**
 * Fetch global definition types (enum definitions, etc.)
 * @returns {Promise<Object>} Global definition types
 */
async function fetchGlobalDefType() {
  if (globalDefTypeCache) return globalDefTypeCache;

  const u = new URL(api('v1/deftype/global'));
  try {
    const res = await fetchJSON(u.toString());
    globalDefTypeCache = res || {};
    return globalDefTypeCache;
  } catch (error) {
    console.warn('⚠️ Failed to fetch global def type:', error.message);
    globalDefTypeCache = {};
    return {};
  }
}

/**
 * Fetch work-specific type definitions
 * @param {string} workKey - Work key like '#Works_NumberTales'
 * @returns {Promise<Object>} Work-specific type definitions
 */
async function fetchWorkTypeDef(workKey) {
  const normalizedKey = normalizeWorkKey(workKey);

  if (workTypeDefCache.has(normalizedKey)) {
    return workTypeDefCache.get(normalizedKey);
  }

  const w = workKeyForAPI(workKey);
  const u = new URL(api(`v1/works/${encodeURIComponent(w)}/typedef`));
  try {
    const res = await fetchJSON(u.toString());
    console.log('🏢 Work TypeDef response for', workKey, ':', res);
    const typeDef = res.typedef || res || {};
    workTypeDefCache.set(normalizedKey, typeDef);
    return typeDef;
  } catch (error) {
    console.warn('⚠️ Failed to fetch work type def:', workKey, error.message);
    workTypeDefCache.set(normalizedKey, {});
    return {};
  }
}/**
 * Apply Commons data from work metadata to character records
 * @param {Array} records - Array of character records
 * @param {Object} workMeta - Work metadata containing Commons data
 * @param {string} dbName - Database name for specific Commons
 * @returns {Array} Records with Commons data applied
 */
function applyCommonsData(records, workMeta, dbName) {
  if (!workMeta || !workMeta.Databases) return records;

  const dbKey = `#DB_${dbName}`;
  const dbMeta = workMeta.Databases[dbKey];
  if (!dbMeta || !dbMeta._Commons) return records;

  const commons = dbMeta._Commons;

  return records.map(record => {
    const enriched = { ...record };

    // Apply Commons values for missing fields
    Object.entries(commons).forEach(([key, value]) => {
      if (enriched[key] === undefined || enriched[key] === null || enriched[key] === '') {
        enriched[key] = value;
      }
    });

    return enriched;
  });
}

/**
 * Get work index field information from global metadata
 * @param {string} workKey - Work identifier
 * @param {Object} globalMeta - Global metadata object
 * @returns {Object|null} Index field definition or null
 */
function getWorkIndexField(workKey, globalMeta) {
  if (!globalMeta || !globalMeta.CreationWorks) return null;

  const workMeta = globalMeta.CreationWorks[workKey];
  return workMeta ? workMeta.$DefType_Index : null;
}

/**
 * Enhanced dynamic image field extraction from type definitions
 * Supports comprehensive image field detection across all works
 * @param {Array|Object} workTypeDef - Work-specific type definitions
 * @param {Object} globalTypeDef - Global type definitions from ./data/db_type.json
 * @returns {Array} Array of image field specs like [{field: 'concept_PNGName', type: '#PNGFileName', label: '設定原画', category: 'concept', priority: 1}]
 */
function extractImageFields(workTypeDef, globalTypeDef = {}) {
  const imageFields = [];
  const processedFields = new Set(); // Avoid duplicates

  console.log('🖼️ Enhanced image field extraction:', { workTypeDef, globalTypeDef });

  // Image field categorization for better organization
  const getImageCategory = (fieldName, type) => {
    const field = fieldName.toLowerCase();

    // より具体的なマッチングを優先（cardDesign_PNGNameがcardカテゴリになるように）
    if (field.includes('carddesign')) return { category: 'card', priority: 2 };
    if (field.includes('conceptalt')) return { category: 'concept', priority: 1 };
    if (field.includes('designalt')) return { category: 'design', priority: 2 };

    // 一般的なマッチング
    if (field.includes('concept')) return { category: 'concept', priority: 1 };
    if (field.includes('design')) return { category: 'design', priority: 2 };
    if (field.includes('arts') || field.includes('art')) return { category: 'arts', priority: 3 };
    if (field.includes('card')) return { category: 'card', priority: 2 };
    if (field.includes('catalog')) return { category: 'catalog', priority: 4 };
    if (field.includes('core')) return { category: 'core', priority: 2 };
    if (field.includes('general')) return { category: 'general', priority: 5 };
    return { category: 'other', priority: 6 };
  };

  // Enhanced image type detection
  const isImageField = (fieldName, type) => {
    if (!fieldName || !type) return false;
    const field = fieldName.toLowerCase();
    const typeStr = String(type).toLowerCase();

    // Direct image type indicators
    if (typeStr.includes('png') || typeStr.includes('jpg') || typeStr.includes('jpeg') ||
        typeStr.includes('gif') || typeStr.includes('webp') || typeStr.includes('image') ||
        typeStr.includes('photo') || typeStr.includes('picture')) return true;

    // Field name indicators
    if (field.includes('image') || field.includes('img') || field.includes('png') ||
        field.includes('photo') || field.includes('picture') || field.includes('poster') ||
        field.includes('concept') || field.includes('design') || field.includes('arts') ||
        field.includes('card') || field.includes('catalog')) return true;

    return false;
  };

  const traverse = (items, path = [], source = '') => {
    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;

      const currentPath = [...path];
      if (item.hashTag) currentPath.push(item.hashTag);

      // Process Images container
      if (item.hashTag === 'Images' && Array.isArray(item.$type)) {
        console.log(`🎯 Found ${item.hashTag} container (${source}):`, item.$type);
        for (const child of item.$type) {
          if (child.hashTag && !processedFields.has(child.hashTag)) {
            const { category, priority } = getImageCategory(child.hashTag, child.$type);
            const fieldSpec = {
              field: child.hashTag,
              type: child.$type || '#PNGFileName',
              label: child.hashTag_JP || child.hashTag,
              path: ['Images', child.hashTag],
              category,
              priority,
              source
            };
            imageFields.push(fieldSpec);
            processedFields.add(child.hashTag);
            console.log(`✅ Added image field (${source}):`, fieldSpec);
          }
        }
      }
      // Process standalone image fields
      else if (item.hashTag && isImageField(item.hashTag, item.$type) && !processedFields.has(item.hashTag)) {
        const { category, priority } = getImageCategory(item.hashTag, item.$type);
        const fieldSpec = {
          field: item.hashTag,
          type: item.$type,
          label: item.hashTag_JP || item.hashTag,
          path: currentPath,
          category,
          priority,
          source
        };
        imageFields.push(fieldSpec);
        processedFields.add(item.hashTag);
        console.log(`✅ Added standalone image field (${source}):`, fieldSpec);
      }
      // Recursively process nested structures
      else if (Array.isArray(item.$type)) {
        traverse(item.$type, currentPath, source);
      }
    }
  };

  // Process global type definitions first (lower priority)
  if (globalTypeDef && globalTypeDef.$DefType) {
    console.log('🌐 Processing global type definitions...');
    traverse(globalTypeDef.$DefType, [], 'global');
  } else if (globalTypeDef && globalTypeDef.global) {
    console.log('🌐 Processing global typedef response...');
    traverse(globalTypeDef.global, [], 'global');
  }

  // Process work-specific definitions (higher priority, will override)
  if (Array.isArray(workTypeDef)) {
    console.log('� Processing work type definitions (array)...');
    traverse(workTypeDef, [], 'work');
  } else if (workTypeDef && workTypeDef.typedef) {
    console.log('� Processing work typedef.typedef...');
    traverse(workTypeDef.typedef, [], 'work');
  } else if (workTypeDef && workTypeDef.$DefType) {
    console.log('🏢 Processing work $DefType...');
    traverse(workTypeDef.$DefType, [], 'work');
  }

  // Sort by priority and category for better organization
  imageFields.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.field.localeCompare(b.field);
  });

  console.log('🖼️ Final extracted image fields:', imageFields);
  return imageFields;
}

/**
 * Build comprehensive field label mapping from global and work-specific type definitions
 * @param {Array|Object} workTypeDef - Work-specific type definitions
 * @param {Object} globalTypeDef - Global type definitions from ./data/db_type.json
 * @returns {Object} Mapping of field names to Japanese labels
 */
function buildFieldLabelMap(workTypeDef, globalTypeDef = {}) {
  const labelMap = {};

  console.log('🏷️ Building field label map:', {
    globalTypeDef: globalTypeDef,
    workTypeDef: workTypeDef
  });

  const traverse = (items, path = [], source = '') => {
    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;

      const currentPath = item.hashTag ? [...path, item.hashTag] : path;

      // Map this field if it has a Japanese label
      if (item.hashTag && item.hashTag_JP) {
        labelMap[item.hashTag] = item.hashTag_JP;
        labelMap[currentPath.join('.')] = item.hashTag_JP;

        console.log(`📝 Mapped field (${source}):`, item.hashTag, '→', item.hashTag_JP);

        // Also map short path versions for nested access
        if (currentPath.length > 1) {
          labelMap[currentPath.slice(-1)[0]] = item.hashTag_JP;
        }
      }

      // Recursively process nested fields
      if (Array.isArray(item.$type)) {
        traverse(item.$type, currentPath, source);
      } else if (item.$type && typeof item.$type === 'object' && !Array.isArray(item.$type)) {
        // Handle single nested objects
        traverse([item.$type], currentPath, source);
      }
    }
  };

  // First process global type definitions (lower priority)
  if (globalTypeDef && globalTypeDef.global) {
    console.log('🌐 Processing global typedef:', globalTypeDef.global);
    traverse(globalTypeDef.global, [], 'global');
  } else if (globalTypeDef && globalTypeDef.$DefType) {
    console.log('🌐 Processing global $DefType:', globalTypeDef.$DefType);
    traverse(globalTypeDef.$DefType, [], 'global');
  }

  // Then process work-specific definitions (higher priority, will override)
  if (Array.isArray(workTypeDef)) {
    console.log('🏢 Processing work typedef array:', workTypeDef);
    traverse(workTypeDef, [], 'work');
  } else if (workTypeDef && workTypeDef.typedef) {
    console.log('🏢 Processing work typedef.typedef:', workTypeDef.typedef);
    traverse(workTypeDef.typedef, [], 'work');
  } else if (workTypeDef && workTypeDef.$DefType) {
    console.log('🏢 Processing work $DefType:', workTypeDef.$DefType);
    traverse(workTypeDef.$DefType, [], 'work');
  }

  console.log('🏷️ Final label map:', labelMap);
  return labelMap;

  return labelMap;
}

/**
 * Get localized field label from type definitions with global fallback support
 * @param {string} fieldName - Field name like 'Name' or 'GenderType'
 * @param {Object} labelMap - Field label mapping from buildFieldLabelMap
 * @param {Object} workMeta - Work metadata for additional label lookup
 * @param {Object} globalDefType - Global definition types for enum lookups
 * @param {string} fallback - Fallback display name
 * @returns {string} Localized label or fallback
 */
function getFieldLabel(fieldName, labelMap, workMeta = null, globalDefType = null, fallback = null) {
  // Try exact match first
  if (labelMap[fieldName]) return labelMap[fieldName];

  // Try without path prefixes
  const simpleName = fieldName.split('.').pop();
  if (labelMap[simpleName]) return labelMap[simpleName];

  // Try with common prefixes/suffixes
  const variations = [
    fieldName + '_JP',
    fieldName.replace('_JP', ''),
    fieldName.replace('_EN', ''),
    fieldName.replace('Text', ''),
    fieldName.replace('Type', ''),
    fieldName.replace('Stats', ''),
    fieldName.replace('Level', '')
  ];

  for (const variation of variations) {
    if (labelMap[variation]) return labelMap[variation];
  }

  // Try lookup in global definition types
  if (globalDefType && globalDefType.General && globalDefType.General.$VarsDef) {
    const globalVarsDef = globalDefType.General.$VarsDef;

    // Check enum definitions
    if (globalVarsDef[`$EnumDef_${fieldName}`]) {
      return globalVarsDef[`$EnumDef_${fieldName}`][`#${fieldName}`]?.[`${fieldName}_JP`] || fieldName;
    }

    // Check list definitions
    if (globalVarsDef[`#List_${fieldName}`]) {
      const listDef = globalVarsDef[`#List_${fieldName}`];
      if (Array.isArray(listDef) && listDef[0] && listDef[0][`${fieldName}_JP`]) {
        return `${fieldName}（複数選択可）`;
      }
    }
  }

  // Try lookup in work metadata
  if (workMeta && workMeta.$VarsDef) {
    const varsDef = workMeta.$VarsDef;
    for (const section of Object.values(varsDef)) {
      if (section && typeof section === 'object') {
        for (const subSection of Object.values(section)) {
          if (subSection && Array.isArray(subSection)) {
            for (const item of subSection) {
              if (item && (item.EffectText === fieldName || item.SafetyLevelText === fieldName)) {
                return item.EffectText_JP || item.SafetyLevelText_JP || fieldName;
              }
            }
          }
        }
      }
    }
  }

  return fallback || fieldName;
}

/**
 * Format value for display with global definition type support
 * @param {any} value - Value to format
 * @param {Object} labelMap - Field label mapping for nested objects
 * @param {Object} workMeta - Work metadata for lookup
 * @param {Object} globalDefType - Global definition types for enum/list lookups
 * @returns {string} Formatted display value
 */
function formatValueForDisplay(value, labelMap = {}, workMeta = null, globalDefType = null) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(item => formatValueForDisplay(item, labelMap, workMeta, globalDefType)).filter(v => v).join(', ');
  }

  if (typeof value === 'object') {
    // Handle objects with common text patterns
    if (value.Rank && value.EffectText) {
      const effectLabel = value.EffectText_JP || value.EffectText;
      return `${value.Rank} (${effectLabel})`;
    }

    if (value.Rank && value.SafetyLevelText) {
      const safetyLabel = value.SafetyLevelText_JP || value.SafetyLevelText;
      return `${value.Rank} (${safetyLabel})`;
    }

    if (value.Rank && value.AbilityText) {
      const abilityLabel = value.AbilityText_JP || value.AbilityText;
      return `${value.Rank} (${abilityLabel})`;
    }

    // Handle global definition lookups
    if (globalDefType && globalDefType.General && globalDefType.General.$VarsDef) {
      const varsDef = globalDefType.General.$VarsDef;

      // Check if this matches a global enum pattern
      for (const [enumKey, enumDef] of Object.entries(varsDef)) {
        if (enumKey.startsWith('$EnumDef_') && typeof enumDef === 'object') {
          for (const [valueKey, valueDef] of Object.entries(enumDef)) {
            if (typeof valueDef === 'object' && Object.values(valueDef).some(v => v === value.GenderType || v === value.RaceType || v === value.Progress)) {
              // Return Japanese version if available
              const jpField = Object.keys(valueDef).find(k => k.endsWith('_JP'));
              if (jpField && valueDef[jpField]) {
                return valueDef[jpField];
              }
            }
          }
        }
      }

      // Check if this matches a global list pattern
      for (const [listKey, listDef] of Object.entries(varsDef)) {
        if (listKey.startsWith('#List_') && Array.isArray(listDef)) {
          for (const item of listDef) {
            if (typeof item === 'object' && Object.values(item).some(v => v === value.Area || v === value.Belonging || v === value.RaceType)) {
              // Return Japanese version if available
              const jpField = Object.keys(item).find(k => k.endsWith('_JP'));
              if (jpField && item[jpField]) {
                return item[jpField];
              }
            }
          }
        }
      }
    }

    // Try Japanese version first, then English, then raw value
    const jpKeys = Object.keys(value).filter(k => k.endsWith('_JP'));
    if (jpKeys.length > 0) {
      return jpKeys.map(k => value[k]).filter(v => v).join(', ');
    }

    const enKeys = Object.keys(value).filter(k => k.endsWith('_EN'));
    if (enKeys.length > 0) {
      return enKeys.map(k => value[k]).filter(v => v).join(', ');
    }

    // Try common text fields
    const textFields = ['Text', 'Name', 'Label', 'Value', 'Material', 'Pattern'];
    for (const field of textFields) {
      if (value[field]) {
        return String(value[field]);
      }
    }

    // Fallback: show non-empty primitive values
    const primitives = Object.entries(value)
      .filter(([k, v]) => typeof v === 'string' || typeof v === 'number')
      .filter(([k, v]) => v !== '' && v !== null && v !== undefined)
      .map(([k, v]) => v);

    if (primitives.length > 0) {
      return primitives.join(', ');
    }
  }

  return String(value);
}

/**
 * Enhanced image gallery building with dynamic field resolution
 * Creates gallery items with appropriate URLs based on extracted image fields
 * @param {string} workId - Work ID
 * @param {Object} record - Character record
 * @param {Array} imageFields - Image field specifications from extractImageFields
 * @param {string} dbName - Database name (e.g., 'Primary', 'Secondary', etc.)
 * @returns {Array} Array of {url, caption, type, alt, category} objects
 */
function buildImageGallery(workId, record, imageFields, dbName = 'Primary') {
  const wdir = workId.replace('#Works_', 'Works_');
  const images = [];
  // Support both "Images" field names
  const imgData = record.Images || {};

  console.log('🖼️ Enhanced gallery building:', {
    workId,
    dbName,
    fieldCount: imageFields.length,
    recordName: record.Name || record.FormalName || 'Unknown',
    imgData
  });

  // Sort image fields by priority for consistent ordering
  const sortedFields = [...imageFields].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.field.localeCompare(b.field);
  });

  for (const field of sortedFields) {
    const value = imgData[field.field];
    if (!value) {
      console.log(`⚠️ No value for image field: ${field.field}`);
      continue;
    }

    const isArray = field.type.includes('[]') || Array.isArray(value);
    const values = isArray ? (Array.isArray(value) ? value : [value]) : [value];

    console.log(`🔍 Processing field '${field.field}' (category: ${field.category}):`, {
      value,
      isArray,
      values,
      priority: field.priority
    });

    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      if (!val) continue;

      // Use the enhanced buildImagePath function
      const url = buildImagePath(wdir, dbName, field, val);

      if (url) {
        const imageItem = {
          url,
          caption: field.label + (isArray && values.length > 1 ? ` (${i + 1}/${values.length})` : ''),
          type: field.field,
          alt: `${field.label} - ${record.Name || record.FormalName || 'Character'}`,
          category: field.category,
          priority: field.priority
        };

        images.push(imageItem);
        console.log(`✅ Added gallery image: ${field.field} -> ${url}`);
      } else {
        console.log(`❌ Failed to build path for field: ${field.field}, value: ${val}`);
      }
    }
  }

  // Also add any unrecognized image fields as fallback
  for (const [key, value] of Object.entries(imgData)) {
    // Skip if already processed by field definitions
    if (sortedFields.some(f => f.field === key)) continue;

    // Only process fields that look like image fields
    const keyLower = key.toLowerCase();
    if (keyLower.includes('png') || keyLower.includes('image') || keyLower.includes('photo')) {
      const vals = Array.isArray(value) ? value : [value];

      for (let i = 0; i < vals.length; i++) {
        const val = vals[i];
        if (!val) continue;

        // Create a fallback field definition
        const fallbackField = {
          field: key,
          category: 'other',
          priority: 99,
          label: key
        };

        const url = buildImagePath(wdir, dbName, fallbackField, val);
        if (url) {
          const imageItem = {
            url,
            caption: `${key}${vals.length > 1 ? ` (${i + 1}/${vals.length})` : ''}`,
            type: key,
            alt: `${key} - ${record.Name || record.FormalName || 'Character'}`,
            category: 'other',
            priority: 99
          };

          images.push(imageItem);
          console.log(`✅ Added fallback gallery image: ${key} -> ${url}`);
        }
      }
    }
  }

  console.log(`🖼️ Final gallery: ${images.length} images built`);
  return images;
}

/**
 * UI Display Utilities
 */

/**
 * Convert work object to human-readable label
 * @param {Object} work - Work object with WorkKey and Title properties
 * @returns {string} Human-readable work label
 */
function humanWorkLabel(work) {
  const t = work.Title || work.Title_EN || work.key || '';
  return `${t} (${work.key.replace('#Works_', '')})`;
}

/**
 * Get primary image for character list thumbnail
 * @param {string} workId - Work ID
 * @param {Object} rec - Character record
 * @returns {string} Image URL or empty string
 */

/**
 * Enhanced unified image resolution system
 * Dynamically resolves image paths based on extracted image fields and database structure
 * @param {string} workId - Work identifier (e.g., '#Works_NumberTales')
 * @param {Object} rec - Character record with Images field
 * @param {string} dbName - Database name (e.g., 'Primary', 'Secondary', etc.)
 * @param {Array} imageFields - Optional extracted image fields for this work
 * @returns {string} Image URL or empty string if no image found
 */
async function imageFromRecord(workId, rec, dbName = 'Primary', imageFields = null) {
  const wdir = workId.replace('#Works_', 'Works_');
  // Support both "Images" field names
  const img = rec.Images || {};

  console.log('🖼️ Enhanced image resolution for record:', {
    workId,
    dbName,
    img,
    recordName: rec.Name || rec.FormalName || 'Unknown',
    hasImageFields: !!imageFields
  });

  // If image fields provided, use dynamic resolution
  if (imageFields && imageFields.length > 0) {
    console.log('📋 Using dynamic image field resolution...');
    const primaryImage = await resolveImageFromFields(workId, rec, dbName, imageFields);
    if (primaryImage) {
      console.log('✅ Found image via dynamic resolution:', primaryImage);
      return primaryImage;
    }
  }

  // Fallback to legacy static resolution with enhanced flexibility
  console.log('🔄 Using enhanced static image resolution...');
  return resolveImageStatically(workId, rec, dbName);
}

/**
 * Resolve image using dynamically extracted image fields
 * @param {string} workId - Work identifier
 * @param {Object} rec - Character record
 * @param {string} dbName - Database name
 * @param {Array} imageFields - Extracted image field definitions
 * @returns {Promise<string>} Image URL or empty string
 */
async function resolveImageFromFields(workId, rec, dbName, imageFields) {
  const wdir = workId.replace('#Works_', 'Works_');
  // Support both "Images" field names
  const img = rec.Images || {};

  // Sort image fields by priority for thumbnail selection
  const sortedFields = [...imageFields].sort((a, b) => a.priority - b.priority);

  for (const field of sortedFields) {
    const fieldValue = img[field.field];
    if (!fieldValue) continue;

    console.log(`🔍 Checking field '${field.field}' (priority: ${field.priority}):`, fieldValue);

    // Handle array values (take first item)
    const value = Array.isArray(fieldValue) ? fieldValue[0] : fieldValue;
    if (!value) continue;

    // Build image URL based on field category and type
    const imageUrl = buildImagePath(wdir, dbName, field, value);
    if (imageUrl) {
      console.log(`✅ Built image URL for field '${field.field}':`, imageUrl);
      return imageUrl;
    }
  }

  console.log('❌ No image found via dynamic field resolution');
  return '';
}

/**
 * Build image path based on field definition and value
 * @param {string} wdir - Work directory name
 * @param {string} dbName - Database name
 * @param {Object} field - Image field definition
 * @param {string} value - Field value
 * @returns {string} Complete image path or empty string
 */
function buildImagePath(wdir, dbName, field, value) {
  if (!value) return '';

  console.log('🔍 Building image path:', { field: field.field, category: field.category, value });

  // Determine file extension
  const hasExtension = value.includes('.png') || value.includes('.jpg') || value.includes('.jpeg') ||
                      value.includes('.gif') || value.includes('.webp');
  const extension = hasExtension ? '' : '.png';

  // Determine directory based on field category and name
  let directory = '';
  const fieldLower = field.field.toLowerCase();

  if (field.category === 'concept') {
    directory = fieldLower.includes('alt') ? 'conceptAlt' : 'concept';
  } else if (field.category === 'design') {
    directory = fieldLower.includes('alt') ? 'designAlt' : 'design';
  } else if (field.category === 'arts') {
    directory = 'arts';
  } else if (field.category === 'card') {
    directory = 'cardDesign';
  } else if (field.category === 'catalog') {
    directory = 'catalog';
  } else if (field.category === 'core') {
    directory = 'corefolder';
  } else if (field.category === 'general') {
    directory = 'General';
  } else {
    // Try to infer from field name with specific matches first
    if (fieldLower.includes('carddesign')) {
      directory = 'cardDesign';
    } else if (fieldLower.includes('conceptalt')) {
      directory = 'conceptAlt';
    } else if (fieldLower.includes('designalt')) {
      directory = 'designAlt';
    } else if (fieldLower.includes('concept')) {
      directory = fieldLower.includes('alt') ? 'conceptAlt' : 'concept';
    } else if (fieldLower.includes('design')) {
      directory = fieldLower.includes('alt') ? 'designAlt' : 'design';
    } else if (fieldLower.includes('card')) {
      directory = 'cardDesign';
    } else if (fieldLower.includes('arts') || fieldLower.includes('art')) {
      directory = 'arts';
    } else if (fieldLower.includes('catalog')) {
      directory = 'catalog';
    } else if (fieldLower.includes('core')) {
      directory = 'corefolder';
    } else {
      directory = 'concept'; // Default fallback
    }
  }

  // Handle path-based values
  if (value.includes('/')) {
    // Value already contains path, use as-is relative to Images folder
    if (field.category === 'general' || directory === 'General') {
      return `/data/${wdir}/Images/General/${value}`;
    } else {
      return `/data/${wdir}/Images/${dbName}/${value}`;
    }
  }

  // Build standard path
  const finalPath = field.category === 'general' || directory === 'General'
    ? `/data/${wdir}/Images/General/${value}${extension}`
    : `/data/${wdir}/Images/${dbName}/${directory}/${value}${extension}`;

  console.log('📁 Final image path:', { field: field.field, category: field.category, directory, finalPath });

  return finalPath;
}

/**
 * Enhanced static image resolution with better fallback support
 * @param {string} workId - Work identifier
 * @param {Object} rec - Character record
 * @param {string} dbName - Database name
 * @returns {string} Image URL or empty string
 */
function resolveImageStatically(workId, rec, dbName) {
  const wdir = workId.replace('#Works_', 'Works_');
  // Support both "Images" field names
  const img = rec.Images || {};

  console.log('🔧 Enhanced static resolution for:', {
    workId,
    dbName,
    img,
    hasImages: !!rec.Images,
    hasImage: !!rec.Image,
    availableFields: Object.keys(img),
    recordName: rec.Name || rec.FormalName || 'Unknown'
  });

  // Enhanced priority list with more field types
  const imageResolvers = [
    // Concept images (highest priority)
    () => img.concept_PNGName ? `/data/${wdir}/Images/${dbName}/concept/${img.concept_PNGName}.png` : null,
    () => {
      if (img.conceptAlt_PNGName) {
        const val = Array.isArray(img.conceptAlt_PNGName) ? img.conceptAlt_PNGName[0] : img.conceptAlt_PNGName;
        return `/data/${wdir}/Images/${dbName}/conceptAlt/${val}.png`;
      }
      return null;
    },

    // Design images
    () => {
      if (img.design_PNGName) {
        const path = `/data/${wdir}/Images/${dbName}/design/${img.design_PNGName}.png`;
        console.log('🎨 Design image path resolved:', { field: 'design_PNGName', value: img.design_PNGName, path });
        return path;
      }
      return null;
    },
    () => {
      if (img.cardDesign_PNGName) {
        const path = `/data/${wdir}/Images/${dbName}/cardDesign/${img.cardDesign_PNGName}.png`;
        console.log('🃏 Card design image path resolved:', { field: 'cardDesign_PNGName', value: img.cardDesign_PNGName, path });
        return path;
      }
      return null;
    },
    () => {
      if (img.designAlt_PNGName) {
        const val = Array.isArray(img.designAlt_PNGName) ? img.designAlt_PNGName[0] : img.designAlt_PNGName;
        return `/data/${wdir}/Images/${dbName}/designAlt/${val}.png`;
      }
      return null;
    },
    () => {
      if (img.designAlt_PNGPath) {
        const val = Array.isArray(img.designAlt_PNGPath) ? img.designAlt_PNGPath[0] : img.designAlt_PNGPath;
        return `/data/${wdir}/Images/${dbName}/designAlt/${val}.png`;
      }
      return null;
    },

    // Arts images
    () => {
      if (img.arts_PNGPath) {
        const val = Array.isArray(img.arts_PNGPath) ? img.arts_PNGPath[0] : img.arts_PNGPath;
        return `/data/${wdir}/Images/${dbName}/arts/${val}.png`;
      }
      return null;
    },

    // Core folder images
    () => {
      if (img.corefolder_PNGPath) {
        const val = Array.isArray(img.corefolder_PNGPath) ? img.corefolder_PNGPath[0] : img.corefolder_PNGPath;
        return `/data/${wdir}/Images/${dbName}/corefolder/${val}.png`;
      }
      return null;
    },

    // Catalog images
    () => {
      if (img.catalog_PNGPath) {
        const val = Array.isArray(img.catalog_PNGPath) ? img.catalog_PNGPath[0] : img.catalog_PNGPath;
        const ext = val.endsWith('.png') ? '' : '.png';
        return `/data/${wdir}/Images/${dbName}/catalog/${val}${ext}`;
      }
      return null;
    },

    // General/poster images
    () => {
      if (img.General && img.General.poster) {
        return `/data/${wdir}/Images/General/${img.General.poster}`;
      }
      return null;
    },

    // Generic fallback - try any available image field
    () => {
      for (const [key, val] of Object.entries(img)) {
        if (val && (key.toLowerCase().includes('png') || key.toLowerCase().includes('image'))) {
          const value = Array.isArray(val) ? val[0] : val;
          if (value) {
            const ext = value.includes('.') ? '' : '.png';
            return `/data/${wdir}/Images/${dbName}/${key}/${value}${ext}`;
          }
        }
      }
      return null;
    }
  ];

  // Try each resolver in order
  for (const resolver of imageResolvers) {
    const url = resolver();
    if (url) {
      console.log('✅ Found static image:', url);
      return url;
    }
  }

  // Final fallback: try Primary folder if not already trying Primary
  if (dbName !== 'Primary') {
    console.log('🔄 Trying Primary folder fallback...');
    const fallbackUrl = resolveImageStatically(workId, rec, 'Primary');
    if (fallbackUrl) {
      console.log('✅ Found fallback image:', fallbackUrl);
      return fallbackUrl;
    }
  }

  console.log('❌ No image found for record');
  console.log('❌ No image found for record');
  return '';
}

/**
 * Load more images in gallery (performance optimization)
 * @param {string} workId - Work identifier
 * @param {Object} rec - Character record
 * @param {Array} imageFields - Image field definitions
 * @param {string} dbName - Database name
 * @param {Object} fieldLabelMap - Field label mapping
 * @param {Object} workMeta - Work metadata
 * @param {Object} globalDefType - Global type definitions
 */
function loadMoreImages(workId, rec, imageFields, dbName, fieldLabelMap, workMeta, globalDefType) {
  const galleryImages = buildImageGallery(workId, rec, imageFields, dbName);
  const imageGrid = document.querySelector('.image-grid');
  const moreButton = document.querySelector('.image-more');

  if (imageGrid && moreButton) {
    // Remove the "more" button
    moreButton.remove();

    // Add remaining images
    galleryImages.slice(6).forEach(imgData => {
      const imageItem = el('div', { class: 'image-item' }, [
        el('img', { src: imgData.url, alt: imgData.alt, loading: 'lazy' }),
        imgData.caption ? el('div', { class: 'caption' }, [imgData.caption]) : null
      ].filter(Boolean));
      imageGrid.appendChild(imageItem);
    });
  }
}

/**
 * Convert value to string safely
 * @param {*} v - Any value
 * @returns {string} String representation
 */

/**
 * Convert value to string safely
 * @param {*} v - Any value to convert
 * @returns {string} String representation, empty string for null/undefined
 */
function str(v) { return (v == null ? '' : String(v)); }

/**
 * Check if a record matches the search filter
 * @param {Object} rec - Character record to test
 * @param {string} q - Search query string
 * @returns {boolean} True if record matches filter
 */
function matchFilter(rec, q) {
  if (!q) return true;
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const keys = [
    rec.Name, rec.Name_EN, rec.FormalName, rec.FormalName_EN, rec.ModelName, rec.ModelNumber,
    rec.CodeName, rec.SPCodeName, rec.SPCodeName_EN, rec.Num
  ].map(str);
  return keys.some(k => String(k).toLowerCase().includes(s));
}

/**
/**
 * 動的画像解決を含む拡張リストビューレンダリング
 * @param {Array} records - キャラクターレコードの配列
 * @param {string} workId - 作品識別子 (例: '#Works_NumberTales')
 * @param {Function} onOpen - キャラクターが選択された時のコールバック関数
 * @param {Array} imageFields - 動的解決用の抽出された画像フィールド（オプション）
 */
async function renderList(records, workId, onOpen, imageFields = null) {
  const list = $('#list');
  list.innerHTML = '';
  let shown = 0;
  const qs = getQS();
  const filter = (qs.q || $('#search-input').value || '').trim();

  // グローバルステートから現在のデータベース名を取得
  const state = window.__CHAR_STATE__;
  const dbName = state ? state.db : 'Primary';

  console.log('📋 拡張画像解決でリストをレンダリング中:', {
    recordCount: records.length,
    workId,
    dbName,
    hasImageFields: !!imageFields
  });

  // レコード数が多い場合は画像解決のためのローディングを表示
  const shouldShowProgress = records.length > 10;
  if (shouldShowProgress) {
    showLoadingIndicator('キャラクター画像を読み込んでいます...');
  }

  const filteredRecords = records.filter(r => matchFilter(r, filter));

  for (let i = 0; i < filteredRecords.length; i++) {
    const r = filteredRecords[i];
    shown++;

    // Use enhanced image resolution
    const img = await imageFromRecord(workId, r, dbName, imageFields);

    const title = r.Name ? `${r.Name}${r.Num != null ? `（${r.Num}）` : ''}` : (r.FormalName || r.ModelName || r.Name_EN || '(No Name)');
    const sub = r.FormalName_EN || r.Name_EN || r.ModelNumber || '';
    const chipEls = [];

    // Enhanced chip generation with more field types
    if (r.GenderType_JP || r.GenderType) chipEls.push(el('span', { class: 'chip' }, r.GenderType_JP || r.GenderType));
    if (r.Class || r.Class_EN) chipEls.push(el('span', { class: 'chip' }, r.Class || r.Class_EN));
    if (r.RaceType_JP || r.RaceType) chipEls.push(el('span', { class: 'chip' }, r.RaceType_JP || r.RaceType));

    // Handle special index fields for different works
    if (r.Num != null && workId.includes('NumberTales')) {
      chipEls.push(el('span', { class: 'chip accent' }, `#${r.Num}`));
    } else if (r.Card && r.Card.Num != null && workId.includes('FLInvestigator')) {
      chipEls.push(el('span', { class: 'chip accent' }, `Card ${r.Card.Num}`));
    } else if (r.BeastType && r.BeastType.Beast && workId.includes('ShouAr')) {
      chipEls.push(el('span', { class: 'chip accent' }, r.BeastType.Beast));
    }

    const item = el('article', {
      class: 'grid-item fade-in',
      role: 'button',
      tabindex: 0,
      style: `animation-delay: ${Math.min(i * 0.05, 1)}s`,
      onkeydown: (ev) => { if (ev.key === 'Enter') onOpen(r); },
      onclick: () => onOpen(r)
    }, [
      img ? el('img', {
        class: 'thumb',
        alt: `${title} thumbnail`,
        src: img,
        loading: 'lazy' // Add lazy loading for performance
      }) : el('div', { class: 'thumb placeholder' }, ['画像なし']),
      el('h3', {}, [title]),
      sub ? el('div', { class: 'sub' }, [sub]) : null,
      chipEls.length ? el('div', { class: 'meta' }, chipEls) : null
    ]);

    list.appendChild(item);

    // Progressive rendering: update UI every 5 items for better perceived performance
    if (shouldShowProgress && i % 5 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0)); // Allow UI update
    }
  }

  if (shouldShowProgress) {
    hideLoadingIndicator();
  }

  $('#list-empty').hidden = shown > 0;
  console.log(`✅ Rendered ${shown} characters with enhanced image resolution`);
}

/**
 * Create a key-value table element
 * @param {Object} obj - Base object (unused in current implementation)
 * @param {Array} entries - Array of [key, value] pairs to display
 * @returns {HTMLElement} Table element with key-value rows
 */
function kvTable(obj, entries) {
  const rows = entries.filter(Boolean).map(([k, v]) => el('tr', {}, [ el('th', {}, [k]), el('td', {}, [v ?? '']) ]));
  return el('table', { class: 'kv-table' }, rows);
}

/**
/**
 * 包括的な情報と画像ギャラリーを含む詳細キャラクタービューをレンダリング
 * @param {string} workId - 作品識別子 (例: '#Works_NumberTales')
 * @param {Object} rec - すべてのデータフィールドを含むキャラクターレコード
 * @returns {Promise<void>} 詳細ビューのDOMを更新する非同期関数
 */
async function renderDetail(workId, rec) {
  $('#detail-title').textContent = rec.Name ? `${rec.Name}${rec.Num != null ? `（${rec.Num}）` : ''}` : (rec.FormalName || rec.ModelName || rec.Name_EN || '詳細');
  const mount = $('#detail');
  mount.innerHTML = '';

  // 現在のデータベース名と拡張ステートを取得
  const state = window.__CHAR_STATE__;
  const dbName = state ? state.db : 'Primary';
  const cachedImageFields = state ? state.imageFields : null;
  const cachedWorkTypeDef = state ? state.workTypeDef : null;
  const cachedGlobalTypeDef = state ? state.globalTypeDef : null;
  const cachedWorkMeta = state ? state.workMeta : null;

  try {
    // 詳細ビューの最小限のローディング表示
    mount.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted);">詳細情報を読み込んでいます...</div>';

    // Use cached data when available, otherwise fetch
    const [workTypeDef, globalTypeDef, globalDefType, workMeta, globalMeta] = await Promise.all([
      cachedWorkTypeDef || fetchWorkTypeDef(workId),
      cachedGlobalTypeDef || fetchGlobalTypeDef(),
      fetchGlobalDefType(),
      cachedWorkMeta || fetchWorkMeta(workId),
      fetchGlobalMeta()
    ]);

    // Clear loading message
    mount.innerHTML = '';

    // Build comprehensive field label mapping with global fallbacks
    const fieldLabelMap = buildFieldLabelMap(workTypeDef, globalTypeDef);

    // Use cached or extract image fields
    const imageFields = cachedImageFields || extractImageFields(workTypeDef, globalTypeDef);

    // Enhanced poster image with dynamic resolution
    const poster = await imageFromRecord(workId, rec, dbName, imageFields);

    // Build image gallery with enhanced dynamic resolution
    const galleryImages = buildImageGallery(workId, rec, imageFields, dbName);

    console.log('🖼️ Detail view images:', {
      poster,
      galleryCount: galleryImages.length,
      imageFieldCount: imageFields.length
    });

    // Create left section with poster and gallery - optimized loading
    const imageSection = [
      poster ? el('img', {
        class: 'poster',
        src: poster,
        alt: `${rec.Name || rec.FormalName || 'Character'} poster`,
        loading: 'lazy'
      }) : el('div', { class: 'poster placeholder' }, ['画像なし']),
      galleryImages.length > 0 ? el('div', { class: 'image-gallery' }, [
        el('h4', {}, [getFieldLabel('Gallery', fieldLabelMap, workMeta, globalDefType, '画像ギャラリー')]),
        el('div', { class: 'image-grid' }, galleryImages.slice(0, 6).map(imgData => // Limit initial images for performance
          el('div', { class: 'image-item' }, [
            el('img', {
              src: imgData.url,
              alt: imgData.alt,
              loading: 'lazy',
              title: imgData.caption
            }),
            imgData.caption ? el('div', { class: 'caption' }, [imgData.caption]) : null
          ].filter(Boolean))
        ).concat(
          galleryImages.length > 6 ? [
            el('div', { class: 'image-more', style: 'text-align: center; padding: 10px;' }, [
              el('button', {
                type: 'button',
                onclick: () => loadMoreImages(workId, rec, imageFields, dbName, fieldLabelMap, workMeta, globalDefType)
              }, [`さらに ${galleryImages.length - 6} 枚の画像を表示`])
            ])
          ] : []
        ))
      ]) : el('div', { class: 'image-gallery' }, [
        el('h4', {}, ['画像ギャラリー']),
        el('div', { class: 'no-images', style: 'padding: 20px; text-align: center; color: var(--muted);' }, [
          '画像データがありません'
        ])
      ])
    ].filter(Boolean);

  const left = el('div', {}, imageSection);

  const titleRow = el('div', { class: 'kv' }, [
    el('div', { class: 'name' }, rec.Name || rec.FormalName || rec.Name_EN || '(No Name)'),
    (rec.Name_EN || rec.FormalName_EN) ? el('div', { class: 'name-en' }, rec.Name_EN || rec.FormalName_EN) : null,
    el('div', { class: 'row small' }, [
      rec.Num != null ? el('span', { class: 'pill' }, [getFieldLabel('Num', fieldLabelMap, workMeta, 'Num'), String(rec.Num)]) : null,
      rec.ModelNumber ? el('span', { class: 'pill' }, [getFieldLabel('ModelNumber', fieldLabelMap, workMeta, 'Model'), rec.ModelNumber]) : null,
      rec.Progress ? el('span', { class: 'pill' }, [getFieldLabel('Progress', fieldLabelMap, workMeta, 'Progress'), rec.Progress]) : null
    ])
  ]);

  // Build basic info table with localized field names
  const basicFields = [
    ['FormalName', rec.FormalName || ''],
    ['FormalName_EN', rec.FormalName_EN || ''],
    ['ModelName', rec.ModelName || rec.CodeName || ''],
    ['SPCodeName', rec.SPCodeName || rec.SPCodeName_EN || ''],
    ['GenderType', rec.GenderType_JP || rec.GenderType || ''],
    ['Height_cm', rec.Height_cm != null ? `${rec.Height_cm} cm` : ''],
    ['Weight_kg', rec.Weight_kg != null ? `${rec.Weight_kg} kg` : ''],
    ['ConceptAge', rec.ConceptAge != null ? `${rec.ConceptAge}` : ''],
    ['Class', rec.Class || rec.Class_EN || ''],
  ].filter(([key, value]) => value); // Only show fields with values

  const basic = kvTable(rec, basicFields.map(([key, value]) => [
    getFieldLabel(key, fieldLabelMap, workMeta, globalDefType, key),
    value
  ]));

  // Abilities with localized labels
  const ability = rec.AbilityStats || {};
  const abilityGrid = el('div', { class: 'kv-grid' }, Object.entries(ability).map(([k, v]) => {
    const fieldLabel = getFieldLabel(`AbilityStats.${k}`, fieldLabelMap, workMeta, globalDefType, k);
    const displayValue = formatValueForDisplay(v, fieldLabelMap, workMeta, globalDefType);
    return el('div', { class: 'tag' }, [`${fieldLabel}: ${displayValue}`]);
  }));

  // Effect/Safety with localized labels
  const numStats = rec.NumerospecStats || rec.ArcanumspecStats || rec.BeastspecStats || {};
  const eff = numStats.EffectStats || {};
  const effGrid = el('div', { class: 'kv-grid' }, Object.entries(eff).map(([k, v]) => {
    const fieldLabel = getFieldLabel(`EffectStats.${k}`, fieldLabelMap, workMeta, globalDefType, k);
    const displayValue = formatValueForDisplay(v, fieldLabelMap, workMeta, globalDefType);
    return el('div', { class: 'tag' }, [`${fieldLabel}: ${displayValue}`]);
  }));

  const safety = numStats.SafetyLevel || {};
  const safetyRow = safety && Object.keys(safety).length > 0 ? el('div', { class: 'tag' }, [
    `${getFieldLabel('SafetyLevel', fieldLabelMap, workMeta, globalDefType, 'Safety')}: ${formatValueForDisplay(safety, fieldLabelMap, workMeta, globalDefType)}`
  ]) : null;

  // SpecType with localized labels
  const specType = rec.SpecType || {};
  const specNodes = [];
  if (specType.Material) {
    const materialLabel = getFieldLabel('SpecType.Material', fieldLabelMap, workMeta, globalDefType, 'Material');
    const materialValue = formatValueForDisplay(specType.Material, fieldLabelMap, workMeta, globalDefType);
    specNodes.push(el('div', { class: 'tag' }, [materialLabel + ': ', materialValue]));
  }
  if (specType.ActionType) {
    const actionLabel = getFieldLabel('SpecType.ActionType', fieldLabelMap, workMeta, globalDefType, 'Action');
    const actionValue = formatValueForDisplay(specType.ActionType, fieldLabelMap, workMeta, globalDefType);
    if (actionValue) specNodes.push(el('div', { class: 'tag' }, [actionLabel + ': ', actionValue]));
  }
  if (specType.DualizePattern) {
    const dualizeLabel = getFieldLabel('SpecType.DualizePattern', fieldLabelMap, workMeta, globalDefType, 'Dualize');
    const dualizeValue = formatValueForDisplay(specType.DualizePattern, fieldLabelMap, workMeta, globalDefType);
    specNodes.push(el('div', { class: 'tag' }, [dualizeLabel + ': ', dualizeValue]));
  }

  // Belonging/Area/Day with localized labels
  const belong = formatValueForDisplay(rec.Belonging, fieldLabelMap, workMeta, globalDefType);
  const area = formatValueForDisplay(rec.Area, fieldLabelMap, workMeta, globalDefType);
  const days = Array.isArray(rec.AnivDay) ? rec.AnivDay.map(d => {
    const mm = d?.Day?.Month != null ? String(d.Day.Month) : '';
    const dd = d?.Day?.DayOfMonth != null ? String(d.Day.DayOfMonth) : '';
    const date = (mm && dd) ? `${mm}/${dd}` : (mm || dd);
    const about = d?.DayAbout ? ` ${d.DayAbout}` : '';
    return `${date}${about}`;
  }).filter(d => d.trim()) : [];

  const right = el('div', {}, [
    titleRow,
    el('div', { class: 'section' }, [el('h3', {}, [getFieldLabel('BasicInfo', fieldLabelMap, workMeta, globalDefType, '基本情報')]), basic]),
    Object.keys(ability).length ? el('div', { class: 'section' }, [el('h3', {}, [getFieldLabel('AbilityStats', fieldLabelMap, workMeta, globalDefType, '能力')]), abilityGrid]) : null,
    Object.keys(eff).length || safetyRow ? el('div', { class: 'section' }, [el('h3', {}, [getFieldLabel('EffectStats', fieldLabelMap, workMeta, globalDefType, '効果/安全度')]), effGrid, safetyRow]) : null,
    (specNodes.length || belong || area || days.length) ? el('div', { class: 'section' }, [
      el('h3', {}, ['所属/型/日付など']),
      kvTable({}, [
        belong ? [getFieldLabel('Belonging', fieldLabelMap, workMeta, globalDefType, '所属'), belong] : null,
        area ? [getFieldLabel('Area', fieldLabelMap, workMeta, globalDefType, '地域'), area] : null,
        specNodes.length ? [getFieldLabel('SpecType', fieldLabelMap, workMeta, globalDefType, '型情報'), el('div', {}, specNodes)] : null,
        days.length ? [getFieldLabel('AnivDay', fieldLabelMap, workMeta, globalDefType, '記念日'), days.join(' / ')] : null,
      ].filter(Boolean))
    ]) : null,
    rec.Summary ? el('div', { class: 'section' }, [
      el('h3', {}, [getFieldLabel('Summary', fieldLabelMap, workMeta, globalDefType, '概要')]),
      el('div', {}, rec.Summary.split('\n').map(s => el('p', {}, [s])))
    ]) : null,
    rec.Relation && (rec.Relation.Related || rec.Relation.Commented) ? renderRelations(rec.Relation) : null,
    // 参照解決結果の表示（_DBLinkResolved）
    rec._DBLinkResolved ? renderDBLinkResolved(rec._DBLinkResolved, fieldLabelMap, workMeta, globalDefType) : null
  ].filter(Boolean));

  mount.appendChild(el('div', { class: 'detail' }, [left, right]));

  } catch (error) {
    console.error('Error rendering detail view:', error);
    mount.innerHTML = `<div style="padding: 20px; text-align: center; color: red;">エラー: 詳細情報の読み込みに失敗しました (${error.message})</div>`;
  }
}

/**
 * Render character relationship information
 * @param {Object} rel - Relationship object containing Related and Commented arrays
 * @returns {HTMLElement} Section element with relationship information
 */
function renderRelations(rel) {
  const related = Array.isArray(rel.Related) ? rel.Related : [];
  const commented = Array.isArray(rel.Commented) ? rel.Commented : [];
  const r1 = related.map(r => el('div', { class: 'tag' }, [`→ ${r.Num}: ${(r.RelationLabel || []).join(', ')} ${r.Comments ? `- ${r.Comments}` : ''}`]));
  const r2 = commented.map(r => el('div', { class: 'tag' }, [`← ${r.Num}: ${r.Comments || ''}`]));
  return el('div', { class: 'section' }, [el('h3', {}, ['関係'] ), el('div', { class: 'kv-grid' }, [...r1, ...r2])]);
}

/**
 * _DBLink参照解決結果を表示するセクションを構築する
 * API機能と同様の出力形式でリンク先データを表示
 *
 * @param {Array} dbLinkResolved - 参照解決結果の配列
 * @param {Object} fieldLabelMap - フィールドラベルのマッピング
 * @param {Object} workMeta - 作品メタデータ
 * @param {Object} globalDefType - グローバル型定義
 * @returns {HTMLElement} 参照解決結果セクション
 */
function renderDBLinkResolved(dbLinkResolved, fieldLabelMap, workMeta, globalDefType) {
  if (!Array.isArray(dbLinkResolved) || dbLinkResolved.length === 0) {
    return null;
  }

  console.log('🔗 Rendering _DBLink resolved data:', dbLinkResolved);

  const referenceItems = [];

  for (const linkResult of dbLinkResolved) {
    if (linkResult.error) {
      // エラーがある場合の表示
      referenceItems.push(
        el('div', { class: 'reference-error', style: 'padding: 12px; border: 1px solid var(--error); border-radius: 8px; background: rgba(231, 76, 60, 0.1); margin-bottom: 12px;' }, [
          el('h5', { style: 'margin: 0 0 8px; color: var(--error); font-size: var(--font-size-sm);' }, [
            `❌ 参照エラー: ${linkResult.worksTitle || 'Unknown'} / ${linkResult.dbName || 'Unknown'}`
          ]),
          el('div', { style: 'color: var(--muted); font-size: var(--font-size-xs);' }, [linkResult.error])
        ])
      );
      continue;
    }

    // 正常な参照結果の表示
    const { worksTitle, dbName, count, records } = linkResult;

    referenceItems.push(
      el('div', { class: 'reference-result', style: 'padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); margin-bottom: 12px;' }, [
        // 参照先の作品・DB情報
        el('h5', { style: 'margin: 0 0 8px; color: var(--accent); font-size: var(--font-size-sm);' }, [
          `🔗 ${worksTitle} / ${dbName} (${count}件)`
        ]),

        // 取得したレコードの表示
        count > 0 ? el('div', { class: 'referenced-records' },
          records.slice(0, 3).map((record, index) => // 最初の3件のみ表示
            el('div', {
              class: 'referenced-record',
              style: 'margin: 8px 0; padding: 8px; border-left: 3px solid var(--accent-2); background: rgba(158, 119, 255, 0.1);'
            }, [
              el('div', { style: 'font-weight: 600; font-size: var(--font-size-sm);' }, [
                record.Name || record.FormalName || record.ModelName || record.Name_EN || `Record #${index + 1}`
              ]),
              record.Name_EN || record.FormalName_EN ?
                el('div', { style: 'color: var(--muted); font-size: var(--font-size-xs); margin: 2px 0;' }, [
                  record.Name_EN || record.FormalName_EN
                ]) : null,
              record.Class || record.RaceType || record.GenderType ?
                el('div', { style: 'margin-top: 4px;' }, [
                  record.Class ? el('span', { class: 'chip', style: 'margin-right: 4px;' }, [record.Class]) : null,
                  record.RaceType ? el('span', { class: 'chip', style: 'margin-right: 4px;' }, [record.RaceType]) : null,
                  record.GenderType ? el('span', { class: 'chip', style: 'margin-right: 4px;' }, [record.GenderType]) : null
                ].filter(Boolean)) : null
            ].filter(Boolean))
          ).concat(
            // 3件を超える場合の省略表示
            count > 3 ? [
              el('div', { style: 'margin: 8px 0; color: var(--muted); font-size: var(--font-size-xs); text-align: center;' }, [
                `... 他 ${count - 3} 件`
              ])
            ] : []
          )
        ) : el('div', { style: 'color: var(--muted); font-size: var(--font-size-xs);' }, ['該当するレコードがありません'])
      ])
    );
  }

  return el('div', { class: 'section' }, [
    el('h3', {}, ['🔗 参照情報 (_DBLink)']),
    el('div', { class: 'reference-links' }, referenceItems)
  ]);
}

/**
 * Wire up all UI event handlers and control behaviors
 * Sets up change handlers for work/DB selection, search input, checkboxes,
 * navigation buttons, and cache/Service Worker reset functionality
 */
function wireControls() {
  // Store handlers in global namespace to enable proper removal
  if (!window.__eventHandlers) {
    window.__eventHandlers = {};
  }

  // Get elements
  const selectWork = $('#select-work');
  const selectDB = $('#select-db');
  const searchInput = $('#search-input');
  const chkResolve = $('#chk-resolve');
  const chkDebug = $('#chk-debug');
  const btnBack = $('#btn-back');

  // Remove previous handlers if they exist
  if (window.__eventHandlers.workChange) {
    selectWork.removeEventListener('change', window.__eventHandlers.workChange);
  }
  if (window.__eventHandlers.dbChange) {
    selectDB.removeEventListener('change', window.__eventHandlers.dbChange);
  }
  if (window.__eventHandlers.searchInput) {
    searchInput.removeEventListener('input', window.__eventHandlers.searchInput);
  }
  if (window.__eventHandlers.resolveChange) {
    chkResolve.removeEventListener('change', window.__eventHandlers.resolveChange);
  }
  if (window.__eventHandlers.debugChange) {
    chkDebug.removeEventListener('change', window.__eventHandlers.debugChange);
  }
  if (window.__eventHandlers.backClick) {
    btnBack.removeEventListener('click', window.__eventHandlers.backClick);
  }

  // Define and store new handlers
  window.__eventHandlers.workChange = async (e) => {
    const wk = e.target.value;
    setQS({ work: wk.replace('#', ''), db: '', num: '' });
    await populateDBs(wk);
    await reload();
  };

  window.__eventHandlers.dbChange = async (e) => {
    const db = e.target.value;
    setQS({ db, num: '' });
    await reload();
  };

  window.__eventHandlers.searchInput = async () => {
    setQS({ q: $('#search-input').value });
    await filterListOnly();
  };

  window.__eventHandlers.resolveChange = reload;
  window.__eventHandlers.debugChange = reload;
  window.__eventHandlers.backClick = () => {
    $('#detail-view').hidden = true;
    $('#list-view').hidden = false;
    setQS({ num: '' });
  };

  // Add new handlers
  selectWork.addEventListener('change', window.__eventHandlers.workChange);
  selectDB.addEventListener('change', window.__eventHandlers.dbChange);
  searchInput.addEventListener('input', window.__eventHandlers.searchInput);
  chkResolve.addEventListener('change', window.__eventHandlers.resolveChange);
  chkDebug.addEventListener('change', window.__eventHandlers.debugChange);
  btnBack.addEventListener('click', window.__eventHandlers.backClick);

  // Handle reset button
  const btnReset = document.getElementById('btn-reset-sw');
  if (btnReset) {
    if (window.__eventHandlers.resetClick) {
      btnReset.removeEventListener('click', window.__eventHandlers.resetClick);
    }

    window.__eventHandlers.resetClick = async () => {
      try {
        // Clear all browser caches
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      } catch {}
      try {
        // Unregister all service workers
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      } catch {}

      // Clear in-memory metadata caches
      globalMetaCache = null;
      globalTypeDefCache = null;
      globalDefTypeCache = null;
      workTypeDefCache.clear();

      location.reload();
    };

    btnReset.addEventListener('click', window.__eventHandlers.resetClick);
  }
}

async function filterListOnly() {
  const state = window.__CHAR_STATE__;
  if (!state || !state.records) return;

  // Use enhanced rendering with image fields if available
  const imageFields = state.imageFields || null;
  await renderList(state.records, state.workId, openDetail, imageFields);
}

async function populateWorks(initialWork) {
  const sel = $('#select-work');
  sel.innerHTML = '';
  const items = await listWorks();
  for (const w of items) {
    const opt = el('option', { value: w.key }, [humanWorkLabel(w)]);
    if (w.key === normalizeWorkKey(initialWork) || w.key.endsWith(initialWork)) opt.selected = true;
    sel.appendChild(opt);
  }
  if (!sel.value && items[0]) sel.value = items[0].key;
  return sel.value;
}

async function populateDBs(workKey, initialDB) {
  const sel = $('#select-db');
  sel.innerHTML = '';
  const dbs = await listWorkDBs(workKey);
  for (const d of dbs) {
    const opt = el('option', { value: d.key }, [d.key]);
    if (d.key === initialDB) opt.selected = true;
    sel.appendChild(opt);
  }
  if (!sel.value && dbs[0]) sel.value = dbs[0].key;
  return sel.value;
}

function openDetail(rec) {
  const state = window.__CHAR_STATE__;
  $('#list-view').hidden = true;
  $('#detail-view').hidden = false;
  renderDetail(state.workId, rec);
  if (rec.Num != null) setQS({ num: String(rec.Num) });
}

/**
 * メインアプリケーション初期化関数
 * Service Worker の登録、UI の配線、データの読み込みを段階的に実行
 */
async function main() {
  // 重複初期化を防止
  if (isInitialized) {
    console.log('⚠️ アプリケーションは既に初期化済みです、スキップします...');
    return;
  }

  const startTime = performance.now();
  console.log('🚀 キャラクターブラウザアプリケーションを初期化中...');

  try {
    // 競合状態を防ぐため、即座に初期化中としてマーク
    isInitialized = true;

    // ローディングインジケーターを表示
    showLoadingIndicator('アプリケーションを初期化しています...');

    // ステップ1: Service Worker の初期化
    let stepStart = performance.now();
    await ensureApiSW();
    console.log(`✅ Service Worker を ${(performance.now() - stepStart).toFixed(2)}ms で初期化`);

    // ステップ2: UI コントロールの配線
    stepStart = performance.now();
    wireControls();
    console.log(`✅ UI コントロールを ${(performance.now() - stepStart).toFixed(2)}ms で配線`);

    // ステップ3: 作品リストの入力
    stepStart = performance.now();
    const qs = getQS();
    const wk = await populateWorks(qs.work);
    console.log(`✅ 作品を ${(performance.now() - stepStart).toFixed(2)}ms で入力:`, wk);

    // ステップ4: データベースの入力
    stepStart = performance.now();
    await populateDBs(wk, qs.db || 'Primary');
    console.log(`✅ データベースを ${(performance.now() - stepStart).toFixed(2)}ms で入力`);

    // データ読み込みフェーズのローディングメッセージを更新
    showLoadingIndicator('キャラクターデータを読み込んでいます...');

    // ステップ5: 初期データの読み込み
    stepStart = performance.now();
    await reloadInternal(false); // 重複するローディングインジケーターをスキップするため false を渡す
    console.log(`✅ 初期データを ${(performance.now() - stepStart).toFixed(2)}ms で読み込み`);

    hideLoadingIndicator();

    // 初期化後にメインコンテンツが確実に表示されるようにする
    const mainContent = $('#main-content');
    if (mainContent) {
      mainContent.style.display = 'block';
      mainContent.hidden = false;
    }

    // Ensure page sections are visible
    const workSection = $('#work-section');
    const dbSection = $('#db-section');
    const listSection = $('#list-section');

    if (workSection) {
      workSection.style.display = 'block';
      workSection.hidden = false;
    }
    if (dbSection) {
      dbSection.style.display = 'block';
      dbSection.hidden = false;
    }
    if (listSection) {
      listSection.style.display = 'block';
      listSection.hidden = false;
    }

    const totalTime = performance.now() - startTime;
    console.log(`🎉 Application initialization complete in ${totalTime.toFixed(2)}ms`);

  } catch (error) {
    const totalTime = performance.now() - startTime;
    console.error(`❌ Application initialization failed after ${totalTime.toFixed(2)}ms:`, error);

    // Reset initialization state on error so user can retry
    isInitialized = false;

    hideLoadingIndicator();
    showErrorMessage('アプリケーションの初期化に失敗しました', error);
  }
}

/**
 * Enhanced error handling and user feedback functions
 */

/**
 * Show loading indicator with message
 * @param {string} message - Loading message to display
 */
function showLoadingIndicator(message = '読み込み中...') {
  let indicator = $('#loading-indicator');
  if (!indicator) {
    indicator = el('div', {
      id: 'loading-indicator',
      class: 'loading-overlay'
    }, [
      el('div', { class: 'loading-content' }, [
        el('div', { class: 'loading-spinner' }),
        el('div', { class: 'loading-message' }, [message])
      ])
    ]);
    document.body.appendChild(indicator);
  } else {
    indicator.querySelector('.loading-message').textContent = message;
  }

  // Show the indicator using CSS class
  indicator.classList.add('show');
  indicator.style.display = 'flex';
  indicator.hidden = false;

  console.log('🔄 Loading indicator shown:', message);
}

/**
 * Hide loading indicator
 */
function hideLoadingIndicator() {
  const indicator = $('#loading-indicator');
  if (indicator) {
    indicator.classList.remove('show');
    indicator.style.display = 'none';
    indicator.hidden = true;
    console.log('✅ Loading indicator hidden');
  }
}

/**
 * Show user-friendly error message
 * @param {string} title - Error title
 * @param {Error|string} error - Error object or message
 */
function showErrorMessage(title, error) {
  const errorDetails = error instanceof Error ? error.message : String(error);
  const errorContainer = el('div', {
    class: 'error-overlay',
    role: 'alert'
  }, [
    el('div', { class: 'error-content' }, [
      el('h3', { class: 'error-title' }, [title]),
      el('p', { class: 'error-message' }, [errorDetails]),
      el('button', {
        class: 'error-dismiss',
        onclick: () => document.querySelector('.error-overlay')?.remove()
      }, ['閉じる'])
    ])
  ]);

  document.body.appendChild(errorContainer);

  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    if (errorContainer.parentNode) {
      errorContainer.remove();
    }
  }, 10000);
}

/**
 * Enhanced reload function with better error handling
 * @param {boolean} showLoading - Whether to show/hide loading indicator (default: true)
 */
async function reload(showLoading = true) {
  return reloadInternal(showLoading);
}

/**
 * Enhanced internal reload implementation with dynamic image field support
 * @param {boolean} showLoading - Whether to manage loading indicator
 */
async function reloadInternal(showLoading = true) {
  try {
    if (showLoading) {
      showLoadingIndicator('キャラクターデータを読み込んでいます...');
    }

    const qs = getQS();
    const workId = $('#select-work').value;
    const db = $('#select-db').value || 'Primary';
    const resolve = $('#chk-resolve').checked;
    const debug = $('#chk-debug').checked;

    if (!workId) {
      throw new Error('作品が選択されていません');
    }

    console.log('📊 Enhanced reload with dynamic image support:', { workId, db, resolve, debug });

    // Enhanced data loading with timeout and step tracking
    const startTime = performance.now();
    let currentStep = 'データベース・メタデータ読み込み';

    if (showLoading) {
      showLoadingIndicator(`${currentStep}中...`);
    }

    // Fetch all required data with timeout protection
    const fetchTimeout = 15000; // 15 second timeout
    const fetchPromises = [
      Promise.race([
        fetchDB(workId, db, { resolve, debug }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Database fetch timeout')), fetchTimeout)
        )
      ]),
      Promise.race([
        fetchWorkMeta(workId),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Metadata fetch timeout')), fetchTimeout)
        )
      ]),
      Promise.race([
        fetchWorkTypeDef(workId),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Work typedef fetch timeout')), fetchTimeout)
        )
      ]),
      Promise.race([
        fetchGlobalTypeDef(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Global typedef fetch timeout')), fetchTimeout)
        )
      ])
    ];

    const stepStart = performance.now();
    const [res, workMeta, workTypeDef, globalTypeDef] = await Promise.all(fetchPromises);
    console.log(`⏱️ ${currentStep} completed in ${(performance.now() - stepStart).toFixed(2)}ms`);

    // Image field extraction step
    currentStep = '画像フィールド解析';
    if (showLoading) {
      showLoadingIndicator(`${currentStep}中...`);
    }

    const imageExtractStart = performance.now();
    const imageFields = extractImageFields(workTypeDef, globalTypeDef);
    console.log(`⏱️ ${currentStep} completed in ${(performance.now() - imageExtractStart).toFixed(2)}ms`);
    console.log(`🖼️ Extracted ${imageFields.length} image fields for ${workId}`);

    // Data processing step
    currentStep = 'データ処理';
    if (showLoading) {
      showLoadingIndicator(`${currentStep}中...`);
    }

    const processStart = performance.now();
    let recs = res.records || [];
    if (recs.length === 0) {
      console.warn('⚠️ No records found for:', { workId, db });
    } else {
      console.log(`📋 Processing ${recs.length} records with enhanced image support`);
    }

    // Apply Commons data for missing fields
    recs = applyCommonsData(recs, workMeta, db);
    console.log(`⏱️ ${currentStep} completed in ${(performance.now() - processStart).toFixed(2)}ms`);

    // UI update step with enhanced image resolution
    currentStep = 'UI更新・画像解決';
    if (showLoading) {
      showLoadingIndicator(`${currentStep}中...`);
    }

    const uiStart = performance.now();

    // Store enhanced state with image fields
    window.__CHAR_STATE__ = {
      workId,
      db,
      resolve,
      debug,
      records: recs,
      imageFields, // Add image fields to global state
      workTypeDef,
      globalTypeDef,
      workMeta
    };

    $('#list-view').hidden = false;
    $('#detail-view').hidden = true;
    $('#search-input').value = qs.q || '';

    // Use enhanced rendering with image fields
    await renderList(recs, workId, openDetail, imageFields);
    console.log(`⏱️ ${currentStep} completed in ${(performance.now() - uiStart).toFixed(2)}ms`);

    if (qs.num) {
      const target = recs.find(r => String(r.Num) === String(qs.num));
      if (target) {
        openDetail(target);
      } else {
        console.warn('⚠️ Character not found for number:', qs.num);
      }
    }

    if (showLoading) {
      hideLoadingIndicator();
    }

    const totalTime = performance.now() - startTime;
    console.log(`🎉 Data reload complete: ${recs.length} records in ${totalTime.toFixed(2)}ms`);

  } catch (error) {
    const currentStep = error.message.includes('timeout') ? 'タイムアウト' : 'データ読み込み';
    console.error(`❌ Reload failed at step "${currentStep}":`, error);
    if (showLoading) {
      hideLoadingIndicator();
    }

    // Enhanced error message with specific guidance
    let errorMessage = error.message;
    if (error.message.includes('timeout')) {
      errorMessage = 'データの読み込みがタイムアウトしました。ネットワーク接続を確認するか、しばらく時間をおいて再試行してください。';
    }
    showErrorMessage('データの読み込みに失敗しました', errorMessage);
  }
}

/**
 * Debug helper: Add performance monitoring overlay (only in development)
 */
function addPerformanceMonitor() {
  if (location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') {
    return; // Only show in local development
  }

  const overlay = el('div', {
    id: 'perf-monitor',
    style: `
      position: fixed; top: 10px; right: 10px;
      background: rgba(0,0,0,0.8); color: white;
      padding: 10px; border-radius: 5px;
      font-family: monospace; font-size: 12px;
      z-index: 10000; max-width: 300px;
      display: none;
    `
  }, [
    el('div', {}, ['Performance Monitor']),
    el('div', { id: 'perf-content' }, ['Initializing...'])
  ]);

  document.body.appendChild(overlay);

  // Toggle with Ctrl+Shift+P
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'P') {
      overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
    }
  });

  // Update performance info
  setInterval(() => {
    if (overlay.style.display !== 'none') {
      const content = document.getElementById('perf-content');
      if (content) {
        const memory = performance.memory || {};
        content.innerHTML = `
          <div>Used: ${(memory.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB</div>
          <div>Total: ${(memory.totalJSHeapSize / 1024 / 1024).toFixed(1)}MB</div>
          <div>Time: ${performance.now().toFixed(0)}ms</div>
          <div>Records: ${window.__CHAR_STATE__?.records?.length || 0}</div>
        `;
      }
    }
  }, 1000);
}

/**
 * Main entry point - initialize application when DOM is loaded
 */
if (document.readyState === 'loading') {
  // DOM is still loading, wait for DOMContentLoaded
  document.addEventListener('DOMContentLoaded', main);
} else {
  // DOM is already loaded, run immediately
  main().catch(err => {
    console.error('Initialization error:', err);
    document.body.innerHTML = `<div style="padding: 20px; color: red;">初期化エラー: ${err.message}</div>`;
  });
}

// Add performance monitor in development
addPerformanceMonitor();
