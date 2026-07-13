import { detectPlatform } from '../shortcuts.js';
import {
  normalizeNavModifiers,
  modifierPressed,
  modifierGlyph,
  openTarget,
  renderNavModifierOptions,
} from '../nav-modifiers.js';

const DIALOG_ID = 'cplace-types-list-dialog';

let active = false;
let currentContext = null;
let currentOptions = normalizeNavModifiers({});
let onResult = null;
let onKey = null;
let types = null; // null = loading, [] = loaded-empty
let filtered = [];
let selectedIndex = 0;
let currentUidHint = null;
let currentInternalNameHint = null;

// Extract the uid of the type the current page belongs to, so the dialog can
// preselect it. Matches both the definition page (/typeDefinitions/<uid>/<name>)
// and the attributes page (/typeDefinition/attributes?id=<uid>).
export function parseCurrentTypeUid(pathname, search) {
  const defMatch = (pathname || '').match(/\/typeDefinitions\/([^/?#]+)/);
  if (defMatch) return decodeURIComponent(defMatch[1]);
  if (/\/typeDefinition\/attributes/.test(pathname || '')) {
    const id = new URLSearchParams(search || '').get('id');
    if (id) return decodeURIComponent(id);
  }
  return null;
}

// On a normal content page the type is not in the URL — cplace exposes it as
// data-type-internal-name on the #cplace root element (e.g. "cf.projectNavigator.project").
// Returns null when the attribute is missing or set to the "-" empty sentinel.
export function parseCurrentTypeInternalName(doc = document) {
  const value = doc?.getElementById?.('cplace')?.getAttribute('data-type-internal-name');
  return value && value !== '-' ? value : null;
}

export function definitionUrl(baseUrl, item) {
  return `${baseUrl}/typeDefinitions/${encodeURIComponent(item.uid)}/${encodeURIComponent(item.internalName)}`;
}

export function attributesUrl(baseUrl, item) {
  return `${baseUrl}/typeDefinition/attributes?id=${encodeURIComponent(item.uid)}`;
}

// Search matches both the display name and the internal name.
export function matchesQuery(item, q) {
  return (item.name || '').toLowerCase().includes(q) || (item.internalName || '').toLowerCase().includes(q);
}

function closeDialog() {
  document.getElementById(DIALOG_ID)?.remove();
}

function navigate(item, { secondary, newTab }) {
  const baseUrl = currentContext?.baseUrl;
  if (!baseUrl) return;
  const url = secondary ? attributesUrl(baseUrl, item) : definitionUrl(baseUrl, item);
  closeDialog();
  openTarget(url, newTab);
}

// Resolve the current modifier config into the navigate() flags for an event.
function navTargetFor(event) {
  return {
    secondary: modifierPressed(event, currentOptions.secondaryModifier),
    newTab: modifierPressed(event, currentOptions.newTabModifier),
  };
}

function updateSelection(listEl) {
  listEl.querySelectorAll('.cplace-tl-item').forEach((el, i) => {
    el.classList.toggle('sel', i === selectedIndex);
    if (i === selectedIndex) el.scrollIntoView({ block: 'nearest' });
  });
}

function renderList(listEl, query, error) {
  listEl.innerHTML = '';

  if (types === null) {
    listEl.innerHTML = '<div class="cplace-tl-msg">Loading types…</div>';
    return;
  }

  if (error) {
    const msg = document.createElement('div');
    msg.className = 'cplace-tl-msg cplace-tl-error';
    msg.textContent = error;
    listEl.appendChild(msg);
    return;
  }

  const q = query.trim().toLowerCase();
  filtered = (q ? types.filter((t) => matchesQuery(t, q)) : [...types]).sort((a, b) => a.name.localeCompare(b.name));

  if (!filtered.length) {
    listEl.innerHTML = '<div class="cplace-tl-msg">No types found</div>';
    return;
  }

  if (!q && (currentUidHint || currentInternalNameHint)) {
    let idx = -1;
    if (currentUidHint) idx = filtered.findIndex((t) => t.uid === currentUidHint);
    if (idx < 0 && currentInternalNameHint) {
      idx = filtered.findIndex((t) => t.internalName === currentInternalNameHint);
    }
    selectedIndex = idx >= 0 ? idx : 0;
  } else if (selectedIndex >= filtered.length) {
    selectedIndex = 0;
  }

  filtered.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'cplace-tl-item' + (idx === selectedIndex ? ' sel' : '');
    row.addEventListener('mouseenter', () => {
      selectedIndex = idx;
      updateSelection(listEl);
    });
    row.addEventListener('click', (e) => navigate(item, navTargetFor(e)));

    const name = document.createElement('div');
    name.className = 'cplace-tl-name';
    name.textContent = item.name;

    const sub = document.createElement('div');
    sub.className = 'cplace-tl-sub';
    sub.textContent = item.internalName;

    row.append(name, sub);
    listEl.appendChild(row);
  });

  updateSelection(listEl);
}

function showDialog() {
  closeDialog();

  const dialog = document.createElement('div');
  dialog.id = DIALOG_ID;

  const backdrop = document.createElement('div');
  backdrop.className = 'cplace-tl-backdrop';
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeDialog();
  });

  const panel = document.createElement('div');
  panel.className = 'cplace-tl-panel';
  panel.addEventListener('click', (e) => e.stopPropagation());

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cplace-tl-input';
  input.placeholder = 'Search types…';
  input.autocomplete = 'off';
  input.spellcheck = false;

  const list = document.createElement('div');
  list.className = 'cplace-tl-list';

  const platform = detectPlatform();
  const attrGlyph = modifierGlyph(currentOptions.secondaryModifier, platform);
  const newTabGlyph = modifierGlyph(currentOptions.newTabModifier, platform);
  const foot = document.createElement('div');
  foot.className = 'cplace-tl-foot';
  foot.innerHTML =
    '<span><kbd>↑↓</kbd> navigate</span><span><kbd>↵</kbd> definition</span>' +
    `<span><kbd>${attrGlyph}</kbd><kbd>↵</kbd> attributes</span>` +
    `<span><kbd>${newTabGlyph}</kbd><kbd>↵</kbd> new tab</span><span><kbd>Esc</kbd> close</span>`;

  panel.append(input, list, foot);
  backdrop.appendChild(panel);
  dialog.appendChild(backdrop);
  document.body.appendChild(dialog);

  selectedIndex = 0;
  currentUidHint = parseCurrentTypeUid(window.location.pathname, window.location.search);
  currentInternalNameHint = parseCurrentTypeInternalName(document);
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
      if (filtered[selectedIndex]) navigate(filtered[selectedIndex], navTargetFor(e));
    }
  });
}

