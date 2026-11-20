/** 同期CLIは通常のimportテストから実行できないため、起動前の構文検証を行う。 */
import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

it.each(['migrate.mjs', 'migrate-aihints.mjs', 'build-ai-image-policy.mjs'])('%s が起動できる構文である', file => {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`../pkg/cloudflare/scripts/${file}`, import.meta.url))], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
});
