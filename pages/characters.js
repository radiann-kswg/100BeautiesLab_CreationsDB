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
 * DB名から「二次創作（Secondary系）」文脈かを推定
 * - isForSecondary フィールドの表示切替に使用
 * @param {string} dbName
 * @returns {boolean}
 */
function isSecondaryDbName(dbName) {
  const n = String(dbName || '').toLowerCase();
  if (!n) return false;
  // SemiPrimary は一次創作に準ずる扱いなので除外
  if (n.includes('semiprimary')) return false;
  return n.includes('secondary');
}

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

// SW 初期化の失敗ログはリロードで流れやすいため、sessionStorage に退避して次回表示できるようにする
const SW_INIT_ERROR_KEY = '100bl.lastSwInitError';

/**
 * SW 初期化失敗の情報を sessionStorage に保存
 * @param {string} stage - 'primary' | 'fallback-svc' | 'fallback-api' | etc
 * @param {any} info
 */
function rememberSwInitError(stage, info) {
  try {
    const payload = {
      time: new Date().toISOString(),
      stage: String(stage || '').trim() || 'unknown',
      href: String(location?.href || ''),
      origin: String(location?.origin || ''),
      protocol: String(location?.protocol || ''),
      info
    };
    sessionStorage.setItem(SW_INIT_ERROR_KEY, JSON.stringify(payload));
  } catch {
    // no-op
  }
}

/**
 * 前回のSW初期化失敗ログをコンソールへ再出力（引用できるようにする）
 */
function replayRememberedSwInitError() {
  try {
    const raw = sessionStorage.getItem(SW_INIT_ERROR_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw);
    // 1回は必ず目立つ形で出す（ただし勝手に消さない）
    console.warn('🧾 前回のService Worker初期化失敗ログ（引用用）:', payload);
  } catch {
    // no-op
  }
}

function clearRememberedSwInitError() {
  try { sessionStorage.removeItem(SW_INIT_ERROR_KEY); } catch { /* no-op */ }
}

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

  // Service Worker は secure context（https or localhost）でのみ有効
  // - file:// などでは必ず失敗するため、早めに理由を出す
  try {
    const p = String(location?.protocol || '');
    if (p && p !== 'https:' && p !== 'http:') {
      const err = new Error(`Unsupported protocol for Service Worker: ${p}`);
      rememberSwInitError('precheck', { message: err.message, name: err.name, stack: err.stack });
      console.warn('🚫 Service Worker はこのプロトコルでは利用できません:', p);
      throw err;
    }
  } catch (e) {
    // throw された場合は呼び元に伝播
    throw e;
  }

  const CONTROLLER_RELOAD_FLAG = '100bl.swControllerReloaded';

  /**
   * active な SW に対して clients.claim() を再実行するよう依頼
   * - controller が付かない環境の救済
   */
  const requestClaimClients = async (label) => {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg?.active) {
        console.warn(`📨 SWに clients.claim() を依頼します: ${label || ''}`.trim());
        reg.active.postMessage({ type: '100bl.claimClients', label: String(label || '') });
      }
    } catch {
      // no-op
    }
  };

  /**
   * controller が付与されない環境向けに、SW ready 後すぐに claim を依頼しつつ段階的に待機する
   * @param {string} baseLabel
   */
  const ensureControlledBySw = async (baseLabel) => {
    if (navigator.serviceWorker.controller) return;

    // 先に claim を依頼して、短い待機で controllerchange を待つ（15s待ちを回避）
    await requestClaimClients(`${baseLabel}/after-ready`);
    try {
      await waitForController(2000);
      return;
    } catch (e) {
      const msg = String(e?.message || e || '');
      if (!msg.includes('controller timeout')) throw e;
    }

    if (navigator.serviceWorker.controller) return;

    // それでもダメならもう一度 claim して、少し長めに待つ
    await requestClaimClients(`${baseLabel}/retry`);
    await waitForController(8000);
  };

  console.log('🔧 Service Worker の登録を試行中...');

  try {
    // 1) /pages/v1, /svc/v1, /api/v1 をインターセプトするページスコープ SW を登録
    const pageSwUrl = new URL('./sw.js', location.href).toString();
    const pageScope = new URL('./', location.href).pathname; // '/pages/'
    console.log(`🌐 プライマリ SW を登録: ${pageSwUrl} (スコープ: ${pageScope})`);
    const reg = await navigator.serviceWorker.register(pageSwUrl, { scope: pageScope });
    console.log('✅ プライマリ SW の登録に成功');
    // ブラウザが SW スクリプトを強くキャッシュしている場合に備え、更新を促す
    try { await reg.update(); } catch (_) { /* no-op */ }
    API_BASE_REL = '../pages/';
    await navigator.serviceWorker.ready; // アクティベーションを待機
    console.log('✅ プライマリ SW の準備完了');
    // フェッチを開始する前にこのページが制御されることを保証
    // - controller が付かないケースでは、SWに claim を依頼して再試行する
    await ensureControlledBySw('primary');
    if (!navigator.serviceWorker.controller) throw new Error('Primary SW is ready but did not take control of this page');
    console.log('✅ プライマリ SW がページを制御中');

    // 成功したら、前回エラーの退避はクリア
    clearRememberedSwInitError();

    // 成功したら、リロード済みフラグは解除
    try { sessionStorage.removeItem(CONTROLLER_RELOAD_FLAG); } catch (_) { /* no-op */ }
  } catch (err) {
    console.warn('❌ プライマリ SW の登録に失敗:', err);
    rememberSwInitError('primary', {
      message: String(err?.message || err || ''),
      name: String(err?.name || ''),
      stack: String(err?.stack || ''),
      pageSwUrl: (() => { try { return new URL('./sw.js', location.href).toString(); } catch { return ''; } })(),
      pageScope: (() => { try { return new URL('./', location.href).pathname; } catch { return ''; } })(),
    });

    // キャッシュの消去＋ハードリロード等では、その1回のナビゲーションがSW制御されないことがある。
    // この場合、次の通常リロードで controller が付与されるため、1回だけ自動リロードして復旧する。
    const msg = String(err?.message || err || '');
    if (msg.includes('controller timeout') || msg.includes('did not take control')) {
      let alreadyReloaded = false;
      try { alreadyReloaded = sessionStorage.getItem(CONTROLLER_RELOAD_FLAG) === '1'; } catch (_) { /* no-op */ }

      if (!alreadyReloaded) {
        try { sessionStorage.setItem(CONTROLLER_RELOAD_FLAG, '1'); } catch (_) { /* no-op */ }
        console.warn('🔁 SW controller が取得できないため、通常リロードで復旧を試行します');
        location.reload();
        throw new Error('SW_CONTROLLER_RELOAD');
      }
    }

    // このページが SW に制御されない限り /pages/v1/* は解決できないため、
    // controller 系の失敗はフォールバックしても回復しない（スコープが一致しない）
    if (msg.includes('controller timeout') || msg.includes('did not take control')) {
      throw err;
    }
    try {
      // 2) /svc へのフォールバック（エイリアスパス）
      const svcSwUrl = new URL('../svc/sw.js', location.href).toString();
      const svcScope = new URL('../svc/', location.href).pathname;
      console.log(`🌐 フォールバック SW を登録: ${svcSwUrl} (スコープ: ${svcScope})`);
      const reg2 = await navigator.serviceWorker.register(svcSwUrl, { scope: svcScope });
      console.log('✅ フォールバック SW の登録に成功');
      try { await reg2.update(); } catch (_) { /* no-op */ }
      API_BASE_REL = '../svc/';
      await navigator.serviceWorker.ready;
      console.log('✅ フォールバック SW の準備完了');
      await waitForController();
      if (!navigator.serviceWorker.controller) throw new Error('Fallback SW is ready but did not take control of this page');
      console.log('✅ フォールバック SW がページを制御中');

      clearRememberedSwInitError();
    } catch (err2) {
      console.warn('❌ フォールバック SW の登録に失敗:', err2);
      rememberSwInitError('fallback-svc', {
        message: String(err2?.message || err2 || ''),
        name: String(err2?.name || ''),
        stack: String(err2?.stack || ''),
        svcSwUrl: (() => { try { return new URL('../svc/sw.js', location.href).toString(); } catch { return ''; } })(),
        svcScope: (() => { try { return new URL('../svc/', location.href).pathname; } catch { return ''; } })(),
      });
      try {
        // 3) /api への最終フォールバック
        const apiSwUrl = new URL('../api/sw.js', location.href).toString();
        const apiScope = new URL('../api/', location.href).pathname;
        console.log(`🌐 最終フォールバック SW を登録: ${apiSwUrl} (スコープ: ${apiScope})`);
        const reg3 = await navigator.serviceWorker.register(apiSwUrl, { scope: apiScope });
        console.log('✅ 最終フォールバック SW の登録に成功');
        try { await reg3.update(); } catch (_) { /* no-op */ }
        API_BASE_REL = '../api/';
        await navigator.serviceWorker.ready;
        console.log('✅ 最終フォールバック SW の準備完了');
        await waitForController();
        if (!navigator.serviceWorker.controller) throw new Error('Last-resort SW is ready but did not take control of this page');
        console.log('✅ 最終フォールバック SW がページを制御中');

        clearRememberedSwInitError();
      } catch (err3) {
        console.error('❌ すべての SW 登録試行が失敗:', err3);
        rememberSwInitError('fallback-api', {
          message: String(err3?.message || err3 || ''),
          name: String(err3?.name || ''),
          stack: String(err3?.stack || ''),
          apiSwUrl: (() => { try { return new URL('../api/sw.js', location.href).toString(); } catch { return ''; } })(),
          apiScope: (() => { try { return new URL('../api/', location.href).pathname; } catch { return ''; } })(),
        });
        // SW が利用できない場合、/pages/v1 は静的ホスティングでは 404 になるため、ここで失敗として扱う
        throw err3;
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
    // 汎用インデックス直リンク（作品ごとの $IndexDef に対応）
    idx: p.get('idx') || '',
    idxKey: p.get('idxKey') || '',
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
function waitForController(timeoutMs = 15000) {
  if (navigator.serviceWorker.controller) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let done = false;

    /** @type {ReturnType<typeof setTimeout>|null} */
    let to = null;

    const cleanup = () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };

    const onControllerChange = () => {
      if (done) return;
      if (!navigator.serviceWorker.controller) return;
      done = true;
      if (to != null) clearTimeout(to);
      cleanup();
      resolve();
    };

    // レース対策: リスナーを先に登録してから controller を再チェック
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    if (navigator.serviceWorker.controller) {
      done = true;
      cleanup();
      resolve();
      return;
    }

    to = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error(`Service Worker controller timeout after ${timeoutMs}ms`));
    }, timeoutMs);
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
    // Only append trusted DOM Nodes directly; everything else becomes text
    if (child instanceof Node) {
      e.appendChild(child);
      return;
    }
    const t = typeof child;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      e.appendChild(document.createTextNode(String(child)));
      return;
    }
    // Fallback: render other types as text to avoid interpreting them as HTML
    e.appendChild(document.createTextNode(String(child)));
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
    return {};
  }
}

/**
 * Fetch global type definitions from ./data/db_type.json
 * @returns {Promise<Object>} Global type definitions
 */
async function fetchGlobalTypeDef() {
  // NOTE: キャッシュが「空」や「異形（古いSWのレスポンス等）」を掴んでいると
  // fieldTypeMap が作れず、GenderType などがコード表示に退避してしまう。
  // 期待形（$DefType 配列 or global 配列）でない場合は自動で再フェッチする。
  const isValid = (obj) => {
    if (!obj || typeof obj !== 'object') return false;
    if (Array.isArray(obj?.$DefType)) return true;
    if (Array.isArray(obj?.typedef?.$DefType)) return true;
    if (Array.isArray(obj?.global)) return true;
    return false;
  };

  if (globalTypeDefCache && isValid(globalTypeDefCache)) return globalTypeDefCache;
  // 無効キャッシュは破棄して再取得
  globalTypeDefCache = null;

  const u = new URL(api('v1/typedef/global'));
  try {
    const res = await fetchJSON(u.toString());
    console.log('🌐 Global TypeDef response:', res);
    globalTypeDefCache = (res && typeof res === 'object') ? res : {};
    return globalTypeDefCache;
  } catch (error) {
    console.warn('⚠️ Failed to fetch global type def:', error.message);
    return {};
  }
}

/**
 * Fetch global definition types (enum definitions, etc.)
 * @returns {Promise<Object>} Global definition types
 */
