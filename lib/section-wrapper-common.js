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

  /**
   * section renderer 名を context から解決する
   *
   * schema の `$display.sectionWrapper` と呼び出し側の明示指定の両方を受け付け、
   * `pages/characters.js` などの main code から renderer 名の決定責務を外す。
   *
   * @param {Object} context
   * @returns {string}
   */
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

  /**
   * schemaType ツリー内に指定トークンが含まれるかを判定する
   *
   * relation comment のように object / array / `$type` ネストを含む schema でも
   * `#Dialogue` などの表示ヒントを拾えるようにする shared helper。
   *
   * @param {*} t
   * @param {string} needle
   * @param {number} depth
   * @returns {boolean}
   */
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

  /**
   * section renderer を共通 context 付きで呼び出す
   *
   * registry 側で `helpers.isPlainObject` を必ず注入し、呼び出し側が追加した helper を
   * そのまま上乗せする。built-in / custom renderer の双方で同じ呼び出し形を維持するための薄い adapter。
   *
   * @param {{render?: Function}|null} renderer
   * @param {Object} item
   * @param {Object} context
   * @returns {*}
   */
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

  /**
   * RelationLabel の入力値から辞書参照用コードを取り出す
   *
   * ラベル値は plain string の場合も object の場合もあるため、JP / raw / EN の優先順で
   * 編集対象の最小コードへ正規化する。
   *
   * @param {*} value
   * @returns {string}
   */
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

  /**
   * RelationLabel 配列を varsdef と display 設定に従ってローカライズする
   *
   * 実際の辞書解決ロジックは main code から受け取る `relationApi` へ委譲し、
   * subscript 側では「どの path を引くか」「どの順で整形するか」だけを保持する。
   *
   * @param {Array} labels
   * @param {Object} context
   * @param {Object} relationApi
   * @param {string} containerKey
   * @returns {string[]}
   */
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

  /**
   * Relation レコードから index 直リンク用 identifier を抽出する
   *
   * `$IndexDef` が scalar / object のどちらでも同じ relation renderer で扱えるようにし、
   * `Relation` と `RelationToPrimary` のリンク挙動を built-in renderer 側へ集約する。
   *
   * @param {Object} record
   * @param {Object|null} indexDef
   * @param {Object} relationApi
   * @returns {{keyPath: string, value: string}|null}
   */
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

  /**
   * Relation comment を typedef-driven に整形する
   *
   * `Comments` が `#Dialogue` または multiline のときは body node を返し、
   * それ以外は inline text として返す。これにより tag 内の 1 行表示と複数行表示を
   * renderer 本体側で分岐しやすくする。
   *
   * @param {*} commentsRaw
   * @param {boolean} withLabels
   * @param {Object} context
   * @param {Object} relationApi
   * @param {string} containerKey
   * @returns {{text: string, node: (*|null), isDialogue: boolean}}
   */
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

  /**
   * built-in relation section renderer
   *
   * `Relation` / `RelationToPrimary` 専用の表示処理本体。
   * main code からは `relationApi` に DOM 生成・辞書解決・navigation などの core helper を受け取り、
   * この subscript 側では relation 固有の組み立てロジックだけを持つ。
   *
   * 期待する `relationApi` の主な項目:
   * - `createElement`, `createDetailTagGrid`
   * - `formatValueForDisplay`, `dialogueBodyText`
   * - `getFieldLabel`, `resolveVarsDefLabelPack`, `formatBilingualLabel`
   * - `getWorkIndexField`, `getIndexSubDefs`, `pickPrimaryIndexSubDef`, `recordMatchesIndexQuery`
   * - `buildViewerNavigationHref`, `openDetail`, `openViewerNavigation`, `getCharState`
   *
   * @param {Object} item
   * @param {Object} context
   * @returns {*}
   */
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

  /**
   * section renderer を登録する
   * @param {string} name
   * @param {{match?: Function, render: Function}} definition
   * @returns {{name: string, match: (Function|null), render: Function}}
   */
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

  /**
   * 登録済み renderer を名前で取得する
   * @param {string} name
   * @returns {{name: string, match: (Function|null), render: Function}|null}
   */
  function getSectionRenderer(name) {
    return rendererMap.get(String(name || '').trim()) || null;
  }

  /**
   * 登録済み renderer のメタ情報一覧を返す
   * @returns {{name: string, hasMatcher: boolean}[]}
   */
  function getRegisteredSectionRenderers() {
    return Array.from(rendererMap.values()).map((renderer) => ({
      name: renderer.name,
      hasMatcher: typeof renderer.match === 'function'
    }));
  }

  /**
   * context から最適な section renderer を探す
   *
   * 明示名があればそれを優先し、無ければ `match()` を持つ renderer を順に評価する。
   *
   * @param {Object} context
   * @returns {{name: string, match: (Function|null), render: Function}|null}
   */
  function findMatchingSectionRenderer(context = {}) {
    const resolvedName = resolveSectionRendererName(context);
    if (resolvedName) return getSectionRenderer(resolvedName);

    for (const renderer of rendererMap.values()) {
      if (typeof renderer.match !== 'function') continue;
      if (renderer.match(context)) return renderer;
    }
    return null;
  }

  /**
   * 名前指定で built-in / custom section renderer を明示的に実行する
   *
   * main code 側で「subField matcher ではなく、この renderer を再利用したい」ケース用の API。
   * 例: top-level `Relation` を standalone subField 以外からも同じ built-in renderer で描画する。
   *
   * @param {string} name
   * @param {Object} item
   * @param {Object} context
   * @returns {*}
   */
  function renderNamedSectionRenderer(name, item, context = {}) {
    return callSectionRenderer(getSectionRenderer(name), item, context);
  }

  /**
   * context から renderer を自動解決して実行する
   * @param {Object} item
   * @param {Object} context
   * @returns {*}
   */
  function renderWithRegisteredSectionRenderer(item, context = {}) {
    const renderer = findMatchingSectionRenderer({ ...context, item });
    return callSectionRenderer(renderer, item, context);
  }

  // plain object な subField を generic structured section へ流す built-in renderer
  registerSectionRenderer('structuredObjectSection', {
    match: (context) => (
      isPlainObject(context?.item?.value)
      && typeof context?.helpers?.renderStructuredObjectSection === 'function'
    ),
    render: (item, context) => context.helpers.renderStructuredObjectSection(item, context)
  });

  // Relation / RelationToPrimary の固有レイアウトを担当する built-in renderer
  registerSectionRenderer('relationSection', {
    render: (item, context) => renderBuiltInRelationSection(item, context)
  });

  // ability / spec stats のような既存 stats helper へ委譲する built-in renderer
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
