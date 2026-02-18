/**
 * Service Worker: Pages スコープのAPIルーター（キャラクターページ制御用）
 *
 * 広告ブロッカーとスコープの落とし穴を避けるため複数のプレフィックスをインターセプト:
 * /pages/v1/* (プライマリ)、および /svc/v1/*、/api/v1/* のエイリアス
 *
 * @fileoverview Pages Service Worker 実装
 * @author 100BeautiesLab Creations Database Team
 * @version 1.0.0
 */

// 共通ライブラリを読み込み
importScripts('../lib/sw-common.js', '../lib/data-common.js');

// Service Worker 設定を初期化
const SCOPE_PATH = new URL('./', self.registration?.scope || self.location.href).pathname.replace(/\/$/, '');
const swConfig = new SWConfig(SCOPE_PATH);

// Pages 専用の複数プレフィックス設定
const PAGES_PREFIXES = [
  `${SCOPE_PATH}/v1`,           // '/pages/v1'
  `${swConfig.REPO_BASE}svc/v1`, // '/svc/v1' エイリアス
  `${swConfig.REPO_BASE}api/v1`  // '/api/v1' エイリアス
];

const dataFetcher = new DataFetcher(swConfig);
const enrichmentProcessor = new EnrichmentProcessor(dataFetcher, swConfig);
const referenceResolver = new ReferenceResolver(dataFetcher, swConfig);
const apiHandlers = new ApiEndpointHandlers(dataFetcher);
const standardHandlers = new StandardEndpointHandlers(dataFetcher, enrichmentProcessor, referenceResolver, 'Pages');

/**
 * Pages Service Worker クラス
 * 複数プレフィックス対応とキャラクターページ特化機能
 */
class PagesServiceWorker extends ServiceWorkerBase {
  constructor() {
    super(PAGES_PREFIXES);
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
      console.log('✅ Pages SW 事前キャッシュ完了: db_meta.json');
    } catch (error) {
      console.warn('⚠️ Pages SW 事前キャッシュ失敗:', error);
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

    return this.routeApiRequest(seg, url, resolve, debug);
  }

  /**
   * APIエンドポイントのルーティング処理
   * @param {Array<string>} seg - パスセグメント配列
   * @param {URL} url - リクエストURL
   * @param {boolean} resolve - 参照解決フラグ
   * @param {boolean} debug - デバッグフラグ
   * @returns {Promise<Response>} APIレスポンス
   */
  async routeApiRequest(seg, url, resolve, debug) {
    // 共通エンドポイントを先にチェック
    const commonResponse = await this.apiHandlers.routeCommonEndpoints(seg, url);
    if (commonResponse) {
      return commonResponse;
    }

    // 標準エンドポイントをエンリッチメント付きで処理
    // /pages/v1/index - API インデックス情報
    if (seg.length === 1 && seg[0] === 'index') {
      return this.standardHandlers.handleIndexEndpoint();
    }

    // /pages/v1/works - 作品一覧
    if (seg.length === 1 && seg[0] === 'works') {
      return this.standardHandlers.handleWorksListEndpoint();
    }

    // /pages/v1/bootstrap - ブートストラップ情報（キャラクターページ用）
    if (seg.length === 1 && seg[0] === 'bootstrap') {
      return this.standardHandlers.handleBootstrapEndpoint(url, true, true);
    }

    // /pages/v1/works/{work} - 作品情報
    if (seg.length === 2 && seg[0] === 'works') {
      return this.standardHandlers.handleWorkEndpoint(seg[1]);
    }

    // /pages/v1/works/{work}/db - 作品のデータベース一覧
    if (seg.length === 3 && seg[0] === 'works' && seg[2] === 'db') {
      return this.standardHandlers.handleWorkDbListEndpoint(seg[1]);
    }

    // /pages/v1/works/{work}/db/{dbName} - データベース取得（充実化機能付き）
    if (seg.length === 4 && seg[0] === 'works' && seg[2] === 'db') {
      return this.standardHandlers.handleDbEndpoint(seg[1], seg[3], resolve, debug, true);
    }

    // /pages/v1/works/{work}/varsdef - 作品変数定義取得
    if (seg.length === 3 && seg[0] === 'works' && seg[2] === 'varsdef') {
      return this.standardHandlers.handleWorkVarsdefEndpoint(seg[1]);
    }

    // /pages/v1/search - 検索エンドポイント
    if (seg.length === 1 && seg[0] === 'search') {
      return this.standardHandlers.handleSearchEndpoint(url, resolve, debug, true);
    }

    // /pages/v1/enrich - 充実化エンドポイント（キャラクターページ特化）
    if (seg.length === 1 && seg[0] === 'enrich') {
      return this.handleEnrichEndpoint(url, resolve, debug);
    }

    // その他のエンドポイント
    return this.standardHandlers.handleAdvancedEndpoints(seg, url);
  }







  /**
   * /pages/v1/enrich エンドポイント（キャラクターページ特化）
   */
  async handleEnrichEndpoint(url, resolve, debug) {
    const params = url.searchParams;
    const workId = DataUtils.toWorkKey(params.get('works'));
    const dbName = params.get('db');

    if (!workId || !dbName) {
      return ResponseUtils.badRequest('Query must include works and db parameters');
    }

    let records = await this.dataFetcher.readDB(workId, dbName);
    const workMeta = await this.dataFetcher.readWorkMeta(workId);
    records = CommonsProcessor.applyCommonsToRecords(records, workMeta, dbName);

    const resolveCache = new Map();
    if (resolve) {
      records = await this.referenceResolver.resolveAllInAny(records, resolveCache);
    }

    // 充実化処理
    records = await this.enrichmentProcessor.enrichRecords(records, workId, dbName);

    const response = {
      work: workId,
      db: dbName,
      records: records,
      resolved: resolve,
      enriched: true
    };

    if (debug) {
      response.debug = {
        recordCount: records.length,
        enrichmentApplied: true
      };
    }

    return ResponseUtils.jsonResponse(response);
  }

  /**
   * /pages/v1/works/{work}/varsdef エンドポイント
   */
  async handleWorkVarsdefEndpoint(workIdParam) {
    const workId = DataUtils.toWorkKey(workIdParam);
    const workVars = await this.dataFetcher.readGeneralVarsDefWork(workId);
    const globalVars = await this.dataFetcher.readGeneralVarsDefGlobal();

    return ResponseUtils.jsonResponse({
      work: workId,
      varsdef: {
        global: globalVars,
        work: workVars
      },
      scope: 'pages',
      time: new Date().toISOString()
    });
  }

  /**
   * 高度なエンドポイント（varsdef, typedef など）のハンドリング
   */
  async handleAdvancedEndpoints(seg, url) {
    if (seg.length === 1 && seg[0] === 'varsdef') {
      const globalVars = await this.dataFetcher.readGeneralVarsDefGlobal();
      return ResponseUtils.jsonResponse({
        name: 'varsdef-overview',
        time: new Date().toISOString(),
        scope: 'pages',
        global: globalVars
      });
    }

    return ResponseUtils.notFound('Unknown API path');
  }
}

// Service Worker インスタンスを作成
new PagesServiceWorker();

console.log('🚀 Pages Service Worker が初期化されました:', PAGES_PREFIXES);