async function fetchGlobalDefType() {
  // NOTE: v1/deftype/global は「db_meta.json（辞書）」を返す。
  // 古いSWやブラウザキャッシュで typedef（db_type.json）を掴むと、
  // $EnumDef/#ListIndex の表示名解決ができずコード表示に退避する。
  // 期待形（General.$VarsDef が存在）でない場合は自動で再フェッチする。
  const isValid = (obj) => {
    const vars = obj?.General?.$VarsDef;
    if (!vars || typeof vars !== 'object' || Array.isArray(vars)) return false;

    // NOTE:
    // 以前は「$EnumDef_ / #List_ が何か1つでもあればOK」だったが、
    // 誤って “別のメタ（例: 作品別 meta の #List_* だけ）” を掴んだ場合でも true になり得た。
    // その状態でキャッシュされると、GenderType の辞書（$EnumDef_GenderType）が無く、
    // 「性別だけ FemaleNeutral のまま残る」現象が発生する。
    const hasGenderEnum = (() => {
      const def = vars?.$EnumDef_GenderType;
      return !!def && typeof def === 'object' && !Array.isArray(def);
    })();
    if (hasGenderEnum) return true;

    // 後方互換の最低条件: enum/list キーが存在する（ただし上記が無ければ invalid 扱い）
    return false;
  };

  /**
   * SW/キャッシュの揺れ（{meta:{...}} など）を吸収して「辞書本体」を取り出す
   * @param {any} res
   */
  const unwrap = (res) => {
    if (!res || typeof res !== 'object') return {};
    if (isValid(res)) return res;

    // よくあるラッパー形式
    const candidates = [
      res.meta,
      res.deftype,
      res.defType,
      res.def_type,
      res.data,
    ];
    for (const c of candidates) {
      if (isValid(c)) return c;
    }
    return res;
  };

  /**
   * API経由の辞書取得が壊れている場合の最終フォールバック:
   * pages/characters.html から見て ../data/db_meta.json を「直 fetch」する。
   * - SW/広告ブロッカー/キャッシュの揺れで /pages/v1/deftype/global が期待形でないケースの救済
   * - cache:'no-store' で古い辞書を掴みにくくする
   */
  const fetchDirectDbMeta = async () => {
    const directUrl = new URL('../data/db_meta.json', location.href).toString();
    try {
      const res = await fetch(directUrl, {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} ${directUrl}`);
      const json = await res.json();
      const unwrapped = unwrap(json);
      if (isValid(unwrapped)) {
        console.warn('🛟 fetchGlobalDefType: recovered via direct /data/db_meta.json fetch');
        return unwrapped;
      }
    } catch (e) {
      console.warn('⚠️ fetchGlobalDefType: direct /data/db_meta.json fetch failed:', e?.message || e);
    }
    return {};
  };

  if (globalDefTypeCache && isValid(globalDefTypeCache)) return globalDefTypeCache;
  // 無効キャッシュは破棄して再取得
  globalDefTypeCache = null;

  const u = new URL(api('v1/deftype/global'));
  try {
    const res = await fetchJSON(u.toString());
    const unwrapped = unwrap(res);
    if (isValid(unwrapped)) {
      globalDefTypeCache = unwrapped;
      return globalDefTypeCache;
    }

    // APIレスポンスが期待形でない場合は直 fetch で救済
    const recovered = await fetchDirectDbMeta();
    globalDefTypeCache = recovered;
    return globalDefTypeCache;
  } catch (error) {
    console.warn('⚠️ Failed to fetch global def type:', error.message);
    globalDefTypeCache = await fetchDirectDbMeta();
    return globalDefTypeCache;
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

  const norm = String(dbName || '').replace(/^#?DB_/i, '');
  const dbKey = norm ? `#DB_${norm.charAt(0).toUpperCase()}${norm.slice(1)}` : '';
  const dbMeta = workMeta.Databases[dbKey];
  if (!dbMeta) return records;

  const commons = dbMeta._Commons || null;
  const secDefs = dbMeta._Secondaries || dbMeta.Secondaries || null;

  // SW 側の CommonsProcessor と同等の「空値」判定に寄せる
  // - undefined/null/空文字/空配列/空オブジェクトは未設定扱い
  // - { hideText: '...' } は意図的マスクなので空扱いしない
  const isEmptyForCommons = (v) => {
    if (v === null || typeof v === 'undefined') return true;
    if (v === '') return true;
    if (Array.isArray(v)) return v.length === 0;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (typeof v.hideText === 'string' && v.hideText) return false;
      return Object.keys(v).length === 0;
    }
    return false;
  };

  return records.map(record => {
    const enriched = { ...record };

    // Secondary系: sec_SeriesTitle（等）で _Secondaries[] を参照し、シリーズ別の _Commons を適用
    // - def側の値が null/undefined/'' の場合は「条件なし」とみなす
    const findSecondaryCommons = () => {
      if (!Array.isArray(secDefs)) return null;

      const normStr = (v) => (v === null || typeof v === 'undefined') ? '' : String(v);
      const getDef = (def, keys) => {
        for (const k of keys) {
          if (!k) continue;
          if (Object.prototype.hasOwnProperty.call(def, k)) return def[k];
        }
        return undefined;
      };

      const criteriaDefs = [
        {
          primary: true,
          defKeys: ['sec_SeriesTitle', 'SecondarySeriesTitle'],
          recKeys: ['sec_SeriesTitle', 'SecondarySeriesTitle']
        },
        {
          primary: false,
          defKeys: ['sec_Category', 'SecondaryCategory'],
          recKeys: ['sec_Category', 'SecondaryCategory']
        },
        {
          primary: false,
          defKeys: ['sec_DesignedBy', 'SecondaryDesignedBy'],
          recKeys: ['sec_DesignedBy', 'SecondaryDesignedBy']
        }
      ];

      let best = null;
      let bestScore = -1;

      for (const def of secDefs) {
        if (!def || typeof def !== 'object') continue;
        if (!def._Commons || typeof def._Commons !== 'object') continue;

        let score = 0;
        let ok = true;
        for (const c of criteriaDefs) {
          const defVal = getDef(def, c.defKeys);
          if (defVal === null || typeof defVal === 'undefined' || normStr(defVal).trim() === '') continue;

          const recVal = c.recKeys.map(k => enriched[k]).find(v => v !== null && typeof v !== 'undefined');
          if (normStr(recVal) !== normStr(defVal)) {
            ok = false;
            break;
          }
          score += c.primary ? 10 : 1;
        }
        if (!ok) continue;

        if (score > bestScore) {
          bestScore = score;
          best = def._Commons;
        }
      }
      return best;
    };

    const secCommons = findSecondaryCommons();
    const defaults = { ...(commons || {}), ...(secCommons || {}) };

    // Apply Commons values for missing fields
    Object.entries(defaults).forEach(([key, value]) => {
      // メタ定義（#List_* 等）や制御キー（_ListLinkIf_* 等）は、レコード値として混入させない
      // - SW 側の CommonsProcessor と同じ安全側ルール
      if (String(key).startsWith('#') || String(key).startsWith('_')) return;
      if (typeof enriched[key] === 'undefined' || isEmptyForCommons(enriched[key])) {
        enriched[key] = value;
      }
    });

    return enriched;
  });
}

/**
 * 作品ごとの Index 定義を取得
 * - 既定: work typedef（db_type.json）の `$IndexDef`
 * - 後方互換: global meta（data/db_meta.json）の `$DefType_Index` / `$Def_Index`
 * @param {string} workKey - Work identifier
 * @param {Object} globalMeta - Global metadata object
 * @returns {Object|null} Index field definition or null
 */
function getWorkIndexField(workKey, globalMeta) {
  try {
    const state = window.__CHAR_STATE__;
    if (state && state.workId === workKey) {
      const wtd = state.workTypeDef;
      if (wtd && typeof wtd === 'object' && wtd.$IndexDef && typeof wtd.$IndexDef === 'object') {
        return wtd.$IndexDef;
      }
    }
  } catch {
    // noop
  }

  if (!globalMeta || !globalMeta.CreationWorks) return null;
  const workMeta = globalMeta.CreationWorks[workKey];
  if (!workMeta) return null;
  return workMeta.$DefType_Index || workMeta.$Def_Index || null;
}

/**
 * Index 定義からラベルを取得
 * @param {Object} def - $IndexDef もしくはその子要素
 * @returns {string} 表示用ラベル（日本語優先）
 */
function getIndexLabel(def) {
  if (!def || typeof def !== 'object') return '';
  return (
    def.hashTagName_JP ||
    def.hashTag_JP ||
    def.hashtag_JP ||
    def.hashTagName_EN ||
    def.hashTag ||
    ''
  );
}

/**
 * Index 定義から子フィールド定義配列を取得（$type / $valType の揺れを吸収）
 * @param {Object} indexDef - $IndexDef
 * @returns {Array|null}
 */
function getIndexSubDefs(indexDef) {
  if (!indexDef || typeof indexDef !== 'object') return null;
  if (Array.isArray(indexDef.$type)) return indexDef.$type;
  if (Array.isArray(indexDef.$valType)) return indexDef.$valType;
  return null;
}

/**
 * Index 定義から「主要」サブフィールドを推定
 * - typedef の $type から #Number/#ListIndex を優先
 * @param {Array} subDefs - indexDef.$type の配列
 * @returns {Object|null}
 */
function pickPrimaryIndexSubDef(subDefs) {
  if (!Array.isArray(subDefs) || subDefs.length === 0) return null;

  const score = (d) => {
    if (!d || typeof d !== 'object') return -1;
    const t = d.$type ?? d.$valType;
    const tStr = typeof t === 'string' ? t : JSON.stringify(t);
    if (tStr && tStr.includes('#Number')) return 30;
    if (tStr && tStr.includes('#ListIndex')) return 20;
    if (tStr && tStr.includes('#String')) return 10;
    return 0;
  };

  return subDefs
    .filter(d => d && typeof d === 'object' && typeof d.hashTag === 'string')
    .slice()
    .sort((a, b) => score(b) - score(a))[0] || null;
}

/**
 * レコードと Index 定義から、直リンク用の識別子（keyPath + value）を抽出
 * @param {Object} rec - レコード
 * @param {Object|null} indexDef - $IndexDef
 * @returns {{keyPath:string,value:string}|null}
 */
function getIndexIdentifierFromRecord(rec, indexDef) {
  if (!rec || typeof rec !== 'object') return null;
  if (!indexDef || typeof indexDef !== 'object') return null;

  const rootKey = indexDef.hashTag;
  if (!rootKey || typeof rootKey !== 'string') return null;

  const subDefs = getIndexSubDefs(indexDef);
  const rootVal = rec[rootKey];

  // ネスト構造（例: Card.Num / BeastType.Beast）
  if (Array.isArray(subDefs) && subDefs.length > 0 && rootVal && typeof rootVal === 'object') {
    const primarySub = pickPrimaryIndexSubDef(subDefs);
    const candidates = primarySub ? [primarySub, ...subDefs.filter(d => d !== primarySub)] : subDefs;
    for (const sub of candidates) {
      const subKey = sub?.hashTag;
      if (!subKey || typeof subKey !== 'string') continue;
      const v = rootVal[subKey];
      const formatted = formatValueForDisplay(v, {});
      if (!formatted) continue;
      return { keyPath: `${rootKey}.${subKey}`, value: String(formatted) };
    }
    return null;
  }

  // スカラー（例: Num / Drc / Unit）
  const formatted = formatValueForDisplay(rootVal, {});
  if (!formatted) return null;
  return { keyPath: rootKey, value: String(formatted) };
}

/**
 * 直リンククエリ（idx/idxKey/num）に一致するかどうか
 * @param {Object} rec - レコード
 * @param {Object|null} indexDef - $IndexDef
 * @param {string} idxValue - クエリの値
 * @param {string} idxKeyPath - クエリのキー（任意）
 * @param {string} legacyNum - 旧 ?num= の値（任意）
 * @returns {boolean}
 */
function recordMatchesIndexQuery(rec, indexDef, idxValue, idxKeyPath, legacyNum = '') {
  const qVal = String(idxValue || '').trim();
  if (!qVal) {
    const legacy = String(legacyNum || '').trim();
    if (!legacy) return false;
    return rec && rec.Num != null && String(rec.Num) === legacy;
  }

  const id = getIndexIdentifierFromRecord(rec, indexDef);
  if (id) {
    if (idxKeyPath && id.keyPath !== idxKeyPath) return false;
    return String(id.value) === qVal;
  }

  // indexDef が無い場合の最小互換（NumberTales の ?num= など）
  return rec && rec.Num != null && String(rec.Num) === qVal;
}

/**
 * レコードと Index 定義から、一覧用のアクセントチップ文字列を生成
 * @param {Object} rec - レコード
 * @param {Object|null} indexDef - $IndexDef
 * @returns {string|null}
 */
function buildIndexChipText(rec, indexDef, metaForLookup = null, globalDefType = null) {
  if (!rec || typeof rec !== 'object') return null;
  if (!indexDef || typeof indexDef !== 'object') return null;

  const rootKey = indexDef.hashTag;
  if (!rootKey || typeof rootKey !== 'string') return null;

  const subDefs = getIndexSubDefs(indexDef);
  const rootVal = rec[rootKey];

  // ネスト構造（例: Card.Num / BeastType.Beast）
  if (Array.isArray(subDefs) && subDefs.length > 0 && rootVal && typeof rootVal === 'object') {
    const primarySub = pickPrimaryIndexSubDef(subDefs);
    const candidates = primarySub ? [primarySub, ...subDefs.filter(d => d !== primarySub)] : subDefs;
    for (const sub of candidates) {
      const subKey = sub?.hashTag;
      if (!subKey || typeof subKey !== 'string') continue;
      const v = rootVal[subKey];
      const subType = sub?.$type ?? sub?.$valType ?? null;
      const formatted = formatValueForDisplay(v, {}, metaForLookup, globalDefType, {
        schemaType: subType,
        fieldKey: `${rootKey}.${subKey}`
      });
      if (!formatted) continue;
      const label = getIndexLabel(sub) || getIndexLabel(indexDef);
      return label ? `${label}: ${formatted}` : formatted;
    }
    return null;
  }

  // スカラー（例: Num / Drc / Unit）
  const rootType = indexDef?.$type ?? indexDef?.$valType ?? null;
  const formatted = formatValueForDisplay(rootVal, {}, metaForLookup, globalDefType, {
    schemaType: rootType,
    fieldKey: rootKey
  });
  if (!formatted) return null;
  const label = getIndexLabel(indexDef);
  return label ? `${label}: ${formatted}` : formatted;
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
              label: child.hashTag_JP || child.hashtag_JP || child.hashTag,
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
          label: item.hashTag_JP || item.hashtag_JP || item.hashTag,
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
      const jpLabel = item.hashTag_JP || item.hashtag_JP;
      if (item.hashTag && jpLabel) {
        labelMap[item.hashTag] = jpLabel;
        labelMap[currentPath.join('.')] = jpLabel;

        console.log(`📝 Mapped field (${source}):`, item.hashTag, '→', jpLabel);

        // Also map short path versions for nested access
        if (currentPath.length > 1) {
          labelMap[currentPath.slice(-1)[0]] = jpLabel;
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
 * typedef（db_type.json）から、フィールドパス→$type（文字列）のマップを構築
 * - 表示整形を「フィールド名ハードコード」ではなく「定義型（$EnumDef_* / $Def_*）」に寄せるための補助
 * - work 定義を優先し、同一キーは global を上書きしない
 * @param {Array|Object} workTypeDef - 作品ごとの typedef
 * @param {Object} globalTypeDef - グローバル typedef
 * @returns {Record<string, string>}
 */
function buildFieldTypeMap(workTypeDef, globalTypeDef = {}) {
  /** @type {Record<string, string>} */
  const typeMap = {};

  const pickDefArray = (def) => {
    if (!def) return null;
    if (Array.isArray(def)) return def;
    if (Array.isArray(def?.$DefType)) return def.$DefType;
    if (Array.isArray(def?.typedef?.$DefType)) return def.typedef.$DefType;
    if (Array.isArray(def?.global)) return def.global;
    return null;
  };

  const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const normalizeTypeText = (t) => (typeof t === 'string' ? t.trim() : '');

  // 優先度: work → global（同一キーは上書きしない）
  const addFrom = (def) => {
    const arr = pickDefArray(def);
    if (!Array.isArray(arr)) return;

    // traverse が typeMap を直接書くので、上書き抑止のために一時マップで受けて merge
    /** @type {Record<string, string>} */
    const tmp = {};
    // 一時的に tmp を書き込み先にする
    // eslint-disable-next-line no-inner-declarations
    const traverseTmp = (items, path = []) => {
      if (!Array.isArray(items)) return;
      for (const item of items) {
        if (!isPlainObject(item)) continue;
        if (!item.hashTag || typeof item.hashTag !== 'string') continue;
        const currentPath = [...path, item.hashTag];
        const t = normalizeTypeText(item.$type);
        if (t) {
          const full = currentPath.join('.');
          if (!Object.prototype.hasOwnProperty.call(tmp, full)) tmp[full] = t;
          if (!Object.prototype.hasOwnProperty.call(tmp, item.hashTag)) tmp[item.hashTag] = t;
        }

        // ラッパー型（例: ExistingRarity: [{hashTag:'Rarity', $type:'$EnumDef_Rarity,$EnumLink'}]）を検出
        // - トップレベル自動表示でも enum/link 判定できるよう、親キーにも子の $type 文字列を付与する
        if (Array.isArray(item.$type) && item.$type.length === 1) {
          const child = item.$type[0];
          const childType = normalizeTypeText(child?.$type);
          if (child && typeof child?.hashTag === 'string' && childType) {
            const full = currentPath.join('.');
            if (!Object.prototype.hasOwnProperty.call(tmp, full)) tmp[full] = childType;
            if (!Object.prototype.hasOwnProperty.call(tmp, item.hashTag)) tmp[item.hashTag] = childType;
          }
        }
        if (Array.isArray(item.$type)) traverseTmp(item.$type, currentPath);
        else if (isPlainObject(item.$type)) traverseTmp([item.$type], currentPath);
      }
    };
    traverseTmp(arr, []);

    // merge（既存を上書きしない）
    for (const [k, v] of Object.entries(tmp)) {
      if (!Object.prototype.hasOwnProperty.call(typeMap, k)) typeMap[k] = v;
    }
  };

  addFrom(workTypeDef);
  addFrom(globalTypeDef);
  return typeMap;
}

/**
 * typedef（db_type.json）から、フィールドパス→$display（Object）のマップを構築
 * - 値の表示整形（unit / rankFormat 等）を typedef 駆動に寄せるための補助
 * - work 定義を優先し、同一キーは global を上書きしない
 * @param {Array|Object} workTypeDef - 作品ごとの typedef
 * @param {Object} globalTypeDef - グローバル typedef
 * @returns {Record<string, any>}
 */
function buildFieldDisplayMap(workTypeDef, globalTypeDef = {}) {
  /** @type {Record<string, any>} */
  const displayMap = {};

  const pickDefArray = (def) => {
    if (!def) return null;
    if (Array.isArray(def)) return def;
    if (Array.isArray(def?.$DefType)) return def.$DefType;
    if (Array.isArray(def?.typedef?.$DefType)) return def.typedef.$DefType;
    if (Array.isArray(def?.global)) return def.global;
    return null;
  };

  const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  /**
   * items（$DefType/$TypeDef 由来）を再帰走査して $display を抽出する
   * @param {any[]} items
   * @param {string[]} path
   * @param {Record<string, any>} out
   * @param {number} depth
   */
  const traverseDisplayItems = (items, path, out, depth = 0) => {
    if (!Array.isArray(items)) return;
    if (depth > 8) return;
    for (const item of items) {
      if (!isPlainObject(item)) continue;
      if (!item.hashTag || typeof item.hashTag !== 'string') continue;

      const currentPath = [...path, item.hashTag];
      const d = item.$display;
      if (d && typeof d === 'object') {
        const full = currentPath.join('.');
        if (!Object.prototype.hasOwnProperty.call(out, full)) out[full] = d;
        if (!Object.prototype.hasOwnProperty.call(out, item.hashTag)) out[item.hashTag] = d;
      }

      if (Array.isArray(item.$type)) traverseDisplayItems(item.$type, currentPath, out, depth + 1);
      else if (isPlainObject(item.$type)) traverseDisplayItems([item.$type], currentPath, out, depth + 1);
    }
  };

  /**
   * typedef の「型定義コンテナ」（$VarsDef / $VersDef 配下の $Def_* 等）から $display を抽出する
   * - 例: Works_NumberTales の $VersDef.$Def_Relations.$TypeDef[].$display.langMode
   * - ここで抽出した値は、少なくとも hashTag キー（例: RelationLabel）で参照できれば十分。
   * @param {any} def
   */
  const addFromTypeDefContainers = (def) => {
    if (!def || typeof def !== 'object') return;

    const varsDef = (
      (def.$VarsDef && typeof def.$VarsDef === 'object') ? def.$VarsDef
        : (def.$VersDef && typeof def.$VersDef === 'object') ? def.$VersDef
          : (def.typedef?.$VarsDef && typeof def.typedef.$VarsDef === 'object') ? def.typedef.$VarsDef
            : (def.typedef?.$VersDef && typeof def.typedef.$VersDef === 'object') ? def.typedef.$VersDef
              : null
    );
    if (!varsDef || typeof varsDef !== 'object') return;

    /** @type {Record<string, any>} */
    const tmp = {};

    const scanContainer = (container, basePath = []) => {
      if (!container || typeof container !== 'object') return;
      for (const [k, v] of Object.entries(container)) {
        if (!k || typeof k !== 'string') continue;
        if (!k.startsWith('$Def_')) continue;
        if (!v || typeof v !== 'object') continue;

        // `$Def_*` 配下の定義配列（$TypeDef / $DefType など）を走査
        const arr = Array.isArray(v.$TypeDef) ? v.$TypeDef
          : Array.isArray(v.$DefType) ? v.$DefType
            : null;
        if (Array.isArray(arr)) {
          // basePath を付けると `$Def_Relations.RelationLabel` のようなキーも作れる
          // - ただし render 側では hashTag（RelationLabel）参照も行うため、十分に効く
          traverseDisplayItems(arr, [...basePath, k], tmp);
        }

        // ネストした $Def_* がある場合も考慮（深くなり過ぎない範囲で）
        scanContainer(v, [...basePath, k]);
      }
    };

    scanContainer(varsDef, []);

    // merge（既存を上書きしない）
    for (const [k, v] of Object.entries(tmp)) {
      if (!Object.prototype.hasOwnProperty.call(displayMap, k)) displayMap[k] = v;
    }
  };

  const addFrom = (def) => {
    const arr = pickDefArray(def);
    if (!Array.isArray(arr)) return;

    const tmp = {};
    traverseDisplayItems(arr, [], tmp);
    for (const [k, v] of Object.entries(tmp)) {
      if (!Object.prototype.hasOwnProperty.call(displayMap, k)) displayMap[k] = v;
    }

    // `$DefType` 以外（$VarsDef / $VersDef の型定義コンテナ）も補足
    addFromTypeDefContainers(def);
  };

  addFrom(workTypeDef);
  addFrom(globalTypeDef);
  return displayMap;
}

/**
 * db_type.json($DefType) から、トップレベルのフィールド定義（順序付き）を抽出
 * - work の定義を優先し、同名フィールドは global を追加しない
 * - Images コンテナは除外（ギャラリー処理が担当）
 * @param {Object|Array} workTypeDef - 作品ごとの typedef（/v1/works/{work}/typedef）
 * @param {Object|Array} globalTypeDef - グローバル typedef（/v1/typedef/global）
 * @returns {Array<{key:string,label:string,type:any,display:any,source:string}>}
 */
function extractTopLevelSchemaFields(workTypeDef, globalTypeDef = {}, options = {}) {
  const out = [];
  const seen = new Set();

  const isSecondary = (() => {
    if (typeof options?.isSecondary === 'boolean') return options.isSecondary;
    if (typeof options?.dbName === 'string') return isSecondaryDbName(options.dbName);
    return null;
  })();

  const pickDefArray = (def) => {
    if (!def) return null;
    if (Array.isArray(def)) return def;
    if (Array.isArray(def?.$DefType)) return def.$DefType;
    if (Array.isArray(def?.typedef?.$DefType)) return def.typedef.$DefType;
    if (Array.isArray(def?.global)) return def.global;
    return null;
  };

  const addFrom = (def, source) => {
    const arr = pickDefArray(def);
    if (!Array.isArray(arr)) return;

    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const key = item.hashTag;
      if (!key || typeof key !== 'string') continue;
      if (key === 'Images') continue;
      if (seen.has(key)) continue;

      // 二次創作向けフィールドの表示切替（isForSecondary）
      // - undefined は「共通扱い」で常に表示
      // - Secondary 文脈: true/undefined を表示、false は非表示
      // - Primary 等の文脈: false/undefined を表示、true は非表示
      if (isSecondary !== null && typeof item.isForSecondary === 'boolean') {
        if (isSecondary && item.isForSecondary === false) continue;
        if (!isSecondary && item.isForSecondary === true) continue;
      }

      const label = item.hashTag_JP || item.hashtag_JP || key;
      out.push({
        key,
        label,
        type: item.$type,
        display: item.$display ?? null,
        source
      });
      seen.add(key);
    }
  };

  addFrom(workTypeDef, 'work');
  addFrom(globalTypeDef, 'global');
  return out;
}

/**
 * db_type.json($DefType) からトップレベルの `$display` を抽出してマップ化
 * - work を優先し、同名キーは global を上書きしない
 * - Images コンテナは除外（ギャラリー処理が担当）
 * @param {Object|Array} workTypeDef
 * @param {Object|Array} globalTypeDef
 * @returns {Record<string, any>}
 */
function buildTopLevelDisplayMap(workTypeDef, globalTypeDef = {}) {
  const map = {};

  const pickDefArray = (def) => {
    if (!def) return null;
    if (Array.isArray(def)) return def;
    if (Array.isArray(def?.$DefType)) return def.$DefType;
    if (Array.isArray(def?.typedef?.$DefType)) return def.typedef.$DefType;
    if (Array.isArray(def?.global)) return def.global;
    return null;
  };

  const addFrom = (def) => {
    const arr = pickDefArray(def);
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const key = item.hashTag;
      if (!key || typeof key !== 'string') continue;
      if (key === 'Images') continue;
      if (Object.prototype.hasOwnProperty.call(map, key)) continue;
      map[key] = item.$display ?? null;
    }
  };

  addFrom(workTypeDef);
  addFrom(globalTypeDef);
  return map;
}

/**
 * db_type.json($DefType) からトップレベルの `$alt` を抽出してマップ化
 * - work を優先し、同名キーは global を上書きしない
 * - Images コンテナは除外（ギャラリー処理が担当）
 * @param {Object|Array} workTypeDef
 * @param {Object|Array} globalTypeDef
 * @returns {Record<string, string[]>}
 */
function buildTopLevelAltMap(workTypeDef, globalTypeDef = {}) {
  const map = {};

  const pickDefArray = (def) => {
    if (!def) return null;
    if (Array.isArray(def)) return def;
    if (Array.isArray(def?.$DefType)) return def.$DefType;
    if (Array.isArray(def?.typedef?.$DefType)) return def.typedef.$DefType;
    if (Array.isArray(def?.global)) return def.global;
    return null;
  };

  const normalizeAlt = (alt) => {
    if (!alt) return [];
    if (typeof alt === 'string') return [alt];
    if (Array.isArray(alt)) return alt.filter(x => typeof x === 'string');
    return [];
  };

  const addFrom = (def) => {
    const arr = pickDefArray(def);
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const key = item.hashTag;
      if (!key || typeof key !== 'string') continue;
      if (key === 'Images') continue;
      if (Object.prototype.hasOwnProperty.call(map, key)) continue;
      const alts = normalizeAlt(item.$alt);
      if (alts.length) map[key] = alts;
    }
  };

  addFrom(workTypeDef);
  addFrom(globalTypeDef);
  return map;
}

/**
 * db_type.json($DefType) からトップレベルの「別名（aliasOf）」定義を抽出してマップ化
 * - `$display.aliasOf` で指定されたキーに対し、「別名側キー」を紐づける
 * - 例: CodeName.$display.aliasOf === 'ModelName' → { ModelName: ['CodeName'] }
 * - work を優先し、同名キーは global を上書きしない
 * - Images コンテナは除外（ギャラリー処理が担当）
 * @param {Object|Array} workTypeDef
 * @param {Object|Array} globalTypeDef
 * @returns {Record<string, string[]>}
 */
function buildTopLevelAliasMap(workTypeDef, globalTypeDef = {}) {
  /** @type {Record<string, string[]>} */
  const map = {};

  const pickDefArray = (def) => {
    if (!def) return null;
    if (Array.isArray(def)) return def;
    if (Array.isArray(def?.$DefType)) return def.$DefType;
    if (Array.isArray(def?.typedef?.$DefType)) return def.typedef.$DefType;
    if (Array.isArray(def?.global)) return def.global;
    return null;
  };

  const pushUnique = (key, aliasKey) => {
    if (!key || !aliasKey) return;
    if (!Object.prototype.hasOwnProperty.call(map, key)) map[key] = [];
    if (!map[key].includes(aliasKey)) map[key].push(aliasKey);
  };

  const addFrom = (def) => {
    const arr = pickDefArray(def);
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const aliasKey = item.hashTag;
      if (!aliasKey || typeof aliasKey !== 'string') continue;
      if (aliasKey === 'Images') continue;
      const d = item.$display;
      const baseKey = (d && typeof d === 'object' && typeof d.aliasOf === 'string') ? d.aliasOf.trim() : '';
      if (!baseKey) continue;
      pushUnique(baseKey, aliasKey);
    }
  };

  // work を先に入れて、global は既存キーを上書きしない
  addFrom(workTypeDef);
  const mapKeysBeforeGlobal = new Set(Object.keys(map));
  const globalArr = pickDefArray(globalTypeDef);
  if (Array.isArray(globalArr)) {
    for (const item of globalArr) {
      if (!item || typeof item !== 'object') continue;
      const aliasKey = item.hashTag;
      if (!aliasKey || typeof aliasKey !== 'string') continue;
      if (aliasKey === 'Images') continue;
      const d = item.$display;
      const baseKey = (d && typeof d === 'object' && typeof d.aliasOf === 'string') ? d.aliasOf.trim() : '';
      if (!baseKey) continue;
      if (mapKeysBeforeGlobal.has(baseKey)) continue;
      pushUnique(baseKey, aliasKey);
    }
  }

  return map;
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
 * db_meta.json の $VarsDef（$EnumDef_* / #List_*）から、カテゴリ値の表示名を解決する
 * - 例: GenderType: 'Female' → '女性'
 * - 例: RaceType: 'Human' → '人間'
 * - 入力が既に *_JP / *_EN の文字列だった場合も、そのまま一致させる
 *
 * @param {string} fieldName - 'GenderType' / 'RaceType' 等
 * @param {any} rawValue - 生の値（プリミティブを想定）
 * @param {Object|null} globalDefType - fetchGlobalDefType() の結果（通常は data/db_meta.json）
 * @param {Object|null} metaForLookup - workMeta/globalMeta を統合した参照用メタ（任意）
 * @returns {string} 表示名（既定は日本語優先、なければ生値）
 */
function resolveVarsDefLabel(fieldName, rawValue, globalDefType = null, metaForLookup = null, fieldKey = null) {
  const fn = String(fieldName || '').trim();
  if (!fn) return '';

  if (rawValue === null || rawValue === undefined || rawValue === '') return '';
  const rv = String(rawValue).trim();
  if (!rv) return '';

  /** @type {any[]} */
  const varsDefRoots = [];

  /**
   * General 配下の `$Def_*` コンテナも探索対象に含める
   * - 例: Works_NumberTales の General.$Def_Relations.#List_RelationLabel
   * @param {any} general
   */
  const pushGeneralDefContainers = (general) => {
    if (!general || typeof general !== 'object' || Array.isArray(general)) return;
    for (const [k, v] of Object.entries(general)) {
      if (!k || typeof k !== 'string') continue;
      if (!k.startsWith('$Def_')) continue;
      if (!v || typeof v !== 'object') continue;
      varsDefRoots.push(v);
    }
  };

  if (metaForLookup?.General && typeof metaForLookup.General === 'object') {
    if (metaForLookup.General.$VarsDef && typeof metaForLookup.General.$VarsDef === 'object') varsDefRoots.push(metaForLookup.General.$VarsDef);
    pushGeneralDefContainers(metaForLookup.General);
  }
  if (metaForLookup?.$VarsDef && typeof metaForLookup.$VarsDef === 'object') varsDefRoots.push(metaForLookup.$VarsDef);

  // 作品ごとの Commons（Databases 配下）も参照対象に含める
  // - 例: Works_ShouArRiders の Databases.#DB_Primary._Commons.#List_Beast
  if (metaForLookup?.Databases && typeof metaForLookup.Databases === 'object') {
    for (const dbMeta of Object.values(metaForLookup.Databases)) {
      if (!dbMeta || typeof dbMeta !== 'object') continue;
      const commons = dbMeta._Commons;
      if (commons && typeof commons === 'object') varsDefRoots.push(commons);
    }
  }

  if (globalDefType?.General && typeof globalDefType.General === 'object') {
    if (globalDefType.General.$VarsDef && typeof globalDefType.General.$VarsDef === 'object') varsDefRoots.push(globalDefType.General.$VarsDef);
    pushGeneralDefContainers(globalDefType.General);
  }

  // 参照が同一のケースを除外
  const uniqRoots = [];
  for (const r of varsDefRoots) {
    if (!r || typeof r !== 'object') continue;
    if (uniqRoots.includes(r)) continue;
    uniqRoots.push(r);
  }
  if (!uniqRoots.length) return rv;

  const fk = String(fieldKey || '').trim();
  const fkSegs = fk ? fk.split('.').map(s => String(s || '').trim()).filter(Boolean) : [];

  /**
   * $VarsDef のネストから指定キー（#List_XXX 等）を探索
   * @param {any} obj
   * @param {string} key
   * @param {number} depth
   * @returns {any}
   */
  const findNestedKey = (obj, key, depth = 0) => {
    if (!obj || typeof obj !== 'object') return null;
    if (depth > 8) return null;
    if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];

    if (Array.isArray(obj)) {
      for (const it of obj) {
        const found = findNestedKey(it, key, depth + 1);
        if (found) return found;
      }
      return null;
    }

    for (const v of Object.values(obj)) {
      if (!v || typeof v !== 'object') continue;
      const found = findNestedKey(v, key, depth + 1);
      if (found) return found;
    }
    return null;
  };

  /**
   * fieldKey（schemaPath）を手がかりに `$Def_<Segment>` を辿って「その周辺の VarsDef コンテキスト」を集める
   * - 例: ArcanumspecStats.SpecType.ActionType.KinematicOrStatic
   *   → $Def_ArcanumspecStats → $Def_SpecType → $Def_ActionType
   * @param {any} varsDefRoot
   * @returns {any[]}
   */
  const collectVarsDefContexts = (varsDefRoot) => {
    /** @type {any[]} */
    const contexts = [varsDefRoot];
    if (!fkSegs.length) return contexts;
    let cur = varsDefRoot;
    // leaf 自体は $Def を持たないことが多いので、最後は探索対象にしない（Material 等は親に #List がある）
    const upto = Math.max(0, fkSegs.length - 1);
    for (let i = 0; i < upto; i++) {
      const seg = fkSegs[i];
      const key = `$Def_${seg}`;
      if (cur && typeof cur === 'object' && Object.prototype.hasOwnProperty.call(cur, key) && cur[key] && typeof cur[key] === 'object') {
        cur = cur[key];
        contexts.push(cur);
      } else {
        // 途中で切れても、以降は辿れない
        break;
      }
    }
    return contexts;
  };

  const pickLabel = (item) => {
    if (!item || typeof item !== 'object') return '';
    const jp = item[`${fn}_JP`];
    const raw = item[fn];
    const en = item[`${fn}_EN`];
    if (typeof jp === 'string' && jp.trim()) return jp.trim();
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (typeof en === 'string' && en.trim()) return en.trim();
    return '';
  };

  const pickLabelFlexible = (item, preferredKey) => {
    if (!item || typeof item !== 'object') return '';

    // まずは preferredKey（例: RaceType）ベースで「値が一致する場合のみ」拾う
    const pk = String(preferredKey || '').trim();
    if (pk) {
      const jp = item[`${pk}_JP`];
      const raw = item[pk];
      const en = item[`${pk}_EN`];
      const hit = [jp, raw, en].some(v => (typeof v === 'string' && v.trim() === rv));
      if (hit) {
        if (typeof jp === 'string' && jp.trim()) return jp.trim();
        if (typeof raw === 'string' && raw.trim()) return raw.trim();
        if (typeof en === 'string' && en.trim()) return en.trim();
      }
    }

    // 次に「値が一致するキー」を探索して、その *_JP を返す（例: #List_DualizePattern の Pattern）
    for (const [k, v] of Object.entries(item)) {
      if (!k || typeof k !== 'string') continue;
      if (k.endsWith('_JP') || k.endsWith('_EN')) continue;
      if (k.startsWith('_')) continue;
      if (typeof v !== 'string') continue;
      if (v.trim() !== rv) continue;
      const jp = item[`${k}_JP`];
      if (typeof jp === 'string' && jp.trim()) return jp.trim();
      return v.trim();
    }
    return '';
  };

  for (const varsDef of uniqRoots) {
    if (!varsDef || typeof varsDef !== 'object') continue;

    // $EnumDef_XXX は { '#XXX1': { XXX:'...', XXX_JP:'...' }, ... } 形式
    // - 作品別 meta では $Def_* 配下にネストしているケースがあるため、list と同様に探索する
    const enumKey = `$EnumDef_${fn}`;
    /** @type {any|null} */
    let enumDef = null;

    // context-first
    if (fkSegs.length) {
      const contexts = collectVarsDefContexts(varsDef);
      for (let i = contexts.length - 1; i >= 0; i--) {
        const ctx = contexts[i];
        if (ctx && typeof ctx === 'object' && ctx[enumKey] && typeof ctx[enumKey] === 'object' && !Array.isArray(ctx[enumKey])) {
          enumDef = ctx[enumKey];
          break;
        }
      }
    }
    // direct
    if (!enumDef && varsDef[enumKey] && typeof varsDef[enumKey] === 'object' && !Array.isArray(varsDef[enumKey])) {
      enumDef = varsDef[enumKey];
    }
    // nested fallback
    if (!enumDef) {
      const found = findNestedKey(varsDef, enumKey);
      if (found && typeof found === 'object' && !Array.isArray(found)) enumDef = found;
    }

    if (enumDef && typeof enumDef === 'object') {
      for (const v of Object.values(enumDef)) {
        if (!v || typeof v !== 'object') continue;
        const raw = v[fn];
        const jp = v[`${fn}_JP`];
        const en = v[`${fn}_EN`];
        if ((typeof raw === 'string' && raw.trim() === rv) || (typeof jp === 'string' && jp.trim() === rv) || (typeof en === 'string' && en.trim() === rv)) {
          return pickLabel(v) || rv;
        }
      }
    }

    // #List_XXX は [{ ... }, ...] 形式
    // - work 側では `$Def_*` のネスト配下にあることがあるため、fieldKey を手がかりに「その周辺」→ 無ければ再帰探索
    const listKey = `#List_${fn}`;
    /** @type {any[]|null} */
    let listDef = null;

    // context-first
    if (fkSegs.length) {
      const contexts = collectVarsDefContexts(varsDef);
      for (let i = contexts.length - 1; i >= 0; i--) {
        const ctx = contexts[i];
        if (ctx && typeof ctx === 'object' && Array.isArray(ctx[listKey])) {
          listDef = ctx[listKey];
          break;
        }
      }
    }
    // direct
    if (!listDef && Array.isArray(varsDef[listKey])) listDef = varsDef[listKey];
    // nested fallback
    if (!listDef) {
      const found = findNestedKey(varsDef, listKey);
      if (Array.isArray(found)) listDef = found;
    }

    if (Array.isArray(listDef)) {
      for (const item of listDef) {
        if (!item || typeof item !== 'object') continue;
        const raw = item[fn];
        const jp = item[`${fn}_JP`];
        const en = item[`${fn}_EN`];
        const hit = (
          (typeof raw === 'string' && raw.trim() === rv)
          || (typeof jp === 'string' && jp.trim() === rv)
          || (typeof en === 'string' && en.trim() === rv)
        );
        if (hit) return pickLabel(item) || rv;

        // フィールド名が一致しないケース（DualizePattern: Pattern を持つ等）
        const flex = pickLabelFlexible(item, fn);
        if (flex) return flex;
      }
    }
  }

  return rv;
}

/**
 * db_meta.json の $VarsDef（$EnumDef_* / #List_*）から、カテゴリ値のJP/ENペアを取得する
 * - 既存の resolveVarsDefLabel() は「JP優先の単一文字列」だが、
 *   こちらは「JP/EN両方の表示」に利用するための薄い補助。
 * - EN は *_EN を優先し、無い場合は raw（コード）をフォールバックとして返す。
 *
 * @param {string} fieldName
 * @param {any} rawValue
 * @param {Object|null} globalDefType
 * @param {Object|null} metaForLookup
 * @param {string|null} fieldKey
 * @returns {{ jp?: string, en?: string, raw?: string } | null}
 */
function resolveVarsDefLabelPack(fieldName, rawValue, globalDefType = null, metaForLookup = null, fieldKey = null) {
  const fn = String(fieldName || '').trim();
  if (!fn) return null;
  if (rawValue === null || rawValue === undefined || rawValue === '') return null;

  const normalizeKnownEnumCode = (field, code) => {
    const f = String(field || '').trim();
    const c = String(code || '').trim();
    if (!f || !c) return c;
    return c;
  };

  const rvRaw = String(rawValue).trim();
  const rv = normalizeKnownEnumCode(fn, rvRaw);
  if (!rv) return null;

  // '#FemaleNeutral' のような「#付きコード」でも解決できるように正規化
  // - UI 側の schemaType が欠ける経路や、値が参照キーのまま流れてくる経路でも
  //   JP/EN 表示名解決が外れて raw のまま残るのを避ける
  const rvStripped = rv.startsWith('#') ? rv.slice(1).trim() : rv;
  const rvCandidates = [rv, rvStripped].filter(Boolean);

  const trimStr = (v) => (typeof v === 'string' && v.trim()) ? v.trim() : '';

  /** @type {any[]} */
  const varsDefRoots = [];

  /** @param {any} general */
  const pushGeneralDefContainers = (general) => {
    if (!general || typeof general !== 'object' || Array.isArray(general)) return;
    for (const [k, v] of Object.entries(general)) {
      if (!k || typeof k !== 'string') continue;
      if (!k.startsWith('$Def_')) continue;
      if (!v || typeof v !== 'object') continue;
      varsDefRoots.push(v);
    }
  };

  if (metaForLookup?.General && typeof metaForLookup.General === 'object') {
    if (metaForLookup.General.$VarsDef && typeof metaForLookup.General.$VarsDef === 'object') varsDefRoots.push(metaForLookup.General.$VarsDef);
    pushGeneralDefContainers(metaForLookup.General);
  }
  if (metaForLookup?.$VarsDef && typeof metaForLookup.$VarsDef === 'object') varsDefRoots.push(metaForLookup.$VarsDef);
  if (metaForLookup?.Databases && typeof metaForLookup.Databases === 'object') {
    for (const dbMeta of Object.values(metaForLookup.Databases)) {
      if (!dbMeta || typeof dbMeta !== 'object') continue;
      const commons = dbMeta._Commons;
      if (commons && typeof commons === 'object') varsDefRoots.push(commons);
    }
  }
  if (globalDefType?.General && typeof globalDefType.General === 'object') {
    if (globalDefType.General.$VarsDef && typeof globalDefType.General.$VarsDef === 'object') varsDefRoots.push(globalDefType.General.$VarsDef);
    pushGeneralDefContainers(globalDefType.General);
  }

  const uniqRoots = [];
  for (const r of varsDefRoots) {
    if (!r || typeof r !== 'object') continue;
    if (uniqRoots.includes(r)) continue;
    uniqRoots.push(r);
  }
  if (!uniqRoots.length) return null;

  const fk = String(fieldKey || '').trim();
  const fkSegs = fk ? fk.split('.').map(s => String(s || '').trim()).filter(Boolean) : [];

  const findNestedKey = (obj, key, depth = 0) => {
    if (!obj || typeof obj !== 'object') return null;
    if (depth > 8) return null;
    if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];

    if (Array.isArray(obj)) {
      for (const it of obj) {
        const found = findNestedKey(it, key, depth + 1);
        if (found) return found;
      }
      return null;
    }

    for (const v of Object.values(obj)) {
      if (!v || typeof v !== 'object') continue;
      const found = findNestedKey(v, key, depth + 1);
      if (found) return found;
    }
    return null;
  };

  const collectVarsDefContexts = (varsDefRoot) => {
    /** @type {any[]} */
    const contexts = [varsDefRoot];
    if (!fkSegs.length) return contexts;
    let cur = varsDefRoot;
    const upto = Math.max(0, fkSegs.length - 1);
    for (let i = 0; i < upto; i++) {
      const seg = fkSegs[i];
      const key = `$Def_${seg}`;
      if (cur && typeof cur === 'object' && Object.prototype.hasOwnProperty.call(cur, key) && cur[key] && typeof cur[key] === 'object') {
        cur = cur[key];
        contexts.push(cur);
      } else {
        break;
      }
    }
    return contexts;
  };

  const makePack = (item, keyName) => {
    const k = String(keyName || fn).trim();
    const raw = trimStr(item?.[k]);
    const jp = trimStr(item?.[`${k}_JP`]);
    const en = trimStr(item?.[`${k}_EN`]);
    return {
      raw: raw || rv,
      // NOTE: #List_Belonging のように「ベースキーがJP文字列」で *_JP が無いケースを許容する
      // - *_JP が無い場合は raw（ベース値）を JP とみなす
      jp: jp || raw || '',
      en: en || raw || rv
    };
  };

  for (const varsDef of uniqRoots) {
    if (!varsDef || typeof varsDef !== 'object') continue;

    // $EnumDef_XXX
    const enumKey = `$EnumDef_${fn}`;
    let enumDef = null;

    if (fkSegs.length) {
      const contexts = collectVarsDefContexts(varsDef);
      for (let i = contexts.length - 1; i >= 0; i--) {
        const ctx = contexts[i];
        if (ctx && typeof ctx === 'object' && ctx[enumKey] && typeof ctx[enumKey] === 'object' && !Array.isArray(ctx[enumKey])) {
          enumDef = ctx[enumKey];
          break;
        }
      }
    }
    if (!enumDef && varsDef[enumKey] && typeof varsDef[enumKey] === 'object' && !Array.isArray(varsDef[enumKey])) {
      enumDef = varsDef[enumKey];
    }
    if (!enumDef) {
      const found = findNestedKey(varsDef, enumKey);
      if (found && typeof found === 'object' && !Array.isArray(found)) enumDef = found;
    }

    if (enumDef && typeof enumDef === 'object') {
      // 可能ならキー直引き（#FemaleNeutral 等）を優先して高速・確実に解決する
      // NOTE: この形式は db_meta.json の $EnumDef_* が採用している典型形
      const directKeys = Array.from(new Set([
        rv.startsWith('#') ? rv : `#${rv}`,
        rvStripped ? `#${rvStripped}` : '',
      ].filter(Boolean)));

      for (const directKey of directKeys) {
        if (!Object.prototype.hasOwnProperty.call(enumDef, directKey)) continue;
        const item = enumDef[directKey];
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const raw = trimStr(item[fn]);
          const jp = trimStr(item[`${fn}_JP`]);
          const en = trimStr(item[`${fn}_EN`]);
          return { raw: raw || rv, jp: jp || raw || '', en: en || raw || rv };
        }
      }

      for (const v of Object.values(enumDef)) {
        if (!v || typeof v !== 'object') continue;
        const raw = trimStr(v[fn]);
        const jp = trimStr(v[`${fn}_JP`]);
        const en = trimStr(v[`${fn}_EN`]);
        const hit = [raw, jp, en].some(x => x && rvCandidates.includes(x));
        if (hit) return { raw: raw || rv, jp: jp || raw || '', en: en || raw || rv };
      }
    }

    // #List_XXX
    const listKey = `#List_${fn}`;
    let listDef = null;

    if (fkSegs.length) {
      const contexts = collectVarsDefContexts(varsDef);
      for (let i = contexts.length - 1; i >= 0; i--) {
        const ctx = contexts[i];
        if (ctx && typeof ctx === 'object' && Array.isArray(ctx[listKey])) {
          listDef = ctx[listKey];
          break;
        }
      }
    }
    if (!listDef && Array.isArray(varsDef[listKey])) listDef = varsDef[listKey];
    if (!listDef) {
      const found = findNestedKey(varsDef, listKey);
      if (Array.isArray(found)) listDef = found;
    }

    if (Array.isArray(listDef)) {
      for (const item of listDef) {
        if (!item || typeof item !== 'object') continue;

        // preferred key で一致する場合
        const raw = trimStr(item[fn]);
        const jp = trimStr(item[`${fn}_JP`]);
        const en = trimStr(item[`${fn}_EN`]);
        const hit = [raw, jp, en].some(x => x && rvCandidates.includes(x));
        if (hit) return { raw: raw || rv, jp: jp || raw || '', en: en || raw || rv };

        // フィールド名が一致しないケース（DualizePattern: Pattern など）
        for (const [k, v] of Object.entries(item)) {
          if (!k || typeof k !== 'string') continue;
          if (k.endsWith('_JP') || k.endsWith('_EN')) continue;
          if (k.startsWith('_')) continue;
          if (typeof v !== 'string') continue;
          if (!rvCandidates.includes(v.trim())) continue;
          return makePack(item, k);
        }
      }
    }
  }

  return null;
}

