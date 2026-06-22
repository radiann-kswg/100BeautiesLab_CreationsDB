/**
 * migrate.mjs — 100BeautiesLab CreationsDB D1/R2 マイグレーションスクリプト
 *
 * @description
 *   data/ 配下の JSON を Cloudflare R2（静的ミラー）と D1（検索インデックス）に投入する。
 *   wrangler CLI が認証済みであることを前提とする（wrangler login 済み、または
 *   CLOUDFLARE_API_TOKEN 環境変数が設定されていること）。
 *
 *   実行方法:
 *     node pkg/cloudflare/scripts/migrate.mjs [オプション]
 *
 *   オプション:
 *     --repo-root <path>   リポジトリルートのパス（省略時は自動解決）
 *     --dry-run            実際の投入は行わず、処理内容のみを出力
 *     --r2-only            R2 アップロードのみ実行
 *     --d1-only            D1 投入のみ実行
 *     --clean              D1 投入前に既存データを全削除（CI / 再投入向け）
 *     --db-id <name>       D1 データベース名（省略時: creationsdb-d1）
 *     --bucket <name>      R2 バケット名（省略時: creationsdb-data）
 *
 * @author 100BeautiesLab.
 * @version 1.1.0
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// ─────────────────────────────────────────────────────────────────────────────
// 定数・設定
// ─────────────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

/** D1 バッチ INSERT の最大行数。1 ファイル=1 SQL 文にする単位。
 *  レコード JSON は大きいため SQLITE_TOOBIG 回避で 1 レコード 1 INSERT にしており、
 *  この値は SQL ファイル 1 本あたりの文数（= レコード数）の上限。 */
const D1_BATCH_SIZE = 10;

/** wrangler 実行コマンド。
 *  Windows (Node v22+) では .cmd を execFileSync で直接起動できないため
 *  shell オプションを使用する（WRANGLER_CMD は "npx" のまま、shell: true で解決）。 */
const WRANGLER_CMD = "npx";
const WRANGLER_BASE_ARGS = ["wrangler"];
/** Windows では shell: true が必要（.cmd 解決 + パスのスペース対応） */
const SPAWN_OPTS_BASE = process.platform === "win32" ? { shell: true } : {};

// ─────────────────────────────────────────────────────────────────────────────
// 引数パース
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

/** @returns {string|undefined} */
function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const DRY_RUN  = args.includes("--dry-run");
const R2_ONLY  = args.includes("--r2-only");
const D1_ONLY  = args.includes("--d1-only");
const CLEAN    = args.includes("--clean");
const DB_ID    = getArg("--db-id") ?? "creationsdb-d1";
const BUCKET   = getArg("--bucket") ?? "creationsdb-data";

// リポジトリルート: --repo-root 引数 → scripts/ の 3 階層上
const REPO_ROOT = resolve(getArg("--repo-root") ?? join(__dirname, "../../.."));
const DATA_DIR  = join(REPO_ROOT, "data");

console.log(`[migrate] REPO_ROOT = ${REPO_ROOT}`);
console.log(`[migrate] D1 DB_ID  = ${DB_ID}`);
console.log(`[migrate] R2 BUCKET = ${BUCKET}`);
if (DRY_RUN) console.log("[migrate] ⚠️  DRY RUN モード（実際の投入はしません）");
if (CLEAN)   console.log("[migrate] 🗑️  CLEAN モード（D1 既存データを削除してから投入）");

// ─────────────────────────────────────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * JSON ファイルを読み込んでパース。失敗時は null を返す。
 * @param {string} filepath
 * @returns {unknown}
 */
function readJson(filepath) {
  try {
    return JSON.parse(readFileSync(filepath, "utf8"));
  } catch {
    console.warn(`[migrate] ⚠️  JSON 読み込み失敗: ${filepath}`);
    return null;
  }
}

/**
 * ディレクトリを再帰的に探索して .json ファイルを列挙する。
 * @param {string} dir
 * @param {string[]} result
 * @returns {string[]}
 */
