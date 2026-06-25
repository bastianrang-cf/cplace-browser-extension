import { registry } from '../../features/registry.js';
import { enabledModulesItem, moduleOptionsItem, moduleSnoozeItem, tabBaseUrlItem } from '../../features/storage.js';
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

// Tracks every group's close fn so opening one collapses the others (single-open
// invariant) — keeps at most one flyout on screen at a time.
const navGroupClosers = [];

// Grace period before a flyout closes after the cursor leaves it. The flyout sits
// flush to the toggle's right edge (no dead zone), and this delay covers diagonal
// cursor moves toward it — together they approximate a native menu's "safe triangle".
const NAV_GROUP_CLOSE_DELAY_MS = 200;

// Builds a shared menu group: a header toggle (icon + label + chevron) and a
// flyout panel that cascades to the right on hover/focus (no click needed), like a
// native context-menu submenu. The flyout is taken out of normal flow, so opening
// or closing it never reflows the rail — sibling items never jump under the cursor.
// Keeps the Snooze and Nav-Links submenus visually and behaviourally identical.
function createNavGroup({ icon, label }) {
  const group = document.createElement('div');
  group.className = 'nav-group';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'nav-group__toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-haspopup', 'menu');

  const iconEl = document.createElement('span');
  iconEl.className = 'btn-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.textContent = icon;

  const labelEl = document.createElement('span');
  labelEl.textContent = label;

  const chevron = document.createElement('span');
  chevron.className = 'nav-group__chevron';
  chevron.setAttribute('aria-hidden', 'true');

  toggle.append(iconEl, labelEl, chevron);

  const list = document.createElement('div');
  list.className = 'nav-group__list nav-group__flyout';
  list.setAttribute('role', 'menu');

  const setOpen = (open) => {
    group.classList.toggle('nav-group--open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  navGroupClosers.push(() => setOpen(false));

  let closeTimer = null;
  const cancelClose = () => {
    if (closeTimer != null) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  };
  const open = () => {
    cancelClose();
    for (const close of navGroupClosers) close();
    setOpen(true);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer = setTimeout(() => {
      closeTimer = null;
      setOpen(false);
    }, NAV_GROUP_CLOSE_DELAY_MS);
  };
  group.addEventListener('mouseenter', open);
  group.addEventListener('mouseleave', scheduleClose);
  group.addEventListener('focusin', open);
  group.addEventListener('focusout', scheduleClose);

  group.append(toggle, list);
  return { group, list };
}

// Renders the "Snooze" accordion: a tri-state toggle (off → snooze → soft-deactivate)
// per enabled snoozable module, plus a leading "Snooze all" row when more than one
// module is snoozable. Writes are keyed by tenant baseUrl and broadcast to every tab.
function renderSnoozeMenu(container, baseUrl, snoozableMods) {
  const { group, list } = createNavGroup({ icon: '💤', label: 'Snooze' });

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

  container.appendChild(group);
  refresh();
}

async function init() {
  const container = document.getElementById('actions');

  if (!(await hasUniversalHostAccess())) {
    renderActivationGate(container);
    return;
  }

  // The background binds the active cplace tab's id into this popup's URL (popup.html?tabId=…)
  // at detection time and stores that tab's detected baseUrl in session storage. Reading from
  // these avoids querying the active tab — which returns the wrong/no tab in Arc's popup
  // window context. baseUrl is read from storage (not the URL), so it never flows from
  // location.search into a navigation target.
  const tabIdParam = new URLSearchParams(location.search).get('tabId');
  const tabId = tabIdParam != null ? Number(tabIdParam) : null;

  const [storedMap, optsMap, tabBaseUrls] = await Promise.all([
    enabledModulesItem.getValue(),
    moduleOptionsItem.getValue(),
    tabBaseUrlItem.getValue(),
  ]);
  const baseUrl = (tabId != null ? tabBaseUrls[tabId] : null) ?? null;
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
    if (mod.navLinks?.length || typeof mod.resolveLinks === 'function') {
      const opts = optsMap?.[mod.id] || {};
      const visible = typeof mod.resolveLinks === 'function'
        ? mod.resolveLinks(opts)
        : mod.navLinks.filter((l) => !new Set(opts.disabledPaths || []).has(l.path));
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
      if (tabId != null) {
        browser.tabs
          .sendMessage(tabId, { type: 'cplace:moduleAction', moduleId, actionId: action.id })
          .catch(() => {});
      }
      window.close();
    });
    container.appendChild(btn);
  }

  // Module entries first: per-module navigation-link accordions.
  for (const { mod, links } of navLinksMods) {
    if (!baseUrl) continue;

    const { group, list } = createNavGroup({ icon: '🧭', label: mod.name });

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

    container.appendChild(group);
  }

  // Snooze last, set apart by a divider from the module entries above it.
  if (showSnooze) {
    if (container.childElementCount > 0) {
      const divider = document.createElement('div');
      divider.className = 'popup-divider';
      container.appendChild(divider);
    }
    renderSnoozeMenu(container, baseUrl, snoozableMods);
  }
}

init();
