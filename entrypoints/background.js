import { defineBackground } from 'wxt/utils/define-background';
import { registry } from '../modules/registry.js';

const STORAGE_KEY = 'enabledModules';

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
      if (msg.found) {
        browser.action.enable(tabId);
        browser.action.setPopup({ tabId, popup: 'popup.html' });
      } else {
        browser.action.disable(tabId);
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
