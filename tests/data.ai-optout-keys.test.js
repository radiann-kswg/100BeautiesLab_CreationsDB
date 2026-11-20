/** 同値でも重複した権利キーは後の編集を無効にし得るため、JSON.parse 前に検出する。 */
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'glob';

it('権利JSONに重複するAI_Optoutキーがない', () => {
  for (const file of globSync('data/**/*.json')) {
    const stack = [];
    let pending = null;
    for (const match of readFileSync(file, 'utf8').matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]/g)) {
      const token = match[0];
      if (token === '{') { stack.push(new Set()); pending = null; }
      else if (token === '[') { stack.push(null); pending = null; }
      else if (token === '}' || token === ']') { stack.pop(); pending = null; }
      else if (token === ',') pending = null;
      else if (token === ':') {
        if (pending && stack.at(-1) && JSON.parse(pending) === 'AI_Optout') {
          expect(stack.at(-1).has('AI_Optout'), file).toBe(false);
          stack.at(-1).add('AI_Optout');
        }
        pending = null;
      } else pending = token;
    }
  }
});
