/**
 * [termOrigin.js] - `$Def_TermOrigin`（命名の由来言語）の basicFields 用レンダラー
 *
 * @description
 *   辞書行・資料行の `Origin`（`$Def_TermOrigin[]`）を、基本情報テーブル向けの 1 行テキスト
 *   `由来言語：原綴り（読み） — 補足` へ整形します（EN は `Language: Spelling — Note`）。
 *   例: `{ OriginLang: "de", OriginTerm: "Zehn", OriginReading_JP: "ツェーン" }`
 *       → `ドイツ語：Zehn（ツェーン）` / `German: Zehn`
 *
 *   `def-object-common.js` の `formatDefObject()` に委譲しない理由: 原綴り（`OriginTerm`）は
 *   言語に依存しない値で、`_JP` / `_EN` 補足の振り分け規則に乗せると EN 表示で落ちるため。
 *   由来言語ラベルの辞書解決（`#List_OriginLang`）と配列連結は共通部品を使います。
 *
 * @author 100BeautiesLab.
 * @version 1.0.0
 * @dependencies CharacterValueWrapperRegistry (wrapper-common.js), DefObjectRenderer (basic-renders/def-object-common.js)
 * @see docs/wrapper-summary-registry.md（termOriginSummary）
 */
(() => {
	'use strict';
	const root = typeof globalThis !== 'undefined' ? globalThis : self;
	const registry = root.CharacterValueWrapperRegistry;
	const D = root.DefObjectRenderer;
	if (!registry || typeof registry.registerWrapper !== 'function' || !D) return;

	const DEF_NAME = '$Def_TermOrigin';
	const DICT_NAME = 'OriginLang';

	/**
	 * `$Def_TermOrigin` 1 要素を表示テキストへ整形する
	 * @param {any} item - `{ OriginLang, OriginTerm, OriginReading_JP, OriginNote_JP/EN }`
	 * @param {Object} context - wrapper context（pageLang / workMeta / typeSources）
	 * @returns {string}
	 */
	function formatItem(item, context) {
		if (!D.isPlainObject(item)) return D.trimStr(item);
		// `{ hideText }` は意図的マスク。呼び出し側の表示に委ねる
		if (D.trimStr(item.hideText)) return '';

		const pageLang = String(context?.pageLang || 'jp');
		const isEn = pageLang.toLowerCase() === 'en';
		const code = D.trimStr(item.OriginLang);
		const langLabel = code
			? D.pickDictLabel(D.resolveDictRow(DICT_NAME, code, context), DICT_NAME, code, pageLang)
			: '';
		const reading = D.trimStr(item.OriginReading_JP);
		// 読み仮名は JP 側の情報なので EN 表示では付けない
		const term = D.trimStr(item.OriginTerm) + ((reading && !isEn) ? `（${reading}）` : '');
		const note = D.pickLangText(D.trimStr(item.OriginNote_JP), D.trimStr(item.OriginNote_EN), pageLang);

		const head = [langLabel, term].filter(Boolean).join(isEn ? ': ' : '：');
		if (!head) return note;
		return note ? `${head} — ${note}` : head;
	}

	/**
	 * `$Def_TermOrigin` 型の値（単体 / 配列）を表示テキストへ整形する
	 * @param {any} value - 1 要素またはその配列
	 * @param {Object} context - wrapper context
	 * @returns {string}
	 */
	function formatTermOrigin(value, context = {}) {
		const container = D.resolveContainer(DEF_NAME, context);
		if (!container) return '';
		return D.joinByArrayLayout(value, container, (item) => formatItem(item, context));
	}

	registry.registerWrapper('termOriginSummary', {
		match: (context) => D.collectDefNames(context).includes(DEF_NAME),
		format: formatTermOrigin
	});

	root.TermOriginRenderer = { formatTermOrigin };
})();
