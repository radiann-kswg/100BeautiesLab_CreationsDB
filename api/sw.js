// Service Worker: static API router for GitHub Pages
// - Intercepts /api/v1/* requests
// - Reads JSON from /data/** and returns pseudo-API responses

const API_PREFIX = '/api/v1';
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
    await cache.addAll(['/data/db_meta.json']);
  } catch (_) {}
}

// Utilities
function jsonResponse(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  });
}

function notFound(message = 'Not Found') {
  return jsonResponse({ error: message }, 404);
}

function badRequest(message = 'Bad Request') {
  return jsonResponse({ error: message }, 400);
}

function toWorkKey(id) {
  // Accept variants: '#Works_NumberTales' | 'Works_NumberTales' | 'NumberTales'
  if (!id) return null;
  if (id.startsWith('#Works_')) return id;
  if (id.startsWith('Works_')) return '#' + id;
  return `#Works_${id}`;
}

async function fetchJSON(path) {
  const url = new URL(path, ORIGIN).toString();
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${url}`);
  return res.json();
}

async function fileExists(path) {
  try {
    const url = new URL(path, ORIGIN).toString();
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

async function listWorkDBs(workId) {
  // Probe known DB file names by convention
  const base = `/data/${workId.replace('#Works_', 'Works_')}/DataBases`;
  const candidates = [
    { name: 'Primary', file: 'db_Primary.json' },
    { name: 'Secondary', file: 'db_Secondary.json' },
    { name: 'SemiPrimary', file: 'db_SemiPrimary.json' },
    { name: 'SelfSecondary', file: 'db_SelfSecondary.json' },
    { name: 'Proxy', file: 'db_Proxy.json' },
    { name: 'Mobs', file: 'db_Mobs.json' }
  ];
  const exist = [];
  for (const c of candidates) {
    if (await fileExists(`${base}/${c.file}`)) exist.push({ key: c.name, file: c.file });
  }
  return exist;
}

async function readWorkMeta(workId) {
  const metaPath = `/data/${workId.replace('#Works_', 'Works_')}/DataBases/db_meta.json`;
  return fetchJSON(metaPath);
}

async function readGlobalMeta() {
  return fetchJSON('/data/db_meta.json');
}

async function readGlobalType() {
  try {
    return await fetchJSON('/data/db_type.json');
  } catch (_) {
    return {};
  }
}

async function readWorkType(workId) {
  try {
    return await fetchJSON(`/data/${workId.replace('#Works_', 'Works_')}/DataBases/db_type.json`);
  } catch (_) {
    return {};
  }
}

async function readDB(workId, dbName) {
  const map = {
    Primary: 'db_Primary.json',
    Secondary: 'db_Secondary.json',
    SemiPrimary: 'db_SemiPrimary.json',
    SelfSecondary: 'db_SelfSecondary.json',
    Proxy: 'db_Proxy.json',
    Mobs: 'db_Mobs.json'
  };
  // accept '#DB_Primary' style
  const norm = (dbName || '').replace(/^#?DB_/i, '').replace(/^[#]/, '');
  const fname = map[norm] || map[capitalize(norm)];
  if (!fname) throw new Error(`Unknown dbName: ${dbName}`);
  const path = `/data/${workId.replace('#Works_', 'Works_')}/DataBases/${fname}`;
  return fetchJSON(path);
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function searchRecords(records, queries) {
  // queries: [{ hashTag, key }]
  return records.filter(rec => {
    return queries.every(q => {
      // Deep pick by simple key (no dot support here except shallow nested like 'Card.Num')
      const val = getByPath(rec, q.hashTag);
      if (val == null) return false;
      return String(val) === String(q.key);
    });
  });
}

function getByPath(obj, path) {
  if (!path) return undefined;
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p]; else return undefined;
  }
  return cur;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith(API_PREFIX)) return; // ignore

  event.respondWith(handleApiRequest(url).catch(err => jsonResponse({ error: String(err) }, 500)));
});

async function handleApiRequest(url) {
  const path = url.pathname.substring(API_PREFIX.length);
  const seg = path.split('/').filter(Boolean); // ['', 'index'] → ['index']
  // デフォルトで自動解決ON（?resolve=0 で無効化可能）
  const resolveParam = url.searchParams.get('resolve');
  const resolve = resolveParam == null ? true : truthy(resolveParam);
  // デフォルトで定義併載ON（?includeVars=0 で無効化可能）
  const includeVarsParam = url.searchParams.get('includeVars');
  const includeVars = includeVarsParam == null ? true : truthy(includeVarsParam);

  // /api/v1/index
  if (seg.length === 1 && seg[0] === 'index') {
    const g = await readGlobalMeta();
    return jsonResponse({
      name: '100BeautiesLab Creations DB API',
      version: 1,
      time: new Date().toISOString(),
      works: Object.entries(g.CreationWorks).map(([k, v]) => ({ key: k, Title: v.Title, Title_EN: v.Title_EN }))
    });
  }

  // /api/v1/works
  if (seg.length === 1 && seg[0] === 'works') {
    const g = await readGlobalMeta();
    return jsonResponse(Object.entries(g.CreationWorks).map(([k, v]) => ({ key: k, Title: v.Title, Title_EN: v.Title_EN })));
  }

  // /api/v1/bootstrap?includeRecords=0|1
  if (seg.length === 1 && seg[0] === 'bootstrap') {
    const includeRecordsParam = url.searchParams.get('includeRecords');
    const includeRecords = includeRecordsParam == null ? false : truthy(includeRecordsParam);
  const g = await readGlobalMeta();
  const gType = await readGlobalType();
    const works = Object.keys(g.CreationWorks || {});
    const out = [];
    for (const wk of works) {
      const workId = wk; // already '#Works_*'
      const { mergedVars, indices } = await getWorkContext(workId);
      const dbs = await listWorkDBs(workId);
      const item = { work: workId, defsMerged: mergedVars, databases: dbs };
      if (includeRecords) {
        item.data = {};
        for (const db of dbs) {
          try {
            const raw = await readDB(workId, db.key);
            const resolvedRecs = resolve ? await resolveAllInAny(raw, indices) : raw;
            item.data[db.key] = resolvedRecs;
          } catch (e) {
            item.data[db.key] = { error: String(e) };
          }
        }
      }
      out.push(item);
    }
    return jsonResponse({
      name: 'bootstrap',
      time: new Date().toISOString(),
      works: out
    });
  }

  // /api/v1/works/{work}/defs
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

  // /api/v1/works/{work}
  if (seg.length === 2 && seg[0] === 'works') {
    const workId = toWorkKey(seg[1]);
    const meta = await readWorkMeta(workId);
    if (!resolve) return jsonResponse({ work: workId, meta });
    const { mergedVars } = await getWorkContext(workId);
    return jsonResponse({ work: workId, meta, resolved: { $VarsDefMerged: mergedVars } });
  }

  // /api/v1/works/{work}/db
  if (seg.length === 3 && seg[0] === 'works' && seg[2] === 'db') {
    const workId = toWorkKey(seg[1]);
    const dbs = await listWorkDBs(workId);
    return jsonResponse({ work: workId, databases: dbs });
  }

  // /api/v1/works/{work}/db/{dbName}
  if (seg.length === 4 && seg[0] === 'works' && seg[2] === 'db') {
    const workId = toWorkKey(seg[1]);
    const dbName = seg[3];
    let data = await readDB(workId, dbName);
    if (resolve) {
      const { mergedVars, indices } = await getWorkContext(workId);
      data = await resolveAllInAny(data, indices);
    }
    const payload = { work: workId, db: dbName, records: data, resolved: resolve };
    if (includeVars) {
      const { mergedVars } = await getWorkContext(workId);
      payload.$VarsDefMerged = mergedVars;
    }
    return jsonResponse(payload);
  }

  // /api/v1/search?works={work}&db={dbName}&hashTag={k}&key={v}
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
    const queries = hashTag.map((h, i) => ({ hashTag: h, key: key[i] }));
    let matched = searchRecords(records, queries);
    if (resolve) {
      const { indices } = await getWorkContext(workId);
      matched = await resolveAllInAny(matched, indices);
    }
    const payload = { work: workId, db: dbName, queries, count: matched.length, records: matched, resolved: resolve };
    if (includeVars) {
      const { mergedVars } = await getWorkContext(workId);
      payload.$VarsDefMerged = mergedVars;
    }
    return jsonResponse(payload);
  }

  return notFound('Unknown API path');
}

// --- Resolver helpers ---
function truthy(v) {
  if (!v) return false;
  const s = String(v).toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function isObject(x) { return x && typeof x === 'object' && !Array.isArray(x); }

// --- Normalizers ---
function normRank(v) {
  if (v == null) return null;
  // Keep symbols like '+', just trim spaces; do not uppercase JP texts
  return String(v).trim();
}

function toArray(v) {
  return Array.isArray(v) ? v : (v == null ? [] : [v]);
}

function deepMerge(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  if (isObject(a) && isObject(b)) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) {
      if (k in out) out[k] = deepMerge(out[k], v); else out[k] = v;
    }
    return out;
  }
  return b ?? a;
}

async function resolveAllInAny(value, indices, path = []) {
  if (Array.isArray(value)) {
    const out = [];
    for (let i = 0; i < value.length; i++) out.push(await resolveAllInAny(value[i], indices, [...path, i]));
    return out;
  }
  if (!isObject(value)) return value;

  // First resolve children
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = await resolveAllInAny(v, indices, [...path, k]);
  }

  // Resolve _DBLink at this node
  if (value._DBLink) {
    try {
      out._DBLinkResolved = await resolveDBLinkSpec(value._DBLink);
    } catch (e) {
      out._DBLinkResolved = { error: String(e) };
    }
  }

  // Enrich texts from defs
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
    } catch (e) {
      results.push({ worksTitle: s.worksTitle, dbName, _Search: queries, error: String(e) });
    }
  }
  return results;
}

function extractDefIndexes(varsDef) {
  const enums = {};
  const lists = {};
  const listLinks = {};
  const enumLinks = {};
  walkDefs(varsDef, (path, key, val) => {
    if (key.startsWith('#Enum_')) enums[path.join('.') + '.' + key] = val;
    if (key.startsWith('#List_')) lists[path.join('.') + '.' + key] = val;
    if (key.startsWith('#ListLink_')) listLinks[path.join('.') + '.' + key] = val;
    if (key.startsWith('$EnumLink_')) enumLinks[path.join('.') + '.' + key] = val;
  });
  return { enums, lists, listLinks, enumLinks };
}

function walkDefs(obj, cb, path = []) {
  if (!isObject(obj)) return;
  for (const [k, v] of Object.entries(obj)) {
    cb(path, k, v);
    if (isObject(v)) walkDefs(v, cb, [...path, k]);
  }
}

async function getWorkContext(workId) {
  const cached = WORK_CTX_CACHE.get(workId);
  const now = Date.now();
  if (cached && (now - cached.t) < WORK_CTX_TTL_MS) return cached;
  const [g, gType, meta, type] = await Promise.all([
    readGlobalMeta(),
    readGlobalType(),
    readWorkMeta(workId),
    readWorkType(workId)
  ]);
  const mergedVars = deepMerge(
    deepMerge(gType?.$VarsDef ?? {}, g?.General?.$VarsDef ?? {}),
    deepMerge(type?.$VarsDef ?? {}, meta?.General?.$VarsDef ?? {})
  );
  const defTypeMerged = [...(gType?.$DefType ?? []), ...(type?.$DefType ?? [])];
  const indices = buildEnrichmentIndices(mergedVars, meta, defTypeMerged);
  const out = { t: now, mergedVars, defTypeMerged, indices };
  WORK_CTX_CACHE.set(workId, out);
  return out;
}

function buildEnrichmentIndices(varsDef, workMeta, defTypeMerged) {
  const idx = {
    abilityTextByRank: {},
    abilityTextByJP: {},
    effectTextByRank: {},
    effectTextByJP: {},
    safetyTextByRank: {},
    safetyTextByJP: {},
    specLevelTextByRank: {},
    specLevelTextByJP: {},
    genderTypeByValue: {},
    raceTypeByValue: {},
    belongingByValue: {},
    areaByValue: {},
    monthByNum: {},
    relationLabelByValue: {},
    // work-specific lists
    stoatByValue: {},
    lunarByValue: {},
    beastByValue: {},
    // FLInvestigator: material/action/role/dualize
    materialByValue: {},
    kinStatByValue: {},
    roleTypeByValue: {},
    dualizePatternByValue: {},
    spetialPatternByValue: {},
    // generic #String_JP,#ListLink indices
    genericListLinks: {}, // by fieldName (e.g., 'EffectText' / 'SafetyLevelText')
    genericFieldKeyMap: {} // by field key to mapping (includes alias and canonical jpKey)
  };

  // AbilityText
  const abl = varsDef?.$Def_AbilityStats?.$EnumLink_AbilityText;
  if (isObject(abl)) for (const v of Object.values(abl)) if (isObject(v) && v.Rank) {
    const r = normRank(v.Rank);
    if (r && !idx.abilityTextByRank[r]) idx.abilityTextByRank[r] = { AbilityText: v.AbilityText, AbilityText_EN: v.AbilityText_EN };
    if (v.AbilityText && !idx.abilityTextByJP[v.AbilityText]) idx.abilityTextByJP[v.AbilityText] = { AbilityText: v.AbilityText, AbilityText_EN: v.AbilityText_EN, Rank: r };
  }

  // Collect all Effect/Safety/SpecLevel definitions possibly nested
  walkDefs(varsDef, (p, k, v) => {
    if (k === '#ListLink_EffectText' && Array.isArray(v)) {
      for (const e of v) if ((e?.Rank || e?.EffectText) && (e.EffectText || e.EffectText_EN)) {
        const r = normRank(e.Rank);
        if (r && !idx.effectTextByRank[r]) idx.effectTextByRank[r] = { EffectText: e.EffectText, EffectText_EN: e.EffectText_EN };
        if (e.EffectText && !idx.effectTextByJP[e.EffectText]) idx.effectTextByJP[e.EffectText] = { EffectText: e.EffectText, EffectText_EN: e.EffectText_EN, Rank: r };
      }
    }
    if (k === '#ListLink_SafetyLevelText' && Array.isArray(v)) {
      for (const s of v) if ((s?.Rank || s?.SafetyLevelText) && (s.SafetyLevelText || s.SafetyLevelText_EN)) {
        const r = normRank(s.Rank);
        if (r && !idx.safetyTextByRank[r]) idx.safetyTextByRank[r] = { SafetyLevelText: s.SafetyLevelText, SafetyLevelText_EN: s.SafetyLevelText_EN };
        if (s.SafetyLevelText && !idx.safetyTextByJP[s.SafetyLevelText]) idx.safetyTextByJP[s.SafetyLevelText] = { SafetyLevelText: s.SafetyLevelText, SafetyLevelText_EN: s.SafetyLevelText_EN, Rank: r };
      }
    }
    if (k === '$EnumLink_SpecLevelText' && isObject(v)) {
      for (const o of Object.values(v)) if (o?.Rank || o?.SpecLevelText) {
        const r = normRank(o.Rank);
        if (r && !idx.specLevelTextByRank[r]) idx.specLevelTextByRank[r] = { SpecLevelText: o.SpecLevelText, SpecLevelText_EN: o.SpecLevelText_EN };
        if (o.SpecLevelText && !idx.specLevelTextByJP[o.SpecLevelText]) idx.specLevelTextByJP[o.SpecLevelText] = { SpecLevelText: o.SpecLevelText, SpecLevelText_EN: o.SpecLevelText_EN, Rank: r };
      }
    }
  });

  // GenderType
  const gen = varsDef?.$EnumDef_GenderType;
  if (isObject(gen)) for (const v of Object.values(gen)) if (v?.GenderType) idx.genderTypeByValue[v.GenderType] = v;

  // RaceType (new: #List_RaceType, legacy: #Enum_RaceType)
  const races = varsDef?.['#List_RaceType'] || varsDef?.['#Enum_RaceType'];
  if (Array.isArray(races)) for (const r of races) if (r?.RaceType) idx.raceTypeByValue[r.RaceType] = r;

  // Belonging / Area (new lists with #List_*, legacy with #Enum_*)
  const belong = varsDef?.$Def_Belonging?.['#List_Belonging'] || varsDef?.$Def_Belonging?.['#Enum_Belonging'];
  if (Array.isArray(belong)) for (const b of belong) if (b?.Belonging) idx.belongingByValue[b.Belonging] = b;
  const areas = varsDef?.$Def_Belonging?.['#List_Area'] || varsDef?.$Def_Belonging?.['#Enum_Area'];
  if (Array.isArray(areas)) for (const a of areas) if (a?.Area) idx.areaByValue[a.Area] = a;

  // Month (new: #List_Month, legacy: #Enum_Month)
  const months = varsDef?.$Def_Day?.['#List_Month'] || varsDef?.['#List_Month'] || varsDef?.$Def_Day?.['#Enum_Month'] || varsDef?.['#Enum_Month'];
  if (Array.isArray(months)) for (const m of months) if (m?.Month != null) idx.monthByNum[Number(m.Month)] = m;

  // RelationLabel (legacy/new)
  const relLabels = varsDef?.$Def_Relation?.['#List_RelationLabel'];
  if (Array.isArray(relLabels)) for (const r of relLabels) if (r?.RelationLabel) idx.relationLabelByValue[r.RelationLabel] = r;
  const relLabels2 = varsDef?.$Def_Relations?.['#List_RelationLabel'];
  if (Array.isArray(relLabels2)) for (const r of relLabels2) if (r?.RelationLabel) idx.relationLabelByValue[r.RelationLabel] = r;

  // FLInvestigator78 lists in $VarsDef
  const materials = varsDef?.$Def_ArcanumspecStats?.$Def_SpecType?.$Def_MaterialType?.['#List_MaterialType'];
  if (Array.isArray(materials)) for (const m of materials) if (m?.MaterialType) idx.materialByValue[m.MaterialType] = m;
  const kinstat = varsDef?.$Def_ArcanumspecStats?.$Def_SpecType?.$Def_ActionType?.['#List_KinematicOrStatic'];
  if (Array.isArray(kinstat)) for (const ks of kinstat) if (ks?.KinematicOrStatic) idx.kinStatByValue[ks.KinematicOrStatic] = ks;
  const roletypes = varsDef?.$Def_ArcanumspecStats?.$Def_SpecType?.$Def_ActionType?.['#List_RoleType'];
  if (Array.isArray(roletypes)) for (const r of roletypes) if (r?.RoleType) idx.roleTypeByValue[r.RoleType] = r;
  const dualize = varsDef?.$Def_ArcanumspecStats?.$Def_SpecType?.['#List_DualizePattern'];
  if (Array.isArray(dualize)) for (const d of dualize) if (d?.Pattern) idx.dualizePatternByValue[d.Pattern] = d;
  const spPtn = varsDef?.$Def_ArcanumspecStats?.$Def_SpetialPattern?.['#List_SpetialPattern']
    || varsDef?.$Def_NumerospecStats?.$Def_SpetialPattern?.['#List_SpetialPattern']
    || varsDef?.$Def_BeastspecStats?.$Def_SpetialPattern?.['#List_SpetialPattern'];
  if (Array.isArray(spPtn)) for (const p of spPtn) if (typeof p === 'string') idx.spetialPatternByValue[p] = { SpetialPattern: p };

  // Work meta _Commons based #List_* (Stoat/Lunar/Beastなど)
  try {
    const commons = workMeta?.Databases?.['#DB_Primary']?._Commons || {};
    if (Array.isArray(commons['#List_Stoat'])) for (const s of commons['#List_Stoat']) if (s?.Stoat) idx.stoatByValue[s.Stoat] = s;
    if (Array.isArray(commons['#List_Lunar'])) for (const l of commons['#List_Lunar']) if (l?.Lunar) idx.lunarByValue[l.Lunar] = l;
    if (Array.isArray(commons['#List_Beast'])) for (const b2 of commons['#List_Beast']) if (b2?.Beast) idx.beastByValue[b2.Beast] = b2;
  } catch (_) {}

  // Build generic #String_JP,#ListLink indices from $DefTypeMerged and $VarsDef
  try {
    const targets = collectListLinkTargets(defTypeMerged);
    const allListLinks = collectAllListLinks(varsDef);
    for (const tgt of targets) {
      const mapping = buildGenericMappingForField(tgt.fieldName, allListLinks);
      if (mapping) {
        idx.genericListLinks[tgt.fieldName] = mapping;
        // Map both alias (declared field name) and canonical JP key to the same mapping for lookup during enrichment
        idx.genericFieldKeyMap[tgt.fieldName] = mapping;
        if (mapping.jpKey && mapping.jpKey !== tgt.fieldName) idx.genericFieldKeyMap[mapping.jpKey] = mapping;
      }
    }
  } catch (_) {}

  return idx;
}

function enrichNodeWithDefs(node, path, idx) {
  if (!isObject(node)) return;

  // AbilityStats: add AbilityText by Rank
  if (path[path.length - 1] === 'AbilityStats') {
    for (const [k, v] of Object.entries(node)) {
      if (!isObject(v)) continue;
      const r = normRank(v.Rank);
      if (r && idx.abilityTextByRank[r]) {
        if (!v.AbilityText) Object.assign(v, idx.abilityTextByRank[r]);
      } else if (typeof v.AbilityText === 'string' && idx.abilityTextByJP[v.AbilityText]) {
        // If only JP given, attach EN and Rank
        const def = idx.abilityTextByJP[v.AbilityText];
        if (!v.AbilityText_EN && def.AbilityText_EN) v.AbilityText_EN = def.AbilityText_EN;
        if (!v.Rank && def.Rank) v.Rank = def.Rank;
      }
    }
  }

  // EffectStats: fill EffectText from Rank where missing
  if (path[path.length - 1] === 'EffectStats') {
    for (const [k, v] of Object.entries(node)) {
      if (!isObject(v)) continue;
      const r = normRank(v.Rank);
      if (r && idx.effectTextByRank[r]) {
        if (!v.EffectText) Object.assign(v, idx.effectTextByRank[r]);
      } else if (typeof v.EffectText === 'string' && idx.effectTextByJP[v.EffectText]) {
        const def = idx.effectTextByJP[v.EffectText];
        if (!v.EffectText_EN && def.EffectText_EN) v.EffectText_EN = def.EffectText_EN;
        if (!v.Rank && def.Rank) v.Rank = def.Rank;
      }
    }
  }

  // SafetyLevel: fill SafetyLevelText by Rank
  if (path[path.length - 1] === 'SafetyLevel') {
    const v = node;
    if (!isObject(v)) return;
    const r = normRank(v.Rank);
    if (r && idx.safetyTextByRank[r]) {
      if (!v.SafetyLevelText) Object.assign(v, idx.safetyTextByRank[r]);
    } else if (typeof v.SafetyLevelText === 'string' && idx.safetyTextByJP[v.SafetyLevelText]) {
      const def = idx.safetyTextByJP[v.SafetyLevelText];
      if (!v.SafetyLevelText_EN && def.SafetyLevelText_EN) v.SafetyLevelText_EN = def.SafetyLevelText_EN;
      if (!v.Rank && def.Rank) v.Rank = def.Rank;
    }
  }

  // SpecLevel: fill SpecLevelText by Rank
  if (path[path.length - 1] === 'SpecLevel') {
    const v = node;
    if (!isObject(v)) return;
    const r = normRank(v.Rank);
    if (r && idx.specLevelTextByRank[r]) {
      if (!v.SpecLevelText) Object.assign(v, idx.specLevelTextByRank[r]);
    } else if (typeof v.SpecLevelText === 'string' && idx.specLevelTextByJP[v.SpecLevelText]) {
      const def = idx.specLevelTextByJP[v.SpecLevelText];
      if (!v.SpecLevelText_EN && def.SpecLevelText_EN) v.SpecLevelText_EN = def.SpecLevelText_EN;
      if (!v.Rank && def.Rank) v.Rank = def.Rank;
    }
  }

  // Simple enums on the node: GenderType, RaceType, Belonging(s), Area
  if (typeof node.GenderType === 'string' && idx.genderTypeByValue[node.GenderType] && !node.GenderType_JP) {
    node.GenderType_JP_resolved = idx.genderTypeByValue[node.GenderType].GenderType_JP;
  }
  if (typeof node.RaceType === 'string' && idx.raceTypeByValue[node.RaceType] && !node.RaceType_JP) {
    node.RaceType_JP_resolved = idx.raceTypeByValue[node.RaceType].RaceType_JP;
  }
  if (typeof node.Area === 'string' && idx.areaByValue[node.Area] && !node.Area_EN) {
    node.Area_EN_resolved = idx.areaByValue[node.Area].Area_EN;
  }
  if (typeof node.Belonging === 'string' && idx.belongingByValue[node.Belonging] && !node.Belonging_EN) {
    node.Belonging_EN_resolved = idx.belongingByValue[node.Belonging].Belonging_EN;
  }
  if (Array.isArray(node.Belonging)) {
    node.Belonging_Resolved = node.Belonging.map(b => idx.belongingByValue[b] || b);
  }

  // Month label (Day.Month)
  if (node.Day && typeof node.Day.Month !== 'undefined') {
    const m = idx.monthByNum[Number(node.Day.Month)];
    if (m && m.Month_EN) node.Month_EN_resolved = m.Month_EN;
  }

  // Relation label expansion
  if (Array.isArray(node.RelationLabel)) {
    node.RelationLabel_Resolved = node.RelationLabel.map(r => idx.relationLabelByValue[r] || r);
  }

  // Work-specific lists and patterns: resolve values to full objects (and support singular or plural fields)
  const resolveArrayBy = (arr, map, keyName) => Array.isArray(arr) ? arr.map(v => (typeof v === 'string' ? (map[v] || v) : v)) : arr;
  const resolveSingleBy = (v, map) => (typeof v === 'string' ? (map[v] || v) : v);

  if (node.Card && typeof node.Card.Stoat === 'string' && idx.stoatByValue[node.Card.Stoat]) {
    node.Card.Stoat_Resolved = idx.stoatByValue[node.Card.Stoat];
  }
  if (node.SpecType) {
    // FL material/action/role/dualize
    if (Array.isArray(node.SpecType.MaterialType)) node.SpecType.MaterialType_Resolved = resolveArrayBy(node.SpecType.MaterialType, idx.materialByValue, 'MaterialType');
    if (Array.isArray(node.SpecType.MaterialType)) node.SpecType.Material_Resolved = node.SpecType.MaterialType.map(v => (typeof v === 'string' ? (idx.materialByValue[v] || v) : v));
    if (node.SpecType.ActionType) {
      const a = node.SpecType.ActionType;
      if (a.KinematicOrStatic) a.KinematicOrStatic_Resolved = resolveSingleBy(a.KinematicOrStatic, idx.kinStatByValue);
      if (a.RoleType) a.RoleType_Resolved = resolveSingleBy(a.RoleType, idx.roleTypeByValue);
    }
    if (node.SpecType.DualizePattern && node.SpecType.DualizePattern.Pattern) node.SpecType.DualizePattern_Resolved = resolveSingleBy(node.SpecType.DualizePattern.Pattern, idx.dualizePatternByValue);
    if (typeof node.SpecType.DualizePattern === 'string') node.SpecType.DualizePattern_Resolved = resolveSingleBy(node.SpecType.DualizePattern, idx.dualizePatternByValue);
  }
  if (node.SpetialPattern) {
    if (Array.isArray(node.SpetialPattern)) node.SpetialPattern_Resolved = resolveArrayBy(node.SpetialPattern, idx.spetialPatternByValue);
    else if (typeof node.SpetialPattern === 'string') node.SpetialPattern_Resolved = resolveSingleBy(node.SpetialPattern, idx.spetialPatternByValue);
  }
  // PastDivers: Lunar list
  if (typeof node.Lunar === 'string' && idx.lunarByValue[node.Lunar]) node.Lunar_Resolved = idx.lunarByValue[node.Lunar];
  // ShouArRiders: Beast list
  if (typeof node.Beast === 'string' && idx.beastByValue[node.Beast]) node.Beast_Resolved = idx.beastByValue[node.Beast];

  // Generic enrich: any field typed as #String_JP,#ListLink in $DefType
  enrichNodeWithGenericListLinks(node, idx);
}

// ---- Generic #String_JP,#ListLink support ----
function collectListLinkTargets(defTypeMerged) {
  // Traverse $DefTypeMerged to find fields where $type contains '#String_JP,#ListLink'
  const out = [];
  const visit = (arr, path = []) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const tag = item.hashTag;
      const t = item.$type;
      if (typeof t === 'string') {
        if (t.split('|').some(s => s.trim() === '#String_JP,#ListLink')) {
          out.push({ fieldName: tag, path: [...path, tag] });
        }
      } else if (Array.isArray(t)) {
        visit(t, [...path, tag]);
      }
    }
  };
  visit(defTypeMerged || []);
  // Deduplicate by fieldName
  const seen = new Set();
  return out.filter(o => (seen.has(o.fieldName) ? false : (seen.add(o.fieldName), true)));
}

function collectAllListLinks(varsDef) {
  // Return a map: listKey (e.g., '#ListLink_EffectText') -> { keySuffix: 'EffectText', items: [...] }
  const map = {};
  walkDefs(varsDef, (p, k, v) => {
    if (k.startsWith('#ListLink_') && Array.isArray(v)) {
      const suffix = k.substring('#ListLink_'.length);
      map[k] = { keySuffix: suffix, items: v };
    }
  });
  return map;
}

function buildGenericMappingForField(fieldName, allListLinks) {
  // Direct match: '#ListLink_' + fieldName
  const directKey = `#ListLink_${fieldName}`;
  if (allListLinks[directKey]) {
    return buildMappingFromList(fieldName, allListLinks[directKey], fieldName);
  }
  const aliasCandidates = [];
  // Try alias by scanning items
  const best = findBestListByItemKeys(fieldName, aliasCandidates, allListLinks);
  if (best) return buildMappingFromList(fieldName, best.link, best.jpKeyCandidate);
  return null;
}

