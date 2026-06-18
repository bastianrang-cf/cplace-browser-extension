import { moduleShortcutsItem } from '../storage.js';
import { createShortcutRecorder } from '../shortcut-recorder.js';
import { combosEqual, detectPlatform } from '../shortcuts.js';

const navLinks = [
  { label: 'All Workspaces',     path: '/space/allSpaces' },
  { label: 'All Packages',       path: '/solutionmanagement/viewAll' },
  { label: 'Batch Jobs',         path: '/batchJob/jobs' },
  { label: 'Low-Code Dashboard', path: '/cplacejsAdmin/cplaceJSDashboard' },
  { label: 'Low-Code Logs',      path: '/cplacejsAdmin/cplaceJSLogs' },
  { label: 'API Tokens',         path: '/cf/cplace/apiToken/handler/viewAll' },
  { label: 'AI Settings',        path: '/application/viewAiSettings' },
  { label: 'Deleted Items',      path: '/restorable/trashCanPages' },
  { label: 'Activity Stream',    path: '/awareness/recentChanges' },
  { label: 'My Drafts',          path: '/draft/myDrafts' },
];

const MODULE_ID = 'nav-links';

// A custom link path must be a relative, same-origin path beginning with a
// single "/". Reject protocol-relative ("//host"), backslash tricks, and
// embedded absolute URLs so a stored path can never redirect off-origin once
// concatenated onto the tenant baseUrl.
export function isValidNavPath(path) {
  if (typeof path !== 'string') return false;
  const p = path.trim();
  if (p.length < 1) return false;
  if (!p.startsWith('/')) return false;
  if (p.startsWith('//')) return false;
  if (p.includes('\\')) return false;
  if (p.includes('://')) return false;
  return true;
}

// Normalize stored custom links: trim, keep only valid relative paths, label
// falls back to the path, and dedupe against built-ins and each other.
export function sanitizeCustomLinks(customLinks, builtins = navLinks) {
  const seen = new Set(builtins.map((l) => l.path));
  const out = [];
  for (const item of Array.isArray(customLinks) ? customLinks : []) {
    if (!item) continue;
    const path = typeof item.path === 'string' ? item.path.trim() : '';
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (!isValidNavPath(path) || seen.has(path)) continue;
    seen.add(path);
    out.push({ label: label || path, path });
  }
  return out;
}

// Built-in + custom links, minus the disabled set, validated and deduped.
// Used by the popup to render the Navigation accordion.
export function resolveLinks(options = {}) {
  const disabled = new Set(Array.isArray(options.disabledPaths) ? options.disabledPaths : []);
  const custom = sanitizeCustomLinks(options.customLinks);
  return [...navLinks, ...custom].filter((l) => !disabled.has(l.path));
}

// Keyboard-shortcut dispatch target. The shared content-script listener calls
// onAction(commandId, context) for active modules; here the command id is a
// link path, so pressing a bound shortcut opens baseUrl + path in a new tab —
// identical to clicking the link in the popup. Content scripts can't use
// browser.tabs.create, so this uses a user-gesture window.open.
function onAction(path, context) {
  if (!isValidNavPath(path)) return;
  const baseUrl = context?.baseUrl;
  if (!baseUrl) return;
  try {
    window.open(baseUrl + path.trim(), '_blank', 'noopener,noreferrer');
  } catch (_) {
    // popup blocked or no window — nothing to recover
  }
}

