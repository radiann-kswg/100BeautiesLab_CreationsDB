// Service Worker: API router scoped to /pages/ controlling the characters page
// - Intercepts multiple prefixes to avoid ad blockers and scope pitfalls:
//   /pages/v1/* (primary), plus aliases /svc/v1/* and /api/v1/*
// - Reads JSON from /data/** and returns pseudo-API responses
//
// 本SWはGitHub Pages上で動作する疑似APIです。/data配下の静的JSONを読み取り、
// 参照解決（定義併載・インデックス解決）と最小限の検索をクライアント側で行います。

// Scope-aware paths
const SCOPE_PATH = new URL('./', self.registration?.scope || self.location.href)
  .pathname.replace(/\/$/, ''); // e.g., '/repo/pages' or '/pages'
// Parent directory of the scope (repository base)
function computeRepoBase(scopePath) {
  const idx = scopePath.lastIndexOf('/');
  if (idx <= 0) return '/';
  return scopePath.substring(0, idx) + '/';
}
const REPO_BASE = computeRepoBase(SCOPE_PATH); // e.g., '/repo/' or '/'

// Intercept these API path prefixes
const API_PREFIXES = [
  `${SCOPE_PATH}/v1`,       // '/pages/v1'
  `${REPO_BASE}svc/v1`,     // '/svc/v1' under repo base
  `${REPO_BASE}api/v1`      // '/api/v1' under repo base
];

const CACHE_NAME = '100bl-api-v1';
const ORIGIN = self.location.origin;
const WORK_CTX_TTL_MS = 15 * 1000; // simple in-memory cache TTL
const WORK_CTX_CACHE = new Map(); // key: workId -> { t, mergedVars, defTypeMerged, indices }

