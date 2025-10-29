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
 * Service Worker Management
 * Ensures API routes work on GitHub Pages by registering page-scoped Service Worker
 * with fallback strategies to avoid ad-blocker interference
 */

// Ensure SW is installed so that API routes work on GitHub Pages
// Prefer /pages to avoid ad-blockers and ensure the page is controlled by its own SW
let API_BASE_REL = '../pages/';

/**
 * Register Service Worker with multiple fallback strategies
 * Tries /pages/, /svc/, then /api/ to bypass ad-blocker restrictions
 * @returns {Promise<void>} Resolves when SW is ready and controlling the page
 */
async function ensureApiSW() {
  if (!('serviceWorker' in navigator)) {
    console.warn('🚫 Service Worker not supported');
    return;
  }

  console.log('🔧 Attempting Service Worker registration...');

  try {
    // 1) Register page-scoped SW that intercepts /pages/v1, /svc/v1, /api/v1
    const pageSwUrl = new URL('./sw.js', location.href).toString();
    const pageScope = new URL('./', location.href).pathname; // '/pages/'
    console.log(`🌐 Registering primary SW: ${pageSwUrl} (scope: ${pageScope})`);
    const reg = await navigator.serviceWorker.register(pageSwUrl, { scope: pageScope });
    console.log('✅ Primary SW registered successfully');
    API_BASE_REL = '../pages/';
    await navigator.serviceWorker.ready; // wait for activation
    console.log('✅ Primary SW ready');
    await waitForController(); // ensure this page is controlled before we start fetching
    console.log('✅ Primary SW controlling page');
  } catch (err) {
    console.warn('❌ Primary SW registration failed:', err);
    try {
      // 2) Fallback to /svc (alias path)
      const svcSwUrl = new URL('../svc/sw.js', location.href).toString();
      const svcScope = new URL('../svc/', location.href).pathname;
      console.log(`🌐 Registering fallback SW: ${svcSwUrl} (scope: ${svcScope})`);
      const reg2 = await navigator.serviceWorker.register(svcSwUrl, { scope: svcScope });
      console.log('✅ Fallback SW registered successfully');
      API_BASE_REL = '../svc/';
      await navigator.serviceWorker.ready;
      console.log('✅ Fallback SW ready');
      await waitForController();
      console.log('✅ Fallback SW controlling page');
    } catch (err2) {
      console.warn('❌ Fallback SW registration failed:', err2);
      try {
        // 3) Final fallback to /api
        const apiSwUrl = new URL('../api/sw.js', location.href).toString();
        const apiScope = new URL('../api/', location.href).pathname;
        console.log(`🌐 Registering final fallback SW: ${apiSwUrl} (scope: ${apiScope})`);
        const reg3 = await navigator.serviceWorker.register(apiSwUrl, { scope: apiScope });
        console.log('✅ Final fallback SW registered successfully');
        API_BASE_REL = '../api/';
        await navigator.serviceWorker.ready;
        console.log('✅ Final fallback SW ready');
        await waitForController();
        console.log('✅ Final fallback SW controlling page');
      } catch (err3) {
        console.error('❌ All SW registration attempts failed:', err3);
        // no-op; fetch will 404 on GH Pages if SW not available
      }
    }
  }
}

/**
 * URL Parameter Management
 */

/**
 * Get current query string parameters as object
 * @returns {Object} Object with work, db, num, q properties
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
 * Update query string parameters without page reload
 * @param {Object} next - Object with parameters to update
 */
function setQS(next) {
  const cur = getQS();
  const qs = new URLSearchParams({ ...cur, ...next });
  history.replaceState(null, '', `${location.pathname}?${qs.toString()}`);
}

/**
 * API URL Construction
 */

/**
 * Build API URLs relative to current API_BASE_REL
 * @param {string} path - API path (e.g., 'v1/works' or '/v1/works')
 * @returns {string} Full API URL
 */
function api(path) {
  const base = new URL(API_BASE_REL, location.href);
  // support path like 'v1/...' or '/v1/...'
  const p = String(path || '').replace(/^\/?/, '');
  return new URL(p, base).toString();
}

/**
 * Service Worker Control Management
 */

/**
 * Wait until this page is controlled by a Service Worker
 * @param {number} timeoutMs - Timeout in milliseconds (default: 3000)
 * @returns {Promise<void>} Resolves when page is controlled or timeout
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
 * HTTP Request Utilities
 */

