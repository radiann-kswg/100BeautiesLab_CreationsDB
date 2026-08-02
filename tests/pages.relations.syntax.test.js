/**
 * pages/relations.js（相関図ページ）の構文・構成スモークテスト
 *
 * ブラウザ専用コードのため実行までは行わず、Node の構文検査と
 * 「壊れると相関図が丸ごと動かなくなる約束事」の静的チェックを行う。
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const read = (p) => readFileSync(path.resolve(repoRoot, p), 'utf-8');

describe('pages/relations.js の構文', () => {
	it('Node の構文検査を通る', () => {
		expect(() => {
			execFileSync(process.execPath, ['--check', path.resolve(repoRoot, 'pages/relations.js')], { stdio: 'pipe' });
		}).not.toThrow();
	});
});

describe('lib/graph/graph-model.js の構文', () => {
	it('Node の構文検査を通る', () => {
		expect(() => {
			execFileSync(process.execPath, ['--check', path.resolve(repoRoot, 'lib/graph/graph-model.js')], { stdio: 'pipe' });
		}).not.toThrow();
	});
});

describe('相関図ページの構成', () => {
	const html = read('pages/relations.html');

	it('相関図が参照する DOM id がすべて HTML に存在する', () => {
		const js = read('pages/relations.js');
		// relations.js の `$('...')` で参照している id を洗い出す
		const ids = [...js.matchAll(/\$\('([a-z0-9-]+)'\)/gi)].map(m => m[1]);
		expect(ids.length).toBeGreaterThan(10);
		const missing = [...new Set(ids)].filter(id => !html.includes(`id="${id}"`));
		expect(missing, `HTML に無い id: ${missing.join(', ')}`).toEqual([]);
	});

	it('Cytoscape の import map が同梱物を指している', () => {
		expect(html).toContain('"cytoscape": "./vendor/cytoscape/cytoscape.esm.min.js"');
		expect(existsSync(path.resolve(repoRoot, 'pages/vendor/cytoscape/cytoscape.esm.min.js'))).toBe(true);
		expect(existsSync(path.resolve(repoRoot, 'pages/vendor/cytoscape/LICENSE'))).toBe(true);
	});

	it('外部CDNを参照しない（同梱物のみを使う）', () => {
		expect(html).not.toMatch(/https?:\/\/(cdn|unpkg|jsdelivr)/i);
		const js = read('pages/relations.js');
		expect(js).not.toMatch(/https?:\/\/(cdn|unpkg|jsdelivr)/i);
	});

	it('characters.css を先に、relations.css を後に読む（変数定義が先に来る必要がある）', () => {
		expect(html).toContain('for (const name of ["characters", "relations"])');
	});

	it('asset-version を持つ（キャッシュバスティング）', () => {
		expect(html).toMatch(/<meta\s+name="asset-version"\s+content="[^"]+"/);
	});

	it('canvas を見られない場合の代替経路（隣接リスト）がある', () => {
		expect(html).toContain('id="adjacency"');
		expect(html).toContain('id="adjacency-body"');
	});
});

describe('SASS と CSS の対応', () => {
	it('relations.sass と生成物 relations.css が両方ある', () => {
		expect(existsSync(path.resolve(repoRoot, 'pages/relations.sass'))).toBe(true);
		expect(existsSync(path.resolve(repoRoot, 'pages/relations.css'))).toBe(true);
	});

	it('relations.sass は新しいデザイントークンを定義しない（characters.sass のものを流用する）', () => {
		const sass = read('pages/relations.sass');
		// `:root` でのカスタムプロパティ定義が無いこと
		expect(sass).not.toMatch(/^\\?:root/m);
	});

	it('生成物 CSS に主要クラスが含まれる（生成忘れの検出）', () => {
		const css = read('pages/relations.css');
		for (const cls of ['.relmap', '.relmap__rail', '.relmap__canvas', '.relmap__inspector', '.relmap__legend-swatch']) {
			expect(css, `${cls} が relations.css に無い（npx sass での再生成を忘れていないか）`).toContain(cls);
		}
	});
});

describe('Service Worker への混入防止', () => {
	it('新規 lib を 3 つの sw.js の importScripts へ足していない', () => {
		// ESM を importScripts へ足すと SyntaxError で SW 全体の評価が失敗する
		for (const sw of ['pages/sw.js', 'api/sw.js', 'svc/sw.js']) {
			const src = read(sw);
			expect(src, `${sw} に ESM モジュールが混入している`).not.toContain('graph/graph-model.js');
			expect(src).not.toContain('viewer-locator.js');
			expect(src).not.toContain('page-api-bridge.js');
		}
	});
});
