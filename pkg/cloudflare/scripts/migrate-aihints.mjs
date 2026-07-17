/**
 * migrate-aihints.mjs — AIHints D1 同期スクリプト
 *
 * @description
 *   data/ 配下のキャラクターレコードから AIHints フィールドを抽出し、
 *   Cloudflare D1 の `aihints` テーブルへ同期する。
 *   スキーマは pkg/cloudflare/schema/d1-aihints.sql を先に適用しておくこと。
 *
 *   実行方法:
 *     node pkg/cloudflare/scripts/migrate-aihints.mjs [オプション]
 *
 *   オプション:
 *     --repo-root <path>   リポジトリルートのパス（省略時は自動解決）
 *     --dry-run            実際の投入は行わず、処理内容のみを出力
 *     --clean              投入前に aihints テーブルを全削除（CI / 再投入向け）
 *     --db-id <name>       D1 データベース名（省略時: creationsdb-d1）
 *
 * @author 100BeautiesLab.
 * @version 1.0.0
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

// D1 は 1 文あたり最大 100KB 制限があるため、AIHints の大型 JSON は 1 レコード 1 INSERT にする
const D1_BATCH_SIZE = 10;
const WRANGLER_CMD       = "npx";
const WRANGLER_BASE_ARGS = ["wrangler"];

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
const CLEAN    = args.includes("--clean");
const DB_ID    = getArg("--db-id") ?? "creationsdb-d1";

const REPO_ROOT = resolve(getArg("--repo-root") ?? join(__dirname, "../../.."));
const DATA_DIR  = join(REPO_ROOT, "data");

console.log(`[aihints] REPO_ROOT = ${REPO_ROOT}`);
console.log(`[aihints] D1 DB_ID  = ${DB_ID}`);
if (DRY_RUN) console.log("[aihints] ⚠️  DRY RUN モード（実際の投入はしません）");
if (CLEAN)   console.log("[aihints] 🗑️  CLEAN モード（既存データを削除してから投入）");

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
    console.warn(`[aihints] ⚠️  JSON 読み込み失敗: ${filepath}`);
    return null;
  }
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
 * migrate.mjs と同一ロジック。
 * @param {object|undefined} indexDef
 * @returns {string}
 */