/**
 * resolveVarsDefLabelPack() の結果から「JP/ENの両方があれば併記」した文字列を作る
 * @param {{jp?: string, en?: string, raw?: string} | null} pack
 * @param {string} fallback
 */
function formatBilingualLabel(pack, fallback, displayOpt = null) {
  const raw = (pack?.raw || String(fallback || '')).trim();
  const jp = (pack?.jp || '').trim();
  const en = (pack?.en || '').trim();

  const modeRaw = (displayOpt && typeof displayOpt === 'object' && typeof displayOpt.langMode === 'string')
    ? displayOpt.langMode.trim()
    : '';
  const mode = modeRaw
    .replace(/\s+/g, '')
    .replace(/-/g, '')
    .replace(/_/g, '')
    .toLowerCase();

  const pickJp = () => jp || en || raw;
  const pickEn = () => en || raw || jp;

  if (mode === 'jp' || mode === 'ja') return pickJp();
  if (mode === 'en' || mode === 'eng') return pickEn();
  if (mode === 'raw' || mode === 'code') return raw;
  if (mode === 'enj' || mode === 'enjp' || mode === 'enjpn') {
    const primary = pickEn();
    if (!primary) return '';
    if (en && jp && en !== jp) return `${en} / ${jp}`;
    return primary;
  }

  // default: jp/en (bilingual)
  const primary = pickJp();
  if (!primary) return '';
  if (jp && en && jp !== en) return `${jp} / ${en}`;
  return primary;
}

/**
 * Format value for display with global definition type support
 * @param {any} value - Value to format
 * @param {Object} labelMap - Field label mapping for nested objects
 * @param {Object} workMeta - Work metadata for lookup
 * @param {Object} globalDefType - Global definition types for enum/list lookups
 * @param {{display?: any, schemaType?: any, fieldKey?: string}|null} opt - display hint (e.g., { unit: 'cm' }) + schema type hint
 * @returns {string} Formatted display value
 */