/**
 * Fetch and parse JSON from URL with timeout and enhanced error handling
 * @param {string} url - URL to fetch
 * @param {number} timeout - Timeout in milliseconds (default: 10 seconds)
 * @returns {Promise<Object>} Parsed JSON response
 * @throws {Error} If request fails or response is not OK
 */
async function fetchJSON(url, timeout = 10000) {
  console.log('🌐 Fetching:', url);
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
 * Data Fetching Functions
 */

/**
 * Get list of available works
 * @returns {Promise<Array>} Array of work objects
 */
async function listWorks() {
  return fetchJSON(api('v1/works'));
}

/**
 * Get list of databases for a specific work
 * @param {string} workKey - Work identifier
 * @returns {Promise<Array>} Array of database names
 */
async function listWorkDBs(workKey) {
  const w = workKeyForAPI(workKey);
  const r = await fetchJSON(api(`v1/works/${encodeURIComponent(w)}/db`));
  return r.databases || [];
}

/**
 * Fetch character database with optional reference resolution and debugging
 * @param {string} workKey - Work identifier
 * @param {string} dbName - Database name (e.g., 'Primary', 'Secondary')
 * @param {Object} options - Fetch options
 * @param {boolean} options.resolve - Whether to resolve references (default: true)
 * @param {boolean} options.debug - Whether to include debug information (default: false)
 * @returns {Promise<Array>} Array of character records
 */
async function fetchDB(workKey, dbName, { resolve = true, debug = false } = {}) {
  const w = workKeyForAPI(workKey);
  const u = new URL(api(`v1/works/${encodeURIComponent(w)}/db/${encodeURIComponent(dbName)}`));
  if (resolve) u.searchParams.set('resolve', '1');
  if (debug) u.searchParams.set('debug', '1');
  return fetchJSON(u.toString());
}

/**
 * Data Normalization Utilities
 */

/**
 * Normalize work identifier to ensure proper #Works_ prefix
 * @param {string} id - Work identifier in various formats
 * @returns {string} Normalized work ID with #Works_ prefix
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
 * Extract image field paths from type definitions with global fallback support
 * Enhanced to support all image field types across different works
 * @param {Array|Object} workTypeDef - Work-specific type definitions
 * @param {Object} globalTypeDef - Global type definitions from ./data/db_type.json
 * @returns {Array} Array of image field specs like [{field: 'concept_PNGName', type: '#PNGFileName', label: '設定原画', category: 'concept', priority: 1}]
 */
function extractImageFields(workTypeDef, globalTypeDef = {}) {
  const imageFields = [];
  const seenFields = new Set(); // Prevent duplicates

  console.log('🖼️ Extracting image fields from type definitions:', { workTypeDef, globalTypeDef });

  /**
   * Categorize image field by its name and type
   * @param {string} fieldName - Field name like 'concept_PNGName'
   * @param {string} type - Field type like '#PNGFileName'
   * @returns {Object} Category info with priority
   */
  const categorizeImageField = (fieldName, type) => {
    const name = fieldName.toLowerCase();

    // Define priority and categories for image types
    if (name.includes('concept') && !name.includes('alt')) {
      return { category: 'concept', priority: 1, folder: 'concept' };
    } else if (name.includes('conceptalt') || (name.includes('concept') && name.includes('alt'))) {
      return { category: 'conceptAlt', priority: 2, folder: 'conceptAlt' };
    } else if (name.includes('corefolder') || name.includes('core')) {
      return { category: 'core', priority: 3, folder: 'corefolder' };
    } else if (name.includes('carddesign') || name.includes('card')) {
      return { category: 'card', priority: 4, folder: 'cardDesign' };
    } else if (name.includes('design') && !name.includes('alt')) {
      return { category: 'design', priority: 5, folder: 'design' };
    } else if (name.includes('designalt') || (name.includes('design') && name.includes('alt'))) {
      return { category: 'designAlt', priority: 6, folder: 'designAlt' };
    } else if (name.includes('arts') || name.includes('art')) {
      return { category: 'arts', priority: 7, folder: 'arts' };
    } else if (name.includes('catalog')) {
      return { category: 'catalog', priority: 8, folder: 'catalog' };
    } else if (name.includes('general')) {
      return { category: 'general', priority: 9, folder: 'General' };
    } else {
      // Default categorization based on field type
      return { category: 'other', priority: 10, folder: 'other' };
    }
  };

  /**
   * Determine if field is array type
   * @param {string} type - Type definition
   * @returns {boolean} True if array type
   */
  const isArrayType = (type) => {
    return typeof type === 'string' && (type.includes('[]') || type.includes('Array'));
  };

  /**
   * Determine if field is path type (contains full path)
   * @param {string} fieldName - Field name
   * @returns {boolean} True if path type
   */
  const isPathType = (fieldName) => {
    return fieldName.toLowerCase().includes('path');
  };

  const traverse = (items, path = []) => {
    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;

      if (item.hashTag === 'Images' && Array.isArray(item.$type)) {
        console.log('🎯 Found Images container with children:', item.$type);
        // Found Images container, extract its children
        for (const child of item.$type) {
          if (child.hashTag && !seenFields.has(child.hashTag)) {
            const category = categorizeImageField(child.hashTag, child.$type);
            const fieldSpec = {
              field: child.hashTag,
              type: child.$type || '#PNGFileName',
              label: child.hashTag_JP || child.hashTag,
              path: [...path, 'Images', child.hashTag],
              category: category.category,
              priority: category.priority,
              folder: category.folder,
              isArray: isArrayType(child.$type),
              isPath: isPathType(child.hashTag)
            };
            imageFields.push(fieldSpec);
            seenFields.add(child.hashTag);
            console.log('✅ Added image field:', fieldSpec);
          }
        }
      } else if (Array.isArray(item.$type)) {
        traverse(item.$type, [...path, item.hashTag]);
      }
      // Also check for potential image fields in top-level items
      else if (item.hashTag && typeof item.$type === 'string' &&
               (item.$type.includes('PNG') || item.$type.includes('Image') || item.$type.includes('Photo') ||
                item.$type.includes('File') || item.hashTag.toLowerCase().includes('image'))) {
        if (!seenFields.has(item.hashTag)) {
          const category = categorizeImageField(item.hashTag, item.$type);
          const fieldSpec = {
            field: item.hashTag,
            type: item.$type,
            label: item.hashTag_JP || item.hashTag,
            path: [...path, item.hashTag],
            category: category.category,
            priority: category.priority,
            folder: category.folder,
            isArray: isArrayType(item.$type),
            isPath: isPathType(item.hashTag)
          };
          imageFields.push(fieldSpec);
          seenFields.add(item.hashTag);
          console.log('✅ Added standalone image field:', fieldSpec);
        }
      }
    }
  };

  // First process global type definitions
  if (globalTypeDef && globalTypeDef.global) {
    console.log('🌐 Processing global type definitions...');
    traverse(globalTypeDef.global);
  } else if (globalTypeDef && globalTypeDef.$DefType) {
    console.log('🌐 Processing global $DefType...');
    traverse(globalTypeDef.$DefType);
  }

  // Then process work-specific definitions (will add/override)
  if (Array.isArray(workTypeDef)) {
    console.log('🏗️ Processing work-specific type definitions (array)...');
    traverse(workTypeDef);
  } else if (workTypeDef && workTypeDef.typedef) {
    console.log('🏗️ Processing work typedef.typedef...');
    traverse(workTypeDef.typedef);
  } else if (workTypeDef && workTypeDef.$DefType) {
    console.log('🏗️ Processing work $DefType...');
    traverse(workTypeDef.$DefType);
  }

  // Sort by priority for consistent ordering
  imageFields.sort((a, b) => a.priority - b.priority);

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
 * Enhanced image gallery builder with dynamic field support
 * Creates gallery items with appropriate URLs based on database folder and image field specifications
 * @param {string} workId - Work ID
 * @param {Object} record - Character record
 * @param {Array} imageFields - Image field specifications from extractImageFields
 * @param {string} dbName - Database name (e.g., 'Primary', 'Secondary', etc.)
 * @returns {Array} Array of {url, caption, type, alt, category} objects
 */
function buildImageGallery(workId, record, imageFields, dbName = 'Primary') {
  const wdir = workId.replace('#Works_', 'Works_');
  const images = [];
  const imgData = record.Images || {};

  console.log('🖼️ Building enhanced image gallery:', { workId, dbName, imageFields, imgData });

  // If no image fields provided, extract them dynamically
  if (!imageFields || imageFields.length === 0) {
    console.log('⚠️ No image fields provided, using fallback logic');
    return buildLegacyImageGallery(workId, record, dbName);
  }

  /**
   * Build image URL with proper folder and extension handling
   * @param {string} folder - Image folder name
   * @param {string} filename - Image filename
   * @param {string} fieldType - Field type for extension detection
   * @returns {string} Complete image URL
   */
  function buildGalleryImageUrl(folder, filename, fieldType) {
    if (!filename) return '';

    // Handle filenames that already include path or extension
    if (filename.includes('/')) {
      return `/data/${wdir}/Images/${dbName}/${filename}`;
    }

    // Determine extension based on field type
    let extension = '';
    if (!filename.includes('.')) {
      if (fieldType.includes('PNG')) {
        extension = '.png';
      } else if (fieldType.includes('JPG') || fieldType.includes('JPEG')) {
        extension = '.jpg';
      } else {
        extension = '.png'; // Default
      }
    }

    return `/data/${wdir}/Images/${dbName}/${folder}/${filename}${extension}`;
  }

  for (const field of imageFields) {
    const value = imgData[field.field];
    if (!value) {
      console.log(`⚠️ No value for image field: ${field.field}`);
      continue;
    }

    const isArray = field.isArray || Array.isArray(value);
    const values = isArray ? (Array.isArray(value) ? value : [value]) : [value];

    console.log(`🔍 Processing field ${field.field}:`, { value, isArray, values, field });

    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      if (!val) continue;

      const url = buildGalleryImageUrl(field.folder, val, field.type);

      // Create caption with proper numbering for arrays
      let caption = field.label;
      if (isArray && values.length > 1) {
        caption += ` (${i + 1}/${values.length})`;
      }

      const imageItem = {
        url,
        caption,
        type: field.field,
        category: field.category,
        priority: field.priority,
        alt: `${field.label} - ${record.Name || record.FormalName || 'Character'}`
      };

      images.push(imageItem);
      console.log('✅ Added gallery image:', imageItem);
    }
  }

  // Sort by priority for consistent display order
  images.sort((a, b) => a.priority - b.priority);

  console.log('🖼️ Final enhanced gallery images:', images);
  return images;
}

