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
};
