/**
 * @fileoverview AppearanceDetail ($Def_AppearanceDetail[]) 専用セクションレンダラー。
 *
 * Formation ごとにグループ化し、各エントリを
 * 「デザイン要素・部位タグ ＋ 属性リスト ＋ 補足テキスト」として描画する。
 * `CharacterSectionRendererRegistry` に `'appearanceDetailSection'` を登録する。
 *
 * dict 解決の方針:
 * - `BodyPart` / `DesignElement` / `Laterality` / `AttrLabel` は
 *   `context.workMeta.General.$VarsDef` の `$EnumDef_*` から直接ルックアップする。
 *   （`resolveVarsDefLabelPack` はフィールド名から `$EnumDef_<FieldName>` を探すが、
 *   実際のキーは `$EnumDef_DesignBodyPart` 等と名称が異なるため、直参照に切り替えている。）
 * - `Formation` は `formatValueForDisplay` に委譲する。
 *   （Formation 辞書は SW が `$VarsDef` に合流済みなので既存ルートで解決できる。）
 *
 * @author 100BeautiesLab.
 * @version 1.0.0
 * @dependencies CharacterSectionRendererRegistry (section-wrapper-common.js)
 */
(() => {
	const registry = globalThis.CharacterSectionRendererRegistry;
	if (!registry?.registerSectionRenderer) return;

	registry.registerSectionRenderer('appearanceDetailSection', {
		match: (context) => (
			Array.isArray(context?.item?.value)
			&& String(context?.item?.type || '').includes('$Def_AppearanceDetail')
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
				pickSchemaType,
				isEmptyValueLoose,
			} = context.helpers || {};
			const { fieldLabelMap, workMeta: metaForLookup, globalDefType } = context;

			if (!el || !wrapStandaloneSection || !item?.value?.length) return null;

			const lang = getCurrentPageLanguage ? getCurrentPageLanguage() : 'jp';
			const basePath = item.key;

			// --- $EnumDef_* 直参照ルックアップ ---
			// workMeta.General.$VarsDef にはグローバルと作品 $VarsDef が合流済み
			const varsDef = metaForLookup?.General?.$VarsDef || {};

			/**
			 * `$EnumDef_*` を直接参照してラベルを解決する
			 * @param {string} rawValue - '#BodyPart_Tail' 等の hash キー
			 * @param {string} enumDefKey - '$EnumDef_DesignBodyPart' 等
			 * @param {string} fieldBase - 'BodyPart' 等（JP/EN サフィックスのベース名）
			 * @returns {string}
			 */
			function resolveFromEnumDef(rawValue, enumDefKey, fieldBase) {
				if (!rawValue) return '';
				const enumDef = varsDef[enumDefKey];
				if (enumDef && typeof enumDef === 'object' && !Array.isArray(enumDef)) {
					// hash キー直引き（例: '#BodyPart_Tail'）
					const entry = Object.prototype.hasOwnProperty.call(enumDef, rawValue)
						? enumDef[rawValue]
						: Object.values(enumDef).find((e) => e && e[fieldBase] === rawValue);
					if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
						return lang === 'en'
							? (entry[`${fieldBase}_EN`] || entry[`${fieldBase}_JP`] || entry[fieldBase] || String(rawValue).trim())
							: (entry[`${fieldBase}_JP`] || entry[fieldBase] || entry[`${fieldBase}_EN`] || String(rawValue).trim());
					}
				}
				// enum 定義が見つからない場合は raw をそのまま返す
				return String(rawValue).trim();
			}

			/**
			 * Formation を `formatValueForDisplay` に委譲して解決する
			 * @param {string} rawFormation
			 * @returns {string}
			 */
			function resolveFormationLabel(rawFormation) {
				if (!rawFormation || !formatValueForDisplay) return String(rawFormation || '').trim();
				const schemaType = (pickSchemaType && pickSchemaType(`${basePath}.Formation`, 'Formation')) || '#DictIndex';
				const resolved = String(
					formatValueForDisplay(rawFormation, fieldLabelMap, metaForLookup, globalDefType, {
						schemaType,
						fieldKey: `${basePath}.Formation`
					}) ?? ''
				).trim();
				return resolved || String(rawFormation).trim();
			}

			/**
			 * エントリ先頭のタグ群（DesignElement / BodyPart[] / Laterality）を生成する
			 * @param {object} entry
			 * @returns {HTMLElement[]}
			 */
			function buildHeaderTags(entry) {
				const tags = [];

				if (entry.DesignElement) {
					const label = resolveFromEnumDef(entry.DesignElement, '$EnumDef_DesignElement', 'DesignElement');
					if (label) tags.push(el('div', { class: 'tag' }, [label]));
				}

				const parts = Array.isArray(entry.BodyPart)
					? entry.BodyPart
					: (entry.BodyPart ? [entry.BodyPart] : []);
				for (const bp of parts) {
					if (!bp) continue;
					const label = resolveFromEnumDef(bp, '$EnumDef_DesignBodyPart', 'BodyPart');
					if (label) tags.push(el('div', { class: 'tag' }, [label]));
				}

				if (entry.Laterality) {
					const label = resolveFromEnumDef(entry.Laterality, '$EnumDef_Laterality', 'Laterality');
					if (label) tags.push(el('div', { class: 'tag' }, [label]));
				}

				return tags;
			}

			/**
			 * `Attrs` 配列から表示行ノードを生成する
			 * @param {Array} attrs
			 * @returns {HTMLElement[]}
			 */
			function buildAttrRows(attrs) {
				if (!Array.isArray(attrs)) return [];
				return attrs.flatMap((attr) => {
					if (!isPlainObject?.(attr)) return [];

					const value = lang === 'en'
						? (attr.Value_EN || attr.Value_JP)
						: (attr.Value_JP || attr.Value_EN);
					const isEmpty = isEmptyValueLoose
						? isEmptyValueLoose(value)
						: (value === null || value === undefined || value === '');
					if (isEmpty) return [];

					const valueText = String(value).trim();
					if (!valueText) return [];

					const attrLabel = attr.AttrLabel
						? resolveFromEnumDef(attr.AttrLabel, '$EnumDef_DesignAttrLabel', 'AttrLabel')
						: '';

					const text = attrLabel ? `${attrLabel}: ${valueText}` : valueText;
					return [el('div', { class: 'appearance-detail__attr-row' }, [text])];
				});
			}

			/**
			 * エントリ 1 件をノードに変換する
			 * @param {object} entry
			 * @returns {HTMLElement|null}
			 */
			function buildEntryNode(entry) {
				if (!isPlainObject?.(entry)) return null;

				const headerTags = buildHeaderTags(entry);
				const attrRows = buildAttrRows(entry.Attrs);

				const note = lang === 'en'
					? (entry.Note_EN || entry.Note_JP)
					: (entry.Note_JP || entry.Note_EN);
				const noteText = note ? String(note).trim() : '';
				const noteNode = noteText
					? el('div', { class: 'appearance-detail__note' }, [
						preWrapText ? preWrapText(noteText) : noteText
					  ])
					: null;

				const children = [
					headerTags.length
						? el('div', {
							class: 'appearance-detail__entry-header',
							style: 'display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px;'
						  }, headerTags)
						: null,
					attrRows.length
						? el('div', { class: 'appearance-detail__attrs', style: 'padding-left: 4px;' }, attrRows)
						: null,
					noteNode,
				].filter(Boolean);

				if (!children.length) return null;
				return el('div', { class: 'appearance-detail__entry', style: 'margin-bottom: 8px;' }, children);
			}

			// --- Formation でグループ化（出現順を維持）---
			const NO_FORMATION = '\x00';
			const groupOrder = [];
			const groupMap = new Map();

			for (const entry of item.value) {
				if (!isPlainObject?.(entry)) continue;
				const fKey = entry.Formation || NO_FORMATION;
				if (!groupMap.has(fKey)) {
					groupOrder.push(fKey);
					groupMap.set(fKey, { formation: entry.Formation || null, entries: [] });
				}
				groupMap.get(fKey).entries.push(entry);
			}

			const groupNodes = groupOrder.flatMap((fKey) => {
				const group = groupMap.get(fKey);
				const entryNodes = group.entries.map(buildEntryNode).filter(Boolean);
				if (!entryNodes.length) return [];

				const formationLabel = group.formation
					? resolveFormationLabel(group.formation)
					: null;

				const groupChildren = [
					formationLabel
						? el('div', { class: 'tag', style: 'margin-bottom: 6px;' }, [formationLabel])
						: null,
					el('div', { class: 'appearance-detail__group-entries' }, entryNodes),
				].filter(Boolean);

				return [
					el('div', { class: 'appearance-detail__group', style: 'margin-bottom: 12px;' }, groupChildren)
				];
			});

			if (!groupNodes.length) return null;

			const outerBlock = el('div', { style: 'margin-bottom: 10px;' }, [
				el('div', { class: 'tag', style: 'margin-bottom: 6px;' }, [item.label]),
				el('div', {}, groupNodes),
			]);

			return wrapStandaloneSection(item, [outerBlock]);
		},
	});
})();
