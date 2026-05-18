import { defineBackground } from 'wxt/utils/define-background';
import { registry } from '../features/registry.js';

const STORAGE_KEY = 'enabledModules';
const OPTIONS_KEY = 'moduleOptions';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    const stored = await browser.storage.local.get([STORAGE_KEY, OPTIONS_KEY]);

    const enabledDefaults = registry.defaultEnabledMap();
    const currentEnabled = stored[STORAGE_KEY] || {};
    let enabledChanged = false;
    for (const [id, def] of Object.entries(enabledDefaults)) {
      if (!(id in currentEnabled)) {
        currentEnabled[id] = def;
        enabledChanged = true;
      }
    }
    if (enabledChanged) await browser.storage.local.set({ [STORAGE_KEY]: currentEnabled });

    const optionDefaults = registry.defaultOptionsMap();
    const currentOptions = stored[OPTIONS_KEY] || {};
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
    if (optionsChanged) await browser.storage.local.set({ [OPTIONS_KEY]: currentOptions });
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

    if (msg.type === 'cplace:moduleToggle' || msg.type === 'cplace:moduleOptions') {
      browser.tabs.query({}).then((tabs) => {
        for (const tab of tabs) {
          if (tab.id == null) continue;
          browser.tabs.sendMessage(tab.id, msg).catch(() => {});
        }
      });
    }
  });
});
