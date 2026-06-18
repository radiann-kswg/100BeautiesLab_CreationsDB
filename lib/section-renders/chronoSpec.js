/**
 * ChronospecStats 専用セクションレンダラー (chronoSpecSection)。
 * EffectStats / SafetyLevel を共通ヘルパーで描画し、残り(Artifact, ChronoizedDecave 等)を
 * buildObjectChildBlocks へ委譲する。
 */
(() => {
	const registry = globalThis.CharacterSectionRendererRegistry;
	if (!registry?.registerSectionRenderer) return;

	registry.registerSectionRenderer('chronoSpecSection', {
		/** @param {object} item @param {object} context */
		render: (item, context) => {
			const h = globalThis.__specStatsHelpers;
			const {
				el,
				createDetailTagGrid,
				wrapStandaloneSection,
				isPlainObject,
				buildObjectChildBlocks
			} = context.helpers || {};

			const specValue = item?.value;
			if (!isPlainObject?.(specValue)) return null;

			const specKey = item.key;
			const effPath = `${specKey}.EffectStats`;
			const safetyPath = `${specKey}.SafetyLevel`;

			// --- 共通: EffectStats / SafetyLevel ---
			const effTags = h?.buildEffectStatsTags(specValue?.EffectStats, effPath, context) ?? [];
			const safetyTag = h?.buildSafetyTag(specValue?.SafetyLevel, safetyPath, context) ?? null;

			const detailNodes = [...effTags, safetyTag].filter(Boolean);

			// --- 残りフィールド (Artifact, ChronoizedDecave, ChronoizedPurity 等) ---
			const excludedKeys = new Set(['EffectStats', 'SafetyLevel'].filter(k => specValue?.[k] != null));
			const extraBlocks = buildObjectChildBlocks?.(specKey, specValue, { excludedChildKeys: excludedKeys }) ?? [];

			const sectionChildren = [
				detailNodes.length ? createDetailTagGrid?.(detailNodes) : null,
				...extraBlocks
			].filter(Boolean);

			if (!sectionChildren.length) return null;
			return wrapStandaloneSection?.(item, sectionChildren) ?? null;
		}
	});
})();
