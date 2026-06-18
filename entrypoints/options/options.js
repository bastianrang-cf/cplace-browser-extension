import { registry } from '../../features/registry.js';
import { enabledModulesItem, moduleOptionsItem, moduleShortcutsItem } from '../../features/storage.js';
import {
  hasUniversalHostAccess,
  requestUniversalHostAccess,
  revokeUniversalHostAccess,
} from '../../features/permissions.js';
import {
  bindableCommands,
  comboToDisplay,
  eventToCombo,
  isValidCombo,
  combosEqual,
  reservedConflict,
  detectPlatform,
} from '../../features/shortcuts.js';

let liveOpts = {};
let liveShortcuts = {};
let activeSectionId = null;
const platform = detectPlatform();

const sidebar = document.getElementById('sidebar');
const content = document.getElementById('content');
const heroStatus = document.getElementById('hero-status');

const HOST_SECTION_ID = 'sec-host-access';

function setActiveSection(id) {
  activeSectionId = id;
  for (const btn of sidebar.querySelectorAll('.sidebar__item')) {
    btn.classList.toggle('is-active', btn.dataset.section === id);
  }
  for (const sec of content.querySelectorAll('section')) {
    sec.hidden = sec.id !== id;
  }
}

sidebar.addEventListener('click', (e) => {
  const btn = e.target.closest('.sidebar__item');
  if (!btn) return;
  setActiveSection(btn.dataset.section);
});

function makeSidebarItem(sectionId, title, subtitle) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sidebar__item';
  btn.dataset.section = sectionId;
  const t = document.createElement('span');
  t.className = 'sidebar__item-title';
  t.textContent = title;
  btn.appendChild(t);
  if (subtitle) {
    const s = document.createElement('span');
    s.className = 'sidebar__item-sub';
    s.textContent = subtitle;
    btn.appendChild(s);
  }
  return btn;
}

function makeSection(id, title, description) {
  const section = document.createElement('section');
  section.id = id;
  section.hidden = true;

  const head = document.createElement('div');
  head.className = 'section__head';

  const titleWrap = document.createElement('div');
  const h2 = document.createElement('h2');
  h2.className = 'section__title';
  h2.textContent = title;
  titleWrap.appendChild(h2);
  if (description) {
    const p = document.createElement('p');
    p.className = 'section__desc';
    p.textContent = description;
    titleWrap.appendChild(p);
  }
  head.appendChild(titleWrap);

  section.appendChild(head);
  return { section, head };
}

function makeToggle(moduleId, checked) {
  const label = document.createElement('label');
  label.className = 'module-toggle';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.dataset.moduleId = moduleId;
  cb.checked = !!checked;
  cb.addEventListener('change', () => onToggle(moduleId, cb.checked));

  const track = document.createElement('span');
  track.className = 'module-toggle__track';

  const text = document.createElement('span');
  text.className = 'module-toggle__label';
  text.textContent = checked ? 'Enabled' : 'Disabled';

  cb.addEventListener('change', () => {
    text.textContent = cb.checked ? 'Enabled' : 'Disabled';
  });

  label.appendChild(cb);
  label.appendChild(track);
  label.appendChild(text);
  return label;
}

function buildOptionInput(opt, currentValue) {
  const input = document.createElement('input');
  if (opt.type === 'boolean') {
    input.type = 'checkbox';
    input.checked = !!currentValue;
  } else if (opt.type === 'number') {
    input.type = 'number';
    input.value = currentValue ?? opt.default;
  } else {
    input.type = 'text';
    input.value = currentValue ?? opt.default ?? '';
  }
  return input;
}

function renderHostAccessSection() {
  const { section, head } = makeSection(
    HOST_SECTION_ID,
    'Host access',
    'The extension reads pages to detect cplace. Grant access once, then feature modules run automatically on cplace pages.',
  );

  const status = document.createElement('p');
  status.id = 'host-access-status';
  status.className = 'host-access__status';

  const actions = document.createElement('div');
  actions.className = 'host-access__actions';

  const grantBtn = document.createElement('button');
  grantBtn.type = 'button';
  grantBtn.id = 'host-access-grant';
  grantBtn.className = 'host-access__grant';
  grantBtn.textContent = 'Enable on all pages';
  grantBtn.hidden = true;

  const revokeBtn = document.createElement('button');
  revokeBtn.type = 'button';
  revokeBtn.id = 'host-access-revoke';
  revokeBtn.className = 'host-access__revoke';
  revokeBtn.textContent = 'Revoke access';
  revokeBtn.hidden = true;

  grantBtn.addEventListener('click', async () => {
    const accepted = await requestUniversalHostAccess();
    if (accepted) refreshHostAccess();
  });
  revokeBtn.addEventListener('click', async () => {
    await revokeUniversalHostAccess();
    refreshHostAccess();
  });

  actions.appendChild(grantBtn);
  actions.appendChild(revokeBtn);

  section.appendChild(status);
  section.appendChild(actions);
  return section;
}

