/**
 * @fileoverview *Calling_JP / *Calling_EN フィールド専用セクションレンダラー
 *
 * ThirdPersonCalling / FirstPersonCalling / SecondPersonCalling / ForMasterCalling /
 * For79thDealerCalling / For80thDealerCalling 等、`[A-Za-z]Calling` サフィックスを持つ
 * フィールドを対象とし、デリミタ階層（\n > ; > / ,）・*xxx こそあど記法・[※/[* 参照記法を
 * 人間が読みやすい形式に展開して描画する。
 *
 * - $display.section: 'sub' で sub バケットに流れ、standalone section として描画される
 * - *いつ/*れ 系の展開はドキュメント (docs/localization-en-rules.md §4) 準拠
 * - [※xxx] / [*xxx] 展開は正規マッピング (docs/localization-en-rules.md §4-6) 準拠
 *
 * @dependencies CharacterSectionRendererRegistry (section-wrapper-common.js)
 */

(() => {
	const registry = globalThis.CharacterSectionRendererRegistry;
	if (!registry?.registerSectionRenderer) return;

	/** JP *xxx こそあど記法の展開マップ */
	const STAR_EXPAND_JP = {
		'*いつ':   'あいつ/こいつ系（人称・物質）',
		'*イツ':   'あいつ/こいつ系（人称・物質）',
		'*れ':     'あれ/それ系（物質のみ）',
		'*レ':     'あれ/それ系（物質のみ）',
		'*の子':   'その子/この子系',
		'*のこ':   'その子/この子系',
		'*のコ':   'その子/この子系',
		'*っち':   'そっち/こっち系',
		'*の人':   'その人/この人系',
		'*の者':   'その者系（格式）',
		'*の方':   'その方（丁寧）',
		'*ちら':   'そちら/こちら系（丁寧）',
		'*やつ':   'そいつ系（粗野）',
		'*奴':     'そいつ系（粗野）',
	};

	/** JP [※xxx] 参照ラベルの展開マップ */
	const REF_EXPAND_JP = {
		'[※名前呼び]':           '名前呼び',
		'[※二人称]':             '二人称と同じ',
		'[※三人称]':             '三人称と同じ',
		'[※その時により変わる]':   'その時による',
		'[※主人の趣向に応じる]':   '主人の趣向に応じる',
	};

	/** EN [*xxx] 参照ラベルの展開マップ（正規形 + レガシー互換） */
	const REF_EXPAND_EN = {
		'[*by name]':                            'by name',
		'[*second-person calling]':              'same as second-person',
		'[*third-person calling]':               'same as third-person',
		'[*Varies depending on the situation]':  'varies by situation',
		'[*Adapts to the master\'s preferences]': 'adapts to master\'s preferences',
		// レガシー表記（旧データとの互換）
		'[*changes by situation]':  'varies by situation',
		'[*third-person form]':     'same as third-person',
		'[*same as second-person]': 'same as second-person',
		'[*same as third-person]':  'same as third-person',
	};

	/**
	 * 括弧の深さを考慮してトップレベルのセパレータで分割する。
	 * 例: "he/she; (a/b); c".splitTopLevel(';') → ["he/she", "(a/b)", "c"]
	 * @param {string} s
	 * @param {string} sep - 1文字のセパレータ
	 * @returns {string[]}
	 */
	function splitTopLevel(s, sep) {
		const parts = [];
		let depth = 0;
		let cur = '';
		for (const c of s) {
			if (c === '(') { depth++; cur += c; continue; }
			if (c === ')') { depth = Math.max(0, depth - 1); cur += c; continue; }
			if (c === sep && depth === 0) {
				const p = cur.trim();
				if (p) parts.push(p);
				cur = '';
				continue;
			}
			cur += c;
		}
		const last = cur.trim();
		if (last) parts.push(last);
		return parts;
	}

	/**
	 * 文字列末尾の「 ※〜」注釈を抽出する。
	 * @param {string} s
	 * @returns {{ main: string, note: string|null }}
	 */
	function extractNote(s) {
		const m = s.match(/\s※(.+)$/);
		if (!m) return { main: s.trim(), note: null };
		return { main: s.slice(0, m.index).trim(), note: m[1].trim() };
	}

	/**
	 * トークン文字列 1 件を { text, raw, type } に変換。
	 * type は 'ref' | 'demo' | 'plain' のいずれか。
	 * @param {string} raw - トリム済みの 1 トークン
	 * @param {boolean} isJP
	 * @returns {{ text: string, raw: string, type: string }|null}
	 */
	function tokenize(raw, isJP) {
		const t = raw.trim();
		if (!t) return null;

		// JP: [※xxx] 参照記法
		if (isJP && /^\[※/.test(t)) {
			return { raw: t, text: REF_EXPAND_JP[t] ?? t.slice(2, -1), type: 'ref' };
		}
		// EN: [*xxx] 参照記法
		if (!isJP && /^\[\*/.test(t)) {
			return { raw: t, text: REF_EXPAND_EN[t] ?? t.slice(2, -1), type: 'ref' };
		}
		// JP: *xxx こそあど記法（後続テキストを除いてマップキーを特定）
		if (isJP && /^\*/.test(t)) {
			const key = Object.keys(STAR_EXPAND_JP).find(
				(k) => t === k || t.startsWith(`${k}(`) || t.startsWith(`${k}（`)
			);
			if (key) return { raw: t, text: STAR_EXPAND_JP[key], type: 'demo' };
		}
		return { raw: t, text: t, type: 'plain' };
	}

	/**
	 * カテゴリ文字列（`;` 区切り単位）を token ノード配列に変換する。
	 * `/ ` と `, ` の両方を代替表現セパレータとして扱い、元の文字を separator span に残す。
	 * @param {string} catStr
	 * @param {boolean} isJP
	 * @param {Function} elFn - context.helpers.el
	 * @returns {Node[]}
	 */
	function renderCategoryNodes(catStr, isJP, elFn) {
		const nodes = [];
		let depth = 0;
		let cur = '';

		const flush = (sep) => {
			const p = cur.trim();
			cur = '';
			if (!p) return;
			const tok = tokenize(p, isJP);
			if (!tok) return;
			const attrs = { class: `calling-tok calling-tok--${tok.type}` };
			if (tok.raw !== tok.text) attrs.title = tok.raw;
			nodes.push(elFn('span', attrs, [tok.text]));
			if (sep) nodes.push(elFn('span', { class: 'calling-sep-alt', 'aria-hidden': 'true' }, [sep]));
		};

		for (let i = 0; i < catStr.length; i++) {
			const c = catStr[i];
			if (c === '(') { depth++; cur += c; continue; }
			if (c === ')') { depth = Math.max(0, depth - 1); cur += c; continue; }
			if (depth === 0 && (c === '/' || c === ',')) { flush(c); continue; }
			cur += c;
		}
		flush(null);
		return nodes;
	}

	/**
	 * 属性値が undefined / null / '' の場合は付与しないようにする el ラッパー。
	 * @param {Function} elFn
	 * @param {string} tag
	 * @param {Object} attrs
	 * @param {Node[]|string[]} children
	 * @returns {Node}
	 */
	function make(elFn, tag, attrs, children) {
		const clean = {};
		for (const [k, v] of Object.entries(attrs || {})) {
			if (v !== undefined && v !== null && v !== '') clean[k] = v;
		}
		return elFn(tag, clean, children || []);
	}

	registry.registerSectionRenderer('callingSection', {
		/**
		 * `*Calling_JP` / `*Calling_EN` サフィックス（または base キー）を持つ文字列値フィールドを
		 * 自動検出する。$display.section: 'sub' との組み合わせで standalone subField として描画される。
		 * @param {Object} ctx
		 */
		match: (ctx) =>
			/[A-Za-z]Calling(?:_(?:JP|EN))?$/.test(String(ctx?.item?.key || ''))
			&& typeof ctx?.item?.value === 'string'
			&& ctx.item.value.trim() !== '',

		/**
		 * @param {Object} item
		 * @param {Object} context
		 * @returns {Node|null}
		 */
		render: (item, context) => {
			const { el, preWrapText, wrapStandaloneSection, getCurrentPageLanguage } = context.helpers || {};
			if (!el || !item?.value || typeof item.value !== 'string') return null;

			const rawValue = item.value.trim();
			if (!rawValue) return null;

			// キー suffix（_JP/_EN）またはページ言語からパース対象言語を決定
			const keySuffix = String(item.key || '');
			const pageLang = getCurrentPageLanguage ? getCurrentPageLanguage() : '';
			const isJP = keySuffix.endsWith('_JP') || (pageLang === 'jp' && !keySuffix.endsWith('_EN'));

			// 言語が特定できない（base キーで lang='' の場合）はプレーンテキストにフォールバック
			if (!keySuffix.endsWith('_JP') && !keySuffix.endsWith('_EN') && pageLang === '') {
				const fallbackEl = preWrapText ? preWrapText(rawValue) : el('span', {}, [rawValue]);
				const valueEl = make(el, 'div', { class: 'calling-value' }, [
					make(el, 'div', { class: 'calling-ctx' }, [fallbackEl])
				]);
				return wrapStandaloneSection
					? wrapStandaloneSection(item, [valueEl])
					: make(el, 'div', { class: 'section' }, [
						make(el, 'h3', {}, [item.label || keySuffix]),
						valueEl
					]);
			}

			// \n でコンテキストグループに分割
			const ctxEls = rawValue.split('\n').map((line) => {
				const trimmed = line.trim();
				if (!trimmed) return null;

				const { main, note } = extractNote(trimmed);
				if (!main) return null;

				// ; でカテゴリに分割してノードを生成
				const categories = splitTopLevel(main, ';');
				const catNodes = [];

				categories.forEach((cat, ci) => {
					const c = cat.trim();
					if (!c) return;
					const tokNodes = renderCategoryNodes(c, isJP, el);
					if (!tokNodes.length) return;
					catNodes.push(make(el, 'span', { class: 'calling-cat' }, tokNodes));
					// カテゴリ間セパレータ（最後以外）
					if (ci < categories.length - 1) {
						catNodes.push(make(el, 'span', { class: 'calling-sep-cat', 'aria-hidden': 'true' }, ['·']));
					}
				});

				if (!catNodes.length) return null;

				if (note) {
					return make(el, 'div', { class: 'calling-ctx calling-ctx--labeled' }, [
						make(el, 'span', { class: 'calling-ctx-label' }, [`※${note}`]),
						make(el, 'span', { class: 'calling-ctx-cats' }, catNodes),
					]);
				}
				return make(el, 'div', { class: 'calling-ctx' }, catNodes);
			}).filter(Boolean);

			if (!ctxEls.length) return null;

			const valueEl = make(el, 'div', { class: 'calling-value' }, ctxEls);

			if (context?.isStandaloneSubField === true && typeof wrapStandaloneSection === 'function') {
				return wrapStandaloneSection(item, [valueEl]);
			}

			if (context?.wrapInSection === false) return valueEl;

			return make(el, 'div', { class: 'section' }, [
				make(el, 'h3', {}, [item.label || String(item.key || '')]),
				valueEl,
			]);
		},
	});
})();
