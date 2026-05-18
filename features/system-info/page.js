(function () {
  if (window.__cplaceSystemInfoPageLoaded) return;
  window.__cplaceSystemInfoPageLoaded = true;

  document.addEventListener('cplace:fetchSystemInfo', function () {
    if (typeof _context_ === 'undefined' || typeof jQuery === 'undefined') {
      document.dispatchEvent(new CustomEvent('cplace:systemInfoResult', {
        detail: { data: null, error: 'cplace context or jQuery not available' },
      }));
      return;
    }

    var contextUrl = new URL(_context_, window.location.origin);
    var url = contextUrl.href + 'cplace-fe/cf.cplace.platform/system-info';

    jQuery.ajax({
      url: url,
      type: 'GET',
      dataType: 'json',
      success: function (data) {
        document.dispatchEvent(new CustomEvent('cplace:systemInfoResult', {
          detail: { data: data, error: null },
        }));
      },
      error: function (xhr, status, err) {
        document.dispatchEvent(new CustomEvent('cplace:systemInfoResult', {
          detail: { data: null, error: 'HTTP ' + xhr.status + ' ' + (err || status) },
        }));
      },
    });
  });
})();