function findBestListByItemKeys(fieldName, aliasCandidates, allListLinks) {
  // Score lists by presence of item key equal to fieldName or aliases
  let best = null;
  for (const [listKey, link] of Object.entries(allListLinks)) {
    const items = link.items;
    const score = { direct: 0, alias: 0 };
    for (const it of items) {
      if (Object.prototype.hasOwnProperty.call(it, fieldName)) score.direct++;
      for (const a of aliasCandidates) if (Object.prototype.hasOwnProperty.call(it, a)) score.alias++;
    }
    const total = score.direct * 10 + score.alias; // prefer direct matches
    if (total > 0 && (!best || total > best.total)) {
      const jpKeyCandidate = score.direct > 0 ? fieldName : (aliasCandidates.find(a => items.some(it => a in it)) || fieldName);
      best = { link, total, jpKeyCandidate };
    }
  }
  return best;
}

function buildMappingFromList(fieldName, link, jpKeyCandidate) {
  const items = link.items;
  const jpKey = jpKeyCandidate && items.some(it => Object.prototype.hasOwnProperty.call(it, jpKeyCandidate)) ? jpKeyCandidate : fieldName;
  // Determine EN key: prefer `${jpKey}_EN`, else find a key ending with '_EN'
  let enKey = `${jpKey}_EN`;
  if (!items.some(it => Object.prototype.hasOwnProperty.call(it, enKey))) {
    const enAlt = Object.keys(items[0] || {}).find(k => k.endsWith('_EN'));
    if (enAlt) enKey = enAlt;
  }
  const byRank = {};
  const byJP = {};
  const byEN = {};
  for (const it of items) {
    const r = normRank(it.Rank);
    const jp = it[jpKey];
    const en = it[enKey];
    const pack = { [jpKey]: jp, [enKey]: en, Rank: r };
    if (r && !byRank[r]) byRank[r] = pack;
    if (jp && !byJP[jp]) byJP[jp] = pack;
    if (en && !byEN[en]) byEN[en] = pack;
  }
  return { fieldName, listKey: `#ListLink_${link.keySuffix}`, jpKey, enKey, byRank, byJP, byEN };
}

