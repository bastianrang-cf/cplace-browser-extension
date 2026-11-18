import { defineBackground } from '#imports';
import { registry } from '../features/registry.js';
import { enabledModulesItem, moduleOptionsItem, moduleShortcutsItem, domainCssByTabItem, tabBaseUrlItem } from '../features/storage.js';
import { hasUniversalHostAccess } from '../features/permissions.js';

const CONTENT_SCRIPT_ID = 'cplace-content';

// Per-tab action calls reject with "No tab with id" when the tab closed before the
// message was handled. That's expected, so swallow it instead of surfacing an
// unhandled rejection in the service worker console.
function ignoreClosedTab(promise) {
  return promise?.catch?.(() => {});
}

// The session-storage maps below are read-modified-written across awaits. Run every
// such update through one queue so concurrent messages from different tabs can't
// overwrite each other's entries. The queue only orders in-flight work; nothing in it
// needs to survive a service-worker restart.
let sessionWriteQueue = Promise.resolve();
function serializeSessionWrite(fn) {
  const run = sessionWriteQueue.then(fn);
  sessionWriteQueue = run.catch(() => {});
  return run;
}

async function ensureContentScriptRegistration() {
  const granted = await hasUniversalHostAccess();
  const existing = await browser.scripting
    .getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] })
    .catch(() => []);
  const isRegistered = existing.some((cs) => cs.id === CONTENT_SCRIPT_ID);

  if (granted && !isRegistered) {
    await browser.scripting.registerContentScripts([
      {
        id: CONTENT_SCRIPT_ID,
        js: ['content-scripts/content.js'],
        matches: ['<all_urls>'],
        runAt: 'document_idle',
        allFrames: false,
      },
    ]);
  } else if (!granted && isRegistered) {
    await browser.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  }
}

