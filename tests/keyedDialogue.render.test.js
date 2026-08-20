/**
 * [keyedDialogue.render.test.js] - キー付き台詞リストの整形テスト
 *
 * - `lib/basic-renders/keyedDialogue.js` の `formatKeyedDialogueItem()` / `isKeyedDialogueListType()`
 * - 既存 `ConversationPattern.DialogueExamples`（キー無し）の出力が変わらないこと（回帰）
 * - `$Def_TouchReaction` / `$Def_MotifCommentary` のキー接頭辞が辞書ラベルで解決されること
 *
 * 実データの `db_meta.json` / `db_type.json` を読むので、`$dict` 名や `$display.role` の宣言が
 * 崩れた場合もここで落ちる。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import '../lib/wrapper-common.js';
import '../lib/basic-renders/type-common.js';
import '../lib/basic-renders/def-object-common.js';
import '../lib/basic-renders/keyedDialogue.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (relPath) => JSON.parse(readFileSync(join(repoRoot, relPath), 'utf8'));

const globalMeta = load('data/db_meta.json');
const globalType = load('data/db_type.json');
const workMeta = load('data/Works_NumberTales/DataBases/db_meta.json');
const workType = load('data/Works_NumberTales/DataBases/db_type.json');

/** UI の `metaForLookup` 相当（グローバル + 作品の `$VarsDef` を浅く合成した形） */
const metaForLookup = {
	...globalMeta,
	...workMeta,
	General: {
		...globalMeta.General,
		...workMeta.General,
		$VarsDef: { ...globalMeta.General.$VarsDef, ...workMeta.General.$VarsDef }
	}
};

const K = globalThis.KeyedDialogueRenderer;

/** schema から実際の `$type` を引く（宣言と乖離したテストにならないように） */
const conversationPattern = globalType.$DefType.find((e) => e?.hashTag === 'ConversationPattern');
const childType = (hashTag) => conversationPattern.$type.find((e) => e?.hashTag === hashTag)?.$type;
const DIALOGUE_TYPE = childType('DialogueExamples');
const TOUCH_TYPE = childType('TouchReactions');
const MOTIF_TYPE = workType.$DefType
	.find((e) => e?.hashTag === 'NumerospecStats')?.$type
	.find((e) => e?.hashTag === 'MotifCommentaries')?.$type;

/**
 * `buildObjectChildBlocks` が組み立てる context を再現して 1 要素を整形する
 * @param {any} item
 * @param {string} schemaType
 * @param {string} pageLang
 * @returns {string}
 */
const format = (item, schemaType, pageLang = 'jp') => K.formatKeyedDialogueItem(item, {
	pageLang,
	schemaType,
	workMeta: metaForLookup,
	globalDefType: globalType,
	fallbackFormat: () => ''
});

describe('keyedDialogue: schema 宣言の前提', () => {
	it('ConversationPattern に DialogueExamples と TouchReactions が並んでいる', () => {
		expect(DIALOGUE_TYPE).toContain('#Dialogue');
		expect(TOUCH_TYPE).toBe('$Def_TouchReaction[]|#Null');
	});

	it('NumerospecStats に MotifCommentaries が宣言されている', () => {
		expect(MOTIF_TYPE).toBe('$Def_MotifCommentary[]|#Null');
	});

	it('台詞リスト型だけを整形対象と判定する', () => {
		const ctx = { workMeta: metaForLookup, globalDefType: globalType };
		expect(K.isKeyedDialogueListType(DIALOGUE_TYPE, ctx)).toBe(true);
		expect(K.isKeyedDialogueListType(TOUCH_TYPE, ctx)).toBe(true);
		expect(K.isKeyedDialogueListType(MOTIF_TYPE, ctx)).toBe(true);

		// 台詞ではない構造型・非配列の `#Dialogue` は対象外（既存表示を巻き込まない）
		expect(K.isKeyedDialogueListType('$Def_Faction[]', ctx)).toBe(false);
		expect(K.isKeyedDialogueListType('#Dialogue', ctx)).toBe(false);
		expect(K.isKeyedDialogueListType('#Summary[]|#Null', ctx)).toBe(false);
		expect(K.isKeyedDialogueListType(undefined, ctx)).toBe(false);
	});
});

