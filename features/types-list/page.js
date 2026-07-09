(function () {
  if (window.__cplaceTypesListPageLoaded) return;
  window.__cplaceTypesListPageLoaded = true;

  function currentSpaceId() {
    if (typeof _spaceID_ === 'string' && _spaceID_) return _spaceID_;
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get('spaceId') || params.get('id') || null;
    } catch (e) {
      return null;
    }
  }

  function extractUidFromUrl(url) {
    if (!url) return null;
    var m = String(url).match(/\/typeDefinitions\/([^/?#]+)/) || String(url).match(/[?&]id=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // Primary strategy: clean JSON REST endpoint.
  // Throws on an unexpected shape so the caller can fall back to HTML parsing.
  function normalizeFromApi(json) {
    if (!Array.isArray(json)) throw new Error('types: unexpected response shape');
    return json
      .map(function (t) {
        var uid = t && (t.uid || t.id || extractUidFromUrl(t.typeUrl));
        if (!uid) return null;
        return {
          uid: String(uid),
          internalName: (t.internalName || ''),
          name: (t.displayName || t.internalName || ''),
          icon: (t.icon || ''),
        };
      })
      .filter(Boolean);
  }

  // Fallback: parse the server-rendered listAllTypes page.
  function parseFromHtml(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var links = doc.querySelectorAll('a[data-qa-name="cf.cplace.platform.type.definition.link"]');
    var seen = {};
    var result = [];
    links.forEach(function (a) {
      var href = a.getAttribute('href') || '';
      var m = href.match(/\/typeDefinitions\/([^/?#]+)/);
      if (!m || seen[m[1]]) return;
      seen[m[1]] = true;
      var internalName = a.getAttribute('data-qa-element-name') || '';
      var name = (a.textContent || '').trim().replace(/\s+/g, ' ') || internalName;
      result.push({ uid: m[1], internalName: internalName, name: name, icon: '' });
    });
    return result;
  }

  function emitResult(types, error) {
    document.dispatchEvent(new CustomEvent('cplace:typesListResult', {
      detail: { types: types, error: error },
    }));
  }

  document.addEventListener('cplace:fetchTypesList', function (event) {
    var detail = (event && event.detail) || {};
    var baseUrl = detail.baseUrl;

    if (!baseUrl || typeof jQuery === 'undefined') {
      emitResult(null, 'cplace base URL or jQuery not available');
      return;
    }

    var spaceId = currentSpaceId();
    if (!spaceId) {
      emitResult(null, 'Open a workspace first');
      return;
    }

    function fetchFromHtml() {
      var htmlUrl = baseUrl + '/typeDefinition/listAllTypes?spaceId=' + encodeURIComponent(spaceId);
      jQuery.ajax({
        url: htmlUrl,
        type: 'GET',
        dataType: 'html',
        success: function (html) {
          var types = parseFromHtml(html);
          emitResult(types, types.length ? null : 'No types found');
        },
        error: function (xhr, status, err) {
          emitResult(null, 'HTTP ' + xhr.status + ' ' + (err || status));
        },
      });
    }

    var apiUrl = baseUrl + '/cplace-fe/cf.cplace.platform/data-modelling/types?spaceId=' + encodeURIComponent(spaceId);
    jQuery.ajax({
      url: apiUrl,
      type: 'GET',
      dataType: 'json',
      success: function (data) {
        try {
          emitResult(normalizeFromApi(data), null);
        } catch (e) {
          fetchFromHtml();
        }
      },
      error: fetchFromHtml,
    });
  });
})();
