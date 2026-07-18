/**
 * [build-roleplay-prompts.mjs] - JSON DB ＋ テンプレートから配布用ロールプレイプロンプト（Markdown）を生成する CLI
 * @description
 *   各作品 `data/Works_<Work>/RoleplayPrompts/roleplay-prompt.tpl.md` の差し込み口へ、
 *   `ConversationPattern` を中心とした DB 値を機械的に差し込んでプロンプトを生成する。LLM は一切
 *   呼ばず、既存の充填済み値を組み立てるだけ（CLAUDE.md「会話パターン情報の運用制約」準拠）。
 *
 *   符号化フィールド（三人称 DSL / GenderType / RaceType / TailsUnit）は lib/basic-renders /
 *   lib/section-renders の純関数を side-effect import して人間可読へ展開する（UI と同一デコード）。
 *
 *   出力パスは CreationsDBClient.resolveIndexPathRoles() の宣言的判定に従う（フォルダキー/ファイルキー）。
 *   DB 由来セクションは 100bl:auto マーカーで囲まれ、フェーズ2 のマージ更新の下地になる。
 *
 *   CLI:
 *     node tools/build-roleplay-prompts.mjs            # 既定 = plan（dry-run）
 *       --write            実書き込み（既存ファイルは既定で保護＝スキップ）
 *       --check            CI 用: 新規生成予定があれば exit 1（書かない）
 *       --force            既存ファイルを上書き（保護を無効化）
 *       --work=<Name>      作品を絞り込み（Works_ 省略名。例: NumberTales）
 *       --db=<Name>        DB を絞り込み（DB_ 省略名。例: Primary）
 *       --id=<Value>       ファイルキー値で単一レコードに絞り込み
 *       --lang=jp|en       生成言語（既定 jp。en はフェーズ4）
 *       --report=<path>    レポート JSON 出力先（既定 .cache/roleplay-report.json）
 *
 * @author 100BeautiesLab.
 * @version 1.0.0
 * @dependencies Node.js >= 18, pkg/nodejs/index.mjs, tools/roleplay/*.mjs, lib/*（side-effect）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CreationsDBClient from '../pkg/nodejs/index.mjs';
import { renderTemplate, hasUnresolvedPlaceholders } from './roleplay/render.mjs';
// 符号化フィールドのデコードを Node 側でも使えるよう globalThis へ登録（UI と同一ロジック）
import '../lib/wrapper-common.js';
import '../lib/section-wrapper-common.js';
import '../lib/basic-renders/calling-common.js';
import '../lib/basic-renders/type-common.js';
import '../lib/section-renders/tailsUnit.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_NAME = 'roleplay-prompt.tpl.md';
const PROMPTS_DIR = 'RoleplayPrompts';
const DEEP_LINK_BASE = 'https://database.numbertales-radiann.net/pages/characters.html';

/**
 * CLI 引数をパースする（外部依存なしの自前実装）。
 * @param {string[]} argv
 * @returns {{write:boolean, check:boolean, force:boolean, adopt:boolean, lang:string, work:string, db:string, id:string, report:string}}
 */
export function parseArgs(argv) {
	const args = { write: false, check: false, force: false, adopt: false, lang: 'jp', work: '', db: '', id: '', report: '' };
	for (const a of argv) {
		if (a === '--write') args.write = true;
		else if (a === '--check') args.check = true;
		else if (a === '--force') args.force = true;
		else if (a === '--adopt') args.adopt = true;
		else if (a.startsWith('--work=')) args.work = a.slice('--work='.length);
		else if (a.startsWith('--db=')) args.db = a.slice('--db='.length);
		else if (a.startsWith('--id=')) args.id = a.slice('--id='.length);
		else if (a.startsWith('--lang=')) args.lang = a.slice('--lang='.length);
		else if (a.startsWith('--report=')) args.report = a.slice('--report='.length);
	}
	if (args.write && args.check) throw new Error('--write と --check は同時指定できません');
	return args;
}

/**
 * ドットパスでオブジェクトから値を取得する。
 * @param {any} obj
 * @param {string} dotpath
 * @returns {any}
 */
export function getByPath(obj, dotpath) {
	const segs = String(dotpath || '').split('.');
	let cur = obj;
	for (const seg of segs) {
		if (cur == null || typeof cur !== 'object') return undefined;
		cur = cur[seg];
	}
	return cur;
}

/**
 * ファイル/ディレクトリ名に使えない文字をアンダースコアへ置換する。
 * @param {any} s
 * @returns {string}
 */
