/**
 * [streamingActivity.js] - StreamingActivity 専用セクションレンダラー
 *
 * `streamingActivitySection` として登録し、配信活動情報を言語対応レイアウトで表示する。
 * - 配信ジャンル / 挨拶 / ニックネーム / 配信実績 → タググリッド
 * - 配信概要（#Summary 系） → グリッド下部のプロズブロック
 *
 * `$display.sectionWrapper: "streamingActivitySection"` が指定されたフィールドに適用される。
 * `$display.langMode: "jp"` を持つ子フィールド（StreamingGreeting / ListenerNickname）の
 * 完全対応は将来拡張（TODO）。現状は通常の言語フィルタ経路で処理する。
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
				preWrapText
			} = context.helpers || {};
			const { fieldLabelMap, workMeta: metaForLookup, globalDefType } = context;

			if (!isPlainObject?.(item?.value)) return null;

			const pageLang = getCurrentPageLanguage?.() ?? 'jp';

			const tagNodes = [];
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
