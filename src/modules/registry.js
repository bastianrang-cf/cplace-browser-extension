// Shared module registry. Loaded by:
//   - content scripts (manifest content_scripts, before each module file and content.js)
//   - service worker (via importScripts)
//   - options page (via plain <script>)
//
// Each module file appends to globalThis.__cplaceModules with the shape:
//   { id, name, description, defaultEnabled, apply(ctx), revert(ctx) }
//
// apply/revert run in content-script context and may touch the DOM.
// They are never invoked from the service worker or options page; those
// contexts only read id/name/description/defaultEnabled.

(function () {
  const g = globalThis;
  if (!g.__cplaceModules) g.__cplaceModules = [];
  if (!g.__cplaceRegistry) {
    g.__cplaceRegistry = {
      all() {
        return g.__cplaceModules.slice();
      },
      byId(id) {
        return g.__cplaceModules.find((m) => m.id === id);
      },
      defaultEnabledMap() {
        const out = {};
        for (const m of g.__cplaceModules) out[m.id] = !!m.defaultEnabled;
        return out;
      },
    };
  }
})();