/**
 * Legacy image gallery builder for fallback compatibility
 * @param {string} workId - Work ID
 * @param {Object} record - Character record
 * @param {string} dbName - Database name
 * @returns {Array} Array of image objects
 */
function buildLegacyImageGallery(workId, record, dbName = 'Primary') {
  const wdir = workId.replace('#Works_', 'Works_');
  const images = [];
  const imgData = record.Images || {};

  console.log('🔄 Building legacy image gallery:', { workId, dbName, imgData });

  // Legacy field mappings with priorities
  const legacyFields = [
    { field: 'concept_PNGName', folder: 'concept', label: '設定原画', priority: 1 },
    { field: 'conceptAlt_PNGName', folder: 'conceptAlt', label: '設定原画差分', priority: 2 },
    { field: 'corefolder_PNGPath', folder: 'corefolder', label: 'コアフォルダ', priority: 3, isPath: true },
    { field: 'cardDesign_PNGName', folder: 'cardDesign', label: 'カードデザイン', priority: 4 },
    { field: 'design_PNGName', folder: 'design', label: 'デザイン', priority: 5 },
    { field: 'designAlt_PNGName', folder: 'designAlt', label: 'デザイン差分', priority: 6 },
    { field: 'arts_PNGPath', folder: 'arts', label: 'イラスト', priority: 7, isPath: true },
    { field: 'catalog_PNGPath', folder: 'catalog', label: 'カタログ', priority: 8, isPath: true }
  ];

  for (const fieldSpec of legacyFields) {
    const value = imgData[fieldSpec.field];
    if (!value) continue;

    const isArray = Array.isArray(value);
    const values = isArray ? value : [value];

    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      if (!val) continue;

      let url = '';
      if (fieldSpec.isPath) {
        // Handle path fields
        if (val.includes('/')) {
          url = `/data/${wdir}/Images/${dbName}/${val}`;
        } else {
          const extension = val.includes('.') ? '' : '.png';
          url = `/data/${wdir}/Images/${dbName}/${fieldSpec.folder}/${val}${extension}`;
        }
      } else {
        // Handle filename fields
        const extension = val.includes('.') ? '' : '.png';
        url = `/data/${wdir}/Images/${dbName}/${fieldSpec.folder}/${val}${extension}`;
      }

      let caption = fieldSpec.label;
      if (isArray && values.length > 1) {
        caption += ` (${i + 1}/${values.length})`;
      }

      const imageItem = {
        url,
        caption,
        type: fieldSpec.field,
        category: fieldSpec.folder,
        priority: fieldSpec.priority,
        alt: `${fieldSpec.label} - ${record.Name || record.FormalName || 'Character'}`
      };

      images.push(imageItem);
      console.log('✅ Added legacy gallery image:', imageItem);
    }
  }

  // Sort by priority
  images.sort((a, b) => a.priority - b.priority);

  console.log('🖼️ Final legacy gallery images:', images);
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
 * Enhanced image handling for character records with dynamic field support
 * Dynamically resolves image paths based on extracted image fields and database folder structure
 * @param {string} workId - Work identifier (e.g., '#Works_NumberTales')
 * @param {Object} rec - Character record with Images field
 * @param {string} dbName - Database name (e.g., 'Primary', 'Secondary', etc.)
 * @param {Array} imageFields - Extracted image field definitions (optional, will be fetched if not provided)
 * @returns {Promise<string>} Promise resolving to image URL or empty string if no image found
 */
