(function () {
  // Register the fetch listener exactly once per page. The window flag survives
  // re-injection of this script after a feature toggle, so we never double-register.
  if (!window.__cplaceBatchJobsPageLoaded) {
    window.__cplaceBatchJobsPageLoaded = true;

    document.addEventListener('cplace:fetchBatchJobs', function (event) {
      var detail = (event && event.detail) || {};
      var baseUrl = detail.baseUrl;
      var contextPath = detail.contextPath;

      if (!baseUrl || typeof contextPath !== 'string' || typeof jQuery === 'undefined') {
        document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', { detail: { rows: [], total: 0 } }));
        return;
      }

      var url = baseUrl + '/flexigrid/customTableData';

      var d = new Date();
      var pad = function (n) { return String(n).padStart(2, '0'); };
      var today = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

      var formData = new FormData();
      formData.append('componentIdentifier', contextPath + 'batchJob/persistentJobsTableSpecification');
      formData.append('columns', JSON.stringify(['_name_', 'createdAt', 'createdBy', 'startedAt', 'state', 'duration']));
      formData.append('searchValue', '');
      formData.append('filters', JSON.stringify({
        createdAt: [{ rangeFilter: { rangeFrom: today, type: 'DATE', rangeFromComparator: '>=', rangeToComparator: '<' } }],
      }));
      formData.append('groupBy', '');
      formData.append('singleSpaced', 'false');
      formData.append('fromUserConfigEdit', 'false');
      formData.append('connectedTableSelectionUid', '');
      formData.append('sortColumn', 'createdAt');
      formData.append('sortOrder', 'desc');
      formData.append('requestedPage', '1');

      jQuery.ajax({
        url: url,
        data: formData,
        processData: false,
        contentType: false,
        type: 'POST',
        success: function (data) {
          document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', {
            detail: { rows: data.rows || [], total: data.total || 0 },
          }));
        },
        error: function (xhr, status, err) {
          var msg = xhr.status ? (xhr.status + ' ' + (err || status)) : (err || status || 'Network error');
          document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', {
            detail: { error: msg, rows: [], total: 0 },
          }));
        },
      });
    });
  }

  // Announce readiness on every execution (including re-injection after a toggle),
  // so the content script knows the fetch listener is live and can issue the
  // initial fetch immediately instead of waiting for the first poll interval.
  document.dispatchEvent(new CustomEvent('cplace:batchJobsPageReady'));
})();
