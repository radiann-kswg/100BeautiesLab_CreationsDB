/**
 * [streamingActivity.js] - StreamingActivity 専用セクションレンダラー
 *
 * `streamingActivitySection` として登録し、配信活動情報を言語対応レイアウトで表示する。
 * - 配信ジャンル / 挨拶 / ニックネーム / 配信実績 → タググリッド
 * - 配信概要（#Summary 系） → グリッド下部のプロズブロック
 *
 * `$display.sectionWrapper: "streamingActivitySection"` が指定されたフィールドに適用される。
 * `$display.langMode: "jp"` を持つ bilingual wrapper 子フィールド（StreamingGreeting / ListenerNickname）では、
 * `_enrichment.bilingualWrapperFields` メタを参照して JP/EN 2 列レイアウトで表示する。
 *
 * @author 100BeautiesLab.
 * @version 1.0.0
 * @dependencies CharacterSectionRendererRegistry (section-wrapper-common.js)
 */
(() => {
	const registry = globalThis.CharacterSectionRendererRegistry;
	if (!registry?.registerSectionRenderer) return;

	/** `#Summary` 系として扱いプロズブロックで表示するキーのセット */
	const SUMMARY_KEYS = new Set(['StreamingSummary_JP', 'StreamingSummary_EN']);

	registry.registerSectionRenderer('streamingActivitySection', {
		/**
		 * `$display.sectionWrapper: "streamingActivitySection"` を持つ平 object フィールドに一致する。
		 * rendererMap は sectionWrapper 名で直接引くため、この match は保険として機能する。
		 */
		match: (context) => {
			const item = context?.item;
			if (!item?.value || typeof item.value !== 'object' || Array.isArray(item.value)) return false;
			const display = context?.display ?? item?.display ?? {};
			return display?.sectionWrapper === 'streamingActivitySection';
		},

		/** @param {object} item @param {object} context */
		render: (item, context) => {
			const {
				el,
				isEmptyValueLoose,
				pickSchemaPath,
				pickSchemaType,
				pickSchemaDisplay,
				getFieldLabel,
				formatValueForDisplay,
				createDetailTagGrid,
				wrapStandaloneSection,
				isPlainObject,
				getCurrentPageLanguage,
				preWrapText,
				bilingualColumnsText,
				resolveBilingualWrapperMeta
			} = context.helpers || {};
			const { fieldLabelMap, workMeta: metaForLookup, globalDefType } = context;

			if (!isPlainObject?.(item?.value)) return null;

			const pageLang = getCurrentPageLanguage?.() ?? 'jp';

			const tagNodes = [];
			/** @type {{ label: string, node: any }[]} */
			const bilingualBlocks = [];
			/** @type {{ label: string, value: string }[]} */
			const summaryBlocks = [];

			Object.entries(item.value).forEach(([k, v]) => {
				if (!k || typeof k !== 'string' || k.startsWith('_')) return;
				if (isEmptyValueLoose?.(v)) return;
				// 言語フィルタ: JP モードは _EN を、EN モードは _JP を非表示
				if (pageLang === 'jp' && k.endsWith('_EN')) return;
				if (pageLang === 'en' && k.endsWith('_JP')) return;

				const fallbackPath = `${item.key}.${k}`;
				const schemaPath = pickSchemaPath?.([fallbackPath], fallbackPath) ?? fallbackPath;
				const schemaType = pickSchemaType?.(schemaPath);
				const schemaDisplay = pickSchemaDisplay?.(schemaPath, item.key);
				const fieldLabel = getFieldLabel?.(schemaPath, fieldLabelMap, metaForLookup, globalDefType, k) ?? k;

				// bilingual wrapper メタ（例: StreamingActivity.StreamingGreeting）がある場合は
				// JP/EN を 2 列で表示する。
				const bilingualMeta = resolveBilingualWrapperMeta?.(`${item.key}.${k}`) ?? null;
				if (bilingualMeta && isPlainObject?.(v) && typeof bilingualColumnsText === 'function') {
					const keys = Object.keys(v);
					const jpKey = keys.find((key) => key.endsWith('_JP')) || '';
					const enKey = keys.find((key) => key.endsWith('_EN')) || '';

					if (jpKey || enKey) {
						const jpSchemaPath = jpKey ? `${schemaPath}.${jpKey}` : '';
						const enSchemaPath = enKey ? `${schemaPath}.${enKey}` : '';
						const effectiveType = typeof bilingualMeta.effectiveBaseType === 'string' && bilingualMeta.effectiveBaseType
							? bilingualMeta.effectiveBaseType
							: null;
						const jpValue = jpKey ? formatValueForDisplay?.(v[jpKey], fieldLabelMap, metaForLookup, globalDefType, {
							schemaType: effectiveType ?? pickSchemaType?.(jpSchemaPath),
							display: pickSchemaDisplay?.(jpSchemaPath, schemaPath, item.key),
							fieldKey: jpSchemaPath || schemaPath
						}) : '';
						const enValue = enKey ? formatValueForDisplay?.(v[enKey], fieldLabelMap, metaForLookup, globalDefType, {
							schemaType: effectiveType ?? pickSchemaType?.(enSchemaPath),
							display: pickSchemaDisplay?.(enSchemaPath, schemaPath, item.key),
							fieldKey: enSchemaPath || schemaPath
						}) : '';

						const jpText = String(jpValue ?? '').trim();
						const enText = String(enValue ?? '').trim();
						if (jpText || enText) {
							bilingualBlocks.push({
								label: String(fieldLabel ?? '').trim(),
								node: bilingualColumnsText(jpText, enText)
							});
							return;
						}
					}
				}

				const displayValue = formatValueForDisplay?.(v, fieldLabelMap, metaForLookup, globalDefType, {
					schemaType,
					display: schemaDisplay,
					fieldKey: schemaPath
				});

				const fl = String(fieldLabel ?? '').trim();
				const dv = String(displayValue ?? '').trim();
				if (!fl || !dv) return;

				if (SUMMARY_KEYS.has(k)) {
					summaryBlocks.push({ label: fl, value: dv });
				} else {
					tagNodes.push(el?.('div', { class: 'tag' }, [`${fl}: ${dv}`]) ?? null);
				}
			});

			const children = [];

			const validTags = tagNodes.filter(Boolean);
			if (validTags.length > 0) {
				children.push(createDetailTagGrid?.(validTags) ?? null);
			}

			bilingualBlocks.forEach(({ label, node }) => {
				if (!node) return;
				const labelEl = el?.('p', { class: 'detail-prose__label' }, [label]);
				const bodyEl = el?.('div', { class: 'detail-prose__body' }, [node]);
				if (labelEl || bodyEl) {
					children.push(el?.('div', { class: 'detail-prose' }, [labelEl, bodyEl].filter(Boolean)) ?? null);
				}
			});

			summaryBlocks.forEach(({ label, value: dv }) => {
				const labelEl = el?.('p', { class: 'detail-prose__label' }, [label]);
				const bodyEl = preWrapText
					? preWrapText(dv)
					: el?.('p', { class: 'detail-prose__body' }, [dv]);
				if (labelEl || bodyEl) {
					children.push(el?.('div', { class: 'detail-prose' }, [labelEl, bodyEl].filter(Boolean)) ?? null);
				}
			});

			const filtered = children.filter(Boolean);
			if (!filtered.length) return null;
			return wrapStandaloneSection?.(item, filtered) ?? null;
		}
	});
})();