function renderOptions(container, ctx) {
  container.textContent = '';
  container.classList.add('nav-links-editor');

  const platform = detectPlatform();
  const initial = ctx.getOptions() || {};
  const disabled = new Set(Array.isArray(initial.disabledPaths) ? initial.disabledPaths : []);
  const custom = sanitizeCustomLinks(initial.customLinks);

  // Per-link shortcuts live in the shared moduleShortcutsItem (keyed nav-links →
  // path → combo) so they reuse the content-script listener and the Options
  // page's cross-module duplicate detection. shortcuts/allShortcuts are loaded
  // asynchronously; recorders show "Set shortcut" until the store resolves.
  let allShortcuts = {};
  let shortcuts = {};
  let refreshers = [];

  function persistOptions() {
    ctx.setOptions({
      disabledPaths: Array.from(disabled),
      customLinks: custom.map((l) => ({ label: l.label, path: l.path })),
    });
  }

  async function writeShortcuts(mutate) {
    const all = (await moduleShortcutsItem.getValue()) || {};
    const cmds = { ...(all[MODULE_ID] || {}) };
    mutate(cmds);
    if (Object.keys(cmds).length) all[MODULE_ID] = cmds;
    else delete all[MODULE_ID];
    await moduleShortcutsItem.setValue(all);
    allShortcuts = all;
    shortcuts = all[MODULE_ID] || {};
  }

  function saveShortcut(path, combo) {
    return writeShortcuts((cmds) => {
      if (combo) cmds[path] = combo;
      else delete cmds[path];
    });
  }

  function rekeyShortcut(oldPath, newPath) {
    if (oldPath === newPath) return Promise.resolve();
    return writeShortcuts((cmds) => {
      if (cmds[oldPath]) {
        cmds[newPath] = cmds[oldPath];
        delete cmds[oldPath];
      }
    });
  }

  function labelForPath(path) {
    const found = [...navLinks, ...custom].find((l) => l.path === path);
    return found ? found.label : path;
  }

  function findConflict(currentPath, combo) {
    for (const [mId, cmds] of Object.entries(allShortcuts)) {
      for (const [cId, c] of Object.entries(cmds || {})) {
        if (mId === MODULE_ID && cId === currentPath) continue;
        if (combosEqual(c, combo)) {
          return mId === MODULE_ID
            ? `Also bound to “${labelForPath(cId)}”.`
            : 'Already bound to another module’s shortcut.';
        }
      }
    }
    return null;
  }

  function refreshRecorders() {
    for (const r of refreshers) r();
  }

  function buildShortcutControls(getPath) {
    const wrap = document.createElement('div');
    wrap.className = 'nav-links-shortcut';
    const { recorder, clearBtn, warning, refresh } = createShortcutRecorder({
      platform,
      getCombo: () => shortcuts[getPath()] || null,
      onSave: (combo) => saveShortcut(getPath(), combo),
      findConflict: (combo) => findConflict(getPath(), combo),
    });
    wrap.append(recorder, clearBtn);
    refreshers.push(refresh);
    return { wrap, warning };
  }

  function buildBuiltinRow(link) {
    const row = document.createElement('div');
    row.className = 'nav-links-row';

    const label = document.createElement('span');
    label.className = 'nav-links-label';
    label.textContent = link.label;

    const { wrap: shortcut, warning } = buildShortcutControls(() => link.path);

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'nav-links-toggle';
    toggle.checked = !disabled.has(link.path);
    toggle.setAttribute('aria-label', `Show ${link.label}`);
    toggle.addEventListener('change', () => {
      if (toggle.checked) disabled.delete(link.path);
      else disabled.add(link.path);
      persistOptions();
    });

    row.append(label, shortcut, toggle, warning);
    return row;
  }

  function buildCustomRow(link) {
    const row = document.createElement('div');
    row.className = 'nav-links-row nav-links-row--custom';

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'nav-links-label-input';
    labelInput.value = link.label;
    labelInput.placeholder = 'Label';
    labelInput.addEventListener('change', () => {
      link.label = labelInput.value.trim() || link.path;
      labelInput.value = link.label;
      persistOptions();
    });

    const pathInput = document.createElement('input');
    pathInput.type = 'text';
    pathInput.className = 'nav-links-path-input';
    pathInput.value = link.path;
    pathInput.placeholder = '/path/to/page';

    const error = document.createElement('p');
    error.className = 'nav-links-error';
    error.hidden = true;

    pathInput.addEventListener('change', () => {
      const next = pathInput.value.trim();
      if (next === link.path) return;
      const duplicate = [...navLinks, ...custom].some((l) => l !== link && l.path === next);
      if (!isValidNavPath(next) || duplicate) {
        error.hidden = false;
        error.textContent = !isValidNavPath(next)
          ? 'Path must be a relative path beginning with “/”.'
          : 'That path is already used.';
        pathInput.setAttribute('aria-invalid', 'true');
        pathInput.value = link.path;
        return;
      }
      error.hidden = true;
      pathInput.removeAttribute('aria-invalid');
      const oldPath = link.path;
      link.path = next;
      if (disabled.has(oldPath)) {
        disabled.delete(oldPath);
        disabled.add(next);
      }
      persistOptions();
      rekeyShortcut(oldPath, next).then(refreshRecorders);
    });

    const { wrap: shortcut, warning } = buildShortcutControls(() => link.path);

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'nav-links-toggle';
    toggle.checked = !disabled.has(link.path);
    toggle.setAttribute('aria-label', 'Show this link');
    toggle.addEventListener('change', () => {
      if (toggle.checked) disabled.delete(link.path);
      else disabled.add(link.path);
      persistOptions();
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'nav-links-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      const idx = custom.indexOf(link);
      if (idx >= 0) custom.splice(idx, 1);
      disabled.delete(link.path);
      persistOptions();
      saveShortcut(link.path, null).then(render);
    });

    row.append(labelInput, pathInput, shortcut, toggle, removeBtn, warning, error);
    return row;
  }

  function buildAddForm() {
    const form = document.createElement('div');
    form.className = 'nav-links-add';

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'nav-links-add-label';
    labelInput.placeholder = 'Label';

    const pathInput = document.createElement('input');
    pathInput.type = 'text';
    pathInput.className = 'nav-links-add-path';
    pathInput.placeholder = '/path/to/page';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'nav-links-add-btn';
    addBtn.textContent = 'Add link';

    const error = document.createElement('p');
    error.className = 'nav-links-error';
    error.hidden = true;

    function tryAdd() {
      const path = pathInput.value.trim();
      const label = labelInput.value.trim();
      if (!isValidNavPath(path)) {
        error.hidden = false;
        error.textContent = 'Path must be a relative path beginning with “/”.';
        return;
      }
      if ([...navLinks, ...custom].some((l) => l.path === path)) {
        error.hidden = false;
        error.textContent = 'That path is already used.';
        return;
      }
      custom.push({ label: label || path, path });
      persistOptions();
      labelInput.value = '';
      pathInput.value = '';
      error.hidden = true;
      render();
    }

    addBtn.addEventListener('click', tryAdd);
    for (const input of [labelInput, pathInput]) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          tryAdd();
        }
      });
    }

    form.append(labelInput, pathInput, addBtn, error);
    return form;
  }

  function render() {
    container.textContent = '';
    refreshers = [];

    const hint = document.createElement('p');
    hint.className = 'nav-links-hint';
    hint.textContent =
      'Choose which links appear in the popup’s Navigation menu, add your own, and bind a keyboard shortcut to open any link directly on a cplace page.';
    container.appendChild(hint);

    for (const link of navLinks) container.appendChild(buildBuiltinRow(link));

    if (custom.length) {
      const sub = document.createElement('h4');
      sub.className = 'nav-links-subhead';
      sub.textContent = 'Custom links';
      container.appendChild(sub);
      for (const link of custom) container.appendChild(buildCustomRow(link));
    }

    container.appendChild(buildAddForm());
    refreshRecorders();
  }

  render();

  moduleShortcutsItem
    .getValue()
    .then((all) => {
      allShortcuts = all || {};
      shortcuts = allShortcuts[MODULE_ID] || {};
      refreshRecorders();
    })
    .catch(() => {});
}

export { navLinks };

export default {
  id: MODULE_ID,
  name: 'Navigation Links',
  description: 'Adds a Navigation button to the popup with quick links to common cplace pages.',
  defaultEnabled: true,
  defaultOptions: { disabledPaths: [], customLinks: [] },
  navLinks,
  resolveLinks,
  onAction,
  renderOptions,
};
