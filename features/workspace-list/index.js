import { detectPlatform } from '../shortcuts.js';
import {
  normalizeNavModifiers,
  modifierGlyph,
  openTarget,
  resolveNavTarget,
  renderNavModifierOptions,
} from '../nav-modifiers.js';

const DIALOG_ID = 'cplace-workspace-list-dialog';

let active = false;
let currentContext = null;
let currentOptions = normalizeNavModifiers({});
let onResult = null;
let onKey = null;
let workspaces = null; // null = loading, [] = loaded-empty
let filtered = [];
let selectedIndex = 0;
let currentUidHint = null;

// The root-page URL is returned as-is by the allSpaces endpoint / dropdown
// scrape (page.js already resolves it to an absolute URL).
export function rootUrl(item) {
  return item.url;
}

export function typesUrl(baseUrl, item) {
  return `${baseUrl}/typeDefinition/listAllTypes?spaceId=${encodeURIComponent(item.uid)}`;
}

export function matchesQuery(item, q) {
  return (item.name || '').toLowerCase().includes(q);
}

function closeDialog() {
  document.getElementById(DIALOG_ID)?.remove();
}

function navigate(item, { secondary, newTab }) {
  const baseUrl = currentContext?.baseUrl;
  if (!baseUrl) return;
  const url = secondary ? typesUrl(baseUrl, item) : rootUrl(item);
  closeDialog();
  openTarget(url, newTab);
}

function updateSelection(listEl) {
  listEl.querySelectorAll('.cplace-wl-item').forEach((el, i) => {
    el.classList.toggle('sel', i === selectedIndex);
    if (i === selectedIndex) el.scrollIntoView({ block: 'nearest' });
  });
}

function renderList(listEl, query, error) {
  listEl.innerHTML = '';

  if (workspaces === null) {
    listEl.innerHTML = '<div class="cplace-wl-msg">Loading workspaces…</div>';
    return;
  }

  if (error) {
    const msg = document.createElement('div');
    msg.className = 'cplace-wl-msg cplace-wl-error';
    msg.textContent = error;
    listEl.appendChild(msg);
    return;
  }

  const q = query.trim().toLowerCase();
  filtered = (q ? workspaces.filter((w) => matchesQuery(w, q)) : [...workspaces]).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  if (!filtered.length) {
    listEl.innerHTML = '<div class="cplace-wl-msg">No workspaces found</div>';
    return;
  }

  if (!q && currentUidHint) {
    const idx = filtered.findIndex((w) => w.uid === currentUidHint);
    selectedIndex = idx >= 0 ? idx : 0;
  } else if (selectedIndex >= filtered.length) {
    selectedIndex = 0;
  }

  filtered.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'cplace-wl-item' + (idx === selectedIndex ? ' sel' : '');
    row.addEventListener('mouseenter', () => {
      selectedIndex = idx;
      updateSelection(listEl);
    });
    row.addEventListener('click', (e) => navigate(item, resolveNavTarget(e, currentOptions)));

    const name = document.createElement('div');
    name.className = 'cplace-wl-name';
    name.textContent = item.name;

    row.append(name);
    listEl.appendChild(row);
  });

  updateSelection(listEl);
}

function showDialog() {
  closeDialog();

  const dialog = document.createElement('div');
  dialog.id = DIALOG_ID;

  const backdrop = document.createElement('div');
  backdrop.className = 'cplace-wl-backdrop';
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeDialog();
  });

  const panel = document.createElement('div');
  panel.className = 'cplace-wl-panel';
  panel.addEventListener('click', (e) => e.stopPropagation());

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cplace-wl-input';
  input.placeholder = 'Search workspaces…';
  input.autocomplete = 'off';
  input.spellcheck = false;

  const list = document.createElement('div');
  list.className = 'cplace-wl-list';

  const platform = detectPlatform();
  const typesGlyph = modifierGlyph(currentOptions.secondaryModifier, platform);
  const newTabGlyph = modifierGlyph(currentOptions.newTabModifier, platform);
  const foot = document.createElement('div');
  foot.className = 'cplace-wl-foot';
  foot.innerHTML =
    '<span><kbd>↑↓</kbd> navigate</span><span><kbd>↵</kbd> root page</span>' +
    `<span><kbd>${typesGlyph}</kbd><kbd>↵</kbd> types page</span>` +
    `<span><kbd>${newTabGlyph}</kbd><kbd>↵</kbd> new tab</span><span><kbd>Esc</kbd> close</span>`;

  panel.append(input, list, foot);
  backdrop.appendChild(panel);
  dialog.appendChild(backdrop);
  document.body.appendChild(dialog);

  selectedIndex = 0;
  renderList(list, '');
  requestAnimationFrame(() => input.focus());

  input.addEventListener('input', () => {
    selectedIndex = 0;
    renderList(list, input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
      updateSelection(list);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateSelection(list);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) navigate(filtered[selectedIndex], resolveNavTarget(e, currentOptions));
    }
  });
}

export default {
  id: 'workspace-list',
  name: 'Workspace List',
  description:
    'Adds a "Workspace List" popup action (with keyboard shortcut) that opens a searchable dialog of every workspace in the current cplace tenant — press Enter for the workspace\'s root page, hold the configured modifier for its Datamodel/Types page, or the new-tab modifier (default Shift) to open in a new tab.',
  defaultEnabled: false,
  css: true,
  pageScript: true,
  actions: [{ id: 'show-workspace-list', label: 'Workspace List', icon: '🏢' }],
  defaultOptions: { secondaryModifier: 'alt', newTabModifier: 'shift' },
  renderOptions(container, ctx) {
    renderNavModifierOptions(container, ctx, {
      secondaryLabel: 'Modifier for the Datamodel/Types page',
      newTabLabel: 'Modifier to open in a new browser tab',
    });
  },
  apply(options = {}, context = null) {
    currentContext = context;
    currentOptions = normalizeNavModifiers(options);
    if (active) return;
    active = true;
    onResult = (event) => {
      const { workspaces: result, error, currentUid } = event.detail || {};
      workspaces = error ? [] : (result || []);
      currentUidHint = currentUid ?? null;
      const dialog = document.getElementById(DIALOG_ID);
      if (!dialog) return;
      const listEl = dialog.querySelector('.cplace-wl-list');
      const inputEl = dialog.querySelector('.cplace-wl-input');
      if (listEl) renderList(listEl, inputEl?.value || '', error || null);
    };
    onKey = (e) => {
      if (e.key === 'Escape') closeDialog();
    };
    document.addEventListener('cplace:workspaceListResult', onResult);
    document.addEventListener('keydown', onKey);
  },
  revert() {
    if (onResult) document.removeEventListener('cplace:workspaceListResult', onResult);
    if (onKey) document.removeEventListener('keydown', onKey);
    onResult = null;
    onKey = null;
    active = false;
    currentContext = null;
    currentOptions = normalizeNavModifiers({});
    workspaces = null;
    filtered = [];
    selectedIndex = 0;
    currentUidHint = null;
    closeDialog();
  },
  onVersionDetected(context) {
    currentContext = context;
  },
  onAction(actionId) {
    if (actionId !== 'show-workspace-list' || !active) return;
    workspaces = null;
    currentUidHint = null;
    showDialog();
    document.dispatchEvent(new CustomEvent('cplace:fetchWorkspaceList', {
      detail: { baseUrl: currentContext?.baseUrl ?? null },
    }));
  },
};