async function imageFromRecord(workId, rec, dbName = 'Primary', imageFields = null) {
  const wdir = workId.replace('#Works_', 'Works_');
  const img = rec.Images || {};

  console.log('🖼️ Finding primary image for record:', { workId, dbName, img, rec: rec.Name });

  // If no Images field, try to find image data in other fields
  if (!img || Object.keys(img).length === 0) {
    console.log('⚠️ No Images field found, checking alternative locations...');

    // Check for direct image fields in record
    const potentialImageFields = ['poster', 'thumbnail', 'image', 'photo'];
    for (const field of potentialImageFields) {
      if (rec[field]) {
        const url = buildImageUrl(wdir, dbName, 'General', rec[field], '');
        console.log('✅ Found alternative image field:', field, '→', url);
        return url;
      }
    }

    // For SinisterChangingGirls and other cross-linked records, check if there's a _DBLink
    if (rec._DBLink) {
      console.log('🔗 Found cross-link, checking linked record for images...');
      // Return empty for now, could implement cross-link resolution in the future
      return '';
    }

    console.log('❌ No images found in record');
    return '';
  }

  // Get image fields if not provided
  if (!imageFields) {
    try {
      const [workTypeDef, globalTypeDef] = await Promise.all([
        fetchWorkTypeDef(workId),
        fetchGlobalTypeDef()
      ]);
      imageFields = extractImageFields(workTypeDef, globalTypeDef);
    } catch (error) {
      console.warn('⚠️ Failed to fetch image fields, using fallback:', error);
      imageFields = []; // Will fall back to legacy logic
    }
  }

  /**
   * Build image URL with proper extension handling
   * @param {string} workDir - Work directory name
   * @param {string} dbName - Database name
   * @param {string} folder - Image folder name
   * @param {string} filename - Image filename
   * @param {string} defaultExt - Default extension
   * @returns {string} Complete image URL
   */
  function buildImageUrl(workDir, dbName, folder, filename, defaultExt = '.png') {
    if (!filename) return '';

    // Handle filenames that already include path
    if (filename.includes('/')) {
      return `/data/${workDir}/Images/${dbName}/${filename}`;
    }

    // Add extension if not present
    const hasExtension = filename.includes('.');
    const extension = hasExtension ? '' : defaultExt;

    return `/data/${workDir}/Images/${dbName}/${folder}/${filename}${extension}`;
  }

  // If we have dynamic image fields, use them with priority order
  if (imageFields && imageFields.length > 0) {
    console.log('🎯 Using dynamic image fields for image resolution:', imageFields);

    // Sort by priority (already sorted in extractImageFields)
    for (const field of imageFields) {
      const value = img[field.field];

      if (!value) continue;

      console.log(`🔍 Checking field ${field.field}:`, value);

      let filename = '';

      if (Array.isArray(value)) {
        // Use first available image from array
        filename = value[0];
      } else {
        filename = value;
      }

      if (filename) {
        const url = buildImageUrl(
          wdir,
          dbName,
          field.folder,
          filename,
          field.type.includes('PNG') ? '.png' :
          field.type.includes('JPG') ? '.jpg' : '.png'
        );

        console.log('✅ Found image using dynamic field:', field.field, '→', url);
        return url;
      }
    }
  }

  // Fallback to legacy static logic if dynamic fields didn't find anything
  console.log('🔄 Falling back to legacy image resolution...');

  // Priority order for thumbnail selection (legacy logic)
  const imagePriority = [
    // High priority: concept images
    () => img.concept_PNGName ? buildImageUrl(wdir, dbName, 'concept', img.concept_PNGName) : null,
    () => img.conceptAlt_PNGName ?
      (Array.isArray(img.conceptAlt_PNGName) ?
        buildImageUrl(wdir, dbName, 'conceptAlt', img.conceptAlt_PNGName[0]) :
        buildImageUrl(wdir, dbName, 'conceptAlt', img.conceptAlt_PNGName)) : null,

    // Medium priority: core folder images
    () => {
      if (Array.isArray(img.corefolder_PNGPath) && img.corefolder_PNGPath[0]) {
        const path = img.corefolder_PNGPath[0];
        return buildImageUrl(wdir, dbName, 'corefolder', path, path.endsWith('.png') ? '' : '.png');
      }
      return null;
    },

    // Card design images (FLInvestigator78)
    () => img.cardDesign_PNGName ? buildImageUrl(wdir, dbName, 'cardDesign', img.cardDesign_PNGName) : null,

    // Design images
    () => img.design_PNGName ? buildImageUrl(wdir, dbName, 'design', img.design_PNGName) : null,
    () => img.designAlt_PNGName ?
      (Array.isArray(img.designAlt_PNGName) ?
        buildImageUrl(wdir, dbName, 'designAlt', img.designAlt_PNGName[0]) :
        buildImageUrl(wdir, dbName, 'designAlt', img.designAlt_PNGName)) : null,

    // Arts images (FLInvestigator78)
    () => {
      if (Array.isArray(img.arts_PNGPath) && img.arts_PNGPath[0]) {
        const path = img.arts_PNGPath[0];
        return buildImageUrl(wdir, dbName, 'arts', path, path.endsWith('.png') ? '' : '.png');
      }
      return null;
    },

    // Catalog images
    () => {
      if (Array.isArray(img.catalog_PNGPath) && img.catalog_PNGPath[0]) {
        const path = img.catalog_PNGPath[0];
        return buildImageUrl(wdir, dbName, 'catalog', path, path.endsWith('.png') ? '' : '.png');
      }
      return null;
    },

    // Special cases for Proxies and other works
    () => img.General && img.General.poster ? `/data/${wdir}/Images/General/${img.General.poster}` : null,
  ];

  // Try each image source in priority order
  for (const getImageUrl of imagePriority) {
    const url = getImageUrl();
    if (url) {
      console.log('✅ Found image using legacy logic:', url);
      return url;
    }
  }

  // Fallback: try Primary folder if not Primary database and no image found
  if (dbName !== 'Primary') {
    console.log('🔄 Trying Primary folder fallback...');
    const fallbackUrl = await imageFromRecord(workId, rec, 'Primary', imageFields);
    if (fallbackUrl) {
      console.log('✅ Found fallback image:', fallbackUrl);
      return fallbackUrl;
    }
  }

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
 * Render the character list view with search filtering and enhanced image support
 * @param {Array} records - Array of character records
 * @param {string} workId - Work identifier (e.g., '#Works_NumberTales')
 * @param {Function} onOpen - Callback function when a character is selected
 * @returns {Promise<void>} Async function that updates the list view DOM
 */
async function renderList(records, workId, onOpen) {
  const list = $('#list');
  list.innerHTML = '';
  let shown = 0;
  const qs = getQS();
  const filter = (qs.q || $('#search-input').value || '').trim();

  // Get current database name from global state
  const state = window.__CHAR_STATE__;
  const dbName = state ? state.db : 'Primary';
  const imageFields = state ? state.imageFields : null;

  // Show loading indicator for list images
  const loadingPlaceholder = (title) => el('article', { class: 'grid-item loading', role: 'button', tabindex: 0 }, [
    el('div', { class: 'thumb placeholder' }, ['📷']),
    el('h3', {}, [title]),
    el('div', { class: 'sub' }, ['読み込み中...'])
  ]);

  // Process records in batches for better performance
  const batchSize = 10;
  const batches = [];
  for (let i = 0; i < records.length; i += batchSize) {
    batches.push(records.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    const batchPromises = batch.map(async (r) => {
      if (!matchFilter(r, filter)) return null;

      const title = r.Name ? `${r.Name}${r.Num != null ? `（${r.Num}）` : ''}` : (r.FormalName || r.ModelName || r.Name_EN || '(No Name)');

      try {
        // Get image with enhanced async support
        const img = await imageFromRecord(workId, r, dbName, imageFields);

        const sub = r.FormalName_EN || r.Name_EN || r.ModelNumber || '';
        const chipEls = [];
        if (r.GenderType_JP || r.GenderType) chipEls.push(el('span', { class: 'chip' }, r.GenderType_JP || r.GenderType));
        if (r.Class || r.Class_EN) chipEls.push(el('span', { class: 'chip' }, r.Class || r.Class_EN));

        return {
          element: el('article', {
            class: 'grid-item',
            role: 'button',
            tabindex: 0,
            onkeydown: (ev) => { if (ev.key === 'Enter') onOpen(r); },
            onclick: () => onOpen(r)
          }, [
            img ? el('img', { class: 'thumb', alt: 'poster', src: img, loading: 'lazy' }) :
                  el('div', { class: 'thumb placeholder' }, ['📷']),
            el('h3', {}, [title]),
            sub ? el('div', { class: 'sub' }, [sub]) : null,
            chipEls.length ? el('div', { class: 'meta' }, chipEls) : null
          ].filter(Boolean)),
          record: r
        };
      } catch (error) {
        console.warn('⚠️ Failed to load image for record:', r.Name, error);

        // Fallback to no-image display
        const sub = r.FormalName_EN || r.Name_EN || r.ModelNumber || '';
        const chipEls = [];
        if (r.GenderType_JP || r.GenderType) chipEls.push(el('span', { class: 'chip' }, r.GenderType_JP || r.GenderType));
        if (r.Class || r.Class_EN) chipEls.push(el('span', { class: 'chip' }, r.Class || r.Class_EN));

        return {
          element: el('article', {
            class: 'grid-item',
            role: 'button',
            tabindex: 0,
            onkeydown: (ev) => { if (ev.key === 'Enter') onOpen(r); },
            onclick: () => onOpen(r)
          }, [
            el('div', { class: 'thumb placeholder' }, ['📷']),
            el('h3', {}, [title]),
            sub ? el('div', { class: 'sub' }, [sub]) : null,
            chipEls.length ? el('div', { class: 'meta' }, chipEls) : null
          ].filter(Boolean)),
          record: r
        };
      }
    });

    // Wait for batch to complete and add to DOM
    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      if (result) {
        list.appendChild(result.element);
        shown++;
      }
    }

    // Allow UI to update between batches
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  $('#list-empty').hidden = shown > 0;
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
 * Render detailed character view with comprehensive information and image gallery
 * @param {string} workId - Work identifier (e.g., '#Works_NumberTales')
 * @param {Object} rec - Character record with all data fields
 * @returns {Promise<void>} Async function that updates the detail view DOM
 */
async function renderDetail(workId, rec) {
  $('#detail-title').textContent = rec.Name ? `${rec.Name}${rec.Num != null ? `（${rec.Num}）` : ''}` : (rec.FormalName || rec.ModelName || rec.Name_EN || '詳細');
  const mount = $('#detail');
  mount.innerHTML = '';

  // Get current database name from global state
  const state = window.__CHAR_STATE__;
  const dbName = state ? state.db : 'Primary';

  try {
    // Show minimal loading for detail view
    mount.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted);">詳細情報を読み込んでいます...</div>';

    // Fetch comprehensive metadata for field localization with aggressive caching
    const [workTypeDef, globalTypeDef, globalDefType, workMeta, globalMeta] = await Promise.all([
      fetchWorkTypeDef(workId),
      fetchGlobalTypeDef(),
      fetchGlobalDefType(),
      fetchWorkMeta(workId),
      fetchGlobalMeta()
    ]);

    // Clear loading message
    mount.innerHTML = '';

    // Build comprehensive field label mapping with global fallbacks
    const fieldLabelMap = buildFieldLabelMap(workTypeDef, globalTypeDef);

    // Main poster image with database-specific path (async)
    const poster = await imageFromRecord(workId, rec, dbName);

    // Build image gallery from comprehensive type definitions
    const imageFields = extractImageFields(workTypeDef, globalTypeDef);
    const galleryImages = buildImageGallery(workId, rec, imageFields, dbName);

  // Create left section with poster and gallery - optimized loading
  const imageSection = [
    poster ? el('img', { class: 'poster', src: poster, alt: 'poster', loading: 'lazy' }) : el('div', { class: 'poster' }),
    galleryImages.length > 0 ? el('div', { class: 'image-gallery' }, [
      el('h4', {}, [getFieldLabel('Gallery', fieldLabelMap, workMeta, globalDefType, '画像ギャラリー')]),
      el('div', { class: 'image-grid' }, galleryImages.slice(0, 6).map(imgData => // Limit initial images for performance
        el('div', { class: 'image-item' }, [
          el('img', { src: imgData.url, alt: imgData.alt, loading: 'lazy' }),
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
    ]) : null
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
    rec.Relation && (rec.Relation.Related || rec.Relation.Commented) ? renderRelations(rec.Relation) : null
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

  window.__eventHandlers.searchInput = () => {
    setQS({ q: $('#search-input').value });
    filterListOnly();
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

function filterListOnly() {
  const state = window.__CHAR_STATE__;
  if (!state || !state.records) return;
  renderList(state.records, state.workId, openDetail);
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

async function main() {
  // Prevent duplicate initialization
  if (isInitialized) {
    console.log('⚠️ Application already initialized, skipping...');
    return;
  }
  isInitialized = true;

  const startTime = performance.now();
  console.log('🚀 Initializing character browser application...');

  try {
    // Show loading indicator
    showLoadingIndicator('アプリケーションを初期化しています...');

    // Step 1: Service Worker initialization
    let stepStart = performance.now();
    await ensureApiSW();
    console.log(`✅ Service Worker initialized in ${(performance.now() - stepStart).toFixed(2)}ms`);

    // Step 2: Wire UI controls
    stepStart = performance.now();
    wireControls();
    console.log(`✅ UI controls wired in ${(performance.now() - stepStart).toFixed(2)}ms`);

    // Step 3: Populate works list
    stepStart = performance.now();
    const qs = getQS();
    const wk = await populateWorks(qs.work);
    console.log(`✅ Works populated in ${(performance.now() - stepStart).toFixed(2)}ms:`, wk);

    // Step 4: Populate databases
    stepStart = performance.now();
    await populateDBs(wk, qs.db || 'Primary');
    console.log(`✅ Databases populated in ${(performance.now() - stepStart).toFixed(2)}ms`);

    // Update loading message for data loading phase
    showLoadingIndicator('キャラクターデータを読み込んでいます...');

    // Step 5: Load initial data
    stepStart = performance.now();
    await reloadInternal(false); // Pass false to skip duplicate loading indicator
    console.log(`✅ Initial data loaded in ${(performance.now() - stepStart).toFixed(2)}ms`);

    hideLoadingIndicator();

    const totalTime = performance.now() - startTime;
    console.log(`🎉 Application initialization complete in ${totalTime.toFixed(2)}ms`);

  } catch (error) {
    const totalTime = performance.now() - startTime;
    console.error(`❌ Application initialization failed after ${totalTime.toFixed(2)}ms:`, error);
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
    indicator.hidden = false;
  }
}

/**
 * Hide loading indicator
 */
function hideLoadingIndicator() {
  const indicator = $('#loading-indicator');
  if (indicator) {
    indicator.hidden = true;
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
 * Internal reload implementation with configurable loading indicator
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

    console.log('📊 Reloading data:', { workId, db, resolve, debug });

    // Enhanced data loading with timeout and step tracking
    const startTime = performance.now();
    let currentStep = 'データベース読み込み';

    if (showLoading) {
      showLoadingIndicator(`${currentStep}中...`);
    }

    // Fetch character data and metadata with timeout protection
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
      ])
    ];

    const stepStart = performance.now();
    const [res, workMeta] = await Promise.all(fetchPromises);
    console.log(`⏱️ ${currentStep} completed in ${(performance.now() - stepStart).toFixed(2)}ms`);

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
      console.log(`📋 Processing ${recs.length} records`);
    }

    // Apply Commons data for missing fields
    recs = applyCommonsData(recs, workMeta, db);
    console.log(`⏱️ ${currentStep} completed in ${(performance.now() - processStart).toFixed(2)}ms`);

    // UI update step
    currentStep = 'UI更新';
    if (showLoading) {
      showLoadingIndicator(`${currentStep}中...`);
    }

    const uiStart = performance.now();

    // Fetch image field definitions for enhanced image support
    try {
      const [workTypeDef, globalTypeDef] = await Promise.all([
        fetchWorkTypeDef(workId),
        fetchGlobalTypeDef()
      ]);
      const imageFields = extractImageFields(workTypeDef, globalTypeDef);

      window.__CHAR_STATE__ = {
        workId,
        db,
        resolve,
        debug,
        records: recs,
        imageFields,
        workTypeDef,
        globalTypeDef
      };

      console.log(`🖼️ Extracted ${imageFields.length} image fields for work: ${workId}`, imageFields);

    } catch (error) {
      console.warn('⚠️ Failed to extract image fields, using fallback:', error);
      window.__CHAR_STATE__ = { workId, db, resolve, debug, records: recs };
    }

    $('#list-view').hidden = false;
    $('#detail-view').hidden = true;
    $('#search-input').value = qs.q || '';

    await renderList(recs, workId, openDetail);
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
main().catch(err => {
  console.error('Initialization error:', err);
  document.body.innerHTML = `<div style="padding: 20px; color: red;">初期化エラー: ${err.message}</div>`;
});

// Add performance monitor in development
addPerformanceMonitor();

window.addEventListener('load', main);