self.addEventListener('install', (e) => {
  e.waitUntil(Promise.all([
    self.skipWaiting(),
    precache()
  ]));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

async function precache() {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([`${REPO_BASE}data/db_meta.json`]);
  } catch (_) {}
}

// Utilities
function jsonResponse(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  });
}
function notFound(message = 'Not Found') { return jsonResponse({ error: message }, 404); }
function badRequest(message = 'Bad Request') { return jsonResponse({ error: message }, 400); }
function isObject(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function truthy(v) { if (!v) return false; const s = String(v).toLowerCase(); return s === '1' || s === 'true' || s === 'yes' || s === 'on'; }
function withRepoBase(path) {
  if (!path) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/')) return `${REPO_BASE}${path.slice(1)}`;
  return `${REPO_BASE}${path}`;
}
async function fetchJSON(path) {
  const url = new URL(withRepoBase(path), ORIGIN).toString();
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${url}`);
  return res.json();
}
async function fileExists(path) {
  try {
    const url = new URL(withRepoBase(path), ORIGIN).toString();
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch { return false; }
}

/**
 * Enhanced image existence checker for character images
 * @param {string} workId - Work identifier like '#Works_NumberTales'
 * @param {string} dbName - Database name like 'Primary'
 * @param {string} fieldName - Image field name like 'concept_PNGName'
 * @param {string} filename - Image filename
 * @returns {Promise<boolean>} True if image exists
 */
async function checkImageExists(workId, dbName, fieldName, filename) {
  if (!filename) return false;

  const workDir = workId.replace('#Works_', 'Works_');

  // Determine folder from field name
  let folder = 'General'; // Default

  const lowerField = fieldName.toLowerCase();
  if (lowerField.includes('concept') && !lowerField.includes('alt')) {
    folder = 'concept';
  } else if (lowerField.includes('conceptalt') || (lowerField.includes('concept') && lowerField.includes('alt'))) {
    folder = 'conceptAlt';
  } else if (lowerField.includes('corefolder') || lowerField.includes('core')) {
    folder = 'corefolder';
  } else if (lowerField.includes('carddesign') || lowerField.includes('card')) {
    folder = 'cardDesign';
  } else if (lowerField.includes('design') && !lowerField.includes('alt')) {
    folder = 'design';
  } else if (lowerField.includes('designalt') || (lowerField.includes('design') && lowerField.includes('alt'))) {
    folder = 'designAlt';
  } else if (lowerField.includes('arts') || lowerField.includes('art')) {
    folder = 'arts';
  } else if (lowerField.includes('catalog')) {
    folder = 'catalog';
  }

  // Build path
  let imagePath = '';
  if (filename.includes('/')) {
    // Full path provided
    imagePath = `/data/${workDir}/Images/${dbName}/${filename}`;
  } else {
    // Just filename, add folder and extension if needed
    const extension = filename.includes('.') ? '' : '.png';
    imagePath = `/data/${workDir}/Images/${dbName}/${folder}/${filename}${extension}`;
  }

  return await fileExists(imagePath);
}

// Fetch routing
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Only same-origin
  if (url.origin !== self.location.origin) return;
  const matchedPrefix = API_PREFIXES.find(p => url.pathname.startsWith(p));
  if (!matchedPrefix) return; // ignore non-API paths

  console.log('🔄 SW intercepted request:', url.pathname, 'prefix:', matchedPrefix);
  event.respondWith(handleApiRequest(url, matchedPrefix).catch(err => {
    console.error('❌ SW API request failed:', url.pathname, err);

    // Enhanced error response with debugging information
    const errorResponse = {
      error: String(err),
      message: err.message || 'Unknown error',
      timestamp: new Date().toISOString(),
      path: url.pathname,
      method: event.request.method,
      requestId: Math.random().toString(36).substring(7)
    };

    // Add specific error types for better debugging
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

    return jsonResponse(errorResponse, 500);
  }));
});

async function handleApiRequest(url, apiPrefix) {
  const path = url.pathname.substring(apiPrefix.length);
  // Decode each segment to support encoded work ids like %23Works_NumberTales
  const seg = path.split('/').filter(Boolean).map(s => {
    try { return decodeURIComponent(s); } catch { return s; }
  });

  console.log('🎯 SW handling API request:', {
    path: path,
    segments: seg,
    searchParams: Object.fromEntries(url.searchParams.entries())
  });

  const resolveParam = url.searchParams.get('resolve');
  const resolve = resolveParam == null ? true : truthy(resolveParam);
  const debug = truthy(url.searchParams.get('debug'));
  let payloadDebugAttach = null;
  let debugAttach = null;

  // /v1/index
  if (seg.length === 1 && seg[0] === 'index') {
    const g = await readGlobalMeta();
    return jsonResponse({
      name: '100BeautiesLab Creations DB API',
      version: 1,
      time: new Date().toISOString(),
      works: Object.entries(g.CreationWorks).map(([k, v]) => ({ key: k, Title: v.Title, Title_EN: v.Title_EN }))
    });
  }

  // /v1/varsdef (overview)
  if (seg.length === 1 && seg[0] === 'varsdef') {
    const g = await readGlobalMeta();
    const globalVarsDef = await readGeneralVarsDefGlobal();
    const works = Object.keys(g.CreationWorks || {});
    const worksVars = {};
    const merge = truthy(url.searchParams.get('merge'));
    const merged = {};
    for (const wk of works) {
      const workId = wk;
      const wv = await readGeneralVarsDefWork(workId);
      worksVars[workId] = wv;
      if (merge) merged[workId] = deepMerge(globalVarsDef, wv);
    }
    return jsonResponse({ name: 'varsdef-overview', time: new Date().toISOString(), global: globalVarsDef, works: worksVars, ...(merge ? { merged } : {}) });
  }

  // /v1/varsdef/global
  if (seg.length === 2 && seg[0] === 'varsdef' && seg[1] === 'global') {
    const globalVarsDef = await readGeneralVarsDefGlobal();
    return jsonResponse({ name: 'varsdef-global', time: new Date().toISOString(), global: globalVarsDef });
  }

  // /v1/works
  if (seg.length === 1 && seg[0] === 'works') {
    const g = await readGlobalMeta();
    return jsonResponse(Object.entries(g.CreationWorks).map(([k, v]) => ({ key: k, Title: v.Title, Title_EN: v.Title_EN })));
  }

  // /v1/bootstrap?includeRecords=0|1
  if (seg.length === 1 && seg[0] === 'bootstrap') {
    const includeRecordsParam = url.searchParams.get('includeRecords');
    const includeRecords = includeRecordsParam == null ? false : truthy(includeRecordsParam);
    const g = await readGlobalMeta();
    const works = Object.keys(g.CreationWorks || {});
    const out = [];
    for (const wk of works) {
      const workId = wk;
      const { mergedVars, indices } = await getWorkContext(workId);
      const meta = await readWorkMeta(workId);
      const dbs = await listWorkDBs(workId);
      const item = { work: workId, defsMerged: mergedVars, databases: dbs };
      if (includeRecords) {
        item.data = {};
        for (const db of dbs) {
          try {
            const raw = await readDB(workId, db.key);
            const withCommons = applyCommonsToRecords(raw, meta, db.key);
            const resolvedRecs = resolve ? await resolveAllInAny(withCommons, indices) : withCommons;
            item.data[db.key] = resolvedRecs;
          } catch (e) {
            item.data[db.key] = { error: String(e) };
          }
        }
      }
      out.push(item);
    }
    return jsonResponse({ name: 'bootstrap', time: new Date().toISOString(), works: out });
  }

  // /v1/works/{work}/defs
  if (seg.length === 3 && seg[0] === 'works' && seg[2] === 'defs') {
    const workId = toWorkKey(seg[1]);
    const g = await readGlobalMeta();
    const gType = await readGlobalType();
    const meta = await readWorkMeta(workId);
    const type = await readWorkType(workId);
    const { mergedVars } = await getWorkContext(workId);
    const indexes = extractDefIndexes(mergedVars);
    const defTypeMerged = [...(gType?.$DefType ?? []), ...(type?.$DefType ?? [])];
    return jsonResponse({ work: workId, $VarsDefMerged: mergedVars, $DefTypeMerged: defTypeMerged, indexes });
  }

  // /v1/meta (global metadata overview)
  if (seg.length === 1 && seg[0] === 'meta') {
    console.log('✅ SW serving /v1/meta endpoint');
    const g = await readGlobalMeta();
    return jsonResponse({ name: 'meta-global', time: new Date().toISOString(), meta: g });
  }

  // /v1/works/{work}
  if (seg.length === 2 && seg[0] === 'works') {
    const workId = toWorkKey(seg[1]);
    const meta = await readWorkMeta(workId);
    return jsonResponse({ work: workId, meta });
  }

  // /v1/works/{work}/meta
  if (seg.length === 3 && seg[0] === 'works' && seg[2] === 'meta') {
    const workId = toWorkKey(seg[1]);
    console.log('✅ SW serving /v1/works/{work}/meta endpoint for work:', workId);
    const meta = await readWorkMeta(workId);
    return jsonResponse({ work: workId, name: 'meta-work', time: new Date().toISOString(), meta });
  }

  // /v1/works/{work}/varsdef
  if (seg.length === 3 && seg[0] === 'works' && seg[2] === 'varsdef') {
    const workId = toWorkKey(seg[1]);
    const varsdef = await readGeneralVarsDefWork(workId);
    return jsonResponse({ work: workId, name: 'varsdef-work', time: new Date().toISOString(), varsdef });
  }

  // /v1/works/{work}/db
  if (seg.length === 3 && seg[0] === 'works' && seg[2] === 'db') {
    const workId = toWorkKey(seg[1]);
    const dbs = await listWorkDBs(workId);
    return jsonResponse({ work: workId, databases: dbs });
  }

  // /v1/works/{work}/db/{dbName}
  if (seg.length === 4 && seg[0] === 'works' && seg[2] === 'db') {
    const startTime = performance.now();
    const workId = toWorkKey(seg[1]);
    const dbName = seg[3];

    console.log('🔄 SW: Starting database fetch for', { workId, dbName, resolve, debug });

    try {
      // Step 1: Load raw data with timeout
      const dbPromise = readDB(workId, dbName);
      const metaPromise = readWorkMeta(workId);

      // Race with timeout (10 seconds)
      const dataTimeout = 10000;
      const [data, meta] = await Promise.race([
        Promise.all([dbPromise, metaPromise]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Database read timeout')), dataTimeout)
        )
      ]);

      const fetchTime = performance.now() - startTime;
      console.log(`⏱️ SW: DB fetch completed in ${fetchTime.toFixed(2)}ms`);

      // Step 2: Apply commons data
      const processStart = performance.now();
      let processedData = applyCommonsToRecords(data, meta, dbName);
      const applyTime = performance.now() - processStart;
      console.log(`⏱️ SW: Commons applied in ${applyTime.toFixed(2)}ms`);

      // Step 3: Conditional reference resolution (only if resolve=true and not too many records)
      if (resolve) {
        const resolveStart = performance.now();
        const recordCount = Array.isArray(processedData) ? processedData.length : 0;

        // Skip resolution for large datasets or add timeout
        if (recordCount > 100) {
          console.warn('⚠️ SW: Skipping reference resolution for large dataset:', recordCount, 'records');
        } else {
          try {
            const { mergedVars, indices } = await getWorkContext(workId);

            // Add timeout for resolution process
            const resolveTimeout = 5000; // 5 second timeout for resolution
            const resolvePromise = resolveAllInAny(processedData, indices);

            processedData = await Promise.race([
              resolvePromise,
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Reference resolution timeout')), resolveTimeout)
              )
            ]);

            if (debug) payloadDebugAttach = { indicesSummary: summarizeIndices(indices) };

            const resolveTime = performance.now() - resolveStart;
            console.log(`⏱️ SW: Reference resolution completed in ${resolveTime.toFixed(2)}ms`);
          } catch (resolveError) {
            console.warn('⚠️ SW: Reference resolution failed, continuing without:', resolveError.message);
            // Continue without resolution rather than failing completely
          }
        }
      }

      const payload = { work: workId, db: dbName, records: processedData, resolved: resolve };
      if (debug) {
        if (!payloadDebugAttach) {
          try {
            const { indices } = await getWorkContext(workId);
            payload.debug = { indicesSummary: summarizeIndices(indices) };
          } catch (debugError) {
            payload.debug = { error: 'Debug info unavailable' };
          }
        } else {
          payload.debug = payloadDebugAttach;
        }
      }

      const totalTime = performance.now() - startTime;
      console.log(`🎉 SW: Database request completed in ${totalTime.toFixed(2)}ms`);

      return jsonResponse(payload);

    } catch (error) {
      const totalTime = performance.now() - startTime;
      console.error(`❌ SW: Database request failed after ${totalTime.toFixed(2)}ms:`, error);

      // Return error response instead of throwing
      return jsonResponse({
        error: error.message,
        work: workId,
        db: dbName,
        timestamp: new Date().toISOString(),
        processingTime: `${totalTime.toFixed(2)}ms`
      }, 500);
    }
  }

  // /v1/search
  if (seg.length === 1 && seg[0] === 'search') {
    const params = url.searchParams;
    const workId = toWorkKey(params.get('works'));
    const dbName = params.get('db');
    const hashTag = params.getAll('hashTag');
    const key = params.getAll('key');
    if (!workId || !dbName || hashTag.length === 0 || key.length === 0 || hashTag.length !== key.length) {
      return badRequest('Query must include works, db, and pairs of hashTag & key');
    }
    let records = await readDB(workId, dbName);
    const meta = await readWorkMeta(workId);
    records = applyCommonsToRecords(records, meta, dbName);
    const queries = hashTag.map((h, i) => ({ hashTag: h, key: key[i] }));
    let matched = searchRecords(records, queries);
    if (resolve) {
      const { indices } = await getWorkContext(workId);
      matched = await resolveAllInAny(matched, indices);
      if (debug) debugAttach = { indicesSummary: summarizeIndices(indices) };
    }
    const payload = { work: workId, db: dbName, queries, count: matched.length, records: matched, resolved: resolve };
    if (debug) payload.debug = debugAttach || (await (async () => { const { indices } = await getWorkContext(workId); return { indicesSummary: summarizeIndices(indices) }; })());
    return jsonResponse(payload);
  }

  // ---- TypeDef / DefType endpoints ----
  async function getGlobalDefType() { try { const gType = await readGlobalType(); return gType?.$DefType ?? []; } catch { return []; } }
  async function getWorkDefType(workId) { try { const type = await readWorkType(workId); return type?.$DefType ?? []; } catch { return []; } }

  // /v1/typedef and alias /v1/deftype (overview)
  if (seg.length === 1 && (seg[0] === 'typedef' || seg[0] === 'deftype')) {
    const g = await readGlobalMeta();
    const globalDefType = await getGlobalDefType();
    const works = Object.keys(g.CreationWorks || {});
    const worksTypes = {};
    for (const wk of works) {
      const workId = wk;
      worksTypes[workId] = await getWorkDefType(workId);
    }
    return jsonResponse({ name: 'typedef-overview', time: new Date().toISOString(), global: globalDefType, works: worksTypes });
  }

  // /v1/typedef/global and alias /v1/deftype/global
  if (seg.length === 2 && (seg[0] === 'typedef' || seg[0] === 'deftype') && seg[1] === 'global') {
    const globalDefType = await getGlobalDefType();
    return jsonResponse({ name: 'typedef-global', time: new Date().toISOString(), global: globalDefType });
  }

  // /v1/works/{work}/typedef and alias /deftype
  if (seg.length === 3 && seg[0] === 'works' && (seg[2] === 'typedef' || seg[2] === 'deftype')) {
    const workId = toWorkKey(seg[1]);
    console.log('✅ SW serving /v1/works/{work}/typedef endpoint for work:', workId);
    const defType = await getWorkDefType(workId);
    return jsonResponse({ work: workId, name: 'typedef-work', time: new Date().toISOString(), typedef: defType });
  }

  // ---- Hybrid defs endpoints (VarsDef + DefType) ----
  // /v1/defs (overview)
  if (seg.length === 1 && seg[0] === 'defs') {
    const g = await readGlobalMeta();
    const globalVars = await readGeneralVarsDefGlobal();
    const globalTypes = await getGlobalDefType();
    const works = Object.keys(g.CreationWorks || {});
    const worksOut = {};
    const merge = truthy(url.searchParams.get('merge'));
    for (const wk of works) {
      const workId = wk;
      const varsdef = await readGeneralVarsDefWork(workId);
      const deftype = await getWorkDefType(workId);
      const item = { varsdef, deftype };
      if (merge) item.varsdefMerged = deepMerge(globalVars, varsdef);
      worksOut[workId] = item;
    }
    return jsonResponse({ name: 'defs-overview', time: new Date().toISOString(), global: { varsdef: globalVars, deftype: globalTypes }, works: worksOut });
  }

  // /v1/defs/global
  if (seg.length === 2 && seg[0] === 'defs' && seg[1] === 'global') {
    const globalVars = await readGeneralVarsDefGlobal();
    const globalTypes = await (async () => { try { const gt = await readGlobalType(); return gt?.$DefType ?? []; } catch { return []; } })();
    return jsonResponse({ name: 'defs-global', time: new Date().toISOString(), global: { varsdef: globalVars, deftype: globalTypes } });
  }

  // /v1/works/{work}/defs
  if (seg.length === 3 && seg[0] === 'works' && seg[2] === 'defs') {
    const workId = toWorkKey(seg[1]);
    const varsdef = await readGeneralVarsDefWork(workId);
    const deftype = await (async () => { try { const t = await readWorkType(workId); return t?.$DefType ?? []; } catch { return []; } })();
    const merge = truthy(url.searchParams.get('merge'));
    const globalVars = merge ? await readGeneralVarsDefGlobal() : undefined;
    return jsonResponse({ work: workId, name: 'defs-work', time: new Date().toISOString(), varsdef, deftype, ...(merge ? { varsdefMerged: deepMerge(globalVars, varsdef) } : {}) });
  }

  // /v1/works/{work}/analyze - New dynamic analysis endpoint
  if (seg.length === 3 && seg[0] === 'works' && seg[2] === 'analyze') {
    const workId = toWorkKey(seg[1]);
    try {
      const meta = await readWorkMeta(workId);
      const dbs = await listWorkDBs(workId);
      const analysis = {
        work: workId,
        timestamp: new Date().toISOString(),
        structure: {
          metaFiles: [],
          databases: dbs,
          imageStructure: {}
        },
        imageFields: {},
        fieldCoverage: {},
        errors: []
      };

      // Analyze each database
      for (const db of dbs) {
        try {
          const records = await readDB(workId, db.key);
          const typeDef = await readWorkType(workId);

          // Extract image fields from type definitions
          const imageFields = extractImageFieldsFromTypeDef(typeDef);
          analysis.imageFields[db.key] = imageFields;

          // Analyze field coverage
          const coverage = analyzeFieldCoverage(records, imageFields);
          analysis.fieldCoverage[db.key] = coverage;

          // Check for image path issues
          for (const record of records) {
            if (record.Images) {
              for (const [field, value] of Object.entries(record.Images)) {
                if (value && !await checkImageExists(workId, db.key, field, value)) {
                  analysis.errors.push({
                    type: 'MISSING_IMAGE',
                    database: db.key,
                    record: record.Name || record.FormalName || 'Unknown',
                    field: field,
                    value: value
                  });
                }
              }
            }
          }
        } catch (err) {
          analysis.errors.push({
            type: 'DATABASE_ERROR',
            database: db.key,
            error: String(err)
          });
        }
      }

      return jsonResponse(analysis);
    } catch (err) {
      return jsonResponse({
        error: 'Analysis failed',
        message: String(err),
        work: workId
      }, 500);
    }
  }

  // /v1/works/{work}/defs
  if (seg.length === 3 && seg[0] === 'works' && seg[2] === 'defs') {
    const workId = toWorkKey(seg[1]);
    const varsdef = await readGeneralVarsDefWork(workId);
    const deftype = await (async () => { try { const t = await readWorkType(workId); return t?.$DefType ?? []; } catch { return []; } })();
    const merge = truthy(url.searchParams.get('merge'));
    const globalVars = merge ? await readGeneralVarsDefGlobal() : undefined;
    return jsonResponse({ work: workId, name: 'defs-work', time: new Date().toISOString(), varsdef, deftype, ...(merge ? { varsdefMerged: deepMerge(globalVars, varsdef) } : {}) });
  }

  console.log('❌ SW: Unknown API path:', path, 'segments:', seg);
  return notFound('Unknown API path');
}

// --- Helper functions for dynamic analysis ---
function extractImageFieldsFromTypeDef(typeDef) {
  const imageFields = [];

  const traverse = (items, path = []) => {
    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;

      if (item.hashTag === 'Images' && Array.isArray(item.$type)) {
        for (const child of item.$type) {
          if (child.hashTag && (child.hashTag_JP || child.hashTag)) {
            imageFields.push({
              field: child.hashTag,
              type: child.$type || '#PNGFileName',
              label: child.hashTag_JP || child.hashTag,
              path: [...path, 'Images', child.hashTag]
            });
          }
        }
      } else if (Array.isArray(item.$type)) {
        traverse(item.$type, [...path, item.hashTag]);
      }
    }
  };

  if (typeDef?.$DefType) {
    traverse(typeDef.$DefType);
  }

  return imageFields;
}

function analyzeFieldCoverage(records, imageFields) {
  const coverage = {
    totalRecords: records.length,
    imageFieldUsage: {},
    missingImages: 0,
    recordsWithImages: 0
  };

  for (const field of imageFields) {
    coverage.imageFieldUsage[field.field] = {
      used: 0,
      total: records.length,
      percentage: 0,
      label: field.label
    };
  }

  for (const record of records) {
    let hasAnyImage = false;
    const images = record.Images || {};

    for (const field of imageFields) {
      const value = images[field.field];
      if (value) {
        coverage.imageFieldUsage[field.field].used++;
        hasAnyImage = true;
      }
    }

    if (hasAnyImage) {
      coverage.recordsWithImages++;
    } else {
      coverage.missingImages++;
    }
  }

  // Calculate percentages
  for (const field in coverage.imageFieldUsage) {
    const usage = coverage.imageFieldUsage[field];
    usage.percentage = records.length > 0 ? Math.round((usage.used / records.length) * 100) : 0;
  }

  return coverage;
}

async function checkImageExists(workId, dbName, field, value) {
  // This is a simplified check - in practice you'd want to construct the full path
  // and check if the file exists using HEAD request
  const wdir = workId.replace('#Works_', 'Works_');

  if (!value) return false;

  try {
    // Build potential image paths based on field patterns
    const potentialPaths = [];

    if (field.includes('concept')) {
      const dir = field.includes('Alt') ? 'conceptAlt' : 'concept';
      potentialPaths.push(`data/${wdir}/Images/${dbName}/${dir}/${value}.png`);
    } else if (field.includes('design')) {
      const dir = field.includes('Alt') ? 'designAlt' : 'design';
      potentialPaths.push(`data/${wdir}/Images/${dbName}/${dir}/${value}`);
    } else if (field.includes('corefolder')) {
      potentialPaths.push(`data/${wdir}/Images/${dbName}/corefolder/${value}.png`);
    }

    // Check at least one potential path
    if (potentialPaths.length > 0) {
      return await fileExists(potentialPaths[0]);
    }

    return false;
  } catch {
    return false;
  }
}

// --- Resolver helpers & enrichment logic (copied from api/sw.js) ---
function toWorkKey(id) {
  if (!id) return null;
  if (id.startsWith('#Works_')) return id;
  if (id.startsWith('Works_')) return '#' + id;
  return `#Works_${id}`;
}
function normRank(v) { if (v == null) return null; return String(v).trim(); }
function toArray(v) { return Array.isArray(v) ? v : (v == null ? [] : [v]); }
function deepMerge(a, b) { if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b]; if (isObject(a) && isObject(b)) { const out = { ...a }; for (const [k, v] of Object.entries(b)) { if (k in out) out[k] = deepMerge(out[k], v); else out[k] = v; } return out; } return b ?? a; }

