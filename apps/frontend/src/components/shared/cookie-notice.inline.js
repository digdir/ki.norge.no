(function () {
  var KEY = 'ki-analytics-consent';
  // Bump when the categories or what they cover change. A stored consent
  // with any other version is dropped, and the visitor is asked again.
  var VERSION = 2;
  var CATEGORIES = {
    analytics: 'cookie-notice-analytics',
    thirdParty: 'cookie-notice-third-party'
  };
  var notice = document.getElementById('cookie-notice');
  var allowBtn = document.getElementById('cookie-notice-allow');
  var denyBtn = document.getElementById('cookie-notice-deny');
  var saveBtn = document.getElementById('cookie-notice-save');
  if (!notice || !allowBtn || !denyBtn || !saveBtn) return;

  var boxes = {};
  for (var name in CATEGORIES) {
    boxes[name] = document.getElementById(CATEGORIES[name]);
    if (!boxes[name]) return;
  }

  function isChoice(value) {
    return value === 'allow' || value === 'deny';
  }

  // Returns { analytics: 'allow' | 'deny' | null, thirdParty: ... }.
  function readConsent() {
    var result = {};
    var parsed = null;
    try {
      parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (parsed && parsed.v !== VERSION) {
        localStorage.removeItem(KEY);
        parsed = null;
      }
    } catch (e) { parsed = null; }
    for (var name in CATEGORIES) {
      result[name] = parsed && isChoice(parsed[name]) ? parsed[name] : null;
    }
    return result;
  }

  function writeConsent(consent) {
    var data = { v: VERSION };
    for (var name in CATEGORIES) data[name] = consent[name];
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function allCategories(value) {
    var consent = {};
    for (var name in CATEGORIES) consent[name] = value;
    return consent;
  }

  function fromCheckboxes() {
    var consent = {};
    for (var name in CATEGORIES) consent[name] = boxes[name].checked ? 'allow' : 'deny';
    return consent;
  }

  function isComplete(consent) {
    for (var name in CATEGORIES) {
      if (!consent[name]) return false;
    }
    return true;
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

  function loadAllowed(consent) {
    if (consent.analytics === 'allow') {
      loadSkyra();
      loadSiteimprove();
    }
    // TODO: video, slido og slikt her
  }

  function applyConsent(consent) {
    writeConsent(consent);
    notice.hidden = true;
    loadAllowed(consent);
  }

  // The listeners are always registered, so the banner can be reopened from
  // "Endre samtykke for informasjonskapsler" in the footer.
  allowBtn.addEventListener('click', function () { applyConsent(allCategories('allow')); });
  denyBtn.addEventListener('click', function () { applyConsent(allCategories('deny')); });
  saveBtn.addEventListener('click', function () { applyConsent(fromCheckboxes()); });
  function showWithStoredChoices(stored) {
    for (var name in CATEGORIES) boxes[name].checked = stored[name] === 'allow';
    notice.hidden = false;
  }

  window.addEventListener('open-cookie-notice', function () {
    showWithStoredChoices(readConsent());
    // User-initiated reopening: move focus to the banner (scrolls there by itself)
    allowBtn.focus();
  });

  var consent = readConsent();
  loadAllowed(consent);
  // Show the banner until every category has an answer.
  if (!isComplete(consent)) showWithStoredChoices(consent);
})();
