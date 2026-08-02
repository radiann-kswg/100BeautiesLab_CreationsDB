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

describe('Cytoscape へ渡す色の約束事（無言の #999 フォールバック防止）', () => {
	/**
	 * コメントを取り除いたソースを返す
	 *
	 * @description 「なぜ `color-mix()` を渡してはいけないか」を説明する JSDoc 自体が
	 * 検査に引っかかってしまうため、コードだけを対象にする。
	 * @param {string} src @returns {string}
	 */
	const stripComments = (src) => src
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

	const js = stripComments(read('pages/relations.js'));

	it('relations.js に color-mix( を書かない', () => {
		// 実測: Cytoscape は color-mix() / color(srgb …) / oklab() を拒否し、
		// 例外を投げずに警告だけ出して #999 へフォールバックする。
		// 目視では「なんとなく灰色」に見えるだけで気づけないので、静的に止める。
		// 濃度段が要る場合は lib/graph/graph-palette.js の mixSrgb() で実値を作る。
		expect(js).not.toMatch(/color-mix\(/);
		expect(js).not.toMatch(/\bcolor\(srgb\b/);
		expect(js).not.toMatch(/\boklab\(|\boklch\(/);
	});

	it('Cytoscape のスタイル値へ var() を渡さない', () => {
		// canvas 描画なので CSS 変数は解決されない。graph-palette.js 側で実値へ解決してから渡す
		expect(js).not.toMatch(/['"`]var\(--/);
	});

	it('色の決め打ち配列（旧 CLUSTER_COLORS）を持たない', () => {
		// グループの識別は「位置 + ラベル + 濃度段 + 枠 + 凡例」の多重符号化で行う。
		// 色相を変える循環パレットは characters.sass に無い色を増やすので使わない
		expect(js).not.toContain('CLUSTER_COLORS');
		// 3 個以上の hex リテラルが並ぶ配列（パレットの復活）を検出する
		expect(js).not.toMatch(/(['"]#[0-9a-f]{6}['"]\s*,\s*){2}['"]#[0-9a-f]{6}['"]/i);
	});

	it('graph-palette.js を経由して色を解決している', () => {
		expect(js).toContain("from '../lib/graph/graph-palette.js'");
		expect(existsSync(path.resolve(repoRoot, 'lib/graph/graph-palette.js'))).toBe(true);
	});

	it('shape-polygon-points を書かない', () => {
		// 実測: [-1, 1] の範囲外の値を渡すとページごとクラッシュする。
		// マス塗りは背景 canvas レイヤーへ描くので Cytoscape の shape は使わない
		expect(js).not.toContain('shape-polygon-points');
	});

	it('意味論色（--success / --warning / --error）をエッジ種別へ流用しない', () => {
		const sass = read('pages/relations.sass');
		// エッジ種別バッジは水色〜紺の単一系統へ寄せる。線種との二重符号化があるので識別性は落ちない
		const kindBlock = sass.slice(sass.indexOf('.relmap__kind--related'));
		expect(kindBlock).not.toMatch(/--success|--error/);
		// --warning は「自動で非表示中（密度）」の注意表示にだけ残す（本来の状態語彙）
		expect(kindBlock.slice(0, kindBlock.indexOf('====')) || kindBlock).not.toMatch(/\.relmap__kind--master\s*\n\s*color: var\(--warning\)/);
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

	it('キャンバスが「機材のスクリーン」定型とサイト地のテクスチャを持つ', () => {
		const css = read('pages/relations.css');
		// characters.sass:2248-2255 の .model-viewer__stage と同じ型
		expect(css).toMatch(/border:\s*1px solid var\(--border-strong\)/);
		expect(css).toMatch(/box-shadow:\s*var\(--glow\) 0 0 16px/);
		// characters.sass:90-99 の body::before と同じ 46px 方眼 ×2 + 170px 星屑
		expect(css).toContain('background-size: 46px 46px, 46px 46px, 170px 170px');
		// pan/zoom へ追随させない（干渉縞と LOD クランプを避けるため画面固定）
		expect(css).toMatch(/background-attachment:\s*fixed/);
	});

	it('オーバーレイが --panel と blur を使う（直値を持たない）', () => {
		const css = read('pages/relations.css');
		const block = css.slice(css.indexOf('.relmap__overlay'));
		expect(block).toMatch(/background:\s*var\(--panel\)/);
		expect(block).toMatch(/backdrop-filter:\s*blur\(/);
		expect(css).not.toContain('rgba(5, 8, 15, 0.72)');
	});

	it('左レールの小見出しが .card h2 の発光バーを打ち消している', () => {
		const css = read('pages/relations.css');
		// `.card h2`(0,1,1) に勝つ詳細度で受けないと、5 つの小見出し全部に発光バーが付き
		// `--glow` の希少性（characters.sass で 2 箇所のみ）が壊れる
		expect(css).toContain('.relmap__rail .relmap__group-title');
		const block = css.slice(css.indexOf('.relmap__rail .relmap__group-title'));
		expect(block.slice(0, 400)).toMatch(/::before\s*\{[^}]*display:\s*none/);
	});

	it('prefers-reduced-motion が走査線（擬似要素の animation）も止める', () => {
		const css = read('pages/relations.css');
		const block = css.slice(css.indexOf('prefers-reduced-motion'));
		// 子孫セレクタだけだと ::after の animation が止まらない
		expect(block).toContain('.relmap__canvas::after');
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
