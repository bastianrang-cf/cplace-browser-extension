(function () {
  if (window.__cplaceBatchJobsPageLoaded) return;
  window.__cplaceBatchJobsPageLoaded = true;

  document.addEventListener('cplace:fetchBatchJobs', function () {
    if (typeof _context_ === 'undefined' || typeof jQuery === 'undefined') {
      document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', { detail: { rows: [], total: 0, tenantPath: '' } }));
      return;
    }

    var contextUrl = new URL(_context_, window.location.origin);
    var tenantPath = contextUrl.pathname;
    var url = contextUrl.href + 'flexigrid/customTableData';

    var formData = new FormData();
    formData.append('componentIdentifier', tenantPath + 'batchJob/persistentJobsTableSpecification');
    formData.append('columns', JSON.stringify(['_name_', 'createdAt', 'createdBy', 'startedAt', 'state', 'duration', 'errorMessage']));
    formData.append('searchValue', '');
    formData.append('filters', JSON.stringify({ state: [{ exactValue: '_empty_' }, { exactValue: 'serror' }] }));
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
          detail: { rows: data.rows || [], total: data.total || 0, tenantPath: tenantPath },
        }));
      },
      error: function (xhr, status, err) {
        console.error('[cplace batch-jobs]', xhr.status, err);
        document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', { detail: { rows: [], total: 0, tenantPath: '' } }));
      },
    });
  });
})();
