/**
 * build-calendar-ics - 創作キャラの誕生日・記念日カレンダー(.ics)生成ユーティリティ
 *
 * @description
 * `data/Works_*\/DataBases/db_*.json` を走査し、各レコードの `BirthDay`(単一) /
 * `AnivDay`(配列) から「終日・毎年繰り返し(RRULE:FREQ=YEARLY)」の iCalendar(VEVENT) を生成します。
 * 生成した .ics を GitHub Pages 配下へ配信し、Google カレンダーの「URL で追加(購読)」に使う想定です。
 *
 * 公開ルール(CLAUDE.md / guideline 準拠):
 * - `isPrivate: true` のレコードは除外
 * - グローバル `db_meta.json` の `CreationWorks.#Works_*.Works_Hidden` が true の作品は除外
 * - 作品別 `db_meta.json` の `Databases` 配下(ネスト含む) `#DB_*` に付く
 *   `DB_Hidden` / `Works_Hidden` が true の DB は除外
 * - `{ hideText: ... }` のマスク値・`Day` 欠損・`Month`/`DayOfMonth` 非数値はスキップ
 *
 * 出力は決定的(入力が同じなら同一バイト列)になるよう、イベントを月日順にソートし
 * DTSTAMP を固定値にしています。レコードの同一性は UID で安定化しているため、
 * 購読側では再読込時に冪等に反映されます。
 *
 * 使い方:
 *   node tools/build-calendar-ics.mjs            # 既定の出力先へ生成
 *   node tools/build-calendar-ics.mjs --out path/to/out.ics
 *   node tools/build-calendar-ics.mjs --quiet    # サマリ出力を抑制
 *
 * @author 100BeautiesLab.
 * @version 1.0.1
 * @dependencies node:fs, node:path, node:crypto, node:url
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** リポジトリルート(本スクリプトは tools/ 配下のため 1 階層上) */
const REPO_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(REPO_ROOT, "data");

/** 既定の出力先(GitHub Pages が配信するルート直下の calendar/) */
const DEFAULT_OUT = path.join(REPO_ROOT, "calendar", "100beautieslab-creations.ics");

/** カレンダーのメタ情報 */
const CAL_NAME = "100BeautiesLab. 創作キャラ 誕生日・記念日";
const CAL_DESC =
  "百花繚乱研究所(100BeautiesLab.)の創作キャラクターの誕生日・記念日。Creations DB から自動生成。";
const PRODID = "-//100BeautiesLab.//Creations DB Calendar//JA";
/** UID のドメイン(配信ドメインに合わせる) */
const UID_DOMAIN = "creationsdb.numbertales-radiann.net";
/** 繰り返しの基準年(うるう年: 2/29 も保持できるよう 2024 を採用) */
const BASE_YEAR = 2024;
/** 決定的出力のための固定 DTSTAMP */
const FIXED_DTSTAMP = "20240101T000000Z";

/** data ファイルとして扱わない補助 JSON */
const NON_DATA_BASENAMES = new Set(["db_meta.json", "db_type.json", "db_temp.json"]);

/** 名前として優先的に拾う JP フィールド候補 */
const JP_NAME_KEYS = [
  "Name_JP",
  "FormalName_JP",
  "ModelName_JP",
  "CodeName_JP",
  "DealerName_JP",
  "CharName_JP",
];
const EN_NAME_KEYS = [
  "Name_EN",
  "FormalName_EN",
  "ModelName_EN",
  "CodeName_EN",
  "DealerName_EN",
];
/** UID 安定化のための索引候補(値が安定しているもの) */
const INDEX_KEYS = ["Num", "ID", "Id", "Index", "ModelNumber"];

/**
 * JSON を読み込む。失敗時は null を返す(欠損耐性)。
 * @param {string} filePath
 * @returns {any|null}
 */
function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * グローバル `data/db_meta.json` から作品メタ(タイトル/非公開フラグ)を取り出す。
 * @returns {Map<string, {titleJP: string, titleEN: string, hidden: boolean}>}
 */
