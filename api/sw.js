/**
 * Service Worker: GitHub Pages 用の静的 API ルーター
 *
 * /api/v1/* リクエストをインターセプトし、/data/** から JSON を読み取って
 * 疑似 API レスポンスを返します。参照解決と検索機能を提供します。
 *
 * @fileoverview API Service Worker 実装
 * @author 100BeautiesLab Creations Database Team
 * @version 1.0.0
 */

// 共通ライブラリを読み込み
importScripts('../lib/sw-common.js', '../lib/data-common.js');

// Service Worker 設定を初期化
const SCOPE_PATH = new URL('./', self.registration?.scope || self.location.href).pathname.replace(/\/$/, '');
const swConfig = new SWConfig(SCOPE_PATH);
const dataFetcher = new DataFetcher(swConfig);
const enrichmentProcessor = new EnrichmentProcessor(dataFetcher, swConfig);
const referenceResolver = new ReferenceResolver(dataFetcher, swConfig);
const apiHandlers = new ApiEndpointHandlers(dataFetcher);
const standardHandlers = new StandardEndpointHandlers(dataFetcher, enrichmentProcessor, referenceResolver, 'API');

/**
 * API Service Worker クラス
 * 共通ライブラリを使用した API エンドポイント実装
 */
class ApiServiceWorker extends ServiceWorkerBase {
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
      console.log('✅ 事前キャッシュ完了: db_meta.json');
    } catch (error) {
      console.warn('⚠️ 事前キャッシュ失敗:', error);
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
    // - /pages は常時 enrich だが、/api は互換維持のため opt-in とする
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

    // 標準エンドポイントを先にチェック
    // /api/v1/index - API インデックス情報
    if (seg.length === 1 && seg[0] === 'index') {
      return this.standardHandlers.handleIndexEndpoint();
    }

    // /api/v1/works - 作品一覧
    if (seg.length === 1 && seg[0] === 'works') {
      return this.standardHandlers.handleWorksListEndpoint();
    }

    // /api/v1/bootstrap - ブートストラップ情報
    if (seg.length === 1 && seg[0] === 'bootstrap') {
      return this.standardHandlers.handleBootstrapEndpoint(url, false, false);
    }

    // /api/v1/works/{work} - 作品情報
    if (seg.length === 2 && seg[0] === 'works') {
      return this.standardHandlers.handleWorkEndpoint(seg[1]);
    }

    // /api/v1/works/{work}/db - 作品のデータベース一覧
    if (seg.length === 3 && seg[0] === 'works' && seg[2] === 'db') {
      return this.standardHandlers.handleWorkDbListEndpoint(seg[1]);
    }

    // /api/v1/works/{work}/db/{dbName} - データベース取得
    if (seg.length === 4 && seg[0] === 'works' && seg[2] === 'db') {
      return this.standardHandlers.handleDbEndpoint(seg[1], seg[3], resolve, debug, enrich);
    }

    // /api/v1/works/{work}/varsdef - 作品変数定義取得
    if (seg.length === 3 && seg[0] === 'works' && seg[2] === 'varsdef') {
      return this.standardHandlers.handleWorkVarsdefEndpoint(seg[1]);
    }

    // /api/v1/search - 検索エンドポイント
    if (seg.length === 1 && seg[0] === 'search') {
      return this.standardHandlers.handleSearchEndpoint(url, resolve, debug, enrich);
    }

    // その他のエンドポイント（varsdef, typedef など）
    return this.standardHandlers.handleAdvancedEndpoints(seg, url);
  }


}

// Service Worker インスタンスを作成
new ApiServiceWorker();

console.log('🚀 API Service Worker が初期化されました:', swConfig.API_PREFIX);
