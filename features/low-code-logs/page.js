(function () {
  // Current-viewer identity, read from page-world globals cplace injects into
  // the page. Only a page-world script can see these (the content script runs
  // isolated from the page's JS context) — same pattern as language-switcher's
  // _currentUserId_ read and workspace-list's/types-list's currentSpaceId().
  function currentUserId() {
    return typeof _currentUserId_ !== 'undefined' && _currentUserId_ ? _currentUserId_ : null;
  }

  function currentSpaceId() {
    if (typeof _spaceID_ === 'string' && _spaceID_) return _spaceID_;
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get('spaceId') || params.get('id') || null;
    } catch (e) {
      return null;
    }
  }

  // Register the fetch listener exactly once per page. The window flag survives
  // re-injection of this script after a feature toggle, so we never double-register.
  if (!window.__cplaceLowCodeLogsPageLoaded) {
    window.__cplaceLowCodeLogsPageLoaded = true;

    document.addEventListener('cplace:fetchLowCodeLogs', function (event) {
      var detail = (event && event.detail) || {};
      var baseUrl = detail.baseUrl;
      var pageSize = typeof detail.pageSize === 'number' ? detail.pageSize : 25;

      if (!baseUrl || typeof jQuery === 'undefined') {
        document.dispatchEvent(new CustomEvent('cplace:lowCodeLogsResult', {
          detail: { logs: [], total: 0 },
        }));
        return;
      }

      var formData = new FormData();
      formData.append('page', '1');
      formData.append('pageSize', String(pageSize));

      jQuery.ajax({
        url: baseUrl + '/cplacejsAdmin/cplaceJSLogsLoad',
        data: formData,
        processData: false,
        contentType: false,
        type: 'POST',
        success: function (data) {
          var logs = (data && data.logs) || [];
          var total = (data && data.pagination && data.pagination.total) || 0;
          document.dispatchEvent(new CustomEvent('cplace:lowCodeLogsResult', {
            detail: {
              logs: logs,
              total: total,
              currentUserId: currentUserId(),
              currentSpaceId: currentSpaceId(),
            },
          }));
        },
        error: function (xhr, status, err) {
          var msg = xhr.status ? (xhr.status + ' ' + (err || status)) : (err || status || 'Network error');
          document.dispatchEvent(new CustomEvent('cplace:lowCodeLogsResult', {
            detail: { error: msg, logs: [], total: 0 },
          }));
        },
      });
    });
  }

  // Announce readiness on every execution (including re-injection after a toggle),
  // so the content script knows the fetch listener is live and can issue the
  // initial fetch immediately instead of waiting for the first poll interval.
  // Current-viewer identity rides along so the content script has a snapshot
  // even before the first fetch round-trip completes (e.g. a cache hit).
  document.dispatchEvent(new CustomEvent('cplace:lowCodeLogsPageReady', {
    detail: { currentUserId: currentUserId(), currentSpaceId: currentSpaceId() },
  }));
})();