function findJsonFiles(dir, result = []) {
  if (!existsSync(dir)) return result;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      findJsonFiles(full, result);
    } else if (entry.endsWith(".json")) {
      result.push(full);
    }
  }
  return result;
}

/**
 * SQL 文字列エスケープ（シングルクォートを重ねる）
 * @param {string|null|undefined} s
 * @returns {string}
 */
function esc(s) {
  if (s == null) return "NULL";
  return `'${String(s).replace(/'/g, "''")}'`;
}

/**
 * $IndexDef から主インデックスキー（ドット記法）を解決する。
 * フラット型: hashTag そのもの
 * ネスト型（$type が配列）: #IndexListKey > #Number > 先頭要素 の優先順で子を選択
 * @param {object|undefined} indexDef
 * @returns {string}
 */
function resolveIdxKey(indexDef) {
  if (!indexDef) return "Num";
  const root  = indexDef.hashTag ?? "Num";
  const types = indexDef.$type;

  if (!Array.isArray(types)) return root;  // フラット型

  // ネスト型: 子要素から主インデックスを選ぶ
  const findChild = (pred) => types.find((t) => typeof t.$type === "string" && pred(t.$type));
  const primary =
    findChild((t) => t.includes("#IndexListKey")) ??
    findChild((t) => t.includes("#Number"))       ??
    types[0];

  return primary ? `${root}.${primary.hashTag}` : root;
}

/**
 * ドット記法でオブジェクトから値を取得する。
 * @param {object} obj
 * @param {string} path - 例: "Card.Num", "Num"
 * @returns {unknown}
 */
function getByPath(obj, path) {
  return path.split(".").reduce((cur, k) => cur?.[k], obj);
}

// ─────────────────────────────────────────────────────────────────────────────
// D1 投入ユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

/** 一時 SQL ファイルのパス */
const TMP_SQL_DIR = join(REPO_ROOT, ".cache", "migrate");

/**
 * SQL ファイルを wrangler d1 execute で実行する。
 * @param {string} label - ログ表示用ラベル
 * @param {string} sql
 */
function d1Execute(label, sql) {
  if (!sql.trim()) return;
  if (DRY_RUN) {
    console.log(`[D1 dry-run] ${label}\n${sql.slice(0, 200)}...`);
    return;
  }
  mkdirSync(TMP_SQL_DIR, { recursive: true });
  const tmpFile = join(TMP_SQL_DIR, `${label.replace(/\W+/g, "_")}.sql`);
  writeFileSync(tmpFile, sql, "utf8");
  try {
    execFileSync(
      WRANGLER_CMD,
      [...WRANGLER_BASE_ARGS, "d1", "execute", DB_ID, "--file", relative(REPO_ROOT, tmpFile).replace(/\\/g, "/"), "--remote", "--yes"],
      { stdio: "inherit", cwd: REPO_ROOT, ...SPAWN_OPTS_BASE }
    );
    console.log(`[D1] ✓ ${label}`);
  } catch (err) {
    console.error(`[D1] ✗ ${label}: ${err.message}`);
    throw err;
  }
}

/**
 * INSERT 文を BATCH_SIZE 行ごとに分割して実行する。
 * @param {string} table
 * @param {string} columns
 * @param {string[]} valueParts - 各行の VALUES(...) 部分
 * @param {string} labelPrefix
 */
