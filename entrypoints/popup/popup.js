import { registry } from '../../modules/registry.js';

const STORAGE_KEY = 'enabledModules';

async function init() {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const enabledMap = stored[STORAGE_KEY] || {};

  const actionItems = [];
  for (const mod of registry.all()) {
    if (!enabledMap[mod.id] || !mod.actions?.length) continue;
    for (const action of mod.actions) {
      actionItems.push({ moduleId: mod.id, action });
    }
  }

  const container = document.getElementById('actions');
  if (actionItems.length === 0) {
    const msg = document.createElement('p');
    msg.id = 'no-actions';
    msg.textContent = 'No actions available.';
    container.appendChild(msg);
    return;
  }

  for (const { moduleId, action } of actionItems) {
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.addEventListener('click', async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id != null) {
        browser.tabs
          .sendMessage(tab.id, { type: 'cplace:moduleAction', moduleId, actionId: action.id })
          .catch(() => {});
      }
      window.close();
    });
    container.appendChild(btn);
  }
}

init();
