/**
 * worker.js — 100BeautiesLab CreationsDB Cloudflare Workers エントリーポイント
 *
 * @description
 *   Cloudflare Workers 上で動作する真のサーバーサイド API。
 *   GitHub Pages で配信されている静的 JSON を fetch で取得し、
 *   Service Worker 版 (/pages/v1) と同等のルーティングと参照解決を提供する。
 *
 *   エンドポイント一覧:
 *     GET /api/v1/meta                              — グローバルメタ
 *     GET /api/v1/works                             — 作品一覧
 *     GET /api/v1/:work/meta                        — 作品別メタ
 *     GET /api/v1/:work/dbs                         — DB 一覧
 *     GET /api/v1/:work/:db/records                 — レコード一覧
 *     GET /api/v1/:work/:db/records/:idx            — レコード 1 件（Num インデックス）
 *     GET /api/v1/:work/:db/records/:idx?idxKey=X   — インデックスキー指定
 *     GET /api/v1/:work/:db/search?q=キーワード      — 全文検索
 *     GET /api/v1/:work/search?q=キーワード          — 作品横断検索
 *
 * @author 100BeautiesLab.
 * @version 1.0.0
 */

// ─────────────────────────────────────────────────────────────────────────────
// 環境変数
//   wrangler.toml または Cloudflare ダッシュボードで設定する。
//   REPO_BASE_URL: GitHub Pages のベース URL（末尾スラッシュなし）
//                  例: https://radiann-kswg.github.io/100BeautiesLab_CreationsDB
// ─────────────────────────────────────────────────────────────────────────────

/** @type {string} */
const DEFAULT_REPO_BASE_URL =
  "https://radiann-kswg.github.io/100BeautiesLab_CreationsDB";

// ─────────────────────────────────────────────────────────────────────────────
// セキュリティユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

const SAFE_TOKEN_RE = /^[A-Za-z0-9_]+$/;
const VALID_JSON_FILE_RE = /^[A-Za-z0-9_.\-]+\.json$/;

/**
 * 英数字とアンダースコアのみ許可するトークン検証（パストラバーサル防止）
 * @param {unknown} s
 * @returns {boolean}
 */
function isSafeToken(s) {
  return typeof s === "string" && SAFE_TOKEN_RE.test(s);
}

/**
 * JSON ファイル名として安全か検証
 * @param {unknown} s
 * @returns {boolean}
 */
