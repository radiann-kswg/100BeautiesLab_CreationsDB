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

// Prevent external tracking scripts (Cloudflare Insights, etc.) from being injected
(() => {
  // Block Cloudflare beacon script injection more comprehensively
  const originalCreateElement = document.createElement;
  const originalAppendChild = Node.prototype.appendChild;
  const originalInsertBefore = Node.prototype.insertBefore;
  const originalWrite = document.write;
  const originalWriteln = document.writeln;

  function isTrackingScript(src) {
    if (!src) return false;
    const url = new URL(src, document.baseURI);
    return url.hostname.includes('cloudflareinsights.com') ||
           url.hostname.includes('beacon.min.js') ||
           url.pathname.includes('beacon.min.js') ||
           src.includes('cloudflareinsights') ||
           src.includes('beacon.min.js');
  }

  function blockTrackingScript(node) {
    if (node && node.tagName === 'SCRIPT' && (node.src || node.textContent)) {
      if (isTrackingScript(node.src) ||
          (node.textContent && node.textContent.includes('cloudflareinsights'))) {
        console.log('🚫 Blocked external tracking script:', node.src || 'inline');
        return true;
      }
    }
    return false;
  }

  // Override createElement to block script creation
  document.createElement = function(tagName) {
    const element = originalCreateElement.call(this, tagName);
    if (tagName.toLowerCase() === 'script') {
      const originalSetAttribute = element.setAttribute;
      element.setAttribute = function(name, value) {
        if (name === 'src' && isTrackingScript(value)) {
          console.log('🚫 Blocked script src:', value);
          return;
        }
        return originalSetAttribute.call(this, name, value);
      };
    }
    return element;
  };

  // Override appendChild
  Node.prototype.appendChild = function(node) {
    if (blockTrackingScript(node)) return node;
    return originalAppendChild.call(this, node);
  };

  // Override insertBefore
  Node.prototype.insertBefore = function(node, before) {
    if (blockTrackingScript(node)) return node;
    return originalInsertBefore.call(this, node, before);
  };

  // Override document.write and document.writeln
  document.write = function(text) {
    if (text && (text.includes('cloudflareinsights') || text.includes('beacon.min.js'))) {
      console.log('🚫 Blocked document.write with tracking script');
      return;
    }
    return originalWrite.call(this, text);
  };

  document.writeln = function(text) {
    if (text && (text.includes('cloudflareinsights') || text.includes('beacon.min.js'))) {
      console.log('🚫 Blocked document.writeln with tracking script');
      return;
    }
    return originalWriteln.call(this, text);
  };

  // Also block dynamic script injection via innerHTML
  const originalInnerHTMLSetter = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML').set;
  Object.defineProperty(Element.prototype, 'innerHTML', {
    set: function(value) {
      if (typeof value === 'string' &&
          (value.includes('cloudflareinsights') || value.includes('beacon.min.js'))) {
        console.log('🚫 Blocked innerHTML with tracking script');
        return;
      }
      return originalInnerHTMLSetter.call(this, value);
    },
    get: Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML').get
  });

  // Use MutationObserver to catch any scripts that slip through
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check for script elements
          if (node.tagName === 'SCRIPT' && node.src && isTrackingScript(node.src)) {
            console.log('🚫 MutationObserver blocked tracking script:', node.src);
            node.remove();
          }
          // Check for nested script elements
          const scripts = node.querySelectorAll ? node.querySelectorAll('script[src]') : [];
          scripts.forEach((script) => {
            if (isTrackingScript(script.src)) {
              console.log('🚫 MutationObserver blocked nested tracking script:', script.src);
              script.remove();
            }
          });
        }
      });
    });
  });

  // Start observing once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    });
  } else {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
})();

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
        console.log(`🎯 Found Images container (${source}):`, item.$type);
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
    // Try to infer from field name
    if (fieldLower.includes('concept')) {
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
  if (field.category === 'general' || directory === 'General') {
    return `/data/${wdir}/Images/General/${value}${extension}`;
  } else {
    return `/data/${wdir}/Images/${dbName}/${directory}/${value}${extension}`;
  }
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
  const img = rec.Images || {};

  console.log('🔧 Enhanced static resolution for:', { workId, dbName, img });

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
    () => img.design_PNGName ? `/data/${wdir}/Images/${dbName}/design/${img.design_PNGName}.png` : null,
    () => img.cardDesign_PNGName ? `/data/${wdir}/Images/${dbName}/cardDesign/${img.cardDesign_PNGName}.png` : null,
    () => {
      if (img.designAlt_PNGName) {
        const val = Array.isArray(img.designAlt_PNGName) ? img.designAlt_PNGName[0] : img.designAlt_PNGName;
        const ext = val.includes('.') ? '' : '.png';
        return `/data/${wdir}/Images/${dbName}/designAlt/${val}${ext}`;
      }
      return null;
    },
    () => {
      if (img.designAlt_PNGPath) {
        const val = Array.isArray(img.designAlt_PNGPath) ? img.designAlt_PNGPath[0] : img.designAlt_PNGPath;
        return `/data/${wdir}/Images/${dbName}/designAlt/${val}`;
      }
      return null;
    },

    // Arts images
    () => {
      if (img.arts_PNGPath) {
        const val = Array.isArray(img.arts_PNGPath) ? img.arts_PNGPath[0] : img.arts_PNGPath;
        return `/data/${wdir}/Images/${dbName}/arts/${val}`;
      }
      return null;
    },

    // Core folder images
    () => {
      if (img.corefolder_PNGPath) {
        const val = Array.isArray(img.corefolder_PNGPath) ? img.corefolder_PNGPath[0] : img.corefolder_PNGPath;
        const ext = val.endsWith('.png') ? '' : '.png';
        return `/data/${wdir}/Images/${dbName}/corefolder/${val}${ext}`;
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
 * Enhanced render list view with non-blocking image resolution
 * @param {Array} records - Array of character records
 * @param {string} workId - Work identifier (e.g., '#Works_NumberTales')
 * @param {Function} onOpen - Callback function when a character is selected
 * @param {Array} imageFields - Optional extracted image fields for dynamic resolution
 */
function renderList(records, workId, onOpen, imageFields = null) {
  const list = $('#list');
  list.innerHTML = '';
  let shown = 0;
  const qs = getQS();
  const filter = (qs.q || $('#search-input').value || '').trim();

  // Get current database name from global state
  const state = window.__CHAR_STATE__;
  const dbName = state ? state.db : 'Primary';

  console.log('📋 Rendering list with non-blocking image resolution:', {
    recordCount: records.length,
    workId,
    dbName,
    hasImageFields: !!imageFields
  });

  const filteredRecords = records.filter(r => matchFilter(r, filter));

  // Render items immediately without waiting for images
  filteredRecords.forEach((r, i) => {
    shown++;

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

    // Create placeholder image initially
    const imgElement = el('div', { class: 'thumb placeholder' }, ['画像読み込み中...']);

    const item = el('article', {
      class: 'grid-item',
      role: 'button',
      tabindex: 0,
      onkeydown: (ev) => { if (ev.key === 'Enter') onOpen(r); },
      onclick: () => onOpen(r)
    }, [
      imgElement,
      el('h3', {}, [title]),
      sub ? el('div', { class: 'sub' }, [sub]) : null,
      chipEls.length ? el('div', { class: 'meta' }, chipEls) : null
    ]);

    list.appendChild(item);

    // Resolve image asynchronously without blocking
    resolveImageAsync(workId, r, dbName, imageFields).then(imgUrl => {
      if (imgUrl) {
        const imgTag = el('img', {
          class: 'thumb',
          alt: `${title} thumbnail`,
          src: imgUrl,
          loading: 'lazy'
        });
        imgElement.replaceWith(imgTag);
      } else {
        imgElement.textContent = '画像なし';
        imgElement.className = 'thumb placeholder';
      }
    }).catch(err => {
      console.warn('⚠️ Image resolution failed for:', r.Name, err);
      imgElement.textContent = '画像なし';
      imgElement.className = 'thumb placeholder';
    });
  });

  $('#list-empty').hidden = shown > 0;
  console.log(`✅ Rendered ${shown} characters (images loading asynchronously)`);
}

/**
 * Asynchronous image resolution that doesn't block UI
 * @param {string} workId - Work identifier
 * @param {Object} rec - Character record
 * @param {string} dbName - Database name
 * @param {Array} imageFields - Image field definitions
 * @returns {Promise<string>} Promise that resolves to image URL
 */
async function resolveImageAsync(workId, rec, dbName, imageFields) {
  try {
    // Use enhanced image resolution with timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Image resolution timeout')), 3000)
    );

    const imagePromise = imageFields
      ? resolveImageFromFields(workId, rec, dbName, imageFields)
      : resolveImageStatically(workId, rec, dbName);

    return await Promise.race([imagePromise, timeoutPromise]);
  } catch (error) {
    console.warn('⚠️ Async image resolution failed:', error.message);
    return '';
  }
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

  // Get current database name and enhanced state
  const state = window.__CHAR_STATE__;
  const dbName = state ? state.db : 'Primary';
  const cachedImageFields = state ? state.imageFields : null;
  const cachedWorkTypeDef = state ? state.workTypeDef : null;
  const cachedGlobalTypeDef = state ? state.globalTypeDef : null;
  const cachedWorkMeta = state ? state.workMeta : null;

  try {
    // Show minimal loading for detail view
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

  // Use enhanced rendering with image fields if available
  const imageFields = state.imageFields || null;
  renderList(state.records, state.workId, openDetail, imageFields);
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

    // Use enhanced rendering with image fields (non-blocking)
    renderList(recs, workId, openDetail, imageFields);
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