function enrichNodeWithGenericListLinks(node, idx) {
  const gmap = idx.genericFieldKeyMap;
  if (!gmap || !isObject(node)) return;
  // For each key present on node that we know how to enrich
  for (const [k, v] of Object.entries(node)) {
    const m = gmap[k];
    if (!m) continue;
    // Determine current JP text from either alias field (k) or canonical jpKey
    const jpVal = typeof node[k] === 'string' ? node[k] : (typeof node[m.jpKey] === 'string' ? node[m.jpKey] : null);
    const r = normRank(node.Rank);
    if (r && m.byRank[r]) {
      const pack = m.byRank[r];
      // Fill JP/EN if missing (do not overwrite existing)
      if (!node[m.jpKey] && pack[m.jpKey]) node[m.jpKey] = pack[m.jpKey];
      const enProp1 = `${m.fieldName}_EN`;
      if (!node[enProp1] && pack[m.enKey]) node[enProp1] = pack[m.enKey];
      if (!node[m.enKey] && pack[m.enKey]) node[m.enKey] = pack[m.enKey];
      // Also reflect alias JP if canonical exists but alias missing
      if (!node[m.fieldName] && node[m.jpKey]) node[m.fieldName] = node[m.jpKey];
    } else if (jpVal && m.byJP[jpVal]) {
      const pack = m.byJP[jpVal];
      if (!node.Rank && pack.Rank) node.Rank = pack.Rank;
      if (!node[m.enKey] && pack[m.enKey]) node[m.enKey] = pack[m.enKey];
      const enProp1 = `${m.fieldName}_EN`;
      if (!node[enProp1] && pack[m.enKey]) node[enProp1] = pack[m.enKey];
      // Mirror canonical/alias JP
      if (!node[m.jpKey] && jpVal) node[m.jpKey] = jpVal;
      if (!node[m.fieldName] && node[m.jpKey]) node[m.fieldName] = node[m.jpKey];
    }
  }
}
