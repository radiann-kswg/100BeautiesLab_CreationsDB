/**
 * @fileoverview *_DBLink suffix セクションレンダラー
 *
 * hashTag が `_DBLink` で終わるフィールドを「キャラクターリンク参照」セクションとして描画。
 * - `$Def_DBLinkRef` 形式（単一オブジェクト）と `$Def_DBLinkRef[]`（配列）の両方に対応
 * - インデックスキーは作品の `$IndexDef` に依存しない：エントリの非センチネルキーを動的に検出
 * - ネストインデックス（例: `Card: { Stoat, StoatNum }`）は subset match で解決
 * - 同DB・クロスDB（同作品）・クロスワーク参照すべてに対応
 * - SW fetch + セッション内キャッシュ（relation.js と同パターン）
 *
 * キャラシートページで import されると CharacterSectionRendererRegistry に 'dbLinkSection' を登録し、
 * `*_DBLink` サフィックスのフィールドを自動ディスパッチする（`$display.sectionWrapper` 指定不要）。
 */

(() => {
	const registry = globalThis.CharacterSectionRendererRegistry;
	if (!registry?.registerSectionRenderer) return;

	// セッション内フェッチキャッシュ（workId|dbName をキーに Promise を保持）
	const _fetchCache = new Map();

	/**
	 * $Def_DBLinkRef エントリにおける「センチネルキー」（インデックス値以外のメタフィールド）
	 * これら以外の最初のキーをインデックスキーとして扱う
	 */
	const SENTINEL_KEYS = new Set(['_DB', '_Work', 'label_JP', 'label_EN']);

	/**
	 * worksTitle の各種形式を '#Works_XXX' の workKey 形式に正規化
	 * @param {string} title
	 * @returns {string}
	 */
	function normalizeWorkKey(title) {
		const s = String(title || '').trim();
		if (!s) return '';
		if (s.startsWith('#Works_')) return s;
		if (s.startsWith('Works_')) return `#${s}`;
		return `#Works_${s}`;
	}

	/**
	 * ネストオブジェクト内で最初の数値サブフィールドを探す。
	 * 数値がなければ最初の文字列フィールドを使う。href の idx/idxKey 組み立てに使用。
	 * 例: { Stoat: "Major", StoatNum: 0 } → { subKey: "StoatNum", subValue: "0" }
	 * @param {Object} obj
	 * @returns {{ subKey: string, subValue: string }|null}
	 */
	function findSubKeyForHref(obj) {
		if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
		// 数値フィールドを優先
		for (const k of Object.keys(obj)) {
			if (typeof obj[k] === 'number') return { subKey: k, subValue: String(obj[k]) };
		}
		// 数値がなければ空でない文字列フィールドを使用
		for (const k of Object.keys(obj)) {
			if (typeof obj[k] === 'string' && obj[k] !== '') return { subKey: k, subValue: obj[k] };
		}
		return null;
	}

	/**
	 * ネストインデックスの subset match（idxRaw 側の全キーが recordVal 内に存在して値が一致するか）。
	 * 例: recordVal = { Stoat: "Major", StoatNum: 0, Num: 22 }, idxRaw = { Stoat: "Major", StoatNum: 0 } → true
	 * @param {*} recordVal - レコード内の対象フィールド値
	 * @param {Object} idxRaw - エントリで指定されたインデックスオブジェクト
	 * @returns {boolean}
	 */
	function isSubsetMatch(recordVal, idxRaw) {
		if (recordVal == null || idxRaw == null) return false;
		if (typeof recordVal !== 'object' || typeof idxRaw !== 'object') return false;
		return Object.keys(idxRaw).every((k) => {
			const rv = recordVal[k];
			const qv = idxRaw[k];
			if (typeof qv === 'object' && qv !== null) return isSubsetMatch(rv, qv);
			return String(rv) === String(qv);
		});
	}

	/**
	 * $Def_DBLinkRef エントリからインデックス情報・参照先メタを抽出
	 * - スカラーインデックス: { "Num": 67 } → idxKey="Num", idxValue="67", idxKeyPath="Num"
	 * - ネストインデックス: { "Card": { "Stoat":"Major", "StoatNum":0 } } → idxKey="Card",
	 *     idxValue="0"（数値サブキー）, idxKeyPath="Card.StoatNum"
	 * @param {*} entry
	 * @returns {{idxKey:string, idxRaw:*, idxValue:string, idxKeyPath:string, isNested:boolean, targetDB:string|null, targetWork:string|null, labelJP:string, labelEN:string}|null}
	 */
	function extractRef(entry) {
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;

		let idxKey = null;
		let idxRaw;
		for (const k of Object.keys(entry)) {
			if (SENTINEL_KEYS.has(k)) continue;
			idxKey = k;
			idxRaw = entry[k];
			break;
		}
		if (idxKey === null || idxRaw === null || idxRaw === undefined) return null;

		const isNested = typeof idxRaw === 'object' && !Array.isArray(idxRaw);
		let idxValue, idxKeyPath;

		if (isNested) {
			const sub = findSubKeyForHref(idxRaw);
			if (!sub) return null;
			idxValue = sub.subValue;
			idxKeyPath = `${idxKey}.${sub.subKey}`;
		} else {
			idxValue = String(idxRaw).trim();
			if (!idxValue) return null;
			idxKeyPath = idxKey;
		}

		return {
			idxKey,
			idxRaw,
			idxValue,
			idxKeyPath,
			isNested,
			targetDB: typeof entry._DB === 'string' ? entry._DB.trim() : null,
			targetWork: typeof entry._Work === 'string' ? entry._Work.trim() : null,
			labelJP: typeof entry.label_JP === 'string' ? entry.label_JP.trim() : '',
			labelEN: typeof entry.label_EN === 'string' ? entry.label_EN.trim() : '',
		};
	}

	/**
	 * 対象DBのレコード一覧を取得（セッション内キャッシュ付き）
	 * SW レスポンスは `{ records: [...] }` 形式または配列直接の両方に対応
	 * @param {string} workId - '#Works_XXX' 形式
	 * @param {string} dbName
	 * @param {Object} relationApi
	 * @returns {Promise<Array>}
	 */
	function fetchRecords(workId, dbName, relationApi) {
		if (typeof relationApi.fetchDbRecords !== 'function') return Promise.resolve([]);
		const key = `${workId}|${dbName}`;
		if (_fetchCache.has(key)) return _fetchCache.get(key);
		const promise = Promise.resolve()
			.then(() => relationApi.fetchDbRecords(workId, dbName))
			.then((result) => {
				if (Array.isArray(result)) return result;
				if (result && Array.isArray(result.records)) return result.records;
				return [];
			})
			.catch(() => []);
		_fetchCache.set(key, promise);
		return promise;
	}

	/**
	 * アンカー要素・name span に対してキャラ名を非同期ハイドレーション
	 * - スカラーインデックス: r[idxKey] === idxValue の直接比較
	 * - ネストインデックス: isSubsetMatch(r[idxKey], idxRaw) の subset match
	 * - 両方失敗時: recordMatchesIndexQuery fallback
	 * @param {HTMLElement} anchorEl @param {HTMLElement} nameEl
	 * @param {Object} ref - extractRef の戻り値
	 * @param {string} workId @param {string} dbName @param {Object} relationApi
	 */
	function hydrateName(anchorEl, nameEl, ref, workId, dbName, relationApi) {
		fetchRecords(workId, dbName, relationApi).then((records) => {
			if (!Array.isArray(records) || !records.length) return;

			let found;
			if (ref.isNested) {
				// ネストインデックス: エントリのオブジェクトが record のフィールドに含まれるか
				found = records.find((r) => r != null && isSubsetMatch(r[ref.idxKey], ref.idxRaw));
			} else {
				// スカラーインデックス: idxKey フィールドを直接比較
				found = records.find((r) => r != null && String(r[ref.idxKey]) === ref.idxValue);
			}

			// fallback: recordMatchesIndexQuery（数値サブキーのパスで試みる）
			if (!found) {
				found = records.find((r) => relationApi.recordMatchesIndexQuery?.(r, null, ref.idxValue, ref.idxKeyPath, ref.idxValue));
			}

			if (!found) return;
			const name = found?.Name || found?.FormalName || found?.ModelName || found?.Name_EN || '';
			if (!name) return;
			if (nameEl && typeof nameEl.textContent === 'string') nameEl.textContent = name;
			if (anchorEl && typeof anchorEl.title === 'string') anchorEl.title = `開く: ${name}`;
		}).catch(() => {});
	}

	registry.registerSectionRenderer('dbLinkSection', {
		/**
		 * `*_DBLink` サフィックスを持つフィールドを自動検出
		 * 例: SameModels_DBLink / ThisArcanaHolder_DBLink / AnotherRegions_DBLink
		 * - 配列（$Def_DBLinkRef[]）・単一オブジェクト（$Def_DBLinkRef）の両方に対応
		 * - $display.sectionWrapper の明示指定は不要（suffix 規約で自動ディスパッチ）
		 * @param {Object} ctx
		 */
		match: (ctx) => {
			if (!/^.+_DBLink$/.test(String(ctx?.item?.key || ''))) return false;
			const v = ctx?.item?.value;
			if (Array.isArray(v)) return v.length > 0;
			// 単一 $Def_DBLinkRef オブジェクト（非配列）
			return v != null && typeof v === 'object' && Object.keys(v).length > 0;
		},

		/**
		 * @param {Object} item
		 * @param {Object} context
		 * @returns {HTMLElement|null}
		 */
		render: (item, context) => {
			const relationApi = context?.helpers?.relationApi;
			if (!relationApi || typeof relationApi.createElement !== 'function') return null;
			if (!item?.value) return null;

			const state = relationApi.getCharState?.() || null;
			const currentWorkId = String(state?.workId || '').trim();
			const currentDb = String(state?.db || '').trim();
			const pageLang = String(state?.pageLang || 'jp');

			// $display.dbLinkTargetDB が指定されていれば既定の参照先DB、なければ現在DB
			const display = item?.display || {};
			const defaultDB = typeof display.dbLinkTargetDB === 'string' ? display.dbLinkTargetDB.trim() : currentDb;

			const createElement = relationApi.createElement;

			// 単一オブジェクト（$Def_DBLinkRef）も配列として正規化
			const entries = Array.isArray(item.value) ? item.value : [item.value];

			const tags = entries
				.map((entry) => {
					const ref = extractRef(entry);
					if (!ref) return null;

					const targetWork = ref.targetWork ? normalizeWorkKey(ref.targetWork) : currentWorkId;
					const targetDB = ref.targetDB || defaultDB;
					const label = (pageLang === 'en' ? ref.labelEN : ref.labelJP) || '';

					const href = relationApi.buildViewerNavigationHref?.(targetWork, targetDB, {
						idx: ref.idxValue, idxKey: ref.idxKeyPath, num: ref.idxValue
					}) || '#';

					const anchorProps = {
						href,
						title: `${targetDB} のキャラクターを開く`
					};

					if (typeof relationApi.openViewerNavigation === 'function') {
						anchorProps.onclick = async (e) => {
							try { e.preventDefault(); } catch (_) {}
							await relationApi.openViewerNavigation(targetWork, targetDB, {
								idx: ref.idxValue, idxKey: ref.idxKeyPath, num: ref.idxValue
							});
						};
					}

					const nameEl = createElement('span', {}, [ref.idxValue]);
					const anchor = createElement('a', anchorProps, [nameEl]);
					hydrateName(anchor, nameEl, ref, targetWork, targetDB, relationApi);

					const children = ['⇒ ', anchor];
					if (label) children.push(`: ${label}`);
					return createElement('div', { class: 'tag' }, children);
				})
				.filter(Boolean);

			if (!tags.length) return null;

			const grid = relationApi.createDetailTagGrid?.(tags);
			if (!grid) return null;

			if (context?.isStandaloneSubField === true && typeof context?.helpers?.wrapStandaloneSection === 'function') {
				return context.helpers.wrapStandaloneSection(item, [grid]);
			}

			if (context?.wrapInSection === false) return grid;

			const fallbackTitle = String(item?.key || '').replace(/_DBLink$/, '').replace(/_/g, ' ');
			const sectionTitle = relationApi.getFieldLabel?.(
				item?.key, context?.fieldLabelMap, context?.workMeta, context?.globalDefType, fallbackTitle
			) || fallbackTitle;

			return createElement('div', { class: 'section' }, [
				createElement('h3', {}, [sectionTitle]),
				grid
			]);
		}
	});
})();