function d1BatchInsert(table, columns, valueParts, labelPrefix) {
  for (let i = 0; i < valueParts.length; i += D1_BATCH_SIZE) {
    const chunk = valueParts.slice(i, i + D1_BATCH_SIZE);
    // レコード JSON は大きいため SQLITE_TOOBIG 回避で 1 レコード 1 INSERT 文にする
    const sql = chunk
      .map((v) => `INSERT OR REPLACE INTO ${table} (${columns}) VALUES\n${v};`)
      .join("\n");
    d1Execute(`${labelPrefix} [${i + 1}-${i + chunk.length}]`, sql);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// メインデータ読み込み
// ─────────────────────────────────────────────────────────────────────────────

/** グローバルメタを読み込む */
const globalMeta = readJson(join(DATA_DIR, "db_meta.json")) ?? {};
const creationWorks = globalMeta.CreationWorks ?? {};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: R2 アップロード
// ─────────────────────────────────────────────────────────────────────────────

if (!D1_ONLY) {
  console.log("\n[R2] data/** の JSON ファイルを R2 にアップロード...");
  const jsonFiles = findJsonFiles(DATA_DIR);
  console.log(`[R2] 対象ファイル数: ${jsonFiles.length}`);

  for (const filepath of jsonFiles) {
    const rel = relative(REPO_ROOT, filepath).replace(/\\/g, "/");  // R2 キー
    if (DRY_RUN) {
      console.log(`[R2 dry-run] put ${BUCKET}/${rel}`);
      continue;
    }
    try {
      execFileSync(
        WRANGLER_CMD,
        [
          ...WRANGLER_BASE_ARGS,
          "r2", "object", "put",
          `${BUCKET}/${rel}`,
          "--file", rel,
          "--content-type", "application/json"
        ],
        { stdio: "pipe", cwd: REPO_ROOT, ...SPAWN_OPTS_BASE }
      );
      console.log(`[R2] ✓ ${rel}`);
    } catch (err) {
      console.error(`[R2] ✗ ${rel}: ${err.message}`);
    }
  }
  console.log("[R2] アップロード完了");
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: D1 — テーブルクリア（--clean 時）→ works 投入
// ─────────────────────────────────────────────────────────────────────────────

if (!R2_ONLY) {
  // records テーブルは AUTOINCREMENT で自然キーがないため、再投入前に全削除が必要。
  if (CLEAN) {
    console.log("\n[D1] 既存データをクリア...");
    d1Execute("clean/records", "DELETE FROM records;");
    d1Execute("clean/dbs",     "DELETE FROM dbs;");
    d1Execute("clean/works",   "DELETE FROM works;");
    console.log("[D1] クリア完了");
  }

  console.log("\n[D1] works テーブルを構築...");

  const worksValues = Object.entries(creationWorks).map(([key, info]) => {
    const isHidden = info?.Works_Hidden ? 1 : 0;
    return `(${esc(key)}, ${esc(info?.Title_JP)}, ${esc(info?.Title_EN)}, ${esc(info?.Works_Summary_JP)}, ${isHidden}, ${esc(JSON.stringify(info))})`;
  });

  if (worksValues.length > 0) {
    d1BatchInsert(
      "works",
      "key, title, title_en, summary, is_hidden, meta_json",
      worksValues,
      "works"
    );
  }
  console.log(`[D1] works: ${worksValues.length} 件投入`);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: D1 — dbs テーブル投入（作品別 db_meta.json を使用）
  // ─────────────────────────────────────────────────────────────────────────

  console.log("\n[D1] dbs テーブルを構築...");
  const dbsValues = [];

  for (const workKey of Object.keys(creationWorks)) {
    const workDir = workKey.replace(/^#Works_/, "Works_");
    const workMetaPath = join(DATA_DIR, workDir, "DataBases", "db_meta.json");
    const workMeta = readJson(workMetaPath);
    const databases = workMeta?.Databases ?? {};

    for (const [dbKey, dbInfo] of Object.entries(databases)) {
      const isHidden = dbInfo?.DB_Hidden ? 1 : 0;
      const layer    = dbInfo?.DB_Layer ?? "DataBases";
      dbsValues.push(
        `(${esc(workKey)}, ${esc(dbKey)}, ${esc(dbInfo?.DB_Label)}, ${esc(dbInfo?.DB_Label_EN)}, ${esc(layer)}, ${isHidden})`
      );
    }
  }

  if (dbsValues.length > 0) {
    d1BatchInsert(
      "dbs",
      "work_key, db_key, db_label, db_label_en, db_layer, is_hidden",
      dbsValues,
      "dbs"
    );
  }
  console.log(`[D1] dbs: ${dbsValues.length} 件投入`);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4: D1 — records テーブル投入
  // ─────────────────────────────────────────────────────────────────────────

  console.log("\n[D1] records テーブルを構築...");

  /** DB ファイル名候補（resolveAndFetchDb と同じ優先順） */
  const CONVENTIONAL_FILES = {
    Primary:       "db_Primary.json",
    Secondary:     "db_Secondary.json",
    SemiPrimary:   "db_SemiPrimary.json",
    SelfSecondary: "db_SelfSecondary.json",
    Proxy:         "db_Proxy.json",
    Mobs:          "db_Mobs.json",
  };

  function stripDbPrefix(s) {
    return (s || "").replace(/^#?(DB|Ref)_/i, "").replace(/^#/, "");
  }
  function capitalize(s) {
    return s ? s[0].toUpperCase() + s.slice(1) : s;
  }

  let totalRecords = 0;

  for (const workKey of Object.keys(creationWorks)) {
    const workDir  = workKey.replace(/^#Works_/, "Works_");
    const workMetaPath = join(DATA_DIR, workDir, "DataBases", "db_meta.json");
    const workMeta     = readJson(workMetaPath);
    const databases    = workMeta?.Databases ?? {};

    // 作品別 db_type.json から $IndexDef を読む
    const workTypePath = join(DATA_DIR, workDir, "DataBases", "db_type.json");
    const workType     = readJson(workTypePath) ?? {};
    const defaultIdxKey = resolveIdxKey(workType.$IndexDef);

    for (const [dbKey, dbInfo] of Object.entries(databases)) {
      if (dbInfo?.DB_Hidden) continue;

      const dbNorm  = capitalize(stripDbPrefix(dbKey));
      const layer   = (dbInfo?.DB_Layer || "DataBases").trim();
      const fileRaw = (dbInfo?.DB_File  || "").trim();
      const isRef   = dbKey.startsWith("#Ref_");
      const defPfx  = isRef ? "ref_" : "db_";
      const basePath = join(DATA_DIR, workDir, layer);

      // ファイル候補順に実在する JSON を探す
      const candidates = [
        fileRaw,
        CONVENTIONAL_FILES[dbNorm],
        `${defPfx}${dbNorm}.json`,
        `db_${dbNorm}.json`,
      ].filter(Boolean);

      let records = null;
      for (const fname of candidates) {
        const fp = join(basePath, fname);
        if (existsSync(fp)) {
          const parsed = readJson(fp);
          if (Array.isArray(parsed)) { records = parsed; break; }
        }
      }
      if (!records) {
        console.warn(`[D1] ⚠️  DB ファイル未発見: ${workKey}/${dbKey}`);
        continue;
      }

      // 作品別 db_type.json の DB 固有 $IndexDef があれば優先
      const dbSpecificType = workType[`$IndexDef_${dbNorm}`];
      const idxKey = resolveIdxKey(dbSpecificType) || defaultIdxKey;

      const recordValues = [];
      for (const rec of records) {
        const isPrivate    = rec?.isPrivate ? 1 : 0;
        const idxValue     = getByPath(rec, idxKey);
        const searchText   = rec?._enrichment?.searchableText ?? JSON.stringify(rec);
        const dataJson     = JSON.stringify(rec);

        recordValues.push(
          `(${esc(workKey)}, ${esc(dbNorm)}, ${esc(idxKey)}, ${esc(String(idxValue ?? ""))}, ${isPrivate}, ${esc(searchText)}, ${esc(dataJson)})`
        );
      }

      d1BatchInsert(
        "records",
        "work_key, db_name, idx_key, idx_value, is_private, searchable_text, data_json",
        recordValues,
        `records/${workDir}/${dbNorm}`
      );
      totalRecords += records.length;
      console.log(`[D1] ${workKey}/${dbNorm}: ${records.length} 件`);
    }
  }

  console.log(`\n[D1] records 合計: ${totalRecords} 件投入`);
  console.log("\n[migrate] 完了 ✓");
}
