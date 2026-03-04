/**
 * フロントエンド共通ライブラリ
 *
 * ブラウザ側のJavaScript機能の共通実装を提供します。
 * Service Worker登録、DOM操作、HTTP通信、URL管理など
 * 複数のフロントエンドファイル間で重複していた機能を統合しています。
 *
 * @fileoverview フロントエンド共通機能ライブラリ
 * @author 100BeautiesLab Creations Database Team
 * @version 1.0.0
 */

/**
 * Service Worker 管理クラス
 * Service Workerの登録、状態確認、更新処理を担当
 */
class ServiceWorkerManager {
  /**
   * @param {string} swPath - Service Workerファイルのパス
   * @param {string} scope - Service Workerのスコープ
   */
  constructor(swPath, scope) {
    this.swPath = swPath;
    this.scope = scope;
    this.registration = null;
    this.isReady = false;
  }

  /**
   * Service Workerを登録し、準備完了まで待機
   * @returns {Promise<ServiceWorkerRegistration>} 登録されたService Worker
   */
  async register() {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker is not supported');
    }

    try {
      console.log('🔄 Service Worker を登録中...', this.swPath);
      this.registration = await navigator.serviceWorker.register(this.swPath, { scope: this.scope });
      console.log('✅ Service Worker 登録完了:', this.registration.scope);

      // アクティブ化を待機
      await this.waitForActivation();
      this.isReady = true;
      console.log('🚀 Service Worker が利用可能になりました');

      return this.registration;
    } catch (error) {
      console.error('❌ Service Worker 登録失敗:', error);
      throw error;
    }
  }

  /**
   * Service Workerのアクティブ化を待機
   * @returns {Promise<void>}
   */
  async waitForActivation() {
    if (!this.registration) return;

    // 既にアクティブな場合はすぐに返す
    if (this.registration.active) return;

    // インストール中またはアクティベート待ちの場合は待機
    const sw = this.registration.installing || this.registration.waiting;
    if (sw) {
      await new Promise((resolve) => {
        sw.addEventListener('statechange', function listener() {
          if (sw.state === 'activated') {
            sw.removeEventListener('statechange', listener);
            resolve();
          }
        });
      });
    }
  }

  /**
   * Service Workerの準備完了を確認
   * 未登録の場合は自動的に登録を実行
   * @returns {Promise<boolean>} 準備完了の場合はtrue
   */
  async ensureReady() {
    if (this.isReady) return true;

    try {
      await this.register();
      return true;
    } catch (error) {
      console.warn('⚠️ Service Worker の準備に失敗しました:', error);
      return false;
    }
  }

  /**
   * Service Workerの状態を取得
   * @returns {string} Service Workerの状態
   */
  getState() {
    if (!this.registration) return 'not-registered';
    if (this.registration.active) return 'active';
    if (this.registration.installing) return 'installing';
    if (this.registration.waiting) return 'waiting';
    return 'unknown';
  }

  /**
   * Service Workerを更新
   * @returns {Promise<void>}
   */
  async update() {
    if (this.registration) {
      await this.registration.update();
      console.log('🔄 Service Worker 更新チェック完了');
    }
  }
}

/**
 * HTTP通信ユーティリティクラス
 * APIエンドポイントとの通信とエラーハンドリングを担当
 */
class ApiClient {
  /**
   * @param {string} baseUrl - APIのベースURL
   * @param {ServiceWorkerManager} swManager - Service Worker管理インスタンス
   */
  constructor(baseUrl = '', swManager = null) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // 末尾のスラッシュを削除
    this.swManager = swManager;
  }

  /**
   * JSONデータをフェッチ
   * @param {string} path - リクエストパス
   * @param {Object} options - fetchオプション
   * @returns {Promise<Object>} JSONレスポンス
   */
  async fetchJSON(path, options = {}) {
    // Service Workerの準備を確認
    if (this.swManager && !this.swManager.isReady) {
      const ready = await this.swManager.ensureReady();
      if (!ready) {
        throw new Error('Service Worker is not available');
      }
    }

    const url = this.buildUrl(path);
    console.log('📡 API Request:', url);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          ...options.headers
        },
        ...options
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        throw new ApiError(`HTTP ${response.status}: ${response.statusText}`, response.status, errorData);
      }

      const data = await response.json();
      console.log('✅ API Response:', path, '(データ件数:', Array.isArray(data) ? data.length : Object.keys(data || {}).length, ')');
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      console.error('❌ API Request Failed:', path, error);
      throw new ApiError(`Network error: ${error.message}`, 0, { originalError: error.message });
    }
  }

  /**
   * URLを構築
   * @param {string} path - リクエストパス
   * @returns {string} 完全なURL
   */
  buildUrl(path) {
    const cleanPath = path.replace(/^\/+/, '');
    return this.baseUrl ? `${this.baseUrl}/${cleanPath}` : cleanPath;
  }

  /**
   * 複数のAPIエンドポイントを並列実行
   * @param {Array<string>} paths - リクエストパスの配列
   * @param {Object} options - 共通のfetchオプション
   * @returns {Promise<Array>} レスポンス配列（エラーも含む）
   */
  async fetchMultiple(paths, options = {}) {
    const promises = paths.map(async (path) => {
      try {
        return await this.fetchJSON(path, options);
      } catch (error) {
        return { _error: error, _path: path };
      }
    });
    return Promise.all(promises);
  }
}