async function resolveAllInAny(value, indices, path = []) {
  if (Array.isArray(value)) { const out = []; for (let i = 0; i < value.length; i++) out.push(await resolveAllInAny(value[i], indices, [...path, i])); return out; }
  if (!isObject(value)) return value;
  const out = {}; for (const [k, v] of Object.entries(value)) out[k] = await resolveAllInAny(v, indices, [...path, k]);
  if (value._DBLink) { try { out._DBLinkResolved = await resolveDBLinkSpec(value._DBLink); } catch (e) { out._DBLinkResolved = { error: String(e) }; } }
  enrichNodeWithDefs(out, path, indices);
  return out;
}

async function resolveDBLinkSpec(spec) {
  const specs = Array.isArray(spec) ? spec : [spec];
  const results = [];
  for (const s of specs) {
    const workId = toWorkKey(s.worksTitle);
    const dbName = s.dbName;
    const queries = Array.isArray(s._Search) ? s._Search : [];
    try {
      const records = await readDB(workId, dbName);
      const matched = searchRecords(records, queries);
      results.push({ worksTitle: workId, dbName, _Search: queries, _Jump: s._Jump, count: matched.length, records: matched });
    } catch (e) { results.push({ worksTitle: s.worksTitle, dbName, _Search: queries, error: String(e) }); }
  }
  return results;
}