function formatValueForDisplay(value, labelMap = {}, workMeta = null, globalDefType = null, opt = null) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  /**
   * VarsDef（$EnumDef_* / #List_*）参照のために、言語サフィックスを除去してベースキーへ正規化する
   * - opt.fieldKey が 'GenderType_JP' 等になっていても $EnumDef_GenderType を参照できるようにする
   * @param {string} k
   */
  const normalizeVarsDefKey = (k) => {
    const s = String(k || '').trim();
    const m = s.match(/^(.*)_(JP|EN)$/);
    return (m && m[1]) ? m[1] : s;
  };

  const unit = opt?.display?.unit ? String(opt.display.unit).trim() : '';
  const withUnit = (text) => {
    const base = String(text ?? '').trim();
    if (!base) return '';
    return unit ? `${base} ${unit}`.trim() : base;
  };

  /**
   * 値が「配列ではないObject」かどうか
   * @param {any} v
   * @returns {boolean}
   */
  const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  /**
   * Rank 表現を人間向け表示に正規化
   * - { Rank: 'A' } / { Rank: { hideText: '???' } } / { Rank: { Rank: 'A', about: '...' } }
   * - { Rank: 'A', about: '...' } のような「Rank + 注釈」も扱う
   * @param {any} obj
   * @returns {string}
   */
  const formatRankLike = (obj) => {
    if (!isPlainObject(obj)) return '';
    if (!Object.prototype.hasOwnProperty.call(obj, 'Rank')) return '';

    const rawRank = obj.Rank;
    const about = obj.about_JP || obj.about_EN || obj.about;

    // Rank がプリミティブ
    if (typeof rawRank === 'string' || typeof rawRank === 'number' || typeof rawRank === 'boolean') {
      const base = String(rawRank).trim();
      if (!base) return '';
      if (about) return `${base}（${about}）`;
      return base;
    }

    // Rank が { hideText: '...' }
    if (isPlainObject(rawRank) && typeof rawRank.hideText === 'string' && rawRank.hideText.trim()) {
      return rawRank.hideText;
    }

    // Rank が { Rank: 'A', about: '...' } のようなネスト
    if (isPlainObject(rawRank) && Object.prototype.hasOwnProperty.call(rawRank, 'Rank')) {
      const nestedBaseRaw = rawRank.Rank;
      const nestedAbout = rawRank.about_JP || rawRank.about_EN || rawRank.about;

      if (typeof nestedBaseRaw === 'string' || typeof nestedBaseRaw === 'number' || typeof nestedBaseRaw === 'boolean') {
        const base = String(nestedBaseRaw).trim();
        if (!base) return '';
        if (nestedAbout) return `${base}（${nestedAbout}）`;
        return base;
      }
      if (isPlainObject(nestedBaseRaw) && typeof nestedBaseRaw.hideText === 'string' && nestedBaseRaw.hideText.trim()) {
        return nestedBaseRaw.hideText;
      }
    }

    return '';
  };

  /**
   * Rank 表現の「値」と「注釈」を分離して抽出
   * - enum参照（#Rank3 等）を先に解決してから about を付けるため
   * @param {any} obj
   * @returns {{ rank: string, about?: string } | { hideText: string } | null}
   */
  const extractRankParts = (obj) => {
    if (!isPlainObject(obj)) return null;
    if (!Object.prototype.hasOwnProperty.call(obj, 'Rank')) return null;

    const aboutOuter = obj.about_JP || obj.about_EN || obj.about;
    const rawRank = obj.Rank;

    // Rank がプリミティブ
    if (typeof rawRank === 'string' || typeof rawRank === 'number' || typeof rawRank === 'boolean') {
      const rank = String(rawRank).trim();
      if (!rank) return null;
      return aboutOuter ? { rank, about: String(aboutOuter) } : { rank };
    }

    // Rank が { hideText: '...' }
    if (isPlainObject(rawRank) && typeof rawRank.hideText === 'string' && rawRank.hideText.trim()) {
      return { hideText: rawRank.hideText };
    }

    // Rank が { Rank: 'A', about: '...' } のようなネスト
    if (isPlainObject(rawRank) && Object.prototype.hasOwnProperty.call(rawRank, 'Rank')) {
      const nestedBaseRaw = rawRank.Rank;
      const aboutNested = rawRank.about_JP || rawRank.about_EN || rawRank.about;
      const about = aboutNested || aboutOuter;

      if (typeof nestedBaseRaw === 'string' || typeof nestedBaseRaw === 'number' || typeof nestedBaseRaw === 'boolean') {
        const rank = String(nestedBaseRaw).trim();
        if (!rank) return null;
        return about ? { rank, about: String(about) } : { rank };
      }
      if (isPlainObject(nestedBaseRaw) && typeof nestedBaseRaw.hideText === 'string' && nestedBaseRaw.hideText.trim()) {
        return { hideText: nestedBaseRaw.hideText };
      }
    }

    return null;
  };

  /**
   * $EnumDef_* 用の「値」と「注釈」を分離して抽出
   * @param {any} obj
   * @param {string} enumName
   * @returns {{ code: string, about?: string } | { hideText: string } | null}
   */
  const extractEnumParts = (obj, enumName) => {
    const en = String(enumName || '').trim();
    if (!en) return null;
    if (!isPlainObject(obj)) return null;
    if (!Object.prototype.hasOwnProperty.call(obj, en)) return null;

    const aboutOuter = obj.about_JP || obj.about_EN || obj.about;
    const raw = obj[en];

    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      const code = String(raw).trim();
      if (!code) return null;
      return aboutOuter ? { code, about: String(aboutOuter) } : { code };
    }

    if (isPlainObject(raw) && typeof raw.hideText === 'string' && raw.hideText.trim()) {
      return { hideText: raw.hideText };
    }

    if (isPlainObject(raw) && Object.prototype.hasOwnProperty.call(raw, en)) {
      const nested = raw[en];
      const aboutNested = raw.about_JP || raw.about_EN || raw.about;
      const about = aboutNested || aboutOuter;
      if (typeof nested === 'string' || typeof nested === 'number' || typeof nested === 'boolean') {
        const code = String(nested).trim();
        if (!code) return null;
        return about ? { code, about: String(about) } : { code };
      }
      if (isPlainObject(nested) && typeof nested.hideText === 'string' && nested.hideText.trim()) {
        return { hideText: nested.hideText };
      }
    }
    return null;
  };

  /**
   * schema の $type 文字列に定義型が含まれるか（簡易）
   * @param {any} t
   * @param {string} needle
   */
  const schemaTypeIncludes = (t, needle, depth = 0) => {
    if (!needle) return false;
    if (depth > 6) return false;
    if (t === null || t === undefined) return false;
    if (typeof t === 'string') return t.includes(needle);
    if (Array.isArray(t)) return t.some(x => schemaTypeIncludes(x, needle, depth + 1));
    if (typeof t === 'object') {
      // よくある { $type: ... } 形式
      if (Object.prototype.hasOwnProperty.call(t, '$type')) {
        return schemaTypeIncludes(t.$type, needle, depth + 1);
      }
      // フォールバック: 値を走査（過剰な探索を避けるため深さ制限あり）
      return Object.values(t).some(x => schemaTypeIncludes(x, needle, depth + 1));
    }
    return false;
  };

  /**
  * #Index 型の値を、作品ごとの $IndexDef（typedef）に合わせて整形
   * - 詳細表示（Relation 等）の「インデックス参照」をスキーマ駆動で扱えるようにする
   * @param {any} v
   * @returns {string}
   */
  const formatIndexLikeValue = (v) => {
    if (!opt || typeof opt !== 'object') return '';
    if (!schemaTypeIncludes(opt.schemaType, '#Index')) return '';

    // 現在の作品（UI状態）を元に indexDef を引く（無い場合はフォールバック）
    const workId = window?.__CHAR_STATE__?.workId;
    const indexDef = opt.indexDef || (workId ? getWorkIndexField(workId, workMeta) : null);
    if (!indexDef || typeof indexDef !== 'object') return '';

    const rootKey = indexDef.hashTag;
    if (!rootKey || typeof rootKey !== 'string') return '';

    const subDefs = getIndexSubDefs(indexDef);

    // ネスト型（例: Card.Num / BeastType.Beast）
    if (Array.isArray(subDefs) && subDefs.length > 0) {
      // 値が { Card:{...} } でも { Stoat:'...', Num:1 } でも扱えるように、2段階で読む
      const rootObj = (isPlainObject(v) && isPlainObject(v?.[rootKey])) ? v[rootKey] : v;
      if (!isPlainObject(rootObj)) return '';

      const primarySub = pickPrimaryIndexSubDef(subDefs);
      const candidates = primarySub ? [primarySub, ...subDefs.filter(d => d !== primarySub)] : subDefs;
      for (const sub of candidates) {
        const subKey = sub?.hashTag;
        if (!subKey || typeof subKey !== 'string') continue;
        const leaf = rootObj[subKey];
        if (leaf === null || leaf === undefined || leaf === '') continue;
        const subType = sub?.$type ?? sub?.$valType ?? null;
        const formatted = formatValueForDisplay(leaf, labelMap, workMeta, globalDefType, {
          display: opt.display,
          schemaType: subType,
          fieldKey: `${rootKey}.${subKey}`
        });
        const text = String(formatted ?? '').trim();
        if (!text) continue;

        const label = getIndexLabel(sub) || getIndexLabel(indexDef);
        return label ? `${label}: ${text}` : text;
      }
      return '';
    }

    // スカラー型（例: Num / Drc）
    const leaf = (isPlainObject(v) && Object.prototype.hasOwnProperty.call(v, rootKey)) ? v[rootKey] : v;
    if (leaf === null || leaf === undefined || leaf === '') return '';
    const rootType = indexDef?.$type ?? indexDef?.$valType ?? null;
    const formatted = formatValueForDisplay(leaf, labelMap, workMeta, globalDefType, {
      display: opt.display,
      schemaType: rootType,
      fieldKey: rootKey
    });
    const text = String(formatted ?? '').trim();
    if (!text) return '';
    const label = getIndexLabel(indexDef);
    return label ? `${label}: ${text}` : text;
  };

  /**
   * globalDefType から利用可能な Enum 名（$EnumDef_XXX の XXX）を抽出
   * @returns {string[]}
   */
  const listAvailableEnumNames = () => {
    const varsDef = globalDefType?.General?.$VarsDef;
    if (!varsDef || typeof varsDef !== 'object') return [];
    const out = [];
    for (const k of Object.keys(varsDef)) {
      if (!k || typeof k !== 'string') continue;
      const m = k.match(/^\$EnumDef_([A-Za-z0-9_]+)$/);
      if (m && m[1]) out.push(m[1]);
    }
    return out;
  };

  /**
   * schemaType から $EnumDef_XXX を抽出
   * @param {any} t
   * @returns {string}
   */
  const pickEnumNameFromSchemaType = (t) => {
    const s = (typeof t === 'string') ? t : '';
    const m = s.match(/\$EnumDef_([A-Za-z0-9_]+)/);
    const picked = (m && m[1]) ? String(m[1]).trim() : '';
    // NOTE: '$EnumDef_withAbout' は「enum名」ではなく型バリアント。
    // これを enumName='withAbout' と誤認すると、辞書解決が走らず raw（英語コード）に退避してしまう。
    if (picked && picked.replace(/\s+/g, '').toLowerCase() === 'withabout') return '';
    return picked;
  };

  /**
   * $EnumDef_XXX の参照（#XXX1 等）を解決
   * @param {string} enumName
   * @param {string} key
   */
  const resolveEnumKey = (enumName, key) => {
    const en = String(enumName || '').trim();
    const k = String(key || '').trim();
    if (!en || !k.startsWith('#')) return '';
    const g = globalDefType?.General?.$VarsDef?.[`$EnumDef_${en}`];
    const v = g && typeof g === 'object' ? g[k] : null;
    const code = v && typeof v === 'object' ? v[en] : null;
    return (typeof code === 'string' && code.trim()) ? code.trim() : '';
  };

  /**
   * $VarsDef のネストから指定キー（#ListLink_XXX 等）を探索
   * @param {any} obj
   * @param {string} key
   * @param {number} depth
   * @returns {any}
   */
  const findNestedKey = (obj, key, depth = 0) => {
    if (!obj || typeof obj !== 'object') return null;
    if (depth > 6) return null;
    if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];

    if (Array.isArray(obj)) {
      for (const it of obj) {
        const found = findNestedKey(it, key, depth + 1);
        if (found) return found;
      }
      return null;
    }

    for (const v of Object.values(obj)) {
      if (!v || typeof v !== 'object') continue;
      const found = findNestedKey(v, key, depth + 1);
      if (found) return found;
    }
    return null;
  };

  /**
   * #ListLink_XXX（db_meta.json）から項目を逆引き
   * @param {string} listFieldName - 'EffectText' 等
   * @param {string} rawValue - '絶大' 等
   * @returns {any|null}
   */
  const resolveListLinkItem = (listFieldName, rawValue) => {
    const fn = String(listFieldName || '').trim();
    const rv = String(rawValue ?? '').trim();
    if (!fn || !rv) return null;

    const vars = workMeta?.General?.$VarsDef || workMeta?.$VarsDef;
    if (!vars || typeof vars !== 'object') return null;

    const listKey = `#ListLink_${fn}`;
    const listDef = findNestedKey(vars, listKey);
    if (!Array.isArray(listDef)) return null;

    for (const item of listDef) {
      if (!item || typeof item !== 'object') continue;
      const v = item[fn];
      if (typeof v === 'string' && v.trim() === rv) return item;
    }
    return null;
  };

  const normalizeEnumFormat = (f) => {
    const s = String(f ?? '').trim();
    if (s === 'alpha' || s === 'code') return 'alpha';
    if (s === 'label') return 'label';
    if (s === 'alphaLabel' || s === 'codeLabel') return 'alphaLabel';
    if (s === 'labelAlpha' || s === 'labelCode') return 'labelAlpha';
    return '';
  };

  const getEnumFormatFor = (enumName) => {
    const en = String(enumName || '').trim();
    const d = opt?.display;
    if (!d || typeof d !== 'object') return '';
    if (en === 'Rank' && d.rankFormat) return d.rankFormat;
    if (en === 'Rarity' && d.rarityFormat) return d.rarityFormat;
    return d.enumFormat || '';
  };

  /**
   * #ListLink_* の表示オプション（$display）を解釈
   * @returns {{ showEnum: boolean, enumName: string }}
   */
  const getListLinkDisplayOpt = () => {
    const d = opt?.display;
    const showEnum = (d && typeof d === 'object' && typeof d.listLinkShowEnum === 'boolean') ? d.listLinkShowEnum : true;
    const enumName = (d && typeof d === 'object' && typeof d.listLinkEnumName === 'string') ? d.listLinkEnumName.trim() : '';
    return { showEnum, enumName };
  };

  /**
   * $EnumLink_${Field}（db_meta.json）から表示名を解決
   * @param {string} fieldKey
   * @param {string} enumName
   * @param {string} code
   */
  const resolveEnumLinkLabel = (fieldKey, enumName, code) => {
    const fk = String(fieldKey || '').trim();
    const en = String(enumName || '').trim();
    const c = String(code || '').trim();
    if (!fk || !en || !c) return '';

    /**
     * $VarsDef のネストから指定キー（$EnumLink_XXX 等）を探索
     * @param {any} obj
     * @param {string} key
     * @param {number} depth
     * @returns {any}
     */
    const findNestedKey = (obj, key, depth = 0) => {
      if (!obj || typeof obj !== 'object') return null;
      if (depth > 6) return null;
      if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];

      if (Array.isArray(obj)) {
        for (const it of obj) {
          const found = findNestedKey(it, key, depth + 1);
          if (found) return found;
        }
        return null;
      }

      for (const v of Object.values(obj)) {
        if (!v || typeof v !== 'object') continue;
        const found = findNestedKey(v, key, depth + 1);
        if (found) return found;
      }
      return null;
    };

    const vars = workMeta?.General?.$VarsDef || workMeta?.$VarsDef;
    if (!vars || typeof vars !== 'object') return '';

    const explicitLinkKey = opt?.display?.enumLinkKey ? String(opt.display.enumLinkKey).trim() : '';
    const simple = fk.split('.').pop();
    const candidates = [];
    if (explicitLinkKey) candidates.push(explicitLinkKey);
    // 既定: フィールド末尾（ExistingRarity 等）→ enumName（Rank/Rarity）
    if (simple) candidates.push(simple);
    if (en) candidates.push(en);

    /** @type {{suffix:string, def:any}[]} */
    const defs = [];
    for (const suffix of candidates) {
      const key = `$EnumLink_${suffix}`;
      const def = findNestedKey(vars, key);
      if (def && typeof def === 'object') defs.push({ suffix, def });
    }
    if (!defs.length) return '';

    // 最初に見つかった定義を採用（enumLinkKey を指定した場合は優先される）
    const { suffix: pickedSuffix, def: linkDef } = defs[0];

    for (const v of Object.values(linkDef)) {
      if (!v || typeof v !== 'object') continue;
      const vv = v[en];
      if (typeof vv === 'string' && vv.trim() === c) {
        const jp = v[`${pickedSuffix}_JP`];
        const raw = v[pickedSuffix];
        const enText = v[`${pickedSuffix}_EN`];
        if (typeof jp === 'string' && jp.trim()) return jp.trim();
        if (typeof raw === 'string' && raw.trim()) return raw.trim();
        if (typeof enText === 'string' && enText.trim()) return enText.trim();
      }
    }
    return '';
  };

  const formatEnumWithAbout = (enumName, code, about) => {
    const c = String(code ?? '').trim();
    if (!c) return '';
    const a = (about === null || about === undefined) ? '' : String(about).trim();
    const fmt = normalizeEnumFormat(getEnumFormatFor(enumName));

    // 既定（互換）: about があれば alphaLabel 相当、なければ alpha
    if (!fmt) {
      if (a) return `${c}（${a}）`;
      return c;
    }

    if (fmt === 'alpha') return c;
    if (fmt === 'label') return a || c;
    if (fmt === 'alphaLabel') return a ? `${c}（${a}）` : c;
    if (fmt === 'labelAlpha') return a ? `${a}（${c}）` : c;
    return c;
  };

  // $EnumDef_*（Rank/Rarity 等）の場合、プリミティブ値でも参照解決/EnumLink解決を試す
  if (opt && typeof opt === 'object' && typeof value !== 'object') {
    // #Index の場合は、作品の $IndexDef に合わせて整形する
    const idxText = formatIndexLikeValue(value);
    if (idxText) return withUnit(idxText);

    const enumName = pickEnumNameFromSchemaType(opt.schemaType);
    // $EnumDef（サフィックス無し）は「フィールド名の EnumDef を参照」する運用を許容
    // - 例: GenderType.$type === '$EnumDef' でも $VarsDef.$EnumDef_GenderType を見て表示名へ
    if (!enumName && schemaTypeIncludes(opt.schemaType, '$EnumDef') && opt.fieldKey) {
      const simple = normalizeVarsDefKey(String(opt.fieldKey).split('.').pop());
      const raw = (value === null || value === undefined) ? '' : String(value).trim();
      if (simple && raw) {
        const code = raw.startsWith('#') ? (resolveEnumKey(simple, raw) || raw) : raw;
        const pack = resolveVarsDefLabelPack(simple, code, globalDefType, workMeta, opt.fieldKey);
        const text = formatBilingualLabel(pack, code, opt?.display);
        return withUnit(text);
      }
    }

    if (enumName && schemaTypeIncludes(opt.schemaType, '$EnumDef_')) {
      const s = String(value ?? '').trim();
      const resolved = resolveEnumKey(enumName, s);
      const code = resolved || (typeof value === 'string' ? s : '');

      if (schemaTypeIncludes(opt.schemaType, '$EnumLink') && opt.fieldKey && code) {
        const linked = resolveEnumLinkLabel(opt.fieldKey, enumName, code);
        if (linked) {
          const fmt = normalizeEnumFormat(getEnumFormatFor(enumName));
          // 既定: EnumLink があれば alphaLabel（コード＋ラベル）扱い
          // - ラベル側にコードが含まれる場合もあるが、その調整は db_meta.json 側で行えるようにする
          if (!fmt) return formatEnumWithAbout(enumName, code, linked);
          return formatEnumWithAbout(enumName, code, linked);
        }
      }

      if (resolved) return formatEnumWithAbout(enumName, resolved, null);
      if (typeof value === 'boolean') return String(value);
      return withUnit(value);
    }

    // #ListIndex（RaceType 等）の場合、db_meta.json の #List_* から表示名を解決する
    // - 例: RaceType: 'Human' → '人間'
    if (schemaTypeIncludes(opt.schemaType, '#ListIndex') && opt.fieldKey) {
      const simple = normalizeVarsDefKey(String(opt.fieldKey).split('.').pop());
      if (simple) {
        const pack = resolveVarsDefLabelPack(simple, value, globalDefType, workMeta, opt.fieldKey);
        const text = formatBilingualLabel(pack, String(value ?? '').trim(), opt?.display);
        if (text) return withUnit(text);
      }
    }

    // schemaType が欠けている（または typedef が取得できない）場合でも、
    // db_meta.json($VarsDef) に定義があれば表示名解決を試みる。
    // - 例: GenderType の schemaType が取れない経路で 'FemaleNeutral' がコード表示に退避するのを防ぐ
    if ((!opt.schemaType || opt.schemaType === '') && opt.fieldKey) {
      const simple = normalizeVarsDefKey(String(opt.fieldKey).split('.').pop());
      const raw = (value === null || value === undefined) ? '' : String(value).trim();
      if (simple && raw) {
        const pack = resolveVarsDefLabelPack(simple, raw, globalDefType, workMeta, opt.fieldKey);
        const text = formatBilingualLabel(pack, raw, opt?.display);
        if (text && text !== raw) return withUnit(text);
      }
    }

    // 最終保険:
    // schemaType が '#String' 等で Enum/List として判定できない場合でも、
    // db_meta.json($VarsDef) に定義があれば表示名解決を試みる（GenderType 等の取りこぼし対策）。
    if (opt.fieldKey) {
      const simple = normalizeVarsDefKey(String(opt.fieldKey).split('.').pop());
      const raw = (value === null || value === undefined) ? '' : String(value).trim();
      if (simple && raw) {
        const pack = resolveVarsDefLabelPack(simple, raw, globalDefType, workMeta, opt.fieldKey);
        const text = formatBilingualLabel(pack, raw, opt?.display);
        if (text && text !== raw) return withUnit(text);
      }
    }
  }

  /**
   * `_Search` などの {hashTag, key} 配列を表示用に整形
   * @param {any} pairs
   * @returns {string}
   */
  const formatSearchPairs = (pairs) => {
    if (!Array.isArray(pairs) || pairs.length === 0) return '';
    const parts = [];
    for (const p of pairs) {
      if (!isPlainObject(p)) continue;
      const h = typeof p.hashTag === 'string' ? p.hashTag.trim() : '';
      const k = (p.key === null || p.key === undefined) ? '' : String(p.key).trim();
      if (!h && !k) continue;
      if (h && k) parts.push(`${h}=${k}`);
      else parts.push(h || k);
    }
    return parts.join(', ');
  };

  /**
   * `_Jump` オブジェクトを表示用に整形
   * 例: { hashTag: 'AnivDay', _Search: [{hashTag:'DayAbout', key:'誕生日'}] }
   * @param {any} jump
   * @returns {string}
   */
  const formatJump = (jump) => {
    if (!isPlainObject(jump)) return '';
    const rawTarget = typeof jump.hashTag === 'string' ? jump.hashTag.trim() : '';
    const target = rawTarget
      ? getFieldLabel(rawTarget, labelMap, workMeta, globalDefType, rawTarget)
      : '';
    const q = formatSearchPairs(jump._Search);
    if (target && q) return `${target}（${q}）`;
    return target || q || '';
  };

  /**
   * ネストObject/配列から表示可能なプリミティブ文字列を抽出
   * - `hideText` は上位で処理するためここでは無視
   * - 取り過ぎ防止のため深さ/件数に上限を設ける
   * @param {any} v
   * @param {{depth?: number, maxItems?: number, includePrivate?: boolean}} opt
   * @param {number} cur
   * @param {string[]} out
   */
  const collectLeafText = (v, opt, cur, out) => {
    const depth = opt?.depth ?? 4;
    const maxItems = opt?.maxItems ?? 40;
    const includePrivate = !!opt?.includePrivate;
    if (out.length >= maxItems) return;
    if (cur > depth) return;

    if (v === null || v === undefined) return;
    if (typeof v === 'string') {
      const t = v.trim();
      if (t) out.push(t);
      return;
    }
    if (typeof v === 'number' || typeof v === 'boolean') {
      out.push(String(v));
      return;
    }
    if (Array.isArray(v)) {
      for (const it of v) {
        collectLeafText(it, opt, cur + 1, out);
        if (out.length >= maxItems) return;
      }
      return;
    }
    if (!isPlainObject(v)) return;

    // {hashTag, key} 形式は専用表記で取り出す
    if (typeof v.hashTag === 'string' && Object.prototype.hasOwnProperty.call(v, 'key') && Object.keys(v).length <= 3) {
      const h = v.hashTag.trim();
      const k = (v.key === null || v.key === undefined) ? '' : String(v.key).trim();
      if (h && k) out.push(`${h}=${k}`);
      else if (h) out.push(h);
      else if (k) out.push(k);
      return;
    }

    for (const [k, vv] of Object.entries(v)) {
      if (!includePrivate && String(k).startsWith('_')) continue;
      if (k === 'hideText') continue;
      collectLeafText(vv, opt, cur + 1, out);
      if (out.length >= maxItems) return;
    }
  };

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    if (typeof value === 'boolean') return String(value);
    return withUnit(value);
  }

  if (Array.isArray(value)) {
    return value.map(item => formatValueForDisplay(item, labelMap, workMeta, globalDefType, opt)).filter(v => v).join(', ');
  }

  if (typeof value === 'object') {
    // #Index の場合（object 値も含む）
    const idxText = formatIndexLikeValue(value);
    if (idxText) return idxText;

    // Common “masked” pattern used across databases
    if (typeof value.hideText === 'string' && value.hideText.trim()) {
      return value.hideText;
    }

    // _Jump wrapper pattern (e.g., BirthDay: { _Jump: {hashTag, _Search:[{hashTag,key}] } })
    if (value._Jump && typeof value._Jump === 'object') {
      const j = formatJump(value._Jump);
      if (j) return j;
    }

    // _Jump object itself
    if (typeof value.hashTag === 'string' && (value._Search || value.key != null) && Object.keys(value).some(k => k === 'hashTag' || k === '_Search' || k === 'key')) {
      const j = formatJump(value);
      if (j) return j;
    }

    // _DBLink-like object (worksTitle/dbName/_Search)
    if (typeof value.worksTitle === 'string' && typeof value.dbName === 'string' && (Array.isArray(value._Search) || isPlainObject(value._Search))) {
      const ws = value.worksTitle.trim();
      const db = value.dbName.trim();
      const q = formatSearchPairs(value._Search);
      const head = (ws && db) ? `${ws}/${db}` : (ws || db);
      if (head && q) return `${head}（${q}）`;
      if (head) return head;
      if (q) return q;
    }

    // Common value/about pattern (e.g., Age: {value, about_JP/about_EN})
    // NOTE: value が Enum/List のコード値のケースがあるため、schemaType に応じて辞書解決して表示する
    if (Object.prototype.hasOwnProperty.call(value, 'value')) {
      const base = value.value;
      const about = value.about_JP || value.about_EN || value.about;

      // value 自体がマスク表現の場合
      if (isPlainObject(base) && typeof base.hideText === 'string' && base.hideText.trim()) {
        return base.hideText;
      }

      const isPrimitive = (v) => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean');
      const baseRaw = isPrimitive(base) ? String(base).trim() : '';
      let displayText = baseRaw;

      // Enum/List の value を辞書解決（GenderType: { value: 'Female', about_JP: '...' } など）
      if (baseRaw && opt?.fieldKey) {
        const simple = normalizeVarsDefKey(String(opt.fieldKey).split('.').pop());
        if (simple && schemaTypeIncludes(opt?.schemaType, '$EnumDef')) {
          const resolvedCode = baseRaw.startsWith('#') ? (resolveEnumKey(simple, baseRaw) || baseRaw) : baseRaw;
          const code = String(resolvedCode || '').trim();
          const pack = resolveVarsDefLabelPack(simple, code, globalDefType, workMeta, opt.fieldKey);
          const label = formatBilingualLabel(pack, code, opt?.display);
          if (label) displayText = label;
        } else if (simple && schemaTypeIncludes(opt?.schemaType, '#ListIndex')) {
          const pack = resolveVarsDefLabelPack(simple, baseRaw, globalDefType, workMeta, opt.fieldKey);
          const label = formatBilingualLabel(pack, baseRaw, opt?.display);
          if (label) displayText = label;
        }
      }

      const baseWithUnit = displayText ? withUnit(displayText) : '';
      if (about && baseWithUnit) return `${baseWithUnit}（${about}）`;
      if (baseWithUnit) return baseWithUnit;
    }

    // Common birthday/day pattern
    if (value.Day && typeof value.Day === 'object') {
      const mm = value.Day.Month != null ? String(value.Day.Month) : '';
      const dd = value.Day.DayOfMonth != null ? String(value.Day.DayOfMonth) : '';
      const date = (mm && dd) ? `${mm}/${dd}` : (mm || dd);
      const about = value.about_JP || value.about_EN || value.about;
      if (date && about) return `${date}（${about}）`;
      if (date) return date;
    }

    // #ListIndex の「ラッパー（単一キーObject）」を typedef-driven に整形
    // - 例: DualizePattern: { Pattern: 'Prop.' } を #List_DualizePattern（db_meta.json）で '通常' に
    // - 例: Material: [{ Material: 'Fire' }] を #List_Material で '火' に
    // - 例: RaceType: [{ RaceType: 'Human', about_JP: '...' }] を '人間（...）' に
    if (schemaTypeIncludes(opt?.schemaType, '#ListIndex_withAbout') && opt?.fieldKey && isPlainObject(value)) {
      const simple = normalizeVarsDefKey(String(opt.fieldKey).split('.').pop());
      const about = value.about_JP || value.about_EN || value.about;
      const codeRaw = simple && Object.prototype.hasOwnProperty.call(value, simple) ? value[simple] : null;
      if (simple && (typeof codeRaw === 'string' || typeof codeRaw === 'number' || typeof codeRaw === 'boolean')) {
        const pack = resolveVarsDefLabelPack(simple, codeRaw, globalDefType, workMeta, opt.fieldKey);
        const label = formatBilingualLabel(pack, String(codeRaw).trim(), opt?.display);
        if (about && label) return `${label}（${about}）`;
        if (label) return label;
      }
    }

    if (schemaTypeIncludes(opt?.schemaType, '#ListIndex') && opt?.fieldKey && isPlainObject(value)) {
      const simple = normalizeVarsDefKey(String(opt.fieldKey).split('.').pop());
      const ks = Object.keys(value).filter(k => k && typeof k === 'string' && !k.startsWith('_'));
      if (simple && ks.length === 1) {
        const leaf = ks[0];
        const raw = value?.[leaf];
        if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
          const pack = resolveVarsDefLabelPack(simple, raw, globalDefType, workMeta, opt.fieldKey);
          const text = formatBilingualLabel(pack, String(raw).trim(), opt?.display);
          if (text) return withUnit(text);
        }
      }
    }

    // #ListLink_*（EffectText/SafetyLevelText 等）のラッパーを typedef-driven に整形
    // - 例: { EffectText: '絶大' } で、db_meta.json の #ListLink_EffectText から { Rank:'S', EffectText:'絶大' } を逆引き
    // - Rank が取れる場合は alphaLabel（コード＋説明）として返す
    if (schemaTypeIncludes(opt?.schemaType, '#ListLink')) {
      const listOpt = getListLinkDisplayOpt();
      // 値が { EffectText: '...' } のような形なら、キー名から ListLink を探索する
      for (const [k, v] of Object.entries(value)) {
        const kk = String(k || '').trim();
        if (!kk || kk.startsWith('_')) continue;
        if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue;
        const vv = String(v).trim();
        if (!vv) continue;

        const item = resolveListLinkItem(kk, vv);
        if (!item || typeof item !== 'object') continue;

        const label = (
          (typeof item[`${kk}_JP`] === 'string' && item[`${kk}_JP`].trim())
            ? item[`${kk}_JP`].trim()
            : (typeof item[kk] === 'string' && item[kk].trim())
              ? item[kk].trim()
              : vv
        );

        // $display で enum 併記を抑制する場合は label のみ
        if (!listOpt.showEnum) return label;

        // ListLink の項目が enum 値を持っている場合は enum 的に扱って alphaLabel を返す
        // - 既定: globalDefType に存在する Enum 名のうち、item が持つキーを優先
        // - $display.listLinkEnumName が指定されていればそれを優先
        const availableEnums = listAvailableEnumNames();
        const preferredEnum = listOpt.enumName;
        const enumCandidates = [];
        if (preferredEnum) enumCandidates.push(preferredEnum);
        for (const en of availableEnums) enumCandidates.push(en);

        for (const en of enumCandidates) {
          if (!en) continue;
          const raw = item[en];
          if (typeof raw !== 'string' || !raw.trim()) continue;
          const rawCode = raw.trim();
          const resolvedCode = resolveEnumKey(en, rawCode);
          const code = (resolvedCode || rawCode).trim();
          if (!code) continue;
          return formatEnumWithAbout(en, code, label);
        }

        // enum が取れない場合は label のみ
        return label;
      }
    }

    // $EnumDef（サフィックス無し）/ $EnumDef_withAbout の「ラッパー」を typedef-driven に整形
    // - 例: GenderType: { GenderType: 'Male', about_JP: '...' } → '男性（...）'
    if (schemaTypeIncludes(opt?.schemaType, '$EnumDef') && opt?.fieldKey && isPlainObject(value)) {
      const simple = normalizeVarsDefKey(String(opt.fieldKey).split('.').pop());
      if (simple) {
        const parts = extractEnumParts(value, simple);
        if (parts && Object.prototype.hasOwnProperty.call(parts, 'hideText')) {
          return parts.hideText;
        }
        if (parts && Object.prototype.hasOwnProperty.call(parts, 'code')) {
          const resolvedCode = parts.code.startsWith('#') ? (resolveEnumKey(simple, parts.code) || parts.code) : parts.code;
          const code = String(resolvedCode || '').trim();
          if (!code) return '';

          const pack = resolveVarsDefLabelPack(simple, code, globalDefType, workMeta, opt.fieldKey);
          const label = formatBilingualLabel(pack, code, opt?.display);
          if (parts.about) return `${label}（${parts.about}）`;
          return label;
        }
      }
    }

    // $EnumDef_*（Rank/Rarity 等）に追従して整形（typedef-driven）
    if (schemaTypeIncludes(opt?.schemaType, '$EnumDef_')) {
      const enumName = pickEnumNameFromSchemaType(opt?.schemaType);
      if (enumName) {
        const parts = extractEnumParts(value, enumName);
        if (parts && Object.prototype.hasOwnProperty.call(parts, 'hideText')) {
          return parts.hideText;
        }
        if (parts && Object.prototype.hasOwnProperty.call(parts, 'code')) {
          const resolved = resolveEnumKey(enumName, parts.code);
          const code = (resolved || parts.code).trim();
          if (!code) return '';

          let linkedLabel = '';
          if (schemaTypeIncludes(opt?.schemaType, '$EnumLink') && opt?.fieldKey) {
            linkedLabel = resolveEnumLinkLabel(opt.fieldKey, enumName, code);
          }

          // label も about もある場合は両方出せるように合成（/ 区切り）
          const aboutText = linkedLabel
            ? (parts.about ? `${linkedLabel} / ${parts.about}` : linkedLabel)
            : parts.about;

          // 既定（互換）: EnumLink があれば label 扱い（コード優先ではなく、人間向け表記を優先）
          const fmt = normalizeEnumFormat(getEnumFormatFor(enumName));
          if (linkedLabel && !fmt) return formatEnumWithAbout(enumName, code, aboutText);
          return formatEnumWithAbout(enumName, code, aboutText);
        }
      }

      // 互換保険（古い Rank オブジェクト形が来た場合）
      if (schemaTypeIncludes(opt?.schemaType, '$EnumDef_Rank')) {
        const rankText = formatRankLike(value);
        if (rankText) return rankText;
      }
    }

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

    // Deep fallback: nested object/array の葉を抽出して `[object Object]` を回避
    const keys = Object.keys(value);
    const onlyPrivate = keys.length > 0 && keys.every(k => String(k).startsWith('_'));
    const leaf = [];
    collectLeafText(value, { includePrivate: onlyPrivate, depth: 4, maxItems: 40 }, 0, leaf);
    if (leaf.length > 0) {
      // 同一要素が多い場合を軽く圧縮
      const uniq = Array.from(new Set(leaf));
      return uniq.join(', ');
    }

    // 最終フォールバック: JSON（短縮）
    try {
      const json = JSON.stringify(value);
      if (typeof json === 'string' && json.length <= 240) return json;
      if (typeof json === 'string') return `${json.slice(0, 240)}…`;
    } catch (e) {
      // ignore
    }
  }

  return String(value);
}

