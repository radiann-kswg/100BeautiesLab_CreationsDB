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

/**
 * Google カレンダー colorId → CSS 色名(RFC 7986 COLOR 用)。
 * COLOR 対応クライアント(Apple カレンダー/Thunderbird 等)でのみ着色され、
 * 非対応クライアントでは無害に無視される。Google 同期側は colorId をそのまま使う。
 */
const GCAL_COLOR_CSS = {
  1: "slateblue",
  2: "mediumseagreen",
  3: "darkorchid",
  4: "lightcoral",
  5: "gold",
  6: "orangered",
  7: "deepskyblue",
  8: "dimgray",
  9: "royalblue",
  10: "seagreen",
  11: "crimson",
};

/** CalendarColorId 未指定の作品へ表示順(ディレクトリ名ソート)で割り当てるフォールバック色 */
const FALLBACK_COLOR_IDS = ["7", "3", "6", "4", "11", "8", "10", "5", "1", "2", "9"];

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
        // Google カレンダー同期・ICS COLOR 用の作品色("1"〜"11"のみ有効)
        colorId: /^(?:[1-9]|1[01])$/.test(String(val.CalendarColorId ?? "")) ? String(val.CalendarColorId) : "",
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
 * DESCRIPTION 本文(和文)を組み立てる。ICS と Google カレンダー同期で共通利用する。
 * @param {object} ev collectEvents() のイベント
 * @returns {string}
 */
function buildEventDescription(ev) {
  const lines = [];
  lines.push(`作品: ${ev.titleJP}${ev.titleEN ? ` (${ev.titleEN})` : ""}`);
  if (ev.dbLabel) lines.push(`DB: ${ev.dbLabel}`);
  if (ev.nameEN) lines.push(`英名: ${ev.nameEN}`);
  if (ev.kind === "aniv" && ev.aboutJP && ev.aboutJP !== "誕生日") lines.push(`記念日: ${ev.aboutJP}`);
  if (Array.isArray(ev.aliases) && ev.aliases.length) lines.push(`同一人物の別名義: ${ev.aliases.join(" ／ ")}`);
  lines.push("出典: 100BeautiesLab. Creations DB（自動生成）");
  return lines.join("\n");
}

/**
 * 繰り返しルールを返す。2/29 生まれは「毎年2月末日」
 * (BYMONTHDAY=-1: 平年は 2/28、うるう年は 2/29)として扱う。
 * @param {object} ev
 * @returns {string} RRULE 行(ICS 形式)
 */