/**
 * API通信エラークラス
 */
class ApiError extends Error {
  /**
   * @param {string} message - エラーメッセージ
   * @param {number} status - HTTPステータスコード
   * @param {Object} data - 追加のエラーデータ
   */
  constructor(message, status = 0, data = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }

  /**
   * ユーザー向けエラーメッセージを生成
   * @returns {string} ユーザー向けメッセージ
   */
  getUserMessage() {
    if (this.status === 404) {
      return 'リクエストされたデータが見つかりませんでした。';
    }
    if (this.status === 400) {
      return 'リクエストの形式が正しくありません。';
    }
    if (this.status === 0) {
      return 'ネットワークエラーが発生しました。接続を確認してください。';
    }
    return `エラーが発生しました: ${this.message}`;
  }
}

/**
 * DOM操作ユーティリティクラス
 * 要素作成、イベント管理、動的コンテンツ生成を担当
 */
class DOMUtils {
  /**
   * 要素を作成（属性とイベントリスナーを同時設定）
   * @param {string} tagName - タグ名
   * @param {Object} attributes - 属性のオブジェクト
   * @param {Object} events - イベントリスナーのオブジェクト
   * @param {Array|string} children - 子要素または文字列
   * @returns {Element} 作成された要素
   */
  static createElement(tagName, attributes = {}, events = {}, children = []) {
    const element = document.createElement(tagName);

    // 属性を設定
    Object.entries(attributes).forEach(([key, value]) => {
      if (key === 'textContent') {
        element.textContent = value;
      } else if (key === 'innerHTML') {
        element.innerHTML = value;
      } else if (key === 'className') {
        element.className = value;
      } else {
        element.setAttribute(key, value);
      }
    });

    // イベントリスナーを設定
    Object.entries(events).forEach(([event, handler]) => {
      element.addEventListener(event, handler);
    });

    // 子要素を追加
    const childArray = Array.isArray(children) ? children : [children];
    childArray.forEach(child => {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else if (child instanceof Element) {
        element.appendChild(child);
      }
    });

    return element;
  }

  /**
   * 要素の表示状態を切り替え
   * @param {Element} element - 対象要素
   * @param {boolean|null} show - 表示フラグ（nullの場合はトグル）
   */
  static toggleDisplay(element, show = null) {
    if (!element) return;

    if (show === null) {
      // トグル
      element.style.display = element.style.display === 'none' ? '' : 'none';
    } else {
      element.style.display = show ? '' : 'none';
    }
  }

  /**
   * 要素のクラスを条件付きで切り替え
   * @param {Element} element - 対象要素
   * @param {string} className - クラス名
   * @param {boolean} condition - 条件
   */
  static toggleClass(element, className, condition) {
    if (!element) return;

    if (condition) {
      element.classList.add(className);
    } else {
      element.classList.remove(className);
    }
  }

  /**
   * 要素内のテキストをハイライト
   * @param {Element} element - 対象要素
   * @param {string} searchTerm - ハイライトするテキスト
   * @param {string} className - ハイライト用のクラス名
   */
  static highlightText(element, searchTerm, className = 'highlight') {
    if (!element || !searchTerm) return;

    const text = element.textContent;
    if (!text) return;

    const regex = new RegExp(this.escapeRegExp(searchTerm), 'gi');
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;

    // 既存の子ノードをクリア
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }

    while ((match = regex.exec(text)) !== null) {
      const matchStart = match.index;
      const matchEnd = match.index + match[0].length;

      // マッチ前のテキストを追加
      if (matchStart > lastIndex) {
        fragment.appendChild(
          document.createTextNode(text.slice(lastIndex, matchStart))
        );
      }

      // ハイライト用のspanを追加（テキストとして設定するためHTMLは解釈されない）
      const span = document.createElement('span');
      span.className = className;
      span.textContent = text.slice(matchStart, matchEnd);
      fragment.appendChild(span);

      lastIndex = matchEnd;
    }

    // 残りのテキストを追加
    if (lastIndex < text.length) {
      fragment.appendChild(
        document.createTextNode(text.slice(lastIndex))
      );
    }

    element.appendChild(fragment);
  }

  /**
   * 正規表現用の特殊文字をエスケープ
   * @param {string} string - エスケープする文字列
   * @returns {string} エスケープされた文字列
   */
  static escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * スムーススクロール
   * @param {Element} element - スクロール先の要素
   * @param {Object} options - スクロールオプション
   */
  static scrollToElement(element, options = {}) {
    if (!element) return;

    element.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest',
      ...options
    });
  }

  /**
   * 要素がビューポート内にあるかチェック
   * @param {Element} element - チェック対象の要素
   * @returns {boolean} ビューポート内にある場合はtrue
   */
  static isElementInViewport(element) {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }
}

