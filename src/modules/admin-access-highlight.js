(function () {
  const STYLE_ID = 'cplace-admin-access-highlight-style';
  const CSS = `
    body.cf-cplace-admin-access #cplace {
      outline: 3px solid red !important;
      box-shadow: 0 0 12px 4px rgba(255, 0, 0, 0.7) !important;
    }
  `;

  globalThis.__cplaceModules.push({
    id: 'admin-access-highlight',
    name: 'Admin access highlight',
    description:
      'Show a red glow/outline around #cplace when the page body has class .cf-cplace-admin-access.',
    defaultEnabled: true,
    apply() {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      (document.head || document.documentElement).appendChild(style);
    },
    revert() {
      const el = document.getElementById(STYLE_ID);
      if (el) el.remove();
    },
  });
})();
