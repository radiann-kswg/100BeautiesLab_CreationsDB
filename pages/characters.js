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
 * Fetch and parse JSON from URL with error handling and debug logging
 * @param {string} url - URL to fetch
 * @returns {Promise<Object>} Parsed JSON response
 * @throws {Error} If request fails or response is not OK
 */
async function fetchJSON(url) {
  console.log('🌐 Fetching:', url);
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      console.error('❌ Fetch failed:', {
        status: res.status,
        statusText: res.statusText,
        url: url,
        headers: Object.fromEntries(res.headers.entries())
      });
      throw new Error(`${res.status} ${res.statusText} ${url}`);
    }
    const data = await res.json();
    console.log('✅ Fetch success:', url, 'Response size:', JSON.stringify(data).length, 'chars');
    return data;
  } catch (error) {
    console.error('❌ Fetch error:', {
      message: error.message,
      url: url,
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
 * @param {Array|Object} workTypeDef - Work-specific type definitions
 * @param {Object} globalTypeDef - Global type definitions from ./data/db_type.json
 * @returns {Array} Array of image field specs like [{field: 'concept_PNGName', type: '#PNGFileName', label: '設定原画'}]
 */
function extractImageFields(workTypeDef, globalTypeDef = {}) {
  const imageFields = [];

  console.log('🖼️ Extracting image fields from type definitions:', { workTypeDef, globalTypeDef });

  const traverse = (items, path = []) => {
    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;

      if (item.hashTag === 'Images' && Array.isArray(item.$type)) {
        console.log('🎯 Found Images container with children:', item.$type);
        // Found Images container, extract its children
        for (const child of item.$type) {
          if (child.hashTag && (child.hashTag_JP || child.hashTag)) {
            const fieldSpec = {
              field: child.hashTag,
              type: child.$type || '#PNGFileName',
              label: child.hashTag_JP || child.hashTag,
              path: [...path, 'Images', child.hashTag]
            };
            imageFields.push(fieldSpec);
            console.log('✅ Added image field:', fieldSpec);
          }
        }
      } else if (Array.isArray(item.$type)) {
        traverse(item.$type, [...path, item.hashTag]);
      }
      // Also check for potential image fields in top-level items
      else if (item.hashTag && typeof item.$type === 'string' &&
               (item.$type.includes('PNG') || item.$type.includes('Image') || item.$type.includes('Photo'))) {
        const fieldSpec = {
          field: item.hashTag,
          type: item.$type,
          label: item.hashTag_JP || item.hashTag,
          path: [...path, item.hashTag]
        };
        imageFields.push(fieldSpec);
        console.log('✅ Added standalone image field:', fieldSpec);
      }
    }
  };

  // First process global type definitions
  if (globalTypeDef.$DefType) {
    console.log('🌐 Processing global type definitions...');
    traverse(globalTypeDef.$DefType);
  }

  // Then process work-specific definitions (will add/override)
  if (Array.isArray(workTypeDef)) {
    console.log('🏗️ Processing work-specific type definitions (array)...');
    traverse(workTypeDef);
  } else if (workTypeDef && workTypeDef.$DefType) {
    console.log('🏗️ Processing work-specific type definitions (object)...');
    traverse(workTypeDef.$DefType);
  }

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
 * Build image URLs from record data based on type definitions
 * Creates gallery items with appropriate URLs based on database folder
 * @param {string} workId - Work ID
 * @param {Object} record - Character record
 * @param {Array} imageFields - Image field specifications
 * @param {string} dbName - Database name (e.g., 'Primary', 'Secondary', etc.)
 * @returns {Array} Array of {url, caption, type} objects
 */
function buildImageGallery(workId, record, imageFields, dbName = 'Primary') {
  const wdir = workId.replace('#Works_', 'Works_');
  const images = [];
  const imgData = record.Images || {};

  console.log('🖼️ Building image gallery:', { workId, dbName, imageFields, imgData });

  for (const field of imageFields) {
    const value = imgData[field.field];
    if (!value) {
      console.log(`⚠️ No value for image field: ${field.field}`);
      continue;
    }

    const isArray = field.type.includes('[]');
    const values = isArray ? (Array.isArray(value) ? value : [value]) : [value];

    console.log(`🔍 Processing field ${field.field}:`, { value, isArray, values });

    for (const val of values) {
      if (!val) continue;

      let url = '';
      let extension = '';

      // Determine file extension based on type
      if (field.type.includes('PNG')) {
        extension = '.png';
      } else if (field.type.includes('JPG') || field.type.includes('JPEG')) {
        extension = '.jpg';
      } else if (field.type.includes('Path') && !val.includes('.')) {
        // For paths without extension, try common ones
        extension = '';
      }

      // Build URL based on field patterns
      if (field.field.includes('concept')) {
        const dir = field.field.includes('Alt') ? 'conceptAlt' : 'concept';
        url = `/data/${wdir}/Images/${dbName}/${dir}/${val}${extension}`;
      } else if (field.field.includes('design')) {
        const dir = field.field.includes('Alt') ? 'designAlt' : 'design';
        url = `/data/${wdir}/Images/${dbName}/${dir}/${val}${extension}`;
      } else if (field.field.includes('corefolder')) {
        url = `/data/${wdir}/Images/${dbName}/corefolder/${val}${extension}`;
      } else if (field.field.includes('catalog')) {
        url = `/data/${wdir}/Images/${dbName}/catalog/${val}${extension}`;
      } else if (field.field.includes('arts')) {
        url = `/data/${wdir}/Images/${dbName}/arts/${val}${extension}`;
      } else {
        // Generic fallback - try database folder first
        if (val.includes('/')) {
          // Value contains path
          url = `/data/${wdir}/Images/${dbName}/${val}`;
        } else {
          // Simple filename
          url = `/data/${wdir}/Images/${dbName}/${val}${extension}`;
        }
      }

      const imageItem = {
        url,
        caption: field.label + (isArray && values.length > 1 ? ` (${values.indexOf(val) + 1})` : ''),
        type: field.field,
        alt: `${field.label} - ${record.Name || 'Character'}`
      };

      images.push(imageItem);
      console.log('✅ Added image:', imageItem);
    }
  }

  console.log('🖼️ Final gallery images:', images);
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
 * Image handling for character records
 * Dynamically resolves image paths based on the selected database folder
 * @param {string} workId - Work identifier (e.g., '#Works_NumberTales')
 * @param {Object} rec - Character record with Images field
 * @param {string} dbName - Database name (e.g., 'Primary', 'Secondary', etc.)
 * @returns {string} Image URL or empty string if no image found
 */
function imageFromRecord(workId, rec, dbName = 'Primary') {
  const wdir = workId.replace('#Works_', 'Works_');
  const img = rec.Images || {};

  console.log('🖼️ Finding primary image for record:', { workId, dbName, img, rec: rec.Name });

  // Use database name as folder name (Primary, Secondary, SemiPrimary, etc.)
  const dbFolder = dbName;

  // Priority order for thumbnail selection
  const imagePriority = [
    // High priority: concept images
    () => img.concept_PNGName ? `/data/${wdir}/Images/${dbFolder}/concept/${img.concept_PNGName}.png` : null,
    () => img.conceptAlt_PNGName ?
      (Array.isArray(img.conceptAlt_PNGName) ?
        `/data/${wdir}/Images/${dbFolder}/conceptAlt/${img.conceptAlt_PNGName[0]}.png` :
        `/data/${wdir}/Images/${dbFolder}/conceptAlt/${img.conceptAlt_PNGName}.png`) : null,

    // Medium priority: core folder images
    () => {
      if (Array.isArray(img.corefolder_PNGPath) && img.corefolder_PNGPath[0]) {
        const path = img.corefolder_PNGPath[0];
        return `/data/${wdir}/Images/${dbFolder}/corefolder/${path}${path.endsWith('.png') ? '' : '.png'}`;
      }
      return null;
    },

    // Design images
    () => img.design_PNGName ? `/data/${wdir}/Images/${dbFolder}/design/${img.design_PNGName}.png` : null,
    () => img.designAlt_PNGName ?
      (Array.isArray(img.designAlt_PNGName) ?
        `/data/${wdir}/Images/${dbFolder}/designAlt/${img.designAlt_PNGName[0]}` :
        `/data/${wdir}/Images/${dbFolder}/designAlt/${img.designAlt_PNGName}`) : null,

    // Catalog images
    () => {
      if (Array.isArray(img.catalog_PNGPath) && img.catalog_PNGPath[0]) {
        const path = img.catalog_PNGPath[0];
        return `/data/${wdir}/Images/${dbFolder}/catalog/${path}${path.endsWith('.png') ? '' : '.png'}`;
      }
      return null;
    },

    // Special cases for Proxies
    () => img.General && img.General.poster ? `/data/${wdir}/Images/General/${img.General.poster}` : null,
  ];

  // Try each image source in priority order
  for (const getImageUrl of imagePriority) {
    const url = getImageUrl();
    if (url) {
      console.log('✅ Found primary image:', url);
      return url;
    }
  }

  // Fallback: try Primary folder if not Primary database and no image found
  if (dbName !== 'Primary') {
    console.log('🔄 Trying Primary folder fallback...');
    const fallbackUrl = imageFromRecord(workId, rec, 'Primary');
    if (fallbackUrl) {
      console.log('✅ Found fallback image:', fallbackUrl);
      return fallbackUrl;
    }
  }

  console.log('❌ No image found for record');
  return '';
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
 * Render the character list view with search filtering
 * @param {Array} records - Array of character records
 * @param {string} workId - Work identifier (e.g., '#Works_NumberTales')
 * @param {Function} onOpen - Callback function when a character is selected
 */
function renderList(records, workId, onOpen) {
  const list = $('#list');
  list.innerHTML = '';
  let shown = 0;
  const qs = getQS();
  const filter = (qs.q || $('#search-input').value || '').trim();

  // Get current database name from global state
  const state = window.__CHAR_STATE__;
  const dbName = state ? state.db : 'Primary';

  for (const r of records) {
    if (!matchFilter(r, filter)) continue;
    shown++;
    const img = imageFromRecord(workId, r, dbName);
    const title = r.Name ? `${r.Name}${r.Num != null ? `（${r.Num}）` : ''}` : (r.FormalName || r.ModelName || r.Name_EN || '(No Name)');
    const sub = r.FormalName_EN || r.Name_EN || r.ModelNumber || '';
    const chipEls = [];
    if (r.GenderType_JP || r.GenderType) chipEls.push(el('span', { class: 'chip' }, r.GenderType_JP || r.GenderType));
    if (r.Class || r.Class_EN) chipEls.push(el('span', { class: 'chip' }, r.Class || r.Class_EN));
    const item = el('article', { class: 'grid-item', role: 'button', tabindex: 0, onkeydown: (ev) => { if (ev.key === 'Enter') onOpen(r); }, onclick: () => onOpen(r) }, [
      img ? el('img', { class: 'thumb', alt: 'poster', src: img }) : null,
      el('h3', {}, [title]),
      sub ? el('div', { class: 'sub' }, [sub]) : null,
      chipEls.length ? el('div', { class: 'meta' }, chipEls) : null
    ]);
    list.appendChild(item);
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

  // Fetch comprehensive metadata for field localization
  const [workTypeDef, globalTypeDef, globalDefType, workMeta, globalMeta] = await Promise.all([
    fetchWorkTypeDef(workId),
    fetchGlobalTypeDef(),
    fetchGlobalDefType(),
    fetchWorkMeta(workId),
    fetchGlobalMeta()
  ]);

  // Build comprehensive field label mapping with global fallbacks
  const fieldLabelMap = buildFieldLabelMap(workTypeDef, globalTypeDef);

  // Main poster image with database-specific path
  const poster = imageFromRecord(workId, rec, dbName);

  // Build image gallery from comprehensive type definitions
  const imageFields = extractImageFields(workTypeDef, globalTypeDef);
  const galleryImages = buildImageGallery(workId, rec, imageFields, dbName);

  // Create left section with poster and gallery
  const imageSection = [
    poster ? el('img', { class: 'poster', src: poster, alt: 'poster' }) : el('div', { class: 'poster' }),
    galleryImages.length > 0 ? el('div', { class: 'image-gallery' }, [
      el('h4', {}, [getFieldLabel('Gallery', fieldLabelMap, workMeta, globalDefType, '画像ギャラリー')]),
      el('div', { class: 'image-grid' }, galleryImages.map(imgData =>
        el('div', { class: 'image-item' }, [
          el('img', { src: imgData.url, alt: imgData.alt, loading: 'lazy' }),
          imgData.caption ? el('div', { class: 'caption' }, [imgData.caption]) : null
        ].filter(Boolean))
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

async function reload() {
  const qs = getQS();
  const workId = $('#select-work').value;
  const db = $('#select-db').value || 'Primary';
  const resolve = $('#chk-resolve').checked;
  const debug = $('#chk-debug').checked;

  // Fetch character data and metadata in parallel
  const [res, workMeta] = await Promise.all([
    fetchDB(workId, db, { resolve, debug }),
    fetchWorkMeta(workId)
  ]);

  let recs = res.records || [];

  // Apply Commons data for missing fields
  recs = applyCommonsData(recs, workMeta, db);

  window.__CHAR_STATE__ = { workId, db, resolve, debug, records: recs };
  $('#list-view').hidden = false;
  $('#detail-view').hidden = true;
  $('#search-input').value = qs.q || '';
  renderList(recs, workId, openDetail);
  if (qs.num) {
    const target = recs.find(r => String(r.Num) === String(qs.num));
    if (target) openDetail(target);
  }
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

  try {
    console.log('🚀 Initializing character browser application...');

    // Show loading indicator
    showLoadingIndicator('アプリケーションを初期化しています...');

    await ensureApiSW();
    console.log('✅ Service Worker initialized');

    wireControls();
    console.log('✅ UI controls wired');

    const qs = getQS();
    const wk = await populateWorks(qs.work);
    console.log('✅ Works populated:', wk);

    await populateDBs(wk, qs.db || 'Primary');
    console.log('✅ Databases populated');

    await reload();
    console.log('✅ Initial data loaded');

    hideLoadingIndicator();
    console.log('🎉 Application initialization complete');

  } catch (error) {
    console.error('❌ Application initialization failed:', error);
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
 */
async function reload() {
  try {
    showLoadingIndicator('キャラクターデータを読み込んでいます...');

    const qs = getQS();
    const workId = $('#select-work').value;
    const db = $('#select-db').value || 'Primary';
    const resolve = $('#chk-resolve').checked;
    const debug = $('#chk-debug').checked;

    if (!workId) {
      throw new Error('作品が選択されていません');
    }

    console.log('📊 Reloading data:', { workId, db, resolve, debug });

    // Fetch character data and metadata in parallel
    const [res, workMeta] = await Promise.all([
      fetchDB(workId, db, { resolve, debug }),
      fetchWorkMeta(workId)
    ]);

    let recs = res.records || [];
    if (recs.length === 0) {
      console.warn('⚠️ No records found for:', { workId, db });
    }

    // Apply Commons data for missing fields
    recs = applyCommonsData(recs, workMeta, db);

    window.__CHAR_STATE__ = { workId, db, resolve, debug, records: recs };
    $('#list-view').hidden = false;
    $('#detail-view').hidden = true;
    $('#search-input').value = qs.q || '';

    renderList(recs, workId, openDetail);

    if (qs.num) {
      const target = recs.find(r => String(r.Num) === String(qs.num));
      if (target) {
        openDetail(target);
      } else {
        console.warn('⚠️ Character not found for number:', qs.num);
      }
    }

    hideLoadingIndicator();
    console.log('✅ Data reload complete:', recs.length, 'records');

  } catch (error) {
    console.error('❌ Reload failed:', error);
    hideLoadingIndicator();
    showErrorMessage('データの読み込みに失敗しました', error);
  }
}

/**
 * Main entry point - initialize application when DOM is loaded
 */
main().catch(err => {
  console.error('Initialization error:', err);
  document.body.innerHTML = `<div style="padding: 20px; color: red;">初期化エラー: ${err.message}</div>`;
});

window.addEventListener('load', main);
