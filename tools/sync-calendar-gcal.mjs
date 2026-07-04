/**
 * sync-calendar-gcal.mjs - 創作DB → Google カレンダー直接同期（push 方式）
 * @description data/ 配下の誕生日(BirthDay)・記念日(AnivDay)を Google Calendar API で
 *              対象カレンダーへ「完全ミラー」同期する。イベント ID は ICS の UID と同じ
 *              SHA-1（作品|DB|索引|種別|識別子）から決定的に導出するため、再実行しても
 *              冪等に upsert される。DB 側から消えたイベントはカレンダーからも削除する。
 *              認証はサービスアカウント（JWT Bearer）。外部依存パッケージなし（Node 18+）。
 * @author 100BeautiesLab.
 * @version 1.0.0
 * @dependencies tools/build-calendar-ics.mjs（collectEvents を再利用）
 *
 * 使い方:
 *   GCAL_SERVICE_ACCOUNT_KEY='{...鍵JSON...}' GCAL_CALENDAR_ID='xxx@group.calendar.google.com' \
 *     node tools/sync-calendar-gcal.mjs [--dry-run] [--quiet] [--calendar <id>]
 *
 * 環境変数:
 *   GCAL_SERVICE_ACCOUNT_KEY      サービスアカウント鍵 JSON（文字列そのまま）
 *   GCAL_SERVICE_ACCOUNT_KEY_FILE 鍵 JSON のファイルパス（上と排他・ローカル検証用）
 *   GCAL_CALENDAR_ID              同期先カレンダー ID（--calendar で上書き可）
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectEvents, buildEventDescription, buildRrule } from "./build-calendar-ics.mjs";

const __filename = fileURLToPath(import.meta.url);

/** 繰り返し基準年（うるう年。2/29 を保持するため ICS と同一） */
const BASE_YEAR = 2024;
/** Google Calendar API ベース URL */
const API_BASE = "https://www.googleapis.com/calendar/v3";
/** OAuth2 トークンエンドポイント */
const TOKEN_URL = "https://oauth2.googleapis.com/token";
/** 要求スコープ */
const SCOPE = "https://www.googleapis.com/auth/calendar";
/** 書き込み系 API 呼び出し間の待機 ms（レート制限対策） */
const WRITE_INTERVAL_MS = 120;
/** リトライ上限 */
const MAX_RETRY = 5;

/**
 * "YYYY-MM-DD" 形式の終日日付を返す。
 * @param {number} month - 月(1-12)
 * @param {number} day - 日
 * @param {number} [offsetDays=0] - 加算日数（終日 end 用に +1）
 * @returns {string}
 */
function isoDate(month, day, offsetDays = 0) {
  const d = new Date(Date.UTC(BASE_YEAR, month - 1, day + offsetDays));
  return d.toISOString().slice(0, 10);
}

/**
 * イベントの決定的 ID を導出する（ICS の UID と同一の SHA-1 hex 40 文字）。
 * Google のイベント ID 規約（base32hex: [a-v0-9], 5-1024 文字）に適合する。
 * @param {object} ev - collectEvents() のイベント
 * @returns {string}
 */
function eventIdOf(ev) {
  return crypto
    .createHash("sha1")
    .update(`${ev.work}|${ev.db}|${ev.recordKey}|${ev.kind}|${ev.disc}`)
    .digest("hex");
}

/**
 * Google Calendar のイベントリソースを組み立てる。
 * @param {object} ev - collectEvents() のイベント
 * @returns {{id: string, resource: object, hash: string}}
 */
