/**
 * [render.mjs] - ロールプレイプロンプト生成用の軽量テンプレートエンジン（自前・最小 mustache 風）
 * @description
 *   `roleplay-prompt.tpl.md` の差し込み口を、DB レコード値＋合成変数で置換する純関数群。
 *   LLM は一切呼ばず、既存の充填済み値を機械的に組み立てるだけ（CLAUDE.md「会話パターン情報の
 *   運用制約」準拠）。DOM・ファイル I/O には触れない。
 *
 *   記法:
 *   - `{{Path.To.Field}}`            … ドットパス置換（record → vars）。`@Name` は合成変数
 *   - `{{Field | filter}}`           … フィルタ（nospace / oneline / trim）
 *   - `{{#Field}} … {{/Field}}`      … 条件ブロック（非空で出力・空なら除去）
 *   - `{{^Field}} … {{/Field}}`      … 反転条件（空で出力）
 *   - `{{#each Path}} … {{/each}}`   … 配列反復（要素を record に、整形済み `@dialogue` を提供）
 *
 * @author 100BeautiesLab.
 * @version 1.0.0
 * @dependencies なし（Node.js >= 18・標準機能のみ）
 */

/**
 * 値が「空」か判定する（null/undefined/空文字/空白のみ/空配列/空オブジェクト）。
 * `{ hideText: '...' }` は意図的マスクで値があるため空扱いしない。
 * @param {any} v
 * @returns {boolean}
 */
export function isEmpty(v) {
	if (v === null || v === undefined) return true;
	if (typeof v === 'string') return v.trim() === '';
	if (Array.isArray(v)) return v.length === 0;
	if (typeof v === 'object') {
		if (typeof v.hideText === 'string' && v.hideText.trim()) return false;
		return Object.keys(v).length === 0;
	}
	return false;
}

/**
 * ドットパスでコンテキストから値を解決する。
 * `@Name` は合成変数（ctx.vars）から、それ以外は ctx.record からドット辿りで取得する。
 * @param {{record?: any, vars?: any}} ctx
 * @param {string} path
 * @returns {any}
 */
export function resolvePath(ctx, path) {
	const p = String(path == null ? '' : path).trim();
	if (!p) return undefined;
	if (p.startsWith('@')) return ctx?.vars?.[p.slice(1)];
	const segs = p.split('.');
	let cur = ctx?.record;
	for (const seg of segs) {
		if (cur == null || typeof cur !== 'object') return undefined;
		cur = cur[seg];
	}
	return cur;
}

/**
 * 文字列フィルタを適用する。
 * @param {any} value
 * @param {string} name - 'nospace'（空白除去）/ 'oneline'（先頭行のみ）/ 'trim'
 * @returns {string}
 */
export function applyFilter(value, name) {
	const s = value == null ? '' : String(value);
	switch (String(name || '').trim()) {
		case 'nospace': return s.replace(/[\s　]+/g, '');
		case 'oneline': return (s.split('\n')[0] || '').trim();
		case 'trim': return s.trim();
		default: return s;
	}
}

/**
 * DialogueExamples の 1 要素を「台詞（補足）」形式のテキストへ整形する。
 * 3 形式（plain string / `{value, about}` / `{value_JP, value_EN, about_JP, about_EN}`）に対応。
 * @param {any} item
 * @param {string} [lang] - 'jp'（既定）| 'en'
 * @returns {string}
 */
export function formatDialogueItem(item, lang = 'jp') {
	const isEn = String(lang).toLowerCase() === 'en';
	if (typeof item === 'string') return item.trim();
	if (!item || typeof item !== 'object') return '';
	const value = isEn
		? (item.value_EN || item.value || item.value_JP || '')
		: (item.value_JP || item.value || item.value_EN || '');
	const about = isEn
		? (item.about_EN || item.about || item.about_JP || '')
		: (item.about_JP || item.about || item.about_EN || '');
	const v = String(value || '').trim();
	if (!v) return '';
	const a = String(about || '').trim();
	return a ? `${v}（${a}）` : v;
}

/**
 * `{{#each Path}} … {{/each}}` を展開する。
 * 配列各要素を record に、整形済み台詞を `@dialogue` に載せて内側を再帰レンダする。
 * @param {string} tpl
 * @param {{record?: any, vars?: any}} ctx
 * @param {object} opts
 * @returns {string}
 */
