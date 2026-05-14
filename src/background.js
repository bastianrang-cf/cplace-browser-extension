importScripts('modules/registry.js', 'modules/admin-access-highlight.js');

const STORAGE_KEY = 'enabledModules';

const COLOR_ICON = {
  16: 'icons/color-16.png',
  32: 'icons/color-32.png',
  48: 'icons/color-48.png',
  128: 'icons/color-128.png',
};
const GRAY_ICON = {
  16: 'icons/gray-16.png',
  32: 'icons/gray-32.png',
  48: 'icons/gray-48.png',
  128: 'icons/gray-128.png',
};

chrome.runtime.onInstalled.addListener(async () => {
  const defaults = globalThis.__cplaceRegistry.defaultEnabledMap();
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const current = stored[STORAGE_KEY] || {};
  let changed = false;
  for (const [id, def] of Object.entries(defaults)) {
    if (!(id in current)) {
      current[id] = def;
      changed = true;
    }
  }
  if (changed) await chrome.storage.local.set({ [STORAGE_KEY]: current });
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg) return;

  if (msg.type === 'cplace:status' && sender.tab && sender.tab.id != null) {
    chrome.action.setIcon({
      tabId: sender.tab.id,
      path: msg.found ? COLOR_ICON : GRAY_ICON,
    });
    return;
  }

  if (msg.type === 'cplace:moduleToggle') {
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id == null) continue;
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    });
  }
});
