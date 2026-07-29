/**
 * Service Worker: SVC エイリアス（広告ブロッカー回避用）
 *
 * /api での広告ブロッカーを回避するため /svc 下に配置された
 * API Service Worker のエイリアス実装
 *
 * @fileoverview SVC Service Worker 実装
 * @author 100BeautiesLab Creations Database Team
 * @version 1.0.0
 */

// 共通ライブラリを読み込み
importScripts(
  '../lib/wrapper-common.js',
  '../lib/basic-renders/type-common.js',
  '../lib/basic-renders/def-object-common.js',
  '../lib/basic-renders/faction.js',
  '../lib/basic-renders/baseArea.js',
  '../lib/sw-common.js',
  '../lib/data-common.js'
);

// Service Worker 設定を初期化
const SCOPE_PATH = new URL('./', self.registration?.scope || self.location.href).pathname.replace(/\/$/, '');
const swConfig = new SWConfig(SCOPE_PATH);
const dataFetcher = new DataFetcher(swConfig);
const enrichmentProcessor = new EnrichmentProcessor(dataFetcher, swConfig);
const referenceResolver = new ReferenceResolver(dataFetcher, swConfig);
const apiHandlers = new ApiEndpointHandlers(dataFetcher);
const standardHandlers = new StandardEndpointHandlers(dataFetcher, enrichmentProcessor, referenceResolver, 'SVC');

/**
 * SVC Service Worker クラス
 * API Service Worker のエイリアス実装（広告ブロッカー回避用）
 */
class SvcServiceWorker extends ServiceWorkerBase {
  constructor() {
    super([swConfig.API_PREFIX]);
    this.dataFetcher = dataFetcher;
    this.enrichmentProcessor = enrichmentProcessor;
    this.referenceResolver = referenceResolver;
    this.apiHandlers = apiHandlers;
    this.standardHandlers = standardHandlers;
  }

  /**
   * 事前キャッシュ処理
   * @returns {Promise<void>}
   */
  async precache() {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll([swConfig.withRepoBase('data/db_meta.json')]);
      console.log('✅ SVC SW 事前キャッシュ完了: db_meta.json');
    } catch (error) {
      console.warn('⚠️ SVC SW 事前キャッシュ失敗:', error);
    }
  }

  /**
   * APIリクエスト処理のメインハンドラー
   * @param {URL} url - リクエストURL
   * @param {string} apiPrefix - マッチしたAPIプレフィックス
   * @returns {Promise<Response>} APIレスポンス
   */
  async handleApiRequest(url, apiPrefix) {
    const path = url.pathname.substring(apiPrefix.length);
    const seg = path.split('/').filter(Boolean);

    // 解決フラグ（デフォルトで有効、?resolve=0で無効化）
    const resolveParam = url.searchParams.get('resolve');
    const resolve = resolveParam == null ? true : DataUtils.truthy(resolveParam);

    // デバッグフラグ
    const debug = DataUtils.truthy(url.searchParams.get('debug'));

    // エンリッチフラグ（デフォルトは無効、?enrich=1で有効化）
    const enrich = DataUtils.truthy(url.searchParams.get('enrich'));

    return this.routeApiRequest(seg, url, resolve, debug, enrich);
  }

  /**
   * APIエンドポイントのルーティング処理
   * @param {Array<string>} seg - パスセグメント配列
   * @param {URL} url - リクエストURL
   * @param {boolean} resolve - 参照解決フラグ
   * @param {boolean} debug - デバッグフラグ
   * @returns {Promise<Response>} APIレスポンス
   */
  async routeApiRequest(seg, url, resolve, debug, enrich) {
    // 共通エンドポイントを先にチェック
    const commonResponse = await this.apiHandlers.routeCommonEndpoints(seg, url);
    if (commonResponse) {
      return commonResponse;
    }

    // 標準エンドポイントを使用（SVC：エンリッチメントなし）
    // /svc/v1/index - API インデックス情報
    if (seg.length === 1 && seg[0] === 'index') {
      return this.standardHandlers.handleIndexEndpoint();
    }

    // /svc/v1/works - 作品一覧
    if (seg.length === 1 && seg[0] === 'works') {
      return this.standardHandlers.handleWorksListEndpoint();
    }

    // /svc/v1/bootstrap - ブートストラップ情報
    if (seg.length === 1 && seg[0] === 'bootstrap') {
      return this.standardHandlers.handleBootstrapEndpoint(url, false, false);
    }

    // /svc/v1/works/{work} - 作品情報
    if (seg.length === 2 && seg[0] === 'works') {
      return this.standardHandlers.handleWorkEndpoint(seg[1]);
    }

    // /svc/v1/works/{work}/db - 作品のデータベース一覧
    if (seg.length === 3 && seg[0] === 'works' && seg[2] === 'db') {
      return this.standardHandlers.handleWorkDbListEndpoint(seg[1]);
    }

    // /svc/v1/works/{work}/db/{dbName} - データベース取得
    if (seg.length === 4 && seg[0] === 'works' && seg[2] === 'db') {
      return this.standardHandlers.handleDbEndpoint(seg[1], seg[3], resolve, debug, enrich);
    }

    // /svc/v1/works/{work}/varsdef - 作品変数定義取得
    if (seg.length === 3 && seg[0] === 'works' && seg[2] === 'varsdef') {
      return this.standardHandlers.handleWorkVarsdefEndpoint(seg[1]);
    }

    // /svc/v1/search - 検索エンドポイント
    if (seg.length === 1 && seg[0] === 'search') {
      return this.standardHandlers.handleSearchEndpoint(url, resolve, debug, enrich);
    }

    // その他のエンドポイント（varsdef, typedef など）
    return this.standardHandlers.handleAdvancedEndpoints(seg, url);
  }




}

// Service Worker インスタンスを作成
new SvcServiceWorker();

console.log('🚀 SVC Service Worker が初期化されました:', swConfig.API_PREFIX);
