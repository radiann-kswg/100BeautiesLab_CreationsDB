/**
 * IdentityMotif (#Def_FormsMotif[]) 専用セクションレンダラー。
 * characters.js から import されると CharacterSectionRendererRegistry に 'formsMotifSection' を登録する。
 * 描画に必要なユーティリティはすべて context.helpers / context から受け取る。
 */
(() => {
	const registry = globalThis.CharacterSectionRendererRegistry;
	if (!registry?.registerSectionRenderer) return;

	registry.registerSectionRenderer('formsMotifSection', {
		match: (context) => (
			Array.isArray(context?.item?.value)
			&& String(context?.item?.type || '').includes('#Def_FormsMotif')
		),
		/** @param {object} item @param {object} context */
		render: (item, context) => {
			const {
				el,
				preWrapText,
				isPlainObject,
				wrapStandaloneSection,
				getCurrentPageLanguage,
				formatValueForDisplay,
				pickSchemaType
			} = context.helpers || {};
			const { fieldLabelMap, workMeta: metaForLookup, globalDefType } = context;

			if (!el || !wrapStandaloneSection || !item?.value?.length) return null;

			const lang = getCurrentPageLanguage ? getCurrentPageLanguage() : 'jp';
			const formationPath = `${item.key}.Formation`;
			// fieldTypeMap は $Def_FormsMotif 内部まで展開しないため、schema 定義に従い直接指定する
			const formationSchemaType = (pickSchemaType && pickSchemaType(formationPath, 'Formation')) || '#DictIndex';

			const groups = item.value
				.map((entry) => {
					if (!isPlainObject?.(entry)) return null;

					const formationRaw = entry.Formation;
					const formationLabel = formationRaw
						? (String(formatValueForDisplay
							? formatValueForDisplay(formationRaw, fieldLabelMap, metaForLookup, globalDefType, {
								schemaType: formationSchemaType,
								fieldKey: formationPath
							})
							: '').trim() || String(formationRaw).trim())
						: '';

					const motifData = entry.Motif;
					const motifItems = isPlainObject?.(motifData)
						? (lang === 'en'
							? (motifData.Motif_EN || motifData.Motif_JP)
							: (motifData.Motif_JP || motifData.Motif_EN))
						: null;

					const motifText = Array.isArray(motifItems)
						? motifItems.filter(Boolean).map(String).join('、')
						: '';

					if (!formationLabel && !motifText) return null;

					return el('div', { style: 'margin-bottom: 10px;' }, [
						formationLabel ? el('div', { class: 'tag', style: 'margin-bottom: 6px;' }, [formationLabel]) : null,
						motifText ? preWrapText(motifText) : null
					].filter(Boolean));
				})
				.filter(Boolean);

			if (!groups.length) return null;

			const outerBlock = el('div', { style: 'margin-bottom: 10px;' }, [
				el('div', { class: 'tag', style: 'margin-bottom: 6px;' }, [item.label]),
				el('div', {}, groups)
			]);

			return wrapStandaloneSection(item, [outerBlock]);
		}
	});
})();