function extractDefIndexes(varsDef) {
  const enums = {}; const lists = {}; const listLinks = {}; const enumLinks = {};
  walkDefs(varsDef, (path, key, val) => {
    if (key.startsWith('#Enum_')) enums[path.join('.') + '.' + key] = val;
    if (key.startsWith('#List_')) lists[path.join('.') + '.' + key] = val;
    if (key.startsWith('#ListLink_')) listLinks[path.join('.') + '.' + key] = val;
    if (key.startsWith('$EnumLink_')) enumLinks[path.join('.') + '.' + key] = val;
  });
  return { enums, lists, listLinks, enumLinks };
}
function walkDefs(obj, cb, path = []) { if (!isObject(obj)) return; for (const [k, v] of Object.entries(obj)) { cb(path, k, v); if (isObject(v)) walkDefs(v, cb, [...path, k]); } }

async function getWorkContext(workId) {
  const cached = WORK_CTX_CACHE.get(workId);
  const now = Date.now();
  if (cached && (now - cached.t) < WORK_CTX_TTL_MS) return cached;
  const [g, gType, meta, type] = await Promise.all([ readGlobalMeta(), readGlobalType(), readWorkMeta(workId), readWorkType(workId) ]);
  const mergedVars = deepMerge( deepMerge(gType?.$VarsDef ?? {}, g?.General?.$VarsDef ?? {}), deepMerge(type?.$VarsDef ?? {}, meta?.General?.$VarsDef ?? {}) );
  const defTypeMerged = [...(gType?.$DefType ?? []), ...(type?.$DefType ?? [])];
  const indices = buildEnrichmentIndices(mergedVars, meta, defTypeMerged);
  const out = { t: now, mergedVars, defTypeMerged, indices };
  WORK_CTX_CACHE.set(workId, out);
  return out;
}

