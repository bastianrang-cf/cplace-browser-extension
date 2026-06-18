import { defineContentScript, injectScript } from '#imports';
import { registry } from '../features/registry.js';
import { injectModuleCSS, removeModuleCSS, injectPageScript, removePageScript } from '../features/utils.js';
import { enabledModulesItem, moduleOptionsItem, moduleSnoozeItem, moduleShortcutsItem } from '../features/storage.js';
import { deriveBaseUrl } from '../features/base-url.js';
import { pruneSnooze, snoozeState, snoozeEntryFor } from '../features/snooze.js';
import { detectPlatform, matchesCombo, SNOOZE_COMMAND_ID } from '../features/shortcuts.js';

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
    let moduleShortcuts = {};
    let snoozeTimer = null;
    const platform = detectPlatform();

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

    // Toggle a snoozable module between active (off) and snoozed for the current
    // tenant. Mirrors the popup's snooze write so behaviour is identical; the
    // local setValue triggers this tab's own watch (idempotent reconcile) and the
    // runtime message fans out to sibling tabs of the same tenant.
    function toggleSnooze(moduleId) {
      const baseUrl = lastContext?.baseUrl;
      if (!baseUrl) return;
      const current = snoozeState(moduleSnooze[baseUrl]?.[moduleId]);
      const entry = snoozeEntryFor(current === 'off' ? 'snooze' : 'off');
      const map = pruneSnooze(moduleSnooze);
      const mods = { ...(map[baseUrl] || {}) };
      if (entry) mods[moduleId] = entry;
      else delete mods[moduleId];
      if (Object.keys(mods).length) map[baseUrl] = mods;
      else delete map[baseUrl];
      moduleSnooze = map;
      moduleSnoozeItem.setValue(map).catch(() => {});
      browser.runtime.sendMessage({ type: 'cplace:moduleSnooze' }).catch(() => {});
      reconcile();
      scheduleSnoozeExpiry();
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
      moduleShortcutsItem.getValue(),
    ]).then(([enabled, options, snooze, shortcuts]) => {
      moduleOptions = options;
      moduleSnooze = pruneSnooze(snooze || {});
      moduleShortcuts = shortcuts || {};
      applyAll(enabled);
      scheduleSnoozeExpiry();
    });

    // --- Keyboard shortcuts ---
    //
    // A single in-page keydown listener dispatches the same paths the popup uses.
    // Snooze commands gate on "enabled + #cplace present" (NOT on the module being
    // active) so a snoozed module can still be un-snoozed by keyboard. Action
    // commands keep the strict "module active" gate.
    function isEditableTarget(el) {
      if (!el || typeof el !== 'object') return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      return !!el.isContentEditable;
    }

    function handleShortcutKeydown(event) {
      for (const [moduleId, cmds] of Object.entries(moduleShortcuts)) {
        const mod = registry.byId(moduleId);
        if (!mod) continue;
        for (const [commandId, combo] of Object.entries(cmds || {})) {
          if (!combo || !matchesCombo(event, combo, platform)) continue;
          // Modifier-bearing combos are unambiguous even mid-typing; bare combos are not.
          if (isEditableTarget(event.target) && !combo.mod && !combo.alt) continue;

          if (mod.snoozable && commandId === SNOOZE_COMMAND_ID) {
            if (desiredEnabled[moduleId] && lastFound === true && lastContext?.baseUrl) {
              event.preventDefault();
              toggleSnooze(moduleId);
              return;
            }
            continue;
          }

          if (activeModules.has(moduleId) && typeof mod.onAction === 'function') {
            event.preventDefault();
            try {
              mod.onAction(commandId, lastContext);
            } catch (e) {
              console.warn('[cplace] shortcut action failed:', moduleId, commandId, e);
            }
            return;
          }
        }
      }
    }
    // Deduplicate registration so a re-injected content script (or a fresh
    // main() in tests) never leaves a stale listener bound to old state.
    if (window.__cplaceShortcutKeydown) {
      document.removeEventListener('keydown', window.__cplaceShortcutKeydown, true);
    }
    window.__cplaceShortcutKeydown = handleShortcutKeydown;
    document.addEventListener('keydown', handleShortcutKeydown, true);

    moduleShortcutsItem.watch((newValue) => {
      moduleShortcuts = newValue || {};
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
