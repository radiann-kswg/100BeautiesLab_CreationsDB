// Service Worker: static API router for GitHub Pages
// - Intercepts /api/v1/* requests
// - Reads JSON from /data/** and returns pseudo-API responses

const API_PREFIX = '/api/v1';
const CACHE_NAME = '100bl-api-v1';
const ORIGIN = self.location.origin;

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
    { name: 'Proxy', file: 'db_Proxy.json' }
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

async function readDB(workId, dbName) {
  const map = {
    Primary: 'db_Primary.json',
    Secondary: 'db_Secondary.json',
    SemiPrimary: 'db_SemiPrimary.json',
    SelfSecondary: 'db_SelfSecondary.json',
    Proxy: 'db_Proxy.json'
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
    const works = Object.keys(g.CreationWorks || {});
    const out = [];
    for (const wk of works) {
      const workId = wk; // already '#Works_*'
      const meta = await readWorkMeta(workId);
      const mergedVars = deepMerge(g?.General?.$VarsDef ?? {}, meta?.General?.$VarsDef ?? {});
      const indices = buildEnrichmentIndices(mergedVars, meta);
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
    const meta = await readWorkMeta(workId);
    const mergedVars = deepMerge(g?.General?.$VarsDef ?? {}, meta?.General?.$VarsDef ?? {});
    const indexes = extractDefIndexes(mergedVars);
    return jsonResponse({ work: workId, $VarsDefMerged: mergedVars, indexes });
  }

  // /api/v1/works/{work}
  if (seg.length === 2 && seg[0] === 'works') {
    const workId = toWorkKey(seg[1]);
    const meta = await readWorkMeta(workId);
    if (!resolve) return jsonResponse({ work: workId, meta });
    const g = await readGlobalMeta();
    const mergedVars = deepMerge(g?.General?.$VarsDef ?? {}, meta?.General?.$VarsDef ?? {});
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
      const g = await readGlobalMeta();
      const meta = await readWorkMeta(workId);
      const mergedVars = deepMerge(g?.General?.$VarsDef ?? {}, meta?.General?.$VarsDef ?? {});
      const indices = buildEnrichmentIndices(mergedVars, meta);
      data = await resolveAllInAny(data, indices);
    }
    const payload = { work: workId, db: dbName, records: data, resolved: resolve };
    if (includeVars) {
      const g = await readGlobalMeta();
      const meta = await readWorkMeta(workId);
      payload.$VarsDefMerged = deepMerge(g?.General?.$VarsDef ?? {}, meta?.General?.$VarsDef ?? {});
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
      const g = await readGlobalMeta();
      const meta = await readWorkMeta(workId);
      const mergedVars = deepMerge(g?.General?.$VarsDef ?? {}, meta?.General?.$VarsDef ?? {});
      const indices = buildEnrichmentIndices(mergedVars, meta);
      matched = await resolveAllInAny(matched, indices);
    }
    const payload = { work: workId, db: dbName, queries, count: matched.length, records: matched, resolved: resolve };
    if (includeVars) {
      const g = await readGlobalMeta();
      const meta = await readWorkMeta(workId);
      payload.$VarsDefMerged = deepMerge(g?.General?.$VarsDef ?? {}, meta?.General?.$VarsDef ?? {});
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
  const listLinks = {};
  const enumLinks = {};
  walkDefs(varsDef, (path, key, val) => {
    if (key.startsWith('#Enum_')) enums[path.join('.') + '.' + key] = val;
    if (key.startsWith('#ListLink_')) listLinks[path.join('.') + '.' + key] = val;
    if (key.startsWith('$EnumLink_')) enumLinks[path.join('.') + '.' + key] = val;
  });
  return { enums, listLinks, enumLinks };
}

function walkDefs(obj, cb, path = []) {
  if (!isObject(obj)) return;
  for (const [k, v] of Object.entries(obj)) {
    cb(path, k, v);
    if (isObject(v)) walkDefs(v, cb, [...path, k]);
  }
}

function buildEnrichmentIndices(varsDef, workMeta) {
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
    spetialPatternByValue: {}
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

  // RaceType
  const races = varsDef?.['#Enum_RaceType'];
  if (Array.isArray(races)) for (const r of races) if (r?.RaceType) idx.raceTypeByValue[r.RaceType] = r;

  // Belonging / Area
  const belong = varsDef?.$Def_Belonging?.['#Enum_Belonging'];
  if (Array.isArray(belong)) for (const b of belong) if (b?.Belonging) idx.belongingByValue[b.Belonging] = b;
  const areas = varsDef?.$Def_Belonging?.['#Enum_Area'];
  if (Array.isArray(areas)) for (const a of areas) if (a?.Area) idx.areaByValue[a.Area] = a;

  // Month
  const months = varsDef?.$Def_Day?.['#Enum_Month'] || varsDef?.['#Enum_Month'];
  if (Array.isArray(months)) for (const m of months) if (m?.Month != null) idx.monthByNum[Number(m.Month)] = m;

  // RelationLabel (NumberTales)
  const relLabels = varsDef?.$Def_Relation?.['#Enum_RelationLabel'];
  if (Array.isArray(relLabels)) for (const r of relLabels) if (r?.RelationLabel) idx.relationLabelByValue[r.RelationLabel] = r;

  // FLInvestigator78 lists in $VarsDef
  const materials = varsDef?.$Def_ArcanumspecStats?.$Def_SpecType?.$Def_MaterialType?.['#List_Material'];
  if (Array.isArray(materials)) for (const m of materials) if (m?.Material) idx.materialByValue[m.Material] = m;
  const kinstat = varsDef?.$Def_ArcanumspecStats?.$Def_SpecType?.$Def_ActionType?.['#List_KinematicOrStatic'];
  if (Array.isArray(kinstat)) for (const ks of kinstat) if (ks?.KinematicOrStatic) idx.kinStatByValue[ks.KinematicOrStatic] = ks;
  const roletypes = varsDef?.$Def_ArcanumspecStats?.$Def_SpecType?.$Def_ActionType?.['#List_RoleType'];
  if (Array.isArray(roletypes)) for (const r of roletypes) if (r?.RoleType) idx.roleTypeByValue[r.RoleType] = r;
  const dualize = varsDef?.$Def_ArcanumspecStats?.$Def_SpecType?.['#List_DualizePattern'];
  if (Array.isArray(dualize)) for (const d of dualize) if (d?.Pattern) idx.dualizePatternByValue[d.Pattern] = d;
  const spPtn = varsDef?.$Def_ArcanumspecStats?.$Def_SpetialPattern?.['#Enum_SpetialPattern']
    || varsDef?.$Def_NumerospecStats?.$Def_SpetialPattern?.['#Enum_SpetialPattern']
    || varsDef?.$Def_BeastspecStats?.$Def_SpetialPattern?.['#Enum_SpetialPattern'];
  if (Array.isArray(spPtn)) for (const p of spPtn) if (typeof p === 'string') idx.spetialPatternByValue[p] = { SpetialPattern: p };

  // Work meta _Commons based #List_* (Stoat/Lunar/Beastなど)
  try {
    const commons = workMeta?.Databases?.['#DB_Primary']?._Commons || {};
    if (Array.isArray(commons['#List_Stoat'])) for (const s of commons['#List_Stoat']) if (s?.Stoat) idx.stoatByValue[s.Stoat] = s;
    if (Array.isArray(commons['#List_Lunar'])) for (const l of commons['#List_Lunar']) if (l?.Lunar) idx.lunarByValue[l.Lunar] = l;
    if (Array.isArray(commons['#List_Beast'])) for (const b2 of commons['#List_Beast']) if (b2?.Beast) idx.beastByValue[b2.Beast] = b2;
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
    const m = idx.monthByNum[node.Day.Month];
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
    if (Array.isArray(node.SpecType.MaterialType)) node.SpecType.MaterialType_Resolved = resolveArrayBy(node.SpecType.MaterialType, idx.materialByValue, 'Material');
    if (node.SpecType.ActionType) {
      const a = node.SpecType.ActionType;
      if (a.KinematicOrStatic) a.KinematicOrStatic_Resolved = resolveSingleBy(a.KinematicOrStatic, idx.kinStatByValue);
      if (a.RoleType) a.RoleType_Resolved = resolveSingleBy(a.RoleType, idx.roleTypeByValue);
    }
    if (node.SpecType.DualizePattern && node.SpecType.DualizePattern.Pattern) node.SpecType.DualizePattern_Resolved = resolveSingleBy(node.SpecType.DualizePattern.Pattern, idx.dualizePatternByValue);
  }
  if (node.SpetialPattern) {
    if (Array.isArray(node.SpetialPattern)) node.SpetialPattern_Resolved = resolveArrayBy(node.SpetialPattern, idx.spetialPatternByValue);
    else if (typeof node.SpetialPattern === 'string') node.SpetialPattern_Resolved = resolveSingleBy(node.SpetialPattern, idx.spetialPatternByValue);
  }
  // PastDivers: Lunar list
  if (typeof node.Lunar === 'string' && idx.lunarByValue[node.Lunar]) node.Lunar_Resolved = idx.lunarByValue[node.Lunar];
  // ShouArRiders: Beast list
  if (typeof node.Beast === 'string' && idx.beastByValue[node.Beast]) node.Beast_Resolved = idx.beastByValue[node.Beast];
}