export default defineBackground(() => {
  ensureContentScriptRegistration().catch((e) => {
    console.warn('[cplace] initial content-script registration failed:', e);
  });

  browser.permissions.onAdded.addListener(() => {
    ensureContentScriptRegistration().catch((e) => {
      console.warn('[cplace] content-script registration after grant failed:', e);
    });
  });
  browser.permissions.onRemoved.addListener(() => {
    ensureContentScriptRegistration().catch((e) => {
      console.warn('[cplace] content-script unregistration after revoke failed:', e);
    });
  });

  browser.runtime.onInstalled.addListener(async (details) => {
    const enabledDefaults = registry.defaultEnabledMap();
    const currentEnabled = await enabledModulesItem.getValue();
    let enabledChanged = false;
    for (const [id, def] of Object.entries(enabledDefaults)) {
      if (!(id in currentEnabled)) {
        currentEnabled[id] = def;
        enabledChanged = true;
      }
    }

    const optionDefaults = registry.defaultOptionsMap();
    const currentOptions = await moduleOptionsItem.getValue();
    let optionsChanged = false;
    for (const [id, defaults] of Object.entries(optionDefaults)) {
      if (!(id in currentOptions)) {
        currentOptions[id] = defaults;
        optionsChanged = true;
      } else {
        for (const [key, val] of Object.entries(defaults)) {
          if (!(key in currentOptions[id])) {
            currentOptions[id][key] = val;
            optionsChanged = true;
          }
        }
      }
    }

    if (details.reason === 'update') {
      if (currentEnabled['admin-access-highlight'] === true && currentEnabled['domain-css'] !== true) {
        currentEnabled['domain-css'] = true;
        enabledChanged = true;
      }
      if ('admin-access-highlight' in currentEnabled) {
        delete currentEnabled['admin-access-highlight'];
        enabledChanged = true;
      }
      if ('admin-access-highlight' in currentOptions) {
        delete currentOptions['admin-access-highlight'];
        optionsChanged = true;
      }
    }

    // Drop keyboard shortcuts bound to modules that no longer exist (e.g. a
    // module id was renamed or removed in an update), so stored bindings can't
    // accumulate indefinitely.
    const currentShortcuts = await moduleShortcutsItem.getValue();
    let shortcutsChanged = false;
    for (const id of Object.keys(currentShortcuts)) {
      if (!registry.byId(id)) {
        delete currentShortcuts[id];
        shortcutsChanged = true;
      }
    }

    if (enabledChanged) await enabledModulesItem.setValue(currentEnabled);
    if (optionsChanged) await moduleOptionsItem.setValue(currentOptions);
    if (shortcutsChanged) await moduleShortcutsItem.setValue(currentShortcuts);

    if (details.reason === 'install') {
      const granted = await hasUniversalHostAccess();
      if (!granted) {
        await browser.runtime.openOptionsPage().catch(() => {});
      }
    }
  });

  browser.runtime.onMessage.addListener((msg, sender) => {
    if (!msg) return;

    if (msg.type === 'cplace:status' && sender.tab && sender.tab.id != null) {
      const tabId = sender.tab.id;
      if (msg.found) {
        ignoreClosedTab(browser.action.enable(tabId));
        // Bind this tab's id into the popup URL so the popup can address the right tab
        // without tabs.query (unreliable in Arc). baseUrl is appended via cplace:context.
        ignoreClosedTab(browser.action.setPopup({ tabId, popup: `popup.html?tabId=${tabId}` }));
      } else {
        ignoreClosedTab(browser.action.disable(tabId));
        ignoreClosedTab(browser.action.setTitle({ tabId, title: 'cplace' }));
        ignoreClosedTab(browser.action.setBadgeText({ tabId, text: '' }));
      }
      return;
    }

    if (msg.type === 'cplace:context' && sender.tab && sender.tab.id != null) {
      // Stash the detected baseUrl in session storage keyed by tab id; the popup reads it
      // from there (not from its URL), so the value never reaches a navigation sink as
      // tainted input. The popup URL only carries the numeric tabId (set on cplace:status).
      setTabBaseUrl(sender.tab.id, msg.baseUrl || null).catch((e) => {
        console.warn('[cplace] tab baseUrl store failed:', e);
      });
      return;
    }

    if (msg.type === 'cplace:setBadge' && sender.tab && sender.tab.id != null) {
      const tabId = sender.tab.id;
      ignoreClosedTab(browser.action.setBadgeText({ tabId, text: msg.text || '' }));
      if (msg.color && msg.text) {
        ignoreClosedTab(browser.action.setBadgeBackgroundColor({ tabId, color: msg.color }));
      }
      if (msg.title) ignoreClosedTab(browser.action.setTitle({ tabId, title: msg.title }));
      return;
    }

    if (msg.type === 'cplace:clearBadge' && sender.tab && sender.tab.id != null) {
      const tabId = sender.tab.id;
      ignoreClosedTab(browser.action.setBadgeText({ tabId, text: '' }));
      ignoreClosedTab(browser.action.setTitle({ tabId, title: 'cplace' }));
      return;
    }

    if (
      msg.type === 'cplace:moduleToggle' ||
      msg.type === 'cplace:moduleOptions' ||
      msg.type === 'cplace:moduleSnooze'
    ) {
      broadcastToTabs(msg).catch((e) => {
        console.warn('[cplace] broadcast to tabs failed:', e);
      });
      return;
    }

    if (msg.type === 'cplace:domainCss:apply' && sender.tab?.id != null) {
      applyDomainCss(sender.tab.id, msg.css || '').catch((e) => {
        console.warn('[cplace] domain-css apply failed:', e);
      });
      return;
    }

    if (msg.type === 'cplace:domainCss:revert' && sender.tab?.id != null) {
      revertDomainCss(sender.tab.id).catch((e) => {
        console.warn('[cplace] domain-css revert failed:', e);
      });
      return;
    }
  });

  async function broadcastToTabs(msg) {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (tab.id == null) continue;
      browser.tabs.sendMessage(tab.id, msg).catch(() => {});
    }
  }

  function setTabBaseUrl(tabId, baseUrl) {
    return serializeSessionWrite(async () => {
      const map = await tabBaseUrlItem.getValue();
      if (baseUrl) map[tabId] = baseUrl;
      else delete map[tabId];
      await tabBaseUrlItem.setValue(map);
    });
  }

  function applyDomainCss(tabId, css) {
    return serializeSessionWrite(() => applyDomainCssNow(tabId, css));
  }

  async function applyDomainCssNow(tabId, css) {
    const map = await domainCssByTabItem.getValue();
    const prev = map[tabId];
    if (prev) {
      try { await browser.scripting.removeCSS({ target: { tabId }, css: prev }); } catch (_) {}
    }
    if (!css) {
      delete map[tabId];
      await domainCssByTabItem.setValue(map);
      return;
    }
    try {
      await browser.scripting.insertCSS({ target: { tabId }, css });
      map[tabId] = css;
    } catch (e) {
      console.warn('[cplace] insertCSS failed:', e);
      delete map[tabId];
    }
    await domainCssByTabItem.setValue(map);
  }

  function revertDomainCss(tabId) {
    return serializeSessionWrite(() => revertDomainCssNow(tabId));
  }

  async function revertDomainCssNow(tabId) {
    const map = await domainCssByTabItem.getValue();
    const prev = map[tabId];
    if (!prev) return;
    try { await browser.scripting.removeCSS({ target: { tabId }, css: prev }); } catch (_) {}
    delete map[tabId];
    await domainCssByTabItem.setValue(map);
  }

  browser.tabs.onRemoved.addListener((tabId) => {
    serializeSessionWrite(async () => {
      const cssMap = await domainCssByTabItem.getValue();
      if (tabId in cssMap) {
        delete cssMap[tabId];
        await domainCssByTabItem.setValue(cssMap);
      }
      const baseMap = await tabBaseUrlItem.getValue();
      if (tabId in baseMap) {
        delete baseMap[tabId];
        await tabBaseUrlItem.setValue(baseMap);
      }
    }).catch((e) => {
      console.warn('[cplace] tab cleanup failed:', e);
    });
  });
});