function isValidJsonFile(s) {
  return typeof s === "string" && VALID_JSON_FILE_RE.test(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// パス / キー 正規化ユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 先頭文字を大文字化
 * @param {string} s
 * @returns {string}
 */
function capitalize(s) {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

/**
 * 作品 ID を '#Works_<Name>' 形式に正規化
 * @param {string} workId
 * @returns {string|null}
 */
function toWorkKey(workId) {
  if (!workId) return null;
  const raw = workId.trim();
  let normalized;
  if (raw.startsWith("#Works_"))     normalized = raw;
  else if (raw.startsWith("Works_")) normalized = `#${raw}`;
  else                               normalized = `#Works_${raw}`;
  const m = normalized.match(/^#Works_([A-Za-z0-9_]+)$/);
  return m ? `#Works_${m[1]}` : null;
}

/**
 * '#Works_XXX' → 'Works_XXX'
 * @param {string} workKey
 * @returns {string}
 */
function resolveWorkDir(workKey) {
  return (workKey || "").replace(/^#Works_/, "Works_");
}

/**
 * '#DB_Primary' / 'Primary' → 'Primary'
 * @param {string} dbName
 * @returns {string}
 */
function stripMetaDbPrefix(dbName) {
  return (dbName || "").replace(/^#?(DB|Ref)_/i, "").replace(/^#/, "");
}

/**
 * 'Primary' → '#DB_Primary'
 * @param {string} dbName
 * @returns {string}
 */
function normalizeDbKeyForMeta(dbName) {
  return `#DB_${capitalize(stripMetaDbPrefix(dbName))}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP フェッチ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * JSON ファイルを GitHub Pages からフェッチ
 * @param {string} repoBaseUrl
 * @param {string} path - '/data/...' 形式のパス
 * @param {Request} incomingRequest - キャッシュヒントに使う
 * @returns {Promise<object|null>}
 */
async function fetchJson(repoBaseUrl, path, incomingRequest) {
  const url = `${repoBaseUrl}${path}`;
  try {
    // Cloudflare Cache API でキャッシュ（CF Workers 環境でのみ有効）
    const cacheKey = new Request(url, { method: "GET" });
    let cache;
    try { cache = caches.default; } catch { /* ローカルテスト時はスキップ */ }

    if (cache) {
      const cached = await cache.match(cacheKey);
      if (cached) return cached.json();
    }

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 300, cacheEverything: true }, // Cloudflare 独自: 5 分キャッシュ
    });
    if (!res.ok) return null;

    const data = await res.json();

    // Cloudflare Cache に保存
    if (cache) {
      const cacheRes = new Response(JSON.stringify(data), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300",
        },
      });
      await cache.put(cacheKey, cacheRes);
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * ファイルが存在するか HEAD リクエストで確認
 * @param {string} repoBaseUrl
 * @param {string} path
 * @returns {Promise<boolean>}
 */
async function fileExists(repoBaseUrl, path) {
  const url = `${repoBaseUrl}${path}`;
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// メタ読み込み
// ─────────────────────────────────────────────────────────────────────────────

/**
 * グローバルメタ (data/db_meta.json) を取得
 * @param {string} base
 * @param {Request} req
 * @returns {Promise<object>}
 */
async function getGlobalMeta(base, req) {
  const meta = await fetchJson(base, "/data/db_meta.json", req);
  if (!meta) throw new ApiError(503, "Global meta unavailable");
  return meta;
}

/**
 * 作品別メタ (data/Works_X/DataBases/db_meta.json) を取得
 * @param {string} base
 * @param {string} workKey - '#Works_XXX' 形式
 * @param {Request} req
 * @returns {Promise<object|null>}
 */
async function getWorkMeta(base, workKey, req) {
  const workDir = resolveWorkDir(workKey);
  return fetchJson(base, `/data/${workDir}/DataBases/db_meta.json`, req);
}

// ─────────────────────────────────────────────────────────────────────────────
// DB ファイル解決
// ─────────────────────────────────────────────────────────────────────────────

/** DB 名 → 既定ファイル名の対応マップ */
const CONVENTIONAL_DB_FILES = {
  Primary:        "db_Primary.json",
  Secondary:      "db_Secondary.json",
  SemiPrimary:    "db_SemiPrimary.json",
  SelfSecondary:  "db_SelfSecondary.json",
  Proxy:          "db_Proxy.json",
  Mobs:           "db_Mobs.json",
};

/**
 * DB レコード配列を取得する。
 * db_meta.json で DB_File が宣言されていれば優先し、なければ候補ファイル名を順番に試す。
 *
 * @param {string} base
 * @param {string} workKey
 * @param {string} dbName
 * @param {object|null} workMeta
 * @param {Request} req
 * @returns {Promise<{records: object[], dbEntry: object}>}
 */
async function resolveAndFetchDb(base, workKey, dbName, workMeta, req) {
  const norm = stripMetaDbPrefix(dbName);
  if (!isSafeToken(norm)) throw new ApiError(400, "Invalid dbName");
  const key = capitalize(norm);

  const databases = workMeta?.Databases ?? {};
  const metaKey = `#DB_${key}`;
  const refKey = `#Ref_${key}`;
  const dbEntry = databases[metaKey] ?? databases[refKey] ?? {};
  const isRef = !!databases[refKey];

  const layerRaw = (dbEntry.DB_Layer || "").trim();
  const layer = isSafeToken(layerRaw) ? layerRaw : "DataBases";
  const fileRaw = (dbEntry.DB_File || "").trim();
  const configuredFile = isValidJsonFile(fileRaw) ? fileRaw : "";
  const defaultPrefix = isRef ? "ref_" : "db_";
  const workDir = resolveWorkDir(workKey);
  const basePath = `/data/${workDir}/${layer}`;

  const candidates = [
    configuredFile,
    CONVENTIONAL_DB_FILES[key],
    `${defaultPrefix}${key}.json`,
    key !== norm ? `${defaultPrefix}${norm}.json` : null,
    defaultPrefix !== "db_" ? `db_${key}.json` : null,
  ].filter(Boolean);

  for (const fname of candidates) {
    const path = `${basePath}/${fname}`;
    if (await fileExists(base, path)) {
      const records = await fetchJson(base, path, req);
      if (Array.isArray(records)) return { records, dbEntry };
    }
  }
  throw new ApiError(404, `DB not found: ${dbName}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// _Commons 適用
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 値が _Commons 補完対象の「空」かどうか判定
 * @param {unknown} v
 * @returns {boolean}
 */
function isEmptyForCommons(v) {
  if (v === undefined || v === null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") {
    if (v.hideText !== undefined) return false; // hideText は意図的マスク
    return Object.keys(v).length === 0;
  }
  return false;
}

/**
 * _Commons をレコード配列に適用する（非破壊）
 * @param {object[]} records
 * @param {object|null} workMeta
 * @param {string} dbName
 * @returns {object[]}
 */
function applyCommons(records, workMeta, dbName) {
  if (!workMeta) return records;
  const dbKey = normalizeDbKeyForMeta(dbName);
  const databases = workMeta?.Databases ?? {};
  const dbInfo = databases[dbKey] ?? {};
  const commons = dbInfo._Commons ?? null;
  const secDefs = dbInfo._Secondaries ?? dbInfo.Secondaries ?? null;
  if (!commons && !secDefs) return records;

  /** デフォルト値オブジェクトを構築 */
  function buildDefaults(cmn) {
    if (!cmn) return {};
    return Object.fromEntries(
      Object.entries(cmn).filter(([k]) => !k.startsWith("_") && !k.startsWith("#"))
    );
  }

  /** rec に合致する _Secondaries エントリの defaults を返す */
  function findSecDefaults(rec) {
    if (!secDefs) return {};
    let fallback = null;
    for (const def of secDefs) {
      const defCmn = def._Commons;
      if (!defCmn) continue;
      const defTitle = def.sec_SeriesTitle ?? def.SecondarySeriesTitle;
      if (!defTitle) { fallback ??= buildDefaults(defCmn); continue; }
      const recTitle = rec.sec_SeriesTitle ?? rec.SecondarySeriesTitle;
      if (recTitle === defTitle) return buildDefaults(defCmn);
    }
    return fallback ?? {};
  }

  return records.map((rec) => {
    const defaults = { ...buildDefaults(commons), ...findSecDefaults(rec) };
    if (Object.keys(defaults).length === 0) return rec;
    const copy = { ...rec };
    for (const [k, v] of Object.entries(defaults)) {
      if (k.startsWith("#")) continue;
      if (isEmptyForCommons(copy[k])) copy[k] = v;
    }
    return copy;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// レコードフィルタリング
// ─────────────────────────────────────────────────────────────────────────────

/**
 * isPrivate フラグによる非公開レコード除外
 * @param {object} rec
 * @returns {boolean}
 */
function isPublicRecord(rec) {
  const v = rec?.isPrivate;
  if (v === undefined || v === null) return true;
  if (typeof v === "boolean") return !v;
  if (typeof v === "string") return v.toLowerCase() !== "true";
  return true;
}

/**
 * レコードの全文字列テキストを抽出（検索用）
 * @param {object} rec
 * @returns {string}
 */
function getSearchText(rec) {
  const searchable = rec?._enrichment?.searchableText;
  if (typeof searchable === "string") return searchable;
  return JSON.stringify(rec);
}

// ─────────────────────────────────────────────────────────────────────────────
// エラークラス
// ─────────────────────────────────────────────────────────────────────────────

/** API エラー（ステータスコード付き） */
class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// レスポンス生成ユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * JSON レスポンスを生成
 * @param {unknown} data
 * @param {number} status
 * @returns {Response}
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}

/**
 * エラーレスポンスを生成
 * @param {number} status
 * @param {string} message
 * @returns {Response}
 */
function errorResponse(status, message) {
  return jsonResponse({ error: message, status }, status);
}

// ─────────────────────────────────────────────────────────────────────────────
// ルーティング
// ─────────────────────────────────────────────────────────────────────────────

/**
 * リクエストをルーティングして Response を返す
 * @param {Request} request
 * @param {string} repoBaseUrl
 * @returns {Promise<Response>}
 */
async function handleRequest(request, repoBaseUrl) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // CORS プリフライト
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "GET") {
    return errorResponse(405, "Method not allowed");
  }

  // パス解析: /api/v1/...
  const match = pathname.match(/^\/api\/v1(\/.*)?$/);
  if (!match) return errorResponse(404, "Not found");
  const sub = (match[1] || "/").replace(/\/$/, "") || "/";
  const segments = sub.split("/").filter(Boolean);

  try {
    // GET /api/v1/meta
    if (segments.length === 1 && segments[0] === "meta") {
      const meta = await getGlobalMeta(repoBaseUrl, request);
      return jsonResponse(meta);
    }

    // GET /api/v1/works
    if (segments.length === 1 && segments[0] === "works") {
      const meta = await getGlobalMeta(repoBaseUrl, request);
      const creationWorks = meta?.CreationWorks ?? {};
      const works = Object.entries(creationWorks)
        .filter(([, info]) => !info?.Works_Hidden)
        .map(([key, info]) => ({
          key,
          Title:         info?.Title         ?? "",
          Title_EN:      info?.Title_EN       ?? "",
          Works_Summary: info?.Works_Summary  ?? "",
          OldTitles:     info?.OldTitles      ?? [],
        }));
      return jsonResponse(works);
    }

    // :work が必要なルート
    if (segments.length >= 2) {
      const rawWork = segments[0];
      const workKey = toWorkKey(rawWork);
      if (!workKey) return errorResponse(400, "Invalid work ID");

      // Works_Hidden チェック
      const globalMeta = await getGlobalMeta(repoBaseUrl, request);
      const workInfo = globalMeta?.CreationWorks?.[workKey];
      if (workInfo?.Works_Hidden) return errorResponse(404, "Work not found");

      const workMeta = await getWorkMeta(repoBaseUrl, workKey, request);

      // GET /api/v1/:work/meta
      if (segments[1] === "meta" && segments.length === 2) {
        return jsonResponse(workMeta ?? { key: workKey });
      }

      // GET /api/v1/:work/dbs
      if (segments[1] === "dbs" && segments.length === 2) {
        const databases = workMeta?.Databases ?? {};
        const dbs = Object.entries(databases)
          .filter(([, info]) => !info?.DB_Hidden)
          .map(([key, info]) => ({
            key:      key.replace(/^#?(DB|Ref)_/i, ""),
            label:    info?.DB_Label    ?? key,
            labelEN:  info?.DB_Label_EN ?? key,
            layer:    info?.DB_Layer    ?? "DataBases",
          }));
        return jsonResponse(dbs);
      }

      // GET /api/v1/:work/search?q=...
      if (segments[1] === "search" && segments.length === 2) {
        const q = (url.searchParams.get("q") ?? "").toLowerCase();
        if (!q) return jsonResponse([]);

        const databases = workMeta?.Databases ?? {};
        const results = [];
        for (const dbKey of Object.keys(databases)) {
          if (databases[dbKey]?.DB_Hidden) continue;
          const dbName = stripMetaDbPrefix(dbKey);
          try {
            const { records } = await resolveAndFetchDb(
              repoBaseUrl, workKey, dbName, workMeta, request
            );
            const publicRecs = records.filter(isPublicRecord);
            const enriched = applyCommons(publicRecs, workMeta, dbName);
            for (const rec of enriched) {
              if (getSearchText(rec).toLowerCase().includes(q)) {
                results.push({ db: dbName, record: rec });
              }
            }
          } catch { /* DB 欠損は無視して継続 */ }
        }
        return jsonResponse(results);
      }

      // :db が必要なルート
      if (segments.length >= 3) {
        const rawDb = segments[1];
        const dbNorm = stripMetaDbPrefix(rawDb);
        if (!isSafeToken(dbNorm)) return errorResponse(400, "Invalid DB name");

        // DB_Hidden チェック
        const dbMeta = workMeta?.Databases?.[normalizeDbKeyForMeta(dbNorm)] ?? {};
        if (dbMeta?.DB_Hidden) return errorResponse(404, "DB not found");

        // GET /api/v1/:work/:db/records
        if (segments[2] === "records" && segments.length === 3) {
          const { records } = await resolveAndFetchDb(
            repoBaseUrl, workKey, dbNorm, workMeta, request
          );
          const publicRecs = records.filter(isPublicRecord);
          const enriched = applyCommons(publicRecs, workMeta, dbNorm);
          return jsonResponse(enriched);
        }

        // GET /api/v1/:work/:db/records/:idx?idxKey=...
        if (segments[2] === "records" && segments.length === 4) {
          const idxValue = decodeURIComponent(segments[3]);
          const idxKey = url.searchParams.get("idxKey") ?? "Num";
          if (!isSafeToken(idxKey.replace(/\./g, "")))
            return errorResponse(400, "Invalid idxKey");

          const { records } = await resolveAndFetchDb(
            repoBaseUrl, workKey, dbNorm, workMeta, request
          );
          const publicRecs = records.filter(isPublicRecord);
          const enriched = applyCommons(publicRecs, workMeta, dbNorm);

          /** ドット区切りパスで値を取得 */
          function getByPath(obj, path) {
            return path.split(".").reduce((cur, k) => cur?.[k], obj);
          }

          const rec = enriched.find((r) => String(getByPath(r, idxKey)) === String(idxValue));
          if (!rec) return errorResponse(404, "Record not found");
          return jsonResponse(rec);
        }

        // GET /api/v1/:work/:db/search?q=...
        if (segments[2] === "search" && segments.length === 3) {
          const q = (url.searchParams.get("q") ?? "").toLowerCase();
          if (!q) return jsonResponse([]);

          const { records } = await resolveAndFetchDb(
            repoBaseUrl, workKey, dbNorm, workMeta, request
          );
          const publicRecs = records.filter(isPublicRecord);
          const enriched = applyCommons(publicRecs, workMeta, dbNorm);
          const hits = enriched.filter((r) =>
            getSearchText(r).toLowerCase().includes(q)
          );
          return jsonResponse(hits);
        }
      }
    }
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(err.status, err.message);
    console.error("[CreationsDB Worker]", err);
    return errorResponse(500, "Internal server error");
  }

  return errorResponse(404, "Not found");
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Workers エクスポート
// ─────────────────────────────────────────────────────────────────────────────

export default {
  /**
   * Cloudflare Workers fetch ハンドラー
   * @param {Request} request
   * @param {object} env - wrangler.toml で定義した環境変数オブジェクト
   * @param {ExecutionContext} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    const repoBaseUrl = (env?.REPO_BASE_URL ?? DEFAULT_REPO_BASE_URL).replace(
      /\/$/,
      ""
    );
    return handleRequest(request, repoBaseUrl);
  },
};
