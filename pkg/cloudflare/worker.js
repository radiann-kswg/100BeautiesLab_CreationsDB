/**
 * worker.js — 100BeautiesLab CreationsDB Cloudflare Workers エントリーポイント
 *
 * @description
 *   Cloudflare Workers 上で動作するサーバーサイド API。
 *   データは R2 バケット（静的 JSON ミラー）と D1 データベース
 *   （正規化メタ・FTS5 検索インデックス）から取得する。
 *
 *   エンドポイント一覧:
 *     GET /api/v1/meta                              — グローバルメタ (R2)
 *     GET /api/v1/works                             — 作品一覧 (D1)
 *     GET /api/v1/:work/meta                        — 作品別メタ (R2)
 *     GET /api/v1/:work/dbs                         — DB 一覧 (D1)
 *     GET /api/v1/:work/:db/records                 — レコード一覧 (D1)
 *     GET /api/v1/:work/:db/records/:idx            — レコード 1 件 (D1)
 *     GET /api/v1/:work/:db/records/:idx?idxKey=X   — インデックスキー指定 (D1)
 *     GET /api/v1/:work/:db/search?q=キーワード      — DB 内全文検索 (D1 FTS5)
 *     GET /api/v1/:work/search?q=キーワード          — 作品横断検索 (D1 FTS5)
 *
 *   バインディング（wrangler.toml）:
 *     BUCKET  — R2 バケット (creationsdb-data): data/** の JSON 静的ミラー
 *     DB      — D1 データベース (creationsdb-d1): メタ・FTS インデックス
 *
 *   注: _DBLink / _Jump 解決 (EnrichmentProcessor 移植) は次フェーズ実装予定。
 *       現在の /api/v1 は _Commons 適用・isPrivate 除外まで対応。
 *
 * @author 100BeautiesLab.
 * @version 2.0.0
 */

// ─────────────────────────────────────────────────────────────────────────────
// セキュリティユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

const SAFE_TOKEN_RE      = /^[A-Za-z0-9_]+$/;
const VALID_JSON_FILE_RE = /^[A-Za-z0-9_.\-]+\.json$/;

/**
 * パストラバーサル防止: 英数字とアンダースコアのみ許可
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
 * '#Works_XXX' → 'Works_XXX'（ファイルシステムパス用）
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
// R2 データアクセス
// ─────────────────────────────────────────────────────────────────────────────

/**
 * R2 パス変換: URL パス → R2 オブジェクトキー
 * 例: '/data/db_meta.json' → 'data/db_meta.json'
 * @param {string} path - '/data/...' 形式
 * @returns {string}
 */
function pathToR2Key(path) {
  return path.replace(/^\/+/, "");
}

/**
 * R2 から JSON を取得してパース。キャッシュを活用する。
 * @param {object} env - Workers env (env.BUCKET が R2 バインディング)
 * @param {string} path - '/data/...' 形式のパス
 * @returns {Promise<object|null>}
 */
