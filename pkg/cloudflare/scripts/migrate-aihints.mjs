/**
 * migrate-aihints.mjs — AIHints D1 同期スクリプト
 *
 * @description
 *   data/ 配下のキャラクターレコードから AIHints フィールドを抽出し、
 *   Cloudflare D1 の `aihints` テーブルへ同期する。
 *   スキーマは pkg/cloudflare/schema/d1-aihints.sql を先に適用しておくこと。
 *
 *   引数パース・JSON 読み込み・SQL 整形・D1 投入・作品ディレクトリ解決は
 *   migrate.mjs と共通のため `migrate-common.mjs` を使う。
 *   （以前はこれらを丸ごとコピーして持っており、migrate.mjs 側へ後から入った
 *     修正が反映されず片方だけ腐っていた。コピーを再発させないこと。）
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
 * @version 1.1.0
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  parseCommonArgs,
  readJson,
  esc,
  resolveIdxKey,
  getByPath,
  CONVENTIONAL_FILES,
  stripDbPrefix,
  capitalize,
  resolveWorkDirForMigrate,
  readWorkBaseFile,
  resolveDbBasePath,
  createD1Runner,
} from "./migrate-common.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// 引数パース
// ─────────────────────────────────────────────────────────────────────────────

const { dryRun: DRY_RUN, clean: CLEAN, dbId: DB_ID, repoRoot: REPO_ROOT } =
  parseCommonArgs(process.argv.slice(2));

const DATA_DIR = join(REPO_ROOT, "data");

console.log(`[aihints] REPO_ROOT = ${REPO_ROOT}`);
console.log(`[aihints] D1 DB_ID  = ${DB_ID}`);
if (DRY_RUN) console.log("[aihints] ⚠️  DRY RUN モード（実際の投入はしません）");
if (CLEAN)   console.log("[aihints] 🗑️  CLEAN モード（既存データを削除してから投入）");

// ─────────────────────────────────────────────────────────────────────────────
// D1 実行ユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

const { d1Execute, d1BatchInsert } = createD1Runner({
  repoRoot: REPO_ROOT,
  dbId: DB_ID,
  dryRun: DRY_RUN,
  tmpDirName: "migrate-aihints",
});

/** 作品ベースファイルの読み込み（DATA_DIR とログタグを束ねた共通ヘルパーのアダプタ） */
const readWorkBase = (workDir, filename) => readWorkBaseFile(DATA_DIR, workDir, filename, "aihints");

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

const globalMeta    = readJson(join(DATA_DIR, "db_meta.json"), "aihints") ?? {};
const creationWorks = globalMeta.CreationWorks ?? {};

console.log("\n[aihints] AIHints を抽出して D1 に投入...");

let totalHints = 0;

for (const workKey of Object.keys(creationWorks)) {
  const workDir       = resolveWorkDirForMigrate(workKey, creationWorks);
  const workMeta      = readWorkBase(workDir, "db_meta.json");
  const databases     = workMeta?.Databases ?? {};

  const workType      = readWorkBase(workDir, "db_type.json") ?? {};
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
    const basePath = resolveDbBasePath(DATA_DIR, workDir, layer);

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
        const parsed = readJson(fp, "aihints");
        if (Array.isArray(parsed)) { records = parsed; break; }
      }
    }
    if (!records) continue;

    // 注意: resolveIdxKey() は indexDef が無くても既定値 "Num" を返すため、
    // dbSpecificType が無いのに resolveIdxKey(undefined) を呼ぶと常に "Num" が真値として
    // 確定してしまい defaultIdxKey へ絶対フォールバックしない（ネスト型 $IndexDef を持つ
    // 作品の idx_key が誤って "Num" になり、idx_value が取れず AIHints が丸ごと
    // 投入されない）。migrate.mjs 側で修正済みの形に揃える。
    const dbSpecificType = workType[`$IndexDef_${dbNorm}`];
    const idxKey = dbSpecificType ? resolveIdxKey(dbSpecificType) : defaultIdxKey;

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
