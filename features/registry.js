const globbed = import.meta.glob('./*/index.js', { eager: true });

const modules = Object.keys(globbed)
  .sort()
  .map((path) => globbed[path].default)
  .filter(
    (mod) =>
      mod != null &&
      typeof mod.id === 'string',
  );

export const registry = {
  all() {
    return modules.slice();
  },
  byId(id) {
    return modules.find((m) => m.id === id);
  },
  defaultEnabledMap() {
    const out = {};
    for (const m of modules) out[m.id] = !!m.defaultEnabled;
    return out;
  },
  defaultOptionsMap() {
    const out = {};
    for (const m of modules) {
      const fromDefaults = m.defaultOptions && typeof m.defaultOptions === 'object'
        ? structuredClone(m.defaultOptions)
        : null;
      const fromArray = Array.isArray(m.options) && m.options.length > 0;
      if (!fromDefaults && !fromArray) continue;
      out[m.id] = fromDefaults || {};
      if (fromArray) {
        for (const opt of m.options) out[m.id][opt.id] = opt.default;
      }
    }
    return out;
  },
};