async function refreshHostAccess() {
  const granted = await hasUniversalHostAccess();
  const status = document.getElementById('host-access-status');
  const grantBtn = document.getElementById('host-access-grant');
  const revokeBtn = document.getElementById('host-access-revoke');
  if (status) {
    status.dataset.state = granted ? 'granted' : 'missing';
    status.textContent = granted
      ? 'The extension is active on all pages.'
      : 'The extension needs permission to read pages so it can detect cplace. Enable it once below.';
  }
  if (grantBtn) grantBtn.hidden = granted;
  if (revokeBtn) revokeBtn.hidden = !granted;

  heroStatus.hidden = false;
  heroStatus.dataset.state = granted ? 'granted' : 'missing';
  heroStatus.textContent = granted ? 'Active on all pages' : 'Permission needed';

  content.setAttribute('aria-disabled', granted ? 'false' : 'true');
}

// Resolve a "module — command" label for a binding, used in duplicate warnings.
function labelForBinding(moduleId, commandId) {
  const mod = registry.byId(moduleId);
  const cmd = bindableCommands(mod).find((c) => c.id === commandId);
  return `${mod?.name || moduleId} — ${cmd?.label || commandId}`;
}

// Scan every stored binding for one that collides with `combo` (excluding the
// command being edited). Returns { moduleId, commandId } or null.
function findDuplicateBinding(moduleId, commandId, combo) {
  for (const [mId, cmds] of Object.entries(liveShortcuts)) {
    for (const [cId, c] of Object.entries(cmds || {})) {
      if (mId === moduleId && cId === commandId) continue;
      if (combosEqual(c, combo)) return { moduleId: mId, commandId: cId };
    }
  }
  return null;
}

async function saveShortcut(moduleId, commandId, combo) {
  const all = (await moduleShortcutsItem.getValue()) || {};
  const cmds = { ...(all[moduleId] || {}) };
  if (combo) cmds[commandId] = combo;
  else delete cmds[commandId];
  if (Object.keys(cmds).length) all[moduleId] = cmds;
  else delete all[moduleId];
  await moduleShortcutsItem.setValue(all);
  liveShortcuts = all;
}

function buildShortcutRow(moduleId, cmd) {
  const row = document.createElement('div');
  row.className = 'module-shortcut-row';

  const label = document.createElement('span');
  label.className = 'module-shortcut__label';
  label.textContent = cmd.label;
  row.appendChild(label);

  const controls = document.createElement('div');
  controls.className = 'module-shortcut__controls';

  const recorder = document.createElement('button');
  recorder.type = 'button';
  recorder.className = 'module-shortcut__recorder';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'module-shortcut__clear';
  clearBtn.textContent = 'Clear';

  const warning = document.createElement('p');
  warning.className = 'module-shortcut__warning';
  warning.hidden = true;

  function showWarning(text) {
    if (text) {
      warning.textContent = text;
      warning.hidden = false;
    } else {
      warning.textContent = '';
      warning.hidden = true;
    }
  }

  function refresh() {
    const combo = liveShortcuts[moduleId]?.[cmd.id] || null;
    if (combo) {
      recorder.textContent = comboToDisplay(combo, platform);
      recorder.classList.add('is-set');
      clearBtn.hidden = false;
      const dup = findDuplicateBinding(moduleId, cmd.id, combo);
      if (dup) {
        showWarning(`Also bound to ${labelForBinding(dup.moduleId, dup.commandId)}.`);
      } else {
        showWarning(reservedConflict(combo, platform));
      }
    } else {
      recorder.textContent = 'Set shortcut';
      recorder.classList.remove('is-set');
      clearBtn.hidden = true;
      showWarning(null);
    }
  }

  let recording = false;
  let onKey = null;

  function stopRecording() {
    recording = false;
    recorder.classList.remove('is-recording');
    if (onKey) {
      document.removeEventListener('keydown', onKey, true);
      onKey = null;
    }
    refresh();
  }

  function startRecording() {
    if (recording) return;
    recording = true;
    recorder.classList.add('is-recording');
    recorder.textContent = 'Press keys…';
    clearBtn.hidden = true;
    showWarning(null);
    onKey = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') {
        stopRecording();
        return;
      }
      const combo = eventToCombo(event, platform);
      if (!combo) return; // standalone modifier — keep waiting
      if (!isValidCombo(combo)) {
        recorder.textContent = comboToDisplay(combo, platform) || '…';
        showWarning(platform === 'mac'
          ? 'Add ⌘ or ⌥ — a modifier is required.'
          : 'Add Ctrl or Alt — a modifier is required.');
        return;
      }
      stopRecording();
      saveShortcut(moduleId, cmd.id, combo).then(refresh);
    };
    document.addEventListener('keydown', onKey, true);
  }

  recorder.addEventListener('click', () => {
    if (recording) stopRecording();
    else startRecording();
  });
  recorder.addEventListener('blur', () => { if (recording) stopRecording(); });
  clearBtn.addEventListener('click', () => {
    saveShortcut(moduleId, cmd.id, null).then(refresh);
  });

  controls.appendChild(recorder);
  controls.appendChild(clearBtn);
  row.appendChild(controls);
  row.appendChild(warning);
  refresh();
  return row;
}