function buildEventResource(ev) {
  const id = eventIdOf(ev);
  const start = isoDate(ev.month, ev.day);
  const end = isoDate(ev.month, ev.day, 1);
  const resource = {
    id,
    status: "confirmed",
    summary: ev.summary,
    description: buildEventDescription(ev),
    start: { date: start },
    end: { date: end },
    // 2/29 は「毎年2月末日」ルール(平年 2/28・うるう年 2/29)。ICS と共通ロジック
    recurrence: [buildRrule(ev)],
    transparency: "transparent",
  };
  // 作品ごとの色分け(Google イベント色 1〜11)。collectEvents が必ず付与する
  if (ev.colorId) resource.colorId = String(ev.colorId);
  // 変更検知用フィンガープリント（表示内容が変わったときだけ update する）
  const hash = crypto
    .createHash("sha1")
    .update(
      JSON.stringify([
        resource.summary,
        resource.description,
        start,
        end,
        resource.recurrence,
        resource.colorId || "",
      ]),
    )
    .digest("hex");
  resource.extendedProperties = { private: { blSync: "1", blHash: hash } };
  return { id, resource, hash };
}

/**
 * サービスアカウント鍵 JSON を環境変数から読み込む。
 * @returns {{client_email: string, private_key: string}}
 * @throws {Error} 鍵が未設定・不正な場合
 */
function loadServiceAccountKey() {
  const raw = process.env.GCAL_SERVICE_ACCOUNT_KEY;
  const file = process.env.GCAL_SERVICE_ACCOUNT_KEY_FILE;
  let text = raw;
  if (!text && file) text = fs.readFileSync(path.resolve(file), "utf8");
  if (!text) {
    throw new Error(
      "GCAL_SERVICE_ACCOUNT_KEY（または GCAL_SERVICE_ACCOUNT_KEY_FILE）が設定されていません",
    );
  }
  const key = JSON.parse(text);
  if (!key.client_email || !key.private_key) {
    throw new Error("鍵 JSON に client_email / private_key がありません");
  }
  return key;
}

/**
 * base64url エンコード。
 * @param {Buffer|string} input
 * @returns {string}
 */
function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

/**
 * サービスアカウントでアクセストークンを取得する（JWT Bearer フロー）。
 * @param {{client_email: string, private_key: string}} key
 * @returns {Promise<string>} アクセストークン
 */
async function fetchAccessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(key.private_key).toString("base64url");
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`トークン取得に失敗: HTTP ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  if (!json.access_token) throw new Error("トークン応答に access_token がありません");
  return json.access_token;
}

/** 指定 ms 待機 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Google API を呼び出す（429/5xx は指数バックオフでリトライ）。
 * @param {string} token - アクセストークン
 * @param {string} method - HTTP メソッド
 * @param {string} url - 完全 URL
 * @param {object} [body] - JSON ボディ
 * @returns {Promise<{status: number, json: object|null}>}
 */
async function apiCall(token, method, url, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= MAX_RETRY) {
        throw new Error(`API リトライ上限超過: ${method} ${url} → HTTP ${res.status}`);
      }
      const wait = Math.min(1000 * 2 ** attempt, 16000) + Math.floor(Math.random() * 250);
      await sleep(wait);
      continue;
    }
    let json = null;
    const text = await res.text();
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { status: res.status, json };
  }
}

/**
 * カレンダー内の全イベント（繰り返しマスター）を取得する。
 * @param {string} token
 * @param {string} calendarId
 * @returns {Promise<Map<string, object>>} eventId → イベントリソース
 */
async function listExistingEvents(token, calendarId) {
  const existing = new Map();
  let pageToken = "";
  do {
    const params = new URLSearchParams({ maxResults: "2500", showDeleted: "false" });
    if (pageToken) params.set("pageToken", pageToken);
    const url = `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    const { status, json } = await apiCall(token, "GET", url);
    if (status !== 200 || !json) {
      throw new Error(`イベント一覧の取得に失敗: HTTP ${status}`);
    }
    for (const item of json.items || []) existing.set(item.id, item);
    pageToken = json.nextPageToken || "";
  } while (pageToken);
  return existing;
}

/**
 * 完全ミラー同期を実行する。
 * @param {object} opts
 * @param {string} opts.calendarId - 同期先カレンダー ID
 * @param {boolean} opts.dryRun - true なら書き込みせず計画のみ表示
 * @param {boolean} opts.quiet - true ならログ抑制
 * @returns {Promise<{inserted: number, updated: number, deleted: number, skipped: number, failed: number}>}
 */
