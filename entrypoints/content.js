import { defineContentScript, injectScript } from '#imports';
import { registry } from '../features/registry.js';
import { injectModuleCSS, removeModuleCSS, injectPageScript, removePageScript } from '../features/utils.js';
import { enabledModulesItem, moduleOptionsItem, moduleSnoozeItem } from '../features/storage.js';
import { deriveBaseUrl } from '../features/base-url.js';
import { pruneSnooze, snoozeState } from '../features/snooze.js';

export default defineContentScript({
  registration: 'runtime',
  runAt: 'document_idle',
  main() {
    const activeModules = new Set();
    let lastContext = null;
    let lastFound = null;
    let moduleOptions = {};
    let desiredEnabled = {};
    let moduleSnooze = {};
    let snoozeTimer = null;

    function getEnabledMap(stored) {
      const defaults = registry.defaultEnabledMap();
      return { ...defaults, ...(stored || {}) };
    }

    function isModuleSuppressed(id) {
      const key = lastContext?.baseUrl;
      if (!key) return false;
      return snoozeState(moduleSnooze[key]?.[id]) !== 'off';
    }

    function scheduleSnoozeExpiry() {
      if (snoozeTimer) {
        clearTimeout(snoozeTimer);
        snoozeTimer = null;
      }
      const key = lastContext?.baseUrl;
      const mods = key ? moduleSnooze[key] : null;
      if (!mods) return;
      const now = Date.now();
      let earliest = Infinity;
      for (const entry of Object.values(mods)) {
        if (entry && entry.until != null && entry.until > now) {
          earliest = Math.min(earliest, entry.until);
        }
      }
      if (earliest !== Infinity) {
        snoozeTimer = setTimeout(() => {
          moduleSnooze = pruneSnooze(moduleSnooze);
          reconcile();
          scheduleSnoozeExpiry();
        }, earliest - now);
      }
    }

    function notifyContextDetected(mod) {
      if (lastContext && typeof mod.onVersionDetected === 'function') {
        try { mod.onVersionDetected(lastContext); } catch (e) {
          console.warn('[cplace] module onVersionDetected failed:', mod.id, e);
        }
      }
    }

    function applyModuleState(id, enabled) {
      desiredEnabled[id] = enabled;
      const mod = registry.byId(id);
      if (!mod) return;
      const isActive = activeModules.has(id);
      const shouldBeActive =
        enabled && lastFound === true && !(mod.snoozable && isModuleSuppressed(id));
      if (shouldBeActive && !isActive) {
        try {
          if (mod.css) injectModuleCSS(mod.id);
          if (mod.pageScript) injectPageScript(mod.id);
          mod.apply?.(moduleOptions[id] || {}, lastContext);
          activeModules.add(id);
        } catch (e) {
          console.warn('[cplace] module apply failed:', id, e);
        }
        notifyContextDetected(mod);
      } else if (!shouldBeActive && isActive) {
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
      desiredEnabled = enabled;
      for (const mod of registry.all()) {
        applyModuleState(mod.id, !!enabled[mod.id]);
      }
    }

    function reconcile() {
      for (const mod of registry.all()) {
        applyModuleState(mod.id, !!desiredEnabled[mod.id]);
      }
    }

    // --- Core detection ---

    let versionInjected = false;

    document.addEventListener('cplace:versionDetected', (event) => {
      const detail = event.detail || {};
      const baseInfo = deriveBaseUrl({
        origin: location.origin,
        hostname: location.hostname,
        context: detail.context ?? null,
      });
      lastContext = { version: detail.version || null, ...baseInfo };
      // Hand the resolved baseUrl to the background so it can bind it to this tab's popup
      // URL (popup.html?tabId=…&baseUrl=…). The popup reads it from its own URL instead of
      // querying the active tab and messaging us back — unreliable in Arc's window model.
      try {
        browser.runtime.sendMessage({ type: 'cplace:context', baseUrl: lastContext.baseUrl });
      } catch (_) {
        // service worker may be asleep; safe to ignore — re-sent on the next detection
      }
      // baseUrl is now known — re-evaluate snooze suppression for this tenant and arm
      // the expiry timer (modules applied before detection may need reverting).
      reconcile();
      scheduleSnoozeExpiry();
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
      reconcile();
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

    Promise.all([
      enabledModulesItem.getValue(),
      moduleOptionsItem.getValue(),
      moduleSnoozeItem.getValue(),
    ]).then(([enabled, options, snooze]) => {
      moduleOptions = options;
      moduleSnooze = pruneSnooze(snooze || {});
      applyAll(enabled);
      scheduleSnoozeExpiry();
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
      if (msg.type === 'cplace:moduleSnooze') {
        // Primary cross-window path: re-read the shared map and reconcile.
        moduleSnoozeItem.getValue().then((v) => {
          moduleSnooze = pruneSnooze(v || {});
          reconcile();
          scheduleSnoozeExpiry();
        });
        return;
      }
    });

    enabledModulesItem.watch((newValue) => {
      applyAll(newValue);
    });

    moduleSnoozeItem.watch((newValue) => {
      moduleSnooze = pruneSnooze(newValue || {});
      reconcile();
      scheduleSnoozeExpiry();
    });
  },
});