function renderShortcutEditor(section, mod) {
  const commands = bindableCommands(mod);
  if (!commands.length) return;

  const wrap = document.createElement('div');
  wrap.className = 'module-shortcuts';

  const title = document.createElement('h3');
  title.className = 'module-shortcuts__title';
  title.textContent = 'Keyboard shortcuts';
  wrap.appendChild(title);

  const hint = document.createElement('p');
  hint.className = 'module-shortcuts__hint';
  hint.textContent = mod.snoozable
    ? 'Snooze or un-snooze this module on the current cplace tenant. Fires only on cplace pages.'
    : 'Trigger this action on a cplace page without opening the popup. Fires only while the module is active.';
  wrap.appendChild(hint);

  for (const cmd of commands) {
    wrap.appendChild(buildShortcutRow(mod.id, cmd));
  }

  section.appendChild(wrap);
}

function renderModuleSection(mod, enabledMap, savedOpts) {
  const sectionId = `sec-mod-${mod.id}`;
  const { section, head } = makeSection(sectionId, mod.name, mod.description);
  section.classList.add('module-section');

  head.appendChild(makeToggle(mod.id, !!enabledMap[mod.id]));

  if (typeof mod.renderOptions === 'function') {
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'module-options';
    const defaults = registry.defaultOptionsMap()[mod.id] || {};
    mod.renderOptions(optionsDiv, {
      getOptions: () => liveOpts[mod.id] ?? defaults,
      setOptions: async (next) => {
        liveOpts[mod.id] = next;
        const current = await moduleOptionsItem.getValue();
        current[mod.id] = next;
        await moduleOptionsItem.setValue(current);
        browser.runtime.sendMessage({ type: 'cplace:moduleOptions', id: mod.id, options: next });
      },
      getDefaults: () => defaults,
    });
    section.appendChild(optionsDiv);
  } else if (Array.isArray(mod.options) && mod.options.length > 0) {
    const modOpts = savedOpts[mod.id] || {};
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'module-options';
    for (const opt of mod.options) {
      const row = document.createElement('label');
      row.className = 'module-option-row';
      const optLabel = document.createElement('span');
      optLabel.textContent = opt.label;
      const input = buildOptionInput(opt, modOpts[opt.id]);
      input.addEventListener('change', () => onOptionChange(mod.id, opt.id, opt.type, input));
      row.appendChild(optLabel);
      row.appendChild(input);
      optionsDiv.appendChild(row);
    }
    section.appendChild(optionsDiv);
  }

  renderShortcutEditor(section, mod);

  return section;
}

function render(enabledMap, savedOpts) {
  liveOpts = savedOpts;
  sidebar.textContent = '';
  content.textContent = '';

  // Host access first
  sidebar.appendChild(makeSidebarItem(HOST_SECTION_ID, 'Host access', 'Permission status'));
  content.appendChild(renderHostAccessSection());

  // Divider
  const divider = document.createElement('div');
  divider.className = 'sidebar__divider';
  divider.setAttribute('aria-hidden', 'true');
  sidebar.appendChild(divider);

  // Module sections
  const mods = registry.all();
  for (const mod of mods) {
    sidebar.appendChild(makeSidebarItem(`sec-mod-${mod.id}`, mod.name, mod.description));
    content.appendChild(renderModuleSection(mod, enabledMap, savedOpts));
  }

  // Restore previous active section if it still exists; else pick a sensible default.
  const preferred =
    activeSectionId && content.querySelector(`#${CSS.escape(activeSectionId)}`)
      ? activeSectionId
      : HOST_SECTION_ID;
  setActiveSection(preferred);
}

async function onToggle(id, enabled) {
  const current = await enabledModulesItem.getValue();
  current[id] = enabled;
  await enabledModulesItem.setValue(current);
  browser.runtime.sendMessage({ type: 'cplace:moduleToggle', id, enabled });
}

async function onOptionChange(moduleId, optId, type, input) {
  const value =
    type === 'number' ? Number(input.value) : type === 'boolean' ? input.checked : input.value;
  const current = await moduleOptionsItem.getValue();
  current[moduleId] = { ...(current[moduleId] || {}), [optId]: value };
  await moduleOptionsItem.setValue(current);
  browser.runtime.sendMessage({
    type: 'cplace:moduleOptions',
    id: moduleId,
    options: current[moduleId],
  });
}

browser.permissions.onAdded.addListener(refreshHostAccess);
browser.permissions.onRemoved.addListener(refreshHostAccess);

Promise.all([
  enabledModulesItem.getValue(),
  moduleOptionsItem.getValue(),
  moduleShortcutsItem.getValue(),
]).then(
  async ([stored, savedOpts, shortcuts]) => {
    liveShortcuts = shortcuts || {};
    const defaults = registry.defaultEnabledMap();
    const enabled = { ...defaults, ...stored };
    render(enabled, savedOpts);
    await refreshHostAccess();
    // If permission is missing, default to the host-access section so it's the first thing the user sees.
    const granted = await hasUniversalHostAccess();
    if (!granted) setActiveSection(HOST_SECTION_ID);
  },
);
