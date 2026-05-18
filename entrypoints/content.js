import { defineContentScript } from 'wxt/utils/define-content-script';
import { injectScript } from 'wxt/utils/inject-script';
import { registry } from '../features/registry.js';
import { injectModuleCSS, removeModuleCSS, injectPageScript, removePageScript } from '../features/utils.js';

const STORAGE_KEY = 'enabledModules';
const OPTIONS_KEY = 'moduleOptions';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    const activeModules = new Set();
    let lastVersionInfo = null;
    let moduleOptions = {};

    function getEnabledMap(stored) {
      const defaults = registry.defaultEnabledMap();
      return { ...defaults, ...(stored || {}) };
    }

    function notifyVersionDetected(mod) {
      if (lastVersionInfo && typeof mod.onVersionDetected === 'function') {
        try { mod.onVersionDetected(lastVersionInfo); } catch (e) {
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
          mod.apply?.(moduleOptions[id] || {});
          activeModules.add(id);
        } catch (e) {
          console.warn('[cplace] module apply failed:', id, e);
        }
        notifyVersionDetected(mod);
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
      const version = event.detail?.version || null;
      const tenant = location.pathname.split('/').filter(Boolean)[0] || null;
      lastVersionInfo = { version, hostname: location.hostname, tenant };
      for (const mod of registry.all()) {
        if (activeModules.has(mod.id) && typeof mod.onVersionDetected === 'function') {
          try { mod.onVersionDetected(lastVersionInfo); } catch (e) {
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
        injectScript('/detect-version-page.js', { keepInDom: true });
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

    browser.storage.local.get([STORAGE_KEY, OPTIONS_KEY]).then((data) => {
      moduleOptions = data[OPTIONS_KEY] || {};
      applyAll(data[STORAGE_KEY]);
    });

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
            mod?.apply?.(moduleOptions[msg.id]);
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
          mod.onAction(msg.actionId);
        } catch (e) {
          console.warn('[cplace] module action failed:', msg.moduleId, msg.actionId, e);
        }
      }
    });

    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return;
      applyAll(changes[STORAGE_KEY].newValue);
    });
  },
});