function loadWorksMeta() {
  const map = new Map();
  const meta = readJsonSafe(path.join(DATA_DIR, "db_meta.json"));
  const cw = meta && meta.CreationWorks;
  if (cw && typeof cw === "object") {
    for (const [key, val] of Object.entries(cw)) {
      if (!val || typeof val !== "object") continue;
      const work = key.replace(/^#Works_/, "");
      map.set(work, {
        titleJP: val.Title_JP || val.Works_Label_JP || work,
        titleEN: val.Title_EN || val.Works_Label_EN || "",
        hidden: val.Works_Hidden === true,
      });
    }
  }
  return map;
}

/**
 * 作品別 `db_meta.json` から DB メタ(ラベル/非公開フラグ)を取り出す。
 * メタ全体を再帰走査し、`#DB_<名>` キーに付いた `DB_Hidden`/`Works_Hidden`(=true) を拾う。
 * @param {string} worksDir 作品ディレクトリ(.../Works_*)
 * @returns {{dbs: Map<string, {labelJP: string, labelEN: string, hidden: boolean}>, workHidden: boolean}}
 */
function loadDbMeta(worksDir) {
  const map = new Map();
  const meta = readJsonSafe(path.join(worksDir, "DataBases", "db_meta.json"));

  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const v of node) walk(v);
      return;
    }
    for (const [key, val] of Object.entries(node)) {
      if (/^#DB_/.test(key) && val && typeof val === "object" && !Array.isArray(val)) {
        const db = key.replace(/^#DB_/, "");
        const prev = map.get(db) || { labelJP: "", labelEN: "", hidden: false };
        map.set(db, {
          labelJP: val.DB_Label || prev.labelJP,
          labelEN: val.DB_Label_EN || prev.labelEN,
          hidden: prev.hidden || val.DB_Hidden === true || val.Works_Hidden === true,
        });
      }
      walk(val);
    }
  };
  if (meta && typeof meta === "object") walk(meta.Databases ?? meta);

  const workHidden = !!(meta && meta.Works_Hidden === true);
  return { dbs: map, workHidden };
}

/**
 * レコードから表示名を解決する。
 * @param {Record<string, any>} rec
 * @param {string} fallback
 * @returns {string}
 */
function resolveName(rec, fallback) {
  for (const k of JP_NAME_KEYS) {
    if (typeof rec[k] === "string" && rec[k].trim()) return rec[k].trim();
  }
  for (const [k, v] of Object.entries(rec)) {
    if (/Name_JP$/.test(k) && typeof v === "string" && v.trim()) return v.trim();
  }
  for (const k of EN_NAME_KEYS) {
    if (typeof rec[k] === "string" && rec[k].trim()) return rec[k].trim();
  }
  return fallback;
}

/**
 * レコードから英名を解決する(無ければ空文字)。
 * @param {Record<string, any>} rec
 * @returns {string}
 */