function expandEach(tpl, ctx, opts) {
	return tpl.replace(/\{\{#each\s+([\w.@]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_m, path, inner) => {
		const arr = resolvePath(ctx, path);
		if (!Array.isArray(arr) || !arr.length) return '';
		const lang = ctx?.vars?.__lang || 'jp';
		return arr
			.filter((item) => !isEmpty(item))
			.map((item) => {
				const itemRecord = (item && typeof item === 'object' && !Array.isArray(item)) ? item : { value: item };
				const itemCtx = { record: itemRecord, vars: { ...ctx.vars, dialogue: formatDialogueItem(item, lang) } };
				return renderTemplate(inner, itemCtx, { ...opts, finalize: false });
			})
			.join('');
	});
}

/**
 * `{{#Field}}…{{/Field}}` / `{{^Field}}…{{/Field}}` 条件ブロックを展開する（ネスト対応・内側から反復）。
 * @param {string} tpl
 * @param {{record?: any, vars?: any}} ctx
 * @returns {string}
 */
function expandConditionals(tpl, ctx) {
	let prev;
	let out = tpl;
	let guard = 0;
	do {
		prev = out;
		out = out.replace(/\{\{#([\w.@]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, field, inner) =>
			isEmpty(resolvePath(ctx, field)) ? '' : inner);
		out = out.replace(/\{\{\^([\w.@]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, field, inner) =>
			isEmpty(resolvePath(ctx, field)) ? inner : '');
	} while (out !== prev && ++guard < 30);
	return out;
}

/**
 * `{{Path | filter}}` 単純置換を展開する。空値は onMissing に従い drop（既定）または error。
 * @param {string} tpl
 * @param {{record?: any, vars?: any}} ctx
 * @param {object} opts - { onMissing?: 'drop'|'error' }
 * @returns {string}
 */
function expandInterpolations(tpl, ctx, opts) {
	const onMissing = opts.onMissing || 'drop';
	return tpl.replace(/\{\{\s*([^#^/][^}]*?)\s*\}\}/g, (_m, expr) => {
		const parts = String(expr).split('|').map((s) => s.trim());
		const pathPart = parts[0];
		const filterName = parts[1];
		const val = resolvePath(ctx, pathPart);
		if (isEmpty(val)) {
			if (onMissing === 'error') throw new Error(`未解決プレースホルダ: {{${expr}}}`);
			return '';
		}
		let s = Array.isArray(val)
			? val.filter((x) => !isEmpty(x)).map((x) => String(x)).join(', ')
			: String(val);
		if (filterName) s = applyFilter(s, filterName);
		return s;
	});
}

/**
 * 出力テキストの体裁を整える（空箇条書き行の除去・連続空行の畳み込み・行末空白除去・末尾改行1個）。
 * @param {string} text
 * @returns {string}
 */
export function finalizeText(text) {
	const lines = String(text == null ? '' : text)
		.split('\n')
		.filter((line) => !/^[ \t]*[-*]\s*$/.test(line));
	let out = lines.join('\n');
	out = out.replace(/[ \t]+$/gm, '');
	out = out.replace(/\n{3,}/g, '\n\n');
	out = out.replace(/\s+$/, '');
	return `${out}\n`;
}

/**
 * レンダ結果に未解決の `{{ … }}` が残っていないか判定する（タイポ検出用）。
 * @param {string} text
 * @returns {boolean}
 */
export function hasUnresolvedPlaceholders(text) {
	return /\{\{[\s\S]*?\}\}/.test(String(text == null ? '' : text));
}

/**
 * テンプレート文字列を、コンテキスト（record + 合成変数 vars）で展開する。
 * 処理順: {{#each}} → 条件ブロック → 単純置換 →（finalize 時のみ）体裁整形。
 * @param {string} tpl
 * @param {{record?: any, vars?: any}} ctx
 * @param {{onMissing?: 'drop'|'error', finalize?: boolean}} [opts]
 * @returns {string}
 */
export function renderTemplate(tpl, ctx, opts = {}) {
	const finalize = opts.finalize !== false;
	let out = String(tpl == null ? '' : tpl);
	out = expandEach(out, ctx, opts);
	out = expandConditionals(out, ctx);
	out = expandInterpolations(out, ctx, opts);
	if (finalize) out = finalizeText(out);
	return out;
}