export function sanitizeSegment(s) {
	return String(s == null ? '' : s).trim().replace(/[/\\:*?"<>|]/g, '_');
}

/**
 * レコードが「充填済みの ConversationPattern」を持つか判定する（生成対象の絞り込み）。
 * テキスト項目のいずれかが非空、または DialogueExamples に非空要素があれば true。
 * @param {any} rec
 * @returns {boolean}
 */
export function hasFilledConversationPattern(rec) {
	const cp = rec?.ConversationPattern;
	if (!cp || typeof cp !== 'object' || Array.isArray(cp)) return false;
	const textKeys = [
		'TalkingTone_JP', 'TalkingTone_EN', 'TopicPreference_JP', 'TopicPreference_EN',
		'TalkFrequency_JP', 'TalkFrequency_EN', 'PreferredTopics_JP', 'PreferredTopics_EN',
		'AvoidedTopics_JP', 'AvoidedTopics_EN', 'ConversationNotes_JP', 'ConversationNotes_EN',
	];
	if (textKeys.some((k) => typeof cp[k] === 'string' && cp[k].trim())) return true;
	const de = cp.DialogueExamples;
	if (Array.isArray(de) && de.some((d) => d && (typeof d === 'string' ? d.trim() : (d.value_JP || d.value_EN || d.value)))) return true;
	return false;
}

/**
 * テンプレ先頭の設定ブロック（`<!-- 100bl:tpl ... -->`）を抽出し、本体から除去する。
 * @param {string} tpl
 * @returns {{config: Record<string,string>, body: string}}
 */
export function extractConfigAndBody(tpl) {
	const config = {};
	let body = String(tpl == null ? '' : tpl);
	const m = body.match(/<!--\s*100bl:tpl\s*([\s\S]*?)-->[ \t]*\r?\n?/);
	if (m) {
		for (const line of m[1].split('\n')) {
			const t = line.trim();
			if (!t) continue;
			const idx = t.indexOf(':');
			if (idx < 0) continue;
			config[t.slice(0, idx).trim()] = t.slice(idx + 1).trim();
		}
		body = body.slice(0, m.index) + body.slice(m.index + m[0].length);
	}
	return { config, body };
}

/**
 * レコードから合成変数（@DisplayName 等）を構築する。
 * - 設定ブロックの式（displayName 等）を評価
 * - 派生値（三人称/性別/種族/尻尾ユニット/deep link）を lib デコードで生成
 * @param {any} record
 * @param {object} ctx - { config, workShort, dbShort, pathRoles, workMeta, globalMeta, lang }
 * @returns {Record<string, any>}
 */
export function buildVars(record, ctx) {
	const { config, workShort, dbShort, pathRoles, workMeta, globalMeta, lang, workTitle } = ctx;
	// 作品名は複数行を持つことがあるため先頭行のみ採用
	const vars = { __lang: lang, WorkTitle_JP: String(workTitle || '').split('\n')[0].trim() };

	// FormalName（改行区切りの複数名）は「または」で連結する。DisplayName 用に空白除去版も用意する
	const orJoin = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean).join(' または ');
	vars.FormalName = orJoin(record.FormalName_JP);
	vars.FormalNameReading = orJoin(record.FormalName_JPReading);
	vars.FormalNameCompact = String(record.FormalName_JP || '').split('\n').map((x) => x.trim().replace(/[\s　]+/g, '')).filter(Boolean).join(' または ');

	// 設定ブロックの式（displayName → DisplayName 等）を評価
	for (const [k, expr] of Object.entries(config || {})) {
		const varName = k.charAt(0).toUpperCase() + k.slice(1);
		vars[varName] = renderTemplate(expr, { record, vars: { ...vars } }, { finalize: false }).trim();
	}
	// DisplayName に改行（複数名）が残る場合は「または」で連結（テンプレ側フィルタ取りこぼしの防御）
	if (typeof vars.DisplayName === 'string' && vars.DisplayName.includes('\n')) {
		vars.DisplayName = vars.DisplayName.split('\n').map((x) => x.trim().replace(/[\s　]+/g, '')).filter(Boolean).join(' または ');
	}

	const CC = globalThis.CallingCommon;
	const TR = globalThis.TypeResolver;
	const reg = globalThis.CharacterValueWrapperRegistry;

	// 呼称系（一/二/三人称・主人呼称）を DSL 展開（UI と同一デコード）
	const decodeCalling = (baseKey) => {
		const raw = (typeof record[`${baseKey}_JP`] === 'string' ? record[`${baseKey}_JP`] : record[baseKey]) || '';
		return (CC?.decodeCallingToText && String(raw).trim()) ? CC.decodeCallingToText(raw, { lang }) : '';
	};
	vars.FirstPerson = decodeCalling('FirstPersonCalling');
	vars.SecondPerson = decodeCalling('SecondPersonCalling');
	vars.ThirdPerson = decodeCalling('ThirdPersonCalling');
	vars.ForMaster = decodeCalling('ForMasterCalling');

	// object 値（`{ value, about }` 形式）はプリミティブへアンラップする（GenderType/Age 等）
	const unwrapValue = (v) => (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v) ? v.value : v;

	// GenderType / RaceType / Belonging（enum/辞書ラベル解決）。
	// 解決不能な object が `[object Object]` へ文字列化された場合は未対応として省略する。
	const cleanLabel = (s) => (typeof s === 'string' && s && !s.includes('[object Object]')) ? s : '';
	vars.Gender = cleanLabel(TR ? TR.resolveVarsDefLabel('GenderType', unwrapValue(record.GenderType), globalMeta, workMeta) : '');
	vars.Race = cleanLabel(TR ? TR.resolveVarsDefLabel('RaceType', unwrapValue(record.RaceType), globalMeta, workMeta) : '');
	vars.Belonging = cleanLabel(TR ? TR.resolveVarsDefLabel('Belonging', unwrapValue(record.Belonging), globalMeta, workMeta) : '');

	// 年齢は Age（無ければ ConceptAge）を採用し、object 値はアンラップして統一する
	vars.Age = unwrapValue(record.Age != null ? record.Age : record.ConceptAge);

	// 誕生日（`{ Day: { Month, DayOfMonth } }` 形式）を「M月D日」へ整形
	vars.BirthDay = (() => {
		const bd = record.BirthDay;
		const day = (bd && typeof bd === 'object') ? (bd.Day || bd) : null;
		return (day && day.Month && day.DayOfMonth) ? `${day.Month}月${day.DayOfMonth}日` : '';
	})();

	// TailsUnit（構造化サマリー。配列各要素をサマリー化して連結）
	vars.TailsUnit = (() => {
		const tu = record.TailsUnit;
		if (!Array.isArray(tu) || !tu.length || !reg?.formatWithRegisteredWrapper) return '';
		const wctx = { schemaType: '$Def_TailsUnit', workMeta, globalDefType: globalMeta, pageLang: lang };
		return tu.map((t) => reg.formatWithRegisteredWrapper(t, wctx)).filter(Boolean).join('、');
	})();

	// deep link（直リンク要素＝ファイルキー＝link 優先を使う）
	vars.DeepLink = (() => {
		const val = getByPath(record, pathRoles.fileKey);
		if (val == null || val === '') return '';
		const langSuffix = lang === 'en' ? '&lang=en' : '';
		return `${DEEP_LINK_BASE}?c=${workShort}/${dbShort}/${pathRoles.fileKey}:${val}${langSuffix}`;
	})();

	return vars;
}

/**
 * レコード 1 件分のプロンプト本文を生成する（テンプレ展開 → マーカースタンプ）。
 * @param {string} tpl
 * @param {any} record
 * @param {object} ctx - buildVars と同じ ctx
 * @returns {{text: string, unresolved: boolean}}
 */
export function generatePrompt(tpl, record, ctx) {
	const { config, body } = extractConfigAndBody(tpl);
	const vars = buildVars(record, { ...ctx, config });
	const rendered = renderTemplate(body, { record, vars }, { onMissing: 'drop' });
	// 生成物はマーカーを含まないクリーンな Markdown とする。フェーズ2 のセクション単位マージ更新は
	// 見出し（`## 「X」の概要` 等）をアンカーにセクションを識別する方式で行う。
	return { text: rendered, unresolved: hasUnresolvedPlaceholders(rendered) };
}

/**
 * 出力パスを算出する（§出力パス規約: splitFolder でフォルダ分け or ファイル名 suffix）。
 * @param {string} outputRoot - <work>/RoleplayPrompts の絶対パス
 * @param {string} dbShort
 * @param {any} record
 * @param {{folderKey:string, fileKey:string, splitFolder:boolean}} pathRoles
 * @returns {string}
 */
export function computeOutputPath(outputRoot, dbShort, record, pathRoles) {
	const fileVal = sanitizeSegment(getByPath(record, pathRoles.fileKey) ?? '');
	const dbDir = path.join(outputRoot, `DB_${dbShort}`);
	if (pathRoles.splitFolder) {
		const folderVal = sanitizeSegment(getByPath(record, pathRoles.folderKey) ?? '');
		return path.join(dbDir, folderVal, `roleplay-prompt-${fileVal}.md`);
	}
	return path.join(dbDir, `roleplay-prompt-${fileVal}.md`);
}

/**
 * メインエントリ。作品/DB/レコードを走査してプロンプトを生成する。
 * @returns {Promise<void>}
 */
async function main() {
	const args = parseArgs(process.argv.slice(2));
	const lang = args.lang === 'en' ? 'en' : 'jp';
	const client = new CreationsDBClient();
	const globalMeta = await client.getMeta();

	const report = { mode: args.write ? 'write' : (args.check ? 'check' : 'plan'), lang, generated: [], protectedSkip: [], noCpSkip: 0, errors: [] };
	let exitCode = 0;

	const worksList = await client.listWorks();
	for (const w of worksList) {
		const workShort = String(w.key).replace(/^#?Works_/, '');
		if (args.work && workShort !== args.work) continue;

		const outputRoot = path.join(REPO_ROOT, 'data', `Works_${workShort}`, PROMPTS_DIR);
		const tplPath = path.join(outputRoot, TEMPLATE_NAME);
		if (!fs.existsSync(tplPath)) continue; // テンプレ未整備の作品はスキップ

		const tpl = fs.readFileSync(tplPath, 'utf8');
		let workMeta = null;
		try { workMeta = await client.getWorkMeta(workShort); } catch { workMeta = null; }

		let dbs = [];
		try { dbs = await client.listDBs(workShort); } catch { dbs = []; }
		for (const dbInfo of dbs) {
			const dbShort = String(dbInfo.key).replace(/^#?DB_/, '');
			if (args.db && dbShort !== args.db) continue;

			let records = [];
			try { records = await client.getRecords(workShort, dbShort); } catch { continue; }
			const pathRoles = await client.resolveIndexPathRoles(workShort, dbShort);
			const seenPaths = new Map();

			for (const rec of records) {
				if (!hasFilledConversationPattern(rec)) { report.noCpSkip++; continue; }
				const idVal = getByPath(rec, pathRoles.fileKey);
				if (args.id && String(idVal) !== args.id) continue;

				const outPath = computeOutputPath(outputRoot, dbShort, rec, pathRoles);
				const relOut = path.relative(REPO_ROOT, outPath).replace(/\\/g, '/');

				// 出力パス衝突検知（先頭だけで完結と判定したのに非一意だった等）
				if (seenPaths.has(outPath)) {
					report.errors.push({ work: workShort, db: dbShort, id: String(idVal), type: 'collision', path: relOut, other: seenPaths.get(outPath) });
					exitCode = 1;
					continue;
				}
				seenPaths.set(outPath, String(idVal));

				let gen;
				try {
					gen = generatePrompt(tpl, rec, { workShort, dbShort, pathRoles, workMeta, globalMeta, lang, workTitle: w.Title_JP });
				} catch (e) {
					report.errors.push({ work: workShort, db: dbShort, id: String(idVal), type: 'render', message: String(e?.message || e), path: relOut });
					exitCode = 1;
					continue;
				}
				if (gen.unresolved) {
					report.errors.push({ work: workShort, db: dbShort, id: String(idVal), type: 'unresolved', path: relOut });
					exitCode = 1;
					continue;
				}

				const exists = fs.existsSync(outPath);
				if (exists && !args.force) {
					report.protectedSkip.push({ work: workShort, db: dbShort, id: String(idVal), path: relOut });
					continue;
				}

				if (args.write) {
					fs.mkdirSync(path.dirname(outPath), { recursive: true });
					fs.writeFileSync(outPath, gen.text, 'utf8');
				}
				report.generated.push({ work: workShort, db: dbShort, id: String(idVal), path: relOut, bytes: gen.text.length, wrote: args.write });
			}
		}
	}

	// レポート出力（.cache は Git 管轄外）
	const reportPath = args.report
		? path.resolve(REPO_ROOT, args.report)
		: path.join(REPO_ROOT, '.cache', 'roleplay-report.json');
	fs.mkdirSync(path.dirname(reportPath), { recursive: true });
	fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

	// サマリ出力
	console.log(`[roleplay] mode=${report.mode} lang=${lang}  generated=${report.generated.length} protected=${report.protectedSkip.length} noCP=${report.noCpSkip} errors=${report.errors.length}`);
	for (const g of report.generated) console.log(`  ${g.wrote ? 'WROTE  ' : 'PLAN   '} ${g.path} (${g.bytes}B)`);
	for (const s of report.protectedSkip) console.log(`  PROTECT ${s.path}`);
	for (const e of report.errors) console.log(`  ERROR[${e.type}] ${e.work}/${e.db} ${e.id}: ${e.message || e.path}`);
	console.log(`  report: ${path.relative(REPO_ROOT, reportPath).replace(/\\/g, '/')}`);

	// --check: 新規生成予定（差分）があれば CI 失敗
	if (args.check && report.generated.length > 0) exitCode = 1;
	if (exitCode) process.exitCode = exitCode;
}

// テストから import した場合は main() を実行しない
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
	main().catch((e) => {
		console.error(e);
		process.exitCode = 1;
	});
}