/**
 * URL操作ユーティリティクラス
 * クエリパラメータ、ハッシュ、パス操作を担当
 */
class URLUtils {
  /**
   * クエリパラメータをオブジェクトとして取得
   * @param {string|URL} url - パースするURL（省略時は現在のページ）
   * @returns {Object} クエリパラメータのオブジェクト
   */
  static getQueryParams(url = window.location.href) {
    const urlObj = new URL(url);
    const params = {};
    urlObj.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  }

  /**
   * クエリパラメータを設定
   * @param {Object} params - 設定するパラメータ
   * @param {boolean} replaceHistory - 履歴を置き換えるか
   */
  static setQueryParams(params, replaceHistory = false) {
    const url = new URL(window.location.href);

    Object.entries(params).forEach(([key, value]) => {
      if (value == null || value === '') {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, value);
      }
    });

    const method = replaceHistory ? 'replaceState' : 'pushState';
    window.history[method]({}, '', url.toString());
  }

  /**
   * ハッシュフラグメントを取得
   * @returns {string} ハッシュフラグメント（#を除く）
   */
  static getHashFragment() {
    return window.location.hash.slice(1);
  }

  /**
   * ハッシュフラグメントを設定
   * @param {string} fragment - 設定するフラグメント
   * @param {boolean} replaceHistory - 履歴を置き換えるか
   */
  static setHashFragment(fragment, replaceHistory = false) {
    const url = new URL(window.location.href);
    url.hash = fragment;

    const method = replaceHistory ? 'replaceState' : 'pushState';
    window.history[method]({}, '', url.toString());
  }

  /**
   * 相対パスを絶対URLに変換
   * @param {string} relativePath - 相対パス
   * @param {string} baseUrl - ベースURL（省略時は現在のページ）
   * @returns {string} 絶対URL
   */
  static resolveUrl(relativePath, baseUrl = window.location.href) {
    return new URL(relativePath, baseUrl).toString();
  }
}

/**
 * デバウンス処理ユーティリティクラス
 * 関数の実行頻度を制限する機能を提供
 */
class DebounceManager {
  constructor() {
    this.timers = new Map();
  }

  /**
   * デバウンス処理
   * @param {string} key - デバウンス識別キー
   * @param {Function} func - 実行する関数
   * @param {number} delay - 遅延時間（ミリ秒）
   */
  debounce(key, func, delay = 300) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    const timer = setTimeout(() => {
      this.timers.delete(key);
      func();
    }, delay);

    this.timers.set(key, timer);
  }

  /**
   * 特定のデバウンス処理をキャンセル
   * @param {string} key - デバウンス識別キー
   */
  cancel(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
  }

  /**
   * 全てのデバウンス処理をキャンセル
   */
  cancelAll() {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }
}

/**
 * ローカルストレージ管理クラス
 * データの永続化と型安全なアクセスを提供
 */
class StorageManager {
  /**
   * @param {string} prefix - キーのプレフィックス
   */
  constructor(prefix = 'app_') {
    this.prefix = prefix;
  }

  /**
   * データを保存
   * @param {string} key - キー
   * @param {any} data - 保存するデータ
   */
  set(key, data) {
    try {
      const serialized = JSON.stringify(data);
      localStorage.setItem(this.prefix + key, serialized);
    } catch (error) {
      console.warn('Failed to save to localStorage:', key, error);
    }
  }

  /**
   * データを取得
   * @param {string} key - キー
   * @param {any} defaultValue - デフォルト値
   * @returns {any} 取得されたデータ
   */
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(this.prefix + key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.warn('Failed to load from localStorage:', key, error);
      return defaultValue;
    }
  }

  /**
   * データを削除
   * @param {string} key - キー
   */
  remove(key) {
    localStorage.removeItem(this.prefix + key);
  }

  /**
   * プレフィックスが一致するすべてのキーを削除
   */
  clear() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix));
    keys.forEach(k => localStorage.removeItem(k));
  }

  /**
   * キーが存在するかチェック
   * @param {string} key - キー
   * @returns {boolean} 存在する場合はtrue
   */
  has(key) {
    return localStorage.getItem(this.prefix + key) !== null;
  }
}

// グローバル共有インスタンス
const globalDebounceManager = new DebounceManager();

// エクスポート（ブラウザ環境では window オブジェクトに追加）
if (typeof window !== 'undefined') {
  window.ServiceWorkerManager = ServiceWorkerManager;
  window.ApiClient = ApiClient;
  window.ApiError = ApiError;
  window.DOMUtils = DOMUtils;
  window.URLUtils = URLUtils;
  window.DebounceManager = DebounceManager;
  window.StorageManager = StorageManager;
  window.globalDebounceManager = globalDebounceManager;
}

console.log('🌐 フロントエンド共通ライブラリがロードされました');