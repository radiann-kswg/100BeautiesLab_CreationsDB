/**
 * [roleplay-render.test.js] - tools/roleplay/render.mjs のテンプレートエンジン純関数テスト
 * @description
 *   差し込み口（ドットパス・合成変数・フィルタ・条件ブロック・配列反復）の展開、DialogueExamples の
 *   3 形式整形、体裁整形、未解決検出を合成入力で検証する。LLM・DOM・I/O は使わない。
 */
import { describe, it, expect } from 'vitest';
import {
	isEmpty,
	resolvePath,
	applyFilter,
	formatDialogueItem,
	finalizeText,
	hasUnresolvedPlaceholders,
	renderTemplate,
} from '../tools/roleplay/render.mjs';

describe('isEmpty', () => {
	it('null/undefined/空文字/空白/空配列/空オブジェクトを空判定', () => {
		for (const v of [null, undefined, '', '  ', [], {}]) expect(isEmpty(v)).toBe(true);
	});
	it('hideText マスクは値ありとして非空', () => {
		expect(isEmpty({ hideText: '秘密' })).toBe(false);
	});
	it('非空値は false', () => {
		expect(isEmpty('x')).toBe(false);
		expect(isEmpty([1])).toBe(false);
		expect(isEmpty(0)).toBe(false);
	});
});

describe('resolvePath', () => {
	const ctx = { record: { A: { B: 'v' } }, vars: { DisplayName: '57(イズナ)' } };
	it('ドットパスで record を辿る', () => {
		expect(resolvePath(ctx, 'A.B')).toBe('v');
	});
	it('@ 接頭辞は合成変数から', () => {
		expect(resolvePath(ctx, '@DisplayName')).toBe('57(イズナ)');
	});
	it('存在しないパスは undefined', () => {
		expect(resolvePath(ctx, 'A.X')).toBeUndefined();
		expect(resolvePath(ctx, 'Z.Y')).toBeUndefined();
	});
});

describe('applyFilter', () => {
	it('nospace は全角/半角空白を除去', () => {
		expect(applyFilter('錦野 舞', 'nospace')).toBe('錦野舞');
		expect(applyFilter('錦野　舞', 'nospace')).toBe('錦野舞');
	});
	it('oneline は先頭行のみ', () => {
		expect(applyFilter('ラジアン(初代)\n扇小春', 'oneline')).toBe('ラジアン(初代)');
	});
	it('trim / 未知フィルタはそのまま', () => {
		expect(applyFilter('  x  ', 'trim')).toBe('x');
		expect(applyFilter('x', 'unknown')).toBe('x');
	});
});

describe('formatDialogueItem', () => {
	it('plain string', () => {
		expect(formatDialogueItem('こんにちは', 'jp')).toBe('こんにちは');
	});
	it('bilingual + about（JP）', () => {
		const item = { value_JP: 'やあ', value_EN: 'Hey', about_JP: '挨拶', about_EN: 'greeting' };
		expect(formatDialogueItem(item, 'jp')).toBe('やあ（挨拶）');
	});
	it('bilingual（EN）', () => {
		const item = { value_JP: 'やあ', value_EN: 'Hey', about_JP: '挨拶', about_EN: 'greeting' };
		expect(formatDialogueItem(item, 'en')).toBe('Hey（greeting）');
	});
	it('about 無しは台詞のみ', () => {
		expect(formatDialogueItem({ value_JP: 'よろしく' }, 'jp')).toBe('よろしく');
	});
});

describe('renderTemplate', () => {
	const ctx = {
		record: {
			Summary_JP: '概要テキスト',
			FirstPersonCalling_JP: '私(わたし)',
			Hobby_JP: 'パズル',
			ConversationPattern: {
				TalkingTone_JP: '明るい口調',
				DialogueExamples: [
					{ value_JP: 'やあ', about_JP: '挨拶' },
					{ value_JP: 'またね' },
				],
			},
		},
		vars: { DisplayName: '4(モチ)', __lang: 'jp' },
	};

	it('合成変数とドットパスを置換する', () => {
		expect(renderTemplate('「{{@DisplayName}}」/{{Summary_JP}}', ctx).trim())
			.toBe('「4(モチ)」/概要テキスト');
		expect(renderTemplate('{{ConversationPattern.TalkingTone_JP}}', ctx).trim())
			.toBe('明るい口調');
	});

	it('条件ブロック #: 非空で出力・空で除去', () => {
		expect(renderTemplate('{{#Hobby_JP}}趣味:{{Hobby_JP}}{{/Hobby_JP}}', ctx).trim()).toBe('趣味:パズル');
		expect(renderTemplate('{{#Unknown}}X{{/Unknown}}', ctx).trim()).toBe('');
	});

	it('反転条件 ^: 空で出力', () => {
		expect(renderTemplate('{{^Unknown}}なし{{/Unknown}}', ctx).trim()).toBe('なし');
		expect(renderTemplate('{{^Hobby_JP}}なし{{/Hobby_JP}}', ctx).trim()).toBe('');
	});

	it('#each で DialogueExamples を整形反復（@dialogue）', () => {
		const out = renderTemplate('{{#each ConversationPattern.DialogueExamples}}- 「{{@dialogue}}」\n{{/each}}', ctx);
		expect(out).toContain('- 「やあ（挨拶）」');
		expect(out).toContain('- 「またね」');
	});

	it('フィルタを適用する', () => {
		const c = { record: { FormalName_JP: '錦野 舞' }, vars: {} };
		expect(renderTemplate('{{FormalName_JP | nospace}}', c).trim()).toBe('錦野舞');
	});

	it('空値は既定 drop、onMissing:error で例外', () => {
		expect(renderTemplate('[{{Missing}}]', ctx).trim()).toBe('[]');
		expect(() => renderTemplate('{{Missing}}', ctx, { onMissing: 'error' })).toThrow();
	});
});

describe('finalizeText / hasUnresolvedPlaceholders', () => {
	it('空箇条書き行を除去し連続空行を畳み込む', () => {
		const out = finalizeText('A\n- \n\n\n\nB');
		expect(out).toBe('A\n\nB\n');
	});
	it('未解決プレースホルダを検出する', () => {
		expect(hasUnresolvedPlaceholders('a {{X}} b')).toBe(true);
		expect(hasUnresolvedPlaceholders('a b')).toBe(false);
	});
});
