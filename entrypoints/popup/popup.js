import { registry } from '../../features/registry.js';
import { enabledModulesItem, moduleOptionsItem, moduleSnoozeItem } from '../../features/storage.js';
import { hasUniversalHostAccess, requestUniversalHostAccess } from '../../features/permissions.js';
import { pruneSnooze, snoozeState, snoozeEntryFor } from '../../features/snooze.js';

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

const SNOOZE_STATE_META = {
  off: { icon: '🟢', text: 'Active' },
  snooze: { icon: '💤', text: 'Snoozed' },
  deactivate: { icon: '⛔', text: 'Off' },
};
const SNOOZE_NEXT_STATE = { off: 'snooze', snooze: 'deactivate', deactivate: 'off' };

function fmtUntilShort(until) {
  return new Date(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtUntilFull(until) {
  return new Date(until).toLocaleString();
}

function buildSnoozeRow(label, state, until, onClick) {
  const meta = SNOOZE_STATE_META[state];
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'snooze-row';

  const icon = document.createElement('span');
  icon.className = 'btn-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = meta.icon;

  const name = document.createElement('span');
  name.className = 'snooze-row__label';
  name.textContent = label;

  const status = document.createElement('span');
  status.className = 'snooze-row__state';
  if (state === 'snooze' && until != null) {
    status.textContent = `until ${fmtUntilShort(until)}`;
    btn.title = `Snoozed until ${fmtUntilFull(until)}`;
  } else {
    status.textContent = meta.text;
  }

  btn.append(icon, name, status);
  btn.addEventListener('click', onClick);
  return btn;
}

// Renders the "Snooze" accordion: a tri-state toggle (off → snooze → soft-deactivate)
// per enabled snoozable module, plus a leading "Snooze all" row when more than one
// module is snoozable. Writes are keyed by tenant baseUrl and broadcast to every tab.
function renderSnoozeMenu(container, baseUrl, snoozableMods) {
  const group = document.createElement('div');
  group.className = 'nav-group';

  const toggle = document.createElement('button');
  toggle.className = 'nav-group__toggle';
  toggle.setAttribute('aria-expanded', 'false');

  const iconEl = document.createElement('span');
  iconEl.textContent = '💤';
  iconEl.className = 'btn-icon';
  iconEl.setAttribute('aria-hidden', 'true');

  const labelEl = document.createElement('span');
  labelEl.textContent = 'Snooze';

  const chevron = document.createElement('span');
  chevron.className = 'nav-group__chevron';
  chevron.setAttribute('aria-hidden', 'true');

  toggle.append(iconEl, labelEl, chevron);

  const list = document.createElement('div');
  list.className = 'nav-group__list';
  list.hidden = true;

  toggle.addEventListener('click', () => {
    const expanded = list.hidden;
    list.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    group.classList.toggle('nav-group--open', expanded);
  });

  async function setState(moduleIds, state) {
    const map = pruneSnooze(await moduleSnoozeItem.getValue());
    const mods = { ...(map[baseUrl] || {}) };
    for (const id of moduleIds) {
      const entry = snoozeEntryFor(state);
      if (entry) mods[id] = entry;
      else delete mods[id];
    }
    if (Object.keys(mods).length) map[baseUrl] = mods;
    else delete map[baseUrl];
    await moduleSnoozeItem.setValue(map);
    browser.runtime.sendMessage({ type: 'cplace:moduleSnooze' }).catch(() => {});
  }

  async function refresh() {
    const map = pruneSnooze(await moduleSnoozeItem.getValue());
    const tenantMods = map[baseUrl] || {};
    list.textContent = '';

    const states = snoozableMods.map((m) => snoozeState(tenantMods[m.id]));

    if (snoozableMods.length >= 2) {
      const uniform = states.every((s) => s === states[0]) ? states[0] : 'off';
      let earliest = null;
      if (uniform === 'snooze') {
        earliest = Math.min(...snoozableMods.map((m) => tenantMods[m.id]?.until ?? Infinity));
      }
      const ids = snoozableMods.map((m) => m.id);
      list.appendChild(
        buildSnoozeRow('All modules', uniform, earliest, async () => {
          await setState(ids, SNOOZE_NEXT_STATE[uniform]);
          refresh();
        }),
      );
    }

    snoozableMods.forEach((mod, i) => {
      const state = states[i];
      const until = state === 'snooze' ? tenantMods[mod.id]?.until ?? null : null;
      list.appendChild(
        buildSnoozeRow(mod.name, state, until, async () => {
          await setState([mod.id], SNOOZE_NEXT_STATE[state]);
          refresh();
        }),
      );
    });
  }

  group.append(toggle, list);
  container.appendChild(group);
  refresh();
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
        const visible = typeof action.isVisible === 'function'
          ? await action.isVisible({ baseUrl }).catch(() => true)
          : true;
        if (!visible) continue;
        const dynamicLabel = typeof action.getLabel === 'function'
          ? await action.getLabel({ baseUrl }).catch(() => null)
          : null;
        actionItems.push({
          moduleId: mod.id,
          action: dynamicLabel ? { ...action, label: dynamicLabel } : action,
        });
      }
    }
    if (mod.navLinks?.length) {
      const disabled = new Set(optsMap?.[mod.id]?.disabledPaths || []);
      const visible = mod.navLinks.filter((l) => !disabled.has(l.path));
      if (visible.length) navLinksMods.push({ mod, links: visible });
    }
  }

  const snoozableMods = registry.all().filter((m) => m.snoozable && enabledMap[m.id]);
  const showSnooze = baseUrl != null && snoozableMods.length > 0;

  const hasContent =
    actionItems.length > 0 || showSnooze || (navLinksMods.length > 0 && baseUrl != null);
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

  if (showSnooze) {
    renderSnoozeMenu(container, baseUrl, snoozableMods);
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
