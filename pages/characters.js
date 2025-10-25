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
  if (!('serviceWorker' in navigator)) return;
  try {
    // 1) Register page-scoped SW that intercepts /pages/v1, /svc/v1, /api/v1
    const pageSwUrl = new URL('./sw.js', location.href).toString();
    const pageScope = new URL('./', location.href).pathname; // '/pages/'
    const reg = await navigator.serviceWorker.register(pageSwUrl, { scope: pageScope });
    API_BASE_REL = '../pages/';
    await navigator.serviceWorker.ready; // wait for activation
    await waitForController(); // ensure this page is controlled before we start fetching
  } catch (_) {
    try {
      // 2) Fallback to /svc (alias path)
      const svcSwUrl = new URL('../svc/sw.js', location.href).toString();
      const svcScope = new URL('../svc/', location.href).pathname;
      const reg2 = await navigator.serviceWorker.register(svcSwUrl, { scope: svcScope });
      API_BASE_REL = '../svc/';
      await navigator.serviceWorker.ready;
      await waitForController();
    } catch (_) {
      try {
        // 3) Final fallback to /api
        const apiSwUrl = new URL('../api/sw.js', location.href).toString();
        const apiScope = new URL('../api/', location.href).pathname;
        const reg3 = await navigator.serviceWorker.register(apiSwUrl, { scope: apiScope });
        API_BASE_REL = '../api/';
        await navigator.serviceWorker.ready;
        await waitForController();
      } catch (_) {
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
 * Fetch and parse JSON from URL with error handling
 * @param {string} url - URL to fetch
 * @returns {Promise<Object>} Parsed JSON response
 * @throws {Error} If request fails or response is not OK
 */
async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
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
  const w = normalizeWorkKey(workKey);
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
  const w = normalizeWorkKey(workKey);
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
 * Fetch work type metadata to understand image field definitions
 * @param {string} workKey - Work key like '#Works_NumberTales'
 * @returns {Promise<Object>} Type definition object
 */
async function fetchWorkTypeDef(workKey) {
  const w = normalizeWorkKey(workKey);
  const u = new URL(api(`v1/works/${encodeURIComponent(w)}/typedef`));
  try {
    const res = await fetchJSON(u.toString());
    return res.typedef || [];
  } catch {
    return [];
  }
}

/**
 * Extract image field paths from type definitions
 * @param {Array} typeDef - DefType array from db_type.json
 * @returns {Array} Array of image field specs like [{field: 'concept_PNGName', type: '#PNGFileName', label: '設定原画'}]
 */
function extractImageFields(typeDef) {
  const imageFields = [];

  const traverse = (items, path = []) => {
    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;

      if (item.hashTag === 'Images' && Array.isArray(item.$type)) {
        // Found Images container, extract its children
        for (const child of item.$type) {
          if (child.hashTag && child.hashTag_JP) {
            imageFields.push({
              field: child.hashTag,
              type: child.$type,
              label: child.hashTag_JP,
              path: [...path, 'Images', child.hashTag]
            });
          }
        }
      } else if (Array.isArray(item.$type)) {
        traverse(item.$type, [...path, item.hashTag]);
      }
    }
  };

  traverse(typeDef);
  return imageFields;
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

  for (const field of imageFields) {
    const value = imgData[field.field];
    if (!value) continue;

    const isArray = field.type.includes('[]');
    const values = isArray ? (Array.isArray(value) ? value : [value]) : [value];

    for (const val of values) {
      if (!val) continue;

      let url = '';
      if (field.field.includes('concept')) {
        const dir = field.field.includes('Alt') ? 'conceptAlt' : 'concept';
        url = `/data/${wdir}/Images/${dbName}/${dir}/${val}.png`;
      } else if (field.field.includes('design')) {
        const dir = field.field.includes('Alt') ? 'designAlt' : 'design';
        url = `/data/${wdir}/Images/${dbName}/${dir}/${val}`;
      } else if (field.field.includes('corefolder')) {
        url = `/data/${wdir}/Images/${dbName}/corefolder/${val}.png`;
      } else {
        // Generic fallback - try database folder first
        url = `/data/${wdir}/Images/${dbName}/${val}`;
      }

      images.push({
        url,
        caption: field.label + (isArray && values.length > 1 ? ` (${values.indexOf(val) + 1})` : ''),
        type: field.field
      });
    }
  }

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

  // Use database name as folder name (Primary, Secondary, SemiPrimary, etc.)
  const dbFolder = dbName;

  // Try common patterns for the specific database folder
  if (img.concept_PNGName) return `/data/${wdir}/Images/${dbFolder}/concept/${img.concept_PNGName}.png`;
  if (img.design_PNGName) return `/data/${wdir}/Images/${dbFolder}/design/${img.design_PNGName}.png`;
  if (Array.isArray(img.corefolder_PNGPath) && img.corefolder_PNGPath[0]) return `/data/${wdir}/Images/${dbFolder}/corefolder/${img.corefolder_PNGPath[0]}.png`;

  // Check for conceptAlt images
  if (img.conceptAlt_PNGName) return `/data/${wdir}/Images/${dbFolder}/conceptAlt/${img.conceptAlt_PNGName}.png`;
  if (img.designAlt_PNGName) return `/data/${wdir}/Images/${dbFolder}/designAlt/${img.designAlt_PNGName}.png`;

  // Proxies (usually in specific folders)
  if (img.General && img.General.poster) return `/data/${wdir}/Images/General/${img.General.poster}`;

  // Fallback: try Primary folder if not Primary database and no image found
  if (dbName !== 'Primary') {
    if (img.concept_PNGName) return `/data/${wdir}/Images/Primary/concept/${img.concept_PNGName}.png`;
    if (img.design_PNGName) return `/data/${wdir}/Images/Primary/design/${img.design_PNGName}.png`;
    if (Array.isArray(img.corefolder_PNGPath) && img.corefolder_PNGPath[0]) return `/data/${wdir}/Images/Primary/corefolder/${img.corefolder_PNGPath[0]}.png`;
  }

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

  // Main poster image with database-specific path
  const poster = imageFromRecord(workId, rec, dbName);

  // Build image gallery from type definitions
  const typeDef = await fetchWorkTypeDef(workId);
  const imageFields = extractImageFields(typeDef);
  const galleryImages = buildImageGallery(workId, rec, imageFields, dbName);

  // Create left section with poster and gallery
  const imageSection = [
    poster ? el('img', { class: 'poster', src: poster, alt: 'poster' }) : el('div', { class: 'poster' }),
    galleryImages.length > 0 ? el('div', { class: 'image-gallery' }, [
      el('h4', {}, ['画像ギャラリー']),
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
      rec.Num != null ? el('span', { class: 'pill' }, ['Num', String(rec.Num)]) : null,
      rec.ModelNumber ? el('span', { class: 'pill' }, ['Model', rec.ModelNumber]) : null,
      rec.Progress ? el('span', { class: 'pill' }, ['Progress', rec.Progress]) : null
    ])
  ]);

  const basic = kvTable(rec, [
    ['正式名', rec.FormalName || ''],
    ['正式名(EN)', rec.FormalName_EN || ''],
    ['開発名/通称', rec.ModelName || rec.CodeName || ''],
    ['SPコード', rec.SPCodeName || rec.SPCodeName_EN || ''],
    ['性別', rec.GenderType_JP || rec.GenderType || ''],
    ['身長', rec.Height_cm != null ? `${rec.Height_cm} cm` : ''],
    ['体重', rec.Weight_kg != null ? `${rec.Weight_kg} kg` : ''],
    ['設定年齢', rec.ConceptAge != null ? `${rec.ConceptAge}` : ''],
    ['クラス', rec.Class || rec.Class_EN || ''],
  ]);

  // Abilities
  const ability = rec.AbilityStats || {};
  const abilityGrid = el('div', { class: 'kv-grid' }, Object.entries(ability).map(([k, v]) => {
    const rank = (v && (v.Rank || v.rank)) || '';
    const text = (v && (v.AbilityText || v.AbilityText_EN)) || '';
    return el('div', { class: 'tag' }, [`${k}: ${rank}` + (text ? ` (${text})` : '')]);
  }));

  // Effect/Safety
  const numStats = rec.NumerospecStats || rec.ArcanumspecStats || rec.BeastspecStats || {};
  const eff = numStats.EffectStats || {};
  const effGrid = el('div', { class: 'kv-grid' }, Object.entries(eff).map(([k, v]) => {
    const r = (v && (v.Rank || '')) || '';
    const txt = (v && (v.EffectText || v.EffectText_EN)) || '';
    return el('div', { class: 'tag' }, [`${k}: ${r || txt || '-'}`]);
  }));
  const safety = numStats.SafetyLevel || {};
  const safetyRow = (safety && (safety.SafetyLevelText || safety.SafetyLevelText_EN || safety.Rank)) ? el('div', { class: 'tag' }, [
    `Safety: ${safety.Rank || safety.SafetyLevelText || safety.SafetyLevelText_EN}`
  ]) : null;

  // SpecType
  const specType = rec.SpecType || {};
  const specNodes = [];
  if (specType.Material) specNodes.push(el('div', { class: 'tag' }, ['Material: ', Array.isArray(specType.Material) ? specType.Material.map(m => m.Material || String(m)).join(', ') : (specType.Material.Material || String(specType.Material))]));
  if (specType.ActionType) {
    const a = specType.ActionType;
    const aLabel = [a.KinematicOrStatic && (a.KinematicOrStatic.KinematicOrStatic_JP || a.KinematicOrStatic.KinematicOrStatic || String(a.KinematicOrStatic)), a.RoleType && (a.RoleType.RoleType_JP || a.RoleType.RoleType || String(a.RoleType))].filter(Boolean).join(' / ');
    if (aLabel) specNodes.push(el('div', { class: 'tag' }, ['Action: ', aLabel]));
  }
  if (specType.DualizePattern) specNodes.push(el('div', { class: 'tag' }, ['Dualize: ', specType.DualizePattern.Pattern || String(specType.DualizePattern)]));

  // Belonging/Area/Day
  const belong = rec.Belonging ? (Array.isArray(rec.Belonging) ? rec.Belonging.map(b => b.Belonging || String(b)).join(', ') : (rec.Belonging.Belonging || rec.Belonging)) : '';
  const area = rec.Area ? (rec.Area.Area_EN || rec.Area.Area || rec.Area) : '';
  const days = Array.isArray(rec.AnivDay) ? rec.AnivDay.map(d => {
    const mm = d?.Day?.Month != null ? String(d.Day.Month) : '';
    const dd = d?.Day?.DayOfMonth != null ? String(d.Day.DayOfMonth) : '';
    const date = (mm && dd) ? `${mm}/${dd}` : (mm || dd);
    const about = d?.DayAbout ? ` ${d.DayAbout}` : '';
    return `${date}${about}`;
  }) : [];

  const right = el('div', {}, [
    titleRow,
    el('div', { class: 'section' }, [el('h3', {}, ['基本情報']), basic]),
    Object.keys(ability).length ? el('div', { class: 'section' }, [el('h3', {}, ['能力']), abilityGrid]) : null,
    Object.keys(eff).length || safetyRow ? el('div', { class: 'section' }, [el('h3', {}, ['効果/安全度']), effGrid, safetyRow]) : null,
    (specNodes.length || belong || area || days.length) ? el('div', { class: 'section' }, [
      el('h3', {}, ['所属/型/日付など']),
      kvTable({}, [
        belong ? ['所属', belong] : null,
        area ? ['地域', area] : null,
        specNodes.length ? ['型情報', el('div', {}, specNodes)] : null,
        days.length ? ['記念日', days.join(' / ')] : null,
      ].filter(Boolean))
    ]) : null,
    rec.Summary ? el('div', { class: 'section' }, [
      el('h3', {}, ['概要']),
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
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      } catch {}
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      } catch {}
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
  const res = await fetchDB(workId, db, { resolve, debug });
  const recs = res.records || [];
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
  if (isInitialized) return;
  isInitialized = true;

  await ensureApiSW();
  wireControls();
  const qs = getQS();
  const wk = await populateWorks(qs.work);
  await populateDBs(wk, qs.db || 'Primary');
  await reload();
}

/**
 * Main entry point - initialize application when DOM is loaded
 */
main().catch(err => {
  console.error('Initialization error:', err);
  document.body.innerHTML = `<div style="padding: 20px; color: red;">初期化エラー: ${err.message}</div>`;
});

window.addEventListener('load', main);
