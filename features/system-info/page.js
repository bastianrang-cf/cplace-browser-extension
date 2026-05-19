(function () {
  if (window.__cplaceSystemInfoPageLoaded) return;
  window.__cplaceSystemInfoPageLoaded = true;

  document.addEventListener('cplace:fetchSystemInfo', function (event) {
    var detail = (event && event.detail) || {};
    var baseUrl = detail.baseUrl;

    if (!baseUrl || typeof jQuery === 'undefined') {
      document.dispatchEvent(new CustomEvent('cplace:systemInfoResult', {
        detail: { data: null, error: 'cplace base URL or jQuery not available' },
      }));
      return;
    }

    var url = baseUrl + '/cplace-fe/cf.cplace.platform/system-info';

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
