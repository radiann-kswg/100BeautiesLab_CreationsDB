// Characters page: fetch from /api/v1 and render list/detail

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// Ensure SW for /api is installed so that /api/v1/* works on GitHub Pages
async function ensureApiSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/api/sw.js', { scope: '/api/' });
    await navigator.serviceWorker.ready;
    // console.debug('API SW ready', reg.scope);
  } catch (_) {
    // no-op; fetch will 404 on GH Pages if SW not available
  }
}

function getQS() {
  const p = new URLSearchParams(location.search);
  return {
    work: p.get('work') || '',
    db: p.get('db') || '',
    num: p.get('num') || '',
    q: p.get('q') || ''
  };
}

function setQS(next) {
  const cur = getQS();
  const qs = new URLSearchParams({ ...cur, ...next });
  history.replaceState(null, '', `${location.pathname}?${qs.toString()}`);
}

function api(url) { return url; }

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function listWorks() {
  return fetchJSON(api('/api/v1/works'));
}

async function listWorkDBs(workKey) {
  const w = normalizeWorkKey(workKey);
  const r = await fetchJSON(api(`/api/v1/works/${encodeURIComponent(w)}/db`));
  return r.databases || [];
}

async function fetchDB(workKey, dbName, { resolve = true, debug = false } = {}) {
  const w = normalizeWorkKey(workKey);
  const u = new URL(api(`/api/v1/works/${encodeURIComponent(w)}/db/${encodeURIComponent(dbName)}`), location.origin);
  if (resolve) u.searchParams.set('resolve', '1');
  if (debug) u.searchParams.set('debug', '1');
  return fetchJSON(u.toString());
}

function normalizeWorkKey(id) {
  if (!id) return id;
  if (id.startsWith('#Works_')) return id;
  if (id.startsWith('Works_')) return `#${id}`;
  return `#Works_${id}`;
}

function el(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.substring(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    if (typeof c === 'string') e.appendChild(document.createTextNode(c)); else e.appendChild(c);
  }
  return e;
}

function humanWorkLabel(work) {
  const t = work.Title || work.Title_EN || work.key || '';
  return `${t} (${work.key.replace('#Works_', '')})`;
}

function imageFromRecord(workId, rec) {
  const wdir = workId.replace('#Works_', 'Works_');
  const img = rec.Images || {};
  // Try common patterns
  if (img.concept_PNGName) return `/data/${wdir}/Images/Primary/concept/${img.concept_PNGName}.png`;
  if (img.design_PNGName) return `/data/${wdir}/Images/Primary/design/${img.design_PNGName}.png`;
  if (Array.isArray(img.corefolder_PNGPath) && img.corefolder_PNGPath[0]) return `/data/${wdir}/Images/Primary/corefolder/${img.corefolder_PNGPath[0]}.png`;
  // Proxies
  if (img.General && img.General.poster) return `/data/${wdir}/Images/General/${img.General.poster}`;
  return '';
}

function str(v) { return (v == null ? '' : String(v)); }

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

function renderList(records, workId, onOpen) {
  const list = $('#list');
  list.innerHTML = '';
  let shown = 0;
  const qs = getQS();
  const filter = (qs.q || $('#search-input').value || '').trim();
  for (const r of records) {
    if (!matchFilter(r, filter)) continue;
    shown++;
    const img = imageFromRecord(workId, r);
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

function kvTable(obj, entries) {
  const rows = entries.filter(Boolean).map(([k, v]) => el('tr', {}, [ el('th', {}, [k]), el('td', {}, [v ?? '']) ]));
  return el('table', { class: 'kv-table' }, rows);
}

function renderDetail(workId, rec) {
  $('#detail-title').textContent = rec.Name ? `${rec.Name}${rec.Num != null ? `（${rec.Num}）` : ''}` : (rec.FormalName || rec.ModelName || rec.Name_EN || '詳細');
  const mount = $('#detail');
  mount.innerHTML = '';
  const poster = imageFromRecord(workId, rec);
  const left = el('div', {}, [ poster ? el('img', { class: 'poster', src: poster, alt: 'poster' }) : el('div', { class: 'poster' }) ]);

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
  const days = Array.isArray(rec.AnivDay) ? rec.AnivDay.map(d => `${d.Day ? `${d.Day.Month}/${d.Day.DayOfMonth}` : ''}${d.DayAbout ? ` ${d.DayAbout}` : ''}`) : [];

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
    rec.Summary ? el('div', { class: 'section' }, [el('h3', {}, ['概要']), el('div', {}, [rec.Summary.split('\n').map(s => el('p', {}, [s]))])]) : null,
    rec.Relation && (rec.Relation.Related || rec.Relation.Commented) ? renderRelations(rec.Relation) : null
  ].filter(Boolean));

  mount.appendChild(el('div', { class: 'detail' }, [left, right]));
}

function renderRelations(rel) {
  const related = Array.isArray(rel.Related) ? rel.Related : [];
  const commented = Array.isArray(rel.Commented) ? rel.Commented : [];
  const r1 = related.map(r => el('div', { class: 'tag' }, [`→ ${r.Num}: ${(r.RelationLabel || []).join(', ')} ${r.Comments ? `- ${r.Comments}` : ''}`]));
  const r2 = commented.map(r => el('div', { class: 'tag' }, [`← ${r.Num}: ${r.Comments || ''}`]));
  return el('div', { class: 'section' }, [el('h3', {}, ['関係'] ), el('div', { class: 'kv-grid' }, [...r1, ...r2])]);
}

function wireControls() {
  $('#select-work').addEventListener('change', async (e) => {
    const wk = e.target.value;
    setQS({ work: wk.replace('#', ''), db: '', num: '' });
    await populateDBs(wk);
    await reload();
  });
  $('#select-db').addEventListener('change', async (e) => {
    const db = e.target.value;
    setQS({ db, num: '' });
    await reload();
  });
  $('#search-input').addEventListener('input', () => {
    setQS({ q: $('#search-input').value });
    filterListOnly();
  });
  $('#chk-resolve').addEventListener('change', reload);
  $('#chk-debug').addEventListener('change', reload);
  $('#btn-back').addEventListener('click', () => {
    $('#detail-view').hidden = true;
    $('#list-view').hidden = false;
    setQS({ num: '' });
  });
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
  await ensureApiSW();
  wireControls();
  const qs = getQS();
  const wk = await populateWorks(qs.work);
  await populateDBs(wk, qs.db || 'Primary');
  await reload();
}

window.addEventListener('load', main);
