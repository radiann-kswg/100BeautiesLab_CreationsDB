/**
 * 値整形ラッパー共通レジストリ
 *
 * UI / Service Worker の双方から利用できる、特殊 summary formatter の登録基盤です。
 * JSON 側へ任意コードを持ち込まず、schema で宣言した型に対して既知の formatter を割り当てます。
 *
 * @fileoverview Day / StoryEra などの特殊整形を shared 層で扱う registry
 * @author 100BeautiesLab Creations Database Team
 * @version 1.0.0
 */

(function initializeCharacterValueWrapperRegistry(root) {
  const globalObject = root || globalThis;
  if (globalObject.CharacterValueWrapperRegistry) return;

  const wrapperMap = new Map();

  function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function splitSchemaTypeTokens(schemaType) {
    if (Array.isArray(schemaType)) return [];
    return String(schemaType || '')
      .split('|')
      .map((token) => token.trim())
      .filter(Boolean);
  }

  function schemaTypeIncludes(schemaType, token) {
    return splitSchemaTypeTokens(schemaType).includes(String(token || '').trim());
  }

  function uniqueTypeSources(typeSources) {
    if (!Array.isArray(typeSources)) return [];
    return typeSources.filter((source, index, list) => source && list.indexOf(source) === index);
  }

  function resolveTypeDefEntries(typeSources, defName) {
    const name = String(defName || '').trim();
    if (!name) return [];

    const sources = uniqueTypeSources(typeSources);
    for (const source of sources) {
      const metaEntries = source?.$MetaType?.[name]?.$DefType;
      if (Array.isArray(metaEntries)) return metaEntries;

      const generalVarsEntries = source?.General?.$VarsDef?.[name]?.$DefType;
      if (Array.isArray(generalVarsEntries)) return generalVarsEntries;

      const varsEntries = source?.$VarsDef?.[name]?.$DefType;
      if (Array.isArray(varsEntries)) return varsEntries;
    }

    return [];
  }

  function getRoleEntries(typeSources, defName, role) {
    const targetRole = String(role || '').trim();
    if (!targetRole) return [];

    return resolveTypeDefEntries(typeSources, defName).filter((entry) => {
      const entryRole = entry?.$display?.role;
      return typeof entryRole === 'string' && entryRole.trim() === targetRole;
    });
  }

  function getRoleRawValues(objectValue, typeSources, defName, role) {
    if (!isPlainObject(objectValue)) return [];
    return getRoleEntries(typeSources, defName, role)
      .map((entry) => objectValue?.[entry?.hashTag])
      .filter((raw) => raw !== undefined && raw !== null && raw !== '');
  }

  function pickRoleRawValue(objectValue, typeSources, defName, role) {
    return getRoleRawValues(objectValue, typeSources, defName, role)[0];
  }

  function pickAboutText(raw) {
    if (raw == null) return '';
    if (isPlainObject(raw)) {
      if (typeof raw.hideText === 'string' && raw.hideText.trim()) return raw.hideText.trim();
      return '';
    }
    return String(raw).trim();
  }

  function formatStoryEraPoint(point, context) {
    if (!isPlainObject(point)) return '';

    const typeSources = context?.typeSources || [];
    const about = pickAboutText(
      pickRoleRawValue(point, typeSources, '$Def_StoryEra', 'pointLabel')
      ?? pickRoleRawValue(point, typeSources, '$Def_StoryEra', 'pointLabelAlt')
      ?? point.about_JP
      ?? point.about_EN
      ?? point.about
    );
    if (about) return about;

    const eraGeneration = pickRoleRawValue(point, typeSources, '$Def_StoryEra', 'eraGeneration') ?? point.EraGen;
    const eraYear = pickRoleRawValue(point, typeSources, '$Def_StoryEra', 'eraYear') ?? point.YearInEra;
    const realYear = pickRoleRawValue(point, typeSources, '$Def_StoryEra', 'realYear') ?? point.byRealYear;

    const eraText = [];
    if (eraGeneration !== null && eraGeneration !== undefined && eraGeneration !== '') {
      eraText.push(`第${String(eraGeneration).trim()}創世紀`);
    }
    if (eraYear !== null && eraYear !== undefined && eraYear !== '') {
      eraText.push(`${String(eraYear).trim()}年`);
    }

    const realYearText = (realYear !== null && realYear !== undefined && realYear !== '')
      ? `西暦${String(realYear).trim()}年`
      : '';
    const primaryText = eraText.join('');

    if (primaryText && realYearText) return `${primaryText} / ${realYearText}`;
    return primaryText || realYearText;
  }

  function formatStoryEraPointList(points, context) {
    if (!Array.isArray(points)) return '';
    return points.map((point) => formatStoryEraPoint(point, context)).filter(Boolean).join(' / ');
  }

  function formatStoryEraCatalog(value, context) {
    if (!isPlainObject(value)) return '';

    const typeSources = context?.typeSources || [];
    const about = pickAboutText(
      pickRoleRawValue(value, typeSources, '$Def_StoryEraCatalog', 'preferredLabel')
      ?? pickRoleRawValue(value, typeSources, '$Def_StoryEraCatalog', 'preferredLabelAlt')
      ?? value.about_JP
      ?? value.about_EN
      ?? value.about
    );
    if (about) return about;

    const representativePoint = formatStoryEraPointList(
      pickRoleRawValue(value, typeSources, '$Def_StoryEraCatalog', 'representativePoint') ?? value.InEra,
      context
    );
    if (representativePoint) return representativePoint;

    const fromEra = formatStoryEraPointList(
      pickRoleRawValue(value, typeSources, '$Def_StoryEraCatalog', 'rangeStart') ?? value.FromEra,
      context
    );
    const toEra = formatStoryEraPointList(
      pickRoleRawValue(value, typeSources, '$Def_StoryEraCatalog', 'rangeEnd') ?? value.ToEra,
      context
    );

    if (fromEra && toEra) return `開始: ${fromEra} / 終了: ${toEra}`;
    if (fromEra) return `開始: ${fromEra}`;
    if (toEra) return `終了: ${toEra}`;
    return '';
  }

  function formatDaySummary(value, context) {
    if (!isPlainObject(value)) return '';

    const typeSources = context?.typeSources || [];
    const dayValue = isPlainObject(value.Day) ? value.Day : value;
    const rawMonth = pickRoleRawValue(dayValue, typeSources, '$Def_Day', 'month') ?? dayValue.Month;
    const rawDayOfMonth = pickRoleRawValue(dayValue, typeSources, '$Def_Day', 'dayOfMonth') ?? dayValue.DayOfMonth;
    const month = rawMonth != null ? String(rawMonth).trim() : '';
    const dayOfMonth = rawDayOfMonth != null ? String(rawDayOfMonth).trim() : '';
    const dateText = (month && dayOfMonth) ? `${month}/${dayOfMonth}` : (month || dayOfMonth);

    const aboutValue = pickRoleRawValue(value, typeSources, '$Def_Day', 'annotation')
      ?? value.DayAbout
      ?? value.about_JP
      ?? value.about_EN
      ?? value.about;
    const aboutText = pickAboutText(aboutValue);

    if (dateText && aboutText) return `${dateText}（${aboutText}）`;
    return dateText;
  }

  function registerWrapper(name, definition) {
    const wrapperName = String(name || '').trim();
    if (!wrapperName) throw new Error('Wrapper name is required');
    if (!definition || typeof definition.format !== 'function') {
      throw new Error(`Wrapper "${wrapperName}" requires a format function`);
    }

    wrapperMap.set(wrapperName, {
      name: wrapperName,
      match: typeof definition.match === 'function' ? definition.match : null,
      format: definition.format
    });
    return wrapperMap.get(wrapperName);
  }

  function getWrapper(name) {
    return wrapperMap.get(String(name || '').trim()) || null;
  }

  function getRegisteredWrappers() {
    return Array.from(wrapperMap.values()).map((wrapper) => ({
      name: wrapper.name,
      hasMatcher: typeof wrapper.match === 'function'
    }));
  }

  function findMatchingWrapper(context = {}) {
    if (context.wrapperName) return getWrapper(context.wrapperName);

    for (const wrapper of wrapperMap.values()) {
      if (typeof wrapper.match !== 'function') continue;
      if (wrapper.match(context)) return wrapper;
    }
    return null;
  }

  function formatWithRegisteredWrapper(value, context = {}) {
    const wrapper = findMatchingWrapper(context);
    if (!wrapper || typeof wrapper.format !== 'function') return '';

    const formatted = wrapper.format(value, {
      ...context,
      helpers: {
        isPlainObject,
        splitSchemaTypeTokens,
        schemaTypeIncludes,
        resolveTypeDefEntries,
        getRoleEntries,
        getRoleRawValues,
        pickRoleRawValue,
        pickAboutText
      }
    });

    return typeof formatted === 'string' ? formatted : '';
  }

  registerWrapper('storyEraSummary', {
    match: (context) => schemaTypeIncludes(context?.schemaType, '$Def_StoryEraCatalog'),
    format: formatStoryEraCatalog
  });

  registerWrapper('daySummary', {
    match: (context) => schemaTypeIncludes(context?.schemaType, '$Def_Day'),
    format: formatDaySummary
  });

  globalObject.CharacterValueWrapperRegistry = {
    registerWrapper,
    getWrapper,
    getRegisteredWrappers,
    findMatchingWrapper,
    formatWithRegisteredWrapper,
    helpers: {
      isPlainObject,
      splitSchemaTypeTokens,
      schemaTypeIncludes,
      resolveTypeDefEntries,
      getRoleEntries,
      getRoleRawValues,
      pickRoleRawValue,
      pickAboutText
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
