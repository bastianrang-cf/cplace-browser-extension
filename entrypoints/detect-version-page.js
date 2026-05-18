import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';

export default defineUnlistedScript(() => {
  if (window.__cplaceDetectVersionLoaded) return;
  window.__cplaceDetectVersionLoaded = true;
  document.dispatchEvent(new CustomEvent('cplace:versionDetected', {
    detail: { version: typeof _cplaceRelease_ !== 'undefined' ? _cplaceRelease_ : null },
  }));
});