function buildRrule(ev) {
  return ev.month === 2 && ev.day === 29
    ? "RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1"
    : "RRULE:FREQ=YEARLY";
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

  const description = buildEventDescription(ev);

  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${FIXED_DTSTAMP}`,
    `SUMMARY:${escapeText(ev.summary)}`,
    `DTSTART;VALUE=DATE:${ymd(ev.month, ev.day)}`,
    `DTEND;VALUE=DATE:${ymdNext(ev.month, ev.day)}`,
    buildRrule(ev),
    ...(ev.colorName ? [`COLOR:${ev.colorName}`] : []),
    `CATEGORIES:${escapeText(ev.category)}`,
    `DESCRIPTION:${escapeText(description)}`,
    ...(ev.personGroup ? [`X-PERSON-GROUP:${ev.personGroup}`] : []),
    ...(Array.isArray(ev.aliases) && ev.aliases.length
      ? [`X-PERSON-ALIASES:${escapeText(ev.aliases.join(" ／ "))}`]
      : []),
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ];
  return lines.map(foldLine);
}

/* ============================================================
 * 参照解決（_DBLink / _Jump / $enrich）— 同一人物集約用
 * 仕様: docs/api-sw-spec.md §8。カレンダーが必要とする
 * BirthDay / AnivDay の解決に限定した軽量実装。
 * ============================================================ */

/** $Def_DBLinkRef エントリのセンチネルキー（インデックス値以外） */
const DBLINK_SENTINEL = new Set(["_DB", "_Work", "label_JP", "label_EN", "hashTag"]);

/** typedef 走査に失敗した場合の $enrich:true フォールバック集合 */
const ENRICH_TRUE_FALLBACK = new Set([
  "AnotherRegions_DBLink",
  "ThisArcanaHolder_DBLink",
  "SameModels_DBLink",
]);

/**
 * グローバル＋各作品の db_type.json を走査し、`*_DBLink` suffix の `$enrich: true` 集合を求める。
 * $enrich:true = 「同一人物（参照先の同名フィールドを穴埋め）」。
 * @returns {Set<string>}
 */
function loadEnrichTrueFields() {
  const set = new Set();
  const files = [path.join(DATA_DIR, "db_type.json")];
  try {
    for (const d of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
      if (d.isDirectory() && d.name.startsWith("Works_")) {
        files.push(path.join(DATA_DIR, d.name, "DataBases", "db_type.json"));
      }
    }
  } catch {
    /* noop */
  }
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const v of node) walk(v);
      return;
    }
    const tag = node.hashTag;
    if (typeof tag === "string" && /_DBLink$/.test(tag) && node.$enrich === true) set.add(tag);
    for (const v of Object.values(node)) walk(v);
  };
  for (const f of files) {
    const j = readJsonSafe(f);
    if (j) walk(j);
  }
  return set.size ? set : new Set(ENRICH_TRUE_FALLBACK);
}

/** エントリからインデックス条件（非センチネル・非アンダースコアキー）を抽出 */
function dblinkConditions(entry) {
  const c = {};
  for (const k of Object.keys(entry)) {
    if (DBLINK_SENTINEL.has(k) || k.startsWith("_")) continue;
    c[k] = entry[k];
  }
  return c;
}

/** ネストインデックスの subset match（null は明示 null 一致） */
function dblinkSubset(recVal, q) {
  if (q === null || q === undefined) return recVal === null || recVal === undefined;
  if (typeof q !== "object") return recVal !== null && recVal !== undefined && String(recVal) === String(q);
  if (recVal === null || typeof recVal !== "object") return false;
  return Object.keys(q).every((k) => dblinkSubset(recVal[k], q[k]));
}

/** 1レコードが条件群に一致するか */
function dblinkMatch(rec, conds) {
  const keys = Object.keys(conds);
  if (!keys.length) return false;
  return keys.every((k) => {
    const q = conds[k];
    const rv = rec[k];
    if (q !== null && typeof q === "object") return dblinkSubset(rv, q);
    if (q === null) return rv === null || rv === undefined;
    return rv !== null && rv !== undefined && String(rv) === String(q);
  });
}

/**
 * $Def_DBLinkRef エントリを解決し対象ノード配列を返す（enrich 同様の先頭一致採用／null は 1件一致のみ）。
 * @param {object} entry
 * @param {string} srcWork
 * @param {string} srcDb
 * @param {Map<string, object[]>} index
 * @returns {object[]}
 */
function resolveDbLinkTargets(entry, srcWork, srcDb, index) {
  if (!entry || typeof entry !== "object") return [];
  const tw = typeof entry._Work === "string" && entry._Work.trim() ? entry._Work.trim() : srcWork;
  const tdb = typeof entry._DB === "string" && entry._DB.trim() ? entry._DB.trim() : srcDb;
  const list = index.get(tw + " " + tdb);
  if (!list) return [];
  const conds = dblinkConditions(entry);
  if (!Object.keys(conds).length) return [];
  const matches = list.filter((n) => dblinkMatch(n.rec, conds));
  const hasNull = JSON.stringify(conds).includes("null");
  if (hasNull) return matches.length === 1 ? matches : [];
  return matches.length ? [matches[0]] : [];
}

/** ノードの $enrich:true リンク先ノード群（同一人物候補） */
function enrichTrueTargets(node, index, enrichTrue) {
  const out = [];
  for (const field of enrichTrue) {
    const v = node.rec[field];
    if (!v) continue;
    for (const e of Array.isArray(v) ? v : [v]) {
      for (const t of resolveDbLinkTargets(e, node.work, node.db, index)) out.push(t);
    }
  }
  return out;
}

/**
 * BirthDay / AnivDay を解決する（literal・_Jump・_Search・_DBLink・$enrich:true 継承に対応）。
 * @param {object} node
 * @param {"BirthDay"|"AnivDay"} field
 * @param {Map<string, object[]>} index
 * @param {Set<string>} enrichTrue
 * @param {Set<string>} seen 循環防止
 * @returns {{month:number, day:number, aboutJP:string, aboutEN:string}[]}
 */
function resolveDayField(node, field, index, enrichTrue, seen) {
  const memoKey = node.key + "|" + field;
  if (seen.has(memoKey)) return [];
  seen.add(memoKey);
  const rec = node.rec;
  const out = [];
  const pushDay = (dayObj, aj, ae) => {
    const d = parseDay(dayObj);
    if (d) out.push({ month: d.month, day: d.day, aboutJP: (aj || "").trim(), aboutEN: (ae || "").trim() });
  };
  const handleEntry = (entry) => {
    if (!entry || typeof entry !== "object") return;
    if (entry._Jump && typeof entry._Jump === "object") {
      const jmp = entry._Jump;
      const targetField = jmp.hashTag === "AnivDay" || jmp.hashTag === "BirthDay" ? jmp.hashTag : field;
      let bases = [node];
      if (jmp._DBLink) bases = resolveDbLinkTargets(jmp._DBLink, node.work, node.db, index);
      const search = entry._Search || jmp._Search;
      const searchKey =
        Array.isArray(search) && search[0] && /^DayAbout/.test(search[0].hashTag || "") ? search[0].key : null;
      for (const b of bases) {
        let days = resolveDayField(b, targetField, index, enrichTrue, seen);
        if (searchKey != null && targetField === "AnivDay") {
          days = days.filter((d) => d.aboutJP === searchKey || d.aboutEN === searchKey);
        }
        for (const d of days) {
          const aj = entry.DayAbout_JP || (searchKey != null ? searchKey : d.aboutJP);
          const ae = entry.DayAbout_EN || d.aboutEN;
          out.push({ month: d.month, day: d.day, aboutJP: (aj || "").trim(), aboutEN: (ae || "").trim() });
        }
      }
      return;
    }
    pushDay(entry.Day, entry.DayAbout_JP, entry.DayAbout_EN);
  };

  const raw = rec[field];
  if (field === "BirthDay") {
    if (raw && typeof raw === "object") {
      if (raw._Jump) handleEntry(raw);
      else pushDay(raw.Day);
    }
  } else if (Array.isArray(raw)) {
    for (const e of raw) handleEntry(e);
  } else if (raw && typeof raw === "object") {
    handleEntry(raw);
  }
  // $enrich:true 継承（自前が空のときのみ穴埋め）
  if (!out.length) {
    for (const t of enrichTrueTargets(node, index, enrichTrue)) {
      const d = resolveDayField(t, field, index, enrichTrue, seen);
      if (d.length) {
        for (const x of d) out.push(x);
        break;
      }
    }
  }
  return out;
}

/* Union-Find（同一人物グルーピング。辞書順で小さいキーを親にして決定的） */
function ufFind(parent, x) {
  while (parent[x] !== x) {
    parent[x] = parent[parent[x]];
    x = parent[x];
  }
  return x;
}
function ufUnion(parent, a, b) {
  const ra = ufFind(parent, a);
  const rb = ufFind(parent, b);
  if (ra === rb) return;
  if (ra < rb) parent[rb] = ra;
  else parent[ra] = rb;
}

/**
 * 全 data ファイルを走査してイベント配列を収集する。
 * `_DBLinkRef`（$enrich:true）で結ばれたレコードは同一人物として 1 件に集約し、
 * `_Jump` / `_DBLink` / $enrich:true 継承で参照解決された誕生日・記念日も取り込む。
 * @returns {{events: object[], stats: object}}
 */
function collectEvents() {
  const worksMeta = loadWorksMeta();
  const enrichTrue = loadEnrichTrueFields();
  const stats = {
    works: 0,
    dbFiles: 0,
    records: 0,
    skippedPrivate: 0,
    skippedHidden: 0,
    birth: 0,
    aniv: 0,
    merged: 0,
  };

  // ---- Pass 1: 収集（公開ルール適用）→ ノード配列 + (work,db) インデックス ----
  const nodes = [];
  const index = new Map(); // `${work} ${db}` -> nodes[]

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

    const colorId = wmeta.colorId || FALLBACK_COLOR_IDS[(stats.works - 1) % FALLBACK_COLOR_IDS.length];
    const colorName = GCAL_COLOR_CSS[Number(colorId)] || "";

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
        const recordKey = resolveRecordKey(rec, position);
        const node = {
          work,
          db,
          position,
          rec,
          recordKey,
          key: `${work} ${db} ${recordKey} ${position}`,
          name,
          summaryName: name.replace(/\r?\n/g, " / "),
          nameEN: resolveNameEN(rec),
          titleJP: wmeta.titleJP,
          titleEN: wmeta.titleEN,
          dbLabel,
          colorId,
          colorName,
        };
        nodes.push(node);
        const ik = work + " " + db;
        if (!index.has(ik)) index.set(ik, []);
        index.get(ik).push(node);
      });
    }
  }

  // ---- Pass 2: 同一人物グルーピング（$enrich:true リンクの Union-Find）----
  const parent = {};
  for (const n of nodes) parent[n.key] = n.key;
  for (const n of nodes) {
    for (const t of enrichTrueTargets(n, index, enrichTrue)) {
      if (parent[t.key] !== undefined) ufUnion(parent, n.key, t.key);
    }
  }
  const rootMembers = new Map();
  for (const n of nodes) {
    const r = ufFind(parent, n.key);
    if (!rootMembers.has(r)) rootMembers.set(r, []);
    rootMembers.get(r).push(n);
  }
  const pidCache = new Map(); // root -> personGroup id
  const pidNames = new Map(); // pid -> Set(表示ラベル)
  for (const [r, members] of rootMembers) {
    const pid = crypto
      .createHash("sha1")
      .update(members.map((m) => m.key).sort().join("|"))
      .digest("hex")
      .slice(0, 12);
    pidCache.set(r, pid);
    pidNames.set(pid, new Set(members.map((m) => `${m.summaryName}（${m.titleJP}）`)));
  }
  const pidOf = (n) => pidCache.get(ufFind(parent, n.key));

  // ---- Pass 3: BirthDay / AnivDay を解決してイベント候補を生成 ----
  const candidates = [];
  for (const n of nodes) {
    const personGroup = pidOf(n);
    const common = {
      work: n.work,
      db: n.db,
      recordKey: n.recordKey,
      titleJP: n.titleJP,
      titleEN: n.titleEN,
      dbLabel: n.dbLabel,
      name: n.name,
      nameEN: n.nameEN,
      colorId: n.colorId,
      colorName: n.colorName,
      personGroup,
    };
    for (const d of resolveDayField(n, "BirthDay", index, enrichTrue, new Set())) {
      const literal = !!(n.rec.BirthDay && n.rec.BirthDay.Day);
      candidates.push({
        ...common,
        kind: "birth",
        disc: "birth",
        month: d.month,
        day: d.day,
        summary: `🎂 ${n.summaryName}（誕生日）`,
        category: "誕生日",
        aboutJP: "誕生日",
        aboutEN: "",
        _prio: literal ? 0 : 1,
      });
    }
    for (const d of resolveDayField(n, "AnivDay", index, enrichTrue, new Set())) {
      const aboutJP = d.aboutJP || "記念日";
      const literalA = Array.isArray(n.rec.AnivDay);
      candidates.push({
        ...common,
        kind: "aniv",
        disc: `aniv:${d.month}-${d.day}:${aboutJP}`,
        month: d.month,
        day: d.day,
        summary: `🎉 ${n.summaryName}（${aboutJP}）`,
        category: "記念日",
        aboutJP,
        aboutEN: d.aboutEN || "",
        _prio: literalA ? 2 : 3,
      });
    }
  }

  // ---- Pass 4: 同一人物・同日・同内容で集約（dedup）----
  // 誕生日相当（birth または about=誕生日）は "誕生日" に正規化して 1 件へ。
  const tagOf = (c) => (c.kind === "birth" || c.aboutJP === "誕生日" ? "誕生日" : c.aboutJP || "記念日");
  const buckets = new Map();
  for (const c of candidates) {
    const bk = `${c.personGroup}|${c.month}|${c.day}|${tagOf(c)}`;
    if (!buckets.has(bk)) buckets.set(bk, []);
    buckets.get(bk).push(c);
  }
  const events = [];
  for (const list of buckets.values()) {
    list.sort(
      (a, b) =>
        a._prio - b._prio ||
        a.work.localeCompare(b.work) ||
        a.db.localeCompare(b.db) ||
        String(a.recordKey).localeCompare(String(b.recordKey)) ||
        a.disc.localeCompare(b.disc),
    );
    const rep = list[0];
    const repLabel = `${rep.name.replace(/\r?\n/g, " / ")}（${rep.titleJP}）`;
    const aliases = [...(pidNames.get(rep.personGroup) || [])].filter((l) => l !== repLabel).sort();
    delete rep._prio;
    rep.aliases = aliases;
    events.push(rep);
    if (list.length > 1) stats.merged += list.length - 1;
  }

  for (const e of events) {
    if (e.kind === "birth") stats.birth++;
    else stats.aniv++;
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
  buildEventDescription,
  buildRrule,
  escapeText,
  foldLine,
  parseDay,
  resolveName,
  resolveRecordKey,
};
