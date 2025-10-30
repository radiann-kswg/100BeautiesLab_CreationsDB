// API プロトタイプブートストラップとデモ UI
// - Service Worker (sw.js) を登録
// - エンドポイントをテストするための小さな UI を提供

(function () {
  const swUrl = new URL('sw.js', location.href).toString();

  /**
   * Service Worker を登録
   */
  async function registerSW() {
    if (!('serviceWorker' in navigator)) {
      log({ error: 'このブラウザでは Service Worker がサポートされていません。' });
      return;
    }
    try {
      const reg = await navigator.serviceWorker.register(swUrl, { scope: './' });
      await navigator.serviceWorker.ready;
      log({ info: 'Service Worker が登録されました。', scope: reg.scope });
    } catch (e) {
      log({ error: 'Service Worker の登録に失敗しました', details: String(e) });
    }
  }

  /**
   * 出力エリアにログを表示
   * @param {Object} obj - ログ出力するオブジェクト
   */
  function log(obj) {
    const el = document.getElementById('output');
    if (!el) return;
    el.textContent = JSON.stringify(obj, null, 2);
  }

  /**
   * 指定されたエンドポイントをフェッチしてレスポンスを表示
   * @param {string} path - フェッチするエンドポイントパス
   */
  async function fetchEndpoint(path) {
    try {
      const res = await fetch(path, { headers: { 'Accept': 'application/json' } });
      const ct = res.headers.get('content-type') || '';
      let body;
      if (ct.includes('application/json')) {
        body = await res.json();
      } else {
        body = await res.text();
      }
      log({ status: res.status, ok: res.ok, url: res.url, body });
    } catch (e) {
      log({ error: 'フェッチに失敗しました', details: String(e), endpoint: path });
    }
  }

  /**
   * 自動ブートストラップ処理
   */
  async function autoBootstrap() {
    // 最初に軽量ブートストラップを試行、その後オプションでレコード付きの重い処理
    await fetchEndpoint('/api/v1/bootstrap');
  }

  /**
   * UI コントロールを設定
   */
  function setupUI() {
    const btnInstallSW = document.getElementById('btnInstallSW');
    if (btnInstallSW) btnInstallSW.addEventListener('click', registerSW);

    document.querySelectorAll('.btnFetch[data-endpoint]')
      .forEach(btn => btn.addEventListener('click', () => fetchEndpoint(btn.getAttribute('data-endpoint'))));

    const btnFetchCustom = document.getElementById('btnFetchCustom');
    const customEndpoint = document.getElementById('customEndpoint');
    if (btnFetchCustom && customEndpoint) {
      btnFetchCustom.addEventListener('click', () => {
        const p = customEndpoint.value.trim();
        if (p) fetchEndpoint(p);
      });
    }
  }

  // 初期化
  window.addEventListener('load', () => {
    registerSW();
    setupUI();
    // 自動実行
    setTimeout(autoBootstrap, 500);
  });
})();
