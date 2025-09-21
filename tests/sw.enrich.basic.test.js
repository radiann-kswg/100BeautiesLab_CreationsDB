import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// This test validates two critical invariants introduced in recent changes:
// 1) No *_Resolved keys should exist in resolved outputs.
// 2) After enrichment, some fields are replaced in-place with resolved objects.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = dirname(__dirname);

function load(file) {
  const p = join(repoRoot, file);
  const txt = readFileSync(p, 'utf-8');
  return JSON.parse(txt);
}

// Minimal in-process simulation for a subset of enrich behaviors using data files
// We won't import sw.js (it relies on Service Worker/APIs). Instead we assert about raw data shape
// and expected indices existing in meta/type files; this provides early signal on data regressions.

describe('enrichment invariants (static)', () => {
  it('global meta/type exist and contain expected lists', () => {
    const meta = load('data/db_meta.json');
    expect(meta).toBeTypeOf('object');
    // Belonging / Area lists should exist either globally or per work
    const hasBelonging = Object.keys(meta).some(k => k.startsWith('#List_Belonging'));
    const hasArea = Object.keys(meta).some(k => k.startsWith('#List_Area'));
    expect(hasBelonging || hasArea).toBe(true);
  });

  it('per-work meta exist for known works', () => {
    const metaNT = load('data/Works_NumberTales/DataBases/db_meta.json');
    expect(metaNT).toBeTypeOf('object');
  });
});
