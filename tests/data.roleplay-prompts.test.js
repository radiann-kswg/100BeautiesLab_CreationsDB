/**
 * [data.roleplay-prompts.test.js] - ロールプレイプロンプト生成の実データ統合テスト
 * @description
 *   テンプレを持つ全作品 × ConversationPattern 充填済みレコードでプロンプトを生成し、
 *   レンダ成功・未解決プレースホルダ無し・冪等性・マーカー非混入・出力パス規約を検証する。
 *   符号化フィールド（呼称/GenderType/RaceType/TailsUnit）は lib の純関数を side-effect import
 *   して Node 側でも解決する。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CreationsDBClient from '../pkg/nodejs/index.mjs';
import {
	generatePrompt,
	hasFilledConversationPattern,
	computeOutputPath,
} from '../tools/build-roleplay-prompts.mjs';
// 符号化フィールドのデコードを Node 側で有効化（UI と同一ロジック）
import '../lib/wrapper-common.js';
import '../lib/section-wrapper-common.js';
import '../lib/basic-renders/calling-common.js';
import '../lib/basic-renders/type-common.js';
import '../lib/section-renders/tailsUnit.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROMPTS_DIR = 'RoleplayPrompts';
const TEMPLATE_NAME = 'roleplay-prompt.tpl.md';

/** テンプレを持つ作品 × CP 充填済みレコードを収集する */
async function collectTargets() {
	const client = new CreationsDBClient();
	const globalMeta = await client.getMeta();
	const worksList = await client.listWorks();
	const targets = [];
	let noCpCount = 0;
	for (const w of worksList) {
		const workShort = String(w.key).replace(/^#?Works_/, '');
		const tplPath = path.join(REPO_ROOT, 'data', `Works_${workShort}`, PROMPTS_DIR, TEMPLATE_NAME);
		if (!fs.existsSync(tplPath)) continue;
		const tpl = fs.readFileSync(tplPath, 'utf8');
		let workMeta = null;
		try { workMeta = await client.getWorkMeta(workShort); } catch { workMeta = null; }
		let dbs = [];
		try { dbs = await client.listDBs(workShort); } catch { dbs = []; }
		for (const dbInfo of dbs) {
			const dbShort = String(dbInfo.key).replace(/^#?DB_/, '');
			let records = [];
			try { records = await client.getRecords(workShort, dbShort); } catch { continue; }
			const pathRoles = await client.resolveIndexPathRoles(workShort, dbShort);
			for (const rec of records) {
				if (!hasFilledConversationPattern(rec)) { noCpCount++; continue; }
				targets.push({ workShort, dbShort, rec, tpl, workMeta, globalMeta, pathRoles, workTitle: w.Title_JP });
			}
		}
	}
	return { targets, noCpCount };
}

/** @type {any[]} */
let targets = [];
let noCpCount = 0;
beforeAll(async () => {
	({ targets, noCpCount } = await collectTargets());
});

/** レコードの生成コンテキストを組み立てる */
const ctxOf = (t, lang = 'jp') => ({
	workShort: t.workShort,
	dbShort: t.dbShort,
	pathRoles: t.pathRoles,
	workMeta: t.workMeta,
	globalMeta: t.globalMeta,
	lang,
	workTitle: t.workTitle,
});

describe('build-roleplay-prompts 統合（実データ・CP 充填済み）', () => {
	it('CP 充填済みレコードが 1 件以上あり、非充填レコードは除外される', () => {
		expect(targets.length).toBeGreaterThan(0);
		expect(noCpCount).toBeGreaterThan(0); // 非充填も存在する（フィルタが効いている証跡）
	});

	it('全レコードでレンダが成功し、未解決プレースホルダが残らない', () => {
		for (const t of targets) {
			const gen = generatePrompt(t.tpl, t.rec, ctxOf(t));
			expect(gen.unresolved, `${t.workShort}/${t.dbShort} に未解決プレースホルダ`).toBe(false);
			expect(gen.text.trim().length).toBeGreaterThan(0);
		}
	});

	it('冪等性: 同じ入力で 2 回生成すると byte 一致する', () => {
		for (const t of targets) {
			const a = generatePrompt(t.tpl, t.rec, ctxOf(t)).text;
			const b = generatePrompt(t.tpl, t.rec, ctxOf(t)).text;
			expect(a, `${t.workShort}/${t.dbShort} が非冪等`).toBe(b);
		}
	});

	it('生成物に管理マーカーコメント（100bl:*）が残らない', () => {
		for (const t of targets) {
			const { text } = generatePrompt(t.tpl, t.rec, ctxOf(t));
			expect(text).not.toContain('100bl:auto');
			expect(text).not.toContain('100bl:tpl');
		}
	});

	it('出力パスが §出力パス規約どおり（単一=ファイル名 suffix / 複合=フォルダ分け）', () => {
		for (const t of targets) {
			const outputRoot = path.join(REPO_ROOT, 'data', `Works_${t.workShort}`, PROMPTS_DIR);
			const rel = path.relative(REPO_ROOT, computeOutputPath(outputRoot, t.dbShort, t.rec, t.pathRoles)).replace(/\\/g, '/');
			expect(rel).toMatch(/\/roleplay-prompt-[^/]+\.md$/);
			if (t.pathRoles.splitFolder) {
				expect(rel).toMatch(new RegExp(`/DB_${t.dbShort}/[^/]+/roleplay-prompt-`));
			} else {
				expect(rel).toMatch(new RegExp(`/DB_${t.dbShort}/roleplay-prompt-`));
			}
		}
	});

	it('命令文の1行目に改行由来の崩れが無い（作品名/表示名の複数名は「または」連結済み）', () => {
		for (const t of targets) {
			const { text } = generatePrompt(t.tpl, t.rec, ctxOf(t));
			const firstBody = text.split('\n').find((l) => l.includes('あなたはこれから')) || '';
			// 命令文の本文行が途中で切れて次行に別名が漏れていないこと（「」が同一行内で閉じる）
			expect(firstBody).toContain('あなたはこれから');
			expect(firstBody).toContain('として');
		}
	});
});
