import { registry } from '../../features/registry.js';
import { enabledModulesItem } from '../../features/storage.js';

async function init() {
  const enabledMap = await enabledModulesItem.getValue();

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
    if (action.icon) {
      const isImageIcon = /\.(svg|png)$/i.test(action.icon);
      const iconEl = isImageIcon
        ? Object.assign(document.createElement('img'), {
            src: browser.runtime.getURL(`${moduleId}-${action.icon}`),
            alt: '',
            className: 'btn-icon',
          })
        : Object.assign(document.createElement('span'), {
            textContent: action.icon,
            className: 'btn-icon',
          });
      if (!isImageIcon) iconEl.setAttribute('aria-hidden', 'true');
      btn.appendChild(iconEl);
    }
    const labelEl = document.createElement('span');
    labelEl.textContent = action.label;
    btn.appendChild(labelEl);
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