describe('keyedDialogue: DialogueExamples（キー無し）の回帰', () => {
	it('生文字列はページ言語に合う方だけ残す', () => {
		expect(format('こんにちは', DIALOGUE_TYPE, 'jp')).toBe('こんにちは');
		expect(format('こんにちは', DIALOGUE_TYPE, 'en')).toBe('');
		expect(format('Hello', DIALOGUE_TYPE, 'en')).toBe('Hello');
		expect(format('Hello', DIALOGUE_TYPE, 'jp')).toBe('');
	});

	it('bilingual 要素は本文（補足）の形で出す', () => {
		const item = { value_JP: 'やあ', value_EN: 'Hi', about_JP: '初対面', about_EN: 'First meeting' };
		expect(format(item, DIALOGUE_TYPE, 'jp')).toBe('やあ（初対面）');
		expect(format(item, DIALOGUE_TYPE, 'en')).toBe('Hi (First meeting)');
	});

	it('移行途上の `{ value }` 形式は日本語文字の有無で振り分ける', () => {
		expect(format({ value: 'やあ' }, DIALOGUE_TYPE, 'jp')).toBe('やあ');
		expect(format({ value: 'やあ' }, DIALOGUE_TYPE, 'en')).toBe('');
		expect(format({ value: 'Hi' }, DIALOGUE_TYPE, 'en')).toBe('Hi');
	});

	it('英訳が無い要素は英語ページで出さない', () => {
		expect(format({ value_JP: 'やあ' }, DIALOGUE_TYPE, 'en')).toBe('');
	});

	it('hideText は整形せず呼び出し側の表示へ委ねる', () => {
		expect(format({ hideText: '非公開' }, DIALOGUE_TYPE, 'jp')).toBe('');
	});
});

describe('keyedDialogue: TouchReactions（$Def_TouchReaction）', () => {
	const item = {
		Action: 'pat',
		value_JP: 'ふや…、くすぐったいな。',
		value_EN: 'Nnh… that tickles.',
		about_JP: '照れている時',
		about_EN: 'When bashful'
	};

	it('行為コードを辞書ラベルへ解決して接頭辞にする', () => {
		expect(format(item, TOUCH_TYPE, 'jp')).toBe('なでる：ふや…、くすぐったいな。（照れている時）');
		expect(format(item, TOUCH_TYPE, 'en')).toBe('Pat: Nnh… that tickles. (When bashful)');
	});

	it('辞書に無いコードは生値のまま接頭辞にする', () => {
		expect(format({ ...item, Action: 'unknownAction' }, TOUCH_TYPE, 'jp'))
			.toBe('unknownAction：ふや…、くすぐったいな。（照れている時）');
	});

	it('キー項目が空なら接頭辞を付けない', () => {
		expect(format({ value_JP: 'ふや…' }, TOUCH_TYPE, 'jp')).toBe('ふや…');
	});

	// ページ言語の既定は 'mix'（和英併記）。本文は既存の DialogueExamples と同じく JP 優先で 1 本だけ出るため、
	// 接頭辞も JP へ寄せて 1 行の言語を揃える（辞書ラベル既定の `JP / EN` 併記はここでは使わない）
	it('mix（和英併記）では接頭辞を JP へ寄せて本文と言語を揃える', () => {
		const item = { Action: 'pat', value_JP: 'ふや…', value_EN: 'Nnh…' };
		const text = K.formatKeyedDialogueItem(item, {
			pageLang: 'mix',
			schemaType: TOUCH_TYPE,
			workMeta: metaForLookup,
			globalDefType: globalType,
			fallbackFormat: (it2) => it2.value_JP
		});
		expect(text).toBe('なでる：ふや…');
		expect(text).not.toContain('Pat');
	});
});

describe('keyedDialogue: MotifCommentaries（$Def_MotifCommentary）', () => {
	it('辞書ラベルと TopicValue を連結する（JP は詰め、EN は半角スペース）', () => {
		const item = {
			Topic: 'LifePath',
			TopicValue: 3,
			value_JP: '3は表現と喜びの数だよ。',
			value_EN: '3 is the number of expression and joy.'
		};
		expect(format(item, MOTIF_TYPE, 'jp')).toBe('ライフパス3：3は表現と喜びの数だよ。');
		expect(format(item, MOTIF_TYPE, 'en')).toBe('Life Path 3: 3 is the number of expression and joy.');
	});

	it('TopicValue が無ければラベルだけを接頭辞にする', () => {
		const item = { Topic: 'Angel', value_JP: 'エンジェルナンバーは合図だよ。' };
		expect(format(item, MOTIF_TYPE, 'jp')).toBe('エンジェルナンバー：エンジェルナンバーは合図だよ。');
	});

	it('本文が空なら接頭辞だけの行を作らない', () => {
		expect(format({ Topic: 'LifePath', TopicValue: 3 }, MOTIF_TYPE, 'jp')).toBe('');
	});
});