function buildEnrichmentIndices(varsDef, workMeta, defTypeMerged) {
  const idx = {
    abilityTextByRank: {}, abilityTextByJP: {},
    effectTextByRank: {}, effectTextByJP: {},
    safetyTextByRank: {}, safetyTextByJP: {},
    specLevelTextByRank: {}, specLevelTextByJP: {},
    genderTypeByValue: {}, raceTypeByValue: {},
    belongingByValue: {}, areaByValue: {},
    monthByNum: {}, relationLabelByValue: {},
    stoatByValue: {}, lunarByValue: {}, beastByValue: {},
    // FLInvestigator
    materialByValue: {}, kinStatByValue: {}, roleTypeByValue: {}, dualizePatternByValue: {}, spetialPatternByValue: {},
    // generic
    genericListLinks: {}, genericFieldKeyMap: {},
    genericListIndex: {}, genericListIndexFieldMap: {},
    genericEnumLink: {}, genericEnumLinkFieldMap: {}
  };
  const abl = varsDef?.$Def_AbilityStats?.$EnumLink_AbilityText; if (isObject(abl)) for (const v of Object.values(abl)) if (isObject(v) && v.Rank) { const r = normRank(v.Rank); if (r && !idx.abilityTextByRank[r]) idx.abilityTextByRank[r] = { AbilityText: v.AbilityText, AbilityText_EN: v.AbilityText_EN }; if (v.AbilityText && !idx.abilityTextByJP[v.AbilityText]) idx.abilityTextByJP[v.AbilityText] = { AbilityText: v.AbilityText, AbilityText_EN: v.AbilityText_EN, Rank: r }; }
  walkDefs(varsDef, (p, k, v) => {
    if (k === '#ListLink_EffectText' && Array.isArray(v)) { for (const e of v) if ((e?.Rank || e?.EffectText) && (e.EffectText || e.EffectText_EN)) { const r = normRank(e.Rank); if (r && !idx.effectTextByRank[r]) idx.effectTextByRank[r] = { EffectText: e.EffectText, EffectText_EN: e.EffectText_EN }; if (e.EffectText && !idx.effectTextByJP[e.EffectText]) idx.effectTextByJP[e.EffectText] = { EffectText: e.EffectText, EffectText_EN: e.EffectText_EN, Rank: r }; } }
    if (k === '#ListLink_SafetyLevelText' && Array.isArray(v)) { for (const s of v) if ((s?.Rank || s?.SafetyLevelText) && (s.SafetyLevelText || s.SafetyLevelText_EN)) { const r = normRank(s.Rank); if (r && !idx.safetyTextByRank[r]) idx.safetyTextByRank[r] = { SafetyLevelText: s.SafetyLevelText, SafetyLevelText_EN: s.SafetyLevelText_EN }; if (s.SafetyLevelText && !idx.safetyTextByJP[s.SafetyLevelText]) idx.safetyTextByJP[s.SafetyLevelText] = { SafetyLevelText: s.SafetyLevelText, SafetyLevelText_EN: s.SafetyLevelText_EN, Rank: r }; } }
    if (k === '$EnumLink_SpecLevelText' && isObject(v)) { for (const o of Object.values(v)) if (o?.Rank || o?.SpecLevelText) { const r = normRank(o.Rank); if (r && !idx.specLevelTextByRank[r]) idx.specLevelTextByRank[r] = { SpecLevelText: o.SpecLevelText, SpecLevelText_EN: o.SpecLevelText_EN }; if (o.SpecLevelText && !idx.specLevelTextByJP[o.SpecLevelText]) idx.specLevelTextByJP[o.SpecLevelText] = { SpecLevelText: o.SpecLevelText, SpecLevelText_EN: o.SpecLevelText_EN, Rank: r }; } }
  });
  const gen = varsDef?.$EnumDef_GenderType; if (isObject(gen)) for (const v of Object.values(gen)) if (v?.GenderType) idx.genderTypeByValue[v.GenderType] = v;
  const races = varsDef?.['#List_RaceType'] || varsDef?.['#Enum_RaceType']; if (Array.isArray(races)) for (const r of races) if (r?.RaceType) idx.raceTypeByValue[r.RaceType] = r;
  const belong = varsDef?.$Def_Belonging?.['#List_Belonging'] || varsDef?.$Def_Belonging?.['#Enum_Belonging'] || varsDef?.['#List_Belonging']; if (Array.isArray(belong)) for (const b of belong) if (b?.Belonging) idx.belongingByValue[b.Belonging] = b;
  const areas = varsDef?.$Def_Belonging?.['#List_Area'] || varsDef?.$Def_Belonging?.['#Enum_Area'] || varsDef?.['#List_Area']; if (Array.isArray(areas)) for (const a of areas) if (a?.Area) idx.areaByValue[a.Area] = a;
  const months = varsDef?.$Def_Day?.['#List_Month'] || varsDef?.['#List_Month'] || varsDef?.$Def_Day?.['#Enum_Month'] || varsDef?.['#Enum_Month']; if (Array.isArray(months)) for (const m of months) if (m?.Month != null) idx.monthByNum[Number(m.Month)] = m;
  const relLabels = varsDef?.$Def_Relation?.['#List_RelationLabel']; if (Array.isArray(relLabels)) for (const r of relLabels) if (r?.RelationLabel) idx.relationLabelByValue[r.RelationLabel] = r; const relLabels2 = varsDef?.$Def_Relations?.['#List_RelationLabel']; if (Array.isArray(relLabels2)) for (const r of relLabels2) if (r?.RelationLabel) idx.relationLabelByValue[r.RelationLabel] = r;
  const materials = varsDef?.$Def_ArcanumspecStats?.$Def_SpecType?.['#List_Material']; if (Array.isArray(materials)) for (const m of materials) if (m?.Material) idx.materialByValue[m.Material] = m;
  const kinstat = varsDef?.$Def_ArcanumspecStats?.$Def_SpecType?.$Def_ActionType?.['#List_KinematicOrStatic']; if (Array.isArray(kinstat)) for (const ks of kinstat) if (ks?.KinematicOrStatic) idx.kinStatByValue[ks.KinematicOrStatic] = ks;
  const roletypes = varsDef?.$Def_ArcanumspecStats?.$Def_SpecType?.$Def_ActionType?.['#List_RoleType']; if (Array.isArray(roletypes)) for (const r of roletypes) if (r?.RoleType) idx.roleTypeByValue[r.RoleType] = r;
  const dualize = varsDef?.$Def_ArcanumspecStats?.$Def_SpecType?.['#List_DualizePattern']; if (Array.isArray(dualize)) for (const d of dualize) if (d?.Pattern) idx.dualizePatternByValue[d.Pattern] = d;
  const spPtn = varsDef?.$Def_ArcanumspecStats?.$Def_SpetialPattern?.['#List_SpetialPattern'] || varsDef?.$Def_NumerospecStats?.$Def_SpetialPattern?.['#List_SpetialPattern'] || varsDef?.$Def_BeastspecStats?.$Def_SpetialPattern?.['#List_SpetialPattern']; if (Array.isArray(spPtn)) for (const p of spPtn) if (typeof p === 'string') idx.spetialPatternByValue[p] = { SpetialPattern: p };
  try { const commons = workMeta?.Databases?.['#DB_Primary']?._Commons || {}; if (Array.isArray(commons['#List_Stoat'])) for (const s of commons['#List_Stoat']) if (s?.Stoat) idx.stoatByValue[s.Stoat] = s; if (Array.isArray(commons['#List_Lunar'])) for (const l of commons['#List_Lunar']) if (l?.Lunar) idx.lunarByValue[l.Lunar] = l; if (Array.isArray(commons['#List_Beast'])) for (const b2 of commons['#List_Beast']) if (b2?.Beast) idx.beastByValue[b2.Beast] = b2; } catch (_) {}
  try { const targets = collectListLinkTargets(defTypeMerged); const allListLinks = collectAllListLinks(varsDef); for (const tgt of targets) { const mapping = buildGenericMappingForField(tgt.fieldName, allListLinks); if (mapping) { idx.genericListLinks[tgt.fieldName] = mapping; idx.genericFieldKeyMap[tgt.fieldName] = mapping; if (mapping.jpKey && mapping.jpKey !== tgt.fieldName) idx.genericFieldKeyMap[mapping.jpKey] = mapping; } } } catch (_) {}
  try { const idxTargets = collectListIndexTargets(defTypeMerged); const allLists = collectAllLists(varsDef); for (const tgt of idxTargets) { const mapping = buildGenericListIndexMappingForField(tgt.fieldName, allLists); if (mapping) { idx.genericListIndex[tgt.fieldName] = mapping; idx.genericListIndexFieldMap[tgt.fieldName] = mapping; } } } catch (_) {}
  try { const enumLinks = collectAllEnumLinks(varsDef); const linkKeyMap = detectEnumLinkKeysFromDefType(defTypeMerged); for (const [fieldName, items] of Object.entries(enumLinks)) { const keyName = linkKeyMap[fieldName] || guessEnumLinkKey(items); if (!keyName) continue; const byValue = {}; const sample = (Array.isArray(items) ? items : Object.values(items)).find(it => isObject(it)) || {}; const jpKey = Object.keys(sample).find(k => k.endsWith('_JP')) || null; const enKey = Object.keys(sample).find(k => k.endsWith('_EN')) || (Object.prototype.hasOwnProperty.call(sample, fieldName) ? fieldName : null); const arr = Array.isArray(items) ? items : Object.values(items); for (const it of arr) { if (!isObject(it)) continue; const k = it[keyName]; if (k != null && byValue[k] == null) byValue[k] = it; } idx.genericEnumLink[fieldName] = { fieldName, keyName, byValue, jpKey, enKey }; idx.genericEnumLinkFieldMap[fieldName] = idx.genericEnumLink[fieldName]; } } catch (_) {}
  return idx;
}

