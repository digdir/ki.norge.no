(function () {
  var KEY = 'ki-analytics-consent';
  var notice = document.getElementById('cookie-notice');
  var allowBtn = document.getElementById('cookie-notice-allow');
  var denyBtn = document.getElementById('cookie-notice-deny');
  if (!notice || !allowBtn || !denyBtn) return;

  function readConsent() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && parsed.analytics ? parsed.analytics : null;
    } catch (e) { return null; }
  }

  function writeConsent(value) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: 1, analytics: value }));
    } catch (e) {}
  }

  function loadSkyra() {
    if (window.__skyraLoaded) return;
    window.__skyraLoaded = true;
    window.SKYRA_CONFIG = { org: 'digitaliseringsdirektoratet' };
    var s = document.createElement('script');
    s.src = 'https://survey.skyra.no/skyra-survey.js';
    s.async = true;
    document.head.appendChild(s);
  }

  function loadSiteimprove() {
    if (window.__siteimproveLoaded) return;
    var search = decodeURIComponent(window.location.search);
    if (search.match(/\d(?:\d|\D\d){5,}/g) || search.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)) return;
    window.__siteimproveLoaded = true;
    var s = document.createElement('script');
    s.src = 'https://siteimproveanalytics.com/js/siteanalyze_6255470.js';
    s.async = true;
    document.head.appendChild(s);
  }

  // The listeners are always registered, so the banner can be reopened from
  // "Endre samtykke for informasjonskapsler" in the footer.
  allowBtn.addEventListener('click', function () {
    writeConsent('allow');
    notice.hidden = true;
    loadSkyra();
    loadSiteimprove();
  });
  denyBtn.addEventListener('click', function () {
    writeConsent('deny');
    notice.hidden = true;
  });
  window.addEventListener('open-cookie-notice', function () {
    notice.hidden = false;
    // User-initiated reopening: move focus to the banner (scrolls there by itself)
    allowBtn.focus();
  });

  var consent = readConsent();
  if (consent === 'allow') {
    loadSkyra();
    loadSiteimprove();
    return;
  }
  if (consent === 'deny') {
    return;
  }

  notice.hidden = false;
})();