async function fetchJsonFromR2(env, path) {
  const key = pathToR2Key(path);
  try {
    // Cloudflare Cache API でキャッシュ
    const cacheUrl = `https://r2-cache.internal/${key}`;
    const cacheKey = new Request(cacheUrl);
    let cache;
    try { cache = caches.default; } catch { /* ローカル開発時はスキップ */ }

    if (cache) {
      const cached = await cache.match(cacheKey);
      if (cached) return cached.json();
    }

    const obj = await env.BUCKET.get(key);
    if (!obj) return null;

    const data = await obj.json();

    if (cache) {
      const cacheRes = new Response(JSON.stringify(data), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300",
        },
      });
      cache.put(cacheKey, cacheRes);
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * R2 オブジェクトの存在確認
 * @param {object} env
 * @param {string} path
 * @returns {Promise<boolean>}
 */
async function existsInR2(env, path) {
  try {
    const obj = await env.BUCKET.head(pathToR2Key(path));
    return obj !== null;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// D1 データアクセス
// ─────────────────────────────────────────────────────────────────────────────

/**
 * D1 クエリを実行して結果を返す
 * @param {object} env
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<object[]>}
 */
async function d1Query(env, sql, params = []) {
  const stmt = env.DB.prepare(sql).bind(...params);
  const { results } = await stmt.all();
  return results ?? [];
}

/**
 * D1 クエリを実行して最初の行を返す
 * @param {object} env
 * @param {string} sql
 * @param {Array} params
 * @returns {Promise<object|null>}
 */
async function d1First(env, sql, params = []) {
  const stmt = env.DB.prepare(sql).bind(...params);
  return stmt.first();
}

// ─────────────────────────────────────────────────────────────────────────────
// メタ読み込み
// ─────────────────────────────────────────────────────────────────────────────

/**
 * グローバルメタ (data/db_meta.json) を R2 から取得
 * @param {object} env
 * @returns {Promise<object>}
 */
async function getGlobalMeta(env) {
  const meta = await fetchJsonFromR2(env, "/data/db_meta.json");
  if (!meta) throw new ApiError(503, "Global meta unavailable");
  return meta;
}

/**
 * 作品別メタ (data/Works_X/DataBases/db_meta.json) を R2 から取得
 * @param {object} env
 * @param {string} workKey - '#Works_XXX' 形式
 * @returns {Promise<object|null>}
 */
async function getWorkMeta(env, workKey) {
  const workDir = resolveWorkDir(workKey);
  return fetchJsonFromR2(env, `/data/${workDir}/DataBases/db_meta.json`);
}

// ─────────────────────────────────────────────────────────────────────────────
// DB ファイル解決 (R2 ベース)
// ─────────────────────────────────────────────────────────────────────────────

/** DB 名 → 既定ファイル名の対応マップ */
const CONVENTIONAL_DB_FILES = {
  Primary:       "db_Primary.json",
  Secondary:     "db_Secondary.json",
  SemiPrimary:   "db_SemiPrimary.json",
  SelfSecondary: "db_SelfSecondary.json",
  Proxy:         "db_Proxy.json",
  Mobs:          "db_Mobs.json",
};

/**
 * R2 からレコード配列を取得する。
 * db_meta.json で DB_File が宣言されていれば優先し、なければ候補ファイル名を順番に試す。
 * @param {object} env
 * @param {string} workKey
 * @param {string} dbName
 * @param {object|null} workMeta
 * @returns {Promise<{records: object[], dbEntry: object}>}
 */
async function resolveAndFetchDbFromR2(env, workKey, dbName, workMeta) {
  const norm = stripMetaDbPrefix(dbName);
  if (!isSafeToken(norm)) throw new ApiError(400, "Invalid dbName");
  const key = capitalize(norm);

  const databases = workMeta?.Databases ?? {};
  const metaKey   = `#DB_${key}`;
  const refKey    = `#Ref_${key}`;
  const dbEntry   = databases[metaKey] ?? databases[refKey] ?? {};
  const isRef     = !!databases[refKey];

  const layerRaw     = (dbEntry.DB_Layer || "").trim();
  const layer        = isSafeToken(layerRaw) ? layerRaw : "DataBases";
  const fileRaw      = (dbEntry.DB_File  || "").trim();
  const configuredFile = isValidJsonFile(fileRaw) ? fileRaw : "";
  const defaultPrefix  = isRef ? "ref_" : "db_";
  const workDir        = resolveWorkDir(workKey);
  const basePath       = `/data/${workDir}/${layer}`;

  const candidates = [
    configuredFile,
    CONVENTIONAL_DB_FILES[key],
    `${defaultPrefix}${key}.json`,
    key !== norm ? `${defaultPrefix}${norm}.json` : null,
    defaultPrefix !== "db_" ? `db_${key}.json` : null,
  ].filter(Boolean);

  for (const fname of candidates) {
    const path = `${basePath}/${fname}`;
    if (await existsInR2(env, path)) {
      const records = await fetchJsonFromR2(env, path);
      if (Array.isArray(records)) return { records, dbEntry };
    }
  }
  throw new ApiError(404, `DB not found: ${dbName}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// D1 経由のレコード取得
// ─────────────────────────────────────────────────────────────────────────────

/**
 * D1 からレコード一覧を取得（isPrivate=0 のみ）
 * @param {object} env
 * @param {string} workKey
 * @param {string} dbName
 * @returns {Promise<object[]>}
 */
async function getRecordsFromD1(env, workKey, dbName) {
  const rows = await d1Query(
    env,
    "SELECT data_json FROM records WHERE work_key = ? AND db_name = ? AND is_private = 0",
    [workKey, dbName]
  );
  return rows.map((r) => JSON.parse(r.data_json));
}

/**
 * D1 からインデックス値でレコード 1 件を取得
 * @param {object} env
 * @param {string} workKey
 * @param {string} dbName
 * @param {string} idxValue
 * @param {string} idxKey
 * @returns {Promise<object|null>}
 */
async function getRecordFromD1(env, workKey, dbName, idxValue, idxKey = "Num") {
  const row = await d1First(
    env,
    "SELECT data_json FROM records WHERE work_key = ? AND db_name = ? AND idx_key = ? AND idx_value = ? AND is_private = 0",
    [workKey, dbName, idxKey, String(idxValue)]
  );
  return row ? JSON.parse(row.data_json) : null;
}

/**
 * D1 FTS5 で DB 内キーワード検索
 * @param {object} env
 * @param {string} workKey
 * @param {string} dbName
 * @param {string} query
 * @returns {Promise<object[]>}
 */
async function searchRecordsInD1(env, workKey, dbName, query) {
  const rows = await d1Query(
    env,
    `SELECT r.data_json FROM records r
     WHERE r.id IN (SELECT rowid FROM records_fts WHERE searchable_text MATCH ?)
       AND r.work_key = ? AND r.db_name = ? AND r.is_private = 0
     LIMIT 200`,
    [query, workKey, dbName]
  );
  return rows.map((r) => JSON.parse(r.data_json));
}

/**
 * D1 FTS5 で作品横断キーワード検索
 * @param {object} env
 * @param {string} workKey
 * @param {string} query
 * @returns {Promise<Array<{db: string, record: object}>>}
 */
async function searchAllRecordsInD1(env, workKey, query) {
  const rows = await d1Query(
    env,
    `SELECT r.db_name, r.data_json FROM records r
     WHERE r.id IN (SELECT rowid FROM records_fts WHERE searchable_text MATCH ?)
       AND r.work_key = ? AND r.is_private = 0
     LIMIT 500`,
    [query, workKey]
  );
  return rows.map((r) => ({ db: r.db_name, record: JSON.parse(r.data_json) }));
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
  const dbKey    = normalizeDbKeyForMeta(dbName);
  const databases = workMeta?.Databases ?? {};
  const dbInfo   = databases[dbKey] ?? {};
  const commons  = dbInfo._Commons  ?? null;
  const secDefs  = dbInfo._Secondaries ?? dbInfo.Secondaries ?? null;
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
      const defCmn   = def._Commons;
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
 * @param {object} env - Workers バインディング (BUCKET, DB)
 * @returns {Promise<Response>}
 */
async function handleRequest(request, env) {
  const url      = new URL(request.url);
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
  const sub      = (match[1] || "/").replace(/\/$/, "") || "/";
  const segments = sub.split("/").filter(Boolean);

  try {
    // ── GET /api/v1/meta ────────────────────────────────────────────────────
    if (segments.length === 1 && segments[0] === "meta") {
      const meta = await getGlobalMeta(env);
      return jsonResponse(meta);
    }

    // ── GET /api/v1/works ───────────────────────────────────────────────────
    if (segments.length === 1 && segments[0] === "works") {
      const rows = await d1Query(
        env,
        "SELECT key, title, title_en, summary, meta_json FROM works WHERE is_hidden = 0"
      );
      const works = rows.map((r) => {
        const info = r.meta_json ? JSON.parse(r.meta_json) : {};
        return {
          key:           r.key,
          Title:         r.title         ?? "",
          Title_EN:      r.title_en       ?? "",
          Works_Summary: r.summary        ?? "",
          OldTitles:     info.OldTitles   ?? [],
        };
      });
      return jsonResponse(works);
    }

    // :work が必要なルート
    if (segments.length >= 2) {
      const rawWork = segments[0];
      const workKey = toWorkKey(rawWork);
      if (!workKey) return errorResponse(400, "Invalid work ID");

      // Works_Hidden チェック (D1)
      const workRow = await d1First(
        env,
        "SELECT is_hidden FROM works WHERE key = ?",
        [workKey]
      );
      if (workRow?.is_hidden) return errorResponse(404, "Work not found");

      // ── GET /api/v1/:work/meta ───────────────────────────────────────────
      if (segments[1] === "meta" && segments.length === 2) {
        const workMeta = await getWorkMeta(env, workKey);
        return jsonResponse(workMeta ?? { key: workKey });
      }

      // ── GET /api/v1/:work/dbs ────────────────────────────────────────────
      if (segments[1] === "dbs" && segments.length === 2) {
        const rows = await d1Query(
          env,
          "SELECT db_key, db_label, db_label_en, db_layer FROM dbs WHERE work_key = ? AND is_hidden = 0",
          [workKey]
        );
        const dbs = rows.map((r) => ({
          key:     r.db_key.replace(/^#?(DB|Ref)_/i, ""),
          label:   r.db_label    ?? r.db_key,
          labelEN: r.db_label_en ?? r.db_key,
          layer:   r.db_layer    ?? "DataBases",
        }));
        return jsonResponse(dbs);
      }

      // ── GET /api/v1/:work/search?q=... ──────────────────────────────────
      if (segments[1] === "search" && segments.length === 2) {
        const q = (url.searchParams.get("q") ?? "").trim();
        if (!q) return jsonResponse([]);
        const results = await searchAllRecordsInD1(env, workKey, q);
        return jsonResponse(results);
      }

      // :db が必要なルート
      if (segments.length >= 3) {
        const rawDb  = segments[1];
        const dbNorm = stripMetaDbPrefix(rawDb);
        if (!isSafeToken(dbNorm)) return errorResponse(400, "Invalid DB name");

        // DB_Hidden チェック (D1)
        const dbRow = await d1First(
          env,
          "SELECT is_hidden FROM dbs WHERE work_key = ? AND (db_key = ? OR db_key = ?)",
          [workKey, `#DB_${capitalize(dbNorm)}`, `#Ref_${capitalize(dbNorm)}`]
        );
        if (dbRow?.is_hidden) return errorResponse(404, "DB not found");

        // ── GET /api/v1/:work/:db/records ──────────────────────────────────
        if (segments[2] === "records" && segments.length === 3) {
          const records = await getRecordsFromD1(env, workKey, capitalize(dbNorm));
          const workMeta = await getWorkMeta(env, workKey);
          const enriched = applyCommons(records, workMeta, dbNorm);
          return jsonResponse(enriched);
        }

        // ── GET /api/v1/:work/:db/records/:idx?idxKey=... ─────────────────
        if (segments[2] === "records" && segments.length === 4) {
          const idxValue = decodeURIComponent(segments[3]);
          const idxKey   = url.searchParams.get("idxKey") ?? "Num";
          // num 後方互換: Num インデックス前提の旧パラメータ
          const resolvedIdxKey = (url.searchParams.get("num") && !url.searchParams.get("idxKey"))
            ? "Num" : idxKey;
          if (!isSafeToken(resolvedIdxKey.replace(/\./g, "")))
            return errorResponse(400, "Invalid idxKey");

          const rec = await getRecordFromD1(
            env, workKey, capitalize(dbNorm), idxValue, resolvedIdxKey
          );
          if (!rec) return errorResponse(404, "Record not found");

          const workMeta = await getWorkMeta(env, workKey);
          const [enriched] = applyCommons([rec], workMeta, dbNorm);
          return jsonResponse(enriched);
        }

        // ── GET /api/v1/:work/:db/search?q=... ────────────────────────────
        if (segments[2] === "search" && segments.length === 3) {
          const q = (url.searchParams.get("q") ?? "").trim();
          if (!q) return jsonResponse([]);
          const hits = await searchRecordsInD1(env, workKey, capitalize(dbNorm), q);
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
   * @param {object} env - wrangler.toml で定義したバインディング (BUCKET, DB)
   * @param {ExecutionContext} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  },
};