function enrichNodeWithDefs(node, path, idx) {
  if (!isObject(node)) return;
  if (path[path.length - 1] === 'AbilityStats') { for (const [k, v] of Object.entries(node)) { if (!isObject(v)) continue; const r = normRank(v.Rank); if (r && idx.abilityTextByRank[r]) { if (!v.AbilityText) Object.assign(v, idx.abilityTextByRank[r]); } else if (typeof v.AbilityText === 'string' && idx.abilityTextByJP[v.AbilityText]) { const def = idx.abilityTextByJP[v.AbilityText]; if (!v.AbilityText_EN && def.AbilityText_EN) v.AbilityText_EN = def.AbilityText_EN; if (!v.Rank && def.Rank) v.Rank = def.Rank; } } }
  if (path[path.length - 1] === 'EffectStats') { for (const [k, v] of Object.entries(node)) { if (!isObject(v)) continue; const r = normRank(v.Rank); if (r && idx.effectTextByRank[r]) { if (!v.EffectText) Object.assign(v, idx.effectTextByRank[r]); } else if (typeof v.EffectText === 'string' && idx.effectTextByJP[v.EffectText]) { const def = idx.effectTextByJP[v.EffectText]; if (!v.EffectText_EN && def.EffectText_EN) v.EffectText_EN = def.EffectText_EN; if (!v.Rank && def.Rank) v.Rank = def.Rank; } } }
  if (path[path.length - 1] === 'SafetyLevel') { const v = node; if (!isObject(v)) return; const r = normRank(v.Rank); if (r && idx.safetyTextByRank[r]) { if (!v.SafetyLevelText) Object.assign(v, idx.safetyTextByRank[r]); } else if (typeof v.SafetyLevelText === 'string' && idx.safetyTextByJP[v.SafetyLevelText]) { const def = idx.safetyTextByJP[v.SafetyLevelText]; if (!v.SafetyLevelText_EN && def.SafetyLevelText_EN) v.SafetyLevelText_EN = def.SafetyLevelText_EN; if (!v.Rank && def.Rank) v.Rank = def.Rank; } }
  if (path[path.length - 1] === 'SpecLevel') { const v = node; if (!isObject(v)) return; const r = normRank(v.Rank); if (r && idx.specLevelTextByRank[r]) { if (!v.SpecLevelText) Object.assign(v, idx.specLevelTextByRank[r]); } else if (typeof v.SpecLevelText === 'string' && idx.specLevelTextByJP[v.SpecLevelText]) { const def = idx.specLevelTextByJP[v.SpecLevelText]; if (!v.SpecLevelText_EN && def.SpecLevelText_EN) v.SpecLevelText_EN = def.SpecLevelText_EN; if (!v.Rank && def.Rank) v.Rank = def.Rank; } }
  if (typeof node.GenderType === 'string' && idx.genderTypeByValue[node.GenderType] && !node.GenderType_JP) node.GenderType_JP = idx.genderTypeByValue[node.GenderType].GenderType_JP;
  if (typeof node.RaceType === 'string' && idx.raceTypeByValue[node.RaceType] && !node.RaceType_JP) node.RaceType_JP = idx.raceTypeByValue[node.RaceType].RaceType_JP;
  if (typeof node.Area === 'string' && idx.areaByValue[node.Area] && !node.Area_EN) node.Area_EN = idx.areaByValue[node.Area].Area_EN;
  if (typeof node.Belonging === 'string' && idx.belongingByValue[node.Belonging] && !node.Belonging_EN) node.Belonging_EN = idx.belongingByValue[node.Belonging].Belonging_EN;
  if (Array.isArray(node.Belonging)) node.Belonging = node.Belonging.map(b => idx.belongingByValue[b] || b);
  if (node.Day && typeof node.Day.Month !== 'undefined') { const m = idx.monthByNum[Number(node.Day.Month)]; if (m && m.Month_EN && !node.Month_EN) node.Month_EN = m.Month_EN; }
  if (Array.isArray(node.RelationLabel)) node.RelationLabel = node.RelationLabel.map(r => idx.relationLabelByValue[r] || r);
  const resolveArrayBy = (arr, map) => Array.isArray(arr) ? arr.map(v => (typeof v === 'string' ? (map[v] || v) : v)) : arr;
  const resolveSingleBy = (v, map) => (typeof v === 'string' ? (map[v] || v) : v);
  if (node.Card && typeof node.Card.Stoat === 'string' && idx.stoatByValue[node.Card.Stoat]) node.Card.Stoat = idx.stoatByValue[node.Card.Stoat];
  if (node.SpecType) {
    if (Array.isArray(node.SpecType.Material)) node.SpecType.Material = node.SpecType.Material.map(v => { if (typeof v === 'string') return idx.materialByValue[v] || v; if (isObject(v) && v.Material) return idx.materialByValue[v.Material] || v; return v; });
    if (node.SpecType.ActionType) { const a = node.SpecType.ActionType; if (a.KinematicOrStatic) a.KinematicOrStatic = resolveSingleBy(a.KinematicOrStatic, idx.kinStatByValue); if (a.RoleType) a.RoleType = resolveSingleBy(a.RoleType, idx.roleTypeByValue); }
    if (node.SpecType.DualizePattern && node.SpecType.DualizePattern.Pattern) node.SpecType.DualizePattern = resolveSingleBy(node.SpecType.DualizePattern.Pattern, idx.dualizePatternByValue);
    if (typeof node.SpecType.DualizePattern === 'string') node.SpecType.DualizePattern = resolveSingleBy(node.SpecType.DualizePattern, idx.dualizePatternByValue);
  }
  if (node.SpetialPattern) { if (Array.isArray(node.SpetialPattern)) node.SpetialPattern = resolveArrayBy(node.SpetialPattern, idx.spetialPatternByValue); else if (typeof node.SpetialPattern === 'string') node.SpetialPattern = resolveSingleBy(node.SpetialPattern, idx.spetialPatternByValue); }
  if (typeof node.Lunar === 'string' && idx.lunarByValue[node.Lunar]) node.Lunar = idx.lunarByValue[node.Lunar];
  if (typeof node.Beast === 'string' && idx.beastByValue[node.Beast]) node.Beast = idx.beastByValue[node.Beast];
  enrichNodeWithGenericListLinks(node, idx);
  enrichNodeWithGenericListIndex(node, idx);
  enrichNodeWithGenericEnumLink(node, idx);
}

// Generic #String_JP,#ListLink support
function collectListLinkTargets(defTypeMerged) { const out = []; const visit = (arr, path = []) => { if (!Array.isArray(arr)) return; for (const item of arr) { if (!item || typeof item !== 'object') continue; const tag = item.hashTag; const t = item.$type; if (typeof t === 'string') { if (t.split('|').some(s => s.trim() === '#String_JP,#ListLink')) out.push({ fieldName: tag, path: [...path, tag] }); } else if (Array.isArray(t)) { visit(t, [...path, tag]); } } }; visit(defTypeMerged || []); const seen = new Set(); return out.filter(o => (seen.has(o.fieldName) ? false : (seen.add(o.fieldName), true))); }
function collectAllListLinks(varsDef) { const map = {}; walkDefs(varsDef, (p, k, v) => { if (k.startsWith('#ListLink_') && Array.isArray(v)) { const suffix = k.substring('#ListLink_'.length); map[k] = { keySuffix: suffix, items: v }; } }); return map; }
function buildGenericMappingForField(fieldName, allListLinks) { const directKey = `#ListLink_${fieldName}`; if (!allListLinks[directKey]) return null; return buildMappingFromList(fieldName, allListLinks[directKey], fieldName); }
function buildMappingFromList(fieldName, link, jpKeyCandidate) { const items = link.items; const jpKey = jpKeyCandidate && items.some(it => Object.prototype.hasOwnProperty.call(it, jpKeyCandidate)) ? jpKeyCandidate : fieldName; let enKey = `${jpKey}_EN`; if (!items.some(it => Object.prototype.hasOwnProperty.call(it, enKey))) { const enAlt = Object.keys(items[0] || {}).find(k => k.endsWith('_EN')); if (enAlt) enKey = enAlt; } const byRank = {}; const byJP = {}; const byEN = {}; for (const it of items) { const r = normRank(it.Rank); const jp = it[jpKey]; const en = it[enKey]; const pack = { [jpKey]: jp, [enKey]: en, Rank: r }; if (r && !byRank[r]) byRank[r] = pack; if (jp && !byJP[jp]) byJP[jp] = pack; if (en && !byEN[en]) byEN[en] = pack; } return { fieldName, listKey: `#ListLink_${link.keySuffix}`, jpKey, enKey, byRank, byJP, byEN }; }
function enrichNodeWithGenericListLinks(node, idx) { const gmap = idx.genericFieldKeyMap; if (!gmap || !isObject(node)) return; for (const [k, v] of Object.entries(node)) { const m = gmap[k]; if (!m) continue; const jpVal = typeof node[k] === 'string' ? node[k] : (typeof node[m.jpKey] === 'string' ? node[m.jpKey] : null); const r = normRank(node.Rank); if (r && m.byRank[r]) { const pack = m.byRank[r]; if (!node[m.jpKey] && pack[m.jpKey]) node[m.jpKey] = pack[m.jpKey]; const enProp1 = `${m.fieldName}_EN`; if (!node[enProp1] && pack[m.enKey]) node[enProp1] = pack[m.enKey]; if (!node[m.enKey] && pack[m.enKey]) node[m.enKey] = pack[m.enKey]; if (!node[m.fieldName] && node[m.jpKey]) node[m.fieldName] = node[m.jpKey]; } else if (jpVal && m.byJP[jpVal]) { const pack = m.byJP[jpVal]; if (!node.Rank && pack.Rank) node.Rank = pack.Rank; if (!node[m.enKey] && pack[m.enKey]) node[m.enKey] = pack[m.enKey]; const enProp1 = `${m.fieldName}_EN`; if (!node[enProp1] && pack[m.enKey]) node[enProp1] = pack[m.enKey]; if (!node[m.jpKey] && jpVal) node[m.jpKey] = jpVal; if (!node[m.fieldName] && node[m.jpKey]) node[m.fieldName] = node[m.jpKey]; } } }

