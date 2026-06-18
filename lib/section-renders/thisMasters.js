/**
 * ThisMasters ($Def_ThisMastersEntry[]) 専用セクションレンダラー。
 * characters.js から import されると CharacterSectionRendererRegistry に 'thisMastersSection' を登録する。
 * 描画に必要なユーティリティはすべて context.helpers / context から受け取る。
 */
(() => {
	const registry = globalThis.CharacterSectionRendererRegistry;
	if (!registry?.registerSectionRenderer) return;

	registry.registerSectionRenderer('thisMastersSection', {
		match: (context) => (
			Array.isArray(context?.item?.value)
			&& String(context?.item?.type || '').includes('$Def_ThisMastersEntry')
		),
		/** @param {object} item @param {object} context */
		render: (item, context) => {
			const {
				el,
				preWrapText,
				isPlainObject,
				wrapStandaloneSection,
				getCurrentPageLanguage
			} = context.helpers || {};

			if (!el || !wrapStandaloneSection || !item?.value?.length) return null;

			const lang = getCurrentPageLanguage ? getCurrentPageLanguage() : 'jp';

			/** about フィールドが string / {hideText} オブジェクト のどちらでも文字列に変換する */
			const resolveText = (raw) => {
				if (!raw && raw !== 0) return '';
				if (typeof raw === 'string') return raw;
				if (isPlainObject?.(raw) && raw.hideText != null) return String(raw.hideText);
				return String(raw);
			};

			const blocks = item.value
				.map((entry) => {
					if (!isPlainObject?.(entry)) return null;

					const valueKey = lang === 'en' ? 'value_EN' : 'value_JP';
					const aboutKey = lang === 'en' ? 'about_EN' : 'about_JP';

					// EN フィールド未設定の場合は JP にフォールバック
					const rawValue = (entry[valueKey] !== undefined && entry[valueKey] !== null)
						? entry[valueKey]
						: entry['value_JP'];
					const rawAbout = (entry[aboutKey] !== undefined && entry[aboutKey] !== null)
						? entry[aboutKey]
						: entry['about_JP'];

					const aboutText = resolveText(rawAbout);
					const valueText = rawValue != null ? String(rawValue).trim() : '';

					if (!valueText && !aboutText) return null;

					// about が null で value のみの場合（専属契約不可 など）
					if (!aboutText) {
						return el('div', { style: 'margin-bottom: 10px;' }, [preWrapText(valueText)]);
					}

					return el('div', { style: 'margin-bottom: 10px;' }, [
						el('div', { class: 'tag', style: 'margin-bottom: 6px;' }, [aboutText]),
						valueText ? preWrapText(valueText) : null
					].filter(Boolean));
				})
				.filter(Boolean);

			if (!blocks.length) return null;

			const outerBlock = el('div', { style: 'margin-bottom: 10px;' }, [
				el('div', { class: 'tag', style: 'margin-bottom: 6px;' }, [item.label]),
				el('div', {}, blocks)
			]);

			return wrapStandaloneSection(item, [outerBlock]);
		}
	});
})();
