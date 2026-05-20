import { registry } from '../../features/registry.js';
import { enabledModulesItem, moduleOptionsItem } from '../../features/storage.js';
import { hasUniversalHostAccess, requestUniversalHostAccess } from '../../features/permissions.js';

function renderActivationGate(container) {
  const wrap = document.createElement('div');
  wrap.id = 'activation-gate';

  const msg = document.createElement('p');
  msg.className = 'gate-msg';
  msg.textContent = 'Activate the extension to detect cplace on this and other pages.';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gate-btn';
  btn.textContent = 'Enable on all pages';
  btn.addEventListener('click', async () => {
    const accepted = await requestUniversalHostAccess();
    if (accepted) window.close();
  });

  wrap.appendChild(msg);
  wrap.appendChild(btn);
  container.appendChild(wrap);
}

async function init() {
  const container = document.getElementById('actions');

  if (!(await hasUniversalHostAccess())) {
    renderActivationGate(container);
    return;
  }

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  let baseUrl = null;
  if (tab?.id != null) {
    const baseInfo = await browser.tabs
      .sendMessage(tab.id, { type: 'cplace:getBaseUrl' })
      .catch(() => null);
    baseUrl = baseInfo?.baseUrl ?? null;
  }

  const [storedMap, optsMap] = await Promise.all([
    enabledModulesItem.getValue(),
    moduleOptionsItem.getValue(),
  ]);
  const enabledMap = { ...registry.defaultEnabledMap(), ...(storedMap || {}) };

  const actionItems = [];
  const navLinksMods = [];
  for (const mod of registry.all()) {
    if (!enabledMap[mod.id]) continue;
    if (mod.actions?.length) {
      for (const action of mod.actions) {
        actionItems.push({ moduleId: mod.id, action });
      }
    }
    if (mod.navLinks?.length) {
      const disabled = new Set(optsMap?.[mod.id]?.disabledPaths || []);
      const visible = mod.navLinks.filter((l) => !disabled.has(l.path));
      if (visible.length) navLinksMods.push({ mod, links: visible });
    }
  }

  const hasContent = actionItems.length > 0 || (navLinksMods.length > 0 && baseUrl != null);
  if (!hasContent) {
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
    btn.addEventListener('click', () => {
      if (tab?.id != null) {
        browser.tabs
          .sendMessage(tab.id, { type: 'cplace:moduleAction', moduleId, actionId: action.id })
          .catch(() => {});
      }
      window.close();
    });
    container.appendChild(btn);
  }

  for (const { mod, links } of navLinksMods) {
    if (!baseUrl) continue;

    const group = document.createElement('div');
    group.className = 'nav-group';

    const toggle = document.createElement('button');
    toggle.className = 'nav-group__toggle';
    toggle.setAttribute('aria-expanded', 'false');

    const iconEl = document.createElement('span');
    iconEl.textContent = '🧭';
    iconEl.className = 'btn-icon';
    iconEl.setAttribute('aria-hidden', 'true');

    const labelEl = document.createElement('span');
    labelEl.textContent = mod.name;

    const chevron = document.createElement('span');
    chevron.className = 'nav-group__chevron';
    chevron.setAttribute('aria-hidden', 'true');

    toggle.appendChild(iconEl);
    toggle.appendChild(labelEl);
    toggle.appendChild(chevron);

    const list = document.createElement('div');
    list.className = 'nav-group__list';
    list.hidden = true;

    for (const { label, path } of links) {
      const a = document.createElement('a');
      a.href = baseUrl + path;
      a.textContent = label;
      a.className = 'nav-group__link';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        browser.tabs.create({ url: baseUrl + path });
        window.close();
      });
      list.appendChild(a);
    }

    toggle.addEventListener('click', () => {
      const expanded = list.hidden;
      list.hidden = !expanded;
      toggle.setAttribute('aria-expanded', String(expanded));
      group.classList.toggle('nav-group--open', expanded);
    });

    group.appendChild(toggle);
    group.appendChild(list);
    container.appendChild(group);
  }
}

init();
