(function () {
  var doc = document;
  var win = window;

  // ---- self-discovery: pull config off our own <script> tag
  var script = doc.currentScript || (function () {
    var s = doc.getElementsByTagName('script');
    return s[s.length - 1];
  })();
  if (!script) return;
  var siteId = script.getAttribute('data-site-id');
  if (!siteId) return;
  var endpoint = script.getAttribute('data-endpoint')
    || (script.src ? script.src.replace(/\/pub\/p\.js.*$/, '/pub/collect') : null);
  if (!endpoint) return;

  // ---- first-party cookies on the tracked site's domain
  var V_KEY = '_pgr_v';
  var S_KEY = '_pgr_s';

  function getCookie(name) {
    var m = doc.cookie.match('(?:^|; )' + name + '=([^;]*)');
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setCookie(name, value, maxAgeSeconds) {
    doc.cookie = name + '=' + encodeURIComponent(value)
      + '; Max-Age=' + maxAgeSeconds
      + '; Path=/; SameSite=Lax';
  }
  function randId() {
    var a = new Uint8Array(16);
    (win.crypto || win.msCrypto).getRandomValues(a);
    var out = '';
    for (var i = 0; i < a.length; i++) {
      out += ('0' + a[i].toString(16)).slice(-2);
    }
    return out;
  }
  function visitorId() {
    var v = getCookie(V_KEY);
    if (!v) { v = randId(); setCookie(V_KEY, v, 60 * 60 * 24 * 365 * 2); }
    return v;
  }
  function sessionId() {
    var s = getCookie(S_KEY);
    if (!s) s = randId();
    setCookie(S_KEY, s, 60 * 30); // sliding 30-min idle
    return s;
  }

  // ---- payload helpers
  function utmFromUrl() {
    try {
      var u = new URL(location.href);
      var out = {};
      ['source', 'medium', 'campaign', 'term', 'content'].forEach(function (k) {
        var v = u.searchParams.get('utm_' + k);
        if (v) out[k] = v;
      });
      return Object.keys(out).length ? out : undefined;
    } catch (_) { return undefined; }
  }

  function send(payload) {
    payload.siteId = siteId;
    payload.v = visitorId();
    payload.s = sessionId();
    var json = JSON.stringify(payload);
    // Use text/plain so the browser treats this as a CORS-simple request and
    // skips preflight. The server JSON-decodes the body regardless of the
    // declared Content-Type. This is important for sendBeacon in particular,
    // whose credentials mode is fixed to 'include' — a preflight with wildcard
    // Access-Control-Allow-Origin would then be rejected by the browser.
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([json], { type: 'text/plain' });
        if (navigator.sendBeacon(endpoint, blob)) return;
      }
    } catch (_) {}
    try {
      fetch(endpoint, {
        method: 'POST',
        body: json,
        headers: { 'Content-Type': 'text/plain' },
        keepalive: true,
        credentials: 'omit',
        mode: 'cors',
      }).catch(function () {});
    } catch (_) {}
  }

  function pageview() {
    var payload = {
      type: 'pageview',
      url: location.href,
      path: location.pathname + location.search,
      ref: doc.referrer || undefined,
      utm: utmFromUrl(),
      lang: navigator.language,
    };
    try { payload.screen = { w: screen.width, h: screen.height }; } catch (_) {}
    try { payload.tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) {}
    send(payload);
  }

  function track(name, props) {
    if (!name) return;
    send({
      type: 'event',
      name: String(name),
      url: location.href,
      path: location.pathname + location.search,
      props: props || undefined,
    });
  }

  // ---- public API + replay of pre-load queue
  var queued = win.pager && win.pager.q ? win.pager.q.slice() : [];
  function api(name, props) { track(name, props); }
  api.q = [];
  win.pager = api;
  for (var i = 0; i < queued.length; i++) {
    try { track.apply(null, queued[i]); } catch (_) {}
  }

  // ---- initial pageview
  pageview();

  // ---- SPA route tracking via history API
  // We check the URL synchronously after each pushState/replaceState/popstate.
  // `location.pathname` is updated before pushState returns, so by the time
  // our wrapper runs we can compare against the last path we sent. Any
  // change fires a pageview; a same-URL replaceState is a no-op. This
  // deliberately does *not* debounce — earlier iterations coalesced rapid
  // Link clicks into a single pageview for the final destination.
  var lastPath = location.pathname + location.search;
  function maybePageview() {
    var cur = location.pathname + location.search;
    if (cur !== lastPath) {
      lastPath = cur;
      pageview();
    }
  }
  ['pushState', 'replaceState'].forEach(function (m) {
    var orig = history[m];
    if (typeof orig !== 'function') return;
    history[m] = function () {
      var r = orig.apply(this, arguments);
      maybePageview();
      return r;
    };
  });
  win.addEventListener('popstate', maybePageview);
})();
