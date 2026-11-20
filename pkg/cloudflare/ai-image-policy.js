/** AI API 専用の画像出力フィルタ。通常のサイト・/api/v1 の表示には使わない。 */
import { canonicalAIImagePath, filterAIImageReferences, filterCostumeOptouts } from '../ai-image-policy.mjs';

export const AI_IMAGE_POLICY_KEY = 'policy/ai-image-policy.json';

/** migration で確定した参照キー。生値を含め、別フィールドの許可を流用しない。 */
export const imageReferenceKey = (work, db, field, value) => JSON.stringify([work, db, field, value]);

/** 壊れた表や旧形式を許可側へ倒さない。 */
function ready(policy) {
  return policy?.version === 1 && policy.complete === true
    && Array.isArray(policy.paths) && Array.isArray(policy.references)
    && policy.paths.every((value) => typeof value === 'string' && canonicalAIImagePath(value) === value)
    && policy.references.every((value) => typeof value === 'string')
    && policy.records && typeof policy.records === 'object' && !Array.isArray(policy.records)
    && policy.costumes && typeof policy.costumes === 'object' && !Array.isArray(policy.costumes)
    && Object.values(policy.costumes).every((rows) => Array.isArray(rows)
      && rows.every((row) => typeof row?.Costume === 'string' && row.AI_Optout === true))
    && Object.values(policy.records).every((entry) => typeof entry?.indexKey === 'string'
      && Array.isArray(entry.allowed) && entry.allowed.every((value) => typeof value === 'string'));
}

/**
 * 不明・未生成・更新途中の許可表は空とみなし、画像参照だけを非破壊で取り除く。
 * @param {unknown} data API の返却候補
 * @param {object|null} policy 全作品の共有画像 deny を合成済みの表
 * @param {{workKey?: string, dbName?: string, metadata?: boolean}} context
 * @returns {unknown} 許可された参照だけを含む返却値
 */
export function filterAIResponse(data, policy, { workKey, dbName, metadata = false, hints = false } = {}) {
  const valid = ready(policy);
  const paths = new Set(valid ? policy.paths : []);
  const references = new Set(valid ? policy.references : []);
  const blocked = new Set(valid ? policy.blockedValues : []);
  const contexts = new Map(Object.entries(valid ? policy.records : {}).map(([key, entry]) => [key,
    { indexKey: entry.indexKey, allowed: new Set(entry.allowed) },
  ]));
  const permitted = (value) => paths.has(canonicalAIImagePath(value));
  const costumeRows = valid ? policy.costumes[workKey] ?? [] : [];

  /** meta の例や除外宣言に残るファイル名も、AI API では配信しない。 */
  function sanitize(value, allowed, db) {
    if (typeof value === 'string') {
      if (blocked.has(value)) return undefined;
      const path = canonicalAIImagePath(value);
      return path !== null && (!allowed || !permitted(value)) ? undefined : value;
    }
    if (Array.isArray(value)) return value.map((child) => sanitize(child, allowed, db)).filter((child) => child !== undefined);
    if (!value || typeof value !== 'object') return value;
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === 'Images_AIOptout' || key === '_DBCrossLinkPath') continue;
      if (metadata && (key === 'AppearanceDetail' || key === 'AIHints')) continue;
      if (key === 'Images') {
        if (child === null) { output[key] = null; continue; }
        const images = {};
        if (allowed && child && typeof child === 'object' && !Array.isArray(child)) {
          for (const [field, raw] of Object.entries(child)) {
            const accepted = (entry) => references.has(imageReferenceKey(workKey, db, field, entry));
            if (Array.isArray(raw)) images[field] = raw.filter(accepted);
            else if (accepted(raw)) images[field] = raw;
          }
        }
        output[key] = images;
        continue;
      }
      // Images 以外の画像型の例は、その参照の許諾根拠が確定していないため除く。
      if (/(?:_PNGName|_PNGPath)$/.test(key) || key === 'DB_Image') continue;
      if (key === 'reference_images') {
        output[key] = filterAIImageReferences({ reference_images: child }, (ref) => allowed && permitted(ref)).reference_images;
        continue;
      }
      const filtered = sanitize(child, allowed, db);
      if (filtered !== undefined) output[key] = filtered;
    }
    return output;
  }

  function record(value, db) {
    const definition = contexts.get(`${workKey}/${db}`);
    const index = value?.idx_value ?? definition?.indexKey?.split('.').reduce((current, key) => current?.[key], value);
    const allowed = !metadata && value?.AI_Optout !== true && value?.isPrivate !== true
      && index != null && definition?.allowed.has(String(index));
    if (!metadata && valid && !allowed) return undefined;
    const scoped = hints ? filterCostumeOptouts({ AIHints: value }, costumeRows).AIHints
      : filterCostumeOptouts(value, costumeRows);
    return sanitize(scoped, Boolean(allowed), db);
  }
  if (Array.isArray(data)) return data.map((value) => {
    if (value?.record && value?.db) {
      const filtered = record(value.record, value.db);
      return filtered === undefined ? undefined : { ...value, record: filtered };
    }
    return record(value, dbName);
  }).filter((value) => value !== undefined);
  return record(data, dbName);
}

/** 許諾の更新を遅延させないため、許可表は Cache API やモジュール変数へ保存しない。 */
export async function aiJsonResponse(data, env, context) {
  let policy = null;
  try { policy = await (await env.BUCKET.get(AI_IMAGE_POLICY_KEY))?.json(); }
  catch (error) { console.error('[AI image policy]', error?.message ?? error); }
  // 許可表が読めない間は衣装・レコードの権利も判定できないため、本文を含むAPIを閉じる。
  const unavailable = !context?.metadata && !ready(policy);
  const filtered = unavailable ? undefined : filterAIResponse(data, policy, context);
  const status = unavailable ? 503 : filtered === undefined ? 404 : 200;
  const body = status === 200 ? filtered : { error: unavailable ? 'AI policy unavailable' : 'Record not found', status };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}
