/**
 * cloudflare-search-errors.test.js - Workers 実 API の検索クエリ検証テスト
 *
 * @description FTS5 の特殊構文（`*` / `?` のみ等）が渡されたとき、500 ではなく
 *   400 + `Invalid search query` を返すことを固定する回帰テスト。
 * @dependencies pkg/cloudflare/worker.js
 */
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../pkg/cloudflare/worker.js';

/** D1 / R2 を最小限モックした env を返す（検索は空結果でよい） */
function makeEnv() {
  return {
    DB: {
      prepare() {
        return {
          bind() {
            return {
              first: async () => ({ is_hidden: 0 }),
              all: async () => ({ results: [] }),
            };
          },
        };
      },
    },
    BUCKET: {
      head: async () => null,
      get: async () => null,
    },
  };
}

/**
 * この worker が受け付ける API プレフィックスを実行時に検出する。
 *
 * @description `develop` の Worker は `/api/v1`、`addon-ai-tag` の Worker は `/api/ai` だけを
 *   ルーティングする（`worker.js` 冒頭のパス解析）。プレフィックスをハードコードすると
 *   一方向マージのたびに本ファイルが片方のブランチで必ず落ちるため、実際に叩いて判定する。
 * @returns {Promise<string>} 受け付けられたプレフィックス（例: `/api/v1`）
 * @throws {Error} 既知のプレフィックスがいずれも受け付けられない場合
 */
async function resolveApiPrefix() {
  for (const prefix of ['/api/v1', '/api/ai']) {
    const res = await worker.fetch(
      new Request(`https://example.invalid${prefix}/works`),
      makeEnv(),
      {}
    );
    if (res.status !== 404) return prefix;
  }
  throw new Error('worker が既知の API プレフィックス（/api/v1 · /api/ai）を受け付けません');
}

describe('Cloudflare Workers search query validation', () => {
  /** @type {string} 本ブランチの worker が受け付けるプレフィックス */
  let apiPrefix;

  beforeAll(async () => {
    apiPrefix = await resolveApiPrefix();
  });

  it('returns 400 for wildcard-only search queries', async () => {
    const res = await worker.fetch(
      new Request(`https://example.invalid${apiPrefix}/Works_NumberTales/search?q=*`),
      makeEnv(),
      {}
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid search query');
    expect(json.status).toBe(400);
  });
});