function resolveNameEN(rec) {
  for (const k of EN_NAME_KEYS) {
    if (typeof rec[k] === "string" && rec[k].trim()) return rec[k].trim();
  }
  for (const [k, v] of Object.entries(rec)) {
    if (/Name_EN$/.test(k) && typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/**
 * UID 安定化のためのレコードキーを解決する。
 * @param {Record<string, any>} rec
 * @param {number} position
 * @returns {string}
 */
function resolveRecordKey(rec, position) {
  for (const k of INDEX_KEYS) {
    const v = rec[k];
    if (typeof v === "number" || (typeof v === "string" && v.trim())) return String(v);
  }
  const en = resolveNameEN(rec);
  if (en) return `en:${en}`;
  return `pos:${position}`;
}

/**
 * `Day` オブジェクトから {month, day} を取り出す。無効なら null。
 * @param {any} day
 * @returns {{month: number, day: number}|null}
 */
function parseDay(day) {
  if (!day || typeof day !== "object") return null;
  const month = day.Month;
  const dom = day.DayOfMonth;
  if (typeof month !== "number" || typeof dom !== "number") return null;
  if (month < 1 || month > 12 || dom < 1 || dom > 31) return null;
  return { month, day: dom };
}

/**
 * ICS テキスト値のエスケープ(RFC 5545)。
 * @param {string} s
 * @returns {string}
 */
function escapeText(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * content line を UTF-8 オクテット 73 で折り返す(RFC 5545 line folding)。
 * @param {string} line
 * @returns {string}
 */
function foldLine(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out = [];
  let start = 0;
  let limit = 73;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    const chunk = bytes.subarray(start, end).toString("utf8");
    out.push(start === 0 ? chunk : " " + chunk);
    start = end;
    limit = 73;
  }
  return out.join("\r\n");
}

/**
 * 月日を BASE_YEAR の YYYYMMDD に整形する。
 * @param {number} month
 * @param {number} day
 * @returns {string}
 */
function ymd(month, day) {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${BASE_YEAR}${mm}${dd}`;
}

/**
 * 翌日(終日 DTEND 用)の YYYYMMDD を返す。
 * @param {number} month
 * @param {number} day
 * @returns {string}
 */
function ymdNext(month, day) {
  const d = new Date(Date.UTC(BASE_YEAR, month - 1, day));
  d.setUTCDate(d.getUTCDate() + 1);
  const y = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${mm}${dd}`;
}

/**
 * 1 件のイベント情報から VEVENT 行配列を生成する。
 * @param {object} ev
 * @returns {string[]}
 */
function buildVevent(ev) {
  const uid =
    crypto
      .createHash("sha1")
      .update(`${ev.work}|${ev.db}|${ev.recordKey}|${ev.kind}|${ev.disc}`)
      .digest("hex") + `@${UID_DOMAIN}`;

  const descLines = [];
  descLines.push(`作品: ${ev.titleJP}${ev.titleEN ? ` (${ev.titleEN})` : ""}`);
  if (ev.dbLabel) descLines.push(`DB: ${ev.dbLabel}`);
  if (ev.nameEN) descLines.push(`Name: ${ev.nameEN}`);
  if (ev.aboutEN) descLines.push(ev.aboutEN);
  descLines.push("Source: 100BeautiesLab. Creations DB (auto-generated)");
  const description = descLines.join("\n");

  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${FIXED_DTSTAMP}`,
    `SUMMARY:${escapeText(ev.summary)}`,
    `DTSTART;VALUE=DATE:${ymd(ev.month, ev.day)}`,
    `DTEND;VALUE=DATE:${ymdNext(ev.month, ev.day)}`,
    "RRULE:FREQ=YEARLY",
    `CATEGORIES:${escapeText(ev.category)}`,
    `DESCRIPTION:${escapeText(description)}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ];
  return lines.map(foldLine);
}

/**
 * 全 data ファイルを走査してイベント配列を収集する。
 * @returns {{events: object[], stats: object}}
 */
function collectEvents() {
  const worksMeta = loadWorksMeta();
  const events = [];
  const stats = {
    works: 0,
    dbFiles: 0,
    records: 0,
    skippedPrivate: 0,
    skippedHidden: 0,
    birth: 0,
    aniv: 0,
  };

  const workDirs = fs
    .readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("Works_"))
    .map((d) => d.name)
    .sort();

  for (const workDirName of workDirs) {
    const work = workDirName.replace(/^Works_/, "");
    const wmeta = worksMeta.get(work) || { titleJP: work, titleEN: "", hidden: false };
    if (wmeta.hidden) {
      stats.skippedHidden++;
      continue;
    }

    const dbDir = path.join(DATA_DIR, workDirName, "DataBases");
    if (!fs.existsSync(dbDir)) continue;
    const { dbs: dbMeta, workHidden } = loadDbMeta(path.join(DATA_DIR, workDirName));
    if (workHidden) {
      stats.skippedHidden++;
      continue;
    }
    stats.works++;

    const dbFiles = fs
      .readdirSync(dbDir)
      .filter((f) => f.startsWith("db_") && f.endsWith(".json") && !NON_DATA_BASENAMES.has(f))
      .sort();

    for (const dbFile of dbFiles) {
      const db = dbFile.replace(/^db_/, "").replace(/\.json$/, "");
      const meta = dbMeta.get(db) || { labelJP: "", labelEN: "", hidden: false };
      if (meta.hidden) {
        stats.skippedHidden++;
        continue;
      }
      const records = readJsonSafe(path.join(dbDir, dbFile));
      if (!Array.isArray(records)) continue;
      stats.dbFiles++;

      const dbLabel = meta.labelJP || meta.labelEN || db;

      records.forEach((rec, position) => {
        if (!rec || typeof rec !== "object") return;
        stats.records++;
        if (rec.isPrivate === true) {
          stats.skippedPrivate++;
          return;
        }
        const name = resolveName(rec, `${wmeta.titleJP} #${position + 1}`);
        const nameEN = resolveNameEN(rec);
        const recordKey = resolveRecordKey(rec, position);
        const common = {
          work,
          db,
          recordKey,
          titleJP: wmeta.titleJP,
          titleEN: wmeta.titleEN,
          dbLabel,
          name,
          nameEN,
        };

        const bd = parseDay(rec.BirthDay && rec.BirthDay.Day);
        if (bd) {
          events.push({
            ...common,
            kind: "birth",
            disc: "birth",
            month: bd.month,
            day: bd.day,
            summary: `🎂 ${name}（誕生日）`,
            category: "誕生日",
            aboutEN: "",
          });
          stats.birth++;
        }

        if (Array.isArray(rec.AnivDay)) {
          rec.AnivDay.forEach((entry, ai) => {
            if (!entry || typeof entry !== "object") return;
            const d = parseDay(entry.Day);
            if (!d) return;
            const aboutJP = (entry.DayAbout_JP || "").trim();
            const aboutEN = (entry.DayAbout_EN || "").trim();
            const disc = `aniv:${d.month}-${d.day}:${aboutJP || ai}`;
            events.push({
              ...common,
              kind: "aniv",
              disc,
              month: d.month,
              day: d.day,
              summary: `🎉 ${name}（${aboutJP || "記念日"}）`,
              category: "記念日",
              aboutEN,
            });
            stats.aniv++;
          });
        }
      });
    }
  }

  events.sort(
    (a, b) =>
      a.month - b.month ||
      a.day - b.day ||
      a.work.localeCompare(b.work) ||
      a.kind.localeCompare(b.kind) ||
      a.name.localeCompare(b.name) ||
      a.disc.localeCompare(b.disc),
  );

  return { events, stats };
}

/**
 * VCALENDAR 全文を組み立てる。
 * @param {object[]} events
 * @returns {string}
 */
function buildCalendar(events) {
  const head = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(CAL_NAME)}`,
    "X-WR-TIMEZONE:Asia/Tokyo",
    `X-WR-CALDESC:${escapeText(CAL_DESC)}`,
  ].map(foldLine);

  const body = [];
  for (const ev of events) body.push(...buildVevent(ev));

  const tail = ["END:VCALENDAR"];
  return [...head, ...body, ...tail].join("\r\n") + "\r\n";
}

/**
 * エントリポイント
 */
function main() {
  const args = process.argv.slice(2);
  const quiet = args.includes("--quiet");
  const outIdx = args.indexOf("--out");
  const outPath = outIdx >= 0 && args[outIdx + 1] ? path.resolve(args[outIdx + 1]) : DEFAULT_OUT;

  const { events, stats } = collectEvents();
  const ics = buildCalendar(events);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, ics, "utf8");

  if (!quiet) {
    const rel = path.relative(REPO_ROOT, outPath);
    process.stderr.write(
      `[calendar] 出力: ${rel}\n` +
        `[calendar] 作品=${stats.works} DBファイル=${stats.dbFiles} レコード=${stats.records}\n` +
        `[calendar] イベント=${events.length} (誕生日=${stats.birth} 記念日=${stats.aniv})\n` +
        `[calendar] 除外: isPrivate=${stats.skippedPrivate} hidden(作品/DB)=${stats.skippedHidden}\n`,
    );
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}

export {
  collectEvents,
  buildCalendar,
  buildVevent,
  escapeText,
  foldLine,
  parseDay,
  resolveName,
  resolveRecordKey,
};
