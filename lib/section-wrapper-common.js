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
      || context?.item?.display?.sectionWrapper
      || ''
    ).trim();
    if (displayName) return displayName;

    return '';
  }

  function schemaTypeIncludes(t, needle, depth = 0) {
    if (!needle) return false;
    if (depth > 6) return false;
    if (t === null || t === undefined) return false;
    if (typeof t === 'string') return t.includes(needle);
    if (Array.isArray(t)) return t.some((entry) => schemaTypeIncludes(entry, needle, depth + 1));
    if (typeof t === 'object') {
      if (Object.prototype.hasOwnProperty.call(t, '$type')) {
        return schemaTypeIncludes(t.$type, needle, depth + 1);
      }
      return Object.values(t).some((entry) => schemaTypeIncludes(entry, needle, depth + 1));
    }
    return false;
  }

  function callSectionRenderer(renderer, item, context = {}) {
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

  function pickRelationLabelCode(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }
    if (!isPlainObject(value)) return '';

    const jp = value.RelationLabel_JP || value.relationLabel_JP;
    const raw = value.RelationLabel || value.relationLabel;
    const en = value.RelationLabel_EN || value.relationLabel_EN;
    const picked = (typeof jp === 'string' && jp.trim())
      ? jp
      : (typeof raw === 'string' && raw.trim())
        ? raw
        : (typeof en === 'string' && en.trim())
          ? en
          : '';
    return String(picked || '').trim();
  }

  function localizeRelationLabels(labels, context, relationApi, containerKey) {
    const pathKey = `${containerKey}.Related.RelationLabel`;
    const displayOpt = (context?.fieldDisplayMap && typeof context.fieldDisplayMap === 'object')
      ? (context.fieldDisplayMap[pathKey] || context.fieldDisplayMap.RelationLabel || null)
      : null;
    const values = Array.isArray(labels) ? labels : [];

    return values
      .map((value) => {
        const raw = pickRelationLabelCode(value);
        if (!raw) return '';

        const pack = relationApi.resolveVarsDefLabelPack?.(
          'RelationLabel',
          raw,
          context?.globalDefType,
          context?.workMeta,
          pathKey
        );
        return relationApi.formatBilingualLabel?.(pack, raw, displayOpt) || raw;
      })
      .filter(Boolean);
  }

  function getIndexIdentifierFromRelation(record, indexDef, relationApi) {
    if (!record || typeof record !== 'object') return null;
    if (!indexDef || typeof indexDef !== 'object') return null;

    const rootKey = indexDef.hashTag;
    if (!rootKey || typeof rootKey !== 'string') return null;

    const subDefs = relationApi.getIndexSubDefs?.(indexDef) || [];
    if (Array.isArray(subDefs) && subDefs.length > 0) {
      const rootObject = isPlainObject(record?.[rootKey]) ? record[rootKey] : record;
      if (!isPlainObject(rootObject)) return null;

      const primarySub = relationApi.pickPrimaryIndexSubDef?.(subDefs) || null;
      const candidates = primarySub
        ? [primarySub, ...subDefs.filter((entry) => entry !== primarySub)]
        : subDefs;

      for (const sub of candidates) {
        const subKey = sub?.hashTag;
        if (!subKey || typeof subKey !== 'string') continue;
        const rawValue = rootObject[subKey];
        if (rawValue === null || rawValue === undefined || rawValue === '') continue;
        return { keyPath: `${rootKey}.${subKey}`, value: String(rawValue).trim() };
      }
      return null;
    }

    const rawValue = (record?.[rootKey] === null || record?.[rootKey] === undefined || record?.[rootKey] === '')
      ? record?.Num
      : record?.[rootKey];
    const valueText = (rawValue === null || rawValue === undefined) ? '' : String(rawValue).trim();
    if (!valueText) return null;
    return { keyPath: rootKey, value: valueText };
  }

  function formatRelationComments(commentsRaw, withLabels, context, relationApi, containerKey) {
    if (commentsRaw === null || commentsRaw === undefined || commentsRaw === '') {
      return { text: '', node: null, isDialogue: false };
    }

    const pathKey = `${containerKey}.${withLabels ? 'Related' : 'Commented'}.Comments`;
    const schemaType = context?.fieldTypeMap?.[pathKey] ?? null;
    const displayOpt = (context?.fieldDisplayMap && typeof context.fieldDisplayMap === 'object')
      ? (context.fieldDisplayMap[pathKey] || context.fieldDisplayMap.Comments || null)
      : null;
    const formatted = relationApi.formatValueForDisplay?.(
      commentsRaw,
      context?.fieldLabelMap,
      context?.workMeta,
      context?.globalDefType,
      {
        schemaType,
        display: displayOpt,
        fieldKey: pathKey
      }
    );
    const text = String(formatted ?? commentsRaw ?? '').trim();
    const isDialogue = schemaTypeIncludes(schemaType, '#Dialogue');
    const node = (!text)
      ? null
      : (isDialogue || text.includes('\n'))
        ? (relationApi.dialogueBodyText?.(text) ?? text)
        : text;

    return { text, node, isDialogue };
  }

  function renderBuiltInRelationSection(item, context = {}) {
    const relationApi = context?.helpers?.relationApi;
    if (!relationApi || typeof relationApi.createElement !== 'function' || typeof relationApi.createDetailTagGrid !== 'function') {
      if (typeof context?.helpers?.renderRelationSection === 'function') {
        return context.helpers.renderRelationSection(item, context);
      }
      return null;
    }

    const containerKey = String(context?.containerKey || item?.key || 'Relation').trim() || 'Relation';
    const relationValue = isPlainObject(item?.value) ? item.value : {};
    const related = Array.isArray(relationValue.Related) ? relationValue.Related : [];
    const commented = Array.isArray(relationValue.Commented) ? relationValue.Commented : [];
    if (!related.length && !commented.length) return null;

    const state = relationApi.getCharState?.() || null;
    const workId = String(state?.workId || context?.workId || '').trim();
    const currentDb = String(state?.db || context?.dbName || '').trim();
    const relationTargetDb = containerKey === 'RelationToPrimary' ? 'Primary' : currentDb;
    const indexDef = workId ? relationApi.getWorkIndexField?.(workId, context?.workMeta) : null;

    const findRecordByIndex = (identifier) => {
      if (!identifier || typeof identifier !== 'object') return null;
      if (!state || !Array.isArray(state.records) || typeof relationApi.recordMatchesIndexQuery !== 'function') return null;
      const idxValue = String(identifier.value || '').trim();
      const idxKeyPath = String(identifier.keyPath || '').trim();
      if (!idxValue) return null;
      return state.records.find((record) => relationApi.recordMatchesIndexQuery(
        record,
        indexDef,
        idxValue,
        idxKeyPath,
        idxKeyPath === 'Num' ? idxValue : ''
      )) || null;
    };

    const buildIndexHref = (identifier, targetDb = currentDb) => relationApi.buildViewerNavigationHref?.(workId, targetDb, {
      idx: String(identifier?.value || ''),
      idxKey: String(identifier?.keyPath || ''),
      num: (identifier?.keyPath === 'Num') ? String(identifier?.value || '') : ''
    }) || '#';

    const hasNewline = (text) => (typeof text === 'string' && text.includes('\n'));
    const createElement = relationApi.createElement;

    const renderRelationTag = (prefix, relationRecord, withLabels) => {
      const num = (relationRecord?.Num === null || relationRecord?.Num === undefined) ? '' : String(relationRecord.Num).trim();
      const comments = formatRelationComments(relationRecord?.Comments, withLabels, context, relationApi, containerKey);
      const labels = withLabels ? localizeRelationLabels(relationRecord?.RelationLabel, context, relationApi, containerKey) : [];
      const labelText = labels.length ? labels.join(', ') : '';

      const identifier = getIndexIdentifierFromRelation(relationRecord, indexDef, relationApi);
      const target = identifier ? findRecordByIndex(identifier) : null;
      const canNavigateToPrimary = containerKey === 'RelationToPrimary' && identifier && workId && relationTargetDb;

      const children = [`${prefix} `];

      if ((identifier && target) || canNavigateToPrimary) {
        const name = target?.Name || target?.FormalName || target?.ModelName || target?.Name_EN || '';
        const anchorProps = {
          href: buildIndexHref(identifier, canNavigateToPrimary ? relationTargetDb : currentDb),
          title: name ? `開く: ${name}` : (canNavigateToPrimary ? '原作キャラクターを開く' : '開く')
        };
        if ((target && typeof relationApi.openDetail === 'function') || (canNavigateToPrimary && typeof relationApi.openViewerNavigation === 'function')) {
          anchorProps.onclick = async (event) => {
            try { event.preventDefault(); } catch (_) { /* no-op */ }
            if (target && typeof relationApi.openDetail === 'function') {
              await relationApi.openDetail(target);
              return;
            }
            if (canNavigateToPrimary && typeof relationApi.openViewerNavigation === 'function') {
              await relationApi.openViewerNavigation(workId, relationTargetDb, {
                idx: String(identifier?.value || ''),
                idxKey: String(identifier?.keyPath || ''),
                num: (identifier?.keyPath === 'Num') ? String(identifier?.value || '') : ''
              });
            }
          };
        }
        children.push(createElement('a', anchorProps, [identifier.value]));
      } else {
        children.push(num || (identifier?.value || '?'));
      }

      if (labelText) children.push(`: ${labelText}`);

      if (comments.text && !(comments.isDialogue || hasNewline(comments.text))) {
        children.push(`${labelText ? ' ' : ': '}- ${comments.text}`);
        return createElement('div', { class: 'tag' }, children);
      }

      if (!comments.text) {
        return createElement('div', { class: 'tag' }, children);
      }

      return createElement('div', { class: 'tag' }, [
        createElement('div', {}, children),
        createElement('div', { style: 'margin-top: 4px;' }, [comments.node])
      ]);
    };

    const relationGrid = relationApi.createDetailTagGrid([
      ...related.map((record) => renderRelationTag('⇒', record, true)),
      ...commented.map((record) => renderRelationTag('→', record, false))
    ]);
    if (!relationGrid) return null;

    if (context?.isStandaloneSubField === true && typeof context?.helpers?.wrapStandaloneSection === 'function') {
      return context.helpers.wrapStandaloneSection(item, [relationGrid]);
    }

    if (context?.wrapInSection === false) return relationGrid;

    const fallbackTitle = containerKey === 'RelationToPrimary' ? '原作との関係' : '関係';
    const sectionTitle = relationApi.getFieldLabel?.(
      containerKey,
      context?.fieldLabelMap,
      context?.workMeta,
      context?.globalDefType,
      fallbackTitle
    ) || fallbackTitle;

    return createElement('div', { class: 'section' }, [
      createElement('h3', {}, [sectionTitle]),
      relationGrid
    ]);
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

  function renderNamedSectionRenderer(name, item, context = {}) {
    return callSectionRenderer(getSectionRenderer(name), item, context);
  }

  function renderWithRegisteredSectionRenderer(item, context = {}) {
    const renderer = findMatchingSectionRenderer({ ...context, item });
    return callSectionRenderer(renderer, item, context);
  }

  registerSectionRenderer('structuredObjectSection', {
    match: (context) => (
      isPlainObject(context?.item?.value)
      && typeof context?.helpers?.renderStructuredObjectSection === 'function'
    ),
    render: (item, context) => context.helpers.renderStructuredObjectSection(item, context)
  });

  registerSectionRenderer('relationSection', {
    render: (item, context) => renderBuiltInRelationSection(item, context)
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
    renderNamedSectionRenderer,
    renderWithRegisteredSectionRenderer,
    helpers: {
      isPlainObject,
      schemaTypeIncludes
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