// Generic #ListIndex support
function collectListIndexTargets(defTypeMerged) { const out = []; const visit = (arr, path = []) => { if (!Array.isArray(arr)) return; for (const item of arr) { if (!item || typeof item !== 'object') continue; const tag = item.hashTag; const t = item.$type; if (typeof t === 'string') { const parts = t.split('|').map(s => s.trim()); if (parts.some(s => s === '#ListIndex' || s === '#ListIndex[]')) out.push({ fieldName: tag, path: [...path, tag] }); } else if (Array.isArray(t)) { visit(t, [...path, tag]); } } }; visit(defTypeMerged || []); const seen = new Set(); return out.filter(o => (seen.has(o.fieldName) ? false : (seen.add(o.fieldName), true))); }
function collectAllLists(varsDef) { const map = {}; walkDefs(varsDef, (p, k, v) => { if (k.startsWith('#List_') && Array.isArray(v)) { const suffix = k.substring('#List_'.length); map[k] = { keySuffix: suffix, items: v }; } }); return map; }
function buildGenericListIndexMappingForField(fieldName, allLists) { const directKey = `#List_${fieldName}`; const link = allLists[directKey]; if (!link) return null; const items = link.items; const byValue = {}; for (const it of items) { if (isObject(it) && Object.prototype.hasOwnProperty.call(it, fieldName)) { byValue[it[fieldName]] = it; } } const sample = items.find(it => isObject(it)) || {}; const jpKey = Object.keys(sample).find(k => k === `${fieldName}_JP`) || null; const enKey = Object.keys(sample).find(k => k === `${fieldName}_EN`) || null; return { fieldName, listKey: directKey, byValue, jpKey, enKey }; }
function enrichNodeWithGenericListIndex(node, idx) { const fmap = idx.genericListIndex; if (!fmap || !isObject(node)) return; for (const [k, v] of Object.entries(node)) { const m = fmap[k]; if (!m) continue; if (Array.isArray(v)) { const resolved = v.map(val => (typeof val === 'string' ? (m.byValue[val] || val) : val)); node[k] = resolved; } else if (typeof v === 'string') { const def = m.byValue[v]; if (def) { if (m.jpKey && !node[m.jpKey]) node[m.jpKey] = def[m.jpKey]; if (m.enKey && !node[m.enKey]) node[m.enKey] = def[m.enKey]; } } } }

// Generic $EnumLink support
function collectAllEnumLinks(varsDef) { const out = {}; walkDefs(varsDef, (p, k, v) => { if (k.startsWith('$EnumLink_') && (Array.isArray(v) || isObject(v))) { const fieldName = k.substring('$EnumLink_'.length); out[fieldName] = v; } }); return out; }
function detectEnumLinkKeysFromDefType(defTypeMerged) { const map = {}; const visit = (arr) => { if (!Array.isArray(arr)) return; for (const item of arr) { if (!item || typeof item !== 'object') continue; const field = item.hashTag; const t = item.$type; if (Array.isArray(t)) { for (const sub of t) { if (!sub || typeof sub !== 'object') continue; const st = sub.$type; if (typeof st === 'string' && st.split(',').some(x => x.trim() === '$EnumLink')) { if (field && sub.hashTag) map[field] = sub.hashTag; } } } if (Array.isArray(t)) visit(t); } }; visit(defTypeMerged || []); return map; }
function guessEnumLinkKey(items) { const arr = Array.isArray(items) ? items : Object.values(items); const sample = arr.find(it => isObject(it)) || {}; if (Object.prototype.hasOwnProperty.call(sample, 'Rarity')) return 'Rarity'; return Object.keys(sample).find(k => !k.endsWith('_JP') && !k.endsWith('_EN')) || null; }
function buildGenericListIndexMappingForField(fieldName, allLists) { const directKey = `#List_${fieldName}`; const link = allLists[directKey]; if (!link) return null; const items = link.items; const byValue = {}; for (const it of items) { if (isObject(it) && Object.prototype.hasOwnProperty.call(it, fieldName)) { byValue[it[fieldName]] = it; } } const sample = items.find(it => isObject(it)) || {}; const jpKey = Object.keys(sample).find(k => k === `${fieldName}_JP`) || null; const enKey = Object.keys(sample).find(k => k === `${fieldName}_EN`) || null; return { fieldName, listKey: directKey, byValue, jpKey, enKey }; }
function collectAllEnumLinks(varsDef) { const out = {}; walkDefs(varsDef, (p, k, v) => { if (k.startsWith('$EnumLink_') && (Array.isArray(v) || isObject(v))) { const fieldName = k.substring('$EnumLink_'.length); out[fieldName] = v; } }); return out; }
function enrichNodeWithGenericEnumLink(node, idx) { const fmap = idx.genericEnumLinkFieldMap; if (!fmap || !isObject(node)) return; for (const [k, v] of Object.entries(node)) { const m = fmap[k]; if (!m) continue; let keyVal = null; if (typeof v === 'string') keyVal = v; else if (isObject(v) && Object.prototype.hasOwnProperty.call(v, m.keyName)) keyVal = v[m.keyName]; if (keyVal == null) continue; const def = m.byValue[keyVal]; if (def) { node[k] = def; } } }
function summarizeIndices(idx) { try { const pickCount = (obj) => (obj && typeof obj === 'object') ? Object.keys(obj).length : 0; return { abilityTextByRank: pickCount(idx.abilityTextByRank), effectTextByRank: pickCount(idx.effectTextByRank), safetyTextByRank: pickCount(idx.safetyTextByRank), specLevelTextByRank: pickCount(idx.specLevelTextByRank), genderType: pickCount(idx.genderTypeByValue), raceType: pickCount(idx.raceTypeByValue), belonging: pickCount(idx.belongingByValue), area: pickCount(idx.areaByValue), month: pickCount(idx.monthByNum), relationLabel: pickCount(idx.relationLabelByValue), stoat: pickCount(idx.stoatByValue), lunar: pickCount(idx.lunarByValue), beast: pickCount(idx.beastByValue), material: pickCount(idx.materialByValue), kinematicOrStatic: pickCount(idx.kinStatByValue), roleType: pickCount(idx.roleTypeByValue), dualizePattern: pickCount(idx.dualizePatternByValue), spetialPattern: pickCount(idx.spetialPatternByValue), genericListLinks: pickCount(idx.genericListLinks), genericListIndex: pickCount(idx.genericListIndex), genericEnumLink: pickCount(idx.genericEnumLink) }; } catch (_) { return { error: 'failed to summarize indices' }; } }

