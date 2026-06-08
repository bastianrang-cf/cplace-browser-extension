import { defineBackground } from '#imports';
import { registry } from '../features/registry.js';
import { enabledModulesItem, moduleOptionsItem, domainCssByTabItem } from '../features/storage.js';
import { hasUniversalHostAccess } from '../features/permissions.js';

const CONTENT_SCRIPT_ID = 'cplace-content';

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

    if (enabledChanged) await enabledModulesItem.setValue(currentEnabled);
    if (optionsChanged) await moduleOptionsItem.setValue(currentOptions);

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
        browser.action.enable(tabId);
        // Bind this tab's id into the popup URL so the popup can address the right tab
        // without tabs.query (unreliable in Arc). baseUrl is appended via cplace:context.
        browser.action.setPopup({ tabId, popup: `popup.html?tabId=${tabId}` });
      } else {
        browser.action.disable(tabId);
        browser.action.setTitle({ tabId, title: 'cplace' });
        browser.action.setBadgeText({ tabId, text: '' });
      }
      return;
    }

    if (msg.type === 'cplace:context' && sender.tab && sender.tab.id != null) {
      const tabId = sender.tab.id;
      // Carry the detected baseUrl in the per-tab popup URL; the popup renders its
      // navigation links and snooze controls straight from this value.
      let popup = `popup.html?tabId=${tabId}`;
      if (msg.baseUrl) popup += `&baseUrl=${encodeURIComponent(msg.baseUrl)}`;
      browser.action.setPopup({ tabId, popup });
      return;
    }

    if (msg.type === 'cplace:setBadge' && sender.tab && sender.tab.id != null) {
      const tabId = sender.tab.id;
      browser.action.setBadgeText({ tabId, text: msg.text || '' });
      if (msg.color && msg.text) browser.action.setBadgeBackgroundColor({ tabId, color: msg.color });
      if (msg.title) browser.action.setTitle({ tabId, title: msg.title });
      return;
    }

    if (msg.type === 'cplace:clearBadge' && sender.tab && sender.tab.id != null) {
      const tabId = sender.tab.id;
      browser.action.setBadgeText({ tabId, text: '' });
      browser.action.setTitle({ tabId, title: 'cplace' });
      return;
    }

    if (
      msg.type === 'cplace:moduleToggle' ||
      msg.type === 'cplace:moduleOptions' ||
      msg.type === 'cplace:moduleSnooze'
    ) {
      browser.tabs.query({}).then((tabs) => {
        for (const tab of tabs) {
          if (tab.id == null) continue;
          browser.tabs.sendMessage(tab.id, msg).catch(() => {});
        }
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

  async function applyDomainCss(tabId, css) {
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

  async function revertDomainCss(tabId) {
    const map = await domainCssByTabItem.getValue();
    const prev = map[tabId];
    if (!prev) return;
    try { await browser.scripting.removeCSS({ target: { tabId }, css: prev }); } catch (_) {}
    delete map[tabId];
    await domainCssByTabItem.setValue(map);
  }

  browser.tabs.onRemoved.addListener(async (tabId) => {
    const map = await domainCssByTabItem.getValue();
    if (tabId in map) {
      delete map[tabId];
      await domainCssByTabItem.setValue(map);
    }
  });
});