async function syncCalendar({ calendarId, dryRun, quiet }) {
  const log = (msg) => {
    if (!quiet) process.stderr.write(`${msg}\n`);
  };

  const { events, stats } = collectEvents();
  const desired = new Map();
  for (const ev of events) {
    const built = buildEventResource(ev);
    desired.set(built.id, built);
  }
  log(
    `[gcal-sync] DB 側イベント=${desired.size} (誕生日=${stats.birth} 記念日=${stats.aniv})` +
      `${dryRun ? " [dry-run]" : ""}`,
  );

  let token = "";
  if (!dryRun) token = await fetchAccessToken(loadServiceAccountKey());
  const existing = dryRun ? new Map() : await listExistingEvents(token, calendarId);
  log(`[gcal-sync] カレンダー側イベント=${existing.size}`);

  const result = { inserted: 0, updated: 0, deleted: 0, skipped: 0, failed: 0 };
  const base = `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;

  // 1) DB 側に存在しないイベントを削除（完全ミラー）
  for (const [id] of existing) {
    if (desired.has(id)) continue;
    if (dryRun) {
      result.deleted++;
      continue;
    }
    const { status } = await apiCall(token, "DELETE", `${base}/${encodeURIComponent(id)}`);
    if (status === 204 || status === 200 || status === 410) result.deleted++;
    else {
      result.failed++;
      log(`[gcal-sync] 削除失敗 id=${id} HTTP ${status}`);
    }
    await sleep(WRITE_INTERVAL_MS);
  }

  // 2) 追加・更新（フィンガープリント一致ならスキップ）
  for (const [id, { resource, hash }] of desired) {
    const cur = existing.get(id);
    if (cur) {
      const curHash = cur.extendedProperties?.private?.blHash || "";
      if (curHash === hash && cur.status !== "cancelled") {
        result.skipped++;
        continue;
      }
      if (dryRun) {
        result.updated++;
        continue;
      }
      const { status } = await apiCall(token, "PUT", `${base}/${encodeURIComponent(id)}`, resource);
      if (status === 200) result.updated++;
      else {
        result.failed++;
        log(`[gcal-sync] 更新失敗 id=${id} HTTP ${status}`);
      }
      await sleep(WRITE_INTERVAL_MS);
      continue;
    }
    if (dryRun) {
      result.inserted++;
      continue;
    }
    const ins = await apiCall(token, "POST", base, resource);
    if (ins.status === 200) result.inserted++;
    else if (ins.status === 409) {
      // 過去に削除済みの同一 ID が残っている場合は update で復活させる
      const { status } = await apiCall(token, "PUT", `${base}/${encodeURIComponent(id)}`, resource);
      if (status === 200) result.updated++;
      else {
        result.failed++;
        log(`[gcal-sync] 復活失敗 id=${id} HTTP ${status}`);
      }
    } else {
      result.failed++;
      log(`[gcal-sync] 追加失敗 id=${id} HTTP ${ins.status}`);
    }
    await sleep(WRITE_INTERVAL_MS);
  }

  log(
    `[gcal-sync] 完了: 追加=${result.inserted} 更新=${result.updated} 削除=${result.deleted} ` +
      `スキップ=${result.skipped} 失敗=${result.failed}`,
  );
  return result;
}

/**
 * エントリポイント
 * @returns {Promise<number>} 終了コード
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const quiet = args.includes("--quiet");
  const calIdx = args.indexOf("--calendar");
  const calendarId =
    (calIdx >= 0 && args[calIdx + 1]) || process.env.GCAL_CALENDAR_ID || "";

  if (!calendarId) {
    process.stderr.write("[gcal-sync] GCAL_CALENDAR_ID（または --calendar）が未設定です\n");
    return 1;
  }

  try {
    const result = await syncCalendar({ calendarId, dryRun, quiet });
    return result.failed > 0 ? 1 : 0;
  } catch (err) {
    process.stderr.write(`[gcal-sync] エラー: ${err.message}\n`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exitCode = await main();
}

export { buildEventResource, eventIdOf, isoDate, syncCalendar };
