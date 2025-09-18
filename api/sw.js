// Service Worker: static API router for GitHub Pages
// - Intercepts /api/v1/* requests
// - Reads JSON from /data/** and returns pseudo-API responses

const API_PREFIX = '/api/v1';
const CACHE_NAME = '100bl-api-v1';
const ORIGIN = self.location.origin;

self.addEventListener('install', (e) => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

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

  // /api/v1/works/{work}
  if (seg.length === 2 && seg[0] === 'works') {
    const workId = toWorkKey(seg[1]);
    const meta = await readWorkMeta(workId);
    return jsonResponse({ work: workId, meta });
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
    const data = await readDB(workId, dbName);
    return jsonResponse({ work: workId, db: dbName, records: data });
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
    const records = await readDB(workId, dbName);
    const queries = hashTag.map((h, i) => ({ hashTag: h, key: key[i] }));
    const matched = searchRecords(records, queries);
    return jsonResponse({ work: workId, db: dbName, queries, count: matched.length, records: matched });
  }

  return notFound('Unknown API path');
}
