import { defineContentScript } from 'wxt/utils/define-content-script';
import { registry } from '../modules/registry.js';

const STORAGE_KEY = 'enabledModules';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    const activeModules = new Set();

    function getEnabledMap(stored) {
      const defaults = registry.defaultEnabledMap();
      return { ...defaults, ...(stored || {}) };
    }

    function applyModuleState(id, enabled) {
      const mod = registry.byId(id);
      if (!mod) return;
      const isActive = activeModules.has(id);
      if (enabled && !isActive) {
        try {
          mod.apply();
          activeModules.add(id);
        } catch (e) {
          console.warn('[cplace] module apply failed:', id, e);
        }
      } else if (!enabled && isActive) {
        try {
          mod.revert();
          activeModules.delete(id);
        } catch (e) {
          console.warn('[cplace] module revert failed:', id, e);
        }
      }
    }

    function applyAll(stored) {
      const enabled = getEnabledMap(stored);
      for (const mod of registry.all()) {
        applyModuleState(mod.id, !!enabled[mod.id]);
      }
    }

    // --- Core detection ---

    let lastFound = null;

    function checkCplace() {
      const found = !!document.getElementById('cplace');
      if (found === lastFound) return;
      lastFound = found;
      try {
        browser.runtime.sendMessage({ type: 'cplace:status', found });
      } catch (_) {
        // service worker may be asleep; safe to ignore — next check will retry
      }
    }

    let debounceTimer = null;
    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(checkCplace, 250);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    checkCplace();

    // --- Module runtime ---

    browser.storage.local.get(STORAGE_KEY).then((data) => {
      applyAll(data[STORAGE_KEY]);
    });

    browser.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== 'cplace:moduleToggle') return;
      applyModuleState(msg.id, !!msg.enabled);
    });

    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return;
      applyAll(changes[STORAGE_KEY].newValue);
    });
  },
});
