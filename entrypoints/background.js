import { defineBackground } from 'wxt/utils/define-background';
import { registry } from '../modules/registry.js';

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

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    const defaults = registry.defaultEnabledMap();
    const stored = await browser.storage.local.get(STORAGE_KEY);
    const current = stored[STORAGE_KEY] || {};
    let changed = false;
    for (const [id, def] of Object.entries(defaults)) {
      if (!(id in current)) {
        current[id] = def;
        changed = true;
      }
    }
    if (changed) await browser.storage.local.set({ [STORAGE_KEY]: current });
  });

  browser.runtime.onMessage.addListener((msg, sender) => {
    if (!msg) return;

    if (msg.type === 'cplace:status' && sender.tab && sender.tab.id != null) {
      const tabId = sender.tab.id;
      browser.action.setIcon({ tabId, path: msg.found ? COLOR_ICON : GRAY_ICON });
      browser.action.setPopup({ tabId, popup: msg.found ? 'popup.html' : '' });
      if (!msg.found) {
        browser.action.setTitle({ tabId, title: 'cplace' });
        browser.action.setBadgeText({ tabId, text: '' });
      }
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

    if (msg.type === 'cplace:moduleToggle') {
      browser.tabs.query({}).then((tabs) => {
        for (const tab of tabs) {
          if (tab.id == null) continue;
          browser.tabs.sendMessage(tab.id, msg).catch(() => {});
        }
      });
    }
  });
});
