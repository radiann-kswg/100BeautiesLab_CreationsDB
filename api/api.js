// API Prototype bootstrap and demo UI
// - Registers Service Worker (sw.js)
// - Provides small UI to test endpoints

(function () {
  const swUrl = new URL('sw.js', location.href).toString();

  async function registerSW() {
    if (!('serviceWorker' in navigator)) {
      log({ error: 'Service Worker not supported in this browser.' });
      return;
    }
    try {
      const reg = await navigator.serviceWorker.register(swUrl, { scope: './' });
      await navigator.serviceWorker.ready;
      log({ info: 'Service Worker registered.', scope: reg.scope });
    } catch (e) {
      log({ error: 'Service Worker register failed', details: String(e) });
    }
  }

  function log(obj) {
    const el = document.getElementById('output');
    if (!el) return;
    el.textContent = JSON.stringify(obj, null, 2);
  }

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
      log({ error: 'Fetch failed', details: String(e), endpoint: path });
    }
  }

  async function autoBootstrap() {
    // try light bootstrap first, then optionally heavy with records
    await fetchEndpoint('/api/v1/bootstrap');
  }

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

  // Kick
  window.addEventListener('load', () => {
    registerSW();
    setupUI();
    // auto run
    setTimeout(autoBootstrap, 500);
  });
})();
