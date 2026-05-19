import { defineContentScript, injectScript } from '#imports';
import { registry } from '../features/registry.js';
import { injectModuleCSS, removeModuleCSS, injectPageScript, removePageScript } from '../features/utils.js';
import { enabledModulesItem, moduleOptionsItem } from '../features/storage.js';
import { deriveBaseUrl } from '../features/base-url.js';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    const activeModules = new Set();
    let lastContext = null;
    let moduleOptions = {};

    function getEnabledMap(stored) {
      const defaults = registry.defaultEnabledMap();
      return { ...defaults, ...(stored || {}) };
    }

    function notifyContextDetected(mod) {
      if (lastContext && typeof mod.onVersionDetected === 'function') {
        try { mod.onVersionDetected(lastContext); } catch (e) {
          console.warn('[cplace] module onVersionDetected failed:', mod.id, e);
        }
      }
    }

    function applyModuleState(id, enabled) {
      const mod = registry.byId(id);
      if (!mod) return;
      const isActive = activeModules.has(id);
      if (enabled && !isActive) {
        try {
          if (mod.css) injectModuleCSS(mod.id);
          if (mod.pageScript) injectPageScript(mod.id);
          mod.apply?.(moduleOptions[id] || {}, lastContext);
          activeModules.add(id);
        } catch (e) {
          console.warn('[cplace] module apply failed:', id, e);
        }
        notifyContextDetected(mod);
      } else if (!enabled && isActive) {
        try {
          mod.revert?.();
          if (mod.css) removeModuleCSS(mod.id);
          if (mod.pageScript) removePageScript(mod.id);
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
    let versionInjected = false;

    document.addEventListener('cplace:versionDetected', (event) => {
      const detail = event.detail || {};
      const baseInfo = deriveBaseUrl({
        origin: location.origin,
        hostname: location.hostname,
        context: detail.context ?? null,
      });
      lastContext = { version: detail.version || null, ...baseInfo };
      for (const mod of registry.all()) {
        if (activeModules.has(mod.id) && typeof mod.onVersionDetected === 'function') {
          try { mod.onVersionDetected(lastContext); } catch (e) {
            console.warn('[cplace] module onVersionDetected failed:', mod.id, e);
          }
        }
      }
    });

    function checkCplace() {
      const found = !!document.getElementById('cplace');
      if (found === lastFound) return;
      lastFound = found;
      try {
        browser.runtime.sendMessage({ type: 'cplace:status', found });
      } catch (_) {
        // service worker may be asleep; safe to ignore — next check will retry
      }
      if (found && !versionInjected) {
        versionInjected = true;
        injectScript('/detect-version-page.js', { keepInDom: true }).catch(() => {});
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

    Promise.all([enabledModulesItem.getValue(), moduleOptionsItem.getValue()]).then(
      ([enabled, options]) => {
        moduleOptions = options;
        applyAll(enabled);
      },
    );

    browser.runtime.onMessage.addListener((msg) => {
      if (!msg) return;
      if (msg.type === 'cplace:moduleToggle') {
        applyModuleState(msg.id, !!msg.enabled);
        return;
      }
      if (msg.type === 'cplace:moduleOptions') {
        moduleOptions[msg.id] = msg.options || {};
        if (activeModules.has(msg.id)) {
          const mod = registry.byId(msg.id);
          try {
            mod?.revert?.();
            mod?.apply?.(moduleOptions[msg.id], lastContext);
          } catch (e) {
            console.warn('[cplace] module options update failed:', msg.id, e);
          }
        }
        return;
      }
      if (msg.type === 'cplace:moduleAction') {
        const mod = registry.byId(msg.moduleId);
        if (!mod || !activeModules.has(msg.moduleId) || typeof mod.onAction !== 'function') return;
        try {
          mod.onAction(msg.actionId, lastContext);
        } catch (e) {
          console.warn('[cplace] module action failed:', msg.moduleId, msg.actionId, e);
        }
        return;
      }
      if (msg.type === 'cplace:getBaseUrl') {
        return Promise.resolve(lastContext);
      }
    });

    enabledModulesItem.watch((newValue) => {
      applyAll(newValue);
    });
  },
});
