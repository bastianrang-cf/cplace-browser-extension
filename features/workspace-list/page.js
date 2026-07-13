(function () {
  if (window.__cplaceWorkspaceListPageLoaded) return;
  window.__cplaceWorkspaceListPageLoaded = true;

  function currentSpaceId() {
    if (typeof _spaceID_ === 'string' && _spaceID_) return _spaceID_;
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get('spaceId') || params.get('id') || null;
    } catch (e) {
      return null;
    }
  }

  function toAbsoluteUrl(url) {
    if (!url) return null;
    return /^https?:\/\//i.test(url) ? url : window.location.origin + url;
  }

  // Primary strategy: clean JSON REST endpoint.
  // Throws on an unexpected shape so the caller can fall back to DOM scraping.
  function normalizeFromApi(json) {
    if (!json || !Array.isArray(json.spaces)) throw new Error('workspaces: unexpected response shape');
    return json.spaces
      .filter(function (s) { return s && s.id != null && s.url && s.isVisible !== false; })
      .map(function (s) {
        return { uid: String(s.id), name: s.name || String(s.id), url: toAbsoluteUrl(s.url) };
      });
  }

  // Fallback: scrape the top-nav "Workspaces" dropdown menu.
  function parseFromDom() {
    var links = document.querySelectorAll(
      '[data-element="hui-non-favorite-workspaces-li"] a, [data-element="hui-favorite-workspaces-li"] a',
    );
    var seen = {};
    var result = [];
    links.forEach(function (a) {
      var nameEl = a.querySelector('.ellipsis-text-overflow');
      var name = ((nameEl ? nameEl.textContent : a.textContent) || '').trim();
      var href = a.getAttribute('href');
      if (!name || !href || seen[href]) return;
      seen[href] = true;
      result.push({ uid: href, name: name, url: toAbsoluteUrl(href) });
    });
    return result;
  }

  // The dropdown is populated lazily by Angular on first open; programmatically
  // click it (hidden via an injected style) to trigger population, scrape the
  // result, then close it again.
  function loadViaDropdown(callback) {
    var existing = parseFromDom();
    if (existing.length) {
      callback(existing);
      return;
    }
    var toggle = document.querySelector('[data-element="hui-workspaces-toggle"]');
    var outer = document.querySelector('[data-element="hui-workspaces-outer-ul"]');
    if (!toggle || !outer) {
      callback([]);
      return;
    }

    var styleEl = document.createElement('style');
    styleEl.textContent =
      '[data-element="hui-overflow-menu-workspaces"] .dropdown-menu{visibility:hidden!important;opacity:0!important;pointer-events:none!important}';
    document.head.appendChild(styleEl);

    var done = false;
    function finish(list) {
      if (done) return;
      done = true;
      styleEl.remove();
      observer.disconnect();
      clearTimeout(timer);
      document.body.click();
      callback(list);
    }

    var observer = new MutationObserver(function () {
      var list = parseFromDom();
      if (list.length) finish(list);
    });
    observer.observe(outer, { childList: true, subtree: true });

    var timer = setTimeout(function () {
      finish(parseFromDom());
    }, 3000);
    toggle.click();
  }

  function emitResult(workspaces, error) {
    document.dispatchEvent(new CustomEvent('cplace:workspaceListResult', {
      detail: { workspaces: workspaces, error: error, currentUid: currentSpaceId() },
    }));
  }

  document.addEventListener('cplace:fetchWorkspaceList', function (event) {
    var detail = (event && event.detail) || {};
    var baseUrl = detail.baseUrl;

    if (!baseUrl || typeof jQuery === 'undefined') {
      emitResult(null, 'cplace base URL or jQuery not available');
      return;
    }

    function fallback() {
      loadViaDropdown(function (workspaces) {
        emitResult(workspaces, workspaces.length ? null : 'No workspaces found');
      });
    }

    var apiUrl = baseUrl + '/cplace-fe/cf.cplace.platform/workspace/allSpaces';
    jQuery.ajax({
      url: apiUrl,
      type: 'GET',
      dataType: 'json',
      success: function (data) {
        try {
          var workspaces = normalizeFromApi(data);
          emitResult(workspaces, workspaces.length ? null : 'No workspaces found');
        } catch (e) {
          fallback();
        }
      },
      error: fallback,
    });
  });
})();