function resolveIdxKey(indexDef) {
  if (!indexDef) return "Num";
  const root  = indexDef.hashTag ?? "Num";
  const types = indexDef.$type;
  if (!Array.isArray(types)) return root;
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
 * @param {string} path
 * @returns {unknown}
 */
function getByPath(obj, path) {
  return path.split(".").reduce((cur, k) => cur?.[k], obj);
}

// ─────────────────────────────────────────────────────────────────────────────
// D1 実行ユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

const TMP_SQL_DIR = join(REPO_ROOT, ".cache", "migrate-aihints");

/**
 * SQL ファイルを wrangler d1 execute で実行する。
 * @param {string} label
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
      [...WRANGLER_BASE_ARGS, "d1", "execute", DB_ID, "--file", tmpFile, "--remote", "--yes"],
      { stdio: "inherit", cwd: REPO_ROOT }
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
 * @param {string[]} valueParts
 * @param {string} labelPrefix
 */
function d1BatchInsert(table, columns, valueParts, labelPrefix) {
  for (let i = 0; i < valueParts.length; i += D1_BATCH_SIZE) {
    const chunk = valueParts.slice(i, i + D1_BATCH_SIZE);
    // AIHints の JSON は大きいため、1 レコード 1 INSERT 文にして SQLITE_TOOBIG を回避する
    const sql = chunk
      .map((v) => `INSERT OR REPLACE INTO ${table} (${columns}) VALUES\n${v};`)
      .join("\n");
    d1Execute(`${labelPrefix} [${i + 1}-${i + chunk.length}]`, sql);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DB ファイル候補（migrate.mjs と同一）
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: クリア（--clean 時）
// ─────────────────────────────────────────────────────────────────────────────

if (CLEAN) {
  console.log("\n[D1] aihints テーブルをクリア...");
  d1Execute("clean/aihints", "DELETE FROM aihints;");
  console.log("[D1] クリア完了");
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: AIHints 抽出 → aihints テーブル投入
// ─────────────────────────────────────────────────────────────────────────────

const globalMeta    = readJson(join(DATA_DIR, "db_meta.json")) ?? {};
const creationWorks = globalMeta.CreationWorks ?? {};

console.log("\n[aihints] AIHints を抽出して D1 に投入...");

let totalHints = 0;

for (const workKey of Object.keys(creationWorks)) {
  const workDir       = workKey.replace(/^#Works_/, "Works_");
  const workMetaPath  = join(DATA_DIR, workDir, "DataBases", "db_meta.json");
  const workMeta      = readJson(workMetaPath);
  const databases     = workMeta?.Databases ?? {};

  const workTypePath  = join(DATA_DIR, workDir, "DataBases", "db_type.json");
  const workType      = readJson(workTypePath) ?? {};
  const defaultIdxKey = resolveIdxKey(workType.$IndexDef);

  for (const [dbKey, dbInfo] of Object.entries(databases)) {
    if (dbInfo?.DB_Hidden) continue;

    // AI_Optout: true の DB は AIHints を D1 へ投入しない（多層防御）。
    // 通常 tools/patch-aihints.mjs 側のガードが AIHints の「書き込み」自体を拒否するため
    // 該当レコードは存在しないはずだが、手編集や --force-ai-optout で混入した場合に
    // ここを素通りして /api/ai/* から配信されてしまうため、取り込み側でも遮断する。
    // ※ `_Secondaries` のカテゴリ別 AI_Optout はレコード単位の解決が必要で、本スクリプトは未対応。
    //   現状カテゴリ別 opt-out を持つのは #DB_Secondary のみで AIHints 実データが無いため latent。
    if (dbInfo?.AI_Optout === true) {
      console.log(`  skip (AI_Optout): ${workDir}/${dbKey}`);
      continue;
    }

    const dbNorm  = capitalize(stripDbPrefix(dbKey));
    const layer   = (dbInfo?.DB_Layer || "DataBases").trim();
    const fileRaw = (dbInfo?.DB_File  || "").trim();
    const isRef   = dbKey.startsWith("#Ref_");
    const defPfx  = isRef ? "ref_" : "db_";
    const basePath = join(DATA_DIR, workDir, layer);

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
    if (!records) continue;

    const dbSpecificType = workType[`$IndexDef_${dbNorm}`];
    const idxKey = resolveIdxKey(dbSpecificType) || defaultIdxKey;

    const hintsValues = [];
    for (const rec of records) {
      const hints = rec?.AIHints;
      if (!hints) continue;  // AIHints がないレコードはスキップ

      const idxValue = getByPath(rec, idxKey);
      if (!idxValue) continue;

      // 利用可能な形態名をカンマ区切りで列挙
      const forms = hints.forms ? Object.keys(hints.forms).join(",") : null;

      hintsValues.push(
        `(${esc(workKey)}, ${esc(dbNorm)}, ${esc(idxKey)}, ${esc(String(idxValue))}, ${esc(forms)}, ${esc(JSON.stringify(hints.common ?? null))}, ${esc(JSON.stringify(hints.forms ?? null))}, ${esc(JSON.stringify(hints))})`
      );
    }

    if (hintsValues.length === 0) continue;

    d1BatchInsert(
      "aihints",
      "work_key, db_name, idx_key, idx_value, forms, common_json, forms_json, data_json",
      hintsValues,
      `aihints/${workDir}/${dbNorm}`
    );
    totalHints += hintsValues.length;
    console.log(`[aihints] ${workKey}/${dbNorm}: ${hintsValues.length} 件`);
  }
}

console.log(`\n[aihints] 合計: ${totalHints} 件投入`);
console.log("[aihints] 完了 ✓");
