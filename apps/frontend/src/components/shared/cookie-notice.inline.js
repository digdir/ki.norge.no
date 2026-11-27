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

  // Third-party iframes (video, Slido) from ConsentEmbed.astro. With consent the
  // iframe gets its src and the placeholder is hidden. Without, src is removed
  // again, so withdrawing consent also stops a player that is already loaded.
  function applyEmbeds(consent) {
    var allow = consent.thirdParty === 'allow';
    var embeds = document.querySelectorAll('[data-consent-embed]');
    for (var i = 0; i < embeds.length; i++) {
      var frame = embeds[i].querySelector('iframe[data-consent-src]');
      var blocked = embeds[i].querySelector('[data-consent-blocked]');
      if (!frame || !blocked) continue;
      var src = frame.getAttribute('data-consent-src');
      if (allow) {
        if (frame.getAttribute('src') !== src) frame.setAttribute('src', src);
      } else {
        frame.removeAttribute('src');
      }
      frame.hidden = !allow;
      blocked.hidden = allow;
    }
  }

  // This script runs before the page body is parsed, so the embeds further down
  // do not exist yet on the first run.
  function whenReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function loadAllowed(consent) {
    if (consent.analytics === 'allow') {
      loadSkyra();
      loadSiteimprove();
    }
    whenReady(function () { applyEmbeds(consent); });
  }

  // The embed whose "Administrer samtykke" opened the banner. Focus goes back
  // there after the choice, to the player if it was allowed, otherwise to the button.
  var openedFrom = null;

  function returnFocus(consent) {
    if (!openedFrom) return;
    var target = consent.thirdParty === 'allow'
      ? openedFrom.querySelector('iframe')
      : openedFrom.querySelector('[data-open-cookie-notice]');
    openedFrom = null;
    if (target) target.focus();
  }

  function applyConsent(consent) {
    writeConsent(consent);
    notice.hidden = true;
    loadAllowed(consent);
    returnFocus(consent);
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

  // "Administrer samtykke" on a blocked embed. Delegated, since the embeds are
  // parsed after this script has run.
  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest && event.target.closest('[data-open-cookie-notice]');
    if (!button) return;
    openedFrom = button.closest('[data-consent-embed]');
    window.dispatchEvent(new CustomEvent('open-cookie-notice'));
  });

  window.addEventListener('open-cookie-notice', function () {
    showWithStoredChoices(readConsent());
    // User-initiated reopening: move focus to the banner itself, not to a choice,
    // so screen readers read the title and the visitor picks with Tab
    // (focus scrolls there by itself).
    notice.focus();
  });

  var consent = readConsent();
  loadAllowed(consent);
  // Show the banner until every category has an answer.
  if (!isComplete(consent)) showWithStoredChoices(consent);
})();