/**
 * 改行を保持してテキストを表示するためのノードを作成
 * @param {string} text - 表示文字列
 * @returns {HTMLElement}
 */
function preWrapText(text) {
  return el('div', { style: 'white-space: pre-wrap;' }, [String(text ?? '')]);
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
  // Support common "Images" key variants (typos / case)
  const imgData = getRecordImages(record);

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
 * レコードから画像コンテナ（Images）を安全に取得
 * @param {Object} rec - レコード
 * @returns {Object} 画像コンテナ（存在しない場合は空オブジェクト）
 */
function getRecordImages(rec) {
  if (!rec || typeof rec !== 'object') return {};
  // 正式: Images
  if (rec.Images && typeof rec.Images === 'object') return rec.Images;
  // ありがちな揺れ・誤字
  if (rec.images && typeof rec.images === 'object') return rec.images;
  if (rec.Iamges && typeof rec.Iamges === 'object') return rec.Iamges;
  if (rec.Image && typeof rec.Image === 'object') return rec.Image;
  return {};
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
  const img = getRecordImages(rec);

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
  const img = getRecordImages(rec);

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

  // Determine file extension (prefer type-driven default)
  const normalizeSlashes = (p) => String(p || '').replace(/\\/g, '/');
  const lower = (s) => String(s || '').toLowerCase();
  const hasAnyExtension = (v) => /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(String(v || ''));
  const pickDefaultExtension = () => {
    const t = lower(field?.type);
    if (t.includes('jpg') || t.includes('jpeg')) return '.jpg';
    if (t.includes('webp')) return '.webp';
    if (t.includes('gif')) return '.gif';
    if (t.includes('svg')) return '.svg';
    return '.png';
  };
  const defaultExt = pickDefaultExtension();
  const appendExtIfMissing = (p) => {
    if (!p) return p;
    return hasAnyExtension(p) ? p : `${p}${defaultExt}`;
  };

  // Directory segment normalization for GitHub Pages (case-sensitive)
  // NOTE: 末尾(ファイル名)はケースを変更しない
  const CANON_DIR_SEGMENTS = [
    'arts', 'concept', 'conceptAlt', 'design', 'designAlt', 'cardDesign', 'catalog', 'corefolder',
    // NumberTales で実在することが多いサブディレクトリ
    'autumnMoon', 'corefolders', 'humanoids', 'newYear'
  ];
  const normalizeDirSegments = (relPath) => {
    const parts = normalizeSlashes(relPath).split('/').filter(Boolean);
    if (parts.length <= 1) return parts.join('/');
    const out = parts.map((seg, idx) => {
      if (idx === parts.length - 1) return seg; // file name
      const segLower = seg.toLowerCase();
      const canon = CANON_DIR_SEGMENTS.find(c => c.toLowerCase() === segLower);
      return canon || seg;
    });
    return out.join('/');
  };

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
  const normalizedValue = normalizeSlashes(value).replace(/^\/+/, '');
  if (normalizedValue.includes('/')) {
    // Value contains a subpath. Treat it as relative to the category directory (arts/design/...)
    // and ensure extension is present.
    const isGeneral = field.category === 'general' || directory === 'General';

    // If the value already starts with the directory (e.g. 'arts/foo'), strip it to avoid duplication.
    let rel = normalizedValue;
    if (!isGeneral && directory) {
      const dirPrefixLower = `${directory.toLowerCase()}/`;
      if (rel.toLowerCase().startsWith(dirPrefixLower)) {
        rel = rel.slice(directory.length + 1);
      }
    }

    rel = normalizeDirSegments(rel);
    rel = appendExtIfMissing(rel);

    if (isGeneral) {
      return `/data/${wdir}/Images/General/${rel}`;
    }
    return `/data/${wdir}/Images/${dbName}/${directory}/${rel}`;
  }

  // Build standard path
  const finalPath = field.category === 'general' || directory === 'General'
    ? `/data/${wdir}/Images/General/${appendExtIfMissing(normalizedValue)}`
    : `/data/${wdir}/Images/${dbName}/${directory}/${appendExtIfMissing(normalizedValue)}`;

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
  const img = getRecordImages(rec);

  console.log('🔧 Enhanced static resolution for:', {
    workId,
    dbName,
    img,
    hasImages: !!(rec && (rec.Images || rec.images || rec.Iamges || rec.Image)),
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
    // 互換: *_JP / *_EN の言語別フィールドも検索対象に含める
    rec.Name, rec.Name_JP, rec.Name_EN,
    rec.FormalName, rec.FormalName_JP, rec.FormalName_EN,
    rec.ModelName, rec.ModelNumber,
    rec.CodeName, rec.SPCodeName, rec.SPCodeName_EN,
    rec.Num
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
  list.textContent = '';
  let shown = 0;
  const qs = getQS();
  const filter = (qs.q || $('#search-input').value || '').trim();

  // 作品ごとのインデックス定義（表示名含む）を取得
  const [globalMeta, globalDefType] = await Promise.all([
    fetchGlobalMeta(),
    fetchGlobalDefType()
  ]);
  const indexDef = getWorkIndexField(workId, globalMeta);

  // グローバルステートから現在のデータベース名を取得
  const state = window.__CHAR_STATE__;
  const dbName = state ? state.db : 'Primary';

  // typedef-driven の $display（unit / langMode 等）をリスト側でも参照できるようにする
  const fieldDisplayMap = (() => {
    const wtd = state?.workTypeDef || null;
    const gtd = state?.globalTypeDef || null;
    if (!wtd && !gtd) return {};
    return buildFieldDisplayMap(wtd || {}, gtd || {});
  })();

  /**
   * 一覧チップ表示では「言語モードの取りこぼし（意図せず en になる）」が起きやすいため、
   * 既定では bilingual（JP/EN 併記）に戻す。
   * - GenderType は実データが英語コードで、辞書に JP があることが多い。
   * - ここで langMode が混入すると「英語コードのみ」に退避してしまう。
   * @param {string} field
   * @param {any} display
   */
  const sanitizeListChipDisplay = (field, display) => {
    const f = String(field || '').trim();
    if (!display || typeof display !== 'object') return display;
    if (f !== 'GenderType') return display;
    // shallow clone して langMode を除去（他の display 設定は維持）
    const next = { ...display };
    if (Object.prototype.hasOwnProperty.call(next, 'langMode')) delete next.langMode;
    return next;
  };

  // workMeta を参照できる場合は、表示名解決（#List_*）に利用
  const workMeta = state?.workMeta || null;
  const metaForLookup = (() => {
    const wm = workMeta && typeof workMeta === 'object' ? workMeta : {};
    const gm = globalMeta && typeof globalMeta === 'object' ? globalMeta : {};

    const gmGeneral = (gm.General && typeof gm.General === 'object') ? gm.General : {};
    const wmGeneral = (wm.General && typeof wm.General === 'object') ? wm.General : {};

    const gmVars = (gmGeneral.$VarsDef && typeof gmGeneral.$VarsDef === 'object') ? gmGeneral.$VarsDef : {};
    const wmVars = (wmGeneral.$VarsDef && typeof wmGeneral.$VarsDef === 'object') ? wmGeneral.$VarsDef : {};

    const mergedGeneral = { ...gmGeneral, ...wmGeneral, $VarsDef: { ...gmVars, ...wmVars } };
    return { ...gm, ...wm, General: mergedGeneral };
  })();

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
    if (r.GenderType_JP || r.GenderType) {
      const raw = r.GenderType_JP || r.GenderType;
      const dispRaw = fieldDisplayMap.GenderType || fieldDisplayMap['GenderType'] || null;
      const text = formatValueForDisplay(raw, {}, metaForLookup, globalDefType, {
        display: sanitizeListChipDisplay('GenderType', dispRaw),
        schemaType: '$EnumDef|$EnumDef_withAbout',
        fieldKey: 'GenderType'
      });
      // 一覧側で辞書解決が外れて raw（コード）に退避していないかの切り分け用ログ
      // - デバッグON時のみ出力
      try {
        if ($('#chk-debug')?.checked) {
          const rawStr = (raw === null || raw === undefined) ? '' : String(raw).trim();
          const textStr = (text === null || text === undefined) ? '' : String(text).trim();
          const isLikelyFallback = rawStr && textStr && rawStr === textStr;
          if (isLikelyFallback) {
            const pack = resolveVarsDefLabelPack('GenderType', rawStr, globalDefType, metaForLookup, 'GenderType');
            const lm = (dispRaw && typeof dispRaw === 'object' && typeof dispRaw.langMode === 'string') ? dispRaw.langMode : '';
            console.log('📋 list GenderType fallback check:', {
              raw: rawStr,
              text: textStr,
              pack,
              hasGenderEnum: !!globalDefType?.General?.$VarsDef?.$EnumDef_GenderType,
              displayLangMode: lm,
            });
          }
        }
      } catch {
        // no-op
      }
      if (text) chipEls.push(el('span', { class: 'chip' }, text));
    }
    if (r.Class || r.Class_EN) chipEls.push(el('span', { class: 'chip' }, r.Class || r.Class_EN));
    if (r.RaceType_JP || r.RaceType) {
      const raw = r.RaceType_JP || r.RaceType;
      const text = formatValueForDisplay(raw, {}, metaForLookup, globalDefType, {
        display: fieldDisplayMap.RaceType || fieldDisplayMap['RaceType'] || null,
        schemaType: '#ListIndex|#ListIndex_withAbout[]',
        fieldKey: 'RaceType'
      });
      if (text) chipEls.push(el('span', { class: 'chip' }, text));
    }

    // Index chip (schema-driven via typedef $IndexDef)
    const indexChipText = buildIndexChipText(r, indexDef, metaForLookup, globalDefType);
    if (indexChipText) {
      const id = getIndexIdentifierFromRecord(r, indexDef);
      const href = (() => {
        if (!id) return '';
        const cur = getQS();
        const db = window?.__CHAR_STATE__?.db || cur.db || 'Primary';
        const legacyNum = id.keyPath === 'Num' ? id.value : '';
        const qs = new URLSearchParams({
          ...cur,
          work: workId,
          db,
          idx: id.value,
          idxKey: id.keyPath,
          num: legacyNum,
        });
        return `${location.pathname}?${qs.toString()}`;
      })();

      chipEls.push(
        id && href
          ? el('a', {
              class: 'chip accent',
              href,
              title: '直リンクをコピーできます',
              onclick: (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                onOpen(r);
              }
            }, [indexChipText])
          : el('span', { class: 'chip accent' }, indexChipText)
      );
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
  mount.textContent = '';

  // 現在のデータベース名と拡張ステートを取得
  const state = window.__CHAR_STATE__;
  const dbName = state ? state.db : 'Primary';
  const cachedImageFields = state ? state.imageFields : null;
  const cachedWorkTypeDef = state ? state.workTypeDef : null;
  const cachedGlobalTypeDef = state ? state.globalTypeDef : null;
  const cachedWorkMeta = state ? state.workMeta : null;

  try {
    // 詳細ビューの最小限のローディング表示
    mount.textContent = '';
    mount.appendChild(el('div', {
      style: 'padding: 20px; text-align: center; color: var(--muted);'
    }, ['詳細情報を読み込んでいます...']));

    // Use cached data when available, otherwise fetch
    const [workTypeDef, globalTypeDef, globalDefType, workMeta, globalMeta] = await Promise.all([
      cachedWorkTypeDef || fetchWorkTypeDef(workId),
      cachedGlobalTypeDef || fetchGlobalTypeDef(),
      fetchGlobalDefType(),
      cachedWorkMeta || fetchWorkMeta(workId),
      fetchGlobalMeta()
    ]);

    // workMeta / globalMeta の $VarsDef を統合（EnumLink / ListLink の共通辞書を参照しやすくする）
    const metaForLookup = (() => {
      const wm = workMeta && typeof workMeta === 'object' ? workMeta : {};
      const gm = globalMeta && typeof globalMeta === 'object' ? globalMeta : {};

      const gmGeneral = (gm.General && typeof gm.General === 'object') ? gm.General : {};
      const wmGeneral = (wm.General && typeof wm.General === 'object') ? wm.General : {};

      const gmVars = (gmGeneral.$VarsDef && typeof gmGeneral.$VarsDef === 'object') ? gmGeneral.$VarsDef : {};
      const wmVars = (wmGeneral.$VarsDef && typeof wmGeneral.$VarsDef === 'object') ? wmGeneral.$VarsDef : {};

      const mergedGeneral = { ...gmGeneral, ...wmGeneral, $VarsDef: { ...gmVars, ...wmVars } };
      return { ...gm, ...wm, General: mergedGeneral };
    })();

    // Clear loading message
    mount.textContent = '';

    // Build comprehensive field label mapping with global fallbacks
    const fieldLabelMap = buildFieldLabelMap(workTypeDef, globalTypeDef);

    // Build field path → $type / $display maps (typedef-driven formatting)
    const fieldTypeMap = buildFieldTypeMap(workTypeDef, globalTypeDef);
    const fieldDisplayMap = buildFieldDisplayMap(workTypeDef, globalTypeDef);

    // GenderType の辞書解決が効いているかの最小診断（表示が変わらない場合の切り分け用）
    // - 通常時はログを出さない（デバッグチェック時のみ）
    try {
      if ($('#chk-debug')?.checked) {
        const rawGT = rec?.GenderType;
        if (typeof rawGT === 'string' && rawGT.trim()) {
          const schemaGT = fieldTypeMap?.GenderType ?? fieldTypeMap?.['GenderType'] ?? null;
          const dispGT = fieldDisplayMap?.GenderType ?? fieldDisplayMap?.['GenderType'] ?? null;
          const packGT = resolveVarsDefLabelPack('GenderType', rawGT.trim(), globalDefType, metaForLookup, 'GenderType');
          const textGT = formatBilingualLabel(packGT, rawGT.trim(), dispGT);
          console.log('🧩 GenderType resolve debug:', { raw: rawGT, schemaType: schemaGT, pack: packGT, text: textGT });
        }
      }
    } catch (e) {
      console.warn('⚠️ GenderType debug log failed:', e);
    }

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
        el('h4', {}, [getFieldLabel('Gallery', fieldLabelMap, metaForLookup, globalDefType, '画像ギャラリー')]),
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

  // トップレベルの `$display` / `$alt` を map 化（work 優先）
  const topLevelDisplayMap = buildTopLevelDisplayMap(workTypeDef, globalTypeDef);
  const topLevelAltMap = buildTopLevelAltMap(workTypeDef, globalTypeDef);
  const topLevelAliasMap = buildTopLevelAliasMap(workTypeDef, globalTypeDef);

  /**
   * *_JP / *_EN の言語サフィックスを解析
   * @param {string} k
   * @returns {{ base: string, lang: 'JP'|'EN' }|null}
   */
  const parseLangSuffix = (k) => {
    const s = String(k || '').trim();
    const m = s.match(/^(.*)_(JP|EN)$/);
    if (!m || !m[1] || !m[2]) return null;
    return { base: m[1], lang: m[2] === 'JP' ? 'JP' : 'EN' };
  };

  /**
   * 空値判定（`$alt` と同様の扱い）
   * @param {any} v
   */
  const isEmptyValueLoose = (v) => {
    if (v === null || v === undefined) return true;
    if (v === '') return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') {
      if (typeof v.hideText === 'string' && v.hideText) return false;
      return Object.keys(v).length === 0;
    }
    return false;
  };

  /**
   * 同義（言語別）フィールドの値を 1 つの表示文字列にまとめる
   * - base / base_JP / base_EN の順に拾い、空値は除外
   * - 同一文字列は重複排除
   * @param {string} baseKey
   * @returns {{ text: string, usedKeys: string[] }}
   */
  const formatBilingualGroup = (baseKey) => {
    const base = String(baseKey || '').trim();
    if (!base) return { text: '', usedKeys: [] };

    const candidates = [base, `${base}_JP`, `${base}_EN`];
    const pieces = [];
    const usedKeys = [];
    const seenText = new Set();

    for (const k of candidates) {
      const v = rec?.[k];
      if (isEmptyValueLoose(v)) continue;
      const formatted = formatValueForDisplay(v, fieldLabelMap, metaForLookup, globalDefType, {
        schemaType: fieldTypeMap?.[k] ?? fieldTypeMap?.[base] ?? null,
        display: topLevelDisplayMap?.[k] ?? topLevelDisplayMap?.[base] ?? null,
        fieldKey: k
      });
      const t = String(formatted ?? '').trim();
      if (!t) continue;
      if (seenText.has(t)) continue;
      seenText.add(t);
      pieces.push(t);
      usedKeys.push(k);
    }

    return { text: pieces.join(' / '), usedKeys };
  };

  const isEmptyForAlt = (v) => {
    if (v === null || v === undefined) return true;
    if (v === '') return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') {
      // { hideText } は意図的マスクなので空扱いしない
      if (typeof v.hideText === 'string' && v.hideText) return false;
      return Object.keys(v).length === 0;
    }
    return false;
  };

  /**
   * `$alt` を考慮して値を取り出す（primary が空なら alt を参照）
   * - enrich 側で $alt 穴埋めが走った場合も、_enrichment.altFallbacks を見てラベル優先を維持する
   * @param {string} key
   * @returns {{ value: any, usedKey: string }}
   */
  const getValueWithAlt = (key) => {
    // enrich 側で「primary は alt 由来」と記録されている場合、ラベルは alt 側を優先
    const altUsed = rec?._enrichment?.altFallbacks?.[key];
    if (typeof altUsed === 'string' && altUsed && !isEmptyForAlt(rec?.[key])) {
      return { value: rec?.[key], usedKey: altUsed };
    }

    const primary = rec?.[key];
    if (!isEmptyForAlt(primary)) return { value: primary, usedKey: key };

    const alts = (() => {
      const a1 = topLevelAltMap?.[key];
      const a2 = topLevelAliasMap?.[key];
      const out = [];
      if (Array.isArray(a1)) out.push(...a1);
      if (Array.isArray(a2)) out.push(...a2);
      // 重複排除
      return Array.from(new Set(out.filter(x => typeof x === 'string' && x.trim())));
    })();
    if (!Array.isArray(alts) || alts.length === 0) return { value: primary, usedKey: key };

    for (const altKey of alts) {
      const v = rec?.[altKey];
      if (!isEmptyForAlt(v)) return { value: v, usedKey: altKey };
    }
    return { value: primary, usedKey: key };
  };

  const formatFieldValue = (fieldKey, raw) => {
    // VarsDef 参照用に *_JP/_EN をベースキーへ正規化
    const baseKey = (() => {
      const s = String(fieldKey || '').trim();
      const m = s.match(/^(.*)_(JP|EN)$/);
      return (m && m[1]) ? m[1] : s;
    })();

    // 最終固定: GenderType は db_meta.json の $EnumDef_GenderType で必ず解決できる想定のため、
    // ここで辞書直引きのフォールバックを行い「rawコード単体が残る」ケースを潰す。
    // - formatValueForDisplay() 側で schema/display/map が欠けた場合や、basicFields の経路差異があっても確実に効かせる
    if (baseKey === 'GenderType') {
      const code = (raw === null || raw === undefined) ? '' : String(raw).trim();
      if (code) {
        const displayOpt = topLevelDisplayMap?.[fieldKey] ?? topLevelDisplayMap?.[baseKey] ?? null;
        const pack = resolveVarsDefLabelPack('GenderType', code, globalDefType, metaForLookup, baseKey);
        const label = formatBilingualLabel(pack, code, displayOpt);
        if (label && label !== code) return label;

        // デバッグ時のみ、辞書解決できているのに raw になる経路を追跡する
        try {
          if ($('#chk-debug')?.checked) {
            console.warn('🧩 GenderType basicFields fallback kept raw:', {
              fieldKey,
              baseKey,
              code,
              displayOpt,
              pack,
              label
            });
          }
        } catch (e) {
          // noop
        }
      }
    }

    // 性別はグローバル辞書（db_meta.json の $EnumDef_GenderType）で必ず解決できる前提のため、
    // schemaType の揺れ（古いキャッシュ/typedef差分/欠落等）に影響されないよう常に Enum 扱いに固定する。
    // - 「基本情報テーブルの性別だけ英語コードが残る」ケースの根本対策
    const schemaType = (fieldKey === 'GenderType')
      ? '$EnumDef|$EnumDef_withAbout'
      : (fieldTypeMap?.[fieldKey] ?? null);

    return formatValueForDisplay(raw, fieldLabelMap, metaForLookup, globalDefType, {
      display: topLevelDisplayMap?.[fieldKey] ?? null,
      schemaType,
      fieldKey
    });
  };

  const titleRow = el('div', { class: 'kv' }, [
    el('div', { class: 'name' }, rec.Name || rec.FormalName || rec.Name_EN || '(No Name)'),
    (rec.Name_EN || rec.FormalName_EN) ? el('div', { class: 'name-en' }, rec.Name_EN || rec.FormalName_EN) : null,
    el('div', { class: 'row small' }, [
      (() => {
        const workIndexDef = getWorkIndexField(workId, globalMeta);
        const indexChipText = buildIndexChipText(rec, workIndexDef, metaForLookup, globalDefType);
        if (!indexChipText) return null;
        const id = getIndexIdentifierFromRecord(rec, workIndexDef);
        const href = (() => {
          if (!id) return '';
          const cur = getQS();
          const legacyNum = id.keyPath === 'Num' ? id.value : '';
          const qs = new URLSearchParams({
            ...cur,
            work: workId,
            db: dbName,
            idx: id.value,
            idxKey: id.keyPath,
            num: legacyNum,
          });
          return `${location.pathname}?${qs.toString()}`;
        })();

        return (id && href)
          ? el('a', {
              class: 'pill',
              href,
              title: '直リンクをコピーできます',
              onclick: (ev) => {
                // 表示中のレコードなので、遷移（リロード）は不要。
                ev.preventDefault();
                ev.stopPropagation();
                try {
                  const legacyNum = id.keyPath === 'Num' ? id.value : '';
                  setQS({ idx: id.value, idxKey: id.keyPath, num: legacyNum });
                } catch {
                  // noop
                }
              }
            }, [indexChipText])
          : el('span', { class: 'pill' }, [indexChipText]);
      })(),
      (() => {
        const detailLayout = globalMeta?.CreationWorks?.[workId]?.$DetailLayout || null;
        const headerPills = Array.isArray(detailLayout?.headerPills)
          ? detailLayout.headerPills
          : ['Progress'];

        const nodes = [];
        for (const key of headerPills) {
          if (!key || typeof key !== 'string') continue;
          const { value: v, usedKey } = getValueWithAlt(key);
          if (v === null || v === undefined || v === '') continue;
          nodes.push(el('span', { class: 'pill' }, [
            getFieldLabel(usedKey || key, fieldLabelMap, workMeta, globalDefType, usedKey || key),
            formatValueForDisplay(v, fieldLabelMap, metaForLookup, globalDefType, {
              schemaType: fieldTypeMap?.[usedKey || key] ?? null,
              display: topLevelDisplayMap?.[usedKey || key] ?? null,
              fieldKey: usedKey || key
            })
          ]));
        }
        return nodes;
      })()
    ])
  ]);

  // Build basic info table with localized field names (layout-driven via db_meta.json $DetailLayout)
  const detailLayout = globalMeta?.CreationWorks?.[workId]?.$DetailLayout || null;
  const basicFieldKeys = Array.isArray(detailLayout?.basicFields)
    ? detailLayout.basicFields
    : ['FormalName', 'FormalName_EN', 'ModelName', 'ModelNumber', 'SPCodeName', 'GenderType', 'Height_cm', 'Weight_kg', 'Age', 'Class'];

  // basicFields のキー配列から、*_JP/_EN の同義ペアによる二重表示を抑止
  const normalizeBasicFieldKeys = (keys) => {
    const out = [];
    const seenBase = new Set();
    for (const k of keys || []) {
      if (!k || typeof k !== 'string') continue;
      const info = parseLangSuffix(k);
      const base = info ? info.base : k;
      if (seenBase.has(base)) continue;
      out.push(base);
      seenBase.add(base);
    }
    return out;
  };

  const normalizedBasicFieldKeys = normalizeBasicFieldKeys(basicFieldKeys);

  /**
   * 基本情報テーブル用の値解決
   * - `$alt` により代替した場合、ラベルは代替元キー（usedKey）を優先
   * @param {string} key
   * @returns {{ value: any, labelKey: string, sourceKey: string }}
   */
  const resolveBasicField = (key) => {
    if (!key || typeof key !== 'string') return { value: '', labelKey: String(key || ''), sourceKey: String(key || '') };

    // *_JP/_EN の同義ペアを 1 行に統合（基本情報テーブル）
    // - key が base の場合に base/base_JP/base_EN をまとめて表示
    // - base 自体が空でも JP/EN があれば表示する
    if (rec && (Object.prototype.hasOwnProperty.call(rec, `${key}_JP`) || Object.prototype.hasOwnProperty.call(rec, `${key}_EN`))) {
      const { text, usedKeys } = formatBilingualGroup(key);
      if (text) {
        return { value: text, labelKey: key, sourceKey: key, _usedKeys: usedKeys };
      }
    }

    const { value: v, usedKey } = getValueWithAlt(key);
    if (v === null || v === undefined || v === '') return { value: '', labelKey: key, sourceKey: key };

    // 表示名（ラベル）は、実際に値を参照したキー（usedKey）を優先
    // - 例: ModelName が空で CodeName を使った場合 → CodeName の表示名を採用
    const labelKey = usedKey || key;
    return { value: formatFieldValue(labelKey, v), labelKey, sourceKey: key };
  };

  const basicFields = normalizedBasicFieldKeys
    .map((key) => resolveBasicField(key))
    .filter((it) => it && it.value); // Only show fields with values

  const basic = kvTable(rec, basicFields.map((it) => [
    getFieldLabel(it.labelKey, fieldLabelMap, metaForLookup, globalDefType, it.labelKey),
    it.value
  ]));

  const pickSchemaType = (...candidates) => {
    for (const c of candidates) {
      if (!c) continue;
      const t = fieldTypeMap?.[c];
      if (typeof t === 'string' && t) return t;
    }
    return null;
  };

  const pickSchemaDisplay = (...candidates) => {
    for (const c of candidates) {
      if (!c) continue;
      const d = fieldDisplayMap?.[c];
      if (d && typeof d === 'object') return d;
    }
    return null;
  };

  /**
   * 値オブジェクトの「葉キー」を元に、schemaType/schemaDisplay を推定する
   * - #ListLink など「葉の型情報」が必要なケースに対応
   * - JS 側の固定キー（EffectText 等）依存を減らし、typedef に寄せて柔軟に動作させる
   * @param {string[]} basePaths - 例: ['NumerospecStats.EffectStats.Mental', 'EffectStats.Mental']
   * @param {any} obj - 例: { EffectText: '絶大' }
   * @returns {{ schemaType: string|null, schemaDisplay: any|null }}
   */
  const pickSchemaHintsForObjectLeaf = (basePaths, obj) => {
    const leafKeys = (obj && typeof obj === 'object' && !Array.isArray(obj))
      ? Object.keys(obj).filter(k => k && typeof k === 'string' && !k.startsWith('_'))
      : [];

    const candidatesType = [];
    const candidatesDisplay = [];

    for (const base of basePaths) {
      if (!base) continue;
      for (const leaf of leafKeys) {
        candidatesType.push(`${base}.${leaf}`);
        candidatesDisplay.push(`${base}.${leaf}`);
      }
      // フォールバック（親）
      candidatesType.push(base);
      candidatesDisplay.push(base);
    }

    return {
      schemaType: pickSchemaType(...candidatesType),
      schemaDisplay: pickSchemaDisplay(...candidatesDisplay)
    };
  };

  // Abilities / Effect / Safety（typedef-driven）
  // - JS 側に特定の JSON キー名を極力持たせず、実データ＋typedef（fieldTypeMap/fieldDisplayMap）から推定して表示する

  /**
   * 値が「配列ではないObject」かどうか
   * @param {any} v
   */
  const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  /**
   * schema の $type 文字列に needle が含まれるか（簡易）
   * @param {any} t
   * @param {string} needle
   */
  const schemaTypeIncludes = (t, needle, depth = 0) => {
    if (!needle) return false;
    if (depth > 6) return false;
    if (t === null || t === undefined) return false;
    if (typeof t === 'string') return t.includes(needle);
    if (Array.isArray(t)) return t.some(x => schemaTypeIncludes(x, needle, depth + 1));
    if (typeof t === 'object') {
      if (Object.prototype.hasOwnProperty.call(t, '$type')) {
        return schemaTypeIncludes(t.$type, needle, depth + 1);
      }
      return Object.values(t).some(x => schemaTypeIncludes(x, needle, depth + 1));
    }
    return false;
  };

  /**
   * typedef の存在に基づき、最も妥当な schemaPath を選ぶ
   * @param {string[]} candidates
   * @param {string} fallback
   */
  const pickSchemaPath = (candidates, fallback) => {
    for (const c of candidates || []) {
      if (!c || typeof c !== 'string') continue;
      if (fieldTypeMap?.[c] || fieldDisplayMap?.[c]) return c;
    }
    return fallback;
  };

  /**
   * 「specStats っぽい」トップレベルキーを推定
   * - 末尾が specStats（大文字小文字は許容）
   * - 中身が object
   * @returns {string}
   */
  const inferSpecStatsKey = () => {
    const keys = Object.keys(rec || {});
    const candidates = keys.filter(k => /specStats$/i.test(k) && isPlainObject(rec?.[k]) && Object.keys(rec?.[k] || {}).length > 0);
    if (!candidates.length) return '';
    // 複数ある場合は「要素数が多い」方を優先（安定性のため）
    candidates.sort((a, b) => Object.keys(rec?.[b] || {}).length - Object.keys(rec?.[a] || {}).length);
    return candidates[0] || '';
  };

  const pickedSpecStatsKey = inferSpecStatsKey();
  const numStats = pickedSpecStatsKey ? (rec?.[pickedSpecStatsKey] || {}) : {};

  /**
   * Object が「単一の葉」かどうか
   * - { X: '...' } / { X: 1 } / { X: { hideText: '...' } } を想定
   * @param {any} obj
   */
  const isSingleLeafObject = (obj) => {
    if (!isPlainObject(obj)) return false;
    const ks = Object.keys(obj).filter(k => k && typeof k === 'string' && !k.startsWith('_'));
    if (ks.length !== 1) return false;
    const v = obj[ks[0]];
    if (v === null || v === undefined) return false;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return true;
    if (isPlainObject(v) && typeof v.hideText === 'string' && v.hideText.trim()) return true;
    return false;
  };

  /**
   * Object が「単一葉オブジェクトの集合」かどうか
   * - { A: { X:'...' }, B:{ X:'...' } } の形
   * @param {any} obj
   */
  const isObjectOfSingleLeafObjects = (obj) => {
    if (!isPlainObject(obj)) return false;
    const ks = Object.keys(obj).filter(k => k && typeof k === 'string' && !k.startsWith('_'));
    if (!ks.length) return false;
    return ks.every(k => isSingleLeafObject(obj[k]));
  };

  /**
   * 単一葉オブジェクトの「葉パス」の schemaType を拾う
   * @param {string} parentPath
   * @param {any} obj
   */
  const getSingleLeafSchemaType = (parentPath, obj) => {
    if (!isPlainObject(obj)) return '';
    const ks = Object.keys(obj).filter(k => k && typeof k === 'string' && !k.startsWith('_'));
    if (ks.length !== 1) return '';
    const leaf = ks[0];
    const full = parentPath ? `${parentPath}.${leaf}` : leaf;
    const t = fieldTypeMap?.[full];
    return (typeof t === 'string') ? t : '';
  };

  // typedef 由来で「子フィールド定義が存在するobject」を検出・整形する
  // - 例: For79or80thDealerCalling.{For79thDealer,For80thDealer}
  // - 例: ArcanumspecStats.SpecType.ActionType.{KinematicOrStatic,RoleType}
  const nestedSchemaCache = new Map();
  const hasNestedSchema = (prefix) => {
    const p = String(prefix || '').trim();
    if (!p) return false;
    if (nestedSchemaCache.has(p)) return !!nestedSchemaCache.get(p);
    const dot = `${p}.`;
    const ok = (
      Object.keys(fieldTypeMap || {}).some(k => typeof k === 'string' && k.startsWith(dot))
      || Object.keys(fieldDisplayMap || {}).some(k => typeof k === 'string' && k.startsWith(dot))
      || Object.keys(fieldLabelMap || {}).some(k => typeof k === 'string' && k.startsWith(dot))
    );
    nestedSchemaCache.set(p, ok);
    return ok;
  };

  const formatObjectChildren = (parentSchemaPath, obj, opt2 = null) => {
    if (!isPlainObject(obj)) return '';
    const parent = String(parentSchemaPath || '').trim();
    if (!parent) return '';

    const separator = (opt2 && typeof opt2 === 'object' && typeof opt2.separator === 'string') ? opt2.separator : '\n';
    const parts = [];

    for (const [ck, cv] of Object.entries(obj)) {
      if (!ck || typeof ck !== 'string') continue;
      if (ck.startsWith('_')) continue;
      if (isEmptyValueLoose(cv)) continue;

      const childPath = `${parent}.${ck}`;
      const schemaPath = pickSchemaPath([childPath], childPath);
      const childLabel = getFieldLabel(schemaPath, fieldLabelMap, metaForLookup, globalDefType, ck);

      const hints = (isPlainObject(cv) && !Array.isArray(cv))
        ? pickSchemaHintsForObjectLeaf([schemaPath, childPath], cv)
        : { schemaType: pickSchemaType(schemaPath, childPath), schemaDisplay: pickSchemaDisplay(schemaPath, childPath, parent) };

      const childValue = formatValueForDisplay(cv, fieldLabelMap, metaForLookup, globalDefType, {
        schemaType: hints.schemaType,
        display: hints.schemaDisplay,
        fieldKey: schemaPath
      });
      if (!childValue) continue;

      parts.push(`${childLabel}: ${childValue}`);
    }

    return parts.join(separator);
  };

  // Abilities with localized labels
  // - top-level の object を走査し、「子が $EnumDef_Rank を含む」ものを能力値候補として推定
  const abilityKey = (() => {
    const keys = Object.keys(rec || {});
    for (const k of keys) {
      const obj = rec?.[k];
      if (!isPlainObject(obj)) continue;
      const childKeys = Object.keys(obj).filter(x => x && typeof x === 'string' && !x.startsWith('_'));
      if (!childKeys.length) continue;
      const hit = childKeys.some(ck => schemaTypeIncludes(fieldTypeMap?.[`${k}.${ck}`], '$EnumDef_Rank'));
      if (hit) return k;
    }
    return '';
  })();

  const ability = abilityKey ? (rec?.[abilityKey] || {}) : {};
  const abilityTags = Object.entries(ability)
    .map(([k, v]) => {
      if (!k || typeof k !== 'string') return null;
      if (k.startsWith('_')) return null;
      if (isEmptyValueLoose(v)) return null;

      const fallbackPath = abilityKey ? `${abilityKey}.${k}` : k;
      const schemaPath = pickSchemaPath([fallbackPath], fallbackPath);

      const fieldLabel = getFieldLabel(schemaPath, fieldLabelMap, metaForLookup, globalDefType, k);
      const schemaType = pickSchemaType(schemaPath);
      const schemaDisplay = pickSchemaDisplay(schemaPath, abilityKey);
      const displayValue = formatValueForDisplay(v, fieldLabelMap, metaForLookup, globalDefType, {
        schemaType,
        display: schemaDisplay,
        fieldKey: schemaPath
      });

      const fl = String(fieldLabel ?? '').trim();
      const dv = String(displayValue ?? '').trim();
      if (!fl || !dv) return null;
      return el('div', { class: 'tag' }, [`${fl}: ${dv}`]);
    })
    .filter(Boolean);

  const abilityGrid = abilityTags.length ? el('div', { class: 'kv-grid' }, abilityTags) : null;

  // Effect/Safety with localized labels
  // - specStats 内のキーを走査し、「単一葉オブジェクトの集合」かつ葉型に #ListLink を含むものを EffectStats 相当として推定
  const effectKey = (() => {
    if (!pickedSpecStatsKey || !isPlainObject(numStats)) return '';
    for (const k of Object.keys(numStats)) {
      if (!k || typeof k !== 'string') continue;
      const obj = numStats[k];
      if (!isObjectOfSingleLeafObjects(obj)) continue;
      const groupPath = `${pickedSpecStatsKey}.${k}`;
      // いずれかの子が #ListLink を含むなら Effect 系として扱う
      const subKeys = Object.keys(obj);
      const hit = subKeys.some(sk => {
        const t = getSingleLeafSchemaType(`${groupPath}.${sk}`, obj[sk]);
        return schemaTypeIncludes(t, '#ListLink');
      });
      if (hit) return k;
    }
    return '';
  })();

  const eff = effectKey ? (numStats?.[effectKey] || {}) : {};
  const effTags = Object.entries(eff)
    .map(([k, v]) => {
      if (!k || typeof k !== 'string') return null;
      if (k.startsWith('_')) return null;
      if (isEmptyValueLoose(v)) return null;

      const fallbackPath = pickedSpecStatsKey && effectKey ? `${pickedSpecStatsKey}.${effectKey}.${k}` : k;
      const schemaPath = pickSchemaPath([fallbackPath], fallbackPath);

      const fieldLabel = getFieldLabel(schemaPath, fieldLabelMap, metaForLookup, globalDefType, k);
      const { schemaType, schemaDisplay } = pickSchemaHintsForObjectLeaf([schemaPath], v);
      const displayValue = formatValueForDisplay(v, fieldLabelMap, metaForLookup, globalDefType, {
        schemaType,
        display: schemaDisplay,
        fieldKey: schemaPath
      });

      const fl = String(fieldLabel ?? '').trim();
      const dv = String(displayValue ?? '').trim();
      if (!fl || !dv) return null;
      return el('div', { class: 'tag' }, [`${fl}: ${dv}`]);
    })
    .filter(Boolean);

  const effGrid = effTags.length ? el('div', { class: 'kv-grid' }, effTags) : null;

  // - specStats 内のキーを走査し、「単一葉オブジェクト」かつ葉型に #ListLink を含むものを Safety 相当として推定
  const safetyKey = (() => {
    if (!pickedSpecStatsKey || !isPlainObject(numStats)) return '';
    for (const k of Object.keys(numStats)) {
      if (!k || typeof k !== 'string') continue;
      const obj = numStats[k];
      if (!isSingleLeafObject(obj)) continue;
      const t = getSingleLeafSchemaType(`${pickedSpecStatsKey}.${k}`, obj);
      if (schemaTypeIncludes(t, '#ListLink')) return k;
    }
    return '';
  })();

  const safety = safetyKey ? (numStats?.[safetyKey] || {}) : {};
  const safetyFieldPath = (pickedSpecStatsKey && safetyKey) ? `${pickedSpecStatsKey}.${safetyKey}` : '';
  const safetyRow = safetyKey && safety && Object.keys(safety).length > 0 ? el('div', { class: 'tag' }, [
    `${getFieldLabel(safetyFieldPath, fieldLabelMap, metaForLookup, globalDefType, safetyKey)}: ${(() => {
      const { schemaType, schemaDisplay } = pickSchemaHintsForObjectLeaf([safetyFieldPath], safety);
      return formatValueForDisplay(safety, fieldLabelMap, metaForLookup, globalDefType, {
        schemaType,
        display: schemaDisplay,
        fieldKey: safetyFieldPath
      });
    })()}`
  ]) : null;

  // SpecType with localized labels（typedef-driven）
  // - specStats の直下から「能力種別（Material/ActionType 等の入れ子）」に該当するオブジェクトを推定し、その配下だけタグ表示する
  // - specStats 全体（SafetyLevel/EffectStats 等）を誤って列挙しない
  const specTypeSubKey = (() => {
    if (!pickedSpecStatsKey || !isPlainObject(numStats)) return '';

    /** @type {{ key: string, score: number }[]} */
    const scored = [];

    for (const k of Object.keys(numStats)) {
      if (!k || typeof k !== 'string') continue;
      const obj = numStats?.[k];
      if (!isPlainObject(obj)) continue;

      // Effect/Safety として推定済みのものは除外
      if (k === effectKey) continue;
      if (k === safetyKey) continue;

      const prefix = `${pickedSpecStatsKey}.${k}.`;
      let score = 0;

      // typedef 上で、この prefix 配下に $display.section === 'spec' がどれだけあるかでスコアリング
      for (const [path, d] of Object.entries(fieldDisplayMap || {})) {
        if (!path || typeof path !== 'string') continue;
        if (!path.startsWith(prefix)) continue;
        if (d && typeof d === 'object' && d.section === 'spec') score += 1;
      }

      // さらに「配下に typedef が存在する」こと自体も加点（ActionType のように親に section が無いケース向け）
      if (score === 0) {
        const hasNested = Object.keys(fieldTypeMap || {}).some(tk => typeof tk === 'string' && tk.startsWith(prefix));
        if (hasNested) score += 1;
      }

      if (score > 0) scored.push({ key: k, score });
    }

    if (!scored.length) return '';
    scored.sort((a, b) => b.score - a.score);
    return scored[0].key;
  })();

  const specType = (specTypeSubKey && isPlainObject(numStats?.[specTypeSubKey])) ? (numStats?.[specTypeSubKey] || {}) : {};
  const specNodes = [];
  if (specTypeSubKey && isPlainObject(specType)) {
    for (const [k, v] of Object.entries(specType)) {
      if (!k || typeof k !== 'string') continue;
      if (isEmptyValueLoose(v)) continue;

      const fieldPath = `${pickedSpecStatsKey}.${specTypeSubKey}.${k}`;
      const schemaPath = pickSchemaPath([fieldPath], fieldPath);
      const fieldLabel = getFieldLabel(schemaPath, fieldLabelMap, metaForLookup, globalDefType, k);

      const hints = (isPlainObject(v) && !Array.isArray(v))
        ? pickSchemaHintsForObjectLeaf([schemaPath, fieldPath], v)
        : { schemaType: pickSchemaType(schemaPath, fieldPath), schemaDisplay: pickSchemaDisplay(schemaPath, fieldPath, `${pickedSpecStatsKey}.${specTypeSubKey}`) };

      // ActionType のような「子が定義されているobject」は、子ラベル付きで展開して表示する
      const expanded = (isPlainObject(v) && hasNestedSchema(schemaPath))
        ? formatObjectChildren(schemaPath, v, { separator: ' / ' })
        : '';

      const displayValue = expanded || formatValueForDisplay(v, fieldLabelMap, metaForLookup, globalDefType, {
        schemaType: hints.schemaType,
        display: hints.schemaDisplay,
        fieldKey: schemaPath
      });

      if (!displayValue) continue;
      specNodes.push(el('div', { class: 'tag' }, [`${fieldLabel}: ${displayValue}`]));
    }
  }

  // Belonging/Area/Day with localized labels
  const belong = formatValueForDisplay(rec.Belonging, fieldLabelMap, metaForLookup, globalDefType, {
    schemaType: fieldTypeMap?.Belonging ?? null,
    display: topLevelDisplayMap?.Belonging ?? null,
    fieldKey: 'Belonging'
  });
  const area = formatValueForDisplay(rec.Area, fieldLabelMap, metaForLookup, globalDefType, {
    schemaType: fieldTypeMap?.Area ?? null,
    display: topLevelDisplayMap?.Area ?? null,
    fieldKey: 'Area'
  });
  const days = Array.isArray(rec.AnivDay) ? rec.AnivDay.map(d => {
    const mm = d?.Day?.Month != null ? String(d.Day.Month) : '';
    const dd = d?.Day?.DayOfMonth != null ? String(d.Day.DayOfMonth) : '';
    const date = (mm && dd) ? `${mm}/${dd}` : (mm || dd);
    const about = d?.DayAbout ? ` ${d.DayAbout}` : '';
    return `${date}${about}`;
  }).filter(d => d.trim()) : [];

  // ここまでで明示的に表示したフィールドを控えておき、未表示項目を後段で包括表示する
  const shownKeys = (() => {
    /** @type {Set<string>} */
    const s = new Set();

    // タイトル行（表示に使った実体キーを記録）
    if (rec.Name) s.add('Name');
    else if (rec.FormalName) s.add('FormalName');
    else if (rec.Name_EN) s.add('Name_EN');

    if (rec.Name_EN) s.add('Name_EN');
    else if (rec.FormalName_EN) s.add('FormalName_EN');

    // 作品ごとのインデックス定義（typedef の $IndexDef に追従）
    const workIndexDef = getWorkIndexField(workId, globalMeta);
    if (workIndexDef?.hashTag && typeof workIndexDef.hashTag === 'string') {
      s.add(workIndexDef.hashTag);
    } else if (rec.Num != null) {
      // indexDef が無い場合の最小互換
      s.add('Num');
    }

    if (rec.ModelNumber) s.add('ModelNumber');
    if (rec.Progress) s.add('Progress');

    // 基本情報テーブルに出したキー（$alt を含めて二重表示抑止）
    for (const it of basicFields) {
      if (!it || typeof it !== 'object') continue;
      if (it.sourceKey) s.add(it.sourceKey);
      if (it.labelKey) s.add(it.labelKey);

      // 同義（言語別）統合で実際に参照したキーも抑止対象にする
      if (Array.isArray(it._usedKeys)) {
        for (const uk of it._usedKeys) s.add(uk);
      }

      const alts = topLevelAltMap?.[it.sourceKey];
      if (Array.isArray(alts)) {
        for (const ak of alts) s.add(ak);
      }
    }

    // 互換/派生キーが混入する場合があるため、基本情報で表示したら抑止
    // - GenderType_JP のような派生キー（データ側に残っている場合）を二重表示しない
    if (basicFields.some(it => it?.sourceKey === 'GenderType' || it?.labelKey === 'GenderType')) s.add('GenderType_JP');

    // スペック/能力セクションで個別表示するトップレベルキー
    if (abilityKey) {
      const v = rec?.[abilityKey];
      if (v && typeof v === 'object' && Object.keys(v).length > 0) s.add(abilityKey);
    }
    // specStats 系（作品ごとに存在するものは二重表示を避ける）
    // - JS 側に固定キーを持たせないため、末尾が specStats のものを抑止対象とする
    for (const k of Object.keys(rec || {})) {
      if (!k || typeof k !== 'string') continue;
      if (!/specStats$/i.test(k)) continue;
      const v = rec?.[k];
      if (v && typeof v === 'object' && Object.keys(v).length > 0) s.add(k);
    }
    // SpecType は specStats 配下で表示するため、ここではトップレベル抑止不要

    // basic セクションの個別テーブルで表示するフィールド
    if (belong) s.add('Belonging');
    if (area) s.add('Area');
    if (days.length) s.add('AnivDay');

    // profile/relations/DBLinkResolved は個別表示する
    if (rec.Summary) s.add('Summary');
    if (rec.Relation) s.add('Relation');
    if (rec.RelationToPrimary) s.add('RelationToPrimary');
    if (rec._DBLinkResolved) s.add('_DBLinkResolved');

    // Images は左カラムのギャラリー担当（キーとして持っていれば抑止）
    if (rec.Images) s.add('Images');

    return s;
  })();

  // db_type.json 由来の表示順（トップレベル）
  const schemaFields = extractTopLevelSchemaFields(workTypeDef, globalTypeDef, { dbName });
  const schemaKeySet = new Set(schemaFields.map(f => f.key));

  // スキーマから #Summary（長文）系を抽出し、プロフィールセクションに回す
  const isSummaryType = (t) => {
    const s = String(t ?? '');
    return s.includes('#Summary');
  };

  const isEmptyValue = (v) => isEmptyValueLoose(v);
  const isInternalButAllowed = (k) => k === '_DBLink';
  const shouldSkipKey = (k, v) => {
    // base が表示済みなら *_JP/_EN は二重表示しない
    const lang = parseLangSuffix(k);
    if (lang?.base && shownKeys.has(lang.base)) return true;
    if (shownKeys.has(k)) return true;
    if (k === 'Images') return true;
    if (k.startsWith('_') && !isInternalButAllowed(k)) return true;
    if (isEmptyValue(v)) return true;
    return false;
  };

  const buildIndexLinkInfoFromValue = (value, indexDef, keyPathHint = '') => {
    if (!indexDef || typeof indexDef !== 'object') return null;
    const rootKey = typeof indexDef.hashTag === 'string' ? indexDef.hashTag.trim() : '';
    if (!rootKey) return null;

    const subDefs = getIndexSubDefs(indexDef);
    const nested = Array.isArray(subDefs) && subDefs.length > 0;
    const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

    // ネスト型
    if (nested) {
      const primarySub = pickPrimaryIndexSubDef(subDefs);
      const candidates = primarySub ? [primarySub, ...subDefs.filter(d => d !== primarySub)] : subDefs;

      // { Root:{Sub:...} } or { Sub:... }
      if (isObj(value)) {
        const rootObj = isObj(value?.[rootKey]) ? value[rootKey] : value;
        if (isObj(rootObj)) {
          for (const sub of candidates) {
            const subKey = sub?.hashTag;
            if (!subKey || typeof subKey !== 'string') continue;
            const leaf = rootObj[subKey];
            if (leaf === null || leaf === undefined || leaf === '') continue;
            return { idxKeyPath: `${rootKey}.${subKey}`, idxValue: String(leaf) };
          }
        }
      }

      // プリミティブ（どの sub か曖昧な場合は primary を採用）
      const subKey = (typeof keyPathHint === 'string' && keyPathHint.startsWith(`${rootKey}.`))
        ? keyPathHint.substring(rootKey.length + 1)
        : (primarySub?.hashTag || subDefs[0]?.hashTag);
      if (!subKey || typeof subKey !== 'string') return null;
      if (value === null || value === undefined || value === '') return null;
      return { idxKeyPath: `${rootKey}.${subKey}`, idxValue: String(value) };
    }

    // スカラー型
    const leaf = (isObj(value) && Object.prototype.hasOwnProperty.call(value, rootKey)) ? value[rootKey] : value;
    if (leaf === null || leaf === undefined || leaf === '') return null;
    return { idxKeyPath: rootKey, idxValue: String(leaf) };
  };

  const buildIndexHref = (workId, dbName, idxValue, idxKeyPath) => {
    const cur = getQS();
    const legacyNum = idxKeyPath === 'Num' ? idxValue : '';
    const qs = new URLSearchParams({
      ...cur,
      work: workId,
      db: dbName,
      idx: String(idxValue ?? ''),
      idxKey: String(idxKeyPath ?? ''),
      num: legacyNum,
    });
    return `${location.pathname}?${qs.toString()}`;
  };

  const toDisplayNode = (k, v, schemaType = null, schemaDisplay = null) => {
    // typedef 上で「子フィールド定義が存在するobject」は、子ごとに表示（[object Object]回避 + 分離表示）
    if (isPlainObject(v) && k && typeof k === 'string' && hasNestedSchema(k)) {
      const expanded = formatObjectChildren(k, v, { separator: '\n' });
      if (expanded) return expanded.includes('\n') ? preWrapText(expanded) : expanded;
    }

    // スキーマ的に Summary 系 or 文字列改行は pre-wrap
    if (typeof v === 'string' && v.includes('\n')) return preWrapText(v);
    if (schemaType != null && isSummaryType(schemaType)) {
      const formatted = typeof v === 'string'
        ? v
        : formatValueForDisplay(v, fieldLabelMap, metaForLookup, globalDefType, { display: schemaDisplay, schemaType, fieldKey: k });
      if (formatted && String(formatted).includes('\n')) return preWrapText(formatted);
      // Summary でも単行の場合は preWrap にしておく（安全側）
      return preWrapText(formatted);
    }
    const formatted = formatValueForDisplay(v, fieldLabelMap, metaForLookup, globalDefType, { display: schemaDisplay, schemaType, fieldKey: k });
    if (typeof formatted === 'string' && formatted.includes('\n')) return preWrapText(formatted);

    // #Index 型はリンク化（直リンク共有を容易にする）
    try {
      if (schemaTypeIncludes(schemaType, '#Index') && typeof formatted === 'string' && formatted.trim()) {
        const workIndexDef = getWorkIndexField(workId, globalMeta);
        const info = buildIndexLinkInfoFromValue(v, workIndexDef, k);
        if (info?.idxValue && info?.idxKeyPath) {
          const href = buildIndexHref(workId, dbName, info.idxValue, info.idxKeyPath);
          return el('a', {
            href,
            title: '直リンクをコピーできます',
            onclick: async (ev) => {
              // 可能なら SPA 内で開く（失敗時は通常遷移にフォールバック）
              ev.preventDefault();
              ev.stopPropagation();
              try {
                const state = window.__CHAR_STATE__;
                const recs = Array.isArray(state?.records) ? state.records : [];
                const indexDef = getWorkIndexField(workId, globalMeta);
                const target = recs.find(r => recordMatchesIndexQuery(r, indexDef, info.idxValue, info.idxKeyPath, info.idxKeyPath === 'Num' ? info.idxValue : '')) || null;
                if (target) {
                  await openDetail(target);
                  return;
                }
              } catch {
                // noop
              }
              location.href = href;
            }
          }, [formatted]);
        }
      }
    } catch {
      // noop
    }
    return formatted;
  };

  // $display.section に基づいて未表示フィールドを自動分類（basic/profile/spec/other）
  const normalizeSection = (s) => {
    const v = String(s ?? '').trim();
    if (v === 'basic' || v === 'profile' || v === 'spec' || v === 'other') return v;
    // Images は左カラムのギャラリー担当（ここには出さない）
    return '';
  };

  const sectionBuckets = {
    basic: /** @type {Array<{key:string,label:string,type:any,display:any,value:any}>} */ ([]),
    profile: /** @type {Array<{key:string,label:string,type:any,display:any,value:any}>} */ ([]),
    spec: /** @type {Array<{key:string,label:string,type:any,display:any,value:any}>} */ ([]),
    other: /** @type {Array<{key:string,label:string,type:any,display:any,value:any}>} */ ([]),
  };

  const pushToBucket = (section, item) => {
    const sec = sectionBuckets[section] ? section : 'other';
    sectionBuckets[sec].push(item);
  };

  // 1) スキーマ順（トップレベル）で分類
  for (const f of schemaFields) {
    if (!f || typeof f !== 'object') continue;
    if (shownKeys.has(f.key)) continue;

    // *_JP/_EN の同義ペアは 1 つの base キーとしてまとめて表示
    // - スキーマに base が無くても、JP/EN があれば base として表示できる
    const langInfo = parseLangSuffix(f.key);
    if (langInfo && langInfo.base) {
      const base = langInfo.base;
      const variantKeys = [base, `${base}_JP`, `${base}_EN`];
      const anyShown = variantKeys.some(k => shownKeys.has(k));
      if (!anyShown) {
        // suppressKeys / auto:false を尊重（どれかが抑止対象なら表示しない）
        const suppressed = Array.isArray(detailLayout?.suppressKeys)
          && (detailLayout.suppressKeys.includes(base) || detailLayout.suppressKeys.includes(`${base}_JP`) || detailLayout.suppressKeys.includes(`${base}_EN`));
        if (!suppressed) {
          const { text, usedKeys } = formatBilingualGroup(base);
          if (text) {
            // 表示セクションは JP/EN 側の $display.section を優先して解釈
            const displayHint = fieldDisplayMap?.[f.key] ?? fieldDisplayMap?.[base] ?? null;
            if (!(displayHint && typeof displayHint === 'object' && displayHint.auto === false)) {
              const sec = normalizeSection(displayHint?.section) || (isSummaryType(f.type) ? 'profile' : 'other');
              pushToBucket(sec || 'other', {
                key: base,
                label: getFieldLabel(base, fieldLabelMap, workMeta, globalDefType, base),
                // すでに統合済み文字列のため、後段の formatValueForDisplay を避ける
                type: null,
                display: null,
                value: text
              });
              // base/JP/EN すべて抑止対象にする
              shownKeys.add(base);
              for (const uk of usedKeys) shownKeys.add(uk);
              continue;
            }
          }
        }
      }

      // ここに来た場合は統合表示しない（または既に表示済み）ので、このキー自体は抑止
      shownKeys.add(f.key);
      continue;
    }

    // スキーマが base キーのみでも、実データに *_JP/_EN がある場合は統合して表示
    if (f.key && typeof f.key === 'string') {
      const base = f.key;
      const hasBilingual = rec && (Object.prototype.hasOwnProperty.call(rec, `${base}_JP`) || Object.prototype.hasOwnProperty.call(rec, `${base}_EN`));
      if (hasBilingual) {
        const suppressed = Array.isArray(detailLayout?.suppressKeys)
          && (detailLayout.suppressKeys.includes(base) || detailLayout.suppressKeys.includes(`${base}_JP`) || detailLayout.suppressKeys.includes(`${base}_EN`));
        if (!suppressed) {
          const { text, usedKeys } = formatBilingualGroup(base);
          if (text) {
            const displayHint = fieldDisplayMap?.[`${base}_JP`] ?? fieldDisplayMap?.[`${base}_EN`] ?? fieldDisplayMap?.[base] ?? null;
            if (!(displayHint && typeof displayHint === 'object' && displayHint.auto === false)) {
              const sec = normalizeSection(displayHint?.section) || (isSummaryType(f.type) ? 'profile' : 'other');
              pushToBucket(sec || 'other', {
                key: base,
                label: getFieldLabel(base, fieldLabelMap, workMeta, globalDefType, base),
                type: null,
                display: null,
                value: text
              });
              shownKeys.add(base);
              for (const uk of usedKeys) shownKeys.add(uk);
              continue;
            }
          }
        }

        // 統合表示しない場合でも、派生キーは二重表示しない
        shownKeys.add(`${base}_JP`);
        shownKeys.add(`${base}_EN`);
      }
    }

    // db_meta.json の $DetailLayout で抑止されたキーは自動表示しない
    if (Array.isArray(detailLayout?.suppressKeys) && detailLayout.suppressKeys.includes(f.key)) {
      shownKeys.add(f.key);
      continue;
    }

    // db_type.json の $display.auto=false は自動表示しない（別名/統合表示用）
    if (f.display && typeof f.display === 'object' && f.display.auto === false) {
      shownKeys.add(f.key);
      continue;
    }

    const { value: v, usedKey } = getValueWithAlt(f.key);

    // $alt で代替キーを使う場合、代替側が既に表示済みなら二重表示しない
    if (usedKey && usedKey !== f.key && shownKeys.has(usedKey)) {
      shownKeys.add(f.key);
      continue;
    }

    if (shouldSkipKey(f.key, v)) continue;

    const sec = normalizeSection(f.display?.section) || (isSummaryType(f.type) ? 'profile' : 'other');
    // section が未指定/不正の場合は other
    const labelKey = (usedKey && usedKey !== f.key) ? usedKey : f.key;

    // 表示整形は fieldTypeMap/fieldDisplayMap を優先（schemaFields 側の type が配列/オブジェクトの場合でも enum 判定できるようにする）
    const resolvedType = fieldTypeMap?.[labelKey] ?? fieldTypeMap?.[f.key] ?? f.type ?? null;
    const resolvedDisplay = fieldDisplayMap?.[labelKey] ?? fieldDisplayMap?.[f.key] ?? f.display ?? null;
    pushToBucket(sec || 'other', {
      key: labelKey,
      label: getFieldLabel(labelKey, fieldLabelMap, workMeta, globalDefType, labelKey),
      type: resolvedType,
      display: resolvedDisplay,
      value: v
    });
    shownKeys.add(f.key);

    // $alt で参照した代替キーも抑止対象にする
    if (usedKey && usedKey !== f.key) {
      shownKeys.add(usedKey);
    }
  }

  // 2) スキーマ外（追加/互換/暫定）は other 扱いでフォールバック表示
  for (const [k, v] of Object.entries(rec || {})) {
    if (schemaKeySet.has(k)) continue;
    if (shouldSkipKey(k, v)) continue;

    // スキーマ外でも typedef 由来の type/display が分かる場合は表示整形に活用
    const resolvedType = fieldTypeMap?.[k] ?? null;
    const resolvedDisplay = fieldDisplayMap?.[k] ?? null;
    pushToBucket('other', {
      key: k,
      label: getFieldLabel(k, fieldLabelMap, workMeta, globalDefType, k),
      type: resolvedType,
      display: resolvedDisplay,
      value: v
    });
  }

  const buildKvRows = (items) => (items || [])
    .map((it) => {
      if (!it) return null;
      const node = toDisplayNode(it.key, it.value, it.type, it.display);
      const text = (typeof node === 'string') ? node.trim() : String(node?.textContent ?? '').trim();
      if (!text) return null;
      return [it.label, node];
    })
    .filter(Boolean);

  const profileItems = sectionBuckets.profile
    .map((it) => {
      const node = toDisplayNode(it.key, it.value, it.type, it.display);
      const text = (typeof node === 'string') ? node : (node?.textContent ?? '');
      if (!text) return null;
      return el('div', { style: 'margin-bottom: 10px;' }, [
        el('div', { class: 'tag', style: 'margin-bottom: 6px;' }, [it.label]),
        (typeof node === 'string') ? preWrapText(node) : node
      ]);
    })
    .filter(Boolean);

  const otherRows = buildKvRows(sectionBuckets.other);
  const specRows = buildKvRows(sectionBuckets.spec);
  const basicExtraRows = buildKvRows(sectionBuckets.basic);

  // basic セクションは「基本情報テーブル + スキーマで basic 指定された追加項目」をまとめて表示
  const basicSection = el('div', { class: 'section' }, [
    el('h3', {}, [getFieldLabel('BasicInfo', fieldLabelMap, workMeta, globalDefType, '基本情報')]),
    basic,
    basicExtraRows.length ? kvTable({}, basicExtraRows) : null,
    (belong || area || days.length) ? kvTable({}, [
      belong ? [getFieldLabel('Belonging', fieldLabelMap, workMeta, globalDefType, '所属'), belong] : null,
      area ? [getFieldLabel('Area', fieldLabelMap, workMeta, globalDefType, '地域'), area] : null,
      days.length ? [getFieldLabel('AnivDay', fieldLabelMap, workMeta, globalDefType, '記念日'), days.join(' / ')] : null,
    ].filter(Boolean)) : null,
  ].filter(Boolean));

  const specSection = (abilityTags.length || effTags.length || safetyRow || specNodes.length || specRows.length)
    ? el('div', { class: 'section' }, [
        el('h3', {}, ['スペック/能力']),
        abilityGrid,
        (effGrid || safetyRow) ? el('div', {}, [effGrid, safetyRow].filter(Boolean)) : null,
        specNodes.length ? kvTable({}, [[getFieldLabel('SpecType', fieldLabelMap, workMeta, globalDefType, '型情報'), el('div', {}, specNodes)]]) : null,
        specRows.length ? kvTable({}, specRows) : null,
      ].filter(Boolean))
    : null;

  const profileSection = (rec.Summary || profileItems.length)
    ? el('div', { class: 'section' }, [
        el('h3', {}, [getFieldLabel('Profile', fieldLabelMap, workMeta, globalDefType, 'プロフィール/テキスト')]),
        rec.Summary ? el('div', {}, [
          el('div', { class: 'tag', style: 'margin-bottom: 6px;' }, [getFieldLabel('Summary', fieldLabelMap, workMeta, globalDefType, '概要')]),
          preWrapText(rec.Summary)
        ]) : null,
        profileItems.length ? el('div', {}, profileItems) : null,
      ].filter(Boolean))
    : null;

  const otherSection = otherRows.length
    ? el('div', { class: 'section' }, [
        el('h3', {}, [getFieldLabel('AllFields', fieldLabelMap, workMeta, globalDefType, 'その他の項目')]),
        kvTable({}, otherRows)
      ])
    : null;

  const right = el('div', {}, [
    titleRow,
    basicSection,
    specSection,
    profileSection,
    otherSection,
    rec.Relation && (rec.Relation.Related || rec.Relation.Commented)
      ? renderRelations(rec.Relation, fieldLabelMap, metaForLookup, globalDefType, fieldDisplayMap, { containerKey: 'Relation' })
      : null,
    rec.RelationToPrimary && (rec.RelationToPrimary.Related || rec.RelationToPrimary.Commented)
      ? renderRelations(rec.RelationToPrimary, fieldLabelMap, metaForLookup, globalDefType, fieldDisplayMap, { containerKey: 'RelationToPrimary' })
      : null,
    // 参照解決結果の表示（_DBLinkResolved）
    rec._DBLinkResolved ? renderDBLinkResolved(rec._DBLinkResolved, fieldLabelMap, metaForLookup, globalDefType) : null
  ].filter(Boolean));

  mount.appendChild(el('div', { class: 'detail' }, [left, right]));

  // デバッグ: 画面内に「生コード（例: FemaleNeutral）」が残っている箇所を自動検出
  // - 辞書解決自体は成功しているのに表示が変わらない場合、どのDOMノードが raw を出しているかを特定する
  try {
    if ($('#chk-debug')?.checked) {
      const rawGT = rec?.GenderType;
      if (typeof rawGT === 'string' && rawGT.trim()) {
        const needle = rawGT.trim();

        /**
         * 要素の簡易パス（tag#id.class...）を作る
         * @param {Element|null} el
         */
        const briefElPath = (el) => {
          if (!el || !(el instanceof Element)) return '';
          const parts = [];
          let cur = el;
          for (let i = 0; i < 6 && cur; i++) {
            const tag = (cur.tagName || '').toLowerCase();
            const id = cur.id ? `#${cur.id}` : '';
            const cls = (cur.classList && cur.classList.length)
              ? `.${Array.from(cur.classList).slice(0, 3).join('.')}`
              : '';
            parts.push(`${tag}${id}${cls}`);
            cur = cur.parentElement;
            if (cur === mount) break;
          }
          return parts.join(' <- ');
        };

        const hits = [];
        const walker = document.createTreeWalker(mount, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const text = String(node?.nodeValue ?? '').trim();
          if (!text) continue;
          if (!text.includes(needle)) continue;

          const parent = node.parentElement;
          const tr = parent ? parent.closest('tr') : null;
          const thText = tr ? String(tr.querySelector('th')?.textContent ?? '').trim() : '';
          hits.push({ text, th: thText, path: briefElPath(parent) });
          if (hits.length >= 12) break;
        }

        if (hits.length) {
          console.warn('🧭 raw GenderType appears in rendered detail DOM:', { needle, hits });
        } else {
          console.log('🧭 raw GenderType not found in rendered detail DOM:', { needle });
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ raw GenderType DOM scan failed:', e);
  }

  } catch (error) {
    console.error('Error rendering detail view:', error);
    mount.textContent = '';
    mount.appendChild(el('div', {
      style: 'padding: 20px; text-align: center; color: red;'
    }, [`エラー: 詳細情報の読み込みに失敗しました (${error && error.message ? error.message : String(error)})`]));
  }
}

/**
 * 関係（Relation）を typedef/meta 駆動で表示する
 * - RelationLabel は #List_RelationLabel（db_meta.json の $VarsDef）を参照してJP化
 * @param {Object} rel
 * @param {Object} fieldLabelMap
 * @param {Object} workMeta
 * @param {Object} globalDefType
 * @returns {HTMLElement}
 */
function renderRelations(rel, fieldLabelMap, workMeta, globalDefType, fieldDisplayMap = null, options = {}) {
  const containerKey = (typeof options?.containerKey === 'string' && options.containerKey.trim())
    ? options.containerKey.trim()
    : 'Relation';

  const related = Array.isArray(rel?.Related) ? rel.Related : [];
  const commented = Array.isArray(rel?.Commented) ? rel.Commented : [];

  const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  // 作品の Index 定義（typedef の $IndexDef）を取得し、Relation の Num から該当キャラへジャンプできるようにする
  const state = window.__CHAR_STATE__;
  const workId = state?.workId || '';
  const indexDef = workId ? getWorkIndexField(workId, workMeta) : null;

  const findRecordByIndex = (id) => {
    if (!id || typeof id !== 'object') return null;
    if (!state || !Array.isArray(state.records)) return null;
    const idxValue = String(id.value || '').trim();
    const idxKeyPath = String(id.keyPath || '').trim();
    if (!idxValue) return null;
    return state.records.find(r => recordMatchesIndexQuery(r, indexDef, idxValue, idxKeyPath, idxKeyPath === 'Num' ? idxValue : '')) || null;
  };

  const buildIndexHref = (id) => {
    try {
      const cur = getQS();
      const qs = new URLSearchParams({
        work: String(cur.work || ''),
        db: String(cur.db || ''),
        q: String(cur.q || ''),
        idx: String(id?.value || ''),
        idxKey: String(id?.keyPath || ''),
        num: (id?.keyPath === 'Num') ? String(id?.value || '') : ''
      });
      return `${location.pathname}?${qs.toString()}`;
    } catch {
      return '#';
    }
  };

  const getIndexIdentifierFromRelation = (r) => {
    if (!r || typeof r !== 'object') return null;
    if (!indexDef || typeof indexDef !== 'object') return null;
    const rootKey = indexDef.hashTag;
    if (!rootKey || typeof rootKey !== 'string') return null;

    const subDefs = getIndexSubDefs(indexDef);

    // ネスト型
    if (Array.isArray(subDefs) && subDefs.length > 0) {
      const rootObj = isPlainObject(r?.[rootKey]) ? r[rootKey] : r;
      if (!isPlainObject(rootObj)) return null;

      const primarySub = pickPrimaryIndexSubDef(subDefs);
      const candidates = primarySub ? [primarySub, ...subDefs.filter(d => d !== primarySub)] : subDefs;
      for (const sub of candidates) {
        const subKey = sub?.hashTag;
        if (!subKey || typeof subKey !== 'string') continue;
        const v = rootObj[subKey];
        if (v === null || v === undefined || v === '') continue;
        return { keyPath: `${rootKey}.${subKey}`, value: String(v).trim() };
      }
      return null;
    }

    // スカラー型
    const v = (r?.[rootKey] === null || r?.[rootKey] === undefined || r?.[rootKey] === '')
      ? r?.Num
      : r?.[rootKey];
    const vv = (v === null || v === undefined) ? '' : String(v).trim();
    if (!vv) return null;
    return { keyPath: rootKey, value: vv };
  };

  const pickRelationLabelCode = (x) => {
    if (x === null || x === undefined) return '';
    if (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') return String(x).trim();
    if (!isPlainObject(x)) return '';
    const jp = x.RelationLabel_JP || x.relationLabel_JP;
    const raw = x.RelationLabel || x.relationLabel;
    const en = x.RelationLabel_EN || x.relationLabel_EN;
    const picked = (typeof jp === 'string' && jp.trim()) ? jp : (typeof raw === 'string' && raw.trim()) ? raw : (typeof en === 'string' && en.trim()) ? en : '';
    return String(picked || '').trim();
  };

  const localizeRelationLabels = (labels) => {
    const pathKey = `${containerKey}.Related.RelationLabel`;
    const displayOpt = (fieldDisplayMap && typeof fieldDisplayMap === 'object')
      ? (fieldDisplayMap[pathKey] || fieldDisplayMap.RelationLabel || null)
      : null;
    const arr = Array.isArray(labels) ? labels : [];
    return arr
      .map((x) => {
        const raw = pickRelationLabelCode(x);
        if (!raw) return '';
        const pack = resolveVarsDefLabelPack('RelationLabel', raw, globalDefType, workMeta, pathKey);
        return formatBilingualLabel(pack, raw, displayOpt);
      })
      .filter(Boolean);
  };

  const renderRelTag = (prefix, r, withLabels) => {
    const num = (r?.Num === null || r?.Num === undefined) ? '' : String(r.Num).trim();
    const comments = (r?.Comments === null || r?.Comments === undefined) ? '' : String(r.Comments);
    const labels = withLabels ? localizeRelationLabels(r?.RelationLabel) : [];
    const labelText = labels.length ? labels.join(', ') : '';

    // クリックで該当キャラへ移動できるように、Index 定義がある場合はリンク化
    const id = getIndexIdentifierFromRelation(r);
    const target = id ? findRecordByIndex(id) : null;

    const hasNewline = (s) => (typeof s === 'string' && s.includes('\n'));
    if (hasNewline(comments) || hasNewline(labelText)) {
      // 改行がある場合は従来どおり preWrapText を優先（リンクは諦める）
      const main = [
        `${prefix} ${num || (id?.value || '?')}`,
        labelText ? `: ${labelText}` : '',
        comments ? `${labelText ? ' ' : ': '}- ${comments}` : ''
      ].join('');
      return el('div', { class: 'tag' }, [(main.includes('\n')) ? preWrapText(main) : main]);
    }

    const children = [];
    children.push(`${prefix} `);

    if (id && target) {
      const name = target?.Name || target?.FormalName || target?.ModelName || target?.Name_EN || '';
      children.push(el('a', {
        href: buildIndexHref(id),
        title: name ? `開く: ${name}` : '開く',
        onclick: (ev) => {
          try { ev.preventDefault(); } catch (_) { /* no-op */ }
          openDetail(target);
        }
      }, [id.value]));
    } else {
      children.push(num || (id?.value || '?'));
    }

    if (labelText) children.push(`: ${labelText}`);
    if (comments) children.push(`${labelText ? ' ' : ': '}- ${comments}`);

    return el('div', { class: 'tag' }, children);
  };

  const r1 = related.map(r => renderRelTag('→', r, true));
  const r2 = commented.map(r => renderRelTag('←', r, false));

  return el('div', { class: 'section' }, [
    el('h3', {}, [getFieldLabel(containerKey, fieldLabelMap, workMeta, globalDefType, containerKey === 'RelationToPrimary' ? '原作との関係' : '関係')]),
    el('div', { class: 'kv-grid' }, [...r1, ...r2])
  ]);
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
                  record.RaceType ? el('span', { class: 'chip', style: 'margin-right: 4px;' }, [
                    formatValueForDisplay(record.RaceType, {}, workMeta, globalDefType, {
                      schemaType: '#ListIndex|#ListIndex_withAbout[]',
                      fieldKey: 'RaceType'
                    })
                  ]) : null,
                  record.GenderType ? el('span', { class: 'chip', style: 'margin-right: 4px;' }, [
                    formatValueForDisplay(record.GenderType, {}, workMeta, globalDefType, {
                      schemaType: '$EnumDef|$EnumDef_withAbout',
                      fieldKey: 'GenderType'
                    })
                  ]) : null
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
    setQS({ work: wk.replace('#', ''), db: '', num: '', idx: '', idxKey: '' });
    await populateDBs(wk);
    await reload();
  };

  window.__eventHandlers.dbChange = async (e) => {
    const db = e.target.value;
    setQS({ db, num: '', idx: '', idxKey: '' });
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
    setQS({ num: '', idx: '', idxKey: '' });
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
  sel.textContent = '';
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
  sel.textContent = '';
  const dbs = await listWorkDBs(workKey);
  for (const d of dbs) {
    const opt = el('option', { value: d.key }, [d.key]);
    if (d.key === initialDB) opt.selected = true;
    sel.appendChild(opt);
  }
  if (!sel.value && dbs[0]) sel.value = dbs[0].key;
  return sel.value;
}

async function openDetail(rec) {
  const state = window.__CHAR_STATE__;
  $('#list-view').hidden = true;
  $('#detail-view').hidden = false;
  renderDetail(state.workId, rec);

  // 作品ごとのインデックス定義に従って、直リンク用パラメータを更新
  try {
    const globalMeta = await fetchGlobalMeta();
    const indexDef = getWorkIndexField(state.workId, globalMeta);
    const id = getIndexIdentifierFromRecord(rec, indexDef);
    if (id) {
      const legacyNum = id.keyPath === 'Num' ? id.value : '';
      setQS({ idx: id.value, idxKey: id.keyPath, num: legacyNum });
    } else if (rec.Num != null) {
      // 最小互換
      setQS({ num: String(rec.Num), idx: '', idxKey: '' });
    }
  } catch {
    if (rec.Num != null) setQS({ num: String(rec.Num) });
  }
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

  // リロードで流れたSW失敗ログを、初期化前に再掲（引用できるようにする）
  replayRememberedSwInitError();

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

    // SW controller を取得するための自動リロード中は、エラー表示を出さない
    if (String(error?.message || error || '') === 'SW_CONTROLLER_RELOAD') {
      return;
    }

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
  const errorDetails = getSafeErrorMessage(error);
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
 * Normalize any error-like value to a safe text message.
 * Ensures we only ever render plain text into the DOM.
 * @param {unknown} error
 * @returns {string}
 */
function getSafeErrorMessage(error) {
  if (error instanceof Error) {
    return String(error.message || '');
  }
  try {
    return String(error ?? '');
  } catch {
    return '';
  }
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

    // 直リンク: idx/idxKey（汎用） または num（旧互換）
    const globalMeta = await fetchGlobalMeta();
    const indexDef = getWorkIndexField(workId, globalMeta);
    const idxValue = qs.idx || qs.num;
    const idxKeyPath = qs.idxKey || (qs.num ? 'Num' : '');
    if (idxValue) {
      const target = recs.find(r => recordMatchesIndexQuery(r, indexDef, idxValue, idxKeyPath, qs.num));
      if (target) {
        openDetail(target);
      } else {
        console.warn('⚠️ Character not found for index:', { idxValue, idxKeyPath, legacyNum: qs.num });
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
        content.textContent = '';
        content.appendChild(el('div', {}, [`Used: ${((memory.usedJSHeapSize || 0) / 1024 / 1024).toFixed(1)}MB`]));
        content.appendChild(el('div', {}, [`Total: ${((memory.totalJSHeapSize || 0) / 1024 / 1024).toFixed(1)}MB`]));
        content.appendChild(el('div', {}, [`Time: ${performance.now().toFixed(0)}ms`]));
        content.appendChild(el('div', {}, [`Records: ${window.__CHAR_STATE__?.records?.length || 0}`]));
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
    const fallbackError = el('div', {
      style: 'padding: 20px; color: red;'
    }, [`初期化エラー: ${err && err.message ? err.message : String(err)}`]);
    document.body.textContent = '';
    document.body.appendChild(fallbackError);
  });
}

// Add performance monitor in development
addPerformanceMonitor();
