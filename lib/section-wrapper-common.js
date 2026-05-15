/**
 * subFields 用セクションレンダラー共通レジストリ
 *
 * `pages/characters.js` などから利用する、standalone section 描画用の registry です。
 * 値整形専用の `wrapper-common.js` とは分離し、subField ごとの独自描画ディスパッチだけを担います。
 *
 * @fileoverview subFields standalone section renderer registry
 * @author 100BeautiesLab Creations Database Team
 * @version 1.0.0
 */

(function initializeCharacterSectionRendererRegistry(root) {
  const globalObject = root || globalThis;
  if (globalObject.CharacterSectionRendererRegistry) return;

  const rendererMap = new Map();

  function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function resolveSectionRendererName(context = {}) {
    const explicitName = String(
      context?.sectionRendererName
      || context?.rendererName
      || context?.wrapperName
      || ''
    ).trim();
    if (explicitName) return explicitName;

    const displayName = String(
      context?.display?.sectionWrapper
      || context?.schemaDisplay?.sectionWrapper
      || ''
    ).trim();
    if (displayName) return displayName;

    return '';
  }

  function registerSectionRenderer(name, definition) {
    const rendererName = String(name || '').trim();
    if (!rendererName) throw new Error('Section renderer name is required');
    if (!definition || typeof definition.render !== 'function') {
      throw new Error(`Section renderer "${rendererName}" requires a render function`);
    }

    rendererMap.set(rendererName, {
      name: rendererName,
      match: typeof definition.match === 'function' ? definition.match : null,
      render: definition.render
    });
    return rendererMap.get(rendererName);
  }

  function getSectionRenderer(name) {
    return rendererMap.get(String(name || '').trim()) || null;
  }

  function getRegisteredSectionRenderers() {
    return Array.from(rendererMap.values()).map((renderer) => ({
      name: renderer.name,
      hasMatcher: typeof renderer.match === 'function'
    }));
  }

  function findMatchingSectionRenderer(context = {}) {
    const resolvedName = resolveSectionRendererName(context);
    if (resolvedName) return getSectionRenderer(resolvedName);

    for (const renderer of rendererMap.values()) {
      if (typeof renderer.match !== 'function') continue;
      if (renderer.match(context)) return renderer;
    }
    return null;
  }

  function renderWithRegisteredSectionRenderer(item, context = {}) {
    const renderer = findMatchingSectionRenderer({ ...context, item });
    if (!renderer || typeof renderer.render !== 'function') return null;

    return renderer.render(item, {
      ...context,
      item,
      helpers: {
        isPlainObject,
        ...(context?.helpers && typeof context.helpers === 'object' ? context.helpers : {})
      }
    }) ?? null;
  }

  registerSectionRenderer('structuredObjectSection', {
    match: (context) => (
      isPlainObject(context?.item?.value)
      && typeof context?.helpers?.renderStructuredObjectSection === 'function'
    ),
    render: (item, context) => context.helpers.renderStructuredObjectSection(item, context)
  });

  registerSectionRenderer('relationSection', {
    render: (item, context) => {
      if (typeof context?.helpers?.renderRelationSection !== 'function') return null;
      return context.helpers.renderRelationSection(item, context);
    }
  });

  registerSectionRenderer('statsSection', {
    render: (item, context) => {
      if (typeof context?.helpers?.renderStatsSection !== 'function') return null;
      return context.helpers.renderStatsSection(item, context);
    }
  });

  globalObject.CharacterSectionRendererRegistry = {
    registerSectionRenderer,
    getSectionRenderer,
    getRegisteredSectionRenderers,
    resolveSectionRendererName,
    findMatchingSectionRenderer,
    renderWithRegisteredSectionRenderer,
    helpers: {
      isPlainObject
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
