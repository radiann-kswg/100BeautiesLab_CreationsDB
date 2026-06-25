/**
 * @fileoverview Characters page for 100BeautiesLab Creations Database
 *
 * This module provides a responsive character browser that works with GitHub Pages
 * by using Service Worker-based API routing to avoid ad-blocker interference.
 *
 * Key Features:
 * - Multi-prefix Service Worker registration (/pages/v1, /svc/v1, /api/v1)
 * - Dynamic work and database selection
 * - Real-time search filtering with debouncing
 * - Responsive character list and detail views
 * - Image gallery based on db_type.json definitions
 * - Reference resolution and Commons data inheritance
 * - Cache/Service Worker reset functionality for debugging
 *
 * Architecture:
 * - Vanilla HTML/CSS/JS with CSS Grid responsive layouts
 * - Service Worker pseudo-API for GitHub Pages compatibility
 * - Static JSON data consumption with client-side processing
 * - Type-driven image field extraction and gallery rendering
 *
 * @author 100BeautiesLab Creations Database Team
 * @version 1.0.0
 */

import '../lib/wrapper-common.js';
import '../lib/section-wrapper-common.js';
import '../lib/section-renders/formsMotif.js';
import '../lib/section-renders/thisMasters.js';
import '../lib/section-renders/specStatsHelpers.js';
import '../lib/section-renders/abilityStats.js';
import '../lib/section-renders/streamingActivity.js';
import '../lib/section-renders/numSpec.js';
import '../lib/section-renders/arcanumSpec.js';
import '../lib/section-renders/chronoSpec.js';
import '../lib/section-renders/relation.js';
import '../lib/section-renders/dblink.js';
import '../lib/section-renders/calling.js';
import '../lib/section-renders/storyEra.js';
import '../lib/section-renders/day.js';

// Characters page: fetch from /api/v1 and render list/detail

// Global initialization tracking to prevent duplicate setup
let isInitialized = false;

// Global metadata cache to reduce API calls
let globalMetaCache = null;
let globalTypeDefCache = null;
let globalDefTypeCache = null;
let workTypeDefCache = new Map();
let worksCatalogCache = null;
let workDbCatalogCache = new Map();
const sharedLayerTypeDefCache = new Map();
const workLayerTypeDefCache = new Map();
const PAGE_LANG_STORAGE_KEY = '100bl.characters.pageLang';
const PAGE_LANG_DEFAULT = 'mix';

function isCharactersTestMode() {
	return Boolean(globalThis.__CHARACTERS_TEST_MODE__ || import.meta.vitest);
}

function getCharacterValueWrapperRegistry() {
	return globalThis.CharacterValueWrapperRegistry || null;
}

function getCharacterSectionRendererRegistry() {
	return globalThis.CharacterSectionRendererRegistry || null;
}

function isPublicCharacterRecord(record) {
	if (!record || typeof record !== 'object' || Array.isArray(record)) return true;
	return !(record.isPrivate === true || String(record.isPrivate || '').trim().toLowerCase() === 'true');
}

function filterPublicCharacterRecords(records) {
	if (!Array.isArray(records)) return [];
	return records.filter(isPublicCharacterRecord);
}

export function __setCharactersTestState(state = {}) {
	if (Object.prototype.hasOwnProperty.call(state, 'globalMeta')) globalMetaCache = state.globalMeta;
	if (Object.prototype.hasOwnProperty.call(state, 'globalTypeDef')) globalTypeDefCache = state.globalTypeDef;
	if (Object.prototype.hasOwnProperty.call(state, 'globalDefType')) globalDefTypeCache = state.globalDefType;
	if (Object.prototype.hasOwnProperty.call(state, 'worksCatalog')) worksCatalogCache = state.worksCatalog;
	if (Object.prototype.hasOwnProperty.call(state, 'workDbCatalogs')) {
		workDbCatalogCache = new Map(Object.entries(state.workDbCatalogs || {}));
	}
	if (Object.prototype.hasOwnProperty.call(state, 'workTypeDefs')) {
		workTypeDefCache = new Map(Object.entries(state.workTypeDefs || {}));
	}
	if (Object.prototype.hasOwnProperty.call(state, 'charState') && typeof window !== 'undefined') {
		window.__CHAR_STATE__ = state.charState;
	}
}

export function __resetCharactersTestState() {
	isInitialized = false;
	globalMetaCache = null;
	globalTypeDefCache = null;
	globalDefTypeCache = null;
	workTypeDefCache = new Map();
	worksCatalogCache = null;
	workDbCatalogCache = new Map();
	sharedLayerTypeDefCache.clear();
	workLayerTypeDefCache.clear();
	API_BASE_REL = '../pages/';
	if (typeof window !== 'undefined' && window.__CHAR_STATE__) {
		delete window.__CHAR_STATE__;
	}
}

export function __getStoryEraSummaryForTest(storyEra) {
	return getStoryEraSummary(storyEra);
}

const IMAGE_LIGHTBOX_IDS = {
	root: 'image-lightbox',
	dialog: 'image-lightbox-dialog',
	image: 'image-lightbox-image',
	caption: 'image-lightbox-caption',
	close: 'image-lightbox-close'
};

const imageLightboxState = {
	lastTrigger: null
};

/**
 * DB名から「二次創作（Secondary系）」文脈かを推定
 * - isForSecondary フィールドの表示切替に使用
 * @param {string} dbName
 * @returns {boolean}
 */
function isSecondaryDbName(dbName) {
	const n = String(dbName || '').toLowerCase();
	if (!n) return false;
	// SemiPrimary は一次創作に準ずる扱いなので除外
	if (n.includes('semiprimary')) return false;
	return n.includes('secondary');
}

function findDbCatalogEntry(workMeta, dbName) {
	const databases = (workMeta && typeof workMeta === 'object' && workMeta.Databases && typeof workMeta.Databases === 'object')
		? workMeta.Databases
		: null;
	if (!databases) return null;

	const rawName = String(dbName || '').replace(/^#?(DB|Ref|Loc)_/i, '').trim();
	if (!rawName) return null;
	const normalized = `${rawName.charAt(0).toUpperCase()}${rawName.slice(1)}`;
	return databases[`#DB_${normalized}`] || databases[`#Ref_${normalized}`] || databases[`#Loc_${normalized}`] || null;
}

function mapDbNameToImageDir(dbName, layer = '') {
	const rawName = String(dbName || '').trim();
	if (!rawName) return 'General';
	if (rawName === 'General') return 'General';
	if (rawName.startsWith('DB_') || rawName.startsWith('Ref_') || rawName.startsWith('Loc_')) return rawName;

	// DB_Layer に応じたプレフィックスを付与
	const layerStr = String(layer || '').trim();
	if (layerStr === 'References') return `Ref_${rawName}`;
	if (layerStr === 'Localization') return `Loc_${rawName}`;

	const refMapping = {
		Glossary: 'Ref_Glossary',
		Reference: 'Ref_Reference'
	};
	if (refMapping[rawName]) return refMapping[rawName];

	const dbMapping = {
		Primary: 'DB_Primary',
		Secondary: 'DB_Secondary',
		SemiPrimary: 'DB_SemiPrimary',
		SelfSecondary: 'DB_SelfSecondary',
		UnprocessedSecondary: 'DB_UnprocessedSecondary',
		PrimaryDealer: 'DB_PrimaryDealer',
		PrimaryMobs: 'DB_PrimaryMobs',
		Proxy: 'DB_Proxy',
		Mobs: 'DB_Mobs'
	};
	if (dbMapping[rawName]) return dbMapping[rawName];

	return `DB_${rawName}`;
}

function getRecordPrimaryTitle(rec) {
	if (!rec || typeof rec !== 'object') return '(No Name)';
	const lang = getCurrentPageLanguage();
	const primaryOrder = lang === 'en'
		? [
			rec.Name_EN, rec.FormalName_EN, rec.Title_EN, rec.Term_EN,
			rec.Name_JP, rec.FormalName_JP, rec.ModelName_JP, rec.Title_JP, rec.Term_JP
		]
		: [
			rec.Name_JP, rec.FormalName_JP, rec.ModelName_JP, rec.Title_JP, rec.Term_JP,
			rec.Name_EN, rec.FormalName_EN, rec.Title_EN, rec.Term_EN
		];
	const base = primaryOrder.find((value) => typeof value === 'string' && value.trim());
	return String(base || '(No Name)').trim();
}

function getRecordSecondaryTitle(rec) {
	if (!rec || typeof rec !== 'object') return '';
	const lang = getCurrentPageLanguage();
	const order = lang === 'en'
		? [rec.Name_JP, rec.FormalName_JP, rec.Term_JP, rec.Title_JP, rec.Name_EN, rec.FormalName_EN, rec.Term_EN, rec.Title_EN, rec.ModelNumber]
		: [rec.Name_EN, rec.FormalName_EN, rec.Term_EN, rec.Title_EN, rec.ModelNumber];
	const sub = order
		.find((value) => typeof value === 'string' && value.trim());
	return String(sub || '').trim();
}

async function fetchSharedLayerTypeDef(layerName) {
	const layer = String(layerName || '').trim();
	if (!layer) return {};
	if (sharedLayerTypeDefCache.has(layer)) {
		return sharedLayerTypeDefCache.get(layer) || {};
	}

	const u = new URL(`../data/${encodeURIComponent(layer)}/db_type.json`, location.href);
	try {
		const res = await fetchJSON(u.toString());
		const typeDef = (res && typeof res === 'object') ? res : {};
		sharedLayerTypeDefCache.set(layer, typeDef);
		return typeDef;
	} catch (error) {
		console.warn('⚠️ Failed to fetch shared layer type def:', layer, error.message);
		sharedLayerTypeDefCache.set(layer, {});
		return {};
	}
}

async function fetchWorkLayerTypeDef(workKey, layerName) {
	const layer = String(layerName || '').trim();
	if (!layer) return {};

	const normalizedWorkKey = normalizeWorkKey(workKey);
	const cacheKey = `${normalizedWorkKey}::${layer}`;
	if (workLayerTypeDefCache.has(cacheKey)) {
		return workLayerTypeDefCache.get(cacheKey) || {};
	}

	const workDir = resolveWorkDirName(normalizedWorkKey);
	const u = new URL(`../data/${encodeURIComponent(workDir)}/${encodeURIComponent(layer)}/db_type.json`, location.href);
	try {
		const res = await fetchJSON(u.toString());
		const typeDef = (res && typeof res === 'object') ? res : {};
		workLayerTypeDefCache.set(cacheKey, typeDef);
		return typeDef;
	} catch (error) {
		console.warn('⚠️ Failed to fetch work layer type def:', { workKey, layer, message: error.message });
		workLayerTypeDefCache.set(cacheKey, {});
		return {};
	}
}

function mergeTypeDefSources(primaryTypeDef, secondaryTypeDef) {
	const primary = (primaryTypeDef && typeof primaryTypeDef === 'object' && !Array.isArray(primaryTypeDef))
		? primaryTypeDef
		: {};
	const secondary = (secondaryTypeDef && typeof secondaryTypeDef === 'object' && !Array.isArray(secondaryTypeDef))
		? secondaryTypeDef
		: {};

	const primaryDef = Array.isArray(primary.$DefType) ? primary.$DefType : [];
	const secondaryDef = Array.isArray(secondary.$DefType) ? secondary.$DefType : [];
	const primaryVars = (primary.$VarsDef && typeof primary.$VarsDef === 'object' && !Array.isArray(primary.$VarsDef))
		? primary.$VarsDef
		: {};
	const secondaryVars = (secondary.$VarsDef && typeof secondary.$VarsDef === 'object' && !Array.isArray(secondary.$VarsDef))
		? secondary.$VarsDef
		: {};

	return {
		...secondary,
		...primary,
		...(secondaryDef.length || primaryDef.length ? { $DefType: [...secondaryDef, ...primaryDef] } : {}),
		...(Object.keys(secondaryVars).length || Object.keys(primaryVars).length
			? { $VarsDef: { ...secondaryVars, ...primaryVars } }
			: {})
	};
}

function inferImageFolderHint(fieldName) {
	const rawFieldName = String(fieldName || '').trim();
	if (!rawFieldName) return null;

	const suffixMatch = rawFieldName.match(/^(.+?)_(PNG|JPE?G|WEBP|GIF|SVG|BMP|IMAGE|PHOTO|PICTURE)/i);
	if (suffixMatch?.[1]) return suffixMatch[1];

	const pathMatch = rawFieldName.match(/^(.+?)_Path$/i);
	if (pathMatch?.[1]) return pathMatch[1];

	return null;
}
/**
 * Utility Functions
 */

/** @type {function(string): HTMLElement} Query selector shorthand */
const $ = (sel) => document.querySelector(sel);
/** @type {function(string): HTMLElement[]} Query selector all shorthand */
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/**
 * プレーンオブジェクト判定
 * - トップレベル helper でも使うため、関数ローカルではなく共通位置に置く
 * @param {any} value
 * @returns {boolean}
 */
function isPlainObject(value) {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Service Worker 管理
 * GitHub Pages 上で API ルートが動作するように、ページスコープの Service Worker を登録
 * 広告ブロッカーによる干渉を避けるためのフォールバック戦略を実装
 */

// GitHub Pages で API ルートが動作するように SW をインストール
// 広告ブロッカーを避けるために /pages を優先し、ページが独自の SW で制御されることを保証
let API_BASE_REL = '../pages/';

// SW 初期化の失敗ログはリロードで流れやすいため、sessionStorage に退避して次回表示できるようにする
const SW_INIT_ERROR_KEY = '100bl.lastSwInitError';

/**
 * SW 初期化失敗の情報を sessionStorage に保存
 * @param {string} stage - 'primary' | 'fallback-svc' | 'fallback-api' | etc
 * @param {any} info
 */
function rememberSwInitError(stage, info) {
	try {
		const payload = {
			time: new Date().toISOString(),
			stage: String(stage || '').trim() || 'unknown',
			href: String(location?.href || ''),
			origin: String(location?.origin || ''),
			protocol: String(location?.protocol || ''),
			info
		};
		sessionStorage.setItem(SW_INIT_ERROR_KEY, JSON.stringify(payload));
	} catch {
		// no-op
	}
}

/**
 * 前回のSW初期化失敗ログをコンソールへ再出力（引用できるようにする）
 */
function replayRememberedSwInitError() {
	try {
		const raw = sessionStorage.getItem(SW_INIT_ERROR_KEY);
		if (!raw) return;
		const payload = JSON.parse(raw);
		// 1回は必ず目立つ形で出す（ただし勝手に消さない）
		console.warn('🧾 前回のService Worker初期化失敗ログ（引用用）:', payload);
	} catch {
		// no-op
	}
}

function clearRememberedSwInitError() {
	try { sessionStorage.removeItem(SW_INIT_ERROR_KEY); } catch { /* no-op */ }
}

/**
 * Service Worker の登録（複数のフォールバック戦略付き）
 * 広告ブロッカーの制限を回避するため、/pages/, /svc/, /api/ の順で試行
 * @returns {Promise<void>} SW が準備完了してページを制御した時点で解決
 */
async function ensureApiSW() {
	if (!('serviceWorker' in navigator)) {
		console.warn('🚫 Service Worker はサポートされていません');
		return;
	}

	// Service Worker は secure context（https or localhost）でのみ有効
	// - file:// などでは必ず失敗するため、早めに理由を出す
	try {
		const p = String(location?.protocol || '');
		if (p && p !== 'https:' && p !== 'http:') {
			const err = new Error(`Unsupported protocol for Service Worker: ${p}`);
			rememberSwInitError('precheck', { message: err.message, name: err.name, stack: err.stack });
			console.warn('🚫 Service Worker はこのプロトコルでは利用できません:', p);
			throw err;
		}
	} catch (e) {
		// throw された場合は呼び元に伝播
		throw e;
	}

	const CONTROLLER_RELOAD_FLAG = '100bl.swControllerReloaded';

	/**
	 * active な SW に対して clients.claim() を再実行するよう依頼
	 * - controller が付かない環境の救済
	 */
	const requestClaimClients = async (label) => {
		try {
			const reg = await navigator.serviceWorker.ready;
			if (reg?.active) {
				console.warn(`📨 SWに clients.claim() を依頼します: ${label || ''}`.trim());
				reg.active.postMessage({ type: '100bl.claimClients', label: String(label || '') });
			}
		} catch {
			// no-op
		}
	};

	/**
	 * controller が付与されない環境向けに、SW ready 後すぐに claim を依頼しつつ段階的に待機する
	 * @param {string} baseLabel
	 */
	const ensureControlledBySw = async (baseLabel) => {
		if (navigator.serviceWorker.controller) return;

		// 先に claim を依頼して、短い待機で controllerchange を待つ（15s待ちを回避）
		await requestClaimClients(`${baseLabel}/after-ready`);
		try {
			await waitForController(2000);
			return;
		} catch (e) {
			const msg = String(e?.message || e || '');
			if (!msg.includes('controller timeout')) throw e;
		}

		if (navigator.serviceWorker.controller) return;

		// それでもダメならもう一度 claim して、少し長めに待つ
		await requestClaimClients(`${baseLabel}/retry`);
		await waitForController(8000);
	};

	console.log('🔧 Service Worker の登録を試行中...');

	try {
		// 1) /pages/v1, /svc/v1, /api/v1 をインターセプトするページスコープ SW を登録
		const pageSwUrl = new URL('./sw.js', location.href).toString();
		const pageScope = new URL('./', location.href).pathname; // '/pages/'
		console.log(`🌐 プライマリ SW を登録: ${pageSwUrl} (スコープ: ${pageScope})`);
		const reg = await navigator.serviceWorker.register(pageSwUrl, { scope: pageScope });
		console.log('✅ プライマリ SW の登録に成功');
		// ブラウザが SW スクリプトを強くキャッシュしている場合に備え、更新を促す
		try { await reg.update(); } catch (_) { /* no-op */ }
		API_BASE_REL = '../pages/';
		await navigator.serviceWorker.ready; // アクティベーションを待機
		console.log('✅ プライマリ SW の準備完了');
		// フェッチを開始する前にこのページが制御されることを保証
		// - controller が付かないケースでは、SWに claim を依頼して再試行する
		await ensureControlledBySw('primary');
		if (!navigator.serviceWorker.controller) throw new Error('Primary SW is ready but did not take control of this page');
		console.log('✅ プライマリ SW がページを制御中');

		// 成功したら、前回エラーの退避はクリア
		clearRememberedSwInitError();

		// 成功したら、リロード済みフラグは解除
		try { sessionStorage.removeItem(CONTROLLER_RELOAD_FLAG); } catch (_) { /* no-op */ }
	} catch (err) {
		console.warn('❌ プライマリ SW の登録に失敗:', err);
		rememberSwInitError('primary', {
			message: String(err?.message || err || ''),
			name: String(err?.name || ''),
			stack: String(err?.stack || ''),
			pageSwUrl: (() => { try { return new URL('./sw.js', location.href).toString(); } catch { return ''; } })(),
			pageScope: (() => { try { return new URL('./', location.href).pathname; } catch { return ''; } })(),
		});

		// キャッシュの消去＋ハードリロード等では、その1回のナビゲーションがSW制御されないことがある。
		// この場合、次の通常リロードで controller が付与されるため、1回だけ自動リロードして復旧する。
		const msg = String(err?.message || err || '');
		if (msg.includes('controller timeout') || msg.includes('did not take control')) {
			let alreadyReloaded = false;
			try { alreadyReloaded = sessionStorage.getItem(CONTROLLER_RELOAD_FLAG) === '1'; } catch (_) { /* no-op */ }

			if (!alreadyReloaded) {
				try { sessionStorage.setItem(CONTROLLER_RELOAD_FLAG, '1'); } catch (_) { /* no-op */ }
				console.warn('🔁 SW controller が取得できないため、通常リロードで復旧を試行します');
				location.reload();
				throw new Error('SW_CONTROLLER_RELOAD');
			}
		}

		// このページが SW に制御されない限り /pages/v1/* は解決できないため、
		// controller 系の失敗はフォールバックしても回復しない（スコープが一致しない）
		if (msg.includes('controller timeout') || msg.includes('did not take control')) {
			throw err;
		}
		try {
			// 2) /svc へのフォールバック（エイリアスパス）
			const svcSwUrl = new URL('../svc/sw.js', location.href).toString();
			const svcScope = new URL('../svc/', location.href).pathname;
			console.log(`🌐 フォールバック SW を登録: ${svcSwUrl} (スコープ: ${svcScope})`);
			const reg2 = await navigator.serviceWorker.register(svcSwUrl, { scope: svcScope });
			console.log('✅ フォールバック SW の登録に成功');
			try { await reg2.update(); } catch (_) { /* no-op */ }
			API_BASE_REL = '../svc/';
			await navigator.serviceWorker.ready;
			console.log('✅ フォールバック SW の準備完了');
			await waitForController();
			if (!navigator.serviceWorker.controller) throw new Error('Fallback SW is ready but did not take control of this page');
			console.log('✅ フォールバック SW がページを制御中');

			clearRememberedSwInitError();
		} catch (err2) {
			console.warn('❌ フォールバック SW の登録に失敗:', err2);
			rememberSwInitError('fallback-svc', {
				message: String(err2?.message || err2 || ''),
				name: String(err2?.name || ''),
				stack: String(err2?.stack || ''),
				svcSwUrl: (() => { try { return new URL('../svc/sw.js', location.href).toString(); } catch { return ''; } })(),
				svcScope: (() => { try { return new URL('../svc/', location.href).pathname; } catch { return ''; } })(),
			});
			try {
				// 3) /api への最終フォールバック
				const apiSwUrl = new URL('../api/sw.js', location.href).toString();
				const apiScope = new URL('../api/', location.href).pathname;
				console.log(`🌐 最終フォールバック SW を登録: ${apiSwUrl} (スコープ: ${apiScope})`);
				const reg3 = await navigator.serviceWorker.register(apiSwUrl, { scope: apiScope });
				console.log('✅ 最終フォールバック SW の登録に成功');
				try { await reg3.update(); } catch (_) { /* no-op */ }
				API_BASE_REL = '../api/';
				await navigator.serviceWorker.ready;
				console.log('✅ 最終フォールバック SW の準備完了');
				await waitForController();
				if (!navigator.serviceWorker.controller) throw new Error('Last-resort SW is ready but did not take control of this page');
				console.log('✅ 最終フォールバック SW がページを制御中');

				clearRememberedSwInitError();
			} catch (err3) {
				console.error('❌ すべての SW 登録試行が失敗:', err3);
				rememberSwInitError('fallback-api', {
					message: String(err3?.message || err3 || ''),
					name: String(err3?.name || ''),
					stack: String(err3?.stack || ''),
					apiSwUrl: (() => { try { return new URL('../api/sw.js', location.href).toString(); } catch { return ''; } })(),
					apiScope: (() => { try { return new URL('../api/', location.href).pathname; } catch { return ''; } })(),
				});
				// SW が利用できない場合、/pages/v1 は静的ホスティングでは 404 になるため、ここで失敗として扱う
				throw err3;
			}
		}
	}
}

/**
 * URL パラメータ管理
 */

/**
 * 現在のクエリ文字列パラメータをオブジェクトとして取得
 * @returns {Object} work, db, num, q プロパティを持つオブジェクト
 */
function getQS() {
	const p = new URLSearchParams(location.search);
	return {
		work: p.get('work') || '',
		db: p.get('db') || '',
		num: p.get('num') || '',
		// 汎用インデックス直リンク（作品ごとの $IndexDef に対応）
		idx: p.get('idx') || '',
		idxKey: p.get('idxKey') || '',
		q: p.get('q') || '',
		lang: p.get('lang') || ''
	};
}

/**
 * ページリロードなしでクエリ文字列パラメータを更新
 * @param {Object} next - 更新するパラメータのオブジェクト
 */
function setQS(next) {
	const cur = getQS();
	const qs = new URLSearchParams({ ...cur, ...next });
	history.replaceState(null, '', `${location.pathname}?${qs.toString()}`);
}

function normalizePageLanguage(lang) {
	const raw = String(lang || '').trim().toLowerCase();
	if (raw === 'en' || raw === 'eng') return 'en';
	if (raw === 'ja' || raw === 'jp' || raw === 'jpn') return 'jp';
	if (raw === 'mix' || raw === 'bilingual' || raw === 'bi') return 'mix';
	return PAGE_LANG_DEFAULT;
}

function getCurrentPageLanguage() {
	const queryLang = getQS().lang;
	if (queryLang) return normalizePageLanguage(queryLang);
	const stateLang = window?.__CHAR_STATE__?.pageLang;
	if (stateLang) return normalizePageLanguage(stateLang);
	try {
		const stored = localStorage.getItem(PAGE_LANG_STORAGE_KEY);
		if (stored) return normalizePageLanguage(stored);
	} catch {
		// no-op
	}
	return PAGE_LANG_DEFAULT;
}

function applyLanguageState(lang) {
	const normalized = normalizePageLanguage(lang);
	if (window.__CHAR_STATE__ && typeof window.__CHAR_STATE__ === 'object') {
		window.__CHAR_STATE__.pageLang = normalized;
	}
	document.documentElement.lang = normalized === 'en' ? 'en' : 'ja';
	document.body?.setAttribute('data-lang', normalized);
	return normalized;
}

function persistPageLanguage(lang) {
	const normalized = normalizePageLanguage(lang);
	setQS({ lang: normalized === 'mix' ? '' : normalized });
	try {
		localStorage.setItem(PAGE_LANG_STORAGE_KEY, normalized);
	} catch {
		// no-op
	}
	return applyLanguageState(normalized);
}

/**
 * API URL 構築
 */

/**
 * 現在の API_BASE_REL を基準とした API URL を構築
 * @param {string} path - API パス (例: 'v1/works' または '/v1/works')
 * @returns {string} 完全な API URL
 */
function api(path) {
	const base = new URL(API_BASE_REL, location.href);
	// 'v1/...' または '/v1/...' のようなパスをサポート
	const p = String(path || '').replace(/^\/?/, '');
	return new URL(p, base).toString();
}

/**
 * Service Worker 制御管理
 */

/**
 * このページが Service Worker によって制御されるまで待機
 * @param {number} timeoutMs - タイムアウト時間（ミリ秒、デフォルト: 3000）
 * @returns {Promise<void>} ページが制御されるかタイムアウト時に解決
 */
function waitForController(timeoutMs = 15000) {
	if (navigator.serviceWorker.controller) return Promise.resolve();

	return new Promise((resolve, reject) => {
		let done = false;

		/** @type {ReturnType<typeof setTimeout>|null} */
		let to = null;

		const cleanup = () => {
			navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
		};

		const onControllerChange = () => {
			if (done) return;
			if (!navigator.serviceWorker.controller) return;
			done = true;
			if (to != null) clearTimeout(to);
			cleanup();
			resolve();
		};

		// レース対策: リスナーを先に登録してから controller を再チェック
		navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
		if (navigator.serviceWorker.controller) {
			done = true;
			cleanup();
			resolve();
			return;
		}

		to = setTimeout(() => {
			if (done) return;
			done = true;
			cleanup();
			reject(new Error(`Service Worker controller timeout after ${timeoutMs}ms`));
		}, timeoutMs);
	});
}

/**
 * HTTP リクエストユーティリティ
 */

/**
 * URL から JSON をフェッチして解析（タイムアウトと拡張エラーハンドリング付き）
 * @param {string} url - フェッチする URL
 * @param {number} timeout - タイムアウト時間（ミリ秒、デフォルト: 10秒）
 * @returns {Promise<Object>} 解析された JSON レスポンス
 * @throws {Error} リクエストが失敗するかレスポンスが OK でない場合
 */
async function fetchJSON(url, timeout = 10000) {
	console.log('🌐 フェッチ中:', url);
	const startTime = performance.now();

	try {
		// Create timeout promise
		const timeoutPromise = new Promise((_, reject) =>
			setTimeout(() => reject(new Error(`Request timeout after ${timeout}ms`)), timeout)
		);

		// Race between fetch and timeout
		const fetchPromise = fetch(url, {
			headers: { 'Accept': 'application/json' },
			// SW/API 側の enrich 仕様変更を即時反映しやすくするため、疑似API応答は都度取得する
			cache: 'no-store'
		});

		const res = await Promise.race([fetchPromise, timeoutPromise]);
		const fetchTime = performance.now() - startTime;

		if (!res.ok) {
			console.error('❌ Fetch failed:', {
				status: res.status,
				statusText: res.statusText,
				url: url,
				time: `${fetchTime.toFixed(2)}ms`,
				headers: Object.fromEntries(res.headers.entries())
			});
			throw new Error(`${res.status} ${res.statusText} ${url}`);
		}

		const parseStart = performance.now();
		const data = await res.json();
		const parseTime = performance.now() - parseStart;
		const totalTime = performance.now() - startTime;

		console.log('✅ Fetch success:', url, {
			fetchTime: `${fetchTime.toFixed(2)}ms`,
			parseTime: `${parseTime.toFixed(2)}ms`,
			totalTime: `${totalTime.toFixed(2)}ms`,
			responseSize: `${JSON.stringify(data).length} chars`
		});

		return data;
	} catch (error) {
		const totalTime = performance.now() - startTime;
		console.error('❌ Fetch error:', {
			message: error.message,
			url: url,
			time: `${totalTime.toFixed(2)}ms`,
			type: error.constructor.name
		});
		throw error;
	}
}

/**
 * データフェッチ関数群
 */

/**
 * 利用可能な作品のリストを取得
 * @returns {Promise<Array>} 作品オブジェクトの配列
 */
async function listWorks() {
	if (Array.isArray(worksCatalogCache)) return worksCatalogCache;
	worksCatalogCache = await fetchJSON(api('v1/works'));
	return worksCatalogCache;
}

/**
 * 特定の作品のデータベースリストを取得
 * @param {string} workKey - 作品識別子
 * @returns {Promise<Array>} データベース名の配列
 */
async function listWorkDBs(workKey) {
	const w = workKeyForAPI(workKey);
	if (workDbCatalogCache.has(w)) return workDbCatalogCache.get(w) || [];
	const r = await fetchJSON(api(`v1/works/${encodeURIComponent(w)}/db`));
	const dbs = r.databases || [];
	workDbCatalogCache.set(w, dbs);
	return dbs;
}

/**
 * DB カタログ項目から表示名を解決
 * @param {Object|null} db
 * @param {string} fallback
 * @returns {string}
 */
function getDbDisplayLabel(db, fallback = '') {
	const lang = getCurrentPageLanguage();
	const label = lang === 'en'
		? String(db?.DB_Label_EN || db?.DB_Label_JP || db?.key || fallback || '').trim()
		: String(db?.DB_Label_JP || db?.DB_Label_EN || db?.key || fallback || '').trim();
	return label || String(fallback || '-');
}

/**
 * 参照解決とデバッグ情報を含むキャラクターデータベースをフェッチ
 * @param {string} workKey - 作品識別子
 * @param {string} dbName - データベース名 (例: 'Primary', 'Secondary')
 * @param {Object} options - フェッチオプション
 * @param {boolean} options.resolve - 参照を解決するかどうか（デフォルト: true）
 * @param {boolean} options.debug - デバッグ情報を含めるかどうか（デフォルト: false）
 * @returns {Promise<Array>} キャラクターレコードの配列
 */
async function fetchDB(workKey, dbName, { resolve = true, debug = false } = {}) {
	const w = workKeyForAPI(workKey);
	const u = new URL(api(`v1/works/${encodeURIComponent(w)}/db/${encodeURIComponent(dbName)}`));
	if (resolve) u.searchParams.set('resolve', '1');
	if (debug) u.searchParams.set('debug', '1');
	return fetchJSON(u.toString());
}

/**
 * データ正規化ユーティリティ
 */

/**
 * 作品識別子を正規化して適切な #Works_ プレフィックスを確保
 * @param {string} id - 様々な形式の作品識別子
 * @returns {string} #Works_ プレフィックス付きの正規化された作品ID
 */
function normalizeWorkKey(id) {
	if (!id) return id;
	if (id.startsWith('#Works_')) return id;
	if (id.startsWith('Works_')) return `#${id}`;
	return `#Works_${id}`;
}

/**
 * Convert work key to API-safe format for URL encoding
 * Removes # prefix to avoid encoding issues in URLs
 * @param {string} workKey - Work key like '#Works_NumberTales'
 * @returns {string} API-safe work key like 'Works_NumberTales'
 */
function workKeyForAPI(workKey) {
	const normalized = normalizeWorkKey(workKey);
	return normalized.startsWith('#') ? normalized.substring(1) : normalized;
}

/**
 * DOM Helper Functions
 */

/**
 * Create DOM element with properties and children (type-safe, array-flattening)
 * Enhanced version that handles arrays and type conversion gracefully
 * @param {string} tag - HTML tag name
 * @param {Object} props - Element properties and attributes
 * @param {Array|*} children - Child elements (supports nested arrays and mixed types)
 * @returns {HTMLElement} Created DOM element
 */
function el(tag, props = {}, children = []) {
	const e = document.createElement(tag);
	for (const [k, v] of Object.entries(props)) {
		if (k === 'class') e.className = v;
		else if (k === 'text') e.textContent = v;
		else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.substring(2), v);
		else e.setAttribute(k, v);
	}
	const appendAny = (child) => {
		if (child == null) return;
		if (Array.isArray(child)) { child.forEach(appendAny); return; }
		// Only append DOM Nodes created by el() (marked __trustedEl); others become text to prevent
		// exception-text reinterpretation as HTML (CodeQL: js/xss-through-exception).
		if (child instanceof Node) {
			if (child.__trustedEl === true) e.appendChild(child);
			return;
		}
		const t = typeof child;
		if (t === 'string' || t === 'number' || t === 'boolean') {
			e.appendChild(document.createTextNode(String(child)));
			return;
		}
		// Fallback: render other types as text to avoid interpreting them as HTML
		e.appendChild(document.createTextNode(String(child)));
	};
	[].concat(children).forEach(appendAny);
	e.__trustedEl = true;
	return e;
}

/**
 * 詳細画面のタグ群を、要素数に応じた等幅グリッドへまとめる。
 * - 一覧系で使う kv-grid とは分離し、能力/効果/会話例/関係表示専用のレイアウトにする
 * @param {HTMLElement[]} nodes
 * @returns {HTMLElement|null}
 */
function createDetailTagGrid(nodes) {
	const items = Array.isArray(nodes) ? nodes.filter(Boolean) : [];
	if (!items.length) return null;

	const classNames = ['detail-tag-grid'];
	if (items.length === 1) classNames.push('detail-tag-grid--single');
	else if (items.length === 2 || items.length === 4) classNames.push('detail-tag-grid--double');
	else classNames.push('detail-tag-grid--triple');

	return el('div', { class: classNames.join(' ') }, items);
}

/**
 * 画像ライトボックスの要素参照を取得
 * @returns {{root: HTMLElement|null, dialog: HTMLElement|null, image: HTMLImageElement|null, caption: HTMLElement|null, close: HTMLElement|null}}
 */
function getImageLightboxRefs() {
	return {
		root: document.getElementById(IMAGE_LIGHTBOX_IDS.root),
		dialog: document.getElementById(IMAGE_LIGHTBOX_IDS.dialog),
		image: document.getElementById(IMAGE_LIGHTBOX_IDS.image),
		caption: document.getElementById(IMAGE_LIGHTBOX_IDS.caption),
		close: document.getElementById(IMAGE_LIGHTBOX_IDS.close)
	};
}

/**
 * 画像ライトボックスを閉じる
 * @param {{restoreFocus?: boolean}} options
 */
function closeImageLightbox(options = {}) {
	const { restoreFocus = true } = options;
	const refs = getImageLightboxRefs();
	if (!refs.root || refs.root.hidden) return;

	refs.root.hidden = true;
	refs.root.setAttribute('aria-hidden', 'true');
	document.body.classList.remove('lightbox-open');

	if (refs.image) {
		refs.image.removeAttribute('src');
		refs.image.alt = '';
	}

	if (refs.caption) {
		refs.caption.textContent = '';
		refs.caption.hidden = true;
	}

	if (restoreFocus && imageLightboxState.lastTrigger instanceof HTMLElement && imageLightboxState.lastTrigger.isConnected) {
		imageLightboxState.lastTrigger.focus();
	}

	imageLightboxState.lastTrigger = null;
}

/**
 * 画像ライトボックスを開く
 * @param {{url?: string, alt?: string, caption?: string}} imgData
 * @param {HTMLElement|null} triggerEl
 */
function openImageLightbox(imgData, triggerEl = null) {
	const refs = getImageLightboxRefs();
	const src = String(imgData?.url || '').trim();
	if (!refs.root || !refs.image || !refs.close || !src) return;

	const altText = str(imgData?.alt).trim() || '拡大画像';
	const captionText = str(imgData?.caption).trim();

	imageLightboxState.lastTrigger = triggerEl instanceof HTMLElement
		? triggerEl
		: (document.activeElement instanceof HTMLElement ? document.activeElement : null);

	refs.image.src = src;
	refs.image.alt = altText;

	if (refs.caption) {
		refs.caption.textContent = captionText;
		refs.caption.hidden = !captionText;
	}

	refs.root.hidden = false;
	refs.root.setAttribute('aria-hidden', 'false');
	document.body.classList.add('lightbox-open');
	refs.close.focus();
}

/**
 * ギャラリー用の拡大ボタン付き画像カードを生成
 * @param {{url?: string, alt?: string, caption?: string}} imgData
 * @returns {HTMLElement}
 */
function createGalleryImageItem(imgData) {
	const lang = getCurrentPageLanguage();
	const altText = str(imgData?.alt).trim() || (lang === 'en' ? 'Image' : '画像');
	const captionText = str(imgData?.caption).trim();
	const previewLabel = captionText || altText;
	const zoomLabel = lang === 'en' ? `${previewLabel} (zoom)` : `${previewLabel} を拡大表示`;
	const zoomHint = lang === 'en' ? 'Zoom' : '拡大';

	return el('div', { class: 'image-item' }, [
		el('button', {
			type: 'button',
			class: 'image-zoom-trigger',
			'aria-label': zoomLabel,
			title: previewLabel,
			onclick: (event) => openImageLightbox({
				url: imgData?.url,
				alt: altText,
				caption: captionText || altText
			}, event.currentTarget)
		}, [
			el('img', {
				src: imgData?.url || '',
				alt: altText,
				loading: 'lazy',
				title: previewLabel
			}),
			el('span', { class: 'image-zoom-hint', 'aria-hidden': 'true' }, [zoomHint])
		]),
		captionText ? el('div', { class: 'caption' }, [captionText]) : null
	].filter(Boolean));
}

/**
 * Fetch work metadata including Commons and database info
 * @param {string} workKey - Work key like '#Works_NumberTales'
 * @returns {Promise<Object>} Work metadata object
 */
async function fetchWorkMeta(workKey) {
	const w = workKeyForAPI(workKey);
	const u = new URL(api(`v1/works/${encodeURIComponent(w)}/meta`));
	try {
		const res = await fetchJSON(u.toString());
		return res.meta || {};
	} catch (error) {
		console.warn('⚠️ Failed to fetch work meta:', workKey, error.message);
		return {};
	}
}

/**
 * Fetch global metadata including work definitions and index info
 * @returns {Promise<Object>} Global metadata object
 */
async function fetchGlobalMeta() {
	if (globalMetaCache) return globalMetaCache;

	const u = new URL(api('v1/meta'));
	try {
		const res = await fetchJSON(u.toString());
		globalMetaCache = res.meta || {};
		return globalMetaCache;
	} catch (error) {
		console.warn('⚠️ Failed to fetch global meta:', error.message);
		return {};
	}
}

/**
 * Fetch global type definitions from ./data/db_type.json
 * @returns {Promise<Object>} Global type definitions
 */
async function fetchGlobalTypeDef() {
	// NOTE: キャッシュが「空」や「異形（古いSWのレスポンス等）」を掴んでいると
	// fieldTypeMap が作れず、GenderType などがコード表示に退避してしまう。
	// 期待形（$DefType 配列 or global 配列）でない場合は自動で再フェッチする。
	const isValid = (obj) => {
		if (!obj || typeof obj !== 'object') return false;
		if (Array.isArray(obj?.$DefType)) return true;
		if (Array.isArray(obj?.typedef?.$DefType)) return true;
		if (Array.isArray(obj?.global)) return true;
		return false;
	};

	if (globalTypeDefCache && isValid(globalTypeDefCache)) return globalTypeDefCache;
	// 無効キャッシュは破棄して再取得
	globalTypeDefCache = null;

	const u = new URL(api('v1/typedef/global'));
	try {
		const res = await fetchJSON(u.toString());
		console.log('🌐 Global TypeDef response:', res);
		globalTypeDefCache = (res && typeof res === 'object') ? res : {};
		return globalTypeDefCache;
	} catch (error) {
		console.warn('⚠️ Failed to fetch global type def:', error.message);
		return {};
	}
}

/**
 * Fetch global definition types (enum definitions, etc.)
 * @returns {Promise<Object>} Global definition types
 */
async function fetchGlobalDefType() {
	// NOTE: v1/deftype/global は「表示辞書」を返すが、
	// 古いSWやブラウザキャッシュでは db_meta.json 単体しか返らない場合がある。
	// その場合でも db_type.json 側の `$VarsDef` を併合して辞書解決を維持する。
	const isValid = (obj) => {
		const vars = obj?.General?.$VarsDef;
		if (!vars || typeof vars !== 'object' || Array.isArray(vars)) return false;

		// NOTE:
		// 以前は「$EnumDef_ / #List_ が何か1つでもあればOK」だったが、
		// 誤って “別のメタ（例: 作品別 meta の #List_* だけ）” を掴んだ場合でも true になり得た。
		// その状態でキャッシュされると、GenderType の辞書（$EnumDef_GenderType）が無く、
		// 「性別だけ FemaleNeutral のまま残る」現象が発生する。
		const hasGenderEnum = (() => {
			const def = vars?.$EnumDef_GenderType;
			return !!def && typeof def === 'object' && !Array.isArray(def);
		})();
		if (hasGenderEnum) return true;

		// 後方互換の最低条件: enum/list キーが存在する（ただし上記が無ければ invalid 扱い）
		return false;
	};

	/**
	 * db_meta.json と db_type.json の `$VarsDef` を UI 用の辞書としてマージ
	 * @param {any} metaLike
	 * @param {any} typeLike
	 * @returns {Object}
	 */
	const mergeMetaAndTypeVars = (metaLike, typeLike) => {
		const meta = (metaLike && typeof metaLike === 'object' && !Array.isArray(metaLike)) ? metaLike : {};
		const type = (typeLike && typeof typeLike === 'object' && !Array.isArray(typeLike)) ? typeLike : {};

		const metaGeneral = (meta.General && typeof meta.General === 'object' && !Array.isArray(meta.General)) ? meta.General : {};
		const metaVars = (metaGeneral.$VarsDef && typeof metaGeneral.$VarsDef === 'object' && !Array.isArray(metaGeneral.$VarsDef))
			? metaGeneral.$VarsDef
			: {};
		const typeVars = (type.$VarsDef && typeof type.$VarsDef === 'object' && !Array.isArray(type.$VarsDef))
			? type.$VarsDef
			: {};

		if (!Object.keys(typeVars).length) return meta;

		return {
			...meta,
			...(Array.isArray(type.$DefType) ? { $DefType: type.$DefType } : {}),
			...(Array.isArray(type.global) ? { global: type.global } : {}),
			...(type.typedef && typeof type.typedef === 'object' ? { typedef: type.typedef } : {}),
			General: {
				...metaGeneral,
				$VarsDef: { ...metaVars, ...typeVars }
			}
		};
	};

	/**
	 * SW/キャッシュの揺れ（{meta:{...}} など）を吸収して「辞書本体」を取り出す
	 * @param {any} res
	 */
	const unwrap = (res) => {
		if (!res || typeof res !== 'object') return {};
		if (isValid(res)) return res;

		// よくあるラッパー形式
		const candidates = [
			res.meta,
			res.deftype,
			res.defType,
			res.def_type,
			res.data,
		];
		for (const c of candidates) {
			if (isValid(c)) return c;
		}
		return res;
	};

	/**
	 * 直 fetch 用の JSON ローダー
	 * @param {string} relPath
	 * @returns {Promise<Object>}
	 */
	const fetchDirectJson = async (relPath) => {
		const directUrl = new URL(relPath, location.href).toString();
		const res = await fetch(directUrl, {
			headers: { 'Accept': 'application/json' },
			cache: 'no-store'
		});
		if (!res.ok) throw new Error(`${res.status} ${res.statusText} ${directUrl}`);
		return res.json();
	};

	/**
	 * Dictionary ディレクトリを直 fetch し、`$VarsDef` 互換の辞書定義へ変換する
	 * @param {string} baseRelPath
	 * @returns {Promise<{meta: Object, vars: Object}>}
	 */
	const fetchDirectDictionaryBundle = async (baseRelPath) => {
		try {
			const [dictMeta, dictType] = await Promise.all([
				fetchDirectJson(`${baseRelPath}/db_meta.json`),
				fetchDirectJson(`${baseRelPath}/db_type.json`).catch(() => ({}))
			]);

			const catalogs = (dictMeta?.Dictionaries && typeof dictMeta.Dictionaries === 'object' && !Array.isArray(dictMeta.Dictionaries))
				? dictMeta.Dictionaries
				: {};
			const typeVars = (dictType?.$VarsDef && typeof dictType.$VarsDef === 'object' && !Array.isArray(dictType.$VarsDef))
				? dictType.$VarsDef
				: {};
			const vars = { ...typeVars };

			for (const [rawDictKey, info] of Object.entries(catalogs)) {
				if (!info || typeof info !== 'object' || Array.isArray(info)) continue;

				const dictName = String(rawDictKey || '').replace(/^#Dict_/, '').trim();
				const keyField = typeof info.keyField === 'string' ? info.keyField.trim() : '';
				const derivedName = dictName || keyField;
				if (!derivedName) continue;

				const dictKey = String(rawDictKey || '').startsWith('#Dict_')
					? String(rawDictKey).trim()
					: `#Dict_${derivedName}`;
				const compatListKey = typeof info.compatListKey === 'string' && info.compatListKey.trim()
					? info.compatListKey.trim()
					: `#List_${derivedName}`;
				const fileName = `dict_${derivedName}.json`;

				const rows = await fetchDirectJson(`${baseRelPath}/${fileName}`);
				if (!Array.isArray(rows)) continue;
				vars[dictKey] = rows;
				if (compatListKey && !vars[compatListKey]) vars[compatListKey] = rows;
			}

			return { meta: dictMeta, vars };
		} catch {
			return { meta: {}, vars: {} };
		}
	};

	/**
	 * API経由の辞書取得が壊れている場合の最終フォールバック:
	 * pages/characters.html から見て ../data/db_meta.json / ../data/db_type.json を「直 fetch」する。
	 * - SW/広告ブロッカー/キャッシュの揺れで /pages/v1/deftype/global が期待形でないケースの救済
	 * - cache:'no-store' で古い辞書を掴みにくくする
	 */
	const fetchDirectDbMeta = async () => {
		try {
			const [metaJson, typeJson, dictBundle] = await Promise.all([
				fetchDirectJson('../data/db_meta.json'),
				fetchDirectJson('../data/db_type.json'),
				fetchDirectDictionaryBundle('../data/Dictionaries')
			]);
			const metaBase = unwrap(metaJson);
			const mergedMeta = {
				...metaBase,
				...(dictBundle?.meta?.Dictionaries ? { Dictionaries: { ...(metaBase?.Dictionaries || {}), ...dictBundle.meta.Dictionaries } } : {})
			};
			const mergedType = {
				...(typeJson && typeof typeJson === 'object' ? typeJson : {}),
				$VarsDef: {
					...((typeJson?.$VarsDef && typeof typeJson.$VarsDef === 'object' && !Array.isArray(typeJson.$VarsDef)) ? typeJson.$VarsDef : {}),
					...((dictBundle?.vars && typeof dictBundle.vars === 'object' && !Array.isArray(dictBundle.vars)) ? dictBundle.vars : {})
				}
			};
			const merged = mergeMetaAndTypeVars(mergedMeta, mergedType);
			if (isValid(merged)) {
				console.warn('🛟 fetchGlobalDefType: recovered via direct /data/db_meta.json + /data/db_type.json fetch');
				return merged;
			}
		} catch (e) {
			console.warn('⚠️ fetchGlobalDefType: direct dictionary fetch failed:', e?.message || e);
		}
		return {};
	};

	if (globalDefTypeCache && isValid(globalDefTypeCache)) return globalDefTypeCache;
	// 無効キャッシュは破棄して再取得
	globalDefTypeCache = null;

	const u = new URL(api('v1/deftype/global'));
	try {
		const res = await fetchJSON(u.toString());
		const unwrapped = unwrap(res);
		const globalType = await fetchGlobalTypeDef();
		const merged = mergeMetaAndTypeVars(unwrapped, globalType);
		if (isValid(merged)) {
			globalDefTypeCache = merged;
			return globalDefTypeCache;
		}

		// APIレスポンスが期待形でない場合は直 fetch で救済
		const recovered = await fetchDirectDbMeta();
		globalDefTypeCache = recovered;
		return globalDefTypeCache;
	} catch (error) {
		console.warn('⚠️ Failed to fetch global def type:', error.message);
		globalDefTypeCache = await fetchDirectDbMeta();
		return globalDefTypeCache;
	}
}

/**
 * Fetch work-specific type definitions
 * @param {string} workKey - Work key like '#Works_NumberTales'
 * @returns {Promise<Object>} Work-specific type definitions
 */
async function fetchWorkTypeDef(workKey) {
	const normalizedKey = normalizeWorkKey(workKey);

	if (workTypeDefCache.has(normalizedKey)) {
		return workTypeDefCache.get(normalizedKey);
	}

	const w = workKeyForAPI(workKey);
	const u = new URL(api(`v1/works/${encodeURIComponent(w)}/typedef`));
	try {
		const res = await fetchJSON(u.toString());
		console.log('🏢 Work TypeDef response for', workKey, ':', res);
		const typeDef = res.typedef || res || {};
		workTypeDefCache.set(normalizedKey, typeDef);
		return typeDef;
	} catch (error) {
		console.warn('⚠️ Failed to fetch work type def:', workKey, error.message);
		return {};
	}
}/**
 * Apply Commons data from work metadata to character records
 * @param {Array} records - Array of character records
 * @param {Object} workMeta - Work metadata containing Commons data
 * @param {string} dbName - Database name for specific Commons
 * @returns {Array} Records with Commons data applied
 */
function applyCommonsData(records, workMeta, dbName) {
	if (!workMeta || !workMeta.Databases) return records;

	const norm = String(dbName || '').replace(/^#?DB_/i, '');
	const dbKey = norm ? `#DB_${norm.charAt(0).toUpperCase()}${norm.slice(1)}` : '';
	const dbMeta = workMeta.Databases[dbKey];
	if (!dbMeta) return records;

	const commons = dbMeta._Commons || null;
	const secDefs = dbMeta._Secondaries || dbMeta.Secondaries || null;

	// SW 側の CommonsProcessor と同等の「空値」判定に寄せる
	// - undefined/null/空文字/空配列/空オブジェクトは未設定扱い
	// - { hideText: '...' } は意図的マスクなので空扱いしない
	const isEmptyForCommons = (v) => {
		if (v === null || typeof v === 'undefined') return true;
		if (v === '') return true;
		if (Array.isArray(v)) return v.length === 0;
		if (v && typeof v === 'object' && !Array.isArray(v)) {
			if (typeof v.hideText === 'string' && v.hideText) return false;
			return Object.keys(v).length === 0;
		}
		return false;
	};

	return records.map(record => {
		const enriched = { ...record };

		// Secondary系: sec_SeriesTitle（等）で _Secondaries[] を参照し、シリーズ別の _Commons を適用
		// - def側の値が null/undefined/'' の場合は「条件なし」とみなす
		const findSecondaryCommons = () => {
			if (!Array.isArray(secDefs)) return null;

			const normStr = (v) => (v === null || typeof v === 'undefined') ? '' : String(v);
			const getDef = (def, keys) => {
				for (const k of keys) {
					if (!k) continue;
					if (Object.prototype.hasOwnProperty.call(def, k)) return def[k];
				}
				return undefined;
			};

			const criteriaDefs = [
				{
					primary: true,
					defKeys: ['sec_SeriesTitle', 'SecondarySeriesTitle'],
					recKeys: ['sec_SeriesTitle', 'SecondarySeriesTitle']
				},
				{
					primary: false,
					defKeys: ['sec_Category', 'SecondaryCategory'],
					recKeys: ['sec_Category', 'SecondaryCategory']
				},
				{
					primary: false,
					defKeys: ['sec_DesignedBy', 'SecondaryDesignedBy'],
					recKeys: ['sec_DesignedBy', 'SecondaryDesignedBy']
				}
			];

			const hasSpecifiedSecondaryCondition = (def) => criteriaDefs.some((c) => {
				const defVal = getDef(def, c.defKeys);
				return !(defVal === null || typeof defVal === 'undefined' || normStr(defVal).trim() === '');
			});

			let defaultSecondaryDef = null;
			let best = null;
			let bestScore = -1;

			for (const def of secDefs) {
				if (!def || typeof def !== 'object') continue;
				if (!def._Commons || typeof def._Commons !== 'object') continue;

				if (!hasSpecifiedSecondaryCondition(def)) {
					if (defaultSecondaryDef === null) defaultSecondaryDef = def;
					continue;
				}

				const hasPrimaryCondition = (() => {
					const primaryCriteria = criteriaDefs.find((c) => c.primary);
					if (!primaryCriteria) return false;
					const defVal = getDef(def, primaryCriteria.defKeys);
					if (defVal === null || typeof defVal === 'undefined') return false;
					return normStr(defVal).trim() !== '';
				})();

				let score = 0;
				let ok = true;
				for (const c of criteriaDefs) {
					const defVal = getDef(def, c.defKeys);
					if (defVal === null || typeof defVal === 'undefined' || normStr(defVal).trim() === '') continue;

					const recVal = c.recKeys.map(k => enriched[k]).find(v => v !== null && typeof v !== 'undefined');
					if (c.primary) {
						if (normStr(recVal) !== normStr(defVal)) {
							ok = false;
							break;
						}
						score += 10;
						continue;
					}

					const recEmpty = recVal === null || typeof recVal === 'undefined' || normStr(recVal).trim() === '';
					if (hasPrimaryCondition) {
						if (recEmpty) continue;
						if (normStr(recVal) !== normStr(defVal)) {
							ok = false;
							break;
						}
						score += 1;
						continue;
					}

					if (recEmpty || normStr(recVal) !== normStr(defVal)) {
						ok = false;
						break;
					}
					score += 1;
				}
				if (!ok) continue;

				if (score > bestScore) {
					bestScore = score;
					best = def;
				}
			}
			return best || defaultSecondaryDef;
		};

		const matchedSecondaryDef = findSecondaryCommons();
		const secDefaults = matchedSecondaryDef?._Commons || null;
		const defaults = { ...(commons || {}), ...(secDefaults || {}) };

		// Apply Commons values for missing fields
		Object.entries(defaults).forEach(([key, value]) => {
			// メタ定義（#List_* 等）や制御キー（_ListLinkIf_* 等）は、レコード値として混入させない
			// - SW 側の CommonsProcessor と同じ安全側ルール
			if (String(key).startsWith('#') || String(key).startsWith('_')) return;
			if (typeof enriched[key] === 'undefined' || isEmptyForCommons(enriched[key])) {
				enriched[key] = value;
			}
		});

		['sec_Category', 'sec_DesignedBy'].forEach((key) => {
			const metaValue = matchedSecondaryDef?.[key];
			if (typeof metaValue === 'undefined' || metaValue === null || String(metaValue).trim() === '') return;
			if (typeof enriched[key] === 'undefined' || isEmptyForCommons(enriched[key])) {
				enriched[key] = metaValue;
			}
		});

		return enriched;
	});
}

export function __applyCharactersCommonsForTest(records, workMeta, dbName) {
	return applyCommonsData(records, workMeta, dbName);
}

/**
 * 作品ごとの Index 定義を取得
 * - 既定: work typedef（db_type.json）の `$IndexDef`
 * - 後方互換: global meta（data/db_meta.json）の `$DefType_Index` / `$Def_Index`
 * @param {string} workKey - Work identifier
 * @param {Object} globalMeta - Global metadata object
 * @returns {Object|null} Index field definition or null
 */
function getWorkIndexField(workKey, globalMeta) {
	try {
		const state = window.__CHAR_STATE__;
		if (state && state.workId === workKey) {
			const wtd = state.workTypeDef;
			if (wtd && typeof wtd === 'object' && wtd.$IndexDef && typeof wtd.$IndexDef === 'object') {
				return wtd.$IndexDef;
			}
		}
	} catch {
		// noop
	}

	if (!globalMeta || !globalMeta.CreationWorks) return null;
	const workMeta = globalMeta.CreationWorks[workKey];
	if (!workMeta) return null;
	return workMeta.$DefType_Index || workMeta.$Def_Index || null;
}

/**
 * Index 定義からラベルを取得
 * @param {Object} def - $IndexDef もしくはその子要素
 * @returns {string} 表示用ラベル（日本語優先）
 */
function getIndexLabel(def) {
	if (!def || typeof def !== 'object') return '';
	const lang = getCurrentPageLanguage();
	if (lang === 'en') {
		return (
			def.hashTagName_EN ||
			def.hashTag_EN ||
			def.hashtag_EN ||
			def.hashTagName_JP ||
			def.hashTag_JP ||
			def.hashtag_JP ||
			def.hashTag ||
			''
		);
	}
	return (
		def.hashTagName_JP ||
		def.hashTag_JP ||
		def.hashtag_JP ||
		def.hashTag_EN ||
		def.hashtag_EN ||
		def.hashTagName_EN ||
		def.hashTag ||
		''
	);
}

/**
 * Index 定義から子フィールド定義配列を取得（$type / $valType の揺れを吸収）
 * @param {Object} indexDef - $IndexDef
 * @returns {Array|null}
 */
function getIndexSubDefs(indexDef) {
	if (!indexDef || typeof indexDef !== 'object') return null;
	if (Array.isArray(indexDef.$type)) return indexDef.$type;
	if (Array.isArray(indexDef.$valType)) return indexDef.$valType;
	return null;
}

/**
 * Index 定義から「主要」サブフィールドを推定
 * - typedef の $type から #Number/#ListIndex を優先
 * @param {Array} subDefs - indexDef.$type の配列
 * @returns {Object|null}
 */
function pickPrimaryIndexSubDef(subDefs) {
	if (!Array.isArray(subDefs) || subDefs.length === 0) return null;

	const score = (d) => {
		if (!d || typeof d !== 'object') return -1;
		const t = d.$type ?? d.$valType;
		const tStr = typeof t === 'string' ? t : JSON.stringify(t);
		if (tStr && tStr.includes('#Number')) return 30;
		if (tStr && tStr.includes('#ListIndex')) return 20;
		if (tStr && tStr.includes('#String')) return 10;
		return 0;
	};

	return subDefs
		.filter(d => d && typeof d === 'object' && typeof d.hashTag === 'string')
		.slice()
		.sort((a, b) => score(b) - score(a))[0] || null;
}

/**
 * Index サブフィールドの $display.index 設定を正規化
 * - 未指定時は「一覧/直リンク=主要要素のみ」「詳細/値表示=全要素」を既定にする
 * @param {Object|null} subDef - $IndexDef.$type[] の要素
 * @param {boolean} isPrimary - 既定の主要サブフィールドかどうか
 * @returns {{list:boolean,detail:boolean,value:boolean,link:boolean,priority:number,order:number|null}}
 */
function getIndexSubDefDisplayConfig(subDef, isPrimary = false) {
	const defaults = {
		list: isPrimary,
		detail: true,
		value: true,
		link: isPrimary,
		priority: isPrimary ? 100 : 0,
		order: null,
	};

	const raw = subDef?.$display?.index;
	if (raw === null || raw === undefined) return defaults;

	if (typeof raw === 'boolean') {
		return {
			...defaults,
			list: raw,
			detail: raw,
			value: raw,
			link: raw,
		};
	}

	if (typeof raw === 'string') {
		const token = raw.trim().toLowerCase();
		if (!token) return defaults;
		if (token === 'all') {
			return { ...defaults, list: true, detail: true, value: true, link: true };
		}
		if (token === 'detail') {
			return { ...defaults, list: false, detail: true, value: true, link: false };
		}
		if (token === 'list') {
			return { ...defaults, list: true, detail: false, value: false, link: false };
		}
		if (token === 'link') {
			return { ...defaults, list: false, detail: false, value: false, link: true };
		}
		if (token === 'none' || token === 'hidden' || token === 'off') {
			return { ...defaults, list: false, detail: false, value: false, link: false };
		}
		return defaults;
	}

	if (!isPlainObject(raw)) return defaults;

	const pickBool = (keys, fallback) => {
		for (const key of keys) {
			if (typeof raw?.[key] === 'boolean') return raw[key];
		}
		return fallback;
	};

	const priority = Number.isFinite(raw?.priority)
		? Number(raw.priority)
		: defaults.priority;
	const order = Number.isFinite(raw?.order)
		? Number(raw.order)
		: defaults.order;

	return {
		list: pickBool(['list', 'chip'], defaults.list),
		detail: pickBool(['detail', 'header'], defaults.detail),
		value: pickBool(['value', 'field'], defaults.value),
		link: pickBool(['link'], defaults.link),
		priority,
		order,
	};
}

/**
 * Index 値を列挙して、表示/直リンク/検索で共用できる形に揃える
 * @param {Object} source - レコードまたは index 値
 * @param {Object|null} indexDef - $IndexDef
 * @param {Object|null} metaForLookup - 表示辞書
 * @param {Object|null} globalDefType - グローバル typedef
 * @param {{context?:'record'|'value', preferKeyPath?:string}} [options]
 * @returns {Array<{keyPath:string,value:string,text:string,label:string,contexts:Object,priority:number,order:number,index:number}>}
 */
function collectIndexEntries(source, indexDef, metaForLookup = null, globalDefType = null, options = {}) {
	if (!source || typeof source !== 'object') return [];
	if (!indexDef || typeof indexDef !== 'object') return [];

	const rootKey = typeof indexDef.hashTag === 'string' ? indexDef.hashTag.trim() : '';
	if (!rootKey) return [];

	const preferKeyPath = typeof options?.preferKeyPath === 'string' ? options.preferKeyPath.trim() : '';
	const rootType = indexDef?.$type ?? indexDef?.$valType ?? null;
	const subDefs = getIndexSubDefs(indexDef);
	const primarySub = Array.isArray(subDefs) && subDefs.length > 0 ? pickPrimaryIndexSubDef(subDefs) : null;
	const context = options?.context === 'value' ? 'value' : 'record';

	const sortEntries = (entries) => entries
		.slice()
		.sort((a, b) => {
			const preferA = preferKeyPath && a.keyPath === preferKeyPath ? 1 : 0;
			const preferB = preferKeyPath && b.keyPath === preferKeyPath ? 1 : 0;
			if (preferA !== preferB) return preferB - preferA;
			if (a.priority !== b.priority) return b.priority - a.priority;
			const orderA = Number.isFinite(a.order) ? a.order : Number.POSITIVE_INFINITY;
			const orderB = Number.isFinite(b.order) ? b.order : Number.POSITIVE_INFINITY;
			if (orderA !== orderB) return orderA - orderB;
			return a.index - b.index;
		});

	if (Array.isArray(subDefs) && subDefs.length > 0) {
		const sourceRoot = context === 'value'
			? (isPlainObject(source?.[rootKey]) ? source[rootKey] : source)
			: source?.[rootKey];
		const rootObj = isPlainObject(sourceRoot) ? sourceRoot : null;
		if (!rootObj) return [];

		const entries = subDefs
			.map((subDef, index) => {
				const subKey = typeof subDef?.hashTag === 'string' ? subDef.hashTag.trim() : '';
				if (!subKey) return null;
				const leaf = rootObj[subKey];
				if (leaf === null || leaf === undefined || leaf === '') return null;

				const subType = subDef?.$type ?? subDef?.$valType ?? null;
				const formatted = formatValueForDisplay(leaf, {}, metaForLookup, globalDefType, {
					schemaType: subType,
					fieldKey: `${rootKey}.${subKey}`
				});
				const text = String(formatted ?? '').trim();
				if (!text) return null;

				const label = getIndexLabel(subDef) || getIndexLabel(indexDef) || '';
				const display = getIndexSubDefDisplayConfig(subDef, subDef === primarySub);
				return {
					keyPath: `${rootKey}.${subKey}`,
					value: text,
					text: label ? `${label}: ${text}` : text,
					label,
					contexts: {
						list: display.list,
						detail: display.detail,
						value: display.value,
						link: display.link,
					},
					priority: display.priority,
					order: display.order,
					index,
				};
			})
			.filter(Boolean);

		return sortEntries(entries);
	}

	const rawValue = context === 'value'
		? (source?.[rootKey] === null || source?.[rootKey] === undefined || source?.[rootKey] === '' ? source : source?.[rootKey])
		: (source?.[rootKey] === null || source?.[rootKey] === undefined || source?.[rootKey] === '' ? source?.Num : source?.[rootKey]);
	const formatted = formatValueForDisplay(rawValue, {}, metaForLookup, globalDefType, {
		schemaType: rootType,
		fieldKey: rootKey
	});
	const text = String(formatted ?? '').trim();
	if (!text) return [];

	const label = getIndexLabel(indexDef) || '';
	return [{
		keyPath: rootKey,
		value: text,
		text: label ? `${label}: ${text}` : text,
		label,
		contexts: { list: true, detail: true, value: true, link: true },
		priority: 100,
		order: null,
		index: 0,
	}];
}

/**
 * レコードと Index 定義から、直リンク用の識別子（keyPath + value）を抽出
 * @param {Object} rec - レコード
 * @param {Object|null} indexDef - $IndexDef
 * @returns {{keyPath:string,value:string}|null}
 */
function getIndexIdentifierFromRecord(rec, indexDef) {
	const entries = collectIndexEntries(rec, indexDef, null, null, { context: 'record' });
	if (!entries.length) return null;
	return entries.find(entry => entry?.contexts?.link) || entries[0] || null;
}

/**
 * 直リンククエリ（idx/idxKey/num）に一致するかどうか
 * @param {Object} rec - レコード
 * @param {Object|null} indexDef - $IndexDef
 * @param {string} idxValue - クエリの値
 * @param {string} idxKeyPath - クエリのキー（任意）
 * @param {string} legacyNum - 旧 ?num= の値（任意）
 * @returns {boolean}
 */
function recordMatchesIndexQuery(rec, indexDef, idxValue, idxKeyPath, legacyNum = '') {
	const qVal = String(idxValue || '').trim();
	if (!qVal) {
		const legacy = String(legacyNum || '').trim();
		if (!legacy) return false;
		return rec && rec.Num != null && String(rec.Num) === legacy;
	}

	const entries = collectIndexEntries(rec, indexDef, null, null, {
		context: 'record',
		preferKeyPath: idxKeyPath,
	});
	if (entries.length) {
		return entries.some((entry) => {
			if (idxKeyPath && entry.keyPath !== idxKeyPath) return false;
			return String(entry.value) === qVal;
		});
	}

	// indexDef が無い場合の最小互換（NumberTales の ?num= など）
	return rec && rec.Num != null && String(rec.Num) === qVal;
}

/**
 * レコードと Index 定義から、一覧用のアクセントチップ文字列を生成
 * @param {Object} rec - レコード
 * @param {Object|null} indexDef - $IndexDef
 * @returns {string|null}
 */
function buildIndexChipText(rec, indexDef, metaForLookup = null, globalDefType = null) {
	const entries = collectIndexEntries(rec, indexDef, metaForLookup, globalDefType, { context: 'record' })
		.filter(entry => entry?.contexts?.list);
	return entries[0]?.text || null;
}

/**
 * レコードと Index 定義から、一覧/詳細表示用の複数インデックス項目を生成
 * @param {Object} rec - レコード
 * @param {Object|null} indexDef - $IndexDef
 * @param {Object|null} metaForLookup - 表示辞書
 * @param {Object|null} globalDefType - グローバル typedef
 * @param {'list'|'detail'} [context='list'] - 表示コンテキスト
 * @returns {Array<{keyPath:string,value:string,text:string,contexts:Object}>}
 */
function buildIndexChipItems(rec, indexDef, metaForLookup = null, globalDefType = null, context = 'list') {
	const targetContext = context === 'detail' ? 'detail' : 'list';
	return collectIndexEntries(rec, indexDef, metaForLookup, globalDefType, { context: 'record' })
		.filter(entry => entry?.contexts?.[targetContext]);
}

/**
 * Enhanced dynamic image field extraction from type definitions
 * Supports comprehensive image field detection across all works
 * @param {Array|Object} workTypeDef - Work-specific type definitions
 * @param {Object} globalTypeDef - Global type definitions from ./data/db_type.json
 * @returns {Array} Array of image field specs like [{field: 'concept_PNGName', type: '#PNGFileName', label: '設定原画', category: 'concept', priority: 1}]
 */
function extractImageFields(workTypeDef, globalTypeDef = {}) {
	const imageFields = [];
	const processedFields = new Set(); // Avoid duplicates

	console.log('🖼️ Enhanced image field extraction:', { workTypeDef, globalTypeDef });

	// Image field categorization for better organization
	const getImageCategory = (fieldName, type) => {
		const field = fieldName.toLowerCase();

		// より具体的なマッチングを優先（cardDesign_PNGNameがcardカテゴリになるように）
		if (field.includes('carddesign')) return { category: 'card', priority: 2 };
		if (field.includes('conceptalt')) return { category: 'concept', priority: 1 };
		if (field.includes('designalt')) return { category: 'design', priority: 2 };

		// 一般的なマッチング
		if (field.includes('concept')) return { category: 'concept', priority: 1 };
		if (field.includes('design')) return { category: 'design', priority: 2 };
		if (field.includes('arts') || field.includes('art')) return { category: 'arts', priority: 3 };
		if (field.includes('card')) return { category: 'card', priority: 2 };
		if (field.includes('catalog')) return { category: 'catalog', priority: 4 };
		if (field.includes('core')) return { category: 'core', priority: 2 };
		if (field.includes('general')) return { category: 'general', priority: 5 };
		return { category: 'other', priority: 6 };
	};

	// Enhanced image type detection
	const isImageField = (fieldName, type) => {
		if (!fieldName || !type) return false;
		const field = fieldName.toLowerCase();
		const typeStr = String(type).toLowerCase();

		// Direct image type indicators
		if (typeStr.includes('png') || typeStr.includes('jpg') || typeStr.includes('jpeg') ||
			typeStr.includes('gif') || typeStr.includes('webp') || typeStr.includes('image') ||
			typeStr.includes('photo') || typeStr.includes('picture')) return true;

		// Field name indicators
		if (field.includes('image') || field.includes('img') || field.includes('png') ||
			field.includes('photo') || field.includes('picture') || field.includes('poster') ||
			field.includes('concept') || field.includes('design') || field.includes('arts') ||
			field.includes('card') || field.includes('catalog')) return true;

		return false;
	};

	const traverse = (items, path = [], source = '') => {
		if (!Array.isArray(items)) return;

		for (const item of items) {
			if (!item || typeof item !== 'object') continue;

			const currentPath = [...path];
			if (item.hashTag) currentPath.push(item.hashTag);

			// Process Images container
			if (item.hashTag === 'Images' && Array.isArray(item.$type)) {
				console.log(`🎯 Found ${item.hashTag} container (${source}):`, item.$type);
				for (const child of item.$type) {
					if (child.hashTag && !processedFields.has(child.hashTag)) {
						const { category, priority } = getImageCategory(child.hashTag, child.$type);
						const jpLabel = child.hashTag_JP || child.hashtag_JP || '';
						const enLabel = child.hashTag_EN || child.hashtag_EN || '';
						const fieldSpec = {
							field: child.hashTag,
							type: child.$type || '#PNGFileName',
							labelJP: jpLabel || child.hashTag,
							labelEN: enLabel || jpLabel || child.hashTag,
							label: jpLabel || enLabel || child.hashTag,
							path: ['Images', child.hashTag],
							folderHint: inferImageFolderHint(child.hashTag),
							category,
							priority,
							source
						};
						imageFields.push(fieldSpec);
						processedFields.add(child.hashTag);
						console.log(`✅ Added image field (${source}):`, fieldSpec);
					}
				}
			}
			// Process standalone image fields
			else if (item.hashTag && isImageField(item.hashTag, item.$type) && !processedFields.has(item.hashTag)) {
				const { category, priority } = getImageCategory(item.hashTag, item.$type);
				const jpLabel = item.hashTag_JP || item.hashtag_JP || '';
				const enLabel = item.hashTag_EN || item.hashtag_EN || '';
				const fieldSpec = {
					field: item.hashTag,
					type: item.$type,
					labelJP: jpLabel || item.hashTag,
					labelEN: enLabel || jpLabel || item.hashTag,
					label: jpLabel || enLabel || item.hashTag,
					path: currentPath,
					folderHint: inferImageFolderHint(item.hashTag),
					category,
					priority,
					source
				};
				imageFields.push(fieldSpec);
				processedFields.add(item.hashTag);
				console.log(`✅ Added standalone image field (${source}):`, fieldSpec);
			}
			// Recursively process nested structures
			else if (Array.isArray(item.$type)) {
				traverse(item.$type, currentPath, source);
			}
		}
	};

	// Process global type definitions first (lower priority)
	if (globalTypeDef && globalTypeDef.$DefType) {
		console.log('🌐 Processing global type definitions...');
		traverse(globalTypeDef.$DefType, [], 'global');
	} else if (globalTypeDef && globalTypeDef.global) {
		console.log('🌐 Processing global typedef response...');
		traverse(globalTypeDef.global, [], 'global');
	}

	// Process work-specific definitions (higher priority, will override)
	if (Array.isArray(workTypeDef)) {
		console.log('� Processing work type definitions (array)...');
		traverse(workTypeDef, [], 'work');
	} else if (workTypeDef && workTypeDef.typedef) {
		console.log('� Processing work typedef.typedef...');
		traverse(workTypeDef.typedef, [], 'work');
	} else if (workTypeDef && workTypeDef.$DefType) {
		console.log('🏢 Processing work $DefType...');
		traverse(workTypeDef.$DefType, [], 'work');
	}

	// Sort by priority and category for better organization
	imageFields.sort((a, b) => {
		if (a.priority !== b.priority) return a.priority - b.priority;
		return a.field.localeCompare(b.field);
	});

	console.log('🖼️ Final extracted image fields:', imageFields);
	return imageFields;
}

/**
 * Build comprehensive field label mapping from global and work-specific type definitions
 * @param {Array|Object} workTypeDef - Work-specific type definitions
 * @param {Object} globalTypeDef - Global type definitions from ./data/db_type.json
 * @returns {Object} Mapping of field names to Japanese labels
 */
function buildFieldLabelMap(workTypeDef, globalTypeDef = {}) {
	const labelMap = {};
	const mergeLabel = (key, jpLabel, enLabel) => {
		if (!key) return;
		const jp = (typeof jpLabel === 'string' && jpLabel.trim()) ? jpLabel.trim() : '';
		const en = (typeof enLabel === 'string' && enLabel.trim()) ? enLabel.trim() : '';

		if (jp) {
			labelMap[key] = jp;
		} else if (!labelMap[key] && en) {
			labelMap[key] = en;
		}

		if (en) {
			labelMap[`__en__${key}`] = en;
		}
	};

	console.log('🏷️ Building field label map:', {
		globalTypeDef: globalTypeDef,
		workTypeDef: workTypeDef
	});

	const traverse = (items, path = [], source = '') => {
		if (!Array.isArray(items)) return;

		for (const item of items) {
			if (!item || typeof item !== 'object') continue;

			const currentPath = item.hashTag ? [...path, item.hashTag] : path;

			// Map this field if it has a Japanese label
			const jpLabel = item.hashTag_JP || item.hashtag_JP;
			const enLabel = item.hashTag_EN || item.hashtag_EN;
			if (item.hashTag && (jpLabel || enLabel)) {
				mergeLabel(item.hashTag, jpLabel, enLabel);
				mergeLabel(currentPath.join('.'), jpLabel, enLabel);

				console.log(`📝 Mapped field (${source}):`, item.hashTag, '→', jpLabel);

				// Also map short path versions for nested access
				if (currentPath.length > 1) {
					mergeLabel(currentPath.slice(-1)[0], jpLabel, enLabel);
				}
			}

			// Recursively process nested fields
			if (Array.isArray(item.$type)) {
				traverse(item.$type, currentPath, source);
			} else if (item.$type && typeof item.$type === 'object' && !Array.isArray(item.$type)) {
				// Handle single nested objects
				traverse([item.$type], currentPath, source);
			}
		}
	};

	// First process global type definitions (lower priority)
	if (globalTypeDef && globalTypeDef.global) {
		console.log('🌐 Processing global typedef:', globalTypeDef.global);
		traverse(globalTypeDef.global, [], 'global');
	} else if (globalTypeDef && globalTypeDef.$DefType) {
		console.log('🌐 Processing global $DefType:', globalTypeDef.$DefType);
		traverse(globalTypeDef.$DefType, [], 'global');
	}

	// Then process work-specific definitions (higher priority, will override)
	if (Array.isArray(workTypeDef)) {
		console.log('🏢 Processing work typedef array:', workTypeDef);
		traverse(workTypeDef, [], 'work');
	} else if (workTypeDef && workTypeDef.typedef) {
		console.log('🏢 Processing work typedef.typedef:', workTypeDef.typedef);
		traverse(workTypeDef.typedef, [], 'work');
	} else if (workTypeDef && workTypeDef.$DefType) {
		console.log('🏢 Processing work $DefType:', workTypeDef.$DefType);
		traverse(workTypeDef.$DefType, [], 'work');
	}

	// EN ラベル逆引き補完:
	// hashTag_JP のみで hashTag_EN を持たないエントリに対して、
	// 同名の _EN 兄弟エントリ（FormalName_EN など）の EN ラベルを逆引きして補完する
	for (const key of Object.keys(labelMap)) {
		if (key.startsWith('__en__')) continue;
		if (labelMap[`__en__${key}`]) continue; // 既に EN ラベルがある
		const enSiblingEnLabel = labelMap[`__en__${key}_EN`];
		if (enSiblingEnLabel && typeof enSiblingEnLabel === 'string') {
			labelMap[`__en__${key}`] = enSiblingEnLabel;
		}
	}

	console.log('🏷️ Final label map:', labelMap);
	return labelMap;
}

/**
 * typedef（db_type.json）から、フィールドパス→$type（文字列）のマップを構築
 * - 表示整形を「フィールド名ハードコード」ではなく「定義型（$EnumDef_* / $Def_*）」に寄せるための補助
 * - work 定義を優先し、同一キーは global を上書きしない
 * @param {Array|Object} workTypeDef - 作品ごとの typedef
 * @param {Object} globalTypeDef - グローバル typedef
 * @returns {Record<string, string>}
 */
function buildFieldTypeMap(workTypeDef, globalTypeDef = {}) {
	/** @type {Record<string, string>} */
	const typeMap = {};

	const pickDefArray = (def) => {
		if (!def) return null;
		if (Array.isArray(def)) return def;
		if (Array.isArray(def?.$DefType)) return def.$DefType;
		if (Array.isArray(def?.typedef?.$DefType)) return def.typedef.$DefType;
		if (Array.isArray(def?.global)) return def.global;
		return null;
	};

	const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
	const normalizeTypeText = (t) => (typeof t === 'string' ? t.trim() : '');

	// 優先度: work → global（同一キーは上書きしない）
	const addFrom = (def) => {
		const arr = pickDefArray(def);
		if (!Array.isArray(arr)) return;

		// traverse が typeMap を直接書くので、上書き抑止のために一時マップで受けて merge
		/** @type {Record<string, string>} */
		const tmp = {};
		// 一時的に tmp を書き込み先にする
		// eslint-disable-next-line no-inner-declarations
		const traverseTmp = (items, path = []) => {
			if (!Array.isArray(items)) return;
			for (const item of items) {
				if (!isPlainObject(item)) continue;
				if (!item.hashTag || typeof item.hashTag !== 'string') continue;
				const currentPath = [...path, item.hashTag];
				const t = normalizeTypeText(item.$type);
				if (t) {
					const full = currentPath.join('.');
					if (!Object.prototype.hasOwnProperty.call(tmp, full)) tmp[full] = t;
					if (!Object.prototype.hasOwnProperty.call(tmp, item.hashTag)) tmp[item.hashTag] = t;
				}

				// ラッパー型（例: ExistingRarity: [{hashTag:'Rarity', $type:'$EnumDef_Rarity,$EnumLink'}]）を検出
				// - トップレベル自動表示でも enum/link 判定できるよう、親キーにも子の $type 文字列を付与する
				if (Array.isArray(item.$type) && item.$type.length === 1) {
					const child = item.$type[0];
					const childType = normalizeTypeText(child?.$type);
					if (child && typeof child?.hashTag === 'string' && childType) {
						const full = currentPath.join('.');
						if (!Object.prototype.hasOwnProperty.call(tmp, full)) tmp[full] = childType;
						if (!Object.prototype.hasOwnProperty.call(tmp, item.hashTag)) tmp[item.hashTag] = childType;
					}
				}
				if (Array.isArray(item.$type)) traverseTmp(item.$type, currentPath);
				else if (isPlainObject(item.$type)) traverseTmp([item.$type], currentPath);
			}
		};
		traverseTmp(arr, []);

		// merge（既存を上書きしない）
		for (const [k, v] of Object.entries(tmp)) {
			if (!Object.prototype.hasOwnProperty.call(typeMap, k)) typeMap[k] = v;
		}
	};

	addFrom(workTypeDef);
	addFrom(globalTypeDef);
	return typeMap;
}

/**
 * typedef（db_type.json）から、フィールドパス→$display（Object）のマップを構築
 * - 値の表示整形（unit / rankFormat 等）を typedef 駆動に寄せるための補助
 * - work 定義を優先し、同一キーは global を上書きしない
 * @param {Array|Object} workTypeDef - 作品ごとの typedef
 * @param {Object} globalTypeDef - グローバル typedef
 * @returns {Record<string, any>}
 */
function buildFieldDisplayMap(workTypeDef, globalTypeDef = {}) {
	/** @type {Record<string, any>} */
	const displayMap = {};

	const pickDefArray = (def) => {
		if (!def) return null;
		if (Array.isArray(def)) return def;
		if (Array.isArray(def?.$DefType)) return def.$DefType;
		if (Array.isArray(def?.typedef?.$DefType)) return def.typedef.$DefType;
		if (Array.isArray(def?.global)) return def.global;
		return null;
	};

	const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

	/**
	 * items（$DefType 由来）を再帰走査して $display を抽出する
	 * @param {any[]} items
	 * @param {string[]} path
	 * @param {Record<string, any>} out
	 * @param {number} depth
	 */
	const traverseDisplayItems = (items, path, out, depth = 0) => {
		if (!Array.isArray(items)) return;
		if (depth > 8) return;
		for (const item of items) {
			if (!isPlainObject(item)) continue;
			if (!item.hashTag || typeof item.hashTag !== 'string') continue;

			const currentPath = [...path, item.hashTag];
			const d = item.$display;
			if (d && typeof d === 'object') {
				const full = currentPath.join('.');
				if (!Object.prototype.hasOwnProperty.call(out, full)) out[full] = d;
				if (!Object.prototype.hasOwnProperty.call(out, item.hashTag)) out[item.hashTag] = d;
			}

			if (Array.isArray(item.$type)) traverseDisplayItems(item.$type, currentPath, out, depth + 1);
			else if (isPlainObject(item.$type)) traverseDisplayItems([item.$type], currentPath, out, depth + 1);
		}
	};

	/**
	* typedef の「型定義コンテナ」（$VarsDef / $VersDef 配下の $Def_* 等）から $display を抽出する
	* - 例: Works_NumberTales の $VersDef.$Def_Relations.$DefType[].$display.langMode
	 * - ここで抽出した値は、少なくとも hashTag キー（例: RelationLabel）で参照できれば十分。
	 * @param {any} def
	 */
	const addFromTypeDefContainers = (def) => {
		if (!def || typeof def !== 'object') return;

		const varsDef = (
			(def.$VarsDef && typeof def.$VarsDef === 'object') ? def.$VarsDef
				: ((def.$VersDef && typeof def.$VersDef === 'object') ? def.$VersDef : null)
		);
		if (!varsDef || typeof varsDef !== 'object') return;

		for (const val of Object.values(varsDef)) {
			if (!val || typeof val !== 'object') continue;
			const typeArr = Array.isArray(val?.$type)
				? val.$type
				: (Array.isArray(val?.$DefType) ? val.$DefType : null);
			if (!Array.isArray(typeArr) || typeArr.length === 0) continue;

			const tmp = {};
			traverseDisplayItems(typeArr, [], tmp);
			for (const [k, v] of Object.entries(tmp)) {
				if (!Object.prototype.hasOwnProperty.call(displayMap, k)) displayMap[k] = v;
			}
		}
	};

	const addFrom = (def) => {
		const arr = pickDefArray(def);
		if (!Array.isArray(arr)) return;

		const tmp = {};
		traverseDisplayItems(arr, [], tmp);
		for (const [k, v] of Object.entries(tmp)) {
			if (!Object.prototype.hasOwnProperty.call(displayMap, k)) displayMap[k] = v;
		}

		// `$DefType` 以外（$VarsDef / $VersDef の型定義コンテナ）も補足
		addFromTypeDefContainers(def);
	};

	addFrom(workTypeDef);
	addFrom(globalTypeDef);
	return displayMap;
}

function getMetaTypeDefinition(globalTypeDef = {}, metaTypeKey = '') {
	const key = String(metaTypeKey || '').trim();
	if (!key) return null;
	const metaTypes = (globalTypeDef && typeof globalTypeDef === 'object' && !Array.isArray(globalTypeDef))
		? globalTypeDef.$MetaType
		: null;
	if (!metaTypes || typeof metaTypes !== 'object' || Array.isArray(metaTypes)) return null;
	const def = metaTypes[key];
	if (!def || typeof def !== 'object' || Array.isArray(def)) return null;
	if (!Array.isArray(def.$DefType)) return null;
	return def;
}

function buildMetaTypeFieldContext(globalTypeDef = {}, metaTypeKey = '') {
	const schema = getMetaTypeDefinition(globalTypeDef, metaTypeKey);
	const fields = Array.isArray(schema?.$DefType) ? schema.$DefType : [];
	if (!fields.length) {
		return {
			schema: null,
			fields: [],
			labelMap: {},
			typeMap: {},
			displayMap: {}
		};
	}

	const wrapper = { $DefType: fields };
	return {
		schema,
		fields,
		labelMap: buildFieldLabelMap(wrapper, {}),
		typeMap: buildFieldTypeMap(wrapper, {}),
		displayMap: buildFieldDisplayMap(wrapper, {})
	};
}

/**
 * db_type.json($DefType) から、トップレベルのフィールド定義（順序付き）を抽出
 * - work の定義を優先し、同名フィールドは global を追加しない
 * - Images コンテナは除外（ギャラリー処理が担当）
 * @param {Object|Array} workTypeDef - 作品ごとの typedef（/v1/works/{work}/typedef）
 * @param {Object|Array} globalTypeDef - グローバル typedef（/v1/typedef/global）
 * @returns {Array<{key:string,label:string,type:any,display:any,source:string}>}
 */
function extractTopLevelSchemaFields(workTypeDef, globalTypeDef = {}, options = {}) {
	const out = [];
	const seen = new Set();

	const isSecondary = (() => {
		if (typeof options?.isSecondary === 'boolean') return options.isSecondary;
		if (typeof options?.dbName === 'string') return isSecondaryDbName(options.dbName);
		return null;
	})();

	const pickDefArray = (def) => {
		if (!def) return null;
		if (Array.isArray(def)) return def;
		if (Array.isArray(def?.$DefType)) return def.$DefType;
		if (Array.isArray(def?.typedef?.$DefType)) return def.typedef.$DefType;
		if (Array.isArray(def?.global)) return def.global;
		return null;
	};

	const addFrom = (def, source) => {
		const arr = pickDefArray(def);
		if (!Array.isArray(arr)) return;

		for (const item of arr) {
			if (!item || typeof item !== 'object') continue;
			const key = item.hashTag;
			if (!key || typeof key !== 'string') continue;
			if (key === 'Images') continue;
			if (seen.has(key)) continue;

			// 二次創作向けフィールドの表示切替（isForSecondary）
			// - undefined は「共通扱い」で常に表示
			// - Secondary 文脈: true/undefined を表示、false は非表示
			// - Primary 等の文脈: false/undefined を表示、true は非表示
			if (isSecondary !== null && typeof item.isForSecondary === 'boolean') {
				if (isSecondary && item.isForSecondary === false) continue;
				if (!isSecondary && item.isForSecondary === true) continue;
			}

			const label = item.hashTag_JP || item.hashtag_JP || item.hashTag_EN || item.hashtag_EN || key;
			out.push({
				key,
				label,
				type: item.$type,
				display: item.$display ?? null,
				source
			});
			seen.add(key);
		}
	};

	addFrom(workTypeDef, 'work');
	addFrom(globalTypeDef, 'global');
	return out;
}

/**
 * db_type.json($DefType) からトップレベルの `$display` を抽出してマップ化
 * - work を優先し、同名キーは global を上書きしない
 * - Images コンテナは除外（ギャラリー処理が担当）
 * @param {Object|Array} workTypeDef
 * @param {Object|Array} globalTypeDef
 * @returns {Record<string, any>}
 */
function buildTopLevelDisplayMap(workTypeDef, globalTypeDef = {}) {
	const map = {};

	const pickDefArray = (def) => {
		if (!def) return null;
		if (Array.isArray(def)) return def;
		if (Array.isArray(def?.$DefType)) return def.$DefType;
		if (Array.isArray(def?.typedef?.$DefType)) return def.typedef.$DefType;
		if (Array.isArray(def?.global)) return def.global;
		return null;
	};

	const addFrom = (def) => {
		const arr = pickDefArray(def);
		if (!Array.isArray(arr)) return;
		for (const item of arr) {
			if (!item || typeof item !== 'object') continue;
			const key = item.hashTag;
			if (!key || typeof key !== 'string') continue;
			if (key === 'Images') continue;
			if (Object.prototype.hasOwnProperty.call(map, key)) continue;
			map[key] = item.$display ?? null;
		}
	};

	addFrom(workTypeDef);
	addFrom(globalTypeDef);
	return map;
}

/**
 * db_type.json($DefType) からトップレベルの `$alt` を抽出してマップ化
 * - work を優先し、同名キーは global を上書きしない
 * - Images コンテナは除外（ギャラリー処理が担当）
 * @param {Object|Array} workTypeDef
 * @param {Object|Array} globalTypeDef
 * @returns {Record<string, string[]>}
 */
function buildTopLevelAltMap(workTypeDef, globalTypeDef = {}) {
	const map = {};

	const pickDefArray = (def) => {
		if (!def) return null;
		if (Array.isArray(def)) return def;
		if (Array.isArray(def?.$DefType)) return def.$DefType;
		if (Array.isArray(def?.typedef?.$DefType)) return def.typedef.$DefType;
		if (Array.isArray(def?.global)) return def.global;
		return null;
	};

	const normalizeAlt = (alt) => {
		if (!alt) return [];
		if (typeof alt === 'string') return [alt];
		if (Array.isArray(alt)) return alt.filter(x => typeof x === 'string');
		return [];
	};

	const addFrom = (def) => {
		const arr = pickDefArray(def);
		if (!Array.isArray(arr)) return;
		for (const item of arr) {
			if (!item || typeof item !== 'object') continue;
			const key = item.hashTag;
			if (!key || typeof key !== 'string') continue;
			if (key === 'Images') continue;
			if (Object.prototype.hasOwnProperty.call(map, key)) continue;
			const alts = normalizeAlt(item.$alt);
			if (alts.length) map[key] = alts;
		}
	};

	addFrom(workTypeDef);
	addFrom(globalTypeDef);
	return map;
}

/**
 * db_type.json($DefType) からトップレベルの「別名（aliasOf）」定義を抽出してマップ化
 * - `$display.aliasOf` で指定されたキーに対し、「別名側キー」を紐づける
 * - 例: CodeName.$display.aliasOf === 'ModelName' → { ModelName: ['CodeName'] }
 * - work を優先し、同名キーは global を上書きしない
 * - Images コンテナは除外（ギャラリー処理が担当）
 * @param {Object|Array} workTypeDef
 * @param {Object|Array} globalTypeDef
 * @returns {Record<string, string[]>}
 */
function buildTopLevelAliasMap(workTypeDef, globalTypeDef = {}) {
	/** @type {Record<string, string[]>} */
	const map = {};

	const pickDefArray = (def) => {
		if (!def) return null;
		if (Array.isArray(def)) return def;
		if (Array.isArray(def?.$DefType)) return def.$DefType;
		if (Array.isArray(def?.typedef?.$DefType)) return def.typedef.$DefType;
		if (Array.isArray(def?.global)) return def.global;
		return null;
	};

	const pushUnique = (key, aliasKey) => {
		if (!key || !aliasKey) return;
		if (!Object.prototype.hasOwnProperty.call(map, key)) map[key] = [];
		if (!map[key].includes(aliasKey)) map[key].push(aliasKey);
	};

	const addFrom = (def) => {
		const arr = pickDefArray(def);
		if (!Array.isArray(arr)) return;
		for (const item of arr) {
			if (!item || typeof item !== 'object') continue;
			const aliasKey = item.hashTag;
			if (!aliasKey || typeof aliasKey !== 'string') continue;
			if (aliasKey === 'Images') continue;
			const d = item.$display;
			const baseKey = (d && typeof d === 'object' && typeof d.aliasOf === 'string') ? d.aliasOf.trim() : '';
			if (!baseKey) continue;
			pushUnique(baseKey, aliasKey);
		}
	};

	// work を先に入れて、global は既存キーを上書きしない
	addFrom(workTypeDef);
	const mapKeysBeforeGlobal = new Set(Object.keys(map));
	const globalArr = pickDefArray(globalTypeDef);
	if (Array.isArray(globalArr)) {
		for (const item of globalArr) {
			if (!item || typeof item !== 'object') continue;
			const aliasKey = item.hashTag;
			if (!aliasKey || typeof aliasKey !== 'string') continue;
			if (aliasKey === 'Images') continue;
			const d = item.$display;
			const baseKey = (d && typeof d === 'object' && typeof d.aliasOf === 'string') ? d.aliasOf.trim() : '';
			if (!baseKey) continue;
			if (mapKeysBeforeGlobal.has(baseKey)) continue;
			pushUnique(baseKey, aliasKey);
		}
	}

	return map;
}

/**
 * Get localized field label from type definitions with global fallback support
 * @param {string} fieldName - Field name like 'Name' or 'GenderType'
 * @param {Object} labelMap - Field label mapping from buildFieldLabelMap
 * @param {Object} workMeta - Work metadata for additional label lookup
 * @param {Object} globalDefType - Global definition types for enum lookups
 * @param {string} fallback - Fallback display name
 * @returns {string} Localized label or fallback
 */
function getFieldLabel(fieldName, labelMap, workMeta = null, globalDefType = null, fallback = null) {
	const pickLocalized = (entry, key = '') => {
		const lang = getCurrentPageLanguage();
		if (lang === 'en' && key) {
			const enKey = `__en__${key}`;
			if (typeof labelMap?.[enKey] === 'string' && labelMap[enKey].trim()) {
				return labelMap[enKey].trim();
			}
			// EN ラベル未定義で JP ラベルが日本語の場合、フィールド名から _JP/_EN サフィックスを除去して英語表記として使う
			const jpEntry = typeof entry === 'string' ? entry : '';
			if (/[぀-ヿ㐀-鿿]/.test(jpEntry)) {
				const cleanKey = String(key || '').replace(/_(JP|EN)$/, '').trim();
				return cleanKey || key;
			}
		}
		return (typeof entry === 'string') ? entry : '';
	};

	// Try exact match first
	if (labelMap[fieldName]) return pickLocalized(labelMap[fieldName], fieldName);

	// Try without path prefixes
	const simpleName = fieldName.split('.').pop();
	if (labelMap[simpleName]) return pickLocalized(labelMap[simpleName], simpleName);

	// Try with common prefixes/suffixes
	const variations = [
		fieldName + '_JP',
		fieldName.replace('_JP', ''),
		fieldName.replace('_EN', ''),
		fieldName.replace('Text', ''),
		fieldName.replace('Type', ''),
		fieldName.replace('Stats', ''),
		fieldName.replace('Level', '')
	];

	for (const variation of variations) {
		if (labelMap[variation]) return pickLocalized(labelMap[variation], variation);
	}

	// Try lookup in global definition types
	if (globalDefType && globalDefType.General && globalDefType.General.$VarsDef) {
		const globalVarsDef = globalDefType.General.$VarsDef;
		const lang = getCurrentPageLanguage();

		// Check enum definitions
		if (globalVarsDef[`$EnumDef_${fieldName}`]) {
			const enumEntry = globalVarsDef[`$EnumDef_${fieldName}`][`#${fieldName}`] || {};
			if (lang === 'en') {
				return enumEntry?.[`${fieldName}_EN`] || enumEntry?.[`${fieldName}_JP`] || fieldName;
			}
			return enumEntry?.[`${fieldName}_JP`] || enumEntry?.[`${fieldName}_EN`] || fieldName;
		}

		// Check list definitions
		if (globalVarsDef[`#List_${fieldName}`]) {
			const listDef = globalVarsDef[`#List_${fieldName}`];
			if (Array.isArray(listDef) && listDef[0] && listDef[0][`${fieldName}_JP`]) {
				return lang === 'en' ? `${fieldName} (multiple)` : `${fieldName}（複数選択可）`;
			}
		}
	}

	// Try lookup in work metadata
	if (workMeta && workMeta.$VarsDef) {
		const varsDef = workMeta.$VarsDef;
		for (const section of Object.values(varsDef)) {
			if (section && typeof section === 'object') {
				for (const subSection of Object.values(section)) {
					if (subSection && Array.isArray(subSection)) {
						for (const item of subSection) {
							if (item && (item.EffectText === fieldName || item.SafetyLevelText === fieldName)) {
								return item.EffectText_JP || item.SafetyLevelText_JP || fieldName;
							}
						}
					}
				}
			}
		}
	}

	// 作品側typedefの揺れでlabelMap未解決でも、主要specStats見出しは既定ラベルを返す
	if (fieldName === 'ArcanumspecStats') return 'アルカナムスペック(アルカナ能力)の特性';

	const fb = String(fallback || fieldName);
	if (getCurrentPageLanguage() === 'en') {
		return /[\u3040-\u30ff\u3400-\u9fff]/.test(fb) ? fieldName : fb;
	}
	return fb;
}

/**
 * db_meta.json の $VarsDef（$EnumDef_* / #List_*）から、カテゴリ値の表示名を解決する
 * - 例: GenderType: 'Female' → '女性'
 * - 例: RaceType: 'Human' → '人間'
 * - 入力が既に *_JP / *_EN の文字列だった場合も、そのまま一致させる
 *
 * @param {string} fieldName - 'GenderType' / 'RaceType' 等
 * @param {any} rawValue - 生の値（プリミティブを想定）
 * @param {Object|null} globalDefType - fetchGlobalDefType() の結果（通常は data/db_meta.json）
 * @param {Object|null} metaForLookup - workMeta/globalMeta を統合した参照用メタ（任意）
 * @returns {string} 表示名（既定は日本語優先、なければ生値）
 */
function resolveVarsDefLabel(fieldName, rawValue, globalDefType = null, metaForLookup = null, fieldKey = null) {
	const fn = String(fieldName || '').trim();
	if (!fn) return '';

	if (rawValue === null || rawValue === undefined || rawValue === '') return '';
	const rv = String(rawValue).trim();
	if (!rv) return '';

	/** @type {any[]} */
	const varsDefRoots = [];

	/**
	 * General 配下の `$Def_*` コンテナも探索対象に含める
	 * - 例: Works_NumberTales の General.$Def_Relations.#List_RelationLabel
	 * @param {any} general
	 */
	const pushGeneralDefContainers = (general) => {
		if (!general || typeof general !== 'object' || Array.isArray(general)) return;
		for (const [k, v] of Object.entries(general)) {
			if (!k || typeof k !== 'string') continue;
			if (!k.startsWith('$Def_')) continue;
			if (!v || typeof v !== 'object') continue;
			varsDefRoots.push(v);
		}
	};

	if (metaForLookup?.General && typeof metaForLookup.General === 'object') {
		if (metaForLookup.General.$VarsDef && typeof metaForLookup.General.$VarsDef === 'object') varsDefRoots.push(metaForLookup.General.$VarsDef);
		pushGeneralDefContainers(metaForLookup.General);
	}
	if (metaForLookup?.$VarsDef && typeof metaForLookup.$VarsDef === 'object') varsDefRoots.push(metaForLookup.$VarsDef);

	// 作品ごとの Commons（Databases 配下）も参照対象に含める
	// - 例: Works_ShouArRiders の Databases.#DB_Primary._Commons.#List_Beast
	if (metaForLookup?.Databases && typeof metaForLookup.Databases === 'object') {
		for (const dbMeta of Object.values(metaForLookup.Databases)) {
			if (!dbMeta || typeof dbMeta !== 'object') continue;
			const commons = dbMeta._Commons;
			if (commons && typeof commons === 'object') varsDefRoots.push(commons);
		}
	}

	if (globalDefType?.General && typeof globalDefType.General === 'object') {
		if (globalDefType.General.$VarsDef && typeof globalDefType.General.$VarsDef === 'object') varsDefRoots.push(globalDefType.General.$VarsDef);
		pushGeneralDefContainers(globalDefType.General);
	}

	// 参照が同一のケースを除外
	const uniqRoots = [];
	for (const r of varsDefRoots) {
		if (!r || typeof r !== 'object') continue;
		if (uniqRoots.includes(r)) continue;
		uniqRoots.push(r);
	}
	if (!uniqRoots.length) return rv;

	const fk = String(fieldKey || '').trim();
	const fkSegs = fk ? fk.split('.').map(s => String(s || '').trim()).filter(Boolean) : [];

	/**
	 * $VarsDef のネストから指定キー（#List_XXX 等）を探索
	 * @param {any} obj
	 * @param {string} key
	 * @param {number} depth
	 * @returns {any}
	 */
	const findNestedKey = (obj, key, depth = 0) => {
		if (!obj || typeof obj !== 'object') return null;
		if (depth > 8) return null;
		if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];

		if (Array.isArray(obj)) {
			for (const it of obj) {
				const found = findNestedKey(it, key, depth + 1);
				if (found) return found;
			}
			return null;
		}

		for (const v of Object.values(obj)) {
			if (!v || typeof v !== 'object') continue;
			const found = findNestedKey(v, key, depth + 1);
			if (found) return found;
		}
		return null;
	};

	/**
	 * fieldKey（schemaPath）を手がかりに `$Def_<Segment>` を辿って「その周辺の VarsDef コンテキスト」を集める
	 * - 例: ArcanumspecStats.SpecType.ActionType.KinematicOrStatic
	 *   → $Def_ArcanumspecStats → $Def_SpecType → $Def_ActionType
	 * @param {any} varsDefRoot
	 * @returns {any[]}
	 */
	const collectVarsDefContexts = (varsDefRoot) => {
		/** @type {any[]} */
		const contexts = [varsDefRoot];
		if (!fkSegs.length) return contexts;
		let cur = varsDefRoot;
		// leaf 自体は $Def を持たないことが多いので、最後は探索対象にしない（Material 等は親に #List がある）
		const upto = Math.max(0, fkSegs.length - 1);
		for (let i = 0; i < upto; i++) {
			const seg = fkSegs[i];
			const key = `$Def_${seg}`;
			if (cur && typeof cur === 'object' && Object.prototype.hasOwnProperty.call(cur, key) && cur[key] && typeof cur[key] === 'object') {
				cur = cur[key];
				contexts.push(cur);
			} else {
				// 途中で切れても、以降は辿れない
				break;
			}
		}
		return contexts;
	};

	const pickLabel = (item) => {
		if (!item || typeof item !== 'object') return '';
		const jp = item[`${fn}_JP`];
		const raw = item[fn];
		const en = item[`${fn}_EN`];
		const labelJp = item[`${fn}Text_JP`];
		const labelRaw = item[`${fn}Text`];
		const labelEn = item[`${fn}Text_EN`];
		if (typeof jp === 'string' && jp.trim()) return jp.trim();
		if (typeof labelJp === 'string' && labelJp.trim()) return labelJp.trim();
		if (typeof labelRaw === 'string' && labelRaw.trim()) return labelRaw.trim();
		if (typeof raw === 'string' && raw.trim()) return raw.trim();
		if (typeof labelEn === 'string' && labelEn.trim()) return labelEn.trim();
		if (typeof en === 'string' && en.trim()) return en.trim();
		return '';
	};

	const pickLabelFlexible = (item, preferredKey) => {
		if (!item || typeof item !== 'object') return '';

		// まずは preferredKey（例: RaceType）ベースで「値が一致する場合のみ」拾う
		const pk = String(preferredKey || '').trim();
		if (pk) {
			const jp = item[`${pk}_JP`];
			const raw = item[pk];
			const en = item[`${pk}_EN`];
			const hit = [jp, raw, en].some(v => (typeof v === 'string' && v.trim() === rv));
			if (hit) {
				if (typeof jp === 'string' && jp.trim()) return jp.trim();
				if (typeof raw === 'string' && raw.trim()) return raw.trim();
				if (typeof en === 'string' && en.trim()) return en.trim();
			}
		}

		// 次に「値が一致するキー」を探索して、その *_JP を返す（例: #List_DualizePattern の Pattern）
		for (const [k, v] of Object.entries(item)) {
			if (!k || typeof k !== 'string') continue;
			if (k.endsWith('_JP') || k.endsWith('_EN')) continue;
			if (k.startsWith('_')) continue;
			if (typeof v !== 'string') continue;
			if (v.trim() !== rv) continue;
			const jp = item[`${k}_JP`];
			if (typeof jp === 'string' && jp.trim()) return jp.trim();
			return v.trim();
		}
		return '';
	};

	for (const varsDef of uniqRoots) {
		if (!varsDef || typeof varsDef !== 'object') continue;

		// $EnumDef_XXX は { '#XXX1': { XXX:'...', XXX_JP:'...' }, ... } 形式
		// - 作品別 meta では $Def_* 配下にネストしているケースがあるため、list と同様に探索する
		const enumKey = `$EnumDef_${fn}`;
		/** @type {any|null} */
		let enumDef = null;

		// context-first
		if (fkSegs.length) {
			const contexts = collectVarsDefContexts(varsDef);
			for (let i = contexts.length - 1; i >= 0; i--) {
				const ctx = contexts[i];
				if (ctx && typeof ctx === 'object' && ctx[enumKey] && typeof ctx[enumKey] === 'object' && !Array.isArray(ctx[enumKey])) {
					enumDef = ctx[enumKey];
					break;
				}
			}
		}
		// direct
		if (!enumDef && varsDef[enumKey] && typeof varsDef[enumKey] === 'object' && !Array.isArray(varsDef[enumKey])) {
			enumDef = varsDef[enumKey];
		}
		// nested fallback
		if (!enumDef) {
			const found = findNestedKey(varsDef, enumKey);
			if (found && typeof found === 'object' && !Array.isArray(found)) enumDef = found;
		}

		if (enumDef && typeof enumDef === 'object') {
			for (const v of Object.values(enumDef)) {
				if (!v || typeof v !== 'object') continue;
				const raw = v[fn];
				const jp = v[`${fn}_JP`];
				const en = v[`${fn}_EN`];
				if ((typeof raw === 'string' && raw.trim() === rv) || (typeof jp === 'string' && jp.trim() === rv) || (typeof en === 'string' && en.trim() === rv)) {
					return pickLabel(v) || rv;
				}
			}
		}

		// #List_XXX は [{ ... }, ...] 形式
		// - work 側では `$Def_*` のネスト配下にあることがあるため、fieldKey を手がかりに「その周辺」→ 無ければ再帰探索
		const listKey = `#List_${fn}`;
		/** @type {any[]|null} */
		let listDef = null;

		// context-first
		if (fkSegs.length) {
			const contexts = collectVarsDefContexts(varsDef);
			for (let i = contexts.length - 1; i >= 0; i--) {
				const ctx = contexts[i];
				if (ctx && typeof ctx === 'object' && Array.isArray(ctx[listKey])) {
					listDef = ctx[listKey];
					break;
				}
			}
		}
		// direct
		if (!listDef && Array.isArray(varsDef[listKey])) listDef = varsDef[listKey];
		// nested fallback
		if (!listDef) {
			const found = findNestedKey(varsDef, listKey);
			if (Array.isArray(found)) listDef = found;
		}

		if (Array.isArray(listDef)) {
			for (const item of listDef) {
				if (!item || typeof item !== 'object') continue;
				const raw = item[fn];
				const jp = item[`${fn}_JP`];
				const en = item[`${fn}_EN`];
				const hit = (
					(typeof raw === 'string' && raw.trim() === rv)
					|| (typeof jp === 'string' && jp.trim() === rv)
					|| (typeof en === 'string' && en.trim() === rv)
				);
				if (hit) return pickLabel(item) || rv;

				// フィールド名が一致しないケース（DualizePattern: Pattern を持つ等）
				const flex = pickLabelFlexible(item, fn);
				if (flex) return flex;
			}
		}
	}

	return rv;
}

/**
 * db_meta.json の $VarsDef（$EnumDef_* / #List_* / #Dict_*）から、カテゴリ値のJP/ENペアを取得する
 * - 既存の resolveVarsDefLabel() は「JP優先の単一文字列」だが、
 *   こちらは「JP/EN両方の表示」に利用するための薄い補助。
 * - EN は *_EN を優先し、無い場合は raw（コード）をフォールバックとして返す。
 *
 * @param {string} fieldName
 * @param {any} rawValue
 * @param {Object|null} globalDefType
 * @param {Object|null} metaForLookup
 * @param {string|null} fieldKey
 * @returns {{ jp?: string, en?: string, raw?: string } | null}
 */
function resolveVarsDefLabelPack(fieldName, rawValue, globalDefType = null, metaForLookup = null, fieldKey = null) {
	const fn = String(fieldName || '').trim();
	if (!fn) return null;
	if (rawValue === null || rawValue === undefined || rawValue === '') return null;

	const normalizeKnownEnumCode = (field, code) => {
		const f = String(field || '').trim();
		const c = String(code || '').trim();
		if (!f || !c) return c;
		return c;
	};

	const rvRaw = String(rawValue).trim();
	const rv = normalizeKnownEnumCode(fn, rvRaw);
	if (!rv) return null;

	// '#FemaleNeutral' のような「#付きコード」でも解決できるように正規化
	// - UI 側の schemaType が欠ける経路や、値が参照キーのまま流れてくる経路でも
	//   JP/EN 表示名解決が外れて raw のまま残るのを避ける
	const rvStripped = rv.startsWith('#') ? rv.slice(1).trim() : rv;
	const rvCandidates = [rv, rvStripped].filter(Boolean);

	const trimStr = (v) => (typeof v === 'string' && v.trim()) ? v.trim() : '';
	const normalizeBaseKey = (v) => normalizeVarsDefKey(String(v || '').trim());

	const findDictNameInSchema = (node, targetKey, depth = 0) => {
		if (!targetKey || !node || typeof node !== 'object') return '';
		if (depth > 8) return '';

		if (Array.isArray(node)) {
			for (const item of node) {
				const found = findDictNameInSchema(item, targetKey, depth + 1);
				if (found) return found;
			}
			return '';
		}

		if (node.hashTag === targetKey && typeof node.$dict === 'string' && node.$dict.trim()) {
			return node.$dict.trim();
		}

		for (const value of Object.values(node)) {
			if (!value || typeof value !== 'object') continue;
			const found = findDictNameInSchema(value, targetKey, depth + 1);
			if (found) return found;
		}
		return '';
	};

	/** @type {any[]} */
	const varsDefRoots = [];

	/** @param {any} general */
	const pushGeneralDefContainers = (general) => {
		if (!general || typeof general !== 'object' || Array.isArray(general)) return;
		for (const [k, v] of Object.entries(general)) {
			if (!k || typeof k !== 'string') continue;
			if (!k.startsWith('$Def_')) continue;
			if (!v || typeof v !== 'object') continue;
			varsDefRoots.push(v);
		}
	};

	if (metaForLookup?.General && typeof metaForLookup.General === 'object') {
		if (metaForLookup.General.$VarsDef && typeof metaForLookup.General.$VarsDef === 'object') varsDefRoots.push(metaForLookup.General.$VarsDef);
		pushGeneralDefContainers(metaForLookup.General);
	}
	if (metaForLookup?.$VarsDef && typeof metaForLookup.$VarsDef === 'object') varsDefRoots.push(metaForLookup.$VarsDef);
	if (metaForLookup?.Databases && typeof metaForLookup.Databases === 'object') {
		for (const dbMeta of Object.values(metaForLookup.Databases)) {
			if (!dbMeta || typeof dbMeta !== 'object') continue;
			const commons = dbMeta._Commons;
			if (commons && typeof commons === 'object') varsDefRoots.push(commons);
		}
	}
	if (globalDefType?.General && typeof globalDefType.General === 'object') {
		if (globalDefType.General.$VarsDef && typeof globalDefType.General.$VarsDef === 'object') varsDefRoots.push(globalDefType.General.$VarsDef);
		pushGeneralDefContainers(globalDefType.General);
	}

	const uniqRoots = [];
	for (const r of varsDefRoots) {
		if (!r || typeof r !== 'object') continue;
		if (uniqRoots.includes(r)) continue;
		uniqRoots.push(r);
	}
	if (!uniqRoots.length) return null;

	const fk = String(fieldKey || '').trim();
	const fkSegs = fk ? fk.split('.').map(s => String(s || '').trim()).filter(Boolean) : [];
	const keyBase = fkSegs.length ? normalizeBaseKey(fkSegs[fkSegs.length - 1]) : '';
	const dictLookupName = (() => {
		const candidates = Array.from(new Set([keyBase, normalizeBaseKey(fn)].filter(Boolean)));
		for (const candidate of candidates) {
			const found = findDictNameInSchema(globalDefType, candidate);
			if (found) return found;
		}
		return '';
	})();

	const findNestedKey = (obj, key, depth = 0) => {
		if (!obj || typeof obj !== 'object') return null;
		if (depth > 8) return null;
		if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];

		if (Array.isArray(obj)) {
			for (const it of obj) {
				const found = findNestedKey(it, key, depth + 1);
				if (found) return found;
			}
			return null;
		}

		for (const v of Object.values(obj)) {
			if (!v || typeof v !== 'object') continue;
			const found = findNestedKey(v, key, depth + 1);
			if (found) return found;
		}
		return null;
	};

	const collectVarsDefContexts = (varsDefRoot) => {
		/** @type {any[]} */
		const contexts = [varsDefRoot];
		if (!fkSegs.length) return contexts;
		let cur = varsDefRoot;
		const upto = Math.max(0, fkSegs.length - 1);
		for (let i = 0; i < upto; i++) {
			const seg = fkSegs[i];
			const key = `$Def_${seg}`;
			if (cur && typeof cur === 'object' && Object.prototype.hasOwnProperty.call(cur, key) && cur[key] && typeof cur[key] === 'object') {
				cur = cur[key];
				contexts.push(cur);
			} else {
				break;
			}
		}
		return contexts;
	};

	const makePack = (item, keyName) => {
		const k = String(keyName || fn).trim();
		const raw = trimStr(item?.[k]);
		const jp = trimStr(item?.[`${k}_JP`]);
		const en = trimStr(item?.[`${k}_EN`]);
		const labelRaw = trimStr(item?.[`${k}Text`]);
		const labelJp = trimStr(item?.[`${k}Text_JP`]);
		const labelEn = trimStr(item?.[`${k}Text_EN`]);
		return {
			raw: raw || rv,
			// NOTE: #Dict_Faction のように「ベースキーがJP文字列」で *_JP が無いケースを許容する
			// - *_JP が無い場合は raw（ベース値）を JP とみなす
			jp: jp || labelJp || labelRaw || raw || '',
			en: en || labelEn || labelRaw || raw || rv
		};
	};

	for (const varsDef of uniqRoots) {
		if (!varsDef || typeof varsDef !== 'object') continue;

		// $EnumDef_XXX
		const enumKey = `$EnumDef_${fn}`;
		let enumDef = null;

		if (fkSegs.length) {
			const contexts = collectVarsDefContexts(varsDef);
			for (let i = contexts.length - 1; i >= 0; i--) {
				const ctx = contexts[i];
				if (ctx && typeof ctx === 'object' && ctx[enumKey] && typeof ctx[enumKey] === 'object' && !Array.isArray(ctx[enumKey])) {
					enumDef = ctx[enumKey];
					break;
				}
			}
		}
		if (!enumDef && varsDef[enumKey] && typeof varsDef[enumKey] === 'object' && !Array.isArray(varsDef[enumKey])) {
			enumDef = varsDef[enumKey];
		}
		if (!enumDef) {
			const found = findNestedKey(varsDef, enumKey);
			if (found && typeof found === 'object' && !Array.isArray(found)) enumDef = found;
		}

		if (enumDef && typeof enumDef === 'object') {
			// 可能ならキー直引き（#FemaleNeutral 等）を優先して高速・確実に解決する
			// NOTE: この形式は db_meta.json の $EnumDef_* が採用している典型形
			const directKeys = Array.from(new Set([
				rv.startsWith('#') ? rv : `#${rv}`,
				rvStripped ? `#${rvStripped}` : '',
			].filter(Boolean)));

			for (const directKey of directKeys) {
				if (!Object.prototype.hasOwnProperty.call(enumDef, directKey)) continue;
				const item = enumDef[directKey];
				if (item && typeof item === 'object' && !Array.isArray(item)) {
					return makePack(item, fn);
				}
			}

			for (const v of Object.values(enumDef)) {
				if (!v || typeof v !== 'object') continue;
				const raw = trimStr(v[fn]);
				const jp = trimStr(v[`${fn}_JP`]);
				const en = trimStr(v[`${fn}_EN`]);
				const labelRaw = trimStr(v[`${fn}Text`]);
				const labelJp = trimStr(v[`${fn}Text_JP`]);
				const labelEn = trimStr(v[`${fn}Text_EN`]);
				const hit = [raw, jp, en, labelRaw, labelJp, labelEn].some(x => x && rvCandidates.includes(x));
				if (hit) return makePack(v, fn);
			}
		}

		// #List_XXX / #Dict_XXX
		const lookupNames = Array.from(new Set([dictLookupName, fn, keyBase].filter(Boolean)));
		const listSpecs = lookupNames.flatMap((name) => ([
			{ listKey: `#List_${name}`, valueKey: name },
			{ listKey: `#Dict_${name}`, valueKey: name }
		]));
		let listDef = null;
		let listValueKey = fn;

		if (fkSegs.length) {
			const contexts = collectVarsDefContexts(varsDef);
			for (let i = contexts.length - 1; i >= 0; i--) {
				const ctx = contexts[i];
				if (!ctx || typeof ctx !== 'object') continue;
				for (const spec of listSpecs) {
					if (!Array.isArray(ctx[spec.listKey])) continue;
					listDef = ctx[spec.listKey];
					listValueKey = spec.valueKey;
					break;
				}
				if (listDef) break;
			}
		}
		if (!listDef) {
			for (const spec of listSpecs) {
				if (!Array.isArray(varsDef[spec.listKey])) continue;
				listDef = varsDef[spec.listKey];
				listValueKey = spec.valueKey;
				break;
			}
		}
		if (!listDef) {
			for (const spec of listSpecs) {
				const found = findNestedKey(varsDef, spec.listKey);
				if (!Array.isArray(found)) continue;
				listDef = found;
				listValueKey = spec.valueKey;
				break;
			}
		}

		if (Array.isArray(listDef)) {
			for (const item of listDef) {
				if (!item || typeof item !== 'object') continue;

				// preferred key で一致する場合
				const raw = trimStr(item[listValueKey]);
				const jp = trimStr(item[`${listValueKey}_JP`]);
				const en = trimStr(item[`${listValueKey}_EN`]);
				const hit = [raw, jp, en].some(x => x && rvCandidates.includes(x));
				if (hit) return makePack(item, listValueKey);

				// フィールド名が一致しないケース（DualizePattern: Pattern など）
				for (const [k, v] of Object.entries(item)) {
					if (!k || typeof k !== 'string') continue;
					if (k.endsWith('_JP') || k.endsWith('_EN')) continue;
					if (k.startsWith('_')) continue;
					if (typeof v !== 'string') continue;
					if (!rvCandidates.includes(v.trim())) continue;
					return makePack(item, k);
				}
			}
		}
	}

	return null;
}

/**
 * resolveVarsDefLabelPack() の結果から「JP/ENの両方があれば併記」した文字列を作る
 * @param {{jp?: string, en?: string, raw?: string} | null} pack
 * @param {string} fallback
 */
function formatBilingualLabel(pack, fallback, displayOpt = null) {
	const raw = (pack?.raw || String(fallback || '')).trim();
	const jp = (pack?.jp || '').trim();
	const en = (pack?.en || '').trim();

	const modeRaw = (displayOpt && typeof displayOpt === 'object' && typeof displayOpt.langMode === 'string')
		? displayOpt.langMode.trim()
		: '';
	const mode = modeRaw
		.replace(/\s+/g, '')
		.replace(/-/g, '')
		.replace(/_/g, '')
		.toLowerCase();

	const pickJp = () => jp || en || raw;
	const pickEn = () => en || raw || jp;
	const pageLang = getCurrentPageLanguage();
	const hasJapaneseChars = (text) => /[\u3040-\u30ff\u3400-\u9fff]/.test(String(text || ''));

	if (mode === 'raw' || mode === 'code') return raw;
	if (pageLang === 'jp') {
		if (jp) return jp;
		if (raw && hasJapaneseChars(raw)) return raw;
		return '';
	}
	if (pageLang === 'en') {
		if (en) return en;
		return '';
	}

	if (mode === 'jp' || mode === 'ja') return pickJp();
	if (mode === 'en' || mode === 'eng') return pickEn();
	if (mode === 'enj' || mode === 'enjp' || mode === 'enjpn') {
		const primary = pickEn();
		if (!primary) return '';
		if (en && jp && en !== jp) return `${en} / ${jp}`;
		return primary;
	}

	// default: jp/en (bilingual)
	const primary = pickJp();
	if (!primary) return '';
	if (jp && en && jp !== en) return `${jp} / ${en}`;
	return primary;
}

/**
 * VarsDef（$EnumDef_* / #List_* / #Dict_*）参照のために、言語サフィックスを除去してベースキーへ正規化する
 * - fieldKey が 'GenderType_JP' 等でも $EnumDef_GenderType を参照できるようにする
 * @param {string} k
 * @returns {string}
 */
function normalizeVarsDefKey(k) {
	const s = String(k || '').trim();
	const m = s.match(/^(.*)_(JP|EN)$/);
	return (m && m[1]) ? m[1] : s;
}

/**
 * Format value for display with global definition type support
 * @param {any} value - Value to format
 * @param {Object} labelMap - Field label mapping for nested objects
 * @param {Object} workMeta - Work metadata for lookup
 * @param {Object} globalDefType - Global definition types for enum/list lookups
 * @param {{display?: any, schemaType?: any, fieldKey?: string}|null} opt - display hint (e.g., { unit: 'cm' }) + schema type hint
 * @returns {string} Formatted display value
 */
function formatValueForDisplay(value, labelMap = {}, workMeta = null, globalDefType = null, opt = null) {
	if (value === null || value === undefined || value === '') {
		return '';
	}

	const unit = opt?.display?.unit ? String(opt.display.unit).trim() : '';
	const withUnit = (text) => {
		const base = String(text ?? '').trim();
		if (!base) return '';
		return unit ? `${base} ${unit}`.trim() : base;
	};

	/**
	 * 値が「配列ではないObject」かどうか
	 * @param {any} v
	 * @returns {boolean}
	 */
	const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

	// formatValueForDisplay 内で共通利用する現在言語
	const _fvLang = getCurrentPageLanguage();

	/**
	 * Rank 表現を人間向け表示に正規化
	 * - { Rank: 'A' } / { Rank: { hideText: '???' } } / { Rank: { Rank: 'A', about: '...' } }
	 * - { Rank: 'A', about: '...' } のような「Rank + 注釈」も扱う
	 * @param {any} obj
	 * @returns {string}
	 */
	const formatRankLike = (obj) => {
		if (!isPlainObject(obj)) return '';
		if (!Object.prototype.hasOwnProperty.call(obj, 'Rank')) return '';

		const rawRank = obj.Rank;
		const about = _fvLang === 'en' ? (obj.about_EN || obj.about_JP || obj.about) : (obj.about_JP || obj.about_EN || obj.about);

		// Rank がプリミティブ
		if (typeof rawRank === 'string' || typeof rawRank === 'number' || typeof rawRank === 'boolean') {
			const base = String(rawRank).trim();
			if (!base) return '';
			if (about) return `${base}（${about}）`;
			return base;
		}

		// Rank が { hideText: '...' }
		if (isPlainObject(rawRank) && typeof rawRank.hideText === 'string' && rawRank.hideText.trim()) {
			return formatMaskedDisplayValue(rawRank.hideText);
		}

		// Rank が { Rank: 'A', about: '...' } のようなネスト
		if (isPlainObject(rawRank) && Object.prototype.hasOwnProperty.call(rawRank, 'Rank')) {
			const nestedBaseRaw = rawRank.Rank;
			const nestedAbout = _fvLang === 'en' ? (rawRank.about_EN || rawRank.about_JP || rawRank.about) : (rawRank.about_JP || rawRank.about_EN || rawRank.about);

			if (typeof nestedBaseRaw === 'string' || typeof nestedBaseRaw === 'number' || typeof nestedBaseRaw === 'boolean') {
				const base = String(nestedBaseRaw).trim();
				if (!base) return '';
				if (nestedAbout) return `${base}（${nestedAbout}）`;
				return base;
			}
			if (isPlainObject(nestedBaseRaw) && typeof nestedBaseRaw.hideText === 'string' && nestedBaseRaw.hideText.trim()) {
				return formatMaskedDisplayValue(nestedBaseRaw.hideText);
			}
		}

		return '';
	};

	/**
	 * Rank 表現の「値」と「注釈」を分離して抽出
	 * - enum参照（#Rank3 等）を先に解決してから about を付けるため
	 * @param {any} obj
	 * @returns {{ rank: string, about?: string } | { hideText: string } | null}
	 */
	const extractRankParts = (obj) => {
		if (!isPlainObject(obj)) return null;
		if (!Object.prototype.hasOwnProperty.call(obj, 'Rank')) return null;

		const aboutOuter = _fvLang === 'en' ? (obj.about_EN || obj.about_JP || obj.about) : (obj.about_JP || obj.about_EN || obj.about);
		const rawRank = obj.Rank;

		// Rank がプリミティブ
		if (typeof rawRank === 'string' || typeof rawRank === 'number' || typeof rawRank === 'boolean') {
			const rank = String(rawRank).trim();
			if (!rank) return null;
			return aboutOuter ? { rank, about: String(aboutOuter) } : { rank };
		}

		// Rank が { hideText: '...' }
		if (isPlainObject(rawRank) && typeof rawRank.hideText === 'string' && rawRank.hideText.trim()) {
			return { hideText: rawRank.hideText };
		}

		// Rank が { Rank: 'A', about: '...' } のようなネスト
		if (isPlainObject(rawRank) && Object.prototype.hasOwnProperty.call(rawRank, 'Rank')) {
			const nestedBaseRaw = rawRank.Rank;
			const aboutNested = _fvLang === 'en' ? (rawRank.about_EN || rawRank.about_JP || rawRank.about) : (rawRank.about_JP || rawRank.about_EN || rawRank.about);
			const about = aboutNested || aboutOuter;

			if (typeof nestedBaseRaw === 'string' || typeof nestedBaseRaw === 'number' || typeof nestedBaseRaw === 'boolean') {
				const rank = String(nestedBaseRaw).trim();
				if (!rank) return null;
				return about ? { rank, about: String(about) } : { rank };
			}
			if (isPlainObject(nestedBaseRaw) && typeof nestedBaseRaw.hideText === 'string' && nestedBaseRaw.hideText.trim()) {
				return { hideText: nestedBaseRaw.hideText };
			}
		}

		return null;
	};

	/**
	 * $EnumDef_* 用の「値」と「注釈」を分離して抽出
	 * @param {any} obj
	 * @param {string} enumName
	 * @returns {{ code: string, about?: string } | { hideText: string } | null}
	 */
	const extractEnumParts = (obj, enumName) => {
		const en = String(enumName || '').trim();
		if (!en) return null;
		if (!isPlainObject(obj)) return null;
		if (!Object.prototype.hasOwnProperty.call(obj, en)) return null;

		const aboutOuter = _fvLang === 'en' ? (obj.about_EN || obj.about_JP || obj.about) : (obj.about_JP || obj.about_EN || obj.about);
		const raw = obj[en];

		if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
			const code = String(raw).trim();
			if (!code) return null;
			return aboutOuter ? { code, about: String(aboutOuter) } : { code };
		}

		if (isPlainObject(raw) && typeof raw.hideText === 'string' && raw.hideText.trim()) {
			return { hideText: raw.hideText };
		}

		if (isPlainObject(raw) && Object.prototype.hasOwnProperty.call(raw, en)) {
			const nested = raw[en];
			const aboutNested = _fvLang === 'en' ? (raw.about_EN || raw.about_JP || raw.about) : (raw.about_JP || raw.about_EN || raw.about);
			const about = aboutNested || aboutOuter;
			if (typeof nested === 'string' || typeof nested === 'number' || typeof nested === 'boolean') {
				const code = String(nested).trim();
				if (!code) return null;
				return about ? { code, about: String(about) } : { code };
			}
			if (isPlainObject(nested) && typeof nested.hideText === 'string' && nested.hideText.trim()) {
				return { hideText: nested.hideText };
			}
		}
		return null;
	};

	/**
	 * schema の $type 文字列に定義型が含まれるか（簡易）
	 * @param {any} t
	 * @param {string} needle
	 */
	const schemaTypeIncludes = (t, needle, depth = 0) => {
		if (!needle) return false;
		if (depth > 6) return false;
		if (t === null || t === undefined) return false;
		if (typeof t === 'string') return t.includes(needle);
		if (Array.isArray(t)) return t.some(x => schemaTypeIncludes(x, needle, depth + 1));
		if (typeof t === 'object') {
			// よくある { $type: ... } 形式
			if (Object.prototype.hasOwnProperty.call(t, '$type')) {
				return schemaTypeIncludes(t.$type, needle, depth + 1);
			}
			// フォールバック: 値を走査（過剰な探索を避けるため深さ制限あり）
			return Object.values(t).some(x => schemaTypeIncludes(x, needle, depth + 1));
		}
		return false;
	};

	const formatMaskedDisplayValue = (maskedText) => {
		const rawMasked = (typeof maskedText === 'string') ? maskedText.trim() : '';
		if (!rawMasked) return '';

		const pack = resolveVarsDefLabelPack('hideText', rawMasked, globalDefType, workMeta, 'hideText');
		const pageLang = getCurrentPageLanguage();
		if (pageLang === 'en') {
			return (pack?.en || '').trim() || rawMasked;
		}
		if (pageLang === 'mix') {
			// #ListLink / Enum 経路は「コード説明」として日英併記を維持し、
			// 素の hideText（例: 体重の非公開希望）は JP 優先で表示する。
			if (!schemaTypeIncludes(opt?.schemaType, '#ListLink') && !schemaTypeIncludes(opt?.schemaType, '$EnumDef')) {
				return (pack?.jp || '').trim() || rawMasked;
			}
		}
		return formatBilingualLabel(pack, rawMasked, opt?.display) || rawMasked;
	};

	/**
	* #Index 型の値を、作品ごとの $IndexDef（typedef）に合わせて整形
	 * - 詳細表示（Relation 等）の「インデックス参照」をスキーマ駆動で扱えるようにする
	 * @param {any} v
	 * @returns {string}
	 */
	const formatIndexLikeValue = (v) => {
		if (!opt || typeof opt !== 'object') return '';
		if (!schemaTypeIncludes(opt.schemaType, '#Index')) return '';

		// 現在の作品（UI状態）を元に indexDef を引く（無い場合はフォールバック）
		const workId = window?.__CHAR_STATE__?.workId;
		const indexDef = opt.indexDef || (workId ? getWorkIndexField(workId, workMeta) : null);
		if (!indexDef || typeof indexDef !== 'object') return '';

		const rootKey = indexDef.hashTag;
		if (!rootKey || typeof rootKey !== 'string') return '';

		const subDefs = getIndexSubDefs(indexDef);

		// ネスト型（例: Card.Num / BeastType.Beast）
		if (Array.isArray(subDefs) && subDefs.length > 0) {
			const valueItems = collectIndexEntries(v, indexDef, workMeta, globalDefType, { context: 'value' })
				.filter(item => item?.contexts?.value);
			if (!valueItems.length) return '';
			return valueItems.map(item => item.text).join(' / ');
		}

		// スカラー型（例: Num / Drc）
		const leaf = (isPlainObject(v) && Object.prototype.hasOwnProperty.call(v, rootKey)) ? v[rootKey] : v;
		if (leaf === null || leaf === undefined || leaf === '') return '';
		const rootType = indexDef?.$type ?? indexDef?.$valType ?? null;
		const formatted = formatValueForDisplay(leaf, labelMap, workMeta, globalDefType, {
			display: opt.display,
			schemaType: rootType,
			fieldKey: rootKey
		});
		const text = String(formatted ?? '').trim();
		if (!text) return '';
		const label = getIndexLabel(indexDef);
		return label ? `${label}: ${text}` : text;
	};

	/**
	 * globalDefType から利用可能な Enum 名（$EnumDef_XXX の XXX）を抽出
	 * @returns {string[]}
	 */
	const listAvailableEnumNames = () => {
		const varsDef = globalDefType?.General?.$VarsDef;
		if (!varsDef || typeof varsDef !== 'object') return [];
		const out = [];
		for (const k of Object.keys(varsDef)) {
			if (!k || typeof k !== 'string') continue;
			const m = k.match(/^\$EnumDef_([A-Za-z0-9_]+)$/);
			if (m && m[1]) out.push(m[1]);
		}
		return out;
	};

	/**
	 * schemaType から $EnumDef_XXX を抽出
	 * @param {any} t
	 * @returns {string}
	 */
	const pickEnumNameFromSchemaType = (t) => {
		const s = (typeof t === 'string') ? t : '';
		const m = s.match(/\$EnumDef_([A-Za-z0-9_]+)/);
		const picked = (m && m[1]) ? String(m[1]).trim() : '';
		// NOTE: '$EnumDef_withAbout' は「enum名」ではなく型バリアント。
		// これを enumName='withAbout' と誤認すると、辞書解決が走らず raw（英語コード）に退避してしまう。
		if (picked && picked.replace(/\s+/g, '').toLowerCase() === 'withabout') return '';
		return picked;
	};

	/**
	 * $EnumDef_XXX の参照（#XXX1 等）を解決
	 * @param {string} enumName
	 * @param {string} key
	 */
	const resolveEnumKey = (enumName, key) => {
		const en = String(enumName || '').trim();
		const k = String(key || '').trim();
		if (!en || !k.startsWith('#')) return '';
		const g = globalDefType?.General?.$VarsDef?.[`$EnumDef_${en}`];
		const v = g && typeof g === 'object' ? g[k] : null;
		const code = v && typeof v === 'object' ? v[en] : null;
		return (typeof code === 'string' && code.trim()) ? code.trim() : '';
	};

	/**
	 * $VarsDef のネストから指定キー（#ListLink_XXX 等）を探索
	 * @param {any} obj
	 * @param {string} key
	 * @param {number} depth
	 * @returns {any}
	 */
	const findNestedKey = (obj, key, depth = 0) => {
		if (!obj || typeof obj !== 'object') return null;
		if (depth > 6) return null;
		if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];

		if (Array.isArray(obj)) {
			for (const it of obj) {
				const found = findNestedKey(it, key, depth + 1);
				if (found) return found;
			}
			return null;
		}

		for (const v of Object.values(obj)) {
			if (!v || typeof v !== 'object') continue;
			const found = findNestedKey(v, key, depth + 1);
			if (found) return found;
		}
		return null;
	};

	/**
	 * #ListLink_XXX（db_meta.json）から項目を逆引き
	 * @param {string} listFieldName - 'EffectText' 等
	 * @param {string} rawValue - '絶大' 等
	 * @returns {any|null}
	 */
	const resolveListLinkItem = (listFieldName, rawValue) => {
		const fn = String(listFieldName || '').trim();
		const rv = String(rawValue ?? '').trim();
		if (!fn || !rv) return null;

		const vars = workMeta?.General?.$VarsDef || workMeta?.$VarsDef;
		if (!vars || typeof vars !== 'object') return null;

		const listKey = `#ListLink_${fn}`;
		const listDef = findNestedKey(vars, listKey);
		if (!Array.isArray(listDef)) return null;

		for (const item of listDef) {
			if (!item || typeof item !== 'object') continue;
			const v = item[fn];
			if (typeof v === 'string' && v.trim() === rv) return item;
		}
		return null;
	};

	const normalizeEnumFormat = (f) => {
		const s = String(f ?? '').trim();
		if (s === 'alpha' || s === 'code') return 'alpha';
		if (s === 'label') return 'label';
		if (s === 'alphaLabel' || s === 'codeLabel') return 'alphaLabel';
		if (s === 'labelAlpha' || s === 'labelCode') return 'labelAlpha';
		return '';
	};

	const getEnumFormatFor = (enumName) => {
		const en = String(enumName || '').trim();
		const d = opt?.display;
		if (!d || typeof d !== 'object') return '';
		if (en === 'Rank' && d.rankFormat) return d.rankFormat;
		if (en === 'Rarity' && d.rarityFormat) return d.rarityFormat;
		if (en === 'Decave' && d.decaveFormat) return d.decaveFormat;
		return d.enumFormat || '';
	};

	/**
	 * #ListLink_* の表示オプション（$display）を解釈
	 * @returns {{ showEnum: boolean, enumName: string }}
	 */
	const getListLinkDisplayOpt = () => {
		const d = opt?.display;
		const showEnum = (d && typeof d === 'object' && typeof d.listLinkShowEnum === 'boolean') ? d.listLinkShowEnum : true;
		const enumName = (d && typeof d === 'object' && typeof d.listLinkEnumName === 'string') ? d.listLinkEnumName.trim() : '';
		return { showEnum, enumName };
	};

	/**
	 * $EnumLink_${Field}（db_meta.json）から表示名を解決
	 * @param {string} fieldKey
	 * @param {string} enumName
	 * @param {string} code
	 */
	const resolveEnumLinkLabelPack = (fieldKey, enumName, code) => {
		const fk = String(fieldKey || '').trim();
		const en = String(enumName || '').trim();
		const c = String(code || '').trim();
		if (!fk || !en || !c) return null;

		/**
		 * $VarsDef のネストから指定キー（$EnumLink_XXX 等）を探索
		 * @param {any} obj
		 * @param {string} key
		 * @param {number} depth
		 * @returns {any}
		 */
		const findNestedKey = (obj, key, depth = 0) => {
			if (!obj || typeof obj !== 'object') return null;
			if (depth > 6) return null;
			if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];

			if (Array.isArray(obj)) {
				for (const it of obj) {
					const found = findNestedKey(it, key, depth + 1);
					if (found) return found;
				}
				return null;
			}

			for (const v of Object.values(obj)) {
				if (!v || typeof v !== 'object') continue;
				const found = findNestedKey(v, key, depth + 1);
				if (found) return found;
			}
			return null;
		};

		const vars = workMeta?.General?.$VarsDef || workMeta?.$VarsDef;
		if (!vars || typeof vars !== 'object') return null;

		const explicitLinkKey = opt?.display?.enumLinkKey ? String(opt.display.enumLinkKey).trim() : '';
		const simple = fk.split('.').pop();
		const candidates = [];
		if (explicitLinkKey) candidates.push(explicitLinkKey);
		// 既定: フィールド末尾（ExistingRarity 等）→ enumName（Rank/Rarity）
		if (simple) candidates.push(simple);
		if (en) candidates.push(en);

		/** @type {{suffix:string, def:any}[]} */
		const defs = [];
		for (const suffix of candidates) {
			const key = `$EnumLink_${suffix}`;
			const def = findNestedKey(vars, key);
			if (def && typeof def === 'object') defs.push({ suffix, def });
		}
		if (!defs.length) return null;

		// 最初に見つかった定義を採用（enumLinkKey を指定した場合は優先される）
		const { suffix: pickedSuffix, def: linkDef } = defs[0];

		const makePack = (value) => ({
			raw: (
				(typeof value?.[pickedSuffix] === 'string' && value[pickedSuffix].trim())
				|| c
			),
			jp: (
				(typeof value?.[`${pickedSuffix}_JP`] === 'string' && value[`${pickedSuffix}_JP`].trim())
				|| (typeof value?.[pickedSuffix] === 'string' && value[pickedSuffix].trim())
				|| ''
			),
			en: (
				(typeof value?.[`${pickedSuffix}_EN`] === 'string' && value[`${pickedSuffix}_EN`].trim())
				|| (typeof value?.[pickedSuffix] === 'string' && value[pickedSuffix].trim())
				|| ''
			)
		});

		for (const v of Object.values(linkDef)) {
			if (!v || typeof v !== 'object') continue;
			const vv = v[en];
			if (typeof vv === 'string' && vv.trim() === c) {
				return makePack(v);
			}
		}
		return null;
	};

	const formatEnumWithAbout = (enumName, code, about) => {
		const c = String(code ?? '').trim();
		if (!c) return '';
		const a = (about === null || about === undefined) ? '' : String(about).trim();
		const fmt = normalizeEnumFormat(getEnumFormatFor(enumName));

		// 既定（互換）: about があれば alphaLabel 相当、なければ alpha
		if (!fmt) {
			if (a) return `${c}（${a}）`;
			return c;
		}

		if (fmt === 'alpha') return c;
		if (fmt === 'label') return a || c;
		if (fmt === 'alphaLabel') return a ? `${c}（${a}）` : c;
		if (fmt === 'labelAlpha') return a ? `${a}（${c}）` : c;
		return c;
	};

	// $EnumDef_*（Rank/Rarity 等）の場合、プリミティブ値でも参照解決/EnumLink解決を試す
	if (opt && typeof opt === 'object' && typeof value !== 'object') {
		// #Index の場合は、作品の $IndexDef に合わせて整形する
		const idxText = formatIndexLikeValue(value);
		if (idxText) return withUnit(idxText);

		const enumName = pickEnumNameFromSchemaType(opt.schemaType);
		// $EnumDef（サフィックス無し）は「フィールド名の EnumDef を参照」する運用を許容
		// - 例: GenderType.$type === '$EnumDef' でも $VarsDef.$EnumDef_GenderType を見て表示名へ
		if (!enumName && schemaTypeIncludes(opt.schemaType, '$EnumDef') && opt.fieldKey) {
			const simple = normalizeVarsDefKey(String(opt.fieldKey).split('.').pop());
			const raw = (value === null || value === undefined) ? '' : String(value).trim();
			if (simple && raw) {
				const code = raw.startsWith('#') ? (resolveEnumKey(simple, raw) || raw) : raw;
				const pack = resolveVarsDefLabelPack(simple, code, globalDefType, workMeta, opt.fieldKey);
				const text = formatBilingualLabel(pack, code, opt?.display);
				return withUnit(text);
			}
		}

		if (enumName && schemaTypeIncludes(opt.schemaType, '$EnumDef_')) {
			const s = String(value ?? '').trim();
			const resolved = resolveEnumKey(enumName, s);
			const code = resolved || (typeof value === 'string' ? s : '');
			const enumPack = code ? resolveVarsDefLabelPack(enumName, code, globalDefType, workMeta, opt.fieldKey) : null;
			const enumLabel = code ? formatBilingualLabel(enumPack, code, opt?.display) : '';

			if (schemaTypeIncludes(opt.schemaType, '$EnumLink') && opt.fieldKey && code) {
				const linkedPack = resolveEnumLinkLabelPack(opt.fieldKey, enumName, code);
				if (linkedPack) {
					const linked = formatBilingualLabel(linkedPack, code, opt?.display);
					const fmt = normalizeEnumFormat(getEnumFormatFor(enumName));
					// 既定: EnumLink があれば alphaLabel（コード＋ラベル）扱い
					// - ラベル側にコードが含まれる場合もあるが、その調整は db_meta.json 側で行えるようにする
					if (!fmt) return formatEnumWithAbout(enumName, code, linked);
					return formatEnumWithAbout(enumName, code, linked);
				}
			}

			if (code && enumLabel && enumLabel !== code) {
				return formatEnumWithAbout(enumName, code, enumLabel);
			}

			if (resolved) return formatEnumWithAbout(enumName, resolved, null);
			if (typeof value === 'boolean') return String(value);
			return withUnit(value);
		}

		// #ListIndex / #DictIndex（RaceType / Area 等）の場合、db_meta.json の辞書から表示名を解決する
		// - 例: RaceType: 'Human' → '人間'
		if ((schemaTypeIncludes(opt.schemaType, '#ListIndex') || schemaTypeIncludes(opt.schemaType, '#DictIndex')) && opt.fieldKey) {
			const simple = normalizeVarsDefKey(String(opt.fieldKey).split('.').pop());
			if (simple) {
				const pack = resolveVarsDefLabelPack(simple, value, globalDefType, workMeta, opt.fieldKey);
				const text = formatBilingualLabel(pack, String(value ?? '').trim(), opt?.display);
				if (text) return withUnit(text);
			}
		}

		// schemaType が欠けている（または typedef が取得できない）場合でも、
		// db_meta.json($VarsDef) に定義があれば表示名解決を試みる。
		// - 例: GenderType の schemaType が取れない経路で 'FemaleNeutral' がコード表示に退避するのを防ぐ
		if ((!opt.schemaType || opt.schemaType === '') && opt.fieldKey) {
			const simple = normalizeVarsDefKey(String(opt.fieldKey).split('.').pop());
			const raw = (value === null || value === undefined) ? '' : String(value).trim();
			if (simple && raw) {
				const pack = resolveVarsDefLabelPack(simple, raw, globalDefType, workMeta, opt.fieldKey);
				const text = formatBilingualLabel(pack, raw, opt?.display);
				if (text && text !== raw) return withUnit(text);
			}
		}

		// 最終保険:
		// schemaType が '#String' 等で Enum/List として判定できない場合でも、
		// db_meta.json($VarsDef) に定義があれば表示名解決を試みる（GenderType 等の取りこぼし対策）。
		if (opt.fieldKey) {
			const simple = normalizeVarsDefKey(String(opt.fieldKey).split('.').pop());
			const raw = (value === null || value === undefined) ? '' : String(value).trim();
			if (simple && raw) {
				const pack = resolveVarsDefLabelPack(simple, raw, globalDefType, workMeta, opt.fieldKey);
				const text = formatBilingualLabel(pack, raw, opt?.display);
				if (text && text !== raw) return withUnit(text);
			}
		}
	}

	/**
	 * `_Search` などの {hashTag, key} 配列を表示用に整形
	 * @param {any} pairs
	 * @returns {string}
	 */
	const formatSearchPairs = (pairs) => {
		if (!Array.isArray(pairs) || pairs.length === 0) return '';
		const parts = [];
		for (const p of pairs) {
			if (!isPlainObject(p)) continue;
			const h = typeof p.hashTag === 'string' ? p.hashTag.trim() : '';
			const k = (p.key === null || p.key === undefined) ? '' : String(p.key).trim();
			if (!h && !k) continue;
			if (h && k) parts.push(`${h}=${k}`);
			else parts.push(h || k);
		}
		return parts.join(', ');
	};

	/**
	 * `_Jump` オブジェクトを表示用に整形
	 * 例: { hashTag: 'AnivDay', _Search: [{hashTag:'DayAbout', key:'誕生日'}] }
	 * @param {any} jump
	 * @returns {string}
	 */
	const formatJump = (jump) => {
		if (!isPlainObject(jump)) return '';
		const rawTarget = typeof jump.hashTag === 'string' ? jump.hashTag.trim() : '';
		const target = rawTarget
			? getFieldLabel(rawTarget, labelMap, workMeta, globalDefType, rawTarget)
			: '';
		const q = formatSearchPairs(jump._Search);
		if (target && q) return `${target}（${q}）`;
		return target || q || '';
	};

	const wrapperTypeSources = [
		globalTypeDefCache,
		window?.__CHAR_STATE__?.globalTypeDef,
		globalDefType,
		window?.__CHAR_STATE__?.workTypeDef
	].filter((source, index, list) => source && list.indexOf(source) === index);

	const resolveTypeDefEntries = (defName) => {
		const name = String(defName || '').trim();
		if (!name) return [];

		for (const source of wrapperTypeSources) {
			const metaEntries = source?.$MetaType?.[name]?.$DefType;
			if (Array.isArray(metaEntries)) return metaEntries;

			const generalVarsEntries = source?.General?.$VarsDef?.[name]?.$DefType;
			if (Array.isArray(generalVarsEntries)) return generalVarsEntries;

			const varsEntries = source?.$VarsDef?.[name]?.$DefType;
			if (Array.isArray(varsEntries)) return varsEntries;
		}

		return [];
	};

	const getRoleEntries = (defName, role) => {
		const targetRole = String(role || '').trim();
		if (!targetRole) return [];
		return resolveTypeDefEntries(defName).filter((entry) => {
			const entryRole = entry?.$display?.role;
			return typeof entryRole === 'string' && entryRole.trim() === targetRole;
		});
	};

	const getRoleRawValues = (obj, defName, role) => {
		if (!isPlainObject(obj)) return [];
		return getRoleEntries(defName, role)
			.map((entry) => obj?.[entry?.hashTag])
			.filter((raw) => raw !== undefined && raw !== null && raw !== '');
	};

	const pickRoleRawValue = (obj, defName, role) => getRoleRawValues(obj, defName, role)[0];

	/**
	 * ネストObject/配列から表示可能なプリミティブ文字列を抽出
	 * - `hideText` は上位で処理するためここでは無視
	 * - 取り過ぎ防止のため深さ/件数に上限を設ける
	 * @param {any} v
	 * @param {{depth?: number, maxItems?: number, includePrivate?: boolean}} opt
	 * @param {number} cur
	 * @param {string[]} out
	 */
	const collectLeafText = (v, opt, cur, out) => {
		const depth = opt?.depth ?? 4;
		const maxItems = opt?.maxItems ?? 40;
		const includePrivate = !!opt?.includePrivate;
		if (out.length >= maxItems) return;
		if (cur > depth) return;

		if (v === null || v === undefined) return;
		if (typeof v === 'string') {
			const t = v.trim();
			if (t) out.push(t);
			return;
		}
		if (typeof v === 'number' || typeof v === 'boolean') {
			out.push(String(v));
			return;
		}
		if (Array.isArray(v)) {
			for (const it of v) {
				collectLeafText(it, opt, cur + 1, out);
				if (out.length >= maxItems) return;
			}
			return;
		}
		if (!isPlainObject(v)) return;

		// {hashTag, key} 形式は専用表記で取り出す
		if (typeof v.hashTag === 'string' && Object.prototype.hasOwnProperty.call(v, 'key') && Object.keys(v).length <= 3) {
			const h = v.hashTag.trim();
			const k = (v.key === null || v.key === undefined) ? '' : String(v.key).trim();
			if (h && k) out.push(`${h}=${k}`);
			else if (h) out.push(h);
			else if (k) out.push(k);
			return;
		}

		for (const [k, vv] of Object.entries(v)) {
			if (!includePrivate && String(k).startsWith('_')) continue;
			if (k === 'hideText') continue;
			collectLeafText(vv, opt, cur + 1, out);
			if (out.length >= maxItems) return;
		}
	};

	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		if (typeof value === 'boolean') return String(value);
		return withUnit(value);
	}

	if (Array.isArray(value)) {
		const formattedItems = value
			.map(item => formatValueForDisplay(item, labelMap, workMeta, globalDefType, opt))
			.filter(v => v);
		if (formattedItems.length === 0) return '';

		const hasArraySchema = /\[\]/.test(String(opt?.schemaType || ''));
		const isListIndexArray = hasArraySchema && (schemaTypeIncludes(opt?.schemaType, '#ListIndex') || schemaTypeIncludes(opt?.schemaType, '#DictIndex'));
		const isListLinkArray = hasArraySchema && schemaTypeIncludes(opt?.schemaType, '#ListLink');

		if (isListIndexArray || isListLinkArray) {
			return formattedItems.join('\n');
		}

		if (hasArraySchema && schemaTypeIncludes(opt?.schemaType, '$Def_Day')) {
			return formattedItems.join('\n');
		}

		if (schemaTypeIncludes(opt?.schemaType, '#Summary')) {
			return formattedItems.join('\n');
		}

		if (schemaTypeIncludes(opt?.schemaType, '#Dialogue')) {
			return formattedItems.join('\n\n');
		}

		// _withAbout[] 配列型（#String_withAbout[], #Number_withAbout[], #ListIndex_withAbout[] 等）は 1 要素 1 行
		if (hasArraySchema && schemaTypeIncludes(opt?.schemaType, '_withAbout')) {
			return formattedItems.join('\n');
		}

		return formattedItems.join(', ');
	}

	if (typeof value === 'object') {
		// #Index の場合（object 値も含む）
		const idxText = formatIndexLikeValue(value);
		if (idxText) return idxText;

		// Common “masked” pattern used across databases
		if (typeof value.hideText === 'string' && value.hideText.trim()) {
			return formatMaskedDisplayValue(value.hideText);
		}

		// _Jump wrapper pattern (e.g., BirthDay: { _Jump: {hashTag, _Search:[{hashTag,key}] } })
		if (value._Jump && typeof value._Jump === 'object') {
			const j = formatJump(value._Jump);
			if (j) return j;
		}

		// _Jump object itself
		if (typeof value.hashTag === 'string' && (value._Search || value.key != null) && Object.keys(value).some(k => k === 'hashTag' || k === '_Search' || k === 'key')) {
			const j = formatJump(value);
			if (j) return j;
		}

		// _DBLink-like object (worksTitle/dbName/_Search)
		if (typeof value.worksTitle === 'string' && typeof value.dbName === 'string' && (Array.isArray(value._Search) || isPlainObject(value._Search))) {
			const ws = value.worksTitle.trim();
			const db = value.dbName.trim();
			const q = formatSearchPairs(value._Search);
			const head = (ws && db) ? `${ws}/${db}` : (ws || db);
			if (head && q) return `${head}（${q}）`;
			if (head) return head;
			if (q) return q;
		}

		// Bilingual value_JP/value_EN パターン（例: DialogueExamples の {value_JP, value_EN, about_JP, about_EN}）
		// - value キーを持たず value_JP または value_EN を持つオブジェクトを対象とする
		if (!Object.prototype.hasOwnProperty.call(value, 'value') &&
			(Object.prototype.hasOwnProperty.call(value, 'value_JP') || Object.prototype.hasOwnProperty.call(value, 'value_EN'))) {
			const base = _fvLang === 'en' ? (value.value_EN || value.value_JP || '') : (value.value_JP || value.value_EN || '');
			const about = _fvLang === 'en' ? (value.about_EN || value.about_JP || value.about) : (value.about_JP || value.about_EN || value.about);
			const baseWithUnit = base ? withUnit(String(base).trim()) : '';
			if (about && baseWithUnit) return `${baseWithUnit}（${about}）`;
			if (baseWithUnit) return baseWithUnit;
		}

		// Common value/about pattern (e.g., Age: {value, about_JP/about_EN})
		// NOTE: value が Enum/List のコード値のケースがあるため、schemaType に応じて辞書解決して表示する
		if (Object.prototype.hasOwnProperty.call(value, 'value')) {
			const base = value.value;
			const about = _fvLang === 'en' ? (value.about_EN || value.about_JP || value.about) : (value.about_JP || value.about_EN || value.about);

			// value 自体がマスク表現の場合
			if (isPlainObject(base) && typeof base.hideText === 'string' && base.hideText.trim()) {
				return formatMaskedDisplayValue(base.hideText);
			}

			const isPrimitive = (v) => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean');
			const baseRaw = isPrimitive(base) ? String(base).trim() : '';
			let displayText = baseRaw;

			// Enum/List の value を辞書解決（GenderType: { value: 'Female', about_JP: '...' } など）
			if (baseRaw && opt?.fieldKey) {
				const simple = normalizeVarsDefKey(String(opt.fieldKey).split('.').pop());
				if (simple && schemaTypeIncludes(opt?.schemaType, '$EnumDef')) {
					const resolvedCode = baseRaw.startsWith('#') ? (resolveEnumKey(simple, baseRaw) || baseRaw) : baseRaw;
					const code = String(resolvedCode || '').trim();
					const pack = resolveVarsDefLabelPack(simple, code, globalDefType, workMeta, opt.fieldKey);
					const label = formatBilingualLabel(pack, code, opt?.display);
					if (label) displayText = label;
				} else if (simple && (schemaTypeIncludes(opt?.schemaType, '#ListIndex') || schemaTypeIncludes(opt?.schemaType, '#DictIndex'))) {
					const pack = resolveVarsDefLabelPack(simple, baseRaw, globalDefType, workMeta, opt.fieldKey);
					const label = formatBilingualLabel(pack, baseRaw, opt?.display);
					if (label) displayText = label;
				}
			}

			const baseWithUnit = displayText ? withUnit(displayText) : '';
			if (about && baseWithUnit) return `${baseWithUnit}（${about}）`;
			if (baseWithUnit) return baseWithUnit;
		}

		const wrappedText = getCharacterValueWrapperRegistry()?.formatWithRegisteredWrapper?.(value, {
			schemaType: opt?.schemaType,
			fieldKey: opt?.fieldKey,
			labelMap,
			workMeta,
			globalDefType,
			pageLang: _fvLang,
			typeSources: wrapperTypeSources
		});
		if (wrappedText) return wrappedText;

		if (value.Day && typeof value.Day === 'object') {
			const implicitDayText = getCharacterValueWrapperRegistry()?.formatWithRegisteredWrapper?.(value, {
				wrapperName: 'daySummary',
				defName: '$Def_Day',
				fieldKey: opt?.fieldKey,
				labelMap,
				workMeta,
				globalDefType,
				pageLang: _fvLang,
				typeSources: wrapperTypeSources
			});
			if (implicitDayText) return implicitDayText;
		}

		if (schemaTypeIncludes(opt?.schemaType, '$Def_BaseArea') && Object.prototype.hasOwnProperty.call(value, 'Area')) {
			const areaLabel = formatValueForDisplay(value.Area, labelMap, workMeta, globalDefType, {
				...opt,
				schemaType: '#DictIndex',
				fieldKey: 'Area'
			});
			const aboutValue = _fvLang === 'en' ? (value.about_EN ?? value.about_JP ?? value.about) : (value.about_JP ?? value.about_EN ?? value.about);
			const about = isPlainObject(aboutValue)
				? (typeof aboutValue.hideText === 'string' && aboutValue.hideText.trim() ? aboutValue.hideText.trim() : '')
				: (aboutValue == null ? '' : String(aboutValue).trim());
			if (areaLabel && about) return `${areaLabel}（${about}）`;
			return areaLabel;
		}

		// #ListIndex の「ラッパー（単一キーObject）」を typedef-driven に整形
		// - 例: DualizePattern: { Pattern: 'Prop.' } を #List_DualizePattern（db_meta.json）で '通常' に
		// - 例: Material: [{ Material: 'Fire' }] を #List_Material で '火' に
		// - 例: RaceType: [{ RaceType: 'Human', about_JP: '...' }] を '人間（...）' に
		if ((schemaTypeIncludes(opt?.schemaType, '#ListIndex_withAbout') || schemaTypeIncludes(opt?.schemaType, '#DictIndex_withAbout')) && opt?.fieldKey && isPlainObject(value)) {
			const simple = normalizeVarsDefKey(String(opt.fieldKey).split('.').pop());
			const about = value.about_JP || value.about_EN || value.about;
			const codeRaw = simple && Object.prototype.hasOwnProperty.call(value, simple) ? value[simple] : null;
			if (simple && (typeof codeRaw === 'string' || typeof codeRaw === 'number' || typeof codeRaw === 'boolean')) {
				const pack = resolveVarsDefLabelPack(simple, codeRaw, globalDefType, workMeta, opt.fieldKey);
				const label = formatBilingualLabel(pack, String(codeRaw).trim(), opt?.display);
				if (about && label) return `${label}（${about}）`;
				if (label) return label;
			}
		}

		if ((schemaTypeIncludes(opt?.schemaType, '#ListIndex') || schemaTypeIncludes(opt?.schemaType, '#DictIndex')) && opt?.fieldKey && isPlainObject(value)) {
			const simple = normalizeVarsDefKey(String(opt.fieldKey).split('.').pop());
			const ks = Object.keys(value).filter(k => k && typeof k === 'string' && !k.startsWith('_'));
			if (simple && ks.length === 1) {
				const leaf = ks[0];
				const raw = value?.[leaf];
				if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
					const pack = resolveVarsDefLabelPack(simple, raw, globalDefType, workMeta, opt.fieldKey);
					const text = formatBilingualLabel(pack, String(raw).trim(), opt?.display);
					if (text) return withUnit(text);
				}
			}
		}

		// #ListLink_*（EffectText/SafetyLevelText 等）のラッパーを typedef-driven に整形
		// - 例: { EffectText: '絶大' } で、db_meta.json の #ListLink_EffectText から { Rank:'S', EffectText:'絶大' } を逆引き
		// - Rank が取れる場合は alphaLabel（コード＋説明）として返す
		if (schemaTypeIncludes(opt?.schemaType, '#ListLink')) {
			const listOpt = getListLinkDisplayOpt();
			// 値が { EffectText: '...' } のような形なら、キー名から ListLink を探索する
			for (const [k, v] of Object.entries(value)) {
				const kk = String(k || '').trim();
				if (!kk || kk.startsWith('_')) continue;
				if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue;
				const vv = String(v).trim();
				if (!vv) continue;

				const item = resolveListLinkItem(kk, vv);
				if (!item || typeof item !== 'object') continue;

				const label = formatBilingualLabel({
					raw: (typeof item[kk] === 'string' && item[kk].trim()) ? item[kk].trim() : vv,
					jp: (typeof item[`${kk}_JP`] === 'string' && item[`${kk}_JP`].trim())
						? item[`${kk}_JP`].trim()
						: ((typeof item[kk] === 'string' && item[kk].trim()) ? item[kk].trim() : ''),
					en: (typeof item[`${kk}_EN`] === 'string' && item[`${kk}_EN`].trim())
						? item[`${kk}_EN`].trim()
						: ((typeof item[kk] === 'string' && item[kk].trim()) ? item[kk].trim() : '')
				}, vv, opt?.display);

				// $display で enum 併記を抑制する場合は label のみ
				if (!listOpt.showEnum) return label;

				// ListLink の項目が enum 値を持っている場合は enum 的に扱って alphaLabel を返す
				// - 既定: globalDefType に存在する Enum 名のうち、item が持つキーを優先
				// - $display.listLinkEnumName が指定されていればそれを優先
				const availableEnums = listAvailableEnumNames();
				const preferredEnum = listOpt.enumName;
				const enumCandidates = [];
				if (preferredEnum) enumCandidates.push(preferredEnum);
				for (const en of availableEnums) enumCandidates.push(en);

				for (const en of enumCandidates) {
					if (!en) continue;
					const raw = item[en];
					if (typeof raw !== 'string' || !raw.trim()) continue;
					const rawCode = raw.trim();
					const resolvedCode = resolveEnumKey(en, rawCode);
					const code = (resolvedCode || rawCode).trim();
					if (!code) continue;
					return formatEnumWithAbout(en, code, label);
				}

				// enum が取れない場合は label のみ
				return label;
			}
		}

		// $EnumDef（サフィックス無し）/ $EnumDef_withAbout の「ラッパー」を typedef-driven に整形
		// - 例: GenderType: { GenderType: 'Male', about_JP: '...' } → '男性（...）'
		if (schemaTypeIncludes(opt?.schemaType, '$EnumDef') && opt?.fieldKey && isPlainObject(value)) {
			const simple = normalizeVarsDefKey(String(opt.fieldKey).split('.').pop());
			if (simple) {
				const parts = extractEnumParts(value, simple);
				if (parts && Object.prototype.hasOwnProperty.call(parts, 'hideText')) {
					return formatMaskedDisplayValue(parts.hideText);
				}
				if (parts && Object.prototype.hasOwnProperty.call(parts, 'code')) {
					const resolvedCode = parts.code.startsWith('#') ? (resolveEnumKey(simple, parts.code) || parts.code) : parts.code;
					const code = String(resolvedCode || '').trim();
					if (!code) return '';

					const pack = resolveVarsDefLabelPack(simple, code, globalDefType, workMeta, opt.fieldKey);
					const label = formatBilingualLabel(pack, code, opt?.display);
					if (parts.about) return `${label}（${parts.about}）`;
					return label;
				}
			}
		}

		// $EnumDef_*（Rank/Rarity 等）に追従して整形（typedef-driven）
		if (schemaTypeIncludes(opt?.schemaType, '$EnumDef_')) {
			const enumName = pickEnumNameFromSchemaType(opt?.schemaType);
			if (enumName) {
				const parts = extractEnumParts(value, enumName);
				if (parts && Object.prototype.hasOwnProperty.call(parts, 'hideText')) {
					return formatMaskedDisplayValue(parts.hideText);
				}
				if (parts && Object.prototype.hasOwnProperty.call(parts, 'code')) {
					const resolved = resolveEnumKey(enumName, parts.code);
					const code = (resolved || parts.code).trim();
					if (!code) return '';

					let linkedLabel = '';
					if (schemaTypeIncludes(opt?.schemaType, '$EnumLink') && opt?.fieldKey) {
						const linkedPack = resolveEnumLinkLabelPack(opt.fieldKey, enumName, code);
						linkedLabel = formatBilingualLabel(linkedPack, code, opt?.display);
					}

					const enumPack = resolveVarsDefLabelPack(enumName, code, globalDefType, workMeta, opt.fieldKey);
					const enumLabel = formatBilingualLabel(enumPack, code, opt?.display);

					// label も about もある場合は両方出せるように合成（/ 区切り）
					const resolvedLabel = linkedLabel || ((enumLabel && enumLabel !== code) ? enumLabel : '');
					const aboutText = resolvedLabel
						? (parts.about ? `${resolvedLabel} / ${parts.about}` : resolvedLabel)
						: parts.about;

					// 既定（互換）: EnumLink があれば label 扱い（コード優先ではなく、人間向け表記を優先）
					const fmt = normalizeEnumFormat(getEnumFormatFor(enumName));
					if (resolvedLabel && !fmt) return formatEnumWithAbout(enumName, code, aboutText);
					return formatEnumWithAbout(enumName, code, aboutText);
				}
			}

			// 互換保険（古い Rank オブジェクト形が来た場合）
			if (schemaTypeIncludes(opt?.schemaType, '$EnumDef_Rank')) {
				const rankText = formatRankLike(value);
				if (rankText) return rankText;
			}
		}

		// Handle objects with common text patterns
		const _objLang = getCurrentPageLanguage();
		if (value.Rank && value.EffectText) {
			const effectLabel = _objLang === 'en'
				? (value.EffectText_EN || value.EffectText_JP || value.EffectText)
				: (value.EffectText_JP || value.EffectText);
			return `${value.Rank} (${effectLabel})`;
		}

		if (value.Rank && value.SafetyLevelText) {
			const safetyLabel = _objLang === 'en'
				? (value.SafetyLevelText_EN || value.SafetyLevelText_JP || value.SafetyLevelText)
				: (value.SafetyLevelText_JP || value.SafetyLevelText);
			return `${value.Rank} (${safetyLabel})`;
		}

		if (value.Rank && value.AbilityText) {
			const abilityLabel = _objLang === 'en'
				? (value.AbilityText_EN || value.AbilityText_JP || value.AbilityText)
				: (value.AbilityText_JP || value.AbilityText);
			return `${value.Rank} (${abilityLabel})`;
		}

		// Handle global definition lookups
		if (globalDefType && globalDefType.General && globalDefType.General.$VarsDef) {
			const varsDef = globalDefType.General.$VarsDef;

			// Check if this matches a global enum pattern
			for (const [enumKey, enumDef] of Object.entries(varsDef)) {
				if (enumKey.startsWith('$EnumDef_') && typeof enumDef === 'object') {
					for (const [valueKey, valueDef] of Object.entries(enumDef)) {
						if (typeof valueDef === 'object' && Object.values(valueDef).some(v => v === value.GenderType || v === value.RaceType || v === value.Progress)) {
							const _targetSuffix = _objLang === 'en' ? '_EN' : '_JP';
							const _targetField = Object.keys(valueDef).find(k => k.endsWith(_targetSuffix));
							if (_targetField && valueDef[_targetField]) return valueDef[_targetField];
							const _jpField = Object.keys(valueDef).find(k => k.endsWith('_JP'));
							if (_jpField && valueDef[_jpField]) return valueDef[_jpField];
						}
					}
				}
			}

			// Check if this matches a global list pattern
			for (const [listKey, listDef] of Object.entries(varsDef)) {
				if (listKey.startsWith('#List_') && Array.isArray(listDef)) {
					for (const item of listDef) {
						if (typeof item === 'object' && Object.values(item).some(v => v === value.Area || v === value.Belonging || v === value.RaceType)) {
							const _targetSuffix = _objLang === 'en' ? '_EN' : '_JP';
							const _targetField = Object.keys(item).find(k => k.endsWith(_targetSuffix));
							if (_targetField && item[_targetField]) return item[_targetField];
							const _jpField = Object.keys(item).find(k => k.endsWith('_JP'));
							if (_jpField && item[_jpField]) return item[_jpField];
						}
					}
				}
			}
		}

		// 言語優先の _JP/_EN キーフォールバック
		const _primarySuffix = _objLang === 'en' ? '_EN' : '_JP';
		const _fallbackSuffix = _objLang === 'en' ? '_JP' : '_EN';
		const _primaryKeys = Object.keys(value).filter(k => k.endsWith(_primarySuffix));
		if (_primaryKeys.length > 0) {
			const _primaryVals = _primaryKeys.map(k => value[k]).filter(v => v);
			if (_primaryVals.length > 0) return _primaryVals.join(', ');
		}
		const _fallbackKeys = Object.keys(value).filter(k => k.endsWith(_fallbackSuffix));
		if (_fallbackKeys.length > 0) {
			return _fallbackKeys.map(k => value[k]).filter(v => v).join(', ');
		}

		// Try common text fields
		const textFields = ['Text', 'Name', 'Label', 'Value', 'Material', 'Pattern'];
		for (const field of textFields) {
			if (value[field]) {
				return String(value[field]);
			}
		}

		// Fallback: show non-empty primitive values
		const primitives = Object.entries(value)
			.filter(([k, v]) => typeof v === 'string' || typeof v === 'number')
			.filter(([k, v]) => v !== '' && v !== null && v !== undefined)
			.map(([k, v]) => v);

		if (primitives.length > 0) {
			return primitives.join(', ');
		}

		// Deep fallback: nested object/array の葉を抽出して `[object Object]` を回避
		const keys = Object.keys(value);
		const onlyPrivate = keys.length > 0 && keys.every(k => String(k).startsWith('_'));
		const leaf = [];
		collectLeafText(value, { includePrivate: onlyPrivate, depth: 4, maxItems: 40 }, 0, leaf);
		if (leaf.length > 0) {
			// 同一要素が多い場合を軽く圧縮
			const uniq = Array.from(new Set(leaf));
			return uniq.join(', ');
		}

		// 最終フォールバック: JSON（短縮）
		try {
			const json = JSON.stringify(value);
			if (typeof json === 'string' && json.length <= 240) return json;
			if (typeof json === 'string') return `${json.slice(0, 240)}…`;
		} catch (e) {
			// ignore
		}
	}

	return String(value);
}

/**
 * 改行を保持してテキストを表示するためのノードを作成
 * @param {string} text - 表示文字列
 * @returns {HTMLElement}
 */
function preWrapText(text) {
	return el('div', { style: 'white-space: pre-wrap;' }, [String(text ?? '')]);
}

/**
 * 改行を含む日英ペアを 2 列レイアウトで表示するノードを構築
 * @param {string} jpText
 * @param {string} enText
 * @returns {HTMLElement}
 */
function bilingualColumnsText(jpText, enText) {
	const splitLines = (text) => String(text ?? '')
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean);

	const buildColumn = (lines, langClass) => el('div', {
		class: `bilingual-lines bilingual-lines--${langClass}`
	}, lines.map(line => el('div', { class: 'bilingual-lines__line' }, [line])));

	return el('div', { class: 'bilingual-lines-grid' }, [
		buildColumn(splitLines(jpText), 'jp'),
		buildColumn(splitLines(enText), 'en')
	]);
}

/**
 * 台詞系テキストの本文ノードを構築する
 * - `#Dialogue` は Relation.Comments と同じ本文表現へ寄せる
 * @param {string} text
 * @returns {HTMLElement}
 */
function dialogueBodyText(text) {
	return preWrapText(String(text ?? ''));
}

function resolveWorkDirName(workId) {
	return String(workId || '').replace('#Works_', 'Works_');
}

/**
 * Enhanced image gallery building with dynamic field resolution
 * Creates gallery items with appropriate URLs based on extracted image fields
 * @param {string} workId - Work ID
 * @param {Object} record - Character record
 * @param {Array} imageFields - Image field specifications from extractImageFields
 * @param {string} dbName - Database name (e.g., 'Primary', 'Secondary', etc.)
 * @returns {Array} Array of {url, caption, type, alt, category} objects
 */
function buildImageGallery(workId, record, imageFields, dbName = 'Primary', layer = '') {
	const wdir = resolveWorkDirName(workId);
	const images = [];
	// Support common "Images" key variants (typos / case)
	const imgData = getRecordImages(record);

	console.log('🖼️ Enhanced gallery building:', {
		workId,
		dbName,
		fieldCount: imageFields.length,
		recordName: record.Name || record.FormalName || 'Unknown',
		imgData
	});

	// Sort image fields by priority for consistent ordering
	const sortedFields = [...imageFields].sort((a, b) => {
		if (a.priority !== b.priority) return a.priority - b.priority;
		return a.field.localeCompare(b.field);
	});

	for (const field of sortedFields) {
		const value = imgData[field.field];
		if (!value) {
			console.log(`⚠️ No value for image field: ${field.field}`);
			continue;
		}

		const isArray = field.type.includes('[]') || Array.isArray(value);
		const values = isArray ? (Array.isArray(value) ? value : [value]) : [value];

		console.log(`🔍 Processing field '${field.field}' (category: ${field.category}):`, {
			value,
			isArray,
			values,
			priority: field.priority
		});

		for (let i = 0; i < values.length; i++) {
			const val = values[i];
			if (!val) continue;
			const lang = getCurrentPageLanguage();
			const fieldLabel = (lang === 'en')
				? (field.labelEN || field.labelJP || field.label || field.field)
				: (field.labelJP || field.labelEN || field.label || field.field);

			// Use the enhanced buildImagePath function
			const url = buildImagePath(wdir, dbName, field, val, layer);

			if (url) {
				const imageItem = {
					url,
					caption: fieldLabel + (isArray && values.length > 1 ? ` (${i + 1}/${values.length})` : ''),
					type: field.field,
					alt: `${fieldLabel} - ${record.Name || record.FormalName || 'Character'}`,
					category: field.category,
					priority: field.priority
				};

				images.push(imageItem);
				console.log(`✅ Added gallery image: ${field.field} -> ${url}`);
			} else {
				console.log(`❌ Failed to build path for field: ${field.field}, value: ${val}`);
			}
		}
	}

	// Also add any unrecognized image fields as fallback
	for (const [key, value] of Object.entries(imgData)) {
		// Skip if already processed by field definitions
		if (sortedFields.some(f => f.field === key)) continue;

		// Only process fields that look like image fields
		const keyLower = key.toLowerCase();
		if (keyLower.includes('png') || keyLower.includes('image') || keyLower.includes('photo')) {
			const vals = Array.isArray(value) ? value : [value];

			for (let i = 0; i < vals.length; i++) {
				const val = vals[i];
				if (!val) continue;

				// Create a fallback field definition
				const fallbackField = {
					field: key,
					category: 'other',
					priority: 99,
					label: key
				};

				const url = buildImagePath(wdir, dbName, fallbackField, val, layer);
				if (url) {
					const imageItem = {
						url,
						caption: `${key}${vals.length > 1 ? ` (${i + 1}/${vals.length})` : ''}`,
						type: key,
						alt: `${key} - ${record.Name || record.FormalName || 'Character'}`,
						category: 'other',
						priority: 99
					};

					images.push(imageItem);
					console.log(`✅ Added fallback gallery image: ${key} -> ${url}`);
				}
			}
		}
	}

	console.log(`🖼️ Final gallery: ${images.length} images built`);
	return images;
}

/**
 * レコードから画像コンテナ（Images）を安全に取得
 * @param {Object} rec - レコード
 * @returns {Object} 画像コンテナ（存在しない場合は空オブジェクト）
 */
function getRecordImages(rec) {
	if (!rec || typeof rec !== 'object') return {};
	// 正式: Images
	if (rec.Images && typeof rec.Images === 'object') return rec.Images;
	// ありがちな揺れ・誤字
	if (rec.images && typeof rec.images === 'object') return rec.images;
	if (rec.Iamges && typeof rec.Iamges === 'object') return rec.Iamges;
	if (rec.Image && typeof rec.Image === 'object') return rec.Image;
	return {};
}

/**
 * UI Display Utilities
 */

/**
 * Convert work object to human-readable label
 * @param {Object} work - Work object with WorkKey and Title properties
 * @returns {string} Human-readable work label
 */
function humanWorkLabel(work) {
	const lang = getCurrentPageLanguage();
	const t = (lang === 'en')
		? (work.Title_EN || work.Title_JP || work.key || '')
		: (work.Title_JP || work.Title_EN || work.key || '');
	return `${t} (${work.key.replace('#Works_', '')})`;
}

function getStoryEraSummary(storyEra) {
	return String(formatValueForDisplay(storyEra, {}, null, null, {
		schemaType: '$Def_StoryEraCatalog|#Null',
		fieldKey: 'StoryEra'
	}) || '').trim();
}

function formatOldTitles(oldTitles) {
	if (!Array.isArray(oldTitles) || oldTitles.length === 0) return '';
	const lang = getCurrentPageLanguage();
	return oldTitles
		.map((entry) => {
			if (!entry || typeof entry !== 'object') return '';
			const label = lang === 'en'
				? String(entry.Title_EN || entry.Title_JP || '').trim()
				: String(entry.Title_JP || entry.Title_EN || '').trim();
			const year = entry.ArchivedYear == null ? '' : ` (${entry.ArchivedYear})`;
			if (!label) return '';
			return lang === 'en' ? `Old title: ${label}${year}` : `旧題: ${label}${year}`;
		})
		.filter(Boolean)
		.join('\n');
}

function setTextAndHidden(selector, text) {
	const node = $(selector);
	if (!node) return;
	const normalized = String(text || '').trim();
	node.textContent = normalized;
	node.hidden = !normalized;
}

function getUiCopyByLanguage(lang) {
	if (lang === 'en') {
		return {
			title: 'Character Sheet Viewer',
			lead: 'This page builds character sheets from /data/** through the in-browser Service Worker APIs: /pages/v1/* (primary), /svc/v1/* (alias), and /api/v1/* (legacy).',
			work: 'Works',
			db: 'DB',
			search: 'Filter (name/index substring)',
			searchPlaceholder: 'e.g. Tsugu / 2 / Unitta',
			resolve: 'Enable reference resolution (recommended)',
			debug: 'Debug info',
			metaWork: 'Work Info',
			metaDb: 'DB Info',
			listTitle: 'Character List',
			listEmpty: 'No matching characters were found.',
			back: '<- Back to list',
			reset: 'Reset Cache/SW',
			resetTitle: 'Reset caches and Service Worker, then reload.',
			langTitle: 'Switch page language to Japanese (日本語).'
		};
	}

	return {
		title: '創作キャラ・キャラシート',
		lead: '本ページはクライアント内API（Service Worker）/pages/v1/*（優先）、/svc/v1/*（別名）、/api/v1/*（レガシー）のいずれかを用い、/data/** の情報からキャラシートを生成します。',
		work: '作品（Works）',
		db: 'DB',
		search: '絞り込み（名前/番号 など 部分一致）',
		searchPlaceholder: '例: ツグ / 2 / Unitta',
		resolve: '参照解決を有効化（推奨）',
		debug: 'デバッグ情報',
		metaWork: '作品情報',
		metaDb: 'DB情報',
		listTitle: 'キャラクター一覧',
		listEmpty: '該当するキャラクターが見つかりませんでした。',
		back: '← 一覧へ戻る',
		reset: 'キャッシュ/SWリセット',
		resetTitle: 'キャッシュとService Workerをリセットしてリロードします',
		langTitle: '表示言語を英語 (English) へ切り替え',
	};
}

function applyStaticTextLanguage() {
	const lang = getCurrentPageLanguage();
	const copy = getUiCopyByLanguage(lang);

	const setText = (selector, text) => {
		const node = $(selector);
		if (!node) return;
		node.textContent = text;
	};

	setText('#page-title', copy.title);
	setText('#page-lead', copy.lead);
	setText('#label-work', copy.work);
	setText('#label-db', copy.db);
	setText('#label-search', copy.search);
	setText('#label-resolve', copy.resolve);
	setText('#label-debug', copy.debug);
	setText('#label-meta-work', copy.metaWork);
	setText('#label-meta-db', copy.metaDb);
	setText('#label-list-title', copy.listTitle);
	setText('#list-empty', copy.listEmpty);
	setText('#btn-back', copy.back);
	setText('#btn-reset-sw', copy.reset);

	const searchInput = $('#search-input');
	if (searchInput) searchInput.placeholder = copy.searchPlaceholder;

	const resetBtn = $('#btn-reset-sw');
	if (resetBtn) resetBtn.title = copy.resetTitle;

	const langBtn = $('#btn-lang-toggle');
	if (langBtn) {
		langBtn.title = copy.langTitle;
	}

	document.title = `${copy.title} | 100BeautiesLab Creations DB`;
}

async function renderSelectionMeta(workKey, dbKey) {
	const root = $('#meta-overview');
	if (!root) return;

	const [works, dbs] = await Promise.all([
		listWorks(),
		listWorkDBs(workKey)
	]);

	const work = Array.isArray(works)
		? works.find((item) => item?.key === normalizeWorkKey(workKey)) || null
		: null;
	const db = Array.isArray(dbs)
		? dbs.find((item) => item?.key === dbKey) || null
		: null;

	if (!work && !db) {
		root.hidden = true;
		return;
	}

	const lang = getCurrentPageLanguage();
	$('#meta-work-title').textContent = (lang === 'en')
		? (work?.Title_EN || work?.Title_JP || normalizeWorkKey(workKey) || '-')
		: (work?.Title_JP || work?.Title_EN || normalizeWorkKey(workKey) || '-');
	setTextAndHidden('#meta-work-sub', [lang === 'en' ? work?.Title_JP : work?.Title_EN, formatOldTitles(work?.OldTitles)].filter(Boolean).join('\n'));
	setTextAndHidden('#meta-work-summary', (lang === 'en') ? (work?.Works_Summary_EN || work?.Works_Summary_JP || '') : (work?.Works_Summary_JP || work?.Works_Summary_EN || ''));

	$('#meta-db-title').textContent = getDbDisplayLabel(db, dbKey || '-');
	setTextAndHidden('#meta-db-era', getStoryEraSummary(db?.StoryEra));
	setTextAndHidden('#meta-db-summary', (lang === 'en')
		? (db?.DB_Summary_EN || db?.SecondarySummary_EN || db?.DB_Summary || db?.SecondarySummary || '')
		: (db?.DB_Summary || db?.SecondarySummary || db?.DB_Summary_EN || db?.SecondarySummary_EN || ''));

	root.hidden = false;
}

/**
 * Get primary image for character list thumbnail
 * @param {string} workId - Work ID
 * @param {Object} rec - Character record
 * @returns {string} Image URL or empty string
 */

/**
 * Enhanced unified image resolution system
 * Dynamically resolves image paths based on extracted image fields and database structure
 * @param {string} workId - Work identifier (e.g., '#Works_NumberTales')
 * @param {Object} rec - Character record with Images field
 * @param {string} dbName - Database name (e.g., 'Primary', 'Secondary', etc.)
 * @param {Array} imageFields - Optional extracted image fields for this work
 * @returns {string} Image URL or empty string if no image found
 */
async function imageFromRecord(workId, rec, dbName = 'Primary', imageFields = null, layer = '') {
	const wdir = resolveWorkDirName(workId);
	const img = getRecordImages(rec);

	console.log('🖼️ Enhanced image resolution for record:', {
		workId,
		dbName,
		img,
		recordName: rec.Name_JP || rec.FormalName_JP || rec.Name_EN || 'Unknown',
		hasImageFields: !!imageFields
	});

	// If image fields provided, use dynamic resolution
	if (imageFields && imageFields.length > 0) {
		console.log('📋 Using dynamic image field resolution...');
		const primaryImage = await resolveImageFromFields(workId, rec, dbName, imageFields, layer);
		if (primaryImage) {
			console.log('✅ Found image via dynamic resolution:', primaryImage);
			return primaryImage;
		}
	}

	// Fallback to legacy static resolution with enhanced flexibility
	console.log('🔄 Using enhanced static image resolution...');
	return resolveImageStatically(workId, rec, dbName, layer);
}

/**
 * Resolve image using dynamically extracted image fields
 * @param {string} workId - Work identifier
 * @param {Object} rec - Character record
 * @param {string} dbName - Database name
 * @param {Array} imageFields - Extracted image field definitions
 * @returns {Promise<string>} Image URL or empty string
 */
async function resolveImageFromFields(workId, rec, dbName, imageFields, layer = '') {
	const wdir = resolveWorkDirName(workId);
	const img = getRecordImages(rec);

	// Sort image fields by priority for thumbnail selection
	const sortedFields = [...imageFields].sort((a, b) => a.priority - b.priority);

	for (const field of sortedFields) {
		const fieldValue = img[field.field];
		if (!fieldValue) continue;

		console.log(`🔍 Checking field '${field.field}' (priority: ${field.priority}):`, fieldValue);

		// Handle array values (take first item)
		const value = Array.isArray(fieldValue) ? fieldValue[0] : fieldValue;
		if (!value) continue;

		// Build image URL based on field category and type
		const imageUrl = buildImagePath(wdir, dbName, field, value, layer);
		if (imageUrl) {
			console.log(`✅ Built image URL for field '${field.field}':`, imageUrl);
			return imageUrl;
		}
	}

	console.log('❌ No image found via dynamic field resolution');
	return '';
}

/**
 * Build image path based on field definition and value
 * @param {string} wdir - Work directory name
 * @param {string} dbName - Database name
 * @param {Object} field - Image field definition
 * @param {string} value - Field value
 * @returns {string} Complete image path or empty string
 */
function buildImagePath(wdir, dbName, field, value, layer = '') {
	if (!value) return '';
	const imageDbDir = mapDbNameToImageDir(dbName, layer);
	const explicitFolderHint = typeof field?.folderHint === 'string' && field.folderHint.trim()
		? field.folderHint.trim()
		: inferImageFolderHint(field?.field || '');

	console.log('🔍 Building image path:', { field: field.field, category: field.category, value });

	// Determine file extension (prefer type-driven default)
	const normalizeSlashes = (p) => String(p || '').replace(/\\/g, '/');
	const lower = (s) => String(s || '').toLowerCase();
	const hasAnyExtension = (v) => /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(String(v || ''));
	const pickDefaultExtension = () => {
		const t = lower(field?.type);
		if (t.includes('jpg') || t.includes('jpeg')) return '.jpg';
		if (t.includes('webp')) return '.webp';
		if (t.includes('gif')) return '.gif';
		if (t.includes('svg')) return '.svg';
		return '.png';
	};
	const defaultExt = pickDefaultExtension();
	const appendExtIfMissing = (p) => {
		if (!p) return p;
		return hasAnyExtension(p) ? p : `${p}${defaultExt}`;
	};

	// Directory segment normalization for GitHub Pages (case-sensitive)
	// NOTE: 末尾(ファイル名)はケースを変更しない
	const CANON_DIR_SEGMENTS = [
		'arts', 'concept', 'conceptAlt', 'design', 'designAlt', 'cardDesign', 'catalog', 'corefolder',
		// NumberTales で実在することが多いサブディレクトリ
		'autumnMoon', 'corefolders', 'humanoids', 'newYear'
	];
	const normalizeDirSegments = (relPath) => {
		const parts = normalizeSlashes(relPath).split('/').filter(Boolean);
		if (parts.length <= 1) return parts.join('/');
		const out = parts.map((seg, idx) => {
			if (idx === parts.length - 1) return seg; // file name
			const segLower = seg.toLowerCase();
			const canon = CANON_DIR_SEGMENTS.find(c => c.toLowerCase() === segLower);
			return canon || seg;
		});
		return out.join('/');
	};

	// Determine directory based on field category and name
	let directory = explicitFolderHint || '';
	const fieldLower = field.field.toLowerCase();

	if (!directory && field.category === 'concept') {
		directory = fieldLower.includes('alt') ? 'conceptAlt' : 'concept';
	} else if (!directory && field.category === 'design') {
		directory = fieldLower.includes('alt') ? 'designAlt' : 'design';
	} else if (!directory && field.category === 'arts') {
		directory = 'arts';
	} else if (!directory && field.category === 'card') {
		directory = 'cardDesign';
	} else if (!directory && field.category === 'catalog') {
		directory = 'catalog';
	} else if (!directory && field.category === 'core') {
		directory = 'corefolder';
	} else if (!directory && field.category === 'general') {
		directory = 'General';
	} else if (!directory) {
		// Try to infer from field name with specific matches first
		if (fieldLower.includes('carddesign')) {
			directory = 'cardDesign';
		} else if (fieldLower.includes('conceptalt')) {
			directory = 'conceptAlt';
		} else if (fieldLower.includes('designalt')) {
			directory = 'designAlt';
		} else if (fieldLower.includes('concept')) {
			directory = fieldLower.includes('alt') ? 'conceptAlt' : 'concept';
		} else if (fieldLower.includes('design')) {
			directory = fieldLower.includes('alt') ? 'designAlt' : 'design';
		} else if (fieldLower.includes('card')) {
			directory = 'cardDesign';
		} else if (fieldLower.includes('arts') || fieldLower.includes('art')) {
			directory = 'arts';
		} else if (fieldLower.includes('catalog')) {
			directory = 'catalog';
		} else if (fieldLower.includes('core')) {
			directory = 'corefolder';
		} else {
			directory = 'concept'; // Default fallback
		}
	}

	// Handle path-based values
	const normalizedValue = normalizeSlashes(value).replace(/^\/+/, '');
	if (normalizedValue.includes('/')) {
		// Value contains a subpath. Treat it as relative to the category directory (arts/design/...)
		// and ensure extension is present.
		const isGeneral = field.category === 'general' || directory === 'General';

		// If the value already starts with the directory (e.g. 'arts/foo'), strip it to avoid duplication.
		let rel = normalizedValue;
		if (!isGeneral && directory) {
			const dirPrefixLower = `${directory.toLowerCase()}/`;
			if (rel.toLowerCase().startsWith(dirPrefixLower)) {
				rel = rel.slice(directory.length + 1);
			}
		}

		rel = normalizeDirSegments(rel);
		rel = appendExtIfMissing(rel);

		if (isGeneral) {
			return `/data/${wdir}/Images/General/${rel}`;
		}
		return `/data/${wdir}/Images/${imageDbDir}/${directory}/${rel}`;
	}

	// Build standard path
	const finalPath = field.category === 'general' || directory === 'General'
		? `/data/${wdir}/Images/General/${appendExtIfMissing(normalizedValue)}`
		: `/data/${wdir}/Images/${imageDbDir}/${directory}/${appendExtIfMissing(normalizedValue)}`;

	console.log('📁 Final image path:', { field: field.field, category: field.category, directory, finalPath });

	return finalPath;
}

/**
 * Enhanced static image resolution with better fallback support
 * @param {string} workId - Work identifier
 * @param {Object} rec - Character record
 * @param {string} dbName - Database name
 * @returns {string} Image URL or empty string
 */
function resolveImageStatically(workId, rec, dbName, layer = '') {
	const wdir = resolveWorkDirName(workId);
	const img = getRecordImages(rec);
	const imageDbDir = mapDbNameToImageDir(dbName, layer);

	console.log('🔧 Enhanced static resolution for:', {
		workId,
		dbName,
		img,
		hasImages: !!(rec && (rec.Images || rec.images || rec.Iamges || rec.Image)),
		hasImage: !!rec.Image,
		availableFields: Object.keys(img),
		recordName: rec.Name_JP || rec.FormalName_JP || rec.Name_EN || 'Unknown'
	});

	// Enhanced priority list with more field types
	const imageResolvers = [
		// Concept images (highest priority)
		() => img.concept_PNGName ? `/data/${wdir}/Images/${imageDbDir}/concept/${img.concept_PNGName}.png` : null,
		() => {
			if (img.conceptAlt_PNGName) {
				const val = Array.isArray(img.conceptAlt_PNGName) ? img.conceptAlt_PNGName[0] : img.conceptAlt_PNGName;
				return `/data/${wdir}/Images/${imageDbDir}/conceptAlt/${val}.png`;
			}
			return null;
		},

		// Design images
		() => {
			if (img.design_PNGName) {
				const path = `/data/${wdir}/Images/${imageDbDir}/design/${img.design_PNGName}.png`;
				console.log('🎨 Design image path resolved:', { field: 'design_PNGName', value: img.design_PNGName, path });
				return path;
			}
			return null;
		},
		() => {
			if (img.cardDesign_PNGName) {
				const path = `/data/${wdir}/Images/${imageDbDir}/cardDesign/${img.cardDesign_PNGName}.png`;
				console.log('🃏 Card design image path resolved:', { field: 'cardDesign_PNGName', value: img.cardDesign_PNGName, path });
				return path;
			}
			return null;
		},
		() => {
			if (img.designAlt_PNGName) {
				const val = Array.isArray(img.designAlt_PNGName) ? img.designAlt_PNGName[0] : img.designAlt_PNGName;
				return `/data/${wdir}/Images/${imageDbDir}/designAlt/${val}.png`;
			}
			return null;
		},
		() => {
			if (img.designAlt_PNGPath) {
				const val = Array.isArray(img.designAlt_PNGPath) ? img.designAlt_PNGPath[0] : img.designAlt_PNGPath;
				return `/data/${wdir}/Images/${imageDbDir}/designAlt/${val}.png`;
			}
			return null;
		},

		// Arts images
		() => {
			if (img.arts_PNGPath) {
				const val = Array.isArray(img.arts_PNGPath) ? img.arts_PNGPath[0] : img.arts_PNGPath;
				return `/data/${wdir}/Images/${imageDbDir}/arts/${val}.png`;
			}
			return null;
		},

		// Core folder images
		() => {
			if (img.corefolder_PNGPath) {
				const val = Array.isArray(img.corefolder_PNGPath) ? img.corefolder_PNGPath[0] : img.corefolder_PNGPath;
				return `/data/${wdir}/Images/${imageDbDir}/corefolder/${val}.png`;
			}
			return null;
		},

		// Catalog images
		() => {
			if (img.catalog_PNGPath) {
				const val = Array.isArray(img.catalog_PNGPath) ? img.catalog_PNGPath[0] : img.catalog_PNGPath;
				const ext = val.endsWith('.png') ? '' : '.png';
				return `/data/${wdir}/Images/${imageDbDir}/catalog/${val}${ext}`;
			}
			return null;
		},

		// General/poster images
		() => {
			if (img.General && img.General.poster) {
				return `/data/${wdir}/Images/General/${img.General.poster}`;
			}
			return null;
		},

		// Generic fallback - try any available image field
		() => {
			for (const [key, val] of Object.entries(img)) {
				if (val && (key.toLowerCase().includes('png') || key.toLowerCase().includes('image'))) {
					const value = Array.isArray(val) ? val[0] : val;
					if (value) {
						const ext = value.includes('.') ? '' : '.png';
						const directory = inferImageFolderHint(key) || key;
						return `/data/${wdir}/Images/${imageDbDir}/${directory}/${value}${ext}`;
					}
				}
			}
			return null;
		}
	];

	// Try each resolver in order
	for (const resolver of imageResolvers) {
		const url = resolver();
		if (url) {
			console.log('✅ Found static image:', url);
			return url;
		}
	}

	// Final fallback: try Primary folder if not already trying Primary
	if (dbName !== 'Primary') {
		console.log('🔄 Trying Primary folder fallback...');
		const fallbackUrl = resolveImageStatically(workId, rec, 'Primary');
		if (fallbackUrl) {
			console.log('✅ Found fallback image:', fallbackUrl);
			return fallbackUrl;
		}
	}

	console.log('❌ No image found for record');
	console.log('❌ No image found for record');
	return '';
}

/**
 * Load more images in gallery (performance optimization)
 * @param {string} workId - Work identifier
 * @param {Object} rec - Character record
 * @param {Array} imageFields - Image field definitions
 * @param {string} dbName - Database name
 * @param {Object} fieldLabelMap - Field label mapping
 * @param {Object} workMeta - Work metadata
 * @param {Object} globalDefType - Global type definitions
 */
function loadMoreImages(workId, rec, imageFields, dbName, fieldLabelMap, workMeta, globalDefType, layer = '') {
	const galleryImages = buildImageGallery(workId, rec, imageFields, dbName, layer);
	const imageGrid = document.querySelector('.image-grid');
	const moreButton = document.querySelector('.image-more');

	if (imageGrid && moreButton) {
		// Remove the "more" button
		moreButton.remove();

		// Add remaining images
		galleryImages.slice(6).forEach(imgData => {
			imageGrid.appendChild(createGalleryImageItem(imgData));
		});
	}
}

/**
 * Convert value to string safely
 * @param {*} v - Any value
 * @returns {string} String representation
 */

/**
 * Convert value to string safely
 * @param {*} v - Any value to convert
 * @returns {string} String representation, empty string for null/undefined
 */
function str(v) { return (v == null ? '' : String(v)); }

/**
 * Check if a record matches the search filter
 * @param {Object} rec - Character record to test
 * @param {string} q - Search query string
 * @returns {boolean} True if record matches filter
 */
function matchFilter(rec, q) {
	if (!q) return true;
	const s = q.trim().toLowerCase();
	if (!s) return true;

	const tokens = [];
	const visit = (value, depth = 0) => {
		if (depth > 6 || tokens.length > 300) return;
		if (value === null || value === undefined) return;

		if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
			tokens.push(String(value));
			return;
		}

		if (Array.isArray(value)) {
			for (const item of value) visit(item, depth + 1);
			return;
		}

		if (typeof value === 'object') {
			for (const [k, v] of Object.entries(value)) {
				if (typeof k === 'string' && k.startsWith('_')) continue;
				visit(v, depth + 1);
			}
		}
	};

	visit(rec, 0);
	return tokens.some(k => String(k).toLowerCase().includes(s));
}

/**
/**
 * 動的画像解決を含む拡張リストビューレンダリング
 * @param {Array} records - キャラクターレコードの配列
 * @param {string} workId - 作品識別子 (例: '#Works_NumberTales')
 * @param {Function} onOpen - キャラクターが選択された時のコールバック関数
 * @param {Array} imageFields - 動的解決用の抽出された画像フィールド（オプション）
 */
async function renderList(records, workId, onOpen, imageFields = null) {
	const list = $('#list');
	list.textContent = '';
	let shown = 0;
	const qs = getQS();
	const filter = (qs.q || $('#search-input').value || '').trim();

	// 作品ごとのインデックス定義（表示名含む）を取得
	const [globalMeta, globalDefType] = await Promise.all([
		fetchGlobalMeta(),
		fetchGlobalDefType()
	]);
	const indexDef = getWorkIndexField(workId, globalMeta);

	// グローバルステートから現在のデータベース名を取得
	const state = window.__CHAR_STATE__;
	const dbName = state ? state.db : 'Primary';

	// typedef-driven の $display（unit / langMode 等）をリスト側でも参照できるようにする
	const fieldDisplayMap = (() => {
		const wtd = state?.workTypeDef || null;
		const gtd = state?.globalTypeDef || null;
		if (!wtd && !gtd) return {};
		return buildFieldDisplayMap(wtd || {}, gtd || {});
	})();

	/**
	 * 一覧チップ表示では「言語モードの取りこぼし（意図せず en になる）」が起きやすいため、
	 * 既定では bilingual（JP/EN 併記）に戻す。
	 * - GenderType は実データが英語コードで、辞書に JP があることが多い。
	 * - ここで langMode が混入すると「英語コードのみ」に退避してしまう。
	 * @param {string} field
	 * @param {any} display
	 */
	const sanitizeListChipDisplay = (field, display) => {
		const f = String(field || '').trim();
		if (!display || typeof display !== 'object') return display;
		if (f !== 'GenderType') return display;
		// shallow clone して langMode を除去（他の display 設定は維持）
		const next = { ...display };
		if (Object.prototype.hasOwnProperty.call(next, 'langMode')) delete next.langMode;
		return next;
	};

	// workMeta を参照できる場合は、表示名解決（#List_*）に利用
	const workMeta = state?.workMeta || null;
	const currentLayerName = String(findDbCatalogEntry(workMeta, dbName)?.DB_Layer || '').trim();
	const metaForLookup = (() => {
		const wm = workMeta && typeof workMeta === 'object' ? workMeta : {};
		const gm = globalMeta && typeof globalMeta === 'object' ? globalMeta : {};

		const gmGeneral = (gm.General && typeof gm.General === 'object') ? gm.General : {};
		const wmGeneral = (wm.General && typeof wm.General === 'object') ? wm.General : {};

		const gmVars = (gmGeneral.$VarsDef && typeof gmGeneral.$VarsDef === 'object') ? gmGeneral.$VarsDef : {};
		const wmVars = (wmGeneral.$VarsDef && typeof wmGeneral.$VarsDef === 'object') ? wmGeneral.$VarsDef : {};

		const mergedGeneral = { ...gmGeneral, ...wmGeneral, $VarsDef: { ...gmVars, ...wmVars } };
		return { ...gm, ...wm, General: mergedGeneral };
	})();

	console.log('📋 拡張画像解決でリストをレンダリング中:', {
		recordCount: records.length,
		workId,
		dbName,
		hasImageFields: !!imageFields
	});

	// レコード数が多い場合は画像解決のためのローディングを表示
	const shouldShowProgress = records.length > 10;
	if (shouldShowProgress) {
		showLoadingIndicator('キャラクター画像を読み込んでいます...');
	}

	const filteredRecords = records.filter(r => matchFilter(r, filter));

	for (let i = 0; i < filteredRecords.length; i++) {
		const r = filteredRecords[i];
		shown++;

		// Use enhanced image resolution
		const img = await imageFromRecord(workId, r, dbName, imageFields, currentLayerName);

		const title = getRecordPrimaryTitle(r);
		const sub = getRecordSecondaryTitle(r);
		const chipEls = [];

		// Enhanced chip generation with more field types
		if (r.GenderType_JP || r.GenderType) {
			const raw = r.GenderType_JP || r.GenderType;
			const dispRaw = fieldDisplayMap.GenderType || fieldDisplayMap['GenderType'] || null;
			const text = formatValueForDisplay(raw, {}, metaForLookup, globalDefType, {
				display: sanitizeListChipDisplay('GenderType', dispRaw),
				schemaType: '$EnumDef|$EnumDef_withAbout',
				fieldKey: 'GenderType'
			});
			// 一覧側で辞書解決が外れて raw（コード）に退避していないかの切り分け用ログ
			// - デバッグON時のみ出力
			try {
				if ($('#chk-debug')?.checked) {
					const rawStr = (raw === null || raw === undefined) ? '' : String(raw).trim();
					const textStr = (text === null || text === undefined) ? '' : String(text).trim();
					const isLikelyFallback = rawStr && textStr && rawStr === textStr;
					if (isLikelyFallback) {
						const pack = resolveVarsDefLabelPack('GenderType', rawStr, globalDefType, metaForLookup, 'GenderType');
						const lm = (dispRaw && typeof dispRaw === 'object' && typeof dispRaw.langMode === 'string') ? dispRaw.langMode : '';
						console.log('📋 list GenderType fallback check:', {
							raw: rawStr,
							text: textStr,
							pack,
							hasGenderEnum: !!globalDefType?.General?.$VarsDef?.$EnumDef_GenderType,
							displayLangMode: lm,
						});
					}
				}
			} catch {
				// no-op
			}
			if (text) chipEls.push(el('span', { class: 'chip' }, text));
		}
		if (r.Class) {
			const dispRaw = fieldDisplayMap.Class || fieldDisplayMap['Class'] || null;
			const text = formatValueForDisplay(r.Class, {}, metaForLookup, globalDefType, {
				display: sanitizeListChipDisplay('Class', dispRaw),
				schemaType: '#DictIndex[]',
				fieldKey: 'Class'
			});
			if (text) chipEls.push(el('span', { class: 'chip' }, text));
		} else if (r.Class_EN) {
			chipEls.push(el('span', { class: 'chip' }, r.Class_EN));
		}
		if (r.RaceType_JP || r.RaceType) {
			const raw = r.RaceType_JP || r.RaceType;
			const text = formatValueForDisplay(raw, {}, metaForLookup, globalDefType, {
				display: fieldDisplayMap.RaceType || fieldDisplayMap['RaceType'] || null,
				schemaType: '#ListIndex|#ListIndex_withAbout[]',
				fieldKey: 'RaceType'
			});
			if (text) chipEls.push(el('span', { class: 'chip' }, text));
		}

		// Index chip (schema-driven via typedef $IndexDef)
		const indexChipItems = buildIndexChipItems(r, indexDef, metaForLookup, globalDefType, 'list');
		if (indexChipItems.length) {
			const cur = getQS();
			const db = window?.__CHAR_STATE__?.db || cur.db || 'Primary';
			for (const item of indexChipItems) {
				const legacyNum = item.keyPath === 'Num' ? item.value : '';
				const href = (() => {
					const qs = new URLSearchParams({
						...cur,
						work: workId,
						db,
						idx: item.value,
						idxKey: item.keyPath,
						num: legacyNum,
					});
					return `${location.pathname}?${qs.toString()}`;
				})();

				chipEls.push(
					item?.contexts?.link
						? el('a', {
							class: 'chip accent',
							href,
							title: '直リンクをコピーできます',
							onclick: (ev) => {
								ev.preventDefault();
								ev.stopPropagation();
								onOpen(r);
							}
						}, [item.text])
						: el('span', { class: 'chip accent' }, item.text)
				);
			}
		}

		const item = el('article', {
			class: 'grid-item fade-in',
			role: 'button',
			tabindex: 0,
			style: `animation-delay: ${Math.min(i * 0.05, 1)}s`,
			onkeydown: (ev) => { if (ev.key === 'Enter') onOpen(r); },
			onclick: () => onOpen(r)
		}, [
			img ? el('img', {
				class: 'thumb',
				alt: `${title} thumbnail`,
				src: img,
				loading: 'lazy' // Add lazy loading for performance
			}) : el('div', { class: 'thumb placeholder' }, ['画像なし']),
			el('h3', {}, [title]),
			sub ? el('div', { class: 'sub' }, [sub]) : null,
			chipEls.length ? el('div', { class: 'meta' }, chipEls) : null
		]);

		list.appendChild(item);

		// Progressive rendering: update UI every 5 items for better perceived performance
		if (shouldShowProgress && i % 5 === 0) {
			await new Promise(resolve => setTimeout(resolve, 0)); // Allow UI update
		}
	}

	if (shouldShowProgress) {
		hideLoadingIndicator();
	}

	$('#list-empty').hidden = shown > 0;
	console.log(`✅ Rendered ${shown} characters with enhanced image resolution`);
}

export async function __renderListForTest(records, workId, options = {}) {
	const onOpen = typeof options?.onOpen === 'function' ? options.onOpen : (() => { });
	const imageFields = Array.isArray(options?.imageFields) ? options.imageFields : [];
	return renderList(records, workId, onOpen, imageFields);
}

/**
 * Create a key-value table element
 * @param {Object} obj - Base object (unused in current implementation)
 * @param {Array} entries - Array of [key, value] pairs to display
 * @returns {HTMLElement} Table element with key-value rows
 */
function kvTable(obj, entries) {
	const rows = entries.filter(Boolean).map(([k, v]) => {
		const text = typeof v === 'string' ? v : '';
		const cellValue = (typeof text === 'string' && text.includes('\n')) ? preWrapText(text) : (v ?? '');
		return el('tr', {}, [el('th', {}, [k]), el('td', {}, [cellValue])]);
	});
	return el('table', { class: 'kv-table' }, rows);
}

/**
/**
 * 包括的な情報と画像ギャラリーを含む詳細キャラクタービューをレンダリング
 * @param {string} workId - 作品識別子 (例: '#Works_NumberTales')
 * @param {Object} rec - すべてのデータフィールドを含むキャラクターレコード
 * @returns {Promise<void>} 詳細ビューのDOMを更新する非同期関数
 */
export async function renderDetail(workId, rec) {
	// レコード未指定時は、現在ステートの先頭レコードへフォールバックする
	// （テスト/直リンク遷移の揺れで undefined が渡っても、即時「非公開」扱いにしない）
	if (!rec || typeof rec !== 'object') {
		const fallbackRecord = Array.isArray(window?.__CHAR_STATE__?.records)
			? window.__CHAR_STATE__.records[0]
			: null;
		if (fallbackRecord && typeof fallbackRecord === 'object') rec = fallbackRecord;
	}

	if (!isPublicCharacterRecord(rec)) {
		$('#detail-title').textContent = '非公開';
		const mount = $('#detail');
		mount.textContent = '';
		mount.appendChild(el('div', {
			style: 'padding: 20px; text-align: center; color: var(--muted);'
		}, ['このキャラクターは非公開です。']));
		return;
	}

	const detailTitleBase = getRecordPrimaryTitle(rec);
	$('#detail-title').textContent = detailTitleBase || '詳細';
	const mount = $('#detail');
	mount.textContent = '';

	// 現在のデータベース名と拡張ステートを取得
	const state = window.__CHAR_STATE__;
	const dbName = state ? state.db : 'Primary';
	const cachedImageFields = state ? state.imageFields : null;
	const cachedWorkTypeDef = state ? state.workTypeDef : null;
	const cachedGlobalTypeDef = state ? state.globalTypeDef : null;
	const cachedWorkMeta = state ? state.workMeta : null;

	try {
		// 詳細ビューの最小限のローディング表示
		mount.textContent = '';
		mount.appendChild(el('div', {
			style: 'padding: 20px; text-align: center; color: var(--muted);'
		}, ['詳細情報を読み込んでいます...']));

		// Use cached data when available, otherwise fetch
		const [rawWorkTypeDef, globalTypeDef, globalDefType, workMeta, globalMeta] = await Promise.all([
			cachedWorkTypeDef || fetchWorkTypeDef(workId),
			cachedGlobalTypeDef || fetchGlobalTypeDef(),
			fetchGlobalDefType(),
			cachedWorkMeta || fetchWorkMeta(workId),
			fetchGlobalMeta()
		]);

		const dbCatalogEntry = findDbCatalogEntry(workMeta, dbName);
		const currentLayerName = String(dbCatalogEntry?.DB_Layer || '').trim();
		const [sharedLayerTypeDef, workLayerTypeDef] = currentLayerName
			? await Promise.all([
				fetchSharedLayerTypeDef(currentLayerName),
				fetchWorkLayerTypeDef(workId, currentLayerName)
			])
			: [{}, {}];
		const layeredTypeDef = mergeTypeDefSources(workLayerTypeDef, sharedLayerTypeDef);
		const workTypeDef = mergeTypeDefSources(rawWorkTypeDef, layeredTypeDef);

		// workMeta / globalMeta の $VarsDef を統合（EnumLink / ListLink の共通辞書を参照しやすくする）
		const metaForLookup = (() => {
			const wm = workMeta && typeof workMeta === 'object' ? workMeta : {};
			const gm = globalMeta && typeof globalMeta === 'object' ? globalMeta : {};

			const gmGeneral = (gm.General && typeof gm.General === 'object') ? gm.General : {};
			const wmGeneral = (wm.General && typeof wm.General === 'object') ? wm.General : {};

			const gmVars = (gmGeneral.$VarsDef && typeof gmGeneral.$VarsDef === 'object') ? gmGeneral.$VarsDef : {};
			const wmVars = (wmGeneral.$VarsDef && typeof wmGeneral.$VarsDef === 'object') ? wmGeneral.$VarsDef : {};

			const mergedGeneral = { ...gmGeneral, ...wmGeneral, $VarsDef: { ...gmVars, ...wmVars } };
			return { ...gm, ...wm, General: mergedGeneral };
		})();

		// Clear loading message
		mount.textContent = '';

		// Build comprehensive field label mapping with global fallbacks
		const fieldLabelMap = buildFieldLabelMap(workTypeDef, globalTypeDef);

		// Build field path → $type / $display maps (typedef-driven formatting)
		const fieldTypeMap = buildFieldTypeMap(workTypeDef, globalTypeDef);
		const fieldDisplayMap = buildFieldDisplayMap(workTypeDef, globalTypeDef);
		const secondaryMetaFieldContext = buildMetaTypeFieldContext(globalTypeDef, '$Def_SecondaryMeta');

		// GenderType の辞書解決が効いているかの最小診断（表示が変わらない場合の切り分け用）
		// - 通常時はログを出さない（デバッグチェック時のみ）
		try {
			if ($('#chk-debug')?.checked) {
				const rawGT = rec?.GenderType;
				if (typeof rawGT === 'string' && rawGT.trim()) {
					const schemaGT = fieldTypeMap?.GenderType ?? fieldTypeMap?.['GenderType'] ?? null;
					const dispGT = fieldDisplayMap?.GenderType ?? fieldDisplayMap?.['GenderType'] ?? null;
					const packGT = resolveVarsDefLabelPack('GenderType', rawGT.trim(), globalDefType, metaForLookup, 'GenderType');
					const textGT = formatBilingualLabel(packGT, rawGT.trim(), dispGT);
					console.log('🧩 GenderType resolve debug:', { raw: rawGT, schemaType: schemaGT, pack: packGT, text: textGT });
				}
			}
		} catch (e) {
			console.warn('⚠️ GenderType debug log failed:', e);
		}

		// Use cached or extract image fields
		const imageFields = Array.isArray(cachedImageFields) && cachedImageFields.length > 0
			? cachedImageFields
			: extractImageFields(workTypeDef, globalTypeDef);

		// Enhanced poster image with dynamic resolution
		const poster = await imageFromRecord(workId, rec, dbName, imageFields, currentLayerName);

		// Build image gallery with enhanced dynamic resolution
		const galleryImages = buildImageGallery(workId, rec, imageFields, dbName, currentLayerName);

		console.log('🖼️ Detail view images:', {
			poster,
			galleryCount: galleryImages.length,
			imageFieldCount: imageFields.length
		});

		// Create left section with poster and gallery - optimized loading
		const imageSection = [
			poster ? el('img', {
				class: 'poster',
				src: poster,
				alt: `${getRecordPrimaryTitle(rec) || 'Character'} poster`,
				loading: 'lazy'
			}) : el('div', { class: 'poster placeholder' }, ['画像なし']),
			galleryImages.length > 0 ? el('div', { class: 'image-gallery' }, [
				el('h4', {}, [getFieldLabel('Gallery', fieldLabelMap, metaForLookup, globalDefType, '画像ギャラリー')]),
				el('div', { class: 'image-grid' }, galleryImages.slice(0, 6).map(imgData => // Limit initial images for performance
					createGalleryImageItem(imgData)
				).concat(
					galleryImages.length > 6 ? [
						el('div', { class: 'image-more', style: 'text-align: center; padding: 10px;' }, [
							el('button', {
								type: 'button',
								onclick: () => loadMoreImages(workId, rec, imageFields, dbName, fieldLabelMap, workMeta, globalDefType, currentLayerName)
							}, [`さらに ${galleryImages.length - 6} 枚の画像を表示`])
						])
					] : []
				))
			]) : el('div', { class: 'image-gallery' }, [
				el('h4', {}, ['画像ギャラリー']),
				el('div', { class: 'no-images', style: 'padding: 20px; text-align: center; color: var(--muted);' }, [
					'画像データがありません'
				])
			])
		].filter(Boolean);

		const left = el('div', {}, imageSection);

		// トップレベルの `$display` / `$alt` を map 化（work 優先）
		const topLevelDisplayMap = buildTopLevelDisplayMap(workTypeDef, globalTypeDef);
		const topLevelAltMap = buildTopLevelAltMap(workTypeDef, globalTypeDef);
		const topLevelAliasMap = buildTopLevelAliasMap(workTypeDef, globalTypeDef);

		/**
		 * *_JP / *_EN の言語サフィックスを解析
		 * @param {string} k
		 * @returns {{ base: string, lang: 'JP'|'EN' }|null}
		 */
		const parseLangSuffix = (k) => {
			const s = String(k || '').trim();
			const m = s.match(/^(.*)_(JP|EN)$/);
			if (!m || !m[1] || !m[2]) return null;
			return { base: m[1], lang: m[2] === 'JP' ? 'JP' : 'EN' };
		};

		const getDisplayLangMode = (display) => {
			const mode = (display && typeof display === 'object' && typeof display.langMode === 'string')
				? display.langMode.trim().toLowerCase()
				: '';
			return mode;
		};

		const isSharedLanguageDisplay = (display) => getDisplayLangMode(display) === 'shared';

		/**
		 * 空値判定（`$alt` と同様の扱い）
		 * @param {any} v
		 */
		const isEmptyValueLoose = (v) => {
			if (v === null || v === undefined) return true;
			if (v === '') return true;
			if (Array.isArray(v)) return v.length === 0;
			if (typeof v === 'object') {
				if (typeof v.hideText === 'string' && v.hideText) return false;
				return Object.keys(v).length === 0;
			}
			return false;
		};

		/**
		 * 同義（言語別）フィールドの値を 1 つの表示文字列にまとめる
		 * - base / base_JP / base_EN の順に拾い、空値は除外
		 * - 同一文字列は重複排除
		 * @param {string} baseKey
		 * @returns {{ text: string, usedKeys: string[], node: (Node|null) }}
		 */
		const formatBilingualGroup = (baseKey) => {
			const base = String(baseKey || '').trim();
			if (!base) return { text: '', usedKeys: [], node: null };

			const candidates = [base, `${base}_JP`, `${base}_EN`];
			const pieces = [];
			const usedKeys = [];
			const seenText = new Set();
			const textByKey = new Map();

			for (const k of candidates) {
				const v = rec?.[k];
				if (isEmptyValueLoose(v)) continue;
				const formatted = formatValueForDisplay(v, fieldLabelMap, metaForLookup, globalDefType, {
					schemaType: fieldTypeMap?.[k] ?? fieldTypeMap?.[base] ?? null,
					display: topLevelDisplayMap?.[k] ?? topLevelDisplayMap?.[base] ?? null,
					fieldKey: k
				});
				const t = String(formatted ?? '').trim();
				if (!t) continue;
				if (seenText.has(t)) continue;
				seenText.add(t);
				pieces.push(t);
				usedKeys.push(k);
				textByKey.set(k, t);
			}

			const baseText = textByKey.get(base) || textByKey.get(`${base}_JP`) || '';
			const enText = textByKey.get(`${base}_EN`) || '';
			const lang = getCurrentPageLanguage();
			const displayHint = topLevelDisplayMap?.[base] ?? topLevelDisplayMap?.[`${base}_JP`] ?? topLevelDisplayMap?.[`${base}_EN`] ?? null;
			const sharedLanguage = isSharedLanguageDisplay(displayHint);
			if (lang === 'en') {
				const text = sharedLanguage ? (enText || baseText || pieces[0] || '') : (enText || '');
				return { text, usedKeys, node: null };
			}
			if (lang === 'jp') {
				const text = baseText || '';
				if (text) {
					// *_JPReading フィールドがあれば「JP （読み仮名）」形式にマージ
					const readingKey = `${base}_JPReading`;
					const readingRaw = rec?.[readingKey];
					const readingText = !isEmptyValueLoose(readingRaw) && typeof readingRaw === 'string'
						? readingRaw.trim() : '';
					if (readingText) {
						usedKeys.push(readingKey);
						const jpLines = text.split('\n');
						const readingLines = readingText.split('\n');
						// 改行区切りで同順にマージ: 「JP行 （reading行）」
						const mergedLines = jpLines.map((jpLine, i) => {
							const r = (readingLines[i] ?? '').trim();
							return r ? `${jpLine} （${r}）` : jpLine;
						});
						if (mergedLines.length > 1) {
							return { text: mergedLines[0], usedKeys, node: preWrapText(mergedLines.join('\n')) };
						}
						return { text: mergedLines[0], usedKeys, node: null };
					}
				}
				return { text, usedKeys, node: null };
			}

			const hasBilingualPair = !!baseText && !!enText;
			const hasMultiline = hasBilingualPair && (baseText.includes('\n') || enText.includes('\n'));
			const node = hasMultiline ? bilingualColumnsText(baseText, enText) : null;
			const text = hasBilingualPair ? `${baseText} / ${enText}` : (baseText || enText || pieces[0] || '');
			return { text, usedKeys, node };
		};

		const isEmptyForAlt = (v) => {
			if (v === null || v === undefined) return true;
			if (v === '') return true;
			if (Array.isArray(v)) return v.length === 0;
			if (typeof v === 'object') {
				// { hideText } は意図的マスクなので空扱いしない
				if (typeof v.hideText === 'string' && v.hideText) return false;
				return Object.keys(v).length === 0;
			}
			return false;
		};

		/**
		 * `$alt` を考慮して値を取り出す（primary が空なら alt を参照）
		 * - enrich 側で $alt 穴埋めが走った場合も、_enrichment.altFallbacks を見てラベル優先を維持する
		 * @param {string} key
		 * @returns {{ value: any, usedKey: string }}
		 */
		const getValueWithAlt = (key) => {
			// enrich 側で「primary は alt 由来」と記録されている場合、ラベルは alt 側を優先
			const altUsed = rec?._enrichment?.altFallbacks?.[key];
			if (typeof altUsed === 'string' && altUsed && !isEmptyForAlt(rec?.[key])) {
				return { value: rec?.[key], usedKey: altUsed };
			}

			const primary = rec?.[key];
			if (!isEmptyForAlt(primary)) return { value: primary, usedKey: key };

			const alts = (() => {
				const a1 = topLevelAltMap?.[key];
				const a2 = topLevelAliasMap?.[key];
				const out = [];
				if (Array.isArray(a1)) out.push(...a1);
				if (Array.isArray(a2)) out.push(...a2);
				// 重複排除
				return Array.from(new Set(out.filter(x => typeof x === 'string' && x.trim())));
			})();
			if (!Array.isArray(alts) || alts.length === 0) return { value: primary, usedKey: key };

			for (const altKey of alts) {
				const v = rec?.[altKey];
				if (!isEmptyForAlt(v)) return { value: v, usedKey: altKey };
			}
			return { value: primary, usedKey: key };
		};

		const formatFieldValue = (fieldKey, raw) => {
			// VarsDef 参照用に *_JP/_EN をベースキーへ正規化
			const baseKey = (() => {
				const s = String(fieldKey || '').trim();
				const m = s.match(/^(.*)_(JP|EN)$/);
				return (m && m[1]) ? m[1] : s;
			})();

			// 最終固定: GenderType は db_meta.json の $EnumDef_GenderType で必ず解決できる想定のため、
			// ここで辞書直引きのフォールバックを行い「rawコード単体が残る」ケースを潰す。
			// - formatValueForDisplay() 側で schema/display/map が欠けた場合や、basicFields の経路差異があっても確実に効かせる
			if (baseKey === 'GenderType') {
				const code = (raw === null || raw === undefined) ? '' : String(raw).trim();
				if (code) {
					const displayOpt = topLevelDisplayMap?.[fieldKey] ?? topLevelDisplayMap?.[baseKey] ?? null;
					const pack = resolveVarsDefLabelPack('GenderType', code, globalDefType, metaForLookup, baseKey);
					const label = formatBilingualLabel(pack, code, displayOpt);
					if (label && label !== code) return label;

					// デバッグ時のみ、辞書解決できているのに raw になる経路を追跡する
					try {
						if ($('#chk-debug')?.checked) {
							console.warn('🧩 GenderType basicFields fallback kept raw:', {
								fieldKey,
								baseKey,
								code,
								displayOpt,
								pack,
								label
							});
						}
					} catch (e) {
						// noop
					}
				}
			}

			// 性別はグローバル辞書（db_meta.json の $EnumDef_GenderType）で必ず解決できる前提のため、
			// schemaType の揺れ（古いキャッシュ/typedef差分/欠落等）に影響されないよう常に Enum 扱いに固定する。
			// - 「基本情報テーブルの性別だけ英語コードが残る」ケースの根本対策
			const schemaType = (fieldKey === 'GenderType')
				? '$EnumDef|$EnumDef_withAbout'
				: (fieldTypeMap?.[fieldKey] ?? null);

			return formatValueForDisplay(raw, fieldLabelMap, metaForLookup, globalDefType, {
				display: topLevelDisplayMap?.[fieldKey] ?? null,
				schemaType,
				fieldKey
			});
		};

		// JP モードかつ Name_JP が主タイトルの場合、Name_JPReading を見出しに付与する
		// （Name_JP は shownKeys に事前追加されるため sectionBuckets 経由では表示されない）
		const _primaryTitle = getRecordPrimaryTitle(rec);
		const _titleNameContent = (() => {
			if (getCurrentPageLanguage() !== 'jp') return _primaryTitle;
			const nameJP = typeof rec.Name_JP === 'string' ? rec.Name_JP.trim() : '';
			if (!nameJP || _primaryTitle !== nameJP) return _primaryTitle;
			const reading = typeof rec.Name_JPReading === 'string' ? rec.Name_JPReading.trim() : '';
			if (!reading) return _primaryTitle;
			const jpLines = nameJP.split('\n');
			const readingLines = reading.split('\n');
			const merged = jpLines.map((l, i) => {
				const r = (readingLines[i] ?? '').trim();
				return r ? `${l} （${r}）` : l;
			}).join('\n');
			return merged.includes('\n') ? el('span', { style: 'white-space: pre-wrap;' }, [merged]) : merged;
		})();
		const titleRow = el('div', { class: 'kv' }, [
			el('div', { class: 'name' }, _titleNameContent),
			getRecordSecondaryTitle(rec) ? el('div', { class: 'name-en' }, getRecordSecondaryTitle(rec)) : null,
			el('div', { class: 'row small' }, [
				(() => {
					const workIndexDef = getWorkIndexField(workId, globalMeta);
					const indexChipItems = buildIndexChipItems(rec, workIndexDef, metaForLookup, globalDefType, 'detail');
					if (!indexChipItems.length) return null;
					const cur = getQS();
					return indexChipItems.map((item) => {
						const legacyNum = item.keyPath === 'Num' ? item.value : '';
						const qs = new URLSearchParams({
							...cur,
							work: workId,
							db: dbName,
							idx: item.value,
							idxKey: item.keyPath,
							num: legacyNum,
						});
						const href = `${location.pathname}?${qs.toString()}`;

						return item?.contexts?.link
							? el('a', {
								class: 'pill',
								href,
								title: '直リンクをコピーできます',
								onclick: (ev) => {
									// 表示中のレコードなので、遷移（リロード）は不要。
									ev.preventDefault();
									ev.stopPropagation();
									try {
										setQS({ idx: item.value, idxKey: item.keyPath, num: legacyNum });
									} catch {
										// noop
									}
								}
							}, [item.text])
							: el('span', { class: 'pill' }, [item.text]);
					});
				})(),
				(() => {
					const detailLayout = globalMeta?.CreationWorks?.[workId]?.$DetailLayout || null;
					const headerPills = Array.isArray(detailLayout?.headerPills)
						? detailLayout.headerPills
						: ['Progress'];

					const nodes = [];
					for (const key of headerPills) {
						if (!key || typeof key !== 'string') continue;
						const { value: v, usedKey } = getValueWithAlt(key);
						if (v === null || v === undefined || v === '') continue;
						nodes.push(el('span', { class: 'pill' }, [
							getFieldLabel(usedKey || key, fieldLabelMap, workMeta, globalDefType, usedKey || key),
							formatValueForDisplay(v, fieldLabelMap, metaForLookup, globalDefType, {
								schemaType: fieldTypeMap?.[usedKey || key] ?? null,
								display: topLevelDisplayMap?.[usedKey || key] ?? null,
								fieldKey: usedKey || key
							})
						]));
					}
					return nodes;
				})()
			])
		]);

		// Build basic info table with localized field names (layout-driven via db_meta.json $DetailLayout)
		const detailLayout = globalMeta?.CreationWorks?.[workId]?.$DetailLayout || null;
		const detailSubFieldKeys = Array.isArray(detailLayout?.subFields)
			? detailLayout.subFields
				.map((key) => String(key ?? '').trim())
				.filter(Boolean)
			: [];
		// ベース名・_JP・_EN の三方向を全て登録して、どの形でも照合できるようにする
		// （db_meta.json の subFields はベース名で宣言し、レコードや typedef 側の _JP/_EN キーも一致させる）
		const detailSubFieldKeySet = (() => {
			const s = new Set();
			for (const k of detailSubFieldKeys) {
				s.add(k);
				const m = k.match(/^(.+)_(JP|EN)$/);
				if (m) s.add(m[1]);
				else { s.add(`${k}_JP`); s.add(`${k}_EN`); }
			}
			return s;
		})();
		const isPromotedSubFieldKey = (key) => {
			const normalized = String(key ?? '').trim();
			return normalized ? detailSubFieldKeySet.has(normalized) : false;
		};
		const isNestedUnderPromotedSubField = (key) => {
			const normalized = String(key ?? '').trim();
			if (!normalized || !normalized.includes('.')) return false;
			return detailSubFieldKeys.some((parentKey) => normalized.startsWith(`${parentKey}.`));
		};
		const basicFieldKeys = (() => {
			if (currentLayerName) {
				// レイヤー固有の $display.section:"basic" フィールドを優先する（References 等）
				const fromLayeredLayout = layeredTypeDef?.$DetailLayout?.basicFields;
				if (Array.isArray(fromLayeredLayout) && fromLayeredLayout.length) return fromLayeredLayout;
				const fromLayeredDef = (Array.isArray(layeredTypeDef?.$DefType) ? layeredTypeDef.$DefType : [])
					.filter((d) => d?.$display?.section === 'basic')
					.map((d) => String(d.hashTag || '').trim())
					.filter(Boolean);
				if (fromLayeredDef.length) return fromLayeredDef;
			}
			return Array.isArray(detailLayout?.basicFields) ? detailLayout.basicFields : [];
		})();

		// basicFields のキー配列から、*_JP/_EN の同義ペアによる二重表示を抑止
		const normalizeBasicFieldKeys = (keys) => {
			const out = [];
			const seenBase = new Set();
			for (const k of keys || []) {
				if (!k || typeof k !== 'string') continue;
				const info = parseLangSuffix(k);
				const base = info ? info.base : k;
				if (seenBase.has(base)) continue;
				out.push(base);
				seenBase.add(base);
			}
			return out;
		};

		const normalizedBasicFieldKeys = normalizeBasicFieldKeys(basicFieldKeys)
			.filter((key) => !isPromotedSubFieldKey(key));
		const normalizedBasicFieldKeySet = new Set(normalizedBasicFieldKeys);

		/**
		 * 基本情報テーブル用の値解決
		 * - `$alt` により代替した場合、ラベルは代替元キー（usedKey）を優先
		 * @param {string} key
		 * @returns {{ value: any, labelKey: string, sourceKey: string }}
		 */
		const resolveBasicField = (key) => {
			if (!key || typeof key !== 'string') return { value: '', labelKey: String(key || ''), sourceKey: String(key || '') };

			// *_JP/_EN の同義ペアを 1 行に統合（基本情報テーブル）
			// - key が base の場合に base/base_JP/base_EN をまとめて表示
			// - base 自体が空でも JP/EN があれば表示する
			if (rec && (Object.prototype.hasOwnProperty.call(rec, `${key}_JP`) || Object.prototype.hasOwnProperty.call(rec, `${key}_EN`))) {
				const { text, usedKeys, node } = formatBilingualGroup(key);
				if (text) {
					return { value: node || text, labelKey: key, sourceKey: key, _usedKeys: usedKeys };
				}
			}

			const { value: v, usedKey } = getValueWithAlt(key);
			if (v === null || v === undefined || v === '') return { value: '', labelKey: key, sourceKey: key };

			// 表示名（ラベル）は、実際に値を参照したキー（usedKey）を優先
			// - 例: ModelName が空で CodeName を使った場合 → CodeName の表示名を採用
			const labelKey = usedKey || key;
			return { value: formatFieldValue(labelKey, v), labelKey, sourceKey: key };
		};

		const basicFields = normalizedBasicFieldKeys
			.map((key) => resolveBasicField(key))
			.filter((it) => it && it.value); // Only show fields with values

		const basic = kvTable(rec, basicFields.map((it) => [
			getFieldLabel(it.labelKey, fieldLabelMap, metaForLookup, globalDefType, it.labelKey),
			it.value
		]));

		const pickSchemaType = (...candidates) => {
			for (const c of candidates) {
				if (!c) continue;
				const t = resolveSchemaTypeByPath(c);
				if (typeof t === 'string' && t) return t;

				const prefix = `${c}.`;
				for (const [path, rawType] of Object.entries(fieldTypeMap || {})) {
					if (!path || typeof path !== 'string') continue;
					if (!path.startsWith(prefix)) continue;
					const firstLeaf = path.slice(prefix.length).split('.')[0] || '';
					const nestedType = resolveSchemaTypeByPath(path, firstLeaf);
					if (typeof nestedType === 'string' && nestedType) return nestedType;
					if (typeof rawType === 'string' && rawType) return rawType;
				}
			}
			return null;
		};

		const pickSchemaDisplay = (...candidates) => {
			for (const c of candidates) {
				if (!c) continue;
				const d = fieldDisplayMap?.[c];
				if (d && typeof d === 'object') return d;

				const prefix = `${c}.`;
				for (const [path, nestedDisplay] of Object.entries(fieldDisplayMap || {})) {
					if (!path || typeof path !== 'string') continue;
					if (!path.startsWith(prefix)) continue;
					if (nestedDisplay && typeof nestedDisplay === 'object') return nestedDisplay;
				}
			}
			return null;
		};

		const splitTypeTokens = (typeText) => String(typeText || '')
			.split(/[,|]/)
			.map((token) => token.trim())
			.filter(Boolean);

		const extractDefRefNames = (typeText) => splitTypeTokens(typeText)
			.map((token) => token.replace(/\[\]$/g, ''))
			.filter((token) => /^\$Def_[A-Za-z0-9_]+$/.test(token));

		const resolveDefTypeEntries = (defRefName) => {
			const name = String(defRefName || '').trim();
			if (!name) return null;

			const sources = [workTypeDef, globalTypeDef, globalDefType];
			for (const src of sources) {
				if (!src || typeof src !== 'object') continue;
				const fromVers = src?.$VersDef?.[name]?.$DefType;
				if (Array.isArray(fromVers)) return fromVers;
				const fromVars = src?.$VarsDef?.[name]?.$DefType;
				if (Array.isArray(fromVars)) return fromVars;
				const fromGeneralVars = src?.General?.$VarsDef?.[name]?.$DefType;
				if (Array.isArray(fromGeneralVars)) return fromGeneralVars;
			}
			return null;
		};

		const resolveSingleDefRefType = (defRefName, leafKey = '') => {
			const entries = resolveDefTypeEntries(defRefName);
			if (!Array.isArray(entries) || entries.length === 0) return '';

			const normalizedLeaf = String(leafKey || '').trim();
			if (normalizedLeaf) {
				const direct = entries.find((entry) => (
					entry
					&& typeof entry === 'object'
					&& !Array.isArray(entry)
					&& entry.hashTag === normalizedLeaf
					&& typeof entry.$type === 'string'
					&& entry.$type.trim()
				));
				if (direct) return String(direct.$type).trim();
			}

			const first = entries.find((entry) => (
				entry
				&& typeof entry === 'object'
				&& !Array.isArray(entry)
				&& typeof entry.$type === 'string'
				&& entry.$type.trim()
			));
			if (first) return String(first.$type).trim();

			return '';
		};

		const resolveSchemaTypeByPath = (pathKey, leafKey = '') => {
			const raw = fieldTypeMap?.[pathKey];
			if (typeof raw !== 'string' || !raw.trim()) return raw;
			if (!raw.includes('$Def_')) return raw;

			let expanded = raw;
			for (const defRef of extractDefRefNames(raw)) {
				const resolved = resolveSingleDefRefType(defRef, leafKey);
				if (!resolved) continue;
				expanded = expanded.replace(defRef, resolved);
			}

			return expanded;
		};

		/**
		 * 値オブジェクトの「葉キー」を元に、schemaType/schemaDisplay を推定する
		 * - #ListLink など「葉の型情報」が必要なケースに対応
		 * - JS 側の固定キー（EffectText 等）依存を減らし、typedef に寄せて柔軟に動作させる
		 * @param {string[]} basePaths - 例: ['NumerospecStats.EffectStats.Mental', 'EffectStats.Mental']
		 * @param {any} obj - 例: { EffectText: '絶大' }
		 * @returns {{ schemaType: string|null, schemaDisplay: any|null }}
		 */
		const pickSchemaHintsForObjectLeaf = (basePaths, obj) => {
			const leafKeys = (obj && typeof obj === 'object' && !Array.isArray(obj))
				? Object.keys(obj).filter(k => k && typeof k === 'string' && !k.startsWith('_'))
				: [];

			const candidatesType = [];
			const candidatesDisplay = [];

			for (const base of basePaths) {
				if (!base) continue;
				for (const leaf of leafKeys) {
					candidatesType.push(`${base}.${leaf}`);
					candidatesDisplay.push(`${base}.${leaf}`);
				}
				// フォールバック（親）
				candidatesType.push(base);
				candidatesDisplay.push(base);
			}

			const primaryLeaf = leafKeys[0] || '';
			const resolvedType = (() => {
				for (const candidate of candidatesType) {
					if (!candidate) continue;
					const t = resolveSchemaTypeByPath(candidate, primaryLeaf);
					if (typeof t === 'string' && t) return t;
				}
				return null;
			})();

			return {
				schemaType: resolvedType,
				schemaDisplay: pickSchemaDisplay(...candidatesDisplay)
			};
		};

		// Abilities / Effect / Safety（typedef-driven）
		// - JS 側に特定の JSON キー名を極力持たせず、実データ＋typedef（fieldTypeMap/fieldDisplayMap）から推定して表示する

		/**
		 * 値が「配列ではないObject」かどうか
		 * @param {any} v
		 */
		const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

		/**
		 * schema の $type 文字列に needle が含まれるか（簡易）
		 * @param {any} t
		 * @param {string} needle
		 */
		const schemaTypeIncludes = (t, needle, depth = 0) => {
			if (!needle) return false;
			if (depth > 6) return false;
			if (t === null || t === undefined) return false;
			if (typeof t === 'string') return t.includes(needle);
			if (Array.isArray(t)) return t.some(x => schemaTypeIncludes(x, needle, depth + 1));
			if (typeof t === 'object') {
				if (Object.prototype.hasOwnProperty.call(t, '$type')) {
					return schemaTypeIncludes(t.$type, needle, depth + 1);
				}
				return Object.values(t).some(x => schemaTypeIncludes(x, needle, depth + 1));
			}
			return false;
		};

		/**
		 * typedef の存在に基づき、最も妥当な schemaPath を選ぶ
		 * @param {string[]} candidates
		 * @param {string} fallback
		 */
		const pickSchemaPath = (candidates, fallback) => {
			for (const c of candidates || []) {
				if (!c || typeof c !== 'string') continue;
				if (fieldTypeMap?.[c] || fieldDisplayMap?.[c]) return c;
			}
			return fallback;
		};


		/**
		 * SW enrich により補完された補助キーを除き、実質的な葉キーを取り出す
		 * - 例: { EffectText:'脆弱', EffectText_EN:'Fragile', Rank:'E' } -> ['EffectText']
		 * - 例: { Rank:'S+' } -> ['Rank']
		 * @param {any} obj
		 * @returns {string[]}
		 */
		const getPrimaryLeafKeys = (obj) => {
			if (!isPlainObject(obj)) return [];

			const keys = Object.keys(obj).filter(k => k && typeof k === 'string' && !k.startsWith('_'));
			if (!keys.length) return [];

			const hasBaseKey = (k) => {
				const m = String(k || '').match(/^(.*)_(JP|EN)$/);
				if (!m) return false;
				return keys.includes(m[1]);
			};

			const supplemental = new Set(['about', 'about_JP', 'about_EN', 'hideText']);
			const nonSupplementalKeys = keys.filter((k) => !supplemental.has(k) && !hasBaseKey(k));
			const primary = keys.filter((k) => {
				if (supplemental.has(k)) return false;
				if (hasBaseKey(k)) return false;
				// Rank/Rarity/Decave は、他の本体キー（EffectText 等）が同居するときだけ補助扱いにする。
				// about_* のみ同居するケースは本体値として扱う。
				if ((k === 'Rank' || k === 'Rarity' || k === 'Decave') && nonSupplementalKeys.some((x) => x !== k)) return false;
				return true;
			});

			return primary.length ? primary : keys;
		};


		/**
		 * 単一葉オブジェクトの「葉パス」の schemaType を拾う
		 * @param {string} parentPath
		 * @param {any} obj
		 */
		const getSingleLeafSchemaType = (parentPath, obj) => {
			if (!isPlainObject(obj)) return '';
			const ks = getPrimaryLeafKeys(obj);
			if (ks.length !== 1) return '';
			const leaf = ks[0];
			const full = parentPath ? `${parentPath}.${leaf}` : leaf;
			const t = resolveSchemaTypeByPath(full, leaf);
			if (typeof t === 'string' && t) return t;

			// `$Def_*` のように「親パスに型参照がある」場合を補完
			const parentType = resolveSchemaTypeByPath(parentPath, leaf);
			if (typeof parentType === 'string' && parentType) return parentType;

			const prefix = parentPath ? `${parentPath}.` : '';
			const supplemental = new Set(['about', 'about_JP', 'about_EN', 'hideText']);
			if (prefix) {
				for (const [path, type] of Object.entries(fieldTypeMap || {})) {
					if (!path || typeof path !== 'string' || typeof type !== 'string' || !type) continue;
					if (!path.startsWith(prefix)) continue;
					const rest = path.slice(prefix.length);
					const firstLeaf = rest.split('.')[0];
					if (!firstLeaf || firstLeaf.startsWith('_') || supplemental.has(firstLeaf)) continue;
					return resolveSchemaTypeByPath(path, firstLeaf) || type;
				}
			}

			return '';
		};

		// typedef 由来で「子フィールド定義が存在するobject」を検出・整形する
		// - 例: For79or80thDealerCalling.{For79thDealer,For80thDealer}
		// - 例: ArcanumspecStats.SpecType.ActionType.{KinematicOrStatic,RoleType}
		const nestedSchemaCache = new Map();
		const hasNestedSchema = (prefix) => {
			const p = String(prefix || '').trim();
			if (!p) return false;
			if (nestedSchemaCache.has(p)) return !!nestedSchemaCache.get(p);
			const dot = `${p}.`;
			const ok = (
				Object.keys(fieldTypeMap || {}).some(k => typeof k === 'string' && k.startsWith(dot))
				|| Object.keys(fieldDisplayMap || {}).some(k => typeof k === 'string' && k.startsWith(dot))
				|| Object.keys(fieldLabelMap || {}).some(k => typeof k === 'string' && k.startsWith(dot))
			);
			nestedSchemaCache.set(p, ok);
			return ok;
		};

		const isSchemaWrapperLike = (schemaPath, value, schemaTypeHint = null) => {
			if (!isPlainObject(value)) return false;

			const schemaType = schemaTypeHint ?? pickSchemaType(schemaPath);
			if (!schemaType) return false;

			const hasStructuredChildren = (() => {
				if (Array.isArray(schemaType)) {
					return schemaType.some((entry) => (
						entry
						&& typeof entry === 'object'
						&& !Array.isArray(entry)
						&& typeof entry.hashTag === 'string'
					));
				}
				if (schemaType && typeof schemaType === 'object' && !Array.isArray(schemaType)) {
					return typeof schemaType.hashTag === 'string';
				}
				return false;
			})();
			if (hasStructuredChildren) return false;

			return (
				schemaTypeIncludes(schemaType, '#Index')
				|| schemaTypeIncludes(schemaType, '#ListIndex')
				|| schemaTypeIncludes(schemaType, '#DictIndex')
				|| schemaTypeIncludes(schemaType, '#ListLink')
				|| schemaTypeIncludes(schemaType, '#String')
				|| schemaTypeIncludes(schemaType, '#Summary')
				|| schemaTypeIncludes(schemaType, '#Dialogue')
				|| schemaTypeIncludes(schemaType, '$EnumDef')
			);
		};

		const hasLocalizedChildKeys = (obj) => {
			if (!isPlainObject(obj)) return false;
			const keys = Object.keys(obj).filter((key) => key && typeof key === 'string' && !key.startsWith('_'));
			return keys.some((key) => key.endsWith('_JP') || key.endsWith('_EN'));
		};

		const formatObjectChildren = (parentSchemaPath, obj, opt2 = null) => {
			if (!isPlainObject(obj)) return '';
			const parent = String(parentSchemaPath || '').trim();
			if (!parent) return '';

			const separator = (opt2 && typeof opt2 === 'object' && typeof opt2.separator === 'string') ? opt2.separator : '\n';
			const lang = getCurrentPageLanguage();
			const parts = [];

			for (const [ck, cv] of Object.entries(obj)) {
				if (!ck || typeof ck !== 'string') continue;
				if (ck.startsWith('_')) continue;
				const langInfo = parseLangSuffix(ck);
				const baseChildKey = langInfo ? langInfo.base : ck;
				const baseChildPath = `${parent}.${baseChildKey}`;
				const baseDisplayHint = pickSchemaDisplay(baseChildPath, baseChildPath, parent);
				const sharedLanguage = isSharedLanguageDisplay(baseDisplayHint);
				if (lang === 'jp' && ck.endsWith('_EN')) continue;
				if (lang === 'en' && ck.endsWith('_JP')) continue;
				if (lang === 'en' && ck.endsWith('_JPReading')) continue;
				if (lang === 'en' && !ck.endsWith('_EN') && Object.prototype.hasOwnProperty.call(obj, `${ck}_EN`) && !sharedLanguage) continue;
				if (isEmptyValueLoose(cv)) continue;

				const childPath = `${parent}.${ck}`;
				const schemaPath = pickSchemaPath([childPath], childPath);
				const childLabel = getFieldLabel(schemaPath, fieldLabelMap, metaForLookup, globalDefType, ck);

				const hints = (isPlainObject(cv) && !Array.isArray(cv))
					? pickSchemaHintsForObjectLeaf([schemaPath, childPath], cv)
					: { schemaType: pickSchemaType(schemaPath, childPath), schemaDisplay: pickSchemaDisplay(schemaPath, childPath, parent) };

				const childValue = formatValueForDisplay(cv, fieldLabelMap, metaForLookup, globalDefType, {
					schemaType: hints.schemaType,
					display: hints.schemaDisplay,
					fieldKey: schemaPath
				});
				if (!childValue) continue;

				parts.push(`${childLabel}: ${childValue}`);
			}

			return parts.join(separator);
		};




		// ここまでで明示的に表示したフィールドを控えておき、未表示項目を後段で包括表示する
		const shownKeys = (() => {
			/** @type {Set<string>} */
			const s = new Set();

			// タイトル行（表示に使った実体キーを記録）
			if (rec.Name_JP) s.add('Name_JP');
			else if (rec.FormalName_JP) s.add('FormalName_JP');
			else if (rec.Name_EN) s.add('Name_EN');

			if (rec.Name_EN) s.add('Name_EN');
			else if (rec.FormalName_EN) s.add('FormalName_EN');

			// 作品ごとのインデックス定義（typedef の $IndexDef に追従）
			const workIndexDef = getWorkIndexField(workId, globalMeta);
			if (workIndexDef?.hashTag && typeof workIndexDef.hashTag === 'string') {
				s.add(workIndexDef.hashTag);
			} else if (rec.Num != null) {
				// indexDef が無い場合の最小互換
				s.add('Num');
			}

			if (rec.ModelNumber) s.add('ModelNumber');
			if (rec.Progress) s.add('Progress');

			// 基本情報テーブルに出したキー（$alt を含めて二重表示抑止）
			for (const it of basicFields) {
				if (!it || typeof it !== 'object') continue;
				if (it.sourceKey) s.add(it.sourceKey);
				if (it.labelKey) s.add(it.labelKey);

				// 同義（言語別）統合で実際に参照したキーも抑止対象にする
				if (Array.isArray(it._usedKeys)) {
					for (const uk of it._usedKeys) s.add(uk);
				}

				const alts = topLevelAltMap?.[it.sourceKey];
				if (Array.isArray(alts)) {
					for (const ak of alts) s.add(ak);
				}
			}

			// 互換/派生キーが混入する場合があるため、基本情報で表示したら抑止
			// - GenderType_JP のような派生キー（データ側に残っている場合）を二重表示しない
			if (basicFields.some(it => it?.sourceKey === 'GenderType' || it?.labelKey === 'GenderType')) s.add('GenderType_JP');

			// AbilityStats / specStats 系はサブフィールドレンダラーで表示するため二重表示を避ける
			for (const k of Object.keys(rec || {})) {
				if (!k || typeof k !== 'string') continue;
				if (!/(?:ability|spec)stats$/i.test(k)) continue;
				if (isPromotedSubFieldKey(k)) continue;
				const v = rec?.[k];
				if (v && typeof v === 'object' && Object.keys(v).length > 0) s.add(k);
			}

			// profile/relations/DBLinkResolved は個別表示する
			if (rec.Summary_JP && !isPromotedSubFieldKey('Summary_JP')) s.add('Summary_JP');
			if (rec.Summary && !isPromotedSubFieldKey('Summary')) s.add('Summary');
			if (rec.Relation && !isPromotedSubFieldKey('Relation')) s.add('Relation');
			for (const k of Object.keys(rec || {})) {
				if (!/^RelationTo_/.test(k)) continue;
				if (!isPromotedSubFieldKey(k)) s.add(k);
			}

			// Images は左カラムのギャラリー担当（キーとして持っていれば抑止）
			if (rec.Images) s.add('Images');

			return s;
		})();

		// db_type.json 由来の表示順（トップレベル）
		const schemaFields = extractTopLevelSchemaFields(workTypeDef, globalTypeDef, { dbName });
		const schemaKeySet = new Set(schemaFields.map(f => f.key));

		// スキーマから #Summary（長文）系を抽出し、プロフィールセクションに回す
		const isSummaryType = (t) => {
			const s = String(t ?? '');
			return s.includes('#Summary');
		};

		const isDialogueType = (t) => {
			const s = String(t ?? '');
			return s.includes('#Dialogue');
		};

		const isEmptyValue = (v) => isEmptyValueLoose(v);
		const isInternalButAllowed = () => false;
		const shouldSkipKey = (k, v) => {
			// *_JPReading は JP モードのみ表示（EN モードでは読み仮名不要）
			if (getCurrentPageLanguage() === 'en' && k.endsWith('_JPReading')) return true;
			// base が表示済みなら *_JP/_EN は二重表示しない
			const lang = parseLangSuffix(k);
			if (lang?.base && shownKeys.has(lang.base)) return true;
			if (shownKeys.has(k)) return true;
			if (k === 'Images') return true;
			if (k.startsWith('_') && !isInternalButAllowed(k)) return true;
			if (isEmptyValue(v)) return true;
			return false;
		};

		const buildIndexLinkInfoFromValue = (value, indexDef, keyPathHint = '') => {
			if (!indexDef || typeof indexDef !== 'object') return null;
			const rootKey = typeof indexDef.hashTag === 'string' ? indexDef.hashTag.trim() : '';
			if (!rootKey) return null;

			const subDefs = getIndexSubDefs(indexDef);
			const nested = Array.isArray(subDefs) && subDefs.length > 0;
			const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

			// ネスト型
			if (nested) {
				const primarySub = pickPrimaryIndexSubDef(subDefs);
				const candidates = primarySub ? [primarySub, ...subDefs.filter(d => d !== primarySub)] : subDefs;

				// { Root:{Sub:...} } or { Sub:... }
				if (isObj(value)) {
					const rootObj = isObj(value?.[rootKey]) ? value[rootKey] : value;
					if (isObj(rootObj)) {
						for (const sub of candidates) {
							const subKey = sub?.hashTag;
							if (!subKey || typeof subKey !== 'string') continue;
							const leaf = rootObj[subKey];
							if (leaf === null || leaf === undefined || leaf === '') continue;
							return { idxKeyPath: `${rootKey}.${subKey}`, idxValue: String(leaf) };
						}
					}
				}

				// プリミティブ（どの sub か曖昧な場合は primary を採用）
				const subKey = (typeof keyPathHint === 'string' && keyPathHint.startsWith(`${rootKey}.`))
					? keyPathHint.substring(rootKey.length + 1)
					: (primarySub?.hashTag || subDefs[0]?.hashTag);
				if (!subKey || typeof subKey !== 'string') return null;
				if (value === null || value === undefined || value === '') return null;
				return { idxKeyPath: `${rootKey}.${subKey}`, idxValue: String(value) };
			}

			// スカラー型
			const leaf = (isObj(value) && Object.prototype.hasOwnProperty.call(value, rootKey)) ? value[rootKey] : value;
			if (leaf === null || leaf === undefined || leaf === '') return null;
			return { idxKeyPath: rootKey, idxValue: String(leaf) };
		};

		const buildIndexHref = (workId, dbName, idxValue, idxKeyPath) => {
			const cur = getQS();
			const legacyNum = idxKeyPath === 'Num' ? idxValue : '';
			const qs = new URLSearchParams({
				...cur,
				work: workId,
				db: dbName,
				idx: String(idxValue ?? ''),
				idxKey: String(idxKeyPath ?? ''),
				num: legacyNum,
			});
			return `${location.pathname}?${qs.toString()}`;
		};

		const toDisplayNode = (k, v, schemaType = null, schemaDisplay = null) => {
			if (v instanceof Node) return v;

			// typedef 上で「子フィールド定義が存在するobject」は、子ごとに表示（[object Object]回避 + 分離表示）
			if (
				isPlainObject(v)
				&& k
				&& typeof k === 'string'
				&& !isSchemaWrapperLike(k, v, schemaType)
				&& (hasNestedSchema(k) || hasLocalizedChildKeys(v))
			) {
				const expanded = formatObjectChildren(k, v, { separator: '\n' });
				if (expanded) return expanded.includes('\n') ? preWrapText(expanded) : expanded;
			}

			// スキーマ的に Summary 系 or 文字列改行は pre-wrap
			if (typeof v === 'string' && v.includes('\n')) return preWrapText(v);
			if (schemaType != null && isSummaryType(schemaType)) {
				const formatted = typeof v === 'string'
					? v
					: formatValueForDisplay(v, fieldLabelMap, metaForLookup, globalDefType, { display: schemaDisplay, schemaType, fieldKey: k });
				if (formatted && String(formatted).includes('\n')) return preWrapText(formatted);
				// Summary でも単行の場合は preWrap にしておく（安全側）
				return preWrapText(formatted);
			}
			if (schemaType != null && isDialogueType(schemaType)) {
				const formatted = typeof v === 'string'
					? v
					: formatValueForDisplay(v, fieldLabelMap, metaForLookup, globalDefType, { display: schemaDisplay, schemaType, fieldKey: k });
				if (!formatted) return '';
				return dialogueBodyText(formatted);
			}
			const formatted = formatValueForDisplay(v, fieldLabelMap, metaForLookup, globalDefType, { display: schemaDisplay, schemaType, fieldKey: k });
			if (typeof formatted === 'string' && formatted.includes('\n')) return preWrapText(formatted);

			// #Index 型はリンク化（直リンク共有を容易にする）
			try {
				if (schemaTypeIncludes(schemaType, '#Index') && typeof formatted === 'string' && formatted.trim()) {
					const workIndexDef = getWorkIndexField(workId, globalMeta);
					const info = buildIndexLinkInfoFromValue(v, workIndexDef, k);
					if (info?.idxValue && info?.idxKeyPath) {
						const href = buildIndexHref(workId, dbName, info.idxValue, info.idxKeyPath);
						return el('a', {
							href,
							title: '直リンクをコピーできます',
							onclick: async (ev) => {
								// 可能なら SPA 内で開く（失敗時は通常遷移にフォールバック）
								ev.preventDefault();
								ev.stopPropagation();
								try {
									const state = window.__CHAR_STATE__;
									const recs = Array.isArray(state?.records) ? state.records : [];
									const indexDef = getWorkIndexField(workId, globalMeta);
									const target = recs.find(r => recordMatchesIndexQuery(r, indexDef, info.idxValue, info.idxKeyPath, info.idxKeyPath === 'Num' ? info.idxValue : '')) || null;
									if (target) {
										await openDetail(target);
										return;
									}
								} catch {
									// noop
								}
								location.href = href;
							}
						}, [formatted]);
					}
				}
			} catch {
				// noop
			}
			return formatted;
		};

		// $display.section に基づいて未表示フィールドを自動分類（basic/profile/spec/other）
		const normalizeSection = (s) => {
			const v = String(s ?? '').trim();
			if (v === 'basic' || v === 'profile' || v === 'spec' || v === 'other' || v === 'sub') return v;
			// Images は左カラムのギャラリー担当（ここには出さない）
			return '';
		};

		const sectionBuckets = {
			basic: /** @type {Array<{key:string,label:string,type:any,display:any,value:any}>} */ ([]),
			profile: /** @type {Array<{key:string,label:string,type:any,display:any,value:any}>} */ ([]),
			spec: /** @type {Array<{key:string,label:string,type:any,display:any,value:any}>} */ ([]),
			sub: /** @type {Array<{key:string,label:string,type:any,display:any,value:any}>} */ ([]),
			other: /** @type {Array<{key:string,label:string,type:any,display:any,value:any}>} */ ([]),
		};

		const pushToBucket = (section, item) => {
			const sec = sectionBuckets[section] ? section : 'other';
			sectionBuckets[sec].push(item);
		};

		// 1) スキーマ順（トップレベル）で分類
		for (const f of schemaFields) {
			if (!f || typeof f !== 'object') continue;
			if (shownKeys.has(f.key)) continue;

			// *_JP/_EN の同義ペアは 1 つの base キーとしてまとめて表示
			// - スキーマに base が無くても、JP/EN があれば base として表示できる
			const langInfo = parseLangSuffix(f.key);
			if (langInfo && langInfo.base) {
				const base = langInfo.base;
				const variantKeys = [base, `${base}_JP`, `${base}_EN`];
				const anyShown = variantKeys.some(k => shownKeys.has(k));
				if (!anyShown) {
					// suppressKeys / auto:false を尊重（どれかが抑止対象なら表示しない）
					const suppressed = Array.isArray(detailLayout?.suppressKeys)
						&& (detailLayout.suppressKeys.includes(base) || detailLayout.suppressKeys.includes(`${base}_JP`) || detailLayout.suppressKeys.includes(`${base}_EN`));
					if (!suppressed) {
						const { text, usedKeys, node } = formatBilingualGroup(base);
						if (text) {
							// 表示セクションは JP/EN 側の $display.section を優先して解釈
							const displayHint = fieldDisplayMap?.[f.key] ?? fieldDisplayMap?.[base] ?? null;
							if (!(displayHint && typeof displayHint === 'object' && displayHint.auto === false)) {
								const sec = detailSubFieldKeySet.has(base)
									? 'sub'
									: (normalizeSection(displayHint?.section) || (isSummaryType(f.type) ? 'profile' : 'other'));
								pushToBucket(sec || 'other', {
									key: base,
									label: getFieldLabel(base, fieldLabelMap, workMeta, globalDefType, base),
									// すでに統合済み文字列のため、後段の formatValueForDisplay を避ける
									type: null,
									display: null,
									value: node || text
								});
								// base/JP/EN すべて抑止対象にする
								shownKeys.add(base);
								for (const uk of usedKeys) shownKeys.add(uk);
								continue;
							}
						}
					}
				}

				// ここに来た場合は統合表示しない（または既に表示済み）ので、このキー自体は抑止
				shownKeys.add(f.key);
				continue;
			}

			// スキーマが base キーのみでも、実データに *_JP/_EN がある場合は統合して表示
			if (f.key && typeof f.key === 'string') {
				const base = f.key;
				const hasBilingual = rec && (Object.prototype.hasOwnProperty.call(rec, `${base}_JP`) || Object.prototype.hasOwnProperty.call(rec, `${base}_EN`));
				if (hasBilingual) {
					const suppressed = Array.isArray(detailLayout?.suppressKeys)
						&& (detailLayout.suppressKeys.includes(base) || detailLayout.suppressKeys.includes(`${base}_JP`) || detailLayout.suppressKeys.includes(`${base}_EN`));
					if (!suppressed) {
						const { text, usedKeys, node } = formatBilingualGroup(base);
						if (text) {
							const displayHint = fieldDisplayMap?.[`${base}_JP`] ?? fieldDisplayMap?.[`${base}_EN`] ?? fieldDisplayMap?.[base] ?? null;
							if (!(displayHint && typeof displayHint === 'object' && displayHint.auto === false)) {
								const sec = detailSubFieldKeySet.has(base)
									? 'sub'
									: (normalizeSection(displayHint?.section) || (isSummaryType(f.type) ? 'profile' : 'other'));
								pushToBucket(sec || 'other', {
									key: base,
									label: getFieldLabel(base, fieldLabelMap, workMeta, globalDefType, base),
									type: null,
									display: null,
									value: node || text
								});
								shownKeys.add(base);
								for (const uk of usedKeys) shownKeys.add(uk);
								continue;
							}
						}
					}

					// 統合表示しない場合でも、派生キーは二重表示しない
					shownKeys.add(`${base}_JP`);
					shownKeys.add(`${base}_EN`);
				}
			}

			// db_meta.json の $DetailLayout で抑止されたキーは自動表示しない
			if (Array.isArray(detailLayout?.suppressKeys) && detailLayout.suppressKeys.includes(f.key)) {
				shownKeys.add(f.key);
				continue;
			}

			// sectionWrapper を持つフィールドは subFields が設定されている作品で subFields 未登録なら表示しない
			// 例: IdentityMotif は NumberTales の subFields にあるが SinisterChangingGirls にはない
			if (detailSubFieldKeySet.size > 0 && f.display?.sectionWrapper && !detailSubFieldKeySet.has(f.key)) {
				shownKeys.add(f.key);
				continue;
			}

			// db_type.json の $display.auto=false は自動表示しない（別名/統合表示用）
			if (f.display && typeof f.display === 'object' && f.display.auto === false) {
				shownKeys.add(f.key);
				continue;
			}

			const { value: v, usedKey } = getValueWithAlt(f.key);

			// $alt で代替キーを使う場合、代替側が既に表示済みなら二重表示しない
			if (usedKey && usedKey !== f.key && shownKeys.has(usedKey)) {
				shownKeys.add(f.key);
				continue;
			}

			if (shouldSkipKey(f.key, v)) continue;

			const sec = detailSubFieldKeySet.has(f.key)
				? 'sub'
				: (normalizeSection(f.display?.section) || (isSummaryType(f.type) ? 'profile' : ''));
			if (!sec) {
				shownKeys.add(f.key);
				if (usedKey && usedKey !== f.key) shownKeys.add(usedKey);
				continue;
			}
			const labelKey = (usedKey && usedKey !== f.key) ? usedKey : f.key;

			// 表示整形は fieldTypeMap/fieldDisplayMap を優先（schemaFields 側の type が配列/オブジェクトの場合でも enum 判定できるようにする）
			const resolvedType = fieldTypeMap?.[labelKey] ?? fieldTypeMap?.[f.key] ?? f.type ?? null;
			const resolvedDisplay = fieldDisplayMap?.[labelKey] ?? fieldDisplayMap?.[f.key] ?? f.display ?? null;
			pushToBucket(sec, {
				key: labelKey,
				label: getFieldLabel(labelKey, fieldLabelMap, workMeta, globalDefType, labelKey),
				type: resolvedType,
				display: resolvedDisplay,
				value: v
			});
			shownKeys.add(f.key);

			// $alt で参照した代替キーも抑止対象にする
			if (usedKey && usedKey !== f.key) {
				shownKeys.add(usedKey);
			}
		}

		// 2) スキーマ外（追加/互換/暫定）はキャラシートへ自動表示しない

		// 3) specStats 配下フィールドの振り分けは各専用レンダラー（lib/section-renders/）が担当

		const buildKvRows = (items) => (items || [])
			.map((it) => {
				if (!it) return null;
				const node = toDisplayNode(it.key, it.value, it.type, it.display);
				const text = (typeof node === 'string') ? node.trim() : String(node?.textContent ?? '').trim();
				if (!text) return null;
				return [it.label, node];
			})
			.filter(Boolean);

		const buildObjectChildBlocks = (parentKey, parentValue, options = {}) => {
			if (!parentKey || typeof parentKey !== 'string' || !isPlainObject(parentValue)) return [];
			const excludedChildKeys = (options?.excludedChildKeys instanceof Set) ? options.excludedChildKeys : new Set();
			const lang = getCurrentPageLanguage();
			const hasJapaneseChars = (text) => /[\u3040-\u30ff\u3400-\u9fff]/.test(String(text || ''));
			const blocks = [];

			for (const [childKey, childValue] of Object.entries(parentValue)) {
				if (!childKey || typeof childKey !== 'string') continue;
				if (childKey.startsWith('_')) continue;
				const langInfo = parseLangSuffix(childKey);
				const baseChildKey = langInfo ? langInfo.base : childKey;
				const baseChildPath = `${parentKey}.${baseChildKey}`;
				const baseDisplayHint = pickSchemaDisplay(baseChildPath, baseChildPath, parentKey);
				const sharedLanguage = isSharedLanguageDisplay(baseDisplayHint);
				if (lang === 'jp' && childKey.endsWith('_EN')) continue;
				if (lang === 'en' && childKey.endsWith('_JP')) continue;
				if (lang === 'en' && !childKey.endsWith('_EN') && Object.prototype.hasOwnProperty.call(parentValue, `${childKey}_EN`) && !sharedLanguage) continue;
				if (excludedChildKeys.has(childKey)) continue;
				if (isEmptyValueLoose(childValue)) continue;

				const childPath = `${parentKey}.${childKey}`;
				const childPathCandidates = [childPath, childKey];
				const schemaPath = pickSchemaPath(childPathCandidates, childPath);
				const childLabel = getFieldLabel(schemaPath, fieldLabelMap, metaForLookup, globalDefType, childKey);
				const hints = (isPlainObject(childValue) && !Array.isArray(childValue))
					? pickSchemaHintsForObjectLeaf([schemaPath, childPath, childKey], childValue)
					: {
						schemaType: pickSchemaType(schemaPath, childPath),
						schemaDisplay: pickSchemaDisplay(schemaPath, childPath, parentKey)
					};

				if (childKey === 'DialogueExamples' && Array.isArray(childValue)) {
					const formatDialogueItemByLang = (item) => {
						if (item === null || item === undefined || item === '') return '';

						if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
							const text = String(item).trim();
							if (!text) return '';
							if (lang === 'jp') return hasJapaneseChars(text) ? text : '';
							if (lang === 'en') return hasJapaneseChars(text) ? '' : text;
							return text;
						}

						if (!isPlainObject(item)) return '';
						const valueJP = String(item.value_JP || '').trim();
						const valueEN = String(item.value_EN || '').trim();
						const valueRaw = String(item.value || '').trim();
						const aboutJP = String(item.about_JP || '').trim();
						const aboutEN = String(item.about_EN || '').trim();

						if (lang === 'jp') {
							const base = valueJP || (hasJapaneseChars(valueRaw) ? valueRaw : '');
							if (!base) return '';
							return aboutJP ? `${base}（${aboutJP}）` : base;
						}

						if (lang === 'en') {
							const base = valueEN || (!hasJapaneseChars(valueRaw) ? valueRaw : '');
							if (!base) return '';
							return aboutEN ? `${base} (${aboutEN})` : base;
						}

						const fallbackText = formatValueForDisplay(item, fieldLabelMap, metaForLookup, globalDefType, {
							schemaType: hints.schemaType,
							display: hints.schemaDisplay,
							fieldKey: schemaPath
						});
						return String(fallbackText || '').trim();
					};

					const cards = childValue
						.map((item) => formatDialogueItemByLang(item))
						.map((text) => String(text ?? '').trim())
						.filter(Boolean)
						.map((text) => el('div', { class: 'tag' }, [dialogueBodyText(text)]));

					if (!cards.length) continue;

					blocks.push(el('div', { style: 'margin-bottom: 10px;' }, [
						el('div', { class: 'tag', style: 'margin-bottom: 6px;' }, [childLabel]),
						createDetailTagGrid(cards)
					]));
					continue;
				}

				const node = toDisplayNode(schemaPath, childValue, hints.schemaType, hints.schemaDisplay);
				const text = (typeof node === 'string') ? node.trim() : String(node?.textContent ?? '').trim();
				if (!text) continue;

				blocks.push(el('div', { style: 'margin-bottom: 10px;' }, [
					el('div', { class: 'tag', style: 'margin-bottom: 6px;' }, [childLabel]),
					(typeof node === 'string') ? preWrapText(node) : node
				]));
			}

			return blocks;
		};

		const renderStructuredSubFieldSection = (it) => {
			if (!it || !isPlainObject(it.value)) return null;

			const blocks = buildObjectChildBlocks(it.key, it.value);

			if (!blocks.length) return null;

			return el('div', { style: 'margin-bottom: 10px;' }, [
				el('div', { class: 'tag', style: 'margin-bottom: 6px;' }, [it.label]),
				el('div', {}, blocks)
			]);
		};

		const isStringLikeStandaloneSubField = (it) => {
			if (!it) return false;
			const schemaType = it.type;
			if (it.value instanceof Node) return true;
			if (typeof it.value === 'string' || typeof it.value === 'number' || typeof it.value === 'boolean') return true;
			if (
				typeof schemaType === 'string'
				&& (
					schemaTypeIncludes(schemaType, '#String')
					|| isSummaryType(schemaType)
					|| isDialogueType(schemaType)
				)
			) {
				return true;
			}

			if (isPlainObject(it.value)) {
				const singleLeafSchemaType = getSingleLeafSchemaType(it.key, it.value);
				if (
					singleLeafSchemaType
					&& (
						schemaTypeIncludes(singleLeafSchemaType, '#String')
						|| isSummaryType(singleLeafSchemaType)
						|| isDialogueType(singleLeafSchemaType)
					)
				) {
					return true;
				}
				return false;
			}

			if (Array.isArray(it.value)) return false;

			return false;
		};

		const shouldUseCollapsibleSubFieldShell = (it) => {
			if (!it || !detailSubFieldKeySet.has(it.key)) return false;
			return !isStringLikeStandaloneSubField(it);
		};

		const createStandaloneSubFieldSection = (it, bodyChildren, options = {}) => {
			if (!it) return null;
			const children = Array.isArray(bodyChildren) ? bodyChildren.filter(Boolean) : [bodyChildren].filter(Boolean);
			if (!children.length) return null;
			const sectionTitle = (it.key === 'ArcanumspecStats')
				? 'アルカナムスペック(アルカナ能力)の特性'
				: it.label;

			const collapsible = (typeof options?.collapsible === 'boolean')
				? options.collapsible
				: shouldUseCollapsibleSubFieldShell(it);

			if (!collapsible) {
				return el('div', { class: 'section', 'data-subfield-key': it.key || '' }, [
					el('h3', {}, [sectionTitle]),
					...children
				]);
			}

			return el('details', {
				class: 'section section--collapsible',
				'data-subfield-key': it.key || ''
			}, [
				el('summary', { class: 'section__summary' }, [
					el('h3', { class: 'section__title' }, [sectionTitle])
				]),
				el('div', { class: 'section__body' }, children)
			]);
		};

		const renderStructuredObjectSection = (it) => {
			const structuredSection = renderStructuredSubFieldSection(it);
			if (!structuredSection) return null;

			return createStandaloneSubFieldSection(it, [structuredSection]);
		};

		const relationRendererApi = {
			createElement: el,
			createDetailTagGrid,
			formatValueForDisplay,
			dialogueBodyText,
			getFieldLabel,
			resolveVarsDefLabelPack,
			formatBilingualLabel,
			getWorkIndexField,
			getIndexSubDefs,
			pickPrimaryIndexSubDef,
			recordMatchesIndexQuery,
			buildViewerNavigationHref,
			openDetail,
			openViewerNavigation,
			getCharState: () => window.__CHAR_STATE__,
			fetchDbRecords: (wId, dbName) => fetchDB(wId, dbName, { resolve: true })
		};

		const renderStandaloneFieldSection = (it) => {
			if (!it) return null;
			const stringLikeStandalone = isStringLikeStandaloneSubField(it);

			const wrappedSection = getCharacterSectionRendererRegistry()?.renderWithRegisteredSectionRenderer?.(it, {
				display: it.display,
				isStandaloneSubField: true,
				fieldLabelMap,
				workMeta: metaForLookup,
				globalDefType,
				fieldDisplayMap,
				fieldTypeMap,
				helpers: {
					el,
					preWrapText,
					isPlainObject,
					getCurrentPageLanguage,
					formatValueForDisplay,
					pickSchemaType,
					pickSchemaDisplay,
					pickSchemaPath,
					pickSchemaHintsForObjectLeaf,
					getFieldLabel,
					createDetailTagGrid,
					schemaTypeIncludes,
					isEmptyValueLoose,
					kvTable,
					buildObjectChildBlocks,
					renderStructuredObjectSection: stringLikeStandalone ? null : renderStructuredObjectSection,
					wrapStandaloneSection: createStandaloneSubFieldSection,
					relationApi: relationRendererApi
				}
			});
			if (wrappedSection) return wrappedSection;

			const relationSection = ((it.key === 'Relation' || /^RelationTo_/.test(it.key)) && it.value)
				? renderRelations(it.value, fieldLabelMap, metaForLookup, globalDefType, fieldDisplayMap, {
					containerKey: it.key,
					fieldTypeMap,
					isStandaloneSubField: true,
					wrapStandaloneSection: createStandaloneSubFieldSection,
					item: it
				})
				: null;
			if (relationSection) return relationSection;

			const structuredSection = stringLikeStandalone ? null : renderStructuredObjectSection(it);
			if (structuredSection) return structuredSection;

			const node = toDisplayNode(it.key, it.value, it.type, it.display);
			const text = (typeof node === 'string') ? node : (node?.textContent ?? '');
			if (!text) {
				if (/specStats$/i.test(String(it.key || '')) && isPlainObject(it.value)) {
					const specLevelRaw = it.value?.SpecLevel;
					if (!isEmptyValueLoose(specLevelRaw)) {
						const specLevelPath = `${it.key}.SpecLevel`;
						const schemaType = pickSchemaType(specLevelPath, 'SpecLevel');
						if (schemaTypeIncludes(schemaType, '$EnumDef_Rank')) {
							const schemaDisplay = pickSchemaDisplay(specLevelPath, 'SpecLevel', it.key);
							const displayValue = formatValueForDisplay(specLevelRaw, fieldLabelMap, metaForLookup, globalDefType, {
								schemaType,
								display: schemaDisplay,
								fieldKey: specLevelPath
							});
							if (String(displayValue || '').trim()) {
								return createStandaloneSubFieldSection(it, [
									createDetailTagGrid([
										el('div', { class: 'tag' }, [
											`${getFieldLabel(specLevelPath, fieldLabelMap, metaForLookup, globalDefType, 'SpecLevel')}: ${displayValue}`
										])
									])
								]);
							}
						}
					}
				}
				return null;
			}

			return createStandaloneSubFieldSection(it, [
				el('div', { style: 'margin-bottom: 10px;' }, [
					(typeof node === 'string') ? preWrapText(node) : node
				])
			]);
		};

		const profileItems = sectionBuckets.profile
			.filter((it) => !isNestedUnderPromotedSubField(it?.key))
			.map((it) => {
				const node = toDisplayNode(it.key, it.value, it.type, it.display);
				const text = (typeof node === 'string') ? node : (node?.textContent ?? '');
				if (!text) return null;
				return el('div', { style: 'margin-bottom: 10px;' }, [
					el('div', { class: 'tag', style: 'margin-bottom: 6px;' }, [it.label]),
					(typeof node === 'string') ? preWrapText(node) : node
				]);
			})
			.filter(Boolean);

		const otherRows = buildKvRows(sectionBuckets.other.filter((it) => !isNestedUnderPromotedSubField(it?.key)));
		const specRows = buildKvRows(sectionBuckets.spec.filter((it) => !isNestedUnderPromotedSubField(it?.key)));
		const basicExtraRows = buildKvRows(sectionBuckets.basic.filter((it) => !isNestedUnderPromotedSubField(it?.key)));
		const subFieldItemMap = new Map(sectionBuckets.sub.map((it) => [it.key, it]));
		const orderedSubFieldItems = [];

		for (const key of detailSubFieldKeys) {
			const item = subFieldItemMap.get(key);
			if (!item) continue;
			orderedSubFieldItems.push(item);
			subFieldItemMap.delete(key);
		}

		orderedSubFieldItems.push(...subFieldItemMap.values());
		const subFieldSections = orderedSubFieldItems
			.map((it) => renderStandaloneFieldSection(it))
			.filter(Boolean);
		const renderedSubFieldKeySet = new Set(orderedSubFieldItems.map((it) => it.key));

		// basic セクションは「基本情報テーブル + スキーマで basic 指定された追加項目」をまとめて表示
		const basicSection = el('div', { class: 'section' }, [
			el('h3', {}, [getFieldLabel('BasicInfo', fieldLabelMap, workMeta, globalDefType, '基本情報')]),
			basic,
			basicExtraRows.length ? kvTable({}, basicExtraRows) : null,
		].filter(Boolean));

		// スペック/能力: $display.section:'spec' の top-level フィールドのみ（ability/specStats は専用レンダラーがサブフィールドで表示）
		const specSection = specRows.length
			? el('div', { class: 'section' }, [
				el('h3', {}, ['スペック/能力']),
				kvTable({}, specRows),
			].filter(Boolean))
			: null;

		const profileSummaryText = (() => {
			const lang = getCurrentPageLanguage();
			if (lang === 'en') return String(rec?.Summary_EN || rec?.Summary_JP || '').trim();
			if (lang === 'jp') return String(rec?.Summary_JP || rec?.Summary_EN || '').trim();
			return String(rec?.Summary_JP || rec?.Summary_EN || '').trim();
		})();
		const includeSummaryInProfileSection = Boolean(profileSummaryText) && !isPromotedSubFieldKey('Summary');
		const profileSection = (includeSummaryInProfileSection || profileItems.length)
			? el('div', { class: 'section' }, [
				el('h3', {}, [getFieldLabel('Profile', fieldLabelMap, workMeta, globalDefType, 'プロフィール/テキスト')]),
				includeSummaryInProfileSection ? el('div', {}, [
					el('div', { class: 'tag', style: 'margin-bottom: 6px;' }, [getFieldLabel('Summary', fieldLabelMap, workMeta, globalDefType, '概要')]),
					preWrapText(profileSummaryText)
				]) : null,
				profileItems.length ? el('div', {}, profileItems) : null,
			].filter(Boolean))
			: null;

		const secondaryInfoItems = (secondaryMetaFieldContext.fields || [])
			.map((fieldDef) => {
				const labelKey = typeof fieldDef?.hashTag === 'string' ? fieldDef.hashTag.trim() : '';
				if (!labelKey) return null;

				const displayHint = secondaryMetaFieldContext.displayMap?.[labelKey] ?? fieldDef?.$display ?? null;
				if (displayHint && typeof displayHint === 'object' && displayHint.auto === false) return null;
				if (String(displayHint?.section || '').trim() !== 'secondaryInfo') return null;

				const value = rec?.[labelKey];
				if (isEmptyValueLoose(value)) return null;

				const schemaType = secondaryMetaFieldContext.typeMap?.[labelKey] ?? fieldDef?.$type ?? null;
				const node = toDisplayNode(labelKey, value, schemaType, displayHint);
				const text = (typeof node === 'string') ? node.trim() : String(node?.textContent ?? '').trim();
				if (!text) return null;

				return {
					label: getFieldLabel(labelKey, secondaryMetaFieldContext.labelMap, workMeta, globalDefType, labelKey),
					node
				};
			})
			.filter(Boolean);

		const secondaryInfoSection = secondaryInfoItems.length
			? el('div', { class: 'section' }, [
				el('h3', {}, [String((() => {
					const lang = getCurrentPageLanguage();
					if (lang === 'en') {
						return secondaryMetaFieldContext.schema?.hashTag_EN || secondaryMetaFieldContext.schema?.hashTag_JP || 'Secondary Info';
					}
					return secondaryMetaFieldContext.schema?.hashTag_JP || secondaryMetaFieldContext.schema?.hashTag_EN || '二次創作情報';
				})())]),
				el('div', {}, secondaryInfoItems.map((item) => el('div', { style: 'margin-bottom: 10px;' }, [
					el('div', { class: 'tag', style: 'margin-bottom: 6px;' }, [item.label]),
					(typeof item.node === 'string') ? preWrapText(item.node) : item.node
				])))
			])
			: null;

		const referenceConnectionsSection = renderReferenceConnectionsSection(
			rec,
			workId,
			workMeta,
			globalMeta,
			fieldLabelMap,
			metaForLookup,
			globalDefType
		);

		const right = el('div', {}, [
			titleRow,
			basicSection,
			secondaryInfoSection,
			specSection,
			profileSection,
			referenceConnectionsSection,
			...subFieldSections,
			!renderedSubFieldKeySet.has('Relation') && rec.Relation && (rec.Relation.Related || rec.Relation.Commented)
				? renderRelations(rec.Relation, fieldLabelMap, metaForLookup, globalDefType, fieldDisplayMap, { containerKey: 'Relation', fieldTypeMap })
				: null,
			...Object.keys(rec || {})
				.filter((k) => /^RelationTo_/.test(k) && !renderedSubFieldKeySet.has(k))
				.map((k) => {
					const rv = rec[k];
					return (rv?.Related || rv?.Commented)
						? renderRelations(rv, fieldLabelMap, metaForLookup, globalDefType, fieldDisplayMap, { containerKey: k, fieldTypeMap })
						: null;
				})
		].filter(Boolean));

		mount.appendChild(el('div', { class: 'detail' }, [left, right]));

		// デバッグ: 画面内に「生コード（例: FemaleNeutral）」が残っている箇所を自動検出
		// - 辞書解決自体は成功しているのに表示が変わらない場合、どのDOMノードが raw を出しているかを特定する
		try {
			if ($('#chk-debug')?.checked) {
				const rawGT = rec?.GenderType;
				if (typeof rawGT === 'string' && rawGT.trim()) {
					const needle = rawGT.trim();

					/**
					 * 要素の簡易パス（tag#id.class...）を作る
					 * @param {Element|null} el
					 */
					const briefElPath = (el) => {
						if (!el || !(el instanceof Element)) return '';
						const parts = [];
						let cur = el;
						for (let i = 0; i < 6 && cur; i++) {
							const tag = (cur.tagName || '').toLowerCase();
							const id = cur.id ? `#${cur.id}` : '';
							const cls = (cur.classList && cur.classList.length)
								? `.${Array.from(cur.classList).slice(0, 3).join('.')}`
								: '';
							parts.push(`${tag}${id}${cls}`);
							cur = cur.parentElement;
							if (cur === mount) break;
						}
						return parts.join(' <- ');
					};

					const hits = [];
					const walker = document.createTreeWalker(mount, NodeFilter.SHOW_TEXT);
					while (walker.nextNode()) {
						const node = walker.currentNode;
						const text = String(node?.nodeValue ?? '').trim();
						if (!text) continue;
						if (!text.includes(needle)) continue;

						const parent = node.parentElement;
						const tr = parent ? parent.closest('tr') : null;
						const thText = tr ? String(tr.querySelector('th')?.textContent ?? '').trim() : '';
						hits.push({ text, th: thText, path: briefElPath(parent) });
						if (hits.length >= 12) break;
					}

					if (hits.length) {
						console.warn('🧭 raw GenderType appears in rendered detail DOM:', { needle, hits });
					} else {
						console.log('🧭 raw GenderType not found in rendered detail DOM:', { needle });
					}
				}
			}
		} catch (e) {
			console.warn('⚠️ raw GenderType DOM scan failed:', e);
		}

	} catch (error) {
		console.error('Error rendering detail view:', error);
		mount.textContent = '';
		mount.appendChild(el('div', {
			style: 'padding: 20px; text-align: center; color: red;'
		}, ['エラー: 詳細情報の読み込みに失敗しました (', getSafeErrorMessage(error), ')']));
	}
}

/**
 * 関係（Relation）を typedef/meta 駆動で表示する
 * - RelationLabel は #List_RelationLabel（db_meta.json の $VarsDef）を参照してJP化
 * @param {Object} rel
 * @param {Object} fieldLabelMap
 * @param {Object} workMeta
 * @param {Object} globalDefType
 * @returns {HTMLElement}
 */
function renderRelations(rel, fieldLabelMap, workMeta, globalDefType, fieldDisplayMap = null, options = {}) {
	const containerKey = (typeof options?.containerKey === 'string' && options.containerKey.trim())
		? options.containerKey.trim()
		: 'Relation';
	const fieldTypeMap = (options?.fieldTypeMap && typeof options.fieldTypeMap === 'object') ? options.fieldTypeMap : null;
	const registry = getCharacterSectionRendererRegistry();
	const item = (options?.item && typeof options.item === 'object')
		? options.item
		: {
			key: containerKey,
			label: getFieldLabel(containerKey, fieldLabelMap, workMeta, globalDefType, '関係'),
			value: rel,
			display: { sectionWrapper: 'relationSection' }
		};

	return registry?.renderNamedSectionRenderer?.('relationSection', item, {
		display: item.display,
		containerKey,
		wrapInSection: options?.wrapInSection !== false,
		isStandaloneSubField: options?.isStandaloneSubField === true,
		fieldLabelMap,
		workMeta,
		globalDefType,
		fieldDisplayMap,
		fieldTypeMap,
		helpers: {
			relationApi: {
				createElement: el,
				createDetailTagGrid,
				formatValueForDisplay,
				dialogueBodyText,
				getFieldLabel,
				resolveVarsDefLabelPack,
				formatBilingualLabel,
				getWorkIndexField,
				getIndexSubDefs,
				pickPrimaryIndexSubDef,
				recordMatchesIndexQuery,
				buildViewerNavigationHref,
				fetchDbRecords: (wId, dbName) => fetchDB(wId, dbName, { resolve: true }),
				openDetail,
				openViewerNavigation,
				getCharState: () => window.__CHAR_STATE__
			},
			wrapStandaloneSection: options?.wrapStandaloneSection
		}
	}) ?? null;
}

function buildViewerNavigationHref(workId, dbName, options = {}) {
	const current = getQS();
	const normalizedWork = workKeyForAPI(workId || current.work || '');
	const hasOwn = (key) => Object.prototype.hasOwnProperty.call(options || {}, key);
	const q = hasOwn('q') ? String(options?.q || '').trim() : String(current.q || '').trim();
	const idx = hasOwn('idx') ? String(options?.idx || '').trim() : '';
	const idxKey = hasOwn('idxKey') ? String(options?.idxKey || '').trim() : '';
	const num = hasOwn('num')
		? String(options?.num || '').trim()
		: (idxKey === 'Num' ? idx : '');
	const qs = new URLSearchParams({
		...current,
		work: normalizedWork,
		db: String(dbName || current.db || ''),
		q,
		num,
		idx,
		idxKey
	});
	return `${location.pathname}?${qs.toString()}`;
}

async function openViewerNavigation(workId, dbName, options = {}) {
	const href = buildViewerNavigationHref(workId, dbName, options);
	const selectWork = $('#select-work');
	const selectDB = $('#select-db');
	const searchInput = $('#search-input');
	const normalizedWork = normalizeWorkKey(workId || window?.__CHAR_STATE__?.workId || '');
	const normalizedDb = String(dbName || '').trim();
	const q = String(options?.q || '').trim();
	const idx = String(options?.idx || '').trim();
	const idxKey = String(options?.idxKey || '').trim();
	const num = String(options?.num || (idxKey === 'Num' ? idx : '')).trim();

	if (!selectWork || !selectDB || !normalizedWork || !normalizedDb) {
		location.href = href;
		return;
	}

	try {
		if (selectWork.value !== normalizedWork) {
			selectWork.value = normalizedWork;
			await populateDBs(normalizedWork);
		}
		selectDB.value = normalizedDb;
		if (searchInput) searchInput.value = q;
		setQS({ work: workKeyForAPI(normalizedWork), db: normalizedDb, q, num, idx, idxKey });
		await renderSelectionMeta(normalizedWork, normalizedDb);
		await reloadInternal(false);
	} catch {
		location.href = href;
	}
}

function renderReferenceConnectionsSection(rec, workId, workMeta, globalMeta, fieldLabelMap, metaForLookup, globalDefType) {
	const relatedTerms = Array.isArray(rec?.RelatedTerms)
		? rec.RelatedTerms.map((value) => String(value || '').trim()).filter(Boolean)
		: [];
	const relatedCreations = Array.isArray(rec?.RelatedCreations)
		? rec.RelatedCreations.filter((value) => value && typeof value === 'object')
		: [];

	if (!relatedTerms.length && !relatedCreations.length) return null;

	const currentWorkKey = normalizeWorkKey(workId || '');
	const getWorkLabel = (targetWorkId) => {
		const normalized = normalizeWorkKey(targetWorkId || currentWorkKey);
		const cw = globalMeta?.CreationWorks?.[normalized];
		const lang = getCurrentPageLanguage();
		const rawTitle = (lang === 'en' ? cw?.Title_EN : cw?.Title_JP) || cw?.Title_JP || cw?.Title_EN || cw?.Title;
		if (typeof rawTitle === 'string' && rawTitle.trim()) return rawTitle.trim();
		return String(normalized || '').replace(/^#?Works_/, '').trim() || '作品';
	};

	const buildTagLink = (href, text, title, onNavigate) => el('div', { class: 'tag' }, [
		el('a', {
			href,
			title,
			onclick: async (event) => {
				if (typeof onNavigate !== 'function') return;
				event.preventDefault();
				event.stopPropagation();
				await onNavigate();
			}
		}, [text])
	]);

	const blocks = [];

	if (relatedTerms.length) {
		const termNodes = relatedTerms.map((term) => {
			const href = buildViewerNavigationHref(currentWorkKey, 'Glossary', { q: term });
			return buildTagLink(
				href,
				term,
				`${term} を創作用語 DB で開く`,
				() => openViewerNavigation(currentWorkKey, 'Glossary', { q: term })
			);
		});

		blocks.push(el('div', { style: 'margin-bottom: 10px;' }, [
			el('div', { class: 'tag', style: 'margin-bottom: 6px;' }, [
				getFieldLabel('RelatedTerms', fieldLabelMap, metaForLookup, globalDefType, '関連用語')
			]),
			createDetailTagGrid(termNodes)
		]));
	}

	if (relatedCreations.length) {
		const creationNodes = relatedCreations
			.map((entry) => {
				const targetWork = normalizeWorkKey(entry.RelatedWorks || currentWorkKey);
				const targetDb = String(entry.RelatedDB || '').trim();
				if (!targetWork || !targetDb) return null;

				const targetMeta = targetWork === currentWorkKey ? findDbCatalogEntry(workMeta, targetDb) : null;
				const dbLabel = getDbDisplayLabel(targetMeta, targetDb);
				const workLabel = getWorkLabel(targetWork);
				const linkText = `${workLabel} / ${dbLabel}`;
				const href = buildViewerNavigationHref(targetWork, targetDb, { q: '' });
				return buildTagLink(
					href,
					linkText,
					`${linkText} を開く`,
					() => openViewerNavigation(targetWork, targetDb, { q: '' })
				);
			})
			.filter(Boolean);

		if (creationNodes.length) {
			blocks.push(el('div', { style: 'margin-bottom: 10px;' }, [
				el('div', { class: 'tag', style: 'margin-bottom: 6px;' }, [
					getFieldLabel('RelatedCreations', fieldLabelMap, metaForLookup, globalDefType, '関連創作')
				]),
				createDetailTagGrid(creationNodes)
			]));
		}
	}

	if (!blocks.length) return null;

	return el('div', { class: 'section' }, [
		el('h3', {}, ['関連情報']),
		el('div', {}, blocks)
	]);
}

/**
 * _DBLink参照解決結果を表示するセクションを構築する
 * API機能と同様の出力形式でリンク先データを表示
 *
 * @param {Array} dbLinkResolved - 参照解決結果の配列
 * @param {Object} fieldLabelMap - フィールドラベルのマッピング
 * @param {Object} workMeta - 作品メタデータ
 * @param {Object} globalDefType - グローバル型定義
 * @returns {HTMLElement} 参照解決結果セクション
 */
function renderDBLinkResolved(dbLinkResolved, fieldLabelMap, workMeta, globalDefType) {
	if (!Array.isArray(dbLinkResolved) || dbLinkResolved.length === 0) {
		return null;
	}

	console.log('🔗 Rendering _DBLink resolved data:', dbLinkResolved);

	const referenceItems = [];

	for (const linkResult of dbLinkResolved) {
		if (linkResult.error) {
			// エラーがある場合の表示
			referenceItems.push(
				el('div', { class: 'reference-error', style: 'padding: 12px; border: 1px solid var(--error); border-radius: 8px; background: rgba(231, 76, 60, 0.1); margin-bottom: 12px;' }, [
					el('h5', { style: 'margin: 0 0 8px; color: var(--error); font-size: var(--font-size-sm);' }, [
						`❌ 参照エラー: ${linkResult.worksTitle || 'Unknown'} / ${linkResult.dbName || 'Unknown'}`
					]),
					el('div', { style: 'color: var(--muted); font-size: var(--font-size-xs);' }, [linkResult.error])
				])
			);
			continue;
		}

		// 正常な参照結果の表示
		const { worksTitle, dbName, count, records } = linkResult;

		referenceItems.push(
			el('div', { class: 'reference-result', style: 'padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); margin-bottom: 12px;' }, [
				// 参照先の作品・DB情報
				el('h5', { style: 'margin: 0 0 8px; color: var(--accent); font-size: var(--font-size-sm);' }, [
					`🔗 ${worksTitle} / ${dbName} (${count}件)`
				]),

				// 取得したレコードの表示
				count > 0 ? el('div', { class: 'referenced-records' },
					records.slice(0, 3).map((record, index) => // 最初の3件のみ表示
						el('div', {
							class: 'referenced-record',
							style: 'margin: 8px 0; padding: 8px; border-left: 3px solid var(--accent-2); background: rgba(158, 119, 255, 0.1);'
						}, [
							el('div', { style: 'font-weight: 600; font-size: var(--font-size-sm);' }, [
								getRecordPrimaryTitle(record) || `Record #${index + 1}`
							]),
							(() => {
								const _recLang = getCurrentPageLanguage();
								const secondary = _recLang === 'en'
									? (record.Name_JP || record.FormalName_JP || '')
									: (record.Name_EN || record.FormalName_EN || '');
								return secondary
									? el('div', { style: 'color: var(--muted); font-size: var(--font-size-xs); margin: 2px 0;' }, [secondary])
									: null;
							})(),
							record.Class || record.RaceType || record.GenderType ?
								el('div', { style: 'margin-top: 4px;' }, [
									(() => {
										const classText = record.Class
											? formatValueForDisplay(record.Class, {}, workMeta, globalDefType, {
												schemaType: '#DictIndex[]',
												fieldKey: 'Class'
											})
											: (record.Class_EN || '');
										return classText
											? el('span', { class: 'chip', style: 'margin-right: 4px;' }, [classText])
											: null;
									})(),
									record.RaceType ? el('span', { class: 'chip', style: 'margin-right: 4px;' }, [
										formatValueForDisplay(record.RaceType, {}, workMeta, globalDefType, {
											schemaType: '#ListIndex|#ListIndex_withAbout[]',
											fieldKey: 'RaceType'
										})
									]) : null,
									record.GenderType ? el('span', { class: 'chip', style: 'margin-right: 4px;' }, [
										formatValueForDisplay(record.GenderType, {}, workMeta, globalDefType, {
											schemaType: '$EnumDef|$EnumDef_withAbout',
											fieldKey: 'GenderType'
										})
									]) : null
								].filter(Boolean)) : null
						].filter(Boolean))
					).concat(
						// 3件を超える場合の省略表示
						count > 3 ? [
							el('div', { style: 'margin: 8px 0; color: var(--muted); font-size: var(--font-size-xs); text-align: center;' }, [
								`... 他 ${count - 3} 件`
							])
						] : []
					)
				) : el('div', { style: 'color: var(--muted); font-size: var(--font-size-xs);' }, ['該当するレコードがありません'])
			])
		);
	}

	return el('div', { class: 'section' }, [
		el('h3', {}, ['🔗 参照情報 (_DBLink)']),
		el('div', { class: 'reference-links' }, referenceItems)
	]);
}

/**
 * Wire up all UI event handlers and control behaviors
 * Sets up change handlers for work/DB selection, search input, checkboxes,
 * navigation buttons, and cache/Service Worker reset functionality
 */
function wireControls() {
	// Store handlers in global namespace to enable proper removal
	if (!window.__eventHandlers) {
		window.__eventHandlers = {};
	}

	// Get elements
	const selectWork = $('#select-work');
	const selectDB = $('#select-db');
	const searchInput = $('#search-input');
	const chkResolve = $('#chk-resolve');
	const chkDebug = $('#chk-debug');
	const btnLangToggle = $('#btn-lang-toggle');
	const btnBack = $('#btn-back');
	const imageLightbox = $('#image-lightbox');
	const imageLightboxClose = $('#image-lightbox-close');

	// Remove previous handlers if they exist
	if (window.__eventHandlers.workChange) {
		selectWork.removeEventListener('change', window.__eventHandlers.workChange);
	}
	if (window.__eventHandlers.dbChange) {
		selectDB.removeEventListener('change', window.__eventHandlers.dbChange);
	}
	if (window.__eventHandlers.searchInput) {
		searchInput.removeEventListener('input', window.__eventHandlers.searchInput);
	}
	if (window.__eventHandlers.resolveChange) {
		chkResolve.removeEventListener('change', window.__eventHandlers.resolveChange);
	}
	if (window.__eventHandlers.debugChange) {
		chkDebug.removeEventListener('change', window.__eventHandlers.debugChange);
	}
	if (window.__eventHandlers.langToggleClick && btnLangToggle) {
		btnLangToggle.removeEventListener('click', window.__eventHandlers.langToggleClick);
	}
	if (window.__eventHandlers.backClick) {
		btnBack.removeEventListener('click', window.__eventHandlers.backClick);
	}
	if (window.__eventHandlers.lightboxBackdropClick && imageLightbox) {
		imageLightbox.removeEventListener('click', window.__eventHandlers.lightboxBackdropClick);
	}
	if (window.__eventHandlers.lightboxCloseClick && imageLightboxClose) {
		imageLightboxClose.removeEventListener('click', window.__eventHandlers.lightboxCloseClick);
	}
	if (window.__eventHandlers.lightboxKeydown) {
		document.removeEventListener('keydown', window.__eventHandlers.lightboxKeydown);
	}

	// Define and store new handlers
	window.__eventHandlers.workChange = async (e) => {
		const wk = e.target.value;
		setQS({ work: wk.replace('#', ''), db: '', num: '', idx: '', idxKey: '' });
		await populateDBs(wk);
		await renderSelectionMeta(wk, $('#select-db').value || '');
		await reload();
	};

	window.__eventHandlers.dbChange = async (e) => {
		const db = e.target.value;
		setQS({ db, num: '', idx: '', idxKey: '' });
		await renderSelectionMeta($('#select-work').value, db);
		await reload();
	};

	window.__eventHandlers.searchInput = async () => {
		setQS({ q: $('#search-input').value });
		await filterListOnly();
	};

	window.__eventHandlers.resolveChange = reload;
	window.__eventHandlers.debugChange = reload;
	window.__eventHandlers.langToggleClick = async () => {
		const next = getCurrentPageLanguage() === 'en' ? 'jp' : 'en';
		persistPageLanguage(next);
		applyStaticTextLanguage();
		const currentWork = $('#select-work')?.value || '';
		const currentDb = $('#select-db')?.value || 'Primary';
		if (currentWork) {
			await populateWorks(currentWork);
			await populateDBs(currentWork, currentDb);
		}
		await renderSelectionMeta($('#select-work').value, $('#select-db').value || '');
		await reload();
	};
	window.__eventHandlers.backClick = () => {
		closeImageLightbox({ restoreFocus: false });
		$('#detail-view').hidden = true;
		$('#list-view').hidden = false;
		setQS({ num: '', idx: '', idxKey: '' });
	};

	window.__eventHandlers.lightboxBackdropClick = (event) => {
		if (event.target === imageLightbox) {
			closeImageLightbox();
		}
	};

	window.__eventHandlers.lightboxCloseClick = () => {
		closeImageLightbox();
	};

	window.__eventHandlers.lightboxKeydown = (event) => {
		if (event.key === 'Escape' && imageLightbox && !imageLightbox.hidden) {
			event.preventDefault();
			closeImageLightbox();
		}
	};

	// Add new handlers
	selectWork.addEventListener('change', window.__eventHandlers.workChange);
	selectDB.addEventListener('change', window.__eventHandlers.dbChange);
	searchInput.addEventListener('input', window.__eventHandlers.searchInput);
	chkResolve.addEventListener('change', window.__eventHandlers.resolveChange);
	chkDebug.addEventListener('change', window.__eventHandlers.debugChange);
	if (btnLangToggle) {
		btnLangToggle.addEventListener('click', window.__eventHandlers.langToggleClick);
	}
	btnBack.addEventListener('click', window.__eventHandlers.backClick);
	if (imageLightbox) {
		imageLightbox.addEventListener('click', window.__eventHandlers.lightboxBackdropClick);
	}
	if (imageLightboxClose) {
		imageLightboxClose.addEventListener('click', window.__eventHandlers.lightboxCloseClick);
	}
	document.addEventListener('keydown', window.__eventHandlers.lightboxKeydown);

	// Handle reset button
	const btnReset = document.getElementById('btn-reset-sw');
	if (btnReset) {
		if (window.__eventHandlers.resetClick) {
			btnReset.removeEventListener('click', window.__eventHandlers.resetClick);
		}

		window.__eventHandlers.resetClick = async () => {
			try {
				// Clear all browser caches
				const keys = await caches.keys();
				await Promise.all(keys.map(k => caches.delete(k)));
			} catch { }
			try {
				// Unregister all service workers
				const regs = await navigator.serviceWorker.getRegistrations();
				await Promise.all(regs.map(r => r.unregister()));
			} catch { }

			// Clear in-memory metadata caches
			globalMetaCache = null;
			globalTypeDefCache = null;
			globalDefTypeCache = null;
			workTypeDefCache.clear();
			worksCatalogCache = null;
			workDbCatalogCache.clear();

			location.reload();
		};

		btnReset.addEventListener('click', window.__eventHandlers.resetClick);
	}
}

async function filterListOnly() {
	const state = window.__CHAR_STATE__;
	if (!state || !state.records) return;

	// Use enhanced rendering with image fields if available
	const imageFields = state.imageFields || null;
	await renderList(filterPublicCharacterRecords(state.records), state.workId, openDetail, imageFields);
}

async function populateWorks(initialWork) {
	const sel = $('#select-work');
	sel.textContent = '';
	const items = await listWorks();
	for (const w of items) {
		const opt = el('option', { value: w.key }, [humanWorkLabel(w)]);
		if (w.key === normalizeWorkKey(initialWork) || w.key.endsWith(initialWork)) opt.selected = true;
		sel.appendChild(opt);
	}
	if (!sel.value && items[0]) sel.value = items[0].key;
	return sel.value;
}

async function populateDBs(workKey, initialDB) {
	const sel = $('#select-db');
	sel.textContent = '';
	const dbs = await listWorkDBs(workKey);
	for (const d of dbs) {
		const label = getDbDisplayLabel(d, d.key);
		const opt = el('option', {
			value: d.key,
			title: [d.DB_Label_EN, d.DB_Summary || getStoryEraSummary(d.StoryEra) || d.key].filter(Boolean).join('\n')
		}, [label]);
		if (d.key === initialDB) opt.selected = true;
		sel.appendChild(opt);
	}
	if (!sel.value && dbs[0]) sel.value = dbs[0].key;
	await renderSelectionMeta(workKey, sel.value);
	return sel.value;
}

async function openDetail(rec) {
	const state = window.__CHAR_STATE__;
	if (!isPublicCharacterRecord(rec)) return;
	closeImageLightbox({ restoreFocus: false });
	$('#list-view').hidden = true;
	$('#detail-view').hidden = false;
	renderDetail(state.workId, rec);

	// 作品ごとのインデックス定義に従って、直リンク用パラメータを更新
	try {
		const globalMeta = await fetchGlobalMeta();
		const indexDef = getWorkIndexField(state.workId, globalMeta);
		const id = getIndexIdentifierFromRecord(rec, indexDef);
		if (id) {
			const legacyNum = id.keyPath === 'Num' ? id.value : '';
			setQS({ idx: id.value, idxKey: id.keyPath, num: legacyNum });
		} else if (rec.Num != null) {
			// 最小互換
			setQS({ num: String(rec.Num), idx: '', idxKey: '' });
		}
	} catch {
		if (rec.Num != null) setQS({ num: String(rec.Num) });
	}
}

/**
 * メインアプリケーション初期化関数
 * Service Worker の登録、UI の配線、データの読み込みを段階的に実行
 */
async function main() {
	// 重複初期化を防止
	if (isInitialized) {
		console.log('⚠️ アプリケーションは既に初期化済みです、スキップします...');
		return;
	}

	// リロードで流れたSW失敗ログを、初期化前に再掲（引用できるようにする）
	replayRememberedSwInitError();

	const startTime = performance.now();
	console.log('🚀 キャラクターブラウザアプリケーションを初期化中...');

	try {
		// 競合状態を防ぐため、即座に初期化中としてマーク
		isInitialized = true;

		const qsLang = getQS().lang;
		let initialLang = qsLang;
		if (!initialLang) {
			try {
				initialLang = localStorage.getItem(PAGE_LANG_STORAGE_KEY) || PAGE_LANG_DEFAULT;
			} catch {
				initialLang = PAGE_LANG_DEFAULT;
			}
		}
		const normalizedLang = normalizePageLanguage(initialLang);
		if (!qsLang && normalizedLang !== 'mix') setQS({ lang: normalizedLang });
		applyLanguageState(normalizedLang);
		applyStaticTextLanguage();

		// ローディングインジケーターを表示
		showLoadingIndicator('アプリケーションを初期化しています...');

		// ステップ1: Service Worker の初期化
		let stepStart = performance.now();
		await ensureApiSW();
		console.log(`✅ Service Worker を ${(performance.now() - stepStart).toFixed(2)}ms で初期化`);

		// ステップ2: UI コントロールの配線
		stepStart = performance.now();
		wireControls();
		console.log(`✅ UI コントロールを ${(performance.now() - stepStart).toFixed(2)}ms で配線`);

		// ステップ3: 作品リストの入力
		stepStart = performance.now();
		const qs = getQS();
		const wk = await populateWorks(qs.work);
		console.log(`✅ 作品を ${(performance.now() - stepStart).toFixed(2)}ms で入力:`, wk);

		// ステップ4: データベースの入力
		stepStart = performance.now();
		await populateDBs(wk, qs.db || 'Primary');
		console.log(`✅ データベースを ${(performance.now() - stepStart).toFixed(2)}ms で入力`);

		// データ読み込みフェーズのローディングメッセージを更新
		showLoadingIndicator('キャラクターデータを読み込んでいます...');

		// ステップ5: 初期データの読み込み
		stepStart = performance.now();
		await reloadInternal(false); // 重複するローディングインジケーターをスキップするため false を渡す
		console.log(`✅ 初期データを ${(performance.now() - stepStart).toFixed(2)}ms で読み込み`);

		hideLoadingIndicator();

		// 初期化後にメインコンテンツが確実に表示されるようにする
		const mainContent = $('#main-content');
		if (mainContent) {
			mainContent.style.display = 'block';
			mainContent.hidden = false;
		}

		// Ensure page sections are visible
		const workSection = $('#work-section');
		const dbSection = $('#db-section');
		const listSection = $('#list-section');

		if (workSection) {
			workSection.style.display = 'block';
			workSection.hidden = false;
		}
		if (dbSection) {
			dbSection.style.display = 'block';
			dbSection.hidden = false;
		}
		if (listSection) {
			listSection.style.display = 'block';
			listSection.hidden = false;
		}

		const totalTime = performance.now() - startTime;
		console.log(`🎉 Application initialization complete in ${totalTime.toFixed(2)}ms`);

	} catch (error) {
		const totalTime = performance.now() - startTime;
		console.error(`❌ Application initialization failed after ${totalTime.toFixed(2)}ms:`, error);

		// SW controller を取得するための自動リロード中は、エラー表示を出さない
		if (String(error?.message || error || '') === 'SW_CONTROLLER_RELOAD') {
			return;
		}

		// Reset initialization state on error so user can retry
		isInitialized = false;

		hideLoadingIndicator();
		showErrorMessage('アプリケーションの初期化に失敗しました', error);
	}
}

/**
 * Enhanced error handling and user feedback functions
 */

/**
 * Show loading indicator with message
 * @param {string} message - Loading message to display
 */
function showLoadingIndicator(message = '読み込み中...') {
	let indicator = $('#loading-indicator');
	if (!indicator) {
		indicator = el('div', {
			id: 'loading-indicator',
			class: 'loading-overlay'
		}, [
			el('div', { class: 'loading-content' }, [
				el('div', { class: 'loading-spinner' }),
				el('div', { class: 'loading-message' }, [message])
			])
		]);
		document.body.appendChild(indicator);
	} else {
		indicator.querySelector('.loading-message').textContent = message;
	}

	// Show the indicator using CSS class
	indicator.classList.add('show');
	indicator.style.display = 'flex';
	indicator.hidden = false;

	console.log('🔄 Loading indicator shown:', message);
}

/**
 * Hide loading indicator
 */
function hideLoadingIndicator() {
	const indicator = $('#loading-indicator');
	if (indicator) {
		indicator.classList.remove('show');
		indicator.style.display = 'none';
		indicator.hidden = true;
		console.log('✅ Loading indicator hidden');
	}
}

/**
 * Show user-friendly error message
 * @param {string} title - Error title
 * @param {Error|string} error - Error object or message
 */
function showErrorMessage(title, error) {
	const errorDetails = getSafeErrorMessage(error);
	const errorContainer = el('div', {
		class: 'error-overlay',
		role: 'alert'
	}, [
		el('div', { class: 'error-content' }, [
			el('h3', { class: 'error-title' }, [title]),
			el('p', { class: 'error-message' }, [errorDetails]),
			el('button', {
				class: 'error-dismiss',
				onclick: () => document.querySelector('.error-overlay')?.remove()
			}, ['閉じる'])
		])
	]);

	document.body.appendChild(errorContainer);

	// Auto-dismiss after 10 seconds
	setTimeout(() => {
		if (errorContainer.parentNode) {
			errorContainer.remove();
		}
	}, 10000);
}

/**
 * Normalize any error-like value to a safe text message.
 * Ensures we only ever render plain text into the DOM.
 * @param {unknown} error
 * @returns {string}
 */
function getSafeErrorMessage(error) {
	if (error instanceof Error) {
		return String(error.message || '');
	}
	try {
		return String(error ?? '');
	} catch {
		return '';
	}
}

/**
 * Enhanced reload function with better error handling
 * @param {boolean} showLoading - Whether to show/hide loading indicator (default: true)
 */
async function reload(showLoading = true) {
	return reloadInternal(showLoading);
}

/**
 * Enhanced internal reload implementation with dynamic image field support
 * @param {boolean} showLoading - Whether to manage loading indicator
 */
async function reloadInternal(showLoading = true) {
	try {
		if (showLoading) {
			showLoadingIndicator('キャラクターデータを読み込んでいます...');
		}

		const qs = getQS();
		const workId = $('#select-work').value;
		const db = $('#select-db').value || 'Primary';
		const resolve = $('#chk-resolve').checked;
		const debug = $('#chk-debug').checked;

		if (!workId) {
			throw new Error('作品が選択されていません');
		}

		console.log('📊 Enhanced reload with dynamic image support:', { workId, db, resolve, debug });

		// Enhanced data loading with timeout and step tracking
		const startTime = performance.now();
		let currentStep = 'データベース・メタデータ読み込み';

		if (showLoading) {
			showLoadingIndicator(`${currentStep}中...`);
		}

		// Fetch all required data with timeout protection
		const fetchTimeout = 15000; // 15 second timeout
		const fetchPromises = [
			Promise.race([
				fetchDB(workId, db, { resolve, debug }),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error('Database fetch timeout')), fetchTimeout)
				)
			]),
			Promise.race([
				fetchWorkMeta(workId),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error('Metadata fetch timeout')), fetchTimeout)
				)
			]),
			Promise.race([
				fetchWorkTypeDef(workId),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error('Work typedef fetch timeout')), fetchTimeout)
				)
			]),
			Promise.race([
				fetchGlobalTypeDef(),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error('Global typedef fetch timeout')), fetchTimeout)
				)
			])
		];

		const stepStart = performance.now();
		const [res, workMeta, workTypeDef, globalTypeDef] = await Promise.all(fetchPromises);
		console.log(`⏱️ ${currentStep} completed in ${(performance.now() - stepStart).toFixed(2)}ms`);

		// Image field extraction step
		currentStep = '画像フィールド解析';
		if (showLoading) {
			showLoadingIndicator(`${currentStep}中...`);
		}

		const dbCatalogEntry = findDbCatalogEntry(workMeta, db);
		const currentLayerName = String(dbCatalogEntry?.DB_Layer || '').trim();
		const [sharedLayerTypeDef, workLayerTypeDef] = currentLayerName
			? await Promise.all([
				fetchSharedLayerTypeDef(currentLayerName),
				fetchWorkLayerTypeDef(workId, currentLayerName)
			])
			: [{}, {}];
		const layeredTypeDef = mergeTypeDefSources(workLayerTypeDef, sharedLayerTypeDef);
		const effectiveWorkTypeDef = mergeTypeDefSources(workTypeDef, layeredTypeDef);

		const imageExtractStart = performance.now();
		const imageFields = extractImageFields(effectiveWorkTypeDef, globalTypeDef);
		console.log(`⏱️ ${currentStep} completed in ${(performance.now() - imageExtractStart).toFixed(2)}ms`);
		console.log(`🖼️ Extracted ${imageFields.length} image fields for ${workId}`);

		// Data processing step
		currentStep = 'データ処理';
		if (showLoading) {
			showLoadingIndicator(`${currentStep}中...`);
		}

		const processStart = performance.now();
		let recs = filterPublicCharacterRecords(res.records || []);
		if (recs.length === 0) {
			console.warn('⚠️ No records found for:', { workId, db });
		} else {
			console.log(`📋 Processing ${recs.length} records with enhanced image support`);
		}

		// Apply Commons data for missing fields
		recs = applyCommonsData(recs, workMeta, db);
		console.log(`⏱️ ${currentStep} completed in ${(performance.now() - processStart).toFixed(2)}ms`);

		// UI update step with enhanced image resolution
		currentStep = 'UI更新・画像解決';
		if (showLoading) {
			showLoadingIndicator(`${currentStep}中...`);
		}

		const uiStart = performance.now();

		// Store enhanced state with image fields
		window.__CHAR_STATE__ = {
			workId,
			db,
			pageLang: getCurrentPageLanguage(),
			resolve,
			debug,
			records: recs,
			imageFields, // Add image fields to global state
			workTypeDef: effectiveWorkTypeDef,
			globalTypeDef,
			workMeta
		};

		$('#list-view').hidden = false;
		$('#detail-view').hidden = true;
		$('#search-input').value = qs.q || '';

		// Use enhanced rendering with image fields
		await renderList(recs, workId, openDetail, imageFields);
		console.log(`⏱️ ${currentStep} completed in ${(performance.now() - uiStart).toFixed(2)}ms`);

		// 直リンク: idx/idxKey（汎用） または num（旧互換）
		const globalMeta = await fetchGlobalMeta();
		const indexDef = getWorkIndexField(workId, globalMeta);
		const idxValue = qs.idx || qs.num;
		const idxKeyPath = qs.idxKey || (qs.num ? 'Num' : '');
		if (idxValue) {
			const target = recs.find(r => recordMatchesIndexQuery(r, indexDef, idxValue, idxKeyPath, qs.num));
			if (target) {
				openDetail(target);
			} else {
				console.warn('⚠️ Character not found for index:', { idxValue, idxKeyPath, legacyNum: qs.num });
			}
		}

		if (showLoading) {
			hideLoadingIndicator();
		}

		const totalTime = performance.now() - startTime;
		console.log(`🎉 Data reload complete: ${recs.length} records in ${totalTime.toFixed(2)}ms`);

	} catch (error) {
		const currentStep = error.message.includes('timeout') ? 'タイムアウト' : 'データ読み込み';
		console.error(`❌ Reload failed at step "${currentStep}":`, error);
		if (showLoading) {
			hideLoadingIndicator();
		}

		// Enhanced error message with specific guidance
		let errorMessage = error.message;
		if (error.message.includes('timeout')) {
			errorMessage = 'データの読み込みがタイムアウトしました。ネットワーク接続を確認するか、しばらく時間をおいて再試行してください。';
		}
		showErrorMessage('データの読み込みに失敗しました', errorMessage);
	}
}

/**
 * Debug helper: Add performance monitoring overlay (only in development)
 */
function addPerformanceMonitor() {
	if (location.hostname !== '127.0.0.1' && location.hostname !== 'localhost') {
		return; // Only show in local development
	}

	const overlay = el('div', {
		id: 'perf-monitor',
		style: `
      position: fixed; top: 10px; right: 10px;
      background: rgba(0,0,0,0.8); color: white;
      padding: 10px; border-radius: 5px;
      font-family: monospace; font-size: 12px;
      z-index: 10000; max-width: 300px;
      display: none;
    `
	}, [
		el('div', {}, ['Performance Monitor']),
		el('div', { id: 'perf-content' }, ['Initializing...'])
	]);

	document.body.appendChild(overlay);

	// Toggle with Ctrl+Shift+P
	document.addEventListener('keydown', (e) => {
		if (e.ctrlKey && e.shiftKey && e.key === 'P') {
			overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
		}
	});

	// Update performance info
	setInterval(() => {
		if (overlay.style.display !== 'none') {
			const content = document.getElementById('perf-content');
			if (content) {
				const memory = performance.memory || {};
				content.textContent = '';
				content.appendChild(el('div', {}, [`Used: ${((memory.usedJSHeapSize || 0) / 1024 / 1024).toFixed(1)}MB`]));
				content.appendChild(el('div', {}, [`Total: ${((memory.totalJSHeapSize || 0) / 1024 / 1024).toFixed(1)}MB`]));
				content.appendChild(el('div', {}, [`Time: ${performance.now().toFixed(0)}ms`]));
				content.appendChild(el('div', {}, [`Records: ${window.__CHAR_STATE__?.records?.length || 0}`]));
			}
		}
	}, 1000);
}

/**
 * Main entry point - initialize application when DOM is loaded
 */
if (!isCharactersTestMode()) {
	if (document.readyState === 'loading') {
		// DOM is still loading, wait for DOMContentLoaded
		document.addEventListener('DOMContentLoaded', main);
	} else {
		// DOM is already loaded, run immediately
		main().catch(err => {
			console.error('Initialization error:', err);
			const fallbackError = el('div', {
				style: 'padding: 20px; color: red;'
			}, ['初期化エラー: ', getSafeErrorMessage(err)]);
			document.body.textContent = '';
			document.body.appendChild(fallbackError);
		});
	}

	// Add performance monitor in development
	addPerformanceMonitor();
}