// --- General.$VarsDef accessors & Data readers ---
async function readGlobalMeta() { return fetchJSON('/data/db_meta.json'); }
async function readGlobalType() { try { return await fetchJSON('/data/db_type.json'); } catch (_) { return {}; } }
async function readWorkMeta(workId) { const metaPath = `/data/${workId.replace('#Works_', 'Works_')}/DataBases/db_meta.json`; return fetchJSON(metaPath); }
async function readWorkType(workId) { try { return await fetchJSON(`/data/${workId.replace('#Works_', 'Works_')}/DataBases/db_type.json`); } catch (_) { return {}; } }
async function readGeneralVarsDefGlobal() { try { const g = await readGlobalMeta(); return g?.General?.$VarsDef ?? {}; } catch (_) { return {}; } }
async function readGeneralVarsDefWork(workId) { try { const meta = await readWorkMeta(workId); return meta?.General?.$VarsDef ?? {}; } catch (_) { return {}; } }
async function readDB(workId, dbName) {
  const norm = (dbName || '').replace(/^#?DB_/i, '').replace(/^[#]/, '');
  const key = capitalize(norm);
  const base = `/data/${workId.replace('#Works_', 'Works_')}/DataBases`;
  // Known conventional names first
  const conventional = {
    Primary: 'db_Primary.json',
    Secondary: 'db_Secondary.json',
    SemiPrimary: 'db_SemiPrimary.json',
    SelfSecondary: 'db_SelfSecondary.json',
    Proxy: 'db_Proxy.json'
  };
  const candidates = [];
  if (conventional[key]) candidates.push(conventional[key]);
  if (conventional[norm]) candidates.push(conventional[norm]);
  // Flexible fallback: db_<Key>.json / db_<norm>.json
  candidates.push(`db_${key}.json`);
  if (key.toLowerCase() !== norm.toLowerCase()) candidates.push(`db_${norm}.json`);
  // Pick first existing file
  for (const fname of candidates) {
    if (await fileExists(`${base}/${fname}`)) {
      return fetchJSON(`${base}/${fname}`);
    }
  }
  throw new Error(`Unknown dbName or missing file for ${dbName}`);
}
async function listWorkDBs(workId) {
  const base = `/data/${workId.replace('#Works_', 'Works_')}/DataBases`;
  const exist = [];
  // Prefer meta.Databases keys to be flexible
  try {
    const meta = await readWorkMeta(workId);
    const dbs = Object.keys(meta?.Databases || {});
    for (const dbKey of dbs) {
      const norm = (dbKey || '').replace(/^#?DB_/i, '').replace(/^[#]/, '');
      const name = capitalize(norm);
      const candidates = [
        `db_${name}.json`,
        ...(name.toLowerCase() !== norm.toLowerCase() ? [`db_${norm}.json`] : [])
      ];
      for (const fname of candidates) {
        if (await fileExists(`${base}/${fname}`)) {
          exist.push({ key: name, file: fname });
          break;
        }
      }
    }
  } catch {}
  // Fallback to conventional probes if meta yielded nothing
  if (exist.length === 0) {
    const conventional = [
      { name: 'Primary', file: 'db_Primary.json' },
      { name: 'Secondary', file: 'db_Secondary.json' },
      { name: 'SemiPrimary', file: 'db_SemiPrimary.json' },
      { name: 'SelfSecondary', file: 'db_SelfSecondary.json' },
      { name: 'Proxy', file: 'db_Proxy.json' }
    ];
    for (const c of conventional) {
      if (await fileExists(`${base}/${c.file}`)) exist.push({ key: c.name, file: c.file });
    }
  }
  return exist;
}

// --- Commons application and search ---
function normalizeDBKeyForMeta(dbName) { const norm = (dbName || '').replace(/^#?DB_/i, ''); return `#DB_${capitalize(norm)}`; }
function applyCommonsToRecords(records, workMeta, dbName) { try { const dbKey = normalizeDBKeyForMeta(dbName); const commons = workMeta?.Databases?.[dbKey]?._Commons; const secDefs = workMeta?.Databases?.[dbKey]?.Secondaries; if ((!commons && !Array.isArray(secDefs)) || !Array.isArray(records)) return records; const CONDITIONAL_PREFIX = '_ListLinkIf_'; const isConditionalKey = (k) => k.startsWith(CONDITIONAL_PREFIX); const getFieldNameFromConditional = (k) => k.substring(CONDITIONAL_PREFIX.length); const deepFindFirstByKey = (obj, key) => { if (!isObject(obj)) return undefined; if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key]; for (const v of Object.values(obj)) { if (isObject(v)) { const found = deepFindFirstByKey(v, key); if (typeof found !== 'undefined') return found; } } return undefined; }; const buildDefaultsFromCommons = (cmn, rec) => { if (!cmn || !isObject(cmn)) return {}; const out = {}; for (const [k, v] of Object.entries(cmn)) { if (k.startsWith('_') || k.startsWith('#')) continue; out[k] = v; } for (const [k, arr] of Object.entries(cmn)) { if (!isConditionalKey(k) || !Array.isArray(arr)) continue; const field = getFieldNameFromConditional(k); let curVal = typeof rec[field] !== 'undefined' ? rec[field] : undefined; if (typeof curVal === 'undefined' && isObject(rec.Card) && typeof rec.Card[field] !== 'undefined') curVal = rec.Card[field]; if (typeof curVal === 'undefined' && isObject(rec.SpecType) && typeof rec.SpecType[field] !== 'undefined') curVal = rec.SpecType[field]; if (typeof curVal === 'undefined') curVal = deepFindFirstByKey(rec, field); if (typeof curVal === 'undefined' || curVal === null) continue; const match = arr.find(it => isObject(it) && Object.prototype.hasOwnProperty.call(it, field) && String(it[field]) === String(curVal)); if (!match) continue; for (const [ik, iv] of Object.entries(match)) { if (ik === field || ik.startsWith('_') || ik.startsWith('#')) continue; out[ik] = iv; } } return out; }; const findSecondaryCommons = (rec) => { if (!Array.isArray(secDefs)) return null; const keys = ['SecondaryCategory', 'SecondaryDesignedBy', 'SecondarySeriesTitle']; for (const def of secDefs) { if (!isObject(def) || !isObject(def._Commons)) continue; const criteria = keys.filter(k => typeof def[k] !== 'undefined'); const ok = criteria.every(k => String(getByPath(rec, k) ?? '') === String(def[k] ?? '')); if (ok) return def._Commons; } return null; }; return records.map(rec => { if (!isObject(rec)) return rec; const dbDefaults = buildDefaultsFromCommons(commons, rec); const secCommons = findSecondaryCommons(rec); const secDefaults = buildDefaultsFromCommons(secCommons, rec); const defaults = { ...dbDefaults, ...secDefaults }; for (const [k, v] of Object.entries(defaults)) { if (k.startsWith('#')) continue; if (typeof rec[k] === 'undefined') rec[k] = v; } return rec; }); } catch (_) { return records; } }
function searchRecords(records, queries) { return records.filter(rec => { return queries.every(q => { const val = getByPath(rec, q.hashTag); if (val == null) return false; if (Array.isArray(val)) { return val.some(it => { if (it == null) return false; if (typeof it === 'string' || typeof it === 'number' || typeof it === 'boolean') return String(it) === String(q.key); if (typeof it === 'object') { const inner = it[q.hashTag]; if (inner != null) return String(inner) === String(q.key); return String(it) === String(q.key); } return false; }); } if (typeof val === 'object') { const inner = val[q.hashTag]; if (inner != null) return String(inner) === String(q.key); } return String(val) === String(q.key); }); }); }
function getByPath(obj, path) { if (!path) return undefined; const parts = String(path).split('.'); let cur = obj; for (const p of parts) { if (cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p]; else return undefined; } return cur; }
