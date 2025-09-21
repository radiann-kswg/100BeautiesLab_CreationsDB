import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = dirname(__dirname);
const dataRoot = join(repoRoot, 'data');

function* walk(dir) {
  const items = readdirSync(dir);
  for (const name of items) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      yield* walk(p);
    } else {
      yield p;
    }
  }
}

describe('data json sanity', () => {
  it('all .json files under /data are valid JSON', () => {
    let count = 0;
    for (const file of walk(dataRoot)) {
      if (!file.endsWith('.json')) continue;
      const txt = readFileSync(file, 'utf-8');
      try {
        JSON.parse(txt);
      } catch (e) {
        throw new Error(`Invalid JSON: ${file} -> ${String(e)}`);
      }
      count += 1;
    }
    expect(count).toBeGreaterThan(0);
  });
});