export default {
  id: 'types-list',
  name: 'Types List',
  description:
    'Adds a "Types List" popup action (with keyboard shortcut) that opens a searchable dialog of every custom type in the current workspace — press Enter for the type definition page, hold the configured modifier for its attributes page, or the new-tab modifier (default Shift) to open in a new tab.',
  defaultEnabled: false,
  css: true,
  pageScript: true,
  actions: [{ id: 'show-types-list', label: 'Types List', icon: '🗂️' }],
  defaultOptions: { secondaryModifier: 'alt', newTabModifier: 'shift' },
  renderOptions(container, ctx) {
    renderNavModifierOptions(container, ctx, {
      secondaryLabel: 'Modifier for the attributes page',
      newTabLabel: 'Modifier to open in a new browser tab',
    });
  },
  apply(options = {}, context = null) {
    currentContext = context;
    currentOptions = normalizeNavModifiers(options);
    if (active) return;
    active = true;
    onResult = (event) => {
      const { types: result, error } = event.detail || {};
      types = error ? [] : (result || []);
      const dialog = document.getElementById(DIALOG_ID);
      if (!dialog) return;
      const listEl = dialog.querySelector('.cplace-tl-list');
      const inputEl = dialog.querySelector('.cplace-tl-input');
      if (listEl) renderList(listEl, inputEl?.value || '', error || null);
    };
    onKey = (e) => {
      if (e.key === 'Escape') closeDialog();
    };
    document.addEventListener('cplace:typesListResult', onResult);
    document.addEventListener('keydown', onKey);
  },
  revert() {
    if (onResult) document.removeEventListener('cplace:typesListResult', onResult);
    if (onKey) document.removeEventListener('keydown', onKey);
    onResult = null;
    onKey = null;
    active = false;
    currentContext = null;
    currentOptions = normalizeNavModifiers({});
    types = null;
    filtered = [];
    selectedIndex = 0;
    currentUidHint = null;
    currentInternalNameHint = null;
    closeDialog();
  },
  onVersionDetected(context) {
    currentContext = context;
  },
  onAction(actionId) {
    if (actionId !== 'show-types-list' || !active) return;
    types = null;
    showDialog();
    document.dispatchEvent(new CustomEvent('cplace:fetchTypesList', {
      detail: { baseUrl: currentContext?.baseUrl ?? null },
    }));
  },
};
