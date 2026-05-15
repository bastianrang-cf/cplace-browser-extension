import adminAccessHighlight from './admin-access-highlight.js';
import batchJobs from './batch-jobs.js';
import languageSwitcher from './language-switcher.js';
import versionBadge from './version-badge.js';

const modules = [adminAccessHighlight, batchJobs, languageSwitcher, versionBadge];

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
